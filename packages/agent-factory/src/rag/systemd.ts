import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const CORE_ROOT = resolve(__dirname, '../../../..');
const RAG_SOURCE_ROOT = resolve(CORE_ROOT, 'services/rag/src');
const RAG_PYTHON = resolve(CORE_ROOT, '.venv-rag/bin/python');
const SERVICE_NAME = 'aifactory-rag.service';
const SERVICE_PATH = `/etc/systemd/system/${SERVICE_NAME}`;

export interface RagServiceInstallOptions {
  host: string;
  port: string;
  user?: string;
  start: boolean;
}

export type RagServiceAction = 'start' | 'stop' | 'restart' | 'status';

export function installRagService(options: RagServiceInstallOptions): void {
  requireSystemd();

  const configPath = resolve(process.cwd(), 'factory.config.json');
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(configPath)) {
    throw new Error(`RAG config not found: ${configPath}`);
  }
  if (!existsSync(RAG_PYTHON)) {
    throw new Error('RAG Python environment is not installed. Run: pnpm factory rag install');
  }
  if (!/^\d+$/.test(options.port)) {
    throw new Error(`Invalid API port: ${options.port}`);
  }

  const serviceUser = options.user ?? defaultServiceUser();
  const unit = renderUnit({
    configPath,
    envPath,
    host: options.host,
    port: options.port,
    user: serviceUser,
  });

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'aifactory-rag-systemd-'));
  const temporaryUnit = join(temporaryRoot, SERVICE_NAME);
  try {
    writeFileSync(temporaryUnit, unit, { encoding: 'utf8', mode: 0o644 });
    runPrivileged('install', ['-m', '0644', temporaryUnit, SERVICE_PATH]);
    runSystemctl(['daemon-reload']);
    if (options.start) {
      runSystemctl(['enable', '--now', SERVICE_NAME]);
    } else {
      runSystemctl(['enable', SERVICE_NAME]);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  console.log(`Installed systemd service: ${SERVICE_NAME}`);
  console.log(`Service user             : ${serviceUser}`);
  console.log(`API address              : http://${options.host}:${options.port}`);
  console.log(`Environment file         : ${envPath}${existsSync(envPath) ? '' : ' (not found, optional)'}`);
}

export function runRagService(action: RagServiceAction): void {
  requireSystemd();
  const allowedStatuses = action === 'status' ? [0, 3, 4] : [0];
  runSystemctl([action, SERVICE_NAME], allowedStatuses);
}

export function showRagServiceLogs(lines: string, follow: boolean): void {
  requireSystemd();
  if (!/^\d+$/.test(lines)) {
    throw new Error(`Invalid log line count: ${lines}`);
  }
  runPrivileged(
    'journalctl',
    ['-u', SERVICE_NAME, '-n', lines, ...(follow ? ['-f'] : []), '--no-pager'],
  );
}

export function uninstallRagService(): void {
  requireSystemd();

  if (existsSync(SERVICE_PATH)) {
    runSystemctl(['disable', '--now', SERVICE_NAME], [0, 1, 5]);
    runPrivileged('rm', ['-f', SERVICE_PATH]);
    runSystemctl(['daemon-reload']);
    runSystemctl(['reset-failed', SERVICE_NAME], [0, 1, 5]);
  }

  console.log(`Removed systemd service: ${SERVICE_NAME}`);
}

function renderUnit(options: {
  configPath: string;
  envPath: string;
  host: string;
  port: string;
  user: string;
}): string {
  return `[Unit]
Description=AI Factory RAG API
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=${systemdValue(options.user)}
WorkingDirectory=${systemdValue(CORE_ROOT)}
EnvironmentFile=-${systemdValue(options.envPath)}
Environment=${systemdValue(`PYTHONPATH=${RAG_SOURCE_ROOT}`)}
ExecStart=${systemdValue(RAG_PYTHON)} -m aifactory_rag --config ${systemdValue(options.configPath)} api start --host ${systemdValue(options.host)} --port ${systemdValue(options.port)}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
}

function defaultServiceUser(): string {
  return process.env.SUDO_USER || process.env.USER || 'root';
}

function systemdValue(value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error('systemd service values cannot contain line breaks.');
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function requireSystemd(): void {
  if (process.platform !== 'linux') {
    throw new Error('RAG systemd service commands are only supported on Linux.');
  }
  const result = spawnSync('systemctl', ['--version'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw new Error('systemd/systemctl is not available on this server.');
  }
}

function runSystemctl(args: string[], allowedStatuses: number[] = [0]): void {
  runPrivileged('systemctl', args, allowedStatuses);
}

function runPrivileged(
  command: string,
  args: string[],
  allowedStatuses: number[] = [0],
): void {
  const needsSudo = typeof process.getuid === 'function' && process.getuid() !== 0;
  const executable = needsSudo ? 'sudo' : command;
  const commandArgs = needsSudo ? [command, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: CORE_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    const hint = needsSudo ? ' Ensure sudo is installed and you can elevate privileges.' : '';
    throw new Error(`Failed to run ${command}: ${result.error.message}.${hint}`);
  }
  if (result.status === null || !allowedStatuses.includes(result.status)) {
    throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}
