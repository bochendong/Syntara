---
name: openmaic-generate-ppt-page-content
description: Use inside OpenMAIC PPT generation after a teaching outline item is approved and the agent needs to create exactly one page of educational content. Produces scoped page content, focus order, visible text, and continuity notes without doing whole-notebook orchestration or image rendering.
---

# Generate PPT Page Content

## Role

Turn one approved outline item into one page's educational content. Keep this skill page-local: do not re-plan the whole lesson, write final image prompts, create assets, or persist notebook scenes.

## Inputs

- Approved outline item and page role.
- Source excerpt or source references for this page.
- Course language, notation, learner level, and neighboring-page continuity.
- Existing public/private memory that directly affects this page.

## Workflow

1. Restate the page objective in one short internal sentence.
2. Extract only the source facts needed for this page.
3. Draft visible student text, teacher-facing explanation notes, and any example/quiz content.
4. Define 2-4 focus regions when the page needs guided attention. Keep them semantic, not pixel coordinates.
5. Add continuity notes for previous/next pages when needed.
6. Return a structured payload for `generate_notebook_page_content` or the next rendering step.

## Output shape

```json
{
  "pageTitle": "Short visible title",
  "pageRole": "concept | example | practice | recap | transition",
  "visibleText": ["Student-visible text block"],
  "teacherNotes": ["Narration-safe explanation note"],
  "focusRegions": [
    {
      "id": "focus-1",
      "label": "Semantic focus label",
      "purpose": "Why the teacher points here"
    }
  ],
  "continuity": {
    "fromPrevious": "Optional bridge",
    "toNext": "Optional bridge"
  },
  "sourceReferences": ["Stable source reference or excerpt id"]
}
```

## Quality gates

- Generate exactly one page unless the parent orchestration skill asks for a split.
- Avoid layout coordinates, marker instructions, provider-specific image prompts, and persistence details.
- Preserve the requested language and math notation.
- Do not invent unstated theorem names, numbers, or source citations.
