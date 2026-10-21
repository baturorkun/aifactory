#!/usr/bin/env node

// security-reviewed: child-process — the launcher starts tsx with this Node, its arguments passed as a list, no shell.
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
// tsx's own script, run by this Node: node_modules/.bin/tsx is a .cmd on
// Windows, which Node does not start without a shell (RQ-0073).
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tsconfig = path.join(repoRoot, 'tsconfig.json');
const cli = path.join(repoRoot, 'packages', 'agent-factory', 'src', 'cli.ts');

const result = spawnSync(
  process.execPath,
  [tsxCli, '--tsconfig', tsconfig, cli, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, AIFACTORY_HOME: process.env.AIFACTORY_HOME || repoRoot },
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
