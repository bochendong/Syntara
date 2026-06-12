---
name: openmaic-write-fact-memory
description: Use when an OpenMAIC agent needs to write or update an exact current fact. Covers user profile facts, preferences, budget, time zone, course constraints, notebook constraints, conversation-local state, overwrite semantics, and fact event history.
---

# Write Structured Fact Memory

## Role

Capture exact, current, overwriteable facts. Structured facts are the source of truth for precise values; semantic/vector memory must not decide which value is current.

## MCP and tools

- Resolve course/notebook targets through `openmaic.content`.
- Read and write facts through `openmaic.memory`.

Primary tools: `read_course_context`, `read_notebook_context`, `list_memory_facts`, `upsert_memory_fact`, `get_layered_memory_context`.

## Scope rules

- Use `user` for global learner profile, identity labels, language preference, interaction preference, time zone, and default learning habits.
- Use `course` for course-wide constraints, teacher requirements, format rules, syllabus facts, and course goals.
- Use `notebook` for notebook-specific requirements, page-generation constraints, and local teaching goals.
- Use `conversation` for short-lived facts that should not leave the current thread.
- Prefer the narrowest scope that preserves the user's intent.

## Namespace examples

- `profile.timezone`, `profile.identity`, `profile.learning_habit`
- `preference.language`, `preference.reply_style`, `preference.format`
- `goal.current`, `goal.budget`, `goal.deadline`
- `course.requirement`, `course.format_rule`, `notebook.constraint`

## Workflow

1. Identify whether the user gave an exact fact or updated a previous fact.
2. Resolve the target scope and read the active fact with `list_memory_facts`.
3. Write the new current value with `upsert_memory_fact`.
4. Treat the returned event as the audit trail; do not also write the old value as active memory.
5. If answering with memory context, use `get_layered_memory_context` so facts override fuzzy recalls.

## Quality gates

- Use facts for controllable values, not text memory.
- Do not create duplicate active facts for the same scope/namespace/key.
- If a user says "改成", "以后", "现在", "更新为", or gives a replacement value, overwrite the current fact.
- Keep `sourceRef` when the fact came from a message, file, problem, or notebook.
- Do not expose superseded values unless the user asks about history.

## Output

Return the current fact, scope, namespace/key, value, event type, and whether an old value was superseded.
