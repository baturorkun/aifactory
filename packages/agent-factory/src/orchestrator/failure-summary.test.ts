import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFailureSummary } from './failure-summary';

test('failure summary prints actionable reviewer findings and resume command', () => {
  const output = formatFailureSummary({
    runId: 'run-1',
    requirementId: 'RQ-0037',
    status: 'needs-fix',
    failedGates: ['tests'],
    resumeCommand: 'pnpm factory -- resume-requirement RQ-0037 --push',
    tasks: [{
      taskId: 'task-1',
      review: {
        taskId: 'task-1', verdict: 'needs-fix', summary: 'Broken',
        findings: [{ severity: 'blocker', file: 'src/main.ts', line: 7, message: 'Wrong', suggestion: 'Fix it' }],
      },
    }],
  });
  assert.match(output, /src\/main\.ts:7 — Wrong/);
  assert.match(output, /Fix: Fix it/);
  assert.match(output, /Failed gates: tests/);
  assert.match(output, /resume-requirement RQ-0037/);
});
