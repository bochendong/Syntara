---
name: openmaic-render-lecture-image
description: Use inside OpenMAIC PPT generation when a page needs a lecture image, visual slide, focus-region graphic, or repair pass for generated page imagery. Runs after page content exists and before scene/action persistence.
---

# Render Lecture Image

## Role

Create or repair the visual representation of one OpenMAIC lecture page. This skill starts from scoped page content; it must not read the full source, re-plan the notebook, or decide global pacing.

## Rendering choice

- Use `generate_html_ppt_slide` for text-heavy, formula-heavy, or layout-sensitive pages.
- Use `generate_image_asset` for diagrams, visual metaphors, source-marker images, or bitmap lecture illustrations.
- Use both when a generated bitmap should be placed into an HTML slide shell.

## Workflow

1. Confirm the page objective, visible text, focus regions, and required language.
2. Choose HTML, bitmap, or mixed rendering based on the page content.
3. For bitmap focus-region pages, first generate a source-marker image when marker recovery is required:
   - Each focus region needs four isolated corner markers.
   - Markers must sit outside important student-visible content.
   - The first generated image should already contain all markers.
4. Recover or record clean focus-region geometry before finalizing the student-facing image.
5. Run a repair pass when text is unreadable, markers are missing, math is corrupted, or focus regions do not match the page content.
6. Return asset references, focus-region metadata, and repair notes to the parent PPT workflow.

## Language and content rules

- Preserve the source/user language for student-visible text.
- Preserve math notation, symbols, and course codes exactly unless the user asks for a change.
- For MAT136 queue image notebooks, keep student-visible image text and narration/action speech in Simplified Chinese.
- Do not add decorative text that the teacher would need to explain away.

## Quality gates

- Student-visible text must be legible at slide size.
- Focus regions must align with the semantic focus order from page content.
- Final student image must not show marker artifacts unless the marker image is explicitly requested for debugging.
- Image assets must be attached to the page/scene through `openmaic.asset`, not embedded as oversized inline scene JSON when avoidable.
