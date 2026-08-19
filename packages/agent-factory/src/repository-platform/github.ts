import type {
  ChangeRequest,
  ChangeRequestReadiness,
  GitHubPlatformSettings,
  RepositoryPlatformAdapter,
  WorkItem,
} from './types';

type FetchLike = typeof fetch;

interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  state: string;
  labels?: Array<{ name: string } | string>;
  pull_request?: Record<string, unknown>;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  html_url: string;
  state: string;
  node_id: string;
  head: { ref: string; sha: string };
  base: { ref: string };
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
}

interface GitHubCombinedStatus { state: string; total_count?: number }
interface GitHubCheckRuns {
  total_count: number;
  check_runs: Array<{ status: string; conclusion?: string | null }>;
}
interface GitHubMergeResult { merged: boolean; message: string; sha?: string }

interface GitHubComment {
  body?: string;
}

interface GitHubRepository {
  delete_branch_on_merge?: boolean;
}

function normalizeLabels(labels?: Array<{ name: string } | string>): string[] {
  if (!labels) return [];
  return labels.map((l) => (typeof l === 'string' ? l : l.name));
}

function asWorkItem(issue: GitHubIssue): WorkItem {
  return {
    iid: issue.number,
    title: issue.title,
    description: issue.body ?? '',
    url: issue.html_url,
    state: issue.state,
    labels: normalizeLabels(issue.labels),
  };
}

function asChangeRequest(pr: GitHubPullRequest): ChangeRequest {
  return {
    iid: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.state,
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
  };
}

export class GitHubRepositoryPlatform implements RepositoryPlatformAdapter {
  readonly provider = 'github' as const;
  readonly targetBranch: string;
  readonly lifecycleLabels: readonly string[];
  private readonly apiRoot: string;
  private readonly graphqlRoot: string;

  constructor(
    private readonly settings: GitHubPlatformSettings,
    private readonly fetchFn: FetchLike = fetch,
  ) {
    this.targetBranch = settings.targetBranch;
    this.lifecycleLabels = Object.values(settings.labels);
    const baseUrl = settings.baseUrl.replace(/\/+$/, '');
    this.apiRoot = `${baseUrl}/repos/${settings.repository}`;
    this.graphqlRoot = baseUrl.endsWith('/api/v3')
      ? `${baseUrl.slice(0, -'/api/v3'.length)}/api/graphql`
      : `${baseUrl}/graphql`;
  }

  async getWorkItem(iid: number): Promise<WorkItem | undefined> {
    const issue = await this.request<GitHubIssue | undefined>(`/issues/${iid}`, { allowNotFound: true });
    return issue ? asWorkItem(issue) : undefined;
  }

  async findWorkItem(ownershipMarker: string): Promise<WorkItem | undefined> {
    const searchTerm = ownershipMarker.match(/RQ-\d+/i)?.[0] ?? ownershipMarker;
    const issues = await this.request<GitHubIssue[]>(
      `/issues?state=all&per_page=100`,
    );
    const match = issues.find(
      (issue) => !issue.pull_request && (issue.body?.includes(ownershipMarker) || issue.title?.includes(searchTerm)),
    );
    return match ? asWorkItem(match) : undefined;
  }

  async createWorkItem(input: {
    title: string;
    description: string;
    labels: string[];
  }): Promise<WorkItem> {
    const issue = await this.request<GitHubIssue>('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        body: input.description,
        labels: input.labels,
      }),
    });
    return asWorkItem(issue);
  }

  async setWorkItemLifecycleLabel(workItem: WorkItem, label: string): Promise<WorkItem> {
    const nextLabels = [
      ...workItem.labels.filter((item) => !this.lifecycleLabels.includes(item)),
      label,
    ];

    const updated = await this.request<GitHubIssue>(`/issues/${workItem.iid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        labels: nextLabels,
      }),
    });
    return asWorkItem(updated);
  }

  async closeWorkItem(workItem: WorkItem): Promise<WorkItem> {
    if (workItem.state === 'closed') return workItem;
    return asWorkItem(await this.request<GitHubIssue>(`/issues/${workItem.iid}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    }));
  }

  async addWorkItemComment(workItem: WorkItem, body: string, marker: string): Promise<void> {
    const comments = await this.request<GitHubComment[]>(`/issues/${workItem.iid}/comments`);
    const existing = comments.find((c) => c.body?.includes(marker));
    if (existing) {
      return;
    }
    await this.request(`/issues/${workItem.iid}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `${body}\n\n${marker}` }),
    });
  }

  async getChangeRequest(iid: number): Promise<ChangeRequest | undefined> {
    const pr = await this.request<GitHubPullRequest | undefined>(`/pulls/${iid}`, { allowNotFound: true });
    return pr ? asChangeRequest(pr) : undefined;
  }

  async findChangeRequest(sourceBranch: string, targetBranch: string): Promise<ChangeRequest | undefined> {
    const prs = await this.request<GitHubPullRequest[]>(
      `/pulls?state=all&head=${encodeURIComponent(this.settings.repository.split('/')[0] + ':' + sourceBranch)}&base=${encodeURIComponent(targetBranch)}`,
    );
    const match = prs.find((pr) => pr.head.ref === sourceBranch && pr.base.ref === targetBranch);
    return match ? asChangeRequest(match) : undefined;
  }

  async createDraftChangeRequest(input: {
    title: string;
    description: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ChangeRequest> {
    if (this.settings.removeSourceBranchOnMerge) {
      await this.ensureSourceBranchRemoval();
    }
    const pr = await this.request<GitHubPullRequest>('/pulls', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        body: input.description,
        head: input.sourceBranch,
        base: input.targetBranch,
        draft: true,
      }),
    });
    return asChangeRequest(pr);
  }

  private async ensureSourceBranchRemoval(): Promise<void> {
    const repository = await this.request<GitHubRepository>('');
    if (repository.delete_branch_on_merge) return;
    await this.request<GitHubRepository>('', {
      method: 'PATCH',
      body: JSON.stringify({ delete_branch_on_merge: true }),
    });
  }

  async closeChangeRequest(changeRequest: ChangeRequest): Promise<ChangeRequest> {
    if (changeRequest.state !== 'open') return changeRequest;
    const updated = await this.request<GitHubPullRequest>(`/pulls/${changeRequest.iid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'closed',
      }),
    });
    return asChangeRequest(updated);
  }

  async inspectChangeRequest(changeRequest: ChangeRequest): Promise<ChangeRequestReadiness> {
    const pr = await this.request<GitHubPullRequest>(`/pulls/${changeRequest.iid}`);
    if (pr.merged) {
      return {
        changeRequest: asChangeRequest(pr), headSha: pr.head.sha, draft: false,
        mergeStatus: 'merged', ciStatus: 'success', approvalsSatisfied: true,
      };
    }
    const [status, checks] = await Promise.all([
      this.request<GitHubCombinedStatus>(`/commits/${pr.head.sha}/status`),
      this.request<GitHubCheckRuns>(`/commits/${pr.head.sha}/check-runs`),
    ]);
    const failedCheck = checks.check_runs.some((check) =>
      check.status === 'completed' && !['success', 'neutral', 'skipped'].includes(check.conclusion ?? ''));
    const pendingCheck = checks.check_runs.some((check) => check.status !== 'completed');
    const ciStatus = status.state === 'failure' || status.state === 'error' || failedCheck
      ? 'failed'
      : (status.state === 'pending' && (status.total_count ?? 0) > 0) || pendingCheck
        ? 'pending'
        : status.state === 'success' || checks.total_count > 0 ? 'success' : 'unknown';
    const mergeState = pr.mergeable_state ?? 'unknown';
    const mergeStatus = pr.mergeable === false || mergeState === 'dirty'
      ? 'conflicted'
      : pr.mergeable === null || ['unknown', 'unstable'].includes(mergeState)
        ? 'checking'
        : mergeState === 'clean' ? 'mergeable' : 'blocked';
    return {
      changeRequest: asChangeRequest(pr), headSha: pr.head.sha,
      draft: pr.draft ?? false, mergeStatus, ciStatus,
      approvalsSatisfied: mergeState !== 'blocked',
    };
  }

  async markChangeRequestReady(changeRequest: ChangeRequest): Promise<ChangeRequest> {
    const pr = await this.request<GitHubPullRequest>(`/pulls/${changeRequest.iid}`);
    if (!pr.draft) return asChangeRequest(pr);
    await this.graphql(
      'mutation($pullRequestId: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $pullRequestId}) { pullRequest { id } } }',
      { pullRequestId: pr.node_id },
    );
    return asChangeRequest(await this.request<GitHubPullRequest>(`/pulls/${changeRequest.iid}`));
  }

  async mergeChangeRequest(changeRequest: ChangeRequest, expectedHeadSha: string): Promise<ChangeRequest> {
    const result = await this.request<GitHubMergeResult>(`/pulls/${changeRequest.iid}/merge`, {
      method: 'PUT',
      body: JSON.stringify({ sha: expectedHeadSha, merge_method: 'merge' }),
    });
    if (!result.merged) throw new Error(`GitHub pull request #${changeRequest.iid} was not merged: ${result.message}`);
    return asChangeRequest(await this.request<GitHubPullRequest>(`/pulls/${changeRequest.iid}`));
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<void> {
    const response = await this.fetchFn(this.graphqlRoot, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.settings.token}`,
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ query, variables }),
    });
    const result = await response.json() as { errors?: Array<{ message: string }> };
    if (!response.ok || result.errors?.length) {
      throw new Error(`GitHub GraphQL request failed: ${result.errors?.map((error) => error.message).join('; ') || response.statusText}`);
    }
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: string;
      allowNotFound?: boolean;
    } = {},
  ): Promise<T> {
    try {
      const url = `${this.apiRoot}${path}`;
      const response = await this.fetchFn(url, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.settings.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: options.body,
      });

      if (options.allowNotFound && response.status === 404) {
        return undefined as T;
      }

      if (!response.ok) {
        const responseText = (await response.text()).slice(0, 500);
        throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${responseText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        message
          .replaceAll(this.settings.token, '[REDACTED]')
          .replace(/Authorization\s*[:=]\s*Bearer\s+[^\s,;]+/gi, 'Authorization: Bearer [REDACTED]'),
      );
    }
  }
}
