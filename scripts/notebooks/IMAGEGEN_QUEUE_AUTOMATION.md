# Imagegen Queue Automation Runbook

This runbook is for Codex-driven queue processing under `queue/`.

The workflow intentionally does not use the project notebook generation APIs. Codex owns the
reading, prompt writing, built-in image generation, image inspection, narration writing, QA, and
final database write.

## Targets

- `queue/MAT102/*.pdf` -> Introduction to Mathematical Proofs, `MAT 102`, preferred course id `cmpd5bird007v8ogmjuuiio03`.
- `queue/MAT136/*.pdf` -> Calculus II, `MAT 136`, preferred course id `cmpanemia001v8ouzmhttvkrn`.
- `queue/CPSC107/*.pdf` -> CPSC 107, preferred course id `cmpc9dqgv000p8ogmrsjl5co8`.

If the database contains multiple matching courses, verify the target course before the first
database write. `MAT136` must go to Calculus II.

## Workspace

Prepare or refresh the queue workspace:

```bash
/Users/dongpochen/.nvm/versions/node/v22.22.2/bin/node scripts/notebooks/prepare-imagegen-queue.mjs
```

The manifest is written to:

```text
tmp/notebook-imagegen-queue/manifest.json
```

Each notebook has a directory like:

```text
tmp/notebook-imagegen-queue/MAT136/queue-mat136-01-definite-integral/
```

Inside each notebook directory:

- `notebook.json`: page list and status.
- `source-text/page-XXX.txt`: text extracted from the source PDF.
- `prompts/page-XXX.prompt.md`: Codex-authored image prompt for the page.
- `generated-images/page-XXX.png`: final selected built-in imagegen output.
- `narration/page-XXX.actions.json`: Codex-authored scene actions for the generated image.

## Processing Loop

Process one notebook at a time. Do not batch many notebooks together.

1. Read the full notebook source text first, then skim adjacent page context before writing a page prompt.
2. For each page, write a full image prompt to `prompts/page-XXX.prompt.md`.
3. Call the built-in `image_gen` tool for that page. Do not call `/api/generate/*`, the project image API, or the fallback CLI unless the user explicitly changes the instruction.
4. Move or copy the selected generated image from `$CODEX_HOME/generated_images/...` into `generated-images/page-XXX.png`.
5. Inspect the generated image with vision. If it is unreadable, visually incoherent, or misses the page's teaching goal, regenerate once with a tighter prompt.
6. After accepting the image, write `narration/page-XXX.actions.json`.
7. Update the matching page status in `notebook.json`.
8. After all pages in the notebook are ready, build scene records and run the QA gates below before writing the database.

## Image Prompt Rules

Use the built-in imagegen skill's scientific-educational style.

Every generated page should be a 16:9 full-page educational notebook image. The image is the
student-facing page, not a teacher planning sheet.

Required prompt properties:

- Use case: `scientific-educational`.
- Asset type: 16:9 course notebook slide.
- Include the exact page teaching goal derived from source text.
- Keep text short, legible, and student-facing.
- For math, prefer clear formulas and worked-example structure over dense paragraphs.
- For CS, make the page read like design/debugging work: data shape, template, code, trace, and tests.
- Do not include teacher planning labels such as `教学目标`, `讲解重点`, `page role`, `speaker notes`, or `QA checklist`.
- Do not include watermarks.

When a page has multiple teachable regions, plan visible layout regions that later become focus
targets: title, main idea, example/diagram/code, takeaway or next step.

## Narration And Actions

Narration is written after inspecting the generated image, not before.

Each page must have actions in this order:

1. A `spotlight` or equivalent focus action for the current visual unit.
2. One or more `speech` actions explaining that visual unit.
3. Repeat for the next visual unit.

Speech must satisfy the classroom narration standard:

- Tell the student where to look.
- Explain why that area matters.
- Connect to the previous and next page.
- End with a transferable judgment method.
- Do not merely read the image text aloud.
- Use a direct teacher voice, not meta notes about what the teacher should do.

For math TTS text, avoid raw formula typography in `speech.text`: no `^`, `_`, `√`, `∫`, `π`, `θ`,
superscript/subscript Unicode, or English formula readings like `x squared` and `pi over six`.
Write speech-friendly Chinese such as `x 的平方`, `根号 x`, and `派除以六`.

## Four-Corner / Focus Requirements

Final scene data must support classroom masking and the `四角测试` workflow.

For generated image pages, create focus geometry for the major visual regions. If the generated
image includes recoverable marker metadata, store it in `content.imageNotebookPromptPlan`.
If using deterministic focus geometry instead, add transparent focus shape elements to the scene
canvas and target those shapes from `spotlight.elementId`.

Acceptance requirements:

- Every `spotlight.elementId` exists in the same scene's `content.canvas.elements`.
- Every teaching page has at least one `speech` action.
- A spotlight appears before the speech it supports.
- Dense example pages are not covered by one giant focus box only.
- The left Notes tab can click each lecture point and show the corresponding mask.

## Database Write

Only write a notebook after all pages pass local QA.

Preferred write path when the local authenticated app server is available:

1. `POST /api/notebooks` to create/update the notebook row.
2. `PUT /api/notebooks/{id}/scenes` to replace scenes, because that route inlines local generated
   notebook images before persistence.

If writing with Prisma directly, inline generated PNGs into data URLs first, or make sure the final
image URLs are resolvable by the deployed app. Do not store paths that only work on the local
machine.

## QA Gates

Before a notebook is marked complete:

- Page count in DB equals source PDF page count unless explicitly skipped.
- Notebook course id matches the course target.
- Every scene is type `slide`.
- Every scene has a full-page image plus transparent focus elements.
- Every scene has speech.
- All spotlight targets exist.
- No duplicate action ids.
- TTS text has no raw formula residues.
- Open at least the first, a middle, and the last page in the classroom UI or inspect equivalent
  scene JSON if browser verification is not available.
