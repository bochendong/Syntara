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
10. `two_column` must use `columns` / `column` environments; do not use `block title=left/right` as fake columns
11. Prefer `$f(x)=x^2$` for inline math inside prose; do not write `\\(f(x)=x^2\\)`, and do not put ordinary connecting words inside `\text{...}`
12. Write LaTeX/Syntara commands with one backslash, for example `\forall`, not `\\forall`
13. Prioritize fitting into a single readable page: compress wording before increasing content-unit count
14. If the problem statement must remain complete, keep the key conditions, data, code, and asks readable
15. Only output `\image[source=...]` when Available Images / Visual Slots provides an image ID
16. Math in titles, inverses, reciprocals, and congruence classes must be complete: use `$\mathbb{Z}_{41}$`, `$22^{-1}$`, `$a\equiv b\pmod n$`; never output empty `$$` or `$^{-1}$`
17. `\formula{...}` and the second `\step` argument in `derivation` must contain pure LaTeX only; do not put nested `\formula{}`, `$...$`, prose, or connector words such as `\text{and}` inside them
18. Congruences must use `\pmod{n}`, divisibility must use `\mid` / `\nmid`, and ellipses must stay inside math mode; never generate `\pmod n`, `±od`, raw `4^n`, or raw `\dots`
