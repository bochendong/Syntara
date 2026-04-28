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

为这一页生成 Syntara Markup。

Important:

1. 只输出 Syntara Markup；不要输出 JSON
2. 不要用 markdown code fence 包裹输出
3. 必须以 `\begin{slide}[title={...}, profile=...]` 开始，以 `\end{slide}` 结束
4. 不要输出坐标、HTML、PPT 元素，或名为 `slots` / `blocks` 的 JSON 字段
5. 不要输出 KaTeX HTML；公式必须保留为 `\formula{...}` 或数学定界符中的普通 LaTeX
6. 每个命令、环境标题、bullet 和文本单元都必须完全使用 `{{language}}`
7. 如果场景包含公式、讲题、矩阵运算、代码或表格，优先使用 `\formula`、`derivation`、`\code` 或 `\table`
8. 矩阵 / 证明 / 推导页设置 slide `profile=math`，代码页设置 `profile=code`，其他为 `profile=general`
9. 如果版式意图给出了模板，用 `template=...`；否则自然选择 `rows`、`columns` 或 `grid`
10. 优先保证单页可读：先压缩表述，再考虑增加块数量
11. 如果题干必须完整，保留关键条件、数据、代码和问题要求
12. 只有 Available Images / Visual Slots 提供图片 ID 时，才输出 `\image[source=...]`
