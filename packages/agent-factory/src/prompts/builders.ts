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
): string {
  const parts: string[] = [
    `## Requirement: ${requirement.id}`,
    `**Title:** ${requirement.title}`,
    '',
    '### Description',
    requirement.description,
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
  fixContext?: FixContext,
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

  parts.push('', 'Return a **CodePatchOutput** JSON with **complete** file contents.');
  return parts.join('\n');
}

// ============================================================
// TESTER
// ============================================================

export function buildTesterPrompt(
  task: Task,
  code: CodePatchOutput,
  requirement: Requirement,
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
    'Return a **TestOutput** JSON with complete test file contents.',
    'Use Jest as the default test framework unless specified otherwise.',
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
    'Return a **DomainGuardOutput** JSON.',
    'Set verdict to: "passed" | "needs-fix" | "rejected".',
  ].join('\n');
}
