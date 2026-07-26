import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RunManifestSchema } from '@aifactory/contracts';
import { FactoryConfigSchema } from '../config';
import {
  beginHandoffRun,
  createHandoffPackage,
  finishHandoffRun,
} from './handoff';
import { readManifest } from './manifest';

test('legacy agent manifests default to agent mode', () => {
  const manifest = RunManifestSchema.parse({
    runId: '20260726000000-RQ-0000',
    requirementId: 'RQ-0000',
    status: 'passed',
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    steps: [],
    artifacts: [],
    gateResults: {},
  });

  assert.equal(manifest.executionMode, 'agent');
  assert.deepEqual(manifest.deletedFiles, []);
});

test('handoff queries configured RAG and embeds answer with sources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-handoff-'));
  const requirements = join(root, 'requirements');
  const handoffs = join(root, 'handoffs');
  const runs = join(root, 'runs');
  mkdirSync(requirements);
  writeFileSync(
    join(requirements, 'RQ-0001.md'),
    '# ARINC Layer\n\nImplement the Layer parent-child rules.',
  );
  writeFileSync(
    join(root, 'PROJECT_GUIDELINES.md'),
    '# Project Guidelines\n\n- Preserve Supplement 8 compatibility.',
  );
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    paths: {
      requirements,
      constraints: join(root, 'constraints'),
      handoffs,
      runs,
    },
    targetProject: { root },
    projectGuidelines: {
      files: ['./PROJECT_GUIDELINES.md'],
      required: true,
    },
    rag: {
      grounding: {
        enabled: true,
        chatUrl: 'http://rag.example/query',
        sourceIds: ['arinc'],
      },
    },
  });
  let requestBody: Record<string, unknown> | undefined;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        answer: 'A Layer can parent supported Container widgets.',
        sources: [
          {
            sourceId: 'arinc',
            relativePath: 'ARINC 661/ARINC661P1-8.pdf',
            score: 0.9,
          },
        ],
      }),
      { status: 200 },
    );
  };

  try {
    const handoffId = await createHandoffPackage('RQ-0001', config, fetchImpl);
    const handoff = readFileSync(join(handoffs, handoffId, 'handoff.md'), 'utf8');
    const ragContext = JSON.parse(
      readFileSync(join(handoffs, handoffId, 'rag-context.json'), 'utf8'),
    ) as { answer: string };
    const manifest = readManifest(join(runs, handoffId));

    assert.deepEqual(requestBody?.sourceIds, ['arinc']);
    assert.match(handoffId, /^\d{14}-RQ-0001$/);
    assert.match(handoff, /## RAG Grounding/);
    assert.match(handoff, /## Project Guidelines/);
    assert.match(handoff, /Preserve Supplement 8 compatibility/);
    assert.match(handoff, new RegExp(`Run ID: \`${handoffId}\``));
    assert.match(handoff, /A Layer can parent supported Container widgets/);
    assert.match(handoff, /ARINC661P1-8\.pdf/);
    assert.equal(ragContext.answer, 'A Layer can parent supported Container widgets.');
    assert.equal(manifest.executionMode, 'handoff');
    assert.equal(manifest.status, 'queued');
    assert.equal(manifest.steps[0]?.agent, 'handoff');
    assert.equal(manifest.steps[0]?.status, 'pending');
    assert.equal(manifest.projectGuidelines?.files[0]?.path, 'PROJECT_GUIDELINES.md');
    assert.ok(existsSync(join(handoffs, handoffId, 'project-guidelines.json')));
    assert.equal(
      readFileSync(join(runs, handoffId, 'rag-context.json'), 'utf8'),
      readFileSync(join(handoffs, handoffId, 'rag-context.json'), 'utf8'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('handoff run captures implementation artifacts and finalizes like an agent run', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-handoff-run-'));
  const requirements = join(root, 'requirements');
  const handoffs = join(root, 'handoffs');
  const runs = join(root, 'runs');
  const target = join(root, 'target');
  mkdirSync(requirements);
  mkdirSync(join(target, 'src'), { recursive: true });
  writeFileSync(join(requirements, 'RQ-0002.md'), '# Manual change\n\nUpdate the target.');
  writeFileSync(join(target, 'src', 'main.ts'), 'export const value = 1;\n');
  writeFileSync(join(target, 'src', 'removed.ts'), 'export const removed = true;\n');

  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    paths: {
      requirements,
      constraints: join(root, 'constraints'),
      handoffs,
      runs,
    },
    targetProject: {
      root: target,
      allowedPaths: ['src'],
    },
  });

  try {
    const runId = await createHandoffPackage('RQ-0002', config);
    const secondRunId = await createHandoffPackage('RQ-0002', config);
    assert.notEqual(secondRunId, runId);
    assert.ok(existsSync(join(handoffs, runId, 'handoff.md')));
    assert.ok(existsSync(join(handoffs, secondRunId, 'handoff.md')));

    const started = beginHandoffRun(runId, config);
    assert.equal(started.status, 'running');
    assert.equal(started.steps[0]?.status, 'running');

    writeFileSync(join(target, 'src', 'main.ts'), 'export const value = 2;\n');
    writeFileSync(join(target, 'src', 'added.ts'), 'export const added = true;\n');
    rmSync(join(target, 'src', 'removed.ts'));

    const finished = await finishHandoffRun(runId, config, { skipGates: true });
    assert.equal(finished.status, 'passed');
    assert.equal(finished.executionMode, 'handoff');
    assert.equal(finished.steps[0]?.status, 'passed');
    assert.deepEqual(finished.artifacts, ['src/added.ts', 'src/main.ts']);
    assert.deepEqual(finished.deletedFiles, ['src/removed.ts']);
    assert.deepEqual(Object.values(finished.gateResults), [
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
    assert.equal(
      readFileSync(join(runs, runId, 'artifacts', 'src', 'main.ts'), 'utf8'),
      'export const value = 2;\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
