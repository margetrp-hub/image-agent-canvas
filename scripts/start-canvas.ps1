param(
  [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$CallerDir = (Get-Location).Path
$CanvasPort = if ($env:IMAGE_AGENT_CANVAS_PORT) { $env:IMAGE_AGENT_CANVAS_PORT } else { "43217" }

if (-not $env:IMAGE_AGENT_PROJECT_DIR) {
  if ($ProjectPath) {
    $env:IMAGE_AGENT_PROJECT_DIR = (Resolve-Path $ProjectPath).Path
  } elseif ($env:CODEX_WORKSPACE_DIR) {
    $env:IMAGE_AGENT_PROJECT_DIR = $env:CODEX_WORKSPACE_DIR
  } elseif ($env:CODEX_CWD) {
    $env:IMAGE_AGENT_PROJECT_DIR = $env:CODEX_CWD
  } else {
    $env:IMAGE_AGENT_PROJECT_DIR = $CallerDir
  }
}

if (-not $env:IMAGE_AGENT_CANVAS_DIR) {
  $env:IMAGE_AGENT_CANVAS_DIR = Join-Path $env:IMAGE_AGENT_PROJECT_DIR "canvas"
}

Set-Location $RootDir

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
  npm install
}

Write-Host "Image Agent Canvas: http://127.0.0.1:$CanvasPort"
Write-Host "Image Agent Canvas safe check: http://127.0.0.1:$CanvasPort/safe"
Write-Host "Image Agent Canvas app: http://127.0.0.1:$CanvasPort/canvas/"
Write-Host "Canvas data: $env:IMAGE_AGENT_CANVAS_DIR\pages\main\image-agent-canvas.json"
Write-Host "Selection: $env:IMAGE_AGENT_CANVAS_DIR\image-agent-selection.json"

node "node_modules/vite/bin/vite.js" --host 127.0.0.1 --port $CanvasPort
