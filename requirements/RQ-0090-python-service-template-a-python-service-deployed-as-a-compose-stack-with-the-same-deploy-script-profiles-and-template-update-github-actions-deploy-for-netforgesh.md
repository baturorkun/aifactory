---
id: RQ-0090
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T13:31:01.803Z"
branch: "factory/RQ-0090"
createdFromCommit: "b73b13ddd44a57bebb5064ac2d09b21885a229c5"
completedRunId: "20261023135042-RQ-0090"
completedBy: "Batur Orkun"
completedAt: "2026-10-23T13:57:07.686Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/159"
githubPullRequestIid: 159
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/158"
githubIssueIid: 158
repositoryProvider: github
---
# RQ-0090 - python-service template: a Python service deployed as a compose stack with the same deploy script, profiles and template update, GitHub Actions deploy, for NetForgeSH

A Python project (NetForgeSH: FastAPI with a React frontend, run as a compose
stack with its own Postgres, on GitHub) has no aifactory template: it was made
before templates and deploys with three hand-written scripts and a CI job, each
with its own hosts, ports, paths and names written into it. `template update`
refuses it ("applies to a project of profile embedded or vanilla-typescript"),
and the deploy mechanism of RQ-0088 (one `scripts/deploy.sh`, four kinds of
deploy from `.env` and `deploy/<profile>.env`) knows only one nginx container
or a directory copy, only on GitLab CI.

This adds a `python-service` template, made like `vanilla-ts`: the same lock,
three-way merge, override and propose, and `templateCheck` gate (RQ-0087,
RQ-0089), the same `scripts/deploy.sh` with a third target, `compose`, and a
GitHub Actions deploy workflow. A project of profile `python-service` takes the
template with `factory template update`, delivered as a pull request on GitHub
as a merge request on GitLab.

Deploy settings are parameters and never reach the project's AI provider
session: they live in `deploy/<profile>.env` (committed, no secrets, as in
`website`), in the developer's `.env`, and in CI secrets, and the provider's
process is started without any `DEPLOY_*` variable.

## What the template owns and what the project owns

- Template-owned (locked, replaced or merged by `template update`):
  `scripts/deploy.sh`, `scripts/template-check.mjs`, `tests/deploy.test.sh`,
  `deploy/README.md`, `deploy/dev.env.example` (the `DEPLOY_*` lines a
  developer copies into `.env`), `.github/workflows/deploy.yml` on GitHub.
- Project-owned (added only when missing): `deploy/branch.env`. The project's
  `AGENTS.md`, `.env.example`, `pyproject.toml`, compose files, `Dockerfile`,
  sources, tests and its own CI workflow (tests) are never the template's.
- `scripts/deploy.sh` and `scripts/template-check.mjs` are byte-identical in
  `vanilla-ts` and `python-service`; `vanilla-ts` projects get the compose
  target through their next `template update`, nothing in their deploys
  changes. Each template keeps its own `tests/deploy.test.sh`: the
  `python-service` one tests the compose target.
- The project's name is read from `package.json` `name`, else from
  `pyproject.toml` `[project] name`.

## The compose target

`DEPLOY_TARGET=compose`, local or remote as before (ssh with
`DEPLOY_REMOTE_IDENTITY_FILE` and `DEPLOY_REMOTE_KNOWN_HOSTS`, no trust on
first use). New settings, all `DEPLOY_*`:

- `DEPLOY_DIR`: the stack's directory on the target (`~` allowed). It holds
  `src/` (replaced on each deploy), `runtime.env` (kept, mode 600) and data
  directories.
- `DEPLOY_COMPOSE_PROJECT`: the compose project name (its volumes keep the
  data across deploys).
- `DEPLOY_COMPOSE_FILES`: the compose files, in order (default `compose.yml`).
- `DEPLOY_COMPOSE_OVERLAYS`: `network:file` pairs. The file is added only when
  the network exists on the target (a log stack that may not be there).
- `DEPLOY_COMPOSE_PORT_VAR`, `DEPLOY_COMPOSE_IMAGE_VAR`: the `runtime.env`
  names that receive the resolved port and the image.
- `DEPLOY_ENV_SET_<NAME>=value`: written into `runtime.env` as `NAME=value`
  on every deploy (settings, build arguments such as a CLI version).
- `DEPLOY_ENV_SECRETS`: `NAME=kind` pairs (`hex<N>`, `base64url<N>`), each
  generated once on the target when `runtime.env` lacks it, never printed and
  never leaving the target.
- `DEPLOY_ENV_COPY`: `path:NAME,NAME` copies those names from another env
  file on the target when `runtime.env` lacks them (a branch preview that uses
  main's database password).
- `DEPLOY_DATA_DIRS`: `NAME=dir:uid` creates `DEPLOY_DIR/dir`, owned by that
  uid (`podman unshare chown` under rootless podman), and writes its absolute
  path as `NAME`.
- `DEPLOY_HEALTH_PATH`: the path checked on `127.0.0.1:<port>` from the target
  (default `/healthz`).
- `GIT_COMMIT_SHA` and `GIT_COMMIT_TIME` are written into `runtime.env` on
  every deploy.

A build deploy sends the working tree, meaning the files Git tracks or would
track (`git ls-files -co --exclude-standard`; `.gitignore` decides what stays
behind), as a tar stream, and runs `compose up -d --build --remove-orphans`
on the target. `--image <ref>` runs a registry image with `--no-build` after
pulling it. Dangling images are pruned after a deploy. `--stop` is
`compose down` and keeps the volumes. `DEPLOY_DOCKER=podman` runs
`podman compose`. The engine is the one named, with no fallback.

The branch, default branch and run id come from `DEPLOY_BRANCH`,
`DEPLOY_DEFAULT_BRANCH` and `DEPLOY_RUN_ID` when set (GitHub Actions sets
them), else from GitLab's `CI_*`, else from Git. The port rule is unchanged.

## GitHub Actions deploy

`.github/workflows/deploy.yml` (template-owned) runs on the runner named by the
repository variable `DEPLOY_RUNS_ON` (a JSON list of labels, default
`["self-hosted"]`):

- **Push to the default branch:** `--profile main` when `deploy/main.env`
  exists.
- **Manual run (`workflow_dispatch`, profile `branch` or `release`, deploy or
  stop):** branch previews on demand, and a release of a tag with the image
  `DEPLOY_IMAGE:<tag>`. The release job uses the GitHub environment `release`,
  whose protection rules hold it for approval.
- **Branch deleted:** stops that branch's preview.

The ssh key and known hosts come from the secrets `DEPLOY_REMOTE_IDENTITY` and
`DEPLOY_REMOTE_KNOWN_HOSTS`, written to files under `RUNNER_TEMP` and removed
afterwards. No `apk`, nothing GitLab-specific.

## Never in the AI provider session

- The `claude-cli`, `codex-cli` and direct providers start their process with
  an environment without any `DEPLOY_*` variable. Nothing else in it changes.
- The template puts nothing of `deploy/` into guidelines, prompts or handoff
  packages. Its `deploy/README.md` and the generated guidance say that deploy
  settings are the operator's and are not to be read or written by an agent.

## Acceptance Criteria

- `factory new <name> --template python-service` makes a Python project with
  `targetProject.profile: "python-service"`, the template-owned files above, a
  lock, a minimal service with `/healthz`, `compose.yml` and `Dockerfile`, and
  the `templateCheck` gate; `deploy/` is not among its `allowedPaths`. It gets
  `.github/workflows/deploy.yml`.
- `template update` runs on a `python-service` project with or without a
  `package.json`, owns only the files listed above, never `AGENTS.md` or
  `.env.example`, adds only the `templateCheck` gate, keeps a differing file
  that has no known base (a project older than the template has none: its
  first commit is not taken as the template's), and checks
  the result with `tests/deploy.test.sh` before pushing. It is delivered as a
  pull request on GitHub.
- `scripts/deploy.sh` is byte-identical in both templates, reads the project
  name from `package.json` or `pyproject.toml`, and its container and
  directory targets behave as before (the existing vanilla-ts tests pass
  unchanged).
- The compose target behaves as described above, for local and remote, build
  and `--image`, deploy and `--stop`, and `--dry-run`. `tests/deploy.test.sh`
  shows it with fake `docker`/`podman`, `ssh` and `git`, including:
  - secrets generated once and never printed;
  - the overlay added only when its network exists;
  - data directories chowned under podman;
  - the health check;
  - a missing setting named in the error.
- The GitHub deploy workflow is generated as described and is valid YAML; a
  test checks its jobs, triggers, environment and secret handling.
- Providers start without `DEPLOY_*` in their environment: a test spawns each
  provider path with `DEPLOY_*` set in `process.env` and asserts the child
  environment has none of them.
- README documents the `python-service` template and the compose target.

## Out of scope

- NetForgeSH's own move (its profiles, removing its old scripts, its CI deploy
  job, its AGENTS.md) is NetForgeSH's requirement after this one.
- Registry login on the target, TLS and reverse proxies.
- GitLab CI deploy jobs for `python-service` (the script already reads
  GitLab's variables).
