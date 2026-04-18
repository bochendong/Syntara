# Generation Requirements

## Scene Information

- **Title**: {{title}}
- **Description**: {{description}}
- **Scene Language**: {{language}}
- **Key Points**:
  {{keyPoints}}

{{contentProfileContext}}
{{archetypeContext}}
{{workedExampleContext}}
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
8. Prioritize fitting into a single readable page: compress wording before increasing block count
9. Keep block density compact (especially `layout_cards`, `process_flow`, `table`) and avoid long paragraph-style cells or step descriptions
