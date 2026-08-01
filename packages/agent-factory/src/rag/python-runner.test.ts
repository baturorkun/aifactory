import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseRagEnvService,
  ragEnvComposeArgs,
} from './python-runner';

test('parseRagEnvService accepts only configured compose services', () => {
  assert.equal(parseRagEnvService('postgres'), 'postgres');
  assert.equal(parseRagEnvService('rag-api'), 'rag-api');
  assert.equal(parseRagEnvService('rag-web'), 'rag-web');
  assert.throws(
    () => parseRagEnvService('database'),
    /Choose one of: postgres, rag-api, rag-web/,
  );
});

test('ragEnvComposeArgs starts one service with dependency health ordering', () => {
  const args = ragEnvComposeArgs(['compose'], 'start', 'rag-api');

  assert.deepEqual(args.slice(-4), ['up', '-d', '--build', 'rag-api']);
  assert.ok(!args.includes('--no-deps'));
});

test('ragEnvComposeArgs stops one service without removing the stack', () => {
  const args = ragEnvComposeArgs(['compose'], 'stop', 'rag-web');

  assert.deepEqual(args.slice(-2), ['stop', 'rag-web']);
});

test('ragEnvComposeArgs preserves whole-stack commands', () => {
  assert.deepEqual(
    ragEnvComposeArgs(['compose'], 'up').slice(-3),
    ['up', '-d', '--build'],
  );
  assert.equal(ragEnvComposeArgs(['compose'], 'status').at(-1), 'ps');
  assert.equal(ragEnvComposeArgs(['compose'], 'down').at(-1), 'down');
});

test('ragEnvComposeArgs loads compose interpolation values from the root env file', () => {
  const args = ragEnvComposeArgs(['compose'], 'status');
  const envFileIndex = args.indexOf('--env-file');

  assert.ok(envFileIndex >= 0);
  assert.match(args[envFileIndex + 1], /aifactory\/\.env$/);
});

test('ragEnvComposeArgs requires a service for individual commands', () => {
  assert.throws(() => ragEnvComposeArgs(['compose'], 'start'), /service is required/);
  assert.throws(() => ragEnvComposeArgs(['compose'], 'stop'), /service is required/);
});
