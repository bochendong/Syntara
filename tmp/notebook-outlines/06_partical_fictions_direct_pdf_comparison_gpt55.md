# 06_Partical_fictions.pdf direct PDF vs pre-extracted comparison (gpt-5.5)

生成时间：2026-05-25T05:46:29.196Z
耗时：140s
Direct PDF：Responses API input_file file_id=file-6sHVC8f8euFDjPrpe8cREy
PDF：1673802 bytes, 9 pages

## 结论

- Direct PDF 版更贴近源文件的视觉内容：它把含变上限/变下限积分的 FTC 题拆成了独立教学页，并读出了 `e^{x⁴}`、`e^{-x⁶}` 这类纯文本抽取里容易乱码的公式线索。
- 预提取版更稳定、更便宜、更容易并行：现有 batched planner 已完整生成 14 页、质量门通过；direct PDF 这次只跑了「整课蓝图 + 前两页详情」就用了约 32k tokens、140 秒。
- 最推荐的产品路线不是二选一，而是混合：继续保留预提取 `pdfText/pdfImages` 作为主链；对公式密集、PDF 抽取乱码、或 planner QA 发现公式可疑的页面，再调用 direct PDF 做 source-grounded repair / formula audit。
- 如果把 direct PDF 用在每个 2 页 batch 上，9 页 PDF 会被重复放进上下文很多次，成本会明显上升；更合理的是先 direct PDF 生成一次 source map，再让后续批次引用这个压缩 source map。

## Direct PDF Summary

- pageIndex 页数：15
- 第一页角色：hook
- 最后一页标题：本节课收束：四种判断动作
- 前两页详细规划数：2
- 前两页 focusRegions 数：5, 5
- blueprint usage：{"input_tokens":10776,"input_tokens_details":{"cached_tokens":0},"output_tokens":4675,"output_tokens_details":{"reasoning_tokens":1034},"total_tokens":15451}
- detail usage：{"input_tokens":12690,"input_tokens_details":{"cached_tokens":0},"output_tokens":4226,"output_tokens_details":{"reasoning_tokens":321},"total_tokens":16916}

## Direct PDF Titles

- 1. 只给斜率，能看见函数吗？
- 2. 微分方程的三种语言
- 3. 最基本情形：dy/dx 只含 x
- 4. 例 1：由 dy/dx = 2x 和 y(3)=5 求 y
- 5. 例 2：压力与体积的函数类型
- 6. 怎样判断一个函数是解？
- 7. 含变上限或变下限的积分怎么求导？
- 8. 例 3：选择 dy/dx = -2x e^{x⁴} 的解
- 9. 例 4：选择 dy/dx = -3x² e^{-x⁶} 的解
- 10. 斜率场：把 dy/dx 画成小线段
- 11. 例 5：三张斜率场配三条方程
- 12. 例 6：从斜率场认出 x² - y²
- 13. 例 7：金鱼模型、Euler 方法与低估
- 14. 常见误区：符号、上下限、斜率场
- 15. 本节课收束：四种判断动作

## Pre-extracted Reference Titles

- plannerMode：batched
- planBatchCount：7
- planQuality：{"passed":true,"minPageCount":12,"findings":[],"blockedPhrases":[],"retryCount":0}
- 1. 只知道“怎么变”，够不够知道“是多少”？
- 2. 什么是微分方程
- 3. 从 dy/dx 反推 y：先看只含 x 的情况
- 4. 例 1：dy/dx=2x, y(3)=5
- 5. 常数 C 为什么不能省
- 6. 例 2：压力与体积的函数类型
- 7. 不用算完积分，也能检查答案
- 8. 例 3：选择满足 dy/dx = -2x e^{x^2} 的积分表达式
- 9. 怎样读 slope field
- 10. 例 4：三条微分方程匹配三个斜率场
- 11. 例 5：从圆形与对角线特征识别方程
- 12. Euler method：沿着斜率场一步步走
- 13. 例 6：金鱼 Alle effect 与 Euler 高估低估
- 14. 总结：从变化率到函数，再到预测误差

## Direct Course Spine

```json
{
  "logline": "从“变化率”出发，用积分、初值、积分上下限、斜率场与欧拉法把微分方程翻译成可判断的函数行为。",
  "centralQuestion": "如果只给你 dy/dx，你怎样判断一个函数是不是答案，并预测解曲线会怎么走？",
  "acts": [
    {
      "id": "act-opening",
      "act": "opening",
      "title": "从变化率看函数",
      "purpose": "让学生意识到微分方程不是先给函数，而是先给函数的变化规则。",
      "pages": [
        1,
        2
      ],
      "keyQuestion": "只知道每一点的斜率，能不能恢复或判断函数？"
    },
    {
      "id": "act-integration",
      "act": "development",
      "title": "由 dy/dx 回到 y",
      "purpose": "建立最基本的解法：积分得到通解，再用初值定常数，并识别函数类型。",
      "pages": [
        3,
        4,
        5
      ],
      "keyQuestion": "什么时候直接积分就能得到解？初值在其中起什么作用？"
    },
    {
      "id": "act-checking",
      "act": "development",
      "title": "不用算出闭式，也能验证解",
      "purpose": "用微积分基本定理和链式法则判断含积分上下限的函数是否满足微分方程。",
      "pages": [
        6,
        7,
        8
      ],
      "keyQuestion": "含 ∫ 的选项怎样快速求导判断？"
    },
    {
      "id": "act-fields",
      "act": "practice",
      "title": "斜率场读图与配对",
      "purpose": "把公式中的正负、零斜率线、只依赖 x 或 y 的结构转化为图像判断。",
      "pages": [
        9,
        10,
        11
      ],
      "keyQuestion": "从一张小线段图里，怎样反推出可能的 dy/dx？"
    },
    {
      "id": "act-numerical",
      "act": "synthesis",
      "title": "欧拉法与误差方向",
      "purpose": "连接斜率场、凹凸性和数值近似的高估低估判断。",
      "pages": [
        12,
        13,
        14
      ],
      "keyQuestion": "用切线一步步走，为什么会偏高或偏低？"
    }
  ],
  "closingCallback": "最后回到 centralQuestion：判断解不一定要先求出完整函数，可以用求导、初值、斜率场结构与凹凸性逐层验证；下一节继续追问：当 dy/dx 同时含 x 和 y 时，哪些方程可以分离变量并真正求出 y？"
}
```

## Direct First Two Page Plans

```json
[
  {
    "pageNumber": 1,
    "outline": {
      "id": "page-1-slope-to-function-hook",
      "type": "slide",
      "contentProfile": "math",
      "archetype": "intro",
      "title": "只给斜率，能看见函数吗？",
      "description": "学生从“没有直接给 y，只给 dy/dx”开始，先把微分方程理解成函数的运动规则，而不是一个普通代数式。",
      "keyPoints": [
        "dy/dx 不是答案本身，而是在每个位置告诉我们函数该怎么变。",
        "同一个变化规则可以画成一片小线段：这就是斜率场的直觉来源。",
        "一条解曲线必须在经过每个点时顺着当地小线段的方向走。",
        "本课会做三件事：求 y、验 y、读斜率场。"
      ],
      "teachingObjective": "学生能说出微分方程给的是变化率规则，并能把“公式—斜率场—解曲线”三者连起来。",
      "studentThinkingMove": "先看左侧 dy/dx，问它告诉我们什么；再看中央每个点的小线段；最后看右侧曲线是否沿着这些小线段前进。",
      "continuity": {
        "previousHandoff": "从 Calculus I 里熟悉的导数概念出发：导数表示瞬时变化率。",
        "currentJob": "把“给函数”改成“给变化规则”，让学生接受微分方程的基本视角。",
        "nextHandoff": "下一页把这张图拆成三种语言：公式语言、几何语言、数值语言。"
      },
      "workedExampleConfig": {
        "kind": "general",
        "role": "walkthrough",
        "problemStatement": "如果只给出一个变化率规则，例如 dy/dx = 2x，而不是直接给 y，你能否判断曲线大概怎样走？",
        "givens": [
          "给定变化率：dy/dx = 2x",
          "没有一开始给出完整函数 y",
          "可以在不同 x 位置想象斜率大小与正负"
        ],
        "asks": [
          "这个规则告诉我们什么？",
          "曲线在 x<0、x=0、x>0 时大概怎样倾斜？",
          "为什么还需要一个初值才能确定唯一曲线？"
        ],
        "solutionPlan": [
          "先把 dy/dx 读成“每一点的斜率”。",
          "用 x 的正负判断斜率正负：x<0 时斜率负，x=0 时斜率 0，x>0 时斜率正。",
          "在斜率场中找一条顺着小线段走的曲线。",
          "指出没有初值时会有一族上下平移的曲线。"
        ],
        "walkthroughSteps": [
          "写下：dy/dx = 2x，说明右边只看 x。",
          "取三个位置：x=-1 时斜率 -2；x=0 时斜率 0；x=1 时斜率 2。",
          "在中央画三列小线段：左边向下倾，中间水平，右边向上倾。",
          "画一条 U 形趋势的解曲线，让曲线在每处贴合当地小线段。",
          "补一句：若再给 y(3)=5，就能锁定其中一条曲线。"
        ],
        "commonPitfalls": [
          "把 dy/dx 当成 y 本身。",
          "只看公式，不想斜率的正负和大小。",
          "忘记没有初值时通常不是唯一解。"
        ],
        "finalAnswer": "只给 dy/dx 时，我们看到的是函数的变化规则；要得到唯一函数，通常还需要初值。"
      }
    },
    "brief": {
      "pageRole": "hook",
      "title": "只给斜率，能看见函数吗？",
      "pageMove": {
        "fromPrevious": "从已学过的导数 meaning：斜率、变化率进入。",
        "currentJob": "用一张大图把 dy/dx、斜率场、解曲线连成一个视觉链条。",
        "toNext": "把这条链条整理成三种可互相翻译的语言。",
        "callbackToSpine": "回应核心问题的第一步：如果只给 dy/dx，我们先把它读成每点斜率。"
      },
      "visualBrief": "整页像课堂黑板：页面中央保留最大视觉区域，左侧写一个醒目的 dy/dx 框，箭头指向中央 5×5 小网格斜率场，再用箭头指向右侧一条顺着线段走的蓝色解曲线。上方用一句问题引入，下方列出本课三类任务。整体不要像目录，要像老师正在画图解释。",
      "visibleContent": {
        "mustShow": [
          "问题：只给 dy/dx，而不是给 y，我们知道了什么？",
          "dy/dx = 每一点的斜率 / 变化率",
          "斜率箭头图 → 解曲线 → 可能的公式",
          "今天三件事：① 求 y ② 验 y ③ 读斜率场"
        ],
        "formulas": [
          "\\frac{dy}{dx}=\\text{变化率}",
          "\\frac{dy}{dx}=2x",
          "y(3)=5 \\Rightarrow 只选中一条曲线"
        ],
        "exampleSteps": [
          "x<0：斜率为负，线段向右下倾",
          "x=0：斜率为 0，线段水平",
          "x>0：斜率为正，线段向右上倾",
          "解曲线必须顺着经过位置的小线段走"
        ],
        "commonPitfalls": [
          "dy/dx 不是 y",
          "没有初值时，常常是一族曲线"
        ],
        "bottomTakeaway": "微分方程先告诉我们“怎么变”，再由积分、初值或图像判断“是谁”。"
      },
      "focusRegions": [
        {
          "id": "focus-title-question",
          "label": "顶部提问区",
          "role": "opening",
          "left": 55,
          "top": 30,
          "width": 890,
          "height": 70,
          "order": 1
        },
        {
          "id": "focus-left-rate",
          "label": "左侧变化率公式",
          "role": "formula",
          "left": 65,
          "top": 140,
          "width": 220,
          "height": 170,
          "order": 2
        },
        {
          "id": "focus-center-slope-field",
          "label": "中央斜率场大图",
          "role": "visual",
          "left": 320,
          "top": 110,
          "width": 330,
          "height": 260,
          "order": 3
        },
        {
          "id": "focus-right-solution-curve",
          "label": "右侧解曲线",
          "role": "visual",
          "left": 690,
          "top": 135,
          "width": 240,
          "height": 220,
          "order": 4
        },
        {
          "id": "focus-three-tasks",
          "label": "底部三项任务",
          "role": "takeaway",
          "left": 95,
          "top": 405,
          "width": 810,
          "height": 115,
          "order": 5
        }
      ],
      "generationNotes": [
        "中央图必须最大，箭头从左到中再到右，体现视觉链条。",
        "斜率场只需示意，不要画得过密；让学生能看出左负、中平、右正。",
        "底部三件事用大号编号，像课堂板书收束。"
      ],
      "qaChecklist": [
        "是否清楚显示 dy/dx 不是 y？",
        "是否有“公式 → 斜率场 → 解曲线”的箭头关系？",
        "是否出现本课三种任务：求 y、验 y、读斜率场？"
      ]
    }
  },
  {
    "pageNumber": 2,
    "outline": {
      "id": "page-2-three-languages-map",
      "type": "slide",
      "contentProfile": "math",
      "archetype": "bridge",
      "title": "微分方程的三种语言",
      "description": "学生把上一页的视觉链条升级成一张学习地图：同一个 dy/dx 可以被写成公式、画成斜率场，也可以用 Euler 方法逐步近似。",
      "keyPoints": [
        "公式语言：dy/dx = f(x) 或 dy/dx = f(x,y)。",
        "几何语言：在点 (x,y) 处画斜率为 f(x,y) 的小线段。",
        "数值语言：用当前斜率走一小步，得到下一个近似点。",
        "三种语言互相检查：公式算斜率，图像看方向，表格追踪数值。"
      ],
      "teachingObjective": "学生能把一个微分方程分别读成公式规则、斜率场规则和 Euler 更新规则。",
      "studentThinkingMove": "先看左栏公式的右边依赖什么；再看中栏每个点如何变成一条小线段；最后看右栏如何用 slope 和 Δx 算下一步。",
      "continuity": {
        "previousHandoff": "上一页已经看到 dy/dx 可以生成一片斜率箭头，并引导解曲线。",
        "currentJob": "建立整节课的三栏地图，说明后面例题分别在训练哪一种翻译。",
        "nextHandoff": "下一页进入最容易求解的情形：当 dy/dx 只含 x 时，直接积分回到 y。"
      },
      "workedExampleConfig": {
        "kind": "math",
        "role": "walkthrough",
        "problemStatement": "把同一个微分方程 dy/dx = f(x,y) 翻译成三种语言：公式、图像、数值近似。",
        "givens": [
          "微分方程：dy/dx = f(x,y)",
          "某一点：(x_old, y_old)",
          "步长：Δx"
        ],
        "asks": [
          "公式告诉我们怎样得到 slope？",
          "斜率场怎样画？",
          "Euler 方法怎样更新 y？"
        ],
        "solutionPlan": [
          "公式栏：识别右边表达式 f(x,y)。",
          "图像栏：每个点 (x,y) 的小线段斜率等于 f(x,y)。",
          "数值栏：把当前 slope 乘以 Δx，加到旧的 y 上。",
          "强调这是同一件事的三种表达。"
        ],
        "walkthroughSteps": [
          "从公式开始：\\frac{dy}{dx}=f(x,y)。",
          "在点 (x_old,y_old) 计算 slope=f(x_old,y_old)。",
          "几何上，在该点画一条斜率为 slope 的短线段。",
          "数值上，使用 y_new=y_old+slope\\cdot\\Delta x。",
          "新的点为 (x_old+\\Delta x, y_new)。",
          "重复以上步骤，就得到一串近似点。"
        ],
        "commonPitfalls": [
          "把 f(x) 和 f(x,y) 混在一起：前者只随 x 变，后者还会随 y 变。",
          "Euler 方法用的是当前点的 slope，不是下一点的 slope。",
          "斜率场里的小线段不是解本身，而是解曲线的方向提示。"
        ],
        "finalAnswer": "微分方程可以在公式、图像和数值三种语言之间翻译；本课后面会反复使用这张地图。"
      }
    },
    "brief": {
      "pageRole": "overview",
      "title": "微分方程的三种语言",
      "pageMove": {
        "fromPrevious": "上一页用一个大图感受“斜率规则能引导曲线”。",
        "currentJob": "把感受整理成三栏：公式、几何、数值。",
        "toNext": "先从公式语言里最简单的 dy/dx=f(x) 开始，用积分求 y。",
        "callbackToSpine": "回应核心问题：判断函数行为时，不只会算，还要会看图和做近似。"
      },
      "visualBrief": "整页采用三栏板书结构。左栏标题“公式语言”，写 dy/dx=f(x) 与 dy/dx=f(x,y)，旁边标注“右边决定斜率”。中栏标题“几何语言”，画坐标网格和几条小线段，标出点 (x,y) 与 slope=f(x,y)。右栏标题“数值语言”，画一个小表格或阶梯箭头，展示 Euler 更新 y_new=y_old+slope·Δx。三栏之间用双向箭头连接，底部写一句总收束。",
      "visibleContent": {
        "mustShow": [
          "同一个 dy/dx，有三种读法",
          "公式语言：右边表达式决定 slope",
          "几何语言：每个点 (x,y) 上画一条小线段",
          "数值语言：Euler 方法一步步走"
        ],
        "formulas": [
          "\\frac{dy}{dx}=f(x)",
          "\\frac{dy}{dx}=f(x,y)",
          "\\text{slope}=f(x_{old},y_{old})",
          "y_{new}=y_{old}+\\text{slope}\\cdot\\Delta x"
        ],
        "exampleSteps": [
          "1. 选当前点 (x_old,y_old)",
          "2. 算 slope=f(x_old,y_old)",
          "3. 走一步：x_new=x_old+\\Delta x",
          "4. 更新：y_new=y_old+slope\\cdot\\Delta x"
        ],
        "commonPitfalls": [
          "Euler 用当前斜率，不是平均斜率",
          "小线段表示方向，不是一整条解曲线",
          "dy/dx=f(x) 的斜率只按竖列变化；dy/dx=f(x,y) 会随位置整体变化"
        ],
        "bottomTakeaway": "接下来先练公式语言：当右边只含 x，直接积分找 y。"
      },
      "focusRegions": [
        {
          "id": "focus-top-map-title",
          "label": "顶部标题与总句",
          "role": "opening",
          "left": 55,
          "top": 25,
          "width": 890,
          "height": 70,
          "order": 1
        },
        {
          "id": "focus-left-formula-language",
          "label": "左栏公式语言",
          "role": "formula",
          "left": 55,
          "top": 125,
          "width": 270,
          "height": 270,
          "order": 2
        },
        {
          "id": "focus-middle-geometry-language",
          "label": "中栏几何语言",
          "role": "visual",
          "left": 365,
          "top": 125,
          "width": 270,
          "height": 270,
          "order": 3
        },
        {
          "id": "focus-right-numerical-language",
          "label": "右栏数值语言",
          "role": "strategy",
          "left": 675,
          "top": 125,
          "width": 270,
          "height": 270,
          "order": 4
        },
        {
          "id": "focus-bottom-transition",
          "label": "底部过渡句",
          "role": "takeaway",
          "left": 90,
          "top": 430,
          "width": 820,
          "height": 85,
          "order": 5
        }
      ],
      "generationNotes": [
        "三栏宽度接近，视觉上像一张地图，不要做成普通目录。",
        "右栏 Euler 表格可写 2 行示意：old point、slope、new point。",
        "三栏之间需要双向箭头，表达互相翻译。"
      ],
      "qaChecklist": [
        "是否准确写出 Euler 公式 y_new=y_old+slope·Δx？",
        "是否同时出现 dy/dx=f(x) 与 dy/dx=f(x,y)？",
        "是否明确三种语言分别是公式、几何、数值？"
      ]
    }
  }
]
```
