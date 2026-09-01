import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FactoryConfigSchema, loadConfig } from '../config';
import {
  formatGroundingContext,
  queryConfiguredRag,
  shouldQueryGrounding,
} from './grounding-client';

function config(overrides: Record<string, unknown> = {}) {
  return FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    rag: {
      grounding: {
        enabled: true,
        chatUrl: 'http://rag.example/query',
        sourceIds: ['source-a'],
        agents: ['planner'],
        ...overrides,
      },
    },
  });
}

test('explicit grounding only runs when the configured marker is present', () => {
  const explicit = config({ mode: 'explicit', marker: '@rag' });

  assert.equal(shouldQueryGrounding(explicit, '# Requirement\nDraw a BFI.'), false);
  assert.equal(shouldQueryGrounding(explicit, '# Requirement\n@rag Draw a BFI.'), true);
});

test('project grounding inherits shared connection settings from AI Factory', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-grounding-'));
  const factoryHome = join(root, 'factory');
  const projectHome = join(root, 'project');
  const originalFactoryHome = process.env.AIFACTORY_HOME;
  try {
    mkdirSync(factoryHome);
    mkdirSync(projectHome);
    writeFileSync(
      join(factoryHome, 'factory.config.json'),
      JSON.stringify({
        rag: {
          grounding: {
            enabled: false,
            chatUrl: 'http://central-rag.example/query',
            timeoutMs: 90000,
          },
        },
      }),
    );
    writeFileSync(
      join(projectHome, 'factory.config.json'),
      JSON.stringify({
        model: { provider: 'mock', name: 'mock' },
        rag: {
          grounding: {
            enabled: true,
            sourceIds: ['source-a'],
            agents: ['planner'],
          },
        },
      }),
    );
    process.env.AIFACTORY_HOME = factoryHome;

    const projectConfig = loadConfig(projectHome);

    assert.equal(projectConfig.rag.grounding.enabled, true);
    assert.equal(projectConfig.rag.grounding.chatUrl, 'http://central-rag.example/query');
    assert.equal(projectConfig.rag.grounding.timeoutMs, 90000);
    assert.deepEqual(projectConfig.rag.grounding.sourceIds, ['source-a']);
  } finally {
    if (originalFactoryHome === undefined) delete process.env.AIFACTORY_HOME;
    else process.env.AIFACTORY_HOME = originalFactoryHome;
    rmSync(root, { recursive: true, force: true });
  }
});

test('regular project config loading ignores RAG service-only environment variables', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-rag-lazy-'));
  const missingVariable = 'RAG_TEST_SOURCE_PATH_MUST_BE_LAZY';
  const previousValue = process.env[missingVariable];
  try {
    delete process.env[missingVariable];
    writeFileSync(
      join(root, 'factory.config.json'),
      JSON.stringify({
        model: { provider: 'mock', name: 'mock' },
        rag: {
          database: { connectionString: '${RAG_TEST_DATABASE_URL_MUST_BE_LAZY}' },
          sources: [
            {
              id: 'source-a',
              type: 'filesystem',
              rootPath: `\${${missingVariable}}`,
            },
          ],
          embedding: {
            provider: 'gemini',
            model: 'gemini-embedding-001',
            apiKey: '${RAG_TEST_API_KEY_MUST_BE_LAZY}',
          },
          grounding: {
            enabled: true,
            chatUrl: 'http://rag.example/query',
            sourceIds: ['source-a'],
          },
        },
      }),
    );

    const projectConfig = loadConfig(root);

    assert.equal(projectConfig.rag.grounding.enabled, true);
    assert.deepEqual(projectConfig.rag.grounding.sourceIds, ['source-a']);
    assert.deepEqual(projectConfig.rag.sources, []);
  } finally {
    if (previousValue === undefined) delete process.env[missingVariable];
    else process.env[missingVariable] = previousValue;
    rmSync(root, { recursive: true, force: true });
  }
});

test('regular project config loading still validates grounding environment variables', () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-grounding-required-'));
  const variable = 'RAG_TEST_GROUNDING_URL_MUST_EXIST';
  const previousValue = process.env[variable];
  try {
    delete process.env[variable];
    writeFileSync(
      join(root, 'factory.config.json'),
      JSON.stringify({
        model: { provider: 'mock', name: 'mock' },
        rag: {
          grounding: {
            enabled: true,
            chatUrl: `\${${variable}}`,
          },
        },
      }),
    );

    assert.throws(() => loadConfig(root), new RegExp(`Environment variable not set: ${variable}`));
  } finally {
    if (previousValue === undefined) delete process.env[variable];
    else process.env[variable] = previousValue;
    rmSync(root, { recursive: true, force: true });
  }
});

test('remote query sends the project source filter and parses citations', async () => {
  let requestBody: unknown;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        answer: 'GpTriangleFan requires a valid parent container.',
        sources: [
          {
            sourceId: 'source-a',
            relativePath: 'ARINC 661/ARINC661P1-8.pdf',
            score: 0.91,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const response = await queryConfiguredRag(config(), 'What are the parameters?', fetchImpl);

  assert.deepEqual(requestBody, {
    question: 'What are the parameters?',
    sourceIds: ['source-a'],
  });
  assert.equal(response.sources[0]?.relativePath, 'ARINC 661/ARINC661P1-8.pdf');
});

// A source that indexes a vendor manual next to 10k source files answers register
// questions with code chunks unless the project excludes that content type.
test('remote query forwards the configured content-type exclusion', async () => {
  const bodies: unknown[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ answer: 'ok', sources: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await queryConfiguredRag(config({ excludeContentTypes: ['code'] }), 'Reset value?', fetchImpl);
  await queryConfiguredRag(config(), 'Reset value?', fetchImpl);

  assert.deepEqual(bodies[0], {
    question: 'Reset value?',
    sourceIds: ['source-a'],
    excludeContentTypes: ['code'],
  });
  // Projects that configured no exclusion must keep the previous request shape.
  assert.deepEqual(bodies[1], {
    question: 'Reset value?',
    sourceIds: ['source-a'],
  });
});

test('grounding context is bounded and only emitted for selected agents', () => {
  const projectConfig = config({ maxContextChars: 4 });
  const response = {
    question: 'question',
    answer: 'abcdefgh',
    sources: [{ sourceId: 'source-a', relativePath: 'standard.pdf', score: 0.75 }],
    retrievedAt: '2026-07-19T00:00:00.000Z',
  };

  const plannerContext = formatGroundingContext(projectConfig, response, 'planner');

  assert.match(plannerContext ?? '', /abcd/);
  assert.doesNotMatch(plannerContext ?? '', /abcdefgh/);
  assert.match(plannerContext ?? '', /untrusted reference context/);
  assert.match(plannerContext ?? '', /\[source-a\] standard\.pdf/);
  assert.equal(formatGroundingContext(projectConfig, response, 'coder'), undefined);
});
