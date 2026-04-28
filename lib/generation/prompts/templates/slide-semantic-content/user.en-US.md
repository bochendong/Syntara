# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Scene Language**: {{language}}
- **Key Points**:
  {{keyPoints}}

{{contentProfileContext}}
{{archetypeContext}}
{{layoutIntentContext}}
{{workedExampleContext}}
## Available Images / Visual Slots

{{assignedImages}}

{{teacherContext}}
{{coursePersonalization}}
{{rewriteContext}}

## Output Requirements

Generate Syntara Markup for exactly one teaching slide.

Important:

1. Output Syntara Markup only; do not output JSON
2. Do not wrap the markup in markdown code fences
3. Start with `\begin{slide}[title={...}, profile=...]` and end with `\end{slide}`
4. Do not output slide coordinates, HTML, PPT elements, or JSON fields named `slots` / `blocks`
5. Do not output KaTeX HTML; keep formulas as plain LaTeX inside `\formula{...}` or math delimiters
6. Every generated command, environment title, bullet, and text unit must be entirely in `{{language}}`
7. If the scene contains formulas, worked examples, matrix operations, code, or tables, use `\formula`, `derivation`, `\code`, or `\table` instead of plain paragraphs whenever possible
8. Set slide `profile=math` for matrix / proof / derivation-heavy slides, `profile=code` for programming walkthroughs, otherwise `profile=general`
9. If the layout intent supplies a template, use it as `template=...`; otherwise choose `rows`, `columns`, or `grid` naturally
10. Prioritize fitting into a single readable page: compress wording before increasing content-unit count
11. If the problem statement must remain complete, keep the key conditions, data, code, and asks readable
12. Only output `\image[source=...]` when Available Images / Visual Slots provides an image ID
