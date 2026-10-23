#!/bin/sh
# Deploys the site (aifactory RQ-0088): a developer runs it as `pnpm run deploy:dev`,
# CI's deploy_linux and deploy_preview_linux run it with a prebuilt image.
#
#   DEPLOY_TARGET  container | directory   what a deploy is
#   DEPLOY_ACCESS  local | remote          where it goes (remote: over ssh)
#
# Settings come from the environment, else from deploy/<profile>.env when a
# profile is named (--profile or DEPLOY_PROFILE: deploy/main.env for main,
# deploy/release.env for a tag, committed, no secrets), else from the DEPLOY_*
# lines of .env; .env.example lists them. Only release/<project>/ (and for a container,
# Dockerfile and nginx.conf) leaves this machine.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# The project's name, from package.json: container names, labels, the marker.
PROJECT=$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -n 1)
PROJECT=${PROJECT##*/}
case $PROJECT in
  ''|*[!a-z0-9._-]*) echo "package.json needs a name of lower-case letters, digits, ., _ and -: '$PROJECT'" >&2; exit 1 ;;
esac
MARKER=.aifactory-deploy

usage() {
  cat <<'EOF'
Usage: pnpm run deploy:dev [-- options]

  --dry-run        print what would be built, sent, run or copied; change nothing
  --stop           remove this deploy's container (container target)
  --no-build       deploy the existing dist/ without running pnpm build
  --prebuilt       deploy release/<project>/ as it is: no build, no release.sh (CI)
  --image <tag>    run this already built image instead of building one (CI)
  --label <k=v>    an extra container label, repeatable (CI)
  --port <n>       the container's host port, overriding the branch rule below
  --profile <name> read deploy/<name>.env (CI: main, release); DEPLOY_PROFILE too

Container port: on the default branch DEPLOY_PORT; on factory/RQ-N
DEPLOY_BRANCH_PORT_BASE + N (empty base: 8100, so RQ-17 is 8117); on another
branch 20000 + the pipeline id in CI, DEPLOY_PORT here.
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

TARGET=${DEPLOY_TARGET:-}
ACCESS=${DEPLOY_ACCESS:-}
[ -n "$TARGET" ] || die "DEPLOY_TARGET is empty: set it in .env to container or directory."
[ -n "$ACCESS" ] || die "DEPLOY_ACCESS is empty: set it in .env to local or remote."
case $TARGET in container|directory) ;; *) die "DEPLOY_TARGET must be container or directory, not '$TARGET'." ;; esac
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
resolve_port() {
  BRANCH=${CI_COMMIT_BRANCH:-$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)}
  RQ=$(printf '%s' "$BRANCH" | sed -n -E 's#^(factory[/-])?[Rr][Qq]-0*([0-9]+)([^0-9].*)?$#\2#p')
  if [ -n "$PORT_ARG" ]; then
    PORT=$PORT_ARG WHY="--port"
  elif [ "$BRANCH" = "${CI_DEFAULT_BRANCH:-main}" ]; then
    PORT=${DEPLOY_PORT:-} WHY="DEPLOY_PORT ($BRANCH)"
  elif [ -n "$RQ" ]; then
    BASE=${DEPLOY_BRANCH_PORT_BASE:-8100}
    case $BASE in ''|*[!0-9]*) die "DEPLOY_BRANCH_PORT_BASE must be a number: $BASE" ;; esac
    PORT=$((BASE + RQ)) WHY="DEPLOY_BRANCH_PORT_BASE $BASE + RQ-$RQ"
  elif [ -n "${CI_PIPELINE_ID:-}" ]; then
    PORT=$((20000 + CI_PIPELINE_ID % 40000)) WHY="20000 + pipeline $CI_PIPELINE_ID"
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

if [ "$TARGET" = container ]; then deploy_container; else deploy_directory; fi
