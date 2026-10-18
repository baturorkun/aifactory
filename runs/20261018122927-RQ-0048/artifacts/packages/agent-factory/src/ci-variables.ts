import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Writes a project's host and board settings from .env into its GitLab CI/CD
// variables (RQ-0047), so the pipeline reaches the same Vivado host, Docker
// host and lab as a developer does. Tokens are written only when asked, and
// then masked. A key file or known_hosts is a path on this machine, which CI
// needs as a File variable instead: those are left out, and so are the
// per-person host project names, which every CI job sets for itself.
//
// What the whole lab shares is an instance-level variable on the lab GitLabs
// (RQ-0048). A project copy would shadow it and go stale when the lab changes,
// so a setting equal to its lab-wide value is not written, and neither are the
// lab-wide tokens; a project that differs (another host, another base path)
// still gets its own value.

export interface CiVariable {
  key: string;
  value: string;
  secret: boolean;
}

const SETTING = /^(VIVADO|TWIN|BOARD)_[A-Z0-9_]+$|^(VITIS|XSDB)_BIN$|^BOT_API_(URL|TOKEN)$/;
const SECRET = /TOKEN|PASSWORD|SECRET|_KEY$/;
const LEFT_OUT = /_IDENTITY_FILE$|_KNOWN_HOSTS$|_REMOTE_PROJECT_NAME$/;
export const LAB_WIDE_SECRETS = ['BOT_API_TOKEN', 'TWIN_GITLAB_TOKEN'];

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

export function ciVariables(env: Record<string, string>, withSecrets = false, labWide: Record<string, string> = {}): CiVariable[] {
  return Object.entries(env)
    .filter(([key, value]) => SETTING.test(key) && !LEFT_OUT.test(key) && value !== '')
    .filter(([key, value]) => !isLabWide(key, value, labWide))
    .map(([key, value]) => ({ key, value, secret: SECRET.test(key) }))
    .filter((variable) => withSecrets || !variable.secret)
    .sort((a, b) => a.key.localeCompare(b.key));
}

// The settings of .env the lab already provides, which ciVariables leaves out.
export function labWideKeys(env: Record<string, string>, labWide: Record<string, string>): string[] {
  return Object.entries(env).filter(([key, value]) => value !== '' && isLabWide(key, value, labWide)).map(([key]) => key).sort();
}

function isLabWide(key: string, value: string, labWide: Record<string, string>): boolean {
  if (Object.keys(labWide).length === 0) return false;
  return LAB_WIDE_SECRETS.includes(key) || labWide[key] === value;
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
