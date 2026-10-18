---
id: RQ-0049
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-18T13:24:06.100Z"
branch: "factory/RQ-0049"
createdFromCommit: "c81b6b9935f83a8de1ec3725949514c71ed14b3a"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/77"
githubPullRequestIid: 77
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/76"
githubIssueIid: 76
repositoryProvider: github
---
# RQ-0049 - Embedded twin settings from env, as bfi-sw: TWIN_GITLAB_URL, TWIN_PROJECT, TWIN_REGISTRY

bfi-sw names its hardware twin with CI/CD variables: `TWIN_GITLAB_URL`,
`TWIN_PROJECT`, `TWIN_REGISTRY` (with `TWIN_GITLAB_TOKEN` and `TWIN_TAG`).
The embedded template (RQ-0045) names it only in `boards/<board>.yaml`
(`twin:` gitlab, project, registry, console). Batur wants the embedded
projects to take the twin the bfi-sw way, from the environment, so the twin is
set like every other host setting (.env locally, CI/CD variables in CI).

## What it does

- The twin stage reads `TWIN_GITLAB_URL`, `TWIN_PROJECT`, `TWIN_REGISTRY` and
  `TWIN_CONSOLE` (the file under `--out` the console lands in) from the
  environment, the same names bfi-sw uses. A board file's `twin:` section
  still works and fills what the environment leaves empty, so a project with
  several boards can name a twin per board; a value in the environment wins.
- With no twin project in either place the twin stage skips as today, and says
  where to set it (`TWIN_PROJECT`).
- `.env.example` of an embedded project lists the four settings.
- `lab/inventory.json` gains the lab-wide twin GitLab and registry
  (`gitlab.bcintr.int`, `gitlab.bcintr.int:5050`), and a unit may name its
  twin project and console. A new project's `.env` takes them. All three
  name one twin and are the project's, as in bfi-sw: `factory ci-variables`
  writes them to the project, and they are not instance-level CI/CD
  variables. Instance level holds only what no project changes (Batur, 18
  October); one there would also override a project's own `.gitlab-ci.yml`
  value.
- The generated AGENTS.md and the board file's comment say where the twin is
  set.

## Acceptance Criteria

- With `TWIN_GITLAB_URL`, `TWIN_PROJECT`, `TWIN_REGISTRY` set and no `twin:`
  section in the board file, the twin stage resolves the release and image
  from them.
- With both, the environment wins field by field; with only the board file,
  it behaves as before.
- With no twin project anywhere the stage skips and names `TWIN_PROJECT`.
- A project generated from the inventory has `TWIN_GITLAB_URL` and
  `TWIN_REGISTRY` in `.env`; `factory ci-variables` writes them to the project.
- embedded1, updated with `factory template update`, keeps passing its gates.
