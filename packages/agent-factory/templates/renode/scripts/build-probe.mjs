#!/usr/bin/env node
// Builds one probe with the project's toolchain and embeds the source hash AI
// Factory passes, so the board gate can confirm the committed image came from
// the committed sources.
//
// Which compiler and which core: probes/toolchain.json, committed beside the
// probes, names the tool prefix (arm-none-eabi-, aarch64-none-elf-, ...) and
// the core flags (-mcpu=..., -mthumb, ...). They are a property of the project,
// not of the machine: the committed ELFs were built with them, and the file is
// part of the probe source hash. A scaffolded project has them empty, and this
// script refuses to run a compiler until they are filled. SIMULATOR_TOOLCHAIN_BIN
// says where that toolchain's bin directory is on the machine that builds;
// empty means the tools are on PATH there.
//
// The build follows the same SIMULATOR_REMOTE_* axis as the simulator run: with
// SIMULATOR_REMOTE_HOST empty it compiles on this machine, set, it rsyncs the
// probe sources to that host, compiles there over SSH and pulls the ELF back.
// One shared toolchain on one host is the point: every developer's probe image
// then comes out of the same compiler, whatever their own machine has.
//
// The compiler arguments are built once and used by both paths, so an image
// does not depend on where it was compiled.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLCHAIN_FILE = 'probes/toolchain.json';
const need = (name) => {
  const v = process.env[name];
  if (!v) { console.error(`${name} is not set; it is provided by "factory probe build".`); process.exit(2); }
  return v;
};
const opt = (name) => (process.env[name] && process.env[name].trim() !== '' ? process.env[name].trim() : undefined);

const name = need('PROBE_NAME');
const elfOut = need('PROBE_ELF');
const sourceHash = need('PROBE_SOURCE_HASH');
const dir = resolve(PROJECT_ROOT, 'probes', name);

// The core and its compiler are the project's choice, recorded in
// probes/toolchain.json. Refuse before any compiler runs when the project has
// not made it yet.
function readToolchain() {
  const path = resolve(PROJECT_ROOT, TOOLCHAIN_FILE);
  const refuse = (why) => {
    console.error(`${TOOLCHAIN_FILE}: ${why}`);
    console.error('The core, its compiler prefix and its flags are this project\'s choice: fill "prefix" and "cflags" there, with probes/_template/cpu.c and linker.ld for the same core. probes/README.md names the verified examples.');
    process.exit(2);
  };
  if (!existsSync(path)) refuse('missing');
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { refuse(`not valid JSON (${error.message})`); }
  const prefix = typeof parsed.prefix === 'string' ? parsed.prefix.trim() : '';
  if (prefix === '') refuse('"prefix" is empty; the project has not chosen its core and toolchain yet');
  const list = (key) => {
    const value = parsed[key] ?? [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) refuse(`"${key}" must be an array of strings`);
    return value;
  };
  return { prefix, cflags: list('cflags'), ldflags: list('ldflags') };
}
const toolchain = readToolchain();

const sourceNames = readdirSync(dir).filter((f) => f.endsWith('.c')).sort();
if (sourceNames.length === 0) { console.error(`No .c sources in ${dir}`); process.exit(2); }
const hasLinker = existsSync(join(dir, 'linker.ld'));

// The probe stringifies PROBE_SOURCE_HASH into PROBE_SOURCE=<hash> so the gate
// can find it in the ELF without reproducing the build.
// The core flags come first, from toolchain.json. The flags after them are
// the probe contract's and stay here: `-nostdlib` with `-fno-builtin` is what
// makes this a genuinely freestanding build: without them GCC links against
// libc and may turn plain C into implicit memcpy/memset calls, so the probe
// stops building the moment a toolchain ships without newlib. `--gc-sections`
// with per-function sections keeps only what the probe reaches, and
// `--build-id=none` keeps the image byte-reproducible. toolchain.json
// "ldflags" are passed to the link as given (write them as -Wl,... for ld).
const compilerArgs = (probeDir, outPath) => [
  ...toolchain.cflags,
  '-Os', '-ffreestanding', '-fno-builtin',
  '-fdata-sections', '-ffunction-sections',
  '-Wall', '-Wextra', '-Werror', '-nostdlib',
  `-I${probeDir}`,
  `-DPROBE_SOURCE_HASH=${sourceHash}`,
  ...(hasLinker ? [`-Wl,-T,${probeDir}/linker.ld`] : []),
  '-Wl,--gc-sections', '-Wl,--build-id=none',
  ...toolchain.ldflags,
  ...sourceNames.map((f) => `${probeDir}/${f}`),
  '-o', outPath,
];

function gccPath() {
  const bin = opt('SIMULATOR_TOOLCHAIN_BIN');
  const tool = `${toolchain.prefix}gcc`;
  return bin ? `${bin.replace(/\/+$/, '')}/${tool}` : tool;
}

function buildLocally() {
  const result = spawnSync(gccPath(), compilerArgs(dir, elfOut), { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(2); }
  return result.status ?? 1;
}

let remoteHost; let remoteUser;
function ssh(args, options = {}) {
  const port = opt('SIMULATOR_REMOTE_PORT');
  const identity = opt('SIMULATOR_REMOTE_IDENTITY_FILE');
  const base = ['-o', 'BatchMode=yes', ...(port ? ['-p', port] : []), ...(identity ? ['-i', identity] : [])];
  return spawnSync('ssh', [...base, `${remoteUser}@${remoteHost}`, ...args], { stdio: 'inherit', encoding: 'utf8', ...options });
}

function buildRemotely() {
  remoteHost = need('SIMULATOR_REMOTE_HOST');
  remoteUser = opt('SIMULATOR_REMOTE_USER') || 'root';
  const basePath = need('SIMULATOR_REMOTE_BASE_PATH');
  const projectName = opt('SIMULATOR_REMOTE_PROJECT_NAME') || basename(PROJECT_ROOT);
  const port = opt('SIMULATOR_REMOTE_PORT');
  const identity = opt('SIMULATOR_REMOTE_IDENTITY_FILE');
  const remoteRoot = `${basePath.replace(/\/+$/, '')}/${projectName}`;
  const remoteProbe = `${remoteRoot}/probes/${name}`;
  const remoteElf = `${remoteRoot}/build/${name}.elf`;
  const target = `${remoteUser}@${remoteHost}`;
  const sshOpts = ['-o', 'BatchMode=yes', ...(port ? ['-p', port] : []), ...(identity ? ['-i', identity] : [])];
  const rshArg = ['-e', `ssh ${sshOpts.join(' ')}`];

  const mkdir = ssh([`mkdir -p '${remoteProbe}' '${remoteRoot}/build'`]);
  if (mkdir.status !== 0) { console.error('Could not create the remote build directory.'); process.exit(2); }

  // Only this probe's sources travel. The committed ELF and the board trace
  // stay here: the build must not be able to read its own previous output.
  const push = spawnSync('rsync', ['-a', ...rshArg, '--include=*.c', '--include=*.h', '--include=linker.ld',
    '--exclude=*', `${dir}/`, `${target}:${remoteProbe}/`], { stdio: 'inherit' });
  if (push.status !== 0) { console.error('rsync of the probe sources failed.'); process.exit(2); }

  const remoteCmd = `'${gccPath()}' ` + compilerArgs(remoteProbe, remoteElf).map((a) => `'${a}'`).join(' ');
  const build = ssh([remoteCmd]);
  if (build.error) { console.error(build.error.message); process.exit(2); }
  if (build.status !== 0) return build.status ?? 1;

  mkdirSync(dirname(elfOut), { recursive: true });
  const pull = spawnSync('rsync', ['-a', ...rshArg, `${target}:${remoteElf}`, elfOut], { stdio: 'inherit' });
  if (pull.status !== 0) { console.error('Could not pull the built ELF back from the host.'); process.exit(2); }
  return 0;
}

const status = opt('SIMULATOR_REMOTE_HOST') ? buildRemotely() : buildLocally();
if (status === 0 && !existsSync(elfOut)) {
  console.error(`The compiler reported success but ${elfOut} does not exist.`);
  process.exit(1);
}
process.exit(status);
