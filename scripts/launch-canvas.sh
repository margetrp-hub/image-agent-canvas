#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$PWD"
PROJECT_ARG="${1:-}"
DEFAULT_CANVAS_PORT="${IMAGE_AGENT_CANVAS_PORT:-43217}"
if [ -n "$PROJECT_ARG" ] && [ -z "${IMAGE_AGENT_PROJECT_DIR:-}" ]; then
  PROJECT_DIR="$(cd "$PROJECT_ARG" && pwd)"
else
  PROJECT_DIR="${IMAGE_AGENT_PROJECT_DIR:-${CODEX_WORKSPACE_DIR:-${CODEX_CWD:-$CALLER_DIR}}}"
fi
CANVAS_DIR="${IMAGE_AGENT_CANVAS_DIR:-$PROJECT_DIR/canvas}"
RUNTIME_PATH="$CANVAS_DIR/image-agent-runtime.json"

port_open() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
  fi
}

find_free_port() {
  local start="$1"
  local end=$((start + 80))
  for ((port=start; port<end; port++)); do
    if ! port_open "$port"; then
      echo "$port"
      return 0
    fi
  done
  echo "No free local port found from $start" >&2
  return 1
}

wait_health() {
  local url="$1"
  local deadline=$((SECONDS + 25))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      curl -fsS "$url"
      return 0
    fi
    sleep 0.45
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

read_runtime_if_healthy() {
  if [ ! -f "$RUNTIME_PATH" ]; then
    return 1
  fi

  node -e '
const fs = require("fs");
const runtimePath = process.argv[1];
const expectedRoot = process.argv[2];
let runtime;
try {
  runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
} catch {
  process.exit(1);
}
if (!runtime.canvasUrl) process.exit(1);
fetch(runtime.canvasUrl.replace(/\/+$/, "") + "/health")
  .then((response) => response.ok ? response.json() : null)
  .then((health) => {
    if (!health || health.ok !== true || health.canvasRoot !== expectedRoot) process.exit(1);
    console.log(JSON.stringify(runtime, null, 2));
  })
  .catch(() => process.exit(1));
' "$RUNTIME_PATH" "$CANVAS_DIR"
}

mkdir -p "$CANVAS_DIR"

if read_runtime_if_healthy; then
  exit 0
fi

CANVAS_PORT="$(find_free_port "$DEFAULT_CANVAS_PORT")"

cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

export IMAGE_AGENT_PROJECT_DIR="$PROJECT_DIR"
export IMAGE_AGENT_CANVAS_DIR="$CANVAS_DIR"
export IMAGE_AGENT_CANVAS_PORT="$CANVAS_PORT"
export IMAGE_AGENT_CANVAS_URL="http://127.0.0.1:$CANVAS_PORT"

node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$CANVAS_PORT" >/tmp/image-agent-canvas-vite.log 2>&1 &
CANVAS_PID=$!

HEALTH="$(wait_health "http://127.0.0.1:$CANVAS_PORT/health")"

node -e '
const fs = require("fs");
const health = JSON.parse(process.argv[1]);
const runtimePath = process.argv[2];
const runtime = {
  ok: true,
  canvasUrl: `http://127.0.0.1:${process.env.IMAGE_AGENT_CANVAS_PORT}/`,
  safeUrl: `http://127.0.0.1:${process.env.IMAGE_AGENT_CANVAS_PORT}/safe`,
  canvasAppUrl: `http://127.0.0.1:${process.env.IMAGE_AGENT_CANVAS_PORT}/canvas/`,
  canvasPort: Number(process.env.IMAGE_AGENT_CANVAS_PORT),
  canvasPid: Number(process.argv[3]),
  projectDir: process.env.IMAGE_AGENT_PROJECT_DIR,
  canvasRoot: process.env.IMAGE_AGENT_CANVAS_DIR,
  selectionPath: health.selectionPath,
  viewStatePath: health.viewStatePath,
  runtimePath,
  launchedAt: new Date().toISOString()
};
fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2) + "\n");
console.log(JSON.stringify(runtime, null, 2));
' "$HEALTH" "$RUNTIME_PATH" "$CANVAS_PID"
