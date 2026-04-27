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
4. Every generated block, heading, title, bullet, and paragraph must be entirely in `{{language}}`
5. If the scene contains formulas, worked examples, matrix operations, code, or tables, use the corresponding structured blocks instead of plain paragraphs whenever possible
6. Set `profile` to `math` for matrix / proof / derivation-heavy slides, `code` for programming walkthroughs, otherwise `general`
7. Set `layoutFamily`, `layoutTemplate`, `density`, `visualRole`, and `overflowPolicy`; if the layout intent supplies a value, follow it
8. If `preserveFullProblemStatement=true`, keep the problem readable and complete; do not remove key conditions, data, code, or asks just to compress
9. Only output `visualSlot` or a `visual` block when Available Images / Visual Slots provides an image ID
