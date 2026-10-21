import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listDesigns, stagePassedOver, writeCompileDatabase } from './flow.mjs';
import { PROJECT_ROOT, loadEnvFile } from './vivado-host.mjs';

const HELP = `Usage: node scripts/build-reuse.mjs restore|save

The embedded_build CI job's results, kept by what they were built from
(RQ-0078), so the same content is not built twice: a merge request's build
serves main after the merge, and a requirement's completion commit.

  restore  exit 0 when these inputs were built before: their out/*/artifacts/
           are here and the job needs no Vivado; exit 10 to build
  save     after a build that passed: its out/*/artifacts/ under the inputs' key

The inputs are the commit's files without requirements/, runs/ and handoffs/,
which no build reads, and VIVADO_BIN and VITIS_BIN. The results live in the
project's generic package registry, reached with the CI job token; outside CI
nothing is asked or stored, and a registry that cannot be reached means a
build, never a failed job.`;

const PACKAGE = 'embedded_build';
const FILE = 'artifacts.tar.gz';
const RECORD = 'build-reuse.json';
const NOT_BUILD_INPUTS = ['requirements/', 'runs/', 'handoffs/'];
export const BUILD = 10;

// The key of what a build of this commit reads.
export function inputsKey(env, root = PROJECT_ROOT) {
  const listed = spawnSync('git', ['ls-tree', '-r', '--full-tree', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-tree: ${String(listed.stderr ?? listed.error ?? '').trim()}`);
  const files = String(listed.stdout).split('\n')
    .filter((line) => line && !NOT_BUILD_INPUTS.some((prefix) => line.split('\t')[1]?.startsWith(prefix)));
  const hash = createHash('sha256');
  hash.update(`${PACKAGE} 1\n`);
  for (const name of ['VIVADO_BIN', 'VITIS_BIN']) hash.update(`${name}=${(env[name] ?? '').trim()}\n`);
  hash.update(files.join('\n'));
  return hash.digest('hex');
}

// The registry address of a key, or undefined outside CI.
function registry(env, key) {
  if (!env.CI_JOB_TOKEN || !env.CI_API_V4_URL || !env.CI_PROJECT_ID) return undefined;
  return {
    url: `${env.CI_API_V4_URL}/projects/${env.CI_PROJECT_ID}/packages/generic/${PACKAGE}/${key}/${FILE}`,
    headers: { 'JOB-TOKEN': env.CI_JOB_TOKEN },
  };
}

function artifactDirectories(root) {
  const out = join(root, 'out');
  if (!existsSync(out)) return [];
  return readdirSync(out).filter((name) => existsSync(join(out, name, 'artifacts'))).sort().map((name) => `out/${name}/artifacts`);
}

function tar(args, cwd) {
  const result = spawnSync('tar', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`tar ${args[0]}: ${String(result.stderr ?? result.error ?? '').trim()}`);
  return String(result.stdout);
}

export async function restore(env, root = PROJECT_ROOT) {
  if (stagePassedOver('build', env, root)) return BUILD;
  const key = inputsKey(env, root);
  const place = registry(env, key);
  if (!place) {
    console.log('BUILD REUSE: not in CI, building.');
    return BUILD;
  }
  let response;
  try {
    response = await fetch(place.url, { headers: place.headers });
  } catch (error) {
    console.log(`BUILD REUSE: the package registry cannot be reached (${error instanceof Error ? error.message : error}), building.`);
    return BUILD;
  }
  if (!response.ok) {
    console.log(`BUILD REUSE: inputs ${key.slice(0, 12)} not built before (${response.status}), building.`);
    return BUILD;
  }
  const work = mkdtempSync(join(tmpdir(), 'build-reuse-'));
  let record = {};
  try {
    const archive = join(work, FILE);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    // Only the record and out/<design>/artifacts/ are taken from an archive.
    const members = tar(['-tzf', archive], root).split('\n').map((line) => line.trim()).filter(Boolean);
    const stray = members.filter((member) => member !== RECORD && !/^out\/[^/.][^/]*\/artifacts(\/|$)/.test(member) || member.split('/').includes('..'));
    if (stray.length > 0 || !members.some((member) => member.startsWith('out/'))) {
      console.log(`BUILD REUSE: the archive of inputs ${key.slice(0, 12)} is not one this script wrote, building.`);
      return BUILD;
    }
    tar(['-xzf', archive, '-C', work, RECORD], root);
    record = JSON.parse(readFileSync(join(work, RECORD), 'utf8'));
    tar(['-xzf', archive, '--exclude', RECORD], root);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  // The coding standard's compile database names this checkout's paths.
  for (const design of listDesigns(root)) writeCompileDatabase(design.name, root);
  console.log(`BUILD REUSED: inputs ${key.slice(0, 12)} were built by ${record.job || 'an earlier job'} (commit ${String(record.commit ?? '').slice(0, 8) || 'unknown'}); its artifacts are taken, Vivado does not run.`);
  return 0;
}

export async function save(env, root = PROJECT_ROOT) {
  if (stagePassedOver('build', env, root)) return 0;
  const key = inputsKey(env, root);
  const place = registry(env, key);
  if (!place) return 0;
  const directories = artifactDirectories(root);
  if (directories.length === 0) {
    console.log('BUILD REUSE: no out/*/artifacts/ to keep.');
    return 0;
  }
  const work = mkdtempSync(join(tmpdir(), 'build-reuse-'));
  try {
    writeFileSync(join(root, RECORD), JSON.stringify({ key, commit: env.CI_COMMIT_SHA ?? '', job: env.CI_JOB_URL ?? '' }, null, 2) + '\n');
    const archive = join(work, FILE);
    tar(['-czf', archive, RECORD, ...directories], root);
    const response = await fetch(place.url, { method: 'PUT', headers: place.headers, body: readFileSync(archive) });
    if (!response.ok) console.log(`BUILD REUSE: not kept, the package registry answered ${response.status}.`);
    else console.log(`BUILD REUSE: kept as inputs ${key.slice(0, 12)}.`);
  } catch (error) {
    console.log(`BUILD REUSE: not kept (${error instanceof Error ? error.message : error}).`);
  } finally {
    rmSync(join(root, RECORD), { force: true });
    rmSync(work, { recursive: true, force: true });
  }
  return 0;
}

// Nothing here fails a job: a restore that goes wrong builds, a save that
// goes wrong keeps nothing.
export async function main(argv = process.argv.slice(2), env = loadEnvFile(), root = PROJECT_ROOT) {
  const [command] = argv;
  if (command !== 'restore' && command !== 'save') {
    console.log(HELP);
    return command === '--help' || command === '-h' ? 0 : 2;
  }
  try {
    return command === 'restore' ? await restore(env, root) : await save(env, root);
  } catch (error) {
    console.log(`BUILD REUSE: ${error instanceof Error ? error.message : String(error)}; ${command === 'restore' ? 'building' : 'nothing kept'}.`);
    return command === 'restore' ? BUILD : 0;
  }
}

// Compared as real paths, as flow.mjs does.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
