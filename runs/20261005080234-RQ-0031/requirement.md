---
id: RQ-0031
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-05T07:59:46.735Z"
branch: "factory/RQ-0031"
createdFromCommit: "5ef943e869df7a47881b587a06bd15eae7171164"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/41"
githubPullRequestIid: 41
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/40"
githubIssueIid: 40
repositoryProvider: github
---
# RQ-0031 - Ready twin pipeline in the Renode scaffold: probe rebuild, twin run, parity and report

A Renode project made with `factory new --simulator renode` gets a CI image
that holds everything a twin check needs (`ci/Dockerfile`: Renode 1.17.0 and
the Arm GNU toolchain 15.2.Rel1, pinned by SHA-256, `SIMULATOR_*` pointing at
them) and a `.gitlab-ci.yml` that uses none of it: its one job,
`ai_factory_requirement_branch`, asks `requirement decision` and, in handoff
mode, prints that it skips. Every proof the hardware-twin workflow produces
(the probe rebuilds byte for byte, the twin prints the board's trace, the
host tests pass) runs only on a developer's machine, in `handoff-finish`.

bfi-simulator wrote that pipeline by hand on top of the scaffold: stages
`probe_build`, `twin_run`, `parity`, `report` and a manual `board` stage,
driven by four helper scripts under `scripts/ci/`. twin1, the next Renode
project, started on 2026-10-05 with the scaffold's passive CI again and had
nothing to show for its first push but a job waiting for a runner. The
pipeline is the same for every Renode twin, because every job is a `factory
probe` command over the requirements' front matter; it belongs in the
scaffold, so the next project gets it on day one and bfi-simulator can drop
its copy.

## What the scaffold generates

`writeGitlabCi` in `packages/agent-factory/src/scaffold.ts`, for
`simulator === 'renode'`, adds to the generated `.gitlab-ci.yml`, after
`build_ci_image` and before the passive `ai_factory_requirement_branch`:

- A hidden `.twin` base: the CI image with `pull_policy: if-not-present`, the
  `linux` tag, rules for merge requests, the default branch, tags and
  pipelines started by hand, `cache: []`, and a `before_script` that writes
  `.env` from `.env.example` (`scripts/ci/ci-env.mjs`: secrets named `*_TOKEN`
  from CI/CD variables, `SIMULATOR_REMOTE_HOST` emptied and the simulator and
  toolchain paths taken from the image, so Renode and gcc run inside the job).
- `probe_build`: `factory probe build` for every requirement in scope, then
  `git diff --stat --exit-code -- probes/`: the committed ELFs rebuild byte for
  byte with the pinned toolchain. The ELFs are its artifact.
- `twin_run`: `factory probe sim-run` for every requirement in scope, then
  `node --test tests/` with a JUnit report. Artifacts: the simulator traces,
  `build/junit.xml` as a JUnit report.
- `parity`: `factory probe compare` for every requirement in scope, as the
  `boardParity` gate; a probe without a committed board trace is reported as
  such and passes, since the branch has not been on the board yet.
- `report`: one page from the traces and parity results
  (`scripts/ci/twin-report.mjs`), exposed on the merge request, produced also
  when parity failed.
- `board`: `factory probe board-run` for the requirement in scope, manual on
  every pipeline kind, `allow_failure: true`, `resource_group` from the
  project name so two pipelines never hold the board at once. It needs the
  `BOT_API_TOKEN` CI/CD variable; without it the job says so and stops. It
  commits nothing: it records what the board printed as an artifact for the
  developer to commit, as the workflow requires.

The scope of every job comes from `scripts/ci/twin-requirements.mjs`, read
from `requirements/*.md` front matter (`kind: hardware-twin`, `probe`): on a
requirement branch, or a merge request from one, that requirement only, as
soon as its probe has an ELF; anywhere else, every hardware-twin requirement
whose probe has a committed board trace. `scripts/ci/factory.sh` runs the
aifactory CLI in CI from `AIFACTORY_REPO_URL` / `AIFACTORY_REF`, the same
commands a developer runs.

The four scripts live in `templates/renode/scripts/ci/` and are copied by
the scaffold like the rest of `templates/renode/scripts/`. They are the
generic parts of bfi-simulator's `scripts/ci/`: `factory.sh`, `ci-env.mjs`
and `twin-requirements.mjs` as they are, `twin-report.mjs` with its BFI
firmware and live-mode sections removed. Nothing in the generated files
names a lab host, a board or a project other than through `.env.example` and
`$CI_PROJECT_NAME`.

The `ai_factory_requirement_branch` job keeps its rule as today; the twin
jobs run beside it, not instead of it. The generated README's CI section
names the stages and what each proves, and says that the `board` job is
started by hand.

## Out of scope

- The Simics scaffold. The jobs are simulator-independent (every one is a
  `factory probe` command), but the Simics image and host type (Windows,
  PowerShell) are a different CI, so the Simics template gets the same stages
  in a requirement of its own once its runner image exists.
- Packaging and release jobs (bfi-simulator's `twin_image`, `release`,
  `twin_live`): they depend on a product firmware and a twin container that a
  scaffold does not have.
- Registering runners or building the CI image: the scaffold documents both
  as today.

## Acceptance Criteria

- `factory new <name> --simulator renode` writes a `.gitlab-ci.yml` with the
  jobs `probe_build`, `twin_run`, `parity`, `report` and `board` in the stages
  of that order after `ci_image` and before `ai_factory`, and the files
  `scripts/ci/factory.sh`, `scripts/ci/ci-env.mjs`,
  `scripts/ci/twin-requirements.mjs` and `scripts/ci/twin-report.mjs`.
- `scaffold.test.ts` covers the generated `.gitlab-ci.yml` for the Renode
  case: the five jobs exist, `board` is manual with `allow_failure`, the
  twin jobs use `$AIFACTORY_RUNNER_IMAGE`, and a non-Renode project gets none
  of them.
- `node --test` on the generated `scripts/ci/twin-requirements.mjs` (a test
  in the aifactory repository over a fixture `requirements/` directory)
  proves the three scopes: requirement branch with an ELF, requirement
  branch without an ELF, and the default branch with and without board
  traces.
- `scripts/ci/ci-env.mjs` writes a `.env` in which every `*_TOKEN` present as
  an environment variable is filled, `SIMULATOR_REMOTE_HOST` is empty, and
  no other value differs from `.env.example`; covered by a test.
- The generated pipeline, applied to a checkout of twin1 (RQ-0001: one probe
  with a committed ELF and board trace), passes `probe_build`, `twin_run`
  and `parity` in the CI image run locally with Docker, as the validation of
  this requirement records in its handoff.
- No generated file contains a host name, IP address, board name or lab PC
  name; `.env.example` is the only place they are expected.
- The generated README documents the twin stages, the CI/CD variables they
  read (`BOT_API_TOKEN`, `AIFACTORY_REPO_URL`, `AIFACTORY_REF`) and that the
  `board` job is manual.
- Existing scaffold tests for the empty, vanilla-ts, python and Simics cases
  still pass unchanged.
