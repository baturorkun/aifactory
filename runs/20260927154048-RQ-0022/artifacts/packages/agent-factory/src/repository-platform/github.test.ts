import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubRepositoryPlatform } from './github';
import type { GitHubPlatformSettings } from './types';

const settings: GitHubPlatformSettings = {
  baseUrl: 'https://api.github.com',
  repository: 'baturorkun/NetForgeSH',
  token: 'top-secret-github-token',
  targetBranch: 'main',
  removeSourceBranchOnMerge: true,
  labels: {
    draft: 'factory::draft',
    ready: 'factory::ready',
    running: 'factory::running',
    needsFix: 'factory::needs-fix',
    passed: 'factory::passed',
  },
  sourceLabels: { inProgress: 'factory::in-progress', resolved: 'factory::resolved' },
};

test('GitHub adapter creates typed Issues and Draft Pull Requests', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/issues')) {
      return Response.json({
        number: 42,
        title: 'RQ-0001 - Inventory',
        body: '<!-- aifactory:requirement:RQ-0001 -->',
        html_url: 'https://github.com/baturorkun/NetForgeSH/issues/42',
        state: 'open',
        labels: [{ name: 'factory::draft' }],
      });
    }
    if (url === 'https://api.github.com/repos/baturorkun/NetForgeSH') {
      if (init?.method === 'PATCH') {
        return Response.json({ delete_branch_on_merge: true });
      }
      return Response.json({ delete_branch_on_merge: false });
    }
    if (url.endsWith('/pulls')) {
      return Response.json({
        number: 101,
        title: 'RQ-0001 - Inventory',
        html_url: 'https://github.com/baturorkun/NetForgeSH/pull/101',
        state: 'open',
        head: { ref: 'factory/RQ-0001' },
        base: { ref: 'main' },
        draft: true,
      });
    }
    if (url.endsWith('/pulls/101')) {
      return Response.json({
        number: 101,
        title: 'RQ-0001 - Inventory',
        html_url: 'https://github.com/baturorkun/NetForgeSH/pull/101',
        state: 'closed',
        head: { ref: 'factory/RQ-0001' },
        base: { ref: 'main' },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const adapter = new GitHubRepositoryPlatform(settings, fetchMock);
  const issue = await adapter.createWorkItem({
    title: 'RQ-0001 - Inventory',
    description: '<!-- aifactory:requirement:RQ-0001 -->',
    labels: ['factory::draft'],
  });
  const pr = await adapter.createDraftChangeRequest({
    title: 'RQ-0001 - Inventory',
    description: 'Closes #42',
    sourceBranch: 'factory/RQ-0001',
    targetBranch: 'main',
  });
  const closedPr = await adapter.closeChangeRequest(pr);

  assert.equal(issue.iid, 42);
  assert.equal(pr.iid, 101);
  assert.equal(closedPr.state, 'closed');
  assert.equal(requests[0].url, 'https://api.github.com/repos/baturorkun/NetForgeSH/issues');
  const issueBody = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>;
  assert.equal(issueBody.title, 'RQ-0001 - Inventory');
  assert.equal(requests[1].url, 'https://api.github.com/repos/baturorkun/NetForgeSH');
  assert.equal(requests[1].init?.method ?? 'GET', 'GET');
  const repositoryPatch = JSON.parse(String(requests[2].init?.body)) as Record<string, unknown>;
  assert.equal(requests[2].init?.method, 'PATCH');
  assert.equal(repositoryPatch.delete_branch_on_merge, true);
  const prBody = JSON.parse(String(requests[3].init?.body)) as Record<string, unknown>;
  assert.equal(prBody.draft, true);
  assert.equal(prBody.head, 'factory/RQ-0001');
  assert.equal(prBody.base, 'main');
});

test('GitHub adapter sets lifecycle labels on work item', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/issues/42')) {
      return Response.json({
        number: 42,
        title: 'RQ-0001 - Inventory',
        body: '<!-- aifactory:requirement:RQ-0001 -->',
        html_url: 'https://github.com/baturorkun/NetForgeSH/issues/42',
        state: 'open',
        labels: [{ name: 'enhancement' }, { name: 'factory::running' }],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const adapter = new GitHubRepositoryPlatform(settings, fetchMock);
  const updated = await adapter.setWorkItemLifecycleLabel(
    {
      iid: 42,
      title: 'RQ-0001 - Inventory',
      description: '',
      url: 'https://github.com/baturorkun/NetForgeSH/issues/42',
      state: 'open',
      labels: ['enhancement', 'factory::draft'],
    },
    'factory::running',
  );

  assert.deepEqual(updated.labels, ['enhancement', 'factory::running']);
  const patchBody = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>;
  assert.deepEqual(patchBody.labels, ['enhancement', 'factory::running']);
});

test('GitHub adapter adds an idempotent lifecycle comment', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let comments: Array<{ body: string }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/issues/42/comments') && (init?.method ?? 'GET') === 'GET') {
      return Response.json(comments);
    }
    if (url.endsWith('/issues/42/comments') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { body: string };
      comments = [{ body: body.body }];
      return Response.json({ body: body.body });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const adapter = new GitHubRepositoryPlatform(settings, fetchMock);
  const issue: Parameters<GitHubRepositoryPlatform['addWorkItemComment']>[0] = {
    iid: 42,
    title: 'RQ-0001 - Inventory',
    description: '',
    url: 'https://github.com/baturorkun/NetForgeSH/issues/42',
    state: 'open',
    labels: ['factory::draft'],
  };
  const marker = '<!-- aifactory:requirement-link:RQ-0001 -->';

  await adapter.addWorkItemComment(issue, 'Linked.', marker);
  await adapter.addWorkItemComment(issue, 'Linked.', marker);

  assert.equal(requests.filter((request) => request.init?.method === 'POST').length, 1);
  assert.match(comments[0].body, /aifactory:requirement-link:RQ-0001/);
});

test('GitHub adapter redacts tokens from API errors', async () => {
  const fetchMock: typeof fetch = async () => new Response(
    `Authorization: Bearer ${settings.token}`,
    { status: 401, statusText: 'Unauthorized' },
  );
  const adapter = new GitHubRepositoryPlatform(settings, fetchMock);

  await assert.rejects(
    adapter.getWorkItem(42),
    (error: Error) => {
      assert.doesNotMatch(error.message, new RegExp(settings.token));
      assert.match(error.message, /\[REDACTED\]/);
      return true;
    },
  );
});

test('GitHub adapter inspects checks, marks a draft ready, and merges with a SHA guard', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let ready = false;
  let merged = false;
  const prJson = () => ({
    number: 101, node_id: 'PR_node', title: 'RQ-0001 - Inventory',
    html_url: 'https://github.com/baturorkun/NetForgeSH/pull/101',
    state: merged ? 'closed' : 'open', head: { ref: 'factory/RQ-0001', sha: 'abc123' },
    base: { ref: 'main' }, draft: !ready, merged, mergeable: true, mergeable_state: 'clean',
  });
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input); requests.push({ url, init });
    if (url.endsWith('/commits/abc123/status')) {
      return Response.json({ state: 'pending', total_count: 0 });
    }
    if (url.endsWith('/commits/abc123/check-runs')) {
      return Response.json({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] });
    }
    if (url === 'https://api.github.com/graphql') { ready = true; return Response.json({ data: {} }); }
    if (url.endsWith('/pulls/101/merge')) { merged = true; return Response.json({ merged: true, message: 'merged', sha: 'def456' }); }
    if (url.endsWith('/pulls/101')) return Response.json(prJson());
    throw new Error(`Unexpected request: ${url}`);
  };
  const adapter = new GitHubRepositoryPlatform(settings, fetchMock);
  const changeRequest = (await adapter.getChangeRequest(101))!;
  const readiness = await adapter.inspectChangeRequest(changeRequest);
  assert.equal(readiness.ciStatus, 'success');
  assert.equal(readiness.mergeStatus, 'mergeable');
  await adapter.markChangeRequestReady(changeRequest);
  const result = await adapter.mergeChangeRequest(changeRequest, 'abc123');
  assert.equal(result.state, 'closed');
  const mergeRequest = requests.find((request) => request.url.endsWith('/pulls/101/merge'))!;
  assert.deepEqual(JSON.parse(String(mergeRequest.init?.body)), { sha: 'abc123', merge_method: 'merge' });
});

// RQ-0021: a requirement opened from an existing Issue becomes its sub-issue
// (GitHub has no "related" link type), and the Pull Request closes it.

const SOURCE = {
  iid: 134,
  title: 'Guardrail bypass',
  description: 'Reported by a person.',
  url: 'https://github.com/baturorkun/NetForgeSH/issues/134',
  state: 'open',
  labels: ['bug'],
};
const REQUIREMENT_ISSUE = { ...SOURCE, iid: 165, title: 'RQ-0068 - Fix', description: '' };

test('GitHub links a requirement as a sub-issue of its source, once', async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  let children: Array<{ number: number }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ url, method, body: init?.body as string | undefined });
    if (url.endsWith('/issues/134/sub_issues?per_page=100')) return Response.json(children);
    if (url.endsWith('/issues/165')) return Response.json({ id: 99001, number: 165 });
    if (url.endsWith('/issues/134/sub_issues') && method === 'POST') {
      children = [{ number: 165 }];
      return Response.json({ number: 134 });
    }
    return new Response('unexpected', { status: 500 });
  };
  const github = new GitHubRepositoryPlatform(settings, fetchMock);

  await github.linkSourceWorkItem(SOURCE, REQUIREMENT_ISSUE);
  await github.linkSourceWorkItem(SOURCE, REQUIREMENT_ISSUE);

  const posts = requests.filter((request) => request.method === 'POST');
  assert.equal(posts.length, 1);
  // The endpoint takes the Issue's database id, not its number.
  assert.deepEqual(JSON.parse(posts[0].body ?? '{}'), { sub_issue_id: 99001 });
});

test('GitHub appends a closing reference to the Pull Request only once', async () => {
  let body = 'Implements **RQ-0068**.\n\nCloses #165';
  const patches: string[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/pulls/166') && (init?.method ?? 'GET') === 'GET') return Response.json({ body });
    if (url.endsWith('/pulls/166') && init?.method === 'PATCH') {
      body = (JSON.parse(String(init.body)) as { body: string }).body;
      patches.push(body);
      return Response.json({ body });
    }
    return new Response('unexpected', { status: 500 });
  };
  const github = new GitHubRepositoryPlatform(settings, fetchMock);
  const pr = { iid: 166, title: 'RQ-0068', url: '', state: 'open', sourceBranch: 'factory/RQ-0068', targetBranch: 'main' };

  await github.ensureChangeRequestLine(pr, 'Closes #134');
  await github.ensureChangeRequestLine(pr, 'Closes #134');

  assert.equal(patches.length, 1);
  assert.match(body, /Closes #165\nCloses #134\n$/);
});

test('GitHub relabels a source Issue without touching its other labels', async () => {
  const patches: unknown[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/issues/134') && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { labels: string[] };
      patches.push(body);
      return Response.json({
        number: 134, title: SOURCE.title, body: '', html_url: SOURCE.url, state: 'open',
        labels: body.labels.map((name) => ({ name })),
      });
    }
    return new Response('unexpected', { status: 500 });
  };
  const github = new GitHubRepositoryPlatform(settings, fetchMock);
  const source = { ...SOURCE, labels: ['bug', 'factory::in-progress'] };

  const relabelled = await github.relabelWorkItem(source, ['factory::resolved'], ['factory::in-progress']);
  // Already as asked: nothing is sent.
  await github.relabelWorkItem(relabelled, ['factory::resolved'], ['factory::in-progress']);

  assert.deepEqual(patches, [{ labels: ['bug', 'factory::resolved'] }]);
  assert.deepEqual(relabelled.labels, ['bug', 'factory::resolved']);
});
