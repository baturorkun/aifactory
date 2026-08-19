---
id: RQ-0013
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur.orkun@brado."
createdAt: "2026-08-18T05:34:10.592Z"
branch: "factory/RQ-0013"
createdFromCommit: "d5c066df2ff15125c92b4927fc32b649c9d0fd66"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/7"
githubPullRequestIid: 7
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/6"
githubIssueIid: 6
repositoryProvider: github
---
# RQ-0013 - Add first-class Simics project support

Add a focused Simics project profile to AI Factory so a target repository can
develop Wind River/Intel Simics board and device models without inheriting the
current TypeScript and Jest assumptions.

The first version is an enablement MVP rather than a complete board generator.
It must scaffold a Simics-oriented target repository, understand the relevant
source formats, provide stack-aware agent guidance, and delegate authoritative
build and simulator validation to commands configured by the target project.
Simics itself, proprietary packages, firmware images, and license material must
remain external to AI Factory and must not be copied into generated projects or
CI artifacts.

The intended development workflow is hybrid: model sources may be authored on
a workstation without Simics, while configured quality gates execute on a
licensed local or self-hosted CI runner. Interactive GUI debugging remains an
external developer activity. AI Factory must support non-interactive,
exit-code-driven validation without claiming that static generation alone
proves behavioral fidelity of a digital twin.

## Scope

- Add a `simics` option to `factory new` alongside the existing templates.
- Generate a minimal, documented directory layout for DML models, Simics
  scripts/targets, Python helpers, tests, references, and project-owned wrapper
  scripts.
- Make pipeline prompts language- and stack-aware so a Simics target can use
  DML, `.simics`, Python, C/C++, and extensionless build files without being
  instructed to use TypeScript, npm, or Jest.
- Include Simics source and configuration formats in project indexing and
  review context collection.
- Allow target-owned commands to perform model build, static checks, and
  batch-mode simulator tests on a licensed runner, with a configurable timeout.
- Provide Simics-specific generated guidance covering authoritative
  documentation, deterministic tests, secrets/licenses, generated build
  outputs, and platform/version compatibility.
- Cover the new template and generalized behavior with tests that do not
  require a Simics installation or license in the AI Factory development
  environment.

## Out of Scope

- Installing, downloading, redistributing, or licensing Simics.
- Bundling proprietary Simics packages, documentation, board support packages,
  firmware, checkpoints, or license credentials.
- Implementing a particular board, processor, or peripheral model.
- Requiring Simics for AI Factory's own unit-test suite.
- Automating interactive Simics GUI or remote-desktop workflows.

## Acceptance Criteria

- `factory new <name> --template simics` creates an AI Factory-ready target
  project and reports `simics` in template discovery, validation errors, help,
  documentation, and scaffold tests.
- The generated project has a minimal documented structure for DML/device
  models, target or platform scripts, Python helpers, automated tests,
  references, and project-owned build/test wrappers; placeholder content does
  not depend on proprietary APIs or files.
- The generated `factory.config.json` restricts artifact writes to explicit
  Simics project paths and configures target-owned validation commands without
  embedding workstation-specific Simics installation paths.
- Planner, architect, coder, tester, reviewer, and domain-guard instructions
  receive the target stack/profile and do not impose TypeScript, npm, Jest, or
  web-application conventions on Simics work.
- Existing `empty`, `python`, and `vanilla-ts` projects retain their current
  behavior, and any prompt generalization remains backward compatible.
- Project indexing and supporting review context recognize at least `.dml`,
  `.simics`, `.py`, `.c`, `.cc`, `.cpp`, `.h`, `.hpp`, `.json`, `.yaml`,
  `.yml`, and explicitly allowed extensionless files such as `Makefile`.
- DML and Simics files can be created and updated through the structured
  pipeline without being rejected, omitted from relevant context, or relabeled
  as TypeScript test artifacts.
- Target validation commands can represent model build/static validation and
  non-interactive simulator tests, and their timeout is configurable for jobs
  that legitimately take longer than the current fixed 120 seconds.
- A configured simulator test is judged by its process exit code and captured
  diagnostics; when no Simics executable or licensed runner is configured, the
  generated project documents the limitation and does not report simulated
  behavior as verified.
- Generated guidance states that Simics installation paths, license values,
  proprietary documents, firmware, packages, build outputs, and checkpoints
  must not be hardcoded or unintentionally committed or uploaded as run/CI
  artifacts.
- RAG guidance documents how to index authorized Simics documentation and
  example sources using the already supported `.dml` and `.simics` formats,
  while keeping RAG optional for project creation and local unit tests.
- Automated tests cover template creation, allowed paths, file discovery,
  prompt selection, validation command execution, timeout handling, and absence
  of any dependency on an installed Simics product.
- AI Factory's configured typecheck, lint, and test suites pass.
