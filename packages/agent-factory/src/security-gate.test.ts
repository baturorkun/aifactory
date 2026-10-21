import assert from 'node:assert/strict';
import test from 'node:test';
import { scanSecurity } from '@aifactory/quality-gates';

// RQ-0073: a file says a finding is intended, with its reason; the gate then
// passes and its report still shows it. bin/factory.js, the launcher, needs
// child_process. The patterns are built in pieces, so this file does not
// match them itself, as the gate's own messages do not.
const REQUIRE = ['req', "uire('child_", "process')"].join('');
const EVAL = ['ev', 'al'].join('');
const LAUNCHER = `const { spawnSync } = ${REQUIRE};\n`;
const MARK = ['security', 'reviewed'].join('-');

test('a security finding fails unless a comment line of the file reviews it with a reason, and the review stays in the report', () => {
  assert.deepEqual(scanSecurity(LAUNCHER, 'bin/factory.js'), { issues: ['bin/factory.js: child_process import — verify intent'], reviewed: [] });

  const reviewed = scanSecurity(`// ${MARK}: child-process — starts tsx, no shell\n${LAUNCHER}`, 'bin/factory.js');
  assert.deepEqual(reviewed.issues, []);
  assert.deepEqual(reviewed.reviewed, ['bin/factory.js: child_process import — verify intent (reviewed: starts tsx, no shell)']);
  assert.equal(scanSecurity(`# ${MARK}: child-process — a shell script\n${LAUNCHER}`, 'x.js').issues.length, 0);

  // No reason, another id, or the marker inside a string: nothing is reviewed.
  assert.equal(scanSecurity(`// ${MARK}: child-process\n${LAUNCHER}`, 'x.js').issues.length, 1);
  assert.equal(scanSecurity(`// ${MARK}: eval — not this one\n${LAUNCHER}`, 'x.js').issues.length, 1);
  assert.equal(scanSecurity(`const note = "${MARK}: child-process — in a string";\n${LAUNCHER}`, 'x.js').issues.length, 1);
  // A review covers its own finding only.
  const both = scanSecurity(`// ${MARK}: child-process — launcher\n${LAUNCHER}${EVAL}('1');\n`, 'x.js');
  assert.deepEqual(both.issues, ['x.js: eval usage detected']);
  assert.equal(both.reviewed.length, 1);
});
