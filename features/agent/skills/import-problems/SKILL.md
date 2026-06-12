---
name: openmaic-import-problems
description: Use when an OpenMAIC agent needs to import problems from one source file or text block into a course or notebook problem bank. Covers target resolution, preview, draft review, commit, ownership, and import-batch traceability.
---

# Import Problem Bank

## Role

Convert one source file or text block into reviewed problem-bank records. Keep ownership explicit: a problem may belong to a course, a notebook, or a course-level unassigned bank.

## MCP and tools

- Read target context through `openmaic.content`.
- Parse, review, and persist problem records through `openmaic.problem_bank`.

Primary tools: `read_course_context`, `read_notebook_context`, `preview_problem_import`, `commit_problem_import`, `create_problem_from_draft`, `update_problem`, `delete_problem`.

## Workflow

1. Resolve the target course or notebook before parsing.
2. Import one book, file, or pasted source block at a time unless the user explicitly asks for batching.
3. Run `preview_problem_import` first. Treat the preview as the normalization and quality-report step.
4. Review drafts for target ownership, language, answer visibility, problem type, tags, and warnings.
5. Skip figure-only, malformed, duplicate, or out-of-scope drafts when requested.
6. Commit approved drafts with `commit_problem_import` or `create_problem_from_draft`.
7. Keep the `ProblemImportBatch` trace so later edits can explain where records came from.

## Quality gates

- Never commit directly from raw source without a preview/review stage.
- Do not mix course-owned unassigned problems with notebook-owned problems unless the target says so.
- Preserve hidden answer/solution fields separately from student-visible prompts.
- Keep import warnings visible when source quality is uncertain.

## Output

Return the import batch id, created/updated problem records, skipped drafts, warnings, and usage metadata.
