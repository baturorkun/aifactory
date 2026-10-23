#!/bin/sh
# Deploys the project (aifactory RQ-0088; compose, RQ-0090): a developer runs it
# (`pnpm run deploy:dev`, or `sh scripts/deploy.sh`), CI runs it with a profile.
#
#   DEPLOY_TARGET  container | directory | compose   what a deploy is
#   DEPLOY_ACCESS  local | remote                    where it goes (remote: over ssh)
#
# container: the nginx image as one container; directory: the release copied
# into a directory; compose: the project's own compose stack, built from the
# working tree on the target or run from a registry image.
#
# Settings come from the environment, else from deploy/<profile>.env when a
# profile is named (--profile or DEPLOY_PROFILE: deploy/main.env for main,
# deploy/release.env for a tag, committed, no secrets), else from the DEPLOY_*
# lines of .env; .env.example lists them. Only release/<project>/ (and for a container,
# Dockerfile and nginx.conf) leaves this machine; for compose, the files Git
# tracks or would track (.gitignore decides).
#
# Deploy settings are the operator's: an agent neither reads nor writes them,
# and aifactory starts no AI provider with a DEPLOY_* variable (RQ-0090).
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The project's name, from package.json, else pyproject.toml's [project]:
# container names, labels, the marker.
if [ -f "$ROOT/package.json" ]; then
  NAME_FROM=package.json
  PROJECT=$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -n 1)
elif [ -f "$ROOT/pyproject.toml" ]; then
  NAME_FROM="pyproject.toml's [project]"
  PROJECT=$(awk '/^\[project\][[:space:]]*$/ { inside = 1; next } /^\[/ { inside = 0 }
    inside && /^[[:space:]]*name[[:space:]]*=/ { sub(/^[^=]*=[[:space:]]*/, ""); gsub(/["\047[:space:]]/, ""); print; exit }' "$ROOT/pyproject.toml")
else
  echo "deploy: no package.json or pyproject.toml to read the project's name from" >&2; exit 1
fi
PROJECT=${PROJECT##*/}
case $PROJECT in
  ''|*[!a-z0-9._-]*) echo "$NAME_FROM needs a name of lower-case letters, digits, ., _ and -: '$PROJECT'" >&2; exit 1 ;;
esac
MARKER=.aifactory-deploy

usage() {
  cat <<'EOF'
Usage: pnpm run deploy:dev [-- options]

  --dry-run        print what would be built, sent, run or copied; change nothing
  --stop           remove this deploy's container (container), or take the
                   stack down, keeping its volumes (compose)
  --no-build       deploy the existing dist/ without running pnpm build
  --prebuilt       deploy release/<project>/ as it is: no build, no release.sh (CI)
  --image <tag>    run this already built image instead of building one (CI;
                   compose: pulled on the target)
  --label <k=v>    an extra container label, repeatable (CI)
  --port <n>       the container's host port, overriding the branch rule below
  --profile <name> read deploy/<name>.env (CI: main, release); DEPLOY_PROFILE too

Container port: on the default branch DEPLOY_PORT; on factory/RQ-N
DEPLOY_BRANCH_PORT_BASE + N (empty base: 8100, so RQ-17 is 8117); on another
branch 20000 + the pipeline id in CI, DEPLOY_PORT here. The branch is
DEPLOY_BRANCH (GitHub Actions sets it), else CI_COMMIT_BRANCH, else Git's.
EOF
}

die() { echo "deploy: $*" >&2; exit 1; }
say() { echo "deploy: $*"; }

# Single-quotes a value for a shell command line (local sh -c or the remote host).
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

DRY_RUN=0 STOP=0 BUILD=1 PREBUILT=0 IMAGE='' LABELS='' PORT_ARG='' PROFILE=${DEPLOY_PROFILE:-}
while [ $# -gt 0 ]; do
  case $1 in
    --) ;;
    --dry-run) DRY_RUN=1 ;;
    --stop) STOP=1 ;;
    --no-build) BUILD=0 ;;
    --prebuilt) BUILD=0; PREBUILT=1 ;;
    --image) [ $# -ge 2 ] || die "--image needs a tag"; IMAGE=$2; BUILD=0; shift ;;
    --profile) [ $# -ge 2 ] || die "--profile needs a name"; PROFILE=$2; shift ;;
    --port) [ $# -ge 2 ] || die "--port needs a number"; PORT_ARG=$2; shift ;;
    --label) [ $# -ge 2 ] || die "--label needs key=value"; LABELS="$LABELS --label $(q "$2")"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
  shift
done

# DEPLOY_* lines of a file, without overriding what is already set: the
# environment first, then the profile, then .env.
load_settings() {
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in DEPLOY_*=*) ;; *) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    case $key in *[!A-Z0-9_]*) continue ;; esac
    case $val in
      \"*\") val=${val#\"}; val=${val%\"} ;;
      \'*\') val=${val#\'}; val=${val%\'} ;;
    esac
    eval "isset=\${$key+x}"
    [ -n "$isset" ] || export "$key=$val"
  done < "$1"
}
if [ -n "$PROFILE" ]; then
  case $PROFILE in *[!a-z0-9_-]*) die "a profile name is lower-case letters, digits, - and _: $PROFILE" ;; esac
  [ -f "$ROOT/deploy/$PROFILE.env" ] || die "no deploy/$PROFILE.env for profile $PROFILE"
  load_settings "$ROOT/deploy/$PROFILE.env"
fi
[ ! -f "$ROOT/.env" ] || load_settings "$ROOT/.env"

# A profile deployed on its own host (DEPLOY_BY=host: a release behind a VPN,
# started there with release-here.sh from the image) is never deployed by CI
# (RQ-0091).
case ${DEPLOY_BY:-} in
  ''|ci) ;;
  host)
    if [ -n "${GITHUB_ACTIONS:-}${GITLAB_CI:-}" ]; then
      die "${PROFILE:-this} profile says DEPLOY_BY=host: it is deployed on its host (sh release-here.sh <tag> there), never by CI."
    fi ;;
  *) die "DEPLOY_BY must be ci or host, not '$DEPLOY_BY'." ;;
esac

TARGET=${DEPLOY_TARGET:-}
ACCESS=${DEPLOY_ACCESS:-}
[ -n "$TARGET" ] || die "DEPLOY_TARGET is empty: set it in .env to container, directory or compose."
[ -n "$ACCESS" ] || die "DEPLOY_ACCESS is empty: set it in .env to local or remote."
case $TARGET in container|directory|compose) ;; *) die "DEPLOY_TARGET must be container, directory or compose, not '$TARGET'." ;; esac
# container and directory ship a static release (scripts/release.sh): a
# project without one (a Python service) runs as its compose stack.
if [ "$TARGET" != compose ] && [ ! -f "$ROOT/scripts/release.sh" ]; then
  die "DEPLOY_TARGET=$TARGET ships a static release (scripts/release.sh), which this project has none of: use DEPLOY_TARGET=compose."
fi
case $ACCESS in local|remote) ;; *) die "DEPLOY_ACCESS must be local or remote, not '$ACCESS'." ;; esac

# Whose deploy: names the container and the directory marker.
DEPLOY_WHO=$(printf '%s' "${DEPLOY_USER:-$(id -un)}" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9_.-' '-')

if [ "$ACCESS" = remote ]; then
  [ -n "${DEPLOY_REMOTE_HOST:-}" ] || die "DEPLOY_REMOTE_HOST is empty: DEPLOY_ACCESS=remote needs the host."
  SSH_DEST=$DEPLOY_REMOTE_HOST
  [ -z "${DEPLOY_REMOTE_USER:-}" ] || SSH_DEST="$DEPLOY_REMOTE_USER@$DEPLOY_REMOTE_HOST"
  URL_HOST=$DEPLOY_REMOTE_HOST
  WHERE="remote $SSH_DEST"
  # A remote deploy names its key and the host's key; nothing falls back to
  # whatever ssh would pick, here or in CI.
  for var in DEPLOY_REMOTE_IDENTITY_FILE DEPLOY_REMOTE_KNOWN_HOSTS; do
    eval "file=\${$var:-}"
    [ -n "$file" ] || die "$var is empty: DEPLOY_ACCESS=remote needs it (in CI: a protected File variable)."
    [ -f "$file" ] || die "$var names no file: $file"
    [ -r "$file" ] || die "$var is not readable: $file"
  done
else
  URL_HOST=localhost
  WHERE=local
fi

# Runs a shell command line on the target: this machine or, over ssh, the remote host.
# stdin passes through, so a tar stream can follow the command.
on_target() {
  if [ "$DRY_RUN" = 1 ]; then
    echo "[dry-run] $WHERE: $1"
    return 0
  fi
  if [ "$ACCESS" = local ]; then
    sh -c "$1"
  else
    set -- "$1" -o BatchMode=yes -p "${DEPLOY_REMOTE_PORT:-22}"
    [ -z "${DEPLOY_REMOTE_IDENTITY_FILE:-}" ] || set -- "$@" -i "$DEPLOY_REMOTE_IDENTITY_FILE"
    [ -z "${DEPLOY_REMOTE_KNOWN_HOSTS:-}" ] || set -- "$@" -o "UserKnownHostsFile=$DEPLOY_REMOTE_KNOWN_HOSTS"
    cmd=$1
    shift
    ssh "$@" "$SSH_DEST" "$cmd"
  fi
}

# Before any build: the host answers with this key and its known host key.
if [ "$ACCESS" = remote ] && [ "$DRY_RUN" = 0 ]; then
  on_target true >/dev/null 2>&1 || die "cannot log in to $SSH_DEST (port ${DEPLOY_REMOTE_PORT:-22}) with $DEPLOY_REMOTE_IDENTITY_FILE and $DEPLOY_REMOTE_KNOWN_HOSTS: the key is not authorised there, or the host's key is not the known one."
fi

# A tar stream of one directory's contents, without macOS metadata files.
tar_dir() {
  if tar --version 2>/dev/null | grep -q bsdtar; then
    (cd "$1" && COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -cf - .)
  else
    (cd "$1" && tar -cf - .)
  fi
}

build_release() {
  if [ "$PREBUILT" = 1 ]; then
    [ -f "$ROOT/release/$PROJECT/index.html" ] || die "--prebuilt: release/$PROJECT/ is missing (build_static's artifact)."
    return 0
  fi
  if [ "$BUILD" = 1 ]; then
    if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] local: pnpm build"; else (cd "$ROOT" && pnpm build); fi
  fi
  if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] local: scripts/release.sh"; else sh "$ROOT/scripts/release.sh"; fi
}

# --- container ---------------------------------------------------------------

# The container's host port from the branch (CI's, else this checkout's).
# DEPLOY_BRANCH, DEPLOY_DEFAULT_BRANCH and DEPLOY_RUN_ID are any CI's names
# (GitHub Actions sets them); GitLab's own are read when they are not set.
current_branch() { printf '%s' "${DEPLOY_BRANCH:-${CI_COMMIT_BRANCH:-$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)}}"; }
resolve_port() {
  BRANCH=$(current_branch)
  RUN_ID=${DEPLOY_RUN_ID:-${CI_PIPELINE_ID:-}}
  RQ=$(printf '%s' "$BRANCH" | sed -n -E 's#^(factory[/-])?[Rr][Qq]-0*([0-9]+)([^0-9].*)?$#\2#p')
  if [ -n "$PORT_ARG" ]; then
    PORT=$PORT_ARG WHY="--port"
  elif [ "$BRANCH" = "${DEPLOY_DEFAULT_BRANCH:-${CI_DEFAULT_BRANCH:-main}}" ]; then
    PORT=${DEPLOY_PORT:-} WHY="DEPLOY_PORT ($BRANCH)"
  elif [ -n "$RQ" ]; then
    BASE=${DEPLOY_BRANCH_PORT_BASE:-8100}
    case $BASE in ''|*[!0-9]*) die "DEPLOY_BRANCH_PORT_BASE must be a number: $BASE" ;; esac
    PORT=$((BASE + RQ)) WHY="DEPLOY_BRANCH_PORT_BASE $BASE + RQ-$RQ"
  elif [ -n "$RUN_ID" ]; then
    case $RUN_ID in *[!0-9]*) die "the run id must be a number: $RUN_ID" ;; esac
    PORT=$((20000 + RUN_ID % 40000)) WHY="20000 + pipeline $RUN_ID"
  else
    PORT=${DEPLOY_PORT:-} WHY="DEPLOY_PORT"
  fi
  [ -n "$PORT" ] || die "DEPLOY_PORT is empty: the host port the container answers on (branch ${BRANCH:-unknown})."
  case $PORT in *[!0-9]*) die "the port must be a number: $PORT ($WHY)" ;; esac
  { [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; } || die "the port must be between 1 and 65535: $PORT ($WHY)"
  say "port $PORT: $WHY"
}

deploy_container() {
  CLI=${DEPLOY_DOCKER:-docker}
  D=$(q "$CLI")
  NAME=${DEPLOY_CONTAINER_NAME:-$PROJECT-dev-$DEPLOY_WHO}
  N=$(q "$NAME")

  if [ "$STOP" = 1 ]; then
    on_target "$D rm --force $N"
    say "removed container $NAME ($WHERE)"
    return 0
  fi

  resolve_port

  if [ -z "$IMAGE" ]; then
    build_release
    TAG="$PROJECT-dev-$DEPLOY_WHO:latest"
    # The context goes as a tar stream and is built where it runs: an arm64
    # Mac deploys to an amd64 host without a cross build.
    BUILD_CMD='set -eu; ctx=$(mktemp -d); trap "rm -rf \"$ctx\"" EXIT; tar -xf - -C "$ctx"; '"$D"' build --tag '"$(q "$TAG")"' "$ctx"'
    if [ "$DRY_RUN" = 1 ]; then
      on_target "$BUILD_CMD"
    else
      ctx=$(mktemp -d)
      mkdir -p "$ctx/release"
      cp "$ROOT/Dockerfile" "$ROOT/nginx.conf" "$ctx/"
      cp -R "$ROOT/release/$PROJECT" "$ctx/release/$PROJECT"
      tar_dir "$ctx" | on_target "$BUILD_CMD" || { rm -rf "$ctx"; die "image build failed ($WHERE)"; }
      rm -rf "$ctx"
    fi
  else
    TAG=$IMAGE
  fi

  # Only our own container is replaced; another one on the port stops us.
  if [ "$DRY_RUN" = 1 ]; then
    on_target "$D ps --format '{{.Names}} {{.Ports}}'   # refuse if another container holds :$PORT"
  else
    owner=$(on_target "$D ps --format '{{.Names}} {{.Ports}}'" | awk -v name="$NAME" -v port=":$PORT->" '$1 != name && index($0, port) { print $1; exit }')
    [ -z "$owner" ] || die "port $PORT ($WHY) is already used by container: $owner. Choose a free port."
  fi

  # dev unless the caller (CI) names its own kind of deploy.
  case $LABELS in *com.aifactory.deploy=*) KIND='' ;; *) KIND=' --label com.aifactory.deploy=dev' ;; esac
  on_target "$D rm --force $N >/dev/null 2>&1 || true"
  on_target "$D run --detach --restart unless-stopped --name $N --publish $PORT:8282 \
--label com.aifactory.project=$PROJECT$KIND --label $(q "com.aifactory.owner=$DEPLOY_WHO")$LABELS $(q "$TAG") >/dev/null"

  if [ "$DRY_RUN" = 0 ]; then
    tries=${DEPLOY_HEALTH_SECONDS:-15}
    until on_target "$D exec $N wget --quiet --output-document=/dev/null http://127.0.0.1:8282/healthz" >/dev/null 2>&1; do
      tries=$((tries - 1))
      if [ "$tries" -le 0 ]; then
        on_target "$D logs $N" >&2 || true
        die "health check failed: $NAME did not answer /healthz ($WHERE)."
      fi
      sleep 1
    done
  fi
  say "container $NAME ($TAG) on $WHERE"
  say "http://$URL_HOST:$PORT/"
}

# --- directory ---------------------------------------------------------------

# Runs on the target with the release as a tar stream on stdin. The files go
# into the directory in place, each written beside itself and renamed over the
# old one; the directory itself, its permissions and files that are not this
# site's (.htaccess, .well-known, cgi-bin on a cPanel host) stay as they are.
# The marker lists the files the last deploy wrote: only those are replaced or,
# when they left the release, removed. Arguments: path, project.
INSTALL='set -eu
path=$1 project=$2 marker=.aifactory-deploy
refuse() { echo "deploy: refusing DEPLOY_PATH $1: $2" >&2; exit 2; }
case $path in /*) ;; *) refuse "$path" "it must be an absolute path" ;; esac
case $path in *//*|*/./*|*/../*|*/.|*/..) refuse "$path" "it must not contain //, . or .." ;; esac
while [ "${path%/}" != "$path" ]; do path=${path%/}; done
[ -n "$path" ] || refuse / "it is the root directory"
[ "$path" != "${HOME%/}" ] || refuse "$path" "it is the home directory"
case $path in /*/*) ;; *) refuse "$path" "it has fewer than two components" ;; esac
[ -d "${path%/*}" ] || refuse "$path" "its parent directory does not exist"
[ ! -e "$path" ] || [ -d "$path" ] || refuse "$path" "it is not a directory"
if [ -f "$path/$marker" ]; then
  grep -qx "project=$project" "$path/$marker" || refuse "$path" "its $marker belongs to another project"
fi
stage=$(mktemp -d)
trap "rm -rf \"$stage\"" EXIT
mkdir "$stage/new"
tar -xf - -C "$stage/new"
(cd "$stage/new" && find . -type f | sed "s#^\./##" | LC_ALL=C sort) > "$stage/new.list"
if [ -f "$path/$marker" ]; then sed -n "s/^file=//p" "$path/$marker" | LC_ALL=C sort > "$stage/old.list"; else : > "$stage/old.list"; fi
# A release file over one that is there and not from an earlier deploy.
while IFS= read -r f; do
  if [ -e "$path/$f" ] && ! grep -qxF -- "$f" "$stage/old.list"; then echo "$f"; fi
done < "$stage/new.list" > "$stage/clash.list"
if [ -s "$stage/clash.list" ]; then
  echo "deploy: refusing DEPLOY_PATH $path: these files are there and are not from an earlier deploy of $project:" >&2
  head -n 20 "$stage/clash.list" | sed "s/^/  /" >&2
  echo "deploy: move or delete them, then deploy again." >&2
  exit 2
fi
[ -d "$path" ] || mkdir "$path"
write_marker() {
  { printf "project=%s\ntime=%s\n" "$project" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"; sed "s/^/file=/" "$1"; } > "$path/$marker.aifactory-tmp"
  mv -f "$path/$marker.aifactory-tmp" "$path/$marker"
}
# Claimed before writing, so an interrupted deploy is still ours next time.
cat "$stage/old.list" "$stage/new.list" | LC_ALL=C sort -u > "$stage/both.list"
write_marker "$stage/both.list"
while IFS= read -r f; do
  d=$(dirname "$f")
  [ "$d" = . ] || mkdir -p "$path/$d"
  cp "$stage/new/$f" "$path/$f.aifactory-tmp"
  mv -f "$path/$f.aifactory-tmp" "$path/$f"
done < "$stage/new.list"
grep -vxF -f "$stage/new.list" "$stage/old.list" > "$stage/gone.list" || true
while IFS= read -r f; do
  rm -f "$path/$f"
  d=$(dirname "$f")
  while [ "$d" != . ] && rmdir "$path/$d" 2>/dev/null; do d=$(dirname "$d"); done
done < "$stage/gone.list"
write_marker "$stage/new.list"
echo "deploy: $(wc -l < "$stage/new.list" | tr -d " ") files into $path, $(wc -l < "$stage/gone.list" | tr -d " ") removed"'

deploy_directory() {
  if [ "$STOP" = 1 ]; then
    say "a directory deploy has no container: nothing to stop."
    return 0
  fi
  [ -n "${DEPLOY_PATH:-}" ] || die "DEPLOY_PATH is empty: the directory the site is copied into."
  [ -z "$IMAGE" ] || die "--image applies to a container deploy."
  build_release
  CMD="sh -c $(q "$INSTALL") deploy $(q "$DEPLOY_PATH") $PROJECT"
  if [ "$DRY_RUN" = 1 ]; then
    echo "[dry-run] local: tar of release/$PROJECT/ -> $WHERE"
    echo "[dry-run] $WHERE: into $DEPLOY_PATH in place: replace the files its $MARKER lists, keep every other file, stop if one would be overwritten"
    return 0
  fi
  tar_dir "$ROOT/release/$PROJECT" | on_target "$CMD"
  say "$WHERE: $DEPLOY_PATH"
}

# --- compose -----------------------------------------------------------------

# Runs on the target with a tar stream on stdin: src/ (the working tree, or
# only the compose files for an image) and set.env (the lines this deploy
# writes into runtime.env). DEPLOY_DIR keeps runtime.env between deploys:
# a secret is generated there once and never leaves it.
# Arguments: dir, compose project, engine, mode (build|image|stop), image,
# files, overlays, secrets, copies, data dirs, port, health path, seconds.
COMPOSE_STACK='set -eu
dir=$1 project=$2 engine=$3 mode=$4 image=$5 files=$6 overlays=$7 secrets=$8 copies=$9
shift 9
datadirs=$1 port=$2 health=$3 seconds=$4
say() { echo "deploy: $*"; }
die() { echo "deploy: $*" >&2; exit 2; }
case $dir in "~") dir=$HOME ;; "~/"*) dir=$HOME/${dir#"~/"} ;; esac
case $dir in /*) ;; *) die "DEPLOY_DIR must be absolute or start with ~/: $dir" ;; esac
command -v "$engine" >/dev/null 2>&1 || die "$engine is not installed on this host (DEPLOY_DOCKER)"
env_file=$dir/runtime.env
# The files in order, then each overlay whose network exists here.
compose() {
  chosen=""
  for f in $files; do chosen="$chosen -f $f"; done
  for pair in $overlays; do
    if "$engine" network inspect "${pair%%:*}" >/dev/null 2>&1; then chosen="$chosen -f ${pair#*:}"; fi
  done
  (cd "$dir/src" && "$engine" compose -p "$project" --env-file "$env_file" $chosen "$@")
}
if [ "$mode" = stop ]; then
  [ -d "$dir/src" ] || { say "no stack in $dir: nothing to stop"; exit 0; }
  compose down
  say "stack $project down, volumes kept"
  exit 0
fi
mkdir -p "$dir"
umask 077
[ -f "$env_file" ] || : > "$env_file"
chmod 600 "$env_file"
has() { grep -q "^$1=" "$env_file"; }
set_env() {
  grep -v "^$1=" "$env_file" > "$env_file.tmp" || true
  printf "%s=%s\n" "$1" "$2" >> "$env_file.tmp"
  mv -f "$env_file.tmp" "$env_file"
}
stage=$(mktemp -d)
trap "rm -rf \"$stage\"" EXIT
tar -xf - -C "$stage"
while IFS= read -r line || [ -n "$line" ]; do
  [ -n "$line" ] || continue
  set_env "${line%%=*}" "${line#*=}"
done < "$stage/set.env"
for pair in $secrets; do
  name=${pair%%=*} kind=${pair#*=}
  has "$name" && continue
  case $kind in
    hex[0-9]*) value=$(od -An -tx1 -N "${kind#hex}" /dev/urandom | tr -d " \n") ;;
    base64url[0-9]*) value=$(head -c "${kind#base64url}" /dev/urandom | base64 | tr -d "\n" | tr "+/" "-_") ;;
    *) die "DEPLOY_ENV_SECRETS: $name has an unknown kind $kind (hex<N> or base64url<N>)" ;;
  esac
  set_env "$name" "$value"
  say "generated $name in $env_file"
done
for pair in $copies; do
  from=${pair%%:*} names=${pair#*:}
  case $from in "~/"*) from=$HOME/${from#"~/"} ;; esac
  for name in $(echo "$names" | tr "," " "); do
    has "$name" && continue
    [ -f "$from" ] || die "DEPLOY_ENV_COPY: $from is missing, and $name is not set in $env_file"
    value=$(sed -n "s/^$name=//p" "$from" | head -n 1)
    [ -n "$value" ] || die "DEPLOY_ENV_COPY: $from has no $name"
    set_env "$name" "$value"
    say "copied $name from $from"
  done
done
for pair in $datadirs; do
  name=${pair%%=*} rest=${pair#*=}
  sub=${rest%%:*} uid=${rest#*:}
  [ "$uid" != "$rest" ] || uid=""
  mkdir -p "$dir/$sub"
  if [ -n "$uid" ]; then
    if [ "$engine" = podman ] && [ "$(id -u)" != 0 ]; then podman unshare chown "$uid:$uid" "$dir/$sub"
    else chown "$uid:$uid" "$dir/$sub" 2>/dev/null || say "warning: could not give $dir/$sub to uid $uid"
    fi
  fi
  set_env "$name" "$dir/$sub"
done
rm -rf "$dir/src.new"
mv "$stage/src" "$dir/src.new"
rm -rf "$dir/src"
mv "$dir/src.new" "$dir/src"
if [ "$mode" = image ]; then
  "$engine" pull "$image" >/dev/null
  compose up -d --no-build --remove-orphans
else
  compose up -d --build --remove-orphans
fi
"$engine" image prune -f >/dev/null 2>&1 || true
[ -n "$health" ] || exit 0
url="http://127.0.0.1:$port$health"
tries=$seconds
until { command -v curl >/dev/null 2>&1 && curl -fsS -o /dev/null "$url"; } || { command -v wget >/dev/null 2>&1 && wget -q -O /dev/null "$url"; }; do
  tries=$((tries - 1))
  if [ "$tries" -le 0 ]; then
    compose logs --tail 50 >&2 || true
    die "health check failed: $url did not answer within ${seconds}s"
  fi
  sleep 1
done
say "healthy: $url"'

# Space-separated pairs of a setting, each checked against its shape.
check_pairs() {
  for pair in $2; do
    printf '%s\n' "$pair" | grep -Eq "$3" || die "$1: '$pair' is not $4"
  done
}

deploy_compose() {
  CLI=${DEPLOY_DOCKER:-docker}
  case $CLI in docker|podman) ;; *) die "DEPLOY_DOCKER must be docker or podman for compose, not '$CLI'." ;; esac
  # dev-<who> on a developer's deploy, the profile's name in CI, and the
  # branch for a branch preview: each branch is a stack of its own.
  case $PROFILE in
    '') KIND=dev-$DEPLOY_WHO ;;
    branch) KIND=$(current_branch | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '-' | sed 's/^-*//; s/-*$//') ;;
    *) KIND=$PROFILE ;;
  esac
  STACK=${DEPLOY_COMPOSE_PROJECT:-$PROJECT-$KIND}
  case $STACK in *[!a-z0-9_-]*) die "DEPLOY_COMPOSE_PROJECT must be lower-case letters, digits, - and _: $STACK" ;; esac
  DIR=${DEPLOY_DIR:-"~/$STACK"}
  FILES=${DEPLOY_COMPOSE_FILES:-compose.yml}
  check_pairs DEPLOY_COMPOSE_OVERLAYS "${DEPLOY_COMPOSE_OVERLAYS:-}" '^[A-Za-z0-9_.-]+:[^:]+$' "network:file"
  check_pairs DEPLOY_ENV_SECRETS "${DEPLOY_ENV_SECRETS:-}" '^[A-Za-z_][A-Za-z0-9_]*=(hex|base64url)[0-9]+$' "NAME=hex<N> or NAME=base64url<N>"
  check_pairs DEPLOY_ENV_COPY "${DEPLOY_ENV_COPY:-}" '^[^:]+:[A-Za-z_][A-Za-z0-9_,]*$' "path:NAME,NAME"
  check_pairs DEPLOY_DATA_DIRS "${DEPLOY_DATA_DIRS:-}" '^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9_.-]+(:[0-9]+)?$' "NAME=dir or NAME=dir:uid"
  if [ "$STOP" = 1 ]; then
    CMD="sh -c $(q "$COMPOSE_STACK") deploy $(q "$DIR") $(q "$STACK") $(q "$CLI") stop '' $(q "$FILES") $(q "${DEPLOY_COMPOSE_OVERLAYS:-}") '' '' '' '' '' ''"
    on_target "$CMD"
    say "stack $STACK down on $WHERE"
    return 0
  fi
  [ "$PREBUILT" = 0 ] || die "--prebuilt applies to the container and directory targets."
  for f in $FILES; do [ -f "$ROOT/$f" ] || die "$f is missing: a compose file DEPLOY_COMPOSE_FILES names."; done
  resolve_port

  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' EXIT
  mkdir "$stage/src"
  # What goes: the working tree as Git sees it for a build, the compose
  # files for an image.
  if [ -z "$IMAGE" ]; then
    MODE=build
    git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "compose builds from the files Git tracks or would track: $ROOT is not a Git checkout."
    git -C "$ROOT" ls-files -co --exclude-standard | while IFS= read -r f; do [ ! -f "$ROOT/$f" ] || printf '%s\n' "$f"; done > "$stage/files.list"
    IMAGE_REF="localhost/$PROJECT:$STACK"
  else
    MODE=image
    for f in $FILES; do printf '%s\n' "$f"; done > "$stage/files.list"
    for pair in ${DEPLOY_COMPOSE_OVERLAYS:-}; do printf '%s\n' "${pair#*:}"; done >> "$stage/files.list"
    IMAGE_REF=$IMAGE
  fi
  while IFS= read -r f; do
    [ -f "$ROOT/$f" ] || die "$f is missing: a compose file the deploy names."
  done < "$stage/files.list"
  for f in $FILES; do grep -qxF -- "$f" "$stage/files.list" || die "$f is not among the files sent (ignored by .gitignore?)."; done

  # The lines runtime.env takes on every deploy: DEPLOY_ENV_SET_<NAME>,
  # the port, the image and the commit.
  env | sed -n 's/^DEPLOY_ENV_SET_\([A-Za-z_][A-Za-z0-9_]*=.*\)$/\1/p' | LC_ALL=C sort > "$stage/set.env"
  [ -z "${DEPLOY_COMPOSE_PORT_VAR:-}" ] || printf '%s=%s\n' "$DEPLOY_COMPOSE_PORT_VAR" "$PORT" >> "$stage/set.env"
  [ -z "${DEPLOY_COMPOSE_IMAGE_VAR:-}" ] || printf '%s=%s\n' "$DEPLOY_COMPOSE_IMAGE_VAR" "$IMAGE_REF" >> "$stage/set.env"
  # The commit, from a checkout; a release kit out of an image has none, and
  # the image already carries its own.
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    printf 'GIT_COMMIT_SHA=%s\nGIT_COMMIT_TIME=%s\n' \
      "$(git -C "$ROOT" rev-parse --short=7 HEAD)" \
      "$(git -C "$ROOT" log -1 --format=%cd --date=format:%Y-%m-%d-%H-%M)" >> "$stage/set.env"
  fi

  CMD="sh -c $(q "$COMPOSE_STACK") deploy $(q "$DIR") $(q "$STACK") $(q "$CLI") $MODE $(q "$IMAGE_REF") $(q "$FILES") \
$(q "${DEPLOY_COMPOSE_OVERLAYS:-}") $(q "${DEPLOY_ENV_SECRETS:-}") $(q "${DEPLOY_ENV_COPY:-}") $(q "${DEPLOY_DATA_DIRS:-}") \
$PORT $(q "${DEPLOY_HEALTH_PATH:-/healthz}") ${DEPLOY_HEALTH_SECONDS:-90}"
  if [ "$DRY_RUN" = 1 ]; then
    echo "[dry-run] local: $(wc -l < "$stage/files.list" | tr -d ' ') files ($MODE) and $(wc -l < "$stage/set.env" | tr -d ' ') runtime.env lines -> $WHERE:$DIR"
    sed 's/=.*/=…/; s/^/[dry-run]   set /' "$stage/set.env"
    echo "[dry-run] $WHERE: $CLI compose -p $STACK -f $FILES up -d ($MODE), health $PORT${DEPLOY_HEALTH_PATH:-/healthz}"
    return 0
  fi
  (
    cd "$ROOT"
    if tar --version 2>/dev/null | grep -q bsdtar; then
      COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -cf "$stage/src.tar" -T "$stage/files.list"
    else
      tar -cf "$stage/src.tar" -T "$stage/files.list"
    fi
  )
  (cd "$stage/src" && tar -xf "$stage/src.tar")
  rm -f "$stage/src.tar" "$stage/files.list"
  tar_dir "$stage" | on_target "$CMD" || die "the stack did not come up ($WHERE)"
  say "stack $STACK ($IMAGE_REF) on $WHERE"
  say "http://$URL_HOST:$PORT/"
}

case $TARGET in
  container) deploy_container ;;
  directory) deploy_directory ;;
  compose) deploy_compose ;;
esac
