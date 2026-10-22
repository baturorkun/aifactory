import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { RepositoryPlatformAdapter } from './repository-platform/types';
import { updateEmbeddedProject, type TemplateChange } from './template-update';

// `factory template update` (RQ-0069): an embedded project takes the
// current template as a merge request, never as files left in a worktree.
// aifactory knows no project: the one the command runs in is the one updated.
//
//   1. aifactory brings itself up to date (a fast-forward of its main, and
//      `pnpm install` when the lockfile moved); the command then runs again
//      in a new process, since the code that writes the template is the code
//      just pulled;
//   2. the project must be on its main, clean, and not behind origin;
//   3. the changes go on a branch template/aifactory-<commit>, are committed
//      and pushed, and a merge request is opened; the project is left on main.
//
// Anything not as expected stops before a file is touched, and says why.

export class TemplateDeliveryError extends Error {}

// `raw`: the output as Git gives it (porcelain lines start with a space).
function git(cwd: string, args: string[], options: { allowFailure?: boolean; raw?: boolean } = {}): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new TemplateDeliveryError(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  if (result.status !== 0) return '';
  return options.raw ? result.stdout : result.stdout.trim();
}

// The branch is main (or the one named), nothing is uncommitted, and the
// branch is not behind origin; one that is behind is fast-forwarded, one that
// has diverged is refused. `what` names the checkout in the messages.
export function bringMainUpToDate(root: string, what: string, branch = 'main'): { before: string; after: string } {
  if (!existsSync(join(root, '.git'))) throw new TemplateDeliveryError(`${what} is not a Git checkout: ${root}`);
  const current = git(root, ['branch', '--show-current']);
  if (current !== branch) throw new TemplateDeliveryError(`${what} is on ${current || 'a detached HEAD'}, not ${branch}: switch to ${branch} first.`);
  const dirty = git(root, ['status', '--porcelain'], { raw: true }).split('\n').filter(Boolean);
  if (dirty.length > 0) {
    throw new TemplateDeliveryError(`${what} has ${dirty.length} uncommitted change(s) (${dirty.slice(0, 3).map((line) => line.slice(3)).join(', ')}${dirty.length > 3 ? ', …' : ''}): commit or stash them first.`);
  }
  git(root, ['fetch', '--quiet', 'origin', branch]);
  const before = git(root, ['rev-parse', 'HEAD']);
  const remote = git(root, ['rev-parse', `origin/${branch}`]);
  if (before === remote) return { before, after: before };
  // Behind is fine (fast-forwarded); ahead or diverged is someone's work.
  if (spawnSync('git', ['merge-base', '--is-ancestor', before, remote], { cwd: root }).status !== 0) {
    throw new TemplateDeliveryError(`${what}'s ${branch} has commits origin/${branch} does not: push or reset them first.`);
  }
  git(root, ['merge', '--ff-only', '--quiet', `origin/${branch}`]);
  return { before, after: remote };
}

// aifactory itself: up to date with its origin, its dependencies installed
// when the lockfile moved. Says whether anything changed.
export function updateAifactory(root: string, log: (line: string) => void = () => {}): boolean {
  const { before, after } = bringMainUpToDate(root, 'aifactory');
  if (before === after) return false;
  log(`aifactory: ${before.slice(0, 7)} → ${after.slice(0, 7)}`);
  const lockMoved = git(root, ['diff', '--name-only', before, after, '--', 'pnpm-lock.yaml']) !== '';
  if (lockMoved) {
    log('aifactory: the lockfile moved, pnpm install');
    // pnpm is a .cmd on Windows: started through the shell there (RQ-0073).
    const installed = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (installed.error) throw new TemplateDeliveryError(`pnpm install in aifactory could not start: ${installed.error.message}`);
    if (installed.status !== 0) throw new TemplateDeliveryError(`pnpm install in aifactory failed with exit code ${installed.status ?? 'unknown'}.`);
  }
  return true;
}

// The project's design check with the new files, run by this Node: what
// `pnpm check` runs, without pnpm, which is a .cmd on Windows (RQ-0073). A
// check that could not start says so, not that it failed.
export function runProjectCheck(root: string): void {
  const flow = join(root, 'scripts', 'flow.mjs');
  if (!existsSync(flow)) throw new TemplateDeliveryError(`The project has no scripts/flow.mjs to check with; nothing was pushed.`);
  const checked = spawnSync(process.execPath, [flow, 'check'], { cwd: root, stdio: 'inherit' });
  if (checked.error) throw new TemplateDeliveryError(`The design check could not start (${checked.error.message}); nothing was pushed.`);
  if (checked.status !== 0) throw new TemplateDeliveryError(`The design check fails with the new template (exit code ${checked.status ?? 'unknown'}); nothing was pushed.`);
}

export interface TemplateDelivery {
  status: 'current' | 'opened';
  changes: TemplateChange[];
  branch?: string;
  url?: string;
  // Left a draft: files conflict (RQ-0087).
  draft?: boolean;
}

export async function deliverTemplateUpdate(projectRoot: string, options: {
  aifactoryRoot: string;
  adapter: RepositoryPlatformAdapter;
  log?: (line: string) => void;
  check?: (root: string) => void;
}): Promise<TemplateDelivery> {
  const log = options.log ?? (() => {});
  const main = options.adapter.targetBranch || 'main';
  bringMainUpToDate(projectRoot, 'The project', main);

  const changes = updateEmbeddedProject(projectRoot, { write: false });
  // A file the project keeps is no change to deliver (RQ-0087).
  if (changes.every((change) => change.kind === 'kept')) return { status: 'current', changes };
  const conflicts = changes.filter((change) => change.kind === 'conflict').map((change) => change.path);

  // One template update open at a time: a second would conflict with the first.
  const open = git(projectRoot, ['ls-remote', '--heads', 'origin', 'template/*'])
    .split('\n').map((line) => line.split('\trefs/heads/')[1]).filter(Boolean);
  if (open.length > 0) throw new TemplateDeliveryError(`A template update is already open on ${open.join(', ')}: merge or close its merge request first.`);

  const commit = git(options.aifactoryRoot, ['rev-parse', '--short=7', 'HEAD']);
  // Quoted into the project's commit: a CI marker in it ("reserve draft
  // [skip ci]") would skip the merge request's own pipeline (RQ-0081).
  const subject = git(options.aifactoryRoot, ['log', '-1', '--format=%s']).replace(/\s*\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/gi, '');
  const branch = `template/aifactory-${commit}`;
  git(projectRoot, ['checkout', '--quiet', '-b', branch]);
  try {
    updateEmbeddedProject(projectRoot, { write: true });
    // With conflict markers the check may well fail: the merge request is
    // where they are resolved, so it opens anyway, as a draft.
    try {
      options.check?.(projectRoot);
    } catch (err) {
      if (conflicts.length === 0) throw err;
      log(`the check fails with ${conflicts.length} conflict(s) in the files; the merge request opens as a draft`);
    }
    git(projectRoot, ['add', '-A']);
    // Written, but Git sees no change (a difference only Git normalises
    // away): the project is current, nothing is pushed (RQ-0075).
    if (spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: projectRoot }).status === 0) {
      log('no change once written; the project is on the current template');
      return { status: 'current', changes: [] };
    }
    const list = changes.map((change) => `- ${change.kind} ${change.path}${change.kind === 'merge' ? ` (${change.detail})` : ''}`).join('\n');
    git(projectRoot, ['commit', '--quiet', '-m', `chore(template): the aifactory embedded template at ${commit}\n\naifactory ${commit}: ${subject}\n\n${list}`]);
    git(projectRoot, ['push', '--quiet', '-u', 'origin', branch]);
    log(`pushed ${branch}`);
    const draft = await options.adapter.createDraftChangeRequest({
      title: `aifactory template update (${commit})`,
      description: [
        `The embedded template of aifactory at \`${commit}\` (${subject}), by \`factory template update\`.`,
        '',
        'Template-owned files only: the scripts, the CI file, `.env.example`, `AGENTS.md`, merged package scripts and gates. Designs, boards, `.env` and requirements are not touched. A file the project changed is never overwritten: `kept` when only the project changed it, `merged` when both did, `conflict` when the merge needs a hand.',
        '',
        list,
        '',
        ...(conflicts.length > 0
          ? [`**${conflicts.length} file(s) conflict** (${conflicts.map((path) => `\`${path}\``).join(', ')}): the project and the template both changed them. Resolve the conflict markers on this branch, keep the project's change with \`pnpm factory -- template override <path> --reason …\` if it stays different from the template, and mark the merge request ready.`, '']
          : []),
        'The pipeline of this merge request runs the stages; merge it when they pass.',
      ].join('\n'),
      sourceBranch: branch,
      targetBranch: main,
    });
    if (conflicts.length > 0) return { status: 'opened', changes, branch, url: draft.url, draft: true };
    const ready = await options.adapter.markChangeRequestReady(draft);
    return { status: 'opened', changes, branch, url: ready.url };
  } finally {
    // The project is left on main, clean; the update lives on its branch.
    git(projectRoot, ['reset', '--hard', '--quiet'], { allowFailure: true });
    git(projectRoot, ['clean', '-fdq'], { allowFailure: true });
    git(projectRoot, ['checkout', '--quiet', main], { allowFailure: true });
    git(projectRoot, ['branch', '-D', branch], { allowFailure: true });
  }
}
