---
name: openmaic-generate-ppt
description: Use when an OpenMAIC agent needs to generate a complete notebook or PowerPoint-style lesson from requirements, course context, and source material. Covers orchestration, public memory writeback, page generation, actions, assets, persistence, and optional PPTX export.
---

# Generate PPT Notebook

## Role

Create a complete OpenMAIC notebook/PPT from user requirements and source material. This is the orchestration skill: use supporting skill documents for one-page content and lecture-image rendering instead of packing every page-level decision into this skill.

## MCP and tools

- Read course/notebook context through `openmaic.content`.
- Track long-running work through `openmaic.generation_jobs`.
- Generate images, speech, and PPTX exports through `openmaic.asset`.
- Write reusable lesson facts through `openmaic.memory`.

Primary tools: `read_course_context`, `read_notebook_context`, `create_generation_job`, `generate_scene_outlines`, `create_study_memory`, `generate_notebook_page_content`, `generate_scene_content`, `generate_html_ppt_slide`, `generate_image_asset`, `generate_scene_actions`, `generate_tts_asset`, `write_notebook_scenes`, `sync_notebook_generation`, `export_pptx`.

Supporting skill documents:

- `openmaic://skills/generate_ppt_page_content` for exactly one page's educational content.
- `openmaic://skills/render_lecture_image` for bitmap/HTML page visuals and focus regions.

## Workflow

1. Resolve target course/notebook context, ownership, existing memory, generation preferences, and source material.
2. Create a generation job before expensive work begins. Emit progress by stage rather than waiting silently.
3. Generate the teaching outline. Validate source coverage, page count, worked examples, quiz placement, and continuity.
4. Write public course/notebook memory before page generation when the outline reveals stable reusable facts.
5. For each approved outline item, load `generate_ppt_page_content` and produce scoped page content.
6. For each page, choose the rendering path:
   - Use `generate_scene_content` for structured scene JSON.
   - Use `generate_html_ppt_slide` for text/math-heavy visual slides.
   - Use `generate_image_asset` plus `render_lecture_image` for illustration-heavy or focus-region pages.
7. Generate narration and classroom actions with `generate_scene_actions`; generate TTS only when speech assets are requested.
8. Persist scenes/pages through `write_notebook_scenes`, refresh lightweight summaries through `sync_notebook_generation`, and export PPTX only when requested.

## Quality gates

- The outline must follow the source-material contract and avoid metadata noise in lesson content.
- Public memory should be persisted before page generation so partial failures do not drop shared context.
- Page content must be traceable to the approved outline and source material.
- Student-visible language should match the course/user requirement; preserve math notation and course codes.
- Generated summaries should avoid forcing large `Scene.content` reads on lightweight course surfaces.

## Output

Return the notebook/PPT pages, classroom scene/action data, generated asset references, public memory entries, and optional PPTX export result.
