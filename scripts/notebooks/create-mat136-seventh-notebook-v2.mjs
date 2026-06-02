#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-seventh-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-07-sequence';
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
    title: '数列：把函数放在自然数上',
    sceneTitle: '数列入口',
    layout:
      '上方标题；左侧定义数列；中间画自然数到数轴的箭头；右侧比较通项与递归；底部提出收敛问题。',
    components: [
      {
        label: '本册问题',
        role: 'opening',
        marker: 'red',
        content: '标题“数列：把函数放在自然数上”；写“a_n 是第 n 个数，n 只取自然数”。',
        speech: '这一页进入数列。数列可以看成定义在自然数上的函数：输入 n，输出第 n 项 a_n。',
      },
      {
        label: '函数观点',
        role: 'concept',
        marker: 'lime',
        content: '写“S:N→R，n↦a_n”；画 n=1,2,3,… 指向数轴上的点。',
        speech:
          '左侧用函数观点来读数列。自然数 n 是输入，实数 a_n 是输出，所以数列不是一堆散乱数字，而是一条规则。',
      },
      {
        label: '两种给法',
        role: 'strategy',
        marker: 'blue',
        content: '写“通项公式：直接给 a_n；递归公式：用前项推后项”。',
        speech: '数列通常有两种给法。通项公式能直接算第 n 项；递归公式要从初始项开始一步步推出。',
      },
      {
        label: '例子速览',
        role: 'examples',
        marker: 'cyan',
        content: '列“1/n、(-1)^n、n(n+1)/2、a_{n+1}=√(2+a_n)”并标不同类型。',
        speech:
          '右侧先放几个本册会反复出现的形状：有理式、交错项、多项式型和递归型。后面会分别判断它们是否收敛。',
      },
      {
        label: '引导问题',
        role: 'hook',
        marker: 'yellow',
        content: '底部问题：“当 n 越来越大，a_n 会靠近某个固定数吗？”',
        speech: '底部问题就是数列极限的核心：当 n 越来越大，数列项是否会靠近某个固定数。',
      },
    ],
  },
  {
    title: '数列符号：项、下标和前几项',
    sceneTitle: '符号与前几项',
    layout: '左侧解释 a_n 和下标；中间展开前几项；右侧交错例子；底部提醒从 n=1 或 n=0 开始。',
    components: [
      {
        label: '符号拆开',
        role: 'concept',
        marker: 'red',
        content: '写“a_n：第 n 项；n 是位置，不是变量范围里的任意实数”。',
        speech: '先把符号拆开。a_n 里的 n 表示位置，它通常取一、二、三这些自然数。',
      },
      {
        label: '前几项',
        role: 'examples',
        marker: 'lime',
        content: '写“若 a_n=1/n，则 a_1=1，a_2=1/2，a_3=1/3”。',
        speech: '通项公式给出以后，算前几项就是把 n 依次代入一、二、三。这样可以快速看出数列趋势。',
      },
      {
        label: '交错例子',
        role: 'examples',
        marker: 'blue',
        content: '写“(-1)^{n+1}: 1,-1,1,-1,…；符号震荡”。',
        speech:
          '这个交错例子提醒我们：数列可以来回跳动，不一定单调。符号震荡本身不等于发散，要看大小是否趋近某个数。',
      },
      {
        label: '三角数例子',
        role: 'formula',
        marker: 'cyan',
        content: '写“a_n=n(n+1)/2 ⇒ 1,3,6,10,15,…”并画小点阵。',
        speech:
          '三角数 a_n 等于 n 乘 n 加一除以二，前几项是一、三、六、十、十五。它的增长很快，不会靠近固定值。',
      },
      {
        label: '下标提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先确认从 n=1 还是 n=0 开始，再算前几项”。',
        speech: '底部提醒很实用：先看题目从 n 等于一还是零开始，否则前几项会整体错位。',
      },
    ],
  },
  {
    title: '递归数列：从初始项一步步推',
    sceneTitle: '递归数列概念',
    layout: '左侧定义递归；中间放递推机器；右侧三个例子；底部强调初始项不可少。',
    components: [
      {
        label: '递归定义',
        role: 'definition',
        marker: 'red',
        content: '写“递归：a_{n+1} 由前面某些项决定”。',
        speech: '递归数列不是直接告诉第 n 项，而是告诉你如何从前面已知项推到后面一项。',
      },
      {
        label: '初始项',
        role: 'concept',
        marker: 'lime',
        content: '写“必须给 a_1 或 a_0；否则机器无法启动”。',
        speech: '递归公式必须配初始项。没有起点，即使递推规则写得很清楚，也算不出具体数列。',
      },
      {
        label: '等差递归',
        role: 'examples',
        marker: 'blue',
        content: '写“a_{n+1}=a_n+2，a_1=1 ⇒ 1,3,5,7,…”。',
        speech: '等差数列可以递归地写成后一项等于前一项加二。初始项是一，所以得到一、三、五、七。',
      },
      {
        label: '等比递归',
        role: 'examples',
        marker: 'cyan',
        content: '写“a_{n+1}=2a_n，a_1=1 ⇒ 1,2,4,8,…；a_{n+1}=a_n/2 ⇒ 1,1/2,1/4,…”。',
        speech: '等比数列也可以递归表示。乘二会增长，乘二分之一会靠近零。',
      },
      {
        label: '递归检查',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“算递归：先写初始项，再一行一行代入”。',
        speech: '底部给做题流程：先写初始项，再把上一项代进公式，一行一行往后推。',
      },
    ],
  },
  {
    title: '收敛的意思：最后靠近 L',
    sceneTitle: '收敛定义',
    layout: '左侧直观图；中间 epsilon 定义；右侧 N 后所有项；底部把定义翻译成一句话。',
    components: [
      {
        label: '直观图像',
        role: 'visual',
        marker: 'red',
        content: '画数轴上 a_n 的点逐渐靠近 L；写“靠近，不一定等于”。',
        speech:
          '收敛的直观意思是：后面的项越来越靠近某个数 L。它不要求每一项等于 L，只要求最终任意接近。',
      },
      {
        label: '正式定义',
        role: 'formula',
        marker: 'lime',
        content: '写“∀ε>0，∃N，使 n>N 时 |a_n-L|<ε”。',
        speech: '正式定义中的 ε 是允许误差，N 是从哪一项以后开始稳定进入误差范围。',
      },
      {
        label: '误差带',
        role: 'visual',
        marker: 'blue',
        content: '画 L-ε 到 L+ε 的区间，后面所有点落进去。',
        speech: '图上这条误差带表示离 L 的距离小于 ε。收敛要求足够靠后的所有项都落在这条带里。',
      },
      {
        label: '反例直觉',
        role: 'concept',
        marker: 'cyan',
        content: '写“若一直在两个远点之间跳，通常没有极限”。',
        speech: '如果数列一直在两个相隔很远的值之间跳，就无法最终靠近同一个 L，这通常意味着发散。',
      },
      {
        label: '一句话',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“收敛=尾巴稳定靠近一个固定数”。',
        speech: '底部一句话总结：收敛看的是数列的尾巴，尾巴要稳定地靠近一个固定数。',
      },
    ],
  },
  {
    title: '几何型数列：|r|<1 时趋近 0',
    sceneTitle: '几何型收敛',
    layout: '左侧 r^n 图像；中间正数例子；右侧负数交错例子；下方分类表；底部规则。',
    components: [
      {
        label: '核心规则',
        role: 'formula',
        marker: 'red',
        content: '写“若 |r|<1，则 r^n→0；若 |r|>1，则通常发散”。',
        speech: '几何型数列最先看公比 r 的绝对值。绝对值小于一时，幂次会压到零。',
      },
      {
        label: '正数例子',
        role: 'examples',
        marker: 'lime',
        content: '写“a_n=(0.2)^n：0.2,0.04,0.008,… →0”。',
        speech: '零点二的 n 次方每次都乘零点二，所以项越来越小，极限为零。',
      },
      {
        label: '交错例子',
        role: 'examples',
        marker: 'blue',
        content: '写“a_n=(-0.2)^n：符号交错，但 |a_n|=(0.2)^n→0”。',
        speech: '负零点二的 n 次方会正负交替，但大小仍然趋近零，所以它也收敛到零。',
      },
      {
        label: '分类表',
        role: 'strategy',
        marker: 'cyan',
        content: '列“r=1：极限1；r=-1：震荡；|r|>1：发散；r=0：从第二项起0”。',
        speech: '这张小表帮你处理边界情况。尤其 r 等于负一会在一和负一之间震荡，不收敛。',
      },
      {
        label: '判断句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先看 |r|，再看符号是否只影响震荡”。',
        speech: '底部判断句：几何型先看绝对值，符号只决定是否交错，不一定改变极限。',
      },
    ],
  },
  {
    title: '指数型：e^{-n} 消失，e^n 爆开',
    sceneTitle: '指数型收敛',
    layout: '左侧 e^{-n}；中间 3+e^{-n}；右侧 e^n；底部比较表和结论。',
    components: [
      {
        label: '衰减项',
        role: 'formula',
        marker: 'red',
        content: '写“e^{-n}=1/e^n →0”。',
        speech: 'e 的负 n 次方等于一除以 e 的 n 次方。分母越来越大，所以这一项趋近零。',
      },
      {
        label: '平移例子',
        role: 'examples',
        marker: 'lime',
        content: '写“a_n=3+e^{-n} ⇒ lim a_n=3+0=3”。',
        speech: '常数三不会动，e 的负 n 次方消失，所以整个数列靠近三。',
      },
      {
        label: '增长项',
        role: 'formula',
        marker: 'blue',
        content: '写“e^n→∞，所以 3+e^n 发散到 ∞”。',
        speech: '如果指数是正 n，e 的 n 次方会无限增长，因此三加 e 的 n 次方不会收敛。',
      },
      {
        label: '符号检查',
        role: 'strategy',
        marker: 'cyan',
        content: '写“看指数里是 -n 还是 +n；看是否还有常数平移”。',
        speech: '指数题最容易看错符号。先判断是衰减还是增长，再把常数平移加回去。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“趋近 0 的小尾巴，只留下常数”。',
        speech: '底部结论：如果后面的尾巴趋近零，极限就只剩下前面的常数部分。',
      },
    ],
  },
  {
    title: '有理式数列：看最高次项',
    sceneTitle: '有理式极限',
    layout: '左侧例题；中间除以 n；右侧最高次规则；下方三种次数比较；底部检查。',
    components: [
      {
        label: '例题入口',
        role: 'opening',
        marker: 'red',
        content: '写“a_n=(2n+1)/n”。',
        speech: '有理式数列通常先看分子分母的最高次项。这题分子和分母都是一次。',
      },
      {
        label: '代数化简',
        role: 'formula',
        marker: 'lime',
        content: '写“(2n+1)/n=2+1/n”。',
        speech: '把每一项都除以 n，就得到二加一除以 n。后面的 1/n 会趋近零。',
      },
      {
        label: '极限结果',
        role: 'formula',
        marker: 'blue',
        content: '写“lim (2+1/n)=2”。',
        speech: '因为一除以 n 趋近零，所以整个数列的极限是二。',
      },
      {
        label: '次数规则',
        role: 'strategy',
        marker: 'cyan',
        content: '列“同次：首项系数比；分母高：0；分子高：发散或无穷”。',
        speech: '右侧给一般规则：同次看最高次系数比，分母次数更高趋零，分子次数更高通常发散。',
      },
      {
        label: '检查句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先除以最高次 n^k，再让 1/n→0”。',
        speech: '底部流程：先除以最高次的 n 的幂，再把一除以 n 的项送到零。',
      },
    ],
  },
  {
    title: '交错但变小：(-1)^n/n 收敛',
    sceneTitle: '交错除以n',
    layout: '左侧前几项；中间夹逼不等式；右侧图上震荡缩小；底部结论。',
    components: [
      {
        label: '前几项',
        role: 'examples',
        marker: 'red',
        content: '写“a_n=(-1)^n/n：-1,1/2,-1/3,1/4,…”。',
        speech: '这个数列的符号一直交错，但每一项的大小是 1/n，越来越小。',
      },
      {
        label: '大小控制',
        role: 'formula',
        marker: 'lime',
        content: '写“|a_n|=1/n→0”。',
        speech: '判断交错数列时，先看绝对值。这里绝对值是一除以 n，所以大小趋近零。',
      },
      {
        label: '夹逼写法',
        role: 'formula',
        marker: 'blue',
        content: '写“-1/n ≤ (-1)^n/n ≤ 1/n”。',
        speech: '严格一点可以用夹逼：数列夹在负一除以 n 和正一除以 n 之间，两边都趋近零。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'cyan',
        content: '画点在 0 上下交替，但振幅逐渐缩小。',
        speech: '图上可以看到点在零的上下跳动，但振幅越来越小，因此尾巴最终贴近零。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“交错不怕；怕的是振幅不消失”。',
        speech: '底部一句话：交错本身不可怕，关键是振幅是否消失。',
      },
    ],
  },
  {
    title: '夹逼定理：sin n / n 的极限',
    sceneTitle: '夹逼法',
    layout: '左侧目标；中间三段不等式；右侧两边极限；下方图像振幅；底部流程。',
    components: [
      {
        label: '目标数列',
        role: 'opening',
        marker: 'red',
        content: '写“a_n=sin n / n”。',
        speech: '这题不能说 sin n 自己有极限，因为 sin n 会一直震荡。但除以 n 后，振幅变小。',
      },
      {
        label: '有界核心',
        role: 'formula',
        marker: 'lime',
        content: '写“-1≤sin n≤1”。',
        speech: '夹逼的核心是 sin n 永远在负一和一之间，这给了我们上下界。',
      },
      {
        label: '除以 n',
        role: 'formula',
        marker: 'blue',
        content: '写“-1/n ≤ sin n/n ≤ 1/n”。',
        speech: '当 n 为正时，不等式三边同时除以 n，方向不变。',
      },
      {
        label: '两边极限',
        role: 'formula',
        marker: 'cyan',
        content: '写“lim(-1/n)=0，lim(1/n)=0，所以 lim sin n/n=0”。',
        speech: '左右两边都趋近零，被夹在中间的数列也必须趋近零。',
      },
      {
        label: '流程总结',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“找有界因子 × 趋零因子，是夹逼常见形状”。',
        speech: '底部总结：有界因子乘上趋零因子，是夹逼法里非常常见的形状。',
      },
    ],
  },
  {
    title: '有界数列：不会跑太远',
    sceneTitle: '有界数列',
    layout: '左侧定义；中间数轴夹住；右侧例子/非例子；底部连接收敛。',
    components: [
      {
        label: '定义',
        role: 'definition',
        marker: 'red',
        content: '写“存在 K≥0，使所有 n 都满足 |a_n|≤K”。',
        speech: '有界的意思是所有项都被某个固定的 K 控制住，不会跑到无穷远。',
      },
      {
        label: '数轴图',
        role: 'visual',
        marker: 'lime',
        content: '画区间 [-K,K]，所有 a_n 点都落在里面。',
        speech: '图像上，有界数列的所有点都落在负 K 到 K 的区间内。',
      },
      {
        label: '有界例子',
        role: 'examples',
        marker: 'blue',
        content: '写“(-1)^n 有界；sin n 有界；1/n 有界”。',
        speech: '这些例子都不会跑远。注意有界不代表一定收敛，比如负一的 n 次方在两个值之间跳。',
      },
      {
        label: '非有界例子',
        role: 'examples',
        marker: 'cyan',
        content: '写“n、n²、e^n 都不有界”。',
        speech: 'n、n 平方和 e 的 n 次方都会越来越大，所以它们不是有界数列。',
      },
      {
        label: '连接定理',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“收敛 ⇒ 有界；有界 ⇏ 收敛”。',
        speech: '底部是关键逻辑：收敛一定有界，但有界不一定收敛。这个方向不能反过来乱用。',
      },
    ],
  },
  {
    title: '单调数列：一直往一个方向走',
    sceneTitle: '单调数列',
    layout: '左侧递增定义；中间递减定义；右侧差分判断；底部例子表。',
    components: [
      {
        label: '递增定义',
        role: 'definition',
        marker: 'red',
        content: '写“若 a_{n+1}≥a_n，则数列递增”。',
        speech: '递增数列的意思是后一项不小于前一项。严格递增则要大于。',
      },
      {
        label: '递减定义',
        role: 'definition',
        marker: 'lime',
        content: '写“若 a_{n+1}≤a_n，则数列递减”。',
        speech: '递减数列的意思是后一项不大于前一项。它一直往下走或者保持不变。',
      },
      {
        label: '差分判断',
        role: 'strategy',
        marker: 'blue',
        content: '写“看 a_{n+1}-a_n 的符号”。',
        speech: '判断单调性最常用的方法是看差分。如果差分非负，就递增；如果非正，就递减。',
      },
      {
        label: '比值判断',
        role: 'strategy',
        marker: 'cyan',
        content: '写“正项也可看 a_{n+1}/a_n 与 1 比较”。',
        speech: '对于正项数列，有时看比值更方便。比值大于一往往表示递增，小于一表示递减。',
      },
      {
        label: '例子表',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部列“1/n 递减；n/(n+1) 递增；(-1)^n 不单调”。',
        speech: '底部例子帮助区分：一除以 n 递减，n 除以 n 加一递增，交错数列通常不单调。',
      },
    ],
  },
  {
    title: '单调有界定理：收敛的常用入口',
    sceneTitle: '单调有界定理',
    layout: '左侧定理；中间上界/下界图；右侧证明套路；底部逻辑箭头。',
    components: [
      {
        label: '定理',
        role: 'theorem',
        marker: 'red',
        content: '写“递增且有上界 ⇒ 收敛；递减且有下界 ⇒ 收敛”。',
        speech:
          '单调有界定理是证明数列收敛的常用工具。只要方向固定，而且被挡住，就一定会靠近某个极限。',
      },
      {
        label: '图像直觉',
        role: 'visual',
        marker: 'lime',
        content: '画递增点列逐渐靠近一条上界线。',
        speech: '图像直觉是：数列一直往上走，但上面有天花板，所以最终会逼近某个高度。',
      },
      {
        label: '证明套路',
        role: 'strategy',
        marker: 'blue',
        content: '写“两步：先证单调，再证有界”。',
        speech: '做题时通常分两步：先证明单调，再证明有界。两步都完成后，就能说它收敛。',
      },
      {
        label: '不能反用',
        role: 'mistake',
        marker: 'cyan',
        content: '写“有界但不单调，不一定收敛；例 (-1)^n”。',
        speech: '只知道有界还不够。负一的 n 次方有界，但来回震荡，所以不收敛。',
      },
      {
        label: '逻辑链',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“单调 + 有界 ⇒ 收敛；收敛 ⇒ 有界”。',
        speech: '底部逻辑链要记清楚：单调加有界能推出收敛；收敛本身也能推出有界。',
      },
    ],
  },
  {
    title: '递归例题：a_{n+1}=√(2+a_n)',
    sceneTitle: '递归例题设定',
    layout: '左侧题目；中间算前三项；右侧猜测极限；底部证明路线。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“a_1=1，a_{n+1}=√(2+a_n)”；求是否收敛和极限。',
        speech: '这道递归题来自资料最后一页。目标是先证明它收敛，再求极限。',
      },
      {
        label: '前三项',
        role: 'formula',
        marker: 'lime',
        content: '写“a_1=1，a_2=√3，a_3=√(2+√3)”。',
        speech: '先算前三项，能看出它在上升，并且看起来靠近二。',
      },
      {
        label: '路线选择',
        role: 'strategy',
        marker: 'blue',
        content: '写“证明收敛：单调 + 有界”。',
        speech: '递归极限题不能直接令极限存在，通常先用单调有界定理证明它真的收敛。',
      },
      {
        label: '先猜范围',
        role: 'concept',
        marker: 'cyan',
        content: '写“1≤a_n≤2；若成立，则根号内在 3 到 4 之间”。',
        speech: '证明前先猜范围。这里所有项应该在一和二之间，这也会帮助我们证明单调。',
      },
      {
        label: '提示',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“递归题：先算几项，再找不变量区间”。',
        speech: '底部提示：递归题先算几项，猜出不变量区间，再用归纳证明它一直留在区间内。',
      },
    ],
  },
  {
    title: '证明有界：把项关在 2 以下',
    sceneTitle: '递归有界证明',
    layout: '左侧归纳目标；中间基础步；右侧递推步；底部结论。',
    components: [
      {
        label: '归纳目标',
        role: 'proof',
        marker: 'red',
        content: '写“证明：0≤a_n≤2 对所有 n 成立”。',
        speech: '先证明有界。目标是把所有项关在零到二之间，尤其要证明上界二。',
      },
      {
        label: '基础步',
        role: 'proof',
        marker: 'lime',
        content: '写“a_1=1，满足 0≤1≤2”。',
        speech: '归纳基础步很直接：第一项等于一，确实在零和二之间。',
      },
      {
        label: '递推步',
        role: 'proof',
        marker: 'blue',
        content: '写“若 a_n≤2，则 a_{n+1}=√(2+a_n)≤√4=2”。',
        speech: '如果第 n 项不超过二，那么下一项是根号二加 a_n，也不超过根号四，就是二。',
      },
      {
        label: '非负性',
        role: 'proof',
        marker: 'cyan',
        content: '写“根号输出非负，所以 a_{n+1}≥0”。',
        speech: '因为递推公式是平方根，下一项天然非负，所以下界也成立。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“归纳得到：数列有上界 2，且所有项非负”。',
        speech: '这样就用归纳法证明了有界：所有项都非负，并且不超过二。',
      },
    ],
  },
  {
    title: '证明单调：下一项不小于上一项',
    sceneTitle: '递归单调证明',
    layout: '左侧目标；中间等价变形；右侧利用上界；底部得到递增。',
    components: [
      {
        label: '单调目标',
        role: 'proof',
        marker: 'red',
        content: '写“要证 a_{n+1}≥a_n”。',
        speech: '接下来证明单调。因为前几项看起来在上升，我们目标是证明下一项总不小于上一项。',
      },
      {
        label: '平方比较',
        role: 'formula',
        marker: 'lime',
        content: '写“a_{n+1}≥a_n ⇔ √(2+a_n)≥a_n”。',
        speech: '由于两边都是非负数，可以通过平方来比较。',
      },
      {
        label: '等价不等式',
        role: 'formula',
        marker: 'blue',
        content: '写“2+a_n≥a_n² ⇔ (2-a_n)(a_n+1)≥0”。',
        speech: '平方后整理，得到二加 a_n 大于等于 a_n 平方，也就是二减 a_n 乘 a_n 加一非负。',
      },
      {
        label: '利用范围',
        role: 'proof',
        marker: 'cyan',
        content: '写“0≤a_n≤2 ⇒ 2-a_n≥0，a_n+1>0”。',
        speech: '上一页已经证明零到二的范围，所以两个因子都非负，单调性成立。',
      },
      {
        label: '结论',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“有界 + 递增 ⇒ 数列收敛”。',
        speech: '现在我们有了有界和递增，根据单调有界定理，这个递归数列一定收敛。',
      },
    ],
  },
  {
    title: '求递归极限：先证明存在，再代入',
    sceneTitle: '递归极限求值',
    layout: '左侧设极限；中间两边取极限；右侧解方程；底部排除不合适根。',
    components: [
      {
        label: '设极限',
        role: 'formula',
        marker: 'red',
        content: '写“已知收敛，设 lim a_n=L”。',
        speech: '这一步必须在证明收敛之后做。既然已经知道极限存在，就可以设它等于 L。',
      },
      {
        label: '代入递推',
        role: 'formula',
        marker: 'lime',
        content: '写“L=√(2+L)”。',
        speech: '当 n 趋近无穷时，a_{n+1} 和 a_n 都趋近同一个 L，所以递推式变成 L 等于根号二加 L。',
      },
      {
        label: '解方程',
        role: 'formula',
        marker: 'blue',
        content: '写“L²=2+L ⇒ L²-L-2=0 ⇒ L=2 或 -1”。',
        speech: '两边平方得到二次方程，解出两个候选值：二和负一。',
      },
      {
        label: '排除负根',
        role: 'proof',
        marker: 'cyan',
        content: '写“因为 a_n≥0，极限不能是 -1”。',
        speech: '所有项都非负，所以极限不可能是负一。只能选择二。',
      },
      {
        label: '最终答案',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“因此 lim a_n=2”。',
        speech: '最终结论：这个递归数列收敛，并且极限等于二。',
      },
    ],
  },
  {
    title: '常见错误：数列极限别跳步',
    sceneTitle: '常见错误检查',
    layout: '四块错误分散排列：变量、震荡、有界、递归；底部最终检查清单。',
    components: [
      {
        label: '下标错误',
        role: 'mistake',
        marker: 'red',
        content: '写“n 是整数下标；先确认从 n=0 还是 n=1 开始”。',
        speech: '第一类错误是下标错位。数列的 n 是整数下标，起点不同会影响前几项和递归启动。',
      },
      {
        label: '震荡错误',
        role: 'mistake',
        marker: 'lime',
        content: '写“交错不一定发散；看振幅是否趋零”。',
        speech: '第二类错误是见到交错就说发散。真正要看的是振幅是否消失。',
      },
      {
        label: '有界误用',
        role: 'mistake',
        marker: 'blue',
        content: '写“有界不推出收敛；还需要单调或其它论证”。',
        speech: '第三类错误是把有界当成收敛。只有有界还不够，还要配合单调或其它收敛理由。',
      },
      {
        label: '递归跳步',
        role: 'mistake',
        marker: 'cyan',
        content: '写“递归求极限前，先证明极限存在”。',
        speech: '第四类错误是直接把递归式里的 a_n 换成 L。这样做之前，必须先证明数列收敛。',
      },
      {
        label: '最终清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“算前几项；猜极限；证有界；证单调；再求 L”。',
        speech: '最终清单特别适合递归题：先算前几项，猜极限，再证有界和单调，最后才求 L。',
      },
    ],
  },
  {
    title: '总结：数列极限怎么判断',
    sceneTitle: '总结',
    layout: '中心写“尾巴行为”；四周连接常见工具；底部收束。',
    components: [
      {
        label: '核心思想',
        role: 'summary',
        marker: 'red',
        content: '中心写“数列极限看尾巴行为”。',
        speech: '最后一页总结本册。数列极限看的不是前几项热闹不热闹，而是尾巴最终靠近哪里。',
      },
      {
        label: '直接极限',
        role: 'formula',
        marker: 'lime',
        content: '写“几何型、指数型、有理式：先化简再取极限”。',
        speech: '能直接算的题，先化简结构：几何型看公比，指数型看正负， 有理式看最高次项。',
      },
      {
        label: '夹逼工具',
        role: 'strategy',
        marker: 'blue',
        content: '写“有界因子 × 趋零因子 ⇒ 常用夹逼”。',
        speech: '遇到 sin n 除以 n 或交错除以 n，可以用有界因子乘趋零因子的夹逼思想。',
      },
      {
        label: '定理工具',
        role: 'theorem',
        marker: 'cyan',
        content: '写“单调 + 有界 ⇒ 收敛；收敛 ⇒ 有界”。',
        speech: '证明型题常用单调有界定理。方向要记清楚：收敛推出有界，但有界不一定推出收敛。',
      },
      {
        label: '最后一句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先看模式，再选工具：化简、夹逼、单调有界”。',
        speech: '最后一句是解题顺序：先识别模式，再选择工具，是化简、夹逼，还是单调有界。',
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
        '数列的入口',
        '这一讲从数列开始。数列可以看成一个函数，只是它的输入不是所有实数，而是自然数一、二、三这些下标。',
      ),
      narrationStep(
        'red',
        '第 n 项',
        'a_n 表示第 n 个数。这里的 n 是位置，所以数列关心的是第一项、第二项、第三项一直往后的规律。',
      ),
      narrationStep(
        'lime',
        '函数观点',
        '用函数语言说，就是 S:N→R，把每个自然数 n 送到一个实数 a_n。',
      ),
      narrationStep(
        'lime',
        '不是散乱数字',
        '所以数列不是随便摆出一串数，而是每个位置都有规则决定对应的值。',
      ),
      narrationStep(
        'blue',
        '两种给法',
        '数列常见给法有两种：一种直接给通项 a_n，另一种给递推公式，让后面的项由前面的项推出。',
      ),
      narrationStep(
        'blue',
        '先分清题型',
        '看到题目时先分清它是通项公式还是递归定义。通项题直接代 n，递归题必须从初始项开始往后算。',
      ),
      narrationStep(
        'cyan',
        '例子预览',
        '例如 1/n、(-1)^n、n(n+1)/2 都是通项给法；a_{n+1}=√(2+a_n) 则是递归给法。',
      ),
      narrationStep(
        'cyan',
        '本讲问题',
        '这些例子的行为差别很大：有的靠近零，有的发散到无穷，有的来回震荡，有的需要证明才知道。',
      ),
      narrationStep(
        'yellow',
        '核心问题',
        '数列极限的核心问题只有一句：当 n 越来越大时，a_n 会不会靠近某个固定的实数。',
      ),
    ],
  ],
  [
    2,
    [
      narrationStep(
        'red',
        '读懂下标',
        '先把 a_n 的下标读清楚。n 不是连续变量，而是数列的位置；a_1、a_2、a_3 是一个一个项。',
      ),
      narrationStep(
        'red',
        '起点要看题目',
        '有的数列从 n=1 开始，有的从 n=0 开始。起点不同，前几项会不一样，递归题尤其容易错位。',
      ),
      narrationStep(
        'lime',
        '通项代入',
        '如果 a_n=1/n，那么把 n=1,2,3 代进去，就得到 1、1/2、1/3。',
      ),
      narrationStep(
        'lime',
        '先算前几项',
        '算前几项不是为了代替证明，而是为了看趋势：它是在变小、变大，还是来回跳。',
      ),
      narrationStep(
        'blue',
        '交错例子',
        '(-1)^{n+1} 会给出 1、-1、1、-1 这样的交错数列。它一直跳，不靠近单一数值。',
      ),
      narrationStep(
        'blue',
        '交错不一定发散',
        '但要注意，交错本身不一定发散。如果交错的振幅越来越小，也可能收敛。',
      ),
      narrationStep(
        'cyan',
        '三角数例子',
        'a_n=n(n+1)/2 的前几项是 1、3、6、10、15。这个数列一直增长，不会靠近固定数。',
      ),
      narrationStep(
        'cyan',
        '增长型判断',
        '像 n(n+1)/2 这种多项式增长，项会越来越大，通常直接判断为发散到无穷。',
      ),
      narrationStep('yellow', '本页习惯', '处理新数列时先做三件事：看起点，算前几项，猜尾巴行为。'),
    ],
  ],
  [
    3,
    [
      narrationStep(
        'red',
        '递归数列',
        '递归数列的意思是：不是直接给出 a_n，而是告诉你怎样由前面已经知道的项推出后面的项。',
      ),
      narrationStep(
        'red',
        '递推公式',
        '这个“由前推后”的规则叫递推公式。它可能只用前一项，也可能用前面好几项。',
      ),
      narrationStep(
        'lime',
        '初始项必要',
        '递归公式一定要配初始项。没有 a_1 或 a_0，公式就像机器没有启动值，算不出具体数列。',
      ),
      narrationStep(
        'lime',
        '从起点往后算',
        '计算递归数列时，不是随便代 n，而是先写初始项，再把它代进公式得到下一项。',
      ),
      narrationStep(
        'blue',
        '等差递归',
        '例如 a_{n+1}=a_n+2，a_1=1，会得到 1、3、5、7。每次都在前一项基础上加二。',
      ),
      narrationStep(
        'blue',
        '等比递归',
        'a_{n+1}=2a_n 会不断翻倍；a_{n+1}=a_n/2 会越来越小。这些都是递归描述的等比数列。',
      ),
      narrationStep(
        'cyan',
        '阶乘型例子',
        '像 1、1、2、6、24、120 这类阶乘增长，也可以递归理解：后一项由前一项乘上新的因子。',
      ),
      narrationStep(
        'cyan',
        '递归题难点',
        '递归题的难点通常不是算前几项，而是证明它的长期行为，比如是否有界、是否单调、是否收敛。',
      ),
      narrationStep(
        'yellow',
        '做题流程',
        '递归数列先算几项观察趋势，再用证明工具确认这个趋势真的一直成立。',
      ),
    ],
  ],
  [
    4,
    [
      narrationStep(
        'red',
        '收敛定义',
        '数列收敛的意思是存在一个实数 L，使得后面的 a_n 可以任意接近 L。',
      ),
      narrationStep(
        'red',
        '看尾巴',
        '收敛不要求前几项好看，也不要求每一项都很接近 L；它只要求足够靠后的尾巴稳定靠近 L。',
      ),
      narrationStep(
        'lime',
        'ε 的意思',
        '正式定义里的 ε 是允许误差。无论你给多小的误差带，后面的项最终都要落进去。',
      ),
      narrationStep(
        'lime',
        'N 的意思',
        'N 表示从哪一项以后开始稳定。n>N 后，所有项都要满足 |a_n-L|<ε。',
      ),
      narrationStep(
        'blue',
        '误差带图像',
        '在数轴上看，就是 L 左右各 ε 的小区间。收敛要求数列的尾巴全部进入这个小区间。',
      ),
      narrationStep(
        'blue',
        '不是最终等于',
        '数列项不需要最终等于 L。比如 1/n 永远不等于 0，但它可以无限靠近 0。',
      ),
      narrationStep(
        'cyan',
        '发散直觉',
        '如果数列一直在两个相距明显的值之间跳，或者越来越大，就不会靠近一个固定实数。',
      ),
      narrationStep(
        'cyan',
        '后面例题',
        '接下来的例题会反复用这个想法：有些项消失留下常数，有些增长到无穷，有些震荡但振幅变小。',
      ),
      narrationStep('yellow', '一句话', '把定义翻译成一句话：收敛就是数列尾巴稳定靠近同一个数。'),
    ],
  ],
  [
    5,
    [
      narrationStep('red', '几何型判断', '这里先看几何型数列 r^n。判断关键是公比 r 的绝对值。'),
      narrationStep(
        'red',
        '绝对值小于一',
        '如果 |r|<1，每乘一次都会把大小压小，所以 r^n 会趋近 0。',
      ),
      narrationStep('lime', '正数例子', '(0.2)^n 每一步都乘 0.2，数值很快变小，所以极限是 0。'),
      narrationStep('lime', '收敛原因', '这里不需要复杂证明，只要抓住 0<0.2<1，幂次会不断缩小。'),
      narrationStep('blue', '负数例子', '(-0.2)^n 的符号会正负交替，但绝对值仍然是 (0.2)^n。'),
      narrationStep('blue', '振幅消失', '因为振幅趋近 0，所以即使符号交错，整个数列仍然收敛到 0。'),
      narrationStep(
        'cyan',
        '边界情况',
        '如果 r=-1，就会在 1 和 -1 之间跳，不收敛；如果 |r|>1，大小会增长。',
      ),
      narrationStep(
        'cyan',
        '常见误区',
        '不要只看有没有负号。负号只制造交错，是否收敛还要看绝对值有没有趋近 0。',
      ),
      narrationStep(
        'yellow',
        '本题规则',
        '几何型数列先看 |r|：小于一趋零，大于一发散，等于一要单独判断。',
      ),
    ],
  ],
  [
    6,
    [
      narrationStep(
        'red',
        '指数衰减',
        '这一组例题比较 e^{-n} 和 e^n。e^{-n}=1/e^n，分母越来越大，所以它趋近 0。',
      ),
      narrationStep('red', '留下常数', '如果 a_n=3+e^{-n}，后面的指数尾巴消失，极限就只剩下 3。'),
      narrationStep('lime', '计算写法', '写极限时可以直接写 lim(3+e^{-n})=3+0=3。'),
      narrationStep(
        'lime',
        '尾巴语言',
        '这类题的直觉是：一个趋零的小尾巴加在常数后面，不会改变最后靠近的常数。',
      ),
      narrationStep(
        'blue',
        '指数增长',
        '如果是 3+e^n，情况完全相反。e^n 会越来越大，所以整个数列发散到无穷。',
      ),
      narrationStep('blue', '符号很关键', '指数里的正负号不能看错。-n 表示衰减，+n 表示增长。'),
      narrationStep(
        'cyan',
        '和几何型连接',
        'e^{-n} 其实也可以看成 (1/e)^n，因为 1/e 的绝对值小于一，所以趋近 0。',
      ),
      narrationStep('cyan', '判断顺序', '先判断指数项趋近 0 还是无穷，再把常数平移加回去。'),
      narrationStep(
        'yellow',
        '本页带走',
        '指数型题最先看指数符号：负指数通常衰减，正指数通常增长。',
      ),
    ],
  ],
  [
    7,
    [
      narrationStep(
        'red',
        '有理式例题',
        '这题是 a_n=(2n+1)/n。分子分母都是关于 n 的多项式，所以先看最高次项。',
      ),
      narrationStep(
        'red',
        '同次结构',
        '分子最高次是 2n，分母最高次是 n，同次时极限通常是最高次系数的比值。',
      ),
      narrationStep('lime', '除以 n', '把分子每一项除以 n，得到 (2n+1)/n=2+1/n。'),
      narrationStep('lime', '小项消失', '随着 n 越来越大，1/n 趋近 0，所以这个数列靠近 2。'),
      narrationStep(
        'blue',
        '极限结果',
        '因此 lim (2n+1)/n=2。这里不是代 n=∞，而是看 1/n 这个小项的极限。',
      ),
      narrationStep(
        'blue',
        '一般规则',
        '如果分子分母同次，看最高次系数比；如果分母次数更高，极限通常是 0。',
      ),
      narrationStep(
        'cyan',
        '分子次数更高',
        '如果分子次数更高，数列通常会发散到无穷或负无穷，要再看最高次符号。',
      ),
      narrationStep(
        'cyan',
        '做题稳定法',
        '最稳定的方法是除以最高次 n^k，把所有低次项都变成 1/n、1/n² 这类趋零项。',
      ),
      narrationStep(
        'yellow',
        '本页流程',
        '有理式数列的流程是：看最高次，除最高次，再让 1/n 的项趋近 0。',
      ),
    ],
  ],
  [
    8,
    [
      narrationStep('red', '交错除以 n', '现在看 a_n=(-1)^n/n。它有交错符号，但大小是 1/n。'),
      narrationStep(
        'red',
        '前几项观察',
        '前几项会在零的上下跳动：-1、1/2、-1/3、1/4。跳动越来越小。',
      ),
      narrationStep('lime', '看绝对值', '|a_n|=1/n，而 1/n 趋近 0，所以振幅正在消失。'),
      narrationStep('lime', '交错不妨碍', '只要振幅消失，正负交替不会阻止数列靠近 0。'),
      narrationStep('blue', '夹逼写法', '严格写法是 -1/n≤(-1)^n/n≤1/n。'),
      narrationStep('blue', '两边归零', '左右两边都趋近 0，所以中间的交错数列也趋近 0。'),
      narrationStep(
        'cyan',
        '图像直觉',
        '在数轴上，点一会儿在 0 左边，一会儿在 0 右边，但离 0 越来越近。',
      ),
      narrationStep('cyan', '对比 (-1)^n', '如果没有除以 n，(-1)^n 的振幅不会变小，所以它不收敛。'),
      narrationStep('yellow', '本页结论', '交错数列先看振幅：振幅趋零，才有可能收敛到 0。'),
    ],
  ],
  [
    9,
    [
      narrationStep(
        'red',
        'sin n 除以 n',
        '这一题是 a_n=sin n/n。sin n 自己没有极限，但它始终被限制在 -1 和 1 之间。',
      ),
      narrationStep(
        'red',
        '有界因子',
        '把 sin n 看成有界因子，把 1/n 看成趋零因子。两者相乘，常常可以用夹逼法。',
      ),
      narrationStep('lime', '基本不等式', '因为 -1≤sin n≤1，且 n 是正数，所以可以三边同时除以 n。'),
      narrationStep(
        'lime',
        '夹逼不等式',
        '得到 -1/n≤sin n/n≤1/n。这一步把一个震荡对象夹进两个简单对象之间。',
      ),
      narrationStep('blue', '两边极限', '-1/n 和 1/n 都趋近 0，所以中间的 sin n/n 也必须趋近 0。'),
      narrationStep(
        'blue',
        '为什么可用',
        '夹逼法的力量在于：我们不需要知道 sin n 是否收敛，只需要知道它被固定范围夹住。',
      ),
      narrationStep(
        'cyan',
        '常见形状',
        '以后看到“有界函数除以 n”或者“有界因子乘趋零因子”，都可以想到夹逼。',
      ),
      narrationStep('cyan', '和前题呼应', '(-1)^n/n 也是同一类题：有界的交错因子乘上趋零的 1/n。'),
      narrationStep(
        'yellow',
        '本页结论',
        '所以 lim sin n/n=0。关键不是 sin n 的极限，而是它的有界性。',
      ),
    ],
  ],
  [
    10,
    [
      narrationStep(
        'red',
        '有界定义',
        '有界数列的意思是：存在一个固定的 K≥0，使所有项都满足 |a_n|≤K。',
      ),
      narrationStep(
        'red',
        '不会跑太远',
        '换句话说，整个数列都被关在 -K 到 K 之间，不会跑到无穷远。',
      ),
      narrationStep('lime', '数轴图像', '在数轴上看，就是所有 a_n 的点都落在同一个有限区间里。'),
      narrationStep(
        'lime',
        'K 不必最小',
        'K 不需要找最小的那个，只要能找到一个固定上界把所有项夹住就够了。',
      ),
      narrationStep(
        'blue',
        '有界例子',
        '(-1)^n、sin n、1/n 都有界，因为它们的值始终留在有限范围内。',
      ),
      narrationStep(
        'blue',
        '有界不等于收敛',
        '但有界不代表收敛。(-1)^n 有界，却一直在 1 和 -1 之间跳。',
      ),
      narrationStep('cyan', '非有界例子', 'n、n²、e^n 都不有界，因为它们会越走越远。'),
      narrationStep('cyan', '逻辑方向', '重要逻辑是：收敛的数列一定有界；但有界的数列不一定收敛。'),
      narrationStep(
        'yellow',
        '本页带走',
        '有界是收敛的必要条件，不是充分条件。要推出收敛，还需要更多结构。',
      ),
    ],
  ],
  [
    11,
    [
      narrationStep(
        'red',
        '单调数列',
        '单调数列是一直往同一个方向走的数列：要么不下降，要么不上升。',
      ),
      narrationStep(
        'red',
        '递增定义',
        '如果对所有 n 都有 a_{n+1}≥a_n，就叫递增；如果严格大于，就叫严格递增。',
      ),
      narrationStep(
        'lime',
        '递减定义',
        '如果对所有 n 都有 a_{n+1}≤a_n，就叫递减；它可以一直往下走，也可以保持不变。',
      ),
      narrationStep(
        'lime',
        '不是看几项',
        '判断单调不能只看前几项，要证明每一个相邻项之间都满足同样方向。',
      ),
      narrationStep(
        'blue',
        '差分方法',
        '最常用方法是看 a_{n+1}-a_n 的符号。非负就是递增，非正就是递减。',
      ),
      narrationStep(
        'blue',
        '比值方法',
        '如果数列项都是正的，有时看 a_{n+1}/a_n 和 1 的大小更方便。',
      ),
      narrationStep(
        'cyan',
        '例子对比',
        '1/n 是递减的，n/(n+1) 是递增的，而 (-1)^n 来回跳，通常不单调。',
      ),
      narrationStep('cyan', '为什么重要', '单调性重要，是因为它配合有界性就能推出收敛。'),
      narrationStep(
        'yellow',
        '本页提示',
        '证明单调时写清楚“对所有 n”，不要只用前几项的观察代替证明。',
      ),
    ],
  ],
  [
    12,
    [
      narrationStep(
        'red',
        '单调有界定理',
        '现在把有界和单调放在一起：递增且有上界的数列一定收敛，递减且有下界的数列也一定收敛。',
      ),
      narrationStep(
        'red',
        '直观理解',
        '如果数列一直往上走，但上面有天花板，它最终只能逼近某个高度。',
      ),
      narrationStep(
        'lime',
        '证明套路',
        '所以递归数列证明收敛时，常见套路就是两步：先证明单调，再证明有界。',
      ),
      narrationStep(
        'lime',
        '方向要配对',
        '递增数列需要上界，递减数列需要下界。方向配错，定理就不能直接用。',
      ),
      narrationStep(
        'blue',
        '收敛推出有界',
        '另一个方向也要记住：如果一个数列已经收敛，那么它一定有界。',
      ),
      narrationStep(
        'blue',
        '不能反过来',
        '但只知道有界，不能推出收敛。缺少单调性时，数列可能一直震荡。',
      ),
      narrationStep(
        'cyan',
        '反例',
        '例如 cos(nπ)=(-1)^n，它被 -1 和 1 夹住，所以有界，但它不收敛。',
      ),
      narrationStep(
        'cyan',
        '考试用法',
        '看到递归题要求证明收敛，第一反应通常就是寻找“单调 + 有界”。',
      ),
      narrationStep(
        'yellow',
        '逻辑链',
        '这页的逻辑链是：收敛 ⇒ 有界；单调 + 有界 ⇒ 收敛；有界单独不够。',
      ),
    ],
  ],
  [
    13,
    [
      narrationStep(
        'red',
        '递归例题',
        '最后的核心例题是 a_1=1，a_{n+1}=√(2+a_n)。题目要求写前几项，证明收敛，并求极限。',
      ),
      narrationStep(
        'red',
        '先算前三项',
        '从 a_1=1 开始，a_2=√3，a_3=√(2+√3)。这些值看起来在增加，并且靠近 2。',
      ),
      narrationStep(
        'lime',
        '先观察趋势',
        '算前几项的作用是帮助猜测：这个数列可能递增，而且有上界 2。',
      ),
      narrationStep(
        'lime',
        '不能直接代极限',
        '还没证明收敛时，不能一上来就设极限等于 L。必须先证明极限存在。',
      ),
      narrationStep(
        'blue',
        '证明路线',
        '这题的路线就是单调有界定理：证明 0≤a_n≤2，再证明 a_{n+1}≥a_n。',
      ),
      narrationStep(
        'blue',
        '不变量区间',
        '0 到 2 是一个不变量区间：如果 a_n 留在里面，那么 a_{n+1}=√(2+a_n) 也会留在里面。',
      ),
      narrationStep('cyan', '极限候选', '一旦证明收敛，就可以把递推式两边取极限，得到 L=√(2+L)。'),
      narrationStep(
        'cyan',
        '先证后算',
        '所以递归题的顺序是先证存在，再算候选值，最后排除不合适的根。',
      ),
      narrationStep(
        'yellow',
        '本页路线',
        '记住这题的主线：前三项观察，单调有界证明收敛，再用递推式求极限。',
      ),
    ],
  ],
  [
    14,
    [
      narrationStep(
        'red',
        '证明有界',
        '先证明 0≤a_n≤2。这个结论会给后面单调性和排除负根都提供依据。',
      ),
      narrationStep(
        'red',
        '归纳结构',
        '有界性用数学归纳法证明：先检查第一项，再证明如果第 n 项在区间里，下一项也在区间里。',
      ),
      narrationStep('lime', '基础步', 'a_1=1，显然满足 0≤1≤2。'),
      narrationStep('lime', '上界递推', '假设 a_n≤2，那么 a_{n+1}=√(2+a_n)≤√(2+2)=2。'),
      narrationStep('blue', '下界递推', '因为平方根的输出非负，所以 a_{n+1}≥0。下界也会一直保持。'),
      narrationStep('blue', '归纳结论', '因此所有项都在 0 到 2 之间，数列有上界 2，也有下界 0。'),
      narrationStep(
        'cyan',
        '为什么先证它',
        '这个范围不只是为了有界，它还会帮助我们证明下一项不小于上一项。',
      ),
      narrationStep(
        'cyan',
        '常见错误',
        '注意 √(2+a_n)≤2 来自 a_n≤2，而不是凭图像猜测；这一步要写清楚。',
      ),
      narrationStep('yellow', '本页结论', '到这里已经完成收敛证明的一半：数列被关在 0 和 2 之间。'),
    ],
  ],
  [
    15,
    [
      narrationStep(
        'red',
        '证明递增',
        '接下来证明 a_{n+1}≥a_n。因为所有项非负，可以用平方比较来处理根号。',
      ),
      narrationStep('red', '目标不等式', '目标是 √(2+a_n)≥a_n。'),
      narrationStep('lime', '平方比较', '两边非负，所以等价于 2+a_n≥a_n²。'),
      narrationStep('lime', '因式分解', '整理得到 2+a_n-a_n²≥0，也就是 (2-a_n)(a_n+1)≥0。'),
      narrationStep('blue', '使用范围', '上一页已经证明 0≤a_n≤2，所以 2-a_n≥0，同时 a_n+1>0。'),
      narrationStep('blue', '单调成立', '两个因子都非负，因此 a_{n+1}≥a_n，数列递增。'),
      narrationStep(
        'cyan',
        '套定理',
        '现在我们有递增，也有上界 2，所以根据单调有界定理，数列收敛。',
      ),
      narrationStep(
        'cyan',
        '证明顺序',
        '注意顺序很重要：先有范围，才能顺利证明单调；先有单调有界，才能设极限。',
      ),
      narrationStep(
        'yellow',
        '本页结论',
        '到这里，收敛性已经证明完了。下一步才是求它收敛到哪个数。',
      ),
    ],
  ],
  [
    16,
    [
      narrationStep('red', '设极限', '既然已经证明数列收敛，现在可以设 lim a_n=L。'),
      narrationStep('red', '递归两边取极限', '当 n 趋近无穷时，a_{n+1} 和 a_n 都趋近同一个 L。'),
      narrationStep('lime', '代入递推', '把递推式 a_{n+1}=√(2+a_n) 取极限，得到 L=√(2+L)。'),
      narrationStep('lime', '解方程', '两边平方得到 L²=2+L，也就是 L²-L-2=0。'),
      narrationStep('blue', '候选值', '这个二次方程给出两个候选极限：L=2 或 L=-1。'),
      narrationStep(
        'blue',
        '排除负根',
        '但所有 a_n 都非负，而且还在 0 到 2 之间，所以极限不可能是 -1。',
      ),
      narrationStep('cyan', '最终极限', '因此唯一合理的极限是 L=2。'),
      narrationStep(
        'cyan',
        '为什么不能早做',
        '如果没有前面收敛性证明，这个方程只能给候选值，不能保证数列真的会趋近其中一个。',
      ),
      narrationStep('yellow', '完整答案', '完整结论是：数列递增、有界，所以收敛；并且 lim a_n=2。'),
    ],
  ],
  [
    17,
    [
      narrationStep(
        'red',
        '下标错误',
        '第一类常见错误是下标错位。先确认题目从 n=1 还是 n=0 开始，再写前几项。',
      ),
      narrationStep(
        'red',
        '递归启动',
        '递归题尤其要看初始项。如果起点看错，后面每一项都会跟着错。',
      ),
      narrationStep('lime', '交错误判', '第二类错误是看到交错就说发散。真正要看振幅有没有趋近 0。'),
      narrationStep(
        'lime',
        '两个对比',
        '(-1)^n 不收敛，但 (-1)^n/n 收敛到 0；差别就在振幅是否消失。',
      ),
      narrationStep(
        'blue',
        '有界误用',
        '第三类错误是把有界当成收敛。有界只是必要条件，不是充分条件。',
      ),
      narrationStep(
        'blue',
        '反例提醒',
        'cos(nπ)=(-1)^n 有界，但它不收敛，所以有界后还要看单调或别的工具。',
      ),
      narrationStep(
        'cyan',
        '递归跳步',
        '第四类错误是递归题直接设极限 L。正确顺序是先证明收敛，再代入递推式求 L。',
      ),
      narrationStep(
        'cyan',
        '证明清单',
        '递归题通常按清单走：算前几项，猜范围，证有界，证单调，最后求极限。',
      ),
      narrationStep(
        'yellow',
        '检查习惯',
        '每次写完数列题，都回头检查逻辑方向：收敛、有界、单调之间不能随便反推。',
      ),
    ],
  ],
  [
    18,
    [
      narrationStep(
        'red',
        '整讲核心',
        '这一讲的核心是数列的尾巴行为。前几项只是线索，真正决定极限的是 n 越来越大之后发生什么。',
      ),
      narrationStep(
        'red',
        '先识别类型',
        '第一步先识别类型：几何型、指数型、有理式、交错型、夹逼型，还是递归型。',
      ),
      narrationStep(
        'lime',
        '直接计算',
        '能直接化简的题就直接算：几何型看 |r|，指数型看正负，有理式看最高次。',
      ),
      narrationStep(
        'lime',
        '趋零尾巴',
        '很多极限都来自同一个想法：小尾巴趋近 0，最后只留下主项或常数。',
      ),
      narrationStep(
        'blue',
        '夹逼工具',
        '遇到有界因子乘上趋零因子，就想到夹逼，比如 (-1)^n/n 和 sin n/n。',
      ),
      narrationStep(
        'blue',
        '震荡处理',
        '震荡题不要凭感觉。看振幅是否消失，或者把它夹在两个趋同的数列之间。',
      ),
      narrationStep(
        'cyan',
        '证明工具',
        '递归题和证明题常用单调有界定理：先证方向固定，再证被界限挡住。',
      ),
      narrationStep(
        'cyan',
        '逻辑方向',
        '收敛一定有界；有界不一定收敛；单调加有界才是常用的收敛入口。',
      ),
      narrationStep(
        'yellow',
        '最后一句',
        '数列极限的做题顺序是：先看模式，再选工具，最后把每一步的逻辑方向写清楚。',
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

Generate page ${pageNumber} of a Chinese calculus sequences notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: n, k, a_n, a_{n+1}, a_1, S:N→R, L, ε, N, K, r^n, e^n, sin n, cos(nπ), |a_n|, lim, ∞, ∫ only if needed.

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
    title: '数列：从通项到极限',
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
          name: '数列：从通项到极限',
          description:
            '第七本中文手绘图片笔记本：数列定义、递归数列、收敛、夹逼、有界单调与递归极限。',
          tags: ['MAT136', '数列', '极限', '递归数列', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '数列：从通项到极限',
          description:
            '第七本中文手绘图片笔记本：数列定义、递归数列、收敛、夹逼、有界单调与递归极限。',
          tags: ['MAT136', '数列', '极限', '递归数列', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
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
