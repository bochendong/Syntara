# 06_Partical_fictions.pdf - image notebook batched2 页面规划 v5 (gpt-5.5)

生成时间：2026-05-25T05:26:12.874Z
耗时：585s
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
    "passed": true,
    "minPageCount": 12,
    "findings": [],
    "blockedPhrases": [],
    "retryCount": 0
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
  "logline": "从“只知道变化率”出发，学生学会用积分恢复函数、用初值锁定唯一解、用 FTC 与链式法则验算候选解，并用斜率场与 Euler 方法判断近似方向。",
  "centralQuestion": "如果微分方程只告诉我们 y 如何变化，我们怎样确定 y 本身，并判断一个答案或近似是否可信？",
  "acts": [
    {
      "id": "act-opening",
      "act": "opening",
      "title": "变化率不是函数本身",
      "purpose": "用直观情境说明 dy/dx 只描述局部趋势，必须通过积分与额外信息才能得到具体函数。",
      "pages": [
        1,
        2
      ],
      "keyQuestion": "知道每一点的斜率后，为什么还不能马上知道曲线是哪一条？"
    },
    {
      "id": "act-development-1",
      "act": "development",
      "title": "从导数反推函数：积分与常数 C",
      "purpose": "建立分离微分、两边积分、出现常数族的基本流程。",
      "pages": [
        3,
        4,
        5
      ],
      "keyQuestion": "从 dy/dx 反推 y 时，常数 C 从哪里来，又代表什么？"
    },
    {
      "id": "act-development-2",
      "act": "development",
      "title": "初值与验算：把答案从“可能”变成“确定”",
      "purpose": "用初值确定 C，并用 FTC 与链式法则检查含积分表达式是否满足微分方程。",
      "pages": [
        6,
        7,
        8
      ],
      "keyQuestion": "一个看起来像积分的表达式，怎样确认它真的满足给定微分方程？"
    },
    {
      "id": "act-practice-visual",
      "act": "practice",
      "title": "斜率场：不用解出公式也能读出行为",
      "purpose": "训练学生从斜率场识别只依赖 x、只依赖 y、同时依赖 x,y 的微分方程，并判断零斜率与符号区域。",
      "pages": [
        9,
        10,
        11
      ],
      "keyQuestion": "如果没有显式解，图上的小线段能告诉我们什么？"
    },
    {
      "id": "act-synthesis",
      "act": "synthesis",
      "title": "Euler 方法与误差方向",
      "purpose": "把斜率场、切线近似与凹凸性连接起来，判断 Euler 近似高估或低估。",
      "pages": [
        12,
        13,
        14
      ],
      "keyQuestion": "沿着切线一步步走，什么时候会走在真实曲线之上或之下？"
    }
  ],
  "closingCallback": "最后回到 centralQuestion：微分方程给的是变化规则，不是完整函数；积分给出函数族，初值给出唯一解，FTC 与链式法则负责验算，斜率场和 Euler 方法帮助我们在解不出来时仍能判断趋势。下一节钩子是：当 dy/dx 同时依赖 y 时，哪些方程可以分离变量并真正解出公式？"
}
```

## Page Plans

### 1. 只知道变化率，够不够知道函数？
- pageRole：hook
- pageMove：用三条上下平移的抛物线说明同一个导数可以来自很多函数。
- formulas：\frac{d}{dx}(x^2)=2x；\frac{d}{dx}(x^2+3)=2x；\frac{d}{dx}(x^2-4)=2x；\frac{dy}{dx}=2x \Rightarrow y=x^2+C
- exampleSteps：先画 y=x^2 作为基准曲线 -> 把同样形状向上平移 3 得到 y=x^2+3 -> 把同样形状向下平移 4 得到 y=x^2-4 -> 分别求导，三条都得到 2x -> 圈出常数 3、-4：它们影响高度，但不影响导数 -> 写出结论：只给变化率，只能得到函数族
- focusRegions：1.顶部问题钩子[50,28,900,70]；2.左侧三条平移抛物线[55,115,455,300]；3.右侧求导对比[545,120,395,210]；4.函数族结论[545,350,395,85]；5.底部本节路线箭头[70,455,860,78]

### 2. 微分方程在问什么？
- pageRole：definition
- pageMove：把“微分方程的解”定义成可代回验证的函数，并给一般解、特解、初值条件命名。
- formulas：\frac{dy}{dx}=f(x)；\frac{dy}{dx}=f(x,y)；y(x)\text{ 是解 }\Longleftrightarrow y'(x)=f(x,y(x))；y(x_0)=y_0
- exampleSteps：候选：y=x^2+C -> 求导：y'=2x -> 比较：2x=2x，所以满足 dy/dx=2x -> 若给 y(3)=5：5=9+C -> 解得 C=-4 -> 特解：y=x^2-4
- focusRegions：1.顶部定义标题[50,28,900,65]；2.左侧两种微分方程形式对比[55,115,400,185]；3.中间代回检查流程[485,115,455,185]；4.术语栏：一般解、特解、初值[55,325,385,150]；5.底部小检查：y=x^2+C[470,320,470,165]；6.底部承接到积分[70,500,860,42]

### 3. 从 dy/dx 反推 y：两边积分
- pageRole：formula
- pageMove：建立 dy/dx=f(x) 的基础积分模板，并把 C 解释成一族曲线的竖直平移。
- formulas：dy/dx = f(x)；dy = f(x) dx；∫ dy = ∫ f(x) dx；y = F(x) + C, 其中 F′(x)=f(x)
- exampleSteps：1. 从微分方程读信息：右侧 f(x) 告诉我们斜率如何随 x 变化。 -> 2. 改写微分形式：dy = f(x) dx。 -> 3. 两边同时积分：∫dy = ∫f(x)dx。 -> 4. 左边得到 y；右边得到一个原函数 F(x)，再加 C。 -> 5. 写成一般解：y = F(x)+C。 -> 6. 解释 C：每选一个 C，就选中一条上下平移后的曲线。
- focusRegions：1.顶部问题与页面入口[45,28,910,72]；2.左侧记号转换流程[55,115,300,230]；3.中间两边积分模板[370,120,300,220]；4.右侧 C 的竖直平移图像[690,112,260,250]；5.底部易错提醒与承接[65,390,870,125]

### 4. 例题 1：dy/dx=2x，y(3)=5
- pageRole：example
- pageMove：完整展示从微分方程到一般解，再到满足初值的特解。
- formulas：dy/dx = 2x；dy = 2x dx；∫dy = ∫2x dx；y = x^2 + C
- exampleSteps：Step 1: dy/dx=2x -> dy = 2x dx -> ∫dy = ∫2x dx -> y = x^2 + C -> Step 2: y(3)=5 ⇒ 5 = 3^2 + C -> 5 = 9 + C ⇒ C = -4 -> 因此 y = x^2 - 4
- focusRegions：1.题目与初值点[45,28,910,90]；2.左侧 Step 1 积分求一般解[55,130,385,205]；3.右侧 Step 2 代入初值求 C[470,130,260,205]；4.右下函数族筛选图[745,128,205,235]；5.底部一般解与特解并排[65,365,870,145]

### 5. 例题 2：压力与体积的函数类型
- pageRole：example
- pageMove：这一页练习看到 1/P 型变化率时，识别积分结果是 ln|P|，从而判断函数类型。
- formulas：\frac{dV}{dP}=-\frac{10^{-5}}{P}；dV=-\frac{10^{-5}}{P}\,dP；\int dV=\int -\frac{10^{-5}}{P}\,dP；V(P)=-10^{-5}\ln|P|+C
- exampleSteps：Step 1：把导数形式改写为微分形式：dV=-(10^{-5}/P)dP -> Step 2：两边积分：∫dV=∫-(10^{-5}/P)dP -> Step 3：把常数提出：V=-10^{-5}∫(1/P)dP -> Step 4：使用模板 ∫(1/P)dP=ln|P| -> Step 5：得到 V(P)=-10^{-5}ln|P|+C -> Step 6：因为出现 ln，所以选择 D
- focusRegions：1.题目与选项[55,70,430,160]；2.识别 1/P 模板[525,75,395,125]；3.两边积分步骤[90,245,560,205]；4.函数类型判断[690,245,250,190]；5.C 的悬念[90,470,820,55]

### 6. 初值的作用：从函数族到唯一曲线
- pageRole：strategy
- pageMove：用一张图和一行代数说明初值如何确定 C。
- formulas：y=F(x)+C；y(a)=b；b=F(a)+C；C=b-F(a)
- exampleSteps：Step 1：积分后先写 y=F(x)+C，而不是立刻选一个 C -> Step 2：初值 y(a)=b 表示点 (a,b) 在曲线上 -> Step 3：把 x=a 代入一般解：y(a)=F(a)+C -> Step 4：用 y(a)=b 替换左侧：b=F(a)+C -> Step 5：解得 C=b-F(a) -> Step 6：特解为 y=F(x)+b-F(a)
- focusRegions：1.函数族图像[55,85,520,350]；2.初值点[230,170,230,150]；3.代数确定 C[620,90,310,170]；4.三步流程[620,290,320,145]；5.定积分形式的悬念[80,465,845,60]

### 7. FTC 检查：含变量上限的积分怎么求导？
- pageRole：proof
- pageMove：把 FTC 和链式法则合成一套“对候选解求导”的检查工具。
- formulas：d/dx ∫_a^x g(t)dt = g(x)；d/dx ∫_a^{u(x)} g(t)dt = g(u(x))u'(x)；d/dx ∫_{u(x)}^a g(t)dt = -g(u(x))u'(x)；d/dx ∫_{u(x)}^{v(x)} g(t)dt = g(v(x))v'(x) - g(u(x))u'(x)
- exampleSteps：设 F(x)=∫_a^x g(t)dt -> FTC：F'(x)=g(x) -> 若 y=∫_a^{u(x)}g(t)dt，则 y=F(u(x)) -> 链式法则：y'=F'(u(x))u'(x)=g(u(x))u'(x) -> 若 y=∫_{u(x)}^a g(t)dt=-∫_a^{u(x)}g(t)dt -> 所以 y'=-g(u(x))u'(x)
- focusRegions：1.顶部标题与检查思路[45,25,910,70]；2.FTC 变量上限基础规则[55,110,410,145]；3.复合上限与链式法则[535,110,410,145]；4.变量下限的负号[55,280,410,165]；5.两个快速求导检查[535,280,410,165]；6.底部收束与下一页承接[60,470,880,55]

### 8. 例题 3：哪一个积分表达式满足给定微分方程？
- pageRole：example
- pageMove：逐项检查四个积分表达式的导数是否等于 -2x e^{x^2}。
- formulas：target: y' = -2x e^{x^2}；d/dx ∫_a^{u(x)} g(t)dt = g(u(x))u'(x)；d/dx ∫_{u(x)}^a g(t)dt = -g(u(x))u'(x)；d/dx (constant) = 0
- exampleSteps：A: y=∫_0^{-x^2} e^t dt ⇒ y'=e^{-x^2}(-2x)=-2x e^{-x^2}，不是 target。 -> B: y=1+∫_0^{-x} e^{t^2}dt ⇒ y'=e^{(-x)^2}(-1)=-e^{x^2}，少了 2x。 -> C: y=2+∫_0^{x^2} e^t dt ⇒ y'=e^{x^2}(2x)=2x e^{x^2}，符号错。 -> D: y=3+∫_{x^2}^{0} e^t dt ⇒ y'=-e^{x^2}(2x)=-2x e^{x^2}。 -> 所以 D 的导数与 dy/dx 完全相同。
- focusRegions：1.题目与目标导数[45,25,910,90]；2.四个候选积分表达式[50,130,390,245]；3.求导规则小工具箱[50,390,390,95]；4.A/B/C/D 逐项求导比较[475,125,475,300]；5.圈出正确答案与错误类型[475,435,475,55]；6.转向斜率场的承接[60,505,880,40]

### 9. 斜率场：每个点放一小段切线
- pageRole：definition
- pageMove：现在把微分方程右侧当成方向规则，学习不用显式解也能读图。
- formulas：\frac{dy}{dx}=f(x,y)；m=f(x,y)；m=0 \Rightarrow 水平小线段；m>0 上升，\quad m<0 下降
- exampleSteps：1. 选一个网格点 (x,y) -> 2. 代入右侧：m=f(x,y) -> 3. 在该点画斜率为 m 的短线段 -> 4. 重复许多点，得到方向地图 -> 5. 解曲线从初值点出发，沿小线段相切前进
- focusRegions：1.标题与方向规则[50,30,900,85]；2.斜率场主图[55,125,435,285]；3.零正负斜率读法[525,125,400,175]；4.解曲线必须相切[520,315,410,115]；5.底部收束与下一页问题[60,450,870,75]

### 10. 例题 4：三条微分方程匹配三个斜率场
- pageRole：example
- pageMove：用依赖变量和零斜率线匹配公式与图像。
- formulas：A.\ \frac{dy}{dx}=x(x-1)；B.\ \frac{dy}{dx}=x(y-2)；C.\ \frac{dy}{dx}=(2-y)(y+1)^2；\frac{dy}{dx}=0 \Rightarrow 水平小线段
- exampleSteps：1. A: 只含 x，所以沿同一竖线斜率相同；零线 x=0, x=1 -> 2. C: 只含 y，所以沿同一横线斜率相同；零线 y=2, y=-1 -> 3. B: 同时含 x,y；零线来自 x(y-2)=0，即 x=0 或 y=2 -> 4. 找图像指纹：竖条纹 → A，横条纹 → C，十字零线 → B -> 5. 写下匹配：左上 C，右上 A，右下 B -> 6. 剩下一张图不匹配给出的三条方程
- focusRegions：1.题目与三条方程[45,28,910,105]；2.四个斜率场缩略图[45,145,500,275]；3.匹配策略批注[575,145,365,155]；4.A/B/C 逐条分析[575,315,365,115]；5.答案表格与承接[55,445,875,82]

### 11. 例题 5：从斜率场识别 dy/dx=x^2-y^2
- pageRole：example
- pageMove：用零斜率线、正负区域和排除法判断答案是 C。
- formulas：A. \frac{dy}{dx}=(x-y)^2；B. \frac{dy}{dx}=(x+y)^2；C. \frac{dy}{dx}=x^2-y^2=(x-y)(x+y)；D. \frac{dy}{dx}=x^2+y^2
- exampleSteps：观察图：沿 x=y 与 x=-y 附近，小线段几乎水平。 -> 所以候选方程必须在 x=y 和 x=-y 两条线上都满足 dy/dx=0。 -> C: x^2-y^2=0 ⇒ (x-y)(x+y)=0 ⇒ x=y 或 x=-y。 -> 看符号：|x|>|y| 时 x^2-y^2>0；|y|>|x| 时 x^2-y^2<0。 -> A、B、D 不会产生负斜率；与图中向下倾斜区域矛盾。 -> 因此 slope field 对应 C。
- focusRegions：1.标题与题目[42,28,908,72]；2.斜率场主图与两条零斜率线[48,112,430,314]；3.四个候选微分方程[512,112,420,150]；4.三步读图判断[512,284,420,150]；5.排除理由与最终答案[70,444,860,86]

### 12. Euler 方法：沿当前切线走一步
- pageRole：formula
- pageMove：建立 Euler 更新公式，并在图上标出当前点、当前斜率和步长。
- formulas：y'=f(x,y)；x_{n+1}=x_n+\Delta x；\Delta y\approx f(x_n,y_n)\Delta x；y_{n+1}=y_n+f(x_n,y_n)\Delta x
- exampleSteps：从斜率场上选当前点 (x_n,y_n)。 -> 读出该点斜率：m=f(x_n,y_n)。 -> 向右走一个步长：x_{n+1}=x_n+\Delta x。 -> 沿切线估计竖直变化：\Delta y\approx m\Delta x。 -> 加到当前高度：y_{n+1}=y_n+f(x_n,y_n)\Delta x。 -> 把新点当作下一步的当前点，重复。
- focusRegions：1.标题与一句话想法[42,28,908,70]；2.斜率场上的一步切线近似[52,112,430,278]；3.更新公式推导[520,112,420,220]；4.变量含义标注[520,350,420,84]；5.步长大小与偏离风险[70,444,860,82]

### 13. Euler 高估还是低估：看凹凸性
- pageRole：pitfalls
- pageMove：解释为什么凹向上会让切线落在曲线下方，凹向下会让切线落在曲线上方。
- formulas：y_{n+1}=y_n+f(x_n,y_n)\Delta x；x_{n+1}=x_n+\Delta x；concave up: y''>0；concave down: y''<0
- exampleSteps：从初始点 (x_n,y_n) 画真实解曲线。 -> 在同一点画切线，斜率为 f(x_n,y_n)。 -> Euler 用切线走到 x_{n+1}。 -> 若真实曲线在切线上方，则 Euler 值偏低。 -> 若真实曲线在切线下方，则 Euler 值偏高。 -> 所以凹凸性决定常见误差方向。
- focusRegions：1.标题与核心规则[45,28,910,72]；2.左侧凹向上图[55,115,405,250]；3.右侧凹向下图[540,115,405,250]；4.误差判断流程条[80,390,840,85]；5.易错提醒与下一页承接[80,485,840,55]

### 14. 总结：从变化率到函数，再到图像与近似
- pageRole：summary
- pageMove：用金鱼 Allee effect 例题收束：斜率场显示解曲线凹向上，所以 Euler 低估。
- formulas：\frac{dN}{dt}=N\left(\frac{N}{6}-1\right)\left(1-\frac{N}{20}\right)；N(0)=7,\quad \Delta t=0.5；N_{n+1}=N_n+f(t_n,N_n)\Delta t；t=2=4\times 0.5
- exampleSteps：1. 标出初始点 (0,7)。 -> 2. 沿斜率场看解曲线：向右上走。 -> 3. 小线段沿路径变得更陡，判断解曲线 concave up。 -> 4. concave up 时，Euler 切线步进在真实曲线下方。 -> 5. 所以 Euler approximation at t=2 is an under-estimate。 -> 6. 选择 A。
- focusRegions：1.标题与金鱼模型[45,25,910,82]；2.斜率场与 Euler 折线[55,115,455,235]；3.金鱼例题判断步骤[545,115,400,235]；4.本节完整工作流[60,370,880,105]；5.下一节钩子[80,492,840,48]

## 原始 JSON

完整响应另存为：`/Users/dongpochen/Github/OpenMAIC/tmp/notebook-outlines/06_partical_fictions_image_notebook_plan_v5_batched2_gpt55.raw.json`
