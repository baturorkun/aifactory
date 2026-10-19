# AI Factory

AI Factory is a requirement-driven agentic coding runner.

It is meant to live as a reusable core repository next to the projects it works on. The factory itself is written in TypeScript, but target projects can use any stack: Python, TypeScript, frontend, backend, or an empty project that you define later with requirements.

```text
agentic/
  aifactory/       # core factory repo
  myproject/       # target project generated or maintained by the factory
  another-app/     # another target project
```

## What It Does

AI Factory reads a requirement and optional constraints, then either:

- creates a handoff package for manual or local-assistant implementation without API usage,
- runs a mock pipeline for local flow testing,
- runs a real LLM-backed multi-agent pipeline and applies generated files to the target project.

The target project is controlled by `factory.config.json` in the target repo.

## Example Projects

These public example target projects show AI Factory in real usage:

- Vanilla TypeScript example: https://github.com/baturorkun/aifactory-example-vanilla-ts
- Python HTTP example: https://github.com/baturorkun/aifactory-example-python-http

## Recommended Workflow

The normal order is:

1. Install the core `aifactory` repo.
2. Create a target project with `factory new`.
3. Stay in the `aifactory` directory and select the target with `--project`.
4. Add requirements and constraints in the target project.
5. Run `handoff`, `run`, `status`, `logs`, and other commands from `aifactory`.

```bash
cd agentic/aifactory
pnpm install
pnpm -r run typecheck

# Create a sibling target project.
pnpm factory new myproject --template python

# Add requirement files under requirements/ and constraints/.
pnpm factory -- --project ../myproject handoff RQ-0001-example
pnpm factory -- --project ../myproject run RQ-0001-example
pnpm factory -- --project ../myproject status
```

Important: all `factory` commands are run from the core `aifactory` repo.
`--project <path>` selects the consumer project. The same path may be supplied
through `AIFACTORY_PROJECT`. A bare name such as `--project arinc661-studio`
resolves to a sibling directory beside `aifactory`; explicit relative and
absolute paths retain their normal path meaning.

## Choose An Execution Mode

After a target project exists and a requirement is written, choose one of these modes from the `aifactory` directory with `--project <path>`:

| Mode | Command | Calls external LLM API? | Writes application code? | Purpose |
|---|---|---:|---:|---|
| Handoff | `pnpm factory handoff <req-id>` | Only when configured RAG grounding requires it | No | Create a tracked run and package the task for manual/local assistant implementation |
| Mock run | `pnpm factory run <req-id>` with no `.env`, or `--dry-run` | No | Mock artifacts only | Test the factory pipeline/config without API cost |
| API run | `pnpm factory run <req-id>` with `.env` provider settings | Yes | Yes, when the provider returns valid artifacts | Let the LLM-backed agents implement the requirement |
| Fast API run | `pnpm factory run <req-id> --fast` with `.env` provider settings | Yes, fewer calls | Yes | Lower-cost API implementation path |

Handoff uses the same run history as the agent pipeline, but delegates implementation to a human or local assistant. It creates `handoffs/<run-id>/handoff.md` and `runs/<run-id>/manifest.json` with the same unique run ID. Use `handoff-begin` before implementation and `handoff-finish` afterward to capture changed files, run the configured quality gates, and finalize the run.

If `.env` is missing, `run` falls back to the mock provider. Mock is useful for plumbing tests, but it does not implement the real feature.

## Core Concepts

### Requirement

A requirement is a markdown file:

```text
requirements/RQ-0001-python-http-hello-world.md
```

It describes what should be built.

### Constraints

A constraints file is optional JSON with the same ID:

```text
constraints/RQ-0001-python-http-hello-world.json
```

It describes boundaries such as target files, forbidden frameworks, stack expectations, or domain rules.

### Requirement ID

The requirement ID is the filename without extension:

```text
requirements/RQ-0001-python-http-hello-world.md
constraints/RQ-0001-python-http-hello-world.json
```

Run commands use this ID from inside the target project:

```bash
pnpm factory run RQ-0001-python-http-hello-world
pnpm factory handoff RQ-0001-python-http-hello-world
```

## Install Core Repo

From the `aifactory` repo:

```bash
pnpm install
pnpm -r run typecheck
pnpm factory --help
```

## Create A New Target Project

`--template` is required. AI Factory does not assume the target project language.

```bash
pnpm factory new myproject --template empty
pnpm factory new my-web-app --template vanilla-ts
pnpm factory new my-python-app --template python
pnpm factory new my-c-app --template c
pnpm factory new my-fpga --template embedded
pnpm factory new my-board-model --template simics
```

By default, running this from inside `aifactory/` creates the target project one directory above it:

```text
agentic/
  aifactory/
  myproject/
```

Use `--dir` to choose another parent directory:

```bash
pnpm factory new myproject --template python --dir ../examples
```

If `--template` is missing, the command fails and lists valid choices.

```bash
pnpm factory new myproject
```

```text
Error: Missing --template. Choose one: empty, vanilla-ts, python, c, embedded
```

### Templates

#### `empty`

Creates only an AI Factory-ready target workspace:

```text
requirements/
constraints/
references/
handoffs/
runs/
templates/
.gitlab-ci.yml
factory.config.json
.env.example
.gitignore
package.json
```

Use this when the actual project stack will be created later by a requirement.

Every generated target project also includes a manual GitLab CI job in `.gitlab-ci.yml`. The job clones AI Factory from `https://github.com/baturorkun/aifactory.git`, then runs `pnpm factory run "$REQUIREMENT_ID"` when manually started on `master` or `main`.

A Renode hardware-twin project (`factory new <name> --simulator renode`) also gets the twin pipeline: `probe_build` (the committed probe ELFs rebuild byte for byte with the pinned toolchain), `twin_run` (every probe under Renode, then the host tests with a JUnit report), `parity` (board trace against twin trace, the boardParity gate), `report` (one page on the merge request) and a manual `board` job that runs the probes on the real board through the lab agent. The jobs run in the image built from `ci/Dockerfile` (Renode plus the Arm GNU toolchain `probes/toolchain.json` names: the core, its compiler prefix and flags are the project's choice, made in the first requirement, and the scaffold ships them unfilled with the Cortex-M3 set as an example under `packages/agent-factory/templates/probe-cpu/`) and read `BOT_API_TOKEN`, `AIFACTORY_REPO_URL` and `AIFACTORY_REF` as CI/CD variables; the helper scripts are generated under `scripts/ci/`.

Set `REQUIREMENT_ID` when starting the manual GitLab job, for example:

```text
RQ-0001-job-form
```

#### `vanilla-ts`

Creates an empty browser TypeScript project:

```text
public/index.html
src/main.ts
src/styles.css
tsconfig.json
tsconfig.build.json
```

Generated scripts include:

```bash
pnpm typecheck
pnpm build
```

#### `python`

Creates a minimal Python target project:

```text
pyproject.toml
src/main.py
src/__init__.py
tests/test_main.py
```

Generated scripts include:

```bash
pnpm typecheck
pnpm test
```

The Python template uses Python standard library commands by default.

#### `c`

Creates a C11 CMake project: a library holding the code, a program on top of
it, and a test CTest runs, with warnings treated as errors.

```text
CMakeLists.txt
include/<name>/greeting.h
src/greeting.c
src/main.c
tests/test_greeting.c
cmake/
.clang-format
```

Generated scripts include:

```bash
pnpm build   # configure into build/ and compile
pnpm test    # ctest --output-on-failure
```

They are the `build` and `tests` gates. CMake and a C compiler must be on the
machine that runs them; nothing is downloaded by the build. The generated
`.gitlab-ci.yml` installs CMake in the factory job, and adds `c_build` and
`c_test` jobs that build and test the code on every branch, merge request and
tag in `$C_BUILD_IMAGE` (`debian:bookworm`, CMake and the compiler installed
when the image lacks them), with the test results as a JUnit report.

#### `embedded`

Creates an FPGA and firmware project built with Vivado and Vitis, from sources
to a bitstream, an XSA and an ELF, without the GUI. Sources are text (HDL,
XDC, Tcl, C); the tool projects, runs, checkpoints and workspaces are output
under `out/` and never committed.

```text
flow.tcl                 vivado -mode batch -source flow.tcl -tclargs <design> <stage>
common/                  flow_lib.tcl (stages, summary.json), gates.tcl, tool_check.tcl, boards/
boards/zedboard.yaml     part, board part, tool_version, processor ports
designs/led_counter/     plain RTL, non-project mode, self-checking testbench
designs/hello_ps/        Zynq PS block design (project mode) and a Vitis Unified app
scripts/flow.mjs         every stage, here or on the Vivado host, and the design check
```

`pnpm flow <stage> [design]` runs `check`, `sim`, `synth`, `impl`, `bit`,
`xsa`, `build`, `sw`, `all` or `clean`. Vivado and Vitis run where `.env`
says: `VIVADO_REMOTE_HOST` empty runs them on this machine; set, the sources
go to that host over SSH (`VIVADO_HOST_TYPE` windows or linux,
`VIVADO_REMOTE_USER`, `VIVADO_REMOTE_BASE_PATH`, `VIVADO_REMOTE_PROJECT_NAME`,
`VIVADO_BIN`, `VITIS_BIN`) and `out/<design>/artifacts/` comes back: the
bitstream, XSA, ELF, reports, logs and `summary.json` (WNS, WHS, utilisation,
DRC errors, stage durations, tool version, build host). The expected Vivado
version is the board file's `tool_version`, committed with the project.

A requirement of an embedded project is of kind `embedded` and passes through
phases in order, each with its gates: `spec` (`designCheck`), `sim`
(`hdlSim`: every testbench prints `TEST PASSED`), `build` (`fpgaBuild`: setup
and hold slack >= 0 and no DRC error; `firmwareBuild`: the ELF exists). A
failed phase stops the run, and the run records the furthest phase it reached.

The `twin` phase runs the design's ELF on the board's hardware twin (RQ-0045).
The twin is a project of its own that releases an image, as
`hardware-twin/bfi-sumilator` does for the BFI and bfi-sw runs its firmware
on it. As in bfi-sw, `.env` and the CI/CD variables name it
(`TWIN_GITLAB_URL`, `TWIN_PROJECT`, `TWIN_REGISTRY`, and `TWIN_CONSOLE` for the
console file; RQ-0049); a board file's `twin:` section (`gitlab`, `project`,
`registry`, `console`) fills what they leave empty, so a project with several
boards can name a twin per board. The three are the project's settings, as in
bfi-sw: a new project's `.env` takes the twins' GitLab and registry from the
lab inventory, and `factory ci-variables` writes them to the project with
`TWIN_PROJECT`. Instance-level CI/CD variables hold only what no project
changes (one there would also override a project's own `.gitlab-ci.yml`
value). `pnpm flow twin [design]` takes the twin's
latest release (`TWIN_TAG` pins one) with `TWIN_GITLAB_TOKEN`, runs
`<image> --elf … --seconds … --out …` in Docker (this machine's, or a Linux
host's over SSH through `TWIN_REMOTE_*`), checks `designs/<design>/test.yaml`
(`expect` / `fail_on` lines on the console, `summary` fields of the twin's
JSON summary within `min` / `max`) and writes
`out/<design>/artifacts/twin/result.json` with the verdict, the twin release
and revision it ran on and the ELF's SHA-256. A board whose twin is not named
yet, a design with no software or no `test.yaml`, has nothing to run and says
so.

The `board` phase runs the bitstream and ELF on the real board over JTAG
(RQ-0046): the lab bot switches the board's PDU outlet on (`BOARD_POWER_NAME`)
and off again when it was off, xsdb on the lab host (`BOARD_REMOTE_*`,
`XSDB_BIN`) programs the board through `BOARD_HW_SERVER` in the order of the
team's `run_jtag.tcl`, selecting every target by the cable's serial
(`BOARD_JTAG_CABLE`), and the console (`BOARD_SERIAL_PORT`) is checked with the
design's `test.yaml`; `out/<design>/artifacts/board/result.json` has the
twin's schema. Only JTAG: flash is never written. The board is not in a
requirement's default phases; it runs when a requirement names it, every night
on the default branch (a pipeline schedule) and by hand on any merge request.

**Starting configured.** `lab/inventory.json` describes the lab once (RQ-0047):
the GitLab and group new projects live in, the Vivado host, the lab host with
its hw_server and xsdb, the Docker host for twins, the bot's URL, and one entry
per board unit (board file, PDU label, JTAG cable serial, console device). It
holds no secret. `factory new <name> --template embedded --board zedboard`
writes the new project's `.env` from it, with the host project names per
person and the tokens empty for `factory env-check` to name; without `--board`
the board settings stay empty. `VIVADO_REMOTE_USER` is the developer's own
login (RQ-0054), the inventory's user being the CI account; the lab host is
reached as its own user (`root`). A developer's public key goes on the
Windows build host into `C:\ProgramData\ssh\administrators_authorized_keys`
(an administrator) or `C:\Users\<you>\.ssh\authorized_keys` (not one);
`ssh-copy-id` cannot write either on Windows, so it is added by hand or with
one PowerShell line over a password login (`.env.example` shows it). That is
`VIVADO_ACCESS=ssh`; with `bot` the lab bot's Windows agent on the builder
runs the tools and no key is needed. The lab host is reached as `root` only
with `BOARD_ACCESS=ssh` (the lab admin and CI); developers use `bot`: power
and the console (the bot's portmap bridge, `BOARD_CONSOLE`) through the bot,
JTAG from the builder's xsdb to the hw_server. Both `bot` modes arrive with
RQ-0055. `factory env-check` ends with the logins to try. A project made from an older template is
brought up to date with `factory template update` (it lists the changes;
`--write` applies them): the scripts, the flow, the CI file, `.env.example` and
`AGENTS.md` are replaced, the gates and package scripts merged, files a design
lacks (such as `test.yaml`) added; design sources, board files, `.env` and
requirements are left alone. `factory ci-variables --write` puts the host and
board settings of `.env` into the GitLab project's CI/CD variables
(`--with-secrets` adds the tokens, masked). The lab's shared settings
(Vivado host, lab host, hw_server, xsdb, bot, the bot and twin tokens and the
CI SSH keys) are instance-level variables on both lab GitLabs, so it leaves out
every value equal to the lab inventory's and the lab-wide tokens, and writes
only what is the project's own (the board unit, or a host that differs). Enabling a runner for a new
project is done by hand in GitLab (Settings → CI/CD → Runners): a project
token cannot enable a runner that belongs to other projects. When both GitLab
and GitHub settings are complete, the factory uses the platform the `origin`
remote is on.

## Coding Standards

A C or embedded project may follow a coding standard (RQ-0052). A standard
comes in from its Word document once: `factory standard import <doc.docx>
--id cstd --revision Rev.AA --group misra=C-001..C-107 --group
bytecraft=C-108..C-147 --group do178c=C-001..C-009 --group arm-m3=A-*` reads
every rule (the "Table N - … | C-045 | Safety | …" caption over its
Rule / Description / Rationale / Example / Notes table, the MISRA rule the
rationale cites) and writes `standards/cstd/`: `rules.json`, one
`<group>.rules.md` per group and `index.md`, all committed; the document
stays where it is. A rule may be in several groups. `factory standard list`
shows what is imported.

The RAG ingests a `*.rules.md` one chunk per rule, with the rule id,
standard, groups, class and MISRA rule in the chunk's metadata, so a question
names a rule and gets that rule. The deployed aifactory's `standards/` is the
`coding-standards` source (slot 8; its `rules.json` is left out, `RAG_SOURCE_8_EXCLUDE_ADDITIONS`).

`factory new <name> --template c|embedded --standard cstd --groups
misra,bytecraft [--profile default|dal-a]` writes `coding-standard/`
(`standard.json`: the choice; `rules.json` and `index.md`: the rules in
force; `waivers.yaml`: the deviations, with the fields 5001-K-CSTD asks
for), adds `coding-standards` to the project's `RAG_SOURCE_IDS`, leaves the
other groups' rule files out of its retrieval, and gives AGENTS.md the
rules of the game: write to the rules, record a violation you cannot avoid
in `waivers.yaml`, never silence a finding. Profile `dal-a` makes every rule
mandatory and every waiver reviewed. A requirement of such a project drafts a
"Coding Standard" section, and its handoff package carries the rule index.

The `codingStandard` gate (RQ-0053) checks the code: `pnpm standard` runs
`scripts/coding-standard.mjs` over the compile database the build left
(`build/compile_commands.json`; for an embedded design
`out/<design>/artifacts/sw/compile_commands.json`, which the sw stage writes
from Vitis's database with the BSP headers brought back beside it). A rule
citing a MISRA rule is checked by cppcheck's MISRA addon, a rule the
standard's `checks.json` names by one of the script's lexical checks (tabs,
file names, hex and suffix case, leading underscores, ASCII), and the rest
are listed as manual review. A finding is fixed or waived in
`coding-standard/waivers.yaml` with its reason (profile `dal-a`: reviewer and
date too); inline suppressions are ignored. The report is
`out/coding-standard/report.md` and `report.json`; in CI the `coding_standard`
job runs after the build in a project that has `coding-standard/standard.json`.

Which phases a requirement goes through is chosen when it is created:
`requirement new "<title>" --phases sim,build` (spec is always one), or, in a
terminal without `--phases`, a checkbox list with the project's default
(`requirementDefaults.embeddedPhases`) ticked. The choice is the `phases:`
line of the requirement file. `handoff-finish` runs those phases;
`handoff-finish <run> --phases sim` runs fewer this time and leaves the run
open. The factory job in CI runs the requirement's phases, and the generated
`.gitlab-ci.yml` runs the design check, the testbenches and the build of every
design with its Vitis ELF on every push, merge request and tag: on a
requirement branch the phases the requirement names, on main and tags all of
them. A merge request is completed only after its pipeline passed. The jobs reach the
Vivado host through `VIVADO_*` CI/CD variables (the SSH key and `known_hosts`
as File variables), each with its own project there.

#### `simics`

Creates a language-aware workspace for Wind River/Intel Simics device and board
models. The generated project includes `dml/`, `targets/`, `python/`, `scripts/`,
and `tests/`, plus safe command wrappers for licensed-runner validation. AI
Factory does not install or redistribute Simics, proprietary packages,
documentation, firmware, checkpoints, or license material.

The generated build, static-check, and batch-test gates read JSON argv arrays
from `SIMICS_BUILD_COMMAND_JSON`, `SIMICS_CHECK_COMMAND_JSON`, and
`SIMICS_TEST_COMMAND_JSON`. Configure those values only on a licensed local or
self-hosted CI runner. Missing commands fail as unverified instead of reporting
a successful simulation. Simics projects default to a 15-minute gate timeout,
which can be changed through `targetProject.commandTimeoutMs`.

## Target Project Config

Each target project has a `factory.config.json`.

Requirement and pipeline commands validate only the RAG `grounding` client
settings they use. RAG database, source, embedding, LLM, authentication, and
API-service settings are expanded and validated only by `factory rag ...`
commands.

New projects are generated with required model settings. Define every value in
the target project's `.env` file or its CI/CD environment:

```json
{
  "model": {
    "provider": "${AI_PROVIDER}",
    "name": "${AI_MODEL}",
    "reviewerName": "${AI_REVIEWER_MODEL}",
    "baseUrl": "${AI_BASE_URL:-}",
    "apiKey": "${AI_API_KEY:-}",
    "executable": "${AI_CODEX_EXECUTABLE:-codex}",
    "reasoningEffort": "${AI_CODEX_REASONING_EFFORT:-medium}"
  }
}
```

There is no implicit model provider. Missing values stop the run with an
environment-variable error instead of silently selecting the mock provider.

Generated projects also define standard workspace paths:

```json
{
  "paths": {
    "requirements": "./requirements",
    "constraints": "./constraints",
    "references": "./references",
    "runs": "./runs",
    "handoffs": "./handoffs",
    "templates": "./templates"
  }
}
```

The same config also controls where files can be written:

```json
{
  "targetProject": {
    "root": ".",
    "applyArtifacts": true,
    "profile": "vanilla-typescript",
    "allowedPaths": ["src", "tests", "tsconfig.json", "tsconfig.build.json"],
    "commandTimeoutMs": 120000,
    "commands": {
      "build": "pnpm build",
      "typeCheck": "pnpm typecheck",
      "test": "pnpm test"
    }
  }
}
```

`allowedPaths` is important. The factory will only apply generated artifacts inside those paths.

## Provider Setup

### Default: Mock

If `.env` does not exist, generated projects use mock automatically.

Mock is useful for checking that the pipeline and config work, but it does not produce real application code.

```bash
pnpm factory run RQ-0001-example
```

The command requires model settings from `.env` or the CI/CD environment.

### Gemini Example

Create `.env` in the target project:

```bash
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
AI_REVIEWER_MODEL=gemini-2.5-flash
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
AI_API_KEY=replace_me
```

Then run:

```bash
pnpm factory run RQ-0001-example
```

### xAI / Grok Example

Use the OpenAI-compatible provider:

```bash
AI_PROVIDER=openai-compat
AI_MODEL=grok-4-fast-reasoning
AI_REVIEWER_MODEL=grok-4-fast-reasoning
AI_BASE_URL=https://api.x.ai/v1
AI_API_KEY=replace_me
```

Model names depend on the provider account and current API availability.

### Ollama / Local OpenAI-Compatible Endpoint

For an OpenAI-compatible local endpoint:

```bash
AI_PROVIDER=openai-compat
AI_MODEL=your-local-model
AI_REVIEWER_MODEL=your-local-model
AI_BASE_URL=http://localhost:8080
AI_API_KEY=local
```

For native Ollama provider config, use `provider: ollama` in `factory.config.json`.

### Codex CLI in GitLab pipeline mode

Codex CLI is a model provider only. AI Factory still creates or links the
GitHub/GitLab Issue, creates the requirement branch and Draft PR/MR, commits
the result, and pushes the branch. Merge remains manual.

Set these CI/CD variables for projects that use Codex CLI:

```bash
AI_PROVIDER=codex-cli
AI_MODEL=gpt-5.6-sol
AI_REVIEWER_MODEL=gpt-5.6-sol
AIFACTORY_RUNNER_IMAGE=registry.example.com/ci/aifactory-codex:latest
```

The AI Factory repository's GitLab pipeline builds and publishes this image on
every branch or tag change as:

```text
$CI_REGISTRY_IMAGE/codex-runner:$CI_COMMIT_SHA
$CI_REGISTRY_IMAGE/codex-runner:$CI_COMMIT_REF_SLUG
```

Changes on the default branch also update
`$CI_REGISTRY_IMAGE/codex-runner:latest`. Set the consumer project's variable
to that registry path:

```bash
AIFACTORY_RUNNER_IMAGE=registry.example.com/group/aifactory/codex-runner:latest
```

The same image can still be built manually from the provided runner definition:

```bash
docker build -f docker/codex-runner.Dockerfile -t registry.example.com/ci/aifactory-codex:latest .
docker push registry.example.com/ci/aifactory-codex:latest
```

For GitHub Actions, `.github/workflows/codex-runner-image.yml` publishes the
same runner to
`ghcr.io/<repository-owner>/aifactory-codex-runner:codex-0.147.0`.
Make the package public so target repositories can pull it before a job starts.
Generated GitHub workflows use the public AI Factory image by default and allow
an override through the `AIFACTORY_RUNNER_IMAGE` repository variable. The image
tag pins the Codex CLI version; update the Dockerfile, publisher workflow, and
generated workflow default together when upgrading Codex.

Generated GitLab jobs accept Codex authentication from either of these sources,
in priority order:

1. `CODEX_AUTH_JSON_FILE`: a GitLab CI/CD variable with type **File** whose
   value is the complete `auth.json` content. The job copies it with mode 600
   into a job-local `CODEX_HOME`.
2. A runner mount at `CODEX_HOME` (default
   `/home/gitlab-runner/.codex`) containing a readable `auth.json`.

The mounted form persists token refreshes between jobs. A GitLab File variable
does not; refresh its stored value when the cached login becomes invalid. Treat
both sources as passwords: do not commit them, publish them as artifacts, or
print their contents.

Codex executable and authentication checks run only when the requirement is
in `pipeline` mode and `AI_PROVIDER=codex-cli`. Handoff requirements continue
to be skipped by the pipeline, and API-backed providers do not need Codex.

## Main Commands

Run these from the `aifactory` directory and select the target project.

### Create and submit a requirement branch

Start from a clean, current configured base branch:

```bash
pnpm factory -- --project ../myproject requirement new "Feature title" --mode handoff
```

This reserves a metadata-rich draft on the base branch, pushes it, creates and
pushes `factory/RQ-xxxx`, and switches the local worktree to that branch. If
the project `.env` contains complete GitLab credentials (`GITLAB_URL`,
`GITLAB_PROJECT_ID`, and `GITLAB_TOKEN`) or complete GitHub credentials
(`GITHUB_REPOSITORY` and `GITHUB_TOKEN`), AI Factory also creates a linked
Issue and Draft Merge/Pull Request and stores their links in requirement
metadata. Use `--platform gitlab` or `--platform github` for explicit
selection, `--platform none` for branch-only behavior, or recover an
interrupted link operation with
`pnpm factory -- --project ../myproject requirement platform-sync RQ-xxxx`.
If both providers are fully configured, explicit platform selection is
required. The
reservation commit uses `[skip ci]`, so the base-branch reservation and initial
draft/linkage pushes do not create pipelines. After creation, finish the
generated description and acceptance criteria only in the local requirement
branch. Incremental wording and scope changes are not committed or pushed and
do not keep the Draft Pull/Merge Request synchronized. Batch those local edits
until the user explicitly requests a lifecycle transition such as submit,
handoff, direct execution, or pipeline execution. `requirement platform-sync`
is only for creating or recovering missing platform links, not for saving draft
edits. Optionally switch execution mode, and submit:

```bash
pnpm factory -- --project ../myproject requirement mode RQ-0001 pipeline
pnpm factory -- --project ../myproject requirement submit RQ-0001
```

After implementation and human approval of its run, complete and merge the
requirement atomically:

```bash
pnpm factory -- --project ../myproject requirement complete RQ-0001 \
  --run 20260819123000-RQ-0001 --by "Reviewer Name"
```

Completion requires a clean worktree, a committed approved run manifest, a
matching Pull/Merge Request head, successful required CI, satisfied approvals,
and a mergeable change request. It records completion metadata, pushes that
commit, marks the draft ready, and merges with a head-SHA guard. It then labels
the linked Issue `factory::passed`, posts one completion comment, and closes the
Issue. If checks for the completion commit are pending, rerun the same command
after they finish; the operation safely resumes.

Cancel a requirement from its requirement branch or the configured base branch:

```bash
pnpm factory -- --project ../myproject requirement cancel RQ-0001 \
  --reason "No longer needed"
```

Cancellation commits and pushes `status: cancelled` to the requirement record on
the base branch, closes the matching GitLab Merge Request or GitHub Pull Request
when a repository platform is configured, and deletes the local and remote
requirement branch when present.
The requirement file remains on the base branch as an audit record, and the
operation is safe to retry after partial cleanup. Use `--platform none` to skip
repository-platform synchronization explicitly.

Handoff submit creates a local handoff package without committing or pushing.
Pipeline submit commits only the requirement document and pushes its branch so
GitLab CI or GitHub Actions can run the existing agent pipeline. Draft pushes
never start code generation, and Pull/Merge Requests remain manual.

### Create a handoff package

```bash
pnpm factory handoff RQ-0001-example
```

This does not run the agent implementation pipeline and does not write application code. Configured RAG grounding can still call its configured model. The command creates:

```text
handoffs/<run-id>/handoff.md
runs/<run-id>/manifest.json
```

The handoff file is an implementation brief. It includes:

- the requirement markdown,
- matching constraints JSON,
- target project root,
- allowed paths,
- configured local check commands,
- current target file list.

Use this when API cost matters or when you want a human/local assistant to implement the requirement. Handoff does not modify `src/`, `tests/`, or other application files by itself.

Start and finish the tracked implementation with the Run ID printed by `handoff`:

```bash
pnpm factory handoff-begin <run-id>
# Implement the handoff in the target workspace.
pnpm factory handoff-finish <run-id>
```

`handoff-finish` captures files changed since handoff creation under the run’s `artifacts/` directory, records deleted files, runs the configured target quality gates, and sets the run to `passed`, `needs-fix`, or `failed`. Use `--skip-gates` only when gate execution is intentionally deferred.

### Run full pipeline

```bash
pnpm factory run RQ-0001-example
```

Uses the configured provider.

- If a required model variable is missing, the run stops with a configuration error.
- If `.env` or CI/CD configures Gemini/xAI/etc., it calls that API.

### Run cost-controlled mode

```bash
pnpm factory run RQ-0001-example --fast
```

For requirement branches, store the choice in the requirement metadata:

```bash
pnpm factory requirement fast RQ-0001 on
pnpm factory requirement fast RQ-0001 off
```

New pipeline requirements may enable it immediately:

```bash
pnpm factory requirement new "Example" --mode pipeline --fast
```

`pipelineFast: true` skips Tester, Reviewer, and Domain Guard. GitLab
`sync-requirement` reads this setting automatically. The CLI updates only the
requirement file; it does not commit or push the change.

Fast mode skips some review agents and uses fewer LLM calls.

Task-level `targetFiles` are planning hints; the configured
`targetProject.allowedPaths` remain the hard artifact security boundary. To
discard an incompatible automatic checkpoint and restart cleanly, run:

```bash
pnpm factory sync-requirement RQ-0001 --fresh --push
```

Generated CI jobs also honor `AIFACTORY_FRESH=true` for a one-time clean retry.
Checkpoint commits are stored under `refs/aifactory/checkpoints/*`, outside branch
and tag namespaces, so checkpoint pushes do not create GitHub or GitLab pipelines.

### Force mock mode

```bash
pnpm factory run RQ-0001-example --dry-run
```

`--dry-run` forces mock even if `.env` is configured.

### Run subset of tasks

```bash
pnpm factory run RQ-0001-example --tasks task-1,task-3
```

### Check status

```bash
pnpm factory status
pnpm factory status <run-id>
```

### View logs

```bash
pnpm factory logs <run-id>
```

### List artifacts

```bash
pnpm factory artifacts <run-id>
```

### Approve a passed run

```bash
pnpm factory approve <run-id>
```

## Pipeline Flow

Normal mode:

```text
Requirement
  -> Planner
  -> Architect
  -> Coder
  -> Tester
  -> Reviewer
  -> Domain Guard
  -> Quality Gates
```

Fast mode:

```text
Requirement
  -> Planner
  -> Architect
  -> Coder
  -> Quality Gates
```

Quality gates are local checks such as schema validation, build, typecheck, lint, tests, and security checks when configured.

## Directory Roles

In a target project:

```text
requirements/   # permanent product/task descriptions
constraints/    # permanent technical/domain boundaries
references/     # source material such as PDFs, standards, screenshots, and notes
handoffs/       # manual implementation packages, no API usage
runs/           # pipeline execution history and audit output
templates/      # optional target-local templates
src/            # target app source, depending on template
tests/          # target app tests, depending on template
```

`references/` is for source material that supports requirements. Put large inputs such as PDFs under a topic folder, then create concise markdown notes that requirements can cite.

`runs/` is for executed pipeline runs.

`handoffs/` is for prepared manual implementation packages.

## Example: Python HTTP Hello World

Create a Python project:

```bash
cd aifactory
pnpm factory new myproject --template python
cd ../myproject
```

Create requirement:

```text
requirements/RQ-0001-python-http-hello-world.md
```

Example requirement:

```markdown
# Python HTTP Hello World Server

Build a minimal Python HTTP server. When the server is started and a browser opens `/`, the page must display Hello World.

## Acceptance Criteria

- Use Python standard library only.
- Implement the server in src/main.py.
- Listen on localhost:8000 by default.
- GET / returns HTTP 200.
- Response body is exactly Hello World.
- Tests pass with the configured test command.
```

Create handoff without API:

```bash
pnpm factory handoff RQ-0001-python-http-hello-world
```

Run with API or mock fallback:

```bash
pnpm factory run RQ-0001-python-http-hello-world
```

## Development Commands For AI Factory

Run from the core repo:

```bash
pnpm install
pnpm -r run typecheck
pnpm factory --help
```

Create smoke projects:

```bash
pnpm factory new smoke-empty --template empty --dir /tmp --force
pnpm factory new smoke-web --template vanilla-ts --dir /tmp --force
pnpm factory new smoke-python --template python --dir /tmp --force
```

## Notes For Public Repos

Do not commit real `.env` files or API keys.

Commit `.env.example` only.

Generated `runs/` can become noisy and may contain model output. Keep it ignored unless you intentionally want to publish run artifacts.

## Current Package Names

Internal workspace packages use the `@aifactory/*` scope:

```text
@aifactory/contracts
@aifactory/quality-gates
@aifactory/agent-factory
```

The CLI command exposed by the target project is:

```bash
pnpm factory ...
```
