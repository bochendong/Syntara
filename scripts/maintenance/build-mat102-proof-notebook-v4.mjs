#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-sets-propositions-v4');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-sets-propositions-proof-v2';
const NOTEBOOK_NAME = '集合与命题：证明语言的入口（proof-first 版）';

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const MARKER_SIZE = 16;

const COLORS = [
  { name: 'red', hex: '#ff0000', rgb: [255, 0, 0], test: (p) => p.r > 190 && p.g < 120 && p.b < 120 },
  { name: 'lime', hex: '#00ff00', rgb: [0, 255, 0], test: (p) => p.g > 190 && p.r < 120 && p.b < 120 },
  { name: 'blue', hex: '#0048ff', rgb: [0, 72, 255], test: (p) => p.b > 175 && p.r < 120 && p.g < 150 },
  { name: 'cyan', hex: '#00ffff', rgb: [0, 255, 255], test: (p) => p.g > 175 && p.b > 175 && p.r < 135 },
  { name: 'magenta', hex: '#ff00ff', rgb: [255, 0, 255], test: (p) => p.r > 175 && p.b > 175 && p.g < 135 },
  { name: 'yellow', hex: '#ffff00', rgb: [255, 255, 0], test: (p) => p.r > 185 && p.g > 185 && p.b < 145 },
];

const COLOR_BY_NAME = new Map(COLORS.map((color) => [color.name, color]));

const selectedSources = [
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bbea8dc088199bfde836afd35c39b.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bbfe42d508199814e3452797be871.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc0840b508199a05b3c5c97f94b4c.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc124519c81998b3f892f242fe4f5.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc18ea93c8199885835f0710d9088.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc21b14e48199b167eb3f616204a2.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc2c53c888199a4c7258db1856523.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc7aea7688199aca71ad7f2ec1369.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc3d5f4cc819996edf38d7284837d.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc420ca208199a15984f06ce8f332.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc481a0ac81998521f2b0ed57ce83.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc4e1ecb48199af8e4cc2526b1794.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc53e68d08199a7472af820deeaa9.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc59f5a508199af32d050c70b2616.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc6001db08199ab4eb21d7e2e2ffe.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_03e0e88e0306e426016a1bc66f4c1c8199b6c47a316a8937f6.png',
];

function component(id, label, color, box, script) {
  return { id, label, color, box, script };
}

const boxes = {
  intro: [
    [70, 50, 835, 260],
    [1015, 75, 1510, 260],
    [620, 275, 965, 700],
    [70, 345, 585, 660],
    [1030, 350, 1530, 665],
    [140, 720, 1480, 855],
  ],
  concept: [
    [70, 45, 650, 230],
    [860, 60, 1510, 220],
    [780, 245, 1510, 390],
    [65, 270, 620, 585],
    [805, 430, 1500, 665],
    [120, 720, 1500, 855],
  ],
  builder: [
    [65, 45, 615, 205],
    [875, 50, 1520, 215],
    [55, 250, 655, 420],
    [705, 230, 1330, 555],
    [55, 625, 720, 745],
    [125, 755, 1485, 855],
  ],
  ops: [
    [55, 45, 685, 190],
    [65, 210, 530, 465],
    [565, 210, 1030, 465],
    [1060, 210, 1530, 465],
    [570, 500, 1090, 685],
    [120, 735, 1485, 855],
  ],
  computation: [
    [55, 55, 720, 210],
    [975, 55, 1530, 195],
    [55, 245, 815, 425],
    [960, 245, 1530, 430],
    [55, 500, 1390, 670],
    [120, 725, 1490, 845],
  ],
  complement: [
    [60, 55, 620, 205],
    [745, 55, 1490, 205],
    [65, 245, 690, 595],
    [790, 245, 1460, 455],
    [60, 605, 680, 760],
    [750, 645, 1510, 820],
  ],
  cartesian: [
    [70, 55, 650, 215],
    [780, 55, 1515, 225],
    [65, 260, 510, 580],
    [525, 260, 1015, 585],
    [1030, 260, 1515, 620],
    [120, 725, 1490, 850],
  ],
  subsetTemplate: [
    [55, 50, 615, 220],
    [855, 55, 1520, 220],
    [610, 255, 1010, 455],
    [55, 420, 545, 700],
    [1050, 395, 1515, 710],
    [120, 750, 1490, 850],
  ],
  proofAUnion: [
    [55, 55, 980, 220],
    [55, 235, 620, 355],
    [55, 365, 915, 510],
    [55, 515, 920, 650],
    [55, 640, 940, 770],
    [120, 780, 1485, 855],
  ],
  direction: [
    [60, 55, 680, 200],
    [930, 55, 1500, 200],
    [60, 250, 625, 425],
    [880, 250, 1510, 430],
    [60, 500, 875, 710],
    [120, 745, 1490, 845],
  ],
  equalityTemplate: [
    [55, 55, 645, 215],
    [55, 255, 625, 435],
    [920, 255, 1510, 435],
    [885, 455, 1515, 655],
    [55, 480, 780, 660],
    [120, 740, 1490, 845],
  ],
  unionEquals: [
    [60, 55, 720, 200],
    [60, 225, 770, 420],
    [60, 410, 865, 650],
    [60, 640, 865, 760],
    [885, 290, 1510, 650],
    [120, 730, 1490, 850],
  ],
  builderEquality: [
    [60, 55, 805, 220],
    [815, 70, 1460, 220],
    [60, 255, 800, 600],
    [60, 600, 800, 730],
    [825, 255, 1510, 705],
    [120, 725, 1490, 850],
  ],
  predicate: [
    [60, 55, 620, 230],
    [635, 55, 1020, 225],
    [1030, 55, 1515, 270],
    [60, 300, 620, 510],
    [680, 300, 1515, 555],
    [120, 725, 1490, 850],
  ],
  logic: [
    [60, 55, 465, 225],
    [680, 55, 1185, 225],
    [60, 265, 430, 505],
    [495, 265, 1025, 590],
    [1035, 325, 1515, 565],
    [120, 725, 1490, 850],
  ],
  deMorgan: [
    [60, 55, 710, 205],
    [835, 55, 1515, 225],
    [60, 255, 860, 625],
    [900, 255, 1515, 500],
    [915, 500, 1515, 660],
    [120, 725, 1490, 850],
  ],
};

function page(title, role, boxKey, scripts) {
  const colorNames = ['red', 'lime', 'blue', 'cyan', 'magenta', 'yellow'];
  return {
    title,
    role,
    promptSummary: `${role}：${title}`,
    components: scripts.map((item, index) =>
      component(
        `p${String(pages.length + 1).padStart(2, '0')}-r${index + 1}`,
        item.label,
        colorNames[index],
        boxes[boxKey][index],
        item.script,
      ),
    ),
  };
}

const pages = [];

pages.push(
  page('集合与命题：证明语言的入口', '介绍页', 'intro', [
    { label: '本页目标', script: '这一页先定调：证明不是把直觉写漂亮，而是把一句直觉改写成别人可以逐步检查的句子链。' },
    { label: '坏句子诊断', script: '这里故意放一个坏句子：“看起来 A 在 B 里”。它没有任意元素，也没有定义依据，所以不能算证明。' },
    { label: '证明动作地图', script: '这条动作地图是本节课主线：读目标，决定任取还是构造，展开定义，做逻辑变形，最后回到目标。' },
    { label: '例子预告', script: '左下角列出的不是零散技巧，而是不同目标触发的证明动作：子集要任取，相等要两边包含，存在要给见证。' },
    { label: '严格性的来源', script: '严格性来自对象范围、定义翻译和每一步理由。以后写证明时，每一步都要能回答“为什么可以这样写”。' },
    { label: '带走一句', script: '最后这句话是本节课的标准：证明不是说服自己，而是让别人能逐步检查。' },
  ]),
);

pages.push(
  page('集合：对象必须定义明确', '概念定义页', 'concept', [
    { label: '集合定义', script: '集合的关键词是无序、互异、定义明确。真正重要的是 well-defined：能判断一个对象到底属不属于集合。' },
    { label: '属于关系', script: '属于关系写成 a∈S，不属于写成 a∉S。证明里经常从这一句开始展开定义。' },
    { label: '元素相等', script: '集合只看元素，不看顺序，也不看重复次数，所以这些看起来不同的列法可以表示同一个集合。' },
    { label: '空集', script: '空集没有任何元素，而包含空集的集合有一个元素，这就是 ∅ 和 {∅} 的区别。' },
    { label: '坏定义', script: '“让我开心的正数”不是好定义，因为不同人无法一致判断一个数是否属于这个集合。' },
    { label: '定义检查', script: '写集合前，先问每个候选对象能不能被明确判定；这是证明语言的第一关。' },
  ]),
);

pages.push(
  page('集合构造式：条件要能展开', '构造式计算页', 'builder', [
    { label: '构造式读法', script: '集合构造式把对象范围和筛选条件写在一起，读作 U 中所有满足 P 的对象。' },
    { label: '展开规则', script: '这条等价式最重要：a 属于这个构造式，当且仅当 a 在 U 中并且 P(a) 成立。证明时就靠它展开。' },
    { label: '有限例题', script: '这里的 S 由所有 x+y 构成，x 只能取 1 或 2，y 只能取 5 或 7。' },
    { label: '枚举计算', script: '把四种组合全部列出，就得到 6、8、7、9；这一步是完整计算，不是猜。' },
    { label: '属于判断', script: '因此 S 等于 {6,7,8,9}。比如 7 属于 S，因为 7 等于 2+5；10 不属于，因为没有组合得到 10。' },
    { label: '带走一句', script: '构造式不是装饰，它告诉你 x 属于集合时到底能使用哪些条件。' },
  ]),
);

pages.push(
  page('集合运算：先翻译成逻辑', '定义翻译页', 'ops', [
    { label: '翻译入口', script: '这一页不是证明某个定理，而是建立证明会用到的字典：集合运算都从 x 属于哪里开始读。' },
    { label: '并集', script: '并集对应“或”。x 属于 S∪T，等价于 x 属于 S 或 x 属于 T。' },
    { label: '交集', script: '交集对应“且”。x 属于 S∩T，等价于 x 同时属于 S 和 T。' },
    { label: '差集', script: '差集对应“且不在”。x 属于 S\\T，等价于 x 属于 S 并且 x 不属于 T。' },
    { label: '逻辑字典', script: '这张小字典后面会反复使用：并是或，交是且，差是且不在，补集是否定。' },
    { label: '带走一句', script: '集合恒等式的证明，本质上就是把属于关系翻译成逻辑句子再翻译回来。' },
  ]),
);

pages.push(
  page('集合运算例题：先写集合，再算结果', '计算页', 'computation', [
    { label: '题目设置', script: '先看两个集合：S 是所有非负整数，T 是所有偶整数。计算前先不要急着列答案。' },
    { label: '构造式表达', script: '把 S 和 T 写成构造式后，条件就清楚了：S 要 n 大于等于零，T 要 n 能写成 2k。' },
    { label: '并集计算', script: '并集保留满足任一条件的元素，所以得到所有非负整数，再加上负的偶整数。' },
    { label: '交集计算', script: '交集要同时满足两个条件，因此是非负偶整数。' },
    { label: '差集计算', script: 'S 去掉 T 后留下非负奇数；T 去掉 S 后留下负偶数。这里每个结果都来自属于关系的翻译。' },
    { label: '计算原则', script: '集合运算不是凭图形涂色，而是先翻译 x 属于哪里，再决定保留哪些元素。' },
  ]),
);

pages.push(
  page('补集：一定要先说全集', '概念定义页', 'complement', [
    { label: '全集提醒', script: '补集必须依赖全集 U。没有 U，A 的补集到底包含哪些对象是不完整的。' },
    { label: '补集定义', script: 'A 的补集是 U 中但不在 A 中的元素。注意两个条件都要出现：在 U 中，并且不在 A 中。' },
    { label: '图像直觉', script: '图像只帮我们看关系：矩形代表 U，圆代表 A，圆外但仍在矩形里的部分才是 A 的补集。' },
    { label: '非负整数例子', script: '如果全集是整数，S 是非负整数，那么 S 的补集就是负整数。' },
    { label: '偶数例子', script: '如果全集是整数，T 是偶数集合，那么 T 的补集是奇数集合。换全集时补集会改变。' },
    { label: '带走一句', script: '补集不是宇宙里所有不在 A 的东西，而是在当前全集 U 中但不在 A 的东西。' },
  ]),
);

pages.push(
  page('笛卡尔积：顺序也是定义', '概念例题页', 'cartesian', [
    { label: '定义', script: '笛卡尔积 A×B 的元素是有序对，第一坐标来自 A，第二坐标来自 B。' },
    { label: '属于测试', script: '判断 (u,v) 是否属于 A×B，要分别检查 u 属于 A，并且 v 属于 B。' },
    { label: '完整列举', script: '当 A 有两个元素，B 有三个元素时，A×B 一共有六个有序对。这里要全部列出来。' },
    { label: '顺序警告', script: '一般 A×B 不等于 B×A，因为有序对的第一、第二坐标角色不同。' },
    { label: '空集与嵌套', script: '任何集合乘以空集都会得到空集。嵌套乘积也要注意括号，因为 ((a,b),a′) 和 (a,(b,a′)) 不是同一类对象。' },
    { label: '带走一句', script: '证明一个有序对属于乘积集合，要逐个坐标检查，而不是只看符号形状。' },
  ]),
);

pages.push(
  page('子集证明模板：任取一个元素', '证明模板页', 'subsetTemplate', [
    { label: '子集语言', script: '子集命题 S⊆T 可以读成：对所有 x，如果 x 属于 S，那么 x 属于 T。' },
    { label: '开头动作', script: '证明 S⊆T 的第一句话通常是任取 x∈S。这个 x 不是特殊例子，而是任意代表。' },
    { label: '展开定义', script: '由 x 属于 S，我们展开 S 的定义，得到后面可以使用的条件。' },
    { label: '目标翻译', script: '目标是证明 x 属于 T，所以也要知道 T 的定义要求什么条件。' },
    { label: '收束', script: '一旦推出 T 的目标条件，就能得到 x∈T；再用 x 的任意性收束为 S⊆T。' },
    { label: '模板记忆', script: '子集证明不是举一个元素，而是让任意 x 带着 S 的条件走到 T 的条件。' },
  ]),
);

pages.push(
  page('完整证明：A⊆A∪B', '完整证明页', 'proofAUnion', [
    { label: '命题', script: '本页证明一个完整命题：对任意集合 A 和 B，都有 A 包含于 A 并 B。' },
    { label: '证明开头', script: '因为目标是子集，所以从任取 x∈A 开始，并明确目标是推出 x∈A∪B。' },
    { label: '并集定义', script: '并集定义告诉我们，x 属于 A∪B 当且仅当 x 属于 A 或 x 属于 B。' },
    { label: '逻辑步骤', script: '已知 x∈A，所以可以推出 x∈A 或 x∈B。这是从 P 得到 P 或 Q 的逻辑规则。' },
    { label: '证明收束', script: '因此 x∈A∪B。由于最初的 x 是 A 中任意元素，所以 A⊆A∪B。' },
    { label: '检查点', script: '这不是举例证明；x 代表 A 中任意元素，这是子集证明成立的关键。' },
  ]),
);

pages.push(
  page('判断方向：A∩B⊆A 才总成立', '证明加反例页', 'direction', [
    { label: '问题', script: '这一页训练判断包含方向：A⊆A∩B 不总成立，而 A∩B⊆A 总成立。' },
    { label: '正确命题', script: '正确的总命题是：对任意集合 A 和 B，交集 A∩B 包含于 A。' },
    { label: '证明开头', script: '为了证明 A∩B⊆A，任取 x∈A∩B，目标是推出 x∈A。' },
    { label: '展开交集', script: '由交集定义，x∈A∩B 意味着 x∈A 且 x∈B，所以立刻得到 x∈A。' },
    { label: '反例', script: '反方向用反例否定：取 A={1}, B=∅，则 1∈A 但 1 不在 A∩B 中，所以 A⊆A∩B 不总成立。' },
    { label: '带走一句', script: '包含关系有方向；交集通常比每个原集合更小或相等。' },
  ]),
);

pages.push(
  page('集合相等：两条包含路', '证明模板页', 'equalityTemplate', [
    { label: '相等标准', script: '集合相等不是看图像是否重合，而是每个元素完全相同。形式上就是 A⊆B 且 B⊆A。' },
    { label: '第一条路', script: '证明 A⊆B 时，任取 x∈A，然后通过定义和条件推出 x∈B。' },
    { label: '第二条路', script: '证明 B⊆A 时，任取 x∈B，再推出 x∈A。两条路缺一不可。' },
    { label: '为什么要两条', script: '只证明 A⊆B，B 仍然可能有额外元素。所以另一条包含不能省。' },
    { label: '收尾句', script: '当两条包含都完成后，最后一句才可以写：所以 A=B。' },
    { label: '带走一句', script: '集合相等证明本质上是两篇子集证明合在一起。' },
  ]),
);

pages.push(
  page('完整证明：若 A⊆B，则 A∪B=B', '完整证明页', 'unionEquals', [
    { label: '命题与策略', script: '本页证明：若 A⊆B，则 A∪B=B。因为目标是集合相等，所以要证明两条包含。' },
    { label: '第一条包含开头', script: '先证 A∪B⊆B。任取 x∈A∪B，接下来要推出 x∈B。' },
    { label: '分情况', script: '由并集定义，x∈A 或 x∈B。若 x∈A，就用假设 A⊆B 得到 x∈B；若 x∈B，则目标直接成立。' },
    { label: '第一条收束', script: '两种情况都得到 x∈B，因此 A∪B⊆B。' },
    { label: '第二条包含', script: '再证 B⊆A∪B。任取 x∈B，则 x∈A 或 x∈B 成立，所以 x∈A∪B。' },
    { label: '结论', script: '两条包含都成立，故 A∪B=B。关键用法是 A⊆B 可以把 x∈A 转成 x∈B。' },
  ]),
);

pages.push(
  page('完整证明：两个构造式表示同一集合', '完整证明页', 'builderEquality', [
    { label: '题目', script: '这里两个集合都用存在整数 k 的形式定义。目标是证明它们其实表示同一个集合。' },
    { label: '证明策略', script: '仍然用两条包含：先从 A 中任取元素推出它在 B 中，再从 B 中任取元素推出它在 A 中。' },
    { label: 'A 到 B', script: '若 n∈A，则存在整数 k 使 n=4k+1。把它改写成 4(k+1)-3，因为 k+1 仍是整数，所以 n∈B。' },
    { label: '第一条收束', script: '所以 A⊆B。这里的见证从 k 变成 k+1，这是构造式证明常见动作。' },
    { label: 'B 到 A', script: '反过来，若 n∈B，则 n=4k-3=4(k-1)+1。因为 k-1 仍是整数，所以 n∈A，得到 B⊆A。' },
    { label: '结论', script: '两条包含都成立，故 A=B。存在量词允许我们重新命名或改造见证。' },
  ]),
);

pages.push(
  page('命题与谓词：真假什么时候确定', '概念分类页', 'predicate', [
    { label: '命题', script: '命题是能明确判定真或假的句子。它可以是真的，也可以是假的，但真假必须确定。' },
    { label: '谓词', script: '谓词含有自由变量，变量还没给值时真假没有确定。' },
    { label: '代入成命题', script: '把具体值代入谓词后，句子就变成命题，例如 P(2) 和 P(1) 都可以判真假。' },
    { label: '既不是', script: '命令和问题通常既不是命题也不是谓词，因为它们不能评价真或假。' },
    { label: '量词预告', script: '量词也可以封闭变量。全称和存在命题一旦封闭变量，就可以讨论真假与证明。' },
    { label: '带走一句', script: '证明前先问句子有没有自由变量；否则真假还没固定。' },
  ]),
);

pages.push(
  page('逻辑连接词：且、或、非', '逻辑计算页', 'logic', [
    { label: '且', script: 'P 且 Q 只有在 P 和 Q 都真时才真，其余情况都是假。' },
    { label: '或', script: '数学中的“或”是包含式或：至少一个为真就真，两个都真也为真。' },
    { label: '非', script: '非 P 会把真假反过来：P 真时非 P 假，P 假时非 P 真。' },
    { label: '真值表', script: '真值表把所有可能情况列出来。复杂命题的真假，就是逐行按规则计算。' },
    { label: '谓词例子', script: '用偶数和质数谓词代入具体数字后，就可以计算组合命题的真假。' },
    { label: '带走一句', script: '复杂命题不要凭感觉判断，要靠连接词规则逐行计算。' },
  ]),
);

pages.push(
  page('德摩根律：用真值表证明', '完整证明加总结页', 'deMorgan', [
    { label: '命题', script: '最后用真值表证明德摩根律：非 P 且 Q，等价于非 P 或非 Q。准确写法是 ¬(P∧Q) 等价于 ¬P∨¬Q。' },
    { label: '方法', script: '证明逻辑等价的方法，是列出 P 和 Q 的四种取值情况，并逐列计算两边真假。' },
    { label: '真值表', script: '表格中间列计算 ¬(P∧Q)，右边列计算 ¬P∨¬Q。每一行都必须算出来。' },
    { label: '比较两列', script: '关键观察是两列结果完全相同，都是 F, T, T, T。' },
    { label: '证明结论', script: '因为所有可能情形下真假相同，所以两个命题逻辑等价。证毕。' },
    { label: '本节总结', script: '本节带走四件事：定义先展开；证明要任取或构造；集合等式走两条包含；逻辑等价看所有情形。' },
  ]),
);

function parseHex(hex) {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

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

function drawMarkers(data, info, page) {
  const { channels } = info;
  const out = Buffer.from(data);
  const rawOffset = (x, y) => (y * IMAGE_WIDTH + x) * channels;
  const drawn = [];

  for (const component of page.components) {
    const color = COLOR_BY_NAME.get(component.color);
    const [r, g, b] = color.rgb;
    for (const marker of markerRectsForBox(component.box)) {
      const x0 = Math.max(0, Math.min(IMAGE_WIDTH - MARKER_SIZE, marker.x));
      const y0 = Math.max(0, Math.min(IMAGE_HEIGHT - MARKER_SIZE, marker.y));
      for (let y = y0; y < y0 + MARKER_SIZE; y += 1) {
        for (let x = x0; x < x0 + MARKER_SIZE; x += 1) {
          const offset = rawOffset(x, y);
          out[offset] = r;
          out[offset + 1] = g;
          out[offset + 2] = b;
          if (channels > 3) out[offset + 3] = 255;
        }
      }
      drawn.push({ ...marker, x: x0, y: y0, color: component.color, componentId: component.id });
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

function recoveryComponent(component) {
  const [x0, y0, x1, y1] = component.box;
  const color = COLOR_BY_NAME.get(component.color);
  return {
    componentId: component.id,
    label: component.label,
    markerColorHex: color.hex,
    markerCount: 4,
    bbox: [x0, y0, x1, y1],
    markerPoints: [
      { x: x0 + MARKER_SIZE / 2, y: y0 + MARKER_SIZE / 2, corner: 'top-left' },
      { x: x1 - MARKER_SIZE / 2, y: y0 + MARKER_SIZE / 2, corner: 'top-right' },
      { x: x0 + MARKER_SIZE / 2, y: y1 - MARKER_SIZE / 2, corner: 'bottom-left' },
      { x: x1 - MARKER_SIZE / 2, y: y1 - MARKER_SIZE / 2, corner: 'bottom-right' },
    ],
  };
}

function focusShape(component) {
  const [x0, y0, x1, y1] = component.box;
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
      id: 'hand-drawn-chinese-proof-notebook-marker-v4',
      label: '中文手写 proof-first 证明课笔记',
      styleBrief: {
        preset: 'hand-drawn-course-notebook',
        background: 'white graph-paper notebook background with faint light-gray grid',
        colorMood: 'black marker text, deep teal formulas, pale teal fills, muted brown arrows',
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
        bbox: component.box,
      };
    }),
    markerProtocol: {
      type: 'corner-square-markers-normalized-after-imagegen-validation',
      componentCount: 6,
      markerCountPerComponent: 4,
      totalMarkerCount: 24,
      markerSizePx: MARKER_SIZE,
      blankBackgroundPaddingPx: 30,
      colorPool: COLORS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: COLORS.map(({ hex }) => hex),
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

  const sourceUrl = `/generated-notebooks/mat102-sets-propositions-v4/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-sets-propositions-v4/recovered/page-${pageNo}-clean.png`;
  const sourceMarks = await countRemainingMarkerMarks(sourceOut);
  const cleanMarks = await countRemainingMarkerMarks(cleanOut);
  const markerCountsByColor = sourceMarks.componentCounts;
  const status =
    Object.values(markerCountsByColor).every((count) => count === 4) &&
    Object.values(cleanMarks.componentCounts).every((count) => count === 0)
      ? 'passed'
      : 'needs-review';

  const recoveryComponents = page.components.map(recoveryComponent);
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
        select: { id: true, ownerId: true, name: true, courseCode: true },
      });
      if (!course) throw new Error(`Target MAT102 course not found: ${COURSE_ID}`);

      await tx.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：从集合定义、构造式、集合运算，到子集、集合相等、真值表证明。每页含可恢复角标源图、去角标 clean 图、区域聚焦讲解稿。',
          tags: ['MAT102', '集合', '命题逻辑', '证明', '中文', 'proof-first', '角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-marker-recovery-v4',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：从集合定义、构造式、集合运算，到子集、集合相等、真值表证明。每页含可恢复角标源图、去角标 clean 图、区域聚焦讲解稿。',
          tags: ['MAT102', '集合', '命题逻辑', '证明', '中文', 'proof-first', '角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-marker-recovery-v4',
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

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
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
      pages.map((page, pageIndex) => ({
        page: pageIndex + 1,
        title: page.title,
        role: page.role,
        regions: page.components.map((component) => ({
          id: component.id,
          label: component.label,
          markerColor: COLOR_BY_NAME.get(component.color).hex,
          bbox: component.box,
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

  await buildContactSheet(SOURCE_DIR, 'contact-sheet-source.png', 'source');
  await buildContactSheet(RECOVERED_DIR, 'contact-sheet-clean.png', 'clean');
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
