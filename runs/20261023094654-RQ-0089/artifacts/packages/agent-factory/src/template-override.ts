import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { readDotEnv } from './ci-variables';
import { readLock, readOverrides, templateKindOf, writeOverrides, type TemplateOverride } from './template-lock';
import { templateBase } from './template-update';

// A template-owned file the project keeps changed on purpose (RQ-0087):
// `template override` records it with its reason, so the template update
// keeps it and the templateCheck gate lets it through, and `template propose`
// sends the change to aifactory as an issue. When aifactory takes it, the next
// template update finds the file the template's again and drops the override.

export const PROPOSAL_PATH = 'out/template-propose.md';

export function overrideTemplateFile(projectRoot: string, path: string, reason: string): TemplateOverride {
  const lock = readLock(projectRoot);
  if (!lock) throw new Error('The project has no .factory/template.lock.json: run template update first.');
  if (lock.files[path] === undefined) throw new Error(`${path} is not a template-owned file (it is not in .factory/template.lock.json).`);
  if (!reason.trim()) throw new Error('An override needs its reason (--reason).');
  const overrides = readOverrides(projectRoot);
  overrides[path] = { ...overrides[path], reason: reason.trim() };
  writeOverrides(projectRoot, overrides);
  return overrides[path];
}

export function removeTemplateOverride(projectRoot: string, path: string): boolean {
  const overrides = readOverrides(projectRoot);
  if (!overrides[path]) return false;
  delete overrides[path];
  writeOverrides(projectRoot, overrides);
  return true;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout.trim() : '';
}

// The change of one file from the template's version, as a unified diff.
function diffFromBase(projectRoot: string, path: string): string {
  const mine = readFileSync(join(projectRoot, path));
  const base = templateBase(projectRoot, path, mine) ?? Buffer.alloc(0);
  const scratch = mkdtempSync(join(tmpdir(), 'aifactory-propose-'));
  try {
    const [from, to] = [join(scratch, 'template'), join(scratch, 'project')];
    writeFileSync(from, base);
    writeFileSync(to, mine);
    const result = spawnSync('git', ['diff', '--no-index', '--no-color', from, to], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // Exit 1 is "they differ"; the headers name the scratch files, so they are the file's own.
    const hunks = result.stdout.slice(Math.max(result.stdout.indexOf('\n@@'), 0)).replace(/^\n/, '');
    return hunks ? `--- a/${path}\n+++ b/${path}\n${hunks}`.trimEnd() : '';
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function proposalBody(projectRoot: string, paths: string[]): { title: string; body: string } {
  const overrides = readOverrides(projectRoot);
  const project = basename(projectRoot);
  const commit = git(projectRoot, ['rev-parse', '--short=7', 'HEAD']) || 'uncommitted';
  const title = `Template change from ${project}: ${paths.join(', ')}`;
  const body = [
    `Proposed from the ${templateKindOf(projectRoot).kind.template} project \`${project}\` at \`${commit}\` by \`factory template propose\` (RQ-0087): template-owned files it keeps changed. The diff is from the template's version the project last took (\`.factory/template.lock.json\`, aifactory \`${readLock(projectRoot)?.aifactory ?? 'unknown'}\`).`,
    '',
    'Taken into the template (`requirement new --from-issue`), the next `template update` of the project finds these files the template\'s again and drops their overrides. A change only this project needs is better a setting the template reads (like `IPS` in `project.tcl`) than an override kept for good.',
    ...paths.flatMap((path) => [
      '',
      `### \`${path}\``,
      '',
      `Reason: ${overrides[path]?.reason ?? '(none given)'}`,
      '',
      '```diff',
      diffFromBase(projectRoot, path) || '(no difference from the template)',
      '```',
    ]),
  ].join('\n') + '\n';
  return { title, body };
}

// GITHUB_TOKEN from the project's .env, else from aifactory's; the repository
// from aifactory's GITHUB_REPOSITORY, else its origin on github.com.
export function proposalTarget(projectRoot: string, aifactoryRoot: string): { token?: string; repository?: string } {
  const env = (root: string) => (existsSync(join(root, '.env')) ? readDotEnv(root) : {});
  const project = env(projectRoot);
  const aifactory = env(aifactoryRoot);
  const origin = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/.exec(git(aifactoryRoot, ['remote', 'get-url', 'origin']))?.[1];
  return { token: project.GITHUB_TOKEN || aifactory.GITHUB_TOKEN || undefined, repository: aifactory.GITHUB_REPOSITORY || origin };
}

export async function proposeTemplateChanges(projectRoot: string, options: {
  aifactoryRoot: string;
  paths?: string[];
  fetchFn?: typeof fetch;
}): Promise<{ url?: string; file?: string; paths: string[] }> {
  const overrides = readOverrides(projectRoot);
  const paths = options.paths && options.paths.length > 0 ? options.paths : Object.keys(overrides).sort();
  if (paths.length === 0) throw new Error('Nothing to propose: the project has no template overrides (template override <path> --reason …).');
  for (const path of paths) {
    if (!overrides[path]) throw new Error(`${path} has no override: mark it with template override ${path} --reason … first.`);
    if (!existsSync(join(projectRoot, path))) throw new Error(`${path} does not exist in the project.`);
  }
  const { title, body } = proposalBody(projectRoot, paths);
  const { token, repository } = proposalTarget(projectRoot, options.aifactoryRoot);
  if (!token || !repository) {
    mkdirSync(join(projectRoot, 'out'), { recursive: true });
    writeFileSync(join(projectRoot, PROPOSAL_PATH), `# ${title}\n\n${body}`, 'utf8');
    return { file: PROPOSAL_PATH, paths };
  }
  const response = await (options.fetchFn ?? fetch)(`https://api.github.com/repos/${repository}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) throw new Error(`GitHub refused the issue on ${repository}: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const url = ((await response.json()) as { html_url: string }).html_url;
  for (const path of paths) overrides[path] = { ...overrides[path], issue: url };
  writeOverrides(projectRoot, overrides);
  return { url, paths };
}
