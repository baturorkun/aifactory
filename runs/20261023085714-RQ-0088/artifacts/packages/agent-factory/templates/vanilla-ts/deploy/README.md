# Deploy profiles

One script, `scripts/deploy.sh`, deploys this project four ways. Each reads
the same `DEPLOY_*` settings, from a different place:

| Kind | Trigger | Settings |
|---|---|---|
| a developer's | `pnpm run deploy:dev` | `.env` (not committed; `.env.example` lists the variables) |
| main | a push to main | `deploy/main.env` |
| branch | a push to another branch | `deploy/branch.env` |
| release | a tag | `deploy/release.env` |

The files here are committed and hold no secrets. A setting in the
environment wins over a profile, and a profile over `.env`.

- **branch** ships with the template: a container on the runner, port
  `DEPLOY_BRANCH_PORT_BASE` + the RQ number. It must stay `container` +
  `local`.
- **main**: without `deploy/main.env`, main runs on the runner's Docker
  (container `<project>`, `APP_PORT`). Add the file to send it elsewhere.
- **release**: without `deploy/release.env`, a tag stops with "no
  `deploy/release.env`".

## The two choices

- `DEPLOY_TARGET`: `container` (the nginx image, run as a container on
  `DEPLOY_PORT`) or `directory` (the release copied into `DEPLOY_PATH` for a
  web server already there; only the files the last deploy wrote are ever
  replaced or removed).
- `DEPLOY_ACCESS`: `local` (the machine running the script: a developer's,
  or the CI runner) or `remote` (`DEPLOY_REMOTE_HOST` over ssh).

## Keys for `remote`

`remote` needs `DEPLOY_REMOTE_IDENTITY_FILE` (the key) and
`DEPLOY_REMOTE_KNOWN_HOSTS` (the host's key); the deploy stops at once,
naming the one that is missing, and logs in once before it builds.

- A developer points them at files on their machine, in `.env`.
- CI gets them from two GitLab variables of type **File**, **Protected**:
  a key made for deploying only (`ssh-keygen -t ed25519 -N ""`), its public
  half in each host's `authorized_keys` (prefixed
  `no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding`), and
  `ssh-keyscan <host>` output checked against a fingerprint you trust.
  Protect the tags (`v*`) so a release sees them.

## Examples

`deploy/main.env`, a container on a host:

```
DEPLOY_TARGET=container
DEPLOY_ACCESS=remote
DEPLOY_REMOTE_HOST=apps.example.com
DEPLOY_REMOTE_USER=deploy
DEPLOY_REMOTE_PORT=22
DEPLOY_PORT=8080
```

`deploy/release.env`, files into a web server's directory:

```
DEPLOY_TARGET=directory
DEPLOY_ACCESS=remote
DEPLOY_REMOTE_HOST=www.example.com
DEPLOY_REMOTE_USER=site
DEPLOY_REMOTE_PORT=22
DEPLOY_PATH=/home/site/public_html
```
