// A factory requirement compared with the requirements of the project's RAG
// sources, a DOORS module for instance (RQ-0039).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Requirement } from '@aifactory/contracts';
import { FactoryConfigSchema } from '../config';
import { createHandoffPackage } from '../orchestrator/handoff';
import {
  buildComparisonQuestion,
  compareRequirement,
  comparisonSummary,
  formatGroundingReference,
  readComparison,
  shouldCompareRequirement,
  type RagGroundingResponse,
} from './grounding-client';

function config(grounding: Record<string, unknown> = {}, paths: Record<string, unknown> = {}) {
  return FactoryConfigSchema.parse({
    model: { provider: 'mock', name: 'mock' },
    ...paths,
    rag: {
      grounding: {
        enabled: true,
        chatUrl: 'http://rag.example/query',
        sourceIds: ['aselsan-bfi'],
        compare: { enabled: true },
        ...grounding,
      },
    },
  });
}

const REQUIREMENT = {
  id: 'RQ-0007',
  title: 'Power-up test budget',
  rawMarkdown: '# RQ-0007 - Power-up test budget\n\nThe power-up built-in test finishes within 500 ms (BFI-SRS-1296).',
} as Requirement;

const SRS = { sourceId: 'aselsan-bfi', relativePath: 'BFI/SRS.doors.jsonl', requirement: 'BFI-SRS-1296', score: 0.9 };
const OTHER = { sourceId: 'aselsan-bfi', relativePath: 'BFI/SRS.doors.jsonl', requirement: 'BFI-SRS-1300', score: 0.7 };
const PDF = { sourceId: 'aselsan-bfi', relativePath: 'plans/SDP.pdf', score: 0.6 };

function answering(answer: string, sources: unknown[], bodies: Record<string, unknown>[] = []): typeof fetch {
  return async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ answer, sources }), { status: 200 });
  };
}

test('the comparison is asked only by projects that enable it, and only when grounding runs', () => {
  assert.equal(shouldCompareRequirement(config(), '# Requirement'), true);
  assert.equal(shouldCompareRequirement(config({ compare: { enabled: false } }), '# Requirement'), false);
  assert.equal(shouldCompareRequirement(config({ compare: {} }), '# Requirement'), false, 'off unless asked for');
  assert.equal(shouldCompareRequirement(config({ enabled: false }), '# Requirement'), false);
  assert.equal(shouldCompareRequirement(config({ mode: 'explicit' }), '# Requirement'), false);
  assert.equal(shouldCompareRequirement(config({ mode: 'explicit' }), '# Requirement @rag'), true);
});

test('the question holds the requirement and asks for the two lines', () => {
  const question = buildComparisonQuestion(REQUIREMENT);

  assert.match(question, /^IMPLEMENTS: /m);
  assert.match(question, /^CONFLICTS: /m);
  assert.match(question, /Project requirement RQ-0007: Power-up test budget/);
  assert.match(question, /finishes within 500 ms \(BFI-SRS-1296\)/);
});

test('the request searches requirements only, in the grounding sources, without the project records', async () => {
  const bodies: Record<string, unknown>[] = [];
  await compareRequirement(config(), REQUIREMENT, answering('IMPLEMENTS: none\nCONFLICTS: none', [SRS], bodies));

  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].sourceIds, ['aselsan-bfi']);
  assert.deepEqual(bodies[0].excludeContentTypes, ['documentation', 'code']);
  assert.deepEqual(bodies[0].excludePaths, ['requirements/**', 'handoffs/**', 'runs/**']);
});

test('the content types left out can be set by the project', async () => {
  const bodies: Record<string, unknown>[] = [];
  const project = config({ compare: { enabled: true, excludeContentTypes: ['code'] }, excludeContentTypes: ['documentation'] });
  await compareRequirement(project, REQUIREMENT, answering('IMPLEMENTS: none\nCONFLICTS: none', [SRS], bodies));

  assert.deepEqual(bodies[0].excludeContentTypes, ['code'], "the comparison's own list, not the grounding's");
});

test('an identifier counts only when the RAG returned that requirement', () => {
  const read = readComparison('IMPLEMENTS: BFI-SRS-1296, BFI-SRS-9999\nCONFLICTS: none\n\nBFI-SRS-1296 sets the same budget.', [SRS, OTHER, PDF]);

  assert.deepEqual(read, { status: 'compared', implements: ['BFI-SRS-1296'], conflicts: [], unverified: ['BFI-SRS-9999'] });
});

test('the two lines are read whatever their dress and letter case', () => {
  const answer = [
    'Here is the comparison.',
    '',
    '**Implements:** `bfi-srs-1296`.',
    '- **CONFLICTS**: BFI-SRS-1300; bfi-srs-1296',
    '',
    'CONFLICTS: this later line is prose and is not read',
  ].join('\n');

  assert.deepEqual(readComparison(answer, [SRS, OTHER]), {
    status: 'compared', implements: ['BFI-SRS-1296'], conflicts: ['BFI-SRS-1300', 'BFI-SRS-1296'], unverified: [],
  });
});

test('an identifier keeps its own underscores (measured on the lab RAG: BFI_HLR_235 was read as BFIHLR235)', () => {
  const hlr = { sourceId: 'aselsan-bfi', relativePath: 'BFI/HLR.doors.jsonl', requirement: 'BFI_HLR_235' };

  assert.deepEqual(readComparison('IMPLEMENTS: BFI-SRS-1296, `BFI_HLR_235`, _BFI_HLR_235_\nCONFLICTS: none', [SRS, hlr]), {
    status: 'compared', implements: ['BFI-SRS-1296', 'BFI_HLR_235'], conflicts: [], unverified: [],
  });
});

test('none, in any form, names nothing', () => {
  for (const none of ['none', 'None.', 'n/a', '-', '']) {
    const read = readComparison(`IMPLEMENTS: ${none}\nCONFLICTS: ${none}`, [SRS]);
    assert.deepEqual([read.implements, read.conflicts, read.unverified], [[], [], []], `"${none}"`);
  }
});

test('an answer without the lines compares to nothing rather than failing', () => {
  assert.deepEqual(readComparison('The context is insufficient.', [SRS]), {
    status: 'compared', implements: [], conflicts: [], unverified: [],
  });
});

test("without a requirement among the sources nothing is named, whatever the answer says", () => {
  const read = readComparison('IMPLEMENTS: BFI-SRS-1296\nCONFLICTS: BFI-SRS-1300', [PDF]);

  assert.deepEqual(read, { status: 'no-requirements', implements: [], conflicts: [], unverified: [] });
  assert.match(comparisonSummary({ ...read, answer: '', sources: [PDF], retrievedAt: '' }), /hold no requirements/);
});

test('a RAG that does not answer leaves the comparison unavailable and throws nothing', async () => {
  const failing: typeof fetch = async () => new Response('upstream timeout', { status: 504 });
  const comparison = await compareRequirement(config({ failOpen: false }), REQUIREMENT, failing);

  assert.equal(comparison.status, 'unavailable');
  assert.match(comparison.error ?? '', /HTTP 504/);
  assert.match(comparisonSummary(comparison), /^comparison unavailable: .*504/);
});

test('the summary says what is implemented, what conflicts and what could not be verified', async () => {
  const comparison = await compareRequirement(
    config(), REQUIREMENT, answering('IMPLEMENTS: BFI-SRS-1296\nCONFLICTS: BFI-SRS-1300, BFI-SRS-77', [SRS, OTHER]),
  );

  assert.equal(comparisonSummary(comparison), 'implements BFI-SRS-1296; conflicts with BFI-SRS-1300; unverified BFI-SRS-77');
});

test('the comparison is shown under the grounding, and a grounding without one is as before', () => {
  const grounding: RagGroundingResponse = {
    question: 'q', answer: 'The SDP asks for a test budget.', sources: [PDF], retrievedAt: '2026-10-13T00:00:00.000Z',
  };
  const before = formatGroundingReference(config(), grounding);
  assert.doesNotMatch(before, /Comparison With/);

  const shown = formatGroundingReference(config(), {
    ...grounding,
    comparison: {
      status: 'compared', implements: ['BFI-SRS-1296'], conflicts: ['BFI-SRS-1300'], unverified: ['BFI-SRS-77'],
      answer: 'IMPLEMENTS: BFI-SRS-1296\nCONFLICTS: BFI-SRS-1300\n\nBFI-SRS-1300 allows 200 ms, the requirement 500 ms.',
      sources: [SRS, OTHER], retrievedAt: '2026-10-13T00:00:01.000Z',
    },
  });

  assert.ok(shown.startsWith(before), 'the grounding itself is unchanged');
  assert.match(shown, /### Comparison With The Sources' Requirements/);
  assert.match(shown, /- Implements: BFI-SRS-1296/);
  assert.match(shown, /- Conflicts with: BFI-SRS-1300/);
  assert.match(shown, /not among the returned requirements: BFI-SRS-77/);
  assert.match(shown, /BFI-SRS-1300 allows 200 ms/);
});

function project(compare: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-compare-'));
  const requirements = join(root, 'requirements');
  mkdirSync(requirements);
  writeFileSync(join(requirements, 'RQ-0007.md'), REQUIREMENT.rawMarkdown);
  const paths = { requirements, constraints: join(root, 'constraints'), handoffs: join(root, 'handoffs'), runs: join(root, 'runs') };
  return { root, paths, config: config({ compare: { enabled: compare } }, { paths, targetProject: { root } }) };
}

test('a handoff package of a project that compares holds the comparison with its grounding', async () => {
  const { root, paths, config: projectConfig } = project(true);
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const comparing = String(body.question).startsWith('Compare the project requirement');
    return new Response(JSON.stringify(comparing
      ? { answer: 'IMPLEMENTS: BFI-SRS-1296\nCONFLICTS: BFI-SRS-1300\n\nBFI-SRS-1300 allows 200 ms.', sources: [SRS, OTHER] }
      : { answer: 'The SDP asks for a test budget.', sources: [PDF] }), { status: 200 });
  };
  try {
    const runId = await createHandoffPackage('RQ-0007', projectConfig, fetchImpl);
    const context = JSON.parse(readFileSync(join(paths.runs, runId, 'rag-context.json'), 'utf8')) as RagGroundingResponse;
    const handoff = readFileSync(join(paths.handoffs, runId, 'handoff.md'), 'utf8');

    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].excludeContentTypes, undefined, 'the grounding question is what it was');
    assert.deepEqual(bodies[1].excludeContentTypes, ['documentation', 'code']);
    assert.equal(context.answer, 'The SDP asks for a test budget.');
    assert.deepEqual(context.comparison?.implements, ['BFI-SRS-1296']);
    assert.deepEqual(context.comparison?.conflicts, ['BFI-SRS-1300']);
    assert.match(handoff, /## RAG Grounding/);
    assert.match(handoff, /- Conflicts with: BFI-SRS-1300/);
    assert.equal(
      readFileSync(join(paths.handoffs, runId, 'rag-context.json'), 'utf8'),
      readFileSync(join(paths.runs, runId, 'rag-context.json'), 'utf8'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failing comparison keeps the grounding in the package and fails nothing, also when grounding may not fail open', async () => {
  const { root, paths } = project(true);
  const strict = config({ failOpen: false }, { paths, targetProject: { root } });
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ answer: 'The SDP asks for a test budget.', sources: [PDF] }), { status: 200 })
      : new Response('gateway timeout', { status: 504 });
  };
  try {
    const runId = await createHandoffPackage('RQ-0007', strict, fetchImpl);
    const context = JSON.parse(readFileSync(join(paths.runs, runId, 'rag-context.json'), 'utf8')) as RagGroundingResponse;
    const handoff = readFileSync(join(paths.handoffs, runId, 'handoff.md'), 'utf8');

    assert.equal(context.answer, 'The SDP asks for a test budget.');
    assert.equal(context.comparison?.status, 'unavailable');
    assert.match(handoff, /The comparison was requested but unavailable: .*504/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a project that does not compare sends one request and records no comparison', async () => {
  const { root, paths, config: projectConfig } = project(false);
  const bodies: Record<string, unknown>[] = [];
  try {
    const runId = await createHandoffPackage('RQ-0007', projectConfig, answering('The SDP asks for a test budget.', [PDF], bodies));
    const context = JSON.parse(readFileSync(join(paths.runs, runId, 'rag-context.json'), 'utf8')) as Record<string, unknown>;

    assert.equal(bodies.length, 1);
    assert.equal('comparison' in context, false);
    assert.doesNotMatch(readFileSync(join(paths.handoffs, runId, 'handoff.md'), 'utf8'), /Comparison With/);
    assert.ok(existsSync(join(paths.handoffs, runId, 'handoff.md')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
