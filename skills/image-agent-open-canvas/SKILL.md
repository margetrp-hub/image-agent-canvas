---
name: image-agent-open-canvas
description: Use when the user wants to open or start Image Agent Canvas for the current Codex project.
---

# Image Agent Open Canvas

Use this skill to start the local canvas service and open the project-bound canvas in Codex when the Browser tool chain is healthy.

This follows Cowart's plugin shape: no `.app.json`, no app connector, only `skills + mcpServers`. The Codex plugin page is for installing/enabling the plugin; the canvas itself runs as a local web service after this skill launches it.

Open through a plain HTML safety page first. `/safe` has no React, no tldraw, and no Vite client script. The root URL loads a small React health-check shell; the real tldraw workspace is at `/canvas/`. If the Codex in-app browser route is unhealthy, stop after the service starts and return the URLs instead of retrying navigation.

## Steps

1. From the plugin root, launch the project-bound service without blocking the current Codex turn. Pass the active Codex workspace/project directory explicitly. Do not use the plugin directory as the project directory.
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-canvas.ps1 -ProjectPath <active-project-dir>`
   - macOS/Linux: `bash scripts/launch-canvas.sh <active-project-dir>`
2. Read the JSON output:
   - `canvasUrl` is the lightweight safety page.
   - `safeUrl` is the plain HTML browser-route check.
   - `canvasAppUrl` is the real tldraw workspace.
   - Always use the actual returned URLs. Do not assume port `43217`, because stale services or another canvas may already occupy it.
3. Confirm service status through `/health` or the `open_canvas_service` MCP tool when needed.
4. Open `safeUrl` in the Codex in-app browser when the Browser tool chain is available.
5. After `/safe` is visibly loaded, navigate to `canvasUrl` exactly once.
6. After `canvasUrl` is visibly loaded, navigate to `canvasAppUrl` exactly once if the user asked to open the working canvas.
7. If browser bootstrap, tab selection, route lookup, or navigation fails with a Codex browser/session error, do not retry in a loop. Treat the service start as successful and report `safeUrl`, `canvasUrl`, `canvasAppUrl`, `canvasRoot`, and `canvasPid`.

## Browser Flow

Use the Browser plugin's `control-in-app-browser` skill as the source of truth for opening the in-app browser. The model-side flow is:

1. Bootstrap the Browser runtime.
2. Set browser visibility to true.
3. Select the current tab or create a new tab.
4. If the current tab is not already on `safeUrl`, `canvasUrl`, or `canvasAppUrl`, call `tab.goto(safeUrl)`.
5. Verify the plain page is loaded by checking visible text such as `Image Agent Canvas safe check passed.`
6. Navigate to `canvasUrl` once and verify visible text such as `Codex project canvas is running.`
7. Navigate to `canvasAppUrl` once. Do not reload if the tab is already on `canvasAppUrl`.

Do not call `tab.goto` repeatedly against the same local URL. Repeated route capture and reloads were observed to destabilize Codex in-app browser sessions.

## Storage Contract

Canvas data is saved in the current project:

```text
canvas/pages/main/image-agent-canvas.json
canvas/pages/main/assets/
canvas/image-agent-selection.json
canvas/image-agent-view-state.json
```

Set `IMAGE_AGENT_PROJECT_DIR` or `IMAGE_AGENT_CANVAS_DIR` before starting if the canvas should bind to a specific project.

The launcher also writes:

```text
canvas/image-agent-runtime.json
```

Use that runtime file to recover the active port when the default `43217` port was occupied.
