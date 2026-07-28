import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  changedRequirementIds,
  requirementBranchName,
} from './requirement-branches';

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

test('requirement branch names are stable and reject unsafe IDs', () => {
  assert.equal(requirementBranchName('RQ-0016'), 'factory/RQ-0016');
  assert.equal(requirementBranchName('rq-42', 'requirements/'), 'requirements/RQ-42');
  assert.throws(() => requirementBranchName('../main'), /Invalid requirement ID/);
});

test('changed requirements are detected from added and updated Markdown files', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-requirement-changes-'));
  try {
    git(root, 'init', '-b', 'main');
    git(root, 'config', 'user.name', 'AI Factory Test');
    git(root, 'config', 'user.email', 'test@example.invalid');
    mkdirSync(join(root, 'requirements'));
    writeFileSync(join(root, 'requirements', 'RQ-0001-first.md'), '# First\n');
    writeFileSync(join(root, 'README.md'), '# Project\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'initial');
    const base = git(root, 'rev-parse', 'HEAD');

    writeFileSync(join(root, 'requirements', 'RQ-0001-first.md'), '# First updated\n');
    writeFileSync(join(root, 'requirements', 'RQ-0002-second.md'), '# Second\n');
    writeFileSync(join(root, 'README.md'), '# Project updated\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'update requirements');
    const head = git(root, 'rev-parse', 'HEAD');

    assert.deepEqual(changedRequirementIds(root, base, head), ['RQ-0001', 'RQ-0002']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
