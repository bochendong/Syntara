# Notebook Creation Guide

这份文档给负责生成课程 notebook 的 AI 使用。目标不是做一组漂亮图片，而是创建一套能上课、能播放、能检查的教学 notebook。

## 一句话标准

合格的 notebook 应该像一位老师认真备过课后画出的课堂板书：有主线、有引入、有例题推导、有讲解动作、有总结和下节课钩子。

## 最终交付物

每个 notebook 至少应该包含：

- `slide-01.png`, `slide-02.png`, ...：每页一张完整的整页生图。
- `semantic-hit-map.json`：每页父级教学区域的语义坐标。
- 数据库里的 `notebook` 和 `scene`：每页 scene 包含整页 image、透明 hotspot、spotlight/speech actions。
- `contact-sheet.png`：用于快速视觉检查整套 notebook。
- 生成脚本：能重新复制/整理图片、生成 hit map、写入 scenes。

## 不能做什么

- 不要用 SVG 模板冒充 slide。
- 不要用程序画出来的信息卡片冒充生图。
- 不要用 HTML 截图当 slide。
- 不要把文字、公式和图形机械排成 PNG。
- 不要只做单张图的堆叠。
- 不要把封面当成 introduction。
- 不要只给结论，不讲学生为什么需要这个方法。

## 图片生成要求

每一页都应该是真正用生图能力生成的整页课堂图。

推荐风格：

- 网格纸或轻微纸张纹理。
- 手写感标题、公式和标注。
- 清楚分区，例如左图、右公式、例题步骤、总结框。
- 颜色好看但克制，颜色服务教学重点。
- 图像有教学意图，不只是装饰。

所有 notebook 生图页都不要显示：

- week 几 / Week 几 / W1 / W2 这类周次信息。
- 页码、page number、PDF 页码、slide number。
- 课号或课程编号，例如 `CPSC 107`、`MAT136`、`MAT102`。课程信息由产品 UI 承载，图片里不要重复写。

生成节奏：

- 一批最好 4 页左右。
- 每批生成后先检查公式、文字、视觉节奏，再继续下一批。
- 数学页宁可少生成、反复检查，也不要一次生成很多页后才发现公式错。

## 课程结构

一套完整 notebook 通常按这个顺序组织：

1. 封面 / Overview  
   只给路线图，让学生知道今天会经过哪些站点。不要在封面讲公式细节。

2. Introduction Hook  
   说明为什么要学这个工具。常见方式是展示旧方法在哪里卡住。

3. Problem Framing  
   把今天要解决的问题说清楚：难点是什么，新方法想改变什么。

4. Method / Formula  
   正式介绍公式、规则或方法。

5. First Use  
   用一个短例子说明公式怎么放进去。这里重点是“怎么用”，不是炫技。

6. Why It Works / Proof  
   解释公式来源。比如分部积分要从乘积法则来，FTC 要说明累积量和导数的关系。

7. Choice / Strategy  
   讲怎么选择方法。比如分部积分里怎么选 `u` 和 `dv`，逆换元里怎么匹配根号形状。

8. Worked Examples  
   多个例题，由浅入深。标准题、易错题、多步题都要有。

9. Summary + Next Hook  
   总结方法、常见错误，并留下下节课的自然问题。

这个顺序不是死模板，但每一页都必须让下一页更自然。

## Introduction 的要求

很多课程需要额外加 1 到 2 张 introduction slides。

Introduction 要回答：

- 学生已有方法是什么？
- 这个方法在哪里不够？
- 新工具解决了什么痛点？
- 今天先提出什么问题，但暂时不完整展开？

例子：

- 逆换元法：先说明普通换元为什么不能轻松处理 `sqrt(a^2 - x^2)` 这类根号，再引出三角恒等式。
- 分部积分：先说明换元法适合“内层函数 + 内层导数”，但 `x e^x`、`x cos x`、`ln x` 这类题更像乘积问题。
- 定积分：先说明面积估算如何从有限矩形逼近到极限，再正式给定积分符号。

## 例题讲解规范

例题必须像上课一样讲，不要跳步。

每个例题至少要交代：

- 先识别题型。
- 写出关键对象。
- 解释为什么这样选。
- 代入公式或定义。
- 化简中间步骤。
- 最后写答案。
- 指出一个常见错误。

Riemann sum 转定积分必须明确：

- `Delta x` 是什么。
- `x_i` 或 `x_i^*` 是什么。
- 区间怎么从和式里读出来。
- 函数 `f(x)` 怎么识别。
- 最后才写出积分。

分部积分必须明确：

- `u` 是什么。
- `dv` 是什么。
- `du` 是什么。
- `v` 是什么。
- 如何代入 `int u dv = uv - int v du`。
- 剩下的积分为什么更简单。
- 最终答案和 `+ C`。

## CS / 代码课特殊规范

CS 科目的 notebook 仍然必须是整页生图，不允许用 SVG、HTML、程序排版截图或模板卡片冒充。区别在于：CS 页既要讲概念，也要教代码；代码通常更长，所以必须先拆教学动作，再决定一页能承载多少代码。

### 代码页的核心原则

- 一页只教一个代码动作，例如：
  - 读数据定义里的一个字段类型。
  - 从 template 里看出一个 helper call。
  - 写 outer function 的一行 delegation。
  - 解释一个 `cond` 分支。
  - trace 一步递归调用。
- 如果一页同时需要展示数据定义、template、真实函数、trace，必须拆成 2 到 4 页。
- 不要为了保持页数少，把完整长代码塞进一页。学生读不清，就等于没教。
- 代码页要有“讲解区”或“trace 区”，不能只有代码框。
- 每页底部 takeaway 要说清楚这页学到的代码判断，而不是重复标题。

### 长代码分页规则

长代码应该按教学用途切开：

1. Data shape page  
   只展示数据定义和字段类型。目标是让学生知道“这个数据长什么样”。

2. Template page  
   只展示由数据定义推出的 template。目标是说明 helper / recursion 从哪里来。

3. Function body page  
   只展示把 template hole 替换成真实表达式的那一段代码。

4. Trace page  
   只展示一个具体调用如何经过这些 helper 或 recursive calls。

例如 `package-required-dims` 不应该一页讲完。更好的拆法是：

- 先讲 `Package` 只有 `contents : Gift`。
- 再讲 template 里为什么 `fn-for-package` 调 `fn-for-gift`。
- 再讲真实 outer function 为什么只写 `(gift-required-dims (package-contents p))`。
- 再单独讲 `gift-required-dims` 的 `ball?` / `block?` 两个分支。
- 最后 trace 一个 block 例子和一个 ball 例子。

### 代码正确性和课程边界

CS 页比数学页更容易出现“看起来合理但课程没学过”的语法。生成前必须列出本节课允许出现的语法白名单，并在 prompt 和 QA 中强制执行。

以 CPSC 107 Racket 初学阶段为例，若 PDF 没有引入，则不要出现：

- `let`
- `local`
- `lambda`
- `map`
- `filter`
- `foldr` / `foldl`
- `match`
- `begin` / block-style sequencing
- `for`
- 高阶函数或内部命名函数

如果源 PDF 只使用 `define`、`define-struct`、`cond`、`if`、`empty?`、`false?`、`cons`、`first`、`rest`、`list`、`append`、selector、predicate、constructor 和基础算术比较，那么生成页也只能使用这些写法。

不要引入“更优雅”的代码。对初学 CS 课来说，正确的 notebook 不是展示专家会怎么写，而是展示这节课的学生应该怎么想、怎么读、怎么一步步写。

### image generation 和代码文本的关系

每一页最终必须是 image generation 生成的完整教学页。可以在 prompt 里提供短代码片段或要求代码框，但必须满足：

- 代码片段要短，最好不超过 6 到 8 行；超过就拆页。
- 每页只出现必要代码，不把整题所有代码塞进去。
- 代码必须来自源材料或由源材料直接推出。
- prompt 必须明确“不要发明额外 Racket 语法”。
- 生成后要人工检查文字和代码。如果代码错、语法超纲或读不清，重生该页，不要用后期 SVG 覆盖来掩盖。

允许使用脚本做的事情：

- 复制和整理 imagegen 产物。
- 统一裁切或 letterbox 到 `1600x900`，但不能裁掉内容。
- 生成 `semantic-hit-map.json`。
- 创建透明 hotspot、speech actions 和 contact sheet。
- 写入数据库 scenes。

不允许使用脚本做的事情：

- 用 SVG 重新画整页。
- 用 HTML/CSS 截图当整页图。
- 用程序排版代码框、图示、takeaway 来冒充 image generation。
- 把一张空背景图加上程序文字后当作“生图页”。

### CS 例题讲解规范

每个代码例题至少要交代：

- 输入数据的形状是什么。
- 当前函数负责哪个数据定义。
- 这行代码来自哪个字段、哪个 case 或哪个 template hole。
- helper call 是因为 `ref`，recursive call 是因为 `self-ref`。
- base case 为什么返回这个值。
- recursive case 为什么让问题变小。
- trace 至少走一个具体输入。
- 指出一个学生会犯的错误，例如把 `rest` 当成单个元素、把 helper 写进错误的数据层、或使用尚未学过的语法。

对于树和 mutual recursion：

- 先画数据关系图，再写函数。
- `Node` helper 和 `ListOfNode` helper 分页讲。
- `first` 的 helper 和 `rest` 的递归 helper 要分清楚。
- 如果一个 child subtree 返回的是 list，就解释为什么要用 `append`，不要跳到 `filter` 或 `map`。

对于递归入门页：

- 不要一上来就直接进入复杂数据定义。可以先用学生熟悉的数学递推例子建立直觉。
- 推荐顺序是：
  1. 阶乘：先写只有递推关系、没有 base case 的版本，让学生判断会不会停。
  2. 阶乘：加入 `n = 0` 或 `n = 1` 的 base case，说明递归必须有停点。
  3. 斐波那契：展示一个 base case 不一定够，因为 `fib(1)` 会继续拆到 `fib(0)` 和 `fib(-1)` 之类的无效方向。
  4. 斐波那契：加入两个 base cases，再说明每次把问题拆成更小问题。
  5. 回到数据递归：list 的 `empty` 就是 base case，`rest` 就是更小的问题。
- 这类页的目标不是讲数学公式本身，而是让学生形成递归核心判断：recurrence relation + enough base cases + smaller subproblem。

### CS 页 QA 清单

除通用 QA 外，CS notebook 交付前还要检查：

- 每页都是整页 imagegen 图，不是 SVG/HTML/程序排版图。
- 代码没有横向溢出、没有被裁切、没有小到读不清。
- 长代码已经拆页，不靠一页强塞。
- 没有出现本节课没学过的语法。
- 每个 helper 都说明了“为什么需要”，而不是只展示最终代码。
- 每个 recursive call 都说明了“问题如何变小”。
- trace 页和函数页分开，除非代码非常短。
- contact sheet 里能看出知识点递进，而不是一组孤立代码截图。

## 公式正确性

公式错了，图再好看也不能用。

重点检查：

- 上下限。
- 下标。
- `Delta x`。
- 采样点。
- `dx`。
- 正负号。
- 常数 `+ C`。
- FTC 的 `F(b) - F(a)` 顺序。
- 换元后变量和上下限是否一致。
- 分部积分里的 `u, dv, du, v` 是否对应。

## 讲解稿和动作

slide 是图，但 notebook 还需要动作和讲解稿。

讲解稿要求：

- 像老师上课，不是念图片上的字。
- 解释此刻为什么看这个区域。
- 说明这一步和下一步的关系。
- 指出学生容易错的地方。
- 每段 speech 对应一个明确的视觉区域。

动作顺序建议：

```text
spotlight: 当前父级区域
speech: 当前区域讲解
spotlight: 下一个父级区域
speech: 下一个区域讲解
...
```

## 遮罩规范

遮罩不要抠太细。因为整页是图片，小区域很难稳定定位。

只选父组件级别的大区域：

- 左边图。
- 右边公式框。
- 例题三步区域。
- 总结框。
- 常见错误框。
- 课程路线区域。

不要选：

- 单个公式符号。
- 单个 bullet。
- 小箭头。
- 装饰图标。
- 一行很短的文字。

视觉效果必须是：

- 其他地方暗下去。
- 当前讲解区域保持正常显示。
- 不是只画亮边框。

推荐 `spotlight.dimOpacity` 在 `0.70` 到 `0.80` 之间。

## Scene 结构建议

每页 scene 的 canvas 应该包含：

- 一个铺满画布的 `image` element。
- 若干个透明 `shape` hotspot。
- `content.semanticHitMap` 保存这些 hotspot 对应的语义区域。
- `actions` 里按顺序放 `spotlight` 和 `speech`。

整页图片建议使用：

- 原图尺寸：`1600x900`。
- notebook canvas：`1000x562.5`。
- 坐标转换按比例缩放。

## QA 清单

交付前必须检查：

内容 QA：

- 有封面 overview。
- 有 introduction hook。
- 有清楚的主线推进。
- 有多个例题。
- 例题没有跳步。
- 公式和符号正确。
- 总结页有下节课钩子。

视觉 QA：

- 每页都是整页生图。
- 字能读。
- 公式清楚。
- 分区清楚。
- 不是模板感、截图感或自动排版感。
- contact sheet 看起来是一套统一课程。

动作 QA：

- 每页有 speech。
- speech 像老师讲课。
- spotlight 对应父级大区域。
- 其他区域会暗下去。
- 没有过细遮罩。

文件 QA：

- 所有 slide 图片存在。
- 所有 slide 都是 `1600x900`。
- `semantic-hit-map.json` 能解析。
- 每页 hit map 的 region 数量合理，通常 3 到 6 个。
- 数据库 scenes 数量和图片数量一致。
- 每个 spotlight 都能找到对应 element。

## 不通过时怎么处理

- 数学错：重生或重画该页，不要靠讲解稿补。
- 引入弱：加 1 到 2 页 hook/framing。
- 例题跳步：重写该页的图和 speech。
- 遮罩太细：改成父级区域。
- 看起来像模板：重新生成整页课堂图。
- 课程像散页：重排 lesson arc，再生成。

## 给生成 AI 的最短提示

```text
Create an OpenMAIC teaching notebook, not a slide collage.
Use full-page image-generated classroom-board slides.
Start with overview, then introduction hook, problem framing, method, examples, summary, and next hook.
Every worked example must show student-facing reasoning and no skipped steps.
Every slide needs broad parent-level semantic regions for spotlight masks and teacher-like speech actions.
Do not use SVG, HTML screenshots, programmatic templates, or text-box PNG layouts.
Math must be correct and readable.
```
