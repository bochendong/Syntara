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
8. 必须设置 `layoutFamily`、`density`、`visualRole`、`overflowPolicy`；如果版式意图里给了值，以版式意图为准
9. 优先保证单页可读：先压缩表述，再考虑增加块数量
10. 控制块密度（尤其 `layout_cards`、`process_flow`、`table`），避免把长段落直接塞进单个单元或步骤
11. 如果 `preserveFullProblemStatement=true`，题干必须完整清楚；不要为了压缩删掉关键条件、数据、代码或所求
12. 只有在 Available Images / Visual Slots 提供了图片 ID 时，才可以输出 `visualSlot` 或 `visual` block
