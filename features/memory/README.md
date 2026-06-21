# OpenMAIC Memory System

This feature owns the new memory boundary. Older `lib/server/study-memory*` and
`lib/server/memory-*` files are storage adapters; new product logic should live
under `features/memory`.

## Layers

1. **Short-term memory** is small overwriteable text. It tracks the learner's
   current state: what they can do, what they cannot do yet, why they are stuck,
   and the next teaching move.
2. **Long-term memory** is curated text. It stores durable course/notebook
   contracts, teacher-specific templates, local conventions, and recurring
   learner patterns.
3. **Knowledge cache** is the warm layer between curated memory and full RAG. It
   stores recently and frequently useful knowledge-base hits so repeated source
   and problem lookups can be injected cheaply before another broad search.
4. **Knowledge base** is RAG. It stores full source files, problem banks, and
   original passages that are too large to inject statically.

`MemoryFact` remains a control plane for exact current values. It is not a
fourth content layer; it decides which precise facts override fuzzy text recall.

## Read Order

Answers should read memory in this order:

1. Structured control facts.
2. Short-term learner state.
3. Static long-term course/notebook memory.
4. Dynamic long-term semantic memory.
5. Knowledge cache: recent/frequent source and problem hits.
6. Knowledge-base RAG: original source passages and problem-bank matches.

This keeps course-local rules such as CPSC107 HtDF, CSC108 docstring contracts,
or CSC148 representation invariants in the prompt, while keeping large files and
hundreds of problems searchable instead of pasted.

## Write Policy

Creator uploads may create public long-term memory and knowledge-base sources.
Learner actions may create private short-term state, private durable learning
patterns, and problem-attempt records.

Knowledge-base searches refresh `MemoryKnowledgeCache` with useful source and
problem hits. Cache entries are hints, not durable teaching contracts: verify
with original source evidence when exact wording matters, and promote only
course-local rules into long-term memory.

Do not promote generic textbook definitions into long-term memory. Promote only
the part that changes future answers: local templates, invariants, forbidden
moves, allowed tools, grading checks, and learner diagnosis.

For example, an OOP source should not store "a class is a blueprint". A CSC148
`Tweet` source should store the local class contract: attributes, representation
invariants, constructor expectations, and how those affect explanations or
grading.
