import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ClaudeCliAdapter } from './claude-cli';
import { providerEnv } from './provider-env';

// Deploy settings never reach an AI provider (RQ-0090): not their values,
// not their names.

test('the provider environment has no DEPLOY_* variable and everything else', () => {
  const env = providerEnv({ PATH: '/bin', HOME: '/h', DEPLOY_REMOTE_HOST: 'h', DEPLOY_REMOTE_IDENTITY_FILE: '/k', deploy_dir: 'x', AI_API_KEY: 'k' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/h', AI_API_KEY: 'k' });
});

test('a provider process started from a shell with DEPLOY_* set sees none of it', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'provider-env-'));
  const saved = { ...process.env };
  try {
    const seen = join(scratch, 'env.txt');
    const fake = join(scratch, 'claude');
    writeFileSync(fake, `#!/bin/sh\nenv > '${seen}'\ncat > /dev/null\necho '{"result":"ok","is_error":false,"stop_reason":"end_turn"}'\n`);
    chmodSync(fake, 0o755);
    Object.assign(process.env, { DEPLOY_TARGET: 'compose', DEPLOY_REMOTE_HOST: 'prod.example', DEPLOY_REMOTE_IDENTITY_FILE: '/home/me/.ssh/deploy', KEEP_ME: 'yes' });
    const response = await new ClaudeCliAdapter({ model: 'sonnet', executable: fake, timeoutMs: 10_000 }).call({ systemPrompt: 'S', userPrompt: 'U' });
    assert.equal(response.content, 'ok');
    const child = readFileSync(seen, 'utf8');
    assert.doesNotMatch(child, /DEPLOY_/);
    assert.doesNotMatch(child, /prod\.example/);
    assert.match(child, /^KEEP_ME=yes$/m);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('every place that starts a provider process starts it with providerEnv', () => {
  for (const path of ['claude-cli.ts', 'codex-cli.ts', '../orchestrator/direct.ts']) {
    const source = readFileSync(join(__dirname, path), 'utf8');
    assert.match(source, /env: providerEnv\(\)/, path);
    assert.doesNotMatch(source, /env: process\.env/, path);
  }
});
