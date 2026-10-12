#!/usr/bin/env bash
# Builds ci/Dockerfile on the GitLab runner's host, where the runner uses the
# image locally (no registry). The build context is streamed over SSH, so the
# host needs no checkout. The tag is the AIFACTORY_RUNNER_IMAGE .gitlab-ci.yml
# runs its jobs in. Which Arm GNU toolchain goes into the image comes from
# probes/toolchain.json: "ci.armGnuTarget" (arm-none-eabi, aarch64-none-elf),
# the same choice that built the committed probe ELFs. Rebuild the image
# when that target changes.
#
#   ci/build-image.sh <user@host>
set -euo pipefail

HOST="${1:?usage: ci/build-image.sh <user@host>  (the GitLab runner host)}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TAG="$(sed -n 's/^ *AIFACTORY_RUNNER_IMAGE: *"\(.*\)"$/\1/p' "$DIR/../.gitlab-ci.yml" | head -1)"
[ -n "$TAG" ] || { echo "No AIFACTORY_RUNNER_IMAGE in .gitlab-ci.yml" >&2; exit 2; }
TARGET="$(sed -n 's/.*"armGnuTarget": *"\([^"]*\)".*/\1/p' "$DIR/../probes/toolchain.json" | head -1)"
[ -n "$TARGET" ] || { echo "probes/toolchain.json has no ci.armGnuTarget: the project has not chosen its core and toolchain yet (see probes/README.md)" >&2; exit 2; }

tar -C "$DIR" -cf - Dockerfile | ssh "$HOST" "docker build --build-arg 'ARM_GNU_TARGET=$TARGET' -t '$TAG' -"
ssh "$HOST" "docker run --rm '$TAG' sh -c 'renode --version | head -1; $TARGET-gcc --version | head -1'"
echo "Built $TAG ($TARGET) on $HOST"
