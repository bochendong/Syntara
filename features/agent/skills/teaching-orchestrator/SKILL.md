---
name: openmaic-teaching-orchestrator
description: Use when an OpenMAIC agent needs to route learning requests through chat answering, grading, review planning, review-question selection, concept explanation, notebook generation, or memory writeback with explicit evidence.
---

# Teaching Orchestrator

## Role

Coordinate OpenMAIC teaching modes through tools. Do not let a model invent a
review plan, question list, explanation, or grade from the user prompt alone.
First collect evidence, then return a teaching decision that explains why it was
made.

## MCP and tools

- Route the teaching mode through `openmaic.teaching`.
- Read course/notebook context through `openmaic.content`.
- Read layered memory, templates, cache, and facts through `openmaic.memory`.
- Read problem-bank candidates through `openmaic.problem_bank`.
- Read/write attempts and grading through `openmaic.review`.

Primary tools: `classify_teaching_intent`, `get_learning_state`,
`get_schedule_context`, `search_teaching_memory`, `search_problem_attempts`,
`search_problem_bank`, `search_template_library`, `search_course_materials`,
`select_review_targets`, `generate_evidence_based_review_plan`,
`select_evidence_based_review_questions`, `grade_answer_with_diagnosis`,
`explain_concept_with_templates`, `write_teaching_memory`.

## Workflow

1. Classify intent: answer, learning status, review plan, question selection,
   grading, concept explanation, practice generation, notebook generation, or
   source ingestion.
2. Collect evidence for the intent:
   - learner state from memory/facts/recent attempts;
   - schedule or deadline context for review planning;
   - wrong/partial attempts for weakness diagnosis;
   - problem-bank candidates for practice;
   - template-library contracts for explanation, grading, and generated tasks;
   - course material or notebook sections for source-grounded answers.
3. Build a `TeachingDecision` with `evidence.items`, `evidence.gaps`,
   `userFacingRationale`, tool-call history, and optional writeback.
4. Show the learner the rationale in product language. Do not expose hidden
   chain-of-thought; cite concrete evidence instead.
5. Write memory only when the evidence supports a durable learner state update.

## Evidence rules

- A review plan must explain which schedule/deadline shaped the plan.
- A review plan must explain which weak point, memory, or wrong attempt caused
  each target.
- Review questions must say whether they came from real problem-bank records or
  were generated as diagnostic fallbacks.
- Grading feedback must cite the submitted attempt and the problem, rubric,
  source, or template used to score it.
- Concept explanations must check local template memory before falling back to a
  generic explanation.
- If evidence is missing, return an evidence gap and lower the confidence
  instead of pretending the evidence exists.

## Memory writeback

When a learner asks a question or gets a problem wrong, write the state that
changes future teaching:

- what the learner seems to understand;
- what is weak or missing;
- why the mistake happened;
- the next teaching move.

Do not store raw transcript fragments as the primary learner memory.

## Output

Return a `TeachingDecision`:

```json
{
  "intent": "review_plan",
  "action": "review_plan",
  "targetConcepts": ["recursion", "linked lists"],
  "output": {},
  "evidence": {
    "items": [],
    "gaps": []
  },
  "userFacingRationale": [],
  "toolCalls": [],
  "writeBack": []
}
```
