import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FactoryConfigSchema } from './config';
import {
  loadProjectGuidelines,
  recordProjectGuidelines,
  withProjectGuidelines,
} from './project-guidelines';
import { createRunDir, readManifest } from './orchestrator/manifest';

test('project guidelines are loaded, injected, snapshotted, and recorded in manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-guidelines-'));
  const runs = join(root, 'runs');
  mkdirSync(runs);
  writeFileSync(
    join(root, 'PROJECT_GUIDELINES.md'),
    '# Guidelines\n\n- Preserve the current architecture.\n',
  );
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    targetProject: { root },
    projectGuidelines: {
      files: ['./PROJECT_GUIDELINES.md'],
      required: true,
    },
  });

  try {
    const guidelines = loadProjectGuidelines(config);
    assert.ok(guidelines);
    assert.match(guidelines.prompt, /Preserve the current architecture/);
    assert.match(withProjectGuidelines('# CODER', guidelines), /## Project Guidelines/);

    const runDir = createRunDir(runs, '20260726000000-RQ-0001', 'RQ-0001');
    recordProjectGuidelines(runDir, guidelines);
    const manifest = readManifest(runDir);
    const snapshot = JSON.parse(
      readFileSync(join(runDir, 'project-guidelines.json'), 'utf8'),
    ) as { combinedSha256: string };

    assert.equal(manifest.projectGuidelines?.files[0]?.path, 'PROJECT_GUIDELINES.md');
    assert.equal(manifest.projectGuidelines?.combinedSha256, snapshot.combinedSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('required project guidelines fail before a run when the file is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-guidelines-missing-'));
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    targetProject: { root },
    projectGuidelines: {
      files: ['./PROJECT_GUIDELINES.md'],
      required: true,
    },
  });

  try {
    assert.throws(
      () => loadProjectGuidelines(config),
      /Required project guideline file not found/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project guideline paths cannot escape the target project root', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-guidelines-path-'));
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    targetProject: { root },
    projectGuidelines: {
      files: ['../outside.md'],
    },
  });

  try {
    assert.throws(
      () => loadProjectGuidelines(config),
      /outside targetProject\.root/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
