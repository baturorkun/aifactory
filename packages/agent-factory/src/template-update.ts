import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { readCodingStandard, withCodingStandardSection } from './coding-standard';
import { createTargetProject } from './scaffold';
import {
  BASE_DIRECTORY, LOCK_PATH, aifactoryCommit, contentHash, isTemplateOwned, normalised, readLock, readOverrides, templateFiles, templateKindOf,
  writeLock, type TemplateLock,
} from './template-lock';

// Brings a project made from an older template up to this aifactory's
// (RQ-0047; vanilla-ts too, RQ-0089). The template owns its scripts, the CI
// file and the generated guidelines (embedded: the flow; vanilla-ts: the
// deploy scripts and the container files); a project owns its sources (embedded:
// design sources and board files; vanilla-ts: deploy/branch.env): there only a
// file the template ships and the project lacks is added (a design's
// test.yaml), nothing is overwritten. The factory config and
// package scripts are merged, .gitignore gains the lines it lacks. .env,
// requirements, runs and out/ are never touched.
//
// A template-owned file is never overwritten silently (RQ-0087). With the
// base (what the template last delivered, from the lock), mine (the
// project's) and theirs (this template's): the project's file is replaced
// when only the template moved, kept when only the project did, and merged
// with `git merge-file` when both did; a merge that conflicts is written
// with its markers for the merge request to resolve.

export type TemplateChange =
  | { kind: 'replace' | 'add' | 'kept' | 'merged' | 'conflict'; path: string }
  | { kind: 'merge'; path: string; detail: string };

// The commit a template update makes, of either kind.
const TEMPLATE_COMMIT = /^chore\(template\): the aifactory (embedded|vanilla-ts|python-service) template at /;

type JsonObject = Record<string, unknown>;
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as JsonObject;

function gitOut(cwd: string, args: string[]): string | undefined {
  const result = spawnSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout.toString('utf8') : undefined;
}
function gitShow(cwd: string, commit: string, path: string): Buffer | undefined {
  const result = spawnSync('git', ['show', `${commit}:${path}`], { cwd, maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : undefined;
}

// Where the base of a file is read from, when no base copy holds it: the
// commit that last wrote the lock; for a project from before the lock, its
// last template update commit, else its first commit (the scaffold's) when
// the scaffold made it.
function baseCommit(projectRoot: string, lock: TemplateLock | undefined, firstCommitIsTemplate = true): string | undefined {
  if (gitOut(projectRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']) === undefined) return undefined;
  if (lock) return gitOut(projectRoot, ['log', '-1', '--format=%H', '--', LOCK_PATH])?.trim() || undefined;
  const subjects = gitOut(projectRoot, ['log', '--format=%H %s']) ?? '';
  for (const line of subjects.split('\n')) {
    const [commit, ...subject] = line.split(' ');
    if (commit && TEMPLATE_COMMIT.test(subject.join(' '))) return commit;
  }
  if (!firstCommitIsTemplate) return undefined;
  return gitOut(projectRoot, ['rev-list', '--max-parents=0', 'HEAD'])?.trim().split('\n').pop() || undefined;
}

// `git merge-file` of mine with theirs over base, as LF text: the merged
// text and whether it conflicts.
function mergeFile(mine: Buffer, base: Buffer, theirs: Buffer): { text: Buffer; conflict: boolean } {
  const scratch = mkdtempSync(join(tmpdir(), 'aifactory-merge-'));
  try {
    const files = ['mine', 'base', 'theirs'].map((name) => join(scratch, name));
    [mine, base, theirs].forEach((data, index) => writeFileSync(files[index], normalised(data)));
    const result = spawnSync('git', ['merge-file', '-p', '-L', 'project', '-L', 'base', '-L', 'template', ...files], { maxBuffer: 64 * 1024 * 1024 });
    if (result.status === null || result.status < 0 || result.error) throw new Error(`git merge-file failed: ${String(result.stderr ?? result.error ?? '').trim()}`);
    return { text: result.stdout, conflict: result.status > 0 };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The template's version of a file as the project last took it (the base
// of a three-way merge), or undefined when nothing records it.
const firstCommitIsTemplate = (projectRoot: string) => {
  try {
    return templateKindOf(projectRoot).kind.firstCommitIsTemplate;
  } catch {
    return true;
  }
};

// `commit` null: no commit holds the base (a default would look it up again).
export function templateBase(projectRoot: string, path: string, mine: Buffer, lock = readLock(projectRoot), commit: string | null = baseCommit(projectRoot, lock, firstCommitIsTemplate(projectRoot)) ?? null): Buffer | undefined {
  const copy = join(projectRoot, BASE_DIRECTORY, path);
  if (existsSync(copy)) return readFileSync(copy);
  // With a lock, a base is only what the lock recorded.
  if (lock && lock.files[path] === undefined) return undefined;
  if (lock && contentHash(path, mine) === lock.files[path]) return mine;
  const shown = commit ? gitShow(projectRoot, commit, path) : undefined;
  if (shown && lock && contentHash(path, shown) !== lock.files[path]) return undefined;
  return shown;
}

export function updateTemplateProject(projectRoot: string, options: { write?: boolean; templateRoot?: string } = {}): TemplateChange[] {
  const config = readJson(join(projectRoot, 'factory.config.json'));
  const target = (config.targetProject ?? {}) as JsonObject;
  const { kind, inferred } = templateKindOf(projectRoot);

  const scratch = mkdtempSync(join(tmpdir(), 'aifactory-template-'));
  try {
    const fresh = createTargetProject(basename(projectRoot), {
      dir: scratch,
      template: kind.template,
      ...(kind.template === 'embedded' ? { labInventoryPath: join(scratch, 'none.json') } : {}),
    }).projectRoot;
    // The template's AGENTS.md with this project's Coding Standard section,
    // as standard use writes it, so the update keeps it (RQ-0075).
    const freshAgents = join(fresh, 'AGENTS.md');
    writeFileSync(freshAgents, withCodingStandardSection(readFileSync(freshAgents, 'utf8'), readCodingStandard(projectRoot)), 'utf8');
    const changes: TemplateChange[] = [];
    const write = (path: string, data: Buffer) => {
      if (!options.write) return;
      mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
      writeFileSync(join(projectRoot, path), data);
    };

    const lock = readLock(projectRoot);
    const commit = baseCommit(projectRoot, lock, kind.firstCommitIsTemplate);
    const read = (root: string, path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path)) : undefined);
    const baseOf = (path: string, mine: Buffer) => templateBase(projectRoot, path, mine, lock, commit ?? null);
    // The files kept different from the template: their template version is the next base.
    const diverged = new Map<string, Buffer>();
    const nextLock: TemplateLock = { aifactory: aifactoryCommit(), files: {} };

    for (const path of templateFiles(options.templateRoot ?? kind.root, kind.generated)) {
      const theirs = read(fresh, path);
      if (!theirs) continue;
      const mine = read(projectRoot, path);
      if (!isTemplateOwned(path, kind.projectOwned)) {
        if (!mine) {
          changes.push({ kind: 'add', path });
          write(path, theirs);
        }
        continue;
      }
      nextLock.files[path] = contentHash(path, theirs);
      if (!mine) {
        changes.push({ kind: 'add', path });
        write(path, theirs);
        continue;
      }
      if (normalised(mine).equals(normalised(theirs))) continue;
      const base = baseOf(path, mine);
      // No base: a project from before the lock that Git cannot tell about is
      // replaced as before (embedded) or kept (vanilla-ts, RQ-0089); with a
      // lock, a file it never delivered is the project's.
      if (!base && !lock) {
        if (kind.unknownBase === 'keep') {
          diverged.set(path, theirs);
          changes.push({ kind: 'kept', path });
          continue;
        }
        changes.push({ kind: 'replace', path });
        write(path, theirs);
        continue;
      }
      if (base && normalised(mine).equals(normalised(base))) {
        changes.push({ kind: 'replace', path });
        write(path, theirs);
        continue;
      }
      diverged.set(path, theirs);
      if (base && normalised(theirs).equals(normalised(base))) {
        changes.push({ kind: 'kept', path });
        continue;
      }
      const merged = mergeFile(mine, base ?? Buffer.alloc(0), theirs);
      if (!merged.conflict && merged.text.equals(normalised(theirs))) diverged.delete(path);
      changes.push({ kind: merged.conflict ? 'conflict' : 'merged', path });
      write(path, merged.text);
    }

    // The lock and the base copies: written when what they record moved.
    const copyOf = (path: string) => read(projectRoot, `${BASE_DIRECTORY}/${path}`);
    const recorded = new Set([...Object.keys(lock?.files ?? {}), ...Object.keys(nextLock.files)]);
    const lockMoved = !lock
      || JSON.stringify(Object.entries(lock.files).sort()) !== JSON.stringify(Object.entries(nextLock.files).sort())
      || [...recorded].some((path) => {
        const theirs = diverged.get(path);
        const copy = copyOf(path);
        return theirs ? !copy?.equals(normalised(theirs)) : copy !== undefined;
      });
    if (lockMoved) {
      changes.push({ kind: lock ? 'replace' : 'add', path: LOCK_PATH });
      if (options.write) {
        rmSync(join(projectRoot, BASE_DIRECTORY), { recursive: true, force: true });
        for (const [path, theirs] of diverged) write(`${BASE_DIRECTORY}/${path}`, normalised(theirs));
        writeLock(projectRoot, nextLock);
      }
    }
    // An override on a file that is the template's again has done its work.
    const overrides = readOverrides(projectRoot);
    const settled = Object.keys(overrides).filter((path) => nextLock.files[path] !== undefined && !diverged.has(path));

    // factory.config.json: the template's gates, paths, timeout, default phases,
    // and the profile of a project made before profiles (RQ-0089).
    const freshConfig = readJson(join(fresh, 'factory.config.json'));
    const freshTarget = freshConfig.targetProject as JsonObject;
    const commands = { ...((target.commands ?? {}) as JsonObject) };
    const freshCommands = freshTarget.commands as JsonObject;
    const merged: string[] = [];
    for (const name of kind.commands) {
      if (freshCommands[name] !== undefined && commands[name] !== freshCommands[name]) {
        commands[name] = freshCommands[name];
        merged.push(`commands.${name}`);
      }
    }
    // The coding standard gate: added where missing (RQ-0076), a project's own never changed.
    if (commands.codingStandard === undefined && freshCommands.codingStandard !== undefined) {
      commands.codingStandard = freshCommands.codingStandard;
      merged.push('commands.codingStandard');
    }
    const paths = new Set([...((target.allowedPaths ?? []) as string[]), ...(freshTarget.allowedPaths as string[])]);
    if (paths.size !== ((target.allowedPaths ?? []) as string[]).length) merged.push('allowedPaths');
    const timeout = Math.max(Number(target.commandTimeoutMs ?? 0), Number(freshTarget.commandTimeoutMs ?? 0));
    if (timeout !== Number(target.commandTimeoutMs ?? 0)) merged.push('commandTimeoutMs');
    if (inferred) merged.push(`profile "${kind.profile}"`);
    const defaults = { ...((config.requirementDefaults ?? {}) as JsonObject) };
    const freshDefaults = freshConfig.requirementDefaults as JsonObject;
    if (defaults.embeddedPhases === undefined && freshDefaults.embeddedPhases !== undefined) {
      defaults.embeddedPhases = freshDefaults.embeddedPhases;
      merged.push('requirementDefaults.embeddedPhases');
    }
    // The coding standard's place, empty, for a project that has none
    // (RQ-0071); a project's own choice is never touched.
    const codingStandard = config.codingStandard ?? freshConfig.codingStandard;
    if (config.codingStandard === undefined && freshConfig.codingStandard !== undefined) merged.push('codingStandard');
    for (const path of settled) merged.push(`templateOverrides.${path} removed`);
    const templateOverrides = Object.fromEntries(Object.entries(overrides).filter(([path]) => !settled.includes(path)));
    if (merged.length > 0) {
      changes.push({ kind: 'merge', path: 'factory.config.json', detail: merged.join(', ') });
      if (options.write) {
        const rest = { ...target };
        delete rest.templateOverrides;
        const next = {
          ...config,
          targetProject: {
            ...rest,
            ...(inferred ? { profile: kind.profile } : {}),
            commands,
            allowedPaths: [...paths],
            ...(timeout > 0 ? { commandTimeoutMs: timeout } : {}),
            ...(Object.keys(templateOverrides).length > 0 ? { templateOverrides } : {}),
          },
          requirementDefaults: defaults,
          ...(codingStandard !== undefined ? { codingStandard } : {}),
        };
        writeFileSync(join(projectRoot, 'factory.config.json'), JSON.stringify(next, null, 2) + '\n');
      }
    }

    // package.json: the template's scripts. A Python service takes none and
    // may have no package.json (RQ-0090).
    const hasPackage = existsSync(join(projectRoot, 'package.json'));
    const pkg = hasPackage ? readJson(join(projectRoot, 'package.json')) : {};
    const scripts = { ...((pkg.scripts ?? {}) as Record<string, string>) };
    const freshScripts = readJson(join(fresh, 'package.json')).scripts as Record<string, string>;
    const scriptChanges = hasPackage ? Object.keys(freshScripts).filter((name) => (kind.scripts ?? Object.keys(freshScripts)).includes(name) && scripts[name] !== freshScripts[name]) : [];
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

// The name embedded projects and their tests have called it by since RQ-0047.
export const updateEmbeddedProject = updateTemplateProject;
