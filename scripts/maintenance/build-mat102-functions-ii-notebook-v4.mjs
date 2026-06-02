#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-functions-ii-v4');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-functions-ii-cardinality-proof-v2';
const NOTEBOOK_NAME = '函数 II：逆函数、双射与无限大小（proof-first 版）';

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const MARKER_SIZE = 16;

const COLORS = [
  { name: 'red', hex: '#ff0000', test: (p) => p.r > 190 && p.g < 120 && p.b < 120 },
  { name: 'lime', hex: '#00ff00', test: (p) => p.g > 190 && p.r < 120 && p.b < 120 },
  { name: 'blue', hex: '#0048ff', test: (p) => p.b > 175 && p.r < 120 && p.g < 150 },
  { name: 'cyan', hex: '#00ffff', test: (p) => p.g > 175 && p.b > 175 && p.r < 135 },
  { name: 'magenta', hex: '#ff00ff', test: (p) => p.r > 175 && p.b > 175 && p.g < 135 },
  { name: 'yellow', hex: '#ffff00', test: (p) => p.r > 185 && p.g > 185 && p.b < 145 },
];

const COLOR_BY_NAME = new Map(COLORS.map((color) => [color.name, color]));
const COLOR_ORDER = COLORS.map((color) => color.name);

const selectedSources = [
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1caf5e21e8819aa9bb6edd53d8d6f0.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb608d678819aab43369c19af9843.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1caffabba4819aa9e4196560fcefb9.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb048cedc819a99d49f7a17bf664e.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb0e445c4819a8f7cfb52bdf98050.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb1318470819a8b13f60f6d27715b.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb18b4554819aafc16d67aaa60066.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb1d409b0819ab479b4848e9d06ba.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb9ad2228819a870bb27a221f6357.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb9fa00fc819a860106927e9dea03.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cba34b8b0819ab115b562da9d3dc3.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cba7a1970819a84f12d87d55a3a59.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb7971134819a9012f11108edf7d8.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cb7dd6564819a82da88432794d064.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cbd0bff8c819ab9db4c1765d2a75d.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cbacebcb0819a86312394f350f803.png',
];

function region(label, script) {
  return { label, script };
}

const pages = [
  {
    title: '用函数测量集合大小',
    role: '介绍页',
    regions: [
      region('本页目标', '这一页先建立本节主问题：无限集合不能靠直觉数大小，而要看能不能构造单射、满射或双射。'),
      region('有限直觉', '有限集合时，大小比较就是数元素个数，例如三个元素当然不超过五个元素。'),
      region('无限挑战', '进入无限集合后，真子集也可能和原集合一样大；自然数和偶自然数就是本节第一个反直觉例子。'),
      region('三种工具', '单射表示不重，满射表示不漏，双射表示恰好一一对应。后面的大小比较都围绕这三种函数。'),
      region('本节路线', '这节课会从逆函数和双射开始，进入基数、可数性、互相嵌入、对角线法和幂集定理。'),
      region('带走一句', '比较集合大小不是看图像密不密，而是看能否构造合适的函数。'),
    ],
  },
  {
    title: '逆元直觉：先找恒等元素',
    role: '概念引入页',
    regions: [
      region('标题问题', '逆元的核心不是神秘符号，而是撤回一个动作；要先知道这个运算下什么叫做没有改变。'),
      region('加法例子', '加法的恒等元是零，因为 x 加零仍是 x。二的加法逆元是负二，因为二加负二回到零。'),
      region('乘法例子', '乘法的恒等元是一。二的乘法逆元是二分之一，但零没有乘法逆元。'),
      region('抽象模板', '一般地，如果运算的恒等元是 e，那么 y 是 x 的逆元，要满足两个方向相乘都回到 e。'),
      region('函数类比', '函数复合的恒等映射是 id_A，它把每个元素送回自己。逆函数就是复合意义下的逆元。'),
      region('底部总结', '函数的逆函数要把元素送回原处：先做一个函数，再做另一个函数，结果等于恒等映射。'),
    ],
  },
  {
    title: '逆函数的正式定义',
    role: '定义页',
    regions: [
      region('定义入口', '设 f 从 S 到 T。如果存在 g 从 T 回到 S，能把 f 的作用双向撤回，就称 g 是 f 的逆函数。'),
      region('两个恒等映射', '因为定义域和陪域不同，我们需要两个恒等映射：id_S 作用在 S 上，id_T 作用在 T 上。'),
      region('第一条复合', '等式 f∘g=id_T 表示：从 T 出发，先用 g 回 S，再用 f 回 T，最后得到原来的 t。'),
      region('第二条复合', '等式 g∘f=id_S 表示：从 S 出发，先用 f 到 T，再用 g 回 S，最后得到原来的 s。'),
      region('双向图像', '图像上要检查两条回路都回到原点；只满足其中一条还不是真正的逆函数。'),
      region('底部提醒', '真正的逆函数是双边撤回，不是只会从一个方向撤回。'),
    ],
  },
  {
    title: '可逆推出双射：必要性证明',
    role: '完整证明页',
    regions: [
      region('命题', '已知 f 有逆函数 g，要证明 f 是双射。我们会分别证明满射和单射。'),
      region('证满射目标', '证明满射时，任取一个目标元素 t，任务是找到一个 s 使 f(s)=t。'),
      region('构造满射见证', '由于有逆函数，可以取 s=g(t)。再用 f∘g=id_T，得到 f(g(t))=t。'),
      region('证单射起点', '证明单射时，任取 s1 和 s2，并从假设 f(s1)=f(s2) 出发。'),
      region('用左逆推出相等', '对等式两边作用 g，再用 g∘f=id_S，就得到 s1=s2。'),
      region('结论', 'f 同时满射和单射，所以 f 双射。两条逆函数等式分别控制不漏和不重。'),
    ],
  },
  {
    title: '双射推出可逆：构造逆函数',
    role: '完整证明页',
    regions: [
      region('命题', '现在反过来：若 f 是双射，我们要构造一个从 T 到 S 的逆函数 g。'),
      region('满射给存在', '任取 t 属于 T。由满射，至少存在一个 s 属于 S，使 f(s)=t。'),
      region('单射给唯一', '若两个元素都映到 t，由单射它们必须相等，所以这个 s 是唯一的。'),
      region('定义 g', '因此可以定义 g(t) 为这个唯一的 s。存在加唯一保证 g 是良定义的函数。'),
      region('验证 f∘g', '对任意 t，g(t) 是映到 t 的那个 s，因此 f(g(t))=t。'),
      region('验证 g∘f', '对任意 s，f(s) 的唯一原像就是 s，因此 g(f(s))=s，故 g 是逆函数。'),
    ],
  },
  {
    title: '基数：用单射定义 |S|≤|T|',
    role: '定义页',
    regions: [
      region('定义', '我们定义 |S|≤|T|，意思是存在一个从 S 到 T 的单射。'),
      region('有限例子', '有限集合中，三个元素可以不重复地放入四个位置，所以大小比较符合普通直觉。'),
      region('为什么用单射', '单射保证不同输入不会撞到同一个输出，因此 S 的元素都能被 T 分开容纳。'),
      region('无限例子', '自然数可以嵌入整数中，所以 |N|≤|Z|。无限集合也用同一种函数语言比较。'),
      region('注意记号', '这里的≤是定义出来的比较方式，不是先把无限集合数完再比较。'),
      region('底部证明模板', '要证明 |S|≤|T|，就构造 f:S→T，并证明 f 是单射。'),
    ],
  },
  {
    title: '有限集合检查：单射等价于 n≤m',
    role: '证明页',
    regions: [
      region('命题', '若 S 有 n 个元素，T 有 m 个元素，则 |S|≤|T| 当且仅当 n≤m。'),
      region('方向一', '若 n≤m，可以把第 i 个 s_i 送到第 i 个 t_i。这个函数显然不会撞车。'),
      region('证明单射', '如果 f(s_i)=f(s_j)，那么 t_i=t_j，于是 i=j，最后得到 s_i=s_j。'),
      region('方向二策略', '反过来若 n>m，要说明不可能存在从 S 到 T 的单射。'),
      region('鸽巢原理', 'n 个输入放进 m 个输出位置且 n>m，至少两个输入会落到同一输出。'),
      region('结论', '有限情况下，这个基数定义确实回到普通大小比较。'),
    ],
  },
  {
    title: '满射也能比较大小',
    role: '证明页',
    regions: [
      region('命题', '若 S 和 T 非空，且 f:S→T 是满射，则 |T|≤|S|。'),
      region('满射给右逆', '对每个 t 属于 T，由满射选一个 s_t 属于 S，使 f(s_t)=t。'),
      region('验证右逆', '定义 g(t)=s_t 后，就有 f(g(t))=t，也就是 f∘g=id_T。'),
      region('证明 g 单射', '若 g(t1)=g(t2)，对两边作用 f，得到 t1=t2。'),
      region('得到基数比较', '因此 g:T→S 是单射，所以 |T|≤|S|。'),
      region('底部提醒', '满射 S→T 表示 S 至少够多，能覆盖所有 T；反向选择得到 T→S 的单射。'),
    ],
  },
  {
    title: '自然数与偶自然数一样多',
    role: '完整证明页',
    regions: [
      region('目标', '目标是证明自然数和偶自然数集合有相同基数。'),
      region('包含方向', '因为偶自然数是自然数的子集，所以先得到 |2N|≤|N|。'),
      region('构造函数', '反方向构造 f:N→2N，定义 f(n)=2n，把每个自然数翻倍。'),
      region('单射证明', '如果 f(n)=f(m)，就是 2n=2m，两边除以二得到 n=m。'),
      region('满射证明', '任取偶自然数 k，它可写成 2m，因此 f(m)=k。'),
      region('结论', 'f 是双射，所以 |N|=|2N|。无限集合可以和真子集一样大。'),
    ],
  },
  {
    title: '互相嵌入推出一样大',
    role: '定理应用页',
    regions: [
      region('定理', '如果存在 A 到 B 的单射，也存在 B 到 A 的单射，那么 A 和 B 有相同基数。'),
      region('直觉', '两边都能无碰撞地放进对方，这个定理保证可以整理出真正的一一对应。'),
      region('使用步骤', '应用时先构造 A 到 B 的单射，再构造 B 到 A 的单射，最后调用定理。'),
      region('例题', '我们用它证明开区间 (0,1) 与闭区间 [0,1] 一样大。'),
      region('两个函数', '包含映射给出一个方向；线性函数 (1+2t)/4 把闭区间嵌入开区间。'),
      region('结论', '两个方向都有单射，所以两个区间一样大。'),
    ],
  },
  {
    title: '可数并：把许多列表排成一个列表',
    role: '证明思路页',
    regions: [
      region('定义', '集合可数，意思是它能够单射进入自然数。'),
      region('排队直觉', '如果元素可以排成 s1,s2,s3 这样的队列，就说明它可数。'),
      region('定理目标', '若 A1,A2,A3 等等每个都可数，那么它们的并仍然可数。'),
      region('二维列表', '把每个 A_i 放成一行，再沿对角线依次扫描二维表格。'),
      region('编号方法', '一个元素在第 i 行第 j 个位置，就先记成 (i,j)，再把这个有序对编码进 N。'),
      region('结论', '关键是编号不撞车；于是这个并集仍可数。'),
    ],
  },
  {
    title: '整数可数：把 Z 排成一列',
    role: '完整证明页',
    regions: [
      region('目标', '证明整数和自然数一样多。包含 N⊆Z 先给出 |N|≤|Z|。'),
      region('反向任务', '还需要构造从 Z 到 N 的单射，来证明 |Z|≤|N|。'),
      region('排队直觉', '把整数排成 0,1,-1,2,-2,3,-3 这样的顺序。'),
      region('显式定义', '也可以写出函数：零单独处理，正整数送到偶数，负整数送到奇数。'),
      region('单射证明', '正数、负数、零三类落在不同区域，类内也不会相撞，所以函数单射。'),
      region('结论', '两边都有单射，因此 |Z|=|N|；加入负数没有让集合变得更大。'),
    ],
  },
  {
    title: '有理数可数：最简分数编码',
    role: '完整证明页',
    regions: [
      region('目标', '证明有理数和自然数一样多。因为 N 包含在 Q 中，先有 |N|≤|Q|。'),
      region('标准形式', '每个有理数都能唯一写成最简分数 p/r，其中 r 为正且分子分母互素。'),
      region('定义编码', '把这个最简分数编码成有序对 (p,r)，也就是整数和正整数的一个点。'),
      region('证明单射', '如果两个编码相同，则分子分母相同，所以两个有理数相同。'),
      region('目标可数', '整数可数，正整数可数，所以整数乘正整数也可数，可以用斜线枚举。'),
      region('结论', 'Q 可单射进可数集合，又含 N，所以 |Q|=|N|。稠密不等于不可数。'),
    ],
  },
  {
    title: '实数不可数：对角线证明',
    role: '完整证明页',
    regions: [
      region('证明目标', '我们要证明 [0,1] 不可数。证明它不可数，整个实数集当然也不可数。'),
      region('反设列表', '反设 [0,1] 可数，可以列成 r1,r2,r3 等等，而且这个列表没有遗漏。'),
      region('小数表格', '把每个 r_i 写成小数展开，并观察第 i 个数的第 i 位，形成一条对角线。'),
      region('构造新数', '定义新数 s，让第 i 位刻意不同于 r_i 的第 i 位。'),
      region('不在列表', '于是对每个 i，s 都和 r_i 至少在第 i 位不同，所以 s 不等于任何 r_i。'),
      region('矛盾结论', 's 属于 [0,1]，却不在所谓完整列表中，矛盾。因此 [0,1] 不可数。'),
    ],
  },
  {
    title: '康托定理：幂集总是更大',
    role: '完整证明页',
    regions: [
      region('定理', '对任意集合 S，幂集 P(S) 的基数严格大于 S。'),
      region('先证≤', '先把每个 x 送到单元素集合 {x}，这给出 S 到 P(S) 的单射。'),
      region('反设满射', '为了证明严格大，反设存在一个从 S 到 P(S) 的满射 f。'),
      region('构造对角集合', '定义 D 为所有不属于自己对应子集 f(x) 的元素 x。这个 D 本身是 S 的子集。'),
      region('导出矛盾', '若 f(a)=D，则 a 属于 D 当且仅当 a 不属于 D，立刻矛盾。'),
      region('结论', '所以不存在满射 S 到 P(S)，最终得到 |S|<|P(S)|。'),
    ],
  },
  {
    title: '总结：无限大小证明地图',
    role: '总结页',
    regions: [
      region('基数比较', '证明 |S|≤|T| 的核心动作，是构造从 S 到 T 的单射。证明相等通常要构造双射或互相嵌入。'),
      region('逆函数', '可逆和双射等价，证明时要检查两条复合等式。'),
      region('可数集合', '可数表示能排进自然数；自然数、整数、有理数都一样大。'),
      region('互相嵌入', '两边都有单射时，可以用互相嵌入定理推出一样大。'),
      region('对角线法', '对角线法从“已经列完”的反设出发，构造一个故意不同的新对象。'),
      region('幂集更大', '幂集定理说明不存在满射 S→P(S)，所以 P(S) 永远更大。'),
    ],
  },
];

function markerColorForPixel(data, offset) {
  const p = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
  for (const color of COLORS) {
    if (color.test(p)) return color.name;
  }
  return null;
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
      if (count >= 20 && boxWidth >= 5 && boxWidth <= 64 && boxHeight >= 5 && boxHeight <= 64 && fillRatio >= 0.2) {
        components.push({ color, count, minX, minY, maxX, maxY, boxWidth, boxHeight, fillRatio });
      }
    }
  }
  return components;
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
  for (let y = Math.max(0, y0 - 22); y <= Math.min(height - 1, y1 + 22); y += 1) {
    for (let x = Math.max(0, x0 - 22); x <= Math.min(width - 1, x1 + 22); x += 1) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      const offset = rawOffset(x, y);
      if (markerColorForPixel(data, offset)) continue;
      if (data[offset] > 170 && data[offset + 1] > 170 && data[offset + 2] > 170) {
        samples[0].push(data[offset]);
        samples[1].push(data[offset + 1]);
        samples[2].push(data[offset + 2]);
      }
    }
  }
  return [median(samples[0]), median(samples[1]), median(samples[2])];
}

function cleanMarkerComponents(data, info, components) {
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const rawOffset = (x, y) => (y * width + x) * channels;

  for (const component of components) {
    const pad = 7;
    const x0 = Math.max(0, component.minX - pad);
    const y0 = Math.max(0, component.minY - pad);
    const x1 = Math.min(width - 1, component.maxX + pad);
    const y1 = Math.min(height - 1, component.maxY + pad);
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
  return out;
}

function countsByColor(components) {
  return Object.fromEntries(COLOR_ORDER.map((color) => [color, components.filter((component) => component.color === color).length]));
}

function bboxForMarkers(markers) {
  return [
    Math.min(...markers.map((marker) => marker.minX)),
    Math.min(...markers.map((marker) => marker.minY)),
    Math.max(...markers.map((marker) => marker.maxX)),
    Math.max(...markers.map((marker) => marker.maxY)),
  ];
}

function recoveryComponentsForPage(page, markerComponents) {
  return COLOR_ORDER.map((colorName, index) => {
    const markers = markerComponents.filter((marker) => marker.color === colorName);
    const [x0, y0, x1, y1] = bboxForMarkers(markers);
    const color = COLOR_BY_NAME.get(colorName);
    return {
      componentId: `p${String(pages.indexOf(page) + 1).padStart(2, '0')}-r${index + 1}`,
      label: page.regions[index].label,
      markerColorHex: color.hex,
      markerCount: markers.length,
      bbox: [x0, y0, x1, y1],
      markerPoints: markers.map((marker) => ({
        x: (marker.minX + marker.maxX) / 2,
        y: (marker.minY + marker.maxY) / 2,
      })),
    };
  });
}

function focusShape(component) {
  const [x0, y0, x1, y1] = component.bbox;
  const scaleX = CANVAS_WIDTH / IMAGE_WIDTH;
  const scaleY = CANVAS_HEIGHT / IMAGE_HEIGHT;
  return {
    id: component.componentId,
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

function buildActions(page, recoveryComponents) {
  return recoveryComponents.flatMap((component, index) => [
    {
      id: `${component.componentId}-spotlight`,
      type: 'spotlight',
      title: `聚焦：${component.label}`,
      elementId: component.componentId,
      dimOpacity: 0.62,
    },
    {
      id: `${component.componentId}-speech`,
      type: 'speech',
      title: component.label,
      text: page.regions[index].script,
    },
  ]);
}

function promptPlanForPage(page, recoveryComponents, sourceUrl, rawSourcePath) {
  return {
    schemaVersion: 4,
    canvas: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, aspectRatio: '16:9' },
    styleProfile: {
      id: 'hand-drawn-chinese-cardinality-proof-notebook-native-markers-v4',
      label: '中文手写 proof-first 基数课笔记，原生四角 marker',
      styleBrief: {
        preset: 'hand-drawn-course-notebook',
        background: 'white graph-paper notebook background with faint light-gray grid',
        colorMood: 'black marker text, deep teal formulas and diagrams, pale teal fills, muted brown arrows',
      },
    },
    pageRole: page.role,
    componentPlans: recoveryComponents.map((component, index) => ({
      id: component.componentId,
      label: component.label,
      order: index + 1,
      markerColorHex: component.markerColorHex,
      participatesInMask: true,
      recoveredBbox: component.bbox,
    })),
    markerProtocol: {
      type: 'native-imagegen-corner-square-markers-clean-is-recovered',
      componentCount: 6,
      markerCountPerComponent: 4,
      totalMarkerCount: 24,
      markerSizePx: MARKER_SIZE,
      note: 'Source image already contains markers. Clean image is recovered by removing marker components.',
    },
    compiledImagePrompt: page.title,
    promptHash: crypto.createHash('sha1').update(page.title + page.role).digest('hex'),
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
        remark: `${page.role}：${page.title}`,
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
          ...recoveryComponents.map(focusShape),
        ],
      },
      imageNotebookPromptPlan: promptPlanForPage(page, recoveryComponents, sourceUrl, rawSourcePath),
    },
    actions: buildActions(page, recoveryComponents),
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
  const sourceComponents = detectMarkerComponents(data, info);
  const sourceCounts = countsByColor(sourceComponents);
  await sharp(data, { raw: info }).png().toFile(sourceOut);

  const cleanData = cleanMarkerComponents(data, info, sourceComponents);
  await sharp(cleanData, { raw: info }).png().toFile(cleanOut);
  const { data: cleanRaw, info: cleanInfo } = await sharp(cleanOut)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleanComponents = detectMarkerComponents(cleanRaw, cleanInfo);
  const cleanCounts = countsByColor(cleanComponents);

  const status =
    Object.values(sourceCounts).every((count) => count === 4) && Object.values(cleanCounts).every((count) => count === 0)
      ? 'passed'
      : 'needs-review';

  const sourceUrl = `/generated-notebooks/mat102-functions-ii-v4/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-functions-ii-v4/recovered/page-${pageNo}-clean.png`;
  const recoveryComponents = status === 'passed' ? recoveryComponentsForPage(page, sourceComponents) : [];

  return {
    scene: status === 'passed' ? sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents, sourcePath) : null,
    validation: {
      page: index + 1,
      title: page.title,
      sourcePath,
      sourceUrl,
      cleanUrl,
      markerCountsByColor: sourceCounts,
      cleanMarkerCountsByColor: cleanCounts,
      sourceTotal: sourceComponents.length,
      cleanTotal: cleanComponents.length,
      status,
      markerComponents: sourceComponents,
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
    composites.push({ input: await sharp(files[i]).resize(thumbW, thumbH, { fit: 'fill' }).png().toBuffer(), left: x, top: y });
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
      const course = await tx.course.findFirst({ where: { id: COURSE_ID, ownerId: OWNER_ID }, select: { id: true } });
      if (!course) throw new Error(`Target MAT102 course not found: ${COURSE_ID}`);
      await tx.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：逆函数、双射、基数、可数性、互相嵌入、对角线法与幂集定理。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '逆函数', '双射', '基数', '可数性', '对角线法', '幂集', '证明', '中文', 'proof-first', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：逆函数、双射、基数、可数性、互相嵌入、对角线法与幂集定理。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '逆函数', '双射', '基数', '可数性', '对角线法', '幂集', '证明', '中文', 'proof-first', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
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
  for (const dir of [OUT_DIR, SOURCE_DIR, RECOVERED_DIR, META_DIR]) fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (let index = 0; index < pages.length; index += 1) {
    results.push(await processPage(pages[index], index, selectedSources[index]));
    console.log(`processed ${index + 1}/${pages.length}: ${pages[index].title}`);
  }
  const validations = results.map((result) => result.validation);
  fs.writeFileSync(path.join(META_DIR, 'validations.json'), JSON.stringify(validations, null, 2));
  if (!validations.every((validation) => validation.status === 'passed')) {
    throw new Error(`Marker validation failed: ${JSON.stringify(validations.filter((validation) => validation.status !== 'passed'), null, 2)}`);
  }
  const scenes = results.map((result) => result.scene);
  fs.writeFileSync(path.join(META_DIR, 'scenes.json'), JSON.stringify(scenes, null, 2));
  fs.writeFileSync(
    path.join(META_DIR, 'selected-sources.json'),
    JSON.stringify(selectedSources.map((sourcePath, index) => ({ page: index + 1, title: pages[index].title, sourcePath })), null, 2),
  );
  fs.writeFileSync(
    path.join(META_DIR, 'lecture-script.json'),
    JSON.stringify(
      pages.map((page, index) => ({
        page: index + 1,
        title: page.title,
        role: page.role,
        regions: page.regions.map((regionItem, regionIndex) => ({
          id: `p${String(index + 1).padStart(2, '0')}-r${regionIndex + 1}`,
          label: regionItem.label,
          markerColor: COLOR_BY_NAME.get(COLOR_ORDER[regionIndex]).hex,
          script: regionItem.script,
        })),
      })),
      null,
      2,
    ),
  );
  await buildContactSheet(SOURCE_DIR, 'contact-sheet-source.png', 'source');
  await buildContactSheet(RECOVERED_DIR, 'contact-sheet-clean.png', 'clean');
  await importToDatabase(scenes);
  console.log(`Built ${pages.length} MAT102 Functions II scenes for ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
