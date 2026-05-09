# Scene Brief

- Title: {{title}}
- Description: {{description}}
- Scene Language: {{language}}
- Key Points:
  {{keyPoints}}

{{contentProfileContext}}
{{archetypeContext}}
{{layoutIntentContext}}
{{deckContext}}
{{workedExampleContext}}
{{purposeGuidance}}
{{disciplineGuidance}}

## Available Images / Visual Slots

{{assignedImages}}

{{teacherContext}}
{{coursePersonalization}}
{{rewriteContext}}

## Output Task

为这一页生成 Syntara Markup。请先用 PagePlan 判断“这一页要完成的教学任务”，再选择语义结构；不要只把 key points 改写成段落。

生成时请确保：

1. 只输出 Syntara Markup，不输出 JSON、HTML、坐标或 markdown fence。
2. 以 `\begin{slide}[title={...}, profile=..., language={{language}}]` 开始，以 `\end{slide}` 结束。
3. 学生可见文本使用 `{{language}}`，代码标识符可保留原文。
4. 使用输入提供的具体事实、代码、题目、数据和 PagePlan，不自行换题。
5. 如果 Deck Memory 给出共享例子或前后页交接，本页里的简称必须按那里解释；不要把同一个例子重写成另一个语境。
6. 数学、代码、表格、流程或状态模型用对应语义组件表达。
7. 如果 layout intent 给出 classic `layoutTemplate`，按该模板的 renderer 输入结构组织语义块，例如 `pipeline_table` 必须同时有短引入、process 和 table；`comparison_matrix` 必须以 table 为主体；`process_steps` 必须以 process 为主体。
8. 如果这是重试，优先修复 rewrite context 指出的具体问题。
9. PagePlan 的具体入口必须进入学生可见文本；不要只写抽象方法。
10. 不要把结构命令名或组件名写进卡片、步骤、表格单元格、callout 正文等学生可见字符串里。
