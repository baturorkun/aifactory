import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CommandError, PROJECT_ROOT } from './vivado-host.mjs';

// The lab bot's HTTP API, for the stages that reach the lab through it
// instead of logging in to a lab host: power and the console bridge (board,
// RQ-0055), Docker jobs on the lab host (twin, RQ-0056).
//
//   BOT_API_URL    the bot, http://192.168.1.253:3978 in the lab
//   BOT_API_TOKEN  its token, a secret
//   BOT_API_AGENT  the person's name as the bot knows them (the agent id of
//                  their PC's bot agent, e.g. kavci), set by hand like that
//                  agent's own installer asks and never guessed from a login
//                  name. Every call carries it, so the bot's log names the
//                  person, and a job or console is owned as <project>/<it>.

function value(env, name) {
  return (env[name] ?? '').trim();
}

export function botSettings(env, stage) {
  const url = value(env, 'BOT_API_URL').replace(/\/$/, '');
  const token = value(env, 'BOT_API_TOKEN');
  if (!url) throw new CommandError(`BOT_API_URL is not set: the lab bot, which the ${stage} stage goes through. Add it to .env.`, 2);
  if (!token) throw new CommandError(`BOT_API_TOKEN is not set: the lab bot's token. Add it to .env.`, 2);
  return { url, token, user: value(env, 'BOT_API_AGENT') };
}

// The owner a console or job is held for: this project and the person.
export function jobOwner(env, projectName = basename(PROJECT_ROOT)) {
  const user = value(env, 'BOT_API_AGENT');
  if (!user) throw new CommandError('BOT_API_AGENT is not set: your name as the bot knows you (the agent id of your PC\'s bot agent, e.g. kavci); the console or job is owned as <project>/<it>. Add it to .env.', 2);
  if (!/^[A-Za-z0-9._@:-]+$/.test(user)) throw new CommandError('BOT_API_AGENT may contain only letters, digits and . _ @ : -', 2);
  return `${projectName}/${user}`.replace(/[^A-Za-z0-9._@/:-]/g, '_').slice(0, 64);
}

// fetch's "fetch failed" says nothing; the cause (ECONNRESET, ...) does.
// `retries` is for requests that may be sent again unchanged (an upload under
// the same name, a download, asking for a job): a connection dropped on the
// way, as a ZeroTier link does now and then, is tried again after a pause
// (RQ-0060). A request that starts something is never sent twice.
export const RETRY_PAUSE_MS = () => Number(process.env.BOT_API_RETRY_MS ?? 5000);

const causeOf = (error) => error?.cause?.code ?? error?.cause?.message ?? error?.message ?? String(error);

export async function reach(stage, what, request, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (error instanceof CommandError) throw error;
      if (attempt >= retries) {
        const tries = retries > 0 ? ` (${attempt + 1} tries)` : '';
        throw new CommandError(`${stage} FAILED: cannot reach the lab bot for ${what}: ${causeOf(error)}${tries}`, 1);
      }
      console.error(`${stage}: ${what}: ${causeOf(error)}; trying again in ${Math.round(RETRY_PAUSE_MS() / 1000)} s (${attempt + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS()));
    }
  }
}

async function answer(response, stage, what) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body.messages ?? []).join(' ') || body.error || '';
    throw new CommandError(`${stage} FAILED: the lab bot answered ${response.status} to ${what}${detail ? `: ${detail}` : '.'}`, 1);
  }
  return response.json();
}

// A bot command as typed in Teams (power on D, pm start lab com21 owner=...):
// the bot's replies, joined. The person goes along as user=.
export async function botCommand(env, path, stage = 'BOARD') {
  const bot = botSettings(env, stage);
  const query = bot.user ? `${path.includes('?') ? '&' : '?'}user=${encodeURIComponent(bot.user)}` : '';
  const response = await reach(stage, path.replace(/\?.*$/, ''), () => fetch(`${bot.url}/api/commands/${path}${query}`, { method: 'POST', headers: { Authorization: `Bearer ${bot.token}` } }));
  const body = await answer(response, stage, path.replace(/\?.*$/, ''));
  return (body.messages ?? []).join('\n');
}

// A file into the bot's store for an agent's jobs; the bot answers with its URL.
export async function botUpload(env, agent, name, data, stage = 'TWIN') {
  const bot = botSettings(env, stage);
  const response = await reach(stage, `the upload of ${name} (${Math.round(data.length / 1024)} KB)`, () => fetch(`${bot.url}/api/agents/${encodeURIComponent(agent)}/files/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${bot.token}`, 'Content-Type': 'application/octet-stream' },
    body: data,
  }), { retries: 3 });
  const body = await answer(response, stage, `the upload of ${name}`);
  return body.url;
}

// A job for an agent (docker-run, renode-run, ... on the Linux lab host; the
// Windows agents' commands): the job as the bot returns it.
export async function botJob(env, agent, command, args, { wait = 0, stage = 'TWIN' } = {}) {
  const bot = botSettings(env, stage);
  const headers = { Authorization: `Bearer ${bot.token}`, 'Content-Type': 'application/json' };
  if (bot.user) headers['X-Requested-By'] = bot.user;
  const response = await reach(stage, `${command} on ${agent}`, () => fetch(`${bot.url}/api/agents/${encodeURIComponent(agent)}/jobs?wait=${wait}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command, args }),
  }));
  return answer(response, stage, `${command} on ${agent}`);
}

// Free-form PowerShell on a Windows agent the bot allows it for (the builder):
// the job as the bot returns it, finished when it ended within `wait` seconds.
export async function botPowershell(env, agent, script, { wait = 60, stage = 'BUILD' } = {}) {
  const bot = botSettings(env, stage);
  const headers = { Authorization: `Bearer ${bot.token}`, 'Content-Type': 'text/plain; charset=utf-8' };
  if (bot.user) headers['X-Requested-By'] = bot.user;
  const response = await reach(stage, `PowerShell on ${agent}`, () => fetch(`${bot.url}/api/agents/${encodeURIComponent(agent)}/pwsh?wait=${wait}`, {
    method: 'POST',
    headers,
    body: script,
  }));
  return answer(response, stage, `PowerShell on ${agent}`);
}

export const jobIsFinal = (job) => job?.status === 'succeeded' || job?.status === 'failed';

// Waits for a job to end, asking the bot every `pause` ms until `deadlineMs`.
export async function botJobWait(env, job, { deadlineMs, pause = 3000, stage = 'TWIN', now = Date.now } = {}) {
  const bot = botSettings(env, stage);
  let current = job;
  while (!jobIsFinal(current)) {
    if (now() >= deadlineMs) throw new CommandError(`${stage} FAILED: job ${job.id} did not end in time; the bot still reports it ${current?.status ?? 'unknown'}.`, 1);
    await new Promise((resolve) => setTimeout(resolve, pause));
    const response = await reach(stage, `job ${job.id}`, () => fetch(`${bot.url}/api/jobs/${encodeURIComponent(job.id)}`, { headers: { Authorization: `Bearer ${bot.token}` } }), { retries: 3 });
    current = await answer(response, stage, `job ${job.id}`);
  }
  return current;
}

// The job's output archive, named on the last OUTPUT= line of its stdout.
export function outputUrl(job) {
  return /^OUTPUT=(\S+)\s*$/m.exec(job?.stdout ?? '')?.[1];
}

// The body is read inside the retry: a drop halfway through is a drop too.
export async function botDownload(url, path, stage = 'TWIN') {
  const data = await reach(stage, `the download of ${url}`, async () => {
    const response = await fetch(url);
    if (!response.ok) throw new CommandError(`${stage} FAILED: the bot answered ${response.status} for ${url}.`, 1);
    return Buffer.from(await response.arrayBuffer());
  }, { retries: 3 });
  writeFileSync(path, data);
}
