---
name: image-agent-annotation-edit
description: Use when the user provides a screenshot or canvas annotations and wants a revised image inserted beside the original.
---

# Image Agent Annotation Edit

Use this skill when the canvas contains annotations, arrows, or text notes around an existing image.

## Main Flow

1. Read `read_canvas_layers` and `get_canvas_selection`.
2. Treat selected images as the source and nearby text/arrows/drawings as edit intent.
3. Call `export_edit_pack` when annotations and selected references should become a structured editing package.
4. Generate or edit the image through the available image workflow.
5. Save the result locally, then call `insert_canvas_image` with `placement: "right"` unless a holder is selected.
6. Use `create_canvas_branch` or `shapeMeta` to preserve lineage, such as `imageAgentSourceShapeId`, `branchLabel`, and the final prompt.
7. If generation fails, use `insert_error_note` near the source image so the failure reason remains visible and retryable.

Keep writeback concise: one revised image beside the source or inside the selected holder, plus short metadata for the source id and final prompt.
