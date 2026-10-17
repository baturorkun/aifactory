import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { CommandError, PROJECT_ROOT, buildHost, runOnHost } from './vivado-host.mjs';

// The twin stage: the design's ELF on the board's hardware twin, its result
// checked against designs/<design>/test.yaml.
//
// The twin is not built here. It is a project of its own (a hardware twin,
// like hardware-twin/bfi-sumilator) that releases an image; the board file
// names it. As bfi-sw does with its twin, every run takes the twin's latest
// release (TWIN_TAG pins one) and records which one it was. The image keeps
// the contract bfi-simulator's has:
//
//   <image> --elf /io/<elf> --seconds <n> --out /io/run
//
// it writes what it recorded under /io/run, prints one JSON summary line on
// stdout and exits 0 when the run itself worked. The ELF goes in and the
// results come out with `docker cp`, so the Docker daemon may be another
// machine's (TWIN_REMOTE_HOST, or DOCKER_HOST).

// ------------------------------------------------------------
// test.yaml: timeout_s, expect, fail_on, summary
// ------------------------------------------------------------

function unquote(text) {
  const trimmed = text.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// summary checks are `field.path: { min: n, max: n }` or `field: value`.
function parseCheck(text) {
  const range = /^\{\s*(.*?)\s*\}$/.exec(text.trim());
  if (!range) return { equals: unquote(text) };
  const check = {};
  for (const part of range[1].split(',')) {
    const [key, value] = part.split(':').map((piece) => piece.trim());
    if (key !== 'min' && key !== 'max') throw new CommandError(`test.yaml: a summary check takes min and max, not "${key}".`);
    check[key] = Number(value);
    if (!Number.isFinite(check[key])) throw new CommandError(`test.yaml: ${key} must be a number, not "${value}".`);
  }
  return check;
}

export function parseTestYaml(text) {
  const test = { timeout_s: 10, expect: [], fail_on: [], summary: {} };
  let section;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const key = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (key) {
      section = key[1];
      if (section === 'timeout_s') test.timeout_s = Number(key[2]);
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && (section === 'expect' || section === 'fail_on')) {
      test[section].push(unquote(item[1]));
      continue;
    }
    const field = /^\s+([A-Za-z0-9_.]+):\s*(.+)$/.exec(line);
    if (field && section === 'summary') test.summary[field[1]] = parseCheck(field[2]);
  }
  if (!Number.isFinite(test.timeout_s) || test.timeout_s <= 0) throw new CommandError('test.yaml: timeout_s must be a positive number of seconds.');
  if (test.expect.length === 0 && Object.keys(test.summary).length === 0) {
    throw new CommandError('test.yaml: neither expect nor summary checks anything, so nothing could pass.');
  }
  return test;
}

// ------------------------------------------------------------
// The board file's twin section: which twin, and where its console lands
// ------------------------------------------------------------

export function parseTwinSection(boardText, boardName = 'board') {
  const lines = boardText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^twin:\s*$/.test(line));
  if (start < 0) return undefined;
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    block.push(line);
  }
  const text = block.join('\n');
  const value = (key) => new RegExp(`^\\s+${key}:\\s*"?([^"\\s#]+)`, 'm').exec(text)?.[1];
  const twin = {
    gitlab: value('gitlab'),
    project: value('project'),
    registry: value('registry'),
    console: value('console'),
  };
  for (const key of ['gitlab', 'project', 'registry']) {
    if (!twin[key]) throw new CommandError(`boards/${boardName}.yaml twin.${key} is not set (the twin's GitLab, project and container registry).`);
  }
  if (!/^https?:\/\/[A-Za-z0-9.:-]+\/?$/.test(twin.gitlab)) throw new CommandError(`boards/${boardName}.yaml twin.gitlab must be the GitLab's URL, e.g. http://gitlab.example.com.`);
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(twin.project)) throw new CommandError(`boards/${boardName}.yaml twin.project must be a project path, e.g. hardware-twin/<twin>.`);
  if (twin.console && !/^[A-Za-z0-9._-]+$/.test(twin.console)) throw new CommandError(`boards/${boardName}.yaml twin.console must be a file name the twin writes under --out.`);
  return twin;
}

// ------------------------------------------------------------
// The verdict
// ------------------------------------------------------------

function field(summary, path) {
  return path.split('.').reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), summary);
}

export function judgeRun({ exitStatus, summary, consoleText }, test) {
  if (exitStatus !== 0) {
    return { status: 'error', matched: [], missing: test.expect, failed_on: null, summary_checks: {}, why: `the twin exited with ${exitStatus}` };
  }
  const lines = (consoleText ?? '').split(/\r?\n/);
  const failedOn = test.fail_on.find((pattern) => lines.some((line) => line.includes(pattern)));
  const matched = test.expect.filter((pattern) => lines.some((line) => line.includes(pattern)));
  const missing = test.expect.filter((pattern) => !matched.includes(pattern));
  const checks = {};
  const wrong = [];
  for (const [path, check] of Object.entries(test.summary)) {
    const value = field(summary ?? {}, path);
    const ok = check.equals !== undefined
      ? String(value) === check.equals
      : typeof value === 'number' && (check.min === undefined || value >= check.min) && (check.max === undefined || value <= check.max);
    checks[path] = { value: value ?? null, ...check, ok };
    if (!ok) wrong.push(`${path}=${JSON.stringify(value ?? null)}`);
  }
  if (failedOn !== undefined) return { status: 'fail', matched, missing, failed_on: failedOn, summary_checks: checks, why: `"${failedOn}" appeared` };
  if (wrong.length > 0) return { status: 'fail', matched, missing, failed_on: null, summary_checks: checks, why: `summary out of range: ${wrong.join(', ')}` };
  if (missing.length > 0) return { status: 'timeout', matched, missing, failed_on: null, summary_checks: checks, why: `missing: ${missing.map((line) => `"${line}"`).join(', ')}` };
  return { status: 'pass', matched, missing, failed_on: null, summary_checks: checks, why: null };
}

// ------------------------------------------------------------
// The twin's release and image
// ------------------------------------------------------------

async function gitlabJson(twin, token, path) {
  const response = await fetch(`${twin.gitlab.replace(/\/$/, '')}/api/v4${path}`, { headers: { 'PRIVATE-TOKEN': token } });
  if (!response.ok) throw new CommandError(`TWIN FAILED: ${twin.gitlab} answered ${response.status} for ${path}; TWIN_GITLAB_TOKEN needs read_api and read_registry there.`, 1);
  return response.json();
}

export async function resolveTwin(twin, env) {
  const token = (env.TWIN_GITLAB_TOKEN ?? '').trim();
  if (!token) throw new CommandError(`TWIN_GITLAB_TOKEN is not set: a token on ${twin.gitlab} with read_api and read_registry, to find and pull the twin.`, 2);
  const project = encodeURIComponent(twin.project);
  let tag = (env.TWIN_TAG ?? '').trim();
  if (!tag) {
    const releases = await gitlabJson(twin, token, `/projects/${project}/releases?per_page=1`);
    tag = releases[0]?.tag_name;
    if (!tag) throw new CommandError(`TWIN FAILED: ${twin.project} on ${twin.gitlab} has no release yet.`, 1);
  }
  const user = (await gitlabJson(twin, token, '/user')).username;
  return { tag, image: `${twin.registry}/${twin.project}:${tag}`, user, token };
}

// The shell script that runs on the Docker host, in the twin's run directory.
// POSIX sh: the CI job image (docker:27) has no bash.
export function runScript() {
  return `#!/bin/sh
# Runs one ELF on the twin image: $1 image, $2 seconds, $3 registry, $4 user.
# .token (removed at once) logs in only when the image is not here yet.
set -u
cd "$(dirname "$0")"
image="$1"; seconds="$2"; registry="$3"; user="$4"
cid=""
cleanup() { rm -f .token; [ -z "$cid" ] || docker rm -f "$cid" >/dev/null 2>&1 || true; }
trap cleanup EXIT
if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker login -u "$user" --password-stdin "$registry" < .token >/dev/null || exit 2
  docker pull -q "$image" >/dev/null || exit 2
  docker logout "$registry" >/dev/null 2>&1 || true
fi
rm -f .token
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$image" > image.txt 2>/dev/null || true
cid="$(docker create "$image" --elf /io/app.elf --seconds "$seconds" --out /io/run)" || exit 2
docker cp app.elf "$cid:/io/app.elf" || exit 2
docker start -a "$cid" > summary.json
echo "$?" > exit-status.txt
rm -rf run && mkdir -p run
docker cp "$cid:/io/run/." run/ >/dev/null 2>&1 || true
exit 0
`;
}

// ------------------------------------------------------------
// The stage
// ------------------------------------------------------------

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export async function twinStage(settings, design, boardText, env) {
  const label = `\n▸ ${design.name}: twin`;
  const twin = parseTwinSection(boardText, design.BOARD);
  if (!twin) {
    console.log(`${label}: boards/${design.BOARD}.yaml names no twin yet, nothing to run it on`);
    return { status: 'skipped' };
  }
  if (!design.VITIS) {
    console.log(`${label}: no software (VITIS is not set), nothing runs on the twin`);
    return { status: 'skipped' };
  }
  const testPath = join(PROJECT_ROOT, 'designs', design.name, 'test.yaml');
  if (!existsSync(testPath)) {
    console.log(`${label}: no designs/${design.name}/test.yaml, nothing to check on the twin`);
    return { status: 'skipped' };
  }
  const elf = join(PROJECT_ROOT, 'out', design.name, 'artifacts', `${design.name}_app.elf`);
  if (!existsSync(elf)) {
    throw new CommandError(`TWIN FAILED: no out/${design.name}/artifacts/${design.name}_app.elf; run the build and sw stages first.`, 1);
  }
  if (settings.remote && settings.hostType !== 'linux') {
    throw new CommandError('TWIN_HOST_TYPE must be linux: the twin runs on a Docker host with a POSIX shell.', 2);
  }
  const test = parseTestYaml(readFileSync(testPath, 'utf8'));
  const release = await resolveTwin(twin, env);

  // The run directory travels with the project's sources (out/ does not) and
  // comes back with what the twin recorded.
  const relative = `twin-run/${design.name}`;
  const local = join(PROJECT_ROOT, relative);
  rmSync(local, { recursive: true, force: true });
  mkdirSync(local, { recursive: true });
  copyFileSync(elf, join(local, 'app.elf'));
  writeFileSync(join(local, 'run.sh'), runScript());
  writeFileSync(join(local, '.token'), release.token);
  chmodSync(join(local, '.token'), 0o600);
  const seconds = String(Math.ceil(test.timeout_s));

  console.log(`${label} (${twin.project} ${release.tag} on ${buildHost(settings)}'s Docker, ${seconds} s)`);
  const started = Date.now();
  let runError;
  try {
    runOnHost(settings, ['sh', `${relative}/run.sh`, release.image, seconds, twin.registry, release.user], {
      pulls: [relative],
      description: `Twin run of ${design.name}`,
    });
  } catch (error) {
    runError = error;
  } finally {
    rmSync(join(local, '.token'), { force: true });
  }

  const read = (name) => (existsSync(join(local, name)) ? readFileSync(join(local, name), 'utf8') : '');
  const exitText = read('exit-status.txt').trim();
  const exitStatus = runError ? -1 : exitText === '' ? -1 : Number(exitText);
  let summary;
  try {
    summary = JSON.parse(read('summary.json').trim().split(/\r?\n/).pop() || 'null');
  } catch {
    summary = null;
  }
  const consoleText = twin.console ? read(join('run', twin.console)) : '';
  const verdict = runError
    ? { status: 'error', matched: [], missing: test.expect, failed_on: null, summary_checks: {}, why: String(runError.message ?? runError) }
    : judgeRun({ exitStatus, summary, consoleText }, test);
  const [imageVersion, imageRevision] = read('image.txt').trim().split(/\s+/);
  const result = {
    target: 'twin',
    design: design.name,
    board: design.BOARD,
    twin: { project: twin.project, release: release.tag, image: release.image, version: imageVersion || null, revision: imageRevision || null },
    ...verdict,
    twin_exit: exitStatus,
    summary,
    elf_sha256: sha256(elf),
    host: buildHost(settings),
    duration_s: Math.round((Date.now() - started) / 100) / 10,
  };

  const artifacts = join(PROJECT_ROOT, 'out', design.name, 'artifacts', 'twin');
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  if (existsSync(join(local, 'run'))) {
    for (const name of ['monitor.log', ...(twin.console ? [twin.console] : [])]) {
      if (existsSync(join(local, 'run', name))) copyFileSync(join(local, 'run', name), join(artifacts, name));
    }
  }

  if (consoleText && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(consoleText.slice(0, 2000))) {
    console.log(consoleText.trimEnd().split(/\r?\n/).slice(0, 20).map((line) => `  │ ${line}`).join('\n'));
  }
  if (result.status !== 'pass') {
    throw new CommandError(`TWIN FAILED: ${design.name} ${result.status} (${result.why}); see out/${design.name}/artifacts/twin/.`, 1);
  }
  const checked = [result.matched.length && `${result.matched.length} expected line(s)`, Object.keys(result.summary_checks).length && `${Object.keys(result.summary_checks).length} summary check(s)`].filter(Boolean).join(', ');
  console.log(`TWIN: ${design.name} pass on ${twin.project} ${release.tag} (${checked})`);
  return result;
}
