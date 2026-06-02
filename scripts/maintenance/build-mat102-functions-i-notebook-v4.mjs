#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-functions-i-v4');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-functions-i-proof-v2';
const NOTEBOOK_NAME = '函数 I：像、原像与单满射（proof-first 版）';

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
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c734e3098819388c2af6697ae1151.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c73adf0948193b6460ea6f1491d71.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6b3c56e081938acf7817520d49ce.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6ba169a48193a3e34f138523c14e.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6c5961c88193bb2304a4d1b4a48c.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c74184f5081938c49e4785fea4a51.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6d1a73e48193bd755a8e341b54d0.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c747d1d3881939e1e223766b739a9.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6e10340881938d1d46e974e24ca7.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1c79501fb8819a8f5829d9ecba36dc.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6ec8a0988193bb81cd42494dfb18.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c7593750c8193ba6d773e61592b94.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c6f8ef6d88193a444d2d7534ad1bb.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_067e327824b52977016a1c75f4405081939d173b4b0decbe51.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1c788267f8819aa171d4c9f6d94dbf.png',
  '/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1c78d0cbfc819ab85770dac232c9cb.png',
];

function region(label, script) {
  return { label, script };
}

const pages = [
  {
    title: '函数：从关系到映射',
    role: '介绍页',
    regions: [
      region('本页目标', '这一页先把函数放回关系的框架里：函数不是只有公式，而是一种满足额外条件的关系。'),
      region('关系回顾', '关系 R 是 A 乘 B 的子集。写 aRb，就等于说有序对 (a,b) 被选进关系。'),
      region('函数条件', '函数要在关系基础上满足左全和函数性：每个输入都有输出，而且输出唯一。'),
      region('常用记号', '常用写法 f:A 到 B 把定义域、陪域和方向同时写出来；图像集合 Γ(f) 则是关系的有序对版本。'),
      region('本讲路线', '本讲接着讲像、原像、单射、满射、双射，这些都要回到量词定义。'),
      region('带走一句', '判断函数题先看定义域和陪域，再谈公式、像、原像、单射和满射。'),
    ],
  },
  {
    title: '函数的正式定义：左全 + 函数性',
    role: '定义页',
    regions: [
      region('定义入口', '正式定义从关系开始：一个函数先是 A 到 B 的关系，也就是 A 乘 B 中的有序对子集。'),
      region('左全', '左全说每个定义域元素都至少有一个输出。证明或检查时，主角是任意 a 属于 A。'),
      region('函数性', '函数性说同一个输入不能对应两个不同输出。如果两个输出都和 a 配对，那它们必须相等。'),
      region('合法图', '合法函数图里，每个 A 中元素都有且只有一支箭头射出。'),
      region('非函数图', '两个典型失败：有输入没有箭头，或者一个输入有两支箭头。前者缺左全，后者缺函数性。'),
      region('底部检查', '检查是不是函数：先看每个输入有没有输出，再看输出是否唯一。'),
    ],
  },
  {
    title: 'f:A→B 里藏着哪些数据',
    role: '定义翻译页',
    regions: [
      region('函数记号', 'f:A 到 B 不只是装饰，它告诉我们定义域是 A，陪域是 B。'),
      region('输入输出', '当 a 属于 A 时，f(a) 必须属于 B。a 映到 f(a) 表示对应规则。'),
      region('图像集合', 'Γ(f) 等于所有 (a,f(a)) 组成的集合，它正是函数作为关系时的有序对集合。'),
      region('陪域不是值域', '陪域 B 是输出被允许居住的集合；值域是实际被打中的那部分。'),
      region('函数相等预告', '比较函数是否相等，要比较定义域、陪域，以及每个输入的输出。'),
      region('底部问题', '只看公式通常不够，因为同一个公式换定义域或陪域，可能就是不同函数。'),
    ],
  },
  {
    title: '函数相等：不只看公式',
    role: '例题页',
    regions: [
      region('相等标准', '两个函数相等，需要同定义域、同陪域，并且每个输入的函数值都相同。'),
      region('例一', 'f 和 g 的定义域都是 {0,1}，陪域都是实数，公式分别是 x 和 x 平方。'),
      region('验证相等', '在 {0,1} 上，0 的平方等于 0，1 的平方等于 1，所以每个输入的输出都相同。'),
      region('例二', 'h 的公式也像 x，但陪域是 {0,1}，不是实数。'),
      region('结论判断', '因此 f 和 g 相等；但 f 和 h 作为函数不相等，因为陪域数据不同。'),
      region('底部提醒', '函数不是只有公式，定义域和陪域也是函数的数据。'),
    ],
  },
  {
    title: '像集：把一块定义域送到哪里',
    role: '定义页',
    regions: [
      region('定义', '若 U 是 A 的子集，f(U) 是所有由 U 中元素送出去得到的输出。'),
      region('简写', 'f(U) 也可以写成 {f(x): x 属于 U}。这个写法强调逐点送出去。'),
      region('图像直觉', '图中 U 是定义域里的一块，f(U) 是它在陪域中实际打到的一块。'),
      region('属于翻译', 'y 属于 f(U)，等价于存在一个见证 x 属于 U，使得 f(x)=y。'),
      region('常见误区', 'f(U) 是 B 的子集，不是一个单独的数；f(x) 才是单个输入的输出。'),
      region('底部问题', '证明 y 属于像集时，关键是能不能指出产生 y 的见证 x。'),
    ],
  },
  {
    title: '完整证明：f([-1,2])=[0,4]',
    role: '完整证明页',
    regions: [
      region('题目', '这里 f(x)=x 平方，目标是证明区间 [-1,2] 的像正好是 [0,4]。'),
      region('先证 [0,4] 包含于像', '任取 y 属于 [0,4]，构造 x 等于根号 y。因为 y 非负，根号 y 存在且落在 [0,2]。'),
      region('得到 y 在像中', '这个构造满足 f(x)=x 平方等于 y，所以 y 确实在 f([-1,2]) 中。'),
      region('再证像包含于 [0,4]', '反过来，任取 y 属于像集，就存在 x 属于 [-1,2] 使 y=x 平方。'),
      region('估计范围', '由 -1 小于等于 x 小于等于 2，可推出 0 小于等于 x 平方小于等于 4，所以 y 属于 [0,4]。'),
      region('结论', '两边包含都成立，因此 f([-1,2])=[0,4]。像集相等常常靠双向包含。'),
    ],
  },
  {
    title: '原像：不需要反函数',
    role: '定义页',
    regions: [
      region('定义', '若 V 是 B 的子集，f 的原像 f⁻¹(V) 是所有输出落在 V 里的输入。'),
      region('关键提醒', '这里的 f⁻¹(V) 是集合原像符号，不要求 f 真的存在反函数。'),
      region('投影函数', '投影 p:R³ 到 R²，规则是把 (x,y,z) 送到 (x,y)。'),
      region('目标集合', 'D 是平面中的单位圆盘，由条件 x²+y²≤1 描述。'),
      region('原像结果', 'p⁻¹(D) 是所有投影落进圆盘的三维点，也就是竖直圆柱。'),
      region('底部翻译', '一个点在原像中，当且仅当它的输出落在目标集合里。'),
    ],
  },
  {
    title: '完整证明：投影原像是圆柱',
    role: '完整证明页',
    regions: [
      region('命题', '设 p(x,y,z)=(x,y)，D 是单位圆盘。我们要证明 p 的原像等于圆柱 C。'),
      region('定义 C', 'C 由 x²+y²≤1 描述，z 没有限制。这个条件正对应圆柱。'),
      region('证明 C 包含于原像', '取 c=(x0,y0,z0) 属于 C，则 x0²+y0²≤1。'),
      region('推入 D', 'p(c)=(x0,y0)，并且满足 D 的定义，所以 p(c) 属于 D，故 c 属于原像。'),
      region('证明原像包含于 C', '若 (x0,y0,z0) 属于原像，则它的投影 (x0,y0) 属于 D，所以 x0²+y0²≤1。'),
      region('结论', '于是该点属于 C，两边包含完成，原像相等得到证明。'),
    ],
  },
  {
    title: '单射：输出相等迫使输入相等',
    role: '定义模板页',
    regions: [
      region('定义', '单射的定义是：如果两个输入的输出相等，那么这两个输入本身必须相等。'),
      region('图像直觉', '从箭头图看，陪域中每个元素最多只能被一支箭头射入。'),
      region('证明模板', '证明单射时，任取 s1 和 s2，假设 f(s1)=f(s2)，目标是推出 s1=s2。'),
      region('反驳模板', '反驳单射只要找两个不同输入，却有相同输出。'),
      region('关键词', '单射可以读成“至多一个原像”，也可以读成“输出相等迫使输入相等”。'),
      region('底部提醒', '证明单射不要从 s1=s2 开始；要从 f(s1)=f(s2) 开始。'),
    ],
  },
  {
    title: '单射例题：正半轴上的平方函数',
    role: '完整证明页',
    regions: [
      region('函数', '函数 h 定义在正半轴上，规则是 h(x)=x²。我们判断它是否单射。'),
      region('单射证明开头', '任取两个正数 x1 和 x2，并假设它们的输出相等，即 x1²=x2²。'),
      region('解方程', '由 x1²=x2² 得到 x1=±x2；但两者都为正，所以只能 x1=x2。'),
      region('结论', '这正是单射定义要求的结论，因此 h 在正半轴上单射。'),
      region('对比反例', '如果定义域换成全体实数，则 1 和 -1 不同，但平方相等，所以不再单射。'),
      region('带走一句', '单射依赖定义域；同一公式换定义域，性质可能改变。'),
    ],
  },
  {
    title: '复合保持单射：完整证明',
    role: '完整证明页',
    regions: [
      region('命题', '若 g:A 到 B 和 f:B 到 C 都单射，则复合 f∘g 也是单射。'),
      region('单射目标', '要证明复合单射，就从 (f∘g)(x)=(f∘g)(y) 出发，目标推出 x=y。'),
      region('展开复合', '把复合展开，得到 f(g(x))=f(g(y))。'),
      region('用 f 单射', '因为 f 单射，外层输出相等迫使内层输入相等，所以 g(x)=g(y)。'),
      region('用 g 单射', '再用 g 单射，由 g(x)=g(y) 推出 x=y。'),
      region('结论', '因此 f∘g 单射。证明顺序是先剥外层 f，再剥内层 g。'),
    ],
  },
  {
    title: '满射：每个目标都被打中',
    role: '定义模板页',
    regions: [
      region('定义', '满射说：对每个目标元素 t，都存在一个输入 s，使 f(s)=t。'),
      region('图像直觉', '从箭头图看，陪域里的每个元素至少要有一支箭头射入。'),
      region('证明模板', '证明满射时，任取目标 t，然后构造输入 s，并验证 f(s)=t。'),
      region('反驳模板', '反驳满射时，只需找一个目标元素，证明没有任何输入能打到它。'),
      region('和单射对比', '单射强调至多一个原像；满射强调至少一个原像。'),
      region('底部提醒', '满射证明的主角是目标元素 t，而不是一开始随便取输入。'),
    ],
  },
  {
    title: '满射例题：平方函数打不中负数',
    role: '反例证明页',
    regions: [
      region('函数与目标', '函数 h 从正半轴到实数，规则是 x 平方。我们判断它是否满射。'),
      region('找未命中目标', '取目标 t=-1，它属于陪域 R。如果 h 满射，应有正数 x 使 x²=-1。'),
      region('性质事实', '但对任意正数 x，x² 都大于 0，不可能等于 -1。'),
      region('矛盾', '所以不存在 x 属于正半轴使 h(x)=-1，故 h 不是满射。'),
      region('图像直观', '图像上平方函数只在 y 大于等于 0 的区域，负数目标在下方，打不中。'),
      region('带走一句', '反驳满射，只需要找到一个陪域元素没有原像。'),
    ],
  },
  {
    title: '复合保持满射：完整证明',
    role: '完整证明页',
    regions: [
      region('命题', '若 g:A 到 B 和 f:B 到 C 都满射，则复合 f∘g 也是满射。'),
      region('满射目标', '任取 c 属于 C。要证明满射，需要找 a 属于 A，使 f(g(a))=c。'),
      region('用 f 满射', '因为 f 满射，存在 b 属于 B，使 f(b)=c。'),
      region('用 g 满射', '因为 g 满射，存在 a 属于 A，使 g(a)=b。'),
      region('验证', '于是 f(g(a))=f(b)=c，这个 a 就是 c 的原像见证。'),
      region('结论', '所以 f∘g 满射。证明顺序是从最终目标 c 往前追原像。'),
    ],
  },
  {
    title: '双射：每个目标恰好一个原像',
    role: '综合页',
    regions: [
      region('定义', '双射就是同时单射和满射。'),
      region('图像直觉', '每个目标元素恰好被一支箭头射入，既不会漏，也不会重。'),
      region('单射贡献', '单射提供“至多一个原像”，排除多个输入撞到同一个输出。'),
      region('满射贡献', '满射提供“至少一个原像”，保证每个目标都被打中。'),
      region('复合结论', '单射复合保持，满射复合保持，因此双射的复合也保持。'),
      region('底部总结', '判断函数性质：先看定义域、陪域，再按量词证明或找反例。'),
    ],
  },
  {
    title: '总结：函数证明先看数据',
    role: '总结页',
    regions: [
      region('函数数据', '函数由三件事决定：定义域、陪域、对应规则。'),
      region('像集', '证明 y 属于 f(U)，要找 x 属于 U，使 f(x)=y。'),
      region('原像', '证明 x 属于 f⁻¹(V)，要验证 f(x) 属于 V。'),
      region('单射', '证明单射从 f(x1)=f(x2) 出发；反例是不同输入有同一输出。'),
      region('满射', '证明满射要任取目标并构造原像；反例是某个目标没有原像。'),
      region('最后问题', '同一个公式换定义域或陪域，单射和满射会不会改变？这是函数题的常见陷阱。'),
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
      id: 'hand-drawn-chinese-functions-proof-notebook-native-markers-v4',
      label: '中文手写 proof-first 函数课笔记，原生四角 marker',
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

  const sourceUrl = `/generated-notebooks/mat102-functions-i-v4/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-functions-i-v4/recovered/page-${pageNo}-clean.png`;
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
            'MAT102 proof-first 中文手写笔记本：函数正式定义、像与原像、单射、满射、双射与复合保持性质。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '函数', '像集', '原像', '单射', '满射', '双射', '证明', '中文', 'proof-first', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：函数正式定义、像与原像、单射、满射、双射与复合保持性质。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '函数', '像集', '原像', '单射', '满射', '双射', '证明', '中文', 'proof-first', '原生角标恢复'],
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
  console.log(`Built ${pages.length} MAT102 Functions I scenes for ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
