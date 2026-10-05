#!/usr/bin/env bash
# The aifactory CLI in CI, the same one developers run locally, at
# AIFACTORY_REPO_URL / AIFACTORY_REF (default main). It lives beside the
# project, and the runner keeps /builds between jobs, so a checkout left by an
# earlier job is brought to the ref every time, never used as it was. The
# commit it runs goes to the log.
#
#   scripts/ci/factory.sh probe build RQ-0002
set -euo pipefail

AIF="${AIFACTORY_DIR:-$CI_PROJECT_DIR/../aifactory}"
REF="${AIFACTORY_REF:-main}"
if [ -d "$AIF/.git" ]; then
  git -C "$AIF" fetch --quiet --depth 1 origin "$REF" >&2
  git -C "$AIF" reset --quiet --hard FETCH_HEAD >&2
else
  rm -rf "$AIF"
  git clone --quiet --depth 1 --branch "$REF" "${AIFACTORY_REPO_URL:?}" "$AIF" >&2
fi
(cd "$AIF" && pnpm install --frozen-lockfile --silent) >&2
echo "aifactory $(git -C "$AIF" rev-parse --short HEAD) ($REF)" >&2
exec "$AIF/node_modules/.bin/tsx" --tsconfig "$AIF/tsconfig.json" "$AIF/packages/agent-factory/src/cli.ts" "$@"
