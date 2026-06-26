import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export type RagEnvCommand = 'up' | 'down' | 'status';

const CORE_ROOT = resolve(__dirname, '../../../..');
const RAG_SERVICE_ROOT = resolve(CORE_ROOT, 'services/rag');
const RAG_SOURCE_ROOT = resolve(RAG_SERVICE_ROOT, 'src');
const RAG_COMPOSE_FILE = resolve(CORE_ROOT, 'infra/rag/compose.yaml');

export function runRagPython(args: string[], cwd: string = process.cwd()): void {
  const python = process.env.AIFACTORY_RAG_PYTHON ?? 'python3';
  const configPath = resolve(cwd, 'factory.config.json');
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${RAG_SOURCE_ROOT}:${process.env.PYTHONPATH}`
      : RAG_SOURCE_ROOT,
  };

  const result = spawnSync(
    python,
    ['-m', 'aifactory_rag', '--config', configPath, ...args],
    {
      cwd,
      env,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw new Error(
      `Failed to start Python RAG worker with "${python}". ` +
        `Install Python 3.11+ and the service dependencies with: ` +
        `python3 -m pip install -e ${RAG_SERVICE_ROOT}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Python RAG worker failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

export function installRagPython(): void {
  const python = process.env.AIFACTORY_RAG_PYTHON ?? 'python3';
  const result = spawnSync(python, ['-m', 'pip', 'install', '-e', RAG_SERVICE_ROOT], {
    cwd: CORE_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new Error(
      `Failed to start Python with "${python}". Install Python 3.11+ or set AIFACTORY_RAG_PYTHON.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`RAG Python dependency install failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

export function runRagEnv(command: RagEnvCommand): void {
  if (!existsSync(RAG_COMPOSE_FILE)) {
    throw new Error(`RAG compose file not found: ${RAG_COMPOSE_FILE}`);
  }

  const runtime = findComposeRuntime();
  const args =
    command === 'up' ? [...runtime.args, '-f', RAG_COMPOSE_FILE, 'up', '-d']
    : command === 'down' ? [...runtime.args, '-f', RAG_COMPOSE_FILE, 'down']
    : [...runtime.args, '-f', RAG_COMPOSE_FILE, 'ps'];

  const result = spawnSync(runtime.bin, args, {
    cwd: resolve(CORE_ROOT, 'infra/rag'),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new Error(`Failed to run ${runtime.label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${runtime.label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function findComposeRuntime(): { bin: string; args: string[]; label: string } {
  const candidates = [
    { bin: 'podman', args: ['compose'], label: 'podman compose' },
    { bin: 'docker', args: ['compose'], label: 'docker compose' },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.bin, [...candidate.args, 'version'], {
      stdio: 'ignore',
      env: process.env,
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    'No working compose runtime found. Install/start Docker or Podman first; AI Factory only creates and runs containers.',
  );
}
