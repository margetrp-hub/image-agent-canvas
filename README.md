# Image Agent Canvas

Image Agent Canvas is a Cowart-style local Codex canvas plugin powered by tldraw.
It keeps the plugin surface small: skills + MCP tools, a root Vite canvas app, and
project-local persistence under the active workspace `canvas/` directory.

It intentionally does not use `.app.json` or a Codex app connector. To open the
canvas, a skill starts the local web service, opens a plain HTML safety page in
Codex, then a lightweight health page, and finally enters the tldraw workspace
only after the browser route is stable.

Reference: https://github.com/zhongerxin/cowart

## Features

- Start a local tldraw infinite canvas service from Codex.
- Persist canvas pages and image assets inside the active project.
- Create an AI image holder and insert generated local images into the selected holder.
- Insert revised images beside selected source images when no holder is selected.
- Search the project-local inspiration library and insert prompt cards onto the canvas.
- Insert reference images only through MCP with `insert_reference_image`.
- Create visual lineage branches with `#1 -> #2` style holder nodes and connecting arrows.
- Export edit packs from selected images, annotations, references, and prompt cards.
- Insert Chinese error explanation notes for common generation failures.
- Export/import project-local canvas archives without writing into global AppData.
- Let Codex read selection/layer state through MCP without storing user data in the plugin repo.

The plugin does not own general model configuration or a standalone generation
queue. Codex, `imagegen`, or an external image workstation performs generation;
Image Agent Canvas organizes the visual context, prompts, annotations, branches,
assets, and project-local persistence.

## Quick Start

```powershell
cd C:\Users\Administrator\plugins\image-agent-canvas
npm install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch-canvas.ps1
```

The launcher prints the active `safeUrl`, `canvasUrl`, and `canvasAppUrl`, normally:

```text
safeUrl: http://127.0.0.1:43217/safe
canvasUrl: http://127.0.0.1:43217/
canvasAppUrl: http://127.0.0.1:43217/canvas/
```

`safeUrl` is a plain HTML route check. `canvasUrl` is a lightweight React health
page. `canvasAppUrl` is the real tldraw workspace. If the default port is
occupied, the launcher picks another local port and writes the active runtime
data to:

```text
canvas/image-agent-runtime.json
```

## Codex Usage

In Codex, use prompts like:

```text
Start Image Agent Canvas for this project.
Generate a new image into the selected Image Agent holder.
Use my annotation screenshot to create a clean revised image beside the original.
```

The expected minimal loop is:

1. Start the canvas service and open the printed `safeUrl` in Codex.
2. Enter `canvasUrl`, then `canvasAppUrl`, after each previous page loads.
3. Create or select an AI image holder.
4. Generate an image with Codex or another image tool.
5. Insert the local image into the selected holder with `insert_canvas_image`.
6. Refresh the canvas and confirm the asset persists.

Reference images follow the same Cowart-style boundary: the browser drawer may
preview, select, or copy a reference for Codex, but it does not write image
assets to the canvas. Use `insert_reference_image` for local paths, data URLs, or
http(s) image URLs.

## MCP Tools

- `open_canvas_service`
- `get_canvas_selection`
- `create_ai_image_holder`
- `insert_canvas_image`
- `insert_reference_image`
- `read_canvas_layers`
- `search_inspiration_library`
- `insert_prompt_card`
- `create_canvas_branch`
- `export_edit_pack`
- `insert_error_note`
- `export_canvas_archive`
- `import_canvas_archive`

## Storage

By default the canvas binds to the active project:

```text
canvas/pages/main/image-agent-canvas.json
canvas/pages/main/assets/
canvas/image-agent-selection.json
canvas/image-agent-view-state.json
canvas/image-agent-runtime.json
canvas/library/index.json
canvas/archives/*.iacanvas.json
```

Set `IMAGE_AGENT_PROJECT_DIR` or `IMAGE_AGENT_CANVAS_DIR` before starting when you
want to bind a specific project. AppData is only a fallback path and is not the
normal storage location.

The inspiration library is read in this order:

1. `canvas/library/*.json` in the active project.
2. Known full local backup sources from the original Image Agent Studio project.
3. Current project `public/` or `dist/` JSON files as a fallback.

Relative bundled images are served through `/library-assets/`. Remote images stay
remote and are lazily loaded by the drawer.

## Development

```powershell
npm run check
npm run build
npm run validate:plugin
```

The plugin shape should stay aligned with Cowart:

```text
.codex-plugin/plugin.json
.mcp.json
mcp/server.mjs
scripts/start-canvas.ps1
scripts/launch-canvas.ps1
scripts/start-mcp.ps1
src/App.jsx
src/main.jsx
src/styles.css
vite.config.js
```
