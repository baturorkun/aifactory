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
      'Preserve all unrelated existing code. Use mode "replace" with a small exact `find` block for existing files.',
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

  parts.push('', 'Return a **CodePatchOutput** JSON. Use exact-text replacement mode for existing files.');
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
  existingTestPaths: readonly string[],
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
    ...(Object.keys(constraints).length
      ? ['### Project Constraints', '```json', JSON.stringify(constraints, null, 2), '```', '']
      : []),
    ...(allowedPaths.length
      ? ['### Allowed Artifact Paths', ...allowedPaths.map((path) => `- ${path}`), '']
      : []),
    ...(existingTestPaths.length
      ? ['### Existing Test Conventions', ...existingTestPaths.map((path) => `- ${path}`), '']
      : []),
    ...(ragContext ? [ragContext, ''] : []),
    'Return a **TestOutput** JSON with complete test file contents.',
    'Follow the requirement and existing project test conventions. Use Jest only when the project already uses Jest.',
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

  return [
    `## Task: ${task.id} — ${task.title}`,
    '',
    '### Domain Rules',
    rulesSection,
    '',
    '### Code to Validate',
    ...codeBlocks,
    ...(ragContext ? [ragContext, ''] : []),
    'Return a **DomainGuardOutput** JSON.',
    'Set verdict to: "passed" | "needs-fix" | "rejected".',
  ].join('\n');
}
