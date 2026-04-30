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
10. `two_column` 必须使用 `columns` / `column` 环境；不要用 `block title=left/right` 代替分栏
11. 文本内公式优先写成 `$f(x)=x^2$`；不要写成 `\\(f(x)=x^2\\)`，也不要把普通连接词写成 `\text{且}`
12. LaTeX/Syntara 命令只写一个反斜杠，例如 `\forall`，不要写 `\\forall`
13. 优先保证单页可读：先压缩表述，再考虑增加块数量
14. 如果题干必须完整，保留关键条件、数据、代码和问题要求
15. 只有 Available Images / Visual Slots 提供图片 ID 时，才输出 `\image[source=...]`
16. 数学标题、逆元、倒数、同余类必须写完整：如 `$\mathbb{Z}_{41}$`、`$22^{-1}$`、`$a\equiv b\pmod n$`；不要输出空公式 `$$` 或 `$^{-1}$`
17. `\formula{...}` 和 `derivation` 的第二个 `\step` 参数只能放纯 LaTeX；不要把 `\formula{}`、`$...$`、中文讲解或 `\text{且}` 放进去
18. 同余一律写 `\pmod{n}`，整除一律写 `\mid` / `\nmid`，省略号一律写在数学模式中；不要生成 `\pmod n`、`±od`、裸 `4^n`、裸 `\dots`
