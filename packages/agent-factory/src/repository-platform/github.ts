import type {
  ChangeRequest,
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
  head: { ref: string };
  base: { ref: string };
  draft?: boolean;
}

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

  constructor(
    private readonly settings: GitHubPlatformSettings,
    private readonly fetchFn: FetchLike = fetch,
  ) {
    this.targetBranch = settings.targetBranch;
    this.lifecycleLabels = Object.values(settings.labels);
    const baseUrl = settings.baseUrl.replace(/\/+$/, '');
    this.apiRoot = `${baseUrl}/repos/${settings.repository}`;
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
    const updated = await this.request<GitHubPullRequest>(`/pulls/${changeRequest.iid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'closed',
      }),
    });
    return asChangeRequest(updated);
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
