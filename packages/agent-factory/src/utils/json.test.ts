import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJSON } from './json';

test('invalid JSON reports the parser reason', () => {
  assert.throws(
    () => extractJSON('{"patches":[{"content":"unterminated}'),
    /JSON parser: /,
  );
});
