#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat136-substitution-week2-20260518183518';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const PUBLIC_DIR = generatedNotebookPublicPath(NOTEBOOK_ID);
const NOW = new Date();
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const themeColors = {
  ink: '#0f172a',
  teal: '#0f766e',
  blue: '#2563eb',
  orange: '#f97316',
};

const slides = [
  {
    title: 'MAT 136 · 换元法',
    steps: [],
  },
  {
    title: '换元法核心：反向链式法则',
    steps: [
      {
        id: 'reverse-chain-rule',
        label: '反向链式法则',
        rect: [55, 175, 800, 350],
        speech:
          '换元法的核心不是一个新技巧，而是把链式法则倒过来看。如果 u 等于 g of x，那么 du 就是 g prime of x dx。只要积分里同时出现复合函数和它内层的导数，就可以把它改写成关于 u 的积分。',
      },
      {
        id: 'u-choice-signals',
        label: '选 u 的三个信号',
        rect: [910, 155, 630, 540],
        speech:
          '选 u 的时候先看三个信号：第一，有没有一个复杂的内层；第二，旁边有没有它的导数；第三，换完之后积分里能不能只剩 u 和 du。第三条很重要，换元不是只把名字换好看。',
      },
      {
        id: 'complete-rewrite-warning',
        label: '换元警告',
        rect: [90, 720, 1420, 115],
        speech:
          '所以这一节课每道题都围绕同一个问题：我选的 u 能不能把原积分完全改写掉？只要还剩 x，就说明还没有换干净。',
      },
    ],
  },
  {
    title: '例 1：括号里面就是 u',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [310, 155, 900, 150],
        speech:
          '第一题先从最标准的形状开始。我们看到一个很复杂的括号三 x 平方加四，再整体四次方。外面还有六 x，这很像括号里面的导数。',
      },
      {
        id: 'three-step-solution',
        label: '选 u、算 du、全换',
        rect: [50, 315, 1490, 300],
        speech:
          '第一步选 u 等于三 x 平方加四，因为它是内层。第二步算 du，正好等于六 x dx。第三步把原来的六 x dx 和括号全部换掉，积分就变成 u 的四次方 du。',
      },
      {
        id: 'final-answer',
        label: '积分并换回',
        rect: [190, 635, 1140, 120],
        speech:
          '接下来只是幂函数积分：u 的四次方积分是 u 的五次方除以五。最后不要忘记把 u 换回三 x 平方加四，再加 C。',
      },
      {
        id: 'teacher-note',
        label: '做题提醒',
        rect: [140, 765, 1260, 100],
        speech:
          '这题的判断方式很值得记：先看最复杂的括号，再检查它的导数是不是在旁边。符合这两个条件，通常就是很直接的换元。',
      },
    ],
  },
  {
    title: '例 2：差一个常数也可以',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [415, 145, 735, 140],
        speech:
          '第二题看起来和第一题一样，但有一个小差别：根号里面是 z 平方减五，外面只有 z dz，不是完整的二 z dz。',
      },
      {
        id: 'constant-factor',
        label: '差常数处理',
        rect: [45, 315, 1510, 250],
        speech:
          '我们还是选 u 等于 z 平方减五。这样 du 等于二 z dz，所以 z dz 只是二分之一 du。差一个常数没有关系，把这个二分之一补到积分外面就可以。',
      },
      {
        id: 'final-answer',
        label: '答案',
        rect: [240, 575, 1120, 190],
        speech:
          '换成 u 后就是二分之一乘 u 的二分之一次方积分。算完得到三分之一 u 的三分之二次方，再把 u 换回 z 平方减五。',
      },
      {
        id: 'constant-warning',
        label: '常数提醒',
        rect: [210, 785, 1180, 80],
        speech:
          '这类题最常见的错误就是把缺掉的常数忘掉。du 不一定要完全一样，差常数时把常数补出来。',
      },
    ],
  },
  {
    title: '例 3：负号来自 du',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [65, 170, 670, 145],
        speech:
          '第三题是三角函数里的典型换元。看到 sine 和 cosine 混在一起，可以先试 u 等于 cosine t，因为 cosine 的导数会带出负的 sine。',
      },
      {
        id: 'negative-du',
        label: '负号处理',
        rect: [55, 350, 840, 300],
        speech:
          '如果 u 等于 cosine t，那么 du 等于负 sine t dt。也就是说 sine t dt 等于负 du。这个负号不是装饰，它必须一路跟着积分走。',
      },
      {
        id: 'solution',
        label: '换成 u 后积分',
        rect: [930, 310, 615, 350],
        speech:
          'cosine cubed t 变成 u cubed，分子 sine t dt 变成负 du，所以得到负的 u 的负三次方积分。算完以后是二 u 平方分之一，再把 u 换回 cosine t。',
      },
      {
        id: 'sign-warning',
        label: '负号提醒',
        rect: [55, 700, 1490, 165],
        speech:
          '这页要留下的习惯是：只要 du 里有负号，答案里就要有地方承接这个负号。不要凭感觉把它吞掉。',
      },
    ],
  },
  {
    title: '例 4：换完还剩 x 怎么办？',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [410, 150, 700, 140],
        speech:
          '第四题故意选一个不那么一眼结束的例子。根号里面是 x 减一，所以 u 等于 x 减一很自然；但分子还剩一个 x。',
      },
      {
        id: 'rewrite-leftover-x',
        label: '把剩下的 x 也换掉',
        rect: [50, 310, 1500, 280],
        speech:
          '这里关键是不要停在一半。既然 u 等于 x 减一，那么 x 就等于 u 加一。所以分子那个 x 也要换成 u 加一，分母根号 x 减一换成根号 u。',
      },
      {
        id: 'final-answer',
        label: '积分并换回',
        rect: [155, 615, 1290, 125],
        speech:
          '现在整个积分都在 u 世界里了，可以拆成 u 的二分之一次方加 u 的负二分之一次方。积分完，再统一把 u 换回 x 减一。',
      },
      {
        id: 'leftover-warning',
        label: '剩余变量提醒',
        rect: [200, 760, 1200, 95],
        speech: '这页的核心是：换元后不能剩 x。只要还剩 x，就要回头用 u 和 x 的关系把它也改写掉。',
      },
    ],
  },
  {
    title: '定积分换元：上下限也要换',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [270, 155, 1050, 120],
        speech:
          '接下来进入定积分。这个例子很简单，但它故意暴露一个大坑：如果把 x 换成 u，上下限也必须从 x 世界换到 u 世界。',
      },
      {
        id: 'wrong-way',
        label: '错误做法',
        rect: [60, 300, 660, 390],
        speech:
          '左边的错误是：把函数和 dx 都换成了 u，却把上下限仍然写成零到六。这样相当于变量已经换世界了，边界却还留在原来的世界，答案当然会错。',
      },
      {
        id: 'correct-way',
        label: '正确做法',
        rect: [755, 300, 760, 390],
        speech:
          '正确做法是先把上下限带入 u 等于二 x。x 等于零时 u 等于零；x 等于六时 u 等于十二。所以新积分应该从零到十二。',
      },
      {
        id: 'rule',
        label: '定积分规则',
        rect: [45, 735, 1100, 110],
        speech:
          '定积分换元的规则可以说得很短：一旦把 x 换成 u，上下限也要带入 u 等于 g of x。不要混用两个变量世界。',
      },
    ],
  },
  {
    title: '例 5：定积分换元完整流程',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [340, 170, 940, 120],
        speech:
          '这一页把定积分换元的完整流程走一遍。题目里 e 的指数是 x 平方，旁边正好有二 x dx，所以这就是很标准的换元结构。',
      },
      {
        id: 'choose-u-and-bounds',
        label: '选 u 并换上下限',
        rect: [50, 355, 940, 375],
        speech:
          '先选 u 等于 x 平方，于是 du 等于二 x dx。然后立刻换上下限：x 等于零时 u 等于零，x 等于二时 u 等于四。',
      },
      {
        id: 'integrate',
        label: '换积分并计算',
        rect: [1000, 355, 540, 375],
        speech:
          '现在原积分完全变成从零到四的 e to u du。积分结果是 e to u，从零到四代入，得到 e 的四次方减一。',
      },
      {
        id: 'checklist',
        label: '定积分四步',
        rect: [145, 760, 1290, 90],
        speech:
          '把这个流程固定下来：选 u，算 du，换上下限，最后积分。尤其是定积分，换上下限这一步不要放到最后才想。',
      },
    ],
  },
  {
    title: '例 6：没有公式也能换元',
    steps: [
      {
        id: 'problem',
        label: '题目',
        rect: [195, 155, 1210, 140],
        speech:
          '最后一个例题没有给 f 的具体公式，只告诉我们从零到六的 f 的积分等于八。题目问从零到三的 f of two x 的积分。',
      },
      {
        id: 'substitution-work',
        label: '换元计算',
        rect: [45, 340, 1510, 270],
        speech:
          '令 u 等于二 x，那么 dx 等于二分之一 du。上下限也跟着换：x 从零到三，对应 u 从零到六。这样新积分就变成二分之一乘从零到六的 f of u du。',
      },
      {
        id: 'interval-stretch',
        label: '区间伸长',
        rect: [155, 615, 1280, 145],
        speech:
          '图上可以看到，x 区间零到三经过 u 等于二 x 被拉成 u 区间零到六。区间变了，dx 也变成二分之一 du，这两个变化要同时考虑。',
      },
      {
        id: 'idea',
        label: '本题思想',
        rect: [130, 775, 1360, 95],
        speech:
          '所以即使没有 f 的公式，也可以换元。我们改变的是变量、dx 和上下限；已知的积分值八刚好可以直接代入。',
      },
    ],
  },
  {
    title: '换元法总结：每题都问这四件事',
    steps: [
      {
        id: 'timeline',
        label: '四步流程',
        rect: [60, 150, 1480, 120],
        speech:
          '最后收束一下。换元法做题可以压缩成四步：选 u，算 du，全换掉，积回去。真正难的不是后面计算，而是前两步和有没有换干净。',
      },
      {
        id: 'checklist',
        label: '做题 checklist',
        rect: [60, 290, 750, 315],
        speech:
          '每道题都问这四个问题：最复杂的内层是谁？它的导数在旁边吗？差常数能不能补？换完之后还有没有 x？如果是定积分，上下限有没有一起换？',
      },
      {
        id: 'common-errors',
        label: '常见错误',
        rect: [850, 290, 690, 315],
        speech:
          '这节课最常见的错误也在这里：漏负号，漏常数因子，换完还剩 x，以及定积分忘记换上下限。检查答案时优先查这四个地方。',
      },
      {
        id: 'next-hook',
        label: '下节课钩子',
        rect: [110, 755, 1380, 100],
        speech:
          '下节课的钩子是：如果一个 u 不够用怎么办？那时我们就需要新的积分技巧，比如更系统的代换、分部积分，或者先做代数变形。',
      },
    ],
  },
];

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function imageElement(order) {
  const fileName = `slide-${String(order + 1).padStart(2, '0')}.png`;
  return {
    id: `${NOTEBOOK_ID}-image-${String(order + 1).padStart(2, '0')}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_DIR}/${fileName}`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function hotspotElement(order, step) {
  const page = String(order + 1).padStart(2, '0');
  const rect = toCanvasRect(step.rect);
  return {
    id: `${NOTEBOOK_ID}-s${page}-${step.id}`,
    name: `semantic-hit-map: ${step.label}`,
    type: 'shape',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
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

function semanticHitMapFor(order) {
  return {
    version: 1,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    regions: slides[order].steps.map((step) => ({
      id: `${NOTEBOOK_ID}-s${String(order + 1).padStart(2, '0')}-${step.id}`,
      semanticId: step.id,
      label: step.label,
      sourceRect: step.rect,
      canvasRect: toCanvasRect(step.rect),
    })),
  };
}

function actionsFor(order) {
  if (order === 0) return [];
  const page = String(order + 1).padStart(2, '0');
  return slides[order].steps.flatMap((step, index) => [
    {
      id: `${NOTEBOOK_ID}-spotlight-s${page}-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: `${NOTEBOOK_ID}-s${page}-${step.id}`,
      title: step.label,
      description: `聚焦父区域：${step.label}`,
      dimOpacity: 0.76,
    },
    {
      id: `${NOTEBOOK_ID}-speech-s${page}-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: `讲解：${step.label}`,
      text: step.speech,
    },
  ]);
}

function canvasFor(order) {
  return {
    id: `${NOTEBOOK_ID}-canvas-${String(order + 1).padStart(2, '0')}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: [themeColors.teal, themeColors.blue, themeColors.orange, themeColors.ink],
      fontColor: themeColors.ink,
      fontName: 'Inter',
      outline: { color: themeColors.teal, width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [
      imageElement(order),
      ...slides[order].steps.map((step) => hotspotElement(order, step)),
    ],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

async function renderMetadataAssets() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [index] of slides.entries()) {
    const fileName = `slide-${String(index + 1).padStart(2, '0')}.png`;
    if (!fs.existsSync(path.join(OUTPUT_DIR, fileName))) {
      throw new Error(`Missing imagegen slide asset: ${path.join(OUTPUT_DIR, fileName)}`);
    }
  }

  const hitMap = {
    notebookId: NOTEBOOK_ID,
    source: 'imagegen-full-slide-substitution-from-week2-pdf',
    slides: slides.map((slide, index) => ({
      order: index,
      title: slide.title,
      image: `${PUBLIC_DIR}/slide-${String(index + 1).padStart(2, '0')}.png`,
      hitMap: semanticHitMapFor(index),
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));

  const composites = [];
  for (const [index, slide] of slides.entries()) {
    const file = path.join(OUTPUT_DIR, `slide-${String(index + 1).padStart(2, '0')}.png`);
    const labelSvg = `<svg width="400" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="42" fill="#0f172a"/><text x="16" y="28" fill="#ffffff" font-size="19" font-family="Arial">${index + 1}. ${esc(slide.title)}</text></svg>`;
    const thumb = await sharp(file)
      .resize(400, 225)
      .extend({ top: 0, bottom: 42, left: 0, right: 0, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: 225, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: (index % 2) * 400,
      top: Math.floor(index / 2) * 267,
    });
  }

  await sharp({
    create: {
      width: 800,
      height: Math.ceil(slides.length / 2) * 267,
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'contact-sheet.png'));
}

async function seedNotebook() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);

    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 2：换元法 · 反向链式法则',
        description:
          'MAT 136 Week 2 substitution notebook in image-generated full-slide format. Uses worked examples to teach u-choice, du constants, signs, leftover variables, definite-integral bounds, and function-scaling substitution.',
        tags: ['MAT136', 'Substitution', '换元法', 'u-substitution', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        updatedAt: NOW,
      },
      create: {
        id: NOTEBOOK_ID,
        ownerId: course.ownerId,
        courseId: course.id,
        name: 'Week 2：换元法 · 反向链式法则',
        description:
          'MAT 136 Week 2 substitution notebook in image-generated full-slide format. Uses worked examples to teach u-choice, du constants, signs, leftover variables, definite-integral bounds, and function-scaling substitution.',
        tags: ['MAT136', 'Substitution', '换元法', 'u-substitution', 'semantic-hit-map'],
        avatarUrl: '/avatars/notebook-agents/avatar8.avif',
        language: 'zh-CN',
        style: 'imagegen-full-slide-semantic-hit-map',
        createdAt: NOW,
        updatedAt: NOW,
      },
    });

    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.scene.createMany({
        data: slides.map((slide, index) => {
          const content = {
            type: 'slide',
            canvas: canvasFor(index),
            webRenderMode: 'slide',
            semanticHitMap: semanticHitMapFor(index),
          };
          return {
            id: `${NOTEBOOK_ID}-p${String(index + 1).padStart(2, '0')}`,
            notebookId: NOTEBOOK_ID,
            title: slide.title,
            type: 'slide',
            order: index,
            content,
            actions: actionsFor(index),
            whiteboard: null,
            createdAt: NOW,
            updatedAt: NOW,
          };
        }),
      }),
      prisma.course.update({
        where: { id: course.id },
        data: { updatedAt: NOW },
      }),
    ]);

    return { course };
  } finally {
    await prisma.$disconnect();
  }
}

await renderMetadataAssets();
const { course } = await seedNotebook();

console.log(
  JSON.stringify(
    {
      notebookId: NOTEBOOK_ID,
      courseId: course.id,
      courseName: course.name,
      slides: slides.length,
      outputDir: OUTPUT_DIR,
      url: `http://localhost:3000/classroom/${NOTEBOOK_ID}`,
    },
    null,
    2,
  ),
);
