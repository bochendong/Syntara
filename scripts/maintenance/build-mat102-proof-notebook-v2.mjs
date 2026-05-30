#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-sets-propositions-v2');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-sets-propositions-proof-v2';
const NOTEBOOK_NAME = '集合与命题：证明语言的入口（证明版）';

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;

const COLORS = [
  { name: 'red', hex: '#ff0000', test: (p) => p.r > 190 && p.g < 120 && p.b < 120 },
  { name: 'lime', hex: '#00ff00', test: (p) => p.g > 190 && p.r < 120 && p.b < 120 },
  { name: 'blue', hex: '#0048ff', test: (p) => p.b > 175 && p.r < 120 && p.g < 150 },
  { name: 'cyan', hex: '#00ffff', test: (p) => p.g > 175 && p.b > 175 && p.r < 135 },
  { name: 'magenta', hex: '#ff00ff', test: (p) => p.r > 175 && p.b > 175 && p.g < 135 },
  { name: 'yellow', hex: '#ffff00', test: (p) => p.r > 185 && p.g > 185 && p.b < 145 },
];

const COLOR_BY_NAME = new Map(COLORS.map((color) => [color.name, color]));

const selectedSources = [
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a6def2a748195a7ef8075c65c2802.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a6e5067508195a800e71a03697dfa.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f724c9464b8e688016a1a75b8d704819b95de0bef64612f23.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f724c9464b8e688016a1a764867f4819b933357ccefb22a38.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a6f69967c81959ada300ffb3fe807.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a6fc7eea081958fdb54e2f3773560.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a70228f148195a9193961a307af35.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f724c9464b8e688016a1a7725cbac819bb5a087adfcaa73a2.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f724c9464b8e688016a1a74e24efc819b97e0d67468e87079.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f724c9464b8e688016a1a7786274c819ba8cc242fa73fd4c1.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a71c0ff8481959b6ed3929c5305d9.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f724c9464b8e688016a1a77d56064819bb2cb4c357de4c32f.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a728a23c48195b1fb0bf5b6b4e420.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a72e7269c81958e71b733dbf00049.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a734c2548819584d3d7fd1727f333.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0cb4b9a711d24395016a1a7393681481958c9918420310f10c.png',
];

function region(id, label, color, script, visibleText = []) {
  return { id, label, color, script, visibleText };
}

const pages = [
  {
    title: '为什么证明需要精确语言',
    promptSummary: '介绍页：从图像直觉过渡到可检查的证明语言。',
    components: [
      region(
        'p01-header',
        '本页目标',
        'red',
        '这一页先把整节课的目标立住：证明不是把图画得像，而是把每一句话写到别人可以检查。我们要从“看起来对”走到“每一步有依据”。',
      ),
      region(
        'p01-bad',
        '坏开头',
        'lime',
        '这里的坏写法是“看起来 A 在 B 里面”。它可能帮助直觉，但不能作为证明，因为读者不知道这个“看起来”到底用了哪些条件。',
      ),
      region(
        'p01-good',
        '正确开头',
        'blue',
        '正确的证明开头通常是“任取 x 属于 A”。这句话把集合包含关系变成了一个任意元素的条件推理。',
      ),
      region(
        'p01-language',
        '三种语言',
        'cyan',
        '图像、自然语言和符号语言都可以出现，但在证明中，最终要落到能逐步检查的符号句子。',
      ),
      region(
        'p01-habit',
        '证明习惯',
        'magenta',
        '证明课的核心习惯是反复问：定义是什么？每当我们不知道下一步怎么写，就先把当前符号按定义展开。',
      ),
      region(
        'p01-question',
        '底部追问',
        'yellow',
        '这个追问要学生意识到：图可以启发证明，但图本身不能替代对任意元素的论证。',
      ),
    ],
  },
  {
    title: '集合定义：对象与条件',
    promptSummary: '集合由论域和筛选条件共同定义。',
    components: [
      region(
        'p02-header',
        '本页目标',
        'red',
        '这一页把集合定义拆开：一个集合不只是几个符号，而是先说明我们讨论哪些对象，再说明哪些对象被选中。',
      ),
      region(
        'p02-domain',
        '对象范围',
        'lime',
        '对象范围告诉我们变量在哪里活动。比如 x 属于 U，就是先把所有候选对象限制在 U 里。',
      ),
      region(
        'p02-condition',
        '筛选条件',
        'blue',
        '筛选条件 P(x) 决定哪些对象被放进集合。没有条件，集合就不是可判断的对象集合。',
      ),
      region(
        'p02-builder',
        '构造式',
        'cyan',
        '构造式 A={x∈U | P(x)} 可以读成：所有在 U 中并且满足 P(x) 的 x 组成 A。',
      ),
      region(
        'p02-membership',
        '属于展开',
        'magenta',
        '证明里最重要的一步是展开属于关系：x 属于 A 等价于 x 属于 U 且 P(x) 成立。',
      ),
      region(
        'p02-question',
        '底部追问',
        'yellow',
        '如果只写条件不写论域，变量的范围会漂移，证明里的每一步也就不稳定。',
      ),
    ],
  },
  {
    title: '从自然语言到集合构造式',
    promptSummary: '把自然语言拆成对象范围和条件，再用于证明。',
    components: [
      region(
        'p03-header',
        '本页目标',
        'red',
        '这一页练习把一句自然语言翻译成集合构造式。证明前先翻译，后面的推理才有抓手。',
      ),
      region(
        'p03-natural',
        '自然语言',
        'lime',
        '“小于十的正偶数”听起来很清楚，但证明里要把它拆成可以逐条检查的条件。',
      ),
      region(
        'p03-conditions',
        '拆条件',
        'blue',
        '这里的条件包括：x 是整数，x 大于零，x 是偶数，x 小于十。每一条以后都可能被单独使用。',
      ),
      region(
        'p03-builder',
        '合成构造式',
        'cyan',
        '把对象范围和条件合起来，就得到 A={x∈Z | x>0 且 x 是偶数 且 x<10}。',
      ),
      region(
        'p03-expand',
        '用于证明的展开',
        'magenta',
        '证明时，一旦写下 x 属于 A，就可以立刻展开出这四个条件。这就是构造式真正的用途。',
      ),
      region(
        'p03-question',
        '底部追问',
        'yellow',
        '“显然”通常把关键条件藏起来。证明要把这些条件明确写出来，让每一步都能被检查。',
      ),
    ],
  },
  {
    title: '属于关系：一句可判断的话',
    promptSummary: '固定集合后，x∈A 可以被判断真假；变量未定时是谓词。',
    components: [
      region(
        'p04-header',
        '本页主线',
        'red',
        '这一页把属于关系看成一句话。固定集合以后，某个对象是否属于集合就可以判断真假。',
      ),
      region(
        'p04-set',
        '固定集合',
        'lime',
        '先固定 A 的定义：A 是正整数且小于五的整数。这样之后的判断才有明确标准。',
      ),
      region(
        'p04-true',
        '判断为真',
        'blue',
        '三属于 A，因为三是整数，大于零，也小于五。每个条件都被检查到了。',
      ),
      region(
        'p04-false',
        '判断为假',
        'cyan',
        '六不属于 A，因为六虽然是正整数，但六小于五这一条件不成立。',
      ),
      region(
        'p04-variable',
        '变量未定',
        'magenta',
        '如果只写 x 属于 A，而没有指定 x 是谁，那么真假还没有固定。这时它更像一个谓词 P(x)。',
      ),
      region(
        'p04-question',
        '底部追问',
        'yellow',
        '写“设 x 属于 A”时，其实已经假设了 A 定义里的全部条件。证明要学会把这些条件拿出来用。',
      ),
    ],
  },
  {
    title: '子集证明模板：任取元素',
    promptSummary: '用任取元素法证明 A⊆B。',
    components: [
      region(
        'p05-header',
        '证明目标',
        'red',
        '这一页是第一个真正的证明模板。看到 A 包含于 B，不要先举例，而要证明每个 A 中元素都在 B 中。',
      ),
      region(
        'p05-translate',
        '目标翻译',
        'lime',
        'A 包含于 B 的定义可以翻译为：对任意 x，如果 x 属于 A，那么 x 属于 B。',
      ),
      region(
        'p05-first',
        '第一句话',
        'blue',
        '标准第一句是任取 x 属于 A。它表示我们要处理一个完全一般的 A 中元素。',
      ),
      region(
        'p05-use-a',
        '展开 A',
        'cyan',
        '接下来利用 A 的定义，把 x 属于 A 展开成可以操作的条件。',
      ),
      region(
        'p05-finish',
        '推出 B',
        'magenta',
        '把这些条件整理成 B 的定义，得到 x 属于 B；由于 x 是任取的，A 包含于 B 成立。',
      ),
      region(
        'p05-question',
        '底部追问',
        'yellow',
        '如果只找一个例子，只能说明某个元素在 B 中；子集证明要求所有元素都被覆盖。',
      ),
    ],
  },
  {
    title: '完整证明一：正偶数集合包含于整数',
    promptSummary: '完整写出一个 A⊆B 证明。',
    components: [
      region(
        'p06-header',
        '例题目标',
        'red',
        '这一页把子集模板写成一份完整证明。目标是说明正偶数集合包含在整数集合里。',
      ),
      region(
        'p06-sets',
        '定义集合',
        'lime',
        '先把两个集合写清楚：A 是正偶数集合，B 是整数集合。证明只能从这些定义出发。',
      ),
      region(
        'p06-goal',
        '目标',
        'blue',
        '要证明 A 包含于 B，就是任取 A 中元素后推出它属于整数集合。',
      ),
      region(
        'p06-proof',
        '证明主体',
        'cyan',
        '任取 x 属于 A。由 A 的定义可知 x 属于 Z，x 大于零且是偶数，其中 x 属于 Z 已经给出目标。',
      ),
      region(
        'p06-conclusion',
        '结论',
        'magenta',
        '因为 x 属于 Z，而 B 就是 Z，所以 x 属于 B。于是 A 包含于 B。',
      ),
      region(
        'p06-question',
        '底部追问',
        'yellow',
        '这个例子看似简单，但它展示了证明的格式：先任取，再展开定义，再回到目标。',
      ),
    ],
  },
  {
    title: '集合相等：双向包含法',
    promptSummary: '集合相等需要两个方向的包含。',
    components: [
      region(
        'p07-header',
        '本页主线',
        'red',
        '集合相等不是看起来一样，而是元素完全一样。证明时通常拆成两个包含方向。',
      ),
      region(
        'p07-definition',
        '定义翻译',
        'lime',
        'A 等于 B 可以翻译成 A 包含于 B 且 B 包含于 A。这是证明集合相等最常用的框架。',
      ),
      region(
        'p07-forward',
        '方向一',
        'blue',
        '第一方向证明 A 包含于 B：任取 x 属于 A，最后推出 x 属于 B。',
      ),
      region(
        'p07-backward',
        '方向二',
        'cyan',
        '第二方向反过来证明 B 包含于 A：任取 x 属于 B，推出 x 属于 A。',
      ),
      region(
        'p07-warning',
        '写作提醒',
        'magenta',
        '两个方向要分开写，不能只证明一边就结束。只证明一边只能得到包含，不能得到相等。',
      ),
      region(
        'p07-question',
        '底部追问',
        'yellow',
        '如果只证明 A 包含于 B，B 里可能还有额外元素，所以还不能说 A 等于 B。',
      ),
    ],
  },
  {
    title: '完整证明二：同一个集合的两种写法',
    promptSummary: '用双向包含证明列举法和构造式描述同一集合。',
    components: [
      region(
        'p08-header',
        '要证相等',
        'red',
        '这一页是完整的集合相等证明。我们要证明一个列举出来的集合和一个条件描述的集合其实相同。',
      ),
      region(
        'p08-claim',
        '要证明',
        'lime',
        '先读目标：A 是二四六八，B 是小于等于八的正偶数整数。我们要证明 A 等于 B。',
      ),
      region(
        'p08-forward',
        '证 A⊆B',
        'blue',
        '任取 x 属于 A，则 x 是二四六八中的一个，因此 x 是整数、正偶数，并且小于等于八。',
      ),
      region(
        'p08-backward',
        '证 B⊆A',
        'cyan',
        '反过来任取 x 属于 B。由定义，x 是小于等于八的正偶数，所以只能是二、四、六、八之一。',
      ),
      region(
        'p08-combine',
        '合并结论',
        'magenta',
        '两个包含方向都完成后，按集合相等的定义，得到 A 等于 B。',
      ),
      region(
        'p08-question',
        '底部追问',
        'yellow',
        '这一题容易漏掉反方向，因为列举集合看起来很明显；但严格相等必须检查两边。',
      ),
    ],
  },
  {
    title: '集合运算：把 x∈ 翻译成逻辑',
    promptSummary: '并、交、差的元素语言，以及集合运算证明的起手式。',
    components: [
      region(
        'p09-header',
        '本页目标',
        'red',
        '这一页把集合运算翻译成逻辑句子。证明前先翻译，很多集合题就会变成普通的逻辑推理。',
      ),
      region(
        'p09-union',
        '并集',
        'lime',
        '并集对应逻辑里的“或”：x 属于 A 并 B，意思是 x 在 A 里，或者 x 在 B 里。',
      ),
      region(
        'p09-intersection',
        '交集',
        'blue',
        '交集对应逻辑里的“且”：x 要同时属于 A 和 B，才属于 A 交 B。',
      ),
      region('p09-difference', '差集', 'cyan', '差集要保留两个条件：先在 A 里，再不在 B 里。'),
      region(
        'p09-proof-move',
        '证明动作',
        'magenta',
        '证明复杂集合式时，先任取 x，再写 x 属于左边，接着逐层展开定义直到目标条件出现。',
      ),
      region(
        'p09-question',
        '底部追问',
        'yellow',
        '因为集合证明比较的是任意元素是否满足条件，所以从 x 属于左边开始最容易把问题化成逻辑链。',
      ),
    ],
  },
  {
    title: '分配律证明：完整符号链',
    promptSummary: '用元素证明集合分配律的一边包含。',
    components: [
      region(
        'p10-header',
        '目标等式',
        'red',
        '这一页展示分配律的完整符号链。重点不是背公式，而是看每一行如何由定义和逻辑等价得到。',
      ),
      region(
        'p10-start',
        '起点',
        'lime',
        '从左边开始，任取 x 属于 A 交 B 并 C。这一步把集合包含证明变成元素条件推理。',
      ),
      region(
        'p10-expand',
        '展开定义',
        'blue',
        '展开交集和并集定义，得到 x 属于 A，并且 x 属于 B 或 x 属于 C。',
      ),
      region(
        'p10-logic',
        '逻辑重排',
        'cyan',
        '接下来使用逻辑分配律：A 条件和一个“或”组合，可以改写成两个“且”的或。',
      ),
      region(
        'p10-back',
        '回到集合',
        'magenta',
        '把两个“且”条件翻译回集合语言，就得到 x 属于右边，所以左边包含于右边。',
      ),
      region(
        'p10-question',
        '底部追问',
        'yellow',
        '反方向证明会从右边开始，展开并集后分情况推回左边。',
      ),
    ],
  },
  {
    title: '补集与德摩根律：元素证明',
    promptSummary: '用补集定义和逻辑否定证明德摩根律。',
    components: [
      region(
        'p11-header',
        '本页目标',
        'red',
        '这一页处理补集和德摩根律。关键是补集要先有论域，否定“或”会变成“且”。',
      ),
      region(
        'p11-claim',
        '命题',
        'lime',
        '我们要证明的典型结论是 A 并 B 的补集等于 A 的补集交 B 的补集。',
      ),
      region(
        'p11-start',
        '从左边开始',
        'blue',
        '任取 x 属于左边，意思是 x 在论域 U 中，并且 x 不属于 A 并 B。',
      ),
      region(
        'p11-negate',
        '展开并否定',
        'cyan',
        'x 不属于 A 并 B，等价于 x 不属于 A 且 x 不属于 B。这一步是逻辑否定的核心。',
      ),
      region(
        'p11-finish',
        '回到右边',
        'magenta',
        '由 x 不属于 A 且不属于 B，可得 x 属于 A 的补集并且属于 B 的补集，所以 x 属于右边。',
      ),
      region(
        'p11-question',
        '底部追问',
        'yellow',
        '第二个方向要从 x 属于 A 的补集交 B 的补集开始，再推回 x 不属于 A 并 B。',
      ),
    ],
  },
  {
    title: '笛卡尔积：顺序本身是定义',
    promptSummary: '笛卡尔积的成员判断和反例证明。',
    components: [
      region(
        'p12-header',
        '本页主线',
        'red',
        '笛卡尔积把顺序变成定义的一部分。证明时要追踪第一位来自哪个集合，第二位来自哪个集合。',
      ),
      region(
        'p12-definition',
        '定义',
        'lime',
        'A 乘 B 的元素是有序对，第一位来自 A，第二位来自 B。这个顺序不能随意交换。',
      ),
      region(
        'p12-member',
        '判断成员',
        'blue',
        '判断一个有序对是否属于 A 乘 B，就是检查第一位是否在 A 中，第二位是否在 B 中。',
      ),
      region(
        'p12-counter',
        '反例',
        'cyan',
        '取 A={1}, B={2}，A 乘 B 只有 (1,2)，而 B 乘 A 只有 (2,1)。',
      ),
      region(
        'p12-proof',
        '证明不相等',
        'magenta',
        '(1,2) 属于 A 乘 B，但不属于 B 乘 A，所以两个集合不相等。一个反例已经足够区分集合。',
      ),
      region(
        'p12-question',
        '底部追问',
        'yellow',
        '证明两个集合不相等，只要找到一个元素属于其中一个却不属于另一个。',
      ),
    ],
  },
  {
    title: '命题与谓词：自由变量的问题',
    promptSummary: '区分命题、谓词和代入后的真假。',
    components: [
      region(
        'p13-header',
        '本页目标',
        'red',
        '这一页把集合语言接到命题逻辑。我们要分清：哪些句子已经有真假，哪些还带着自由变量。',
      ),
      region(
        'p13-proposition',
        '命题',
        'lime',
        '命题是可以判断真假的完整句子。例如二是偶数，这句话已经能判断为真。',
      ),
      region(
        'p13-predicate',
        '谓词',
        'blue',
        'P(x)：x 是偶数，还没有固定 x，所以还不能立刻说真或假。',
      ),
      region(
        'p13-substitute',
        '代入后',
        'cyan',
        '代入具体对象以后，谓词变成命题。P(4) 为真，P(5) 为假。',
      ),
      region(
        'p13-risk',
        '证明中的风险',
        'magenta',
        '证明中最怕变量范围不清。写 P(x) 时要说明 x 来自哪个集合，否则一句话可能没有固定含义。',
      ),
      region(
        'p13-question',
        '底部追问',
        'yellow',
        '这要求学生区分对象、谓词和命题：x 本身不是命题，P(x) 带变量，P(4) 才能判断。',
      ),
    ],
  },
  {
    title: '量词进入证明：∀ 与 ∃',
    promptSummary: '全称、存在及其否定的证明意义。',
    components: [
      region(
        'p14-header',
        '本页主线',
        'red',
        '量词让带变量的句子变成命题。全称说每一个都成立，存在说至少有一个成立。',
      ),
      region(
        'p14-forall',
        '全称命题',
        'lime',
        '对所有 x 属于 A，P(x) 成立。证明全称命题要任取一个 x，再推出 P(x)。',
      ),
      region(
        'p14-exists',
        '存在命题',
        'blue',
        '存在 x 属于 A 使 P(x) 成立。证明存在命题通常要找出一个具体对象。',
      ),
      region(
        'p14-neg-forall',
        '否定全称',
        'cyan',
        '不是所有 x 都满足 P(x)，等价于存在一个 x 不满足 P(x)。这就是反例的逻辑来源。',
      ),
      region(
        'p14-neg-exists',
        '否定存在',
        'magenta',
        '不存在满足 P(x) 的 x，等价于所有 x 都不满足 P(x)。',
      ),
      region(
        'p14-question',
        '底部追问',
        'yellow',
        '要否定“所有人都会”，只需要找一个不会的人；这就是全称命题和反例的关系。',
      ),
    ],
  },
  {
    title: '坏证明诊断：三种常见错误',
    promptSummary: '诊断并修正证明中的常见错误。',
    components: [
      region(
        'p15-header',
        '本页目标',
        'red',
        '这一页不是学新定义，而是学会看出证明哪里坏。能诊断错误，才说明真的理解证明结构。',
      ),
      region(
        'p15-example-only',
        '错误一：只举例',
        'lime',
        '只举一个 x=2 不能证明所有元素都满足。全称结论需要任取元素，而不是展示一个样本。',
      ),
      region(
        'p15-assume-target',
        '错误二：假设结论',
        'blue',
        '证明 A 包含于 B 时，不能一开始就假设 x 属于 B。那正是目标，不是前提。',
      ),
      region(
        'p15-unclear-range',
        '错误三：范围不清',
        'cyan',
        '变量范围不清会让结论失去意义。写 x 时，要说明它来自哪个集合或论域。',
      ),
      region(
        'p15-fix',
        '修正模板',
        'magenta',
        '修正证明时按这个模板：任取 x，展开定义，推出目标，最后写所以。',
      ),
      region(
        'p15-question',
        '底部追问',
        'yellow',
        '学生可以用这一页自查自己的证明：我是不是只举了例子？是不是偷偷用了结论？变量范围清楚吗？',
      ),
    ],
  },
  {
    title: '总结挑战：先说策略，再写证明',
    promptSummary: '总结本节证明动作，并给出集合包含挑战。',
    components: [
      region(
        'p16-header',
        '总结主线',
        'red',
        '最后一页把整节课收束成一句话：证明先说对象，再展开条件，最后推出目标。',
      ),
      region(
        'p16-route',
        '路线',
        'lime',
        '本节课的路线是：对象到条件，条件到判断，判断再进入证明。',
      ),
      region(
        'p16-strategy',
        '策略',
        'blue',
        '遇到集合包含或相等，不要先猜；先选择证明策略，例如任取元素或双向包含。',
      ),
      region(
        'p16-expand',
        '展开',
        'cyan',
        '真正推进证明的是展开定义。x 属于 A 交 B，就展开成 x 属于 A 且 x 属于 B。',
      ),
      region(
        'p16-challenge',
        '挑战',
        'magenta',
        '挑战题：证明 A 交 B 包含于 A 并 B。起手式是任取 x 属于 A 交 B，然后展开交集。',
      ),
      region(
        'p16-question',
        '课后问题',
        'yellow',
        '收尾问题让学生先讲策略，再写证明。能说清策略，说明他已经开始像证明课那样思考。',
      ),
    ],
  },
];

function markerColorForPixel(data, offset) {
  const pixel = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
  return COLORS.find((color) => color.test(pixel))?.name ?? null;
}

function detectMarkerComponents(data, info) {
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const components = [];
  const rawOffset = (x, y) => (y * width + x) * channels;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const visitIndex = y * width + x;
      if (visited[visitIndex]) continue;
      const color = markerColorForPixel(data, rawOffset(x, y));
      if (!color) {
        visited[visitIndex] = 1;
        continue;
      }

      const queue = [[x, y]];
      visited[visitIndex] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;

      for (let q = 0; q < queue.length; q += 1) {
        const [cx, cy] = queue[q];
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nextVisitIndex = ny * width + nx;
          if (visited[nextVisitIndex]) continue;
          if (markerColorForPixel(data, rawOffset(nx, ny)) === color) {
            visited[nextVisitIndex] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fillRatio = count / (boxWidth * boxHeight);
      if (
        count >= 20 &&
        boxWidth >= 5 &&
        boxWidth <= 46 &&
        boxHeight >= 5 &&
        boxHeight <= 46 &&
        fillRatio >= 0.28
      ) {
        components.push({ color, count, minX, minY, maxX, maxY, boxWidth, boxHeight, fillRatio });
      }
    }
  }

  return components;
}

function orderedMarkerPoints(markers) {
  const points = markers
    .map((marker) => ({
      x: Math.round((marker.minX + marker.maxX) / 2),
      y: Math.round((marker.minY + marker.maxY) / 2),
    }))
    .sort((a, b) => a.y - b.y);
  const top = points.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);
  return [
    { ...top[0], corner: 'top-left' },
    { ...top[1], corner: 'top-right' },
    { ...bottom[0], corner: 'bottom-left' },
    { ...bottom[1], corner: 'bottom-right' },
  ];
}

function median(values) {
  if (!values.length) return 248;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function removeMarkers(data, info, markers) {
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const rawOffset = (x, y) => (y * width + x) * channels;

  for (const marker of markers) {
    const pad = 5;
    const x0 = Math.max(0, marker.minX - pad);
    const y0 = Math.max(0, marker.minY - pad);
    const x1 = Math.min(width - 1, marker.maxX + pad);
    const y1 = Math.min(height - 1, marker.maxY + pad);
    const samples = [[], [], []];

    for (let y = Math.max(0, y0 - 18); y <= Math.min(height - 1, y1 + 18); y += 1) {
      for (let x = Math.max(0, x0 - 18); x <= Math.min(width - 1, x1 + 18); x += 1) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        const offset = rawOffset(x, y);
        if (markerColorForPixel(data, offset)) continue;
        if (data[offset] > 176 && data[offset + 1] > 176 && data[offset + 2] > 176) {
          samples[0].push(data[offset]);
          samples[1].push(data[offset + 1]);
          samples[2].push(data[offset + 2]);
        }
      }
    }

    const fill = [median(samples[0]), median(samples[1]), median(samples[2])];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const offset = rawOffset(x, y);
        out[offset] = fill[0];
        out[offset + 1] = fill[1];
        out[offset + 2] = fill[2];
        if (channels > 3) out[offset + 3] = 255;
      }
    }
  }

  return out;
}

async function countRemainingMarkerMarks(imagePath) {
  const { data, info } = await sharp(imagePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCounts = Object.fromEntries(COLORS.map((color) => [color.name, 0]));
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const color = markerColorForPixel(data, offset);
    if (color) pixelCounts[color] += 1;
  }
  const componentCounts = Object.fromEntries(COLORS.map((color) => [color.name, 0]));
  for (const marker of detectMarkerComponents(data, info)) {
    componentCounts[marker.color] += 1;
  }
  return { pixelCounts, componentCounts };
}

function focusShape(component, bbox) {
  const [x0, y0, x1, y1] = bbox;
  const scaleX = CANVAS_WIDTH / IMAGE_WIDTH;
  const scaleY = CANVAS_HEIGHT / IMAGE_HEIGHT;
  return {
    id: component.id,
    name: `lecture-focus-generated: ${component.label}`,
    type: 'shape',
    left: Math.round(x0 * scaleX * 10) / 10,
    top: Math.round(y0 * scaleY * 10) / 10,
    width: Math.round((x1 - x0) * scaleX * 10) / 10,
    height: Math.round((y1 - y0) * scaleY * 10) / 10,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function buildActions(page) {
  return page.components.flatMap((component) => [
    {
      id: `${component.id}-spotlight`,
      type: 'spotlight',
      title: `聚焦：${component.label}`,
      elementId: component.id,
      dimOpacity: 0.62,
    },
    {
      id: `${component.id}-speech`,
      type: 'speech',
      title: component.label,
      text: component.script,
    },
  ]);
}

function promptPlanForPage(page, recoveryComponents, sourceUrl) {
  return {
    schemaVersion: 2,
    canvas: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, aspectRatio: '16:9' },
    styleProfile: {
      id: 'hand-drawn-chinese-proof-notebook-marker-v2',
      label: '中文手写证明课笔记',
      styleBrief: {
        preset: 'hand-drawn-course-notebook',
        background: 'white graph-paper notebook background with faint light-gray grid',
        colorMood: 'black marker text, deep teal formulas, pale teal fills, muted brown arrows',
      },
    },
    componentPlans: page.components.map((component, index) => {
      const color = COLOR_BY_NAME.get(component.color);
      return {
        id: component.id,
        label: component.label,
        order: index + 1,
        markerColorName: color.name,
        markerColorHex: color.hex,
        participatesInMask: true,
      };
    }),
    markerProtocol: {
      type: 'corner-square-markers-generated-in-image',
      componentCount: 6,
      markerCountPerComponent: 4,
      totalMarkerCount: 24,
      markerSizePx: 16,
      blankBackgroundPaddingPx: 30,
      colorPool: COLORS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: COLORS.map(({ hex }) => hex),
    },
    compiledImagePrompt: page.promptSummary,
    promptHash: crypto
      .createHash('sha1')
      .update(page.title + page.promptSummary)
      .digest('hex'),
    validationTarget: {
      maskableComponentCount: 6,
      totalMarkerCount: 24,
      markerCountsByColor: Object.fromEntries(COLORS.map((color) => [color.hex, 4])),
    },
    recoveryResult: {
      status: recoveryComponents.every((component) => component.markerCount === 4)
        ? 'passed'
        : 'partial',
      recoveredAt: Date.now(),
      originalMarkerImageUrl: sourceUrl,
      originalMarkerImageDimensions: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      components: recoveryComponents,
    },
  };
}

function sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents) {
  const focusById = new Map(
    recoveryComponents.map((component) => [component.componentId, component]),
  );
  const focusElements = page.components
    .map((component) => {
      const recovered = focusById.get(component.id);
      return recovered?.bbox ? focusShape(component, recovered.bbox) : null;
    })
    .filter(Boolean);

  return {
    id: `${NOTEBOOK_ID}-scene-${String(index + 1).padStart(2, '0')}`,
    title: page.title,
    type: 'slide',
    order: index,
    content: {
      type: 'slide',
      canvas: {
        id: `${NOTEBOOK_ID}-canvas-${String(index + 1).padStart(2, '0')}`,
        viewportSize: CANVAS_WIDTH,
        viewportRatio: 0.5625,
        background: { type: 'solid', color: '#ffffff', respectProfileStyle: false },
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#111827', '#0f766e', '#8b5e34', '#f8fafc'],
          fontColor: '#111827',
          fontName: 'Microsoft YaHei',
        },
        remark: page.promptSummary,
        elements: [
          {
            id: `p${String(index + 1).padStart(2, '0')}-full-page-bitmap`,
            type: 'image',
            name: 'full_page_bitmap',
            left: 0,
            top: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            rotate: 0,
            fixedRatio: false,
            src: cleanUrl,
            imageType: 'background',
            lock: true,
          },
          ...focusElements,
        ],
      },
      imageNotebookPromptPlan: promptPlanForPage(page, recoveryComponents, sourceUrl),
    },
    actions: buildActions(page),
    whiteboard: [],
  };
}

async function processPage(page, index, sourcePath) {
  const pageNo = String(index + 1).padStart(3, '0');
  const sourceOut = path.join(SOURCE_DIR, `page-${pageNo}-source-marked.png`);
  const cleanOut = path.join(RECOVERED_DIR, `page-${pageNo}-clean.png`);

  await sharp(sourcePath)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'fill' })
    .png()
    .toFile(sourceOut);
  const { data, info } = await sharp(sourceOut)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const markerComponents = detectMarkerComponents(data, info);
  const markerCountsByColor = Object.fromEntries(
    COLORS.map((color) => [
      color.name,
      markerComponents.filter((marker) => marker.color === color.name).length,
    ]),
  );

  for (const color of COLORS) {
    if (markerCountsByColor[color.name] !== 4) {
      throw new Error(
        `Page ${index + 1} ${page.title}: expected 4 ${color.name} markers, found ${
          markerCountsByColor[color.name]
        }`,
      );
    }
  }

  const recoveryComponents = page.components.map((component) => {
    const color = COLOR_BY_NAME.get(component.color);
    if (!color) throw new Error(`Unknown marker color ${component.color} for ${component.id}`);
    const markers = markerComponents.filter((marker) => marker.color === component.color);
    const points = orderedMarkerPoints(markers);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      componentId: component.id,
      label: component.label,
      markerColorHex: color.hex,
      markerCount: markers.length,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      markerPoints: points,
    };
  });

  const cleanData = removeMarkers(data, info, markerComponents);
  await sharp(cleanData, { raw: info }).png().toFile(cleanOut);

  const sourceUrl = `/generated-notebooks/mat102-sets-propositions-v2/source/page-${pageNo}-source-marked.png`;
  const cleanUrl = `/generated-notebooks/mat102-sets-propositions-v2/recovered/page-${pageNo}-clean.png`;
  const remainingMarkerMarks = await countRemainingMarkerMarks(cleanOut);
  const status =
    Object.values(markerCountsByColor).every((count) => count === 4) &&
    Object.values(remainingMarkerMarks.componentCounts).every((count) => count === 0)
      ? 'passed'
      : 'needs-review';

  return {
    scene: sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents),
    validation: {
      page: index + 1,
      title: page.title,
      sourcePath,
      sourceUrl,
      cleanUrl,
      markerCountsByColor,
      remainingMarkerMarks,
      status,
    },
  };
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function buildContactSheet(dir, filename, label) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => path.join(dir, name));
  const thumbW = 400;
  const thumbH = 225;
  const labelH = 34;
  const gap = 12;
  const cols = 4;
  const rows = Math.ceil(files.length / cols);
  const composites = [];

  for (let i = 0; i < files.length; i += 1) {
    const x = (i % cols) * (thumbW + gap);
    const y = Math.floor(i / cols) * (thumbH + labelH + gap);
    composites.push({
      input: await sharp(files[i]).resize(thumbW, thumbH, { fit: 'fill' }).png().toBuffer(),
      left: x,
      top: y,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${thumbW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="10" y="23" font-family="Arial" font-size="18" font-weight="700" fill="white">${escapeXml(
          label,
        )} ${String(i + 1).padStart(2, '0')}</text></svg>`,
      ),
      left: x,
      top: y + thumbH,
    });
  }

  await sharp({
    create: {
      width: cols * thumbW + (cols - 1) * gap,
      height: rows * (thumbH + labelH) + (rows - 1) * gap,
      channels: 3,
      background: '#f8fafc',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

async function importToDatabase(scenes) {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const course = await tx.course.findFirst({
        where: { id: COURSE_ID, ownerId: OWNER_ID },
        select: { id: true, ownerId: true, name: true, courseCode: true },
      });
      if (!course) throw new Error(`Target MAT102 course not found: ${COURSE_ID}`);

      await tx.notebook.deleteMany({ where: { courseId: COURSE_ID, ownerId: OWNER_ID } });
      await tx.notebook.create({
        data: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 证明课第一本中文手写笔记本：从集合定义、元素证明、集合运算到命题与量词。每页有带角标源图、恢复后 clean 图、区域聚焦讲解稿。',
          tags: ['MAT102', '集合', '命题', '证明', '中文', '角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-marker-recovery-v2',
        },
      });
      await tx.scene.createMany({
        data: scenes.map((scene) => ({
          id: scene.id,
          notebookId: NOTEBOOK_ID,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        })),
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (selectedSources.length !== pages.length) {
    throw new Error(
      `Selected source count ${selectedSources.length} does not match page count ${pages.length}`,
    );
  }
  for (const sourcePath of selectedSources) {
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing generated image: ${sourcePath}`);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const dir of [OUT_DIR, SOURCE_DIR, RECOVERED_DIR, META_DIR])
    fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (let index = 0; index < pages.length; index += 1) {
    results.push(await processPage(pages[index], index, selectedSources[index]));
    console.log(`processed ${index + 1}/${pages.length}: ${pages[index].title}`);
  }

  const validations = results.map((result) => result.validation);
  if (!validations.every((validation) => validation.status === 'passed')) {
    fs.writeFileSync(path.join(META_DIR, 'validations.json'), JSON.stringify(validations, null, 2));
    throw new Error(
      `Marker validation failed: ${JSON.stringify(
        validations.filter((v) => v.status !== 'passed'),
        null,
        2,
      )}`,
    );
  }

  fs.writeFileSync(path.join(META_DIR, 'validations.json'), JSON.stringify(validations, null, 2));
  fs.writeFileSync(
    path.join(META_DIR, 'selected-sources.json'),
    JSON.stringify(
      selectedSources.map((sourcePath, index) => ({
        page: index + 1,
        title: pages[index].title,
        sourcePath,
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(META_DIR, 'lecture-script.json'),
    JSON.stringify(
      pages.map((page, pageIndex) => ({
        page: pageIndex + 1,
        title: page.title,
        regions: page.components.map((component) => ({
          id: component.id,
          label: component.label,
          markerColor: COLOR_BY_NAME.get(component.color).hex,
          script: component.script,
        })),
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(META_DIR, 'scenes.json'),
    JSON.stringify(
      results.map((result) => result.scene),
      null,
      2,
    ),
  );

  await buildContactSheet(SOURCE_DIR, 'contact-sheet-source-marked.png', 'source');
  await buildContactSheet(RECOVERED_DIR, 'contact-sheet-recovered-clean.png', 'clean');
  await importToDatabase(results.map((result) => result.scene));

  console.log(
    JSON.stringify(
      {
        notebookId: NOTEBOOK_ID,
        courseId: COURSE_ID,
        pages: pages.length,
        validation: 'passed',
        outDir: OUT_DIR,
      },
      null,
      2,
    ),
  );
}

await main();
