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
`resolve_fixed_review_workflow`, `select_review_targets`, `generate_evidence_based_review_plan`,
`select_evidence_based_review_questions`, `grade_answer_with_diagnosis`,
`explain_concept_with_templates`, `classify_memory_extraction_signal`,
`extract_teaching_memory_signal`, `route_teaching_memory_write`,
`write_teaching_memory`.

## Workflow

1. Classify intent: answer, learning status, review plan, question selection,
   grading, concept explanation, practice generation, notebook generation, or
   source ingestion.
2. For review requests, resolve the fixed review workflow:
   - named concept review: ask whether the learner wants explanation, practice,
     or both when the mode is missing;
   - range/exam/course review: read syllabus/current date/schedule and infer a
     review window when possible; ask only when the window cannot be inferred.
3. Collect evidence for the intent:
   - learner state from memory/facts/recent attempts;
   - schedule or deadline context for review planning;
   - wrong/partial attempts for weakness diagnosis;
   - problem-bank candidates for practice;
   - template-library contracts for explanation, grading, and generated tasks;
   - course material or notebook sections for source-grounded answers.
4. Build a `TeachingDecision` with `evidence.items`, `evidence.gaps`,
   `userFacingRationale`, tool-call history, and optional writeback.
5. Show the learner the rationale in product language. Do not expose hidden
   chain-of-thought; cite concrete evidence instead.
6. Run typed memory extraction after teaching actions and write memory only when
   the evidence supports a durable learner state update.

## Fixed review workflows

- Concept + explanation: read learner memory, course templates, knowledge cache,
  and RAG/source context; explain the concept; extract remaining confusion and
  next teaching move.
- Concept + practice: read learner memory, prior attempts, templates, and
  problem-bank candidates; choose a small quiz; send questions through the
  problem UI; extract attempted problems and error patterns.
- Concept + both: explain the weakest prerequisite or misconception briefly,
  then select practice using the same evidence.
- Range/exam/course review: read syllabus, current date, calendar/deadlines,
  learner memory, attempts, templates, and problem coverage; infer days and
  frequency when possible; generate a calendar-ready plan and propose calendar
  writes only with confirmation.

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

Memory extraction is typed. Choose the extractor before writing:

- student-declared facts: deadline, available time, preferred mode, scope,
  correction -> control facts;
- question diagnosis: mastered signal, stuck point, probable cause, next move ->
  short-term working memory;
- practice attempt signal: problem id, status, score/outcome, diagnosis ->
  attempt/progress first;
- mistake pattern: repeated misconception or error pattern -> long-term memory;
- explanation feedback: understood/still confused/needs another example ->
  short-term state update;
- source public memory: syllabus, notes, templates, rubrics -> RAG/public course
  memory, unless the upload is all questions;
- problem-bank metadata: tags, difficulty, type, diagnostic purpose -> problem
  record metadata;
- knowledge-cache hit: recently/frequently used source -> cache priority only;
- student correction: overwrite or correct facts/memory rather than appending a
  contradiction.

When a learner asks a question or gets a problem wrong, write only the state that
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
