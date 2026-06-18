# 文本笔记本生成规范

这份文档总结 OpenMAIC 里“文本笔记本”应该怎么生成、怎么写、怎么导入、怎么验收。它面向课程维护和内容生成工作流，不是学生会看到的笔记内容。

## 1. 文本笔记本的定位

文本笔记本不是资料摘抄，也不是按页面分页的提纲。它应该是一份学生可以直接阅读、跟着学习的中文课程讲义。

在 OpenMAIC 里，纯文本笔记本的核心结构是：

- `Notebook.notebookKind = 'markdown'`
- `Notebook.sectionCount` 记录 Markdown section 数量
- `MarkdownNotebookSection` 存储学生可见的正文
- 纯文本笔记本不依赖 slide scene；如果是混合笔记本，Markdown 只补充图片页，不替代图片页

一份普通章节通常应该拆成 8-12 个 section。短章节可以更少，长章节应该继续拆分，或者拆成多个 notebook。

## 2. 先定目标，再写内容

开始生成前，必须先确认：

- 要写入的 course id 和 notebook id
- 学生看到的标题、章节顺序、语言
- 这章必须覆盖的概念、例子和常见误区
- 是否是纯文本笔记本，还是图片笔记本附带 Markdown sections
- 是否需要保留已有图片、scene、narration、cover image

不要只根据一个标题直接开写。先把章节边界和教学顺序定清楚，再写正文。

## 3. 源材料只用于理解

源材料可以来自课程网页、PDF、已有 outline、旧版 notebook、课堂代码或用户补充说明。使用源材料时要遵守一个原则：

源材料只用于分析，不直接发布。

最终笔记必须改写成学生可读的中文讲义。不要把来源说明、页码、版权页、教师备注、制作流程、网页原句、OCR 碎片写进学生可见内容。也不要在正文里写“根据原文”“参考原文”“官方 notes 说”这类话；学生只需要看到完成后的课程内容。

来源信息如果需要保留，应放在 `sourceMeta`、维护脚本注释或完成报告里。

## 4. 一个 section 应该是一个教学动作

好的 section 不是一个浅标题加两句话，而是一个清楚的教学动作。每个 section 至少应该包含：

- `title`：直接点出本节要学的概念或问题
- `summary`：一句话说明学生读完会掌握什么
- `markdown`：完整解释、例子、推导、代码、图示说明或常见错误

section 标题要具体，少用“简介”“总结”“补充”这种空标题。正文要让学生知道为什么这样做，而不只是背定义。

推荐 section 类型包括：

- 概念入口：这章解决什么问题
- 定义与术语：把核心词说清楚
- 规则与设计配方：给出可执行的步骤
- 代码示例：展示语法和行为
- 执行追踪：解释 call stack、memory model、递归展开等过程
- 常见错误：展示错法和改法
- 对比辨析：例如 aliasing vs copy、mutation vs reassignment、Big-O vs Big-Theta

除非用户明确要求，不要把大量篇幅交给“练习与自测”。先把知识讲完整。

## 5. 内容必须有例子

文本笔记本最容易失败的地方，是写成“概念清单”。每个章节都应该尽量保留和扩展例子。

一个好的 worked example 通常包含：

1. 问题或代码片段
2. 当前状态或输入
3. 每一步发生了什么
4. 最终结果
5. 一个容易错的点

例如 CSC148 这类课程，下面这些主题不应该只用定义带过：

- memory model：变量保存 id，id 对应对象；mutation 改对象，reassignment 换引用
- shallow copy 与 deep copy：外层容器是否新建，内层对象是否共享
- function call stack：每次函数调用创建新的 frame，返回时 frame 消失
- unit test：正常案例、边界案例、异常案例、fixture/setup
- representation invariant：对象内部状态必须持续满足的规则
- inheritance：override、`super()`、多态、`isinstance`
- linked list：node 的 `item`/`next` 关系和 relink 操作
- recursion：base case、recursive step、递归调用栈
- BST/tree：路径选择、结构不变量、遍历顺序
- exceptions：raise、try/except、错误传播
- running time：Big-O、Big-Omega、Big-Theta 的含义和区别

如果用户指出漏了某个知识点，后续更新必须把它写进合适章节，而不是只在完成报告里承认。

## 6. Python 和数学 Markdown 写法

代码应该使用 fenced code block：

~~~markdown
```python
def count_even(values: list[int]) -> int:
    """Return the number of even integers in values."""
    return sum(1 for value in values if value % 2 == 0)
```
~~~

如果是在 JavaScript 维护脚本的 template literal 里写 Markdown，推荐用 `~~~python` 作为代码围栏，避免三反引号和模板字符串互相干扰。

数学公式使用 `$...$` 或 `$$...$$`。不要留下破碎 OCR 公式、孤立的 `*`、孤立的 `-`、误缩进造成的大块代码框。

需要在脚本里写反引号时，使用 `m``...`` 这类 helper，或显式转义，避免 Markdown 和 JavaScript 字符串互相破坏。

## 7. 类型标注、契约和难例子

涉及 Python type annotations 或 contracts 时，不要只写 `list[int]` 这种最简单例子。应该覆盖一些学生容易卡住的类型：

~~~python
from collections.abc import Callable, Iterable

def group_by_length(words: Iterable[str]) -> dict[int, list[str]]:
    ...

def first_match(values: list[int], pred: Callable[[int], bool]) -> int | None:
    ...

def merge_counts(left: dict[str, int], right: dict[str, int]) -> dict[str, int]:
    ...

def transpose(matrix: list[list[float]]) -> list[list[float]]:
    ...
~~~

讲 preconditions 时，也要给出“函数不负责处理什么”的例子：

~~~python
def average(values: list[float]) -> float:
    """Return the average of values.

    Preconditions:
        - values != []
    """
    return sum(values) / len(values)
~~~

解释时要明确：precondition 是调用者必须保证的条件；函数体可以依赖它，不一定要重复防御。

## 8. 什么时候需要图片

文本笔记本可以是 Markdown 为主，但有些概念必须配图才讲得清楚：

- memory model
- call stack
- linked list relink
- recursion trace
- tree/BST structure
- inheritance hierarchy
- algorithm running-time comparison

图必须和正文代码严格一致。比如代码是：

~~~python
x = [1, 2, 3]
z = x
z[0] = -999
~~~

那么图里应该表现为 `x` 和 `z` 的变量格保存同一个 id，这个 id 对应的 list 对象从 `[1, 2, 3]` 变成 `[-999, 2, 3]`。不要画成背景装饰图，也不要画和代码状态对不上的图。

如果使用生成式图片，prompt 应该明确：

- 教学概念
- 代码状态
- 变量区和对象区的布局
- 哪些 id 相同，哪些 id 不同
- 哪个值被划掉，哪个值替换到哪里
- 文本语言和字体风格
- 禁止出现多余变量、错误箭头、错误标题

如果生成图反复不稳定，应改用可控 SVG、HTML canvas、Mermaid 或手工绘制资产。

## 9. 导入和持久化规范

推荐使用 idempotent maintenance script，而不是手动在数据库里改。

脚本应该支持：

- 默认 dry-run，不写数据库
- `--write` 才执行写入
- `--only=02,03` 这种局部重写
- 从 `.env` 和 `.env.local` 加载环境变量
- 打印 notebook id、section count、section titles
- 写入 `sourceMeta`，但不把来源说明写进学生正文
- 写入后递增 `contentVersion`

纯文本笔记本应该写入：

- `Notebook.notebookKind = 'markdown'`
- `MarkdownNotebookSection`
- 正确的 `sectionCount`
- `sceneCount = 0`，除非当前项目兼容层仍需要额外字段

混合图片笔记本更新 Markdown 时，不要删除已有 scene、speech data、cover image 或 generated assets。

## 10. 写入前后的质量门槛

写入前至少检查：

- section 数量符合计划
- 每章有足够例子，普通章节默认至少 3-4 个 worked examples
- 学生正文没有来源说明、制作说明、教师私有说明
- 没有 OCR 残片、孤立 Markdown 符号、意外代码块
- 代码和图一致
- 用户点名的知识点都出现了

写入后至少检查：

- 数据库读回的 notebook id、section count、contentVersion 正确
- 课程页面能看到更新后的 notebook
- Markdown reader 能正常渲染代码、公式、图片
- sidebar 和 section 视觉层级足够清楚
- 如果更新 UI，滚动时左侧导航状态应跟随右侧当前 section

常用审计模式：

~~~js
if (/原文|参考原文|根据原文|official notes|source notes/i.test(markdown)) {
  fail('student-visible source reference');
}

if (/^\s*[*-]\s*$/m.test(markdown)) {
  fail('orphan list marker');
}

if (/\n {4,}\S/.test(markdown)) {
  fail('unexpected indented code-like line');
}

if (/Disclaimer|not for sale|page \d+ of \d+/i.test(markdown)) {
  fail('source boilerplate');
}
~~~

## 11. OpenMAIC 实操清单

生成前：

- 确认 course id 和 notebook id
- 确认章节顺序和 notebook 标题
- 列出 must-cover concepts
- 查清是否已有图片/scene 需要保留
- 明确中文学生正文风格

撰写中：

- 每个 section 都有明确教学动作
- 代码、例子、解释、常见错误成组出现
- 不把来源说明写进正文
- 不用空泛总结替代讲解
- 图像状态和代码状态一一对应

写入后：

- dry-run 输出合理
- `--write` 成功
- 数据库读回验证
- 必要时跑 Prettier/ESLint/TypeScript targeted check
- 在课程页面人工检查阅读体验

## 12. 反例

下面这些都应该重写：

- 每节只有两三句话，像概念索引
- 标题很多，但没有代码和例子
- 把源材料顺序机械搬进 notebook
- 在学生正文里解释“本节参考某网页”
- 图片看起来漂亮，但和代码执行状态不一致
- 图像只是背景装饰，没有教学信息
- 漏掉用户点名的知识点，比如 deep copy、shallow copy、`isinstance`
- UI 上 section 之间看不出层级，sidebar 不跟随滚动

## 13. 完成报告模板

完成一次文本笔记本生成后，报告应包含：

- 更新了哪些 course/notebook
- 每个 notebook 的 section count
- 是否保留了已有 scene 或 image assets
- 写入脚本和参数
- 数据库读回结果
- 运行过的格式化、lint、类型检查或页面验证
- 仍需人工确认的少量风险

报告要短，但必须让维护者知道“内容写进哪里、验证到哪里、还有什么没确认”。
