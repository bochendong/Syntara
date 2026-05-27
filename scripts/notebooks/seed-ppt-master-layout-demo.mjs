#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_ID = 'course-ppt-master-style-gallery';
const NOTEBOOK_ID = 'nb-ppt-master-style-gallery';
const COURSE_AVATAR = '/avatars/notebook-agents/avatar2.avif';
const NOTEBOOK_AVATAR = '/avatars/notebook-agents/avatar4.avif';
const NOW = new Date();

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function buildUserId(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'user-anonymous';
  const safe = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `user-${safe || 'anonymous'}`;
}

async function resolveOwner(prisma) {
  const ownerEmail =
    process.env.SEED_OWNER_EMAIL || process.env.NEXT_PUBLIC_DEMO_EMAIL || process.env.USER_EMAIL;
  const ownerName = process.env.SEED_OWNER_NAME || 'Layout Demo';
  if (ownerEmail) {
    const ownerId = buildUserId(ownerEmail);
    const existing = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true },
    });
    await prisma.user.upsert({
      where: { id: ownerId },
      create: {
        id: ownerId,
        email: ownerEmail,
        name: existing?.name || ownerName,
      },
      update: {
        email: ownerEmail,
        name: existing?.name || ownerName,
      },
    });
    return { id: ownerId, email: ownerEmail, name: existing?.name || ownerName };
  }

  const existingUser = await prisma.user.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, email: true, name: true },
  });
  if (existingUser) return existingUser;

  const fallbackEmail = 'layout-demo@local.test';
  const fallbackId = buildUserId(fallbackEmail);
  await prisma.user.upsert({
    where: { id: fallbackId },
    create: {
      id: fallbackId,
      email: fallbackEmail,
      name: ownerName,
    },
    update: {
      email: fallbackEmail,
      name: ownerName,
    },
  });
  return { id: fallbackId, email: fallbackEmail, name: ownerName };
}

function defaultCanvas(id) {
  return {
    id: `slide_${id}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#2563eb', '#dc2626', '#f59e0b', '#16a34a', '#1f2937'],
      fontColor: '#1f2937',
      fontName: 'Microsoft YaHei',
    },
    elements: [],
    background: {
      type: 'solid',
      color: '#ffffff',
      respectProfileStyle: false,
    },
    type: 'content',
  };
}

function diagramDataUri() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300">
  <rect width="900" height="300" fill="#ffffff"/>
  <g font-family="Arial, sans-serif" font-size="22" font-weight="700">
    <rect x="36" y="72" width="190" height="104" rx="14" fill="#dbeafe" stroke="#bfdbfe" stroke-width="3"/>
    <text x="131" y="118" text-anchor="middle" fill="#2563eb">Source</text>
    <text x="131" y="150" text-anchor="middle" font-size="16" font-weight="500" fill="#374151">raw material</text>
    <path d="M250 124 L322 124" stroke="#6b7280" stroke-width="5" stroke-linecap="round"/>
    <path d="M322 124 L306 112 M322 124 L306 136" stroke="#6b7280" stroke-width="5" stroke-linecap="round"/>
    <rect x="344" y="72" width="190" height="104" rx="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="3"/>
    <text x="439" y="118" text-anchor="middle" fill="#16a34a">Structure</text>
    <text x="439" y="150" text-anchor="middle" font-size="16" font-weight="500" fill="#374151">fields + rules</text>
    <path d="M558 124 L630 124" stroke="#6b7280" stroke-width="5" stroke-linecap="round"/>
    <path d="M630 124 L614 112 M630 124 L614 136" stroke="#6b7280" stroke-width="5" stroke-linecap="round"/>
    <rect x="652" y="72" width="190" height="104" rx="14" fill="#fef3c7" stroke="#fde68a" stroke-width="3"/>
    <text x="747" y="118" text-anchor="middle" fill="#a16207">Behavior</text>
    <text x="747" y="150" text-anchor="middle" font-size="16" font-weight="500" fill="#374151">safe operations</text>
  </g>
  <text x="450" y="238" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#6b7280">A conventional PPT diagram: visible structure first, details second.</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function semanticDoc(title, options) {
  return {
    version: 1,
    language: 'zh-CN',
    profile: 'general',
    deckStyle: options.deckStyle || 'classic_business',
    disciplineStyle: 'general',
    teachingFlow: options.teachingFlow || 'concept_explain',
    layout: { mode: 'stack' },
    layoutFamily: options.layoutFamily,
    layoutTemplate: options.layoutTemplate,
    density: 'standard',
    visualRole: options.visualRole || 'none',
    overflowPolicy: 'compress_first',
    archetype: options.archetype || 'concept',
    title,
    blocks: options.blocks,
  };
}

function slideScene(order, title, options) {
  const id = `${NOTEBOOK_ID}-p${String(order + 1).padStart(2, '0')}`;
  return {
    id,
    stageId: NOTEBOOK_ID,
    notebookId: NOTEBOOK_ID,
    title,
    type: 'slide',
    order,
    content: {
      type: 'slide',
      canvas: defaultCanvas(id),
      semanticDocument: semanticDoc(title, options),
      semanticRenderVersion: 0,
      semanticRenderMode: 'auto',
      webRenderMode: 'slide',
    },
    actions: [],
    whiteboard: null,
  };
}

function galleryVisualDataUri(kind) {
  const palette = {
    magazine: {
      bg: '#fbf4ea',
      fg: '#2b2a24',
      accent: '#b66543',
      secondary: '#7b914f',
      label: 'EDITORIAL PHOTO STORY',
    },
    dark_art: {
      bg: '#111224',
      fg: '#fff6d9',
      accent: '#f5c85f',
      secondary: '#7c8cff',
      label: 'CINEMATIC GALLERY',
    },
    nature_documentary: {
      bg: '#061f1c',
      fg: '#f4f7ea',
      accent: '#6ee7b7',
      secondary: '#d7bd63',
      label: 'NATURE FIELD NOTES',
    },
    product_launch: {
      bg: '#060606',
      fg: '#ffffff',
      accent: '#f97316',
      secondary: '#60a5fa',
      label: 'PRODUCT LAUNCH',
    },
  }[kind] || {
    bg: '#f8fafc',
    fg: '#111827',
    accent: '#2563eb',
    secondary: '#f97316',
    label: 'VISUAL SYSTEM',
  };
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300">
  <rect width="900" height="300" fill="${palette.bg}"/>
  <circle cx="760" cy="60" r="104" fill="${palette.accent}" opacity="0.16"/>
  <circle cx="140" cy="246" r="132" fill="${palette.secondary}" opacity="0.16"/>
  <rect x="52" y="52" width="300" height="176" rx="18" fill="${palette.fg}" opacity="0.08" stroke="${palette.accent}" stroke-width="3"/>
  <rect x="386" y="52" width="198" height="78" rx="14" fill="${palette.accent}" opacity="0.22"/>
  <rect x="386" y="150" width="198" height="78" rx="14" fill="${palette.secondary}" opacity="0.22"/>
  <rect x="620" y="52" width="226" height="176" rx="18" fill="${palette.fg}" opacity="0.08" stroke="${palette.secondary}" stroke-width="3"/>
  <path d="M92 190 C152 120 210 162 262 88 C290 124 314 156 328 202 Z" fill="${palette.accent}" opacity="0.42"/>
  <circle cx="124" cy="94" r="26" fill="${palette.secondary}" opacity="0.56"/>
  <text x="86" y="260" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${palette.fg}">${palette.label}</text>
  <text x="620" y="262" font-family="Arial, sans-serif" font-size="16" fill="${palette.fg}" opacity="0.7">image first, text second</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildScenes() {
  return [
    slideScene(0, 'Academic：结构化研究页', {
      deckStyle: 'academic',
      layoutFamily: 'comparison',
      layoutTemplate: 'pipeline_table',
      teachingFlow: 'comparison_review',
      blocks: [
        {
          type: 'paragraph',
          text: '学术风格要先建立研究问题，再把方法、指标和结论放到可核对的结构里。',
        },
        {
          type: 'process_flow',
          title: '研究页骨架',
          orientation: 'horizontal',
          context: [],
          steps: [
            { title: '01 研究问题', detail: '先说明要解释的现象' },
            { title: '02 方法路径', detail: '再给模型或实验设计' },
            { title: '03 指标证据', detail: '用表格承载可核查事实' },
            { title: '04 结论边界', detail: '最后说明适用范围' },
          ],
          summary: 'Academic 风格强调清晰层级和数据可信度。',
        },
        {
          type: 'table',
          caption: 'Academic 不是“蓝色表格”，而是一套研究报告的信息层级',
          headers: ['区块', '输入', '主要任务', '输出', '版式作用'],
          rows: [
            ['标题', '研究命题', '聚焦问题', '明确对象', '降低理解成本'],
            ['流程', '方法步骤', '建立顺序', '方法框架', '承载叙事'],
            ['表格', '指标/事实', '对齐证据', '可核查信息', '适合扫读'],
            ['结论', '边界条件', '收束判断', '可信结论', '避免空泛'],
          ],
        },
      ],
    }),
    slideScene(1, 'Tech / SaaS：白底卡片与方案结构', {
      deckStyle: 'tech_saas',
      layoutFamily: 'comparison',
      layoutTemplate: 'pipeline_table',
      teachingFlow: 'comparison_review',
      blocks: [
        {
          type: 'paragraph',
          text: 'Tech / SaaS 风格不是装饰感，而是让功能、套餐、流程和收益可以快速比较。',
        },
        {
          type: 'process_flow',
          title: '方案页节奏',
          orientation: 'horizontal',
          context: [],
          steps: [
            { title: 'Problem', detail: '用户遇到什么阻塞' },
            { title: 'Module', detail: '产品如何拆成功能块' },
            { title: 'Metric', detail: '哪些指标证明有效' },
            { title: 'Plan', detail: '下一步如何采用' },
          ],
          summary: 'Tech/SaaS 页要清爽，但信息不能散。',
        },
        {
          type: 'table',
          caption: '白底卡片适合承载价格、功能和能力边界',
          headers: ['模块', '输入', '能力', '输出', '适合页面'],
          rows: [
            ['Starter', '单人任务', '核心功能', '快速上手', '套餐比较'],
            ['Team', '协作流程', '权限与共享', '团队效率', '方案介绍'],
            ['API', '系统集成', '自动化调用', '稳定扩展', '技术页'],
            ['Enterprise', '组织治理', '安全与审计', '规模化落地', '汇报页'],
          ],
        },
      ],
    }),
    slideScene(2, 'Magazine：图文叙事页', {
      deckStyle: 'magazine',
      layoutFamily: 'visual_split',
      layoutTemplate: 'visual_three_steps',
      visualRole: 'diagram',
      blocks: [
        {
          type: 'paragraph',
          text: 'Magazine 风格适合用图片先建立情绪和场景，再把文字压缩成几个编辑部式的观察点。',
        },
        {
          type: 'visual',
          source: galleryVisualDataUri('magazine'),
          alt: 'Editorial image collage placeholder',
          caption: '图片承担场景，文字承担判断。',
          role: 'source_image',
          fit: 'contain',
          emphasis: 'primary',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            { title: '场景先行', text: '先让学生知道讨论发生在哪里。', tone: 'info' },
            { title: '观察成组', text: '把长段解释压成 3 个可扫读观察。', tone: 'success' },
            { title: '结论轻收', text: '保留一点余味，不把页面写成报告。', tone: 'warning' },
          ],
        },
      ],
    }),
    slideScene(3, 'Dark Art：深色画廊页', {
      deckStyle: 'dark_art',
      layoutFamily: 'visual_split',
      layoutTemplate: 'visual_three_steps',
      visualRole: 'source_image',
      blocks: [
        {
          type: 'paragraph',
          text: 'Dark Art 风格适合讲影像、艺术、展陈和审美分析；它需要少字、强对比和清晰焦点。',
        },
        {
          type: 'visual',
          source: galleryVisualDataUri('dark_art'),
          alt: 'Dark gallery placeholder',
          caption: '深色页的关键是焦点，而不是把所有内容都压黑。',
          role: 'source_image',
          fit: 'contain',
          emphasis: 'primary',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            { title: '一眼焦点', text: '画面或主结论必须成为第一视觉入口。', tone: 'info' },
            { title: '少量文字', text: '每个卡片只保留一条判断。', tone: 'success' },
            { title: '高亮节制', text: '金色/紫色用于强调，不铺满页面。', tone: 'warning' },
          ],
        },
      ],
    }),
    slideScene(4, 'Nature Documentary：自然纪录片页', {
      deckStyle: 'nature_documentary',
      layoutFamily: 'visual_split',
      layoutTemplate: 'visual_three_steps',
      visualRole: 'source_image',
      blocks: [
        {
          type: 'paragraph',
          text: 'Nature Documentary 风格适合自然、生物、地理和观察记录；它要让图像沉浸，但 UI 不抢戏。',
        },
        {
          type: 'visual',
          source: galleryVisualDataUri('nature_documentary'),
          alt: 'Nature documentary placeholder',
          caption: '自然类页面需要图片主导和低干扰标注。',
          role: 'source_image',
          fit: 'contain',
          emphasis: 'primary',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            { title: '环境', text: '先给地点、生态位或观察对象。', tone: 'info' },
            { title: '行为', text: '再描述可观察动作或变化。', tone: 'success' },
            { title: '解释', text: '最后把现象接到概念或机制。', tone: 'warning' },
          ],
        },
      ],
    }),
    slideScene(5, 'Product Launch：黑底高对比发布页', {
      deckStyle: 'product_launch',
      layoutFamily: 'visual_split',
      layoutTemplate: 'visual_three_steps',
      visualRole: 'source_image',
      blocks: [
        {
          type: 'paragraph',
          text: 'Product Launch 风格要把参数、价格、卖点做成舞台信息，而不是普通讲义卡片。',
        },
        {
          type: 'visual',
          source: galleryVisualDataUri('product_launch'),
          alt: 'Product launch placeholder',
          caption: '发布会页需要黑底、橙色强调和明确卖点。',
          role: 'source_image',
          fit: 'contain',
          emphasis: 'primary',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            { title: '主卖点', text: '先给一句能记住的产品承诺。', tone: 'info' },
            { title: '硬参数', text: '用数字或规格支撑可信度。', tone: 'success' },
            { title: '行动点', text: '最后给价格、版本或下一步。', tone: 'warning' },
          ],
        },
      ],
    }),
    slideScene(6, 'Two-by-One：风格层和结构层要分开', {
      deckStyle: 'classic_business',
      layoutFamily: 'summary',
      layoutTemplate: 'two_by_one_summary',
      teachingFlow: 'comparison_review',
      archetype: 'summary',
      blocks: [
        {
          type: 'callout',
          tone: 'info',
          title: '现在补上的能力',
          text: '`deckStyle` 负责母版风格，`layoutTemplate` 负责页面结构；两者分开，普通 PPT 才能成套。',
        },
        {
          type: 'callout',
          tone: 'warning',
          title: '以前缺的东西',
          text: '我们只有 pipeline/table/cards 这类结构模板，没有 Academic、Magazine、Product Launch 这种 deck-level 主题包。',
        },
        {
          type: 'callout',
          tone: 'success',
          title: '下一步方向',
          text: '生成侧用场景和受众选择风格；渲染侧把同一风格贯穿标题、图示、表格、卡片和总结页。',
        },
      ],
    }),
  ];
}

async function writeLocalClassroomSnapshot(scenes) {
  const classroomDir = path.resolve(process.cwd(), 'data', 'classrooms');
  await fs.promises.mkdir(classroomDir, { recursive: true });
  const stage = {
    id: NOTEBOOK_ID,
    courseId: COURSE_ID,
    name: 'PPT Master 风格版式 Render Gallery',
    description: 'A render-only notebook for PPT Master inspired deck style presets.',
    tags: ['layout', 'classic-ppt', 'style-gallery'],
    avatarUrl: NOTEBOOK_AVATAR,
    language: 'zh-CN',
    style: 'classic-ppt-style-gallery',
    createdAt: NOW.getTime(),
    updatedAt: NOW.getTime(),
  };
  const filePath = path.join(classroomDir, `${NOTEBOOK_ID}.json`);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(
    tempPath,
    JSON.stringify(
      {
        id: NOTEBOOK_ID,
        stage,
        scenes: scenes.map(({ notebookId: _notebookId, whiteboard, ...scene }) => ({
          ...scene,
          whiteboards: [],
          ...(whiteboard ? { whiteboard } : {}),
        })),
        createdAt: NOW.toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
  await fs.promises.rename(tempPath, filePath);
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and configure it.');
  }

  const prisma = new PrismaClient();
  const scenes = buildScenes();

  try {
    const owner = await resolveOwner(prisma);

    await prisma.course.upsert({
      where: { id: COURSE_ID },
      create: {
        id: COURSE_ID,
        ownerId: owner.id,
        name: 'PPT Master Style Gallery',
        description: 'PPT Master inspired deck style render gallery.',
        language: 'zh-CN',
        tags: ['layout', 'ppt-master', 'style-gallery'],
        purpose: 'daily',
        avatarUrl: COURSE_AVATAR,
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
      update: {
        ownerId: owner.id,
        name: 'PPT Master Style Gallery',
        description: 'PPT Master inspired deck style render gallery.',
        language: 'zh-CN',
        tags: ['layout', 'ppt-master', 'style-gallery'],
        purpose: 'daily',
        avatarUrl: COURSE_AVATAR,
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
    });

    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      create: {
        id: NOTEBOOK_ID,
        ownerId: owner.id,
        courseId: COURSE_ID,
        name: 'PPT Master 风格版式 Render Gallery',
        description: 'A render-only notebook for PPT Master inspired deck style presets.',
        tags: ['layout', 'classic-ppt', 'style-gallery'],
        avatarUrl: NOTEBOOK_AVATAR,
        language: 'zh-CN',
        style: 'classic-ppt-style-gallery',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
      },
      update: {
        ownerId: owner.id,
        courseId: COURSE_ID,
        name: 'PPT Master 风格版式 Render Gallery',
        description: 'A render-only notebook for PPT Master inspired deck style presets.',
        tags: ['layout', 'classic-ppt', 'style-gallery'],
        avatarUrl: NOTEBOOK_AVATAR,
        language: 'zh-CN',
        style: 'classic-ppt-style-gallery',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
      },
    });

    await prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
    await prisma.scene.createMany({
      data: scenes.map((scene) => ({
        id: scene.id,
        notebookId: scene.notebookId,
        title: scene.title,
        type: scene.type,
        order: scene.order,
        content: scene.content,
        actions: scene.actions,
        whiteboard: scene.whiteboard,
      })),
    });
    await writeLocalClassroomSnapshot(scenes);

    await prisma.course.update({
      where: { id: COURSE_ID },
      data: { updatedAt: NOW },
    });
    await prisma.notebook.update({
      where: { id: NOTEBOOK_ID },
      data: { updatedAt: NOW },
    });

    console.log('Seeded PPT Master style render gallery.');
    console.log(`Owner: ${owner.name || '-'} <${owner.email || '-'}> (${owner.id})`);
    console.log(`Course URL: /course/${COURSE_ID}`);
    console.log(`Notebook URL: /classroom/${NOTEBOOK_ID}`);
    console.log(`Scenes: ${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
