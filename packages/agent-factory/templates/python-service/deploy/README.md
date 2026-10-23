# Deploy profiles

One script, `scripts/deploy.sh`, deploys this service four ways. Each reads
the same `DEPLOY_*` settings, from a different place:

| Kind | Trigger | Settings |
|---|---|---|
| a developer's | `sh scripts/deploy.sh` | `.env` (not committed; `deploy/dev.env.example` lists the variables) |
| main | a push to the default branch | `deploy/main.env` |
| branch | the Deploy workflow, run by hand (profile `branch`) | `deploy/branch.env` |
| release | the Deploy workflow, run by hand for a tag (profile `release`) | `deploy/release.env` |

The files here are committed and hold no secrets. A setting in the
environment wins over a profile, and a profile over `.env`.

Deploy settings are the operator's. An agent working on a requirement does
not read or write them. aifactory starts its AI providers without any
`DEPLOY_*` variable.

- **branch** ships with the template. It must stay `local`: a branch never
  sees the deploy key. Each branch is a compose stack of its own
  (`<project>-<branch>`), on port `DEPLOY_BRANCH_PORT_BASE` + the RQ number.
  Deleting the branch stops its stack.
- **main**: without `deploy/main.env`, a push to main deploys nothing.
- **release** runs in the GitHub environment `release`. Give it protection
  rules (required reviewers) so a release waits for an approval.
  - With `DEPLOY_IMAGE` in `deploy/release.env`, it runs that registry image
    at the tag (`--image <DEPLOY_IMAGE>:<tag>`; the target must be logged in
    to the registry).
  - Without `DEPLOY_IMAGE`, it builds the tag on the target.

## The compose target

`DEPLOY_TARGET=compose` runs the project's own compose stack. Its directory on
the target, `DEPLOY_DIR` (default `~/<compose project>`), holds:

- `src/`: replaced on each deploy. A build gets the files Git tracks or would
  track (`.gitignore` decides what stays behind); an image gets only the
  compose files.
- `runtime.env`: mode 600, kept between deploys. It is the stack's
  `--env-file`.
- the data directories (`DEPLOY_DATA_DIRS`).

On every deploy, `runtime.env` gets:

- each `DEPLOY_ENV_SET_<NAME>=value` as `NAME=value`;
- the port as `DEPLOY_COMPOSE_PORT_VAR`, and the image as
  `DEPLOY_COMPOSE_IMAGE_VAR`;
- `GIT_COMMIT_SHA` and `GIT_COMMIT_TIME`.

A name in `DEPLOY_ENV_SECRETS` (`NAME=hex32`, `NAME=base64url32`) is
generated there once, the first time it is missing. It is never printed, and
it never leaves the host. `DEPLOY_ENV_COPY` (`path:NAME,NAME`) copies names
from another env file on the target, for example a branch preview using
main's database password.

`DEPLOY_COMPOSE_OVERLAYS` (`network:file`) adds a compose file only where its
network exists: a log stack that one host has and another does not. Side
stacks like that are set up on the host on their own. A deploy only joins
them.

After `compose up`, the deploy waits for `DEPLOY_HEALTH_PATH` on
`127.0.0.1:<port>` from the target. `--stop` takes the stack down and keeps
its volumes.

`DEPLOY_DOCKER` is `docker` or `podman`, used as named. Under rootless podman
a data directory is given to its uid with `podman unshare chown`.

## Keys for `remote`

`remote` needs `DEPLOY_REMOTE_IDENTITY_FILE` (the key) and
`DEPLOY_REMOTE_KNOWN_HOSTS` (the host's key). Without them the deploy stops at
once and names the one that is missing. It logs in once before it builds.

- A developer points them at files on their machine, in `.env`.
- The Deploy workflow writes them from the secrets `DEPLOY_REMOTE_IDENTITY`
  and `DEPLOY_REMOTE_KNOWN_HOSTS` into files that are removed after the
  deploy. Use a key made for deploying only (`ssh-keygen -t ed25519 -N ""`).
  Put its public half in the host's `authorized_keys`, prefixed with
  `no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding`. Take the
  known hosts from `ssh-keyscan <host>`, checked against a fingerprint you
  trust.

## Example

`deploy/main.env`, the stack with its database on the runner:

```
DEPLOY_TARGET=compose
DEPLOY_ACCESS=local
DEPLOY_DOCKER=podman
DEPLOY_PORT=9000
DEPLOY_DIR=~/stacks/demo-main
DEPLOY_COMPOSE_PROJECT=demo
DEPLOY_COMPOSE_FILES=compose.db.yml compose.yml
DEPLOY_COMPOSE_PORT_VAR=APP_PORT
DEPLOY_COMPOSE_IMAGE_VAR=APP_IMAGE
DEPLOY_ENV_SECRETS=SESSION_SECRET=hex32 POSTGRES_PASSWORD=hex16
DEPLOY_DATA_DIRS=BACKUP_DIR=backups:10001
DEPLOY_HEALTH_PATH=/api/health
DEPLOY_ENV_SET_APP_TIMEZONE=Europe/Istanbul
```
