---
id: RQ-0043
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-16T17:54:30.446Z"
branch: "factory/RQ-0043"
createdFromCommit: "5c5c9362f63a6fa4c31fb58dcc7dd52c71b63882"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/65"
githubPullRequestIid: 65
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/64"
githubIssueIid: 64
repositoryProvider: github
---
# RQ-0043 - C project template

`factory new` makes a project from a template: `empty`, `vanilla-ts` or
`python`, or, for a hardware twin, from a simulator. A C project has none: it
starts from `empty`, with no build, no test, and quality gates that check
nothing, and the first requirement has to invent the layout, the build system
and the gate commands before it can do its own work.

## What it does

**A `c` template.** `factory new <name> --template c` makes a C11 CMake
project the way `vanilla-ts` makes a TypeScript one:

- `CMakeLists.txt`: C11 required and without compiler extensions, compile
  commands exported, a library holding the code (`<name>_core`, from `src/`
  with its headers in `include/<name>/`), the program built from it
  (`src/main.c`), and the tests registered with CTest.
- Warnings on (`-Wall -Wextra -Wpedantic`, `/W4` with MSVC) and treated as
  errors, behind an option (`WARNINGS_AS_ERRORS`, on).
- A small piece of code and a test of it, so the gates have something to
  build and run from the first requirement on. The test needs no framework:
  a test program returns non-zero when a check fails, and CTest reports it. A
  project can bring a framework in a requirement of its own.
- `.clang-format` (LLVM style, four spaces) and `build/` ignored by git.

**The gates build and test.** The project's scripts are `build` (configure
into `build/` and compile) and `test` (CTest, output on failure), and its
`factory.config.json` runs them as the `build` and `tests` gates. The profile
is `c`; the paths a requirement normally works in are `src`, `include`,
`tests`, `cmake`, `CMakeLists.txt` and `.clang-format`.

**CI has the tools.** The image the CI jobs run in has a C compiler but no
CMake: the GitLab job and the GitHub workflow of a C project install CMake
(and the compiler when it is missing) before the gates run.

**GitLab CI is a C pipeline.** The generated `.gitlab-ci.yml` of a C project
builds and tests the code itself, not only when the factory runs a
requirement: a `c_build` job (configure and compile) and a `c_test` job
(CTest, the results as a JUnit report on the merge request) run on every
branch, merge request and tag, so a merge request whose code does not build or
whose tests fail is not merged. They run in `$C_BUILD_IMAGE` (`debian:bookworm`,
CMake and the compiler installed when the image lacks them, so an image with
both works offline), and a branch with an open merge request runs them once,
in the merge request pipeline. The factory job keeps the files a C
requirement changes (`src/`, `include/`, `tests/`, `cmake/`,
`CMakeLists.txt`) as its artifacts, not a TypeScript project's.

**The agents are told.** `AGENTS.md` of a C project says how it builds and
tests, that warnings are errors, that the language standard is not changed in
passing, and that a dependency is added through CMake by a requirement, not
fetched by a build step.

## Not covered

- C++. A C++ template is left for when a project needs one.
- A certification-oriented C template (a coding standard checked by a gate,
  structural coverage, traceability): a requirement of its own, built on this
  one.
- Cross-compiling and embedded targets (a hardware twin has its own probes and
  toolchain).
- A test framework, a package manager, sanitizers, coverage.
- A lint gate: `clang-format` and `clang-tidy` are not on the lab machines or
  the CI image.

## Acceptance Criteria

- `factory new <name> --template c` is accepted, listed in the help, and
  refused together with `--simulator` as the other templates are.
- The project holds `CMakeLists.txt`, `include/<name>/greeting.h`, `src/`,
  `tests/`, `.clang-format`, and a `.gitignore` that leaves out `build/`.
- `factory.config.json` has the profile `c`, the build and tests commands
  `pnpm build` and `pnpm test`, and the allowed paths above.
- In a container from the CI image with CMake installed, the generated project
  configures, builds without a warning, and passes its test; a warning
  introduced into the code fails the build.
- The generated `.gitlab-ci.yml` and GitHub workflow install CMake for a C
  project, and do not for the other templates.
- The generated `.gitlab-ci.yml` of a C project has the `build` and `test`
  stages with `c_build` and `c_test`; run in `debian:bookworm` as GitLab runs
  them, `c_build` compiles and `c_test` passes and writes `build/junit.xml`.
  The other templates have no such jobs.
- The README lists the `c` template with its files, scripts and CI jobs.
- `AGENTS.md` of a C project has the section on building and testing; the
  other templates' does not.
