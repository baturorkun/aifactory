---
id: RQ-0088
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-23T06:01:43.754Z"
branch: "factory/RQ-0088"
createdFromCommit: "ad121829c48c6e274c5b4e3a15ed69ad7311ba90"
completedRunId: "20261023085714-RQ-0088"
completedBy: "human"
completedAt: "2026-10-23T09:17:04.228Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/155"
githubPullRequestIid: 155
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/154"
githubIssueIid: 154
repositoryProvider: github
---
# RQ-0088 - vanilla-ts template: a development deploy outside CI, as a container or a copy into a directory, on this machine or a host over ssh, with the same script CI deploys with

A project made from the `vanilla-ts` template deploys only from GitLab CI:
`deploy_linux` (main) and `deploy_preview_linux` (other branches) start a
container on the runner's own Docker. During development there is no way to
put the working tree somewhere to look at without a commit, a push and a
pipeline, and no way to deploy anywhere but the runner.

`website` built and verified this first, as its RQ-0017: `scripts/deploy.sh`,
`scripts/release.sh` and `tests/deploy.test.sh`, deployed for real into a
subdomain's directory on a cPanel host (GoDaddy, `public_html`). This
requirement brings the same scripts into the template, with the project's
name in place of `website`; what the cPanel run taught is written into it.

## What it does

Four kinds of deploy, one script (`scripts/deploy.sh`) and one set of
`DEPLOY_*` names; what differs is where the settings come from:

| | Kind | Trigger | Settings |
|---|---|---|---|
| 1 | a developer's | `pnpm run deploy:dev` | `.env` (not in the repository) |
| 2 | main | a push to main | `deploy/main.env` |
| 3 | branch | a push to another branch | `deploy/branch.env` |
| 4 | release | a tag | `deploy/release.env` |

The `deploy/*.env` profiles are committed and hold no secrets. The secrets
(the ssh key and known hosts) are the developer's own files, or in CI two
protected GitLab File variables.

### 1. Two choices

- `DEPLOY_TARGET`: `container` (the release built into the project's nginx
  image, `Dockerfile` and `nginx.conf` as today, run as a container, port
  `DEPLOY_PORT` on the host to 8282) or `directory` (the release copied into
  `DEPLOY_PATH` for a web server that is already there).
- `DEPLOY_ACCESS`: `local` (this machine) or `remote` (another host over
  ssh: `DEPLOY_REMOTE_HOST`, `DEPLOY_REMOTE_USER`, `DEPLOY_REMOTE_PORT` (22),
  `DEPLOY_REMOTE_IDENTITY_FILE` and `DEPLOY_REMOTE_KNOWN_HOSTS` as a file,
  the way the embedded template's `*_REMOTE_*` settings are used).

Empty or unknown values stop with a message naming the variable; settings
another choice does not use are ignored.

`remote` names both keys, in every kind of deploy: `DEPLOY_REMOTE_IDENTITY_FILE`
and `DEPLOY_REMOTE_KNOWN_HOSTS` empty, or naming no readable file, stop the
deploy at once, naming the variable; nothing falls back to what ssh would
pick. Before any build the script logs in once (`ssh … true`); a refused key
or an unknown host key stops it there, said in one line.

### 2. One script, run by a developer and by CI

`scripts/deploy.sh`, POSIX sh: macOS, Linux, `dash`, and BusyBox in the
`docker:27-cli` image CI uses. Windows is out of scope.

- `pnpm run deploy:dev` builds (`pnpm build`, then `scripts/release.sh`) and
  deploys. Not `deploy`: `pnpm deploy` is a pnpm command.
- `-- --stop` removes this deploy's container (`directory`: nothing to stop);
  `-- --dry-run` prints what would be built, sent, run or copied and where,
  and calls neither `docker` nor `ssh`; `-- --no-build` uses the existing
  `dist/`.
- `--image <tag>` runs an image already built (no build), `--prebuilt`
  ships `release/<project>/` as it is (no build, no `release.sh`) and
  `--label k=v` (repeatable) adds labels: what CI uses.
- Settings come from the environment, else from the `DEPLOY_*` lines of
  `.env` (only those lines are read); the environment wins.
- `scripts/release.sh` lays out `release/<project>/` as `build_static` does
  today and adds a top-level `index.html` that sends the browser to
  `public/index.html` (titled with the project's name), so a `directory`
  deploy opens at `/` on any static server. `build_static` calls it.
- CI deploys from committed profiles, not GitLab environment scopes:
  `deploy/main.env` says where main goes, `deploy/release.env` where a tag
  goes, `deploy/branch.env` how a branch preview runs (`--profile main|release|branch`, also `DEPLOY_PROFILE`). They hold no
  secrets and are reviewed like code; the two may name different servers.
  Settings are taken from the environment first, then the profile, then
  `.env`; an empty value in a profile stays empty (`release.env` ships with
  an empty `DEPLOY_PATH`, so a tag deploys nowhere until the live site's
  directory is written there).
- The secrets are two GitLab protected File variables, scope `*`:
  `DEPLOY_REMOTE_IDENTITY_FILE` (the deploy key, authorised on every server a
  profile names) and `DEPLOY_REMOTE_KNOWN_HOSTS` (every such server's host
  key). `deploy.sh` stops a remote deploy without them (in every kind of
  deploy); `scripts/ci-remote-tools.sh` installs the ssh client when the job
  image lacks it and sets the key to mode 600. Tags are protected so they
  see them.
- `deploy_linux` (main) with `deploy/main.env` ships `build_static`'s
  release as it is (`--prebuilt`); without it, it runs the image
  `docker_image` built on the runner's Docker as today (`--image`, container
  ``<project>`` on `DEPLOY_PORT` else ``APP_PORT``, refusal when another container
  holds the port, health check). GitLab environment `main`.
- `deploy_release` (new, on a tag) needs `deploy/release.env` and deploys
  it with `--prebuilt`. GitLab environment `release`.
- `deploy_preview_linux` (a branch) reads `deploy/branch.env`: it must say
  `container` + `local` (the job stops otherwise: a branch preview runs on
  the runner's Docker, never sees the deploy key, and cannot write the
  runner's disk); what it sets is the port base and the CLI. Without the
  file the same defaults apply. Container `<project>-preview-<branch>`, port
  `DEPLOY_BRANCH_PORT_BASE + N`.

### 3. Container

- `DEPLOY_DOCKER` names the CLI on the target, `docker` by default; `podman`
  works with the same commands. The port's holder is found from
  `ps --format '{{.Names}} {{.Ports}}'`, since Podman has no `publish`
  filter.
- The name is `DEPLOY_CONTAINER_NAME`, else `<project>-dev-<user>`
  (`DEPLOY_USER`, else the login name, lower-cased): two developers on one
  host do not replace each other's container, nor CI's.
- Labels `com.aifactory.project`, `com.aifactory.owner` and
  `com.aifactory.deploy=dev` unless the caller gives its own
  `com.aifactory.deploy`.
- Only its own container is replaced; a port held by another container stops
  the deploy before anything is removed, naming that container.
- `remote`: the build context (`Dockerfile`, `nginx.conf`,
  `release/<project>/`) goes over ssh as a tar stream into a temporary
  directory and the image is built on the host, so an arm64 Mac deploys to an
  amd64 host without a cross build.
- `--restart unless-stopped`; `/healthz` polled for 15 s; on failure the log
  is printed and the exit code is not 0. The URL is printed at the end.

### 3b. The container's port follows the branch

`scripts/deploy.sh` picks the host port, for a developer and for CI alike
(the rule moves out of `deploy_preview_linux`):

- `--port <n>` wins (CI passes `APP_PREVIEW_PORT` this way when set).
- On the default branch (`CI_DEFAULT_BRANCH`, else `main`): `DEPLOY_PORT`
  (CI: `DEPLOY_PORT`, else `APP_PORT`, 8282).
- On `factory/RQ-N` (or `rq-N…`): `DEPLOY_BRANCH_PORT_BASE + N`, the base
  8300 when empty, so RQ-17 is 8317 as before and RQ-5 is 8305 (it was
  20005). Over 65535 or a non-numeric base stops the deploy.
- On another branch: `20000 + CI_PIPELINE_ID % 40000` in CI, as before;
  `DEPLOY_PORT` on a developer's machine.
- The branch is `CI_COMMIT_BRANCH`, else the checkout's. The script prints
  the port and the rule that chose it.

### 4. Directory: in place, never touching what is not the site's

A document root on a hosting account already holds the host's files
(`.htaccess`, `.well-known` for certificate renewal, `cgi-bin`) and has
permissions the web server depends on (cPanel: `750`, group `nobody`).
Replacing the directory loses both, so the deploy writes into it:

- `DEPLOY_PATH` must be absolute; `/`, the home directory, fewer than two
  components and `//`, `.` or `..` are refused. A missing directory is
  created when its parent exists.
- The directory and its permissions are not changed. Each file is written
  beside itself and renamed over the old one.
- The marker `.aifactory-deploy` holds `project=<project>`, the time and one
  `file=` line per file the last deploy wrote; no user name, since a web
  server serves it. Only those files are replaced or, when they left the
  release, removed (with directories they leave empty). Every other file is
  kept.
- A release file that would overwrite a file not in the marker stops the
  deploy before anything is written, naming the files; another project's
  marker is refused.
- The marker is written with the old and new lists before the copy, so an
  interrupted deploy is still the project's next time.
- `remote`: the release goes over ssh as a tar stream to the same install
  step; the host needs `sh`, `tar`, `find`, `grep` and `mktemp`.

### 5. What never leaves the machine

Only `release/<project>/` (and for `container`, `Dockerfile` and
`nginx.conf`) is sent; the send list is built from those, not by excluding.
`.env`, `.git`, `runs/`, `handoffs/` and `node_modules` never go. On macOS
the tar stream carries no `._` files or extended attributes.

### 6. Template files

- New: `scripts/deploy.sh`, `scripts/release.sh`,
  `scripts/ci-remote-tools.sh`, `tests/deploy.test.sh`, kept as files under
  the template (not strings in `scaffold.ts`) and written byte for byte into
  every project: they read the project's name from `package.json` (`name`),
  so no copy carries a project name and a later template update compares
  equal files. `website` takes them unchanged with its own requirement.
- `deploy/branch.env` (container + local, base 8300), as in `website`. No
  `deploy/main.env` or `deploy/release.env`: a new project deploys main on
  the runner until it adds `deploy/main.env`, and a tag stops with "no
  `deploy/release.env`"; `deploy/README.md` lists the four kinds, with an
  example `main.env` for a container on a host and one for a directory.
- `package.json`: `deploy:dev` (`sh scripts/deploy.sh`) and `test`
  (`sh tests/deploy.test.sh`).
- `factory.config.json`: `allowedPaths` adds `scripts`, `deploy`, `package.json`,
  `.gitignore` and `.env.example`; `commands.test` runs `pnpm test`.
- `.gitignore`: `release/`.
- `.env.example`: a `Deploy` section with every `DEPLOY_*` variable, empty
  (`DEPLOY_REMOTE_PORT=22`), each with a one-line comment.
- `factory env-check` lists the `DEPLOY_*` variables as a deploy group,
  needed only for `deploy:dev`.
- The generated project guidelines describe `deploy:dev`, the two choices,
  and that CI runs the same scripts.

### 7. Handoff capture follows `.gitignore`

`handoff-finish` lists changed files with a fixed skip list (`node_modules`,
`runs`, `handoffs`, `dist`, `.git`, `.env`, `.env.*`) and does not read
`.gitignore`, so `release/` (ignored, laid out by `release.sh`) lands in
the run as 50-odd changed artifacts. The capture also skips what the
project's `.gitignore` ignores (through `git ls-files --others --ignored
--exclude-standard` or `git check-ignore`, when the project is a git
repository); the fixed list stays for a project that is not.

### Out of scope

- `template update` for `vanilla-ts` projects: it handles embedded projects
  only (RQ-0069, RQ-0087); extending it is a later requirement. `website`
  already has the scripts from its RQ-0017.
- A bot mode, Windows as the developer's machine, TLS, a domain name or a
  reverse proxy, cache headers on a host's web server.

## Acceptance Criteria

- A new `vanilla-ts` project has the files and settings of 6; its four
  script and test files are byte-identical to the template's, and behave as
  `website`'s (RQ-0017) with the project's own name in container names,
  labels, the marker and messages.
- In the generated `.gitlab-ci.yml`, `build_static` calls `release.sh`, and
  `deploy_linux` and `deploy_preview_linux` call `deploy.sh` with
  `--image`; a scaffold test checks their container names, ports and labels.
- An aifactory test scaffolds a `vanilla-ts` project into a temp directory
  and runs its `pnpm test`, under `sh` and `dash`, and under the C locale.
  It covers, with fake `docker` and `ssh` on `PATH` (the fake `ssh` runs the
  remote command locally):
  - empty or unknown `DEPLOY_TARGET` / `DEPLOY_ACCESS` named; `.env` read,
    the environment wins;
  - `container` + `local`: built, own container replaced, labels, a port
    held by another container refused and named with nothing removed, a
    failed health check prints the log and fails, `--stop`, two users two
    names, `--image` with a caller's `com.aifactory.deploy` and no `dev`;
  - the port rule of 3b, each case;
  - the build context holds only `Dockerfile`, `nginx.conf` and
    `release/<project>/` (no `.env`, no `runs/`);
  - `container` + `remote`: ssh port, identity file and known hosts
    applied, the image built on the host, the URL printed;
  - `directory` + `local` into a cPanel-like root (`.htaccess`,
    `.well-known`, `cgi-bin`, mode `750`): copied in place with its file
    list, the host's files and the mode kept; a redeploy replaces changed
    files and removes its own that left the release; a file not ours in the
    way stops it, named, nothing written; another project's marker, `/`,
    `$HOME`, relative, one component and `..` refused; a missing directory
    created;
  - `directory` + `remote` through the same install step and rules;
  - `--prebuilt` ships the release as it is and stops without it;
  - `remote` without either key or with a missing file stops naming it
    before ssh; a refused login stops before the build;
  - profiles: read, precedence environment > profile > `.env`, an empty
    value stays empty, missing or odd names refused;
  - `--dry-run` calls neither `docker` nor `ssh` and changes no file.
- `deploy_linux` and `deploy_release`, run with fake `docker` and `ssh`:
  no `deploy/main.env` → the image on the runner; a profile without the File
  variables → stops naming them; with them → the release over ssh.
- No real deploy here: aifactory has no deploy host or `DEPLOY_*` values. The
  real `directory` + `remote` run is `website` RQ-0017's (cPanel host, 23
  October 2026); a project's own CI preview deploy runs `container` +
  `local` for real.
- A handoff test: a file under a directory the project's `.gitignore`
  ignores (`release/`) changed between begin and finish is not an
  artifact; a tracked file beside it is.
- The aifactory test suite and typecheck pass.
