#!/bin/sh
# Deploys a release on the host this runs on, from the registry alone
# (aifactory RQ-0091). A release host behind a VPN is reached by no runner and
# keeps no checkout: CI builds and publishes the image on the tag, and the
# image carries its deploy kit in /opt/aifactory-deploy (the compose files,
# deploy/release.env, scripts/deploy.sh, this script and the project's name).
# The operator copies this script once into the stack's directory on the host
# and runs it there:
#
#   sh release-here.sh --image ghcr.io/<owner>/<project> v1.2.3   # the first time
#   sh release-here.sh v1.2.3 [--dry-run]                         # from then on
#
# It pulls the tag's image, takes the kit out of it and runs the kit's
# deploy.sh --profile release --image <image>:<tag> on this host. The
# directory keeps runtime.env (secrets made once, never printed), the data
# and the image's name (release-here.image). deploy/release.env says
# DEPLOY_ACCESS=local and DEPLOY_BY=host, so CI never deploys it.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
KIT=/opt/aifactory-deploy
die() { echo "release: $*" >&2; exit 1; }
say() { echo "release: $*"; }

IMAGE='' TAG='' DRY=''
while [ $# -gt 0 ]; do
  case $1 in
    --image) [ $# -ge 2 ] || die "--image needs the image's name, without a tag"; IMAGE=$2; shift ;;
    --dry-run) DRY=--dry-run ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    v[0-9]*) TAG=$1 ;;
    *) die "a release is a tag like v1.2.3, not '$1'." ;;
  esac
  shift
done
[ -n "$TAG" ] || die "usage: sh release-here.sh [--image <name>] <tag> [--dry-run]"
if [ -n "$IMAGE" ]; then
  case ${IMAGE##*/} in *:*|'') die "--image is the image's name without a tag: $IMAGE" ;; esac
  [ -n "$DRY" ] || printf '%s\n' "$IMAGE" > "$HERE/release-here.image"
elif [ -f "$HERE/release-here.image" ]; then
  IMAGE=$(head -n 1 "$HERE/release-here.image")
else
  die "which image? The first time: sh release-here.sh --image ghcr.io/<owner>/<project> $TAG"
fi
REF="$IMAGE:$TAG"

ENGINE=''
for cli in podman docker; do
  if command -v "$cli" >/dev/null 2>&1; then ENGINE=$cli; break; fi
done
[ -n "$ENGINE" ] || die "neither podman nor docker is installed here."

say "pulling $REF"
"$ENGINE" pull "$REF" >/dev/null || die "cannot pull $REF: is this host logged in to the registry?"
stage=$(mktemp -d)
cid=''
trap 'rm -rf "$stage"; [ -z "$cid" ] || "$ENGINE" rm "$cid" >/dev/null 2>&1 || true' EXIT
cid=$("$ENGINE" create "$REF")
"$ENGINE" cp "$cid:$KIT/." "$stage/" || die "$REF has no deploy kit in $KIT: its Dockerfile copies it there."
PROFILE="$stage/deploy/release.env"
[ -f "$PROFILE" ] && [ -f "$stage/scripts/deploy.sh" ] || die "$REF's deploy kit lacks deploy/release.env or scripts/deploy.sh."
grep -qx 'DEPLOY_ACCESS=local' "$PROFILE" || die "deploy/release.env must say DEPLOY_ACCESS=local: this script deploys on the host it runs on."
grep -qx 'DEPLOY_BY=host' "$PROFILE" || die "deploy/release.env must say DEPLOY_BY=host, so CI never deploys it."
# The stack lives here unless the release says where.
grep -q '^DEPLOY_DIR=' "$PROFILE" || export DEPLOY_DIR="$HERE"
# The next release runs the tag's own copy of this script.
if [ -z "$DRY" ] && [ -f "$stage/scripts/release-here.sh" ] && ! cmp -s "$stage/scripts/release-here.sh" "$0"; then
  cp "$stage/scripts/release-here.sh" "$HERE/release-here.sh.new" && mv -f "$HERE/release-here.sh.new" "$HERE/release-here.sh"
  say "release-here.sh updated from $TAG"
fi
sh "$stage/scripts/deploy.sh" --profile release --image "$REF" $DRY
