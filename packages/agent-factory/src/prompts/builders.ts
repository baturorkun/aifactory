import type {
  Requirement,
  Task,
  PlanOutput,
  ArchitectureOutput,
  CodePatchOutput,
  TestOutput,
  ReviewOutput,
  DomainGuardOutput,
} from '@aifactory/contracts';
import type { DomainRule } from '../config';
import type { GateReport } from '@aifactory/quality-gates';

// ============================================================
// PLANNER
// ============================================================

export function buildPlannerPrompt(
  requirement: Requirement,
  constraints: Record<string, unknown>,
  ragContext?: string,
): string {
  const parts: string[] = [
    `## Requirement: ${requirement.id}`,
    `**Title:** ${requirement.title}`,
    '',
    '### Description',
    requirement.rawMarkdown,
  ];

  if (requirement.acceptanceCriteria.length > 0) {
    parts.push('', '### Acceptance Criteria');
    requirement.acceptanceCriteria.forEach((c) => parts.push(`- ${c}`));
  }

  if (requirement.nfr.length > 0) {
    parts.push('', '### Non-Functional Requirements');
    requirement.nfr.forEach((n) => parts.push(`- ${n}`));
  }

  if (Object.keys(constraints).length > 0) {
    parts.push('', '### Constraints', '```json', JSON.stringify(constraints, null, 2), '```');
  }

  if (ragContext) parts.push('', ragContext);

  parts.push(
    '',
    'Produce a **PlanOutput** JSON object matching the schema provided in your system prompt.',
    'Ensure `requirementId` is set to the exact ID above.',
  );

  return parts.join('\n');
}

// ============================================================
// ARCHITECT
// ============================================================

export function buildArchitectPrompt(
  task: Task,
  plan: PlanOutput,
  requirement: Requirement,
  constraints: Record<string, unknown>,
  ragContext?: string,
): string {
  return [
    `## Task: ${task.id}`,
    `**Title:** ${task.title}`,
    `**Description:** ${task.description}`,
    '',
    '### Acceptance Criteria',
    ...task.acceptanceCriteria.map((c) => `- ${c}`),
    ...(task.targetFiles?.length
      ? ['', `**Target files hint:** ${task.targetFiles.join(', ')}`]
      : []),
    '',
    '### Context',
    `Requirement: ${requirement.title} (${requirement.id})`,
    `Plan summary: ${plan.summary}`,
    `Total tasks in plan: ${plan.tasks.length}`,
    ...(Object.keys(constraints).length
      ? ['', '### Project Constraints', '```json', JSON.stringify(constraints, null, 2), '```']
      : []),
    ...(ragContext ? ['', ragContext] : []),
    '',
    'Return an **ArchitectureOutput** JSON object.',
  ].join('\n');
}

// ============================================================
// CODER
// ============================================================

export interface FixContext {
  reviewFindings: ReviewOutput['findings'];
  domainViolations: DomainGuardOutput['violations'];
}

export function buildCoderPrompt(
  task: Task,
  architecture: ArchitectureOutput,
  requirement: Requirement,
  constraints: Record<string, unknown>,
  existingFiles: ReadonlyArray<{ path: string; content: string }>,
  allowedPaths: readonly string[],
  fixContext?: FixContext,
  ragContext?: string,
): string {
  const parts: string[] = [
    `## Task: ${task.id} — ${task.title}`,
    '',
    '### Description',
    task.description,
    '',
    '### Architecture',
    '```json',
    JSON.stringify(architecture, null, 2),
    '```',
    '',
    '### Acceptance Criteria',
    ...task.acceptanceCriteria.map((c) => `- ${c}`),
  ];

  if (task.targetFiles?.length) {
    parts.push(
      '',
      '### Task Artifact Paths',
      ...task.targetFiles.map((path) => `- ${path}`),
      '',
      'Every patch path must be one of the files above, or be inside a directory above. Do not create tests or any other file outside this task scope.',
    );
  }

  if (Object.keys(constraints).length > 0) {
    parts.push('', '### Project Constraints', '```json', JSON.stringify(constraints, null, 2), '```');
  }
  if (allowedPaths.length > 0) {
    parts.push('', `### Allowed Artifact Paths`, allowedPaths.map((path) => `- ${path}`).join('\n'));
  }
  if (existingFiles.length > 0) {
    parts.push('', '### Existing Target Files');
    for (const file of existingFiles) {
      parts.push(`#### ${file.path}`, '```typescript', file.content, '```');
    }
    parts.push(
      '',
      'Preserve all unrelated existing code. Prefer mode "replace" with a small, non-empty, uniquely matching exact `find` block for existing files. Never return an empty `find`. If a safe exact replacement is impossible, use mode "full" and return the complete file content.',
    );
  }

  if (ragContext) parts.push('', ragContext);

  if (fixContext) {
    const blockers = fixContext.reviewFindings.filter((f) => f.severity === 'blocker');
    if (blockers.length > 0) {
      parts.push('', '### ⚠ Fix Required — Review Blockers');
      blockers.forEach((f) => {
        const loc = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : '';
        parts.push(`- ${f.message}${loc}${f.suggestion ? ` → ${f.suggestion}` : ''}`);
      });
    }

    const violations = fixContext.domainViolations.filter((v) => v.severity === 'blocker');
    if (violations.length > 0) {
      parts.push('', '### ⚠ Domain Violations to Fix');
      violations.forEach((v) => {
        const loc = v.file ? ` (${v.file})` : '';
        parts.push(`- [${v.rule}]${loc}: ${v.message}`);
      });
    }
  }

  parts.push(
    '',
    'Return a **CodePatchOutput** JSON. Every replace patch must have a non-empty exact `find`; full patches must contain the complete file.',
  );
  return parts.join('\n');
}

export function buildQualityGateRepairPrompt(
  requirement: Requirement,
  reports: readonly GateReport[],
  existingFiles: ReadonlyArray<{ path: string; content: string }>,
  allowedPaths: readonly string[],
): string {
  const failedReports = reports.filter((report) => report.status === 'failed');
  const parts = [
    `## Quality Gate Repair — ${requirement.id}`,
    `Requirement: ${requirement.title}`,
    '',
    'The implementation has already been generated, but final project quality gates failed.',
    'Make the smallest coherent code changes needed to fix every reported error. Preserve unrelated behavior.',
    '',
    '### Failed Quality Gates',
    ...failedReports.flatMap((report) => [
      `#### ${report.gate}`,
      '```text',
      report.output,
      '```',
    ]),
  ];

  if (allowedPaths.length) {
    parts.push('', '### Allowed Artifact Paths', ...allowedPaths.map((path) => `- ${path}`));
  }

  if (existingFiles.length) {
    parts.push('', '### Generated Implementation Files');
    for (const file of existingFiles) {
      parts.push(`#### ${file.path}`, '```', file.content, '```');
    }
  }

  parts.push(
    '',
    'Return a **CodePatchOutput** JSON containing only files required for these quality-gate fixes.',
    'You may create a missing source file when the gate output proves it is required and its path is allowed.',
    'For an existing file, use a precise non-empty replace patch when possible. Otherwise return the complete file with mode "full".',
  );
  return parts.join('\n');
}

// ============================================================
// TESTER
// ============================================================

export function buildTesterPrompt(
  task: Task,
  code: CodePatchOutput,
  requirement: Requirement,
  constraints: Record<string, unknown>,
  allowedPaths: readonly string[],
  existingTests: ReadonlyArray<{ path: string; content: string }>,
  ragContext?: string,
): string {
  const fileBlocks = code.patches.flatMap((p) => [
    `#### ${p.path}`,
    '```' + p.language,
    p.content,
    '```',
    '',
  ]);

  return [
    `## Task: ${task.id} — ${task.title}`,
    '',
    '### Acceptance Criteria to Cover',
    ...task.acceptanceCriteria.map((c) => `- ${c}`),
    '',
    '### Code Under Test',
    ...fileBlocks,
    ...(task.targetFiles?.length
      ? [
          '### Task Artifact Paths',
          ...task.targetFiles.map((path) => `- ${path}`),
          '',
          'Every returned test path must be one of the files above, or be inside a directory above. Extend an existing harness when it is listed; do not create a parallel test file.',
          '',
        ]
      : []),
    ...(Object.keys(constraints).length
      ? ['### Project Constraints', '```json', JSON.stringify(constraints, null, 2), '```', '']
      : []),
    ...(allowedPaths.length
      ? ['### Allowed Artifact Paths', ...allowedPaths.map((path) => `- ${path}`), '']
      : []),
    ...(existingTests.length
      ? [
          '### Existing Test Files',
          ...existingTests.flatMap((file) => [
            `#### ${file.path}`,
            '```html',
            file.content,
            '```',
            '',
          ]),
          'Preserve all existing regression coverage and the existing runner result contract. Add or adjust only assertions required by this task; do not introduce unrelated behavioral requirements.',
          '',
        ]
      : []),
    ...(ragContext ? [ragContext, ''] : []),
    'Return a **TestOutput** JSON with complete test file contents.',
    'Follow the requirement and existing project test conventions. Use Jest only when the project already uses Jest.',
    'For every `*-browser-harness.html`, preserve the runner result contract: finish by setting `<pre id="result">` with `data-pass="true"` or `data-pass="false"` and put the diagnostic report in its text content. Do not replace this contract with a document title, summary element, or a custom global.',
    'Browser harnesses run in headless Chromium with `--dump-dom`; do not await `requestAnimationFrame`, which may be throttled indefinitely. Use bounded `setTimeout` polling for asynchronous DOM state.',
  ].join('\n');
}

// ============================================================
// REVIEWER
// ============================================================

export function buildReviewerPrompt(
  task: Task,
  code: CodePatchOutput,
  tests: TestOutput,
  requirement: Requirement,
  supportingFiles: ReadonlyArray<{ path: string; content: string }> = [],
  ragContext?: string,
): string {
  const codeBlocks = code.patches.flatMap((p) => [
    `#### ${p.path}`,
    '```' + p.language,
    p.content,
    '```',
    '',
  ]);

  const testBlocks = tests.tests.flatMap((t) => [
    `#### ${t.path}`,
    '```typescript',
    t.content,
    '```',
    '',
  ]);

  const supportingBlocks = supportingFiles.flatMap((file) => [
    `#### ${file.path} (unchanged supporting context)`,
    '```',
    file.content,
    '```',
    '',
  ]);

  return [
    `## Task: ${task.id} — ${task.title}`,
    '',
    '### Acceptance Criteria',
    ...task.acceptanceCriteria.map((c) => `- ${c}`),
    '',
    '### Code',
    ...codeBlocks,
    '### Tests',
    ...testBlocks,
    ...(supportingBlocks.length
      ? [
          '### Unchanged Supporting Context',
          'Use these files to verify existing delegated handlers and integration paths. They are context, not submitted changes. Do not report an existing behavior as missing merely because it is implemented here instead of in the patch.',
          ...supportingBlocks,
        ]
      : []),
    ...(ragContext ? [ragContext, ''] : []),
    'Review code and tests. Return a **ReviewOutput** JSON.',
    'Set verdict to: "approved" | "needs-fix" | "rejected".',
    'List blockers separately from warnings.',
  ].join('\n');
}

// ============================================================
// DOMAIN GUARD
// ============================================================

export function buildDomainGuardPrompt(
  task: Task,
  code: CodePatchOutput,
  requirement: Requirement,
  domainRules: DomainRule[],
  supportingFiles: ReadonlyArray<{ path: string; content: string }> = [],
  ragContext?: string,
): string {
  const rulesSection =
    domainRules.length === 0
      ? '_No custom domain rules. Apply general software engineering best practices._'
      : '```json\n' + JSON.stringify(domainRules, null, 2) + '\n```';

  const codeBlocks = code.patches.flatMap((p) => [
    `#### ${p.path}`,
    '```' + p.language,
    p.content,
    '```',
    '',
  ]);

  const supportingBlocks = supportingFiles.flatMap((file) => [
    `#### ${file.path} (unchanged supporting context)`,
    '```',
    file.content,
    '```',
    '',
  ]);

  return [
    `## Task: ${task.id} — ${task.title}`,
    '',
    '### Domain Rules',
    rulesSection,
    '',
    '### Code to Validate',
    ...codeBlocks,
    ...(supportingBlocks.length
      ? [
          '### Unchanged Supporting Context',
          'Use this context to verify delegated handlers and existing domain behavior. Do not treat these files as submitted changes.',
          ...supportingBlocks,
        ]
      : []),
    ...(ragContext ? [ragContext, ''] : []),
    'Return a **DomainGuardOutput** JSON.',
    'Set verdict to: "passed" | "needs-fix" | "rejected".',
  ].join('\n');
}
