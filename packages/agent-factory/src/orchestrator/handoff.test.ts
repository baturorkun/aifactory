import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FactoryConfigSchema } from '../config';
import { createHandoffPackage } from './handoff';

test('handoff queries configured RAG and embeds answer with sources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-handoff-'));
  const requirements = join(root, 'requirements');
  const handoffs = join(root, 'handoffs');
  mkdirSync(requirements);
  writeFileSync(
    join(requirements, 'RQ-0001.md'),
    '# ARINC Layer\n\nImplement the Layer parent-child rules.',
  );
  const config = FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    paths: {
      requirements,
      constraints: join(root, 'constraints'),
      handoffs,
    },
    targetProject: { root },
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

    assert.deepEqual(requestBody?.sourceIds, ['arinc']);
    assert.match(handoff, /## RAG Grounding/);
    assert.match(handoff, /A Layer can parent supported Container widgets/);
    assert.match(handoff, /ARINC661P1-8\.pdf/);
    assert.equal(ragContext.answer, 'A Layer can parent supported Container widgets.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
