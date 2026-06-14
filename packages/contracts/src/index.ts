import { z } from 'zod';

// ============================================================
// AGENT ROLES
// ============================================================

export const AgentRoleSchema = z.enum([
  'planner',
  'architect',
  'coder',
  'tester',
  'reviewer',
  'domain-guard',
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

// ============================================================
// TASK
// ============================================================

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1),
  targetFiles: z.array(z.string()).optional(),
  constraints: z.record(z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// ============================================================
// PLANNER OUTPUT
// ============================================================

export const PlanOutputSchema = z.object({
  requirementId: z.string(),
  summary: z.string().min(1),
  tasks: z.array(TaskSchema).min(1),
  assumptions: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

// ============================================================
// ARCHITECT OUTPUT
// ============================================================

export const ComponentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['file', 'module', 'service', 'type', 'test', 'config']),
  path: z.string().min(1),
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
});

export const ArchitectureOutputSchema = z.object({
  taskId: z.string(),
  components: z.array(ComponentSchema).min(1),
  patterns: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

// ============================================================
// CODER OUTPUT
// ============================================================

export const FilePatchSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1),
  language: z.string().min(1),
  description: z.string().optional(),
});

export const CodePatchOutputSchema = z.object({
  taskId: z.string(),
  patches: z.array(FilePatchSchema).min(1),
  notes: z.array(z.string()).default([]),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        dev: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type CodePatchOutput = z.infer<typeof CodePatchOutputSchema>;

// ============================================================
// TESTER OUTPUT
// ============================================================

export const TestCaseSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  content: z.string().min(1),
  covers: z.array(z.string()).min(1),
  framework: z.string().default('jest'),
});

export const TestOutputSchema = z.object({
  taskId: z.string(),
  tests: z.array(TestCaseSchema).min(1),
  coverage: z.array(z.string()).default([]),
  setupNotes: z.array(z.string()).default([]),
});
export type TestOutput = z.infer<typeof TestOutputSchema>;

// ============================================================
// REVIEWER OUTPUT
// ============================================================

export const ReviewFindingSchema = z.object({
  severity: z.enum(['blocker', 'warning', 'info']),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  message: z.string().min(1),
  suggestion: z.string().optional(),
});

export const ReviewOutputSchema = z.object({
  taskId: z.string(),
  verdict: z.enum(['approved', 'needs-fix', 'rejected']),
  findings: z.array(ReviewFindingSchema).default([]),
  summary: z.string().min(1),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

// ============================================================
// DOMAIN GUARD OUTPUT
// ============================================================

export const DomainViolationSchema = z.object({
  rule: z.string().min(1),
  file: z.string().optional(),
  message: z.string().min(1),
  severity: z.enum(['blocker', 'warning']).default('blocker'),
});

export const DomainGuardOutputSchema = z.object({
  taskId: z.string(),
  verdict: z.enum(['passed', 'needs-fix', 'rejected']),
  violations: z.array(DomainViolationSchema).default([]),
  summary: z.string().min(1),
});
export type DomainGuardOutput = z.infer<typeof DomainGuardOutputSchema>;

// ============================================================
// RUN MANIFEST
// ============================================================

export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'needs-fix',
  'failed',
  'skipped',
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'needs-fix',
  'passed',
  'approved',
  'failed',
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const AgentStepRecordSchema = z.object({
  agent: AgentRoleSchema,
  taskId: z.string().optional(),
  status: StepStatusSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  outputFile: z.string().optional(),
  promptHash: z.string().optional(),
  model: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
    })
    .optional(),
  error: z.string().optional(),
  retries: z.number().int().default(0),
});
export type AgentStepRecord = z.infer<typeof AgentStepRecordSchema>;

export const GateResultSchema = z.enum(['pending', 'passed', 'failed', 'skipped']);
export type GateResult = z.infer<typeof GateResultSchema>;

export const GateResultsSchema = z.object({
  schemaCheck: GateResultSchema.default('pending'),
  typeCheck: GateResultSchema.default('pending'),
  lint: GateResultSchema.default('pending'),
  tests: GateResultSchema.default('pending'),
  security: GateResultSchema.default('pending'),
});
export type GateResults = z.infer<typeof GateResultsSchema>;

export const RunManifestSchema = z.object({
  runId: z.string(),
  requirementId: z.string(),
  status: RunStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(AgentStepRecordSchema).default([]),
  artifacts: z.array(z.string()).default([]),
  gateResults: GateResultsSchema.default({}),
  approvedAt: z.string().optional(),
  approvedBy: z.string().optional(),
});
export type RunManifest = z.infer<typeof RunManifestSchema>;

// ============================================================
// REQUIREMENT
// ============================================================

export const RequirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()).default([]),
  nfr: z.array(z.string()).default([]),
  rawMarkdown: z.string(),
});
export type Requirement = z.infer<typeof RequirementSchema>;
