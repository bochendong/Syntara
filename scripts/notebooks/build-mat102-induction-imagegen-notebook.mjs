#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const ROOT = process.cwd();
const NOTEBOOK_ID = 'nb-mat102-zh-induction-i-20260519';
const NOTEBOOK_NAME = '数学归纳法、强归纳与递归';
const SOURCE_PDF = 'queue/MAT102/10InductionI-1.pdf';
const COURSE_ID = process.env.MAT102_COURSE_ID || 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = process.env.OPENMAIC_OWNER_ID || 'user-dongbochen1218-icloud-com';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const MARKER_SIZE = 24;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const ARTIFACT_DIR = path.join(
  ROOT,
  'tmp/notebook-imagegen-queue/MAT102/queue-mat102-10inductioni-1',
);
const PROMPT_DIR = path.join(ARTIFACT_DIR, 'prompts-imagegen-20260601');
const RAW_AI_DIR = path.join(ARTIFACT_DIR, 'generated-images-20260601/final-ai');
const PUBLIC_DIR = path.join(ROOT, 'public/generated-notebooks', NOTEBOOK_ID);
const SOURCE_DIR = path.join(PUBLIC_DIR, 'source');
const RECOVERED_DIR = path.join(PUBLIC_DIR, 'recovered');
const MASK_PREVIEW_DIR = path.join(PUBLIC_DIR, 'mask-previews');
const PUBLIC_URL = `/generated-notebooks/${NOTEBOOK_ID}`;

const COLORS = [
  {
    name: 'red',
    hex: '#ff0000',
    rgb: [255, 0, 0],
    match: (r, g, b) => r > 180 && g < 85 && b < 85,
  },
  {
    name: 'lime',
    hex: '#00ff00',
    rgb: [0, 255, 0],
    match: (r, g, b) => g > 170 && r < 90 && b < 95,
  },
  {
    name: 'blue',
    hex: '#0048ff',
    rgb: [0, 72, 255],
    match: (r, g, b) => b > 145 && r < 90 && g < 140,
  },
  {
    name: 'magenta',
    hex: '#ff00ff',
    rgb: [255, 0, 255],
    match: (r, g, b) => r > 170 && b > 130 && g < 95,
  },
];

const UNUSED_COLORS = [
  { name: 'cyan', hex: '#00ffff', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'yellow', hex: '#ffff00', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const REGION_RECTS = {
  left: [35, 145, 410, 525],
  center: [500, 145, 620, 525],
  right: [1170, 145, 395, 525],
  bottom: [35, 680, 1530, 190],
};

const PAGE_REGIONS = [
  { key: 'left', colorIndex: 0, semanticId: 'entry', label: '入口问题' },
  { key: 'center', colorIndex: 1, semanticId: 'worked-step', label: '老师步骤' },
  { key: 'right', colorIndex: 2, semanticId: 'principle', label: '证明格式' },
  { key: 'bottom', colorIndex: 3, semanticId: 'takeaway', label: '本页收束' },
];

const PAGES = [
  {
    title: '数学归纳法：从起点和递推推出全体',
    visible: [
      '入口问题：怎样用有限证明覆盖所有正整数 n？',
      '核心图：P(1) -> P(k) -> P(k+1) 的多米诺链条。',
      '证明格式：Base case；Induction step；Conclusion。',
      '收束：不是检查很多例子，而是证明链条不会断。',
    ],
    speech: [
      '这一节从普通归纳开始。归纳法要解决的问题是：怎样用有限步骤证明一整串正整数命题。',
      '老师给出的标准动作是先证明起点，再证明旧一步能推出新一步。这样每个编号都会被链条推到。',
      '写证明时要分清三件事：起始情形、归纳假设、目标命题。归纳假设只能临时使用旧命题。',
      '这一页先建立模板。后面的例题只是把不同题型塞进同一个模板里。',
    ],
  },
  {
    title: '普通归纳例题：不等式与整除',
    visible: [
      '例题一：证明 2n + 2 <= 4n。',
      '老师步骤：先验 n=1；再把 k+1 目标式改写到能用 k 层假设。',
      '例题二：证明 5 | (6^k - 1)。',
      '收束：不等式找“可比较旧式子”，整除先改写成整数倍。',
    ],
    speech: [
      '这一页进入普通归纳的两个基本题型：不等式和整除。',
      '不等式题的关键不是多算几个数，而是先写出下一步目标，再把它改到能调用旧不等式的形状。',
      '整除题要先把“被五整除”翻译成“等于五乘某个整数”，这样归纳假设才真的可以代入。',
      '这页的共同点是：归纳步必须明确指出旧命题在哪里进入了新命题。',
    ],
  },
  {
    title: '棋盘铺砖：归纳构造的例子',
    visible: [
      '目标：去掉一格的 2^n x 2^n 棋盘可由 L 形三格砖铺满。',
      'Base case：2 x 2 棋盘去一格，正好剩三格。',
      'Induction step：大棋盘切成四块；中心放一块 L 形砖制造三个缺口。',
      '收束：把大对象改造成多个同类小对象。',
    ],
    speech: [
      '前面是代数式，这一页说明归纳也可以证明构造一定存在。',
      '起点是最小棋盘。去掉一格以后，剩下的三格刚好就是一块 L 形砖。',
      '归纳步把大棋盘分成四块。原来的缺口在其中一块，中心再放一块 L 形砖，让另外三块也各缺一格。',
      '构造型归纳的核心是把大问题切回同一种小问题，这样归纳假设才有地方可用。',
    ],
  },
  {
    title: '求和记号：把 Sigma 读成循环',
    visible: [
      'Sigma 记号：下界、上界、求和指标、被加项。',
      '老师算法：设指标为下界；写第一项；每次加一；到上界停止。',
      '展开：sum from i=n to m of r_i = r_n + r_{n+1} + ... + r_m。',
      '收束：先会展开，才会用归纳证明求和公式。',
    ],
    speech: [
      '接下来从归纳转到求和记号，因为很多归纳证明会处理一串有限和。',
      '老师给的读法很像循环：先把指标放在下界，写出当前项，然后指标加一，直到上界停止。',
      '所以求和符号不是神秘公式，它只是把一长串相似的加法压缩起来。',
      '下一页的求和归纳，核心动作就是把前面旧的和与最后新加的一项分开。',
    ],
  },
  {
    title: '求和公式：旧和加新项',
    visible: [
      '命题：sum 1/[n(n+1)] from 1 to k equals k/(k+1)。',
      'Base case：k=1 时左右同为 1/2。',
      'Induction step：前 k+1 项 = 前 k 项 + 第 k+1 项；再用归纳假设替换旧和。',
      '收束：求和归纳先拆最后一项，再通分整理。',
    ],
    speech: [
      '这一页是一道典型求和归纳。老师的标准步骤是从左边的前 k 加一项开始。',
      '先把最后一项拆出来。前 k 项已经由归纳假设处理好，新的最后一项单独保留。',
      '接下来只是通分、合并、因式分解和约分，目标是得到下一层的公式形状。',
      '求和归纳最重要的检查点是：旧和有没有被归纳假设替换，新项有没有准确接上。',
    ],
  },
  {
    title: '强归纳：可以使用所有更小情形',
    visible: [
      '强归纳：若 P(1),...,P(k) 能推出 P(k+1)，则覆盖所有正整数。',
      '普通归纳与强归纳等价，但强归纳的假设更方便。',
      '邮票例题：8 分、9 分、10 分作多个起点。',
      '收束：新情况会退好几步时，用强归纳。',
    ],
    speech: [
      '现在进入强归纳。它改变的不是结论，而是归纳步里允许使用的旧情况范围。',
      '普通归纳通常只用上一格，强归纳允许使用前面已经证明过的所有格。',
      '邮票例题需要多个起点，因为后续会把金额往前退三分；退回去必须仍然落在已经覆盖的范围里。',
      '看到新情况依赖不止一个旧情况，或者要往前退好几步，就该考虑强归纳。',
    ],
  },
  {
    title: '递归定义：由 basis 和 constructor 生成',
    visible: [
      '递归定义：先给 basis elements，再给 constructors。',
      '例子：0 在 E；若 e 在 E，则 -e 和 e+2 在 E。',
      '不断构造：0 -> 2 -> 4，同时得到 -2 等元素。',
      '收束：元素属于集合，只能来自起点或构造规则。',
    ],
    speech: [
      '强归纳之后，老师把归纳连接到递归定义。递归对象不是一次性列出来，而是按规则生成。',
      '一个递归定义要说清两件事：最开始有哪些基本元素，以及怎样从已有元素构造新元素。',
      '例子里的集合从零开始，允许取相反数，也允许加二；不断应用规则会产生偶整数。',
      '结构归纳要沿着这些生成规则证明，而不是只看几个已经生成出来的样本。',
    ],
  },
  {
    title: '递归序列：为什么要强归纳',
    visible: [
      '递归序列：x_1=3, x_2=7, x_k=5x_{k-1}-6x_{k-2}。',
      '目标公式：x_k = 2^k + 3^{k-1}。',
      '两个 base cases：因为递推会看前两项。',
      '收束：递推引用几项，就要准备足够起点。',
    ],
    speech: [
      '这一页把递归和强归纳合在一起看。递推公式如果要用前两项，证明也必须准备两个起点。',
      '先检查第一项和第二项都符合目标公式，这样递推往前走时不会缺少已知基础。',
      '归纳步用前两项的公式代入递推式，再整理出下一项的公式形状。',
      '判断 base cases 数量的办法很简单：看递归规则在生成新项时回头看了几项。',
    ],
  },
  {
    title: '结构归纳：按构造规则证明',
    visible: [
      '结构归纳原则：证明所有 basis；再证明每个 constructor 保持性质。',
      '例子：3 在 S；若 a,b 在 S，则 a+b 在 S。',
      '证明目标：每个 s 都能被 3 整除。',
      '收束：每一种构造规则都要检查，不能只检查基本对象。',
    ],
    speech: [
      '现在正式进入结构归纳。对象不一定按一、二、三编号，而是按构造规则长出来。',
      '先证明基本元素满足性质。这里基本元素是三，它当然被三整除。',
      '再证明构造规则会保留性质：如果两个旧元素都被三整除，那么它们的和也被三整除。',
      '结构归纳最容易漏的是 constructor。只验基本对象，不验构造规则，证明是不完整的。',
    ],
  },
  {
    title: '归纳综合练习：选择正确链条',
    visible: [
      '练习类型一：求和公式、二进制表示、奇数金字塔。',
      '练习类型二：字符串反转、括号数量、递归构造集合。',
      '选择方法：普通归纳、强归纳、结构归纳。',
      '收束：先问对象如何生成，再选证明链条。',
    ],
    speech: [
      '最后一页把本节题型收束成一个选择问题：这道题的对象是怎样生成的。',
      '如果对象按数字一步步前进，通常先想普通归纳；如果新情况会退回多个旧情况，就想强归纳。',
      '如果对象来自字符串、公式或递归集合的构造规则，就用结构归纳沿着每条规则证明。',
      '整节课的主线可以压成一句话：归纳不是猜规律，而是沿着对象的生成路径证明。',
    ],
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadEnvLocal() {
  const envPath = path.resolve(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function pageNo(index) {
  return String(index + 1).padStart(2, '0');
}

function pageNo3(index) {
  return String(index + 1).padStart(3, '0');
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: round1((x / SOURCE_WIDTH) * CANVAS_WIDTH),
    top: round1((y / SOURCE_HEIGHT) * CANVAS_HEIGHT),
    width: round1((width / SOURCE_WIDTH) * CANVAS_WIDTH),
    height: round1((height / SOURCE_HEIGHT) * CANVAS_HEIGHT),
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function regionsForPage(pageIndex) {
  return PAGE_REGIONS.map((region, order) => {
    const color = COLORS[region.colorIndex];
    const rect = REGION_RECTS[region.key];
    return {
      id: `${NOTEBOOK_ID}-p${pageNo(pageIndex)}-${region.semanticId}`,
      semanticId: region.semanticId,
      label: region.label,
      order: order + 1,
      markerColorName: color.name,
      markerColorHex: color.hex,
      sourceRect: rect,
      canvasRect: toCanvasRect(rect),
    };
  });
}

function maskPreviewUrlForRegion(pageIndex, region) {
  return `${PUBLIC_URL}/mask-previews/page-${pageNo3(pageIndex)}/${String(region.order).padStart(2, '0')}-${region.semanticId}.png`;
}

function promptForPage(page, index) {
  return `Use case: scientific-educational
Asset type: 16:9 full-page MAT102 course notebook image
Primary request: Create page ${pageNo(index)} of a Chinese MAT102 notebook on induction. This is an educational full-page bitmap that will later receive calibration corner markers programmatically.

Canvas and style:
- 16:9 horizontal full-page image, no outer frame, no slide-in-slide, no UI chrome.
- White graph-paper notebook background with faint light-gray grid.
- Hand-drawn college proof notebook style: black marker handwriting, dark navy math, muted teal diagrams, pale pink or pale blue highlights.
- Use concise Simplified Chinese for all student-visible prose. Mathematical notation may remain in standard notation.
- Do not use pure red #ff0000, pure lime #00ff00, pure blue #0048ff, pure cyan #00ffff, pure magenta #ff00ff, or pure yellow #ffff00 anywhere.
- Do not draw corner markers, colored corner squares, calibration marks, connected boxes, borders, brackets, or colored region frames. The semantic blocks must be separated by whitespace and headings only.

Layout:
- Top: large handwritten title: ${page.title}
- Left block: ${page.visible[0]}
- Center block: ${page.visible[1]}
- Right block: ${page.visible[2]}
- Bottom wide strip: ${page.visible[3]}
- Keep the four blocks axis-aligned and compact. Leave blank graph-paper margins near the outer corners of each block so calibration squares can be overlaid later.
- Do not connect the blocks with colored lines. Use only subtle arrows or neutral gray flow hints when needed.

Accuracy requirements:
- Preserve the mathematical facts from ${SOURCE_PDF}.
- Include teacher-step structure when the page is a proof: base case, induction hypothesis, induction step, conclusion.
- Keep text large and readable; avoid dense lecture-handout paragraphs.
- No watermark, no placeholder text, no prompt labels, no teaching-goal labels.`;
}

function preparePrompts() {
  ensureDir(PROMPT_DIR);
  for (const [index, page] of PAGES.entries()) {
    fs.writeFileSync(
      path.join(PROMPT_DIR, `page-${pageNo3(index)}.prompt.md`),
      `${promptForPage(page, index)}\n`,
    );
  }
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'page-specs-imagegen-20260601.json'),
    `${JSON.stringify({ notebookId: NOTEBOOK_ID, sourcePdf: SOURCE_PDF, pages: PAGES }, null, 2)}\n`,
  );
  console.log(`Prepared ${PAGES.length} prompts in ${PROMPT_DIR}`);
}

function removeOldSlideFiles() {
  ensureDir(PUBLIC_DIR);
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    if (/^slide-\d+\.png$/i.test(name) || name === 'contact-sheet.png') {
      fs.rmSync(path.join(PUBLIC_DIR, name), { force: true });
    }
  }
  fs.rmSync(SOURCE_DIR, { recursive: true, force: true });
  fs.rmSync(RECOVERED_DIR, { recursive: true, force: true });
  fs.rmSync(MASK_PREVIEW_DIR, { recursive: true, force: true });
  ensureDir(SOURCE_DIR);
  ensureDir(RECOVERED_DIR);
  ensureDir(MASK_PREVIEW_DIR);
}

function markerColorForPixel(data, offset) {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return [...COLORS, ...UNUSED_COLORS].find((color) => color.match(r, g, b)) || null;
}

function sanitizeMarkerColors(data, info) {
  const out = Buffer.from(data);
  const channels = info.channels;
  for (let i = 0; i < out.length; i += channels) {
    const color = markerColorForPixel(out, i);
    if (!color) continue;
    out[i] = 248;
    out[i + 1] = 250;
    out[i + 2] = 252;
    if (channels > 3) out[i + 3] = 255;
  }
  return out;
}

function drawSquare(data, info, x, y, rgb) {
  const channels = info.channels;
  for (let yy = y; yy < y + MARKER_SIZE; yy += 1) {
    for (let xx = x; xx < x + MARKER_SIZE; xx += 1) {
      if (xx < 0 || xx >= info.width || yy < 0 || yy >= info.height) continue;
      const offset = (yy * info.width + xx) * channels;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      if (channels > 3) data[offset + 3] = 255;
    }
  }
}

function markerRectsForRegion(region) {
  const [x, y, width, height] = region.sourceRect;
  return [
    { corner: 'top-left', x, y },
    { corner: 'top-right', x: x + width - MARKER_SIZE, y },
    { corner: 'bottom-left', x, y: y + height - MARKER_SIZE },
    { corner: 'bottom-right', x: x + width - MARKER_SIZE, y: y + height - MARKER_SIZE },
  ];
}

function drawMarkers(cleanData, info, regions) {
  const sourceData = Buffer.from(cleanData);
  const drawn = [];
  for (const region of regions) {
    const color = COLORS.find((item) => item.hex === region.markerColorHex);
    for (const rect of markerRectsForRegion(region)) {
      drawSquare(sourceData, info, rect.x, rect.y, color.rgb);
      drawn.push({
        componentId: region.id,
        color: color.hex,
        colorName: color.name,
        corner: rect.corner,
        x: rect.x,
        y: rect.y,
        size: MARKER_SIZE,
      });
    }
  }
  return { data: sourceData, drawn };
}

function countMarkerComponents(data, info) {
  const channels = info.channels;
  const allColors = [...COLORS, ...UNUSED_COLORS];
  const results = {};
  for (const color of allColors) {
    const mask = new Uint8Array(info.width * info.height);
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * channels;
        if (color.match(data[offset], data[offset + 1], data[offset + 2]))
          mask[y * info.width + x] = 1;
      }
    }
    const seen = new Uint8Array(mask.length);
    const components = [];
    const queue = new Int32Array(mask.length);
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const start = y * info.width + x;
        if (!mask[start] || seen[start]) continue;
        let head = 0;
        let tail = 0;
        let area = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        queue[tail++] = start;
        seen[start] = 1;
        while (head < tail) {
          const current = queue[head++];
          const cx = current % info.width;
          const cy = Math.floor(current / info.width);
          area += 1;
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
            const next = ny * info.width + nx;
            if (!mask[next] || seen[next]) continue;
            seen[next] = 1;
            queue[tail++] = next;
          }
        }
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const fillRatio = area / Math.max(1, width * height);
        const aspect = width / Math.max(1, height);
        const compact =
          width >= 5 &&
          height >= 5 &&
          width <= 80 &&
          height <= 80 &&
          aspect >= 0.35 &&
          aspect <= 2.85 &&
          fillRatio >= 0.16;
        components.push({ minX, minY, width, height, area, compact });
      }
    }
    results[color.hex] = {
      total: components.length,
      compact: components.filter((component) => component.compact).length,
      components,
    };
  }
  return results;
}

async function processImages() {
  removeOldSlideFiles();
  const reports = [];
  const imageSources = [];
  for (const [index, page] of PAGES.entries()) {
    const page2 = pageNo(index);
    const page3 = pageNo3(index);
    const rawPath = path.join(RAW_AI_DIR, `page-${page3}-ai.png`);
    if (!fs.existsSync(rawPath)) throw new Error(`Missing raw image for page ${page3}: ${rawPath}`);
    const cleanOut = path.join(RECOVERED_DIR, `page-${page3}-clean.png`);
    const sourceOut = path.join(SOURCE_DIR, `page-${page3}-source.png`);
    const slideOut = path.join(PUBLIC_DIR, `slide-${page2}.png`);
    const maskPreviewDir = path.join(MASK_PREVIEW_DIR, `page-${page3}`);
    const regions = regionsForPage(index);

    const { data, info } = await sharp(rawPath)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cleanData = sanitizeMarkerColors(data, info);
    await sharp(cleanData, { raw: info }).png().toFile(cleanOut);
    await sharp(cleanData, { raw: info }).png().toFile(slideOut);
    const marked = drawMarkers(cleanData, info, regions);
    await sharp(marked.data, { raw: info }).png().toFile(sourceOut);
    await renderPageMaskPreviews(slideOut, maskPreviewDir, regions);

    const sourceCounts = countMarkerComponents(marked.data, info);
    const cleanCounts = countMarkerComponents(cleanData, info);
    const sourcePass = COLORS.every((color) => sourceCounts[color.hex]?.compact === 4);
    const unusedPass = UNUSED_COLORS.every(
      (color) => (sourceCounts[color.hex]?.compact ?? 0) === 0,
    );
    const cleanPass = [...COLORS, ...UNUSED_COLORS].every(
      (color) => (cleanCounts[color.hex]?.compact ?? 0) === 0,
    );
    const status = sourcePass && unusedPass && cleanPass ? 'pass' : 'needs-review';
    reports.push({
      page: index + 1,
      title: page.title,
      rawPath,
      cleanOut,
      sourceOut,
      maskPreviewDir,
      sourceCounts: Object.fromEntries(
        Object.entries(sourceCounts).map(([hex, value]) => [
          hex,
          { total: value.total, compact: value.compact },
        ]),
      ),
      cleanCounts: Object.fromEntries(
        Object.entries(cleanCounts).map(([hex, value]) => [
          hex,
          { total: value.total, compact: value.compact },
        ]),
      ),
      drawnMarkers: marked.drawn,
      status,
    });
    imageSources.push({ page: index + 1, rawPath, sourceOut, cleanOut, slideOut, maskPreviewDir });
  }

  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'validation-report.json'),
    `${JSON.stringify(reports, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'image-sources.json'),
    `${JSON.stringify(imageSources, null, 2)}\n`,
  );
  await renderMetadataAssets();
  await renderContactSheet();
  await renderMaskPreviewContactSheet();
  const failed = reports.filter((report) => report.status !== 'pass');
  if (failed.length)
    throw new Error(`Marker validation failed for pages: ${failed.map((p) => p.page).join(', ')}`);
  console.log(`Processed ${PAGES.length} pages. Marker validation passed.`);
}

async function renderPageMaskPreviews(slidePath, outputDir, regions) {
  ensureDir(outputDir);
  const dimOverlay = Buffer.from(
    `<svg width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#0f172a" fill-opacity="0.68"/>
    </svg>`,
  );

  for (const region of regions) {
    const [x, y, width, height] = region.sourceRect;
    const left = Math.max(0, Math.round(x - 10));
    const top = Math.max(0, Math.round(y - 10));
    const cropWidth = Math.min(SOURCE_WIDTH - left, Math.round(width + 20));
    const cropHeight = Math.min(SOURCE_HEIGHT - top, Math.round(height + 20));
    const focusedRegion = await sharp(slidePath)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
    const outline = Buffer.from(
      `<svg width="${SOURCE_WIDTH}" height="${SOURCE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${left}" y="${top}" width="${cropWidth}" height="${cropHeight}" rx="10" ry="10" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="5"/>
        <rect x="${left + 6}" y="${top + 6}" width="${Math.max(1, cropWidth - 12)}" height="${Math.max(
          1,
          cropHeight - 12,
        )}" rx="7" ry="7" fill="none" stroke="#0f172a" stroke-opacity="0.45" stroke-width="2"/>
      </svg>`,
    );

    await sharp(slidePath)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
      .composite([
        { input: dimOverlay, left: 0, top: 0 },
        { input: focusedRegion, left, top },
        { input: outline, left: 0, top: 0 },
      ])
      .png()
      .toFile(
        path.join(outputDir, `${String(region.order).padStart(2, '0')}-${region.semanticId}.png`),
      );
  }
}

function imageElement(index) {
  const page = pageNo(index);
  return {
    id: `${NOTEBOOK_ID}-image-${page}`,
    type: 'image',
    name: 'full_page_bitmap',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_URL}/slide-${page}.png`,
    imageType: 'background',
    lock: true,
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.canvasRect.left,
    top: region.canvasRect.top,
    width: region.canvasRect.width,
    height: region.canvasRect.height,
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

function promptPlanForPage(page, index, regions) {
  return {
    schemaVersion: 3,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    pageRole:
      index === 0
        ? 'introduction'
        : index === PAGES.length - 1
          ? 'summary-practice'
          : 'lesson-page',
    sourcePdf: SOURCE_PDF,
    sourceTextPath: path.join(
      'tmp/notebook-imagegen-queue/MAT102/queue-mat102-10inductioni-1/source-text',
      `page-${pageNo3(index)}.txt`,
    ),
    componentPlans: regions.map((region) => ({
      id: region.id,
      label: region.label,
      order: region.order,
      markerColorName: region.markerColorName,
      markerColorHex: region.markerColorHex,
      participatesInMask: true,
      markerBbox: region.sourceRect,
      focusBbox: region.sourceRect,
      maskPreviewUrl: maskPreviewUrlForRegion(index, region),
    })),
    markerProtocol: {
      type: 'source-has-independent-corner-square-markers-clean-is-recovered',
      markerCountPerComponent: 4,
      markerSizePx: MARKER_SIZE,
      rule: 'Markers are isolated solid color squares only; never connected with lines, borders, brackets, or frames.',
      colorPool: [...COLORS, ...UNUSED_COLORS].map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: [...COLORS, ...UNUSED_COLORS].map(({ hex }) => hex),
    },
    compiledImagePromptPath: path.join(PROMPT_DIR, `page-${pageNo3(index)}.prompt.md`),
    recoveryResult: {
      status: 'passed',
      recoveredAt: Date.now(),
      originalMarkerImageUrl: `${PUBLIC_URL}/source/page-${pageNo3(index)}-source.png`,
      cleanImageUrl: `${PUBLIC_URL}/recovered/page-${pageNo3(index)}-clean.png`,
      components: regions.map((region) => ({
        componentId: region.id,
        label: region.label,
        markerColorHex: region.markerColorHex,
        markerCount: 4,
        bbox: region.sourceRect,
        maskPreviewUrl: maskPreviewUrlForRegion(index, region),
      })),
    },
  };
}

function canvasForPage(page, index, regions) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${pageNo(index)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    background: { type: 'solid', color: '#ffffff', respectProfileStyle: false },
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#111827', '#0f766e', '#334155', '#f8fafc'],
      fontColor: '#111827',
      fontName: 'Microsoft YaHei',
    },
    remark: page.title,
    elements: [imageElement(index), ...regions.map((region) => hotspotElement(region))],
  };
}

function actionsForPage(page, index, regions) {
  return regions.flatMap((region, regionIndex) => [
    {
      id: `${region.id}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `聚焦区域：${region.label}`,
      dimOpacity: 0.76,
    },
    {
      id: `${region.id}-speech`,
      type: 'speech',
      title: `讲解：${region.label}`,
      text: page.speech[regionIndex],
    },
  ]);
}

function sceneForPage(page, index) {
  const regions = regionsForPage(index);
  return {
    id: `${NOTEBOOK_ID}-p${pageNo(index)}`,
    notebookId: NOTEBOOK_ID,
    title: page.title,
    type: 'slide',
    order: index,
    content: {
      type: 'slide',
      canvas: canvasForPage(page, index, regions),
      webRenderMode: 'slide',
      semanticHitMap: semanticHitMapForPage(page, index, regions),
      imageNotebookPromptPlan: promptPlanForPage(page, index, regions),
    },
    actions: actionsForPage(page, index, regions),
    whiteboard: [],
  };
}

function semanticHitMapForPage(page, index, regions) {
  return {
    version: 1,
    title: page.title,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    maskPreviewContactSheet: `${PUBLIC_URL}/mask-preview-contact-sheet.png`,
    regions: regions.map((region) => ({
      ...region,
      maskPreviewUrl: maskPreviewUrlForRegion(index, region),
    })),
  };
}

function scenesForNotebook() {
  return PAGES.map((page, index) => sceneForPage(page, index));
}

async function renderMetadataAssets() {
  ensureDir(PUBLIC_DIR);
  const scenes = scenesForNotebook();
  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'queue-mat102-10inductioni-1-imagegen-marker-recovery',
    sourcePdf: SOURCE_PDF,
    maskPreviewContactSheet: `${PUBLIC_URL}/mask-preview-contact-sheet.png`,
    slides: PAGES.map((page, index) => {
      const regions = regionsForPage(index);
      return {
        order: index,
        title: page.title,
        image: `${PUBLIC_URL}/slide-${pageNo(index)}.png`,
        sourceImage: `${PUBLIC_URL}/source/page-${pageNo3(index)}-source.png`,
        cleanImage: `${PUBLIC_URL}/recovered/page-${pageNo3(index)}-clean.png`,
        maskPreviews: regions.map((region) => ({
          regionId: region.id,
          label: region.label,
          image: maskPreviewUrlForRegion(index, region),
        })),
        hitMap: semanticHitMapForPage(page, index, regions),
      };
    }),
  };
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'semantic-hit-map.json'),
    `${JSON.stringify(hitMap, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'scene-actions.json'),
    `${JSON.stringify(
      scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        order: scene.order,
        actions: scene.actions,
      })),
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'notebook-scenes.json'),
    `${JSON.stringify(scenes, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'notebook-outline.json'),
    `${JSON.stringify(
      {
        id: NOTEBOOK_ID,
        title: NOTEBOOK_NAME,
        description:
          'MAT102 中文 imagegen notebook：从普通归纳、求和归纳、强归纳到递归定义与结构归纳。',
        sourcePdf: SOURCE_PDF,
        pageCount: PAGES.length,
        pages: PAGES.map((page, index) => ({ order: index, title: page.title })),
      },
      null,
      2,
    )}\n`,
  );
}

async function renderContactSheet() {
  const files = PAGES.map((_, index) => path.join(PUBLIC_DIR, `slide-${pageNo(index)}.png`));
  const cols = 5;
  const thumbW = 320;
  const thumbH = 180;
  const labelH = 30;
  const gap = 10;
  const rows = Math.ceil(files.length / cols);
  const composites = [];
  for (const [index, file] of files.entries()) {
    const x = (index % cols) * (thumbW + gap);
    const y = Math.floor(index / cols) * (thumbH + labelH + gap);
    composites.push({
      input: await sharp(file).resize(thumbW, thumbH, { fit: 'fill' }).png().toBuffer(),
      left: x,
      top: y,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${thumbW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="10" y="21" font-family="Arial" font-size="16" font-weight="700" fill="white">${esc(
          `第 ${index + 1} 页`,
        )}</text></svg>`,
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
    .toFile(path.join(PUBLIC_DIR, 'contact-sheet.png'));
}

async function renderMaskPreviewContactSheet() {
  const entries = [];
  for (const [pageIndex] of PAGES.entries()) {
    const pageDir = path.join(MASK_PREVIEW_DIR, `page-${pageNo3(pageIndex)}`);
    for (const region of regionsForPage(pageIndex)) {
      const file = path.join(
        pageDir,
        `${String(region.order).padStart(2, '0')}-${region.semanticId}.png`,
      );
      if (fs.existsSync(file)) {
        entries.push({ file, label: `第 ${pageIndex + 1} 页 · ${region.label}` });
      }
    }
  }
  if (entries.length === 0) return;

  const cols = 4;
  const thumbW = 360;
  const thumbH = 203;
  const labelH = 30;
  const gap = 10;
  const rows = Math.ceil(entries.length / cols);
  const composites = [];
  for (const [index, entry] of entries.entries()) {
    const x = (index % cols) * (thumbW + gap);
    const y = Math.floor(index / cols) * (thumbH + labelH + gap);
    composites.push({
      input: await sharp(entry.file).resize(thumbW, thumbH, { fit: 'fill' }).png().toBuffer(),
      left: x,
      top: y,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${thumbW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="10" y="21" font-family="Arial" font-size="15" font-weight="700" fill="white">${esc(
          entry.label,
        )}</text></svg>`,
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
    .toFile(path.join(PUBLIC_DIR, 'mask-preview-contact-sheet.png'));
}

function publicMemoryText() {
  return [
    '## 来源范围',
    `- 适用于 MAT102 的 Induction I notebook，来源是 ${SOURCE_PDF} 和本次 10 页 imagegen/recover 图片笔记本。`,
    '- 后续答疑、出题和续写这本 notebook 时，优先按这里的证明格式和老师步骤组织答案。',
    '',
    '## 老师讲了什么',
    '- 本节主线是：用有限的起点检查和推进规则，覆盖无限多个编号命题。',
    '- 普通归纳不是“检查很多例子”，而是证明 base case 成立，并证明从 P(k) 能推出 P(k+1)。',
    '- 归纳假设只能临时使用已声明的旧命题，不能提前使用目标命题。',
    '- 强归纳允许使用前面所有已经证明过的情形，适合新情况会退回多个旧情况的题。',
    '- 递归定义由 basis elements 和 constructors 组成；结构归纳要证明 basis，并证明每一种 constructor 保持性质。',
    '',
    '## 证明格式',
    '- 写普通归纳证明时，先定义命题 P(n) 和 n 的适用范围。',
    '- Base case 要明确检查起点，不能只说显然。',
    '- Induction step 要写：令 k 为任意满足范围的整数，并假设 P(k) 成立；目标是证明 P(k+1)。',
    '- 推导中每次使用归纳假设都要能指出旧命题如何进入新命题。',
    '- 结尾要写：由数学归纳法，P(n) 对范围内所有 n 成立。',
    '- 若起点不是 1 或步长不是 1，要先说明链条覆盖哪些编号。',
    '- 强归纳证明要写清允许使用的旧情况范围，例如所有小于等于 k 的情形。',
    '',
    '## 老师给出的标准步骤',
    '- 不等式归纳题先写出 k+1 目标式，再把它改写到可以调用 k 层假设的形状。',
    '- 整除归纳题先把“整除”翻译成整数倍等式，再代入归纳步骤。',
    '- 求和归纳题把前 k+1 项拆成“前 k 项的旧和”加“新的一项”，再用归纳假设替换旧和。',
    '- L 形铺砖题用构造式归纳：把大棋盘分成四块小棋盘，中间放一块 L 形砖，让每块都变成同类小问题。',
    '- 多个 base cases 不是形式要求，而是为了保证后续每次退回时都落在已经覆盖的范围。',
    '- 结构归纳必须逐一检查每一种 constructor，不能只检查 basis。',
    '',
    '## 易错点',
    '- 只验几个 n 不是证明。',
    '- 把 P(k+1) 当成已经成立，是偷用结论。',
    '- 忘记写 base case 会让整条归纳链没有起点。',
    '- 在强归纳里不说明旧情况范围，会让证明不可审计。',
    '- 在结构归纳里只验基本对象，不验每一种 constructor，证明不完整。',
  ].join('\n');
}

async function seedDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient();
  const scenes = scenesForNotebook();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const ownerId = course.ownerId || OWNER_ID;
    await prisma.$transaction(async (tx) => {
      await tx.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId,
          courseId: course.id,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 中文 imagegen notebook：从普通归纳、求和归纳、强归纳到递归定义与结构归纳。图片使用独立四角 marker source，并提供去 marker clean slide。',
          tags: ['MAT102', 'zh-CN', 'imagegen-full-slide', 'marker-recovery', '10InductionI-1.pdf'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-full-slide-marker-recovery-corners-only',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId,
          courseId: course.id,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 中文 imagegen notebook：从普通归纳、求和归纳、强归纳到递归定义与结构归纳。图片使用独立四角 marker source，并提供去 marker clean slide。',
          tags: ['MAT102', 'zh-CN', 'imagegen-full-slide', 'marker-recovery', '10InductionI-1.pdf'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-full-slide-marker-recovery-corners-only',
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
      await tx.studyMemory.upsert({
        where: { id: 'memory_mat102_induction_i_public_20260601' },
        update: {
          ownerId,
          courseId: course.id,
          notebookId: NOTEBOOK_ID,
          targetType: 'notebook',
          scope: 'public',
          kind: 'manual',
          status: 'active',
          source: 'notebook_generation',
          title: 'MAT102 归纳法证明格式与老师步骤',
          text: publicMemoryText(),
          reason:
            '根据 queue 原始 PDF 和本次 imagegen/recover 笔记本写入，供课堂问答、复习路线和后续生成使用。',
          sourceReferences: [
            { label: 'queue PDF', source: SOURCE_PDF },
            { label: 'generated notebook', source: PUBLIC_URL },
          ],
        },
        create: {
          id: 'memory_mat102_induction_i_public_20260601',
          ownerId,
          courseId: course.id,
          notebookId: NOTEBOOK_ID,
          targetType: 'notebook',
          scope: 'public',
          kind: 'manual',
          status: 'active',
          source: 'notebook_generation',
          title: 'MAT102 归纳法证明格式与老师步骤',
          text: publicMemoryText(),
          reason:
            '根据 queue 原始 PDF 和本次 imagegen/recover 笔记本写入，供课堂问答、复习路线和后续生成使用。',
          sourceReferences: [
            { label: 'queue PDF', source: SOURCE_PDF },
            { label: 'generated notebook', source: PUBLIC_URL },
          ],
        },
      });
    });
    console.log(`Seeded ${NOTEBOOK_ID}: ${scenes.length} scenes`);
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    prepare: args.has('--prepare') || process.argv.length === 2,
    process: args.has('--process') || args.has('--all'),
    seedDb: args.has('--seed-db') || args.has('--all'),
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs();
  if (args.prepare) preparePrompts();
  if (args.process) await processImages();
  if (args.seedDb) await seedDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
