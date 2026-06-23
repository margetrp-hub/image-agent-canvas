---
name: image-agent-image-gen
description: Generate a final AI bitmap for Image Agent Canvas and place it into the selected holder or current canvas area. Use when the user asks Codex to create, fill, replace, or place an AI-generated image on Image Agent Canvas.
---

# Image Agent Image Generation

Use this skill when the user wants an AI-generated image placed onto Image Agent Canvas. A selected `AI Image` holder gives a precise size and placement target, but it is not required.

## Capability Boundary

This skill follows the Cowart-style path: Codex generates the bitmap first, then Image Agent Canvas inserts the resolved local bitmap. Image Agent Canvas does not provide its own image-generation API and must not silently fall back to a custom endpoint, CLI script, stale file, SVG, HTML, or placeholder.

The required generation capability is the built-in `$imagegen` skill from Codex. If the current Codex surface has not exposed a callable image-generation capability for this turn, stop and report that limitation clearly. Do not call provider APIs unless the user explicitly asks for the API path.

## Workflow

1. Read the current canvas selection with `get_canvas_selection`.

2. Decide placement.

   - Selected AI holder: generate to the holder's aspect ratio and insert into that holder.
   - Selected image or note: generate and insert to the right of the selected shape.
   - No selection: generate anyway and insert into the current page.

3. Generate the bitmap with the built-in `$imagegen` skill unless the user explicitly requests another path.

   - Treat the user's request as a raster image generation request.
   - If the asset needs visible text, include that text directly in the image generation prompt.
   - Do not create SVG, HTML, or placeholder graphics when the user asked for an image.
   - Do not switch to CLI/API fallback unless the user explicitly asks for that path.
   - If no built-in image generation tool is available in the current turn, stop here and explain that the Codex imagegen capability was not exposed to the session.

4. Resolve the actual local output image carefully before inserting it.

   Preferred order:

   - Use the exact local path returned by the current image generation tool call when available.
   - If no path is returned, inspect the current Codex session JSONL for the latest `image_generation_call.result` and write the current output to a timestamped local PNG.
   - Use `$CODEX_HOME/generated_images` only when you can prove the file was created by the current request, such as by matching its timestamp after generation.

   Never insert an older generated image just because it is newest in a stale folder.

5. Insert the generated local image with `insert_canvas_image`.

   The MCP tool copies the bitmap into:

   ```text
   canvas/pages/<page-id>/assets/
   ```

   and writes the tldraw image asset plus image shape into the running canvas snapshot.

6. Let the canvas refresh from `/api/canvas-events`, then confirm the inserted shape id, dimensions, and saved asset path.

## Placement Rules

- If a selected holder is a frame, the inserted image should become a child of that frame.
- If there is already a generated image for the same holder and the user says replace, update or remove the old generated image instead of stacking another copy.
- Do not delete the holder unless the user explicitly asks for it.
- Do not refuse generation solely because no holder is selected.
- Do not write directly into AppData unless project storage is unavailable.
