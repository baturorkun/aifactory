import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTargetProject } from './scaffold';

test('new projects enable the draft requirement branch workflow', () => {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-scaffold-'));
  try {
    const result = createTargetProject('lifecycle-project', {
      dir: parent,
      template: 'vanilla-ts',
    });
    const config = JSON.parse(
      readFileSync(join(result.projectRoot, 'factory.config.json'), 'utf8'),
    ) as {
      requirementBranches: {
        enabled: boolean;
        branchPrefix: string;
        baseBranch: string;
      };
    };
    const ci = readFileSync(join(result.projectRoot, '.gitlab-ci.yml'), 'utf8');
    assert.deepEqual(config.requirementBranches, {
      enabled: true,
      branchPrefix: 'factory/',
      baseBranch: 'main',
      remote: 'origin',
    });
    assert.match(ci, /ai_factory_requirement_branch:/);
    assert.match(ci, /requirement decision/);
    assert.match(ci, /sync-requirement/);
    assert.match(ci, /RQ-\[0-9\]\+/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

