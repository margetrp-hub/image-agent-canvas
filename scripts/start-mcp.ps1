$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

if (-not $env:IMAGE_AGENT_PROJECT_DIR) {
  if ($env:CODEX_WORKSPACE_DIR) {
    $env:IMAGE_AGENT_PROJECT_DIR = $env:CODEX_WORKSPACE_DIR
  } elseif ($env:CODEX_CWD) {
    $env:IMAGE_AGENT_PROJECT_DIR = $env:CODEX_CWD
  } else {
    $env:IMAGE_AGENT_PROJECT_DIR = (Get-Location).Path
  }
}

if (-not $env:IMAGE_AGENT_CANVAS_DIR) {
  $env:IMAGE_AGENT_CANVAS_DIR = Join-Path $env:IMAGE_AGENT_PROJECT_DIR "canvas"
}

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
  npm install
}

node ".\mcp\server.mjs"
