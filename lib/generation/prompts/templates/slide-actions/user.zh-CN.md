# Page Inputs

Title: {{title}}
Scene Language: {{language}}
Description: {{description}}
Key Points:
{{keyPoints}}

{{teachingContext}}
{{workedExampleContext}}
{{courseContext}}
{{agents}}
{{userProfile}}

## Focus Targets / Elements

{{elements}}

## Output Task

生成这一页的播放动作和讲解稿。用 PagePlan 和当前页面语义内容决定讲解，而不是只复述 key points。

要求：

1. 只输出 JSON array，不要解释文字或 markdown fence。
2. 每段 speech 必须完全使用 `{{language}}`；源码中的类名、函数名、变量名可以保留原文。
3. 按 Narration policy 的密度生成；如果没有 policy，正文页通常生成 6-10 段有信息量的 speech，复杂代码、证明、推导页要更慢一点。
4. 如果这一段讲解对应某个具体可见区域，用输入中对应的 id 填 `focusTargetId`；如果只是过渡、总览、追问、总结，或者原本想讲的组件没有出现在 Focus Targets / Elements 里，就不要填。
5. 不要输出单独的 spotlight / laser action；只输出 speech 段，代码会根据 `focusTargetId` 编译聚焦动作。
6. 讲解稿要先进入具体对象/题目/状态，再给判断方法；不要写“让学生明白”“学生需要”这类站在教案外面的句子。

输出格式示例：

[{"type":"speech","focusTargetId":"text_xxx","content":"讲解内容"},{"type":"speech","content":"过渡或总结内容，不需要聚焦"}]
