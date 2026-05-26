# 06_Partical_fictions.pdf - MAT136 中文 Notebook 大纲 v6 (gpt-5.5)

生成时间：2026-05-25T04:20:28.518Z
接口：`POST /api/generate/notebook-outlines`
模型 Header：`x-notebook-model-outlines: openai:gpt-5.5`
源文件：`/Users/dongpochen/Desktop/06_Partical_fictions.pdf`
页数/场景数：12

## Outline Quality Gate

```json
{
  "passed": true,
  "minSceneCount": 12,
  "findings": [],
  "blockedPhrases": [],
  "retryCount": 0
}
```

### Attempts

- Attempt 1: passed; findings=0; retryCount=0

## 控制 Prompt

```text
请基于上传资料，为 MAT136 Calculus II 生成一套中文版 image-first notebook 的可审查大纲。
这次只生成大纲，不生成每页图片。

课程主题：微分方程入门。主线必须是：为什么只知道变化率不够 -> 从 dy/dx 反推 y -> 不定积分带来常数 C -> 初值如何确定 C -> 如何用 FTC / 链式法则检查积分表达式是否满足微分方程 -> 如何读 slope field -> Euler method 为什么会高估或低估。

结构要求：
1. 至少 12 页。
2. 第 1 页是 overview/hook，不是讲解页，不要解题；只提出学生会遇到的核心困惑。
3. 第 2-4 页讲“从 dy/dx 到 y”的公式、常数 C、初值。
4. 中间必须有多个完整例题，尤其是 dy/dx = 2x, y(3)=5，以及“给出积分表达式，判断它是否满足微分方程”的题。
5. 后半段讲 slope field 和 Euler method 的估计方向。
6. 最后一页总结要留下可执行 checklist，并给下一节课钩子。

每页必须输出：学生这一页先看什么、为什么要这样做、老师推进的下一步、例题或图像如何服务本页。

严禁：
- 不要把课号、校区、导师、免责声明、页眉页脚、MAT136 课程身份当作页面要点。
- 不要重复通用模板句，例如“MAT136 是本节课材料里的具体对象”“这一行为什么成立”这种空话。
- 不要照抄 PDF 文本提取错误，例如 derek、!、#、& 这类乱码。公式读不准时，用文字描述“资料中的积分上限选择题”即可。
- 不要写成讲义目录；要像老师实际带学生思考。

输出语言：中文。保留英文资料中的数学题意，但不要保留英文讲义腔。
```

## 大纲

### 1. 只知道变化率时，我们到底缺什么？
- 类型：slide
- 页面角色：intro
- 内容结构：math
- 讲解目标：区分“知道变化率”和“知道函数本身”之间的差别，并准备引入反求函数的方法。
- 学生思考动作：这个表达式里对象是谁，条件是什么，目标结论是什么？
- 页面要点：
  - 已知变化率：$\frac{dy}{dx}=2x$
  - 三个候选函数：$y=x^2-4$，$y=x^2$，$y=x^2+7$
  - 共同点：它们的导数都是 $2x$
  - 缺口：只知道斜率，不能确定曲线的上下位置
  - 图像任务：把三条曲线画成同形状、不同高度，旁边标出同一点斜率相同
- 前后衔接：
  - 本页任务：这个表达式里对象是谁，条件是什么，目标结论是什么？

### 2. 从 $\frac{dy}{dx}$ 到 $y$：为什么两边都积分？
- 类型：slide
- 页面角色：definition
- 内容结构：math
- 讲解目标：掌握从微分方程 $\frac{dy}{dx}=f(x)$ 反求 $y$ 的基本积分动作。
- 页面要点：
  - 起点：$\frac{dy}{dx}=f(x)$
  - 改写：$dy=f(x)\,dx$
  - 两边积分：$\int dy=\int f(x)\,dx$
  - 得到：$y=\int f(x)\,dx$ 加上一个待定常数
  - 检查问题：对得到的 $y$ 求导，能不能回到原来的 $f(x)$？

### 3. 常数 $C$：为什么同一个导数对应一族函数？
- 类型：slide
- 页面角色：concept
- 内容结构：math
- 讲解目标：理解不定积分中的常数 $C$ 表示一族可能解，并能解释为什么它不会改变导数。
- 页面要点：
  - 导数计算：$\frac{d}{dx}(x^2+C)=2x+0=2x$
  - $C$ 的含义：曲线整体上移或下移
  - 通解写法：$y=x^2+C$
  - 不能省略 $C$：$y=x^2$ 只是其中一条曲线
  - 图像任务：同一坐标系画 $C=-4,0,7$ 三条曲线，标注“形状相同，高度不同”

### 4. 完整例题：$\frac{dy}{dx}=2x,\ y(3)=5$
- 类型：slide
- 页面角色：example
- 内容结构：math
- 讲解目标：完整执行从微分方程和初值到特解的计算，并用求导和代入双重检查结果。
- 页面要点：
  - 题目：若 $\frac{dy}{dx}=2x$ 且 $y(3)=5$，求 $y$ 关于 $x$ 的表达式
  - 微分改写：$dy=2x\,dx$
  - 积分：$\int dy=\int 2x\,dx$，所以 $y=x^2+C$
  - 初值：$5=3^2+C$，所以 $C=-4$
  - 答案与检查：$y=x^2-4$，且 $\frac{d}{dx}(x^2-4)=2x$，$y(3)=5$
- 例题配置：
  - 题目：If $\frac{dy}{dx}=2x$ and $y(3)=5$, write $y$ as a function of $x$.
  - 已知：$\frac{dy}{dx}=2x$；$y(3)=5$
  - 目标：求满足微分方程和初值条件的函数 $y(x)$
  - 解题计划：把 $\frac{dy}{dx}=2x$ 改写为 $dy=2x\,dx$ -> 两边积分得到通解 -> 用 $y(3)=5$ 解出 $C$ -> 用求导和代入检查
  - 走读步骤：$dy=2x\,dx$ -> $\int dy=\int 2x\,dx$ -> $y=x^2+C$ -> $5=3^2+C=9+C$ -> $C=-4$ -> $y=x^2-4$ -> 检查：$\frac{d}{dx}(x^2-4)=2x$；$y(3)=9-4=5$
  - 易错点：积分后漏写 $C$；把 $y(3)=5$ 误写成 $y\cdot 3=5$；只检查导数，不检查初值
  - 最终答案：$y=x^2-4$

### 5. FTC 检查：变上限积分怎样求导？
- 类型：slide
- 页面角色：definition
- 内容结构：math
- 讲解目标：用微积分基本定理和链式法则检查积分表达式是否满足给定微分方程。
- 页面要点：
  - 基本形式：$\frac{d}{dx}\left(\int_a^x f(t)\,dt\right)=f(x)$
  - 下限是 $x$：$\frac{d}{dx}\left(\int_x^a f(t)\,dt\right)=-f(x)$
  - 复合上限：$\frac{d}{dx}\left(\int_a^{g(x)} f(t)\,dt\right)=f(g(x))g'(x)$
  - 常数项：$\frac{d}{dx}(3+\int_a^x f(t)\,dt)=f(x)$
  - 图像任务：用箭头标出“上限输入进被积函数”和“再乘上上限的导数”

### 6. 积分表达式选择题 1：谁的导数是 $-2xe^{x^2}$？
- 类型：slide
- 页面角色：example
- 内容结构：math
- 讲解目标：通过逐项求导判断积分表达式是否为微分方程的解。
- 页面要点：
  - 目标方程：$\frac{dy}{dx}=-2xe^{x^2}$
  - 候选 A：$y=\int_0^{-x^2} e^t\,dt$，导数 $=-2xe^{-x^2}$
  - 候选 B：$y=1+\int_0^{-2x} e^{t^2}\,dt$，导数 $=-2e^{4x^2}$
  - 候选 C：$y=2+\int_0^{x^2} e^t\,dt$，导数 $=2xe^{x^2}$
  - 候选 D：$y=3+\int_{x^2}^{0} e^t\,dt$，导数 $=-2xe^{x^2}$，所以选 D
- 例题配置：
  - 题目：Consider the differential equation $\frac{dy}{dx}=-2xe^{x^2}$. Which function is a solution?
A. $y=\int_0^{-x^2} e^t\,dt$
B. $y=1+\int_0^{-2x} e^{t^2}\,dt$
C. $y=2+\int_0^{x^2} e^t\,dt$
D. $y=3+\int_{x^2}^{0} e^t\,dt$
  - 已知：$\frac{dy}{dx}=-2xe^{x^2}$；四个候选函数都以积分表达式给出
  - 目标：判断哪个候选函数求导后等于 $-2xe^{x^2}$
  - 解题计划：对每个候选式使用 FTC -> 若上限或下限含 $x$，同时使用链式法则 -> 把求导结果与 $-2xe^{x^2}$ 比较
  - 走读步骤：A：$\frac{d}{dx}\int_0^{-x^2} e^t\,dt=e^{-x^2}(-2x)=-2xe^{-x^2}$，指数不对 -> B：$\frac{d}{dx}\left(1+\int_0^{-2x} e^{t^2}\,dt\right)=e^{(-2x)^2}(-2)=-2e^{4x^2}$，缺少因子 $x$ -> C：$\frac{d}{dx}\left(2+\int_0^{x^2} e^t\,dt\right)=e^{x^2}(2x)=2xe^{x^2}$，符号不对 -> D：$\int_{x^2}^{0} e^t\,dt=-\int_0^{x^2} e^t\,dt$，所以导数 $=-e^{x^2}(2x)=-2xe^{x^2}$
  - 易错点：看到 $x^2$ 就忘记再乘 $2x$；忽略上下限反向带来的负号；把常数 $1,2,3$ 当成影响导数的关键
  - 最终答案：D

### 7. 积分表达式选择题 2：复合上限不能只看外形
- 类型：slide
- 页面角色：example
- 内容结构：math
- 讲解目标：准确处理复合上限、反向积分限和被积函数输入之间的关系。
- 页面要点：
  - 目标方程：$\frac{dy}{dx}=-3x^2e^{-x^3}$
  - 候选 A：$f(x)=1+\int_0^{x^3} e^{-t}\,dt$，导数 $=3x^2e^{-x^3}$
  - 候选 B：$g(x)=2+\int_{x^3}^{0} e^{-t}\,dt$，导数 $=-3x^2e^{-x^3}$
  - 候选 C：$h(x)=3+\int_0^x e^{-t^3}\,dt$，导数 $=e^{-x^3}$
  - 候选 D：$k(x)=4+\int_0^{-x^3} e^{-t}\,dt$，导数 $=-3x^2e^{x^3}$
- 例题配置：
  - 题目：Consider the differential equation $\frac{dy}{dx}=-3x^2e^{-x^3}$. Which of the following functions is a solution?
A. $f(x)=1+\int_0^{x^3} e^{-t}\,dt$
B. $g(x)=2+\int_{x^3}^{0} e^{-t}\,dt$
C. $h(x)=3+\int_0^x e^{-t^3}\,dt$
D. $k(x)=4+\int_0^{-x^3} e^{-t}\,dt$
  - 已知：$\frac{dy}{dx}=-3x^2e^{-x^3}$；候选函数含有不同积分上限和被积函数
  - 目标：判断哪一个函数满足微分方程
  - 解题计划：先识别目标中的链式因子来自 $\frac{d}{dx}(x^3)=3x^2$ -> 逐个候选式使用 $\frac{d}{dx}\int_a^{g(x)}F(t)\,dt=F(g(x))g'(x)$ -> 注意积分限反向会改变符号
  - 走读步骤：A：$f'(x)=e^{-x^3}\cdot 3x^2=3x^2e^{-x^3}$，符号不对 -> B：$g(x)=2-\int_0^{x^3}e^{-t}\,dt$，所以 $g'(x)=-e^{-x^3}\cdot 3x^2=-3x^2e^{-x^3}$ -> C：$h'(x)=e^{-x^3}$，缺少 $-3x^2$ -> D：$k'(x)=e^{-(-x^3)}(-3x^2)=-3x^2e^{x^3}$，指数符号不对
  - 易错点：把 $e^{-t}$ 在 $t=-x^3$ 处误写成 $e^{-x^3}$；只看有没有 $x^3$，不看上限是 $x^3$ 还是 $-x^3$；忘记反向积分限等于多一个负号
  - 最终答案：B

### 8. 斜率场匹配：先看只依赖 $x$、只依赖 $y$，还是依赖两者
- 类型：slide
- 页面角色：example
- 内容结构：math
- 讲解目标：用变量依赖关系和零斜率线快速匹配斜率场与微分方程。
- 页面要点：
  - A：$\frac{dy}{dx}=x(x-1)$；只依赖 $x$，同一竖线斜率相同，$x=0,1$ 处水平
  - B：$\frac{dy}{dx}=x(y-2)$；依赖 $x$ 和 $y$，$x=0$ 与 $y=2$ 处水平
  - C：$\frac{dy}{dx}=(2-y)(y+1)^2$；只依赖 $y$，同一横线斜率相同，$y=2,-1$ 处水平
  - 匹配思路：先找水平线段形成的整条竖线或横线
  - 图像任务：三块小斜率场旁分别标出“竖向条纹”“横向条纹”“交叉零斜率线”
- 例题配置：
  - 题目：Match the following differential equations with three slope-field patterns.
A. $\frac{dy}{dx}=x(x-1)$
B. $\frac{dy}{dx}=x(y-2)$
C. $\frac{dy}{dx}=(2-y)(y+1)^2$
Field I: slopes form horizontal bands and are zero along $y=2$ and $y=-1$.
Field II: slopes form vertical bands and are zero along $x=0$ and $x=1$.
Field III: slopes change with both coordinates and are zero along $x=0$ and $y=2$.
  - 已知：三个微分方程 A、B、C；三个斜率场的可见特征：条纹方向和零斜率线
  - 目标：把每个斜率场与正确的微分方程匹配
  - 解题计划：判断右边依赖哪些变量 -> 找出零斜率出现的位置 -> 用条纹方向和零斜率线共同确认
  - 走读步骤：A 只含 $x$，所以同一竖线上的斜率相同；$x(x-1)=0$ 给出 $x=0,1$，匹配 Field II -> B 同时含 $x$ 和 $y$；$x(y-2)=0$ 给出 $x=0$ 或 $y=2$，匹配 Field III -> C 只含 $y$，所以同一横线上的斜率相同；$(2-y)(y+1)^2=0$ 给出 $y=2,-1$，匹配 Field I
  - 易错点：只凭某一个点的斜率做判断；看到水平短线段就忘记判断它们排成横线还是竖线；忽略平方因子 $(y+1)^2$ 不改变符号但会给出零斜率
  - 最终答案：Field I $\to$ C；Field II $\to$ A；Field III $\to$ B

### 9. 斜率场选择题：为什么是 $x^2-y^2$？
- 类型：slide
- 页面角色：example
- 内容结构：math
- 讲解目标：用零斜率线、符号区域和对称性判断斜率场对应的方程。
- 页面要点：
  - 候选 A：$\frac{dy}{dx}=(x-y)^2$，斜率永远非负，且在 $x=y$ 为 $0$
  - 候选 B：$\frac{dy}{dx}=(x+y)^2$，斜率永远非负，且在 $x=-y$ 为 $0$
  - 候选 C：$\frac{dy}{dx}=x^2-y^2$，在 $y=x$ 和 $y=-x$ 都为 $0$，且可正可负
  - 候选 D：$\frac{dy}{dx}=x^2+y^2$，除原点外斜率为正
  - 图像证据：零斜率沿两条对角线出现，且不同区域有上升与下降
- 例题配置：
  - 题目：Which differential equation corresponds to a slope field whose short segments are horizontal near both diagonal lines $y=x$ and $y=-x$, with positive slopes where $|x|>|y|$ and negative slopes where $|y|>|x|$?
A. $\frac{dy}{dx}=(x-y)^2$
B. $\frac{dy}{dx}=(x+y)^2$
C. $\frac{dy}{dx}=x^2-y^2$
D. $\frac{dy}{dx}=x^2+y^2$
  - 已知：零斜率出现在 $y=x$ 和 $y=-x$ 附近；图中同时出现正斜率和负斜率
  - 目标：从四个候选微分方程中选出与斜率场一致的一项
  - 解题计划：先用零斜率线筛选 -> 再用斜率正负筛选 -> 最后检查对称性
  - 走读步骤：A：$(x-y)^2=0$ 只在 $y=x$，而且平方使斜率不为负，排除 -> B：$(x+y)^2=0$ 只在 $y=-x$，而且平方使斜率不为负，排除 -> D：$x^2+y^2\ge 0$，除原点外没有零斜率线，排除 -> C：$x^2-y^2=(x-y)(x+y)$，在 $y=x$ 和 $y=-x$ 都为 $0$；当 $|x|>|y|$ 时为正，当 $|y|>|x|$ 时为负，符合图像
  - 易错点：只看到平方就认为一定非负，忽略 $x^2-y^2$ 是差；只检查一条零斜率线；没有用正负区域做第二次确认
  - 最终答案：C

### 10. Euler 方法：从当前点沿切线走一步
- 类型：slide
- 页面角色：concept
- 内容结构：math
- 讲解目标：理解 Euler 方法把微分方程的局部斜率转化为一步数值近似。
- 页面要点：
  - 已知当前点：$(x_n,y_n)$
  - 当前斜率：$F(x_n,y_n)$
  - 步长：$h=\Delta x$ 或 $\Delta t$
  - Euler 更新：$y_{n+1}=y_n+hF(x_n,y_n)$
  - 图像任务：画出“曲线真实弯曲”和“Euler 切线直走”的差别

### 11. Euler 高估还是低估：看曲线向上弯还是向下弯
- 类型：slide
- 页面角色：example
- 内容结构：math
- 讲解目标：用解曲线的凹凸性判断 Euler 方法的估计方向。
- 页面要点：
  - 模型：$\frac{dN}{dt}=N\left(\frac{N}{6}-1\right)\left(1-\frac{N}{20}\right)$，$N(0)=7$
  - Euler 步长：$\Delta t=0.5$，目标时间：$t=2$
  - 从斜率场读图：解曲线看起来 concave up
  - concave up 时，切线段通常落在真实曲线下方
  - 结论：Euler 估计是 under-estimate
- 例题配置：
  - 题目：A goldfish population is modeled by $\frac{dN}{dt}=N\left(\frac{N}{6}-1\right)\left(1-\frac{N}{20}\right)$ with $N(0)=7$. According to the slope field, an Euler approximation of $N(2)$ using step $\Delta t=0.5$ would be:
A. An under-estimate, because the solution seems to be concave up.
B. An under-estimate, because the solution seems to be concave down.
C. An over-estimate, because the solution seems to be concave up.
D. An over-estimate, because the solution seems to be concave down.
  - 已知：$\frac{dN}{dt}=N\left(\frac{N}{6}-1\right)\left(1-\frac{N}{20}\right)$；$N(0)=7$；$\Delta t=0.5$；斜率场显示从初值出发的解曲线向上弯
  - 目标：判断 Euler 方法在 $t=2$ 处是高估还是低估，并说明原因
  - 解题计划：先从斜率场判断解曲线的凹凸性 -> 把 Euler 折线理解为每一步沿当前切线直走 -> 比较 concave up 曲线与切线段的位置
  - 走读步骤：从 $N(0)=7$ 出发，斜率场中的解曲线看起来 concave up -> Euler 方法每一步使用当前点的切线方向，之后保持直线走到下一点 -> 对 concave up 的曲线，真实曲线会逐渐弯到切线段上方 -> 因此 Euler 折线给出的 $N(2)$ 位于真实值下方，是 under-estimate
  - 易错点：把斜率为正误认为一定高估；只看人口在增加，不看曲线相对切线的弯曲方向；把 concave up 和 over-estimate 直接绑定
  - 最终答案：A

### 12. 下次拿到微分方程，按这张 checklist 走
- 类型：slide
- 页面角色：summary
- 内容结构：math
- 讲解目标：形成可执行的解题顺序，能在反积分、FTC 检查、斜率场和 Euler 估计之间切换。
- 学生思考动作：下次遇到类似命题，我先问哪三个问题？
- 页面要点：
  - 反求函数：$\frac{dy}{dx}=f(x)$ → $dy=f(x)\,dx$ → 两边积分 → 写 $+C$
  - 初值定 $C$：把 $y(a)=b$ 翻译成点 $(a,b)$，代入通解
  - 检查积分表达式：圈上限 $g(x)$，写 $f(g(x))g'(x)$，再看上下限方向
  - 读斜率场：先找零斜率线，再看斜率只随 $x$、只随 $y$，还是随两者变化
- 前后衔接：
  - 本页任务：下次遇到类似命题，我先问哪三个问题？

## 原始 JSON

完整响应另存为：`/Users/dongpochen/Github/OpenMAIC/tmp/notebook-outlines/06_partical_fictions_outline_v6_gpt55.raw.json`
