# Scene Brief

- Title: {{title}}
- Description: {{description}}
- Scene Language: {{language}}
- Key Points:
  {{keyPoints}}

{{contentProfileContext}}
{{archetypeContext}}
{{layoutIntentContext}}
{{deckContext}}
{{workedExampleContext}}
{{purposeGuidance}}
{{disciplineGuidance}}

## Available Images / Visual Slots

{{assignedImages}}

{{teacherContext}}
{{coursePersonalization}}
{{rewriteContext}}

## Output Task

Generate Syntara Markup for this page. First use the PagePlan to decide the page's teaching job, then choose the semantic structure; do not merely rewrite the key points as paragraphs.

Ensure:

1. Output only Syntara Markup, with no JSON, HTML, coordinates, or markdown fence.
2. Start with `\begin{slide}[title={...}, profile=..., language={{language}}]` and end with `\end{slide}`.
3. Student-facing text uses `{{language}}`; code identifiers may remain as written.
4. Use the concrete facts, code, problem, data, and PagePlan supplied in the input; do not change the problem.
5. If Deck Memory provides a shared example or neighbor handoff, resolve shorthand on this page with that context; do not reinvent the same example in a new setting.
6. Use semantic components for math, code, tables, processes, or state models.
7. If layout intent names a classic `layoutTemplate`, organize semantic blocks as that renderer input structure; for example, `pipeline_table` needs a short lead, a process, and a table; `comparison_matrix` must be table-led; `process_steps` must be process-led.
8. If this is a retry, prioritize the issue named in the rewrite context.
9. The PagePlan concrete anchor must appear in student-visible text; do not explain only an abstract method.
10. Do not write structural command names or component names inside student-visible strings such as card bodies, step bodies, table cells, or callout bodies.
