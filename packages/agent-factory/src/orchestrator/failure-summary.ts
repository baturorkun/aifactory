import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DomainGuardOutput, GateResults, ReviewOutput } from '@aifactory/contracts';

export interface TaskFailureSummary {
  taskId: string;
  review?: ReviewOutput;
  guard?: DomainGuardOutput;
}

export interface FailureSummary {
  runId: string;
  requirementId: string;
  status: 'needs-fix';
  tasks: TaskFailureSummary[];
  failedGates: string[];
  resumeCommand: string;
}

export function writeFailureSummary(
  runDir: string,
  summary: FailureSummary,
): string {
  const path = join(runDir, 'failure-summary.json');
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return path;
}

export function failedGateNames(results: GateResults): string[] {
  return Object.entries(results)
    .filter(([, status]) => status === 'failed')
    .map(([name]) => name);
}

export function formatFailureSummary(summary: FailureSummary): string {
  const lines = [
    '',
    `  NEEDS FIX — ${summary.requirementId} (${summary.runId})`,
  ];
  for (const task of summary.tasks) {
    lines.push('', `  Task: ${task.taskId}`);
    for (const finding of task.review?.findings ?? []) {
      const location = finding.file
        ? `${finding.file}${finding.line ? `:${finding.line}` : ''}`
        : 'general';
      lines.push(`    [review/${finding.severity}] ${location} — ${finding.message}`);
      if (finding.suggestion) lines.push(`      Fix: ${finding.suggestion}`);
    }
    for (const violation of task.guard?.violations ?? []) {
      lines.push(
        `    [domain/${violation.severity}] ${violation.file ?? violation.rule} — ${violation.message}`,
      );
    }
    if (!(task.review?.findings.length ?? 0) && !(task.guard?.violations.length ?? 0)) {
      lines.push('    No structured findings were returned; inspect the task step outputs.');
    }
  }
  if (summary.failedGates.length) {
    lines.push('', `  Failed gates: ${summary.failedGates.join(', ')}`);
  }
  lines.push('', '  Detailed report: failure-summary.json', `  Resume: ${summary.resumeCommand}`, '');
  return lines.join('\n');
}

