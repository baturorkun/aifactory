import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

// What the template last delivered to a project (RQ-0087; vanilla-ts too,
// RQ-0089; python-service, RQ-0090), so a
// project that changed a template-owned file is told from one on an older
// template. `.factory/template.lock.json` holds the aifactory commit and the
// sha256 of each template-owned file as the template wrote it; where the
// project keeps its own version, `.factory/template-base/<path>` holds the
// template's, the base of the next update's three-way merge. A change the
// project keeps on purpose is an override in factory.config.json
// (`targetProject.templateOverrides`), with its reason and the aifactory
// issue it was proposed in. `scripts/template-check.mjs` in the template
// reads the same files without aifactory; the two hash alike.

export const LOCK_PATH = '.factory/template.lock.json';
export const BASE_DIRECTORY = '.factory/template-base';
// The template's directories a project owns: only a file it lacks is added.
export const PROJECT_OWNED = ['designs/', 'boards/'];
// Written by the scaffold rather than copied from the template directory.
export const GENERATED = ['.gitlab-ci.yml', '.env.example', 'AGENTS.md'];
export const TEMPLATE_ROOT = resolve(__dirname, '../templates/embedded');

// A template a project can take updates of, by its targetProject.profile
// (RQ-0089): the same lock, merge, override and check for each.
export interface TemplateKind {
  profile: 'embedded' | 'vanilla-typescript' | 'python-service';
  /** The scaffold's template name, also in the commit and merge request. */
  template: 'embedded' | 'vanilla-ts' | 'python-service';
  root: string;
  projectOwned: string[];
  generated: string[];
  /** factory.config.json commands the template sets. */
  commands: string[];
  /** package.json scripts the template sets; every script of a fresh project when absent. */
  scripts?: string[];
  /**
   * A file that differs from the template with no base to tell whose change it
   * is (no lock, and Git does not have it from a template commit): replaced, as
   * embedded projects always were, or kept with the template's version as the
   * next base, for projects that grew their own before they took updates.
   */
  unknownBase: 'replace' | 'keep';
  /**
   * Whether a project without a lock or a template update commit was made by
   * the scaffold, so its first commit holds what the template delivered. Not
   * for a project older than its template (a Python service): there the first
   * commit is the project's own (RQ-0090).
   */
  firstCommitIsTemplate: boolean;
}

export const TEMPLATE_KINDS: Record<TemplateKind['profile'], TemplateKind> = {
  embedded: {
    profile: 'embedded',
    template: 'embedded',
    root: TEMPLATE_ROOT,
    projectOwned: PROJECT_OWNED,
    generated: GENERATED,
    // codingStandard is the project's own (set by `standard use`), not the template's.
    commands: ['designCheck', 'templateCheck', 'hdlSim', 'fpgaBuild', 'firmwareBuild', 'twinTest', 'boardTest'],
    unknownBase: 'replace',
    firstCommitIsTemplate: true,
  },
  'vanilla-typescript': {
    profile: 'vanilla-typescript',
    template: 'vanilla-ts',
    root: resolve(__dirname, '../templates/vanilla-ts'),
    // The branch preview's port base is the project's (8300 in website, 8100 here).
    projectOwned: ['deploy/branch.env'],
    generated: [...GENERATED, 'Dockerfile', 'nginx.conf', '.dockerignore'],
    // typeCheck and build name the path to aifactory's tsc from where the
    // project was made: the project's own, never merged.
    commands: ['test', 'templateCheck'],
    scripts: ['deploy:dev', 'test', 'factory', 'template:check'],
    // website had its own nginx.conf, Dockerfile and AGENTS.md long before.
    unknownBase: 'keep',
    firstCommitIsTemplate: true,
  },
  'python-service': {
    profile: 'python-service',
    template: 'python-service',
    root: resolve(__dirname, '../templates/python-service'),
    // A Python service (NetForgeSH) is older than its template: its
    // AGENTS.md, .env.example, compose files, Dockerfile and CI are its own.
    // The template brings the deploy script, its test, the deploy workflow
    // and the profiles' README; the branch profile is the project's.
    projectOwned: ['deploy/branch.env'],
    generated: [],
    // test, lint and typeCheck are the project's: only the template's own check.
    commands: ['templateCheck'],
    // No package scripts: a Python project may have no package.json at all.
    scripts: [],
    unknownBase: 'keep',
    firstCommitIsTemplate: false,
  },
};

// A vanilla-ts project made before profiles (website) is known by its layout.
const looksVanillaTs = (root: string) => ['public/index.html', 'tsconfig.build.json', 'Dockerfile'].every((path) => existsSync(join(root, path)));

/** The template a project takes updates of, and whether its profile has to be written. */
export function templateKindOf(root: string): { kind: TemplateKind; inferred: boolean } {
  const config = existsSync(configPath(root)) ? (JSON.parse(readFileSync(configPath(root), 'utf8')) as JsonObject) : {};
  const profile = ((config.targetProject ?? {}) as JsonObject).profile as string | undefined;
  if (profile && profile in TEMPLATE_KINDS) return { kind: TEMPLATE_KINDS[profile as TemplateKind['profile']], inferred: false };
  if (!profile && looksVanillaTs(root)) return { kind: TEMPLATE_KINDS['vanilla-typescript'], inferred: true };
  throw new Error(`template update applies to a project of profile ${Object.keys(TEMPLATE_KINDS).map((name) => `"${name}"`).join(' or ')} (targetProject.profile${profile ? ` is "${profile}"` : ' is not set'}).`);
}

export interface TemplateLock {
  aifactory: string;
  files: Record<string, string>;
}

export interface TemplateOverride {
  reason: string;
  issue?: string;
}

function walk(root: string, directory = root, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(root, path, found);
    else found.push(relative(root, path).split('\\').join('/'));
  }
  return found;
}

// Every file of the template directory, and the ones the scaffold writes.
export function templateFiles(templateRoot = TEMPLATE_ROOT, generated = GENERATED): string[] {
  return [...walk(templateRoot), ...generated];
}

// The files the template owns and replaces: what the lock records.
export const isTemplateOwned = (path: string, projectOwned = PROJECT_OWNED) => !projectOwned.some((prefix) => path.startsWith(prefix));

// Text is compared with its line endings normalised: Git on Windows
// (core.autocrlf) checks out with CRLF what the repository and the template
// keep with LF, and that is no change (RQ-0075). A file with a NUL byte is
// binary and compared byte for byte. AGENTS.md is compared without its
// Coding Standard section, which `standard use` writes for the project.
export const normalised = (data: Buffer) => (data.includes(0) ? data : Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
function compared(path: string, data: Buffer): Buffer {
  const text = normalised(data);
  if (path !== 'AGENTS.md' || text.includes(0)) return text;
  return Buffer.from(text.toString('utf8').replace(/^## Coding Standard\n[\s\S]*?(?=^## |(?![\s\S]))/m, '').replace(/\n*$/, '\n'), 'utf8');
}
export const contentHash = (path: string, data: Buffer) => createHash('sha256').update(compared(path, data)).digest('hex');
export function fileHash(root: string, path: string): string | undefined {
  const full = join(root, path);
  return existsSync(full) ? contentHash(path, readFileSync(full)) : undefined;
}

export const CONFLICT_MARKERS = /^<{7}( |$)[\s\S]*?^>{7}( |$)/m;
export const hasConflictMarkers = (data: Buffer) => !data.includes(0) && CONFLICT_MARKERS.test(data.toString('utf8'));

export function readLock(root: string): TemplateLock | undefined {
  const path = join(root, LOCK_PATH);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as TemplateLock) : undefined;
}

export function writeLock(root: string, lock: TemplateLock): void {
  const path = join(root, LOCK_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const files = Object.fromEntries(Object.keys(lock.files).sort().map((name) => [name, lock.files[name]]));
  writeFileSync(path, JSON.stringify({ aifactory: lock.aifactory, files }, null, 2) + '\n', 'utf8');
}

// The lock of a project whose template-owned files are as the template wrote them.
export function lockOf(root: string, paths: string[], aifactory: string, projectOwned = PROJECT_OWNED): TemplateLock {
  const files: Record<string, string> = {};
  for (const path of paths) {
    const hash = isTemplateOwned(path, projectOwned) ? fileHash(root, path) : undefined;
    if (hash) files[path] = hash;
  }
  return { aifactory, files };
}

// The aifactory commit the template comes from, or "unknown" outside a checkout.
export function aifactoryCommit(root = resolve(__dirname, '../../..')): string {
  const result = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

type JsonObject = Record<string, unknown>;
const configPath = (root: string) => join(root, 'factory.config.json');

export function readOverrides(root: string): Record<string, TemplateOverride> {
  if (!existsSync(configPath(root))) return {};
  const config = JSON.parse(readFileSync(configPath(root), 'utf8')) as JsonObject;
  return { ...(((config.targetProject ?? {}) as JsonObject).templateOverrides as Record<string, TemplateOverride> | undefined) };
}

export function writeOverrides(root: string, overrides: Record<string, TemplateOverride>): void {
  const config = JSON.parse(readFileSync(configPath(root), 'utf8')) as JsonObject;
  const target = { ...((config.targetProject ?? {}) as JsonObject) };
  if (Object.keys(overrides).length > 0) target.templateOverrides = overrides;
  else delete target.templateOverrides;
  writeFileSync(configPath(root), JSON.stringify({ ...config, targetProject: target }, null, 2) + '\n');
}

export type TemplateFileState = 'in sync' | 'changed' | 'overridden' | 'conflict' | 'missing';

// Every file of the lock, as the project has it now: what `template status`
// lists and the templateCheck gate judges.
export function templateStatus(root: string): { lock?: TemplateLock; files: { path: string; state: TemplateFileState; override?: TemplateOverride }[] } {
  const lock = readLock(root);
  if (!lock) return { files: [] };
  const overrides = readOverrides(root);
  const files = Object.entries(lock.files).sort(([a], [b]) => a.localeCompare(b)).map(([path, hash]) => {
    const full = join(root, path);
    const override = overrides[path];
    if (!existsSync(full)) return { path, state: 'missing' as const, override };
    const data = readFileSync(full);
    if (hasConflictMarkers(data)) return { path, state: 'conflict' as const, override };
    if (contentHash(path, data) === hash) return { path, state: 'in sync' as const, override };
    return { path, state: override ? 'overridden' as const : 'changed' as const, override };
  });
  return { lock, files };
}
