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
  process.env.GENERATED_IMAGE_ROOT || path.join(process.env.HOME || '/Users/dongpochen', '.codex', 'generated_images');

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
    "title": "数列：把函数放在自然数上",
    "sceneTitle": "数列入口",
    "layout": "上方标题；左侧定义数列；中间画自然数到数轴的箭头；右侧比较通项与递归；底部提出收敛问题。",
    "components": [
      {
        "label": "本册问题",
        "role": "opening",
        "marker": "red",
        "content": "标题“数列：把函数放在自然数上”；写“a_n 是第 n 个数，n 只取自然数”。",
        "speech": "这一页进入数列。数列可以看成定义在自然数上的函数：输入 n，输出第 n 项 a_n。"
      },
      {
        "label": "函数观点",
        "role": "concept",
        "marker": "lime",
        "content": "写“S:N→R，n↦a_n”；画 n=1,2,3,… 指向数轴上的点。",
        "speech": "左侧用函数观点来读数列。自然数 n 是输入，实数 a_n 是输出，所以数列不是一堆散乱数字，而是一条规则。"
      },
      {
        "label": "两种给法",
        "role": "strategy",
        "marker": "blue",
        "content": "写“通项公式：直接给 a_n；递归公式：用前项推后项”。",
        "speech": "数列通常有两种给法。通项公式能直接算第 n 项；递归公式要从初始项开始一步步推出。"
      },
      {
        "label": "例子速览",
        "role": "examples",
        "marker": "cyan",
        "content": "列“1/n、(-1)^n、n(n+1)/2、a_{n+1}=√(2+a_n)”并标不同类型。",
        "speech": "右侧先放几个本册会反复出现的形状：有理式、交错项、多项式型和递归型。后面会分别判断它们是否收敛。"
      },
      {
        "label": "引导问题",
        "role": "hook",
        "marker": "yellow",
        "content": "底部问题：“当 n 越来越大，a_n 会靠近某个固定数吗？”",
        "speech": "底部问题就是数列极限的核心：当 n 越来越大，数列项是否会靠近某个固定数。"
      }
    ]
  },
  {
    "title": "数列符号：项、下标和前几项",
    "sceneTitle": "符号与前几项",
    "layout": "左侧解释 a_n 和下标；中间展开前几项；右侧交错例子；底部提醒从 n=1 或 n=0 开始。",
    "components": [
      {
        "label": "符号拆开",
        "role": "concept",
        "marker": "red",
        "content": "写“a_n：第 n 项；n 是位置，不是变量范围里的任意实数”。",
        "speech": "先把符号拆开。a_n 里的 n 表示位置，它通常取一、二、三这些自然数。"
      },
      {
        "label": "前几项",
        "role": "examples",
        "marker": "lime",
        "content": "写“若 a_n=1/n，则 a_1=1，a_2=1/2，a_3=1/3”。",
        "speech": "通项公式给出以后，算前几项就是把 n 依次代入一、二、三。这样可以快速看出数列趋势。"
      },
      {
        "label": "交错例子",
        "role": "examples",
        "marker": "blue",
        "content": "写“(-1)^{n+1}: 1,-1,1,-1,…；符号震荡”。",
        "speech": "这个交错例子提醒我们：数列可以来回跳动，不一定单调。符号震荡本身不等于发散，要看大小是否趋近某个数。"
      },
      {
        "label": "三角数例子",
        "role": "formula",
        "marker": "cyan",
        "content": "写“a_n=n(n+1)/2 ⇒ 1,3,6,10,15,…”并画小点阵。",
        "speech": "三角数 a_n 等于 n 乘 n 加一除以二，前几项是一、三、六、十、十五。它的增长很快，不会靠近固定值。"
      },
      {
        "label": "下标提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“先确认从 n=1 还是 n=0 开始，再算前几项”。",
        "speech": "底部提醒很实用：先看题目从 n 等于一还是零开始，否则前几项会整体错位。"
      }
    ]
  },
  {
    "title": "递归数列：从初始项一步步推",
    "sceneTitle": "递归数列概念",
    "layout": "左侧定义递归；中间放递推机器；右侧三个例子；底部强调初始项不可少。",
    "components": [
      {
        "label": "递归定义",
        "role": "definition",
        "marker": "red",
        "content": "写“递归：a_{n+1} 由前面某些项决定”。",
        "speech": "递归数列不是直接告诉第 n 项，而是告诉你如何从前面已知项推到后面一项。"
      },
      {
        "label": "初始项",
        "role": "concept",
        "marker": "lime",
        "content": "写“必须给 a_1 或 a_0；否则机器无法启动”。",
        "speech": "递归公式必须配初始项。没有起点，即使递推规则写得很清楚，也算不出具体数列。"
      },
      {
        "label": "等差递归",
        "role": "examples",
        "marker": "blue",
        "content": "写“a_{n+1}=a_n+2，a_1=1 ⇒ 1,3,5,7,…”。",
        "speech": "等差数列可以递归地写成后一项等于前一项加二。初始项是一，所以得到一、三、五、七。"
      },
      {
        "label": "等比递归",
        "role": "examples",
        "marker": "cyan",
        "content": "写“a_{n+1}=2a_n，a_1=1 ⇒ 1,2,4,8,…；a_{n+1}=a_n/2 ⇒ 1,1/2,1/4,…”。",
        "speech": "等比数列也可以递归表示。乘二会增长，乘二分之一会靠近零。"
      },
      {
        "label": "递归检查",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“算递归：先写初始项，再一行一行代入”。",
        "speech": "底部给做题流程：先写初始项，再把上一项代进公式，一行一行往后推。"
      }
    ]
  },
  {
    "title": "收敛的意思：最后靠近 L",
    "sceneTitle": "收敛定义",
    "layout": "左侧直观图；中间 epsilon 定义；右侧 N 后所有项；底部把定义翻译成一句话。",
    "components": [
      {
        "label": "直观图像",
        "role": "visual",
        "marker": "red",
        "content": "画数轴上 a_n 的点逐渐靠近 L；写“靠近，不一定等于”。",
        "speech": "收敛的直观意思是：后面的项越来越靠近某个数 L。它不要求每一项等于 L，只要求最终任意接近。"
      },
      {
        "label": "正式定义",
        "role": "formula",
        "marker": "lime",
        "content": "写“∀ε>0，∃N，使 n>N 时 |a_n-L|<ε”。",
        "speech": "正式定义中的 ε 是允许误差，N 是从哪一项以后开始稳定进入误差范围。"
      },
      {
        "label": "误差带",
        "role": "visual",
        "marker": "blue",
        "content": "画 L-ε 到 L+ε 的区间，后面所有点落进去。",
        "speech": "图上这条误差带表示离 L 的距离小于 ε。收敛要求足够靠后的所有项都落在这条带里。"
      },
      {
        "label": "反例直觉",
        "role": "concept",
        "marker": "cyan",
        "content": "写“若一直在两个远点之间跳，通常没有极限”。",
        "speech": "如果数列一直在两个相隔很远的值之间跳，就无法最终靠近同一个 L，这通常意味着发散。"
      },
      {
        "label": "一句话",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“收敛=尾巴稳定靠近一个固定数”。",
        "speech": "底部一句话总结：收敛看的是数列的尾巴，尾巴要稳定地靠近一个固定数。"
      }
    ]
  },
  {
    "title": "几何型数列：|r|<1 时趋近 0",
    "sceneTitle": "几何型收敛",
    "layout": "左侧 r^n 图像；中间正数例子；右侧负数交错例子；下方分类表；底部规则。",
    "components": [
      {
        "label": "核心规则",
        "role": "formula",
        "marker": "red",
        "content": "写“若 |r|<1，则 r^n→0；若 |r|>1，则通常发散”。",
        "speech": "几何型数列最先看公比 r 的绝对值。绝对值小于一时，幂次会压到零。"
      },
      {
        "label": "正数例子",
        "role": "examples",
        "marker": "lime",
        "content": "写“a_n=(0.2)^n：0.2,0.04,0.008,… →0”。",
        "speech": "零点二的 n 次方每次都乘零点二，所以项越来越小，极限为零。"
      },
      {
        "label": "交错例子",
        "role": "examples",
        "marker": "blue",
        "content": "写“a_n=(-0.2)^n：符号交错，但 |a_n|=(0.2)^n→0”。",
        "speech": "负零点二的 n 次方会正负交替，但大小仍然趋近零，所以它也收敛到零。"
      },
      {
        "label": "分类表",
        "role": "strategy",
        "marker": "cyan",
        "content": "列“r=1：极限1；r=-1：震荡；|r|>1：发散；r=0：从第二项起0”。",
        "speech": "这张小表帮你处理边界情况。尤其 r 等于负一会在一和负一之间震荡，不收敛。"
      },
      {
        "label": "判断句",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“先看 |r|，再看符号是否只影响震荡”。",
        "speech": "底部判断句：几何型先看绝对值，符号只决定是否交错，不一定改变极限。"
      }
    ]
  },
  {
    "title": "指数型：e^{-n} 消失，e^n 爆开",
    "sceneTitle": "指数型收敛",
    "layout": "左侧 e^{-n}；中间 3+e^{-n}；右侧 e^n；底部比较表和结论。",
    "components": [
      {
        "label": "衰减项",
        "role": "formula",
        "marker": "red",
        "content": "写“e^{-n}=1/e^n →0”。",
        "speech": "e 的负 n 次方等于一除以 e 的 n 次方。分母越来越大，所以这一项趋近零。"
      },
      {
        "label": "平移例子",
        "role": "examples",
        "marker": "lime",
        "content": "写“a_n=3+e^{-n} ⇒ lim a_n=3+0=3”。",
        "speech": "常数三不会动，e 的负 n 次方消失，所以整个数列靠近三。"
      },
      {
        "label": "增长项",
        "role": "formula",
        "marker": "blue",
        "content": "写“e^n→∞，所以 3+e^n 发散到 ∞”。",
        "speech": "如果指数是正 n，e 的 n 次方会无限增长，因此三加 e 的 n 次方不会收敛。"
      },
      {
        "label": "符号检查",
        "role": "strategy",
        "marker": "cyan",
        "content": "写“看指数里是 -n 还是 +n；看是否还有常数平移”。",
        "speech": "指数题最容易看错符号。先判断是衰减还是增长，再把常数平移加回去。"
      },
      {
        "label": "结论",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“趋近 0 的小尾巴，只留下常数”。",
        "speech": "底部结论：如果后面的尾巴趋近零，极限就只剩下前面的常数部分。"
      }
    ]
  },
  {
    "title": "有理式数列：看最高次项",
    "sceneTitle": "有理式极限",
    "layout": "左侧例题；中间除以 n；右侧最高次规则；下方三种次数比较；底部检查。",
    "components": [
      {
        "label": "例题入口",
        "role": "opening",
        "marker": "red",
        "content": "写“a_n=(2n+1)/n”。",
        "speech": "有理式数列通常先看分子分母的最高次项。这题分子和分母都是一次。"
      },
      {
        "label": "代数化简",
        "role": "formula",
        "marker": "lime",
        "content": "写“(2n+1)/n=2+1/n”。",
        "speech": "把每一项都除以 n，就得到二加一除以 n。后面的 1/n 会趋近零。"
      },
      {
        "label": "极限结果",
        "role": "formula",
        "marker": "blue",
        "content": "写“lim (2+1/n)=2”。",
        "speech": "因为一除以 n 趋近零，所以整个数列的极限是二。"
      },
      {
        "label": "次数规则",
        "role": "strategy",
        "marker": "cyan",
        "content": "列“同次：首项系数比；分母高：0；分子高：发散或无穷”。",
        "speech": "右侧给一般规则：同次看最高次系数比，分母次数更高趋零，分子次数更高通常发散。"
      },
      {
        "label": "检查句",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“先除以最高次 n^k，再让 1/n→0”。",
        "speech": "底部流程：先除以最高次的 n 的幂，再把一除以 n 的项送到零。"
      }
    ]
  },
  {
    "title": "交错但变小：(-1)^n/n 收敛",
    "sceneTitle": "交错除以n",
    "layout": "左侧前几项；中间夹逼不等式；右侧图上震荡缩小；底部结论。",
    "components": [
      {
        "label": "前几项",
        "role": "examples",
        "marker": "red",
        "content": "写“a_n=(-1)^n/n：-1,1/2,-1/3,1/4,…”。",
        "speech": "这个数列的符号一直交错，但每一项的大小是 1/n，越来越小。"
      },
      {
        "label": "大小控制",
        "role": "formula",
        "marker": "lime",
        "content": "写“|a_n|=1/n→0”。",
        "speech": "判断交错数列时，先看绝对值。这里绝对值是一除以 n，所以大小趋近零。"
      },
      {
        "label": "夹逼写法",
        "role": "formula",
        "marker": "blue",
        "content": "写“-1/n ≤ (-1)^n/n ≤ 1/n”。",
        "speech": "严格一点可以用夹逼：数列夹在负一除以 n 和正一除以 n 之间，两边都趋近零。"
      },
      {
        "label": "图像直觉",
        "role": "visual",
        "marker": "cyan",
        "content": "画点在 0 上下交替，但振幅逐渐缩小。",
        "speech": "图上可以看到点在零的上下跳动，但振幅越来越小，因此尾巴最终贴近零。"
      },
      {
        "label": "结论",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“交错不怕；怕的是振幅不消失”。",
        "speech": "底部一句话：交错本身不可怕，关键是振幅是否消失。"
      }
    ]
  },
  {
    "title": "夹逼定理：sin n / n 的极限",
    "sceneTitle": "夹逼法",
    "layout": "左侧目标；中间三段不等式；右侧两边极限；下方图像振幅；底部流程。",
    "components": [
      {
        "label": "目标数列",
        "role": "opening",
        "marker": "red",
        "content": "写“a_n=sin n / n”。",
        "speech": "这题不能说 sin n 自己有极限，因为 sin n 会一直震荡。但除以 n 后，振幅变小。"
      },
      {
        "label": "有界核心",
        "role": "formula",
        "marker": "lime",
        "content": "写“-1≤sin n≤1”。",
        "speech": "夹逼的核心是 sin n 永远在负一和一之间，这给了我们上下界。"
      },
      {
        "label": "除以 n",
        "role": "formula",
        "marker": "blue",
        "content": "写“-1/n ≤ sin n/n ≤ 1/n”。",
        "speech": "当 n 为正时，不等式三边同时除以 n，方向不变。"
      },
      {
        "label": "两边极限",
        "role": "formula",
        "marker": "cyan",
        "content": "写“lim(-1/n)=0，lim(1/n)=0，所以 lim sin n/n=0”。",
        "speech": "左右两边都趋近零，被夹在中间的数列也必须趋近零。"
      },
      {
        "label": "流程总结",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“找有界因子 × 趋零因子，是夹逼常见形状”。",
        "speech": "底部总结：有界因子乘上趋零因子，是夹逼法里非常常见的形状。"
      }
    ]
  },
  {
    "title": "有界数列：不会跑太远",
    "sceneTitle": "有界数列",
    "layout": "左侧定义；中间数轴夹住；右侧例子/非例子；底部连接收敛。",
    "components": [
      {
        "label": "定义",
        "role": "definition",
        "marker": "red",
        "content": "写“存在 K≥0，使所有 n 都满足 |a_n|≤K”。",
        "speech": "有界的意思是所有项都被某个固定的 K 控制住，不会跑到无穷远。"
      },
      {
        "label": "数轴图",
        "role": "visual",
        "marker": "lime",
        "content": "画区间 [-K,K]，所有 a_n 点都落在里面。",
        "speech": "图像上，有界数列的所有点都落在负 K 到 K 的区间内。"
      },
      {
        "label": "有界例子",
        "role": "examples",
        "marker": "blue",
        "content": "写“(-1)^n 有界；sin n 有界；1/n 有界”。",
        "speech": "这些例子都不会跑远。注意有界不代表一定收敛，比如负一的 n 次方在两个值之间跳。"
      },
      {
        "label": "非有界例子",
        "role": "examples",
        "marker": "cyan",
        "content": "写“n、n²、e^n 都不有界”。",
        "speech": "n、n 平方和 e 的 n 次方都会越来越大，所以它们不是有界数列。"
      },
      {
        "label": "连接定理",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“收敛 ⇒ 有界；有界 ⇏ 收敛”。",
        "speech": "底部是关键逻辑：收敛一定有界，但有界不一定收敛。这个方向不能反过来乱用。"
      }
    ]
  },
  {
    "title": "单调数列：一直往一个方向走",
    "sceneTitle": "单调数列",
    "layout": "左侧递增定义；中间递减定义；右侧差分判断；底部例子表。",
    "components": [
      {
        "label": "递增定义",
        "role": "definition",
        "marker": "red",
        "content": "写“若 a_{n+1}≥a_n，则数列递增”。",
        "speech": "递增数列的意思是后一项不小于前一项。严格递增则要大于。"
      },
      {
        "label": "递减定义",
        "role": "definition",
        "marker": "lime",
        "content": "写“若 a_{n+1}≤a_n，则数列递减”。",
        "speech": "递减数列的意思是后一项不大于前一项。它一直往下走或者保持不变。"
      },
      {
        "label": "差分判断",
        "role": "strategy",
        "marker": "blue",
        "content": "写“看 a_{n+1}-a_n 的符号”。",
        "speech": "判断单调性最常用的方法是看差分。如果差分非负，就递增；如果非正，就递减。"
      },
      {
        "label": "比值判断",
        "role": "strategy",
        "marker": "cyan",
        "content": "写“正项也可看 a_{n+1}/a_n 与 1 比较”。",
        "speech": "对于正项数列，有时看比值更方便。比值大于一往往表示递增，小于一表示递减。"
      },
      {
        "label": "例子表",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部列“1/n 递减；n/(n+1) 递增；(-1)^n 不单调”。",
        "speech": "底部例子帮助区分：一除以 n 递减，n 除以 n 加一递增，交错数列通常不单调。"
      }
    ]
  },
  {
    "title": "单调有界定理：收敛的常用入口",
    "sceneTitle": "单调有界定理",
    "layout": "左侧定理；中间上界/下界图；右侧证明套路；底部逻辑箭头。",
    "components": [
      {
        "label": "定理",
        "role": "theorem",
        "marker": "red",
        "content": "写“递增且有上界 ⇒ 收敛；递减且有下界 ⇒ 收敛”。",
        "speech": "单调有界定理是证明数列收敛的常用工具。只要方向固定，而且被挡住，就一定会靠近某个极限。"
      },
      {
        "label": "图像直觉",
        "role": "visual",
        "marker": "lime",
        "content": "画递增点列逐渐靠近一条上界线。",
        "speech": "图像直觉是：数列一直往上走，但上面有天花板，所以最终会逼近某个高度。"
      },
      {
        "label": "证明套路",
        "role": "strategy",
        "marker": "blue",
        "content": "写“两步：先证单调，再证有界”。",
        "speech": "做题时通常分两步：先证明单调，再证明有界。两步都完成后，就能说它收敛。"
      },
      {
        "label": "不能反用",
        "role": "mistake",
        "marker": "cyan",
        "content": "写“有界但不单调，不一定收敛；例 (-1)^n”。",
        "speech": "只知道有界还不够。负一的 n 次方有界，但来回震荡，所以不收敛。"
      },
      {
        "label": "逻辑链",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“单调 + 有界 ⇒ 收敛；收敛 ⇒ 有界”。",
        "speech": "底部逻辑链要记清楚：单调加有界能推出收敛；收敛本身也能推出有界。"
      }
    ]
  },
  {
    "title": "递归例题：a_{n+1}=√(2+a_n)",
    "sceneTitle": "递归例题设定",
    "layout": "左侧题目；中间算前三项；右侧猜测极限；底部证明路线。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“a_1=1，a_{n+1}=√(2+a_n)”；求是否收敛和极限。",
        "speech": "这道递归题来自资料最后一页。目标是先证明它收敛，再求极限。"
      },
      {
        "label": "前三项",
        "role": "formula",
        "marker": "lime",
        "content": "写“a_1=1，a_2=√3，a_3=√(2+√3)”。",
        "speech": "先算前三项，能看出它在上升，并且看起来靠近二。"
      },
      {
        "label": "路线选择",
        "role": "strategy",
        "marker": "blue",
        "content": "写“证明收敛：单调 + 有界”。",
        "speech": "递归极限题不能直接令极限存在，通常先用单调有界定理证明它真的收敛。"
      },
      {
        "label": "先猜范围",
        "role": "concept",
        "marker": "cyan",
        "content": "写“1≤a_n≤2；若成立，则根号内在 3 到 4 之间”。",
        "speech": "证明前先猜范围。这里所有项应该在一和二之间，这也会帮助我们证明单调。"
      },
      {
        "label": "提示",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“递归题：先算几项，再找不变量区间”。",
        "speech": "底部提示：递归题先算几项，猜出不变量区间，再用归纳证明它一直留在区间内。"
      }
    ]
  },
  {
    "title": "证明有界：把项关在 2 以下",
    "sceneTitle": "递归有界证明",
    "layout": "左侧归纳目标；中间基础步；右侧递推步；底部结论。",
    "components": [
      {
        "label": "归纳目标",
        "role": "proof",
        "marker": "red",
        "content": "写“证明：0≤a_n≤2 对所有 n 成立”。",
        "speech": "先证明有界。目标是把所有项关在零到二之间，尤其要证明上界二。"
      },
      {
        "label": "基础步",
        "role": "proof",
        "marker": "lime",
        "content": "写“a_1=1，满足 0≤1≤2”。",
        "speech": "归纳基础步很直接：第一项等于一，确实在零和二之间。"
      },
      {
        "label": "递推步",
        "role": "proof",
        "marker": "blue",
        "content": "写“若 a_n≤2，则 a_{n+1}=√(2+a_n)≤√4=2”。",
        "speech": "如果第 n 项不超过二，那么下一项是根号二加 a_n，也不超过根号四，就是二。"
      },
      {
        "label": "非负性",
        "role": "proof",
        "marker": "cyan",
        "content": "写“根号输出非负，所以 a_{n+1}≥0”。",
        "speech": "因为递推公式是平方根，下一项天然非负，所以下界也成立。"
      },
      {
        "label": "结论",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“归纳得到：数列有上界 2，且所有项非负”。",
        "speech": "这样就用归纳法证明了有界：所有项都非负，并且不超过二。"
      }
    ]
  },
  {
    "title": "证明单调：下一项不小于上一项",
    "sceneTitle": "递归单调证明",
    "layout": "左侧目标；中间等价变形；右侧利用上界；底部得到递增。",
    "components": [
      {
        "label": "单调目标",
        "role": "proof",
        "marker": "red",
        "content": "写“要证 a_{n+1}≥a_n”。",
        "speech": "接下来证明单调。因为前几项看起来在上升，我们目标是证明下一项总不小于上一项。"
      },
      {
        "label": "平方比较",
        "role": "formula",
        "marker": "lime",
        "content": "写“a_{n+1}≥a_n ⇔ √(2+a_n)≥a_n”。",
        "speech": "由于两边都是非负数，可以通过平方来比较。"
      },
      {
        "label": "等价不等式",
        "role": "formula",
        "marker": "blue",
        "content": "写“2+a_n≥a_n² ⇔ (2-a_n)(a_n+1)≥0”。",
        "speech": "平方后整理，得到二加 a_n 大于等于 a_n 平方，也就是二减 a_n 乘 a_n 加一非负。"
      },
      {
        "label": "利用范围",
        "role": "proof",
        "marker": "cyan",
        "content": "写“0≤a_n≤2 ⇒ 2-a_n≥0，a_n+1>0”。",
        "speech": "上一页已经证明零到二的范围，所以两个因子都非负，单调性成立。"
      },
      {
        "label": "结论",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“有界 + 递增 ⇒ 数列收敛”。",
        "speech": "现在我们有了有界和递增，根据单调有界定理，这个递归数列一定收敛。"
      }
    ]
  },
  {
    "title": "求递归极限：先证明存在，再代入",
    "sceneTitle": "递归极限求值",
    "layout": "左侧设极限；中间两边取极限；右侧解方程；底部排除不合适根。",
    "components": [
      {
        "label": "设极限",
        "role": "formula",
        "marker": "red",
        "content": "写“已知收敛，设 lim a_n=L”。",
        "speech": "这一步必须在证明收敛之后做。既然已经知道极限存在，就可以设它等于 L。"
      },
      {
        "label": "代入递推",
        "role": "formula",
        "marker": "lime",
        "content": "写“L=√(2+L)”。",
        "speech": "当 n 趋近无穷时，a_{n+1} 和 a_n 都趋近同一个 L，所以递推式变成 L 等于根号二加 L。"
      },
      {
        "label": "解方程",
        "role": "formula",
        "marker": "blue",
        "content": "写“L²=2+L ⇒ L²-L-2=0 ⇒ L=2 或 -1”。",
        "speech": "两边平方得到二次方程，解出两个候选值：二和负一。"
      },
      {
        "label": "排除负根",
        "role": "proof",
        "marker": "cyan",
        "content": "写“因为 a_n≥0，极限不能是 -1”。",
        "speech": "所有项都非负，所以极限不可能是负一。只能选择二。"
      },
      {
        "label": "最终答案",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“因此 lim a_n=2”。",
        "speech": "最终结论：这个递归数列收敛，并且极限等于二。"
      }
    ]
  },
  {
    "title": "常见错误：数列极限别跳步",
    "sceneTitle": "常见错误检查",
    "layout": "四块错误分散排列：变量、震荡、有界、递归；底部最终检查清单。",
    "components": [
      {
        "label": "下标错误",
        "role": "mistake",
        "marker": "red",
        "content": "写“n 是整数下标；先确认从 n=0 还是 n=1 开始”。",
        "speech": "第一类错误是下标错位。数列的 n 是整数下标，起点不同会影响前几项和递归启动。"
      },
      {
        "label": "震荡错误",
        "role": "mistake",
        "marker": "lime",
        "content": "写“交错不一定发散；看振幅是否趋零”。",
        "speech": "第二类错误是见到交错就说发散。真正要看的是振幅是否消失。"
      },
      {
        "label": "有界误用",
        "role": "mistake",
        "marker": "blue",
        "content": "写“有界不推出收敛；还需要单调或其它论证”。",
        "speech": "第三类错误是把有界当成收敛。只有有界还不够，还要配合单调或其它收敛理由。"
      },
      {
        "label": "递归跳步",
        "role": "mistake",
        "marker": "cyan",
        "content": "写“递归求极限前，先证明极限存在”。",
        "speech": "第四类错误是直接把递归式里的 a_n 换成 L。这样做之前，必须先证明数列收敛。"
      },
      {
        "label": "最终清单",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“算前几项；猜极限；证有界；证单调；再求 L”。",
        "speech": "最终清单特别适合递归题：先算前几项，猜极限，再证有界和单调，最后才求 L。"
      }
    ]
  },
  {
    "title": "总结：数列极限怎么判断",
    "sceneTitle": "总结",
    "layout": "中心写“尾巴行为”；四周连接常见工具；底部收束。",
    "components": [
      {
        "label": "核心思想",
        "role": "summary",
        "marker": "red",
        "content": "中心写“数列极限看尾巴行为”。",
        "speech": "最后一页总结本册。数列极限看的不是前几项热闹不热闹，而是尾巴最终靠近哪里。"
      },
      {
        "label": "直接极限",
        "role": "formula",
        "marker": "lime",
        "content": "写“几何型、指数型、有理式：先化简再取极限”。",
        "speech": "能直接算的题，先化简结构：几何型看公比，指数型看正负， 有理式看最高次项。"
      },
      {
        "label": "夹逼工具",
        "role": "strategy",
        "marker": "blue",
        "content": "写“有界因子 × 趋零因子 ⇒ 常用夹逼”。",
        "speech": "遇到 sin n 除以 n 或交错除以 n，可以用有界因子乘趋零因子的夹逼思想。"
      },
      {
        "label": "定理工具",
        "role": "theorem",
        "marker": "cyan",
        "content": "写“单调 + 有界 ⇒ 收敛；收敛 ⇒ 有界”。",
        "speech": "证明型题常用单调有界定理。方向要记清楚：收敛推出有界，但有界不一定推出收敛。"
      },
      {
        "label": "最后一句",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“先看模式，再选工具：化简、夹逼、单调有界”。",
        "speech": "最后一句是解题顺序：先识别模式，再选择工具，是化简、夹逼，还是单调有界。"
      }
    ]
  }
];

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
    writeJson(path.join(planDir, `page-${label}.prompt-plan.json`), buildPromptPlan(page, pageNumber, prompt));
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
  const files = listGeneratedPngs(GENERATED_IMAGE_ROOT)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
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
    for (let y = Math.max(0, y1 - samplePad); y <= Math.min(raw.height - 1, y2 + samplePad); y += 1) {
      for (let x = Math.max(0, x1 - samplePad); x <= Math.min(raw.width - 1, x2 + samplePad); x += 1) {
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
  await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } }).png().toFile(outPath);
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
  await sharp(markerInput).resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' }).png().toFile(markerPublic);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  const allMarkerComponents = [];
  for (const component of promptPlan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    allMarkerComponents.push(...components);
    const hits = selectCornerHits(components);
    const sourceBbox = hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    if (components.length !== 4) {
      findings.push(`${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`);
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

function actionsForPage(page, pageNumber, focusRegions) {
  const focusByMarker = new Map();
  for (const region of focusRegions) {
    const markerName = region.id.split('-').at(-1);
    focusByMarker.set(markerName, region);
  }
  const actions = [];
  for (const component of page.components) {
    const region = focusByMarker.get(component.marker);
    if (!region) continue;
    const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${component.marker}`;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: component.label,
      description: `聚焦“${component.label}”区域。`,
      dimOpacity: 0.68,
    });
    actions.push({
      id: `${actionBase}-speech`,
      type: 'speech',
      title: component.label,
      text: component.speech,
    });
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
    const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
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
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
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
      const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') {
        throw new Error(`Page ${pageNumber} recovery is not passed`);
      }
      if (focusRegions.length !== page.components.length) {
        throw new Error(`Page ${pageNumber} focus count mismatch: ${focusRegions.length}/${page.components.length}`);
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
          description: '第七本中文手绘图片笔记本：数列定义、递归数列、收敛、夹逼、有界单调与递归极限。',
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
          description: '第七本中文手绘图片笔记本：数列定义、递归数列、收敛、夹逼、有界单调与递归极限。',
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
