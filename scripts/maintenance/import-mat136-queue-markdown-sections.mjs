#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();

function loadEnvFiles() {
  for (const envFile of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, envFile);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] != null) continue;
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnvFiles();

const DEFAULT_COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const COURSE_ID = process.env.MAT136_COURSE_ID || DEFAULT_COURSE_ID;
const IMPORT_VERSION = 'mat136-curated-markdown-sections-2026-06-12';

const NOTEBOOKS = [
  {
    lectureNo: '01',
    file: '01_Definite_Integral.pdf',
    notebookId: 'queue-mat136-01-definite-integral',
    label: '定积分',
  },
  {
    lectureNo: '02',
    file: '02_换元法.pdf',
    notebookId: 'queue-mat136-02-substitution',
    label: '换元法',
  },
  {
    lectureNo: '03',
    file: '03_逆换元法.pdf',
    notebookId: 'queue-mat136-03-inverse-substitution',
    label: '逆换元法',
  },
  {
    lectureNo: '04',
    file: '04_Area_Volume_学生版.pdf',
    notebookId: 'queue-mat136-04-area-volume',
    label: '面积与体积',
  },
  {
    lectureNo: '05',
    file: '05分步积分.pdf',
    notebookId: 'queue-mat136-05-integration-by-parts',
    label: '分部积分',
  },
  {
    lectureNo: '06',
    file: '06_Partical_fictions.pdf',
    notebookId: 'queue-mat136-06-differential-equations',
    label: '微分方程',
  },
  {
    lectureNo: '07',
    file: '07_Sequence.pdf',
    notebookId: 'queue-mat136-07-sequence',
    label: '数列',
  },
  {
    lectureNo: '08',
    file: '08_ Improper integrals .pdf',
    notebookId: 'queue-mat136-08-improper-integrals',
    label: '反常积分',
  },
  {
    lectureNo: '09',
    file: '09_Series.pdf',
    notebookId: 'queue-mat136-09-series',
    label: '级数',
  },
  {
    lectureNo: '10',
    file: '10_幂级数.pdf',
    notebookId: 'queue-mat136-10-power-series',
    label: '幂级数',
  },
  {
    lectureNo: '11',
    file: '11_Taylor_series.pdf',
    notebookId: 'queue-mat136-11-taylor-series',
    label: '泰勒级数',
  },
];

function md(markdown) {
  return markdown.trim().replace(/\n{3,}/g, '\n\n');
}

function section(title, summary, markdown) {
  return { title, summary, markdown: md(markdown) };
}

const CURATED_SECTIONS = {
  'queue-mat136-01-definite-integral': [
    section(
      '面积、位移与黎曼和',
      '用小矩形逼近面积，并从求和式读出区间、宽度和采样点。',
      String.raw`
## 本节目标

定积分先不要背公式，把它看成“很多小矩形面积的极限”。如果区间是 $[a,b]$，分成 $n$ 份：

$$
\Delta x=\frac{b-a}{n},\qquad x_i=a+i\Delta x
$$

右端点黎曼和常写成

$$
\sum_{i=1}^{n} f(x_i)\Delta x
$$

当 $n\to\infty$ 时，小矩形越来越细，极限就是

$$
\int_a^b f(x)\,dx
$$

记住四个部件：区间 $[a,b]$、宽度 $\Delta x$、采样点 $x_i$、高度 $f(x_i)$。
`,
    ),
    section(
      '左右端点与高估低估',
      '用函数单调性判断 left/right sum 是 overestimate 还是 underestimate。',
      String.raw`
## 判断规则

对递增函数：

- 左端点矩形偏低，所以 left-hand sum 是 underestimate。
- 右端点矩形偏高，所以 right-hand sum 是 overestimate。

对递减函数，结论反过来。

## 做题格式

1. 先写出函数在区间上递增还是递减。
2. 再说明采样点在每个小区间的左边还是右边。
3. 最后判断矩形高度比真实曲线高还是低。

不要只看图猜答案；题目给公式时也可以用导数符号或函数形状判断单调性。
`,
    ),
    section(
      '定积分的基础性质',
      '整理线性、拆区间、换方向和零长度区间这些常用性质。',
      String.raw`
## 常用性质

线性性质：

$$
\int_a^b \big(c f(x)+d g(x)\big)\,dx
=c\int_a^b f(x)\,dx+d\int_a^b g(x)\,dx
$$

拆区间：

$$
\int_a^b f(x)\,dx=\int_a^c f(x)\,dx+\int_c^b f(x)\,dx
$$

换方向会变号：

$$
\int_a^b f(x)\,dx=-\int_b^a f(x)\,dx
$$

同一点到同一点面积为 0：

$$
\int_a^a f(x)\,dx=0
$$

这些性质适用于 $c$ 在不在 $[a,b]$ 内的情况；关键是区间方向和符号不能乱。
`,
    ),
    section(
      '微积分基本定理 II：把面积变成端点差',
      '用原函数计算定积分，核心是 F(b)-F(a)。',
      String.raw`
## 公式

如果 $F'(x)=f(x)$，那么

$$
\int_a^b f(x)\,dx=F(b)-F(a)
$$

这就是微积分基本定理第二部分。它把“累积面积”变成“原函数在端点的差”。

## 计算模板

1. 找一个原函数 $F$。
2. 写成 $F(x)\big|_a^b$。
3. 代入上端点减下端点。

例：

$$
\int_1^3 2x\,dx=x^2\big|_1^3=9-1=8
$$
`,
    ),
    section(
      '微积分基本定理 I：变上限积分求导',
      '面积函数求导会回到 integrand；变上限需要链式法则。',
      String.raw`
## 基本形式

定义面积函数

$$
G(x)=\int_a^x f(t)\,dt
$$

则

$$
G'(x)=f(x)
$$

如果上限是 $g(x)$，要乘上限导数：

$$
\frac{d}{dx}\int_a^{g(x)}f(t)\,dt=f(g(x))g'(x)
$$

如果下限也会动：

$$
\frac{d}{dx}\int_{u(x)}^{v(x)}f(t)\,dt
=f(v(x))v'(x)-f(u(x))u'(x)
$$

变量名不重要，$t$、$u$、$s$ 都只是积分内部的 dummy variable。
`,
    ),
    section(
      '从求和式反推定积分',
      '把复杂的极限求和式翻译成一个定积分。',
      String.raw`
## 翻译步骤

看到

$$
\lim_{n\to\infty}\sum_{i=1}^n f(a+i\Delta x)\Delta x
$$

就按下面检查：

1. 找 $\Delta x$，由它判断区间长度 $b-a$。
2. 看采样点 $a+i\Delta x$，读出左端点 $a$。
3. 把高度部分写成 integrand。
4. 得到 $\int_a^b f(x)\,dx$。

## 自检

- 求和号里的 $\Delta x$ 有没有保留下来？
- 区间长度是不是 $n\Delta x$ 的极限？
- integrand 是否只保留成关于 $x$ 的函数？
- 最后结果是定积分，不是还带着 $i$ 和 $n$ 的式子。
`,
    ),
  ],

  'queue-mat136-02-substitution': [
    section(
      '换元法的核心想法',
      '把复杂的内层表达式命名为 u，让积分回到熟悉形状。',
      String.raw`
## 一句话

换元法就是反向使用链式法则。若 $u=g(x)$，则

$$
du=g'(x)\,dx
$$

原积分中如果同时出现 $g(x)$ 和接近 $g'(x)\,dx$ 的部分，就可以把它换成关于 $u$ 的积分。

## 典型结构

$$
\int f(g(x))g'(x)\,dx=\int f(u)\,du
$$

做题时先找“里面那一团”，再检查外面有没有它的导数。
`,
    ),
    section(
      '怎样选择 u',
      '优先选括号、根号、指数、三角函数里面的表达式。',
      String.raw`
## 常见选择

- 括号整体：$(3x+1)^7$ 里选 $u=3x+1$。
- 根号里面：$\sqrt{1+x^2}$ 里选 $u=1+x^2$。
- 指数里面：$e^{5x-2}$ 里选 $u=5x-2$。
- 三角里面：$\sin(2x)$ 里选 $u=2x$。

## 检查 du

选好 $u$ 后立刻写 $du$，例如：

$$
u=3x+1,\qquad du=3\,dx,\qquad dx=\frac{1}{3}du
$$

差一个常数通常可以补出来；如果差的是变量，可能要把剩余变量也改写成 $u$，或者改选 $u$。
`,
    ),
    section(
      '不定积分流程',
      '换元、积分、回代，三步缺一不可。',
      String.raw`
## 标准步骤

1. 令 $u=g(x)$，写出 $du=g'(x)\,dx$。
2. 把 integrand 和 $dx$ 全部改成 $u$ 和 $du$。
3. 在 $u$ 系统里积分。
4. 回代 $u=g(x)$。
5. 加上 $+C$。

例：

$$
\int x(1+x^2)^4\,dx
$$

令 $u=1+x^2$，则 $du=2x\,dx$：

$$
\int x(1+x^2)^4\,dx=\frac12\int u^4\,du
=\frac{u^5}{10}+C=\frac{(1+x^2)^5}{10}+C
$$
`,
    ),
    section(
      '定积分换元',
      '定积分换元时上下限也要换，换完后不必回到 x。',
      String.raw`
## 关键区别

不定积分最后要回代 $x$；定积分可以直接把上下限也换成 $u$。

如果 $u=g(x)$，原区间是 $x=a$ 到 $x=b$，新上下限是

$$
u=g(a)\quad\text{到}\quad u=g(b)
$$

例：

$$
\int_0^1 2x e^{x^2}\,dx
$$

令 $u=x^2$，则 $du=2x\,dx$。上下限变为 $0$ 到 $1$：

$$
\int_0^1 e^u\,du=e-1
$$
`,
    ),
    section(
      '特殊题型：缩放与对称',
      '已知积分值时，重点是变量缩放带来的 dx 因子。',
      String.raw`
## 缩放型

若已知 $\int_a^b f(x)\,dx$，遇到 $\int f(kx+c)\,dx$ 时，令 $u=kx+c$，会出现

$$
dx=\frac{1}{k}du
$$

所以区间和面积都会被缩放。

## 对称型

三角函数或偶奇函数题，先观察区间是否对称。常见结论：

- 奇函数在 $[-a,a]$ 上积分为 0。
- 偶函数在 $[-a,a]$ 上积分为 $2\int_0^a f(x)\,dx$。

但只有确认函数确实是奇函数或偶函数后才能用。
`,
    ),
    section(
      '换元法自检',
      '防止变量残留、常数丢失和上下限错误。',
      String.raw`
## 常见错误

- 换成 $u$ 后 integrand 里还残留 $x$。
- $du$ 中的常数因子漏掉。
- 不定积分忘记回代。
- 定积分换了 integrand，却没有换上下限。
- 把 $dx$ 当成可有可无的装饰，导致少乘一个因子。

## 最后一眼

一行积分里只能有一套变量：要么全是 $x,dx$，要么全是 $u,du$。混着写就是还没换完。
`,
    ),
  ],

  'queue-mat136-03-inverse-substitution': [
    section(
      '逆换元法解决什么问题',
      '用三角代换把根号里的平方结构变简单。',
      String.raw`
## 适用场景

当普通换元不能处理下面这些根号时，可以考虑逆换元法：

$$
\sqrt{a^2-x^2},\qquad \sqrt{a^2+x^2},\qquad \sqrt{x^2-a^2}
$$

核心是把 $x$ 换成三角表达式，让平方恒等式消掉根号。

逆换元不是第一选择。先看普通换元、代数化简和配方；如果根号结构仍然明显，再使用三角代换。
`,
    ),
    section(
      '三种根号对应三种代换',
      '按根号形状选择 sin、tan 或 sec。',
      String.raw`
## 对照表

$$
\sqrt{a^2-x^2}\quad\Rightarrow\quad x=a\sin\theta
$$

因为 $1-\sin^2\theta=\cos^2\theta$。

$$
\sqrt{a^2+x^2}\quad\Rightarrow\quad x=a\tan\theta
$$

因为 $1+\tan^2\theta=\sec^2\theta$。

$$
\sqrt{x^2-a^2}\quad\Rightarrow\quad x=a\sec\theta
$$

因为 $\sec^2\theta-1=\tan^2\theta$。

选择代换后，第一步永远是同时写 $dx$。
`,
    ),
    section(
      'dx、恒等式与回代',
      '代换后要完整替换 x、dx 和根号，最后回到原变量。',
      String.raw`
## 操作模板

以 $x=a\sin\theta$ 为例：

$$
dx=a\cos\theta\,d\theta
$$

并且

$$
\sqrt{a^2-x^2}
=\sqrt{a^2-a^2\sin^2\theta}
=a\cos\theta
$$

不定积分完成后要回代。常用方法是画直角三角形，或者用

$$
\theta=\arcsin\frac{x}{a}
$$

回代时不要把 $\theta$ 留在最后答案里，除非题目本来就要求用三角变量表示。
`,
    ),
    section(
      '定积分中的角度上下限',
      '定积分可以直接把 x 上下限换成 theta 上下限。',
      String.raw`
## 定积分更省事

如果原积分是 $x=\alpha$ 到 $x=\beta$，代换 $x=a\sin\theta$ 后，上下限变成

$$
\theta=\arcsin\frac{\alpha}{a}\quad\text{到}\quad
\theta=\arcsin\frac{\beta}{a}
$$

换完以后可以一直在 $\theta$ 里算到结果，不需要再回到 $x$。

## 注意范围

角度范围要和代换一致。通常选让 $\cos\theta\ge 0$ 或 $\tan\theta\ge 0$ 的主区间，避免根号符号混乱。
`,
    ),
    section(
      '配方后再逆换元',
      '不是所有根号一开始就长成标准形，先把平方配出来。',
      String.raw`
## 配方模板

遇到

$$
\sqrt{-x^2+4x+5}
$$

先整理：

$$
-x^2+4x+5=9-(x-2)^2
$$

此时令

$$
x-2=3\sin\theta
$$

也就是说，被代换的不一定是 $x$ 本身，可能是 $x-c$。

## 做题顺序

先配方，再识别三种形状，最后选代换。
`,
    ),
    section(
      '逆换元法自检',
      '选错形状、漏写 dx、回代不完整是最常见问题。',
      String.raw`
## 检查清单

- 根号是否已经整理成标准形？
- 选择的代换是否匹配平方恒等式？
- $dx$ 是否已经换成关于 $\theta$ 的形式？
- 不定积分最后是否回到 $x$？
- 定积分上下限是否已经换成角度？
- 三角函数平方积分是否需要半角公式？

逆换元法计算量大，写清每一步比心算更重要。
`,
    ),
  ],

  'queue-mat136-04-area-volume': [
    section(
      '曲线间面积',
      '先找交点和上下关系，再建立面积积分。',
      String.raw`
## 竖直切片

如果用 $dx$ 切片，每片高度是上方函数减下方函数：

$$
A=\int_a^b \big(\text{top}-\text{bottom}\big)\,dx
$$

## 水平切片

如果用 $dy$ 切片，每片长度是右边函数减左边函数：

$$
A=\int_c^d \big(\text{right}-\text{left}\big)\,dy
$$

先画区域或至少列交点。谁在上、谁在右如果会改变，就必须分段。
`,
    ),
    section(
      '什么时候换成 dy',
      '水平切片适合左右边界比上下边界更简单的区域。',
      String.raw`
## 选择切片方向

优先选不用分段、边界表达式更简单的方向。

典型需要 $dy$ 的情况：

- 区域用 $x$ 表示成 $y$ 的函数更自然。
- 竖直切片会遇到左右分叉或上下关系变化。
- 几何宽度明显是 right-left。

## 书写提醒

如果用 $dy$，积分上下限必须是 $y$ 值；被积函数也必须写成关于 $y$ 的表达式。
`,
    ),
    section(
      '截面积法算体积',
      '先写每一片的截面积 A(x) 或 A(y)，再积分。',
      String.raw`
## 核心公式

体积可以看成很多薄片截面积的累积：

$$
V=\int_a^b A(x)\,dx
$$

如果用水平切片：

$$
V=\int_c^d A(y)\,dy
$$

常见截面：

- 圆：$A=\pi r^2$
- 正方形：$A=s^2$
- 等腰直角三角形：$A=\frac12 s^2$

题目给几何形状时，重点是先把半径、边长或高度写成变量的函数。
`,
    ),
    section(
      '旋转体：圆盘与垫片',
      '围绕坐标轴旋转时，半径是到旋转轴的距离。',
      String.raw`
## 圆盘法

如果截面是实心圆盘：

$$
V=\pi\int_a^b R(x)^2\,dx
$$

## 垫片法

如果中间有洞：

$$
V=\pi\int_a^b \big(R(x)^2-r(x)^2\big)\,dx
$$

其中 $R$ 是外半径，$r$ 是内半径。半径不是曲线本身，而是“曲线到旋转轴的距离”。
`,
    ),
    section(
      '建立积分的例题模板',
      '面积和体积题通常重在 setup，不要急着算。',
      String.raw`
## 曲线间面积

1. 解交点。
2. 判断上下或左右。
3. 选择 $dx$ 或 $dy$。
4. 写出积分。

## 体积题

1. 判断切片方向。
2. 写出几何截面积。
3. 把几何量转成变量表达式。
4. 对截面积积分。

如果题目只问 setup，停在正确的积分式即可，不需要多算。
`,
    ),
    section(
      '面积与体积自检',
      '避免上下颠倒、方向错用和单位混淆。',
      String.raw`
## 常见错误

- 面积写成 bottom-top 或 left-right，导致负值。
- 已经用 $dy$，却还把函数写成 $y=f(x)$。
- 体积忘记平方半径。
- 垫片法把内外半径顺序写反。
- 截面积法把长度直接积分成体积，少写了面积公式。

## 快速检查

面积单位应是平方单位；体积单位应是立方单位。若 integrand 的单位不对，setup 多半有问题。
`,
    ),
  ],

  'queue-mat136-05-integration-by-parts': [
    section(
      '分部积分来自乘积法则',
      '把乘积求导公式反过来用，处理两个函数相乘的积分。',
      String.raw`
## 公式

乘积法则：

$$
(uv)'=u'v+uv'
$$

移项并积分得到分部积分：

$$
\int u\,dv=uv-\int v\,du
$$

也常写成

$$
\int u v'\,dx=uv-\int u'v\,dx
$$

分部积分的目标不是套公式，而是让剩下的积分更简单。
`,
    ),
    section(
      '如何选择 u 和 dv',
      '选 u 的原则是求导后变简单，选 dv 的原则是容易积分。',
      String.raw`
## 选择经验

常用优先级可以记作：

反三角、对数、多项式、三角、指数

它不是硬规则，只是提醒：$u$ 最好求导后更简单，$dv$ 最好能直接积分。

## 四格表

每题建议先列：

- $u$
- $du$
- $dv$
- $v$

然后再代入 $\int u\,dv=uv-\int v\,du$。
`,
    ),
    section(
      '基础例题模板',
      '用 x e^x、ln x、x cos x 这些题掌握结构。',
      String.raw`
## 例：$\int x e^x\,dx$

令

$$
u=x,\qquad dv=e^x\,dx
$$

则

$$
du=dx,\qquad v=e^x
$$

所以

$$
\int x e^x\,dx=xe^x-\int e^x\,dx=xe^x-e^x+C
$$

## 单函数也能分部

例如 $\int \ln x\,dx$，把 $1\,dx$ 当作 $dv$。
`,
    ),
    section(
      '重复分部与先换元再分部',
      '多项式乘指数或三角时，可能要连续分部。',
      String.raw`
## 重复分部

遇到 $x^n e^x$、$x^n\sin x$、$x^n\cos x$，通常让 $u=x^n$，因为每次求导次数都会下降。

## 先判断是否需要换元

有些题看起来像分部积分，但先换元会更轻：

$$
\int x^3\cos(x^2)\,dx
$$

可先令 $u=x^2$，把 $x^3\,dx$ 拆成 $x^2\cdot x\,dx$，再看是否需要分部。

先化简结构，再决定工具。
`,
    ),
    section(
      '定积分版本',
      '边界项 uv 也要代上下限，不能只处理剩余积分。',
      String.raw`
## 公式

$$
\int_a^b u\,dv=uv\big|_a^b-\int_a^b v\,du
$$

定积分分部时有两个地方要处理边界：

1. 边界项 $uv\big|_a^b$。
2. 剩余定积分 $\int_a^b v\,du$。

如果中途换元，也要保证上下限属于当前变量系统。
`,
    ),
    section(
      '分部积分自检',
      '主要检查角色、符号、边界和剩余积分是否真的变简单。',
      String.raw`
## 常见错误

- 把 $u$ 和 $dv$ 选反，导致剩余积分更难。
- 忘记减号：$uv-\int v\,du$。
- $v$ 积分时漏常数因子。
- 定积分边界项没有代入。
- 多次分部时符号没有跟住。

## 判断是否成功

分部后剩下的积分应当更简单。如果没有变轻，回头重新选 $u$ 和 $dv$。
`,
    ),
  ],

  'queue-mat136-06-differential-equations': [
    section(
      '微分方程和初值问题',
      '微分方程给变化率，初值从一族解中选出一条曲线。',
      String.raw`
## 基本概念

微分方程描述函数和它的导数之间的关系，例如：

$$
\frac{dy}{dx}=2x
$$

积分得到一族解：

$$
y=x^2+C
$$

若再给初值 $y(3)=5$，就可以求出唯一的 $C$。

## 做题顺序

先求通解，再代初值。不要一开始就把初值塞进导数方程里。
`,
    ),
    section(
      '直接积分与分离变量',
      '把 dy/dx 改写成可积分的形式。',
      String.raw`
## 直接积分

如果右边只含 $x$：

$$
\frac{dy}{dx}=f(x)
\quad\Rightarrow\quad
y=\int f(x)\,dx
$$

## 分离变量

如果可以整理成

$$
g(y)\,dy=f(x)\,dx
$$

就两边积分。

积分后通常会出现常数 $C$。如果有初值，用初值确定它。
`,
    ),
    section(
      '用微积分基本定理检查积分形式的解',
      '变上限积分求导时要同时用微积分基本定理和链式法则。',
      String.raw`
## 常见题型

题目给出一个候选函数：

$$
y(x)=\int_{a}^{g(x)} f(t)\,dt
$$

要求判断它是否满足某个微分方程。

直接求导：

$$
y'(x)=f(g(x))g'(x)
$$

如果下限也会动，则上限贡献减下限贡献。

这类题不一定需要算出积分的闭式表达；直接用微积分基本定理检查即可。
`,
    ),
    section(
      '斜率场怎么读',
      '斜率场把每个点的 dy/dx 画成一小段方向线。',
      String.raw`
## 读图规则

若

$$
\frac{dy}{dx}=F(x,y)
$$

每个点 $(x,y)$ 的小线段斜率就是 $F(x,y)$。

常见特征：

- 只依赖 $x$：同一竖线上的斜率相同。
- 只依赖 $y$：同一水平线上的斜率相同。
- 有零斜率线：解曲线经过那里会变平。
- 平衡解：若 $F(x,y)=0$ 对某个 $y$ 恒成立，解可能停在该水平线上。

匹配斜率场先看正负区域，再看零斜率线和条纹方向。
`,
    ),
    section(
      '欧拉方法',
      '用当前点的斜率走一小步，近似下一点。',
      String.raw`
## 更新公式

给步长 $h$，当前点是 $(x_n,y_n)$：

$$
y_{n+1}=y_n+hF(x_n,y_n)
$$

$$
x_{n+1}=x_n+h
$$

每一步都要用“当前点”的斜率，不是用终点斜率。

## 误差判断

如果真实解曲线向上凹，切线法常低估；如果向下凹，常高估。具体仍要结合图像和方程判断。
`,
    ),
    section(
      '微分方程自检',
      '检查变量、常数、初值和斜率场特征。',
      String.raw`
## 常见错误

- 忘记积分常数 $C$。
- 初值没有代回去求 $C$。
- 分离变量时把 $x$ 和 $y$ 混在同一侧。
- 微积分基本定理求导漏乘上限导数。
- 欧拉方法每一步没有更新斜率。
- 斜率场只靠视觉猜，不检查零斜率线。

## 最后检查

把答案对原微分方程求导验证一次，是最稳的收尾。
`,
    ),
  ],

  'queue-mat136-07-sequence': [
    section(
      '数列是什么',
      '数列是按自然数编号的一串数，重点是 n 趋向无穷时的行为。',
      String.raw`
## 记号

数列写成

$$
\{a_n\}_{n=1}^{\infty}
$$

其中 $a_n$ 是第 $n$ 项。

讨论数列收敛，就是问：

$$
\lim_{n\to\infty}a_n
$$

是否存在且是有限数。

数列不是级数。数列看的是 $a_n$，级数看的是 $\sum a_n$。
`,
    ),
    section(
      '显式数列的常见极限',
      '先看最高次项、指数大小、振荡幅度和夹逼结构。',
      String.raw`
## 常见模式

- 有理式：分子分母同除最高次幂。
- 几何型：若 $|r|<1$，则 $r^n\to 0$。
- 指数衰减：$e^{-n}\to 0$。
- 振荡项：看振幅是否趋于 0。

例：

$$
\frac{(-1)^n}{n}\to 0
$$

因为虽然符号振荡，但大小被 $1/n$ 夹住。

对 $\sin n/n$ 也可用夹逼：

$$
-\frac1n\le \frac{\sin n}{n}\le \frac1n
$$
`,
    ),
    section(
      '递归数列',
      '递归数列由初始项和递推公式一步步生成。',
      String.raw`
## 例子

$$
a_{n+1}=\sqrt{2+a_n},\qquad a_1=1
$$

处理递归数列时，先列前几项观察趋势，但观察不能代替证明。

## 标准路线

1. 猜测数列是否递增或递减。
2. 证明它有上界或下界。
3. 用单调有界定理得到收敛。
4. 设极限为 $L$，代入递推式求 $L$。
`,
    ),
    section(
      '单调有界定理',
      '单调加有界是证明递归数列收敛的常用入口。',
      String.raw`
## 定理

如果数列递增且有上界，则它收敛。

如果数列递减且有下界，则它收敛。

## 证明格式

证明递增通常写：

$$
a_{n+1}\ge a_n
$$

证明有上界通常用归纳法，例如证明 $a_n\le 2$。

注意：只有 bounded 不够，只有 monotone 也可能发散。两者一起才给出收敛。
`,
    ),
    section(
      '求递归极限',
      '先证明极限存在，再把递推式两边取极限。',
      String.raw`
## 格式

如果已经知道 $a_n\to L$，且

$$
a_{n+1}=\sqrt{2+a_n}
$$

则

$$
L=\sqrt{2+L}
$$

平方后：

$$
L^2-L-2=0
$$

所以 $L=2$ 或 $L=-1$。若数列为正，则排除 $-1$，得到 $L=2$。

不能先解这个方程，再拿它当作收敛证明。
`,
    ),
    section(
      '数列自检',
      '区分显式和递归，警惕振荡和逻辑跳步。',
      String.raw`
## 常见错误

- 看到 $(-1)^n$ 就直接说发散，没有检查振幅。
- 把 bounded 当成 convergent。
- 递归数列没有证明收敛就直接设极限。
- 候选极限有多个根时，没有用数列范围排除。
- 混淆 sequence 和 series。

## 判断入口

先问：这是显式公式，还是递归定义？不同类型对应不同工具。
`,
    ),
  ],

  'queue-mat136-08-improper-integrals': [
    section(
      '什么是反常积分',
      '无限区间或 integrand 在端点/内部爆掉时，要用极限定义。',
      String.raw`
## 两类危险

1. 区间无限，例如 $\int_1^\infty f(x)\,dx$。
2. integrand 在端点或区间内部无定义，例如 $\int_0^1 \frac1{\sqrt{x}}\,dx$。

反常积分不是直接代 $\infty$ 或爆点，而是先截断，再取极限。

每道题第一步：找所有危险点。
`,
    ),
    section(
      '极限定义',
      '无限端点、端点奇点和内部奇点分别处理。',
      String.raw`
## 无限端点

$$
\int_a^\infty f(x)\,dx
=\lim_{t\to\infty}\int_a^t f(x)\,dx
$$

## 端点奇点

如果 $f$ 在 $a$ 附近爆掉：

$$
\int_a^b f(x)\,dx
=\lim_{t\to a^+}\int_t^b f(x)\,dx
$$

## 内部奇点

若 $c$ 在 $(a,b)$ 内是危险点：

$$
\int_a^b f(x)\,dx=\int_a^c f(x)\,dx+\int_c^b f(x)\,dx
$$

两段都收敛，整体才收敛。
`,
    ),
    section(
      'p-积分规则',
      '无穷远和 0 附近的 p 规则方向相反。',
      String.raw`
## 无穷远

$$
\int_1^\infty \frac1{x^p}\,dx
$$

当 $p>1$ 收敛；当 $p\le 1$ 发散。

## 0 附近

$$
\int_0^1 \frac1{x^p}\,dx
$$

当 $p<1$ 收敛；当 $p\ge 1$ 发散。

同一个 $p$，危险点不同，结论可能相反。做题时先确认危险点在哪里。
`,
    ),
    section(
      '比较判别法',
      '证明收敛找更大的已知收敛函数；证明发散找更小的已知发散函数。',
      String.raw`
## 收敛方向

若 $0\le f(x)\le g(x)$，且

$$
\int g(x)\,dx
$$

收敛，则 $\int f(x)\,dx$ 收敛。

## 发散方向

若 $0\le g(x)\le f(x)$，且

$$
\int g(x)\,dx
$$

发散，则 $\int f(x)\,dx$ 发散。

比较前要确认函数在目标区间非负，或说明为什么可以比较绝对值。
`,
    ),
    section(
      '拆区间与有理函数',
      '分母为零或多个危险点时，先拆再判定。',
      String.raw`
## 拆区间

如果 integrand 在多个位置危险，不能用一个整体极限盖过去。逐段检查：

$$
\int_a^b f=\int_a^{c_1}f+\int_{c_1}^{c_2}f+\int_{c_2}^b f
$$

任何一段发散，整体就发散。

## 有理函数

先因式分解分母，找出分母为 0 的点。若危险点在积分区间内，必须拆区间；之后再考虑部分分式或比较判别。
`,
    ),
    section(
      '反常积分自检',
      '先找危险点，再选择极限计算或比较判别。',
      String.raw`
## 常见错误

- 忘记内部奇点。
- 把 $\infty$ 直接代入原函数。
- 只算其中一段就判断整体收敛。
- p-积分把无穷远和 0 附近规则混用。
- 比较方向反了。
- 振荡函数没有极限时，直接当成收敛。

## 做题入口

危险点在哪里？需要拆几段？每段用直接极限、p-积分，还是比较判别？
`,
    ),
  ],

  'queue-mat136-09-series': [
    section(
      '级数和部分和',
      '级数的收敛性由部分和数列决定。',
      String.raw`
## 概念

级数是无限求和：

$$
\sum_{n=1}^{\infty}a_n
$$

定义部分和：

$$
S_N=\sum_{n=1}^{N}a_n
$$

如果 $S_N$ 有有限极限，级数收敛；否则发散。

注意：$a_n$ 的极限和 $\sum a_n$ 的收敛是两件事。
`,
    ),
    section(
      '发散判别、几何级数和 p-级数',
      '先检查通项极限，再识别最基本的结构。',
      String.raw`
## 发散判别

如果

$$
\lim_{n\to\infty}a_n\ne 0
$$

或极限不存在，则 $\sum a_n$ 发散。

如果 $\lim a_n=0$，只能说发散判别没有判出发散，不能说级数收敛。

## 几何级数

$$
\sum ar^n
$$

当 $|r|<1$ 收敛；当 $|r|\ge 1$ 发散。

## p-级数

$$
\sum_{n=1}^{\infty}\frac1{n^p}
$$

当 $p>1$ 收敛；当 $p\le 1$ 发散。
`,
    ),
    section(
      '望远镜级数与积分判别',
      '能相消就先相消；积分判别要先检查条件。',
      String.raw`
## 望远镜级数

若

$$
a_n=b_n-b_{n+1}
$$

部分和会大量相消。写出前几项，不要只凭感觉省略。

## 积分判别法

对 $a_n=f(n)$，若 $f$ 在足够大的区间上 continuous、positive、decreasing，则

$$
\sum a_n
$$

与

$$
\int f(x)\,dx
$$

同收敛或同发散。

使用前必须说明三个条件。
`,
    ),
    section(
      '比较与极限比较',
      '非负项级数常用比较法处理。',
      String.raw`
## 直接比较法

证明收敛：找更大的已知收敛级数。

证明发散：找更小的已知发散级数。

## 极限比较法

若 $a_n,b_n>0$ 且

$$
\lim_{n\to\infty}\frac{a_n}{b_n}=L
$$

其中 $0<L<\infty$，则两个级数同收敛或同发散。

选择 $b_n$ 时看最高次项、根号主项或 dominant term。
`,
    ),
    section(
      '比值判别法与交错级数',
      '阶乘、指数和 n 次幂混合时优先用比值判别法。',
      String.raw`
## 比值判别法

计算

$$
L=\lim_{n\to\infty}\left|\frac{a_{n+1}}{a_n}\right|
$$

结论：

- $L<1$：绝对收敛。
- $L>1$ 或 $L=\infty$：发散。
- $L=1$：没有结论。

## 交错级数判别法

对 $\sum (-1)^n b_n$，若 $b_n\ge 0$、$b_n$ 递减且 $b_n\to 0$，则级数收敛。

还要区分 conditional convergence 和 absolute convergence。
`,
    ),
    section(
      '级数判别策略',
      '按通项极限、结构、比较、ratio 的顺序选工具。',
      String.raw`
## 推荐顺序

1. 先做发散判别。
2. 识别几何级数、p-级数、望远镜级数。
3. 如果像函数积分，考虑积分判别法。
4. 非负项用比较法或极限比较法。
5. 有阶乘、指数、幂混合，用比值判别法。
6. 有 $(-1)^n$，检查交错级数判别法，并再看绝对收敛。

## 常见错误

$\lim a_n=0$ 不是收敛结论；比值判别法的 $L=1$ 也不是收敛结论。
`,
    ),
  ],

  'queue-mat136-10-power-series': [
    section(
      '幂级数的直觉',
      '幂级数是在某个中心附近用无限多项式逼近函数。',
      String.raw`
## 形式

幂级数常写成

$$
\sum_{n=0}^{\infty} c_n(x-a)^n
$$

其中 $a$ 是中心。

它的收敛性取决于 $x$ 离中心多远。通常存在一个半径 $R$：

- $|x-a|<R$ 时收敛。
- $|x-a|>R$ 时发散。
- 端点要单独检查。
`,
    ),
    section(
      '中心、半径和区间',
      '先读中心，再用判别法求半径和开区间。',
      String.raw`
## 读中心

表达式 $(x-a)^n$ 的中心是 $a$。

若看到 $(x+2)^n$，中心是 $-2$。

## 收敛区间

若得到

$$
|x-a|<R
$$

则开区间是

$$
(a-R,a+R)
$$

最后还要检查 $x=a-R$ 和 $x=a+R$ 两个端点。
`,
    ),
    section(
      '用比值判别法求半径',
      '把 x 当作参数，先求相邻项比值。',
      String.raw`
## 模板

令

$$
a_n=c_n(x-a)^n
$$

计算

$$
L=\lim_{n\to\infty}\left|\frac{a_{n+1}}{a_n}\right|
$$

比值判别法要求 $L<1$。解这个不等式，就得到关于 $x$ 的开区间。

常见结果：

- 若 $L=0$ 对所有 $x$ 成立，则 $R=\infty$。
- 若只有 $x=a$ 可使级数收敛，则 $R=0$。
`,
    ),
    section(
      '端点检查',
      '端点必须代回原级数，不能从半径自动判断。',
      String.raw`
## 为什么要单独检查

比值判别法通常只给出开区间。端点处 $L=1$，测试没有结论。

## 检查方法

把端点 $x=a-R$、$x=a+R$ 代回原级数，可能变成：

- p-级数
- alternating series
- geometric series
- 发散判别

两个端点可能一个收敛、一个发散，所以必须分别写。
`,
    ),
    section(
      '常见模板与变量替换',
      '用已知幂级数时，要整体替换变量块。',
      String.raw`
## 基本模板

$$
\frac1{1-x}=\sum_{n=0}^{\infty}x^n,\qquad |x|<1
$$

如果是

$$
\frac1{1-(x-2)}
$$

就把模板中的 $x$ 整体换成 $x-2$，收敛条件也变成

$$
|x-2|<1
$$

不要只替换公式，不替换区间。
`,
    ),
    section(
      '幂级数自检',
      '中心、半径、端点和变量块是四个重点。',
      String.raw`
## 常见错误

- 把 $(x+2)$ 的中心读成 $2$。
- 只写半径，不写收敛区间。
- 端点没有代回原级数。
- 比值判别法化简时把含 $x$ 的部分丢掉。
- 用已知模板时忘记更新收敛条件。

## 最后答案格式

同时给出中心、半径、开区间和端点结论。
`,
    ),
  ],

  'queue-mat136-11-taylor-series': [
    section(
      '泰勒级数的主线',
      '用函数在中心点的导数拼出函数。',
      String.raw`
## 公式

函数在 $a$ 附近的泰勒级数是

$$
\sum_{n=0}^{\infty}\frac{f^{(n)}(a)}{n!}(x-a)^n
$$

当 $a=0$ 时，称为麦克劳林级数。

直觉：函数在中心点的函数值、一阶导数、二阶导数等，依次决定常数项、一次项、二次项等。
`,
    ),
    section(
      '直接展开的写法',
      '先列导数表，再代入泰勒公式。',
      String.raw`
## 标准步骤

1. 写出 $f(x), f'(x), f''(x), \ldots$。
2. 代入中心 $a$，得到 $f(a),f'(a),f''(a),\ldots$。
3. 放进

$$
f(a)+f'(a)(x-a)+\frac{f''(a)}{2!}(x-a)^2+\cdots
$$

直接展开时，不要只背答案；要让系数从导数值来。
`,
    ),
    section(
      '常用麦克劳林模板',
      '把常见函数的级数当作工具使用。',
      String.raw`
## 常用模板

$$
e^x=\sum_{n=0}^{\infty}\frac{x^n}{n!}
$$

$$
\sin x=\sum_{n=0}^{\infty}(-1)^n\frac{x^{2n+1}}{(2n+1)!}
$$

$$
\cos x=\sum_{n=0}^{\infty}(-1)^n\frac{x^{2n}}{(2n)!}
$$

$$
\frac1{1-x}=\sum_{n=0}^{\infty}x^n,\qquad |x|<1
$$

使用模板时，收敛区间也要跟着处理。
`,
    ),
    section(
      '由已知级数变形',
      '替换、求导、积分和乘法都可以生成新级数。',
      String.raw`
## 整体替换

$\sin(x^2)$ 是把 $\sin x$ 模板里的 $x$ 整体换成 $x^2$。

## 逐项求导与积分

在收敛区间内部，可以逐项求导或逐项积分。操作后要更新系数、幂次和常数项。

## 乘法

求前几项时，可以只把需要的低阶项相乘，不必写出完整无限级数。
`,
    ),
    section(
      '误差与近似',
      '泰勒多项式是有限项近似，余项描述误差。',
      String.raw`
## 泰勒多项式

取前 $N$ 项得到泰勒多项式：

$$
P_N(x)=\sum_{n=0}^{N}\frac{f^{(n)}(a)}{n!}(x-a)^n
$$

函数值可以写成

$$
f(x)=P_N(x)+R_N(x)
$$

其中 $R_N(x)$ 是余项。

项数增加通常让中心附近更准确，但仍受收敛区间限制。
`,
    ),
    section(
      '泰勒级数自检',
      '区分直接展开和套模板，注意中心与收敛区间。',
      String.raw`
## 常见错误

- 把泰勒展开中心写错。
- 麦克劳林级数和一般泰勒级数混用。
- 替换时没有替换整个变量块。
- 逐项积分后漏常数。
- 求前几项时阶数截错。
- 忘记检查收敛区间或端点。

## 做题入口

先判断：这题适合直接列导数表，还是由已知模板变形？
`,
    ),
  ],
};

const EXAMPLE_SECTIONS = {
  'queue-mat136-01-definite-integral': [
    section(
      '例题 1：用右端点黎曼和近似面积',
      '把区间、宽度、采样点和函数高度完整写出来。',
      String.raw`
## 题目

用 4 个右端点矩形近似

$$
\int_0^2 x^2\,dx
$$

## 解法

区间长度是 2，分成 4 份：

$$
\Delta x=\frac{2-0}{4}=\frac12
$$

右端点是

$$
x_1=\frac12,\quad x_2=1,\quad x_3=\frac32,\quad x_4=2
$$

右端点黎曼和：

$$
\left[\left(\frac12\right)^2+1^2+\left(\frac32\right)^2+2^2\right]\frac12
=\frac{15}{4}
$$

## 易错点

矩形宽度 $\Delta x$ 要乘在最后，不能只把高度加起来。
`,
    ),
    section(
      '例题 2：用定积分性质拆区间',
      '练习拆区间、换方向和线性性质。',
      String.raw`
## 题目

已知

$$
\int_1^4 f(x)\,dx=7,\qquad \int_1^2 f(x)\,dx=3
$$

求

$$
\int_4^2 2f(x)\,dx
$$

## 解法

先求

$$
\int_2^4 f(x)\,dx=\int_1^4 f(x)\,dx-\int_1^2 f(x)\,dx=4
$$

换方向：

$$
\int_4^2 f(x)\,dx=-4
$$

乘常数：

$$
\int_4^2 2f(x)\,dx=-8
$$

## 易错点

从 $4$ 到 $2$ 是反方向，符号一定会变。
`,
    ),
    section(
      '例题 3：用微积分基本定理计算',
      '把定积分转成原函数端点差。',
      String.raw`
## 题目

计算

$$
\int_1^3 (2x+1)\,dx
$$

## 解法

原函数是

$$
F(x)=x^2+x
$$

所以

$$
\int_1^3 (2x+1)\,dx=F(3)-F(1)
=(9+3)-(1+1)=10
$$

## 检查

答案是面积型数量。若 integrand 在区间上为正，结果也应为正。
`,
    ),
    section(
      '例题 4：变上下限积分求导',
      '上限和下限都变化时，上限贡献减下限贡献。',
      String.raw`
## 题目

求导：

$$
H(x)=\int_{x}^{x^2}\sqrt{1+t^3}\,dt
$$

## 解法

上限 $x^2$ 的贡献是

$$
\sqrt{1+(x^2)^3}\cdot 2x
$$

下限 $x$ 的贡献要减掉：

$$
\sqrt{1+x^3}\cdot 1
$$

所以

$$
H'(x)=2x\sqrt{1+x^6}-\sqrt{1+x^3}
$$

## 易错点

下限变化不是加号，而是减去下限贡献。
`,
    ),
  ],

  'queue-mat136-02-substitution': [
    section(
      '例题 1：括号整体换元',
      '选括号内部为 u，补出常数因子。',
      String.raw`
## 题目

计算

$$
\int 6x(3x^2+1)^4\,dx
$$

## 解法

令

$$
u=3x^2+1,\qquad du=6x\,dx
$$

于是

$$
\int 6x(3x^2+1)^4\,dx=\int u^4\,du
=\frac{u^5}{5}+C
$$

回代：

$$
\frac{(3x^2+1)^5}{5}+C
$$

## 易错点

不定积分最后要回代到 $x$。
`,
    ),
    section(
      '例题 2：差一个常数的换元',
      'du 和原式差常数时，把常数放到积分外。',
      String.raw`
## 题目

计算

$$
\int x\sqrt{1+x^2}\,dx
$$

## 解法

令

$$
u=1+x^2,\qquad du=2x\,dx
$$

所以

$$
x\,dx=\frac12du
$$

原式变成

$$
\frac12\int u^{1/2}\,du
=\frac12\cdot \frac{2}{3}u^{3/2}+C
=\frac13(1+x^2)^{3/2}+C
$$
`,
    ),
    section(
      '例题 3：定积分换元要换上下限',
      '定积分换元后可以不回代。',
      String.raw`
## 题目

计算

$$
\int_0^1 2x e^{x^2}\,dx
$$

## 解法

令 $u=x^2$，则 $du=2x\,dx$。

上下限：

$$
x=0\Rightarrow u=0,\qquad x=1\Rightarrow u=1
$$

因此

$$
\int_0^1 2x e^{x^2}\,dx=\int_0^1 e^u\,du=e-1
$$

## 易错点

如果已经换了上下限，最后答案直接是数值，不需要再回到 $x$。
`,
    ),
    section(
      '例题 4：三角平方先变形',
      '遇到三角平方，先用恒等式把结构整理清楚。',
      String.raw`
## 题目

计算

$$
\int \sin x\cos^3 x\,dx
$$

## 解法

令

$$
u=\cos x,\qquad du=-\sin x\,dx
$$

则

$$
\int \sin x\cos^3 x\,dx=-\int u^3\,du
=-\frac{u^4}{4}+C
$$

回代：

$$
-\frac{\cos^4 x}{4}+C
$$

## 选择思路

因为 $\sin x\,dx$ 正好接近 $\cos x$ 的导数，所以选 $u=\cos x$。
`,
    ),
  ],

  'queue-mat136-03-inverse-substitution': [
    section(
      '例题 1：根号 a²-x²',
      '用 x=a sin theta 消掉根号。',
      String.raw`
## 题目

计算

$$
\int \sqrt{4-x^2}\,dx
$$

## 解法入口

根号是 $\sqrt{a^2-x^2}$，其中 $a=2$，令

$$
x=2\sin\theta,\qquad dx=2\cos\theta\,d\theta
$$

根号变成

$$
\sqrt{4-4\sin^2\theta}=2\cos\theta
$$

所以原积分变成

$$
\int 4\cos^2\theta\,d\theta
$$

再用半角公式

$$
\cos^2\theta=\frac{1+\cos 2\theta}{2}
$$

完成后用三角形回代。
`,
    ),
    section(
      '例题 2：分母是 sqrt(4-x²)',
      '同一类根号也可能出现在分母。',
      String.raw`
## 题目

计算

$$
\int \frac{1}{\sqrt{4-x^2}}\,dx
$$

## 解法

令

$$
x=2\sin\theta,\qquad dx=2\cos\theta\,d\theta
$$

分母为

$$
\sqrt{4-x^2}=2\cos\theta
$$

因此

$$
\int \frac{1}{2\cos\theta}\cdot 2\cos\theta\,d\theta
=\int 1\,d\theta=\theta+C
$$

回代：

$$
\theta=\arcsin\frac{x}{2}
$$

答案：

$$
\arcsin\frac{x}{2}+C
$$
`,
    ),
    section(
      '例题 3：平方和用 tan',
      'sqrt(a²+x²) 对应 x=a tan theta。',
      String.raw`
## 题目

处理

$$
\int \frac{1}{x^2+9}\,dx
$$

## 解法

这里可令

$$
x=3\tan\theta,\qquad dx=3\sec^2\theta\,d\theta
$$

分母：

$$
x^2+9=9\tan^2\theta+9=9\sec^2\theta
$$

所以

$$
\int \frac{1}{x^2+9}\,dx
=\int \frac{3\sec^2\theta}{9\sec^2\theta}\,d\theta
=\frac13\theta+C
$$

回代：

$$
\frac13\arctan\frac{x}{3}+C
$$
`,
    ),
    section(
      '例题 4：先配方再代换',
      '根号不标准时，先整理成平方结构。',
      String.raw`
## 题目

选择代换来处理

$$
\sqrt{-x^2+4x+5}
$$

## 解法

先配方：

$$
-x^2+4x+5=9-(x-2)^2
$$

因此这是 $a^2-(x-2)^2$ 的形状，令

$$
x-2=3\sin\theta
$$

也就是

$$
x=2+3\sin\theta,\qquad dx=3\cos\theta\,d\theta
$$

## 易错点

代换的对象是 $x-2$，不是单独的 $x$。
`,
    ),
  ],

  'queue-mat136-04-area-volume': [
    section(
      '例题 1：y=x² 与 y=sqrt(x) 的面积',
      '先找交点，再写 top-bottom。',
      String.raw`
## 题目

求 $y=x^2$ 与 $y=\sqrt{x}$ 围成的面积。

## 解法

交点来自

$$
x^2=\sqrt{x}
$$

在 $x\ge 0$ 上得到 $x=0,1$。

在 $[0,1]$ 上，$\sqrt{x}$ 在上，$x^2$ 在下：

$$
A=\int_0^1(\sqrt{x}-x^2)\,dx
$$

计算：

$$
A=\left[\frac{2}{3}x^{3/2}-\frac{x^3}{3}\right]_0^1=\frac13
$$
`,
    ),
    section(
      '例题 2：绝对值曲线先分段',
      '上下关系改变时，必须拆区间。',
      String.raw`
## 题目

建立

$$
y=|x|,\qquad y=1
$$

围成面积的积分。

## 解法

交点是 $x=-1$ 和 $x=1$。在整个区间上，上方是 $1$，下方是 $|x|$：

$$
A=\int_{-1}^{1}(1-|x|)\,dx
$$

若要去掉绝对值，要拆成

$$
A=\int_{-1}^{0}(1+x)\,dx+\int_0^1(1-x)\,dx
$$

## 易错点

不要把 $|x|$ 直接当作 $x$ 用在整个区间。
`,
    ),
    section(
      '例题 3：圆锥体积',
      '用相似比例写半径，再积分截面积。',
      String.raw`
## 题目

高为 $h$、底面半径为 $R$ 的圆锥，求体积。

## 解法

令 $x$ 表示离顶点的高度。相似比例给出截面半径：

$$
r(x)=\frac{R}{h}x
$$

截面积：

$$
A(x)=\pi r(x)^2=\pi\frac{R^2}{h^2}x^2
$$

体积：

$$
V=\int_0^h \pi\frac{R^2}{h^2}x^2\,dx
=\frac{\pi R^2h}{3}
$$
`,
    ),
    section(
      '例题 4：绕 x 轴旋转的圆盘法',
      '半径是曲线到旋转轴的距离。',
      String.raw`
## 题目

把 $y=\sqrt{x}$、$0\le x\le 4$ 下方区域绕 $x$ 轴旋转，求体积。

## 解法

每个截面是圆盘，半径

$$
R(x)=\sqrt{x}
$$

所以

$$
V=\pi\int_0^4 R(x)^2\,dx
=\pi\int_0^4 x\,dx
=8\pi
$$

## 易错点

圆盘法要平方半径。这里半径是 $\sqrt{x}$，平方后才是 $x$。
`,
    ),
  ],

  'queue-mat136-05-integration-by-parts': [
    section(
      '例题 1：x e^x',
      '最基础的分部积分模板。',
      String.raw`
## 题目

计算

$$
\int x e^x\,dx
$$

## 解法

取

$$
u=x,\qquad dv=e^x\,dx
$$

则

$$
du=dx,\qquad v=e^x
$$

所以

$$
\int x e^x\,dx=xe^x-\int e^x\,dx=xe^x-e^x+C
$$
`,
    ),
    section(
      '例题 2：ln x',
      '单个对数也能把 1 dx 当作 dv。',
      String.raw`
## 题目

计算

$$
\int \ln x\,dx
$$

## 解法

令

$$
u=\ln x,\qquad dv=1\,dx
$$

则

$$
du=\frac1x\,dx,\qquad v=x
$$

所以

$$
\int \ln x\,dx=x\ln x-\int x\cdot \frac1x\,dx
=x\ln x-x+C
$$
`,
    ),
    section(
      '例题 3：先换元再分部',
      '有些题先换元会让分部积分更轻。',
      String.raw`
## 题目

计算

$$
\int x^3\cos(x^2)\,dx
$$

## 解法

先令

$$
w=x^2,\qquad dw=2x\,dx
$$

把 $x^3\,dx$ 写成 $x^2\cdot x\,dx$：

$$
\int x^3\cos(x^2)\,dx
=\frac12\int w\cos w\,dw
$$

再分部积分：取 $u=w$，$dv=\cos w\,dw$。

得到

$$
\frac12\left(w\sin w+\cos w\right)+C
=\frac12\left(x^2\sin(x^2)+\cos(x^2)\right)+C
$$
`,
    ),
    section(
      '例题 4：定积分分部',
      '边界项 uv 也要代入上下限。',
      String.raw`
## 题目

计算

$$
\int_0^1 x e^x\,dx
$$

## 解法

仍取 $u=x$，$dv=e^x\,dx$。定积分版本：

$$
\int_0^1 x e^x\,dx=xe^x\big|_0^1-\int_0^1 e^x\,dx
$$

计算：

$$
xe^x\big|_0^1=e
$$

$$
\int_0^1 e^x\,dx=e-1
$$

所以结果是

$$
e-(e-1)=1
$$
`,
    ),
  ],

  'queue-mat136-06-differential-equations': [
    section(
      '例题 1：初值问题',
      '先求通解，再用初值确定常数。',
      String.raw`
## 题目

解

$$
\frac{dy}{dx}=2x,\qquad y(3)=5
$$

## 解法

积分：

$$
y=x^2+C
$$

代入初值：

$$
5=3^2+C
$$

所以 $C=-4$，解为

$$
y=x^2-4
$$
`,
    ),
    section(
      '例题 2：分离变量',
      '把 y 和 x 放到不同侧再积分。',
      String.raw`
## 题目

解

$$
\frac{dy}{dx}=xy
$$

## 解法

若 $y\ne 0$，分离变量：

$$
\frac1y\,dy=x\,dx
$$

积分：

$$
\ln|y|=\frac{x^2}{2}+C
$$

指数化：

$$
y=Ce^{x^2/2}
$$

零解 $y=0$ 也满足原方程。
`,
    ),
    section(
      '例题 3：检查积分定义的解',
      '不需要算出积分，直接求导验证。',
      String.raw`
## 题目

令

$$
y(x)=\int_1^{x^2}\sin(t^3)\,dt
$$

求 $y'(x)$。

## 解法

由微积分基本定理和链式法则：

$$
y'(x)=\sin((x^2)^3)\cdot 2x=2x\sin(x^6)
$$

## 易错点

把上限 $x^2$ 代入 integrand 后，还要乘 $2x$。
`,
    ),
    section(
      '例题 4：欧拉方法走两步',
      '每一步都用当前点的斜率。',
      String.raw`
## 题目

用步长 $h=0.5$ 对

$$
y'=x+y,\qquad y(0)=1
$$

做两步欧拉近似。

## 解法

第 0 步：$(x_0,y_0)=(0,1)$，斜率 $0+1=1$。

$$
y_1=1+0.5(1)=1.5,\qquad x_1=0.5
$$

第 1 步：当前点 $(0.5,1.5)$，斜率 $2$。

$$
y_2=1.5+0.5(2)=2.5,\qquad x_2=1
$$

所以 $y(1)\approx 2.5$。
`,
    ),
  ],

  'queue-mat136-07-sequence': [
    section(
      '例题 1：有理式数列',
      '同除最高次幂看极限。',
      String.raw`
## 题目

求

$$
\lim_{n\to\infty}\frac{3n^2-n+1}{2n^2+5}
$$

## 解法

分子分母同除以 $n^2$：

$$
\frac{3-\frac1n+\frac1{n^2}}{2+\frac5{n^2}}
$$

令 $n\to\infty$，得到

$$
\frac32
$$
`,
    ),
    section(
      '例题 2：振荡但趋近 0',
      '符号振荡不一定发散，还要看大小。',
      String.raw`
## 题目

判断

$$
a_n=\frac{(-1)^n}{n}
$$

是否收敛。

## 解法

因为

$$
-\frac1n\le \frac{(-1)^n}{n}\le \frac1n
$$

两边都趋近 0，所以由夹逼定理：

$$
a_n\to 0
$$

## 易错点

不能看到 $(-1)^n$ 就直接说发散。
`,
    ),
    section(
      '例题 3：递归数列先证收敛',
      '用单调有界定理，再设极限。',
      String.raw`
## 题目

设

$$
a_1=1,\qquad a_{n+1}=\sqrt{2+a_n}
$$

求极限。

## 解法入口

先证明 $a_n\le 2$：若 $a_n\le 2$，则

$$
a_{n+1}=\sqrt{2+a_n}\le 2
$$

再证明递增：

$$
a_{n+1}\ge a_n
$$

可通过平方比较完成。于是数列递增且有上界，所以收敛。

设极限为 $L$：

$$
L=\sqrt{2+L}
$$

解得 $L=2$ 或 $L=-1$。数列为正，所以 $L=2$。
`,
    ),
    section(
      '例题 4：显式与递归不要混',
      '先判断题型，再选工具。',
      String.raw`
## 对比

显式数列：

$$
a_n=\frac{n}{n+1}
$$

直接对 $n\to\infty$ 求极限。

递归数列：

$$
a_{n+1}=\frac12(a_n+3)
$$

不能直接把 $n$ 代到公式里。通常要先证明收敛，再设 $L$：

$$
L=\frac12(L+3)
$$

得到 $L=3$。
`,
    ),
  ],

  'queue-mat136-08-improper-integrals': [
    section(
      '例题 1：无穷远 p-积分',
      'p>1 时尾巴衰减足够快。',
      String.raw`
## 题目

判断

$$
\int_1^\infty \frac1{x^2}\,dx
$$

是否收敛。

## 解法

用极限定义：

$$
\int_1^\infty \frac1{x^2}\,dx
=\lim_{t\to\infty}\int_1^t x^{-2}\,dx
$$

计算：

$$
\int_1^t x^{-2}\,dx=\left[-\frac1x\right]_1^t=1-\frac1t
$$

极限为 1，所以收敛。
`,
    ),
    section(
      '例题 2：0 附近的端点奇点',
      '靠近 0 时 p-积分规则和无穷远相反。',
      String.raw`
## 题目

判断

$$
\int_0^1 \frac1{\sqrt{x}}\,dx
$$

是否收敛。

## 解法

这是 $x^{-1/2}$，在 0 处有端点奇点：

$$
\int_0^1 x^{-1/2}\,dx
=\lim_{t\to 0^+}\int_t^1 x^{-1/2}\,dx
$$

计算：

$$
\int_t^1 x^{-1/2}\,dx=2-2\sqrt{t}
$$

极限为 2，所以收敛。
`,
    ),
    section(
      '例题 3：比较判别证明收敛',
      '用更大的已知收敛函数压住目标函数。',
      String.raw`
## 题目

判断

$$
\int_1^\infty \frac{\sin^2 x}{x^2}\,dx
$$

是否收敛。

## 解法

因为

$$
0\le \sin^2 x\le 1
$$

所以

$$
0\le \frac{\sin^2 x}{x^2}\le \frac1{x^2}
$$

而

$$
\int_1^\infty \frac1{x^2}\,dx
$$

收敛，所以原积分收敛。
`,
    ),
    section(
      '例题 4：内部奇点必须拆区间',
      '任何一段发散，整体就发散。',
      String.raw`
## 题目

判断

$$
\int_0^2 \frac1{x-1}\,dx
$$

## 解法

$x=1$ 是内部奇点，所以必须拆：

$$
\int_0^2 \frac1{x-1}\,dx
=\int_0^1 \frac1{x-1}\,dx+\int_1^2 \frac1{x-1}\,dx
$$

左段和右段都要分别用单侧极限。它们不收敛，因此整体发散。

## 易错点

不能直接写 $\ln|x-1|\big|_0^2$，因为中间有爆点。
`,
    ),
  ],

  'queue-mat136-09-series': [
    section(
      '例题 1：通项不趋零直接发散',
      '先做发散判别，避免浪费时间。',
      String.raw`
## 题目

判断

$$
\sum_{n=1}^{\infty}\frac{n}{n+1}
$$

是否收敛。

## 解法

通项极限：

$$
\lim_{n\to\infty}\frac{n}{n+1}=1
$$

不等于 0，所以级数发散。

## 易错点

通项极限存在不代表级数收敛；必须是通项趋近 0 才有可能收敛。
`,
    ),
    section(
      '例题 2：望远镜级数',
      '先写部分和，看哪些项相消。',
      String.raw`
## 题目

判断

$$
\sum_{n=1}^{\infty}\frac{1}{n(n+1)}
$$

## 解法

先部分分式：

$$
\frac1{n(n+1)}=\frac1n-\frac1{n+1}
$$

部分和：

$$
S_N=1-\frac12+\frac12-\frac13+\cdots+\frac1N-\frac1{N+1}
=1-\frac1{N+1}
$$

所以

$$
\lim_{N\to\infty}S_N=1
$$

级数收敛，和为 1。
`,
    ),
    section(
      '例题 3：比值判别法',
      '阶乘和指数混合时，比相邻项最直接。',
      String.raw`
## 题目

判断

$$
\sum_{n=1}^{\infty}\frac{2^n}{n!}
$$

## 解法

令

$$
a_n=\frac{2^n}{n!}
$$

计算

$$
\left|\frac{a_{n+1}}{a_n}\right|
=\frac{2^{n+1}}{(n+1)!}\cdot \frac{n!}{2^n}
=\frac{2}{n+1}
$$

极限为 0，小于 1，所以级数收敛。
`,
    ),
    section(
      '例题 4：交错级数与绝对收敛',
      '先看交错判别，再看绝对值级数。',
      String.raw`
## 题目

判断

$$
\sum_{n=1}^{\infty}\frac{(-1)^{n+1}}{n}
$$

## 解法

令 $b_n=1/n$。它递减且趋近 0，所以交错级数收敛。

再看绝对值级数：

$$
\sum_{n=1}^{\infty}\left|\frac{(-1)^{n+1}}{n}\right|
=\sum_{n=1}^{\infty}\frac1n
$$

调和级数发散。

所以原级数是条件收敛，不是绝对收敛。
`,
    ),
  ],

  'queue-mat136-10-power-series': [
    section(
      '例题 1：读中心和半径',
      '先从 x-a 读中心，再解绝对值不等式。',
      String.raw`
## 题目

求

$$
\sum_{n=0}^{\infty}\frac{(x-2)^n}{3^n}
$$

的收敛区间。

## 解法

这是几何级数，公比

$$
r=\frac{x-2}{3}
$$

要求

$$
\left|\frac{x-2}{3}\right|<1
$$

得到

$$
|x-2|<3
$$

开区间是 $(-1,5)$。端点还要分别代回检查。
`,
    ),
    section(
      '例题 2：比值判别法求半径',
      '把含 x 的部分留到最后解。',
      String.raw`
## 题目

求

$$
\sum_{n=1}^{\infty}\frac{n(x+1)^n}{2^n}
$$

的收敛半径。

## 解法

令

$$
a_n=\frac{n(x+1)^n}{2^n}
$$

比值：

$$
\left|\frac{a_{n+1}}{a_n}\right|
=\frac{n+1}{n}\cdot \left|\frac{x+1}{2}\right|
$$

极限为

$$
\left|\frac{x+1}{2}\right|
$$

要求小于 1：

$$
|x+1|<2
$$

所以半径 $R=2$，中心是 $-1$。
`,
    ),
    section(
      '例题 3：端点必须单独代回',
      '开区间不能自动决定端点。',
      String.raw`
## 题目

若开区间为 $(-1,5)$，检查端点时应该怎么写？

## 解法

分别代入：

1. 令 $x=-1$，得到一个普通数项级数，再判断。
2. 令 $x=5$，得到另一个普通数项级数，再判断。

两个端点的结果可能不同。最后答案可能是

$$
[-1,5),\quad (-1,5],\quad [-1,5],\quad (-1,5)
$$

之一。

## 易错点

不要只写 $R=3$ 就结束。
`,
    ),
    section(
      '例题 4：由几何级数生成模板',
      '整体替换变量块，收敛条件也一起替换。',
      String.raw`
## 题目

写出

$$
\frac{1}{1-(x-2)}
$$

的幂级数和收敛条件。

## 解法

由

$$
\frac1{1-z}=\sum_{n=0}^{\infty}z^n,\qquad |z|<1
$$

令 $z=x-2$：

$$
\frac{1}{1-(x-2)}=\sum_{n=0}^{\infty}(x-2)^n
$$

收敛条件：

$$
|x-2|<1
$$
`,
    ),
  ],

  'queue-mat136-11-taylor-series': [
    section(
      '例题 1：直接展开 e^x',
      '用中心点导数值生成系数。',
      String.raw`
## 题目

求 $e^x$ 在 $0$ 处的展开。

## 解法

$f(x)=e^x$ 的每阶导数仍是 $e^x$，所以

$$
f^{(n)}(0)=1
$$

代入麦克劳林公式：

$$
e^x=\sum_{n=0}^{\infty}\frac{x^n}{n!}
=1+x+\frac{x^2}{2!}+\frac{x^3}{3!}+\cdots
$$
`,
    ),
    section(
      '例题 2：cos x 的前几项',
      '偶次项保留，奇次项为 0。',
      String.raw`
## 题目

写出 $\cos x$ 的前四个非零项。

## 解法

模板：

$$
\cos x=\sum_{n=0}^{\infty}(-1)^n\frac{x^{2n}}{(2n)!}
$$

前四个非零项：

$$
\cos x=1-\frac{x^2}{2!}+\frac{x^4}{4!}-\frac{x^6}{6!}+\cdots
$$
`,
    ),
    section(
      '例题 3：整体替换 sin(x²)',
      '把模板里的变量整体换成 x²。',
      String.raw`
## 题目

写出 $\sin(x^2)$ 的前几项。

## 解法

先写

$$
\sin z=z-\frac{z^3}{3!}+\frac{z^5}{5!}-\cdots
$$

令 $z=x^2$：

$$
\sin(x^2)=x^2-\frac{x^6}{3!}+\frac{x^{10}}{5!}-\cdots
$$

## 易错点

指数也要整体变化：$(x^2)^3=x^6$。
`,
    ),
    section(
      '例题 4：级数乘法求低阶项',
      '只乘题目需要的阶数，不必展开所有项。',
      String.raw`
## 题目

求 $e^x\cos x$ 到 $x^2$ 项。

## 解法

保留需要的项：

$$
e^x=1+x+\frac{x^2}{2}+\cdots
$$

$$
\cos x=1-\frac{x^2}{2}+\cdots
$$

相乘到 $x^2$：

$$
(1+x+\frac{x^2}{2})(1-\frac{x^2}{2})
=1+x+0\cdot x^2+\cdots
$$

所以到 $x^2$ 项为

$$
1+x
$$
`,
    ),
  ],
};

function parseArgs(argv) {
  const args = {
    write: false,
    only: new Set(),
  };

  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
      continue;
    }
    if (arg.startsWith('--only=')) {
      arg
        .slice('--only='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => args.only.add(value.padStart(2, '0')));
    }
  }

  return args;
}

function summarize(markdown) {
  return markdown
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]+\$/g, ' ')
    .replace(/[^\p{Script=Han}A-Za-z0-9，。！？、；：,.!?;:()[\]\s+\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function validateSection(notebookId, sectionData) {
  const badPatterns = [
    { pattern: /```/, message: 'contains fenced code block' },
    { pattern: /^\s*[*-]\s*$/m, message: 'contains orphan list marker' },
    { pattern: /\n {4,}\S/, message: 'contains indented code-like line' },
    { pattern: /Although this formula|The Variable does not matter/i, message: 'contains raw PDF English text' },
  ];
  for (const { pattern, message } of badPatterns) {
    if (pattern.test(sectionData.markdown)) {
      throw new Error(`${notebookId} ${sectionData.title}: ${message}`);
    }
  }
}

function buildSections(meta) {
  const conceptualSections = CURATED_SECTIONS[meta.notebookId];
  const exampleSections = EXAMPLE_SECTIONS[meta.notebookId];
  if (!conceptualSections) throw new Error(`Missing curated sections for ${meta.notebookId}`);
  if (!exampleSections) throw new Error(`Missing example sections for ${meta.notebookId}`);
  const sections = [...conceptualSections, ...exampleSections];

  return sections.map((item, index) => {
    validateSection(meta.notebookId, item);
    return {
      title: `${meta.lectureNo} · ${item.title}`,
      order: index,
      markdown: item.markdown,
      summary: item.summary || summarize(item.markdown),
      sourceMeta: {
        sourceKind: 'curated-mat136-markdown',
        sourcePath: `queue/MAT136/${meta.file}`,
        importVersion: IMPORT_VERSION,
        lectureNo: meta.lectureNo,
        lectureLabel: meta.label,
      },
    };
  });
}

async function writeNotebookSections(prisma, courseId, meta, sections) {
  const notebook = await prisma.notebook.findUnique({
    where: { id: meta.notebookId },
    select: {
      id: true,
      courseId: true,
      notebookKind: true,
      sceneCount: true,
      sectionCount: true,
      _count: { select: { scenes: true, markdownSections: true } },
    },
  });
  if (!notebook) {
    return { status: 'missing' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId: meta.notebookId } });
    await tx.markdownNotebookSection.createMany({
      data: sections.map((sectionData) => ({
        ...sectionData,
        notebookId: meta.notebookId,
        courseId: notebook.courseId || courseId,
      })),
    });
    await tx.notebook.update({
      where: { id: meta.notebookId },
      data: {
        notebookKind: 'image',
        sectionCount: sections.length,
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  });

  return {
    status: 'written',
    previousSectionCount: notebook._count.markdownSections,
    sceneCount: notebook._count.scenes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const selected = NOTEBOOKS.filter((meta) => args.only.size === 0 || args.only.has(meta.lectureNo));
  const built = selected.map((meta) => ({ meta, sections: buildSections(meta) }));

  console.log(
    args.write
      ? `[write] importing curated MAT136 Markdown sections into course=${COURSE_ID}`
      : `[dry-run] curated MAT136 Markdown section import plan for course=${COURSE_ID}`,
  );

  for (const item of built) {
    console.log(
      `- ${item.meta.notebookId}: ${item.sections.length} curated sections from ${item.meta.file}`,
    );
    for (const sectionData of item.sections) {
      console.log(`  ${sectionData.order + 1}. ${sectionData.title}`);
    }
  }

  if (!args.write) {
    console.log('\nRun with --write to replace Markdown sections while keeping slide scenes.');
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is not configured. Add it to .env.local or the shell env.');
  }

  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({
      where: { id: COURSE_ID },
      select: { id: true, name: true },
    });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);

    for (const item of built) {
      const result = await writeNotebookSections(prisma, course.id, item.meta, item.sections);
      if (result.status === 'missing') {
        console.warn(`- skipped missing notebook: ${item.meta.notebookId}`);
        continue;
      }
      console.log(
        `- wrote ${item.meta.notebookId}: markdown ${result.previousSectionCount} -> ${item.sections.length}; scenes kept=${result.sceneCount}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
