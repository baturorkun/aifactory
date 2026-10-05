#!/usr/bin/env node
// One page per pipeline that says what the twin pipeline did: for every
// hardware-twin requirement, the board its probe runs on, the committed board
// trace, the twin trace, parity and the differences; whether a fresh board
// run was made and matched the committed trace; the test summary.
// Reads what the earlier jobs left in build/ and writes build/report/index.html
// and build/report/summary.json. Missing inputs are reported, not fatal: the
// page is most useful when something upstream failed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'build/report');
const read = (rel) => (existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), 'utf8') : undefined);
const sha = (rel) => (existsSync(resolve(ROOT, rel)) ? createHash('sha256').update(readFileSync(resolve(ROOT, rel))).digest('hex') : undefined);
const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const env = (name) => process.env[name] ?? '';

const lines = (text) => (text ?? '').replace(/\r/g, '').split('\n').filter((l) => /^(READ|WRITE|WAIT|MEM) /.test(l));
// Spin counts on volatile WAIT lines differ run to run; parity ignores them.
const comparable = (line) => line.replace(/ spins=\d+ volatile$/, ' volatile');

const listing = spawnSync(process.execPath, [resolve(ROOT, 'scripts/ci/twin-requirements.mjs')], { encoding: 'utf8', env: process.env });
const requirements = listing.stdout.trim().split('\n').filter(Boolean).map((l) => { const [id, probe] = l.split(' '); return { id, probe }; });
const scope = listing.stderr.trim().replace(/^Scope: /, '');

const probes = requirements.map(({ id, probe }) => {
  const manifest = JSON.parse(read(`probes/${probe}/probe.json`) ?? '{}');
  const boardText = read(`probes/${probe}/board-trace.txt`);
  const board = lines(boardText);
  const simText = read(`build/probes/${probe}/simulator-trace.txt`);
  const sim = simText === undefined ? undefined : lines(simText);
  const fresh = read(`build/board/${probe}.txt`);
  const differences = [];
  if (sim && boardText !== undefined) {
    for (let i = 0; i < Math.max(board.length, sim.length); i++) {
      if (comparable(board[i] ?? '') !== comparable(sim[i] ?? '')) differences.push({ line: i + 1, board: board[i], sim: sim[i] });
    }
  }
  return {
    id, probe, board: manifest.board ?? 'the board', description: manifest.description,
    boardLines: board.length, simLines: sim?.length,
    parity: boardText === undefined ? 'no board trace yet' : sim === undefined ? 'not run' : differences.length === 0 ? 'identical' : `${differences.length} difference(s)`,
    differences,
    freshBoard: fresh === undefined ? 'not run' : boardText === undefined ? 'first trace recorded' : lines(fresh).map(comparable).join('\n') === board.map(comparable).join('\n') ? 'matches committed trace' : 'differs from committed trace',
    elfSha: sha(`probes/${probe}/${probe}.elf`), boardTraceSha: sha(`probes/${probe}/board-trace.txt`),
  };
});

// Test summary from the JUnit report.
const junit = read('build/junit.xml');
const tests = junit ? {
  total: (junit.match(/<testcase /g) ?? []).length,
  failed: (junit.match(/<failure/g) ?? []).length,
  skipped: (junit.match(/<skipped/g) ?? []).length,
} : undefined;

const summary = {
  scope, pipeline: env('CI_PIPELINE_ID'), commit: env('CI_COMMIT_SHORT_SHA'), ref: env('CI_COMMIT_REF_NAME'),
  generatedAt: new Date().toISOString(), probes, tests,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

const state = (ok, text) => `<span class="pill ${ok === undefined ? 'none' : ok ? 'ok' : 'bad'}">${esc(text)}</span>`;
const rows = probes.map((p) => `
  <tr>
    <td><b>${esc(p.id)}</b><br><code>${esc(p.probe)}</code></td>
    <td>${esc(p.board)}</td>
    <td class="num">${p.boardLines || '—'}</td>
    <td class="num">${p.simLines ?? '—'}</td>
    <td>${state(p.parity === 'not run' || p.parity === 'no board trace yet' ? undefined : p.parity === 'identical', p.parity)}</td>
    <td>${state(p.freshBoard === 'not run' ? undefined : p.freshBoard !== 'differs from committed trace', p.freshBoard)}</td>
    <td><code title="${esc(p.elfSha)}">${esc(p.elfSha?.slice(0, 12))}</code></td>
  </tr>`).join('');
const diffs = probes.filter((p) => p.differences.length).map((p) => `
  <section><h3>${esc(p.id)} · ${esc(p.probe)}</h3>
  ${p.differences.map((d) => `<div class="diff"><div class="n">#${d.line}</div><div><div class="b">board ${esc(d.board ?? '(missing)')}</div><div class="s">twin&nbsp; ${esc(d.sim ?? '(missing)')}</div></div></div>`).join('')}
  </section>`).join('');

writeFileSync(resolve(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Twin pipeline report</title>
<style>
:root { --bg:#f7f8f6; --fg:#1d2320; --muted:#5d6862; --line:#d9dfdb; --card:#fff; --ok:#1f7a4d; --okbg:#e3f3ea; --bad:#b3261e; --badbg:#fbe4e2; --none:#6b7280; --nonebg:#eceff1; }
@media (prefers-color-scheme: dark) { :root { --bg:#141816; --fg:#e4e9e6; --muted:#9aa6a0; --line:#2b332f; --card:#1b201d; --ok:#6fd39d; --okbg:#173325; --bad:#ff8a80; --badbg:#3a1d1b; --none:#a3acb2; --nonebg:#262c2f; } }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:1100px; margin:0 auto; padding:24px 16px 48px; display:grid; gap:20px; }
h1 { font-size:22px; margin:0; } h2 { font-size:17px; margin:0 0 8px; } h3 { font-size:15px; margin:12px 0 6px; }
.meta { color:var(--muted); font-size:13px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:16px; overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-size:14px; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
.num { font-variant-numeric:tabular-nums; text-align:right; }
code { font:12.5px ui-monospace, SFMono-Regular, Menlo, monospace; }
.pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12.5px; white-space:nowrap; }
.pill.ok { color:var(--ok); background:var(--okbg); } .pill.bad { color:var(--bad); background:var(--badbg); } .pill.none { color:var(--none); background:var(--nonebg); }
.diff { display:grid; grid-template-columns:48px 1fr; gap:8px; font:12.5px ui-monospace, Menlo, monospace; padding:4px 0; border-top:1px dashed var(--line); }
.diff .n { color:var(--muted); } .diff .b { color:var(--fg); } .diff .s { color:var(--bad); }
dl { display:grid; grid-template-columns:max-content 1fr; gap:6px 16px; margin:0; } dt { color:var(--muted); }
</style></head><body><main>
<header><h1>Twin pipeline report</h1>
<div class="meta">pipeline ${esc(summary.pipeline || 'local')} · ${esc(summary.ref)} @ ${esc(summary.commit)} · ${esc(summary.generatedAt)}</div>
<div class="meta">Scope: ${esc(scope)}</div></header>
<section class="card"><h2>Probes: board against twin</h2>
<table><thead><tr><th>Requirement</th><th>Board</th><th class="num">Board lines</th><th class="num">Twin lines</th><th>Parity</th><th>Fresh board run</th><th>ELF</th></tr></thead>
<tbody>${rows}</tbody></table></section>
${diffs ? `<section class="card"><h2>Differences</h2>${diffs}</section>` : ''}
<section class="card"><h2>Tests</h2><dl>
${tests ? `<dt>Total</dt><dd>${tests.total}</dd><dt>Failed</dt><dd>${state(tests.failed === 0, String(tests.failed))}</dd><dt>Skipped</dt><dd>${tests.skipped}</dd>` : `<dt>Report</dt><dd>${state(undefined, 'not run')}</dd>`}
</dl></section>
</main></body></html>
`);
console.log(`Twin report: ${probes.length} probe(s), ${probes.filter((p) => p.parity === 'identical').length} at parity -> build/report/index.html`);
