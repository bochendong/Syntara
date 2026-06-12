---
name: openmaic-custom-review
description: Use when an OpenMAIC agent needs to create or run a personalized review route from notebook/course content, problem-bank progress, learner memory, and grading feedback.
---

# Custom Review Route

## Role

Generate and run a personalized review route. The route should be based on real notebook content, problem-bank availability, attempts/progress, and learner memory instead of generic slide quizzes.

## MCP and tools

- Read notebook/course context through `openmaic.content`.
- Read candidate problems and progress through `openmaic.problem_bank`.
- Generate routes and grade practice through `openmaic.review`.
- Write recurring mistakes or preferences through `openmaic.memory`.

Primary tools: `read_notebook_context`, `list_problem_bank`, `list_study_memory`, `assess_problem_bank`, `generate_review_route`, `grade_answer`, `run_code_answer`, `record_problem_attempt`, `create_study_memory`.

## Workflow

1. Build the learner profile from notebook scenes, problem progress, prior attempts, and private memory.
2. Run `assess_problem_bank` before route generation. If the problem bank is thin, return the missing concepts rather than pretending coverage is enough.
3. Generate a route with layers, nodes, candidate problem ids, pass criteria, and remediation branches.
4. During practice, grade answers with `grade_answer`; use `run_code_answer` only for code-style questions.
5. Persist attempts through `record_problem_attempt` so future routes can adapt.
6. Write private study memory for recurring mistakes, preferences, or durable weak points when there is enough supporting evidence.

## Quality gates

- Review routes must reference real candidate problems or explicitly state when coverage is missing.
- Do not write public memory from learner-specific mistakes.
- A generated route should include stop/pass conditions, not only a list of questions.
- Persisted attempts must update progress for future personalization.

## Output

Return the readiness assessment, review route, practice results, progress updates, and optional private memory entries.
