import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runAllGates, type GateReport } from '@aifactory/quality-gates';

test('target build gate runs and target command timeout is configurable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aifactory-gate-timeout-'));
  const runDir = join(root, 'run');
  mkdirSync(runDir);
  try {
    const node = JSON.stringify(process.execPath);
    const results = await runAllGates(runDir, root, {
      targetRoot: root,
      commandTimeoutMs: 1_000,
      commands: {
        build: `${node} -e "process.exit(0)"`,
        test: `${node} -e "setTimeout(() => {}, 5000)"`,
      },
    });
    assert.equal(results.build, 'passed');
    assert.equal(results.tests, 'failed');
    const reports = JSON.parse(readFileSync(join(runDir, 'gates/report.json'), 'utf8')) as GateReport[];
    assert.equal(reports.find((report) => report.gate === 'build')?.status, 'passed');
    assert.equal(reports.find((report) => report.gate === 'tests')?.status, 'failed');
    // Without the command in the report there is no auditable trace of what a
    // gate verified, so a stale command keeps reporting success for work it
    // never touched.
    const build = reports.find((report) => report.gate === 'build');
    assert.equal(build?.command, `${node} -e "process.exit(0)"`);
    assert.equal(build?.cwd, root);
    // A gate with nothing configured records no command rather than an empty one.
    assert.equal(reports.find((report) => report.gate === 'lint')?.command, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
