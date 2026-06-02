#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-eighth-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-08-improper-integrals';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT136', NOTEBOOK_ID);
const PUBLIC_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const GENERATED_IMAGE_ROOT =
  process.env.GENERATED_IMAGE_ROOT ||
  path.join(process.env.HOME || '/Users/dongpochen', '.codex', 'generated_images');

const MARKERS = [
  { name: 'red', hex: '#ff0000', cn: '红色', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', cn: '绿色', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', cn: '蓝色', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', cn: '青色', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', cn: '品红', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', cn: '黄色', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const PAGES = [
  {
    title: '反常积分：哪里“反常”',
    sceneTitle: '反常积分入口',
    layout:
      '上方标题；左侧区分无限区间；右侧区分函数爆点；中间放“用极限修补积分”；底部给本册问题。',
    components: [
      {
        label: '本册问题',
        role: 'opening',
        marker: 'red',
        content: '标题“反常积分：哪里反常”；写“区间无限或函数在端点爆掉时，普通定积分不够用”。',
        speech:
          '这一页先说明反常积分的入口。所谓反常，不是积分符号变了，而是积分区间或被积函数出了普通定积分不能直接处理的问题。',
      },
      {
        label: '无限区间',
        role: 'concept',
        marker: 'lime',
        content: '画从 a 向右延伸到 ∞ 的数轴；写“∫_a^∞ f(x)dx：右端没有终点”。',
        speech:
          '第一类反常来自无限区间。右端写成无穷大时，我们不能直接把无穷大当成普通端点，需要用有限的 t 先截断。',
      },
      {
        label: '函数爆点',
        role: 'concept',
        marker: 'blue',
        content: '画函数在 x=a 附近竖直上升；写“如 1/√x 在 x=0 附近无界”。',
        speech:
          '第二类反常来自函数本身。即使区间长度有限，只要函数在端点或内部某点爆掉，也必须改用极限定义。',
      },
      {
        label: '极限思想',
        role: 'strategy',
        marker: 'cyan',
        content: '写“先把危险点换成 t，再令 t 靠近危险点”；画普通积分箭头到极限。',
        speech:
          '处理反常积分的共同思想是先避开危险点，得到一个普通定积分，再让截断点慢慢靠近危险位置。',
      },
      {
        label: '判断目标',
        role: 'hook',
        marker: 'yellow',
        content: '底部问题：“这个极限是有限数，还是跑向无穷或不存在？”',
        speech:
          '底部问题就是每一道题真正要判断的事：极限如果是有限数，积分收敛；如果无穷或不存在，积分发散。',
      },
    ],
  },
  {
    title: '无限上限：把 ∞ 换成 t',
    sceneTitle: '无限区间定义',
    layout: '左侧定义；中间面积随 t 增长的图；右侧两个例子对比；底部判断句。',
    components: [
      {
        label: '定义公式',
        role: 'definition',
        marker: 'red',
        content: '写“∫_a^∞ f(x)dx = lim_{t→∞} ∫_a^t f(x)dx”。',
        speech:
          '无限上限的定义就是把无穷大先换成有限的 t，算从 a 到 t 的普通积分，然后令 t 走向无穷大。',
      },
      {
        label: '面积函数',
        role: 'visual',
        marker: 'lime',
        content: '画曲线下从 a 到 t 的阴影；写“F(t)=∫_a^t f(x)dx”。',
        speech:
          '中间这块把积分看成随 t 变化的面积函数。我们关心的不是某个 t 的面积，而是 t 越来越大时面积有没有稳定下来。',
      },
      {
        label: '收敛例子',
        role: 'example',
        marker: 'blue',
        content: '写“∫_1^∞ 1/x² dx = lim_{t→∞}(1-1/t)=1”。',
        speech: '一除以 x 平方衰减足够快，累积面积最后停在一，所以这个反常积分收敛。',
      },
      {
        label: '发散例子',
        role: 'example',
        marker: 'cyan',
        content: '写“∫_1^∞ 1/x dx = lim_{t→∞} ln t = ∞”。',
        speech: '一除以 x 看起来也会变小，但变小得不够快，面积会慢慢积到无穷大，所以发散。',
      },
      {
        label: '判断句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“极限有限 ⇒ 收敛；极限无穷或不存在 ⇒ 发散”。',
        speech: '这一页的结论很直接：反常积分最后只看这个极限是不是有限数。',
      },
    ],
  },
  {
    title: 'p-积分在无穷远：衰减够不够快',
    sceneTitle: '无穷远 p-积分',
    layout: '上方规则；左侧 p>1；右侧 p≤1；中间小图比较尾巴；底部记忆句。',
    components: [
      {
        label: '核心规则',
        role: 'formula',
        marker: 'red',
        content: '写“∫_1^∞ 1/x^p dx：p>1 收敛；p≤1 发散”。',
        speech:
          '无穷远的 p 积分是反常积分最重要的模板。指数 p 大于一时，尾巴衰减足够快；p 小于等于一时不够快。',
      },
      {
        label: '收敛推导',
        role: 'derivation',
        marker: 'lime',
        content: '写“p=2：∫_1^t x^{-2}dx = 1-1/t →1”。',
        speech: '用 p 等于二作为代表，可以看到截断面积趋近有限数，这就是收敛的典型样子。',
      },
      {
        label: '发散推导',
        role: 'derivation',
        marker: 'blue',
        content: '写“p=1：∫_1^t 1/x dx = ln t →∞”。',
        speech: 'p 等于一是分界点。对数虽然增长慢，但仍然没有上界，因此积分发散。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'cyan',
        content: '画 1/x 与 1/x² 的尾巴；标“1/x² 更快贴近 0”。',
        speech:
          '图像上两条曲线都趋近零，但面积表现不同。只看函数值趋近零不够，还要看尾巴面积是否可累积成有限数。',
      },
      {
        label: '记忆句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“无穷远：p 要大于 1 才收敛”。',
        speech: '记忆时抓住一句话：在无穷远，p 必须大于一，面积才收得住。',
      },
    ],
  },
  {
    title: '端点奇点：靠近 0 时规则反过来',
    sceneTitle: '端点 p-积分',
    layout: '左侧端点爆点图；中间定义；右侧 p 规则；下方两个例子；底部对比无穷远。',
    components: [
      {
        label: '危险端点',
        role: 'visual',
        marker: 'red',
        content: '画 1/x^p 在 x=0 附近上升；写“危险点在端点 0”。',
        speech: '现在危险不在无穷远，而在有限端点零。函数可能在零附近爆掉，所以要从右边靠近零。',
      },
      {
        label: '极限定义',
        role: 'definition',
        marker: 'lime',
        content: '写“∫_0^1 f(x)dx = lim_{t→0+} ∫_t^1 f(x)dx”。',
        speech: '定义上，我们先从 t 到一积分，避开零点，再令 t 从右侧趋近零。',
      },
      {
        label: '端点规则',
        role: 'formula',
        marker: 'blue',
        content: '写“∫_0^1 1/x^p dx：p<1 收敛；p≥1 发散”。',
        speech: '端点零附近的规则和无穷远相反：p 小于一时爆得不太厉害，p 大于等于一时面积撑不住。',
      },
      {
        label: '两个例子',
        role: 'examples',
        marker: 'cyan',
        content: '写“∫_0^1 1/√x dx=2 收敛；∫_0^1 1/x² dx 发散”。',
        speech: '一除以根号 x 在零附近虽然无界，但面积有限；一除以 x 平方爆得太快，所以发散。',
      },
      {
        label: '对比句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“无穷远看尾巴衰减；端点看爆点强度”。',
        speech: '底部这句话帮助区分两类 p 积分：无穷远看衰减，端点附近看爆点强度。',
      },
    ],
  },
  {
    title: '常见可直接算的反常积分',
    sceneTitle: '指数与反正切',
    layout: '左侧指数衰减；右侧 arctan；中间极限图；底部模板提醒。',
    components: [
      {
        label: '指数衰减',
        role: 'example',
        marker: 'red',
        content: '写“∫_1^∞ e^{-x}dx = lim_{t→∞}(e^{-1}-e^{-t})=e^{-1}”。',
        speech: '指数衰减是收敛的强模板。e 的负 x 次方下降很快，所以尾部面积有限。',
      },
      {
        label: '面积图',
        role: 'visual',
        marker: 'lime',
        content: '画 e^{-x} 的递减曲线和有限尾部阴影；标“尾巴很快变薄”。',
        speech: '图像上，指数曲线的尾巴很快贴近零，阴影面积也很快稳定下来。',
      },
      {
        label: '反正切模板',
        role: 'example',
        marker: 'blue',
        content: '写“∫_0^∞ 1/(1+x²)dx = lim_{t→∞} arctan t = π/2”。',
        speech: '一除以一加 x 平方的原函数是 arctan。因为 arctan t 趋近二分之 π，所以积分收敛。',
      },
      {
        label: '极限对比',
        role: 'concept',
        marker: 'cyan',
        content: '写“e^{-t}→0，arctan t→π/2，ln t→∞”。',
        speech: '这里把常见极限放在一起：指数尾项消失，反正切有水平极限，对数会继续增长。',
      },
      {
        label: '模板提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“能直接求原函数时，先算截断积分再取极限”。',
        speech: '如果原函数容易写出，最稳的方法就是按定义直接算截断积分，再判断极限。',
      },
    ],
  },
  {
    title: '比较判别法：用更熟的函数夹住',
    sceneTitle: '比较判别法',
    layout: '上方定理；左侧函数大小图；右侧两条推论；底部使用条件。',
    components: [
      {
        label: '定理条件',
        role: 'definition',
        marker: 'red',
        content: '写“若 0≤f(x)≤g(x)，并且都连续在危险点外”。',
        speech: '比较判别法要求先确认函数非负，并且在要讨论的区间上满足大小关系。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'lime',
        content: '画 f 在 g 下方，两块尾部面积；标“上方面积有限则下面也有限”。',
        speech: '图像直觉是：如果大的那块面积都有限，那么小的那块面积当然也有限。',
      },
      {
        label: '收敛方向',
        role: 'rule',
        marker: 'blue',
        content: '写“g 收敛且 0≤f≤g ⇒ f 收敛”。',
        speech: '收敛的比较方向要用上界。找到一个更大的、已知收敛的函数，就能推出原积分收敛。',
      },
      {
        label: '发散方向',
        role: 'rule',
        marker: 'cyan',
        content: '写“f 发散且 0≤f≤g ⇒ g 发散”。',
        speech: '发散的比较方向要用下界。找到一个更小但已经发散的函数，原来更大的面积也必然发散。',
      },
      {
        label: '使用提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先判非负，再选熟悉模板：p-积分、指数、对数”。',
        speech: '使用比较法时，不要急着写不等式。先确认非负，再选择一个我们熟悉的模板函数。',
      },
    ],
  },
  {
    title: '比较例题：sin x / x² 的尾巴',
    sceneTitle: '正弦尾巴比较',
    layout: '左侧题目；中间绝对值控制；右侧 p-积分；底部结论。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“判断 ∫_1^∞ sin x / x² dx 是否收敛”。',
        speech: '这题不适合直接找原函数。看到正弦乘一个衰减因子，优先考虑用绝对值比较。',
      },
      {
        label: '绝对值控制',
        role: 'inequality',
        marker: 'lime',
        content: '写“|sin x / x²| ≤ 1/x²”。',
        speech: '正弦的绝对值最多是一，所以整个被积函数的绝对值被一除以 x 平方控制。',
      },
      {
        label: '模板积分',
        role: 'formula',
        marker: 'blue',
        content: '写“∫_1^∞ 1/x² dx 收敛”。',
        speech: '一除以 x 平方是 p 大于一的无穷远 p 积分，所以收敛。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'cyan',
        content: '画振荡曲线夹在 ±1/x² 的包络内；标“振幅被收住”。',
        speech: '图像上，振荡不是问题，关键是振幅被一个面积有限的包络压住。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“绝对值被收敛函数控制 ⇒ 原积分收敛”。',
        speech: '因此这个积分收敛，而且是绝对收敛。',
      },
    ],
  },
  {
    title: '发散比较：下界已经发散',
    sceneTitle: 'sec² 例题',
    layout: '左侧题目；中间不等式；右侧端点 p-积分；底部发散方向。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“判断 ∫_0^1 sec²x /(x√x) dx”。',
        speech: '这题的危险点是零，因为分母里有 x 根号 x。sec 平方在零附近没有问题，而且至少为一。',
      },
      {
        label: '下界选择',
        role: 'inequality',
        marker: 'lime',
        content: '写“sec²x≥1，所以 sec²x/(x√x) ≥ 1/(x√x)=1/x^{3/2}”。',
        speech: '因为 sec 平方大于等于一，被积函数至少和一除以 x 的三分之二次方一样大。',
      },
      {
        label: '端点发散',
        role: 'formula',
        marker: 'blue',
        content: '写“∫_0^1 1/x^{3/2} dx 发散，因为 p=3/2≥1”。',
        speech:
          '在零附近的 p 积分中，p 大于等于一会发散。这里三分之二次方的指数是一点五，所以发散。',
      },
      {
        label: '比较方向',
        role: 'strategy',
        marker: 'cyan',
        content: '画“小的面积已发散 ⇒ 大的面积也发散”。',
        speech: '发散比较用的是下界：如果下面那块面积已经无限大，上面更大的面积也不可能有限。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“找到发散下界，就能推出原积分发散”。',
        speech: '这一页的核心是发散方向：用一个更小但发散的函数托住原函数。',
      },
    ],
  },
  {
    title: '小角估计：sin²x / √x 靠近 0',
    sceneTitle: '小角估计比较',
    layout: '左侧拆危险点；中间小角不等式；右侧比较函数；底部收敛结论。',
    components: [
      {
        label: '危险点',
        role: 'setup',
        marker: 'red',
        content: '写“∫_0^1 sin²x/√x dx；真正危险点是 x=0”。',
        speech: '这个积分的危险点只有零。远离零的闭区间上函数连续，积分自然有限。',
      },
      {
        label: '小角估计',
        role: 'inequality',
        marker: 'lime',
        content: '写“0≤sin x≤x，所以 sin²x≤x²”。',
        speech: '在零附近，小角估计告诉我们 sin x 不超过 x，因此 sin 平方不超过 x 平方。',
      },
      {
        label: '比较函数',
        role: 'formula',
        marker: 'blue',
        content: '写“0≤sin²x/√x ≤ x²/√x = x^{3/2}”。',
        speech: '把这个不等式除以根号 x，就得到原函数被 x 的三分之二次方控制。',
      },
      {
        label: '有限面积',
        role: 'derivation',
        marker: 'cyan',
        content: '写“∫_0^1 x^{3/2}dx < ∞”。',
        speech: 'x 的正幂在零附近当然可积，所以右边面积有限。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“爆点附近先找局部上界，再用比较法”。',
        speech: '结论是原积分收敛。这里最重要的动作是只在危险点附近做局部比较。',
      },
    ],
  },
  {
    title: '拆区间：一个积分可能有多个危险点',
    sceneTitle: '拆区间原则',
    layout: '上方原则；左侧 0 附近；右侧无穷远；中间加号拆分；底部判定逻辑。',
    components: [
      {
        label: '拆分原则',
        role: 'definition',
        marker: 'red',
        content: '写“若区间含 0 和 ∞，必须分别检查”。',
        speech: '一个积分可能同时有端点爆点和无穷远问题。这时候必须拆开，不能用一个比较一次带过。',
      },
      {
        label: '拆成两段',
        role: 'formula',
        marker: 'lime',
        content: '写“∫_0^∞ f(x)dx = ∫_0^1 f(x)dx + ∫_1^∞ f(x)dx”。',
        speech: '常用拆法是在一处分成两段：左边负责零附近，右边负责无穷远。',
      },
      {
        label: '左端检查',
        role: 'strategy',
        marker: 'blue',
        content: '写“x→0+：看函数是否像 1/x^p”。',
        speech: '靠近零时，我们通常把函数化成和一除以 x 的 p 次方相近的形式。',
      },
      {
        label: '右端检查',
        role: 'strategy',
        marker: 'cyan',
        content: '写“x→∞：看尾巴是否像 1/x^p 或 e^{-x}”。',
        speech: '无穷远则看尾巴衰减速度，常用模板是 p 积分或指数衰减。',
      },
      {
        label: '整体判定',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“两段都收敛 ⇒ 整体收敛；任一段发散 ⇒ 整体发散”。',
        speech: '整体结论很严格：只要有一段发散，整个反常积分就发散；两段都收敛才算收敛。',
      },
    ],
  },
  {
    title: '下界发散：常数尾巴会积到无穷',
    sceneTitle: '对数下界发散',
    layout: '左侧题目；中间下界；右侧对数发散；底部判断。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“判断 ∫_1^∞ (2+e^{-x})/x dx”。',
        speech: '这题看起来有指数衰减项，但分子里还有一个常数二。真正决定发散的是这个常数尾巴。',
      },
      {
        label: '下界',
        role: 'inequality',
        marker: 'lime',
        content: '写“(2+e^{-x})/x ≥ 2/x”。',
        speech: '因为 e 的负 x 次方非负，整个分子至少是二，所以原函数至少是二除以 x。',
      },
      {
        label: '对数发散',
        role: 'formula',
        marker: 'blue',
        content: '写“∫_1^∞ 2/x dx = 2 lim_{t→∞} ln t = ∞”。',
        speech: '二除以 x 的积分是二倍对数，对数趋向无穷，因此下界发散。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'cyan',
        content: '画原曲线在 2/x 上方；标“下面都无限，上面更无限”。',
        speech: '图像上，原曲线在二除以 x 上方；下面面积已经无限大，上面当然也无限大。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“有发散下界 ⇒ 原积分发散”。',
        speech: '所以这个反常积分发散。不要被分子里的指数衰减项误导。',
      },
    ],
  },
  {
    title: '双端例题：1/(√x(1+x))',
    sceneTitle: '双端收敛例题',
    layout: '上方题目；左侧拆区间；中间零附近比较；右侧无穷远比较；底部整体结论。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“判断 ∫_0^∞ 1/(√x(1+x)) dx”。',
        speech: '这个例题同时有零端点和无穷远，所以第一步不是比较，而是先拆区间。',
      },
      {
        label: '拆区间',
        role: 'formula',
        marker: 'lime',
        content: '写“∫_0^∞ = ∫_0^1 + ∫_1^∞”。',
        speech: '拆成零到一和一到无穷后，每段只处理一个危险位置，思路会清楚很多。',
      },
      {
        label: '零附近',
        role: 'inequality',
        marker: 'blue',
        content: '写“0<x≤1 时，1/(√x(1+x)) ≤ 1/√x，且 ∫_0^1 1/√x dx 收敛”。',
        speech: '靠近零时，一加 x 至少是一，所以原函数不超过一除以根号 x；这个端点 p 积分收敛。',
      },
      {
        label: '无穷远',
        role: 'inequality',
        marker: 'cyan',
        content: '写“x≥1 时，1/(√x(1+x)) ≤ 1/x^{3/2}，且 ∫_1^∞ 1/x^{3/2} dx 收敛”。',
        speech: '在无穷远，一加 x 至少像 x，所以分母至少像 x 的三分之三次方，尾巴可积。',
      },
      {
        label: '整体结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“两端都被收敛模板控制，所以整体收敛”。',
        speech: '两段都找到了收敛上界，因此整个积分收敛。',
      },
    ],
  },
  {
    title: '振荡不等于收敛：∫ sin x dx',
    sceneTitle: '振荡反例',
    layout: '左侧题目；中间截断积分；右侧极限不存在；底部提醒。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“判断 ∫_0^∞ sin x dx”。',
        speech:
          '这题提醒我们：函数来回振荡，不代表反常积分自动收敛。仍然要按定义看截断积分的极限。',
      },
      {
        label: '截断计算',
        role: 'derivation',
        marker: 'lime',
        content: '写“∫_0^b sin x dx = [-cos x]_0^b = 1-cos b”。',
        speech: '先把无穷远换成 b，从零到 b 的普通积分等于一减 cos b。',
      },
      {
        label: '极限不存在',
        role: 'concept',
        marker: 'blue',
        content: '写“cos b 一直震荡，所以 1-cos b 没有极限”。',
        speech: '当 b 越来越大时，cos b 不会靠近某一个数，所以一减 cos b 也没有极限。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'cyan',
        content: '画正负波浪面积互相抵消但截断结果来回跳；标“没有稳定尾值”。',
        speech: '虽然正负面积看起来会抵消，但截断面积没有稳定到一个固定数，因此按定义发散。',
      },
      {
        label: '提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“振荡需要额外判别；极限不存在就是发散”。',
        speech: '底部提醒：振荡题不能凭直觉，要看截断积分是否有极限。',
      },
    ],
  },
  {
    title: '分母为零：先找奇点再拆',
    sceneTitle: '奇点拆分',
    layout: '上方题目；左侧因式分解；中间数轴标奇点；右侧拆成三段；底部发散判断。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“判断 ∫_0^∞ 1/(x²-3x+2) dx”。',
        speech:
          '有理函数的第一步是看分母在哪里等于零。只要区间内部有分母为零，就必须把它当作反常点处理。',
      },
      {
        label: '因式分解',
        role: 'formula',
        marker: 'lime',
        content: '写“x²-3x+2=(x-1)(x-2)”。',
        speech: '分母分解后，危险点立刻出现：x 等于一和二时分母为零。',
      },
      {
        label: '标出奇点',
        role: 'visual',
        marker: 'blue',
        content: '画数轴 0,1,2,∞；在 1 和 2 处画断点。',
        speech: '数轴上要把一和二标成断点，因为积分不能跨过爆点直接计算。',
      },
      {
        label: '必须拆分',
        role: 'strategy',
        marker: 'cyan',
        content: '写“∫_0^∞ = ∫_0^1 + ∫_1^2 + ∫_2^∞，每段都用极限”。',
        speech: '拆分后，每一段都要分别判断。只要其中一段发散，整个积分就发散。',
      },
      {
        label: '结论方向',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“内部奇点不能跳过；先拆，再比较或算极限”。',
        speech: '这一页的重点不是具体算完，而是流程：先找内部奇点，必须拆开再判断。',
      },
    ],
  },
  {
    title: '部分分式：有理函数的拆法',
    sceneTitle: '部分分式模板',
    layout: '左侧何时使用；中间线性因子；右侧重复因子；下方二次因子；底部提醒。',
    components: [
      {
        label: '使用时机',
        role: 'strategy',
        marker: 'red',
        content: '写“看到 P(x)/Q(x)，且 Q(x) 可分解时，考虑部分分式”。',
        speech:
          '部分分式是处理有理函数积分的主要工具。看到分母可以因式分解，就先考虑把复杂分母拆成简单分母。',
      },
      {
        label: '不同线性因子',
        role: 'template',
        marker: 'lime',
        content: '写“1/((x-a)(x-b)) = A/(x-a)+B/(x-b)”。',
        speech: '如果分母是不同的一次因子，每个因子对应一个常数分子。',
      },
      {
        label: '重复线性因子',
        role: 'template',
        marker: 'blue',
        content: '写“1/(x-a)^m = A₁/(x-a)+⋯+A_m/(x-a)^m”。',
        speech: '如果一次因子重复出现，必须从一次方一直写到最高次方，不能只写最后一项。',
      },
      {
        label: '二次因子',
        role: 'template',
        marker: 'cyan',
        content: '写“不可约二次因子 x²+1：分子写 Bx+C”。',
        speech: '遇到不可约二次因子时，分子要写成一次式，比如 Bx 加 C，而不是只写常数。',
      },
      {
        label: '提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先设形式，再通分比较系数，最后积分”。',
        speech: '部分分式的流程是三步：设形式、比较系数、再积分。',
      },
    ],
  },
  {
    title: '部分分式例题：两个线性因子',
    sceneTitle: '简单部分分式',
    layout: '上方题目；左侧设分式；中间通分；右侧代入求 A,B；底部积分形式。',
    components: [
      {
        label: '题目',
        role: 'example',
        marker: 'red',
        content: '写“计算 ∫ 1/((x-1)(x-2)) dx”。',
        speech: '这个例子是最基本的两个线性因子部分分式。先把一个复杂分式拆成两个简单分式。',
      },
      {
        label: '设形式',
        role: 'setup',
        marker: 'lime',
        content: '写“1/((x-1)(x-2)) = A/(x-1)+B/(x-2)”。',
        speech:
          '因为分母有 x 减一和 x 减二两个不同线性因子，所以设成 A 除以 x 减一，加 B 除以 x 减二。',
      },
      {
        label: '通分',
        role: 'derivation',
        marker: 'blue',
        content: '写“1=A(x-2)+B(x-1)”。',
        speech: '两边同乘公共分母后，得到一个关于 x 的恒等式。',
      },
      {
        label: '求系数',
        role: 'calculation',
        marker: 'cyan',
        content: '写“x=1 ⇒ A=-1；x=2 ⇒ B=1”。',
        speech: '代入让某个因子为零的 x 值，可以快速消掉一项，直接求出 A 和 B。',
      },
      {
        label: '积分形式',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“原式 = -1/(x-1)+1/(x-2)，再积分得到对数项”。',
        speech: '最后把原分式改写成负的一除以 x 减一，加一除以 x 减二，积分时就会得到两个对数项。',
      },
    ],
  },
  {
    title: '复杂有理式：重复二次因子怎么收尾',
    sceneTitle: '重复二次因子',
    layout: '左侧分解形式；中间系数比较；右侧两个积分难点；底部方法选择。',
    components: [
      {
        label: '设分式形式',
        role: 'setup',
        marker: 'red',
        content: '写“(3x²+5x+1)/((x-1)(x²+1)²) = A/(x-1)+(Bx+C)/(x²+1)+(Dx+E)/(x²+1)²”。',
        speech:
          '复杂分母里有一个线性因子和一个重复的二次因子，所以二次因子的一次方和二次方都要写出来。',
      },
      {
        label: '比较系数',
        role: 'calculation',
        marker: 'lime',
        content: '写“通分后比较 x⁴,x³,x²,x,常数 的系数”。',
        speech: '求系数时，把右边通分展开，再按不同次幂比较系数。这一步长，但逻辑很机械。',
      },
      {
        label: '第一类积分',
        role: 'method',
        marker: 'blue',
        content: '写“∫ x/(x²+1)² dx：令 u=x²+1”。',
        speech: '拆完以后，含 x 的分子常常可以用 u 等于 x 平方加一来处理。',
      },
      {
        label: '第二类积分',
        role: 'method',
        marker: 'cyan',
        content: '写“∫ 1/(x²+1)² dx：令 x=tan θ”。',
        speech:
          '而一除以 x 平方加一的平方，则常用三角代换 x 等于 tan θ，把 x 平方加一变成 sec 平方。',
      },
      {
        label: '方法选择',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“拆分负责代数；换元负责把每个小积分算完”。',
        speech: '这一页的 takeaway 是：部分分式先把大问题拆小，后面的换元或三角代换负责收尾。',
      },
    ],
  },
  {
    title: '高斯型换元与反常积分总结',
    sceneTitle: '总结与高斯换元',
    layout: '上方总结核心；左侧高斯已知积分；中间根号换元；右侧判断流程；底部收束句。',
    components: [
      {
        label: '核心总结',
        role: 'summary',
        marker: 'red',
        content: '标题“高斯型换元与反常积分总结”；写“反常积分=普通积分+极限判断”。',
        speech:
          '最后一页把本册收束起来。反常积分本质上仍然是普通积分，只是要在危险点处补上极限判断。',
      },
      {
        label: '高斯模板',
        role: 'formula',
        marker: 'lime',
        content: '写“已知 ∫_0^∞ e^{-u²}du = √π/2”。',
        speech: '高斯型题目通常给出这个标准积分，然后要求你通过换元把新积分变回这个模板。',
      },
      {
        label: '换元思路',
        role: 'strategy',
        marker: 'blue',
        content: '写“把指数里的平方表达式设成 u²；同时处理 dx 或根号项”。',
        speech: '换元时最重要的是让指数变成负的 u 平方，并且把剩下的 dx 和根号因子一起换干净。',
      },
      {
        label: '判断流程',
        role: 'checklist',
        marker: 'cyan',
        content: '列“找危险点 → 拆区间 → 直接算或比较 → 每段极限有限”。',
        speech:
          '做反常积分时，可以按这四步走：先找危险点，再拆区间，然后选择直接计算或比较法，最后确认每段极限有限。',
      },
      {
        label: '最后一句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“会拆、会比、会算极限，就是反常积分的主线”。',
        speech: '这本笔记的最后一句是：会拆、会比、会算极限，就是反常积分的主线。',
      },
    ],
  },
];

const SOURCE_NARRATION_BY_PAGE = new Map([
  [
    1,
    [
      narrationStep(
        'red',
        '反常从哪里来',
        '这一讲先回答一个问题：什么时候普通定积分不够用。主要有两种情况，一种是区间没有尽头，另一种是函数在某个端点或内部点附近爆掉。',
      ),
      narrationStep(
        'red',
        '先分类型',
        '做题时先不要急着算原函数。第一步是判断反常来自区间，还是来自被积函数本身；类型判断错，后面的极限就会写错。',
      ),
      narrationStep(
        'lime',
        '无限区间',
        '如果积分写到无穷远，比如从 a 到 ∞，右端不是一个可以直接代入的数字，所以要先用有限的 t 截断。',
      ),
      narrationStep(
        'lime',
        '截断思想',
        '把 ∞ 换成 t 之后，∫_a^t f(x)dx 就回到了普通定积分；真正的问题变成 t 越来越大时，这个值会不会稳定。',
      ),
      narrationStep(
        'blue',
        '函数爆点',
        '另一类情况是区间看起来有限，但函数在端点附近无界，比如 1/√x 在 x=0 附近会往上冲。',
      ),
      narrationStep(
        'blue',
        '不要跨过爆点',
        '遇到爆点时，不能把那个点当普通端点直接代入；要从安全的一侧靠近它，用极限描述面积的极限值。',
      ),
      narrationStep(
        'cyan',
        '共同动作',
        '无论是哪一种反常，核心动作都是先避开危险位置，算一个普通积分，再让截断点靠近危险位置。',
      ),
      narrationStep(
        'cyan',
        '判断标准',
        '最后只看这个极限：极限是有限数，就说反常积分收敛；极限不存在或者跑向无穷，就说发散。',
      ),
      narrationStep(
        'yellow',
        '本讲主线',
        '所以整本笔记会围绕三件事展开：会写极限定义，会用比较法判断，会在有理函数里先找分母的危险点。',
      ),
    ],
  ],
  [
    2,
    [
      narrationStep(
        'red',
        '无限上限定义',
        '先给出第一条正式定义：如果每个有限的 t 都能算 ∫_a^t f(x)dx，那么从 a 到 ∞ 的积分就定义成这个截断积分的极限。',
      ),
      narrationStep(
        'red',
        '有限先算',
        '这个定义的意思很朴素：不要直接处理无穷大，先把上限停在 t，完成普通积分，再看 t→∞ 的结果。',
      ),
      narrationStep(
        'lime',
        '面积函数',
        '可以把 F(t)=∫_a^t f(x)dx 看成一个随 t 增长的面积函数。反常积分关心的是 F(t) 有没有最终靠近一个固定数。',
      ),
      narrationStep(
        'lime',
        '收敛的样子',
        '以 ∫_1^∞ 1/x² dx 为例，先算到 t 得到 1-1/t；当 t 趋向无穷，1/t 消失，所以极限是 1。',
      ),
      narrationStep(
        'blue',
        '衰减够快',
        '1/x² 的尾巴衰减得够快，虽然区间无限长，但后面累加起来的面积只剩有限的一点。',
      ),
      narrationStep(
        'cyan',
        '发散的样子',
        '再看 ∫_1^∞ 1/x dx，截断积分是 ln t。ln t 增长很慢，但它一直增长，没有上界。',
      ),
      narrationStep(
        'cyan',
        '不要只看趋零',
        '这也提醒我们：被积函数趋近 0 不是收敛的充分条件。1/x 也趋近 0，但面积仍然会积到无穷。',
      ),
      narrationStep(
        'yellow',
        '定义句',
        '这页要带走的判断句是：截断积分的极限有限，积分收敛；极限为无穷或不存在，积分发散。',
      ),
      narrationStep(
        'yellow',
        '做题节奏',
        '所以无限区间题的固定节奏是：换成 t，算普通积分，取 t→∞，最后给出收敛或发散。',
      ),
    ],
  ],
  [
    3,
    [
      narrationStep(
        'red',
        '无穷远模板',
        '前两个例子其实在建立无穷远 p-积分模板：∫_1^∞ 1/x^p dx 的结果完全由 p 决定。',
      ),
      narrationStep(
        'red',
        '分界点',
        '分界点是 p=1。p 大于 1 时尾巴衰减够快，面积收得住；p 小于等于 1 时，面积收不住。',
      ),
      narrationStep(
        'lime',
        'p=2 的代表',
        'p=2 是收敛代表。算到 t 后会出现 1-1/t，这个值随着 t 变大靠近 1。',
      ),
      narrationStep(
        'lime',
        '有限极限',
        '这里不是因为区间短，而是因为尾部越来越薄，薄到无限长的尾巴也只有有限面积。',
      ),
      narrationStep(
        'blue',
        'p=1 的代表',
        'p=1 是发散代表。算出来是 ln t，虽然增长慢，但没有极限值。',
      ),
      narrationStep(
        'blue',
        '临界不能忽略',
        '很多同学会觉得 1/x 已经很小了，应该收敛；这个例子就是专门提醒 p=1 仍然发散。',
      ),
      narrationStep(
        'cyan',
        '图像理解',
        '图像上 1/x 和 1/x² 都靠近 x 轴，但靠近得多快决定尾部面积是否有限。',
      ),
      narrationStep(
        'cyan',
        '以后比较用它',
        '后面做比较判别时，最常拿来比较的就是这个模板，所以要把 p>1 收敛这句话记牢。',
      ),
      narrationStep(
        'yellow',
        '无穷远口诀',
        '无穷远 p-积分的口诀是：p 要大于 1 才收敛；p 小于等于 1 就发散。',
      ),
    ],
  ],
  [
    4,
    [
      narrationStep(
        'red',
        '端点也会反常',
        '接着看 0 到 1 的积分。这里区间是有限的，但 x=0 附近函数可能爆掉，所以仍然是反常积分。',
      ),
      narrationStep(
        'red',
        '从右边靠近',
        '因为危险点在 0，定义时要写成 lim_{t→0+} ∫_t^1 f(x)dx。t 一定从右边靠近 0。',
      ),
      narrationStep(
        'lime',
        '根号例子',
        '∫_0^1 1/√x dx 虽然在 0 附近无界，但截断后得到 2-2√t，t→0+ 时极限是 2。',
      ),
      narrationStep(
        'lime',
        '无界不等于发散',
        '这个例子特别重要：函数爆掉并不自动代表面积无限。爆得不太快，面积仍然可能有限。',
      ),
      narrationStep(
        'blue',
        '平方例子',
        '∫_0^1 1/x² dx 就不同。截断后会出现 1/t，t→0+ 时跑向无穷，所以发散。',
      ),
      narrationStep(
        'blue',
        '爆点强度',
        '端点题看的是爆点强度。1/x² 比 1/√x 爆得快得多，所以面积撑不住。',
      ),
      narrationStep(
        'cyan',
        '端点规则',
        '因此 ∫_0^1 1/x^p dx 的规则和无穷远相反：p<1 收敛，p≥1 发散。',
      ),
      narrationStep(
        'cyan',
        '两套模板分清',
        '同样是 p-积分，无穷远看尾巴衰减，零附近看爆点强度；题目位置不同，判断方向就不同。',
      ),
      narrationStep(
        'yellow',
        '先看危险点',
        '所以每道题第一眼先问：危险点在哪里？在 ∞，还是在某个有限端点？这一步决定用哪套 p-积分模板。',
      ),
    ],
  ],
  [
    5,
    [
      narrationStep(
        'red',
        '指数衰减',
        '这里把几个常见反常积分单独列出来。第一个是指数衰减，∫_1^∞ e^{-x} dx 可以直接求原函数。',
      ),
      narrationStep(
        'red',
        '直接按定义',
        '算到 t 后得到 e^{-1}-e^{-t}。当 t→∞ 时，e^{-t} 消失，所以结果是有限数。',
      ),
      narrationStep(
        'lime',
        '为什么稳定',
        '指数函数下降非常快，尾巴很快变薄。以后看到纯指数衰减，通常会把它当成强收敛模板。',
      ),
      narrationStep(
        'blue',
        '反正切模板',
        '第二个常见模板是 ∫_0^∞ 1/(1+x²) dx。它的原函数是 arctan x。',
      ),
      narrationStep(
        'blue',
        '水平极限',
        'arctan t 在 t→∞ 时趋近 π/2，所以从 0 到 ∞ 的积分等于 π/2。',
      ),
      narrationStep(
        'cyan',
        '和对数对比',
        '这里可以把三个极限放在一起记：e^{-t}→0，arctan t→π/2，而 ln t→∞。',
      ),
      narrationStep(
        'cyan',
        '能算就先算',
        '如果原函数容易写出来，最稳的方法仍然是直接按定义算截断积分，不必急着用比较法。',
      ),
      narrationStep(
        'yellow',
        '模板库',
        '这页是在建立模板库：指数衰减、反正切、p-积分，后面比较判别时都会反复用到。',
      ),
      narrationStep(
        'yellow',
        '先判极限',
        '无论模板多熟，最后都要回到极限是否有限这个标准。模板只是帮我们更快判断极限。',
      ),
    ],
  ],
  [
    6,
    [
      narrationStep(
        'red',
        '比较判别法',
        '接下来给出比较判别法。它处理的是不好直接积分，但能和熟悉函数比较大小的题。',
      ),
      narrationStep(
        'red',
        '先确认非负',
        '使用前先确认讨论区间上 f 和 g 都非负，并且满足 0≤f(x)≤g(x)。没有非负条件，面积比较就不稳。',
      ),
      narrationStep(
        'lime',
        '收敛方向',
        '如果大的 g 积分收敛，那么夹在下面的 f 积分也收敛。这是用收敛上界控制原函数。',
      ),
      narrationStep(
        'lime',
        '发散方向',
        '如果小的 f 积分已经发散，那么更大的 g 积分一定发散。这是用发散下界推出发散。',
      ),
      narrationStep(
        'blue',
        '正弦例子入口',
        '这个例子是 ∫_1^∞ sin x / x² dx。这个积分不适合直接找原函数，所以看绝对值。',
      ),
      narrationStep(
        'blue',
        '绝对值控制',
        '|sin x|≤1，因此 |sin x/x²|≤1/x²。右边是 p=2 的无穷远 p-积分，已经知道收敛。',
      ),
      narrationStep(
        'cyan',
        '振荡被包住',
        '正弦的振荡并不可怕，因为它的振幅被 1/x² 包住，而这个包络面积有限。',
      ),
      narrationStep(
        'cyan',
        '得到绝对收敛',
        '既然绝对值的积分被收敛函数控制，原积分不仅收敛，而且是绝对收敛。',
      ),
      narrationStep(
        'yellow',
        '比较法口诀',
        '比较法做题时记住两句话：要证收敛，找收敛上界；要证发散，找发散下界。',
      ),
    ],
  ],
  [
    7,
    [
      narrationStep(
        'red',
        '正弦尾巴',
        '这一页继续把 sin x/x² 这个例子讲成标准动作：直接积分困难时，先找一个能控制它的熟悉函数。',
      ),
      narrationStep(
        'red',
        '不要被振荡吓到',
        '正弦在正负之间来回跳，但绝对值永远不超过一；这正好给比较法留下入口。',
      ),
      narrationStep(
        'lime',
        '写出不等式',
        '关键不等式是 |sin x/x²|≤1/x²。分母里的 x² 负责衰减，分子里的正弦只负责振荡。',
      ),
      narrationStep(
        'lime',
        '上界已知收敛',
        '∫_1^∞ 1/x² dx 是 p>1 的 p-积分，所以收敛。这就是我们需要的收敛上界。',
      ),
      narrationStep(
        'blue',
        '比较的方向',
        '因为原函数的绝对值在上界下面，所以原函数的总面积被一个有限面积压住。',
      ),
      narrationStep(
        'blue',
        '绝对收敛更强',
        '证明 |f| 的积分收敛，比证明 f 的积分收敛更强；所以这里可以直接说绝对收敛。',
      ),
      narrationStep(
        'cyan',
        '图像语言',
        '图像上可以想成振荡曲线被 ±1/x² 两条包络夹住，越往后振幅越小。',
      ),
      narrationStep(
        'cyan',
        '以后遇到类似题',
        '以后看到 sin、cos 乘上一个衰减因子，第一反应就是用 |sin x|≤1 或 |cos x|≤1。',
      ),
      narrationStep(
        'yellow',
        '本题结论',
        '所以 ∫_1^∞ sin x/x² dx 收敛。真正用到的不是正弦原函数，而是 p-积分比较。',
      ),
    ],
  ],
  [
    8,
    [
      narrationStep(
        'red',
        '发散比较例题',
        '下一题是 ∫_0^1 sec²x/(x√x) dx。危险点在 x=0，因为分母有 x√x。',
      ),
      narrationStep(
        'red',
        '先看 sec²x',
        '在 0 到 1 上，sec²x≥1，所以这个因子不会帮助函数变小，反而给了我们一个下界。',
      ),
      narrationStep('lime', '选发散下界', '由 sec²x≥1 得到 sec²x/(x√x) ≥ 1/(x√x)=1/x^{3/2}。'),
      narrationStep(
        'lime',
        '端点 p-积分',
        '∫_0^1 1/x^{3/2} dx 是端点 p-积分，p=3/2≥1，所以它发散。',
      ),
      narrationStep(
        'blue',
        '比较方向别反',
        '现在我们要证明原积分发散，所以必须找一个更小但已经发散的函数。这里 1/x^{3/2} 正好合适。',
      ),
      narrationStep(
        'blue',
        '面积托住',
        '下面的面积都已经无限大，上面的面积不可能有限；这就是比较判别法的发散方向。',
      ),
      narrationStep(
        'cyan',
        '不用算原函数',
        '这题完全不需要去积分 sec²x/(x√x)。比较法的价值就是避开难算的原函数。',
      ),
      narrationStep(
        'cyan',
        '判断完成',
        '条件、下界、模板三件事齐了，就可以直接给出结论：原反常积分发散。',
      ),
      narrationStep(
        'yellow',
        '本题提醒',
        '要证发散时，不要找一个更大的发散函数；更大的函数发散不能推出原函数发散。方向一定要小心。',
      ),
    ],
  ],
  [
    9,
    [
      narrationStep(
        'red',
        '只看危险点',
        '这题是 ∫_0^1 sin²x/√x dx。真正危险的地方只有 x=0，远离 0 的部分连续，积分一定有限。',
      ),
      narrationStep(
        'red',
        '局部比较',
        '所以我们只需要在 0 附近找上界，不必把整个区间都想得很复杂。',
      ),
      narrationStep('lime', '小角估计', '在 0 附近有 0≤sin x≤x，因此 0≤sin²x≤x²。'),
      narrationStep('lime', '除以根号 x', '两边除以 √x，得到 0≤sin²x/√x≤x²/√x=x^{3/2}。'),
      narrationStep(
        'blue',
        '右边收敛',
        'x^{3/2} 在 0 附近不但不爆，反而趋近 0，所以 ∫_0^1 x^{3/2} dx 一定有限。',
      ),
      narrationStep('blue', '上界控制', '原函数非负，又被一个收敛函数控制，因此原积分收敛。'),
      narrationStep(
        'cyan',
        '抵消爆点',
        '这题的直觉是：分母 √x 想制造爆点，但 sin²x 在 0 附近像 x²，把爆点抵消掉了。',
      ),
      narrationStep(
        'cyan',
        '别忘闭区间部分',
        '如果题目区间更长，可以先把靠近 0 的部分和远离 0 的部分拆开；远离危险点的连续部分不用担心。',
      ),
      narrationStep(
        'yellow',
        '本题结论',
        '所以 ∫_0^1 sin²x/√x dx 收敛。关键工具是小角估计加比较判别法。',
      ),
    ],
  ],
  [
    10,
    [
      narrationStep(
        'red',
        '多危险点原则',
        '后面多次出现同时有 0 和 ∞ 的积分。这类题第一步一定是拆区间。',
      ),
      narrationStep(
        'red',
        '为什么要拆',
        '零附近和无穷远使用的是不同模板。把它们混在一起判断，很容易把比较方向或 p 的规则用错。',
      ),
      narrationStep('lime', '标准拆法', '通常把 ∫_0^∞ f(x)dx 拆成 ∫_0^1 f(x)dx 加 ∫_1^∞ f(x)dx。'),
      narrationStep(
        'lime',
        '拆点不唯一',
        '中间选 1 只是方便。只要选在正常位置，把两个危险端分开，换成别的正数也可以。',
      ),
      narrationStep(
        'blue',
        '零附近看爆点',
        '在左边那段，看函数靠近 0 时是不是像 1/x^p，并用端点 p-积分规则判断。',
      ),
      narrationStep(
        'blue',
        '无穷远看尾巴',
        '在右边那段，看函数的尾巴是不是像 1/x^p、指数衰减，或其他已知模板。',
      ),
      narrationStep(
        'cyan',
        '整体收敛条件',
        '整体收敛要求每一段都收敛。只要有任意一段发散，整个反常积分就发散。',
      ),
      narrationStep(
        'cyan',
        '对应后面例题',
        '后面 1/(√x(1+x))、有理函数分母为零的题，都要先按危险点拆开。',
      ),
      narrationStep(
        'yellow',
        '做题顺序',
        '做这类题可以固定成一句话：先找所有危险点，再按危险点拆区间，最后逐段判断。',
      ),
    ],
  ],
  [
    11,
    [
      narrationStep(
        'red',
        '对数下界',
        '这题是 ∫_1^∞ (2+e^{-x})/x dx。虽然分子里有指数衰减，但还有常数 2。',
      ),
      narrationStep(
        'red',
        '抓主导项',
        '在无穷远判断时，不要被小项分散注意力。e^{-x} 会消失，常数 2 才决定尾巴像 2/x。',
      ),
      narrationStep('lime', '写出下界', '因为 e^{-x}≥0，所以 (2+e^{-x})/x ≥ 2/x。'),
      narrationStep('lime', '下界发散', '∫_1^∞ 2/x dx=2 ln t 的极限是无穷大，所以这个下界发散。'),
      narrationStep(
        'blue',
        '比较方向',
        '我们有一个更小的函数 2/x，它的面积已经无限大；原函数更大，所以原积分也发散。',
      ),
      narrationStep(
        'blue',
        '不要误判',
        '常见误判是看到 e^{-x} 就以为收敛。这里真正主导的是除以 x 的常数尾巴。',
      ),
      narrationStep(
        'cyan',
        '图像直觉',
        '图像上原函数始终在 2/x 上方，而 2/x 的尾部面积已经收不住。',
      ),
      narrationStep('cyan', '结论', '因此这个反常积分发散，原因不是指数项，而是对数型下界。'),
      narrationStep(
        'yellow',
        '本题带走',
        '判断尾巴时先找主导项：如果尾巴至少像常数除以 x，就要警惕对数发散。',
      ),
    ],
  ],
  [
    12,
    [
      narrationStep(
        'red',
        '双端例题',
        '这题是 ∫_0^∞ 1/(√x(1+x)) dx。它同时有 x=0 和 ∞ 两个危险端。',
      ),
      narrationStep(
        'red',
        '先拆区间',
        '第一步把积分拆成 0 到 1 和 1 到 ∞。拆完以后，每一段只面对一个危险位置。',
      ),
      narrationStep('lime', '零附近上界', '在 0<x≤1 时，1+x≥1，所以 1/(√x(1+x))≤1/√x。'),
      narrationStep('lime', '左段收敛', '∫_0^1 1/√x dx 是端点 p-积分，p=1/2<1，所以左段收敛。'),
      narrationStep('blue', '无穷远上界', '在 x≥1 时，1+x≥x，因此分母 √x(1+x) 至少像 x^{3/2}。'),
      narrationStep('blue', '右段收敛', '于是 1/(√x(1+x))≤1/x^{3/2}，而 ∫_1^∞ 1/x^{3/2} dx 收敛。'),
      narrationStep(
        'cyan',
        '两边分别处理',
        '注意左右两段使用的是不同规则：左边是端点 p<1，右边是无穷远 p>1。',
      ),
      narrationStep('cyan', '整体结论', '两段都被收敛模板控制，所以原积分整体收敛。'),
      narrationStep(
        'yellow',
        '本题方法',
        '这题是拆区间的标准示范：一个危险点配一个比较对象，最后再合并结论。',
      ),
    ],
  ],
  [
    13,
    [
      narrationStep('red', '振荡反例', '用 ∫_0^∞ sin x dx 这个例子提醒大家：振荡本身不等于收敛。'),
      narrationStep(
        'red',
        '仍然按定义',
        '反常积分的定义没有变，还是先算 ∫_0^b sin x dx，再令 b→∞。',
      ),
      narrationStep('lime', '截断积分', '普通积分算出来是 [-cos x]_0^b=1-cos b。'),
      narrationStep(
        'lime',
        '极限不存在',
        '当 b 越来越大时，cos b 一直振荡，不会趋近某一个固定数。',
      ),
      narrationStep('blue', '所以发散', '既然 1-cos b 没有极限，按定义 ∫_0^∞ sin x dx 发散。'),
      narrationStep(
        'blue',
        '抵消直觉不够',
        '正负面积看起来会互相抵消，但截断面积没有稳定下来，所以不能说收敛。',
      ),
      narrationStep(
        'cyan',
        '比较另一个例子',
        '同一组例题里还会出现尾巴比较：通过分母下界把函数压到 1/x^p 下面，从而证明收敛。',
      ),
      narrationStep(
        'cyan',
        '核心仍是极限',
        '不管是振荡题还是比较题，最后都要回到同一个标准：截断后有没有稳定极限。',
      ),
      narrationStep(
        'yellow',
        '本题提醒',
        '看到 sin 或 cos 的无穷区间积分，不能只凭周期直觉，要么算截断极限，要么找到可靠判别法。',
      ),
    ],
  ],
  [
    14,
    [
      narrationStep(
        'red',
        '分母为零',
        '这题是 ∫_0^∞ 1/(x²-3x+2) dx。有理函数题第一步先看分母什么时候为零。',
      ),
      narrationStep(
        'red',
        '因式分解',
        'x²-3x+2=(x-1)(x-2)，所以 x=1 和 x=2 都在积分区间内部，是两个反常点。',
      ),
      narrationStep(
        'lime',
        '必须拆开',
        '因为区间内部有爆点，不能从 0 直接积分到 ∞。要拆成 0 到 1、1 到 2、2 到 ∞ 三段。',
      ),
      narrationStep(
        'lime',
        '每段单独判断',
        '每一段都要用极限处理靠近爆点的一侧。只要其中一段发散，整体就发散。',
      ),
      narrationStep(
        'blue',
        '靠近 x=1',
        '这里的思路是在第一段附近找一个发散下界，用它说明靠近 x=1 时面积已经收不住。',
      ),
      narrationStep(
        'blue',
        '内部奇点最危险',
        '内部奇点比端点更容易被漏掉，因为它藏在区间中间；但积分绝对不能跨过它。',
      ),
      narrationStep(
        'cyan',
        '和部分分式连接',
        '这也自然引出下一部分：有理函数如果要真正计算，经常需要先做部分分式分解。',
      ),
      narrationStep(
        'cyan',
        '判断优先',
        '不过判断收敛发散时，不一定要把整个部分分式算完；先找到一段发散就足够。',
      ),
      narrationStep(
        'yellow',
        '本题带走',
        '有理函数反常积分的第一句话永远是：分母先分解，危险点先标出来。',
      ),
    ],
  ],
  [
    15,
    [
      narrationStep(
        'red',
        '部分分式入口',
        '后半开始讲部分分式。看到 P(x)/Q(x)，并且 Q(x) 可以分解，就要想到把分母拆开。',
      ),
      narrationStep(
        'red',
        '为什么要拆',
        '复杂有理函数直接积分很困难；拆成简单分式之后，每一项通常会变成对数、反正切或简单换元。',
      ),
      narrationStep(
        'lime',
        '不同线性因子',
        '如果分母是不同的一次因子，比如 (x-a)(x-b)，就写 A/(x-a)+B/(x-b)。',
      ),
      narrationStep(
        'lime',
        '每个因子一项',
        '不同因子各自对应一项；通分后比较系数，就能解出 A、B 这些常数。',
      ),
      narrationStep(
        'blue',
        '重复线性因子',
        '如果出现 (x-a)^m，不能只写最高次方一项，要从 1 次方一直写到 m 次方。',
      ),
      narrationStep(
        'blue',
        '避免漏项',
        '漏掉低次项会导致通分后自由度不够，系数方程通常无解或解不对。',
      ),
      narrationStep(
        'cyan',
        '不可约二次因子',
        '如果有 x²+1 这类不可约二次因子，分子要设成 Bx+C，而不是只设一个常数。',
      ),
      narrationStep(
        'cyan',
        '重复二次因子',
        '如果二次因子也重复，就同样要写一次方、二次方，分子每次都是一次式。',
      ),
      narrationStep(
        'yellow',
        '固定流程',
        '部分分式的固定流程是：先设完整形式，再通分比较系数，最后逐项积分。',
      ),
    ],
  ],
  [
    16,
    [
      narrationStep(
        'red',
        '两个线性因子',
        '这个例题是计算 ∫ 1/((x-1)(x-2)) dx。这是部分分式最基本的形状。',
      ),
      narrationStep(
        'red',
        '先设形式',
        '因为分母有 x-1 和 x-2 两个不同线性因子，所以设成 A/(x-1)+B/(x-2)。',
      ),
      narrationStep('lime', '两边通分', '两边同乘 (x-1)(x-2)，得到 1=A(x-2)+B(x-1)。'),
      narrationStep(
        'lime',
        '这是恒等式',
        '这个等式对所有 x 都成立，所以可以代入特殊的 x 值来快速求系数。',
      ),
      narrationStep('blue', '求 A', '令 x=1，B 那项消失，得到 A=-1。'),
      narrationStep('blue', '求 B', '令 x=2，A 那项消失，得到 B=1。'),
      narrationStep('cyan', '拆分结果', '所以 1/((x-1)(x-2))=-1/(x-1)+1/(x-2)。'),
      narrationStep(
        'cyan',
        '接下来积分',
        '拆完以后积分就变成两个对数项：-ln|x-1|+ln|x-2|，再按题目区间处理常数或极限。',
      ),
      narrationStep(
        'yellow',
        '本题技巧',
        '这个例子要记住的是 cover-up 思路：代入让某一项消失的 x 值，可以很快求出对应系数。',
      ),
    ],
  ],
  [
    17,
    [
      narrationStep(
        'red',
        '复杂分母',
        '接着处理 (3x²+5x+1)/((x-1)(x²+1)²)。这里同时有线性因子和重复二次因子。',
      ),
      narrationStep(
        'red',
        '设完整形式',
        '完整形式是 A/(x-1)+(Bx+C)/(x²+1)+(Dx+E)/(x²+1)²。重复的二次因子两层都要写。',
      ),
      narrationStep('lime', '先求 A', '通分后可以先令 x=1，直接求出 A。这里得到 A=9/4。'),
      narrationStep(
        'lime',
        '比较系数',
        '剩下的 B、C、D、E 通过展开后比较 x 的各次幂系数来解。步骤长，但只是代数。',
      ),
      narrationStep(
        'blue',
        '拆完还要积分',
        '系数求完以后，难点转到两个小积分：∫ x/(x²+1)² dx 和 ∫ 1/(x²+1)² dx。',
      ),
      narrationStep(
        'blue',
        '含 x 的那项',
        '对 ∫ x/(x²+1)² dx，用 u=x²+1，因为分子里的 x 正好和 du 对上。',
      ),
      narrationStep(
        'cyan',
        '纯二次那项',
        '对 ∫ 1/(x²+1)² dx，使用三角代换 x=tan θ，把 x²+1 变成 sec²θ。',
      ),
      narrationStep(
        'cyan',
        '回代',
        '三角代换算完后要回到 x。因为 x=tan θ，所以 θ=arctan x，最后答案必须写回 x 的语言。',
      ),
      narrationStep(
        'yellow',
        '本页主线',
        '复杂部分分式不是一步难，而是两层工作：先用代数拆开，再给每个小积分选择合适的换元。',
      ),
    ],
  ],
  [
    18,
    [
      narrationStep(
        'red',
        '高斯型例题',
        '最后看一个高斯型换元例题：已知标准高斯积分，再把新积分化成这个模板。',
      ),
      narrationStep(
        'red',
        '先看目标',
        '目标不是重新证明高斯积分，而是通过换元把指数里的复杂表达式变成 -u² 或 -α² 的形状。',
      ),
      narrationStep(
        'lime',
        '第一步换元',
        '先令 u=x-2，把根号里的 x-2 和指数里的 x-2 统一成同一个新变量。',
      ),
      narrationStep(
        'lime',
        '边界也要换',
        '反常积分换元时，上下限必须跟着换。x 从 2 到 ∞ 时，u 从 0 到 ∞。',
      ),
      narrationStep(
        'blue',
        '第二步缩放',
        '接着通过缩放变量，把指数整理成标准的 e^{-α²}。这一步的常数会从 dx 或 du 里带出来。',
      ),
      narrationStep(
        'blue',
        '根号因子处理',
        '题目里的根号项不能丢，它通常正好和换元微分一起化简，最后留下一个常数倍。',
      ),
      narrationStep(
        'cyan',
        '套用已知积分',
        '当积分已经变成常数乘以 ∫_0^∞ e^{-α²} dα，就可以直接代入已知结果 √π/2。',
      ),
      narrationStep(
        'cyan',
        '整本回顾',
        '这题和前面的反常积分一样，仍然要注意危险端、边界变化和极限意义；只是计算工具换成了换元。',
      ),
      narrationStep(
        'yellow',
        '最后总结',
        '这本讲义的主线是：先找危险点，能直接算就算，不能直接算就比较；有理函数先拆分，特殊模板靠换元。',
      ),
    ],
  ],
]);

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function markerFor(name) {
  const marker = MARKERS.find((item) => item.name === name);
  if (!marker) throw new Error(`Unknown marker: ${name}`);
  return marker;
}

function markerCoords(markerName) {
  const coords = {
    red: [
      [370, 25],
      [1230, 25],
      [370, 145],
      [1230, 145],
    ],
    lime: [
      [55, 185],
      [745, 185],
      [55, 660],
      [745, 660],
    ],
    blue: [
      [875, 170],
      [1530, 170],
      [875, 365],
      [1530, 365],
    ],
    cyan: [
      [820, 385],
      [1210, 385],
      [820, 670],
      [1210, 670],
    ],
    magenta: [
      [1240, 390],
      [1580, 390],
      [1240, 680],
      [1580, 680],
    ],
    yellow: [
      [330, 710],
      [1290, 710],
      [330, 860],
      [1290, 860],
    ],
  };
  return coords[markerName] || coords.yellow;
}

function compilePrompt(page, pageNumber) {
  const markerLines = page.components
    .map((component) => {
      const marker = markerFor(component.marker);
      const coords = markerCoords(component.marker)
        .map(([x, y]) => `(${x},${y})`)
        .join(', ');
      return [
        `${component.label}`,
        `Marker color: pure ${marker.hex} (${marker.cn}).`,
        `Approx marker corners: ${coords}.`,
        `Content: ${component.content}`,
        `Draw exactly four isolated ${marker.hex} corner squares around this whole semantic component.`,
      ].join('\n');
    })
    .join('\n\n');

  const validation = page.components
    .map((component) => {
      const marker = markerFor(component.marker);
      return `4 ${marker.name} ${marker.hex}`;
    })
    .join(', ');

  return `Use case: scientific-educational
Asset type: 16:9 hand-drawn Chinese calculus notebook slide with recoverable component corner markers

Generate page ${pageNumber} of a Chinese calculus improper integrals notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: x, t, a, b, p, f(x), g(x), ∫, dx, lim, ∞, →, ≤, ≥, | |, ln, e^{-x}, sin x, cos x, sec x, √x, arctan, π, θ, u, A, B, C, D, E.

Slide title: “${page.title}”

Style:
- White graph-paper notebook background with faint light-gray grid.
- Common classroom hand-drawn marker style, neat and legible.
- Black marker text and formulas; deep teal graphs; pale teal fills; muted brown arrows.
- Normal content must not use pure red, pure lime, pure blue, pure cyan, pure magenta, or pure yellow.
- No photorealism, no UI chrome, no watermark.
- Do not draw component boxes, borders, frames, brackets, panels, or guide lines.

Flexible layout:
- Do not use a rigid equal-column layout.
- Use varied component sizes and staggered placement.
- Separate semantic components by whitespace only.
- Keep each component compact and self-contained; do not split one component into far-apart islands.
- Layout guidance: ${page.layout}

Marker rules, highest priority:
- Exactly ${page.components.length * 4} solid colored square markers total.
- For each semantic component, draw exactly four isolated colored square markers: top-left, top-right, bottom-left, bottom-right.
- Marker squares are about 18 px, solid filled, no outline, no shadow.
- Put markers just outside the semantic component boundary, not touching text, formulas, graph lines, arrows, or fills.
- Do not connect markers. Do not draw colored rectangles, colored outlines, or colored brackets.
- The only pure-color marks in the image are these marker squares.

Semantic components:

${markerLines}

Validation target:
The output is valid only if it contains exactly ${page.components.length * 4} isolated colored square markers: ${validation}. No course code, no page number, no week label, no component numbering.`;
}

function buildPromptPlan(page, pageNumber, compiledImagePrompt) {
  const promptHash = crypto.createHash('sha256').update(compiledImagePrompt).digest('hex');
  const markerCountsByColor = {};
  const componentPlans = page.components.map((component, index) => {
    const marker = markerFor(component.marker);
    markerCountsByColor[marker.hex] = 4;
    return {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${marker.name}`,
      label: component.label,
      role: component.role,
      order: index + 1,
      markerColorName: marker.name,
      markerColorHex: marker.hex,
      visibleText: [component.content],
      formulas: [],
      diagramPrompt: component.content,
      participatesInMask: true,
    };
  });
  return {
    schemaVersion: 1,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    componentPlans,
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 18,
      markerCountPerComponent: 4,
      colorPool: MARKERS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: MARKERS.map((marker) => marker.hex),
    },
    compiledImagePrompt,
    promptHash,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor,
    },
    recoveryResult: { status: 'pending' },
  };
}

function preparePrompts() {
  const promptDir = path.join(QUEUE_DIR, 'v2-prompts');
  const planDir = path.join(QUEUE_DIR, 'v2-prompt-plans');
  ensureDir(promptDir);
  ensureDir(planDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const prompt = compilePrompt(page, pageNumber);
    fs.writeFileSync(path.join(promptDir, `page-${label}.prompt.md`), prompt);
    writeJson(
      path.join(planDir, `page-${label}.prompt-plan.json`),
      buildPromptPlan(page, pageNumber, prompt),
    );
  }
  writeJson(path.join(QUEUE_DIR, 'v2-outline.json'), {
    notebookId: NOTEBOOK_ID,
    title: '反常积分：从极限定义到比较判别',
    pageCount: PAGES.length,
    rules: {
      imageLanguage: 'Simplified Chinese only; formulas may use standard math notation',
      forbiddenImageLabels: ['course code', 'page number', 'week label'],
      workflow: 'marker source image -> marker recovery -> clean student image',
    },
    pages: PAGES.map((page, index) => ({
      pageNumber: index + 1,
      title: page.title,
      sceneTitle: page.sceneTitle,
      components: page.components.map(({ label, role, marker }) => ({ label, role, marker })),
    })),
  });
  console.log(`[prepare] wrote ${PAGES.length} prompts to ${promptDir}`);
}

function listGeneratedPngs(dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listGeneratedPngs(fullPath, depth + 1));
    if (entry.isFile() && entry.name.endsWith('.png')) files.push(fullPath);
  }
  return files;
}

function latestGeneratedImage() {
  const files = listGeneratedPngs(GENERATED_IMAGE_ROOT).sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  );
  if (!files.length) throw new Error(`No generated images found in ${GENERATED_IMAGE_ROOT}`);
  return files[0];
}

function adoptLatest(pageNumber) {
  const src = latestGeneratedImage();
  const label = pageLabel(pageNumber);
  const out = path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`);
  ensureDir(path.dirname(out));
  fs.copyFileSync(src, out);
  console.log(`[adopt] page-${label} <- ${src}`);
}

async function decodeRaw(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function componentsForColor(raw, marker) {
  const mask = new Uint8Array(raw.width * raw.height);
  for (let i = 0, p = 0; i < raw.data.length; i += 3, p += 1) {
    if (marker.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) mask[p] = 1;
  }
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const start = y * raw.width + x;
      if (!mask[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cur = queue[head++] || 0;
        const cx = cur % raw.width;
        const cy = Math.floor(cur / raw.width);
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= raw.width || ny < 0 || ny >= raw.height) continue;
            const ni = ny * raw.width + nx;
            if (!mask[ni] || seen[ni]) continue;
            seen[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const aspect = width / Math.max(1, height);
      const fillRatio = area / Math.max(1, width * height);
      if (
        area >= 18 &&
        width >= 4 &&
        height >= 4 &&
        width <= 90 &&
        height <= 90 &&
        aspect >= 0.25 &&
        aspect <= 3.5 &&
        fillRatio >= 0.12
      ) {
        components.push({ minX, minY, maxX, maxY, width, height, area });
      }
    }
  }
  return components;
}

function componentCenter(component) {
  return {
    x: component.minX + component.width / 2,
    y: component.minY + component.height / 2,
  };
}

function cornerScore(corner, nx, ny) {
  if (corner === 'top-left') return nx + ny;
  if (corner === 'top-right') return 1 - nx + ny;
  if (corner === 'bottom-left') return nx + (1 - ny);
  return 1 - nx + (1 - ny);
}

function selectCornerHits(components) {
  if (components.length < 4) return [];
  const centers = components.map(componentCenter);
  const left = Math.min(...centers.map((center) => center.x));
  const top = Math.min(...centers.map((center) => center.y));
  const right = Math.max(...centers.map((center) => center.x));
  const bottom = Math.max(...centers.map((center) => center.y));
  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return [];
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const candidatesByCorner = corners.map((corner) =>
    components
      .map((component) => {
        const center = componentCenter(component);
        return {
          corner,
          component,
          score: cornerScore(corner, (center.x - left) / width, (center.y - top) / height),
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(8, components.length)),
  );
  let best = [];
  let bestScore = Infinity;
  const used = new Set();
  const current = [];
  const search = (index, score) => {
    if (score >= bestScore) return;
    if (index >= corners.length) {
      best = current.slice();
      bestScore = score;
      return;
    }
    for (const candidate of candidatesByCorner[index] || []) {
      if (used.has(candidate.component)) continue;
      used.add(candidate.component);
      current.push({ corner: candidate.corner, component: candidate.component });
      search(index + 1, score + candidate.score);
      current.pop();
      used.delete(candidate.component);
    }
  };
  search(0, 0);
  return best.length === 4 ? best : [];
}

function bboxFromComponents(components) {
  return [
    Math.min(...components.map((component) => component.minX)),
    Math.min(...components.map((component) => component.minY)),
    Math.max(...components.map((component) => component.maxX)),
    Math.max(...components.map((component) => component.maxY)),
  ];
}

function toCanvasBbox(sourceBbox, raw) {
  return [
    round1((sourceBbox[0] / raw.width) * CANVAS_WIDTH),
    round1((sourceBbox[1] / raw.height) * CANVAS_HEIGHT),
    round1((sourceBbox[2] / raw.width) * CANVAS_WIDTH),
    round1((sourceBbox[3] / raw.height) * CANVAS_HEIGHT),
  ];
}

function median(values, fallback = 248) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? fallback;
}

function isMarkerPixel(r, g, b) {
  return MARKERS.some((marker) => marker.match(r, g, b));
}

async function writeCleanImage(raw, markerComponents, outPath) {
  const out = Buffer.from(raw.data);
  for (const component of markerComponents) {
    const pad = 7;
    const x1 = Math.max(0, Math.floor(component.minX - pad));
    const y1 = Math.max(0, Math.floor(component.minY - pad));
    const x2 = Math.min(raw.width - 1, Math.ceil(component.maxX + pad));
    const y2 = Math.min(raw.height - 1, Math.ceil(component.maxY + pad));
    const samplePad = 22;
    const rs = [];
    const gs = [];
    const bs = [];
    for (
      let y = Math.max(0, y1 - samplePad);
      y <= Math.min(raw.height - 1, y2 + samplePad);
      y += 1
    ) {
      for (
        let x = Math.max(0, x1 - samplePad);
        x <= Math.min(raw.width - 1, x2 + samplePad);
        x += 1
      ) {
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) continue;
        const i = (y * raw.width + x) * 3;
        const r = raw.data[i] || 0;
        const g = raw.data[i + 1] || 0;
        const b = raw.data[i + 2] || 0;
        if (isMarkerPixel(r, g, b)) continue;
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
    const r = median(rs);
    const g = median(gs);
    const b = median(bs);
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const i = (y * raw.width + x) * 3;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
    }
  }
  ensureDir(path.dirname(outPath));
  await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .png()
    .toFile(outPath);
}

async function recoverPage(pageNumber) {
  const label = pageLabel(pageNumber);
  const markerInput = path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`);
  const promptPlanPath = path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`);
  if (!fs.existsSync(markerInput)) throw new Error(`Missing marker image: ${markerInput}`);
  if (!fs.existsSync(promptPlanPath)) throw new Error(`Missing prompt plan: ${promptPlanPath}`);
  const promptPlan = readJson(promptPlanPath);
  ensureDir(PUBLIC_DIR);
  const markerPublic = path.join(PUBLIC_DIR, `v2-marker-slide-${label}.png`);
  const cleanPublic = path.join(PUBLIC_DIR, `v2-slide-${label}.png`);
  await sharp(markerInput)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .png()
    .toFile(markerPublic);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  const allMarkerComponents = [];
  for (const component of promptPlan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    allMarkerComponents.push(...components);
    const hits = selectCornerHits(components);
    const sourceBbox =
      hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    if (components.length !== 4) {
      findings.push(
        `${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`,
      );
    }
    if (!sourceBbox) {
      findings.push(`${component.label}: could not recover a four-corner bbox`);
    }
    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: marker.hex,
      bbox: sourceBbox ? toCanvasBbox(sourceBbox, raw) : undefined,
      markerPoints: hits.map((hit) => {
        const center = componentCenter(hit.component);
        return {
          corner: hit.corner,
          x: round1((center.x / raw.width) * CANVAS_WIDTH),
          y: round1((center.y / raw.height) * CANVAS_HEIGHT),
        };
      }),
      markerCount: components.length,
    });
  }
  await writeCleanImage(raw, allMarkerComponents, cleanPublic);
  const recoveryResult = {
    status: findings.length ? 'failed' : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
    cleanImageUrl: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    originalMarkerImageDimensions: { width: raw.width, height: raw.height },
    findings,
    components: recoveredComponents,
  };
  const nextPlan = { ...promptPlan, recoveryResult };
  writeJson(promptPlanPath, nextPlan);
  return { pageNumber, recoveryResult };
}

async function recoverPages(pageNumbers) {
  const summary = [];
  for (const pageNumber of pageNumbers) {
    const result = await recoverPage(pageNumber);
    summary.push({
      pageNumber,
      status: result.recoveryResult.status,
      findings: result.recoveryResult.findings,
    });
    console.log(`[recover] page-${pageLabel(pageNumber)} ${result.recoveryResult.status}`);
  }
  writeJson(path.join(QUEUE_DIR, 'v2-marker-recovery-summary.json'), summary);
}

function focusRegionsFromPlan(promptPlan) {
  const recoveredById = new Map(
    (promptPlan.recoveryResult?.components || [])
      .filter((component) => component.bbox && (component.markerPoints?.length || 0) === 4)
      .map((component) => [component.componentId, component]),
  );
  return promptPlan.componentPlans
    .flatMap((component, index) => {
      const recovered = recoveredById.get(component.id);
      if (!recovered?.bbox) return [];
      const [left, top, right, bottom] = recovered.bbox;
      return {
        id: component.id,
        label: component.label,
        role: component.role,
        left,
        top,
        width: round1(Math.max(20, right - left)),
        height: round1(Math.max(20, bottom - top)),
        order: index + 1,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function imageElement(pageNumber) {
  const label = pageLabel(pageNumber);
  return {
    id: `${NOTEBOOK_ID}-v2-image-${label}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    outline: { color: '#ffffff', width: 0, style: 'solid' },
    opacity: 0,
  };
}

function narrationStep(marker, title, speech) {
  return { marker, title, speech };
}

function compactContent(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .replace(/[。；;]\s*$/, '');
}

function speechContent(content) {
  return compactContent(content)
    .replace(/(?:底部写|左侧写|右侧写|顶部写|旁边写|标题|写|列|标)[“"]([^”"]+)[”"]/g, '$1')
    .replace(/画断点/g, '标出断点')
    .replace(/画/g, '')
    .replace(/；/g, '，')
    .replace(/\s*，\s*/g, '，')
    .replace(/，{2,}/g, '，')
    .replace(/^[，：:\s]+|[，。；;\s]+$/g, '');
}

function detailSpeechForComponent(_page, component, index) {
  const content = speechContent(component.content);
  const role = component.role || '';

  if (index === 0) {
    return `先看这一页的核心：${content}。把目标和条件分清楚，后面才知道该用定义、代入、变形，还是先做判断。`;
  }

  if (role === 'visual') {
    return `图像给的是直觉：${content}。读图时要把形状翻译成端点、范围、符号或大小关系，这样才能接到后面的计算。`;
  }

  if (role === 'formula') {
    return `这个式子要慢一点读：${content}。先看每个符号从哪里来，再看它把原题改成了哪一种可计算的形式。`;
  }

  if (role === 'strategy' || role === 'roadmap' || role === 'step') {
    return `这里是在安排解题顺序：${content}。按这个顺序走，才能先识别结构和关键条件，再决定计算、比较或化简。`;
  }

  if (role === 'takeaway' || role === 'hook' || role === 'mistake') {
    return `把这句话当成检查点：${content}。做题时用它回头核对端点、符号、变量、常数和结论条件。`;
  }

  return `这一步的作用是：${content}。它把前面的想法落到具体判断上，下一步才能继续计算、解释或判断。`;
}

function narrationForPage(page, pageNumber) {
  const sourceNarration = SOURCE_NARRATION_BY_PAGE.get(pageNumber);
  if (Array.isArray(sourceNarration) && sourceNarration.length) return sourceNarration;

  const steps = [];
  for (const [index, component] of page.components.entries()) {
    steps.push(narrationStep(component.marker, component.label, component.speech));
    if (index < 4) {
      steps.push(
        narrationStep(
          component.marker,
          `${component.label}：补充说明`,
          detailSpeechForComponent(page, component, index),
        ),
      );
    }
  }
  return steps;
}

function actionsForPage(page, pageNumber, focusRegions) {
  const focusByMarker = new Map();
  for (const region of focusRegions) {
    const markerName = region.id.split('-').at(-1);
    focusByMarker.set(markerName, region);
  }
  const actions = [];
  const narration =
    Array.isArray(page.narration) && page.narration.length
      ? page.narration
      : narrationForPage(page, pageNumber);

  for (const [index, step] of narration.entries()) {
    const region = step.marker ? focusByMarker.get(step.marker) : null;
    if (!region) continue;
    const sequence = String(index + 1).padStart(2, '0');
    const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-n${sequence}-${step.marker}`;
    const title = step.title || region.label || page.sceneTitle;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title,
      description: `聚焦“${region.label}”区域。`,
      dimOpacity: 0.68,
    });
    if (typeof step.speech === 'string' && step.speech.trim()) {
      actions.push({
        id: `${actionBase}-speech`,
        type: 'speech',
        title,
        text: step.speech,
      });
    }
  }
  return actions;
}

function canvasFor(pageNumber, focusRegions) {
  return {
    id: `${NOTEBOOK_ID}-v2-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#334155', '#a16207', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(pageNumber), ...focusRegions.map(hotspotElement)],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function writeNarrationFiles() {
  const narrationDir = path.join(QUEUE_DIR, 'v2-narration');
  ensureDir(narrationDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const promptPlan = readJson(
      path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`),
    );
    const focusRegions = focusRegionsFromPlan(promptPlan);
    const actions = actionsForPage(page, pageNumber, focusRegions);
    writeJson(path.join(narrationDir, `page-${label}.actions.json`), {
      schemaVersion: 1,
      notebookId: NOTEBOOK_ID,
      pageNumber,
      sceneTitle: page.sceneTitle,
      imagePath: `${PUBLIC_PATH}/v2-slide-${label}.png`,
      markerSourceImagePath: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
      focusRegions,
      actions,
      qa: {
        language: 'zh-CN',
        noCourseCodePageNumberOrWeekInPrompt: true,
        spotlightTargetsExist: actions
          .filter((action) => action.type === 'spotlight')
          .every((action) => focusRegions.some((region) => region.id === action.elementId)),
        speechCount: actions.filter((action) => action.type === 'speech').length,
        focusCount: focusRegions.length,
      },
    });
  }
  console.log(`[narration] wrote ${PAGES.length} files`);
}

async function renderContactSheet() {
  const columns = 3;
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 30;
  const composites = [];
  for (let pageNumber = 1; pageNumber <= PAGES.length; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const file = path.join(PUBLIC_DIR, `v2-slide-${label}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="12" y="21" fill="#ffffff" font-size="15" font-family="Arial">${pageNumber}. ${PAGES[pageNumber - 1].sceneTitle}</text></svg>`;
    const thumb = await sharp(file)
      .resize(thumbWidth, thumbHeight)
      .extend({ bottom: labelHeight, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: ((pageNumber - 1) % columns) * thumbWidth,
      top: Math.floor((pageNumber - 1) / columns) * (thumbHeight + labelHeight),
    });
  }
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(PAGES.length / columns) * (thumbHeight + labelHeight),
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'v2-contact-sheet.png'));
  console.log(`[contact-sheet] ${path.join(PUBLIC_DIR, 'v2-contact-sheet.png')}`);
}

function loadEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const now = new Date();
    const scenes = [];
    for (const [index, page] of PAGES.entries()) {
      const pageNumber = index + 1;
      const label = pageLabel(pageNumber);
      const promptPlan = readJson(
        path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`),
      );
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') {
        throw new Error(`Page ${pageNumber} recovery is not passed`);
      }
      if (focusRegions.length !== page.components.length) {
        throw new Error(
          `Page ${pageNumber} focus count mismatch: ${focusRegions.length}/${page.components.length}`,
        );
      }
      scenes.push({
        id: `${NOTEBOOK_ID}-v2-p${label}`,
        notebookId: NOTEBOOK_ID,
        title: page.sceneTitle,
        type: 'slide',
        order: index,
        content: {
          type: 'slide',
          canvas: canvasFor(pageNumber, focusRegions),
          webRenderMode: 'slide',
          semanticHitMap: {
            version: 1,
            source: 'imagegen-corner-marker-recovery-v2',
            sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
            canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            regions: focusRegions.map((region) => ({
              id: region.id,
              semanticId: region.id,
              label: region.label,
              canvasRect: {
                left: region.left,
                top: region.top,
                width: region.width,
                height: region.height,
              },
            })),
          },
          imageNotebookPromptPlan: promptPlan,
        },
        actions: actionsForPage(page, pageNumber, focusRegions),
        whiteboard: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: course.ownerId,
          courseId: course.id,
          name: '反常积分：从极限定义到比较判别',
          description:
            '第八本中文手绘图片笔记本：反常积分、p-积分、比较判别、拆区间、部分分式与高斯型换元。',
          tags: ['MAT136', '反常积分', '比较判别', 'p-积分', '部分分式', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar9.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '反常积分：从极限定义到比较判别',
          description:
            '第八本中文手绘图片笔记本：反常积分、p-积分、比较判别、拆区间、部分分式与高斯型换元。',
          tags: ['MAT136', '反常积分', '比较判别', 'p-积分', '部分分式', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar9.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] replaced ${NOTEBOOK_ID}; scenes=${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

function pageNumbersFromArgs() {
  const pageIndex = process.argv.indexOf('--page');
  if (pageIndex >= 0) return [Number(process.argv[pageIndex + 1])];
  return PAGES.map((_, index) => index + 1);
}

function usage() {
  console.log(`Usage:
  node scripts/notebooks/${SCRIPT_NAME} --prepare-prompts
  node scripts/notebooks/${SCRIPT_NAME} --adopt-latest --page <n>
  node scripts/notebooks/${SCRIPT_NAME} --recover [--page <n>]
  node scripts/notebooks/${SCRIPT_NAME} --write-narration
  node scripts/notebooks/${SCRIPT_NAME} --contact-sheet
  node scripts/notebooks/${SCRIPT_NAME} --seed-db`);
}

async function main() {
  if (process.argv.includes('--prepare-prompts')) return preparePrompts();
  if (process.argv.includes('--adopt-latest')) return adoptLatest(pageNumbersFromArgs()[0]);
  if (process.argv.includes('--recover')) return recoverPages(pageNumbersFromArgs());
  if (process.argv.includes('--write-narration')) return writeNarrationFiles();
  if (process.argv.includes('--contact-sheet')) return renderContactSheet();
  if (process.argv.includes('--seed-db')) return seedDb();
  usage();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
