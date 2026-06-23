#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
PROJECT_ARG="${1:-}"

export IMAGE_AGENT_CANVAS_PORT="${IMAGE_AGENT_CANVAS_PORT:-43217}"
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

echo "Image Agent Canvas: http://127.0.0.1:${IMAGE_AGENT_CANVAS_PORT}"
echo "Image Agent Canvas safe check: http://127.0.0.1:${IMAGE_AGENT_CANVAS_PORT}/safe"
echo "Image Agent Canvas app: http://127.0.0.1:${IMAGE_AGENT_CANVAS_PORT}/canvas/"
echo "Canvas data: ${IMAGE_AGENT_CANVAS_DIR}/pages/main/image-agent-canvas.json"
echo "Selection: ${IMAGE_AGENT_CANVAS_DIR}/image-agent-selection.json"

exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$IMAGE_AGENT_CANVAS_PORT"
