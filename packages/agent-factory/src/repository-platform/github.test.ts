import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubRepositoryPlatform } from './github';
import type { GitHubPlatformSettings } from './types';

const settings: GitHubPlatformSettings = {
  baseUrl: 'https://api.github.com',
  repository: 'baturorkun/NetForgeSH',
  token: 'top-secret-github-token',
  targetBranch: 'main',
  labels: {
    draft: 'factory::draft',
    ready: 'factory::ready',
    running: 'factory::running',
    needsFix: 'factory::needs-fix',
    passed: 'factory::passed',
  },
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
  const prBody = JSON.parse(String(requests[1].init?.body)) as Record<string, unknown>;
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
