import assert from 'node:assert/strict';
import test from 'node:test';
import { GitLabRepositoryPlatform } from './gitlab';
import type { GitLabPlatformSettings } from './types';

const settings: GitLabPlatformSettings = {
  baseUrl: 'https://gitlab.example.test',
  projectId: 'group/project',
  token: 'top-secret-token',
  targetBranch: 'main',
  removeSourceBranchOnMerge: true,
  gitIdentity: { name: 'Developer Name', email: 'developer@example.com' },
  labels: {
    draft: 'factory::draft',
    ready: 'factory::ready',
    running: 'factory::running',
    needsFix: 'factory::needs-fix',
    passed: 'factory::passed',
  },
};

test('GitLab adapter creates typed Issues and Draft Merge Requests', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/users?search=Developer%20Name&active=true&per_page=100')) {
      return Response.json([{
        id: 123,
        username: 'developer',
        name: 'Developer Name',
        bot: false,
      }]);
    }
    if (url.endsWith('/issues')) {
      return Response.json({
        iid: 7,
        title: 'RQ-0007 - Platform',
        description: '<!-- aifactory:requirement:RQ-0007 -->',
        web_url: 'https://gitlab.example.test/group/project/-/issues/7',
        state: 'opened',
        labels: ['factory::draft'],
      });
    }
    if (url.endsWith('/merge_requests')) {
      return Response.json({
        iid: 9,
        title: 'Draft: RQ-0007 - Platform',
        web_url: 'https://gitlab.example.test/group/project/-/merge_requests/9',
        state: 'opened',
        source_branch: 'factory/RQ-0007',
        target_branch: 'main',
      });
    }
    if (url.endsWith('/merge_requests/9')) {
      return Response.json({
        iid: 9,
        title: 'Draft: RQ-0007 - Platform',
        web_url: 'https://gitlab.example.test/group/project/-/merge_requests/9',
        state: 'closed',
        source_branch: 'factory/RQ-0007',
        target_branch: 'main',
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = new GitLabRepositoryPlatform(settings, fetchMock);
  const issue = await adapter.createWorkItem({
    title: 'RQ-0007 - Platform',
    description: '<!-- aifactory:requirement:RQ-0007 -->',
    labels: ['factory::draft'],
  });
  const mr = await adapter.createDraftChangeRequest({
    title: 'RQ-0007 - Platform',
    description: 'Closes #7',
    sourceBranch: 'factory/RQ-0007',
    targetBranch: 'main',
  });
  const closedMr = await adapter.closeChangeRequest(mr);
  assert.equal(issue.iid, 7);
  assert.equal(mr.iid, 9);
  assert.equal(closedMr.state, 'closed');
  assert.match(requests[1].url, /projects\/group%2Fproject\/issues$/);
  const issueBody = JSON.parse(String(requests[1].init?.body)) as Record<string, unknown>;
  assert.equal(issueBody.assignee_id, 123);
  const mrBody = JSON.parse(String(requests[2].init?.body)) as Record<string, unknown>;
  assert.equal(mrBody.title, 'Draft: RQ-0007 - Platform');
  assert.equal(mrBody.remove_source_branch, true);
  const closeBody = JSON.parse(String(requests[3].init?.body)) as Record<string, unknown>;
  assert.equal(closeBody.state_event, 'close');
  assert.equal(requests.some((request) => request.url.endsWith('/merge')), false);
});

test('GitLab adapter omits assignment when Git identity has no unique match', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes('/users?search=')) {
      return Response.json([]);
    }
    if (url.endsWith('/issues')) {
      return Response.json({
        iid: 8,
        title: 'RQ-0008 - Assignment fallback',
        description: '<!-- aifactory:requirement:RQ-0008 -->',
        web_url: 'https://gitlab.example.test/group/project/-/issues/8',
        state: 'opened',
        labels: ['factory::draft'],
      });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  };
  const adapter = new GitLabRepositoryPlatform(settings, fetchMock);
  await adapter.createWorkItem({
    title: 'RQ-0008 - Assignment fallback',
    description: '<!-- aifactory:requirement:RQ-0008 -->',
    labels: ['factory::draft'],
  });
  const issueBody = JSON.parse(String(requests[1].init?.body)) as Record<string, unknown>;
  assert.equal('assignee_id' in issueBody, false);
});

test('GitLab adapter redacts tokens from API errors', async () => {
  const fetchMock: typeof fetch = async () => new Response(
    `PRIVATE-TOKEN: ${settings.token}`,
    { status: 500, statusText: 'Failure' },
  );
  const adapter = new GitLabRepositoryPlatform(settings, fetchMock);
  await assert.rejects(
    adapter.getWorkItem(1),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.doesNotMatch(message, /top-secret-token/);
      assert.match(message, /\[REDACTED\]/);
      return true;
    },
  );
});

test('GitLab adapter inspects readiness and merges with the expected SHA', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let ready = false;
  let merged = false;
  const mrJson = () => ({
    iid: 9, title: ready ? 'RQ-0007 - Platform' : 'Draft: RQ-0007 - Platform',
    web_url: 'https://gitlab.example.test/group/project/-/merge_requests/9',
    state: merged ? 'merged' : 'opened', source_branch: 'factory/RQ-0007', target_branch: 'main',
    draft: !ready, sha: 'abc123', detailed_merge_status: 'mergeable',
    head_pipeline: { status: 'success' }, merged_at: merged ? '2026-08-19T12:00:00Z' : null,
  });
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input); requests.push({ url, init });
    if (url.endsWith('/approvals')) return Response.json({ approved: true, approvals_left: 0 });
    if (url.endsWith('/merge_requests/9/merge')) { merged = true; return Response.json(mrJson()); }
    if (url.endsWith('/merge_requests/9') && init?.method === 'PUT') { ready = true; return Response.json(mrJson()); }
    if (url.endsWith('/merge_requests/9')) return Response.json(mrJson());
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = new GitLabRepositoryPlatform(settings, fetchMock);
  const changeRequest = (await adapter.getChangeRequest(9))!;
  const readiness = await adapter.inspectChangeRequest(changeRequest);
  assert.equal(readiness.ciStatus, 'success');
  assert.equal(readiness.approvalsSatisfied, true);
  assert.equal(readiness.draft, true);
  await adapter.markChangeRequestReady(changeRequest);
  const result = await adapter.mergeChangeRequest(changeRequest, 'abc123');
  assert.equal(result.state, 'merged');
  const mergeRequest = requests.find((request) => request.url.endsWith('/merge_requests/9/merge'))!;
  assert.deepEqual(JSON.parse(String(mergeRequest.init?.body)), {
    sha: 'abc123', should_remove_source_branch: true,
  });
});
