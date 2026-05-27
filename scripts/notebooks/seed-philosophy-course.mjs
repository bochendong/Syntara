#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

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

const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'philosophy@local.test').trim().toLowerCase();
const OWNER_NAME = (process.env.OWNER_NAME || '哲学自学者').trim();
const COURSE_ID = 'course-philosophy-self-study-zh';
const NOW = new Date();

function defaultCanvas(id, accent = '#2563eb') {
  return {
    id: `slide_${id}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: {
      backgroundColor: '#fffdf7',
      themeColors: [accent, '#0f172a', '#14b8a6', '#d6a84f', '#ef4444'],
      fontColor: '#111827',
      fontName: 'Microsoft YaHei',
      outline: { color: accent, width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [],
    background: {
      type: 'solid',
      color: '#fffdf7',
    },
    type: 'content',
  };
}

function doc(title, blocks, options = {}) {
  return {
    version: 1,
    language: 'zh-CN',
    profile: 'general',
    disciplineStyle: 'humanities',
    teachingFlow: options.teachingFlow || 'concept_explain',
    layout: options.layout || { mode: 'stack' },
    layoutFamily: options.layoutFamily || 'concept_cards',
    density: options.density || 'standard',
    visualRole: 'none',
    overflowPolicy: 'compress_first',
    archetype: options.archetype || 'concept',
    pattern: options.pattern || 'auto',
    title,
    blocks,
  };
}

function slideScene(notebookId, order, title, blocks, options = {}) {
  const id = `${notebookId}-p${String(order + 1).padStart(2, '0')}`;
  const semanticDocument = doc(title, blocks, options);
  return {
    id,
    notebookId,
    title,
    type: 'slide',
    order,
    content: {
      type: 'slide',
      canvas: defaultCanvas(id, options.accent),
      semanticDocument,
      semanticRenderVersion: 55,
      semanticRenderMode: 'auto',
      webRenderMode: 'scroll',
    },
    actions: [],
    whiteboard: null,
  };
}

function quizScene(notebookId, order, title, questions) {
  return {
    id: `${notebookId}-quiz`,
    notebookId,
    title,
    type: 'quiz',
    order,
    content: {
      type: 'quiz',
      questions,
    },
    actions: [],
    whiteboard: null,
  };
}

const overviewNotebook = {
  id: 'nb-philosophy-self-study-guide',
  name: '哲学自学游乐场：课程导览',
  description:
    '一门适合自学的哲学入门课程：用思想实验、阅读卡、生活练习把加缪与黑格尔变成可操作的学习对象。',
  tags: ['哲学', '自学', '导览', '思想实验'],
  avatarUrl: '/avatars/notebook-agents/avatar6.avif',
  accent: '#0f766e',
  scenes: [
    slideScene(
      'nb-philosophy-self-study-guide',
      0,
      '开场：把哲学当作生活实验室',
      [
        {
          type: 'paragraph',
          text: '这门课不是按年代背人名，而是练习三件事：看见问题、拆开概念、把观点放回生活里测试。',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '好奇',
              text: '每节课先用一个怪问题开门：为什么荒诞也能让人自由？矛盾为什么不是错误？',
              tone: 'info',
            },
            {
              title: '慢读',
              text: '不追求一次懂完原著，而是抓住关键词、论证动作和反常识之处。',
              tone: 'success',
            },
            {
              title: '试验',
              text: '每周做一个小练习，把哲学从句子变成观察、选择和写作。',
              tone: 'warning',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '自学目标',
          text: '学完后，你应该能用自己的话解释“荒诞”“反抗”“辩证法”“承认”“自由”，并能写一页个人哲学备忘录。',
        },
      ],
      { archetype: 'intro', layoutFamily: 'cover', accent: '#0f766e' },
    ),
    slideScene(
      'nb-philosophy-self-study-guide',
      1,
      '学习路线：四周，不赶路',
      [
        {
          type: 'process_flow',
          title: '推荐节奏',
          orientation: 'vertical',
          steps: [
            {
              title: '第 1 周：问题感',
              detail: '用导览页建立问题清单：我对世界最不满意的地方是什么？我如何理解自由？',
            },
            {
              title: '第 2 周：加缪',
              detail: '读荒诞、反抗与清醒生活。重点不是悲观，而是“不再自欺”。',
            },
            {
              title: '第 3 周：黑格尔',
              detail: '读矛盾、承认与历史性。重点不是玄学术语，而是“关系如何塑造自我”。',
            },
            {
              title: '第 4 周：对照写作',
              detail: '写一份 800 字短文：当加缪遇到黑格尔，我更需要哪一种清醒？',
            },
          ],
          summary: '每周 3 次，每次 35 到 50 分钟：读一页、写三句、做一题。',
        },
      ],
      { layoutFamily: 'timeline', teachingFlow: 'timeline_story', accent: '#0f766e' },
    ),
    slideScene(
      'nb-philosophy-self-study-guide',
      2,
      '两位主角：一个拒绝安慰，一个拥抱中介',
      [
        {
          type: 'table',
          caption: '先把味道区分开，不急着判断谁更对。',
          headers: ['问题', '加缪', '黑格尔'],
          rows: [
            [
              '世界是否给出终极意义？',
              '世界沉默，人仍要清醒地活。',
              '意义在精神、历史和制度中逐步展开。',
            ],
            [
              '矛盾意味着什么？',
              '人的渴望与世界的沉默相撞。',
              '矛盾推动概念、意识和社会关系发展。',
            ],
            ['自由像什么？', '不逃避荒诞后的行动强度。', '在被理解的共同生活中成为自己。'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: '一条主线',
          text: '加缪教你在没有保证时如何站稳；黑格尔教你看见“我”如何经由他人、历史和制度变成“我”。',
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'comparison_review', accent: '#0f766e' },
    ),
    slideScene(
      'nb-philosophy-self-study-guide',
      3,
      '阅读方法：三张卡片',
      [
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '概念卡',
              text: '关键词是什么？它反对的常识是什么？请用一个生活例子重写。',
              tone: 'info',
            },
            {
              title: '论证卡',
              text: '作者先承认什么，再转折什么，最后要求你接受什么？',
              tone: 'success',
            },
            {
              title: '反驳卡',
              text: '我不同意哪里？这个不同意是误读、价值冲突，还是经验不足？',
              tone: 'warning',
            },
          ],
        },
        {
          type: 'example',
          title: '今天就能做的练习',
          problem: '读完任意一页哲学文本后，写下“它让我不舒服的一句话”。',
          steps: [
            '圈出那个让你不舒服的词。',
            '写一句：如果这是真的，我的生活判断会改变什么？',
            '写一句：如果这不是真的，作者忽略了什么？',
          ],
          answer: '不舒服通常是哲学开始工作的地方。',
        },
      ],
      { teachingFlow: 'practice_check', accent: '#0f766e' },
    ),
    slideScene(
      'nb-philosophy-self-study-guide',
      4,
      '自测游戏：哲学不是答对，而是答得更清楚',
      [
        {
          type: 'bullet_list',
          items: [
            '每节课结束，给自己打 1 到 5 分：我能否不用术语讲给朋友听？',
            '把“我觉得”改写成“我的理由是”。',
            '每周选一个概念，找一个电影、新闻或个人经历作为例子。',
            '遇到黑格尔式长句时，先拆成“谁依赖谁、谁否定谁、谁变成谁”。',
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '通关条件',
          text: '不是记住定义，而是在具体处境里能说：这里像加缪，因为……这里像黑格尔，因为……',
        },
      ],
      { teachingFlow: 'practice_check', accent: '#0f766e' },
    ),
    slideScene(
      'nb-philosophy-self-study-guide',
      5,
      '创作过程中的不足记录',
      [
        {
          type: 'bullet_list',
          items: [
            '为了控制页数，课程压缩了原著脉络，没有逐段细读《西西弗神话》《反抗者》《精神现象学》等文本。',
            '加缪部分只做入门，不充分展开政治写作、阿尔及利亚背景和文学风格争议。',
            '黑格尔部分避免术语堆叠，因此对《逻辑学》《法哲学原理》的系统性讲解很少。',
            '目前以文字卡片和小测为主，缺少时间线图、概念地图和课堂讨论视频等视觉素材。',
            '内容适合自学启发，但不是学术论文；若用于正式课程，需要补充原文页码、二手研究和参考书目。',
          ],
        },
        {
          type: 'callout',
          tone: 'success',
          title: '下一轮可补强',
          text: '增加原文精读页、术语表、比较论文模板、概念图和章节后复习题库。',
        },
      ],
      { archetype: 'summary', layoutFamily: 'summary', accent: '#0f766e' },
    ),
  ],
};

const camusNotebook = {
  id: 'nb-camus-under-10-pages',
  name: '加缪哲学：在荒诞里练习清醒',
  description:
    '9 页以内的加缪自学笔记：荒诞、反抗、自由、激情，以及从《局外人》到《鼠疫》的生活练习。',
  tags: ['加缪', '荒诞', '存在主义', '自学'],
  avatarUrl: '/avatars/notebook-agents/8cc3928f5b0afee4e9808de934c90317.avif',
  accent: '#d97706',
  scenes: [
    slideScene(
      'nb-camus-under-10-pages',
      0,
      '第 1 页：加缪的核心地图',
      [
        {
          type: 'layout_cards',
          columns: 4,
          items: [
            {
              title: '荒诞',
              text: '人渴望意义、秩序和回答；世界却不保证给出答案。',
              tone: 'warning',
            },
            {
              title: '清醒',
              text: '不靠虚假的终极解释安慰自己，也不把沉默误认为虚无。',
              tone: 'info',
            },
            { title: '反抗', text: '承认荒诞后仍说“不”，仍选择行动和限度。', tone: 'success' },
            {
              title: '激情',
              text: '把有限生命过得更充分，而不是等待一个最终保证。',
              tone: 'neutral',
            },
          ],
        },
        {
          type: 'paragraph',
          text: '加缪不是在劝人消极。他关心的是：当世界不给终极答案时，我们怎样不撒谎地继续活。',
        },
      ],
      { archetype: 'intro', layoutFamily: 'cover', accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      1,
      '第 2 页：荒诞不是世界本身，而是一次相撞',
      [
        {
          type: 'definition',
          title: '荒诞',
          text: '荒诞不是“人生很糟”，而是“人的意义需求”和“世界的沉默”之间无法调和的张力。',
        },
        {
          type: 'process_flow',
          orientation: 'horizontal',
          steps: [
            { title: '我追问', detail: '为什么痛苦？为什么死亡？为什么努力？' },
            { title: '世界沉默', detail: '自然事件不会自动给出伦理解释。' },
            { title: '荒诞出现', detail: '问题没有消失，答案也没有降临；张力本身变成事实。' },
          ],
          summary: '所以荒诞是一种关系：没有人追问，就没有荒诞；世界若直接回答，也没有荒诞。',
        },
      ],
      { layoutFamily: 'timeline', teachingFlow: 'concept_explain', accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      2,
      '第 3 页：第一个问题是“要不要逃避？”',
      [
        {
          type: 'callout',
          tone: 'warning',
          title: '阅读安全',
          text: '加缪讨论的是哲学问题，不是危机处理建议。如果你正处在伤害自己的危险里，请立刻联系身边可信的人或当地紧急援助。',
        },
        {
          type: 'bullet_list',
          items: [
            '身体上的逃避：用终结生命来取消问题。',
            '思想上的逃避：用未经检验的终极解释把荒诞盖住。',
            '加缪的选择：不取消问题，也不假装问题已经解决。',
            '清醒的姿态：我知道没有保证，但我仍把今天过成我的责任。',
          ],
        },
      ],
      { teachingFlow: 'argument_evidence', accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      3,
      '第 4 页：西西弗为什么可以幸福',
      [
        {
          type: 'example',
          title: '思想实验',
          problem: '一个人永远把巨石推上山，石头又滚下。他为什么不只是失败者？',
          steps: [
            '如果幸福只等于“完成最终目标”，西西弗确实失败。',
            '如果幸福也包含“我知道处境，并把行动认领为我的行动”，他就不是被意义骗局支配的人。',
            '下山那一刻，他看清命运；看清之后仍返回石头，就是他的反抗。',
          ],
          answer: '“必须想象西西弗是幸福的”的重点不是快乐表情，而是清醒的主权。',
          pitfalls: ['不要把它理解成“忍耐一切压迫”。加缪强调的是清醒与反抗，不是服从。'],
        },
      ],
      { archetype: 'example', layoutFamily: 'problem_solution', accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      4,
      '第 5 页：反抗不是任性，而是给虚无划边界',
      [
        {
          type: 'definition',
          title: '反抗',
          text: '反抗从“不”开始：这里不能再退。但这个“不”同时暗含一个“是”：我承认有某种人的尊严和限度值得守住。',
        },
        {
          type: 'table',
          headers: ['误解', '加缪式修正'],
          rows: [
            ['反抗就是想怎样就怎样', '真正的反抗必须承认他人的限度，否则会滑向暴力。'],
            ['荒诞导致什么都无所谓', '荒诞取消终极保证，却没有取消当下责任。'],
            ['清醒只是冷漠', '清醒是拒绝谎言，进而更具体地爱、工作和承担。'],
          ],
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'comparison_review', accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      5,
      '第 6 页：《局外人》：不合群的人暴露了社会剧本',
      [
        {
          type: 'paragraph',
          text: '默尔索让人不安，不只是因为他做了错事，也因为他没有按社会期待表演情感。他像一面冷镜子，照出我们如何用仪式判断“正常人”。',
        },
        {
          type: 'bullet_list',
          items: [
            '小说不是为默尔索脱罪，而是追问：我们在审判一个行为，还是审判一个不合剧本的人？',
            '加缪借文学展示荒诞：太阳、身体、沉默和制度同时压到一个人身上。',
            '自学问题：我什么时候也用“他没有按我期待表达”来判断一个人的道德？',
          ],
        },
      ],
      { teachingFlow: 'close_reading', accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      6,
      '第 7 页：《鼠疫》：没有宏大答案时，普通正派就是反抗',
      [
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '里厄式行动',
              text: '不宣称拯救世界，只是因为病人在眼前，所以要治疗。',
              tone: 'success',
            },
            { title: '塔鲁式诚实', text: '警惕自己也可能成为制造瘟疫的人。', tone: 'warning' },
            {
              title: '集体处境',
              text: '荒诞不只发生在孤独个体，也发生在共同灾难中。',
              tone: 'info',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '一句带走',
          text: '当意义太大、太远、太抽象时，加缪把伦理放回眼前：少制造痛苦，多承担具体的人。',
        },
      ],
      { accent: '#d97706' },
    ),
    slideScene(
      'nb-camus-under-10-pages',
      7,
      '第 8 页：自学练习与一页总结',
      [
        {
          type: 'process_flow',
          orientation: 'vertical',
          steps: [
            { title: '写荒诞', detail: '写下一个你追问很久但没有终极答案的问题。' },
            {
              title: '找逃避',
              detail: '列出你常用的两个逃避方式：忙碌、犬儒、空洞安慰或过度解释。',
            },
            { title: '定反抗', detail: '写一个本周能做的小行动：不需要宏大，只要具体。' },
          ],
          summary: '加缪式学习的结尾不是“我懂了”，而是“我今天不靠谎言也能做一件事”。',
        },
      ],
      { archetype: 'summary', layoutFamily: 'summary', accent: '#d97706' },
    ),
    quizScene('nb-camus-under-10-pages', 8, '第 9 页：加缪小测', [
      {
        id: 'camus-q1',
        type: 'single',
        question: '在本课程中，“荒诞”最准确的含义是什么？',
        options: [
          { label: '世界本身毫无价值', value: 'A' },
          { label: '人的意义需求与世界沉默之间的张力', value: 'B' },
          { label: '所有道德判断都是假的', value: 'C' },
          { label: '只要生活痛苦就是荒诞', value: 'D' },
        ],
        answer: 'B',
        analysis: '荒诞不是单纯悲观，而是人和世界之间的关系性冲突。',
      },
      {
        id: 'camus-q2',
        type: 'single',
        question: '加缪式反抗为什么不是“想怎样就怎样”？',
        options: [
          { label: '因为反抗总要服从权威', value: 'A' },
          { label: '因为反抗同时承认人的尊严和限度', value: 'B' },
          { label: '因为反抗只适合文学人物', value: 'C' },
          { label: '因为反抗最终会取消行动', value: 'D' },
        ],
        answer: 'B',
        analysis: '反抗的“不”暗含对共同限度的“是”。',
      },
      {
        id: 'camus-q3',
        type: 'short_answer',
        question: '用一句自己的话解释“必须想象西西弗是幸福的”。',
        answer: '参考：幸福不是任务成功，而是清醒地认领自己的处境与行动。',
        analysis: '答案可不同，但需要包含清醒、认领行动、拒绝虚假安慰等关键词。',
        hasAnswer: true,
      },
    ]),
  ],
};

const hegelNotebook = {
  id: 'nb-hegel-under-10-pages',
  name: '黑格尔哲学：把矛盾当作发动机',
  description: '9 页以内的黑格尔自学笔记：辩证法、承认、精神、自由与历史。',
  tags: ['黑格尔', '辩证法', '承认', '自学'],
  avatarUrl: '/avatars/notebook-agents/avatar6.avif',
  accent: '#4f46e5',
  scenes: [
    slideScene(
      'nb-hegel-under-10-pages',
      0,
      '第 1 页：黑格尔的核心地图',
      [
        {
          type: 'layout_cards',
          columns: 4,
          items: [
            { title: '整体', text: '一个概念要放在关系、历史和制度中才看得清。', tone: 'info' },
            {
              title: '否定性',
              text: '矛盾不是脏东西，而是推动事物变成自己的力量。',
              tone: 'warning',
            },
            { title: '承认', text: '自我不是孤岛，我需要他人承认，也承认他人。', tone: 'success' },
            {
              title: '自由',
              text: '自由不是任意选择，而是在合理关系中安住为自己。',
              tone: 'neutral',
            },
          ],
        },
        {
          type: 'paragraph',
          text: '读黑格尔的诀窍：不要先问“他下的定义是什么”，先问“这个概念为什么会走到自己的反面，又怎样被更高层次保留下来”。',
        },
      ],
      { archetype: 'intro', layoutFamily: 'cover', accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      1,
      '第 2 页：辩证法不是“三段论口诀”',
      [
        {
          type: 'callout',
          tone: 'warning',
          title: '先拆一个误解',
          text: '“正题-反题-合题”可以当入门拐杖，但容易把黑格尔读扁。真正关键是概念内部的张力如何逼出下一步。',
        },
        {
          type: 'process_flow',
          orientation: 'horizontal',
          steps: [
            { title: '肯定', detail: '一个概念先以单纯形式出现。' },
            { title: '否定', detail: '它发现自己依赖被排除的东西。' },
            { title: '扬弃', detail: '旧形式被否定，但有效部分被保留到更丰富的形式中。' },
          ],
          summary: '扬弃不是简单折中，而是“取消、保存、提升”同时发生。',
        },
      ],
      { layoutFamily: 'timeline', teachingFlow: 'concept_explain', accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      2,
      '第 3 页：《精神现象学》像一场意识闯关',
      [
        {
          type: 'paragraph',
          text: '《精神现象学》不是一本静态概念词典，而像意识的旅行记录。意识每次以为“我终于抓住真理”，很快发现自己的标准不够，于是被迫升级。',
        },
        {
          type: 'table',
          headers: ['阶段味道', '它相信什么', '为什么不够'],
          rows: [
            ['感性确定性', '眼前这个最真实', '“这个”一说出口就变成普遍词。'],
            ['知觉', '对象有稳定属性', '属性之间的统一需要意识活动。'],
            ['知性', '背后有规律', '规律解释对象，也暴露解释者自身。'],
          ],
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'timeline_story', accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      3,
      '第 4 页：主奴辩证法：我需要一个不是我的他者',
      [
        {
          type: 'definition',
          title: '承认',
          text: '我想成为独立自我，但这种独立必须被另一个独立自我承认。于是自我从一开始就不是纯粹单人游戏。',
        },
        {
          type: 'process_flow',
          orientation: 'vertical',
          steps: [
            { title: '欲望', detail: '我想把对象变成“为我”的东西。' },
            { title: '遭遇他者', detail: '另一个自我也要求自己是中心。' },
            { title: '斗争', detail: '谁承认谁？谁被降为工具？' },
            { title: '反转', detail: '主人依赖奴隶的劳动；奴隶在劳动中改造世界，也形成自我。' },
          ],
          summary: '承认关系如果不相互，就会变形；但变形本身又暴露了相互性的必要。',
        },
      ],
      { layoutFamily: 'timeline', accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      4,
      '第 5 页：精神不是幽灵，而是共同生活的形状',
      [
        {
          type: 'paragraph',
          text: '黑格尔说的“精神”容易被误解成神秘实体。入门时可以先把它理解成：语言、习俗、法律、家庭、市场、国家、艺术和宗教等共同生活结构中形成的意义世界。',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            { title: '语言', text: '我用不是我发明的词理解自己。', tone: 'info' },
            { title: '制度', text: '权利、义务和身份通过制度变得可承认。', tone: 'success' },
            { title: '历史', text: '自由的理解会随着冲突和反思改变。', tone: 'warning' },
          ],
        },
      ],
      { accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      5,
      '第 6 页：自由不是“随便选”',
      [
        {
          type: 'table',
          caption: '黑格尔式自由更像成熟关系中的自我实现。',
          headers: ['自由版本', '看起来像', '问题'],
          rows: [
            ['任意自由', '我想怎样就怎样', '欲望可能来自冲动、广告或恐惧。'],
            ['抽象自由', '我拒绝所有限制', '只剩空洞的“不”，难以建设生活。'],
            ['具体自由', '我理解并参与合理关系', '需要制度和个人反思都足够成熟。'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '自学问题',
          text: '列出一个你觉得“限制我”的规则，再问：它是纯压迫，还是也保护了某种共同自由？答案可以复杂。',
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'case_analysis', accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      6,
      '第 7 页：黑格尔的力量与危险',
      [
        {
          type: 'layout_cards',
          columns: 2,
          items: [
            {
              title: '力量',
              text: '他让我们不把个人、观念、制度分开看；每个“我”都在关系中形成。',
              tone: 'success',
            },
            {
              title: '危险',
              text: '如果把历史进程说得太自信，就可能替现实痛苦辩护。',
              tone: 'warning',
            },
            {
              title: '力量',
              text: '他提醒我们：矛盾不是思考失败，而是深入理解的入口。',
              tone: 'success',
            },
            {
              title: '危险',
              text: '术语很容易制造“我懂了”的幻觉，所以必须不断拿例子校准。',
              tone: 'warning',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: '读法建议',
          text: '对黑格尔保持双重态度：认真学习他的动态思维，同时警惕把现实一切都合理化。',
        },
      ],
      { teachingFlow: 'argument_evidence', accent: '#4f46e5' },
    ),
    slideScene(
      'nb-hegel-under-10-pages',
      7,
      '第 8 页：黑格尔阅读公式',
      [
        {
          type: 'process_flow',
          orientation: 'vertical',
          steps: [
            { title: '找对象', detail: '这段在谈意识、欲望、社会关系、历史，还是自由？' },
            { title: '找依赖', detail: '它表面独立，实际上依赖什么？' },
            { title: '找反转', detail: '被排除的东西如何回来改变原概念？' },
            { title: '找保留', detail: '旧阶段哪些内容被取消，哪些被保存并提升？' },
          ],
          summary: '把每个难句都改写成“它以为自己是 A，却发现离不开 B，于是变成 C”。',
        },
      ],
      { archetype: 'summary', layoutFamily: 'summary', accent: '#4f46e5' },
    ),
    quizScene('nb-hegel-under-10-pages', 8, '第 9 页：黑格尔小测', [
      {
        id: 'hegel-q1',
        type: 'single',
        question: '本课程强调，黑格尔的辩证法最不应该被理解为：',
        options: [
          { label: '概念内部张力推动发展', value: 'A' },
          { label: '否定中保留并提升有效内容', value: 'B' },
          { label: '机械套用“正题-反题-合题”口诀', value: 'C' },
          { label: '通过关系理解对象', value: 'D' },
        ],
        answer: 'C',
        analysis: '三段口诀有时方便，但会遮蔽黑格尔真正关心的内在运动。',
      },
      {
        id: 'hegel-q2',
        type: 'single',
        question: '“承认”为什么重要？',
        options: [
          { label: '因为自我需要另一个独立自我的承认', value: 'A' },
          { label: '因为个人完全不重要', value: 'B' },
          { label: '因为主人永远更自由', value: 'C' },
          { label: '因为历史已经没有冲突', value: 'D' },
        ],
        answer: 'A',
        analysis: '承认说明自我从一开始就处在与他人的关系中。',
      },
      {
        id: 'hegel-q3',
        type: 'short_answer',
        question: '用“它以为自己是 A，却发现离不开 B，于是变成 C”的格式，解释一个生活例子。',
        answer:
          '参考：我以为自由是完全不受限制，却发现离不开他人的可靠承诺，于是把自由理解为共同规则中的行动能力。',
        analysis: '重点是写出依赖、反转和更丰富的新理解。',
        hasAnswer: true,
      },
    ]),
  ],
};

const notebooks = [overviewNotebook, camusNotebook, hegelNotebook];

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and configure it.');
  }

  const prisma = new PrismaClient();
  try {
    let ownerId = buildUserId(OWNER_EMAIL);
    const existingByEmail = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });
    if (existingByEmail?.id) {
      ownerId = existingByEmail.id;
      await prisma.user.update({
        where: { id: ownerId },
        data: { name: OWNER_NAME },
      });
    } else {
      await prisma.user.upsert({
        where: { id: ownerId },
        create: {
          id: ownerId,
          email: OWNER_EMAIL,
          name: OWNER_NAME,
        },
        update: {
          email: OWNER_EMAIL,
          name: OWNER_NAME,
        },
      });
    }

    await prisma.course.upsert({
      where: { id: COURSE_ID },
      create: {
        id: COURSE_ID,
        ownerId,
        name: '哲学自学游乐场：荒诞、辩证法与清醒生活',
        description:
          '一门有趣的中文哲学自学课程。用加缪练习在荒诞中保持清醒，用黑格尔练习把矛盾看成理解世界的发动机。',
        language: 'zh-CN',
        tags: ['哲学', '加缪', '黑格尔', '自学', '人文'],
        purpose: 'daily',
        avatarUrl: '/avatars/notebook-agents/avatar6.avif',
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
      update: {
        ownerId,
        name: '哲学自学游乐场：荒诞、辩证法与清醒生活',
        description:
          '一门有趣的中文哲学自学课程。用加缪练习在荒诞中保持清醒，用黑格尔练习把矛盾看成理解世界的发动机。',
        language: 'zh-CN',
        tags: ['哲学', '加缪', '黑格尔', '自学', '人文'],
        purpose: 'daily',
        avatarUrl: '/avatars/notebook-agents/avatar6.avif',
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
    });

    for (const notebook of notebooks) {
      await prisma.notebook.upsert({
        where: { id: notebook.id },
        create: {
          id: notebook.id,
          ownerId,
          courseId: COURSE_ID,
          name: notebook.name,
          description: notebook.description,
          tags: notebook.tags,
          avatarUrl: notebook.avatarUrl,
          language: 'zh-CN',
          style: 'humanities-self-study',
        },
        update: {
          ownerId,
          courseId: COURSE_ID,
          name: notebook.name,
          description: notebook.description,
          tags: notebook.tags,
          avatarUrl: notebook.avatarUrl,
          language: 'zh-CN',
          style: 'humanities-self-study',
        },
      });

      await prisma.scene.deleteMany({ where: { notebookId: notebook.id } });
      await prisma.scene.createMany({
        data: notebook.scenes.map((scene) => ({
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
    }

    await prisma.course.update({
      where: { id: COURSE_ID },
      data: { updatedAt: NOW },
    });

    const counts = notebooks.map((notebook) => `${notebook.name}: ${notebook.scenes.length} 页`);
    console.log('Seeded philosophy self-study course.');
    console.log(`Owner: ${OWNER_NAME} <${OWNER_EMAIL}> (${ownerId})`);
    console.log(`Course URL: /course/${COURSE_ID}`);
    console.log(counts.join('\n'));
    console.log('Creation notes: course-materials/philosophy-self-study/creation-notes.md');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
