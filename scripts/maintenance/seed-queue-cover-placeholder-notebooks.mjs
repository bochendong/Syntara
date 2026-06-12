#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const ROOT = process.cwd();
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const MAT102_COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const MAT136_COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const CANVAS = { width: 1600, height: 900 };
const SLIDE = { width: 1000, height: 562.5 };

const notebooks = [
  {
    id: 'queue-mat102-11grouptheory-2',
    courseId: MAT102_COURSE_ID,
    courseCode: 'MAT102',
    lectureNo: '10',
    name: '10 - 群论 I：群、子群与循环群',
    shortTitle: '群论 I',
    subtitle: '群、子群与循环群',
    sourcePdf: 'queue/MAT102/11GroupTheory-2.pdf',
    pageCount: 9,
    tags: ['MAT102', '群论', '子群', '循环群', '证明', '中文', '封面占位'],
    style: 'queue-cover-placeholder-proof-memory',
    accent: {
      primary: '#0f766e',
      secondary: '#7f1d1d',
      warm: '#b45309',
      ink: '#111827',
    },
    coverBullets: [
      '从“集合 + 运算”进入群的三个公理',
      '用同一套证明动作检查例子、子群和循环群',
      '后续全量生成时展开 9 页老师步骤',
    ],
    memoryTitle: 'MAT102 群论 I 公共记忆',
    memoryText: [
      '核心知识：这一讲把前面学过的集合、函数、关系与数论语言集中到群论。群是一个集合配一个二元运算，并满足结合律、单位元、逆元三个公理；交换律不是群公理，而是阿贝尔群的额外条件。常见例子包括整数模 n 的加法群、非零有理数乘法群、对称群和二面体群。',
      '证明格式：检查一个结构是群时，按老师原始课件的顺序写：先说明对象和运算，再证明结合律、找单位元、给每个元素构造逆元，最后明确结论。证明子群时优先使用子群判别法：先说明 H 非空且 H 包含在 G 中，再取任意 a,b 属于 H，证明 ab^{-1} 仍在 H，最后得出 H 是 G 的子群。',
      '关键步骤：处理二面体群时要把元素看成旋转和反射的复合，非交换通常用 sr 与 rs 的不同来展示。处理元素阶时，先写 |g| 的定义，再用带余除法证明 g^k=e 当且仅当 |g| 整除 k。处理循环群时，把生成元产生的所有整数次幂写成集合，再用 subgroup test 证明生成的集合确实是子群。',
      '易错点：不要把闭合性忘在“二元运算 on G”之外；不要把加法群里的 a^n 直译成乘法记号，要说明加法情形对应重复相加。证明子群必须使用同一个群运算，不能把一个集合在另一个运算下成群误认为它是原群的子群。',
    ].join('\n\n'),
  },
  {
    id: 'queue-mat102-12grouptheoryii',
    courseId: MAT102_COURSE_ID,
    courseCode: 'MAT102',
    lectureNo: '11',
    name: '11 - 群论 II：同态、核与同构',
    shortTitle: '群论 II',
    subtitle: '同态、核与同构',
    sourcePdf: 'queue/MAT102/12GroupTheoryII.pdf',
    pageCount: 6,
    tags: ['MAT102', '群同态', '核', '像', '同构', '证明', '中文', '封面占位'],
    style: 'queue-cover-placeholder-proof-memory',
    accent: {
      primary: '#155e75',
      secondary: '#7c2d12',
      warm: '#a16207',
      ink: '#111827',
    },
    coverBullets: [
      '把“函数”升级成保留群运算的结构映射',
      '先检查代表元一致，再检查同态性质',
      '用核、像和双射判断两个群是否同构',
    ],
    memoryTitle: 'MAT102 群论 II 公共记忆',
    memoryText: [
      '核心知识：群同态是保留运算结构的函数，形式是 phi(xy)=phi(x)phi(y)，但定义域和陪域里的运算可能不同。核是映到陪域单位元的所有元素，像是所有输出；同构是双射同态，用来表达两个群只是元素名字不同、结构相同。',
      '证明格式：对于模剩余类上的函数，老师步骤是先证明代表元一致，也就是代表元换了以后输出不变；然后再证明运算保持。求核和像时，先明确单位元，再用方程或表格列出满足条件的元素，最后把集合写完整。证明同构时必须同时证明同态和双射。',
      '常用性质：同态会把单位元送到单位元，会保幂和逆元，会让有限阶元素的像的阶整除原来的阶；kernel 和 image 都是子群，preimage of subgroup 也是子群，injective 当且仅当 kernel 只有单位元。同构会保阿贝尔性、循环性、元素阶、群大小和子群结构。',
      '易错点：不要把“看起来公式能算”当成 well-defined。不要只证明一一对应就说同构，也不要只证明同态就说同构。处理同构例题时，单位元通常必须映到单位元，这能先锁定映射的一部分。',
    ].join('\n\n'),
  },
  {
    id: 'queue-mat136-09-series',
    courseId: MAT136_COURSE_ID,
    courseCode: 'MAT136',
    lectureNo: '09',
    name: '09 - 级数：从部分和到判别法',
    shortTitle: '级数',
    subtitle: '部分和、发散判别、积分/比较/比值判别',
    sourcePdf: 'queue/MAT136/09_Series.pdf',
    pageCount: 16,
    tags: ['MAT136', '级数', '发散判别', '积分判别', '比较判别', '比值判别', '中文', '封面占位'],
    style: 'queue-cover-placeholder-calculus-memory',
    accent: {
      primary: '#0f766e',
      secondary: '#4338ca',
      warm: '#b45309',
      ink: '#111827',
    },
    coverBullets: [
      '先把级数理解成“部分和”的极限',
      '按条件选择发散、积分、比较或比值判别',
      '记住：通项趋零只是“还不能判”，不是收敛',
    ],
    memoryTitle: 'MAT136 级数公共记忆',
    memoryText: [
      '核心知识：这一讲的级数从部分和出发，级数收敛是部分和序列有有限极限。发散判别法只能在通项极限不为零或不存在时直接判发散；通项极限为零时没有结论，必须换方法。',
      '计算步骤：积分判别法先检查对应函数在区间上连续、正、递减，再把级数与反常积分的收敛性对应起来。比较判别法先确认非负和大小关系：证明收敛时找一个更大的已知收敛对象，证明发散时找一个更小的已知发散对象。比值判别法计算相邻项绝对值比的极限 L，L 小于 1 收敛，L 大于 1 发散，L 等于 1 没有结论。',
      '老师题型：原始课件中反复用“先看通项极限，失败再换判别法”的路线；含阶乘、指数和 n 次幂的题优先考虑比值判别法；含正函数和积分模板的题优先考虑积分判别法；含 ln x、p 型、指数衰减的题要用已知反常积分模板做比较。',
      '易错点：不能从 a_n 趋近 0 推出级数收敛。比值判别法的 L=1 不是发散，而是没有结论。比较判别方向不能反：上界收敛推出小的收敛，下界发散推出大的发散。',
    ].join('\n\n'),
  },
  {
    id: 'queue-mat136-10-power-series',
    courseId: MAT136_COURSE_ID,
    courseCode: 'MAT136',
    lectureNo: '10',
    name: '10 - 幂级数：收敛半径与可靠区间',
    shortTitle: '幂级数',
    subtitle: '收敛半径、收敛区间与端点检查',
    sourcePdf: 'queue/MAT136/10_幂级数.pdf',
    pageCount: 9,
    tags: ['MAT136', '幂级数', '收敛半径', '收敛区间', '比值判别', '中文', '封面占位'],
    style: 'queue-cover-placeholder-calculus-memory',
    accent: {
      primary: '#0e7490',
      secondary: '#6d28d9',
      warm: '#a16207',
      ink: '#111827',
    },
    coverBullets: [
      '幂级数是在中心点附近用无限多项式拼函数',
      '先用比值极限找半径，再单独查端点',
      '可靠范围不是凭感觉，是由收敛区间决定',
    ],
    memoryTitle: 'MAT136 幂级数公共记忆',
    memoryText: [
      '核心知识：幂级数是形如 sum C_n (x-c)^n 的无限级数，可以在某个范围内用多项式逼近复杂函数。老师用 e^x、sin x、ln(1+x) 的图像直觉强调：靠近中心点通常更可靠，离开中心点后必须靠收敛区间判断。',
      '计算步骤：求收敛半径时，把含 x 的通项写清楚，使用 Ratio Test 计算 |a_{n+1}/a_n| 的极限，把结果整理成“某个关于 x 的绝对值表达式 < 1”。由这个不等式得到开区间和半径 R。得到开区间后，端点不能自动继承，必须把端点代回原级数分别判断。',
      '老师题型：PDF 里反复把 x-c 当作整体处理，例如把 |x+2| 或 |x-1| 从比值极限中分离出来。若比值极限为 0，则对所有 x 收敛；若比值极限无穷大或在非零处超过 1，则可靠范围很小；一般情形要解绝对值不等式。',
      '易错点：收敛半径只给距离，收敛区间还要写中心和端点。不要把开区间端点直接算进来。不要把幂级数的变量 x 当成 n 的常数项丢掉，它决定收敛范围。',
    ].join('\n\n'),
  },
  {
    id: 'queue-mat136-11-taylor-series',
    courseId: MAT136_COURSE_ID,
    courseCode: 'MAT136',
    lectureNo: '11',
    name: '11 - 泰勒级数：从导数拼出函数',
    shortTitle: '泰勒级数',
    subtitle: '泰勒/麦克劳林展开、误差项与级数运算',
    sourcePdf: 'queue/MAT136/11_Taylor_series.pdf',
    pageCount: 17,
    tags: ['MAT136', 'Taylor Series', 'Maclaurin', '泰勒级数', '幂级数运算', '中文', '封面占位'],
    style: 'queue-cover-placeholder-calculus-memory',
    accent: {
      primary: '#115e59',
      secondary: '#7e22ce',
      warm: '#b45309',
      ink: '#111827',
    },
    coverBullets: [
      '泰勒级数用某点导数来拼出函数本身',
      '麦克劳林级数就是中心点为 0 的泰勒级数',
      '后半段重点是代入、求导、积分和级数乘法',
    ],
    memoryTitle: 'MAT136 泰勒级数公共记忆',
    memoryText: [
      '核心知识：泰勒级数是一种幂级数，用函数在某点 a 的各阶导数来拼出函数；当 a=0 时叫麦克劳林级数。老师强调直觉是“项数越多，泰勒多项式越接近原函数”，同时函数值等于泰勒多项式加误差项。',
      '标准公式与模板：常用麦克劳林模板包括 e^x、sin x、cos x、1/(1-x)、1/(1+x)、ln(1+x)。写展开时先列函数及各阶导数在中心点的值，再代入泰勒公式；如果题目要求前几项，就只保留到对应阶数。',
      '方法动作：用已知级数求新函数时，优先识别能否替换变量、逐项求导、逐项积分或做级数乘法。替换变量时把模板里的 x 整体换成新的表达式；求导/积分时保留求和结构并同步改变幂次和系数；两个幂级数相乘时，用同次幂系数相加的卷积思路求前几项。',
      '易错点：不要把泰勒级数和泰勒多项式混在一起，有限项是多项式，带无限求和才是级数。误差项不是装饰，如果题目讨论近似精度就要保留。用模板时要确认中心点和收敛半径，不能只看形式相似。',
    ].join('\n\n'),
  },
];

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapText(text, maxChars) {
  const words = String(text).split(/(\s+)/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (/^\s+$/.test(word)) continue;
    const next = line ? `${line} ${word}` : word;
    if ([...next].length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.flatMap((item) => {
    if ([...item].length <= maxChars + 8) return [item];
    const chunks = [];
    let chunk = '';
    for (const char of item) {
      if ([...chunk].length >= maxChars) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk += char;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
}

function textBlock(lines, x, y, options = {}) {
  const {
    size = 34,
    weight = 500,
    color = '#111827',
    lineHeight = Math.round(size * 1.35),
    maxChars = 30,
    className = 'text',
  } = options;
  const wrapped = lines.flatMap((line) => wrapText(line, maxChars));
  return wrapped
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<text class="${className}" x="${x}" y="${y + dy}" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`;
    })
    .join('\n');
}

function coverSvg(spec) {
  const { primary, secondary, warm, ink } = spec.accent;
  const bulletText = spec.coverBullets
    .map(
      (line, index) => `
        <g transform="translate(0 ${index * 82})">
          <circle cx="74" cy="22" r="10" fill="${index === 0 ? primary : index === 1 ? secondary : warm}" />
          ${textBlock([line], 98, 31, { size: 30, weight: 560, color: ink, maxChars: 34 })}
        </g>`,
    )
    .join('\n');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" stroke-width="1"/>
    </pattern>
    <linearGradient id="bar" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${primary}" />
      <stop offset="0.58" stop-color="${secondary}" />
      <stop offset="1" stop-color="${warm}" />
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="#fbfaf7"/>
  <rect width="1600" height="900" fill="url(#grid)" opacity="0.55"/>
  <rect x="0" y="0" width="1600" height="24" fill="url(#bar)"/>
  <circle cx="1380" cy="160" r="170" fill="${primary}" opacity="0.08"/>
  <circle cx="1460" cy="690" r="230" fill="${warm}" opacity="0.08"/>

  <g transform="translate(92 92)">
    <text class="label" x="0" y="0" font-size="34" font-weight="700" fill="${primary}">${escapeXml(spec.courseCode)} · 第 ${escapeXml(spec.lectureNo)} 讲</text>
    <text class="title" x="0" y="108" font-size="96" font-weight="760" fill="${ink}">${escapeXml(spec.shortTitle)}</text>
    ${textBlock([spec.subtitle], 4, 174, { size: 42, weight: 570, color: '#374151', maxChars: 28 })}
  </g>

  <g transform="translate(90 360)">
    <rect x="0" y="-40" width="890" height="310" rx="8" fill="#ffffff" opacity="0.84" stroke="#e5e7eb"/>
    ${bulletText}
  </g>

  <g transform="translate(1065 318)">
    <rect x="0" y="0" width="430" height="328" rx="8" fill="#ffffff" opacity="0.9" stroke="#e5e7eb"/>
    <text x="44" y="68" font-size="28" font-weight="700" fill="${secondary}">本次只生成封面</text>
    <text x="44" y="126" font-size="25" font-weight="520" fill="#374151">数据库已写入公共记忆</text>
    <text x="44" y="178" font-size="25" font-weight="520" fill="#374151">后续可按原始课件全量展开</text>
    <path d="M44 230 H386" stroke="#d1d5db" stroke-width="2"/>
    <text x="44" y="278" font-size="25" font-weight="650" fill="${warm}">${escapeXml(spec.pageCount)} 页源材料待展开</text>
  </g>

  <g transform="translate(92 816)">
    <text x="0" y="0" font-size="24" font-weight="520" fill="#6b7280">来源：待处理课件 · 封面占位版 · 后续生成时保留老师步骤和课程格式</text>
  </g>
</svg>`;
}

async function makeCoverPng(spec) {
  return sharp(Buffer.from(coverSvg(spec)))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function coverScene(spec) {
  const imageUrl = `/generated-notebooks/${spec.id}/cover.png`;
  const focusRegions = [
    { id: `${spec.id}-cover-title`, label: '封面标题', left: 36, top: 48, width: 590, height: 180 },
    {
      id: `${spec.id}-cover-scope`,
      label: '本讲范围',
      left: 56,
      top: 220,
      width: 560,
      height: 196,
    },
    {
      id: `${spec.id}-cover-status`,
      label: '生成状态',
      left: 665,
      top: 198,
      width: 270,
      height: 210,
    },
  ];
  return {
    id: `${spec.id}-cover-scene`,
    title: `封面：${spec.shortTitle}`,
    type: 'slide',
    order: 0,
    content: {
      type: 'slide',
      webRenderMode: 'slide',
      canvas: {
        id: `${spec.id}-cover-canvas`,
        type: 'content',
        viewportSize: SLIDE.width,
        viewportRatio: SLIDE.width / SLIDE.height,
        background: { type: 'solid', color: '#ffffff' },
        theme: {
          backgroundColor: '#ffffff',
          themeColors: [
            spec.accent.primary,
            spec.accent.secondary,
            spec.accent.warm,
            spec.accent.ink,
          ],
          fontColor: spec.accent.ink,
          fontName: 'Microsoft YaHei',
        },
        elements: [
          {
            id: `${spec.id}-cover-image`,
            type: 'image',
            name: 'full_page_bitmap',
            src: imageUrl,
            left: 0,
            top: 0,
            width: SLIDE.width,
            height: SLIDE.height,
            radius: 0,
            rotate: 0,
            imageType: 'pageFigure',
            fixedRatio: false,
            lock: true,
          },
          ...focusRegions.map((region) => ({
            ...region,
            type: 'shape',
            name: `semantic-hit-map: ${region.label}`,
            path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
            viewBox: [200, 200],
            fill: '#ffffff',
            opacity: 0,
            rotate: 0,
            lock: true,
            fixedRatio: false,
            outline: { color: '#ffffff', style: 'solid', width: 0 },
          })),
        ],
      },
      semanticHitMap: {
        version: 1,
        source: 'queue-cover-placeholder',
        canvasSize: { width: SLIDE.width, height: SLIDE.height },
        sourceSize: { width: CANVAS.width, height: CANVAS.height },
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
      imageNotebookPromptPlan: {
        schemaVersion: 1,
        source: 'queue-cover-placeholder',
        sourcePdf: spec.sourcePdf,
        pageCount: spec.pageCount,
        note: '当前只生成封面页；公共记忆保存本讲约束，供后续全量生成使用。',
      },
    },
    actions: [
      {
        id: `${spec.id}-cover-title-spotlight`,
        type: 'spotlight',
        title: '封面标题',
        elementId: `${spec.id}-cover-title`,
        dimOpacity: 0.64,
        description: '聚焦封面标题。',
      },
      {
        id: `${spec.id}-cover-title-speech`,
        type: 'speech',
        title: '封面标题',
        text: `这本是 ${spec.courseCode} 第 ${spec.lectureNo} 讲的封面占位笔记。现在先不展开整节课，只保留这一讲进入课堂和后续生成需要的入口。`,
      },
      {
        id: `${spec.id}-cover-scope-spotlight`,
        type: 'spotlight',
        title: '本讲范围',
        elementId: `${spec.id}-cover-scope`,
        dimOpacity: 0.64,
        description: '聚焦本讲范围。',
      },
      {
        id: `${spec.id}-cover-scope-speech`,
        type: 'speech',
        title: '本讲范围',
        text: `这讲的核心范围是${spec.subtitle}。公共记忆已经写入，后面问答或继续生成时，会优先按原始课件里的老师步骤来组织。`,
      },
      {
        id: `${spec.id}-cover-status-spotlight`,
        type: 'spotlight',
        title: '生成状态',
        elementId: `${spec.id}-cover-status`,
        dimOpacity: 0.64,
        description: '聚焦生成状态。',
      },
      {
        id: `${spec.id}-cover-status-speech`,
        type: 'speech',
        title: '生成状态',
        text: '当前只有一页封面，不代表课程内容已经完整生成。真正的内容链路会在后续全量生成时，从原始课件继续拆页、出图和写讲解稿。',
      },
    ],
    whiteboard: [],
  };
}

async function ensureAssetTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookImageAsset" (
      "id" TEXT PRIMARY KEY,
      "path" TEXT NOT NULL UNIQUE,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "sha256" TEXT NOT NULL,
      "source" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "NotebookImageAsset_sha256_idx" ON "NotebookImageAsset"("sha256")',
  );
}

async function upsertCoverAsset(prisma, spec, bytes) {
  const assetPath = `/generated-notebooks/${spec.id}/cover.png`;
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  await prisma.notebookImageAsset.upsert({
    where: { path: assetPath },
    update: {
      mimeType: 'image/png',
      data: bytes,
      sizeBytes: bytes.byteLength,
      sha256,
      source: 'queue-cover-placeholder',
    },
    create: {
      id: crypto.randomUUID(),
      path: assetPath,
      mimeType: 'image/png',
      data: bytes,
      sizeBytes: bytes.byteLength,
      sha256,
      source: 'queue-cover-placeholder',
    },
  });
  return { assetPath, sha256, sizeBytes: bytes.byteLength };
}

async function seedNotebook(prisma, spec) {
  const sourcePdfAbs = path.resolve(ROOT, spec.sourcePdf);
  if (!fs.existsSync(sourcePdfAbs)) {
    throw new Error(`Missing source PDF for ${spec.id}: ${spec.sourcePdf}`);
  }

  const coverBytes = await makeCoverPng(spec);
  const asset = await upsertCoverAsset(prisma, spec, coverBytes);
  const scene = coverScene(spec);
  const memoryId = `memory_${spec.id.replaceAll('-', '_')}_public_cover_20260602`;

  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: spec.id },
      update: {
        ownerId: OWNER_ID,
        courseId: spec.courseId,
        name: spec.name,
        description: `${spec.courseCode} 待处理课件封面占位笔记本：当前只有 1 页封面，公共记忆已写入，后续可按原始课件全量生成。`,
        tags: spec.tags,
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: spec.style,
      },
      create: {
        id: spec.id,
        ownerId: OWNER_ID,
        courseId: spec.courseId,
        name: spec.name,
        description: `${spec.courseCode} 待处理课件封面占位笔记本：当前只有 1 页封面，公共记忆已写入，后续可按原始课件全量生成。`,
        tags: spec.tags,
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: spec.style,
      },
    });
    await tx.scene.deleteMany({ where: { notebookId: spec.id } });
    await tx.scene.create({
      data: {
        id: scene.id,
        notebookId: spec.id,
        title: scene.title,
        type: scene.type,
        order: scene.order,
        content: scene.content,
        actions: scene.actions,
        whiteboard: scene.whiteboard,
      },
    });
    await tx.studyMemory.upsert({
      where: { id: memoryId },
      update: {
        ownerId: OWNER_ID,
        courseId: spec.courseId,
        notebookId: spec.id,
        targetType: 'notebook',
        scope: 'public',
        kind: 'manual',
        status: 'active',
        source: 'notebook_generation',
        title: spec.memoryTitle,
        text: spec.memoryText,
        reason: '根据 queue 原始课件抽取本讲结构后写入，供课堂问答、复习路线和后续全量生成使用。',
        sourceReferences: [
          { label: 'queue 原始课件', source: spec.sourcePdf },
          { label: 'cover placeholder notebook', source: `/classroom/${spec.id}` },
        ],
      },
      create: {
        id: memoryId,
        ownerId: OWNER_ID,
        courseId: spec.courseId,
        notebookId: spec.id,
        targetType: 'notebook',
        scope: 'public',
        kind: 'manual',
        status: 'active',
        source: 'notebook_generation',
        title: spec.memoryTitle,
        text: spec.memoryText,
        reason: '根据 queue 原始课件抽取本讲结构后写入，供课堂问答、复习路线和后续全量生成使用。',
        sourceReferences: [
          { label: 'queue 原始课件', source: spec.sourcePdf },
          { label: 'cover placeholder notebook', source: `/classroom/${spec.id}` },
        ],
      },
    });
  });

  return {
    id: spec.id,
    name: spec.name,
    scenes: 1,
    memoryId,
    assetPath: asset.assetPath,
    assetBytes: asset.sizeBytes,
    assetSha256: asset.sha256,
  };
}

loadEnvLocal();

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is not configured. Add it to .env.local first.');
}

const prisma = new PrismaClient();

try {
  await ensureAssetTable(prisma);
  const seeded = [];
  for (const spec of notebooks) {
    seeded.push(await seedNotebook(prisma, spec));
  }
  console.log(JSON.stringify({ seeded }, null, 2));
} finally {
  await prisma.$disconnect();
}
