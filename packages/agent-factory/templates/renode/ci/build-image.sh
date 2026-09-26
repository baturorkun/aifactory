#!/usr/bin/env bash
# Builds ci/Dockerfile on the GitLab runner's host, where the runner uses the
# image locally (no registry). The build context is streamed over SSH, so the
# host needs no checkout. The tag is the AIFACTORY_RUNNER_IMAGE .gitlab-ci.yml
# runs its jobs in.
#
#   ci/build-image.sh <user@host>
set -euo pipefail

HOST="${1:?usage: ci/build-image.sh <user@host>  (the GitLab runner host)}"
DIR="$(cd "$(dirname "$0")" && pwd)"
TAG="$(sed -n 's/^ *AIFACTORY_RUNNER_IMAGE: *"\(.*\)"$/\1/p' "$DIR/../.gitlab-ci.yml" | head -1)"
[ -n "$TAG" ] || { echo "No AIFACTORY_RUNNER_IMAGE in .gitlab-ci.yml" >&2; exit 2; }

tar -C "$DIR" -cf - Dockerfile | ssh "$HOST" "docker build -t '$TAG' -"
ssh "$HOST" "docker run --rm '$TAG' sh -c 'renode --version | head -1; arm-none-eabi-gcc --version | head -1'"
echo "Built $TAG on $HOST"
