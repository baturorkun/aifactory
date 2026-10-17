import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { CommandError, PROJECT_ROOT, buildHost, projectPathOnHost, runOnHost } from './vivado-host.mjs';
import { judgeRun, parseTestYaml } from './twin.mjs';

// The board stage: the design's bitstream and ELF on the real board over
// JTAG, its console checked against designs/<design>/test.yaml.
//
// The lab bot switches the board's PDU outlet on (and off again, when it was
// the one to switch it on), xsdb programs the board through the lab's
// hw_server in the order of the team's run_jtag.tcl, and the console is read
// on the lab host while it runs. Every JTAG target is selected by the cable's
// serial, so another board on the same hw_server is never touched. Only
// JTAG: a power cycle clears it, and flash is never written.

// ------------------------------------------------------------
// The lab bot
// ------------------------------------------------------------

async function bot(env, path) {
  const url = (env.BOT_API_URL ?? '').trim().replace(/\/$/, '');
  const token = (env.BOT_API_TOKEN ?? '').trim();
  const response = await fetch(`${url}/api/commands/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new CommandError(`BOARD FAILED: the lab bot answered ${response.status} to ${path}.`, 1);
  const body = await response.json();
  return (body.messages ?? []).join('\n');
}

// The outlet whose label is the board's name, and whether it is on.
export function findOutlet(powerStatus, name) {
  const line = powerStatus.split('\n').find((text) => text.includes(`(${name})`));
  const socket = line?.trim().match(/^([A-Z])\b/)?.[1];
  if (!socket) return undefined;
  return { socket, on: /→\s*On\b/.test(line) };
}

// ------------------------------------------------------------
// The processor init from the XSA (a zip)
// ------------------------------------------------------------

export function readFromZip(zip, suffix) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new CommandError('BOARD FAILED: the XSA is not a zip archive.', 1);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === suffix || name.endsWith(`/${suffix}`)) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new CommandError(`BOARD FAILED: ${name} in the XSA is compressed with method ${method}.`, 1);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return undefined;
}

// What each processor type needs between the bitstream and the ELF. A type
// that is not here stops the stage instead of guessing.
const PROCESSORS = {
  zynq7000: { init: 'ps7_init.tcl', run: ['ps7_init', 'ps7_post_config'], fpga: 'xc7z*', reset: 'APU*', core: '*Cortex-A9*#0' },
};

export function processorType(boardText) {
  return /^processor:\s*\n(?:\s+.*\n)*?\s+type:\s*(\S+)/m.exec(boardText)?.[1];
}

// ------------------------------------------------------------
// The scripts that run on the lab host
// ------------------------------------------------------------

export function loadScript({ hwServer, cable, directory, processor }) {
  const target = (name) => `targets -set -filter {jtag_cable_serial =~ "${cable}*" && name =~ "${name}"}`;
  const file = (name) => `${directory}/${name}`;
  return `# Program the board over JTAG: the order of run_jtag.tcl, every target on cable ${cable}.
if {[catch {
    connect -url TCP:${hwServer}
    if {[llength [targets -filter {jtag_cable_serial =~ "${cable}*"}]] == 0} {
        error "no JTAG target on cable ${cable} at ${hwServer}: is the board on and its cable the one BOARD_JTAG_CABLE names?"
    }
    ${target(processor.reset)}
    rst -system
    after 1000
    ${target(processor.fpga)}
    fpga ${file('fpga.bit')}
    ${target(processor.reset)}
    source ${file(processor.init)}
${processor.run.map((command) => `    ${command}`).join('\n')}
    ${target(processor.core)}
    dow ${file('app.elf')}
    con
    puts "BOARD LOADED"
    disconnect
} message]} {
    puts "BOARD LOAD FAILED: $message"
    exit 1
}
exit 0
`;
}

// POSIX sh, so the lab host needs nothing but a shell, stty and xsdb.
export function runScript() {
  return `#!/bin/sh
# Read the console while the board is programmed: $1 xsdb, $2 serial port,
# $3 baud, $4 seconds to read after programming.
set -u
cd "$(dirname "$0")"
xsdb="$1"; port="$2"; baud="$3"; seconds="$4"
rm -f console.log xsdb.log xsdb-status.txt error.txt
if [ ! -e "$port" ]; then echo "BOARD_SERIAL_PORT $port does not exist on $(hostname): is the board on?" > error.txt; exit 0; fi
if ! stty -F "$port" "$baud" raw -echo -ixon 2>error.txt; then echo "cannot set up $port at $baud baud" >> error.txt; exit 0; fi
rm -f error.txt
cat "$port" > console.log &
reader=$!
trap 'kill "$reader" 2>/dev/null' EXIT
"$xsdb" load.tcl > xsdb.log 2>&1
echo "$?" > xsdb-status.txt
sleep "$seconds"
exit 0
`;
}

// ------------------------------------------------------------
// The stage
// ------------------------------------------------------------

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function required(env, name, what) {
  const value = (env[name] ?? '').trim();
  if (!value) throw new CommandError(`${name} is not set: ${what}. Add it to .env.`, 2);
  return value;
}

export async function boardStage(settings, design, boardText, env) {
  const label = `\n▸ ${design.name}: board`;
  if (!design.VITIS) {
    console.log(`${label}: no software (VITIS is not set), nothing to run on the board`);
    return { status: 'skipped' };
  }
  const testPath = join(PROJECT_ROOT, 'designs', design.name, 'test.yaml');
  if (!existsSync(testPath)) {
    console.log(`${label}: no designs/${design.name}/test.yaml, nothing to check on the board`);
    return { status: 'skipped' };
  }
  const test = { ...parseTestYaml(readFileSync(testPath, 'utf8')), summary: {} };
  if (test.expect.length === 0) {
    console.log(`${label}: test.yaml has no console line to expect, and the board has only its console`);
    return { status: 'skipped' };
  }
  const type = processorType(boardText);
  const processor = PROCESSORS[type];
  if (!processor) {
    throw new CommandError(`BOARD FAILED: boards/${design.BOARD}.yaml processor type "${type ?? 'none'}" has no JTAG load sequence here yet (known: ${Object.keys(PROCESSORS).join(', ')}).`, 2);
  }
  if (settings.remote && settings.hostType !== 'linux') {
    throw new CommandError('BOARD_HOST_TYPE must be linux: the lab host reads the console with stty.', 2);
  }
  const hwServer = required(env, 'BOARD_HW_SERVER', 'the hw_server the board\'s JTAG cable is on, host:port');
  const cable = required(env, 'BOARD_JTAG_CABLE', 'the serial of the board\'s JTAG cable, as hw_server lists it');
  const port = required(env, 'BOARD_SERIAL_PORT', 'the board\'s console on the lab host, e.g. /dev/serial/by-id/...');
  const xsdb = required(env, 'XSDB_BIN', 'xsdb on the lab host');
  const baud = (env.BOARD_SERIAL_BAUD ?? '').trim() || '115200';
  if (!/^[A-Za-z0-9._:-]+$/.test(hwServer) || !/^[A-Za-z0-9]+$/.test(cable)) {
    throw new CommandError('BOARD_HW_SERVER is host:port and BOARD_JTAG_CABLE letters and digits.', 2);
  }

  const artifacts = join(PROJECT_ROOT, 'out', design.name, 'artifacts');
  const files = { bit: join(artifacts, `${design.TOP}.bit`), xsa: join(artifacts, `${design.TOP}.xsa`), elf: join(artifacts, `${design.name}_app.elf`) };
  for (const [what, path] of Object.entries(files)) {
    if (!existsSync(path)) throw new CommandError(`BOARD FAILED: no out/${design.name}/artifacts/${path.split(/[\\/]/).pop()} (${what}); run the build and sw stages first.`, 1);
  }
  const init = readFromZip(readFileSync(files.xsa), processor.init);
  if (!init) throw new CommandError(`BOARD FAILED: the XSA has no ${processor.init}.`, 1);

  const relative = `board-run/${design.name}`;
  const local = join(PROJECT_ROOT, relative);
  rmSync(local, { recursive: true, force: true });
  mkdirSync(local, { recursive: true });
  copyFileSync(files.bit, join(local, 'fpga.bit'));
  copyFileSync(files.elf, join(local, 'app.elf'));
  writeFileSync(join(local, processor.init), init);
  writeFileSync(join(local, 'load.tcl'), loadScript({ hwServer, cable, directory: `${projectPathOnHost(settings)}/${relative}`, processor }));
  writeFileSync(join(local, 'run.sh'), runScript());

  // Power: on when it is off, and off again at the end only then.
  const powerName = (env.BOARD_POWER_NAME ?? '').trim();
  let outlet;
  let poweredHere = false;
  if (powerName) {
    required(env, 'BOT_API_URL', 'the lab bot, to switch the board\'s outlet');
    required(env, 'BOT_API_TOKEN', 'the lab bot\'s token');
    outlet = findOutlet(await bot(env, 'power/status'), powerName);
    if (!outlet) throw new CommandError(`BOARD FAILED: no outlet is labelled "${powerName}" in the lab bot's power status.`, 1);
    if (!outlet.on) {
      await bot(env, `power/on/${outlet.socket}`);
      poweredHere = true;
      const settle = Number(env.BOARD_POWER_SETTLE_S || 8);
      console.log(`${label}: outlet ${outlet.socket} ("${powerName}") switched on, ${settle} s for the board to come up`);
      await new Promise((resolve) => setTimeout(resolve, settle * 1000));
    }
  }

  console.log(`${label} (${hwServer}, cable ${cable}, console ${port} on ${buildHost(settings)}, ${test.timeout_s} s)`);
  const started = Date.now();
  let runError;
  try {
    runOnHost(settings, ['sh', `${relative}/run.sh`, xsdb, port, baud, String(Math.ceil(test.timeout_s))], {
      pulls: [relative],
      description: `Board run of ${design.name}`,
    });
  } catch (error) {
    runError = error;
  } finally {
    if (poweredHere) {
      await bot(env, `power/off/${outlet.socket}`);
      console.log(`${label}: outlet ${outlet.socket} switched off again`);
    }
  }

  const read = (name) => (existsSync(join(local, name)) ? readFileSync(join(local, name), 'utf8') : '');
  const setupError = read('error.txt').trim();
  const xsdbText = read('xsdb.log').trim();
  const xsdbStatus = read('xsdb-status.txt').trim();
  const consoleText = read('console.log');
  let verdict;
  if (runError) verdict = { status: 'error', matched: [], missing: test.expect, failed_on: null, summary_checks: {}, why: String(runError.message ?? runError) };
  else if (setupError) verdict = { status: 'error', matched: [], missing: test.expect, failed_on: null, summary_checks: {}, why: setupError };
  else if (xsdbStatus !== '0') {
    const reason = /BOARD LOAD FAILED: (.*)/.exec(xsdbText)?.[1] ?? `xsdb exited with ${xsdbStatus || 'no status'}`;
    verdict = { status: 'error', matched: [], missing: test.expect, failed_on: null, summary_checks: {}, why: reason };
  } else verdict = judgeRun({ exitStatus: 0, summary: null, consoleText }, test);

  const result = {
    target: 'board',
    design: design.name,
    board: design.BOARD,
    ...verdict,
    cable,
    hw_server: hwServer,
    powered_here: poweredHere,
    bit_sha256: sha256(files.bit),
    elf_sha256: sha256(files.elf),
    host: buildHost(settings),
    duration_s: Math.round((Date.now() - started) / 100) / 10,
  };
  const out = join(artifacts, 'board');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(out, 'console.log'), consoleText);
  writeFileSync(join(out, 'xsdb.log'), xsdbText + '\n');

  if (consoleText.trim()) console.log(consoleText.replace(/\r/g, '').trimEnd().split('\n').slice(0, 20).map((line) => `  │ ${line}`).join('\n'));
  if (result.status !== 'pass') {
    throw new CommandError(`BOARD FAILED: ${design.name} ${result.status} (${result.why}); see out/${design.name}/artifacts/board/.`, 1);
  }
  console.log(`BOARD: ${design.name} pass on cable ${cable} (${result.matched.length} expected line(s) seen)`);
  return result;
}
