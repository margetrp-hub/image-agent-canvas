# Image Agent Canvas / 图片插件

图片插件是一个 Codex 优先的本地图片工作区插件，基于 tldraw 构建。
它用于管理参考图、提示词、标注、分支版本和最终生成图片，并把真实 bitmap
图片回填到当前项目的画布中。

Image Agent Canvas is a Codex-first local image workspace plugin powered by
tldraw. It helps manage reference images, prompts, annotations, visual branches,
and final generated bitmap assets inside the current project canvas.

Reference project: https://github.com/zhongerxin/cowart

## 功能 / Features

- 启动本地 tldraw 无限画布，并把数据保存到当前项目。
- 保存参考图、提示词卡片、标注、分支关系和生成结果。
- 支持 `#1 -> #2` 这种图片迭代关系，并保留提示词关联。
- 支持在画布里选中图片或占位框后，让 Codex 读取上下文继续生成或修改。
- 支持导出/导入项目内画布归档。
- 支持两种生图方式：Codex 内置 imagegen 模式和 API 模式。

- Start a local tldraw infinite canvas and persist data in the active project.
- Store reference images, prompt cards, annotations, branches, and generated results.
- Preserve visual lineage such as `#1 -> #2` together with prompt context.
- Let Codex read selected images or holders and continue generation or revision work.
- Export/import project-local canvas archives.
- Support two generation modes: Codex built-in imagegen mode and API mode.

## 安装 / Installation

### 从 GitHub 安装 / Install From GitHub

```powershell
git clone https://github.com/margetrp-hub/image-agent-canvas.git C:\Users\Administrator\plugins\image-agent-canvas
cd C:\Users\Administrator\plugins\image-agent-canvas
npm install
npm run build
npm run check
```

```bash
git clone https://github.com/margetrp-hub/image-agent-canvas.git ~/plugins/image-agent-canvas
cd ~/plugins/image-agent-canvas
npm install
npm run build
npm run check
```

这个仓库已经包含 Codex 插件结构：

```text
.codex-plugin/plugin.json
.mcp.json
skills/
mcp/server.mjs
scripts/
```

This repository is already shaped as a Codex plugin. After cloning, install or
enable it through Codex's plugin workflow, or point your local Codex setup at the
cloned plugin directory.

### 手动启动画布 / Launch Manually

Windows PowerShell:

```powershell
cd C:\Users\Administrator\plugins\image-agent-canvas
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch-canvas.ps1 -ProjectPath D:\your-project
```

macOS / Linux:

```bash
cd ~/plugins/image-agent-canvas
bash scripts/launch-canvas.sh /path/to/your-project
```

启动后会输出类似：

```text
safeUrl: http://127.0.0.1:43217/safe
canvasUrl: http://127.0.0.1:43217/
canvasAppUrl: http://127.0.0.1:43217/canvas/
```

`safeUrl` 是纯 HTML 检查页，`canvasUrl` 是轻量健康页，`canvasAppUrl` 是真正的
tldraw 工作区。如果默认端口被占用，启动脚本会自动选择附近的可用端口。

`safeUrl` is a plain HTML safety page, `canvasUrl` is a lightweight health page,
and `canvasAppUrl` is the real tldraw workspace. If the default port is occupied,
the launcher automatically picks a nearby free local port.

## 两种生图方式 / Two Generation Modes

无论选择哪种模式，边界都一样：先生成真实 bitmap 图片，再由图片插件插入画布。
浏览器画布本身不把占位图、SVG 或旧文件当作生图结果。

In both modes, the boundary is the same: generate a real bitmap first, then let
the plugin insert that bitmap into the canvas. The browser canvas itself does
not treat placeholders, SVGs, or stale files as generated results.

### 1. Codex 内置 imagegen 模式 / Codex Built-In Imagegen Mode

适合：你希望直接使用 Codex/ChatGPT 已经暴露的内置生图能力，不想配置 API key。

Use this when you want to rely on Codex/ChatGPT's built-in image generation
capability and do not want to configure an API key.

工作方式：

1. 在图片插件中选择或创建一个 AI 图片占位框。
2. 在 Codex 中调用图片插件生图技能，例如：

   ```text
   Use $image-agent-canvas:image-agent-image-gen 生成一张产品宣传图并放到当前画布。
   ```

3. Codex 先用内置 `$imagegen` 生成真实 bitmap 图片。
4. 图片插件再通过 `insert_canvas_image` 把本地图片插入画布。

How it works:

1. Select or create an AI image holder in the canvas.
2. Ask Codex to use the canvas image generation skill, for example:

   ```text
   Use $image-agent-canvas:image-agent-image-gen to generate a product promo image into the current canvas.
   ```

3. Codex first generates a real bitmap with the built-in `$imagegen` capability.
4. The plugin then inserts that local bitmap into the canvas with `insert_canvas_image`.

注意：

- 不需要填写 API key。
- 不会把旧图、占位图、SVG 或 HTML 当成最终生图结果。
- 如果当前 Codex 会话没有暴露内置 imagegen 能力，应改用 API 模式。

Notes:

- No API key is required.
- Stale images, placeholders, SVGs, or HTML are not treated as final generated images.
- If the current Codex session does not expose built-in imagegen, use API mode.

### 2. API 模式 / API Mode

适合：你要使用自己的 OpenAI 兼容图片接口、第三方中转接口，或需要固定模型/网关。

Use this when you want to use your own OpenAI-compatible image endpoint, a
third-party relay endpoint, or a fixed model/gateway.

API 接口需要兼容 OpenAI 图片生成接口，通常是
`<Base URL>/images/generations`，并返回 `b64_json` 或可下载的 `url`。

The API should be compatible with the OpenAI image generation endpoint, normally
`<Base URL>/images/generations`, and return either `b64_json` or a downloadable
`url`.

在首次进入或设置面板中选择 API 模式，并填写：

Fill these fields in the first-run setup modal or settings panel:

| 字段 / Field | 说明 / Description |
| --- | --- |
| Base URL | API 根地址，例如 `https://example.com/v1`。API root URL, for example `https://example.com/v1`. |
| Model | 图片模型名，例如 `gpt-image-2`。Image model name, for example `gpt-image-2`. |
| Size | 生成尺寸，可选 `1024x1024`、`1536x1024`、`1024x1536`。Generation size, one of `1024x1024`, `1536x1024`, `1024x1536`. |
| Env key | 环境变量名，例如 `OPENAI_API_KEY`。Environment variable name, for example `OPENAI_API_KEY`. |
| Secret key | 真实 API key，本地保存。The real API key, stored locally. |

工作方式：

1. 图片插件保存模式、尺寸、Base URL、模型名和本地密钥引用。
2. Codex 读取这些设置，按所选尺寸调用图片 API 生成真实 bitmap。
3. 生成结果保存到 `canvas/generated-images/`。
4. 图片插件通过 `insert_canvas_image` 把该图片插入当前画布或选中的占位框。

How it works:

1. The plugin saves the mode, size, Base URL, model name, and local secret reference.
2. Codex reads those settings and calls the image API with the selected size to generate a real bitmap.
3. The generated file is saved under `canvas/generated-images/`.
4. The plugin inserts the bitmap into the current canvas or selected holder with
   `insert_canvas_image`.

安全说明：

- `Secret key` 只保存在本地 `canvas/.secrets/`。
- 不要把真实 key 写进 README、issue、commit 或聊天记录。
- `Env key` 填的是变量名，不是密钥值。

Security notes:

- `Secret key` is stored only in local `canvas/.secrets/`.
- Do not put real keys in README files, issues, commits, or chat messages.
- `Env key` is the variable name, not the secret value.

## Codex 使用示例 / Codex Usage Examples

```text
Start 图片插件 for this project.
Use $image-agent-canvas:image-agent-image-gen 生成一张正方形宣传图并放到当前画布。
按照我在图上的箭头标注，重新生成一张修改版放到 #2。
```

```text
Start Image Agent Canvas for this project.
Use $image-agent-canvas:image-agent-image-gen to generate a square promo image into the current canvas.
Use my arrow annotation to generate a revised version and place it in #2.
```

推荐流程：

1. 启动画布服务，打开 `canvasAppUrl`。
2. 选择生图模式：内置 imagegen 或 API。
3. 创建或选中 AI 图片占位框。
4. 插入参考图、提示词卡片或标注。
5. 让 Codex 生成或修改图片。
6. 确认生成图、提示词和分支关系都留在画布中。

Recommended flow:

1. Launch the canvas service and open `canvasAppUrl`.
2. Choose a generation mode: built-in imagegen or API.
3. Create or select an AI image holder.
4. Insert reference images, prompt cards, or annotations.
5. Ask Codex to generate or revise the image.
6. Confirm the generated image, prompt, and lineage stay on the canvas.

## MCP 工具 / MCP Tools

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

## 存储 / Storage

默认情况下，画布数据绑定到当前项目：

By default, canvas data is bound to the active project:

```text
canvas/pages/<page-id>/image-agent-canvas.json
canvas/pages/<page-id>/assets/
canvas/generated-images/
canvas/.secrets/
canvas/image-agent-selection.json
canvas/image-agent-view-state.json
canvas/image-agent-runtime.json
canvas/library/index.json
canvas/archives/*.iacanvas.json
```

可以在启动前设置：

You can set these before launching:

```text
IMAGE_AGENT_PROJECT_DIR
IMAGE_AGENT_CANVAS_DIR
IMAGE_AGENT_CANVAS_PORT
```

AppData 只作为兜底路径，不是正常项目数据目录。

AppData is only a fallback path and is not the normal project storage location.

## 开发 / Development

```powershell
npm run check
npm run build
npm run validate:plugin
```

核心文件结构：

Core project shape:

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
