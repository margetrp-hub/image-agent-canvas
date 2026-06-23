param(
  [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$CallerDir = (Get-Location).Path
$DefaultCanvasPort = if ($env:IMAGE_AGENT_CANVAS_PORT) { [int]$env:IMAGE_AGENT_CANVAS_PORT } else { 43217 }

function Resolve-ProjectDir {
  if ($ProjectPath) { return (Resolve-Path $ProjectPath).Path }
  if ($env:IMAGE_AGENT_PROJECT_DIR) { return $env:IMAGE_AGENT_PROJECT_DIR }
  if ($env:CODEX_WORKSPACE_DIR) { return $env:CODEX_WORKSPACE_DIR }
  if ($env:CODEX_CWD) { return $env:CODEX_CWD }
  return $CallerDir
}

function Test-PortOpen {
  param([int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$connection
}

function Find-FreePort {
  param([int]$Start)
  for ($port = $Start; $port -lt ($Start + 80); $port++) {
    if (-not (Test-PortOpen $port)) { return $port }
  }
  throw "No free local port found from $Start"
}

function Wait-Json {
  param([string]$Url, [int]$TimeoutSeconds = 25)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      return Invoke-RestMethod -Uri $Url -TimeoutSec 2
    } catch {
      Start-Sleep -Milliseconds 450
    }
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Url"
}

$ProjectDir = Resolve-ProjectDir
$CanvasDir = if ($env:IMAGE_AGENT_CANVAS_DIR) { $env:IMAGE_AGENT_CANVAS_DIR } else { Join-Path $ProjectDir "canvas" }
$RuntimePath = Join-Path $CanvasDir "image-agent-runtime.json"

function Read-RuntimeIfHealthy {
  if (-not (Test-Path $RuntimePath)) { return $null }
  try {
    $runtime = Get-Content -Raw $RuntimePath | ConvertFrom-Json
    if (-not $runtime.canvasUrl) { return $null }
    $health = Invoke-RestMethod -Uri (($runtime.canvasUrl.TrimEnd('/')) + "/health") -TimeoutSec 2
    if ($health.ok -eq $true -and $health.canvasRoot -eq $CanvasDir) {
      return $runtime
    }
  } catch {
    return $null
  }
  return $null
}

New-Item -ItemType Directory -Force -Path $CanvasDir | Out-Null

$ExistingRuntime = Read-RuntimeIfHealthy
if ($ExistingRuntime) {
  $ExistingRuntime | ConvertTo-Json -Depth 5
  exit 0
}

$CanvasPort = Find-FreePort $DefaultCanvasPort

Set-Location $RootDir

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
  npm install
}

$envBlock = @{
  IMAGE_AGENT_PROJECT_DIR = $ProjectDir
  IMAGE_AGENT_CANVAS_DIR = $CanvasDir
  IMAGE_AGENT_CANVAS_PORT = "$CanvasPort"
  IMAGE_AGENT_CANVAS_URL = "http://127.0.0.1:$CanvasPort"
}

foreach ($key in $envBlock.Keys) {
  Set-Item -Path "Env:$key" -Value $envBlock[$key]
}

$vite = Start-Process -FilePath "node" `
  -ArgumentList @("node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "$CanvasPort") `
  -WorkingDirectory $RootDir `
  -WindowStyle Hidden `
  -PassThru

$Health = Wait-Json "http://127.0.0.1:$CanvasPort/health"
$CanvasUrl = "http://127.0.0.1:$CanvasPort/"
$SafeUrl = "http://127.0.0.1:$CanvasPort/safe"
$CanvasAppUrl = "http://127.0.0.1:$CanvasPort/canvas/"
$Runtime = [ordered]@{
  ok = $true
  canvasUrl = $CanvasUrl
  safeUrl = $SafeUrl
  canvasAppUrl = $CanvasAppUrl
  canvasPort = $CanvasPort
  canvasPid = $vite.Id
  projectDir = $ProjectDir
  canvasRoot = $CanvasDir
  selectionPath = $Health.selectionPath
  viewStatePath = $Health.viewStatePath
  runtimePath = $RuntimePath
  launchedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$RuntimeJson = $Runtime | ConvertTo-Json -Depth 5
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($RuntimePath, "$RuntimeJson`n", $Utf8NoBom)
$Runtime | ConvertTo-Json -Depth 5
