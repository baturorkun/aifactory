import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, relative, resolve } from 'path';
import { createTargetProject } from './scaffold';

// Brings an embedded project made from an older template up to this
// aifactory's (RQ-0047). The template owns its scripts, the flow, the CI file
// and the generated guidelines: those are replaced. A project owns its design
// sources and board files: there only a file the template ships and the
// project lacks is added (a design's test.yaml), nothing is overwritten. The
// factory config and package scripts are merged, .gitignore gains the lines it
// lacks. .env, requirements, runs and out/ are never touched.

export type TemplateChange =
  | { kind: 'replace' | 'add'; path: string }
  | { kind: 'merge'; path: string; detail: string };

const PROJECT_OWNED = ['designs/', 'boards/'];
const GENERATED = ['.gitlab-ci.yml', '.env.example', 'AGENTS.md'];
const MERGED_COMMANDS = ['designCheck', 'hdlSim', 'fpgaBuild', 'firmwareBuild', 'twinTest', 'boardTest'];

function walk(root: string, directory = root, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(root, path, found);
    else found.push(relative(root, path).split('\\').join('/'));
  }
  return found;
}

const same = (a: string, b: string) => existsSync(a) && existsSync(b) && readFileSync(a).equals(readFileSync(b));

type JsonObject = Record<string, unknown>;
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as JsonObject;

export function updateEmbeddedProject(projectRoot: string, options: { write?: boolean; templateRoot?: string } = {}): TemplateChange[] {
  const config = readJson(join(projectRoot, 'factory.config.json'));
  const target = (config.targetProject ?? {}) as JsonObject;
  if (target.profile !== 'embedded') throw new Error('template update applies to an embedded project (targetProject.profile "embedded").');

  const scratch = mkdtempSync(join(tmpdir(), 'aifactory-template-'));
  try {
    const fresh = createTargetProject(basename(projectRoot), { dir: scratch, template: 'embedded', labInventoryPath: join(scratch, 'none.json') }).projectRoot;
    const templateFiles = walk(join(options.templateRoot ?? resolve(__dirname, '../templates/embedded')));
    const changes: TemplateChange[] = [];
    const copy = (path: string) => {
      if (!options.write) return;
      mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
      copyFileSync(join(fresh, path), join(projectRoot, path));
    };

    for (const path of [...templateFiles, ...GENERATED]) {
      const mine = join(projectRoot, path);
      const theirs = join(fresh, path);
      if (!existsSync(theirs) || same(mine, theirs)) continue;
      const projectOwned = PROJECT_OWNED.some((prefix) => path.startsWith(prefix));
      if (projectOwned && existsSync(mine)) continue;
      changes.push({ kind: existsSync(mine) ? 'replace' : 'add', path });
      copy(path);
    }

    // factory.config.json: the embedded gates, paths, timeout and default phases.
    const freshConfig = readJson(join(fresh, 'factory.config.json'));
    const freshTarget = freshConfig.targetProject as JsonObject;
    const commands = { ...((target.commands ?? {}) as JsonObject) };
    const freshCommands = freshTarget.commands as JsonObject;
    const merged: string[] = [];
    for (const name of MERGED_COMMANDS) {
      if (freshCommands[name] !== undefined && commands[name] !== freshCommands[name]) {
        commands[name] = freshCommands[name];
        merged.push(`commands.${name}`);
      }
    }
    const paths = new Set([...((target.allowedPaths ?? []) as string[]), ...(freshTarget.allowedPaths as string[])]);
    if (paths.size !== ((target.allowedPaths ?? []) as string[]).length) merged.push('allowedPaths');
    const timeout = Math.max(Number(target.commandTimeoutMs ?? 0), Number(freshTarget.commandTimeoutMs));
    if (timeout !== Number(target.commandTimeoutMs ?? 0)) merged.push('commandTimeoutMs');
    const defaults = { ...((config.requirementDefaults ?? {}) as JsonObject) };
    const freshDefaults = freshConfig.requirementDefaults as JsonObject;
    if (defaults.embeddedPhases === undefined && freshDefaults.embeddedPhases !== undefined) {
      defaults.embeddedPhases = freshDefaults.embeddedPhases;
      merged.push('requirementDefaults.embeddedPhases');
    }
    if (merged.length > 0) {
      changes.push({ kind: 'merge', path: 'factory.config.json', detail: merged.join(', ') });
      if (options.write) {
        const next = { ...config, targetProject: { ...target, commands, allowedPaths: [...paths], commandTimeoutMs: timeout }, requirementDefaults: defaults };
        writeFileSync(join(projectRoot, 'factory.config.json'), JSON.stringify(next, null, 2) + '\n');
      }
    }

    // package.json: the flow's scripts.
    const pkg = readJson(join(projectRoot, 'package.json'));
    const scripts = { ...((pkg.scripts ?? {}) as Record<string, string>) };
    const freshScripts = readJson(join(fresh, 'package.json')).scripts as Record<string, string>;
    const scriptChanges = Object.keys(freshScripts).filter((name) => scripts[name] !== freshScripts[name]);
    if (scriptChanges.length > 0) {
      changes.push({ kind: 'merge', path: 'package.json', detail: scriptChanges.map((name) => `scripts.${name}`).join(', ') });
      if (options.write) {
        for (const name of scriptChanges) scripts[name] = freshScripts[name];
        writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ ...pkg, scripts }, null, 2) + '\n');
      }
    }

    // .gitignore: the lines it lacks.
    const ignorePath = join(projectRoot, '.gitignore');
    const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
    const have = new Set(ignore.split(/\r?\n/));
    const missing = readFileSync(join(fresh, '.gitignore'), 'utf8').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#') && !have.has(line));
    if (missing.length > 0) {
      changes.push({ kind: 'merge', path: '.gitignore', detail: missing.join(', ') });
      if (options.write) writeFileSync(ignorePath, ignore.replace(/\n*$/, '\n') + missing.join('\n') + '\n');
    }
    return changes;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
