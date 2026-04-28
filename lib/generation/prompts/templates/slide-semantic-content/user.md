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
5. Every generated command, environment title, bullet, and text unit must be entirely in `{{language}}`
6. If the scene contains formulas, worked examples, matrix operations, code, or tables, use `\formula`, `derivation`, `\code`, or `\table` instead of plain paragraphs whenever possible
7. Set slide `profile=math` for matrix / proof / derivation-heavy slides, `profile=code` for programming walkthroughs, otherwise `profile=general`
8. If the layout intent supplies a template, use it as `template=...`; otherwise choose `rows`, `columns`, or `grid` naturally
9. If the problem statement must remain complete, keep the key conditions, data, code, and asks readable
10. Only output `\image[source=...]` when Available Images / Visual Slots provides an image ID
