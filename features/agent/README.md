# Agent Capability Layer

`features/agent` is the agent-facing orchestration boundary for OpenMAIC. It does
not own course, notebook, problem-bank, review, or memory data directly. Instead,
it composes the existing feature domains into three explicit capability types:

- Skills: user-visible workflows such as PPT generation, problem import, custom
  review, and memory writing.
- MCP resources: protected resource namespaces such as `openmaic.content`,
  `openmaic.problem_bank`, `openmaic.review`, and `openmaic.memory`.
- Tools: route-, service-, or client-backed atomic operations that a skill may
  call through an MCP namespace.

When adding agent support for an existing feature, keep the capability definitions
in the owning feature's `agent-capabilities.ts`, then compose them in
`features/agent/domain/registry.ts`.

Project-local skill instructions live under `features/agent/skills/*/SKILL.md`.
Each primary skill definition should point to its `skillDocumentPath` and
`skillDocumentUri`; supporting skill documents can be listed in
`supportingSkillDocumentIds`. The MCP endpoint exposes these Markdown files as
`openmaic://skills/...` resources so agents can load workflow instructions only
when a task needs them.

Recommended layout:

```txt
features/agent/
  domain/
    registry.ts
    mcp-resources.ts
    skill-documents.ts
  server/
    mcp-server.ts
  skills/
    generate-ppt/SKILL.md
    page-content/SKILL.md
    render-lecture-image/SKILL.md
    import-problems/SKILL.md
    custom-review/SKILL.md
    write-memory/SKILL.md
```
