import { existsSync, readFileSync } from 'fs';
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
  // The console as the bot's portmap lists it, device agent/COM (lab/COM21):
  // with one, a new project reaches the board through the bot (RQ-0055).
  console: z.string().regex(/^[A-Za-z0-9_-]+\/COM\d+$/).optional(),
});

export const LabInventorySchema = z.object({
  gitlab: z.object({ url: z.string().url(), group: z.string().min(1) }).optional(),
  vivado: z.object({
    host: z.string().min(1),
    user: z.string().min(1),
    hostType: z.enum(['windows', 'linux']),
    // The bot's name for its agent on this host: with one, a new project runs the
    // tools there through the bot (VIVADO_ACCESS=bot, RQ-0057).
    botAgent: z.string().regex(/^[A-Za-z0-9._-]+$/).optional(),
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
    // The bot's name for this host (its Linux device host id): with one, a new
    // project runs the twin on this host's Docker through the bot (RQ-0056).
    botAgent: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
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

// The .env values an embedded project takes from the inventory. A unit, when
// given, adds the board settings; without one they stay empty.
// No person is named here (RQ-0058): the developer's name is BOT_API_AGENT,
// set by hand, and their Vivado account (VIVADO_REMOTE_USER) and their copies
// of the project on the hosts (*_REMOTE_PROJECT_NAME, <project>-<name>)
// follow from it in the scripts, so a .env handed to someone else changes in
// that one line. The inventory's Vivado user is the CI account; the lab
// host's user is the lab's (root) for everyone.
export function embeddedEnvValues(
  inventory: LabInventory,
  projectName: string,
  unitName?: string,
): Record<string, string> {
  const values: Record<string, string> = {
    VIVADO_ACCESS: inventory.vivado.botAgent ? 'bot' : 'ssh',
    ...(inventory.vivado.botAgent ? { VIVADO_BOT_AGENT: inventory.vivado.botAgent } : {}),
    VIVADO_HOST_TYPE: inventory.vivado.hostType,
    VIVADO_REMOTE_HOST: inventory.vivado.host,
    VIVADO_REMOTE_PORT: '22',
    VIVADO_REMOTE_BASE_PATH: inventory.vivado.basePath,
    VIVADO_BIN: inventory.vivado.vivadoBin,
    VITIS_BIN: inventory.vivado.vitisBin,
    TWIN_ACCESS: inventory.lab.botAgent ? 'bot' : 'ssh',
    ...(inventory.lab.botAgent ? { TWIN_BOT_AGENT: inventory.lab.botAgent } : {}),
    TWIN_HOST_TYPE: inventory.lab.hostType,
    TWIN_REMOTE_HOST: inventory.lab.host,
    TWIN_REMOTE_USER: inventory.lab.user,
    TWIN_REMOTE_PORT: '22',
    TWIN_REMOTE_BASE_PATH: inventory.lab.twinBasePath,
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
    BOARD_ACCESS: unit.console ? 'bot' : 'ssh',
    ...(unit.console ? { BOARD_CONSOLE: unit.console } : {}),
    BOARD_HOST_TYPE: inventory.lab.hostType,
    BOARD_REMOTE_HOST: inventory.lab.host,
    BOARD_REMOTE_USER: inventory.lab.user,
    BOARD_REMOTE_PORT: '22',
    BOARD_REMOTE_BASE_PATH: inventory.lab.boardBasePath,
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
// host with its hw_server and xsdb, and the bot. The twin is not among them:
// its GitLab, project and registry name one twin together and are the
// project's, as in bfi-sw (RQ-0049). Per-unit and per-person values
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
