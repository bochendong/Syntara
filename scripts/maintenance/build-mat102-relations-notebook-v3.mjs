#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-relations-equivalence-orders-v3');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-relations-equivalence-orders-proof-v2';
const NOTEBOOK_NAME = '关系、等价与序：从反证到偏序结构（proof-first 版）';

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const MARKER_SIZE = 16;
const MARKER_PAD = 50;

const COLORS = [
  { name: 'red', hex: '#ff0000', rgb: [255, 0, 0], test: (p) => p.r > 190 && p.g < 120 && p.b < 120 },
  { name: 'lime', hex: '#00ff00', rgb: [0, 255, 0], test: (p) => p.g > 190 && p.r < 120 && p.b < 120 },
  { name: 'blue', hex: '#0048ff', rgb: [0, 72, 255], test: (p) => p.b > 175 && p.r < 120 && p.g < 150 },
  { name: 'cyan', hex: '#00ffff', rgb: [0, 255, 255], test: (p) => p.g > 175 && p.b > 175 && p.r < 135 },
  { name: 'magenta', hex: '#ff00ff', rgb: [255, 0, 255], test: (p) => p.r > 175 && p.b > 175 && p.g < 135 },
  { name: 'yellow', hex: '#ffff00', rgb: [255, 255, 0], test: (p) => p.r > 185 && p.g > 185 && p.b < 145 },
];

const COLOR_BY_NAME = new Map(COLORS.map((color) => [color.name, color]));
const COLOR_NAMES = ['red', 'lime', 'blue', 'cyan', 'magenta', 'yellow'];

const selectedSources = [
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c5900704c819397d47177efeea663.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c53b2885c81939600e3eeb455d520.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c53ff664c8193aaa26302ed499518.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c54470e548193b6bca7ef2bac0d3b.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c5494b4f8819383a107d1db348ba8.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c54facdac81938ba922a39bc24fb9.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c55708d3481939c285602b9bf3aa1.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c55c401c48193a105229e27dff274.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c5614a0848193a8f96d0ba7bbcf7b.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c56679e8c8193bb3b38b3f04c00bb.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c56b6b89c8193b92d76382768afea.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c5701d5c881939ed7891431ca05e0.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c575279ac8193807022e474e756bc.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c57a752b48193a6f385b00bb2b685.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c57f18c9c8193b015bd568ade0c9c.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c595bc9848193be22ffaefd8ff847.png',
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function outerBox(box, pad = MARKER_PAD) {
  const [x0, y0, x1, y1] = box;
  return [
    clamp(x0 - pad, 36, IMAGE_WIDTH - MARKER_SIZE - 36),
    clamp(y0 - pad, 36, IMAGE_HEIGHT - MARKER_SIZE - 36),
    clamp(x1 + pad, MARKER_SIZE + 36, IMAGE_WIDTH - 36),
    clamp(y1 + pad, MARKER_SIZE + 36, IMAGE_HEIGHT - 36),
  ];
}

function page(title, role, specs) {
  return {
    title,
    role,
    promptSummary: `${role}：${title}`,
    components: specs.map((spec, index) => {
      const focusBox = spec.box;
      return {
        id: `p${String(pages.length + 1).padStart(2, '0')}-r${index + 1}`,
        label: spec.label,
        color: COLOR_NAMES[index],
        focusBox,
        markerBox: spec.markerBox ?? outerBox(focusBox, spec.pad ?? MARKER_PAD),
        script: spec.script,
      };
    }),
  };
}

const pages = [];

pages.push(
  page('关系：从反证到结构', '介绍页', [
    { label: '本讲地图', box: [115, 55, 650, 170], markerBox: [60, 36, 680, 220], script: '这一页先给路线：我们先把反证法作为证明工具讲清楚，再把“比较两个对象”抽象成关系。' },
    { label: '反证法', box: [720, 70, 1040, 275], markerBox: [720, 36, 1095, 325], script: '反证法的核心是：要证明 T，就临时接受 T 的否定，然后把这个假设推到矛盾。这里的 P 且非 Q 是蕴含假时的精确形式。' },
    { label: '关系语言', box: [1120, 60, 1485, 270], markerBox: [1110, 36, 1535, 320], script: '关系不是神秘符号，本质上就是笛卡尔积里的一个子集。写 aRb，等价于说有序对 (a,b) 被选进了 R。' },
    { label: '性质检查', box: [180, 300, 600, 565], markerBox: [120, 250, 655, 615], script: '自反、对称、传递都要读成量词命题。只有把量词写出来，才知道证明时该任取什么。' },
    { label: '两种结构', box: [740, 430, 1265, 665], markerBox: [690, 380, 1325, 715], script: '等价关系把元素分成“同类”的块；偏序保留比较方向，但允许有些元素不可比较。' },
    { label: '带走一句', box: [270, 740, 1330, 835], markerBox: [215, 690, 1385, 864], script: '本讲的动作顺序是：先翻译成量词，再判断是要证明所有情况，还是只需找一个反例。' },
  ]),
);

pages.push(
  page('反证法：把假设推到矛盾', '证明方法页', [
    { label: '目标', box: [150, 130, 505, 250], script: '目标是证明 T，常见形式是 P 推出 Q。反证的第一步不是直接证明 Q，而是暂时假设 T 是假的。' },
    { label: '否定目标', box: [980, 105, 1370, 230], script: '蕴含 P 推出 Q 的否定，等价于 P 成立但 Q 不成立。这个翻译决定了反证的起点。' },
    { label: '证明骨架', box: [595, 255, 880, 555], script: '中间这条链是完整骨架：从假设 P 且非 Q 出发，推出某个 R，又推出非 R，于是得到矛盾。' },
    { label: '为什么有效', box: [1000, 300, 1375, 510], script: 'R 且非 R 永远为假。如果 T 的否定一定导致永假，那 T 的否定就不能成立。' },
    { label: '写法模板', box: [225, 475, 540, 650], script: '写反证时，最好固定句式：为反证，假设结论不成立；推出矛盾；因此原命题成立。' },
    { label: '底部提醒', box: [220, 745, 1400, 830], script: '反证不是随便制造矛盾，矛盾必须由反设、已知条件和合法推理共同推出。' },
  ]),
);

pages.push(
  page('完整反证：没有最小正实数', '完整证明页', [
    { label: '命题', box: [120, 105, 520, 225], script: '命题说不存在最小的正实数。形式语言是：不存在 m 大于零，使得每个正实数都大于等于 m。' },
    { label: '反证假设', box: [705, 110, 1115, 240], script: '为了反证，我们假设这样的最小正实数 m 存在：m 大于零，并且 m 不超过任何正实数。' },
    { label: '构造更小对象', box: [1160, 120, 1480, 255], script: '接着构造 x 等于 m 除以 2。因为 m 大于零，所以 x 仍然是正实数。' },
    { label: '比较大小', box: [140, 345, 665, 550], script: '数轴上 m/2 位于 0 和 m 之间，所以 x=m/2 小于 m。这个比较是矛盾的关键。' },
    { label: '矛盾', box: [885, 360, 1320, 575], script: '现在 x 是正实数，却比 m 更小。这直接否定了“m 小于等于每个正实数”的假设。' },
    { label: '结论与方法', box: [860, 680, 1450, 815], script: '因此最小正实数不存在。这里的典型动作是：假设有一个最小对象，然后构造一个更小的同类对象。' },
  ]),
);

pages.push(
  page('完整反证：√2 不是有理数', '完整证明页', [
    { label: '命题', box: [190, 125, 475, 240], script: '我们要证明根号二不是有理数，也就是不能写成两个整数的最简比值。' },
    { label: '最简假设', box: [785, 105, 1175, 255], script: '反设根号二等于 p 除以 q，并且 p 与 q 已经约到最简。平方后得到 p 平方等于 2q 平方。' },
    { label: '推出 p 偶', box: [145, 355, 500, 485], script: '因为 p 平方等于 2q 平方，所以 p 平方为偶数。利用偶平方引理，推出 p 本身是偶数。' },
    { label: '代回方程', box: [690, 350, 1115, 500], script: '把 p 写成 2k 代回原方程，得到 q 平方等于 2k 平方，因此 q 平方也是偶数。' },
    { label: '推出 q 偶并矛盾', box: [160, 620, 695, 745], script: '同理 q 也为偶数。于是 p 和 q 同时被 2 整除，这和最简分数的假设矛盾。' },
    { label: '结论与检查', box: [825, 650, 1415, 780], script: '所以根号二无理。整篇证明依赖两个点：最简分数假设，以及“平方为偶则原数为偶”的引理。' },
  ]),
);

pages.push(
  page('二元关系：就是乘积里的子集', '定义翻译页', [
    { label: '定义', box: [220, 110, 620, 235], script: '二元关系的定义很短：A 到 B 的关系，就是 A 乘 B 里面被选中的一些有序对。' },
    { label: '读法', box: [820, 105, 1300, 235], script: 'aRb 只是 (a,b) 属于 R 的另一种写法。关系可以一对多，也可以有元素没有对应。' },
    { label: '小例子', box: [180, 335, 660, 520], script: '在这个有限例子中，直接列出 R 的有序对，就完全指定了哪些元素相关。' },
    { label: '图像', box: [700, 305, 1190, 565], script: '图像只是把这些有序对画成箭头。每一支箭头都对应 R 中的一个有序对。' },
    { label: '常见关系', box: [220, 635, 735, 760], script: '等号、小于号、小于等于号都是 A 乘 A 中的子集。熟悉符号背后也是有序对集合。' },
    { label: '底部问题', box: [815, 720, 1450, 820], script: '证明关系性质前，先问自己：我到底在检查哪些有序对，哪些有序对不在关系里。' },
  ]),
);

pages.push(
  page('关系性质：量词版本', '严格定义页', [
    { label: '自反', box: [140, 120, 420, 300], script: '自反要求每个元素都和自己相关。证明时要任取 a，然后证明 aRa。' },
    { label: '对称', box: [1030, 125, 1350, 290], script: '对称要求只要 a 指向 b，b 就必须能指回 a。证明时从任意 aRb 出发。' },
    { label: '反对称', box: [140, 430, 530, 610], script: '反对称不是说不能双向，而是说一旦 aRb 和 bRa 同时成立，两个元素必须相等。' },
    { label: '传递', box: [980, 420, 1360, 610], script: '传递要求 a 到 b、b 到 c 可以合成为 a 到 c。证明时要任取三个元素。' },
    { label: '完全', box: [480, 610, 875, 760], script: '完全性说任意两个元素都能比较。否定完全性时，只需找一对不可比较的元素。' },
    { label: '检查原则', box: [610, 330, 985, 440], script: '这页的核心是先读量词：证明性质用任意元素，否定性质用一个具体反例。' },
  ]),
);

pages.push(
  page('证明或反驳：先看量词', '方法模板页', [
    { label: '方法入口', box: [145, 95, 430, 220], script: '关系性质都是带量词的命题。动笔前先把量词补全，才能知道证明要覆盖什么范围。' },
    { label: '证明自反', box: [130, 370, 430, 575], script: '证明自反的模板是任取 a 属于 A，然后根据 R 的定义证明 aRa。' },
    { label: '证明传递', box: [520, 410, 830, 630], script: '证明传递的模板是任取 a,b,c，并假设 aRb 与 bRc，最后推出 aRc。' },
    { label: '反驳对称', box: [1110, 120, 1405, 300], script: '反驳对称不需要讨论所有元素，只要找到一对 a,b，使 aRb 成立而 bRa 不成立。' },
    { label: '反驳完全', box: [1080, 430, 1410, 610], script: '反驳完全性要找一对不可比较的元素：两者不同，而且两个方向都不相关。' },
    { label: '底部口诀', box: [300, 745, 1360, 835], script: '这句口诀之后会反复用：全称要任取，存在要构造，否定性质通常只要一个反例。' },
  ]),
);

pages.push(
  page('例题：a∼b 当且仅当 ab>1', '性质例题页', [
    { label: '关系定义', box: [125, 120, 445, 250], script: '这个关系定义在正实数上：a 和 b 相关，当且仅当它们的乘积大于一。' },
    { label: '对称成立', box: [725, 120, 1045, 280], script: '对称性成立，因为乘法交换。若 ab 大于一，那么 ba 也大于一。' },
    { label: '非自反', box: [165, 395, 475, 540], script: '自反性失败，只要取 a 等于二分之一。它的平方是四分之一，不大于一。' },
    { label: '非完全', box: [650, 405, 990, 560], script: '完全性失败，例如二分之一和一不可比较，两个方向的乘积都不大于一。' },
    { label: '非传递', box: [1085, 390, 1440, 590], script: '传递性也失败：二分之一和十相关，十和二分之一相关，但两端相乘只有四分之一。' },
    { label: '结论', box: [520, 710, 1180, 810], script: '所以这个关系只满足对称性。其余性质都用明确反例排除。' },
  ]),
);

pages.push(
  page('整除关系：一个偏序样板', '完整证明页', [
    { label: '定义', box: [160, 105, 520, 245], script: '在正整数上定义 a 小于等于 b，意思是 a 整除 b，也就是存在正整数 n 使 b 等于 na。' },
    { label: '自反证明', box: [1100, 105, 1390, 230], script: '自反性很直接：任取 a，a 等于一乘以 a，所以 a 整除自己。' },
    { label: '反对称证明', box: [155, 350, 630, 585], script: '若 a 整除 b 且 b 整除 a，就有 b=na 和 a=mb。代入得到 a=mna，所以 mn=1，进而 m=n=1，故 a=b。' },
    { label: '传递证明', box: [955, 365, 1405, 565], script: '若 a 整除 b、b 整除 c，则 b=na 且 c=kb。于是 c=kna，所以 a 整除 c。' },
    { label: '非完全反例', box: [165, 650, 520, 780], script: '整除不是全序，因为二和三不可比较：二不整除三，三也不整除二。' },
    { label: '结论', box: [965, 660, 1415, 800], script: '因此整除关系是偏序而不是全序。证明三性质靠任取，否定完全性靠一对反例。' },
  ]),
);

pages.push(
  page('等价关系：像相等，但更宽', '概念定义页', [
    { label: '定义', box: [630, 170, 990, 320], script: '等价关系就是同时满足自反、对称、传递的关系。它抽象的是“同类”或“视为相等”。' },
    { label: '自反含义', box: [170, 130, 470, 320], script: '自反性保证每个元素至少和自己同类，因此每个元素都能落入某个等价类。' },
    { label: '对称含义', box: [1080, 130, 1380, 320], script: '对称性保证同类关系没有方向偏差：a 和 b 同类时，b 也和 a 同类。' },
    { label: '传递含义', box: [600, 445, 1005, 635], script: '传递性保证同类关系可以接起来：a 同类于 b，b 同类于 c，则 a 同类于 c。' },
    { label: '直觉图', box: [170, 570, 650, 760], script: '直觉图中每个淡青色块是一组互相等价的元素。块与块之间不混在一起。' },
    { label: '证明任务', box: [955, 640, 1450, 790], script: '证明等价关系时，三条性质都必须完整写出。少证明一条，就不能称为等价关系。' },
  ]),
);

pages.push(
  page('完整证明：相差 2π 的角等价', '完整证明页', [
    { label: '定义与目标', box: [145, 105, 585, 250], script: '定义 x 和 y 等价，当且仅当 y-x 是 2π 的整数倍。目标是证明这是等价关系。' },
    { label: '自反', box: [135, 355, 470, 500], script: '自反性：任取 x，x-x 等于零，也就是 2π 乘以零，所以 x 等价于自身。' },
    { label: '对称', box: [895, 330, 1360, 500], script: '对称性：若 y-x=2πk，那么 x-y=2π(-k)。因为负 k 仍是整数，所以 y 等价于 x。' },
    { label: '传递假设', box: [130, 610, 610, 735], script: '传递性先写假设：x 等价于 y，且 y 等价于 z，于是存在整数 k1、k2 满足两条等式。' },
    { label: '传递计算', box: [680, 610, 1375, 765], script: '把 z-x 拆成 z-y 加 y-x，得到 2π(k1+k2)。整数对加法封闭，所以 x 等价于 z。' },
    { label: '结论', box: [410, 780, 1200, 850], script: '三条性质都成立，故这是等价关系。注意每一步都要说明新的整数见证是什么。' },
  ]),
);

pages.push(
  page('等价类：一个代表元带出一整族', '概念例题页', [
    { label: '定义', box: [135, 115, 495, 260], script: '等价类 [a] 是所有与 a 等价的元素的集合。代表元 a 只是给这类元素命名。' },
    { label: '商集', box: [1015, 110, 1395, 245], script: '商集 A 除以等价关系，里面的元素不是原来的点，而是一个个等价类。' },
    { label: '例子 [0]', box: [135, 330, 530, 480], script: '在相差 2π 的关系下，[0] 就是所有 2π 的整数倍。' },
    { label: '例子 [1.5]', box: [1000, 320, 1400, 480], script: '[1.5] 是所有 1.5 加上 2π 整数倍的数，也就是把 [0] 整体平移 1.5。' },
    { label: '数轴图', box: [300, 555, 1280, 700], script: '数轴展示两个等价类的形状：同一个类中的点相隔 2π，不同类之间整体错开。' },
    { label: '底部提醒', box: [410, 755, 1270, 835], script: '代表元可以换；如果两个代表元等价，它们命名的是同一个等价类。' },
  ]),
);

pages.push(
  page('等价类给出划分：证明骨架', '定理证明页', [
    { label: '定理', box: [125, 115, 555, 235], script: '定理说：一个等价关系会把集合 A 分成互不相交的块，也就是划分。' },
    { label: '覆盖 A', box: [700, 115, 1120, 245], script: '先证明覆盖性。任取 a 属于 A，由自反性 a 等价于 a，所以 a 属于自己的等价类。' },
    { label: '若相交', box: [1080, 255, 1465, 430], script: '若两个等价类相交，取交集中的一个元素 x，那么 x 同时等价于 a 和 b。' },
    { label: '推出同类', box: [280, 420, 650, 585], script: '由 x 等价于 a 和对称性，得到 a 等价于 x；再和 x 等价于 b 传递，得到 a 等价于 b。' },
    { label: '类相等', box: [725, 560, 1265, 725], script: '如果 a 等价于 b，则 [a]=[b]。证明时任取 y 属于 [a]，由 y∼a∼b 推出 y 属于 [b]，反向同理。' },
    { label: '结论', box: [265, 760, 1325, 835], script: '所以两个等价类要么相等，要么完全不相交；加上覆盖性，就得到划分。' },
  ]),
);

pages.push(
  page('序关系：把 ≤ 抽象出来', '定义比较页', [
    { label: '弱序定义', box: [155, 100, 520, 250], script: '弱序保留小于等于号的三种性质：自反、反对称、传递。' },
    { label: '强序定义', box: [1000, 95, 1365, 250], script: '强序对应严格小于号，通常是反自反加上传递，并排除自我比较。' },
    { label: '偏序', box: [190, 370, 545, 565], script: '偏序允许不可比较元素。图中分叉表示有些点之间没有上下关系。' },
    { label: '全序', box: [850, 360, 1235, 550], script: '全序要求任意两个元素都能比较，图像上像一条链。' },
    { label: '易混点', box: [1075, 565, 1430, 710], script: '反对称不是不对称。它允许双向关系，但双向关系只能发生在同一个元素上。' },
    { label: '底部判断法', box: [285, 760, 1320, 835], script: '判断序关系时，先检查三条性质，再追问是不是每两个元素都可比较。' },
  ]),
);

pages.push(
  page('完整证明：包含关系是偏序', '完整证明页', [
    { label: '命题', box: [135, 110, 540, 245], script: '在幂集 P(X) 上，用包含关系定义顺序。目标是证明它是弱偏序。' },
    { label: '自反', box: [705, 110, 1015, 245], script: '自反性：任取 A 属于 P(X)，显然 A 包含于 A，所以 A 小于等于自身。' },
    { label: '反对称', box: [1060, 105, 1440, 270], script: '反对称性：若 A 包含于 B 且 B 包含于 A，则按集合相等标准，A 等于 B。' },
    { label: '传递', box: [135, 425, 625, 605], script: '传递性：若 A 包含于 B 且 B 包含于 C，任取 x 属于 A，则 x 属于 B，进而属于 C，所以 A 包含于 C。' },
    { label: '非全序', box: [840, 455, 1305, 650], script: '它不是全序。例如 X={1,2,3}，A={1,2}，B={2,3}，两者互不包含。' },
    { label: '结论', box: [245, 740, 1320, 830], script: '因此包含关系是偏序；因为存在不可比较的子集，所以它不是全序。' },
  ]),
);

pages.push(
  page('极大、最大、界：别混在一起', '总结比较页', [
    { label: '极大元素', box: [115, 105, 520, 250], script: '极大元素的意思是：如果它还能往上比较到 x，那 x 只能是它自己。它不要求和所有元素可比较。' },
    { label: '最大元素', box: [970, 105, 1400, 250], script: '最大元素更强：每个元素都必须小于等于 M。所以最大若存在，一定是极大的；反过来不一定。' },
    { label: '整除例子', box: [340, 295, 930, 595], script: '在这个整除例子里，六、十、十五都是极大元素，因为它们没有更大的同集合倍数；但没有一个元素能被所有元素整除到达。' },
    { label: '若想有最大', box: [1015, 330, 1405, 520], script: '如果额外加入三十，三十会成为最大元素，因为一、二、三、五、六、十、十五都整除三十。' },
    { label: '上界与确界', box: [150, 620, 720, 760], script: '上界先要压住 S 中每个元素；确界再要求在所有上界里最小，或者在所有下界里最大。' },
    { label: '总结挑战', box: [280, 790, 1335, 855], script: '遇到关系题时，先写定义，看量词，再决定证明性质还是找反例，最后才谈等价类、偏序、界这些结构。' },
  ]),
);

function markerColorForPixel(data, offset) {
  const p = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
  for (const color of COLORS) {
    if (color.test(p)) return color.name;
  }
  return null;
}

function median(values) {
  if (!values.length) return 248;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function localBackground(data, info, x0, y0, x1, y1) {
  const { width, height, channels } = info;
  const rawOffset = (x, y) => (y * width + x) * channels;
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
  return [median(samples[0]), median(samples[1]), median(samples[2])];
}

function cleanPureMarkerColors(data, info) {
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const rawOffset = (x, y) => (y * width + x) * channels;
  const visited = new Uint8Array(width * height);

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
      let head = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      visited[visitIndex] = 1;

      while (head < queue.length) {
        const [cx, cy] = queue[head++];
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

      const pad = 5;
      const x0 = Math.max(0, minX - pad);
      const y0 = Math.max(0, minY - pad);
      const x1 = Math.min(width - 1, maxX + pad);
      const y1 = Math.min(height - 1, maxY + pad);
      const fill = localBackground(out, info, x0, y0, x1, y1);
      for (let py = y0; py <= y1; py += 1) {
        for (let px = x0; px <= x1; px += 1) {
          const offset = rawOffset(px, py);
          out[offset] = fill[0];
          out[offset + 1] = fill[1];
          out[offset + 2] = fill[2];
          if (channels > 3) out[offset + 3] = 255;
        }
      }
    }
  }

  return out;
}

function markerRectsForBox(box) {
  const [x0, y0, x1, y1] = box;
  return [
    { corner: 'top-left', x: x0, y: y0 },
    { corner: 'top-right', x: x1 - MARKER_SIZE, y: y0 },
    { corner: 'bottom-left', x: x0, y: y1 - MARKER_SIZE },
    { corner: 'bottom-right', x: x1 - MARKER_SIZE, y: y1 - MARKER_SIZE },
  ];
}

function isInkPixel(data, offset) {
  return data[offset] < 145 || data[offset + 1] < 145 || data[offset + 2] < 145;
}

function markerBlankScore(data, info, x, y, placedMarkers, proposedX, proposedY) {
  const { width, height, channels } = info;
  const rawOffset = (px, py) => (py * width + px) * channels;
  const blankPad = 34;
  let score = 0;
  const x0 = Math.max(0, x - blankPad);
  const y0 = Math.max(0, y - blankPad);
  const x1 = Math.min(width - 1, x + MARKER_SIZE + blankPad - 1);
  const y1 = Math.min(height - 1, y + MARKER_SIZE + blankPad - 1);

  for (let py = y0; py <= y1; py += 6) {
    for (let px = x0; px <= x1; px += 6) {
      if (isInkPixel(data, rawOffset(px, py))) score += 6;
    }
  }

  const cx = x + MARKER_SIZE / 2;
  const cy = y + MARKER_SIZE / 2;
  for (const placed of placedMarkers) {
    const pcx = placed.x + MARKER_SIZE / 2;
    const pcy = placed.y + MARKER_SIZE / 2;
    const distance = Math.hypot(cx - pcx, cy - pcy);
    if (distance < 54) score += 4000;
  }

  score += Math.hypot(x - proposedX, y - proposedY) * 0.35;
  return score;
}

function findCleanMarkerPosition(data, info, proposedX, proposedY, placedMarkers) {
  const maxRadius = 112;
  const step = 8;
  let best = {
    x: proposedX,
    y: proposedY,
    score: markerBlankScore(data, info, proposedX, proposedY, placedMarkers, proposedX, proposedY),
  };

  for (let dy = -maxRadius; dy <= maxRadius; dy += step) {
    for (let dx = -maxRadius; dx <= maxRadius; dx += step) {
      const x = Math.max(36, Math.min(IMAGE_WIDTH - MARKER_SIZE - 36, proposedX + dx));
      const y = Math.max(36, Math.min(IMAGE_HEIGHT - MARKER_SIZE - 36, proposedY + dy));
      const score = markerBlankScore(data, info, x, y, placedMarkers, proposedX, proposedY);
      if (score < best.score) best = { x, y, score };
    }
  }

  return best;
}

function drawMarkers(data, info, page) {
  const { channels } = info;
  const out = Buffer.from(data);
  const rawOffset = (x, y) => (y * IMAGE_WIDTH + x) * channels;
  const drawn = [];

  for (const component of page.components) {
    const color = COLOR_BY_NAME.get(component.color);
    const [r, g, b] = color.rgb;
    for (const marker of markerRectsForBox(component.markerBox)) {
      const proposedX = Math.max(36, Math.min(IMAGE_WIDTH - MARKER_SIZE - 36, marker.x));
      const proposedY = Math.max(36, Math.min(IMAGE_HEIGHT - MARKER_SIZE - 36, marker.y));
      const cleanPosition = findCleanMarkerPosition(data, info, proposedX, proposedY, drawn);
      const x0 = cleanPosition.x;
      const y0 = cleanPosition.y;
      for (let y = y0; y < y0 + MARKER_SIZE; y += 1) {
        for (let x = x0; x < x0 + MARKER_SIZE; x += 1) {
          const offset = rawOffset(x, y);
          out[offset] = r;
          out[offset + 1] = g;
          out[offset + 2] = b;
          if (channels > 3) out[offset + 3] = 255;
        }
      }
      drawn.push({ ...marker, x: x0, y: y0, color: component.color, componentId: component.id, score: cleanPosition.score });
    }
  }
  return { data: out, drawn };
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
      let head = 0;
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      visited[visitIndex] = 1;

      while (head < queue.length) {
        const [cx, cy] = queue[head++];
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
      if (count >= 20 && boxWidth >= 5 && boxWidth <= 46 && boxHeight >= 5 && boxHeight <= 46 && fillRatio >= 0.28) {
        components.push({ color, count, minX, minY, maxX, maxY, boxWidth, boxHeight, fillRatio });
      }
    }
  }

  return components;
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

function recoveryComponent(component, drawnMarkers = []) {
  const fallback = markerRectsForBox(component.markerBox).map((marker) => ({ ...marker, x: marker.x, y: marker.y }));
  const markers = drawnMarkers.length === 4 ? drawnMarkers : fallback;
  const x0 = Math.min(...markers.map((marker) => marker.x));
  const y0 = Math.min(...markers.map((marker) => marker.y));
  const x1 = Math.max(...markers.map((marker) => marker.x + MARKER_SIZE));
  const y1 = Math.max(...markers.map((marker) => marker.y + MARKER_SIZE));
  const color = COLOR_BY_NAME.get(component.color);
  return {
    componentId: component.id,
    label: component.label,
    markerColorHex: color.hex,
    markerCount: 4,
    bbox: [x0, y0, x1, y1],
    focusBbox: component.focusBox,
    markerPoints: markers.map((marker) => ({
      x: marker.x + MARKER_SIZE / 2,
      y: marker.y + MARKER_SIZE / 2,
      corner: marker.corner,
    })),
  };
}

function focusShape(component) {
  const [x0, y0, x1, y1] = component.focusBox;
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

function promptPlanForPage(page, recoveryComponents, sourceUrl, rawSourcePath) {
  return {
    schemaVersion: 3,
    canvas: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, aspectRatio: '16:9' },
    styleProfile: {
      id: 'hand-drawn-chinese-relations-proof-notebook-marker-v3',
      label: '中文手写 proof-first 关系课笔记',
      styleBrief: {
        preset: 'hand-drawn-course-notebook',
        background: 'white graph-paper notebook background with faint light-gray grid',
        colorMood: 'black marker text, deep teal formulas and diagrams, pale teal fills, muted brown arrows',
      },
    },
    pageRole: page.role,
    componentPlans: page.components.map((component, index) => {
      const color = COLOR_BY_NAME.get(component.color);
      return {
        id: component.id,
        label: component.label,
        order: index + 1,
        markerColorName: color.name,
        markerColorHex: color.hex,
        participatesInMask: true,
        markerBbox: component.markerBox,
        focusBbox: component.focusBox,
      };
    }),
    markerProtocol: {
      type: 'source-has-corner-square-markers-clean-is-recovered',
      componentCount: 6,
      markerCountPerComponent: 4,
      totalMarkerCount: 24,
      markerSizePx: MARKER_SIZE,
      blankBackgroundPaddingPx: 34,
      colorPool: COLORS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: COLORS.map(({ hex }) => hex),
      note: 'Marker boxes are intentionally wider than focus boxes so markers sit outside content; classroom spotlight uses focusBbox.',
    },
    compiledImagePrompt: page.promptSummary,
    promptHash: crypto.createHash('sha1').update(page.title + page.role).digest('hex'),
    validationTarget: {
      maskableComponentCount: 6,
      totalMarkerCount: 24,
      markerCountsByColor: Object.fromEntries(COLORS.map((color) => [color.hex, 4])),
    },
    recoveryResult: {
      status: 'passed',
      recoveredAt: Date.now(),
      rawImageGenSourcePath: rawSourcePath,
      originalMarkerImageUrl: sourceUrl,
      originalMarkerImageDimensions: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      components: recoveryComponents,
    },
  };
}

function sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents, rawSourcePath) {
  const pageNo = String(index + 1).padStart(2, '0');
  return {
    id: `${NOTEBOOK_ID}-scene-${pageNo}`,
    title: page.title,
    type: 'slide',
    order: index,
    content: {
      type: 'slide',
      canvas: {
        id: `${NOTEBOOK_ID}-canvas-${pageNo}`,
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
            id: `p${pageNo}-full-page-bitmap`,
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
          ...page.components.map(focusShape),
        ],
      },
      imageNotebookPromptPlan: promptPlanForPage(page, recoveryComponents, sourceUrl, rawSourcePath),
    },
    actions: buildActions(page),
    whiteboard: [],
  };
}

async function processPage(page, index, sourcePath) {
  const pageNo = String(index + 1).padStart(3, '0');
  const sourceOut = path.join(SOURCE_DIR, `page-${pageNo}-source.png`);
  const cleanOut = path.join(RECOVERED_DIR, `page-${pageNo}-clean.png`);

  const { data, info } = await sharp(sourcePath)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cleanData = cleanPureMarkerColors(data, info);
  await sharp(cleanData, { raw: info }).png().toFile(cleanOut);

  const marked = drawMarkers(cleanData, info, page);
  await sharp(marked.data, { raw: info }).png().toFile(sourceOut);

  const sourceUrl = `/generated-notebooks/mat102-relations-equivalence-orders-v3/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-relations-equivalence-orders-v3/recovered/page-${pageNo}-clean.png`;
  const sourceMarks = await countRemainingMarkerMarks(sourceOut);
  const cleanMarks = await countRemainingMarkerMarks(cleanOut);
  const markerCountsByColor = sourceMarks.componentCounts;
  const status =
    Object.values(markerCountsByColor).every((count) => count === 4) &&
    Object.values(cleanMarks.componentCounts).every((count) => count === 0)
      ? 'passed'
      : 'needs-review';

  const drawnByComponent = new Map();
  for (const marker of marked.drawn) {
    if (!drawnByComponent.has(marker.componentId)) drawnByComponent.set(marker.componentId, []);
    drawnByComponent.get(marker.componentId).push(marker);
  }
  const recoveryComponents = page.components.map((component) =>
    recoveryComponent(component, drawnByComponent.get(component.id) ?? []),
  );
  return {
    scene: sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents, sourcePath),
    validation: {
      page: index + 1,
      title: page.title,
      sourcePath,
      sourceUrl,
      cleanUrl,
      markerCountsByColor,
      cleanMarkerCountsByColor: cleanMarks.componentCounts,
      sourcePixelCounts: sourceMarks.pixelCounts,
      cleanPixelCounts: cleanMarks.pixelCounts,
      drawnMarkers: marked.drawn.map(({ componentId, color, corner, x, y, score }) => ({
        componentId,
        color,
        corner,
        x,
        y,
        score,
      })),
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
      channels: 4,
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
        select: { id: true },
      });
      if (!course) throw new Error(`Target MAT102 course not found: ${COURSE_ID}`);

      await tx.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：从反证法、二元关系与关系性质，到等价类划分、偏序、极大/最大与确界。每页含可恢复角标源图、去角标 clean 图、区域聚焦讲解稿。',
          tags: ['MAT102', '关系', '反证法', '等价关系', '偏序', '证明', '中文', 'proof-first', '角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-marker-recovery-v3',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：从反证法、二元关系与关系性质，到等价类划分、偏序、极大/最大与确界。每页含可恢复角标源图、去角标 clean 图、区域聚焦讲解稿。',
          tags: ['MAT102', '关系', '反证法', '等价关系', '偏序', '证明', '中文', 'proof-first', '角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-marker-recovery-v3',
        },
      });

      await tx.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
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
    throw new Error(`Selected source count ${selectedSources.length} does not match page count ${pages.length}`);
  }
  for (const sourcePath of selectedSources) {
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing generated image: ${sourcePath}`);
  }

  fs.rmSync(SOURCE_DIR, { recursive: true, force: true });
  fs.rmSync(RECOVERED_DIR, { recursive: true, force: true });
  for (const dir of [OUT_DIR, SOURCE_DIR, RECOVERED_DIR, META_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const results = [];
  for (let index = 0; index < pages.length; index += 1) {
    results.push(await processPage(pages[index], index, selectedSources[index]));
    console.log(`processed ${index + 1}/${pages.length}: ${pages[index].title}`);
  }

  const validations = results.map((result) => result.validation);
  fs.writeFileSync(path.join(META_DIR, 'validations.json'), JSON.stringify(validations, null, 2));
  if (!validations.every((validation) => validation.status === 'passed')) {
    throw new Error(
      `Marker validation failed: ${JSON.stringify(
        validations.filter((validation) => validation.status !== 'passed'),
        null,
        2,
      )}`,
    );
  }

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
      pages.map((page, index) => ({
        page: index + 1,
        title: page.title,
        role: page.role,
        regions: page.components.map(({ id, label, script, focusBox, markerBox, color }) => ({
          id,
          label,
          markerColor: COLOR_BY_NAME.get(color).hex,
          focusBox,
          markerBox,
          script,
        })),
      })),
      null,
      2,
    ),
  );

  const scenes = results.map((result) => result.scene);
  fs.writeFileSync(path.join(META_DIR, 'scenes.json'), JSON.stringify(scenes, null, 2));

  await buildContactSheet(RECOVERED_DIR, 'contact-sheet-clean.png', 'clean');
  await buildContactSheet(SOURCE_DIR, 'contact-sheet-source.png', 'source');
  await importToDatabase(scenes);

  console.log(`Built ${pages.length} MAT102 relations notebook scenes for ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
