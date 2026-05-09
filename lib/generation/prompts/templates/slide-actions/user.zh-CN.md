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
3. 生成 3-6 段有信息量的 speech；每段最好配一个相关 spotlight。
4. 如果 spotlight 某个语义 block，用输入中对应的 block id。
5. 讲解稿要先进入具体对象/题目/状态，再给判断方法。

输出格式示例：

[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"讲解内容"}]
