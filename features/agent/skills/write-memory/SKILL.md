---
name: openmaic-write-study-memory
description: Use when an OpenMAIC agent needs to write, update, archive, or delete text-based study memory. Covers public course/notebook notes, private learner experiences, target ownership, deduplication, source evidence, and local-first fallback. Do not use for exact overwriteable facts.
---

# Write Study Memory

## Role

Capture durable text-based study memory with the correct scope and ownership. Public memory is reusable course/notebook knowledge; private memory is per learner and must not be published with shared course content.

For exact current values such as budget, language preference, time zone, identity labels, current goals, or course/notebook constraints that should overwrite older values, use `openmaic-write-fact-memory` instead.

## MCP and tools

- Resolve course/notebook targets through `openmaic.content`.
- Read and write memory through `openmaic.memory`.

Primary tools: `read_course_context`, `read_notebook_context`, `list_study_memory`, `create_study_memory`, `update_study_memory_status`, `delete_study_memory`, `write_local_study_memory`.

## Scope rules

- Use public memory for stable creator-approved course facts, terminology, style constraints, or reusable teaching notes.
- Use private memory for learner mistakes, preferences, pacing, accommodations, or review history.
- Use local-first memory only when database-backed memory is unavailable and the operation is explicitly local.
- Do not use study memory for key-value facts that need current-value overwrite behavior.

## Workflow

1. Resolve the target type/id and whether the memory is public or private.
2. Read existing memory with `list_study_memory` to avoid duplicates or contradictions.
3. Write memory with source, reason, references, and visibility scope.
4. Archive or delete stale memory when later evidence supersedes it.
5. Report whether the write used database-backed storage or local-first fallback.

## Quality gates

- Never publish private learner memory into course-owned shared content.
- Never store a superseded exact value as active study memory when a structured fact should be overwritten.
- Do not write inferred memory without a reason or source evidence.
- Prefer updating or archiving stale memory over adding conflicting duplicates.
- Keep generated speech/audio ownership separate from shared public lesson memory.

## Output

Return the created or updated memory record, storage backend, scope, target, source evidence, and any deduplication decision.
