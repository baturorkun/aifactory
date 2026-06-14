#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const tsconfig = path.join(repoRoot, 'tsconfig.json');
const cli = path.join(repoRoot, 'packages', 'agent-factory', 'src', 'cli.ts');

const result = spawnSync(
  tsxBin,
  ['--tsconfig', tsconfig, cli, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
