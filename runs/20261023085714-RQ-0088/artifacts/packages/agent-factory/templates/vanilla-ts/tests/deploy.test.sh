#!/bin/sh
# scripts/deploy.sh behaviour (aifactory RQ-0088), with fake docker and ssh on PATH that
# record their calls. The fake ssh runs the remote command on this machine, so
# the remote paths go through the same install step on real directories.
# Run: sh tests/deploy.test.sh   (SHELL_UNDER_TEST=dash to run the script in dash)
set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_SH=${SHELL_UNDER_TEST:-sh}
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$*"; }

# A project tree with what the script reads, plus files that must never leave.
P="$WORK/project"
mkdir -p "$P/scripts" "$P/public" "$P/src" "$P/dist/content" "$P/runs/r1"
cp "$PROJECT_ROOT/scripts/deploy.sh" "$PROJECT_ROOT/scripts/release.sh" "$P/scripts/"
echo 'FROM nginx:1.27-alpine' > "$P/Dockerfile"
echo 'server { listen 8282; }' > "$P/nginx.conf"
printf '{\n  "name": "demo",\n  "private": true\n}\n' > "$P/package.json"
echo '<html></html>' > "$P/public/index.html"
echo 'body{}' > "$P/src/styles.css"
echo '// main' > "$P/dist/main.js"
echo '// content' > "$P/dist/content/site-content.js"
echo 'secret' > "$P/runs/r1/log.txt"
printf 'AI_API_KEY=secret-key\nGITLAB_TOKEN=secret-token\n' > "$P/.env"

BIN="$WORK/bin"
LOG="$WORK/calls.log"
mkdir -p "$BIN"
cat > "$BIN/docker" <<'EOF'
#!/bin/sh
echo "docker $*" >> "$FAKE_LOG"
case $1 in
  ps) [ ! -f "$FAKE_PS" ] || cat "$FAKE_PS" ;;
  build) eval "ctx=\${$#}"; (cd "$ctx" && find . -type f | sort) > "$FAKE_LOG.ctx" ;;
  exec) exit "${FAKE_HEALTH_EXIT:-0}" ;;
  logs) echo "fake container log" ;;
esac
exit 0
EOF
cat > "$BIN/ssh" <<'EOF'
#!/bin/sh
echo "ssh $*" >> "$FAKE_LOG"
[ -z "${FAKE_SSH_EXIT:-}" ] || exit "$FAKE_SSH_EXIT"
eval "cmd=\${$#}"
exec sh -c "$cmd"
EOF
chmod +x "$BIN/docker" "$BIN/ssh"

export FAKE_LOG="$LOG" FAKE_PS="$WORK/ps.txt" PATH="$BIN:$PATH"
KEY="$WORK/keys/id" KNOWN="$WORK/keys/known"
mkdir -p "$WORK/keys" && echo key > "$KEY" && echo host > "$KNOWN"

# Runs the script with a clean DEPLOY_* environment plus the given settings.
# Options for the script go in ARGS, set and cleared around a call: an
# assignment in front of a function call outlives it in some shells.
ARGS=''
deploy() {
  : > "$LOG"
  rm -f "$LOG.ctx"
  env -u DEPLOY_TARGET -u DEPLOY_ACCESS -u DEPLOY_PATH -u DEPLOY_PORT -u DEPLOY_USER \
    -u DEPLOY_CONTAINER_NAME -u DEPLOY_REMOTE_HOST -u DEPLOY_REMOTE_USER -u DEPLOY_REMOTE_PORT \
    -u DEPLOY_REMOTE_IDENTITY_FILE -u DEPLOY_REMOTE_KNOWN_HOSTS -u DEPLOY_DOCKER -u DEPLOY_BRANCH_PORT_BASE \
    -u CI_COMMIT_BRANCH -u CI_DEFAULT_BRANCH -u CI_PIPELINE_ID -u DEPLOY_PROFILE \
    DEPLOY_HEALTH_SECONDS=2 "$@" "$RUN_SH" "$P/scripts/deploy.sh" --no-build ${ARGS:-}
}
has() { grep -qF -- "$1" "$LOG" || fail "expected a call with '$1'; calls:
$(cat "$LOG")"; }
hasnt() { if grep -qF -- "$1" "$LOG"; then fail "unexpected call with '$1'"; fi; }

# --- the project's name ---------------------------------------------------------

cp "$P/package.json" "$WORK/package.json.keep"
printf '{\n  "private": true\n}\n' > "$P/package.json"
out=$(deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_PORT=9100 2>&1) && fail "a package.json without a name accepted"
case $out in *"package.json needs a name"*) ;; *) fail "the missing name is not said: $out" ;; esac
cp "$WORK/package.json.keep" "$P/package.json"
pass "the project's name comes from package.json, and its absence stops the deploy"

# --- settings -----------------------------------------------------------------

out=$(deploy DEPLOY_ACCESS=local 2>&1) && fail "empty DEPLOY_TARGET accepted"
case $out in *DEPLOY_TARGET*) ;; *) fail "empty DEPLOY_TARGET not named: $out" ;; esac
out=$(deploy DEPLOY_TARGET=container 2>&1) && fail "empty DEPLOY_ACCESS accepted"
case $out in *DEPLOY_ACCESS*) ;; *) fail "empty DEPLOY_ACCESS not named: $out" ;; esac
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=ssh >/dev/null 2>&1 && fail "DEPLOY_ACCESS=ssh accepted"
pass "empty or unknown DEPLOY_TARGET / DEPLOY_ACCESS stop and are named"

printf 'DEPLOY_TARGET=container\nDEPLOY_ACCESS="local"\nDEPLOY_PORT=9001\n' >> "$P/.env"
deploy DEPLOY_PORT=9002 DEPLOY_USER=ali >/dev/null
has "--publish 9002:8282"
sed -i.bak '/^DEPLOY_/d' "$P/.env" && rm -f "$P/.env.bak"
pass ".env DEPLOY_* lines are read; the environment wins"

# --- profiles -----------------------------------------------------------------

mkdir -p "$P/deploy" "$WORK/srv"
printf 'DEPLOY_TARGET=directory\nDEPLOY_ACCESS=local\nDEPLOY_PATH=%s\n' "$WORK/srv/profiled" > "$P/deploy/main.env"
printf 'DEPLOY_TARGET=directory\nDEPLOY_ACCESS=local\nDEPLOY_PATH=\n' > "$P/deploy/release.env"
printf 'DEPLOY_TARGET=container\nDEPLOY_PATH=%s\n' "$WORK/srv/from-dotenv" >> "$P/.env"
ARGS="--profile main"
deploy >/dev/null
ARGS=''
[ -f "$WORK/srv/profiled/.aifactory-deploy" ] || fail "--profile main did not deploy where deploy/main.env says"
[ ! -e "$WORK/srv/from-dotenv" ] || fail ".env won over the profile"
deploy DEPLOY_PROFILE=main DEPLOY_PATH="$WORK/srv/from-env" >/dev/null
[ -f "$WORK/srv/from-env/.aifactory-deploy" ] || fail "the environment did not win over the profile"
ARGS="--profile release"
out=$(deploy 2>&1) && fail "a profile with an empty DEPLOY_PATH deployed"
ARGS=''
case $out in *"DEPLOY_PATH is empty"*) ;; *) fail "the empty DEPLOY_PATH of a profile is not named: $out" ;; esac
ARGS="--profile staging"
deploy >/dev/null 2>&1 && fail "a missing profile accepted"
ARGS="--profile ../main"
deploy >/dev/null 2>&1 && fail "a profile name with a path accepted"
ARGS=''
sed -i.bak '/^DEPLOY_/d' "$P/.env" && rm -f "$P/.env.bak"
rm -rf "$P/deploy" "$WORK/srv"
pass "profiles: deploy/<name>.env read, the environment wins over it and it over .env; an empty value stays empty; missing or odd names refused"

# --- container + local --------------------------------------------------------

: > "$FAKE_PS"
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_PORT=9100 DEPLOY_USER=Ali >/dev/null
has "docker build --tag demo-dev-ali:latest"
has "docker rm --force demo-dev-ali"
has "docker run --detach --restart unless-stopped --name demo-dev-ali --publish 9100:8282"
has "--label com.aifactory.project=demo --label com.aifactory.deploy=dev --label com.aifactory.owner=ali"
has "docker exec demo-dev-ali wget"
pass "container + local: built, own container replaced, labels, health check"

sort "$LOG.ctx" > "$WORK/ctx.txt"
grep -qx './Dockerfile' "$WORK/ctx.txt" || fail "Dockerfile not in the build context"
grep -qx './release/demo/index.html' "$WORK/ctx.txt" || fail "top-level index.html not in the release"
grep -qx './release/demo/dist/main.js' "$WORK/ctx.txt" || fail "dist not in the release"
if grep -qE '\.env|runs/|scripts/' "$WORK/ctx.txt"; then fail "build context holds more than the release: $(cat "$WORK/ctx.txt")"; fi
pass "the build context holds only Dockerfile, nginx.conf and release/demo (no .env, no runs/)"

deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_PORT=9100 DEPLOY_USER=veli >/dev/null
has "--name demo-dev-veli"
pass "two users get two container names"

echo "demo 0.0.0.0:8282->8282/tcp" > "$FAKE_PS"
echo "demo-dev-ayse 0.0.0.0:9100->8282/tcp" >> "$FAKE_PS"
out=$(deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_PORT=9100 DEPLOY_USER=ali 2>&1) && fail "port held by another container accepted"
case $out in *demo-dev-ayse*) ;; *) fail "port owner not named: $out" ;; esac
hasnt "docker run"
hasnt "docker rm"
echo "demo-dev-ali 0.0.0.0:9100->8282/tcp" > "$FAKE_PS"
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_PORT=9100 DEPLOY_USER=ali >/dev/null
has "docker run"
: > "$FAKE_PS"
pass "a port held by another container stops the deploy and names it; our own is replaced"

out=$(export FAKE_HEALTH_EXIT=1; deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_PORT=9100 DEPLOY_USER=ali 2>&1) && fail "failed health check accepted"
case $out in *"fake container log"*) ;; *) fail "container log not printed: $out" ;; esac
pass "a failed health check prints the log and exits non-zero"

ARGS=--stop
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_USER=ali >/dev/null
ARGS=''
has "docker rm --force demo-dev-ali"
hasnt "docker run"
hasnt "docker build"
pass "--stop removes only its own container"

ARGS="--image demo:abc123 --label com.aifactory.deploy=preview"
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local \
  DEPLOY_CONTAINER_NAME=demo DEPLOY_PORT=8282 >/dev/null
ARGS=''
hasnt "docker build"
has "docker run --detach --restart unless-stopped --name demo --publish 8282:8282"
has "--label com.aifactory.deploy=preview demo:abc123"
hasnt "com.aifactory.deploy=dev"
pass "--image (CI) runs the given image with the given name, no build"

# The port follows the branch.
port_of() {
  : > "$FAKE_PS"
  deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local DEPLOY_USER=ali "$@" >/dev/null
  sed -n 's/.*--publish \([0-9]*\):8282.*/\1/p' "$LOG"
}
expect_port() { want=$1; shift; got=$(port_of "$@"); [ "$got" = "$want" ] || fail "port $got, expected $want ($*)"; }
expect_port 8282 CI_COMMIT_BRANCH=main DEPLOY_PORT=8282
expect_port 9000 CI_COMMIT_BRANCH=trunk CI_DEFAULT_BRANCH=trunk DEPLOY_PORT=9000
expect_port 8117 CI_COMMIT_BRANCH=factory/RQ-0017 DEPLOY_PORT=8282
expect_port 9117 CI_COMMIT_BRANCH=factory/RQ-0017 DEPLOY_BRANCH_PORT_BASE=9100
expect_port 8142 CI_COMMIT_BRANCH=rq-42-fix
expect_port 8105 CI_COMMIT_BRANCH=factory/RQ-0005
expect_port 8223 CI_COMMIT_BRANCH=factory/RQ-0123
expect_port 21234 CI_COMMIT_BRANCH=feature/x CI_PIPELINE_ID=41234
expect_port 9100 CI_COMMIT_BRANCH=feature/x DEPLOY_PORT=9100
ARGS="--port 8500"
expect_port 8500 CI_COMMIT_BRANCH=factory/RQ-0017
ARGS=''
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local CI_COMMIT_BRANCH=factory/RQ-0017 DEPLOY_BRANCH_PORT_BASE=83x >/dev/null 2>&1 \
  && fail "a non-numeric base accepted"
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local CI_COMMIT_BRANCH=factory/RQ-0017 DEPLOY_BRANCH_PORT_BASE=65530 >/dev/null 2>&1 \
  && fail "a port over 65535 accepted"
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=local CI_COMMIT_BRANCH=main >/dev/null 2>&1 && fail "main without DEPLOY_PORT accepted"
pass "port: main DEPLOY_PORT, RQ-N base+N (default 8100), over 65535 refused, other branches 20000+pipeline in CI, --port wins"

# A remote deploy names both keys and logs in before it builds anything.
rkeys() { deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=remote DEPLOY_REMOTE_HOST=web.example DEPLOY_PATH="$WORK/remote/k" "$@" 2>&1; }
out=$(rkeys DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN") && fail "remote without a key accepted"
case $out in *"DEPLOY_REMOTE_IDENTITY_FILE is empty"*) ;; *) fail "the missing key is not named: $out" ;; esac
out=$(rkeys DEPLOY_REMOTE_IDENTITY_FILE="$KEY") && fail "remote without known hosts accepted"
case $out in *"DEPLOY_REMOTE_KNOWN_HOSTS is empty"*) ;; *) fail "the missing known hosts are not named: $out" ;; esac
out=$(rkeys DEPLOY_REMOTE_IDENTITY_FILE="$WORK/keys/none" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN") && fail "a key path to no file accepted"
case $out in *"names no file"*) ;; *) fail "the missing key file is not named: $out" ;; esac
[ ! -s "$LOG" ] || fail "ssh was called without the keys: $(cat "$LOG")"
out=$(FAKE_SSH_EXIT=255 rkeys DEPLOY_REMOTE_IDENTITY_FILE="$KEY" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN") && fail "a refused login accepted"
case $out in *"cannot log in"*) ;; *) fail "the refused login is not said: $out" ;; esac
[ ! -e "$WORK/remote/k" ] || fail "a refused login still deployed"
pass "remote: an empty or missing key or known hosts stops before ssh, a refused login stops before the build, each named"

# --- container + remote -------------------------------------------------------

deploy DEPLOY_TARGET=container DEPLOY_ACCESS=remote DEPLOY_REMOTE_HOST=lab.example DEPLOY_REMOTE_USER=deployer \
  DEPLOY_REMOTE_PORT=2222 DEPLOY_REMOTE_IDENTITY_FILE="$KEY" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN" \
  DEPLOY_PORT=9100 DEPLOY_USER=ali > "$WORK/out.txt"
has "ssh -o BatchMode=yes -p 2222 -i $KEY -o UserKnownHostsFile=$KNOWN deployer@lab.example"
has "docker build --tag demo-dev-ali:latest"
grep -qx './release/demo/dist/main.js' "$LOG.ctx" || fail "the remote build did not get the release"
grep -q 'http://lab.example:9100/' "$WORK/out.txt" || fail "remote URL not printed"
pass "container + remote: context over ssh, image built on the host, ssh settings applied"

# --- directory + local --------------------------------------------------------

# A cPanel-like document root: the host's own files, its own permissions.
D="$WORK/srv/site"
mkdir -p "$D/cgi-bin" "$D/.well-known/acme-challenge"
echo 'RewriteEngine On' > "$D/.htaccess"
echo token > "$D/.well-known/acme-challenge/t1"
chmod 750 "$D"
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$D" DEPLOY_USER=ali >/dev/null
[ -f "$D/index.html" ] && [ -f "$D/public/index.html" ] && [ -f "$D/dist/main.js" ] || fail "release not copied"
grep -qx 'project=demo' "$D/.aifactory-deploy" || fail "marker missing"
grep -qx 'file=dist/main.js' "$D/.aifactory-deploy" || fail "marker does not list the files"
[ -f "$D/.htaccess" ] && [ -f "$D/.well-known/acme-challenge/t1" ] && [ -d "$D/cgi-bin" ] || fail "the host's own files were touched"
[ "$(ls -ld "$D" | cut -c1-10)" = drwxr-x--- ] || fail "the directory's permissions changed: $(ls -ld "$D")"
[ ! -e "$D/.env" ] && [ ! -e "$D/runs" ] || fail "files outside the release were copied"
pass "directory + local: release copied in place with its file list; .htaccess, .well-known, cgi-bin and permissions kept"

mkdir -p "$P/public/old"
echo old > "$P/public/old/gone.txt"
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$D" DEPLOY_USER=ali >/dev/null
[ -f "$D/public/old/gone.txt" ] || fail "a new release file was not copied"
rm -rf "$P/public/old"
echo 'console.log(2)' > "$P/dist/main.js"
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$D/" DEPLOY_USER=ali >/dev/null
[ ! -e "$D/public/old" ] || fail "a file that left the release, or its emptied directory, was kept"
grep -q 'console.log(2)' "$D/dist/main.js" || fail "a changed file was not replaced"
[ -f "$D/.htaccess" ] && [ -f "$D/.well-known/acme-challenge/t1" ] || fail "a redeploy touched the host's own files"
grep -q 'gone.txt' "$D/.aifactory-deploy" && fail "the marker still lists a removed file"
find "$D" -name '*.aifactory-tmp' | grep -q . && fail "temporary files left: $(find "$D" -name '*.aifactory-tmp')"
pass "a redeploy replaces changed files, removes its own files that left the release, keeps the host's"

refused() {
  if deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_USER=ali DEPLOY_PATH="$1" >/dev/null 2>&1; then
    fail "DEPLOY_PATH $1 accepted ($2)"
  fi
}
mkdir -p "$WORK/srv/other" && echo 'host page' > "$WORK/srv/other/index.html"
out=$(deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_USER=ali DEPLOY_PATH="$WORK/srv/other" 2>&1) && fail "a foreign index.html would be overwritten"
case $out in *index.html*) ;; *) fail "the clashing file is not named: $out" ;; esac
[ "$(cat "$WORK/srv/other/index.html")" = 'host page' ] && [ ! -e "$WORK/srv/other/dist" ] && [ ! -e "$WORK/srv/other/.aifactory-deploy" ] \
  || fail "a refused directory was changed"
mkdir -p "$WORK/srv/foreign" && echo 'project=other' > "$WORK/srv/foreign/.aifactory-deploy"
refused "$WORK/srv/foreign" "marker of another project"
refused / "root"
refused "$HOME" "home"
refused "$HOME/" "home with a slash"
refused srv/site "relative"
refused /srv "one component"
refused "$WORK/srv/../srv/site" "dot-dot"
pass "refused: a file that is not ours in the way (named), another project's marker, /, \$HOME, relative, one component, .."

deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$WORK/srv/new" DEPLOY_USER=ali >/dev/null
[ -f "$WORK/srv/new/.aifactory-deploy" ] || fail "a missing directory was not created"
ARGS=--stop
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$D" | grep -q 'nothing to stop' || fail "--stop on a directory"
ARGS=''
pass "a missing directory is created; --stop on a directory has nothing to stop"

# --- directory + remote -------------------------------------------------------

R="$WORK/remote/www"
mkdir -p "$R/.well-known"
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=remote DEPLOY_REMOTE_HOST=web.example DEPLOY_REMOTE_IDENTITY_FILE="$KEY" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN" DEPLOY_PATH="$R" DEPLOY_USER=ali >/dev/null
has "ssh -o BatchMode=yes -p 22 -i $KEY -o UserKnownHostsFile=$KNOWN web.example"
[ -f "$R/dist/main.js" ] && [ -d "$R/.well-known" ] && grep -qx 'project=demo' "$R/.aifactory-deploy" || fail "remote directory deploy"
mkdir -p "$WORK/remote/taken/dist" && echo x > "$WORK/remote/taken/dist/main.js"
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=remote DEPLOY_REMOTE_HOST=web.example DEPLOY_REMOTE_IDENTITY_FILE="$KEY" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN" DEPLOY_PATH="$WORK/remote/taken" DEPLOY_USER=ali >/dev/null 2>&1 \
  && fail "remote clash accepted"
pass "directory + remote: tar stream through the same install step, same rules"

# --- prebuilt (CI) ------------------------------------------------------------

rm -rf "$P/release"
ARGS=--prebuilt
out=$(deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$WORK/srv/pre" 2>&1) && fail "--prebuilt without a release accepted"
ARGS=''
case $out in *"release/demo/ is missing"*) ;; *) fail "missing release not named: $out" ;; esac
mkdir -p "$P/release/demo/dist"
echo '<html>ci</html>' > "$P/release/demo/index.html"
echo '// from build_static' > "$P/release/demo/dist/main.js"
ARGS=--prebuilt
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$WORK/srv/pre" >/dev/null
ARGS=''
grep -q 'from build_static' "$WORK/srv/pre/dist/main.js" || fail "--prebuilt did not ship release/ as it is"
[ ! -e "$WORK/srv/pre/public" ] || fail "--prebuilt ran release.sh"
pass "--prebuilt ships build_static's release as it is, and stops when it is missing"

# --- dry run ------------------------------------------------------------------

before=$(find "$WORK/srv" "$WORK/remote" | sort; cat "$D/.aifactory-deploy")
ARGS=--dry-run
deploy DEPLOY_TARGET=container DEPLOY_ACCESS=remote DEPLOY_REMOTE_HOST=lab.example DEPLOY_REMOTE_IDENTITY_FILE="$KEY" DEPLOY_REMOTE_KNOWN_HOSTS="$KNOWN" DEPLOY_PORT=9100 DEPLOY_USER=ali > "$WORK/dry.txt"
deploy DEPLOY_TARGET=directory DEPLOY_ACCESS=local DEPLOY_PATH="$D" DEPLOY_USER=ali >> "$WORK/dry.txt"
ARGS=''
[ ! -s "$LOG" ] || fail "--dry-run called: $(cat "$LOG")"
[ "$before" = "$(find "$WORK/srv" "$WORK/remote" | sort; cat "$D/.aifactory-deploy")" ] || fail "--dry-run changed files"
grep -q 'remote lab.example' "$WORK/dry.txt" && grep -q "$D" "$WORK/dry.txt" || fail "--dry-run did not say what and where"
pass "--dry-run prints what and where, calls neither docker nor ssh, changes no file"

echo "all deploy tests passed ($RUN_SH)"
