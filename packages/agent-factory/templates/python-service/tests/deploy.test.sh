#!/bin/sh
# scripts/deploy.sh's compose target (aifactory RQ-0090), with fake docker,
# podman, ssh and curl on PATH that record their calls. The fake ssh runs the
# remote command on this machine, so the target's steps run on real files.
# Run: sh tests/deploy.test.sh   (SHELL_UNDER_TEST=dash to run the script in dash)
set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_SH=${SHELL_UNDER_TEST:-sh}
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

# A Git checkout with a compose stack, a file Git ignores and one it would track.
P="$WORK/project"
mkdir -p "$P/scripts" "$P/src/demo" "$P/data"
cp "$PROJECT_ROOT/scripts/deploy.sh" "$P/scripts/"
printf '[build-system]\nrequires = ["setuptools"]\n\n[project]\nname = "demo-svc"\nversion = "0.1.0"\n' > "$P/pyproject.toml"
echo 'services: {app: {build: .}}' > "$P/compose.yml"
echo 'services: {db: {image: postgres}}' > "$P/compose.db.yml"
echo 'networks: {logs: {external: true}}' > "$P/compose.logs.yml"
echo 'FROM python:3.13-slim' > "$P/Dockerfile"
echo 'print("app")' > "$P/src/demo/app.py"
printf '.env\ndata/\n* [0-9]\n* [0-9].*\n' > "$P/.gitignore"
printf 'AI_API_KEY=secret-key\nGITHUB_TOKEN=secret-token\n' > "$P/.env"
echo 'local data' > "$P/data/db.sqlite"
(cd "$P" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init)
echo 'print("new")' > "$P/src/demo/new.py"
echo 'icloud copy' > "$P/src/demo/app 2.py"

BIN="$WORK/bin"
LOG="$WORK/calls.log"
mkdir -p "$BIN"
cat > "$BIN/engine" <<'EOF'
#!/bin/sh
echo "$(basename "$0") $* @$(pwd)" >> "$FAKE_LOG"
case $1 in
  network) case " ${FAKE_NETWORKS:-} " in *" $3 "*) exit 0 ;; *) exit 1 ;; esac ;;
  compose) case " $* " in *" logs "*) echo "fake stack log" ;; esac ;;
esac
exit 0
EOF
cp "$BIN/engine" "$BIN/podman"; mv "$BIN/engine" "$BIN/docker"
cat > "$BIN/ssh" <<'EOF'
#!/bin/sh
echo "ssh $*" >> "$FAKE_LOG"
eval "cmd=\${$#}"
exec sh -c "$cmd"
EOF
cat > "$BIN/curl" <<'EOF'
#!/bin/sh
echo "curl $*" >> "$FAKE_LOG"
exit "${FAKE_HEALTH_EXIT:-0}"
EOF
cp "$BIN/curl" "$BIN/wget"
chmod +x "$BIN"/*

export FAKE_LOG="$LOG" PATH="$BIN:$PATH" HOME="$WORK/home"
mkdir -p "$HOME"
KEY="$WORK/keys/id" KNOWN="$WORK/keys/known"
mkdir -p "$WORK/keys" && echo key > "$KEY" && echo host > "$KNOWN"

# Runs the script with a clean DEPLOY_* environment plus the given settings.
ARGS=''
deploy() {
  : > "$LOG"
  for name in $(env | sed -n 's/^\(DEPLOY_[A-Za-z0-9_]*\)=.*/\1/p; s/^\(CI_[A-Z_]*\)=.*/\1/p'); do unset "$name"; done
  env DEPLOY_USER=tester DEPLOY_HEALTH_SECONDS=2 "$@" "$RUN_SH" "$P/scripts/deploy.sh" ${ARGS:-}
}
has() { grep -qF -- "$1" "$LOG" || fail "expected a call with '$1'; calls:
$(cat "$LOG")"; }
hasnt() { if grep -qF -- "$1" "$LOG"; then fail "unexpected call with '$1'"; fi; }
COMPOSE="DEPLOY_TARGET=compose DEPLOY_ACCESS=local DEPLOY_DOCKER=podman DEPLOY_PORT=9300"
STACK="$HOME/demo-svc-dev-tester"

# --- the project's name ---------------------------------------------------------

cp "$P/pyproject.toml" "$WORK/pyproject.keep"
printf '[project]\nversion = "1"\n[tool.x]\nname = "not-this"\n' > "$P/pyproject.toml"
out=$(deploy $COMPOSE 2>&1) && fail "a pyproject.toml without a name accepted"
case $out in *"pyproject.toml's [project] needs a name"*) ;; *) fail "the missing name is not said: $out" ;; esac
cp "$WORK/pyproject.keep" "$P/pyproject.toml"
pass "the name comes from pyproject.toml's [project], not another table"

# --- a build deploy ----------------------------------------------------------------

out=$(deploy $COMPOSE DEPLOY_COMPOSE_FILES="compose.db.yml compose.yml" DEPLOY_COMPOSE_PORT_VAR=APP_PORT \
  DEPLOY_COMPOSE_IMAGE_VAR=APP_IMAGE DEPLOY_ENV_SET_APP_TIMEZONE="Europe/Istanbul" DEPLOY_ENV_SET_CLI_VERSION=2.1.0 \
  DEPLOY_ENV_SECRETS="SESSION_SECRET=hex16 ENCRYPTION_KEY=base64url32" DEPLOY_HEALTH_PATH=/api/health 2>&1) || fail "build deploy: $out"
ENV_FILE="$STACK/runtime.env"
[ -f "$ENV_FILE" ] || fail "runtime.env not written in $STACK"
[ "$(ls -l "$ENV_FILE" | cut -c1-10)" = "-rw-------" ] || fail "runtime.env is not mode 600: $(ls -l "$ENV_FILE")"
for line in APP_PORT=9300 APP_IMAGE=localhost/demo-svc:demo-svc-dev-tester APP_TIMEZONE=Europe/Istanbul CLI_VERSION=2.1.0; do
  grep -qx "$line" "$ENV_FILE" || fail "runtime.env lacks $line: $(cat "$ENV_FILE")"
done
grep -q '^GIT_COMMIT_SHA=[0-9a-f]\{7\}$' "$ENV_FILE" || fail "no commit in runtime.env"
session=$(sed -n 's/^SESSION_SECRET=//p' "$ENV_FILE")
key=$(sed -n 's/^ENCRYPTION_KEY=//p' "$ENV_FILE")
[ ${#session} = 32 ] || fail "hex16 is not 32 hex digits: $session"
[ ${#key} = 44 ] || fail "base64url32 is not 44 characters: $key"
case $key in *[+/]*) fail "base64url has + or /: $key" ;; esac
case $out in *"$session"*|*"$key"*) fail "a secret was printed" ;; esac
case $out in *"generated SESSION_SECRET"*) ;; *) fail "the generation is not said: $out" ;; esac
pass "runtime.env: mode 600, settings, port, image, commit; secrets generated and not printed"

[ -f "$STACK/src/src/demo/app.py" ] && [ -f "$STACK/src/src/demo/new.py" ] || fail "tracked and new files not sent: $(cd "$STACK/src" && find . -type f)"
[ ! -e "$STACK/src/.env" ] || fail ".env was sent"
[ ! -e "$STACK/src/data" ] || fail "an ignored directory was sent"
[ ! -e "$STACK/src/src/demo/app 2.py" ] || fail "an iCloud copy was sent"
pass "the working tree as Git sees it is sent; .env and ignored files are not"

has "podman compose -p demo-svc-dev-tester --env-file $ENV_FILE -f compose.db.yml -f compose.yml up -d --build --remove-orphans @$STACK/src"
has "podman image prune -f"
has "curl -fsS -o /dev/null http://127.0.0.1:9300/api/health"
pass "compose up with the files in order, prune, health check"

deploy $COMPOSE DEPLOY_ENV_SECRETS="SESSION_SECRET=hex16 ENCRYPTION_KEY=base64url32" DEPLOY_ENV_SET_CLI_VERSION=2.2.0 >/dev/null 2>&1 || fail "second deploy"
[ "$(sed -n 's/^SESSION_SECRET=//p' "$ENV_FILE")" = "$session" ] || fail "a secret was generated again"
grep -qx CLI_VERSION=2.2.0 "$ENV_FILE" || fail "a setting was not updated"
[ "$(grep -c '^CLI_VERSION=' "$ENV_FILE")" = 1 ] || fail "a setting was written twice"
pass "a secret is generated once; a setting is replaced, not repeated"

# --- overlays, data directories, copies -----------------------------------------------

deploy $COMPOSE DEPLOY_COMPOSE_OVERLAYS="demo-logs:compose.logs.yml" >/dev/null 2>&1 || fail "overlay without network"
hasnt "-f compose.logs.yml"
FAKE_NETWORKS=demo-logs deploy $COMPOSE DEPLOY_COMPOSE_OVERLAYS="demo-logs:compose.logs.yml" >/dev/null 2>&1 || fail "overlay with network"
has "-f compose.yml -f compose.logs.yml up"
pass "an overlay is added only where its network exists"

deploy $COMPOSE DEPLOY_DATA_DIRS="BACKUP_DIR=backups:10001" >/dev/null 2>&1 || fail "data dirs"
[ -d "$STACK/backups" ] || fail "data directory not made"
has "podman unshare chown 10001:10001 $STACK/backups"
grep -qx "BACKUP_DIR=$STACK/backups" "$ENV_FILE" || fail "data directory not in runtime.env"
pass "a data directory is made, given to its uid under podman, and named in runtime.env"

printf 'DB_PASSWORD=from-main\nOTHER=x\n' > "$WORK/main.env"
deploy $COMPOSE DEPLOY_ENV_COPY="$WORK/main.env:DB_PASSWORD" >/dev/null 2>&1 || fail "copy"
grep -qx DB_PASSWORD=from-main "$ENV_FILE" || fail "not copied"
out=$(deploy $COMPOSE DEPLOY_ENV_COPY="$WORK/none.env:MISSING_ONE" 2>&1) && fail "a missing source accepted"
case $out in *"$WORK/none.env is missing"*MISSING_ONE*) ;; *) fail "the missing source is not named: $out" ;; esac
pass "a name is copied from another env file once; a missing source is named"

# --- image, stop, health, remote, dry run ---------------------------------------------

out=$(ARGS="--image ghcr.io/x/demo:v1.2.3"; deploy $COMPOSE DEPLOY_COMPOSE_IMAGE_VAR=APP_IMAGE 2>&1) || fail "image deploy: $out"
has "podman pull ghcr.io/x/demo:v1.2.3"
has "up -d --no-build --remove-orphans"
grep -qx APP_IMAGE=ghcr.io/x/demo:v1.2.3 "$ENV_FILE" || fail "image not in runtime.env"
[ ! -e "$STACK/src/src" ] && [ -f "$STACK/src/compose.yml" ] || fail "an image deploy sent more than the compose files"
pass "--image pulls and runs without a build; only the compose files are sent"

out=$(ARGS="--stop"; deploy $COMPOSE 2>&1) || fail "stop: $out"
has "compose -p demo-svc-dev-tester --env-file $ENV_FILE -f compose.yml down"
hasnt "down -v"; hasnt "--volumes"
pass "--stop takes the stack down and keeps its volumes"

out=$(FAKE_HEALTH_EXIT=7 deploy $COMPOSE 2>&1) && fail "a failing health check passed"
case $out in *"health check failed"*"/healthz"*) ;; *) fail "health failure not said: $out" ;; esac
has "logs --tail 50"
pass "a stack that does not answer stops the deploy with its log"

out=$(deploy DEPLOY_TARGET=compose DEPLOY_ACCESS=remote DEPLOY_DOCKER=docker DEPLOY_PORT=9300 DEPLOY_REMOTE_HOST=host.example \
  DEPLOY_REMOTE_USER=ops DEPLOY_REMOTE_IDENTITY_FILE="$KEY" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN" DEPLOY_DIR="~/stacks/demo" 2>&1) || fail "remote: $out"
has "-i $KEY"
has "UserKnownHostsFile=$KNOWN"
has "ops@host.example"
has "docker compose -p demo-svc-dev-tester"
[ -f "$HOME/stacks/demo/runtime.env" ] || fail "DEPLOY_DIR with ~ not used"
pass "remote: ssh with the named key and known hosts; DEPLOY_DIR may start with ~/"

out=$(ARGS="--dry-run"; deploy $COMPOSE DEPLOY_DIR="$WORK/dry" DEPLOY_ENV_SET_TOKENISH=s3cret 2>&1) || fail "dry run: $out"
[ ! -e "$WORK/dry" ] || fail "--dry-run wrote the stack directory"
hasnt "podman"
case $out in *s3cret*) fail "--dry-run printed a value" ;; *"set TOKENISH=…"*) ;; *) fail "dry run does not list what it sets: $out" ;; esac
pass "--dry-run changes nothing and prints names, not values"

# --- settings checked before anything runs ---------------------------------------------

out=$(deploy $COMPOSE DEPLOY_DOCKER=nerdctl 2>&1) && fail "an unknown engine accepted"
case $out in *"DEPLOY_DOCKER must be docker or podman"*) ;; *) fail "$out" ;; esac
out=$(deploy $COMPOSE DEPLOY_ENV_SECRETS="KEY=random" 2>&1) && fail "a bad secret kind accepted"
case $out in *"DEPLOY_ENV_SECRETS: 'KEY=random'"*) ;; *) fail "$out" ;; esac
out=$(deploy $COMPOSE DEPLOY_COMPOSE_FILES="compose.yml compose.missing.yml" 2>&1) && fail "a missing compose file accepted"
case $out in *"compose.missing.yml is missing"*) ;; *) fail "$out" ;; esac
out=$(deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$WORK/www" 2>&1) && fail "a directory deploy of a service accepted"
case $out in *"use DEPLOY_TARGET=compose"*) ;; *) fail "$out" ;; esac
pass "an unknown engine, a bad setting, a missing compose file and a static target are named before anything runs"

out=$(deploy DEPLOY_TARGET=compose DEPLOY_ACCESS=local DEPLOY_DOCKER=podman DEPLOY_BRANCH=factory/RQ-0012 DEPLOY_BRANCH_PORT_BASE=9000 \
  DEPLOY_DEFAULT_BRANCH=main DEPLOY_PROFILE= 2>&1) || fail "branch port: $out"
case $out in *"port 9012: DEPLOY_BRANCH_PORT_BASE 9000 + RQ-12"*) ;; *) fail "DEPLOY_BRANCH not used: $out" ;; esac
out=$(deploy $COMPOSE DEPLOY_BRANCH=feature-x DEPLOY_RUN_ID=40007 DEPLOY_PORT= 2>&1) || fail "run id port: $out"
case $out in *"port 20007"*) ;; *) fail "DEPLOY_RUN_ID not used: $out" ;; esac
pass "GitHub Actions' branch and run id give the port as GitLab's do"

mkdir -p "$P/deploy"
printf 'DEPLOY_TARGET=compose\nDEPLOY_ACCESS=local\nDEPLOY_DOCKER=podman\nDEPLOY_BRANCH_PORT_BASE=9000\n' > "$P/deploy/branch.env"
out=$(ARGS="--profile branch"; deploy DEPLOY_BRANCH=factory/RQ-0012 2>&1) || fail "branch profile: $out"
has "compose -p demo-svc-factory-rq-0012 "
[ -f "$HOME/demo-svc-factory-rq-0012/runtime.env" ] || fail "the branch's stack directory"
pass "each branch preview is a stack of its own, named after its branch"

echo "all compose deploy tests passed (${SHELL_UNDER_TEST:-sh})"
