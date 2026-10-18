import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { userInfo } from 'os';
import { resolve } from 'path';
import { z } from 'zod';

// The lab, described once (RQ-0047): the hosts embedded projects build on,
// run their twins and program their boards on, and the board units on the
// bench. A new embedded project's .env is filled from it, so nobody looks the
// same addresses up again. It holds no secret.

export const LAB_INVENTORY_PATH = resolve(__dirname, '../../../lab/inventory.json');

const UnitSchema = z.object({
  board: z.string().min(1),
  powerName: z.string().min(1).optional(),
  jtagCable: z.string().regex(/^[A-Za-z0-9]+$/),
  serialPort: z.string().min(1),
  serialBaud: z.number().int().positive().default(115200),
  twinProject: z.string().regex(/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/).optional(),
  twinConsole: z.string().regex(/^[A-Za-z0-9._-]+$/).optional(),
});

export const LabInventorySchema = z.object({
  gitlab: z.object({ url: z.string().url(), group: z.string().min(1) }).optional(),
  vivado: z.object({
    host: z.string().min(1),
    user: z.string().min(1),
    hostType: z.enum(['windows', 'linux']),
    basePath: z.string().min(1),
    vivadoBin: z.string().min(1),
    vitisBin: z.string().min(1),
    version: z.string().min(1),
  }),
  lab: z.object({
    host: z.string().min(1),
    user: z.string().min(1),
    hostType: z.literal('linux'),
    boardBasePath: z.string().startsWith('/'),
    twinBasePath: z.string().startsWith('/'),
    hwServer: z.string().regex(/^[A-Za-z0-9._-]+:\d+$/),
    xsdbBin: z.string().min(1),
  }),
  bot: z.object({ url: z.string().url() }).optional(),
  twin: z.object({ gitlab: z.string().url(), registry: z.string().min(1) }).optional(),
  units: z.record(UnitSchema).default({}),
  known: z.record(z.object({ powerName: z.string().optional(), jtagCable: z.string().optional() }).passthrough()).default({}),
});
export type LabInventory = z.infer<typeof LabInventorySchema>;

export function loadLabInventory(path = LAB_INVENTORY_PATH): LabInventory | undefined {
  if (!existsSync(path)) return undefined;
  // "$comment" entries explain the file to a reader; they are not data.
  const data = JSON.parse(readFileSync(path, 'utf8'), (key, value) => (key.startsWith('$') ? undefined : value));
  return LabInventorySchema.parse(data);
}

// Whose project copy a host keeps: one per person, so two people building the
// same project do not share a Vivado project.
export function personSlug(cwd: string): string {
  const name = spawnSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' }).stdout?.trim() || userInfo().username;
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user';
}

// The .env values an embedded project takes from the inventory. A unit, when
// given, adds the board settings; without one they stay empty.
export function embeddedEnvValues(
  inventory: LabInventory,
  projectName: string,
  person: string,
  unitName?: string,
): Record<string, string> {
  const hostProject = `${projectName}-${person}`;
  const values: Record<string, string> = {
    VIVADO_HOST_TYPE: inventory.vivado.hostType,
    VIVADO_REMOTE_HOST: inventory.vivado.host,
    VIVADO_REMOTE_USER: inventory.vivado.user,
    VIVADO_REMOTE_PORT: '22',
    VIVADO_REMOTE_BASE_PATH: inventory.vivado.basePath,
    VIVADO_REMOTE_PROJECT_NAME: hostProject,
    VIVADO_BIN: inventory.vivado.vivadoBin,
    VITIS_BIN: inventory.vivado.vitisBin,
    TWIN_HOST_TYPE: inventory.lab.hostType,
    TWIN_REMOTE_HOST: inventory.lab.host,
    TWIN_REMOTE_USER: inventory.lab.user,
    TWIN_REMOTE_PORT: '22',
    TWIN_REMOTE_BASE_PATH: inventory.lab.twinBasePath,
    TWIN_REMOTE_PROJECT_NAME: hostProject,
    ...(inventory.twin ? { TWIN_GITLAB_URL: inventory.twin.gitlab, TWIN_REGISTRY: inventory.twin.registry } : {}),
    ...(inventory.bot ? { BOT_API_URL: inventory.bot.url } : {}),
    ...(inventory.gitlab ? { GITLAB_URL: inventory.gitlab.url, GITLAB_PROJECT_ID: `${inventory.gitlab.group}/${projectName}` } : {}),
  };
  if (unitName === undefined) return values;
  const unit = inventory.units[unitName];
  if (!unit) {
    const known = Object.keys(inventory.known);
    throw new Error(
      `No lab unit "${unitName}". Configured: ${Object.keys(inventory.units).join(', ') || 'none'}`
      + (known.length ? `; known but not configured yet: ${known.join(', ')}.` : '.'),
    );
  }
  return {
    ...values,
    ...(unit.powerName ? { BOARD_POWER_NAME: `"${unit.powerName}"` } : {}),
    BOARD_HOST_TYPE: inventory.lab.hostType,
    BOARD_REMOTE_HOST: inventory.lab.host,
    BOARD_REMOTE_USER: inventory.lab.user,
    BOARD_REMOTE_PORT: '22',
    BOARD_REMOTE_BASE_PATH: inventory.lab.boardBasePath,
    BOARD_REMOTE_PROJECT_NAME: hostProject,
    BOARD_HW_SERVER: inventory.lab.hwServer,
    BOARD_JTAG_CABLE: unit.jtagCable,
    BOARD_SERIAL_PORT: unit.serialPort,
    BOARD_SERIAL_BAUD: String(unit.serialBaud),
    XSDB_BIN: inventory.lab.xsdbBin,
    ...(unit.twinProject ? { TWIN_PROJECT: unit.twinProject } : {}),
    ...(unit.twinConsole ? { TWIN_CONSOLE: unit.twinConsole } : {}),
  };
}

// The settings every project of the lab shares, as they stand in the lab
// GitLabs' instance-level CI/CD variables (RQ-0048): the Vivado host, the lab
// host with its hw_server and xsdb, the bot, and the twins' GitLab and registry. Per-unit and per-person values
// are not among them.
export function labWideCiValues(inventory: LabInventory): Record<string, string> {
  return {
    VIVADO_HOST_TYPE: inventory.vivado.hostType,
    VIVADO_REMOTE_HOST: inventory.vivado.host,
    VIVADO_REMOTE_USER: inventory.vivado.user,
    VIVADO_REMOTE_PORT: '22',
    VIVADO_REMOTE_BASE_PATH: inventory.vivado.basePath,
    VIVADO_BIN: inventory.vivado.vivadoBin,
    VITIS_BIN: inventory.vivado.vitisBin,
    BOARD_HOST_TYPE: inventory.lab.hostType,
    BOARD_REMOTE_HOST: inventory.lab.host,
    BOARD_REMOTE_USER: inventory.lab.user,
    BOARD_REMOTE_BASE_PATH: inventory.lab.boardBasePath,
    BOARD_HW_SERVER: inventory.lab.hwServer,
    XSDB_BIN: inventory.lab.xsdbBin,
    ...(inventory.bot ? { BOT_API_URL: inventory.bot.url } : {}),
    ...(inventory.twin ? { TWIN_GITLAB_URL: inventory.twin.gitlab, TWIN_REGISTRY: inventory.twin.registry } : {}),
  };
}

// .env.example with the given values filled in: each `NAME=` line takes its
// value, everything else (comments, other settings) stays as it is.
export function fillEnv(example: string, values: Record<string, string>): string {
  const seen = new Set<string>();
  return example.split('\n').map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match || !(match[1] in values) || seen.has(match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  }).join('\n');
}
