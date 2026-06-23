#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
PROJECT_ARG="${1:-}"

if [ -n "$PROJECT_ARG" ] && [ -z "${IMAGE_AGENT_PROJECT_DIR:-}" ]; then
  IMAGE_AGENT_PROJECT_DIR="$(cd "$PROJECT_ARG" && pwd)"
  export IMAGE_AGENT_PROJECT_DIR
else
  export IMAGE_AGENT_PROJECT_DIR="${IMAGE_AGENT_PROJECT_DIR:-${CODEX_WORKSPACE_DIR:-${CODEX_CWD:-$CALLER_DIR}}}"
fi
export IMAGE_AGENT_CANVAS_DIR="${IMAGE_AGENT_CANVAS_DIR:-$IMAGE_AGENT_PROJECT_DIR/canvas}"

cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

exec node ./mcp/server.mjs
