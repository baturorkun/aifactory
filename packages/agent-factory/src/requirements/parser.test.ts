import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseRequirementMarkdown,
  updateRequirementMetadata,
} from './parser';
import { assertRequirementExecution } from '../requirement-lifecycle';

test('legacy requirements remain supported without lifecycle metadata', () => {
  const requirement = parseRequirementMarkdown(
    'RQ-0001',
    '# RQ-0001 - Legacy\n\nLegacy description.\n\n## Acceptance Criteria\n\n- It works.\n',
  );
  assert.equal(requirement.title, 'RQ-0001 - Legacy');
  assert.equal(requirement.lifecycle, undefined);
  assert.deepEqual(requirement.acceptanceCriteria, ['It works.']);
});

test('lifecycle frontmatter is parsed and can be updated without changing the body', () => {
  const markdown = [
    '---',
    'id: RQ-0017',
    'status: draft',
    'executionMode: handoff',
    'createdByName: "Batur"',
    'createdByEmail: "batur@example.com"',
    'createdAt: "2026-07-28T10:00:00.000Z"',
    'branch: "factory/RQ-0017"',
    'createdFromCommit: "abc123"',
    'repositoryProvider: gitlab',
    'gitlabIssueIid: 42',
    'gitlabIssueUrl: "https://gitlab.example.test/group/project/-/issues/42"',
    '---',
    '# RQ-0017 - Lifecycle',
    '',
    'Description.',
    '',
    '## Acceptance Criteria',
    '',
    '- It works.',
    '',
  ].join('\n');
  const updated = updateRequirementMetadata(markdown, {
    status: 'ready',
    executionMode: 'pipeline',
  });
  const requirement = parseRequirementMarkdown('RQ-0017', updated);
  assert.equal(requirement.lifecycle?.status, 'ready');
  assert.equal(requirement.lifecycle?.executionMode, 'pipeline');
  assert.equal(requirement.lifecycle?.pipelineFast, false);
  assert.equal(requirement.lifecycle?.createdByName, 'Batur');
  assert.equal(requirement.lifecycle?.repositoryProvider, 'gitlab');
  assert.equal(requirement.lifecycle?.gitlabIssueIid, 42);
  assert.equal(
    requirement.lifecycle?.gitlabIssueUrl,
    'https://gitlab.example.test/group/project/-/issues/42',
  );
  assert.match(updated, /# RQ-0017 - Lifecycle/);

  const fast = updateRequirementMetadata(updated, { pipelineFast: true });
  const fastRequirement = parseRequirementMarkdown('RQ-0017', fast);
  assert.equal(fastRequirement.lifecycle?.pipelineFast, true);
  assert.match(fast, /executionMode: pipeline\npipelineFast: true/);

  const completed = updateRequirementMetadata(fast, {
    status: 'completed',
    completedAt: '2026-08-19T12:00:00.000Z',
    completedBy: 'Reviewer',
    completedRunId: 'run-0017',
  });
  const completedRequirement = parseRequirementMarkdown('RQ-0017', completed);
  assert.equal(completedRequirement.lifecycle?.completedAt, '2026-08-19T12:00:00.000Z');
  assert.equal(completedRequirement.lifecycle?.completedBy, 'Reviewer');
  assert.equal(completedRequirement.lifecycle?.completedRunId, 'run-0017');
});

test('draft and execution-mode mismatches are rejected', () => {
  const draft = parseRequirementMarkdown(
    'RQ-0017',
    [
      '---',
      'id: RQ-0017',
      'status: draft',
      'executionMode: handoff',
      'createdByName: "Batur"',
      'createdByEmail: "batur@example.com"',
      'createdAt: "2026-07-28T10:00:00.000Z"',
      'branch: "factory/RQ-0017"',
      'createdFromCommit: "abc123"',
      '---',
      '# RQ-0017 - Lifecycle',
      '',
    ].join('\n'),
  );
  assert.throws(() => assertRequirementExecution(draft, 'handoff'), /is draft/);

  const ready = {
    ...draft,
    lifecycle: { ...draft.lifecycle!, status: 'ready' as const },
  };
  assert.throws(() => assertRequirementExecution(ready, 'pipeline'), /uses handoff mode/);
  assert.doesNotThrow(() => assertRequirementExecution(ready, 'handoff'));
});
