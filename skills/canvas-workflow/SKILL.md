---
name: canvas-workflow
description: Use when working with Image Agent Canvas to read canvas state, interpret annotations, create image holders, and insert generated local images back into the canvas.
---

# Image Agent Canvas Workflow

Use this skill when the user is working inside Image Agent Canvas or asks Codex to interpret a canvas with reference images, arrows, notes, selected holders, or generated image results.

## Operating Model

1. Read both visual and structured state.
   - Call `read_canvas_layers` for structured objects, text, bounds, links, and metadata.
   - Use the user's screenshot or Codex vision input when visual interpretation is needed.
2. Interpret the canvas as a generation workflow, not as a generic drawing.
   - Images are source or result nodes.
   - Text notes are intent, constraints, negative prompts, or review comments.
   - Arrows and nearby notes express revision intent.
   - AI image holders are target slots for generated images.
3. Write back concise, visible artifacts.
   - Use `insert_canvas_image` for generated or revised local bitmaps.
   - Use `create_ai_image_holder` when the user asks for a target generation slot.
   - Use `insert_prompt_card` for reusable prompts, constraints, or summarized edit plans.
   - Use `create_canvas_branch` to preserve lineage such as `#1 -> #2 -> #3`.
   - Use `insert_error_note` when generation fails and the failure should remain visible on the canvas.
   - Use shape metadata to preserve source ids and prompts.

## Defaults

- Prefer tldraw layer IDs and explicit `canvasId` over prose references.
- Do not overwrite existing user layers unless asked.
- Keep generated prompt cards short enough to scan on the canvas.
- Preserve context: keep generated results near their selected source or holder.
- Search with `search_inspiration_library` when the user asks for examples, styles, prompts, or references.
- Use `export_edit_pack` before image editing when selected layers, arrows, notes, and reference images need to become a structured prompt package.
- If the canvas state and screenshot disagree, mention the mismatch and rely on the user's selected layer where possible.

## Suggested User-Facing Flow

When the user asks for help from a canvas:

1. Summarize what is on the canvas.
2. Identify the intended source image, target change, and constraints.
3. Produce a clean generation prompt or edit instruction.
4. Generate or locate the local result image.
5. Insert the result into the selected holder or next to the source image.
