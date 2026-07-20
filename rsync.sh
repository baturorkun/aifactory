#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${AIFACTORY_RSYNC_HOST:-192.168.1.2}"
REMOTE_USER="${AIFACTORY_RSYNC_USER:-root}"
REMOTE_DIR="${AIFACTORY_RSYNC_DIR:-/srv/aifactory}"
REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "Synchronizing ${SCRIPT_DIR}/ -> ${REMOTE_TARGET}"

rsync -azv --delete-delay \
  --exclude='.git/' \
  --exclude='.venv-rag/' \
  --exclude='.pnpm-store/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='coverage/' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  "${SCRIPT_DIR}/" \
  "${REMOTE_TARGET}"

echo "Synchronization completed: ${REMOTE_TARGET}"
