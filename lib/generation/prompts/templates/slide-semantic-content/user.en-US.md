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

Generate the semantic teaching content document for exactly one slide.

Important:

1. Output pure JSON only
2. Do not wrap the JSON in markdown code fences
3. Do not output slide coordinates, HTML, or PPT elements
4. Do not output KaTeX HTML (for example `<span class="katex">...</span>`); keep formulas as plain LaTeX text in semantic fields
5. Every generated block, heading, title, bullet, and paragraph must be entirely in `{{language}}`
6. If the scene contains formulas, worked examples, matrix operations, code, or tables, use the corresponding structured blocks instead of plain paragraphs whenever possible
7. Set `profile` to `math` for matrix / proof / derivation-heavy slides, `code` for programming walkthroughs, otherwise `general`
8. Set `layoutFamily`, `layoutTemplate`, `density`, `visualRole`, and `overflowPolicy`; if the layout intent supplies a value, follow it
9. Prioritize fitting into a single readable page: compress wording before increasing block count
10. Keep block density compact (especially `layout_cards`, `process_flow`, `table`) and avoid long paragraph-style cells or step descriptions
11. If `preserveFullProblemStatement=true`, keep the problem readable and complete; do not remove key conditions, data, code, or asks just to compress
12. Only output `visualSlot` or a `visual` block when Available Images / Visual Slots provides an image ID
