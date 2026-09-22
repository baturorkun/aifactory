#!/usr/bin/env node
// The "build" gate for a Renode model. Unlike a compiled model there is no
// object file to produce: a Renode model is a platform description (.repl) plus
// optional C# peripherals that Renode compiles when it loads them. So this gate
// checks the model is present and loadable enough to run: the platform file
// exists and is non-empty, and every C# peripheral the platform includes is on
// disk. It does not prove the model is correct — the boardParity gate does
// that, by running the probe under Renode and diffing the trace with the board.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => { console.error(message); process.exit(1); };

const platform = resolve(PROJECT_ROOT, 'platforms/board.repl');
if (!existsSync(platform)) fail('platforms/board.repl is missing. Describe the board the probe runs on.');
const repl = readFileSync(platform, 'utf8');
if (repl.trim() === '') fail('platforms/board.repl is empty. Add at least the CPU and the console UART the probe prints on.');

// Renode compiles C# peripherals on load; here we only confirm the files the
// platform references are actually present, so a load does not fail late.
const referenced = [...repl.matchAll(/include\s+@([^\s]+\.cs)/g)].map((m) => m[1]);
const missing = referenced.filter((rel) => !existsSync(resolve(PROJECT_ROOT, rel)));
if (missing.length > 0) fail(`platforms/board.repl includes C# peripherals that are missing: ${missing.join(', ')}`);

const peripheralsDir = resolve(PROJECT_ROOT, 'peripherals');
const csFiles = existsSync(peripheralsDir)
  ? readdirSync(peripheralsDir).filter((f) => f.endsWith('.cs'))
  : [];
console.log(`Renode model: platforms/board.repl (${repl.split('\n').length} lines), ${csFiles.length} C# peripheral(s). Renode compiles the C# on load.`);
