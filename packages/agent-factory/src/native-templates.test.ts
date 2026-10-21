// The c template (RQ-0043): a CMake project with a library, a program and a
// CTest test, the build and tests gates, and CMake installed in CI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTargetProject, PROJECT_TEMPLATES } from './scaffold';

function scaffold(template: string, name = 'gauge') {
  const parent = mkdtempSync(join(tmpdir(), 'aifactory-native-'));
  const result = createTargetProject(name, { dir: parent, template });
  const read = (path: string) => readFileSync(join(result.projectRoot, path), 'utf8');
  return { parent, root: result.projectRoot, result, read };
}

for (const [template, source, header, standard] of [['c', 'c', 'h', 'set(CMAKE_C_STANDARD 11)']] as const) {
  test(`the ${template} template makes a CMake project with a library, a program and a test`, () => {
    const { parent, root, result, read } = scaffold(template);
    try {
      assert.equal(result.template, template);
      for (const path of ['CMakeLists.txt', `include/gauge/greeting.${header}`, `src/greeting.${source}`, `src/main.${source}`,
        `tests/test_greeting.${source}`, '.clang-format', 'cmake/.gitkeep']) {
        assert.ok(existsSync(join(root, path)), `${path} is there`);
      }
      const cmake = read('CMakeLists.txt');
      assert.match(cmake, new RegExp(standard.replace(/[()]/g, '\\$&')));
      assert.match(cmake, /_EXTENSIONS OFF\)/);
      assert.match(cmake, /option\(WARNINGS_AS_ERRORS "Treat compiler warnings as errors" ON\)/);
      assert.match(cmake, /-Wall -Wextra -Wpedantic \$<\$<BOOL:\$\{WARNINGS_AS_ERRORS\}>:-Werror>/);
      assert.match(cmake, /add_library\(\$\{PROJECT_NAME\}_core /);
      assert.match(cmake, /add_test\(NAME greeting COMMAND test_greeting\)/);
      assert.match(read(`src/greeting.${source}`), /#include "gauge\/greeting\./);
      assert.match(read('.gitignore'), /^build\/$/m);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test(`the ${template} project's gates build and test it`, () => {
    const { parent, read } = scaffold(template);
    try {
      const config = JSON.parse(read('factory.config.json')) as {
        targetProject: { profile: string; commands: Record<string, string>; allowedPaths: string[] };
      };
      assert.equal(config.targetProject.profile, template);
      // codingStandard: in every c project, passing while no standard is chosen (RQ-0076).
      assert.deepEqual(config.targetProject.commands, { build: 'pnpm build', test: 'pnpm test', codingStandard: 'pnpm standard' });
      assert.deepEqual(config.targetProject.allowedPaths, ['src', 'include', 'tests', 'cmake', 'CMakeLists.txt', '.clang-format']);
      const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
      assert.equal(scripts.build, 'cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build --parallel');
      assert.equal(scripts.test, 'ctest --test-dir build --output-on-failure');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
}

test('c is one of the templates', () => {
  assert.ok(PROJECT_TEMPLATES.includes('c'));
});

test('CI installs CMake for a C project only', () => {
  for (const template of ['c', 'vanilla-ts', 'python', 'empty']) {
    const { parent, read } = scaffold(template);
    try {
      const native = template === 'c';
      for (const file of ['.gitlab-ci.yml', '.github/workflows/ai-factory.yml']) {
        assert.equal(/apt-get install -y --no-install-recommends cmake make gcc/.test(read(file)), native, `${template}: ${file}`);
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('the GitLab CI of a C project builds and tests the C code', () => {
  const { parent, read } = scaffold('c');
  try {
    const ci = read('.gitlab-ci.yml');
    assert.match(ci, /^stages:\n {2}- ai_factory\n {2}- build\n {2}- test\n/m);
    assert.match(ci, /^ {2}C_BUILD_IMAGE: "debian:bookworm"$/m);
    assert.match(ci, /^c_build:\n {2}stage: build\n {2}image: "\$C_BUILD_IMAGE"/m);
    assert.match(ci, /- cmake -S \. -B build -DCMAKE_BUILD_TYPE=Debug\n {4}- cmake --build build --parallel/);
    assert.match(ci, /^c_test:\n {2}stage: test/m);
    assert.match(ci, /- ctest --test-dir build --output-on-failure --output-junit junit\.xml/);
    assert.match(ci, /junit: build\/junit\.xml/);
    assert.match(ci, /merge_request_event/);
    // The factory job keeps what a C requirement changes, not a TypeScript project's files.
    const factoryJob = ci.slice(ci.indexOf('ai_factory_requirement_branch:'), ci.indexOf('c_build:'));
    for (const path of ['include/', 'cmake/', 'CMakeLists.txt']) assert.match(factoryJob, new RegExp(`- ${path}$`, 'm'));
    for (const path of ['public/', 'dist/', 'tsconfig.json', 'pyproject.toml']) assert.doesNotMatch(factoryJob, new RegExp(`- ${path}$`, 'm'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
  for (const template of ['vanilla-ts', 'python', 'empty']) {
    const other = scaffold(template);
    try {
      assert.doesNotMatch(other.read('.gitlab-ci.yml'), /c_build|C_BUILD_IMAGE/, template);
    } finally {
      rmSync(other.parent, { recursive: true, force: true });
    }
  }
});

test('the agents of a C project are told how it builds and tests', () => {
  for (const [template, heading] of [['c', 'C11'], ['python', null], ['vanilla-ts', null]] as const) {
    const { parent, read } = scaffold(template);
    try {
      const agents = read('AGENTS.md');
      if (heading) {
        assert.match(agents, new RegExp(`## Building and Testing \\(${heading}, CMake\\)`));
        assert.match(agents, /Warnings are errors/);
        assert.match(agents, /a build step never downloads anything/);
      } else {
        assert.doesNotMatch(agents, /## Building and Testing/);
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }
});

// Where CMake and a compiler are at hand, the generated project really builds,
// warning-free, and its test passes. Elsewhere (a Mac without CMake) it is skipped;
// the CI image was checked by hand when the template was written.
const haveToolchain = spawnSync('cmake', ['--version']).status === 0;
for (const template of ['c']) {
  test(`a generated ${template} project builds and passes its test`, { skip: !haveToolchain && 'no cmake here' }, () => {
    const { parent, root } = scaffold(template);
    try {
      const run = (command: string, args: string[]) => {
        const done = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
        assert.equal(done.status, 0, `${command} ${args.join(' ')}\n${done.stdout}\n${done.stderr}`);
        return done.stdout + done.stderr;
      };
      run('cmake', ['-S', '.', '-B', 'build', '-DCMAKE_BUILD_TYPE=Debug']);
      assert.doesNotMatch(run('cmake', ['--build', 'build']), /warning/i);
      run('ctest', ['--test-dir', 'build', '--output-on-failure']);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
}
