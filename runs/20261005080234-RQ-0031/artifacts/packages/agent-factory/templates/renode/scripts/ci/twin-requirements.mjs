#!/usr/bin/env node
// The hardware-twin requirements a pipeline checks, one "<RQ-id> <probe>" per
// line, from the front matter of requirements/*.md (`kind: hardware-twin`):
//
//   on a requirement branch (factory/RQ-0004, directly or as a merge request's
//   source) of a hardware-twin requirement, only that requirement, as soon as
//   its probe has an ELF, with or without a board trace yet: the branch is
//   about that probe; a branch whose requirement has no probe (a standard
//   requirement, which may still change the model) checks every one, as main;
//   anywhere else (main), every requirement whose probe has a committed board
//   trace: main holds all of them, and a change must not break an earlier one.
//
// The scope goes to stderr, so the job log says which probes it covered.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const branch = process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || process.env.CI_COMMIT_BRANCH || '';
const branchRequirement = branch.match(/^factory\/(RQ-\d+)$/)?.[1];

const frontOf = (file) => readFileSync(resolve(ROOT, 'requirements', file), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const fieldOf = (front, name) => front.match(new RegExp(`^${name}:\\s*"?([^"\\n]+)"?$`, 'm'))?.[1]?.trim();
const files = readdirSync(resolve(ROOT, 'requirements')).filter((f) => /^RQ-\d+.*\.md$/.test(f)).sort();
const isTwin = (id) => files.some((f) => { const front = frontOf(f); return fieldOf(front, 'id') === id && fieldOf(front, 'kind') === 'hardware-twin'; });
const only = branchRequirement && isTwin(branchRequirement) ? branchRequirement : undefined;

const picked = [];
for (const file of files) {
  const front = frontOf(file);
  const field = (name) => fieldOf(front, name);
  const id = field('id');
  const probe = field('probe');
  if (field('kind') !== 'hardware-twin' || !probe) continue;
  const dir = resolve(ROOT, 'probes', probe);
  if (only) {
    if (id === only && existsSync(resolve(dir, `${probe}.elf`))) picked.push(`${id} ${probe}`);
  } else if (existsSync(resolve(dir, 'board-trace.txt'))) {
    picked.push(`${id} ${probe}`);
  }
}
console.error(only
  ? `Scope: ${only} only (branch ${branch}): ${picked.length ? picked.join(', ') : 'its probe has no ELF yet'}`
  : `Scope: every hardware-twin requirement with a board trace${branchRequirement ? ` (${branchRequirement} has no probe of its own)` : ''}: ${picked.join(', ') || 'none'}`);
for (const line of picked) console.log(line);
