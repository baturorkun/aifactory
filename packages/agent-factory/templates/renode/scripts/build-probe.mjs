#!/usr/bin/env node
// Builds one probe with the ARM toolchain and embeds the source hash AI Factory
// passes, so the board gate can confirm the committed image came from the
// committed sources.
//
// The build follows the same SIMULATOR_REMOTE_* axis as the simulator run: with
// SIMULATOR_REMOTE_HOST empty it compiles on this machine, set, it rsyncs the
// probe sources to that host, compiles there over SSH and pulls the ELF back.
// One shared toolchain on one host is the point: every developer's probe image
// then comes out of the same compiler, whatever their own machine has.
// SIMULATOR_TOOLCHAIN_BIN names the arm-none-eabi bin directory on whichever
// machine does the building; empty means the tools are on PATH there.
//
// The compiler arguments are built once and used by both paths, so an image
// does not depend on where it was compiled.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

const sourceNames = readdirSync(dir).filter((f) => f.endsWith('.c')).sort();
if (sourceNames.length === 0) { console.error(`No .c sources in ${dir}`); process.exit(2); }
const hasLinker = existsSync(join(dir, 'linker.ld'));

// The probe stringifies PROBE_SOURCE_HASH into PROBE_SOURCE=<hash> so the gate
// can find it in the ELF without reproducing the build.
// `-nostdlib` with `-fno-builtin` is what makes this a genuinely freestanding
// build: without them GCC links against libc and may turn plain C into implicit
// memcpy/memset calls, so the probe stops building the moment a toolchain ships
// without newlib. `--gc-sections` with per-function sections keeps only what the
// probe reaches, and `--build-id=none` keeps the image byte-reproducible. These
// are the flags the committed images were built with.
const compilerArgs = (probeDir, outPath) => [
  '-mcpu=cortex-m3', '-mthumb', '-Os', '-ffreestanding', '-fno-builtin',
  '-fdata-sections', '-ffunction-sections',
  '-Wall', '-Wextra', '-Werror', '-nostdlib',
  `-I${probeDir}`,
  `-DPROBE_SOURCE_HASH=${sourceHash}`,
  ...(hasLinker ? [`-Wl,-T,${probeDir}/linker.ld`] : []),
  '-Wl,--gc-sections', '-Wl,--build-id=none',
  ...sourceNames.map((f) => `${probeDir}/${f}`),
  '-o', outPath,
];

function gccPath() {
  const bin = opt('SIMULATOR_TOOLCHAIN_BIN');
  return bin ? `${bin.replace(/\/+$/, '')}/arm-none-eabi-gcc` : 'arm-none-eabi-gcc';
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
