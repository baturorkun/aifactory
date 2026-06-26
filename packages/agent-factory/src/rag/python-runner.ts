import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export type RagEnvCommand = 'up' | 'down' | 'status';

const CORE_ROOT = resolve(__dirname, '../../../..');
const RAG_SERVICE_ROOT = resolve(CORE_ROOT, 'services/rag');
const RAG_SOURCE_ROOT = resolve(RAG_SERVICE_ROOT, 'src');
const RAG_COMPOSE_FILE = resolve(CORE_ROOT, 'infra/rag/compose.yaml');
const RAG_VENV_ROOT = resolve(CORE_ROOT, '.venv-rag');

export function runRagPython(args: string[], cwd: string = process.cwd()): void {
  const python = resolveRagPython();
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
        `Run: pnpm factory rag install`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Python RAG worker failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

export function installRagPython(): void {
  const requestedPython = process.env.AIFACTORY_RAG_PYTHON;
  const python = requestedPython ?? 'python3';

  if (!requestedPython && !existsSync(venvPythonPath())) {
    console.log(`Creating RAG Python virtual environment: ${RAG_VENV_ROOT}`);
    runPythonCommand(python, ['-m', 'venv', RAG_VENV_ROOT], 'create RAG Python virtual environment');
  }

  const installPython = requestedPython ?? venvPythonPath();
  runPythonCommand(installPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], 'upgrade pip');
  runPythonCommand(installPython, ['-m', 'pip', 'install', '-e', RAG_SERVICE_ROOT], 'install RAG Python dependencies');
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

function runPythonCommand(python: string, args: string[], action: string): void {
  const result = spawnSync(python, args, {
    cwd: CORE_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new Error(
      `Failed to start Python with "${python}" while trying to ${action}. ` +
        `Install Python 3.11+ or set AIFACTORY_RAG_PYTHON.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`Failed to ${action}; Python exited with code ${result.status ?? 'unknown'}.`);
  }
}

function resolveRagPython(): string {
  if (process.env.AIFACTORY_RAG_PYTHON) return process.env.AIFACTORY_RAG_PYTHON;
  const venvPython = venvPythonPath();
  if (existsSync(venvPython)) return venvPython;
  throw new Error(
    `RAG Python environment is not installed. Run: pnpm factory rag install`,
  );
}

function venvPythonPath(): string {
  if (process.platform === 'win32') {
    return resolve(RAG_VENV_ROOT, 'Scripts/python.exe');
  }
  return resolve(RAG_VENV_ROOT, 'bin/python');
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
