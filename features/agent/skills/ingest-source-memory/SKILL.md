---
name: openmaic-ingest-source-memory
description: Use when an OpenMAIC creator or learner uploads a source file and the agent must decide what becomes public long-term memory, private learner memory, problem-bank/knowledge-base RAG, or ignored generic text.
---

# Ingest Source Into Memory

## Role

Turn uploaded files into the right memory layer. Creator files can create public
course/notebook memory and knowledge-base sources. Learner files can create
private learner memory and evidence for diagnosis.

## MCP and tools

- Resolve course/notebook targets through `openmaic.content`.
- Plan memory artifacts through `openmaic.memory`.
- Import problem banks through `openmaic.problem_bank` when the source is a set
  of problems.

Primary tools: `read_course_context`, `read_notebook_context`,
`plan_memory_source_ingestion`, `create_study_memory`, `upsert_memory_fact`,
`preview_problem_import`, `commit_problem_import`.

## Layer rules

- Short-term memory: current learner state, updated frequently.
- Long-term memory: durable text contracts such as templates, invariants,
  answer format rules, allowed tools, forbidden moves, and recurring learner
  patterns.
- Knowledge base: full source files, large problem banks, and original passages
  that should be retrieved with RAG.
- Control facts: exact current values that need overwrite semantics.

## Workflow

1. Resolve whether the target is a course or notebook and whether the uploader is
   creator or learner.
2. Call `plan_memory_source_ingestion` with the source title, kind, text, target,
   and course code if known.
3. Review artifacts:
   - commit static long-term memory only for course-local contracts/templates;
   - keep full source and problem banks in RAG/problem-bank flows;
   - discard generic concepts from static memory.
4. Commit approved writes with the owning tool. Do not write private learner
   memory into public course memory.
5. Report the layer, source reference, and reason for every committed artifact.

## Quality gates

- Do not store generic definitions such as "what is a class" as long-term memory.
- For CPSC107, preserve HtDF/HtDD recipe constraints and current unit tool
  boundaries.
- For CSC108, preserve function headers, annotations, and starter docstrings as
  answer contracts.
- For CSC148, preserve local class contracts, attributes, and representation
  invariants instead of generic OOP prose.
- Large files and hundreds of questions must be searchable RAG/problem-bank
  entries, not static prompt memory.

## Output

Return the ingestion plan, approved write candidates, skipped generic content,
and the source references needed for audit.
