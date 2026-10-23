---
id: RQ-0089
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T09:45:29.122Z"
branch: "factory/RQ-0089"
createdFromCommit: "bd7efed1c8aabee36548793bb4e37bb853751308"
completedRunId: "20261023094654-RQ-0089"
completedBy: "human"
completedAt: "2026-10-23T09:59:37.808Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/157"
githubPullRequestIid: 157
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/156"
githubIssueIid: 156
repositoryProvider: github
---
# RQ-0089 - template update for vanilla-ts projects, as for embedded: lock, three-way merge, override and propose, templateCheck gate

An embedded project takes aifactory's template changes with
`pnpm factory -- template update` (RQ-0069): a merge request, a lock of what
the template delivered, a three-way merge that never overwrites a project's
change silently, `template override` / `propose` for a change kept on
purpose, and a `templateCheck` gate (RQ-0087). A `vanilla-ts` project has
none of it: `template update` refuses any profile but `embedded`, so the
deploy scripts RQ-0088 put in the template reach `website`, `sitescribe` and
`t-pro` only by hand. This makes `vanilla-ts` work the same way.

## What it does

### 1. A template kind per profile

`template-lock.ts` describes each template that can be updated, by the
`targetProject.profile` of `factory.config.json`:

| | `embedded` | `vanilla-typescript` |
|---|---|---|
| template directory | `templates/embedded` | `templates/vanilla-ts` |
| scaffold template | `embedded` | `vanilla-ts` |
| written by the scaffold | `.gitlab-ci.yml`, `.env.example`, `AGENTS.md` | the same, and `Dockerfile`, `nginx.conf`, `.dockerignore` |
| project-owned (only added when missing) | `designs/`, `boards/` | `deploy/branch.env` (its port base is the project's) |
| merged commands | the embedded gates | `test`, `templateCheck` |
| merged package scripts | all of a fresh project's | `deploy:dev`, `test`, `factory`, `template:check` |
| a differing file with no known base | replaced (as before) | kept, the template's version saved as the next base |

The project owns everything else it has: `src/`, `public/`, `tsconfig*`,
`PROJECT_GUIDELINES.md`, `deploy/main.env`, `deploy/release.env`.
`factory.config.json`, `package.json` and `.gitignore` are merged as for
embedded. In `vanilla-ts` `typecheck`, `build` and `commands.typeCheck` name
the path to aifactory's `tsc` from where the project was made (a fresh
project in a scratch directory has another), so they stay the project's.
A file that differs from the template with no base to tell whose change it
is (no lock, not in a template commit or the first commit) is kept rather
than replaced: `website` grew its own `nginx.conf`, `Dockerfile` and
`AGENTS.md` before it took updates; the template's version becomes the base
of the next update, and `template:check` lists the file until it is made
the template's or overridden. Lock, base copies, the three-way merge, `kept` / `merged` /
`conflict`, overrides and `propose` are the same code for both kinds;
nothing embedded does changes.

### 2. A project without a profile

A `vanilla-ts` project made before profiles (`website`) has no
`targetProject.profile`. `template update` takes a project with
`public/index.html`, `tsconfig.build.json` and `Dockerfile` and no profile as
`vanilla-typescript`, says so, and writes the profile in its
`factory.config.json` merge. Any other project without a profile is refused
with a message naming the profiles.

### 3. Delivery

`template update` (merge request), `--dry-run`, `--local`, `template status`,
`override`, `propose` work for both kinds. The commit and merge request name
the template: `chore(template): the aifactory vanilla-ts template at <commit>`
(embedded keeps its words); the base of a project without a lock is its last
such commit, of either kind, else its first commit. The check run before the
push is the kind's: `scripts/flow.mjs check` for embedded, `pnpm test`
(`tests/deploy.test.sh`) for `vanilla-ts`, run with the same Node / shell
rules (a check that cannot start says so). Messages and the CLI description
say "template", not "embedded template", where they apply to both.

### 4. templateCheck in vanilla-ts

The `vanilla-ts` template gets `scripts/template-check.mjs` (the embedded
one's behaviour, its help naming no embedded paths), `template:check` in
`package.json`, `commands.templateCheck: "pnpm template:check"`, and a
`template_check` CI job on merge request pipelines (`--strict`, node image).
The quality gates run `templateCheck` for a non-embedded project that names
the command, after the tests; it reports, as for embedded, and the CI job is
what fails. A new `vanilla-ts` project gets its lock at scaffold time, as an
embedded one does. AGENTS.md's Deploy section says which files the template
owns and how to keep a change (`template override`).

### Out of scope

- `python`, `c`, `empty` templates.
- Running the first update on `website` and the other projects: each takes
  it with `template update` after this is merged (its merge request may
  conflict in `.gitlab-ci.yml`, `nginx.conf` and `AGENTS.md`, resolved once).

## Acceptance Criteria

- Every existing embedded template test passes unchanged.
- A scaffolded `vanilla-ts` project has `.factory/template.lock.json` with
  the template's files (scripts, test, `deploy/README.md`, `Dockerfile`,
  `nginx.conf`, `.dockerignore`, `.gitlab-ci.yml`, `.env.example`,
  `AGENTS.md`) and not `deploy/branch.env`; `pnpm template:check` reports it
  in sync; `template_check` is in its CI.
- `template update` on a `vanilla-ts` project, one test each: a template
  file changed only in the template is replaced; changed only in the project
  is kept; changed in both merges or conflicts (markers, draft merge request);
  `deploy/branch.env` with another base is kept; `deploy/main.env` is never
  touched; `package.json` scripts and `factory.config.json` commands merge;
  an override stays and is listed by `template status`.
- A project without a profile laid out like `website` is taken as
  `vanilla-typescript` and gets the profile; one that is not is refused.
- Delivery opens a merge request named for the `vanilla-ts` template, with
  `pnpm test` as its check; a failing test pushes nothing.
- `template update --dry-run` in `website` lists its changes and writes
  nothing. Run on 23 October 2026: add `scripts/template-check.mjs`,
  conflict `.gitlab-ci.yml` and `.env.example`, kept `AGENTS.md`,
  `Dockerfile`, `nginx.conf`, add the lock, merge `factory.config.json`
  (`templateCheck`, `allowedPaths`, `commandTimeoutMs`, the profile),
  `package.json` (`factory`, `template:check`) and `.gitignore`; its
  `typecheck` and `build` untouched.
- A project like `website` (no lock, a file added after its first commit):
  the file is kept and its template version is the next base; its `tsc`
  scripts are not touched.
- The aifactory test suite and typecheck pass.
