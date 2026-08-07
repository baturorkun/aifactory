export type RepositoryProviderName = 'gitlab' | 'github';

export interface WorkItem {
  iid: number;
  title: string;
  description: string;
  url: string;
  state: string;
  labels: string[];
}

export interface ChangeRequest {
  iid: number;
  title: string;
  url: string;
  state: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface RequirementPlatformContext {
  requirementId: string;
  title: string;
  branch: string;
  targetBranch: string;
  executionMode: 'handoff' | 'pipeline';
  requirementFile: string;
}

export interface RepositoryPlatformAdapter {
  readonly provider: RepositoryProviderName;
  readonly targetBranch: string;
  readonly lifecycleLabels: readonly string[];

  getWorkItem(iid: number): Promise<WorkItem | undefined>;
  findWorkItem(ownershipMarker: string): Promise<WorkItem | undefined>;
  createWorkItem(input: {
    title: string;
    description: string;
    labels: string[];
  }): Promise<WorkItem>;
  setWorkItemLifecycleLabel(workItem: WorkItem, label: string): Promise<WorkItem>;
  addWorkItemComment(workItem: WorkItem, body: string, marker: string): Promise<void>;

  getChangeRequest(iid: number): Promise<ChangeRequest | undefined>;
  findChangeRequest(sourceBranch: string, targetBranch: string): Promise<ChangeRequest | undefined>;
  createDraftChangeRequest(input: {
    title: string;
    description: string;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<ChangeRequest>;
  closeChangeRequest(changeRequest: ChangeRequest): Promise<ChangeRequest>;
}

export interface GitLabPlatformSettings {
  baseUrl: string;
  projectId: string;
  token: string;
  targetBranch: string;
  removeSourceBranchOnMerge: boolean;
  gitIdentity?: {
    name?: string;
    email?: string;
  };
  labels: {
    draft: string;
    ready: string;
    running: string;
    needsFix: string;
    passed: string;
  };
}

export interface GitHubPlatformSettings {
  baseUrl: string;
  repository: string;
  token: string;
  targetBranch: string;
  gitIdentity?: {
    name?: string;
    email?: string;
  };
  labels: {
    draft: string;
    ready: string;
    running: string;
    needsFix: string;
    passed: string;
  };
}

export type ResolvedRepositoryPlatform =
  | { provider: 'none' }
  | { provider: 'gitlab'; settings: GitLabPlatformSettings }
  | { provider: 'github'; settings: GitHubPlatformSettings };
