import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CommandError, PROJECT_ROOT, buildHost, hostSettings, loadEnvFile, requireTool, runOnHost } from './vivado-host.mjs';
import { parseTestYaml, parseTwinSection, twinAccess, twinStage } from './twin.mjs';
import { boardAccess, boardStage } from './board.mjs';

const HELP = `Usage: node scripts/flow.mjs <stage> [design...] [--mode project|non_project] [--jobs n] [--requirement-phases]

Stages
  check   the design check: board files, project.tcl, no absolute path (no Vivado needed)
  sim     the self-checking testbenches (xsim)
  synth, impl, bit, xsa
          one Vivado stage (xsa: project mode only)
  build   synthesis to bitstream, and the XSA in project mode
  sw      the Vitis application of each design that has one (VITIS in project.tcl)
  twin    the application on the board's hardware twin (the latest release of
          the twin image the board file names), checked against
          designs/<design>/test.yaml; Docker where TWIN_* in .env says:
          TWIN_ACCESS=ssh this machine's or a host's over SSH, =bot the lab
          host's through the lab bot, with no login
  board   the bitstream and ELF on the real board over JTAG, its console checked
          against test.yaml; the lab bot powers it (BOARD_* and BOT_* in .env).
          BOARD_ACCESS=ssh runs xsdb and reads the console on the lab host;
          =bot reads the console through the bot's bridge and runs xsdb on
          the Vivado host, with no login to the lab host
  all     sim, build, sw, twin (the board only when asked for)
  clean   out/<design> only

Without a design every design under designs/ is taken; --mode narrows them to
one Vivado mode. --jobs sets how many Vivado runs go at once
(VIVADO_JOBS in .env, else 4). Vivado and Vitis run where .env says: VIVADO_REMOTE_HOST
empty runs them here.

--requirement-phases (CI): on a requirement branch (factory/RQ-n), a stage
whose phase the requirement does not name (its "phases:" line) is passed over
and says so. Elsewhere, on main and tags, every stage runs.`;

const VIVADO_STAGES = new Set(['sim', 'synth', 'impl', 'bit', 'xsa', 'build', 'clean']);
// The requirement phase each stage belongs to.
const STAGE_PHASE = { check: 'spec', sim: 'sim', synth: 'build', impl: 'build', bit: 'build', xsa: 'build', build: 'build', sw: 'build', twin: 'twin', board: 'board' };

// The phases the requirement of this CI branch names, or undefined when the
// branch is not a requirement branch or the requirement names none.
export function requirementPhases(env, root = PROJECT_ROOT) {
  const branch = env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || env.CI_COMMIT_BRANCH || '';
  const match = /^factory\/(RQ-\d+)$/.exec(branch);
  if (!match) return undefined;
  const directory = join(root, 'requirements');
  const file = existsSync(directory) ? readdirSync(directory).find((name) => name.startsWith(`${match[1]}-`) || name === `${match[1]}.md`) : undefined;
  if (!file) return undefined;
  const line = /^phases:\s*(.+)$/m.exec(readFileSync(join(directory, file), 'utf8'));
  if (!line) return undefined;
  return { requirement: match[1], phases: line[1].split(',').map((phase) => phase.trim()).filter(Boolean) };
}
const STAGES = new Set([...VIVADO_STAGES, 'check', 'sw', 'twin', 'board', 'all']);

// ------------------------------------------------------------
// Designs and their project.tcl
// ------------------------------------------------------------

export function projectValues(text) {
  const values = {};
  for (const match of text.matchAll(/^\s*set\s+([A-Z_]+)\s+(?:"([^"]*)"|\{([^}]*)\}|([^\s#;]+))/gm)) {
    values[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return values;
}

export function listDesigns(root = PROJECT_ROOT) {
  const designs = join(root, 'designs');
  if (!existsSync(designs)) return [];
  return readdirSync(designs)
    .filter((name) => existsSync(join(designs, name, 'project.tcl')))
    .sort()
    .map((name) => ({ name, ...projectValues(readFileSync(join(designs, name, 'project.tcl'), 'utf8')) }));
}

export function boardValues(text) {
  const values = {};
  for (const match of text.matchAll(/^([a-z_]+):[ \t]*"?([^"#\n]*?)"?[ \t]*(?:#.*)?$/gm)) values[match[1]] = match[2].trim();
  return values;
}

// ------------------------------------------------------------
// The design check (designCheck gate)
// ------------------------------------------------------------

const SCANNED = ['designs', 'common', 'boards', 'ip', 'flow.tcl', 'flow.ps1', 'flow.sh'];
const TEXT_FILE = /\.(tcl|xdc|vhdl?|s?v|svh|py|c|h|ld|ya?ml|json|md|ps1|sh)$/i;
const ABSOLUTE_PATH = [
  { re: /(^|[\s"'{=(])[A-Za-z]:(?:\\{1,2}|\/)[A-Za-z0-9_]/, what: 'a Windows drive path' },
  { re: /(^|[\s"'{=(])\/(home|Users|opt|tools|mnt|srv)\//, what: 'an absolute path' },
  { re: /(^|[\s"'{=(])\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_$.-]/, what: 'a UNC path' },
];

function walk(path, found = []) {
  if (!existsSync(path)) return found;
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry), found);
  } else if (TEXT_FILE.test(path)) {
    found.push(path);
  }
  return found;
}

export function designCheck(root = PROJECT_ROOT) {
  const problems = [];
  const boards = {};
  const boardDir = join(root, 'boards');
  for (const file of existsSync(boardDir) ? readdirSync(boardDir).filter((name) => name.endsWith('.yaml')) : []) {
    const text = readFileSync(join(boardDir, file), 'utf8');
    const values = boardValues(text);
    for (const key of ['vendor', 'tool', 'tool_version', 'part']) {
      if (!values[key]) problems.push(`boards/${file}: no ${key}`);
    }
    try {
      parseTwinSection(text, file.replace(/\.yaml$/, ''));
    } catch (error) {
      problems.push(error.message);
    }
    boards[file.replace(/\.yaml$/, '')] = values;
  }

  const designs = listDesigns(root);
  if (designs.length === 0) problems.push('designs/: no design (a directory with a project.tcl)');
  for (const design of designs) {
    const where = `designs/${design.name}/project.tcl`;
    for (const key of ['PART', 'MODE', 'TOP', 'BOARD']) {
      if (!design[key]) problems.push(`${where}: ${key} is not set`);
    }
    if (design.MODE && !['project', 'non_project'].includes(design.MODE)) {
      problems.push(`${where}: MODE is "${design.MODE}", not project or non_project`);
    }
    const board = boards[design.BOARD];
    if (design.BOARD && !board) problems.push(`${where}: BOARD ${design.BOARD} has no boards/${design.BOARD}.yaml`);
    if (board && design.PART && board.part && board.part !== design.PART) {
      problems.push(`${where}: PART ${design.PART} is not the part of boards/${design.BOARD}.yaml (${board.part})`);
    }
    if (design.BD && !existsSync(join(root, 'designs', design.name, design.BD))) {
      problems.push(`${where}: BD ${design.BD} does not exist`);
    }
    if (design.MODE === 'non_project' && design.BD) problems.push(`${where}: a non_project design has no block design (BD)`);
    const testPath = join(root, 'designs', design.name, 'test.yaml');
    if (existsSync(testPath)) {
      try {
        parseTestYaml(readFileSync(testPath, 'utf8'));
      } catch (error) {
        problems.push(`designs/${design.name}/${error.message}`);
      }
    }
    if (design.VITIS) {
      if (design.VITIS !== 'unified') problems.push(`${where}: VITIS is "${design.VITIS}"; the flow builds with Vitis Unified ("unified")`);
      if (design.MODE !== 'project') problems.push(`${where}: VITIS needs a project-mode design (the XSA comes from it)`);
      if (!design.CPU) problems.push(`${where}: VITIS is set but CPU is not (e.g. ps7_cortexa9_0)`);
      if (!existsSync(join(root, 'designs', design.name, 'sw', 'create_vitis.py'))) problems.push(`designs/${design.name}/sw/create_vitis.py is missing`);
      if (!existsSync(join(root, 'designs', design.name, 'sw', 'src'))) problems.push(`designs/${design.name}/sw/src is missing`);
    }
  }

  for (const file of SCANNED.flatMap((entry) => walk(join(root, entry)))) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { re, what } of ABSOLUTE_PATH) {
        if (re.test(line)) problems.push(`${relative(root, file).split('\\').join('/')}:${index + 1}: ${what}; compute it from the script's location`);
      }
    });
  }
  return { designs: designs.map((design) => design.name), problems };
}

// ------------------------------------------------------------
// Stages
// ------------------------------------------------------------

function gitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

// The build host joins summary.json here, after the artifacts came back, so a
// local run and a CI run of the same requirement can be compared.
function recordHost(design, settings) {
  const path = join(PROJECT_ROOT, 'out', design, 'artifacts', 'summary.json');
  if (!existsSync(path)) return;
  const summary = JSON.parse(readFileSync(path, 'utf8'));
  summary.build_host = buildHost(settings);
  writeFileSync(path, JSON.stringify(summary, null, 2) + '\n');
}

async function vivadoStage(settings, design, stage, jobs) {
  const vivado = requireTool(settings, 'vivado', 'VIVADO_BIN');
  const sha = gitSha();
  const command = [vivado, '-mode', 'batch', '-nojournal', '-notrace',
    '-log', `out/${design}/vivado-${stage}.log`, '-source', 'flow.tcl',
    '-tclargs', design, stage, '--jobs', String(jobs), ...(sha ? ['--git-sha', sha] : [])];
  console.log(`\n▸ ${design}: ${stage} (Vivado on ${buildHost(settings)})`);
  try {
    await runOnHost(settings, command, {
      directories: [`out/${design}`],
      pulls: stage === 'clean' ? [] : [`out/${design}/artifacts`, `out/${design}/vivado-${stage}.log`],
      description: `Vivado ${stage} of ${design}`,
    });
  } finally {
    recordHost(design, settings);
  }
}

// The longest path the Vitis BSP writes on a Windows host, part by part: its
// gcc is not long-path aware, so past MAX_PATH (260) the BSP build fails
// with "opening dependency file ... No such file or directory". The parts
// after the design are Vitis' own; the BSP's build directory adds about 25
// characters on top, so the estimate must stay at or below WINDOWS_PATH_BUDGET.
// On 18 October 236 failed and 211 built.
export const WINDOWS_PATH_BUDGET = 225;
export function vitisPathParts(basePath, projectName, design, cpu) {
  return [
    ['base path (VIVADO_REMOTE_BASE_PATH)', `${basePath.replace(/[\\/]+$/, '')}/`],
    ['host project (VIVADO_REMOTE_PROJECT_NAME)', `${projectName}/`],
    ['design, twice', `out/${design}/vitis/${design}_platform/`],
    ['processor and domain', `${cpu}/standalone_${cpu}/bsp/`],
    ["Vitis' deepest BSP object", 'libsrc/coresightps_dcc/src/CMakeFiles/coresightps_dcc.dir/xcoresightpsdcc.c.obj.d'],
  ];
}

export function checkVitisPath(settings, design) {
  if (!settings.remote || settings.hostType !== 'windows') return;
  const parts = vitisPathParts(settings.basePath, settings.projectName, design.name, design.CPU || 'ps7_cortexa9_0');
  const length = parts.reduce((total, [, text]) => total + text.length, 0);
  if (length <= WINDOWS_PATH_BUDGET) return;
  const table = parts.map(([what, text]) => `  ${String(text.length).padStart(3)}  ${what}: ${text}`).join('\n');
  throw new CommandError(`SW FAILED: on the Windows host the Vitis BSP would write paths of about ${length} characters (budget ${WINDOWS_PATH_BUDGET}, the limit is 260 and Vitis' gcc cannot pass it). Shorten one of the parts you choose:\n${table}`, 1);
}

async function softwareStage(settings, design) {
  checkVitisPath(settings, design);
  const vitis = requireTool(settings, 'vitis', 'VITIS_BIN');
  console.log(`\n▸ ${design.name}: sw (Vitis on ${buildHost(settings)})`);
  try {
    await runOnHost(settings, [vitis, '-s', `designs/${design.name}/sw/create_vitis.py`], {
      directories: [`out/${design.name}`],
      pulls: [`out/${design.name}/artifacts`],
      description: `Vitis build of ${design.name}`,
    });
  } finally {
    recordHost(design.name, settings);
  }
  // `vitis -s` exits 0 even when the script fails: the ELF is the evidence.
  const elf = join(PROJECT_ROOT, 'out', design.name, 'artifacts', `${design.name}_app.elf`);
  if (!existsSync(elf)) {
    throw new CommandError(`SW FAILED: ${design.name} produced no out/${design.name}/artifacts/${design.name}_app.elf; see the Vitis output above.`, 1);
  }
  writeCompileDatabase(design.name);
}

// The compile database for the coding standard check (RQ-0053): Vitis wrote
// one for the workspace copy of the sources on the build host; this one names
// the project's designs/<design>/sw/src files and the BSP headers the sw stage
// brought back, with the defines and target flags kept, so cppcheck runs
// anywhere the project is checked out.
export function rewriteCompileDatabase(entries, designName, projectRoot) {
  const sources = `designs/${designName}/sw/src`;
  const include = `out/${designName}/artifacts/sw/bsp-include`;
  const rewritten = [];
  for (const entry of entries) {
    const name = String(entry.file ?? '').split(/[\\/]/).pop();
    if (!name || !existsSync(join(projectRoot, sources, name))) continue;
    const words = entry.arguments ?? String(entry.command ?? '').split(/\s+/);
    const kept = [];
    for (let index = 1; index < words.length; index += 1) {
      const word = words[index];
      if (/^-(D|U|std=|m|f(?!o)|W)/.test(word)) kept.push(word);
      else if (['-o', '-c', '-isystem', '-I', '-include', '-MF', '-MT', '-MQ', '-x'].includes(word)) index += 1;
    }
    rewritten.push({
      directory: projectRoot,
      file: `${sources}/${name}`,
      arguments: ['cc', ...kept, `-I${sources}`, `-I${include}`, '-c', `${sources}/${name}`],
    });
  }
  return rewritten;
}

function writeCompileDatabase(designName) {
  const sw = join(PROJECT_ROOT, 'out', designName, 'artifacts', 'sw');
  const vitis = join(sw, 'compile_commands.vitis.json');
  if (!existsSync(vitis)) return;
  const entries = rewriteCompileDatabase(JSON.parse(readFileSync(vitis, 'utf8')), designName, PROJECT_ROOT);
  writeFileSync(join(sw, 'compile_commands.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`SW: out/${designName}/artifacts/sw/compile_commands.json (${entries.length} file(s)) for the coding standard check`);
}

export function parseArguments(argv) {
  const [stage, ...rest] = argv;
  if (!stage || stage === '--help' || stage === '-h') return { help: true };
  if (!STAGES.has(stage)) throw new CommandError(`Unknown stage "${stage}".\n\n${HELP}`);
  const designs = [];
  let mode;
  let jobs;
  let fromRequirement = false;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--requirement-phases') {
      fromRequirement = true;
    } else if (rest[index] === '--mode') {
      mode = rest[++index];
      if (mode !== 'project' && mode !== 'non_project') throw new CommandError('--mode is project or non_project.');
    } else if (rest[index] === '--jobs') {
      jobs = Number(rest[++index]);
      if (!Number.isInteger(jobs) || jobs < 1) throw new CommandError('--jobs is a positive integer.');
    } else {
      designs.push(rest[index]);
    }
  }
  return { stage, designs, mode, jobs, fromRequirement };
}

// How many Vivado runs go at once (launch_runs -jobs): --jobs, else
// VIVADO_JOBS from .env, sized for the Vivado host (RQ-0061), else 4.
export function vivadoJobs(options, env) {
  if (options.jobs !== undefined) return options.jobs;
  const text = (env.VIVADO_JOBS ?? '').trim();
  if (!text) return 4;
  const jobs = Number(text);
  if (!Number.isInteger(jobs) || jobs < 1) throw new CommandError(`VIVADO_JOBS must be a positive integer, not "${text}".`);
  return jobs;
}

export async function main(argv = process.argv.slice(2), env = loadEnvFile()) {
  const options = parseArguments(argv[0] === '--' ? argv.slice(1) : argv);
  if (!options.help) options.jobs = vivadoJobs(options, env);
  if (options.help) {
    console.log(HELP);
    return;
  }

  if (options.fromRequirement) {
    const named = requirementPhases(env);
    const phase = STAGE_PHASE[options.stage];
    if (named && phase && phase !== 'spec' && !named.phases.includes(phase)) {
      console.log(`${options.stage}: not run, ${named.requirement} goes through ${named.phases.join(', ')} (no ${phase}).`);
      return;
    }
  }

  if (options.stage === 'check') {
    const { designs, problems } = designCheck();
    if (problems.length > 0) {
      throw new CommandError(`DESIGN CHECK FAILED (${problems.length}):\n${problems.map((problem) => `  ${problem}`).join('\n')}`, 1);
    }
    console.log(`DESIGN CHECK: ${designs.length} design(s) pass: ${designs.join(', ')}`);
    return;
  }

  const known = listDesigns();
  for (const name of options.designs) {
    if (!known.some((design) => design.name === name)) throw new CommandError(`No design "${name}" (designs/${name}/project.tcl).`);
  }
  const selected = known
    .filter((design) => options.designs.length === 0 || options.designs.includes(design.name))
    .filter((design) => !options.mode || design.MODE === options.mode);
  if (selected.length === 0) {
    console.log(`No design for ${options.stage}${options.mode ? ` in ${options.mode} mode` : ''}.`);
    return;
  }

  // Each host's settings are read only when a stage needs that host.
  let vivadoHost;
  let twinHost;
  let boardHost;
  const lab = () => (boardHost ??= hostSettings(env, 'BOARD'));
  const vivado = () => (vivadoHost ??= hostSettings(env, 'VIVADO'));
  // bot: the twin's Docker is the lab host's, reached through the bot; no TWIN_REMOTE_* needed.
  const renode = () => (twinAccess(env) === 'bot' ? null : (twinHost ??= hostSettings(env, 'TWIN')));
  const board = (design) => {
    const path = join(PROJECT_ROOT, 'boards', `${design.BOARD}.yaml`);
    if (!existsSync(path)) throw new CommandError(`No boards/${design.BOARD}.yaml for ${design.name}.`);
    return readFileSync(path, 'utf8');
  };
  for (const design of selected) {
    const settings = options.stage === 'twin' || options.stage === 'board' ? undefined : vivado();
    switch (options.stage) {
      case 'board':
        // bot: xsdb runs on the Vivado host; ssh: everything on the lab host.
        await boardStage(boardAccess(env) === 'bot' ? vivado() : lab(), design, board(design), env);
        break;
      case 'twin':
        await twinStage(renode(), design, board(design), env);
        break;
      case 'sw':
        if (design.VITIS) await softwareStage(settings, design);
        else console.log(`\n▸ ${design.name}: no software (VITIS is not set)`);
        break;
      case 'xsa':
        if (design.MODE === 'project') await vivadoStage(settings, design.name, 'xsa', options.jobs);
        else console.log(`\n▸ ${design.name}: no XSA in non-project mode`);
        break;
      case 'all':
        await vivadoStage(settings, design.name, 'all', options.jobs);
        if (design.VITIS) {
          await softwareStage(settings, design);
          await twinStage(renode(), design, board(design), env);
        }
        break;
      default:
        await vivadoStage(settings, design.name, options.stage, options.jobs);
    }
  }
}

// Compared as real paths: Node resolves a symlinked path (macOS /var is one) for
// import.meta.url but not for argv[1], and a mismatch would skip main() and
// exit 0 without running anything.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof CommandError ? error.exitCode : 2;
  });
}
