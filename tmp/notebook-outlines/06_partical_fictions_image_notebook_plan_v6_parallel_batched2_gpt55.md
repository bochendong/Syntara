# 06_Partical_fictions.pdf - image notebook parallel batched2 页面规划 v6 (gpt-5.5)

生成时间：2026-05-25T05:35:24.209Z
耗时：413s
接口：`POST /api/generate/image-notebook-plan`
模型 Header：`x-notebook-model-outlines: openai:gpt-5.5`
plannerMode：batched
planBatchCount：7
页数/场景数：14

## Plan Quality Gate

```json
{
  "passed": true,
  "minPageCount": 12,
  "findings": [],
  "blockedPhrases": [],
  "retryCount": 0
}
```

## Attempts

```json
[
  {
    "passed": false,
    "minPageCount": 12,
    "findings": [
      "最后一页不是总结/迁移/下节课钩子。"
    ],
    "blockedPhrases": [],
    "retryCount": 0
  },
  {
    "passed": true,
    "minPageCount": 12,
    "findings": [],
    "blockedPhrases": [],
    "retryCount": 1
  },
  {
    "passed": true,
    "minPageCount": 12,
    "findings": [],
    "blockedPhrases": [],
    "retryCount": 0
  }
]
```

## Course Spine

```json
{
  "logline": "从“只知道变化率”出发，用积分、初值、FTC 检查、斜率场与 Euler method，把微分方程看成一条可以重建和预测函数的路线。",
  "centralQuestion": "如果我只知道一个量怎么变，怎样找回它本身，并判断近似预测是偏高还是偏低？",
  "acts": [
    {
      "id": "act-opening",
      "act": "opening",
      "title": "变化率不等于函数本身",
      "purpose": "让学生意识到 dy/dx 只告诉局部斜率，不能单独确定唯一函数。",
      "pages": [
        1,
        2,
        3
      ],
      "keyQuestion": "为什么同一个变化率会对应一族函数？"
    },
    {
      "id": "act-development-1",
      "act": "development",
      "title": "从 dy/dx 反推 y：积分与初值",
      "purpose": "建立不定积分、常数 C、初值条件之间的关系，并完成基础求解例题。",
      "pages": [
        4,
        5,
        6
      ],
      "keyQuestion": "怎样从微分方程得到通解，又怎样用初值选出唯一解？"
    },
    {
      "id": "act-development-2",
      "act": "development",
      "title": "用 FTC 与链式法则验证候选解",
      "purpose": "训练学生不一定要先算出积分，也能判断积分表达式是否满足微分方程。",
      "pages": [
        7,
        8
      ],
      "keyQuestion": "看到带变上限的积分表达式，怎样快速检查它的导数？"
    },
    {
      "id": "act-practice",
      "act": "practice",
      "title": "读斜率场：从图像识别微分方程",
      "purpose": "把公式中的 x 依赖、y 依赖、零斜率线和符号变化转化成图像判断。",
      "pages": [
        9,
        10,
        11
      ],
      "keyQuestion": "一张斜率场图里，哪些线索能告诉我们它来自哪个微分方程？"
    },
    {
      "id": "act-synthesis",
      "act": "synthesis",
      "title": "Euler method 与高估低估",
      "purpose": "连接斜率场、局部线性近似和凹凸性，解释 Euler 近似为何会偏高或偏低。",
      "pages": [
        12,
        13,
        14
      ],
      "keyQuestion": "用切线一步步走时，为什么近似值会系统性偏离真实解？"
    }
  ],
  "closingCallback": "最后回到 centralQuestion：只知道变化率时，我们可以用积分重建函数、用初值确定唯一解、用 FTC 检查表达式、用斜率场读趋势、用凹凸性判断 Euler 误差；下一节将把这些工具推进到更复杂的可分离微分方程与长期行为分析。"
}
```

## Page Plans

### 1. 只知道“怎么变”，够不够知道“是多少”？
- pageRole：hook
- pageMove：让学生看到同一个斜率规则会对应多条曲线，因此必须引入积分和初值。
- formulas：\frac{dy}{dx}=2x；y=x^2+C；y=x^2-4,\quad y=x^2,\quad y=x^2+3
- exampleSteps：三条曲线只是上下平移 -> \frac{d}{dx}(x^2-4)=2x -> \frac{d}{dx}(x^2)=2x -> \frac{d}{dx}(x^2+3)=2x -> 导数相同，但 y 值不同 -> 所以还需要初值来选唯一曲线
- focusRegions：1.顶部课堂提问与标题[48,28,900,78]；2.三个变化率情境卡片[55,128,305,250]；3.同一导数对应一族曲线图[395,118,540,280]；4.三条曲线求导对比[82,395,430,90]；5.底部本课路线[55,492,885,50]

### 2. 什么是微分方程
- pageRole：definition
- pageMove：把“斜率规则”正式写成 dy/dx=f(x,y)，并把初值解释成图像上的定位点。
- formulas：\frac{dy}{dx}=f(x,y)；y=y(x)；y(a)=b；\frac{dy}{dx}=2x,\qquad \frac{dy}{dx}=x(y-2)
- exampleSteps：读左边：\frac{dy}{dx} 是曲线在当前点的斜率 -> 读右边：f(x,y) 是决定斜率的规则 -> 若 \frac{dy}{dx}=2x，斜率只随 x 变 -> 若 \frac{dy}{dx}=x(y-2)，斜率随 x 和 y 一起变 -> 读初值：y(a)=b 等价于曲线经过 (a,b) -> 所以解题目标是找满足规则且经过该点的函数 y(x)
- focusRegions：1.顶部核心定义拆解[54,32,890,105]；2.曲线、切线斜率与点[66,158,390,250]；3.例子：斜率只依赖 x[505,160,400,95]；4.例子：斜率依赖 x 和 y[505,274,400,110]；5.初值条件定位曲线[80,425,840,78]；6.底部收束句[90,515,820,40]

### 3. 从 dy/dx 反推 y：先看只含 x 的情况
- pageRole：formula
- pageMove：现在先处理最容易的一类：斜率只由 x 决定，用积分把 y 找回来。
- formulas：\frac{dy}{dx}=f(x)；dy=f(x)\,dx；\int dy=\int f(x)\,dx；y=\int f(x)\,dx+C
- exampleSteps：1. 观察右边：f(x) 只依赖 x。 -> 2. 改写：\frac{dy}{dx}=f(x) \Rightarrow dy=f(x)\,dx。 -> 3. 两边积分：\int dy=\int f(x)\,dx。 -> 4. 左边恢复 y，右边得到一个原函数。 -> 5. 写成通解：y=F(x)+C。 -> 6. 检查：\frac{d}{dx}[F(x)+C]=f(x)。
- focusRegions：1.问题开场：知道斜率还是知道函数？[50,45,900,75]；2.从导数形式到微分形式[55,135,410,145]；3.两边积分得到通解[55,295,460,150]；4.一族曲线的图像解释[545,135,390,245]；5.底部收束：积分恢复形状，C 保留高度[80,465,840,62]

### 4. 例 1：dy/dx=2x, y(3)=5
- pageRole：example
- pageMove：把模板真正跑一遍：从导数 2x 恢复 y，再用点 (3,5) 锁定 C。
- formulas：\frac{dy}{dx}=2x,\quad y(3)=5；dy=2x\,dx,\quad \int dy=\int 2x\,dx；y=x^2+C；5=3^2+C\Rightarrow C=-4\Rightarrow y=x^2-4
- exampleSteps：1. 观察：右边 2x 只含 x，可以直接积分。 -> 2. 改写：dy=2x\,dx。 -> 3. 两边积分：\int dy=\int 2x\,dx。 -> 4. 得到通解：y=x^2+C。 -> 5. 初值 y(3)=5 表示点 (3,5) 在解曲线上。 -> 6. 代入：5=3^2+C，所以 C=-4，最终 y=x^2-4。
- focusRegions：1.题目与已知条件[50,40,900,70]；2.Step 1：积分得到通解[55,125,440,205]；3.图像：一族抛物线与经过初值点的那条[530,125,405,230]；4.Step 2：代入初值求 C[55,345,440,120]；5.最终答案与一句话收束[160,475,680,60]

### 5. 常数 C 为什么不能省
- pageRole：pitfalls
- pageMove：用三条同导数的曲线展示：导数丢掉了竖直位置信息。
- formulas：\frac{d}{dx}(x^2)=2x；\frac{d}{dx}(x^2+1)=2x；\frac{d}{dx}(x^2-4)=2x；\frac{dy}{dx}=2x \Rightarrow y=x^2+C
- exampleSteps：1. 三条曲线：y=x^2，y=x^2+1，y=x^2-4 -> 2. 分别求导后都得到 2x -> 3. 常数项 +1、-4 在求导时变成 0 -> 4. 所以反推 y 时必须写成 y=x^2+C -> 5. 若再给 y(3)=5：5=9+C，C=-4 -> 6. 没有初值时，不能确定是哪一条曲线
- focusRegions：1.三条上下平移的抛物线[55,105,430,305]；2.三行求导对比[525,95,405,150]；3.常数消失与信息丢失[525,260,405,105]；4.通解与初值选解[515,380,425,95]；5.底部收束句[70,490,860,45]

### 6. 例 2：压力与体积的函数类型
- pageRole：example
- pageMove：把 \frac{dV}{dP}=-\frac{10^k}{P} 积回 V(P)，并识别 logarithmic function。
- formulas：\frac{dV}{dP}=-\frac{10^k}{P}；dV=-\frac{10^k}{P}\,dP；\int 1\,dV=\int -\frac{10^k}{P}\,dP；V(P)=-10^k\ln|P|+C
- exampleSteps：1. 读符号：\frac{dV}{dP} 表示 V 对 P 的变化率 -> 2. 两边乘 dP：dV=-\frac{10^k}{P}\,dP -> 3. 两边积分：\int 1\,dV=\int -\frac{10^k}{P}\,dP -> 4. 常数提出：V=-10^k\int \frac{1}{P}\,dP -> 5. 使用 \int \frac{1}{P}\,dP=\ln|P| -> 6. 得到 V(P)=-10^k\ln|P|+C，因此选 D
- focusRegions：1.题目与选项[55,85,420,185]；2.变量与未知函数识别[60,285,405,95]；3.完整积分步骤[515,90,420,265]；4.1/P 与 ln 的连接[520,370,400,70]；5.最终选项与底部承接[70,455,860,80]

### 7. 不用算完积分，也能检查答案
- pageRole：proof
- pageMove：建立一个快速检查工具：FTC 负责变上限，链式法则负责上限不是 x 的情况。
- formulas：F(x)=\int_a^x g(t)\,dt \quad\Rightarrow\quad F'(x)=g(x)；F(x)=\int_a^{h(x)} g(t)\,dt \quad\Rightarrow\quad F'(x)=g(h(x))h'(x)；\frac{d}{dx}\left[C+\int_a^{h(x)}g(t)\,dt\right]=g(h(x))h'(x)；\text{solution check: } y' \stackrel{?}{=} \text{right side of DE}
- exampleSteps：令 A(u)=\int_a^u g(t)\,dt -> 由 FTC：A'(u)=g(u) -> 若 F(x)=\int_a^{h(x)}g(t)\,dt=A(h(x)) -> 由链式法则：F'(x)=A'(h(x))h'(x) -> 所以 F'(x)=g(h(x))h'(x) -> 常数 C 的导数是 0，不改变是否满足微分方程
- focusRegions：1.开场问题区[55,55,420,95]；2.FTC 基础公式区[70,165,390,120]；3.链式法则扩展区[520,165,410,120]；4.推导步骤区[95,305,805,150]；5.底部检查流程区[95,475,805,62]

### 8. 例 3：选择满足 dy/dx = -2x e^{x^2} 的积分表达式
- pageRole：example
- pageMove：逐个检查四个候选积分表达式，用目标导数筛选真正的解。
- formulas：\frac{dy}{dx}=-2xe^{x^2}；\frac{d}{dx}\int_a^{h(x)}g(t)\,dt=g(h(x))h'(x)；\frac{d}{dx}\int_{h(x)}^{a}g(t)\,dt=-g(h(x))h'(x)；\frac{d}{dx}(\text{constant})=0
- exampleSteps：A. \(y=\int_0^{-x^2}e^{-t}\,dt\Rightarrow y'=e^{-(-x^2)}(-2x)=-2xe^{x^2}\) ✓ -> B. \(y=1+\int_0^{-x^2}e^t\,dt\Rightarrow y'=0+e^{-x^2}(-2x)=-2xe^{-x^2}\) ✗ -> C. \(y=2+\int_0^{x^2}e^t\,dt\Rightarrow y'=0+e^{x^2}(2x)=2xe^{x^2}\) ✗ -> D. \(y=3+\int_{x^2}^{0}e^t\,dt=3-\int_0^{x^2}e^t\,dt\) -> \(D' =0-e^{x^2}(2x)=-2xe^{x^2}\) ✓ -> 所以答案：A, D
- focusRegions：1.题目与目标导数区[55,45,600,105]；2.检查规则提醒区[680,45,270,105]；3.选项 A 检查区[60,175,420,105]；4.选项 B 检查区[520,175,420,105]；5.选项 C 与 D 检查区[60,300,880,150]；6.答案与错误原因区[95,470,810,65]

### 9. 怎样读 slope field
- pageRole：strategy
- pageMove：让学生知道 slope field 里的每个小线段代表什么，并建立可复用的读图步骤。
- formulas：\frac{dy}{dx}=f(x,y)；\frac{dy}{dx}=f(x)；\frac{dy}{dx}=g(y)；\frac{dy}{dx}=0
- exampleSteps：Step 1：任选一点 (x,y)，读该点小线段的倾斜程度 -> Step 2：沿同一竖直线比较：若斜率重复，可能只依赖 x -> Step 3：沿同一水平线比较：若斜率重复，可能只依赖 y -> Step 4：把水平小线段连成零斜率线 -> Step 5：在零斜率线两侧标出 dy/dx>0 与 dy/dx<0
- focusRegions：1.标题与读图口令[50,28,900,70]；2.点处斜率放大解释[55,115,260,165]；3.只含 x 的竖直条带[345,115,270,165]；4.只含 y 的水平条带[650,115,290,165]；5.零斜率线与正负区域[70,310,520,160]；6.四步读图流程[620,315,320,155]

### 10. 例 4：三条微分方程匹配三个斜率场
- pageRole：example
- pageMove：把 A、B、C 三个公式逐一翻译成图像特征，并完成匹配。
- formulas：A.\ \frac{dy}{dx}=x(x-1)；B.\ \frac{dy}{dx}=x(y-2)；C.\ \frac{dy}{dx}=(2-y)(y+1)^2
- exampleSteps：A: x(x-1)=0 \Rightarrow x=0,1；只看 x，所以找竖直条带 -> B: x(y-2)=0 \Rightarrow x=0 或 y=2；应有一竖一直两条零线 -> C: (2-y)(y+1)^2=0 \Rightarrow y=2,-1；只看 y，所以找水平条带 -> 左上图：同一水平线上斜率重复，且有水平零线 → C -> 右上图：同一竖直线上斜率重复，且有竖直零线 → A -> 右下图：竖直零线和水平零线同时出现 → B
- focusRegions：1.题目与三条微分方程[45,35,395,145]；2.公式翻译成图像特征[45,205,395,215]；3.四张 slope field 匹配区[470,45,480,365]；4.零斜率线标注与匹配箭头[470,420,480,55]；5.答案条与方法收束[55,455,890,70]

### 11. 例 5：从圆形与对角线特征识别方程
- pageRole：example
- pageMove：用一张容易混淆的斜率场，比较四个二次表达式的视觉差异。
- formulas：A. \frac{dy}{dx}=(x-y)^2；B. \frac{dy}{dx}=(x+y)^2；C. \frac{dy}{dx}=x^2-y^2；D. \frac{dy}{dx}=x^2+y^2
- exampleSteps：A: (x-y)^2=0 \Rightarrow y=x，只给一条零斜率线。 -> B: (x+y)^2=0 \Rightarrow y=-x，只给一条零斜率线。 -> D: x^2+y^2=0 \Rightarrow (x,y)=(0,0)，没有整条零斜率线。 -> C: x^2-y^2=(x-y)(x+y)=0 \Rightarrow y=x 或 y=-x。 -> |x|>|y| \Rightarrow x^2-y^2>0，斜率为正。 -> |y|>|x| \Rightarrow x^2-y^2<0，斜率为负。
- focusRegions：1.题目与四个候选方程[45,35,405,118]；2.斜率场大图与两条对角零斜率线[45,168,455,300]；3.零斜率条件排除表[535,92,405,212]；4.符号区域检查[535,320,405,112]；5.答案与一句话收束[80,488,860,54]

### 12. Euler method：沿着斜率场一步步走
- pageRole：formula
- pageMove：建立 Euler method 的递推公式，并把公式每一部分对应到图上的一步。
- formulas：x_{n+1}=x_n+\Delta x；m_n=f(x_n,y_n)；\Delta y\approx f(x_n,y_n)\Delta x；y_{n+1}=y_n+f(x_n,y_n)\Delta x
- exampleSteps：Step 0: 从初值点 (x_0,y_0) 开始。 -> Step 1: 算当前斜率 m_0=f(x_0,y_0)。 -> Step 2: 向右走 \Delta x，所以 x_1=x_0+\Delta x。 -> Step 3: 用当前切线估计 y_1=y_0+m_0\Delta x。 -> Step 4: 在新点 (x_1,y_1) 再算 m_1=f(x_1,y_1)。 -> Step 5: 重复得到折线近似解。
- focusRegions：1.给定信息与问题入口[48,35,405,90]；2.斜率场中的第一步和第二步折线[55,145,440,285]；3.Euler 递推公式大框[540,72,405,158]；4.公式符号逐项解释[540,250,405,142]；5.当前斜率与真实曲线的提醒[540,410,405,72]；6.底部流程口诀[72,497,856,45]

### 13. 例 6：金鱼 Alle effect 与 Euler 高估低估
- pageRole：example
- pageMove：现在不追求精确解，而是判断这四步走出来的 N(2) 在真实曲线的上方还是下方。
- formulas：dN/dt = N(N/6 - 1)(1 - N/20)；F(N)=N(N-6)(20-N)/120；N_{n+1}=N_n+0.5F(N_n)；N''=F'(N)N', F'(N)=(-3N^2+52N-120)/120
- exampleSteps：Step 1 设 F(N)=N(N/6 - 1)(1 - N/20)。 -> Step 2 初值 N=7，且 6<7<20，所以 F(7)>0，人口先增加。 -> Step 3 F'(7)=97/120>0；在这段早期路径上，N 越大斜率越大。 -> Step 4 N''=F'(N)N' >0，所以真实解凹向上。 -> Step 5 Euler 每一步使用左端点切线；凹向上曲线在切线上方。 -> Step 6 因此 Euler 对 N(2) 的近似是 under-estimate。
- focusRegions：1.题目与模型[45,35,410,115]；2.斜率场与真实曲线示意[500,35,455,230]；3.符号与凹凸判断[45,165,410,185]；4.Euler 四步小表[500,285,455,125]；5.偏低结论框[65,420,870,105]

### 14. 总结：从变化率到函数，再到预测误差
- pageRole：summary
- pageMove：把整节课的五个工具放到同一条路线中，形成可复习的整页地图。
- formulas：dy/dx=f(x) ⇒ y=∫f(x)dx+C；y(a)=b ⇒ solve for C；d/dx ∫_{a}^{g(x)} h(t)dt = h(g(x))g'(x)；y_{n+1}=y_n+h f(x_n,y_n)
- exampleSteps：1. 看到变化率：先问它只依赖 x，还是依赖 x 和 y？ -> 2. 能积分时：写通解，并保留 C。 -> 3. 有初值时：代入点坐标，确定唯一解。 -> 4. 看到积分候选式：用 FTC 和链式法则反向求导检查。 -> 5. 不能快速求解时：读斜率场的零斜率线、符号区域和趋势。 -> 6. 做 Euler 近似后：用凹凸性判断 under-estimate 或 over-estimate。
- focusRegions：1.顶部总流程箭头[45,30,910,95]；2.积分与初值卡片[55,145,270,170]；3.FTC 检查卡片[365,145,270,170]；4.斜率场与 Euler 卡片[675,145,270,170]；5.底部收束与下一节钩子[55,345,890,170]

## 原始 JSON

完整响应另存为：`/Users/dongpochen/Github/OpenMAIC/tmp/notebook-outlines/06_partical_fictions_image_notebook_plan_v6_parallel_batched2_gpt55.raw.json`
