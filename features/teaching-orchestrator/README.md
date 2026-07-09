# Teaching Orchestrator

`features/teaching-orchestrator` is the cross-domain teaching control layer for
OpenMAIC. It does not own memory, problem-bank, review, notebook, or schedule
storage. It coordinates those domains through explicit tools and returns a
`TeachingDecision` with an evidence ledger.

## Why this exists

Learning features should not be separate prompt islands. Chat answers, grading,
review plans, review-question selection, concept explanations, notebook
generation, and memory extraction all need the same operating rule:

1. classify the teaching intent;
2. resolve the fixed workflow when the request is a review request;
3. call tools to read the relevant evidence;
4. make a teaching decision;
5. explain why that decision was made;
6. extract and write back only supported learner state.

## Fixed workflows

The fixed workflow contract lives in `domain/fixed-workflows.ts`. It is the
OpenMAIC equivalent of a LangGraph state graph: nodes are typed steps, edges are
deterministic routing decisions, and LLM calls are allowed only inside specific
nodes such as explanation, question selection, plan generation, or typed memory
extraction.

Review requests use these hard-coded routes:

- named concept + explanation;
- named concept + practice;
- named concept + both;
- range/exam/course + explanation plan;
- range/exam/course + practice plan;
- range/exam/course + mixed plan;
- clarification when the scope is missing;
- clarification when the learner did not choose explanation/practice/both.

Memory extraction is also a fixed workflow family. It separates exact facts,
short-term learner diagnosis, practice attempts, repeated mistake patterns,
explanation feedback, public/source memory, problem-bank metadata, knowledge
cache hits, and student corrections so the write target is explicit before any
memory is persisted.

## Evidence ledger

Every decision carries:

- `evidence.items`: concrete sources such as schedule entries, memories, prior
  wrong attempts, problem-bank records, templates, notebook sections, or course
  materials;
- `evidence.gaps`: missing evidence that changes the confidence or fallback;
- `userFacingRationale`: the explanation the learner should see.

Review plans and review-question selection are especially strict. A plan should
say which schedule/deadline shaped it, which prior mistake or weak point caused
each task, and which problem/template/source supplied the practice. If any of
those are missing, the output must say so instead of pretending the plan is
personalized.

## Tool protocol

The domain contracts in `domain/tool-contracts.ts` are provider neutral. They
can be adapted to OpenAI function tools, Vercel AI SDK tools, LangChain tools, or
LangGraph nodes without moving the business rules into a framework wrapper.

The first implementation target is:

```txt
user request
  -> classify_teaching_intent
  -> resolve_fixed_review_workflow
  -> evidence tools
  -> teaching decision
  -> classify_memory_extraction_signal
  -> extract_teaching_memory_signal
  -> route_teaching_memory_write
  -> optional write_teaching_memory
```

The first route-backed slice is `POST /api/teaching/review-plan`. It accepts a
course or notebook target, the learner query, optional local syllabus/calendar
events from `/learn`, and planning constraints. It returns a `TeachingDecision`
whose review tasks and question candidates point back to evidence ids.

The orchestrator should reuse existing feature owners:

- `features/memory` for layered memory, templates, cache, and memory writes;
- `features/problems` for problem-bank records;
- `features/review` and `features/practice` for attempts and grading;
- `features/ppt-generation` or content routes for notebook generation.
