import type {
  ChangeRequest,
  GitLabPlatformSettings,
  RepositoryPlatformAdapter,
  WorkItem,
} from './types';

type FetchLike = typeof fetch;

interface GitLabIssue {
  iid: number;
  title: string;
  description?: string | null;
  web_url: string;
  state: string;
  labels?: string[];
}

interface GitLabMergeRequest {
  iid: number;
  title: string;
  web_url: string;
  state: string;
  source_branch: string;
  target_branch: string;
}

interface GitLabNote {
  body?: string;
}

interface GitLabUser {
  id: number;
  username: string;
  name?: string;
  email?: string;
  public_email?: string | null;
  bot?: boolean;
}

function asWorkItem(issue: GitLabIssue): WorkItem {
  return {
    iid: issue.iid,
    title: issue.title,
    description: issue.description ?? '',
    url: issue.web_url,
    state: issue.state,
    labels: issue.labels ?? [],
  };
}

function asChangeRequest(mr: GitLabMergeRequest): ChangeRequest {
  return {
    iid: mr.iid,
    title: mr.title,
    url: mr.web_url,
    state: mr.state,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
  };
}

export class GitLabRepositoryPlatform implements RepositoryPlatformAdapter {
  readonly provider = 'gitlab' as const;
  readonly targetBranch: string;
  readonly lifecycleLabels: readonly string[];
  private readonly apiBase: string;
  private readonly apiRoot: string;
  private assigneeUserIdPromise?: Promise<number | undefined>;

  constructor(
    private readonly settings: GitLabPlatformSettings,
    private readonly fetchFn: FetchLike = fetch,
  ) {
    this.targetBranch = settings.targetBranch;
    this.lifecycleLabels = Object.values(settings.labels);
    this.apiBase = `${settings.baseUrl}/api/v4`;
    this.apiRoot = `${this.apiBase}/projects/${encodeURIComponent(settings.projectId)}`;
  }

  async getWorkItem(iid: number): Promise<WorkItem | undefined> {
    const issue = await this.request<GitLabIssue | undefined>(`/issues/${iid}`, { allowNotFound: true });
    return issue ? asWorkItem(issue) : undefined;
  }

  async findWorkItem(ownershipMarker: string): Promise<WorkItem | undefined> {
    const searchTerm = ownershipMarker.match(/RQ-\d+/i)?.[0] ?? ownershipMarker;
    const issues = await this.request<GitLabIssue[]>(
      `/issues?state=all&search=${encodeURIComponent(searchTerm)}&in=description&per_page=100`,
    );
    const match = issues.find((issue) => issue.description?.includes(ownershipMarker));
    return match ? asWorkItem(match) : undefined;
  }

  async createWorkItem(input: {
    title: string;
    description: string;
    labels: string[];
  }): Promise<WorkItem> {
    const assigneeId = await this.assigneeUserId();
    return asWorkItem(await this.request<GitLabIssue>('/issues', {
      method: 'POST',
      body: {
        title: input.title,
        description: input.description,
        labels: input.labels.join(','),
        ...(assigneeId === undefined ? {} : { assignee_id: assigneeId }),
      },
    }));
  }

  private async assigneeUserId(): Promise<number | undefined> {
    this.assigneeUserIdPromise ??= this.resolveAssigneeUserId();
    return this.assigneeUserIdPromise;
  }

  private async resolveAssigneeUserId(): Promise<number | undefined> {
    const identity = this.settings.gitIdentity;
    const search = identity?.name?.trim() || identity?.email?.trim();
    if (!search) return undefined;

    const users = await this.request<GitLabUser[]>(
      `/users?search=${encodeURIComponent(search)}&active=true&per_page=100`,
      { global: true },
    );
    const expectedName = identity?.name?.trim().toLowerCase();
    const expectedEmail = identity?.email?.trim().toLowerCase();
    const matches = users.filter((user) => {
      if (user.bot) return false;
      const names = [user.name, user.username].filter(Boolean).map((value) => value!.toLowerCase());
      const emails = [user.email, user.public_email].filter(Boolean).map((value) => value!.toLowerCase());
      return Boolean(
        (expectedName && names.includes(expectedName)) ||
        (expectedEmail && emails.includes(expectedEmail)),
      );
    });
    return matches.length === 1 ? matches[0].id : undefined;
  }

  async setWorkItemLifecycleLabel(workItem: WorkItem, label: string): Promise<WorkItem> {
    const unrelated = workItem.labels.filter((entry) => !this.lifecycleLabels.includes(entry));
    const labels = [...unrelated, label];
    return asWorkItem(await this.request<GitLabIssue>(`/issues/${workItem.iid}`, {
      method: 'PUT',
      body: { labels: labels.join(',') },
    }));
  }

  async addWorkItemComment(workItem: WorkItem, body: string, marker: string): Promise<void> {
    const notes = await this.request<GitLabNote[]>(`/issues/${workItem.iid}/notes?per_page=100`);
    if (notes.some((note) => note.body?.includes(marker))) return;
    await this.request<GitLabNote>(`/issues/${workItem.iid}/notes`, {
      method: 'POST',
      body: { body: `${body}\n\n${marker}` },
    });
  }

  async getChangeRequest(iid: number): Promise<ChangeRequest | undefined> {
    const mr = await this.request<GitLabMergeRequest | undefined>(`/merge_requests/${iid}`, { allowNotFound: true });
    return mr ? asChangeRequest(mr) : undefined;
  }

  async findChangeRequest(sourceBranch: string, targetBranch: string): Promise<ChangeRequest | undefined> {
    const mrs = await this.request<GitLabMergeRequest[]>(
      `/merge_requests?state=all&source_branch=${encodeURIComponent(sourceBranch)}&target_branch=${encodeURIComponent(targetBranch)}&per_page=100`,
    );
    const match = mrs.find(
      (mr) => mr.source_branch === sourceBranch && mr.target_branch === targetBranch,
    );
    return match ? asChangeRequest(match) : undefined;
  }

  async createDraftChangeRequest(input: {
    title: string;
    description: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ChangeRequest> {
    return asChangeRequest(await this.request<GitLabMergeRequest>('/merge_requests', {
      method: 'POST',
      body: {
        title: input.title.startsWith('Draft:') ? input.title : `Draft: ${input.title}`,
        description: input.description,
        source_branch: input.sourceBranch,
        target_branch: input.targetBranch,
        remove_source_branch: this.settings.removeSourceBranchOnMerge,
      },
    }));
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT';
      body?: Record<string, unknown>;
      allowNotFound?: boolean;
      global?: boolean;
    } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetchFn(`${options.global ? this.apiBase : this.apiRoot}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          'PRIVATE-TOKEN': this.settings.token,
          'Content-Type': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      if (response.status === 404 && options.allowNotFound) return undefined as T;
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`GitLab API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
      }
      return await response.json() as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const safe = message
        .replaceAll(this.settings.token, '[REDACTED]')
        .replace(/PRIVATE-TOKEN\s*[:=]\s*[^\s,;]+/gi, 'PRIVATE-TOKEN: [REDACTED]');
      throw new Error(safe);
    } finally {
      clearTimeout(timeout);
    }
  }
}
