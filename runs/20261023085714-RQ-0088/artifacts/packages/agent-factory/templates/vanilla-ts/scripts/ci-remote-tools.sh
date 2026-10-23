#!/bin/sh
# CI only (aifactory RQ-0088): before a deploy to a remote host, installs the ssh client
# when the job image lacks it and makes the key file private enough for ssh.
# deploy.sh itself stops when the keys are missing. Argument: the profile file.
set -eu

grep -q '^DEPLOY_ACCESS=remote' "$1" || exit 0
command -v ssh >/dev/null || apk add --no-cache openssh-client
[ -z "${DEPLOY_REMOTE_IDENTITY_FILE:-}" ] || [ ! -f "$DEPLOY_REMOTE_IDENTITY_FILE" ] || chmod 600 "$DEPLOY_REMOTE_IDENTITY_FILE"
