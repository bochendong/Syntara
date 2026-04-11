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
4. Every generated block, heading, title, bullet, and paragraph must be entirely in `{{language}}`
5. If the scene contains formulas, worked examples, matrix operations, code, or tables, use the corresponding structured blocks instead of plain paragraphs whenever possible
6. Set `profile` to `math` for matrix / proof / derivation-heavy slides, `code` for programming walkthroughs, otherwise `general`
