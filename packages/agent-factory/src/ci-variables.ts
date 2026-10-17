import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Writes a project's host and board settings from .env into its GitLab CI/CD
// variables (RQ-0047), so the pipeline reaches the same Vivado host, Docker
// host and lab as a developer does. Tokens are written only when asked, and
// then masked. A key file or known_hosts is a path on this machine, which CI
// needs as a File variable instead: those are left out, and so are the
// per-person host project names, which every CI job sets for itself.

export interface CiVariable {
  key: string;
  value: string;
  secret: boolean;
}

const SETTING = /^(VIVADO|TWIN|BOARD)_[A-Z0-9_]+$|^(VITIS|XSDB)_BIN$|^BOT_API_(URL|TOKEN)$/;
const SECRET = /TOKEN|PASSWORD|SECRET|_KEY$/;
const LEFT_OUT = /_IDENTITY_FILE$|_KNOWN_HOSTS$|_REMOTE_PROJECT_NAME$/;

export function readDotEnv(projectRoot: string): Record<string, string> {
  const path = join(projectRoot, '.env');
  if (!existsSync(path)) throw new Error('The project has no .env to take the settings from.');
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

export function ciVariables(env: Record<string, string>, withSecrets = false): CiVariable[] {
  return Object.entries(env)
    .filter(([key, value]) => SETTING.test(key) && !LEFT_OUT.test(key) && value !== '')
    .map(([key, value]) => ({ key, value, secret: SECRET.test(key) }))
    .filter((variable) => withSecrets || !variable.secret)
    .sort((a, b) => a.key.localeCompare(b.key));
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// Creates or updates each variable; returns what it did per key.
export async function writeCiVariables(
  gitlab: { baseUrl: string; projectId: string; token: string },
  variables: CiVariable[],
  fetchImpl: Fetch = fetch as unknown as Fetch,
): Promise<Record<string, 'created' | 'updated'>> {
  const project = `${gitlab.baseUrl.replace(/\/$/, '')}/api/v4/projects/${encodeURIComponent(gitlab.projectId)}/variables`;
  const headers = { 'PRIVATE-TOKEN': gitlab.token, 'Content-Type': 'application/x-www-form-urlencoded' };
  const done: Record<string, 'created' | 'updated'> = {};
  for (const variable of variables) {
    const body = new URLSearchParams({ value: variable.value, raw: 'true', masked: String(variable.secret) });
    const update = await fetchImpl(`${project}/${encodeURIComponent(variable.key)}`, { method: 'PUT', headers, body: body.toString() });
    if (update.ok) {
      done[variable.key] = 'updated';
      continue;
    }
    if (update.status !== 404) throw new Error(`GitLab refused ${variable.key} (${update.status}): ${await update.text()}`);
    body.set('key', variable.key);
    const create = await fetchImpl(project, { method: 'POST', headers, body: body.toString() });
    if (!create.ok) throw new Error(`GitLab refused ${variable.key} (${create.status}): ${await create.text()}`);
    done[variable.key] = 'created';
  }
  return done;
}
