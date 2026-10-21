#!/usr/bin/env node
// The coding standard check (RQ-0053): the project's C against the rules in
// force (coding-standard/rules.json), the waivers honoured
// (coding-standard/waivers.yaml), a report written, non-zero on a violation.
//
//   node scripts/coding-standard.mjs [--compile-commands <path>]... [--platform unix32|native] [--out out/coding-standard]
//
// Three kinds of check: a rule that cites a MISRA C rule is checked by
// cppcheck's MISRA addon over the compile database(s) the build left
// (build/compile_commands.json for a CMake project, out/<design>/artifacts/sw/
// compile_commands.json for an embedded design); a rule the standard's
// checks.json assigns a lexical check is checked here over the sources those
// databases name; every other rule is manual and is listed as such, never
// claimed checked. Inline suppressions are not honoured: a finding is fixed
// or waived with its reason. No dependency beyond Node and cppcheck.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = process.cwd();
const STANDARD_DIR = 'coding-standard';

class CheckError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

// ------------------------------------------------------------
// Inputs
// ------------------------------------------------------------

export function parseArguments(argv) {
  const options = { compileCommands: [], platform: undefined, out: join('out', 'coding-standard') };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--compile-commands') options.compileCommands.push(argv[++index]);
    else if (arg === '--platform') options.platform = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new CheckError(`Unknown argument "${arg}".`);
  }
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// The compile databases the build left: the CMake one, and one per embedded
// design the sw stage rewrote.
export function findCompileDatabases(root) {
  const found = [];
  if (existsSync(join(root, 'build', 'compile_commands.json'))) found.push(join('build', 'compile_commands.json'));
  const out = join(root, 'out');
  if (existsSync(out)) {
    for (const design of readdirSync(out).sort()) {
      const candidate = join('out', design, 'artifacts', 'sw', 'compile_commands.json');
      if (existsSync(join(root, candidate))) found.push(candidate);
    }
  }
  return found;
}

// waivers.yaml, the part of YAML it is written in: top-level `key: value`
// lines, a `required_fields` list in brackets, and `waivers:` as a list of
// `- key: value` mappings. Anything else is refused by name.
export function parseWaivers(text) {
  const result = { required_fields: null, waivers: [] };
  let current = null;
  let inWaivers = false;
  const lines = text.split(/\r?\n/);
  for (let number = 0; number < lines.length; number += 1) {
    const raw = lines[number];
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!line.trim()) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) {
      inWaivers = top[1] === 'waivers';
      current = null;
      if (top[1] === 'required_fields') {
        const list = /^\[(.*)\]$/.exec(top[2].trim());
        if (!list) throw new CheckError(`waivers.yaml line ${number + 1}: required_fields is a [list].`);
        result.required_fields = list[1].split(',').map((part) => part.trim()).filter(Boolean);
      } else if (top[1] === 'waivers' && top[2].trim() && top[2].trim() !== '[]') {
        throw new CheckError(`waivers.yaml line ${number + 1}: waivers is a list of "- key: value" entries.`);
      }
      continue;
    }
    const item = /^\s+-\s+([a-z_]+):\s*(.*)$/.exec(line);
    const field = /^\s+([a-z_]+):\s*(.*)$/.exec(line);
    if (!inWaivers || (!item && !field)) throw new CheckError(`waivers.yaml line ${number + 1}: not understood: "${raw.trim()}".`);
    if (item) {
      current = { _line: number + 1 };
      result.waivers.push(current);
    }
    if (!current) throw new CheckError(`waivers.yaml line ${number + 1}: a field outside a "- " entry.`);
    const [, key, value] = item ?? field;
    current[key] = value.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}

const WAIVER_FIELDS = ['rule_id', 'file', 'line', 'rationale', 'reviewer', 'review_date', 'waiver_id', 'validity'];
const DEFAULT_REQUIRED = ['rule_id', 'file', 'rationale', 'waiver_id'];
const DAL_A_REQUIRED = WAIVER_FIELDS;

export function checkWaivers(parsed, profile) {
  const required = profile === 'dal-a' ? DAL_A_REQUIRED : (parsed.required_fields ?? DEFAULT_REQUIRED).filter((name) => profile === 'dal-a' || !['reviewer', 'review_date', 'line', 'validity'].includes(name));
  const problems = [];
  for (const waiver of parsed.waivers) {
    const missing = required.filter((name) => !waiver[name]);
    if (missing.length > 0) problems.push(`waiver ${waiver.waiver_id ?? `at line ${waiver._line}`}: missing ${missing.join(', ')}`);
    if (waiver.validity && /^\d{4}-\d{2}-\d{2}$/.test(waiver.validity) && waiver.validity < new Date().toISOString().slice(0, 10)) {
      problems.push(`waiver ${waiver.waiver_id ?? `at line ${waiver._line}`}: validity ${waiver.validity} has passed`);
    }
  }
  return problems;
}

// ------------------------------------------------------------
// cppcheck: the MISRA rules
// ------------------------------------------------------------

export function misraRuleMap(rules) {
  const byMisra = new Map();
  for (const rule of rules) {
    for (const number of rule.misra ?? []) {
      if (!byMisra.has(number)) byMisra.set(number, []);
      byMisra.get(number).push(rule);
    }
  }
  return byMisra;
}

function decodeXml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// cppcheck's --xml output: one <error> per finding with its <location>s.
export function parseCppcheckXml(xml) {
  const findings = [];
  const version = /<cppcheck version="([^"]+)"/.exec(xml)?.[1] ?? null;
  const errorPattern = /<error\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/error>)/g;
  let match;
  while ((match = errorPattern.exec(xml)) !== null) {
    const attributes = Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, decodeXml(value)]));
    const location = /<location\s+[^>]*file="([^"]*)"[^>]*line="(\d+)"/.exec(match[2] ?? '');
    findings.push({
      id: attributes.id,
      severity: attributes.severity,
      message: attributes.msg ?? '',
      file: location ? decodeXml(location[1]) : attributes.file0 ?? null,
      line: location ? Number(location[2]) : null,
    });
  }
  return { version, findings };
}

function runCppcheck(root, databases, platform) {
  const probe = spawnSync('cppcheck', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    throw new CheckError('cppcheck is not installed (needed for the MISRA rules): apt-get install cppcheck, brew install cppcheck.', 2);
  }
  const all = [];
  let version = probe.stdout.trim();
  for (const database of databases) {
    const args = ['--project=' + database, '--addon=misra', '--enable=style', '--xml', '--quiet', '--inline-suppr'];
    // --inline-suppr is NOT passed: a suppression comment in the code must not hide a finding.
    args.splice(args.indexOf('--inline-suppr'), 1);
    if (platform) args.push('--platform=' + platform);
    const result = spawnSync('cppcheck', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw new CheckError(`cppcheck failed to start: ${result.error.message}`, 2);
    const parsed = parseCppcheckXml(result.stderr || '');
    if (parsed.version) version = parsed.version;
    all.push(...parsed.findings.map((finding) => ({ ...finding, database })));
    if (result.status !== 0 && parsed.findings.length === 0) {
      throw new CheckError(`cppcheck exited with ${result.status} on ${database}:\n${(result.stderr || result.stdout).slice(0, 2000)}`, 2);
    }
  }
  return { version, findings: all };
}

// ------------------------------------------------------------
// Lexical checks: the rules a regular expression can decide
// ------------------------------------------------------------

const C_KEYWORDS_WITH_UNDERSCORE = new Set(['_Bool', '_Complex', '_Imaginary', '_Alignas', '_Alignof', '_Atomic', '_Generic', '_Noreturn', '_Static_assert', '_Thread_local', '_BitInt', '_Decimal32', '_Decimal64', '_Decimal128']);

// Comments and string/character literals blanked (newlines kept), so a rule
// about code does not fire on a comment.
export function maskCommentsAndLiterals(text) {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (two === '//') {
      const end = text.indexOf('\n', index);
      const stop = end < 0 ? text.length : end;
      out += ' '.repeat(stop - index);
      index = stop;
    } else if (two === '/*') {
      const end = text.indexOf('*/', index + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop;
    } else if (text[index] === '"' || text[index] === "'") {
      const quote = text[index];
      let stop = index + 1;
      while (stop < text.length && text[stop] !== quote && text[stop] !== '\n') {
        if (text[stop] === '\\') stop += 1;
        stop += 1;
      }
      stop = Math.min(stop + 1, text.length);
      out += quote + ' '.repeat(Math.max(stop - index - 2, 0)) + (stop - index >= 2 ? quote : '');
      index = stop;
    } else {
      out += text[index];
      index += 1;
    }
  }
  return out;
}

const LEXICAL = {
  'file-extension': {
    file: (path) => (['.c', '.h'].includes(extname(path).toLowerCase()) ? [] : [{ line: null, message: `file extension "${extname(path)}" is not .c or .h` }]),
  },
  'file-name-camel': {
    file: (path) => (/^[a-z][A-Za-z0-9]*\.[A-Za-z]+$/.test(basename(path)) ? [] : [{ line: null, message: `file name "${basename(path)}" is not camelCase starting with a lowercase letter` }]),
  },
  'file-name-chars': {
    file: (path) => (/^[A-Za-z0-9_.]+$/.test(basename(path)) ? [] : [{ line: null, message: `file name "${basename(path)}" has characters outside [A-Za-z0-9_.]` }]),
  },
  'ascii-only': {
    lines: (lines) => lines.flatMap((line, number) => (/[^\x00-\x7F]/.test(line) ? [{ line: number + 1, message: 'non-ASCII character' }] : [])),
  },
  'no-tabs': {
    lines: (lines) => lines.flatMap((line, number) => (line.includes('\t') ? [{ line: number + 1, message: 'tab character' }] : [])),
  },
  'hex-uppercase': {
    code: (lines) => lines.flatMap((line, number) => {
      const hits = [...line.matchAll(/\b0[xX][0-9A-Fa-f]+\b/g)].filter((hit) => /[a-f]/.test(hit[0].slice(2)));
      return hits.map((hit) => ({ line: number + 1, message: `hexadecimal constant ${hit[0]} in lowercase` }));
    }),
  },
  'literal-suffix-uppercase': {
    code: (lines) => lines.flatMap((line, number) => {
      const hits = [...line.matchAll(/\b(?:0[xX][0-9A-Fa-f]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)([uUlLfF]{1,3})\b/g)].filter((hit) => /[ulf]/.test(hit[1]));
      return hits.map((hit) => ({ line: number + 1, message: `literal suffix "${hit[1]}" in lowercase (${hit[0]})` }));
    }),
  },
  'no-leading-underscore': {
    code: (lines) => lines.flatMap((line, number) => {
      const hits = [...line.matchAll(/(?<![A-Za-z0-9_])_[A-Za-z0-9_]*/g)]
        .map((hit) => hit[0])
        .filter((name) => !name.startsWith('__') && !C_KEYWORDS_WITH_UNDERSCORE.has(name) && name !== '_');
      return hits.map((name) => ({ line: number + 1, message: `identifier "${name}" begins with an underscore` }));
    }),
  },
};

export const LEXICAL_CHECKS = Object.keys(LEXICAL);

export function lexicalFindings(check, path, text) {
  const definition = LEXICAL[check];
  if (!definition) throw new CheckError(`checks.json names a lexical check "${check}" this script does not have (it has: ${LEXICAL_CHECKS.join(', ')}).`);
  if (definition.file) return definition.file(path);
  const lines = text.split(/\r?\n/);
  if (definition.lines) return definition.lines(lines);
  return definition.code(maskCommentsAndLiterals(text).split(/\r?\n/));
}

// The project's own sources: the files the databases compile and the headers
// in the project's include directories (never the pulled BSP or build/).
// A path as the file system names it: a temporary directory on macOS is
// /var/… and also /private/var/…, and a database may use either.
function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function projectSources(root, databases) {
  root = real(root);
  const files = new Set();
  const includeDirs = new Set();
  for (const database of databases) {
    for (const entry of readJson(join(root, database))) {
      const file = real(isAbsolute(entry.file) ? entry.file : resolve(real(entry.directory ?? root), entry.file));
      if (file.startsWith(root + '/') && !relative(root, file).startsWith('out/') && !relative(root, file).startsWith('build/')) files.add(relative(root, file));
      const args = entry.arguments ?? (entry.command ?? '').split(/\s+/);
      for (let index = 0; index < args.length; index += 1) {
        const value = args[index].startsWith('-I') && args[index].length > 2 ? args[index].slice(2) : args[index] === '-I' ? args[++index] : null;
        if (!value) continue;
        const directory = real(isAbsolute(value) ? value : resolve(real(entry.directory ?? root), value));
        if (directory.startsWith(root + '/') && !relative(root, directory).startsWith('out/') && !relative(root, directory).startsWith('build/')) includeDirs.add(directory);
      }
    }
  }
  for (const directory of includeDirs) {
    if (!existsSync(directory)) continue;
    const walk = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(h|c|hpp|hh|cc|cpp|cxx)$/i.test(entry.name)) files.add(relative(root, path));
      }
    };
    walk(directory);
  }
  return [...files].sort();
}

// ------------------------------------------------------------
// The verdict and the report
// ------------------------------------------------------------

export function evaluate({ rules, profile, cppcheck, sources, root, waivers }) {
  const byMisra = misraRuleMap(rules);
  const checked = { cppcheck: [], lexical: [], manual: [] };
  for (const rule of rules) {
    if ((rule.misra ?? []).length > 0) checked.cppcheck.push(rule.id);
    else if (rule.check?.tool === 'lexical') checked.lexical.push(rule.id);
    else checked.manual.push(rule.id);
  }
  const findings = [];
  const notInForce = new Map();
  const external = new Map();
  const own = new Set(sources);
  for (const finding of cppcheck.findings) {
    const number = /^misra-c2012-(\d+\.\d+)$/.exec(finding.id ?? '')?.[1];
    if (!number) continue; // cppcheck's own diagnostics are not the standard's
    const file = finding.file ? relative(root, real(isAbsolute(finding.file) ? finding.file : resolve(root, finding.file))) : null;
    // The standard governs the project's own, hand-written C: a finding in a
    // BSP header, a generated file or anything under out/ or build/ is not
    // the project's to fix, and is counted apart.
    if (file && !own.has(file)) {
      external.set(file, (external.get(file) ?? 0) + 1);
      continue;
    }
    const matching = byMisra.get(number) ?? [];
    if (matching.length === 0) {
      notInForce.set(number, (notInForce.get(number) ?? 0) + 1);
      continue;
    }
    for (const rule of matching) {
      findings.push({ rule: rule.id, file, line: finding.line, tool: 'cppcheck', check: finding.id, message: rule.description });
    }
  }
  for (const rule of rules) {
    if (rule.check?.tool !== 'lexical') continue;
    for (const path of sources) {
      const text = readFileSync(join(root, path), 'utf8');
      for (const hit of lexicalFindings(rule.check.id, path, text)) {
        findings.push({ rule: rule.id, file: path, line: hit.line, tool: 'lexical', check: rule.check.id, message: `${rule.description} (${hit.message})` });
      }
    }
  }
  findings.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0) || a.rule.localeCompare(b.rule));
  for (const finding of findings) {
    const waiver = waivers.waivers.find((candidate) =>
      candidate.rule_id === finding.rule
      && (candidate.file === finding.file || candidate.file === '*')
      && (!candidate.line || candidate.line === '*' || Number(candidate.line) === finding.line));
    finding.waived = waiver ? waiver.waiver_id ?? `line ${waiver._line}` : null;
  }
  const waiverProblems = checkWaivers(waivers, profile);
  const violations = findings.filter((finding) => !finding.waived);
  return {
    checked,
    findings,
    notInForce: Object.fromEntries([...notInForce.entries()].sort()),
    external: Object.fromEntries([...external.entries()].sort()),
    waiverProblems,
    counts: {
      rules: rules.length,
      byCppcheck: checked.cppcheck.length,
      byLexical: checked.lexical.length,
      manual: checked.manual.length,
      findings: findings.length,
      waived: findings.length - violations.length,
      violations: violations.length,
    },
    status: violations.length === 0 && waiverProblems.length === 0 ? 'passed' : 'failed',
  };
}

export function renderReport(standard, result, cppcheckVersion, databases) {
  const lines = [
    `# Coding standard check: ${standard.id} ${standard.version}`,
    '',
    `Groups ${standard.groups.join(', ')}, profile ${standard.profile}; ${result.counts.rules} rules in force. cppcheck ${cppcheckVersion} over ${databases.join(', ')}.`,
    '',
    `**${result.status === 'passed' ? 'PASSED' : result.status === 'reported' ? 'REPORTED (not enforced: enforce is false in factory.config.json)' : 'FAILED'}** — ${result.counts.violations} violation(s), ${result.counts.waived} waived, ${result.counts.byCppcheck} rules checked by cppcheck, ${result.counts.byLexical} by lexical checks, ${result.counts.manual} manual.`,
    '',
  ];
  if (result.waiverProblems.length > 0) lines.push('## Waivers refused', '', ...result.waiverProblems.map((problem) => `- ${problem}`), '');
  const violations = result.findings.filter((finding) => !finding.waived);
  if (violations.length > 0) {
    lines.push('## Violations', '', '| Rule | File | Line | Message | Check |', '|---|---|---|---|---|');
    for (const finding of violations) lines.push(`| ${finding.rule} | ${finding.file ?? ''} | ${finding.line ?? ''} | ${finding.message.replace(/\|/g, '\\|')} | ${finding.check} |`);
    lines.push('');
  }
  const waived = result.findings.filter((finding) => finding.waived);
  if (waived.length > 0) {
    lines.push('## Waived', '', '| Rule | File | Line | Waiver |', '|---|---|---|---|');
    for (const finding of waived) lines.push(`| ${finding.rule} | ${finding.file ?? ''} | ${finding.line ?? ''} | ${finding.waived} |`);
    lines.push('');
  }
  lines.push('## Manual review', '', result.checked.manual.length > 0 ? `These rules are not checked by a tool and need a reviewer: ${result.checked.manual.join(', ')}.` : 'Every rule in force is checked by a tool.', '');
  if (Object.keys(result.external).length > 0) {
    lines.push('## Outside the project', '', `cppcheck also reported findings in files the standard does not govern (BSP, generated, out/, build/): ${Object.entries(result.external).map(([file, count]) => `${file} (${count})`).join(', ')}.`, '');
  }
  if (Object.keys(result.notInForce).length > 0) {
    lines.push('## Not in force', '', `cppcheck also reported MISRA rules this project does not follow: ${Object.entries(result.notInForce).map(([number, count]) => `${number} (${count})`).join(', ')}.`, '');
  }
  return lines.join('\n');
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------

export async function main(argv = process.argv.slice(2), root = PROJECT_ROOT) {
  root = real(root);
  const options = parseArguments(argv);
  if (options.help) {
    console.log('node scripts/coding-standard.mjs [--compile-commands <path>]... [--platform unix32|native] [--out <dir>]');
    return 0;
  }
  // The choice is codingStandard in factory.config.json (RQ-0071); a project
  // that chose before it has coding-standard/standard.json.
  const configPath = join(root, 'factory.config.json');
  const legacyPath = join(root, STANDARD_DIR, 'standard.json');
  const written = existsSync(configPath) ? readJson(configPath).codingStandard : undefined;
  const chosen = written?.id && written?.groups?.length > 0 ? written : undefined;
  if (!chosen && (written || !existsSync(legacyPath))) {
    console.log('coding-standard: this project follows no coding standard (codingStandard in factory.config.json names none); nothing to check.');
    return 0;
  }
  const standard = chosen ? { profile: 'default', ...chosen } : readJson(legacyPath);
  const rulesPath = join(root, STANDARD_DIR, 'rules.json');
  if (!existsSync(rulesPath)) throw new CheckError(`coding-standard/rules.json is missing for ${standard.id}: run pnpm factory -- standard use.`, 2);
  const ruleSet = readJson(rulesPath);
  // The rules must be the ones made from this choice: a hand edit of the
  // config without standard use would check against another rule set.
  const madeFor = [ruleSet.id, ruleSet.version, Object.keys(ruleSet.groups ?? {}).sort().join(',')].join(' ');
  const wanted = [standard.id, standard.version, [...standard.groups].sort().join(',')].join(' ');
  if (madeFor !== wanted) {
    throw new CheckError(`coding-standard/rules.json was made for ${madeFor}, factory.config.json chooses ${wanted}: run pnpm factory -- standard use.`, 2);
  }
  const rules = ruleSet.rules;
  const waiversPath = join(root, STANDARD_DIR, 'waivers.yaml');
  const waivers = existsSync(waiversPath) ? parseWaivers(readFileSync(waiversPath, 'utf8')) : { required_fields: null, waivers: [] };
  const databases = options.compileCommands.length > 0 ? options.compileCommands : findCompileDatabases(root);
  if (databases.length === 0) {
    throw new CheckError('No compile database: run the build first (build/compile_commands.json, or out/<design>/artifacts/sw/compile_commands.json from the sw stage).', 2);
  }
  const platform = options.platform ?? (databases.some((database) => database.startsWith('out/')) ? 'unix32' : undefined);
  console.log(`\n▸ coding standard: ${standard.id} ${standard.version}, groups ${standard.groups.join(', ')}, profile ${standard.profile} (${rules.length} rules)`);
  const cppcheck = runCppcheck(root, databases, platform);
  const sources = projectSources(root, databases);
  const result = evaluate({ rules, profile: standard.profile, cppcheck, sources, root, waivers });
  // Report only (RQ-0074): the violations are reported, the check does not fail.
  if (standard.enforce === false && result.status === 'failed') result.status = 'reported';

  const outDir = join(root, options.out);
  mkdirSync(outDir, { recursive: true });
  const report = { standard, cppcheck: { version: cppcheck.version, databases, platform: platform ?? 'native' }, sources, ...result };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(outDir, 'report.md'), renderReport(standard, result, cppcheck.version, databases));

  for (const finding of result.findings.filter((item) => !item.waived)) {
    console.log(`  ${finding.rule}  ${finding.file ?? '-'}${finding.line ? ':' + finding.line : ''}  ${finding.message}`);
  }
  for (const problem of result.waiverProblems) console.log(`  waiver: ${problem}`);
  console.log(`CODING STANDARD: ${result.status} — ${result.counts.violations} violation(s), ${result.counts.waived} waived; ${result.counts.byCppcheck} rules by cppcheck ${cppcheck.version}, ${result.counts.byLexical} lexical, ${result.counts.manual} manual (${options.out}/report.md)`);
  return result.status === 'failed' ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`CODING STANDARD FAILED: ${error.message}`);
    process.exit(error.exitCode ?? 2);
  });
}
