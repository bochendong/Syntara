#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, 'tmp', 'course-chat-services');
const DEFAULT_BASE_URL = process.env.COURSE_CHAT_TEST_BASE_URL || 'http://localhost:3000';
const DEFAULT_MODEL =
  process.env.COURSE_CHAT_TEST_MODEL || process.env.DEFAULT_MODEL || 'openai:gpt-4o-mini';

const COURSE_ORCHESTRATOR_ID = 'course-orchestrator';
const COURSE_ORCHESTRATOR_NAME = '课程总控Agent';
const MOCK_COURSE_CHAT_ID = 'syntara-mock-course-chat';
const MOCK_COURSE_CHAT_NAME = 'Mock 课程聊天测试';

const DEFAULT_MESSAGE =
  '请用这门课自己的上下文回答：递归、复杂度、矩阵乘法这几个概念有什么联系？如果上下文不够，请明确说哪里不够。';

const MAX_NOTEBOOKS = 5;
const MAX_PAGES_PER_NOTEBOOK = 4;
const MAX_PAGE_DIGEST_LENGTH = 1800;
const MAX_PROBLEM_MATCHES = 12;
const MIN_PROBLEM_MATCH_SCORE = 3;
const LEARNING_ACTION_NAMES = new Set([
  'calendar.propose_add',
  'calendar.propose_update',
  'calendar.propose_delete',
  'calendar.search',
  'learner_progress.request_confirmation',
  'practice.propose_generation',
  'classroom.propose_temporary_explanation',
  'memory.propose_write',
]);

function parseArgs(argv) {
  const options = {
    runApi: false,
    runMemoryDryRun: false,
    discover: false,
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    userId: process.env.COURSE_CHAT_TEST_USER_ID || '',
    userEmail: process.env.COURSE_CHAT_TEST_USER_EMAIL || '',
    userName: process.env.COURSE_CHAT_TEST_USER_NAME || '',
    autoUser: true,
    courseFilters: [],
    messages: [],
    steps: [],
    scenarioName: 'manual-conversation',
    outDir: '',
    limit: 0,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg === '--run-api') {
      options.runApi = true;
    } else if (arg === '--run-memory-dry-run') {
      options.runMemoryDryRun = true;
    } else if (arg === '--discover') {
      options.discover = true;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).replace(/\/$/, '');
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--user-id=')) {
      options.userId = arg.slice('--user-id='.length);
    } else if (arg.startsWith('--user-email=')) {
      options.userEmail = arg.slice('--user-email='.length);
    } else if (arg.startsWith('--user-name=')) {
      options.userName = arg.slice('--user-name='.length);
    } else if (arg === '--no-auto-user') {
      options.autoUser = false;
    } else if (arg.startsWith('--course=')) {
      options.courseFilters.push(
        ...arg
          .slice('--course='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith('--message=')) {
      addUserStep(options, arg.slice('--message='.length), 'cli-message');
    } else if (arg.startsWith('--message-file=')) {
      const filePath = path.resolve(ROOT, arg.slice('--message-file='.length));
      addUserStep(options, fs.readFileSync(filePath, 'utf8').trim(), 'message-file');
    } else if (arg.startsWith('--scenario-name=')) {
      options.scenarioName = arg.slice('--scenario-name='.length).trim() || options.scenarioName;
    } else if (arg.startsWith('--scenario-file=')) {
      const filePath = path.resolve(ROOT, arg.slice('--scenario-file='.length));
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        addScenarioSteps(options, parsed, 'scenario-file');
      } else if (parsed && typeof parsed === 'object') {
        if (typeof parsed.name === 'string' && parsed.name.trim()) {
          options.scenarioName = parsed.name.trim();
        }
        if (Array.isArray(parsed.steps)) {
          addScenarioSteps(options, parsed.steps, 'scenario-file');
        } else if (Array.isArray(parsed.messages)) {
          addScenarioSteps(options, parsed.messages, 'scenario-file-messages');
        }
      }
    } else if (arg.startsWith('--out=')) {
      options.outDir = path.resolve(ROOT, arg.slice('--out='.length));
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length)) || 0;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.steps.length === 0) {
    addUserStep(options, DEFAULT_MESSAGE, 'default');
  }
  options.messages = options.steps
    .map((step) => textSentToModel(step))
    .filter((text) => text.trim());
  return options;
}

function addUserStep(options, text, source = 'user') {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  options.steps.push({
    kind: 'user',
    text: normalized,
    source,
  });
}

function addScenarioSteps(options, rawSteps, source) {
  for (const [index, rawStep] of rawSteps.entries()) {
    const step = normalizeScenarioStep(rawStep, index, source);
    if (!step) continue;
    options.steps.push(step);
  }
}

function normalizeScenarioStep(rawStep, index, source) {
  if (typeof rawStep === 'string') {
    const text = rawStep.trim();
    return text ? { kind: 'user', text, source } : null;
  }

  if (!rawStep || typeof rawStep !== 'object') {
    return null;
  }

  const kind = String(rawStep.kind || rawStep.type || 'user')
    .trim()
    .toLowerCase();
  if (kind === 'ui' || kind === 'button' || kind === 'click' || kind === 'confirm') {
    const label = String(
      rawStep.label ||
        rawStep.button ||
        rawStep.actionLabel ||
        rawStep.text ||
        `UI event ${index + 1}`,
    ).trim();
    if (!label) return null;
    const sendText = String(
      rawStep.sendText || rawStep.sendAsUser || rawStep.message || rawStep.prompt || '',
    ).trim();
    return {
      kind: 'ui',
      label,
      actionId: rawStep.actionId || rawStep.id || rawStep.action || undefined,
      event: rawStep.event || rawStep.outcome || rawStep.status || undefined,
      note: rawStep.note || rawStep.description || undefined,
      selection: rawStep.selection || undefined,
      sendText: sendText || undefined,
      payload: rawStep.payload && typeof rawStep.payload === 'object' ? rawStep.payload : undefined,
      source,
    };
  }

  if (kind === 'snapshot' || kind === 'state' || kind === 'inspect' || kind === 'check_state') {
    const label = String(rawStep.label || rawStep.query || `State snapshot ${index + 1}`).trim();
    return label
      ? {
          kind: 'snapshot',
          label,
          query: rawStep.query || undefined,
          note: rawStep.note || rawStep.description || undefined,
          source,
        }
      : null;
  }

  if (
    kind === 'new_conversation' ||
    kind === 'new-conversation' ||
    kind === 'new_dialog' ||
    kind === 'new-dialog'
  ) {
    return {
      kind: 'new_conversation',
      label: String(rawStep.label || `New conversation ${index + 1}`).trim(),
      note: rawStep.note || rawStep.description || undefined,
      source,
    };
  }

  const text = String(rawStep.text || rawStep.message || rawStep.prompt || '').trim();
  return text
    ? {
        kind: 'user',
        text,
        source,
      }
    : null;
}

function textSentToModel(step) {
  if (step?.kind === 'user') return step.text || '';
  if (step?.kind === 'ui') return step.sendText || '';
  return '';
}

function printHelp() {
  console.log(`Usage:
  pnpm test:course-chat
  pnpm test:course-chat -- --run-api --course=mock --message="解释递归三件事"
  pnpm test:course-chat -- --discover --user-id=local-demo --run-api --limit=2

Options:
  --run-api              Send messages to local /api/chat and capture SSE text replies.
  --run-memory-dry-run   After --run-api, send confirmed durable memory candidates to /api/memory/write with dryRun=true and save the response.
  --discover             Discover real courses from /api/courses using --user-id headers.
  --course=mock|all|ID   Filter services. Repeat or comma-separate values.
  --message=TEXT         Message to send. Repeat to run multiple prompts per service.
  --message-file=PATH    Read one message from a text file.
  --scenario-file=PATH   JSON array, { "messages": [...] }, or { "steps": [...] }.
                         Step objects support:
                         { "kind": "user", "text": "..." }
                         { "kind": "ui", "label": "确认并继续", "actionId": "...", "event": "confirmed", "sendText": "..." }
                         A UI step without sendText is transcript-only.
                         { "kind": "snapshot", "label": "查看日历状态" } records simulated UI state.
                         { "kind": "new_conversation", "label": "新对话" } clears visible messages while keeping workflow memory.
  --scenario-name=NAME   Label for the saved conversation transcript.
  --base-url=URL         Default: ${DEFAULT_BASE_URL}
  --model=MODEL          Default: ${DEFAULT_MODEL}
  --user-id=ID           Sent as x-user-id for authenticated local API discovery.
  --no-auto-user         Disable automatic latest-course owner lookup from .env.local.
  --limit=N              Limit selected services after filtering.
  --out=DIR              Output directory. Default: tmp/course-chat-services/<timestamp>
`);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return true;
}

function safeId(input) {
  return String(input || 'service')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function compact(input, max = MAX_PAGE_DIGEST_LENGTH) {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function stripHtmlTags(input) {
  return String(input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input) {
  const lowered = String(input || '').toLowerCase();
  const zhChunks = lowered.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const zhStopTokens = new Set([
    '一下',
    '一个',
    '这个',
    '那个',
    '我们',
    '你们',
    '他们',
    '为什么',
    '怎么',
    '如何',
    '说明',
    '解释',
    '必要',
  ]);
  const zhTokens = zhChunks.flatMap((chunk) => {
    const tokens = [chunk];
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= chunk.length - size; index++) {
        const token = chunk.slice(index, index + size);
        if (!zhStopTokens.has(token)) tokens.push(token);
      }
    }
    return tokens;
  });
  const latinTokens = lowered.match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  const tokens = [...zhTokens, ...latinTokens];
  const expansionRules = [
    {
      matches: ['improper', 'improper integral', '反常积分'],
      add: ['反常', '反常积分', 'improper', 'integral'],
    },
    {
      matches: ['indefinite', 'indefinite integral', '不定积分'],
      add: ['不定', '不定积分', 'indefinite', 'integral'],
    },
    {
      matches: ['edge case', 'edge cases', '边界情况'],
      add: ['边界', '边界情况', 'edge', 'case'],
    },
    {
      matches: ['aliasing', '别名', '引用'],
      add: ['aliasing', '别名', '引用'],
    },
  ];
  for (const rule of expansionRules) {
    if (rule.matches.some((match) => lowered.includes(match))) {
      tokens.push(...rule.add);
    }
  }
  return Array.from(new Set(tokens));
}

function scoreText(tokens, haystack) {
  if (!tokens.length || !String(haystack || '').trim()) return 0;
  const normalized = String(haystack).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!normalized.includes(token)) continue;
    score += token.length >= 6 ? 4 : token.length >= 4 ? 3 : 2;
  }
  return score;
}

function sceneSearchText(scene) {
  const title = scene?.title || '';
  const content = scene?.content || {};
  if (content.type === 'markdown') {
    return `${title} ${content.summary || ''} ${content.markdown || ''}`.trim();
  }
  if (content.type !== 'slide') return title;
  const elements = content.canvas?.elements || [];
  const textBits = elements
    .filter((el) => el?.type === 'text')
    .map((el) => stripHtmlTags(el.content || ''))
    .filter(Boolean)
    .join(' ');
  return `${title} ${textBits}`.trim();
}

function markdownSectionSearchText(section) {
  return `${section?.title || ''} ${section?.summary || ''} ${section?.markdown || ''}`.trim();
}

function focusedDigest(input, tokens, max = MAX_PAGE_DIGEST_LENGTH) {
  const text = normalizeText(input);
  if (text.length <= max) return text;

  const lowered = text.toLowerCase();
  const firstHit = tokens
    .map((token) => lowered.indexOf(String(token || '').toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstHit === undefined) return text.slice(0, max).trim();

  const preferredStart = Math.max(0, firstHit - Math.floor(max * 0.35));
  const start = Math.min(preferredStart, Math.max(0, text.length - max));
  const end = Math.min(text.length, start + max);
  return `${start > 0 ? '... ' : ''}${text.slice(start, end).trim()}${
    end < text.length ? ' ...' : ''
  }`;
}

function mockTextElement(id, top, content) {
  return {
    id,
    type: 'text',
    left: 72,
    top,
    width: 820,
    height: 86,
    rotate: 0,
    content,
    defaultFontName: 'Inter',
    defaultColor: '#0f172a',
    textType: top < 120 ? 'title' : 'content',
  };
}

function mockScene(stageId, order, title, paragraphs) {
  return {
    id: `${stageId}-scene-${order + 1}`,
    stageId,
    type: 'slide',
    title,
    order,
    content: {
      type: 'slide',
      canvas: {
        id: `${stageId}-slide-${order + 1}`,
        viewportSize: 1000,
        viewportRatio: 16 / 9,
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#2563eb', '#10b981', '#f59e0b'],
          fontColor: '#0f172a',
          fontName: 'Inter',
        },
        elements: [
          mockTextElement(`${stageId}-title-${order + 1}`, 72, `<h1>${title}</h1>`),
          mockTextElement(
            `${stageId}-body-${order + 1}`,
            168,
            paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join(''),
          ),
        ],
      },
    },
    actions: [
      {
        id: `${stageId}-speech-${order + 1}`,
        type: 'speech',
        text: `${title}。${paragraphs.join(' ')}`,
      },
    ],
    createdAt: Date.parse('2026-01-01T00:00:00.000Z') + order * 1000,
    updatedAt: Date.parse('2026-01-01T00:00:00.000Z') + order * 1000,
  };
}

function makeMockNotebook(args) {
  return {
    id: args.id,
    courseId: MOCK_COURSE_CHAT_ID,
    name: args.name,
    description: args.description,
    tags: args.tags,
    sceneCount: args.sceneDefs.length,
    createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
    updatedAt: Date.parse('2026-01-01T00:00:00.000Z') + args.sceneDefs.length * 1000,
    scenes: args.sceneDefs.map((scene, index) =>
      mockScene(args.id, index, scene.title, scene.paragraphs),
    ),
  };
}

const MOCK_NOTEBOOKS = [
  makeMockNotebook({
    id: 'mock-course-chat-algorithms',
    name: '算法复杂度与递归',
    description: '用于测试课程聊天上下文引用、复杂度解释、代码块和公式渲染。',
    tags: ['algorithms', 'recursion', 'big-o'],
    sceneDefs: [
      {
        title: '复杂度的核心问题',
        paragraphs: [
          '时间复杂度关注输入规模 n 增长时，运行时间如何增长。常见阶包括 O(1)、O(log n)、O(n)、O(n log n)、O(n^2)。',
          '判断复杂度时先找主导项，再忽略常数。二分查找每次把搜索空间减半，因此复杂度是 O(log n)。',
        ],
      },
      {
        title: '递归三件事',
        paragraphs: [
          '递归需要明确 base case、recursive case、以及每次调用如何靠近终止条件。',
          '阶乘可以写成 n! = n x (n - 1)!，其中 0! = 1。递归深度是 n，因此空间复杂度通常是 O(n)。',
        ],
      },
      {
        title: '分治与归并排序',
        paragraphs: [
          '分治算法把问题拆成更小的子问题，分别解决后合并结果。归并排序的递推式是 T(n)=2T(n/2)+O(n)。',
          '根据主定理，归并排序时间复杂度为 O(n log n)，适合测试公式解释和步骤化回答。',
        ],
      },
    ],
  }),
  makeMockNotebook({
    id: 'mock-course-chat-linear-algebra',
    name: '线性代数速记',
    description: '用于测试跨笔记本综合、概念比较和公式引用。',
    tags: ['linear algebra', 'matrix', 'eigenvalue'],
    sceneDefs: [
      {
        title: '矩阵乘法的含义',
        paragraphs: [
          '矩阵乘法可以理解为线性变换的复合。若 A 和 B 都表示变换，则 AB 表示先做 B 再做 A。',
          '矩阵乘法一般不满足交换律，也就是说 AB 通常不等于 BA。',
        ],
      },
      {
        title: '特征值与特征向量',
        paragraphs: [
          '若 Av = lambda v，且 v 不是零向量，则 v 是特征向量，lambda 是对应特征值。',
          '特征向量表示经过线性变换后方向不变或反向的方向，特征值表示伸缩比例。',
        ],
      },
      {
        title: '线性无关',
        paragraphs: [
          '一组向量线性无关，表示没有一个向量可以由其他向量线性组合得到。',
          '判断线性无关可以把向量作为列组成矩阵，看秩是否等于向量个数。',
        ],
      },
    ],
  }),
];

function buildProblemBankLayeredMemory(problems, question) {
  const problemRows = Array.isArray(problems) ? problems : [];
  const tokens = tokenize(question);
  const ranked = problemRows
    .map((problem, index) => {
      const tags = Array.isArray(problem.tags) ? problem.tags : [];
      const latestAttempt = problem.latestAttempt || null;
      const searchText = [
        problem.title,
        problem.notebookName,
        tags.join(' '),
        latestAttempt?.status,
      ]
        .filter(Boolean)
        .join(' ');
      return {
        problem,
        index,
        score: scoreText(tokens, searchText),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((item) => item.score >= MIN_PROBLEM_MATCH_SCORE)
    .slice(0, MAX_PROBLEM_MATCHES)
    .map((item) => item.problem);

  const prompt =
    problemRows.length === 0
      ? 'Problem bank summary: this course currently has 0 available problems in the course problem bank. For problem-bank selection requests, explicitly say that no course problem-bank items are available instead of inventing questions.'
      : [
          `Problem bank summary: this course currently has ${problemRows.length} available problem-bank items.`,
          'Only the compact summaries below are attached. If the student asks for exact difficulty but difficulty is not present here, say that the attached summary does not expose difficulty and choose conservatively from titles/tags/recent-attempt status.',
          selected.length
            ? `Top candidate problem summaries:\n${selected
                .map((problem, index) => {
                  const tags =
                    Array.isArray(problem.tags) && problem.tags.length
                      ? ` tags=${problem.tags.slice(0, 5).join(', ')}`
                      : '';
                  const notebook = problem.notebookName ? ` notebook=${problem.notebookName}` : '';
                  const attempt = problem.latestAttempt?.status
                    ? ` latestAttempt=${problem.latestAttempt.status}`
                    : ' latestAttempt=unattempted';
                  return `${index + 1}. ${problem.title}${notebook}${tags}${attempt}`;
                })
                .join('\n')}`
            : 'No compact problem summaries matched this turn. Do not claim to select from the problem bank; ask to broaden the criteria or label any created exercises as self-generated practice.',
        ].join('\n');

  return {
    storage: 'course-chat-text-harness',
    vectorUsed: false,
    counts: {
      direct: 0,
      semantic: 0,
      knowledge: selected.length,
      sourceEvidence: 0,
      learnerAnalytics: 0,
    },
    searchIntent: {
      kind: 'course_chat_text_test',
      knowledgeTypes: problemRows.length > 0 ? ['problem_bank'] : [],
    },
    scope: {
      effectiveMode: 'course',
      expanded: false,
      reason: 'Text harness attaches compact problem-bank summaries for manual review.',
    },
    knowledgeMatches: selected.map((problem) => ({
      id: problem.id,
      title: problem.title || 'Untitled problem',
      metadata: {
        tags: Array.isArray(problem.tags) ? problem.tags : [],
        notebookName: problem.notebookName || undefined,
        attemptStatus: problem.latestAttempt?.status || 'unattempted',
      },
    })),
    prompt,
  };
}

function buildCourseContextFromNotebookData(course, notebooks, question, problems = []) {
  const tokens = tokenize(question);
  const selectedNotebooks = notebooks
    .map((notebook) => {
      const scenes = (notebook.scenes || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const markdownSections = (notebook.markdownSections || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const useMarkdownPages =
        markdownSections.length > 0 &&
        (scenes.length === 0 || String(notebook.notebookKind || '').toLowerCase() === 'markdown');
      const pages = (useMarkdownPages ? markdownSections : scenes).map((page) => {
        const digest = focusedDigest(
          useMarkdownPages ? markdownSectionSearchText(page) : sceneSearchText(page),
          tokens,
        );
        return {
          id: page.id,
          order: (page.order ?? 0) + 1,
          title: page.title || '未命名页面',
          digest: compact(digest, MAX_PAGE_DIGEST_LENGTH + 8),
          sourceScore: scoreText(tokens, `${page.title || ''} ${digest}`),
        };
      });
      const metaScore = scoreText(
        tokens,
        [notebook.name, notebook.description || '', ...(notebook.tags || [])].join(' '),
      );
      const topPageScore = pages.reduce((best, page) => Math.max(best, page.sourceScore), 0);
      const pageScoreTotal = pages.reduce((total, page) => total + page.sourceScore, 0);
      const selectedPages = pages
        .slice()
        .sort((a, b) => b.sourceScore - a.sourceScore || a.order - b.order)
        .slice(0, MAX_PAGES_PER_NOTEBOOK)
        .sort((a, b) => a.order - b.order);
      return {
        id: notebook.id,
        name: notebook.name,
        description: notebook.description || undefined,
        tags: notebook.tags || [],
        updatedAt: notebook.updatedAt,
        pages: selectedPages,
        privateMemories: [],
        sourceScore: metaScore + topPageScore + Math.min(pageScoreTotal, 12),
      };
    })
    .sort((a, b) => b.sourceScore - a.sourceScore || (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_NOTEBOOKS);

  return {
    course: {
      id: course.id,
      name: course.name || '当前课程',
      description: course.description || undefined,
      language: course.language || 'zh-CN',
      purpose: course.purpose || 'university',
      tags: course.tags || [],
      university: course.university || undefined,
      courseCode: course.courseCode || undefined,
    },
    learner: undefined,
    layeredMemory: buildProblemBankLayeredMemory(problems, question),
    target: {
      kind: 'orchestrator',
      id: COURSE_ORCHESTRATOR_ID,
      name: COURSE_ORCHESTRATOR_NAME,
      role: 'teacher',
    },
    notebooks: selectedNotebooks,
  };
}

function buildMockCourseService(question) {
  const course = {
    id: MOCK_COURSE_CHAT_ID,
    name: MOCK_COURSE_CHAT_NAME,
    description: '内置无数据库课程聊天测试数据。',
    language: 'zh-CN',
    purpose: 'university',
    tags: ['mock', 'course-chat', 'text-test'],
  };
  return buildCourseService({
    source: 'fixture',
    course,
    courseContext: buildCourseContextFromNotebookData(course, MOCK_NOTEBOOKS, question, []),
  });
}

function buildCourseService({ source, course, courseContext }) {
  const namespace = `openmaic.course.${safeId(course.id)}`;
  return {
    id: course.id,
    name: course.name,
    source,
    namespace,
    mcpLikeService: {
      namespace,
      resources: [
        {
          uri: `openmaic://courses/${encodeURIComponent(course.id)}/context`,
          name: 'course_context',
          description:
            'Course, notebook, page digest, and learner-memory context used for replies.',
        },
      ],
      tools: [
        {
          name: 'send_message',
          description: `Send a text message to ${course.name} and receive a course-controller reply.`,
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          },
        },
        {
          name: 'record_ui_event',
          description:
            'Record a text-test UI event such as clicking a confirmation button, changing a progress selection, or adding a generated plan to the calendar. The harness saves the event verbatim; if sendText is present, it also sends that text as the next model-bound user turn.',
          inputSchema: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              actionId: { type: 'string' },
              selection: { type: 'string' },
              sendText: { type: 'string' },
              note: { type: 'string' },
            },
            required: ['label'],
          },
        },
      ],
    },
    courseContext,
  };
}

function authHeaders(options) {
  const headers = { 'Content-Type': 'application/json' };
  if (options.userId) headers['x-user-id'] = options.userId;
  if (options.userEmail) headers['x-user-email'] = options.userEmail;
  if (options.userName) headers['x-user-name'] = options.userName;
  return headers;
}

async function resolveUserForDiscovery(options) {
  if ((!options.discover && !options.runMemoryDryRun) || options.userId || !options.autoUser) {
    return null;
  }

  loadEnvFile(path.join(ROOT, '.env.local'));
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('Cannot auto-resolve user: DATABASE_URL is not set.');
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    let user = null;
    if (options.userEmail) {
      user = await prisma.user.findUnique({
        where: { email: options.userEmail.trim().toLowerCase() },
        select: { id: true, email: true, name: true },
      });
    }

    if (!user) {
      const [owner] = await prisma.course.groupBy({
        by: ['ownerId'],
        _count: { _all: true },
        _max: { updatedAt: true },
        orderBy: { _max: { updatedAt: 'desc' } },
        take: 1,
      });
      if (owner) {
        user = await prisma.user.findUnique({
          where: { id: owner.ownerId },
          select: { id: true, email: true, name: true },
        });
      }
    }

    if (!user?.id) {
      throw new Error('Cannot auto-resolve user: no course owner found.');
    }

    options.userId = user.id;
    options.userEmail ||= user.email || '';
    options.userName ||= user.name || '';
    return {
      source: options.userEmail
        ? 'database-email-or-latest-course-owner'
        : 'database-latest-course-owner',
      userId: user.id,
      name: user.name || null,
      email: user.email || null,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for diagnostics below.
  }
  if (!response.ok) {
    const detail = json?.error || compact(text, 500) || response.statusText;
    throw new Error(`${response.status} ${detail}`);
  }
  return json;
}

function shouldDiscoverCourse(course, filters) {
  const effectiveFilters = filters.filter((filter) => filter !== 'mock');
  if (!effectiveFilters.length || effectiveFilters.includes('all')) return true;
  return effectiveFilters.some((filter) => {
    const normalized = filter.toLowerCase();
    return (
      course.id === filter ||
      course.name === filter ||
      course.courseCode === filter ||
      String(course.id || '')
        .toLowerCase()
        .includes(normalized) ||
      String(course.name || '')
        .toLowerCase()
        .includes(normalized) ||
      String(course.courseCode || '')
        .toLowerCase()
        .includes(normalized)
    );
  });
}

async function discoverCourseServices(options, question) {
  const headers = authHeaders(options);
  const coursesData = await fetchJson(`${options.baseUrl}/api/courses`, { headers });
  const courses = (Array.isArray(coursesData?.courses) ? coursesData.courses : []).filter(
    (course) => shouldDiscoverCourse(course, options.courseFilters),
  );
  const services = [];

  for (const course of courses) {
    const notebooksData = await fetchJson(
      `${options.baseUrl}/api/notebooks?courseId=${encodeURIComponent(course.id)}`,
      { headers },
    );
    const notebookRows = Array.isArray(notebooksData?.notebooks) ? notebooksData.notebooks : [];
    const notebooks = [];
    for (const row of notebookRows.slice(0, 12)) {
      try {
        const detail = await fetchJson(
          `${options.baseUrl}/api/notebooks/${encodeURIComponent(row.id)}`,
          { headers },
        );
        notebooks.push({
          ...row,
          notebookKind: detail?.notebook?.notebookKind || row.notebookKind,
          scenes: Array.isArray(detail?.notebook?.scenes) ? detail.notebook.scenes : [],
          markdownSections: Array.isArray(detail?.notebook?.markdownSections)
            ? detail.notebook.markdownSections
            : [],
        });
      } catch (error) {
        notebooks.push({ ...row, scenes: [], markdownSections: [], loadError: error.message });
      }
    }
    let problems = [];
    try {
      const problemsData = await fetchJson(
        `${options.baseUrl}/api/courses/${encodeURIComponent(course.id)}/problems?summary=1`,
        { headers },
      );
      problems = Array.isArray(problemsData?.problems) ? problemsData.problems : [];
    } catch (error) {
      problems = [
        {
          id: 'problem-bank-load-error',
          title: `Problem bank summary failed to load: ${
            error instanceof Error ? error.message : String(error)
          }`,
          tags: ['problem-bank-load-error'],
        },
      ];
    }

    services.push(
      buildCourseService({
        source: 'api',
        course,
        courseContext: buildCourseContextFromNotebookData(course, notebooks, question, problems),
      }),
    );
  }

  return services;
}

function shouldKeepService(service, filters) {
  if (!filters.length || filters.includes('all')) return true;
  return filters.some((filter) => {
    const normalized = filter === 'mock' ? MOCK_COURSE_CHAT_ID : filter;
    return (
      service.id === normalized ||
      service.name === filter ||
      service.namespace === filter ||
      service.id.toLowerCase().includes(normalized.toLowerCase()) ||
      service.name.toLowerCase().includes(filter.toLowerCase())
    );
  });
}

function makeUserMessage(message, index, metadata = {}) {
  const now = Date.now();
  return {
    id: `course-text-test-user-${now}-${index}`,
    role: 'user',
    parts: [{ type: 'text', text: message }],
    metadata: {
      senderName: '你',
      originalRole: 'user',
      createdAt: now,
      ...metadata,
    },
  };
}

function makeAssistantMessage(answer, turnIndex, agentNames = []) {
  const now = Date.now();
  return {
    id: `course-text-test-assistant-${now}-${turnIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: answer }],
    metadata: {
      senderName: agentNames[0] || COURSE_ORCHESTRATOR_NAME,
      originalRole: 'agent',
      agentId: COURSE_ORCHESTRATOR_ID,
      createdAt: now,
    },
  };
}

function buildAgentConfig() {
  return {
    id: COURSE_ORCHESTRATOR_ID,
    name: COURSE_ORCHESTRATOR_NAME,
    avatar: '',
    role: 'teacher',
    persona:
      '你是课程总控老师。先判断用户的问题应该由现有笔记回答、补充笔记，还是协同多个笔记本完成；在直接回答时，要像耐心的课程导师一样讲清概念、步骤、例子和易错点。',
    color: '#7c3aed',
    allowedActions: [],
    priority: 100,
    isGenerated: false,
  };
}

function courseContextForRequest(service, workflowState) {
  const courseContext = cloneJson(service.courseContext);
  const confirmedMemoryWrites = workflowState?.confirmedMemoryWrites || [];
  if (!confirmedMemoryWrites.length) return courseContext;

  const memoryLines = confirmedMemoryWrites.map((memory, index) => {
    const summary =
      memory.payload?.summary ||
      memory.payload?.note ||
      memory.label ||
      `Confirmed learner memory ${index + 1}`;
    return `- ${summary}`;
  });
  const injectedPrompt = [
    'Confirmed learner memory from this text-test workflow:',
    ...memoryLines,
    'Use these only as current-course learner memory. Do not apply them to another course unless that course has its own evidence.',
  ].join('\n');

  courseContext.layeredMemory = {
    ...(courseContext.layeredMemory || {}),
    prompt: [courseContext.layeredMemory?.prompt, injectedPrompt].filter(Boolean).join('\n\n'),
  };
  courseContext.learner = {
    ...(courseContext.learner || {
      progressPercent: 0,
      attemptedProblemCount: 0,
      totalProblemCount: 0,
      dueReviewCount: 0,
      weakConcepts: [],
      nextConcepts: [],
      recentQuestions: [],
      recentAttempts: [],
      activePlans: [],
    }),
    weakConcepts: Array.from(
      new Set([
        ...(courseContext.learner?.weakConcepts || []).filter(Boolean),
        ...memoryLines.map((line) => line.replace(/^-\s*/, '').slice(0, 80)),
      ]),
    ),
  };
  return courseContext;
}

function buildChatRequest(service, messages, options, workflowState) {
  return {
    messages: JSON.parse(JSON.stringify(messages)),
    storeState: {
      stage: null,
      scenes: [],
      currentSceneId: null,
      mode: 'playback',
      whiteboardOpen: false,
    },
    config: {
      agentIds: [COURSE_ORCHESTRATOR_ID],
      sessionType: 'qa',
      surface: 'course-chat',
      agentConfigs: [buildAgentConfig()],
    },
    courseContext: courseContextForRequest(service, workflowState),
    userProfile: options.userName
      ? {
          nickname: options.userName,
        }
      : undefined,
    directorState: undefined,
    apiKey: '',
    baseUrl: undefined,
    model: options.model,
  };
}

async function consumeSse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No SSE response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  const events = [];
  const agentNames = new Set();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const dataLines = chunk
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6));
        for (const dataLine of dataLines) {
          let event;
          try {
            event = JSON.parse(dataLine);
          } catch {
            continue;
          }
          events.push(event);
          if (event.type === 'agent_start' && event.data?.agentName) {
            agentNames.add(event.data.agentName);
          }
          if (event.type === 'text_delta') {
            answer += event.data?.content || '';
          }
          if (event.type === 'error') {
            throw new Error(event.data?.message || 'Unknown SSE error');
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { answer, events, agentNames: Array.from(agentNames) };
}

async function runApiTurn(service, messages, options, workflowState) {
  const request = buildChatRequest(service, messages, options, workflowState);
  const response = await fetch(`${options.baseUrl}/api/chat`, {
    method: 'POST',
    headers: authHeaders(options),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${compact(text, 600)}`);
  }
  const sse = await consumeSse(response);
  return {
    request,
    answer: sse.answer,
    events: sse.events,
    agentNames: sse.agentNames,
    eventCounts: sse.events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function runMemoryWriteDryRun(options, candidates) {
  const candidateRows = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!candidateRows.length) {
    return {
      ok: true,
      skipped: true,
      reason: 'No durable memory write candidates were confirmed in this scenario.',
      request: { dryRun: true, candidates: [] },
      response: null,
    };
  }
  const request = {
    dryRun: true,
    candidates: candidateRows,
  };
  try {
    const response = await fetchJson(`${options.baseUrl}/api/memory/write`, {
      method: 'POST',
      headers: authHeaders(options),
      body: JSON.stringify(request),
    });
    return {
      ok: true,
      skipped: false,
      request,
      response,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      request,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWorkflowState(service) {
  return {
    serviceId: service.id,
    serviceName: service.name,
    pendingActions: [],
    confirmedActions: [],
    cancelledActions: [],
    unmatchedUiEvents: [],
    calendarItems: [],
    calendarOperations: [],
    calendarLookups: [],
    progressConfirmations: [],
    practiceRequests: [],
    classroomRequests: [],
    proposedMemoryWrites: [],
    confirmedMemoryWrites: [],
    durableMemoryWriteCandidates: [],
    textOnlyConfirmationPrompts: [],
    conversationBoundaries: [],
    snapshots: [],
  };
}

function isLearningActionName(actionName) {
  return LEARNING_ACTION_NAMES.has(String(actionName || ''));
}

function inferConfirmation(actionName, params = {}) {
  if (params.requiresConfirmation === true) return 'required';
  if (params.requiresConfirmation === false) return 'none';
  return actionName === 'calendar.search' ? 'none' : 'required';
}

function actionLabel(actionName, params = {}) {
  const raw = params.label || params.title || params.topic || params.summary || actionName;
  return typeof raw === 'string' ? raw : actionName;
}

function learningActionFromEvent(event, index) {
  if (event?.type !== 'action' || !isLearningActionName(event.data?.actionName)) return null;
  const params = event.data.params || {};
  return {
    eventIndex: index,
    id: event.data.actionId,
    kind: event.data.actionName,
    label: actionLabel(event.data.actionName, params),
    status: 'proposed',
    confirmation: inferConfirmation(event.data.actionName, params),
    payload: params,
    agentId: event.data.agentId || null,
    messageId: event.data.messageId || null,
  };
}

function collectLearningActions(events) {
  return events.map(learningActionFromEvent).filter(Boolean);
}

function userTextConfirmsAction(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return (
    /(我|本人).{0,4}(确认|同意)|点击了?.{0,16}(加入日历|添加|修改|删除|生成|写入|确认)/i.test(
      value,
    ) || /(确认|同意)(写入|添加|加入|修改|删除|生成|更新)|confirmed/i.test(value)
  );
}

function userTextAsksPracticePolicy(text) {
  return /如果(之后|以后).{0,24}(练习|题库|题目|做题)|没有.{0,12}题库|不会假装|不要假装|原则|policy|hypothetical/i.test(
    String(text || ''),
  );
}

function excerptAroundMatch(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 80);
  const end = Math.min(text.length, match.index + match[0].length + 120);
  return compact(text.slice(start, end), 260);
}

function detectTextOnlyConfirmationPrompts(answer, actions, userText = '') {
  const text = String(answer || '');
  if (!text.trim()) return [];
  if (userTextConfirmsAction(userText)) return [];
  const emittedKinds = new Set(actions.map((action) => action.kind));
  const hasEmittedCalendarMutation = actions.some((action) =>
    String(action.kind || '').startsWith('calendar.propose_'),
  );
  const checks = [
    {
      kind: 'calendar.propose_add',
      label: 'calendar add confirmation text without action',
      pattern:
        /(确认|是否|可以|同意|我可以|是否希望).{0,40}(加入|添加|写入|同步|放进|放到).{0,24}(学习)?(日历|日程|calendar|schedule)|将.{0,40}(计划|安排|内容|这些).{0,24}(加入|添加|写入).{0,16}(学习)?(日历|日程|calendar|schedule)/i,
    },
    {
      kind: 'calendar.propose_update',
      label: 'calendar update confirmation text without action',
      pattern:
        /(确认|是否|可以|同意|我可以).{0,40}(修改|调整|顺延|推迟|压缩|改).{0,24}(日历|日程|计划|安排|calendar|schedule)/i,
    },
    {
      kind: 'calendar.propose_delete',
      label: 'calendar delete confirmation text without action',
      pattern:
        /(确认|是否|可以|同意|我可以).{0,40}(删除|删掉|移除|remove|delete).{0,24}(日历|日程|计划|安排|calendar|schedule)/i,
    },
    {
      kind: 'learner_progress.request_confirmation',
      label: 'progress confirmation text without action',
      pattern:
        /(需要|请|先).{0,32}(确认|告诉|提供|选择).{0,48}(进度|学习状态|掌握|可用时间|学习时间|复习范围|考试日期|progress|available time|study time|scope)/i,
    },
    {
      kind: 'practice.propose_generation',
      label: 'practice generation confirmation text without action',
      pattern:
        /(确认|是否|可以|同意|我可以).{0,40}(生成|挑选|选择|设计|出).{0,24}(练习|题目|习题|题库|practice|exercise|problem)/i,
    },
    {
      kind: 'classroom.propose_temporary_explanation',
      label: 'temporary classroom confirmation text without action',
      pattern:
        /(确认|是否|可以|同意|我可以).{0,40}(生成|开启|创建).{0,24}(临时课堂|课堂讲解|mini-lesson|classroom|lesson)/i,
    },
    {
      kind: 'memory.propose_write',
      label: 'memory write confirmation text without action',
      pattern:
        /(?:是否|可以|同意|我可以|准备|将|会).{0,48}(?:写入|保存|更新|记录到|记录为|记录成|记成).{0,28}(?:记忆|薄弱点|学习记录|memory|weakness)|(?:写入|保存|更新|记录到|记录为|记录成|记成).{0,28}(?:记忆|薄弱点|学习记录|memory|weakness).{0,24}(?:请确认|你觉得怎么样|是否可以)/i,
    },
  ];

  return checks
    .filter((check) => {
      if (emittedKinds.has(check.kind)) return false;
      if (check.kind.startsWith('calendar.propose_') && hasEmittedCalendarMutation) return false;
      if (check.kind === 'practice.propose_generation' && userTextAsksPracticePolicy(userText)) {
        return false;
      }
      return check.pattern.test(text);
    })
    .map((check) => ({
      kind: check.kind,
      label: check.label,
      excerpt: excerptAroundMatch(text, check.pattern),
    }));
}

function registerAssistantActions(workflowState, actions) {
  for (const action of actions) {
    if (action.kind === 'calendar.search') {
      workflowState.calendarLookups.push({
        actionId: action.id,
        label: action.label,
        payload: cloneJson(action.payload),
        recordedAt: Date.now(),
      });
    }
    if (action.confirmation === 'none') {
      continue;
    }
    workflowState.pendingActions.push(cloneJson(action));
    if (action.kind === 'memory.propose_write') {
      workflowState.proposedMemoryWrites.push({
        actionId: action.id,
        label: action.label,
        payload: cloneJson(action.payload),
        recordedAt: Date.now(),
      });
    }
  }
}

function appendSummaryResults(summaryPath, results) {
  let existing = [];
  if (fs.existsSync(summaryPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      if (Array.isArray(parsed)) {
        existing = parsed;
      }
    } catch {
      existing = [];
    }
  }
  const byKey = new Map();
  for (const item of [...existing, ...results]) {
    const key = `${item?.jsonPath || ''}:${item?.scenarioName || ''}:${item?.service?.id || ''}`;
    byKey.set(key, item);
  }
  writeJson(summaryPath, Array.from(byKey.values()));
}

function inferUiOutcome(step) {
  const raw = String(step.event || '')
    .trim()
    .toLowerCase();
  if (raw) {
    if (['cancel', 'cancelled', 'reject', 'rejected', 'deny', 'dismiss'].includes(raw)) {
      return 'cancelled';
    }
    if (['complete', 'completed', 'done'].includes(raw)) return 'completed';
    if (['search', 'lookup', 'inspect'].includes(raw)) return 'lookup';
    return raw;
  }
  const text = `${step.label || ''} ${step.actionId || ''}`.toLowerCase();
  if (/取消|拒绝|不要|cancel|reject|dismiss/.test(text)) return 'cancelled';
  if (/查看|查找|搜索|search|lookup/.test(text)) return 'lookup';
  return 'confirmed';
}

function actionKindAlias(actionId) {
  const value = String(actionId || '').toLowerCase();
  if (!value) return null;
  if (isLearningActionName(actionId)) return actionId;
  if (value.includes('calendar') || value.includes('日历')) {
    if (value.includes('delete') || value.includes('remove') || value.includes('删除')) {
      return 'calendar.propose_delete';
    }
    if (
      value.includes('update') ||
      value.includes('modify') ||
      value.includes('shift') ||
      value.includes('改')
    ) {
      return 'calendar.propose_update';
    }
    if (value.includes('search') || value.includes('lookup') || value.includes('查')) {
      return 'calendar.search';
    }
    return 'calendar.propose_add';
  }
  if (value.includes('progress') || value.includes('进度') || value.includes('scope')) {
    return 'learner_progress.request_confirmation';
  }
  if (
    value.includes('practice') ||
    value.includes('question') ||
    value.includes('exercise') ||
    value.includes('练习') ||
    value.includes('题')
  ) {
    return 'practice.propose_generation';
  }
  if (
    value.includes('classroom') ||
    value.includes('lecture') ||
    value.includes('讲解') ||
    value.includes('课堂')
  ) {
    return 'classroom.propose_temporary_explanation';
  }
  if (
    value.includes('memory') ||
    value.includes('weak') ||
    value.includes('掌握') ||
    value.includes('薄弱') ||
    value.includes('记忆')
  ) {
    return 'memory.propose_write';
  }
  return null;
}

function findPendingAction(workflowState, step) {
  const pending = workflowState.pendingActions.filter(
    (action) => action.status === 'proposed' || action.status === 'confirmed',
  );
  const actionId = String(step.actionId || '');
  if (actionId) {
    const exact = pending.find((action) => action.id === actionId);
    if (exact) return exact;
    const byKind = pending.filter((action) => action.kind === actionId);
    if (byKind.length) return byKind[byKind.length - 1];
    const alias = actionKindAlias(actionId);
    if (alias) {
      const candidates = pending.filter((action) => action.kind === alias);
      if (candidates.length) return candidates[candidates.length - 1];
    }
    return null;
  }
  return pending[pending.length - 1] || null;
}

function removePendingAction(workflowState, actionId) {
  workflowState.pendingActions = workflowState.pendingActions.filter(
    (action) => action.id !== actionId,
  );
}

function calendarItemsFromAction(action, step) {
  const payloadItems = Array.isArray(step.payload?.items)
    ? step.payload.items
    : Array.isArray(action.payload?.items)
      ? action.payload.items
      : [];
  if (payloadItems.length > 0) return payloadItems;
  return [
    {
      title: step.payload?.title || action.payload?.label || action.label,
      date: step.payload?.date || action.payload?.date,
      durationMinutes: step.payload?.durationMinutes || action.payload?.durationMinutes,
      reason: step.note || action.payload?.summary || action.payload?.reason,
    },
  ];
}

function memoryWriteCandidateFromAction(serviceId, action, step) {
  const payload = step.payload || action.payload || {};
  const memoryType = String(payload.memoryType || 'weakness').toLowerCase();
  const summary =
    String(payload.summary || payload.reason || action.payload?.summary || action.label || '')
      .trim()
      .slice(0, 12000) || 'Confirmed learner memory from course chat.';
  const title = String(payload.title || payload.label || action.label || 'AI 确认的学习记忆')
    .trim()
    .slice(0, 120);
  const contentType =
    memoryType === 'weakness' || memoryType === 'correction' ? 'weakness' : 'learning_pattern';
  const kind =
    memoryType === 'weakness' || memoryType === 'correction'
      ? 'knowledge_gap'
      : memoryType === 'preference'
        ? 'preference'
        : memoryType === 'mastery'
          ? 'mastery'
          : memoryType === 'progress'
            ? 'progress'
            : memoryType === 'next_step'
              ? 'next_teaching_move'
              : 'reflection';
  return {
    id: `text-test:${action.id}`,
    trigger: memoryType === 'correction' ? 'fact_correction' : 'explicit_user',
    contentType,
    targetType: 'course',
    targetId: serviceId,
    privacy: 'private',
    title,
    text: summary,
    source: 'course-chat-text-harness',
    sourceRef: {
      actionId: action.id,
      actionKind: action.kind,
      memoryType,
      uiLabel: step.label,
      evidence: action.evidence || action.payload?.evidence || null,
    },
    studyMemory: {
      targetType: 'course',
      targetId: serviceId,
      scope: 'private',
      kind,
      title,
      text: summary,
      reason:
        String(payload.reason || '').trim() ||
        'Student confirmed this learner memory during a course-chat text test workflow.',
      question: String(step.sendText || '').trim() || undefined,
      sourceReferences: {
        source: 'course-chat-text-harness',
        actionId: action.id,
        memoryType,
        uiLabel: step.label,
        evidence: action.evidence || action.payload?.evidence || null,
      },
    },
  };
}

function applyConfirmedAction(workflowState, action, step, outcome) {
  const base = {
    actionId: action.id,
    kind: action.kind,
    label: action.label,
    outcome,
    uiLabel: step.label,
    selection: step.selection || null,
    payload: cloneJson(step.payload || action.payload || {}),
    recordedAt: Date.now(),
  };

  if (outcome === 'cancelled') {
    workflowState.cancelledActions.push(base);
    removePendingAction(workflowState, action.id);
    return base;
  }

  workflowState.confirmedActions.push(base);
  removePendingAction(workflowState, action.id);

  if (
    action.kind === 'memory.propose_write' &&
    String(base.payload?.memoryType || action.payload?.memoryType || '').toLowerCase() ===
      'correction'
  ) {
    const superseded = workflowState.pendingActions.filter(
      (pending) => pending.kind === 'memory.propose_write',
    );
    for (const pending of superseded) {
      workflowState.cancelledActions.push({
        actionId: pending.id,
        kind: pending.kind,
        label: pending.label,
        outcome: 'superseded',
        uiLabel: step.label,
        selection: null,
        payload: cloneJson(pending.payload || {}),
        recordedAt: Date.now(),
      });
    }
    workflowState.pendingActions = workflowState.pendingActions.filter(
      (pending) => pending.kind !== 'memory.propose_write',
    );
  }

  if (action.kind === 'calendar.propose_add') {
    const items = calendarItemsFromAction(action, step).map((item, index) => ({
      id: `${action.id}-calendar-${index + 1}`,
      sourceActionId: action.id,
      ...cloneJson(item),
    }));
    workflowState.calendarItems.push(...items);
  } else if (
    action.kind === 'calendar.propose_update' ||
    action.kind === 'calendar.propose_delete'
  ) {
    workflowState.calendarOperations.push(base);
  } else if (action.kind === 'calendar.search') {
    workflowState.calendarLookups.push(base);
  } else if (action.kind === 'learner_progress.request_confirmation') {
    workflowState.progressConfirmations.push(base);
  } else if (action.kind === 'practice.propose_generation') {
    workflowState.practiceRequests.push(base);
  } else if (action.kind === 'classroom.propose_temporary_explanation') {
    workflowState.classroomRequests.push(base);
  } else if (action.kind === 'memory.propose_write') {
    workflowState.confirmedMemoryWrites.push(base);
    workflowState.durableMemoryWriteCandidates.push(
      memoryWriteCandidateFromAction(workflowState.serviceId, action, step),
    );
  }

  return base;
}

function applyUiStepToWorkflowState(workflowState, step) {
  const outcome = inferUiOutcome(step);
  const action = findPendingAction(workflowState, step);
  if (!action) {
    const event = {
      label: step.label,
      actionId: step.actionId || null,
      outcome,
      selection: step.selection || null,
      payload: cloneJson(step.payload || null),
      recordedAt: Date.now(),
    };
    workflowState.unmatchedUiEvents.push(event);
    return { outcome, matchedAction: null, event };
  }
  const event = applyConfirmedAction(workflowState, action, step, outcome);
  return {
    outcome,
    matchedAction: { id: action.id, kind: action.kind, label: action.label },
    event,
  };
}

function describeUiStep(step) {
  const lines = [`label: ${step.label}`];
  if (step.actionId) lines.push(`actionId: ${step.actionId}`);
  if (step.event) lines.push(`event: ${step.event}`);
  if (step.selection) lines.push(`selection: ${step.selection}`);
  if (step.note) lines.push(`note: ${step.note}`);
  if (step.payload) lines.push(`payload: ${JSON.stringify(step.payload)}`);
  return lines.join('\n');
}

function makeUiMetadata(step) {
  return {
    senderName: 'UI',
    originalRole: 'user',
    senderKind: 'system',
    uiEvent: {
      label: step.label,
      actionId: step.actionId || null,
      event: step.event || null,
      selection: step.selection || null,
      note: step.note || null,
      payload: step.payload || null,
    },
  };
}

async function runConversationScenario(service, options) {
  const serviceInfo = serviceSummary(service);
  let messages = [];
  const turns = [];
  const workflowState = createWorkflowState(service);
  const startedAt = Date.now();

  for (let stepIndex = 0; stepIndex < options.steps.length; stepIndex++) {
    const step = options.steps[stepIndex];
    const userText = textSentToModel(step);
    if (step.kind === 'new_conversation') {
      const stateBefore = cloneJson(workflowState);
      messages = [];
      const boundary = {
        turn: stepIndex + 1,
        label: step.label,
        note: step.note || null,
        recordedAt: Date.now(),
      };
      workflowState.conversationBoundaries.push(boundary);
      turns.push({
        turn: stepIndex + 1,
        kind: 'new_conversation',
        status: 'recorded',
        sentToModel: false,
        user: '',
        assistant: '',
        boundary,
        durationMs: 0,
        request: null,
        events: [],
        workflowStateBefore: stateBefore,
        workflowStateAfter: cloneJson(workflowState),
      });
      console.log(`  step ${stepIndex + 1} started new conversation ${step.label}`);
      continue;
    }

    if (step.kind === 'snapshot') {
      const snapshot = {
        turn: stepIndex + 1,
        label: step.label,
        query: step.query || null,
        note: step.note || null,
        state: cloneJson(workflowState),
        recordedAt: Date.now(),
      };
      workflowState.snapshots.push(snapshot);
      turns.push({
        turn: stepIndex + 1,
        kind: 'snapshot',
        status: 'recorded',
        sentToModel: false,
        user: '',
        assistant: '',
        snapshot,
        durationMs: 0,
        request: null,
        events: [],
        workflowStateBefore: snapshot.state,
        workflowStateAfter: cloneJson(workflowState),
      });
      console.log(`  step ${stepIndex + 1} recorded state snapshot ${step.label}`);
      continue;
    }

    if (step.kind === 'ui' && !userText) {
      const stateBefore = cloneJson(workflowState);
      const workflowEvent = applyUiStepToWorkflowState(workflowState, step);
      turns.push({
        turn: stepIndex + 1,
        kind: 'ui',
        status: 'recorded',
        sentToModel: false,
        user: '',
        assistant: '',
        uiEvent: {
          label: step.label,
          actionId: step.actionId || null,
          event: step.event || null,
          selection: step.selection || null,
          note: step.note || null,
          payload: step.payload || null,
        },
        workflowEvent,
        durationMs: 0,
        request: null,
        events: [],
        workflowStateBefore: stateBefore,
        workflowStateAfter: cloneJson(workflowState),
      });
      console.log(`  step ${stepIndex + 1} recorded UI event ${step.label}`);
      continue;
    }

    const stateBefore = cloneJson(workflowState);
    const workflowEvent =
      step.kind === 'ui' ? applyUiStepToWorkflowState(workflowState, step) : null;
    const messageMetadata = step.kind === 'ui' ? makeUiMetadata(step) : {};
    messages.push(makeUserMessage(userText, stepIndex, messageMetadata));
    const turnStartedAt = Date.now();

    try {
      const turn = await runApiTurn(service, messages, options, workflowState);
      const assistantActions = collectLearningActions(turn.events);
      const textOnlyConfirmationPrompts = detectTextOnlyConfirmationPrompts(
        turn.answer,
        assistantActions,
        userText,
      );
      for (const prompt of textOnlyConfirmationPrompts) {
        workflowState.textOnlyConfirmationPrompts.push({
          turn: stepIndex + 1,
          user: userText,
          ...prompt,
          recordedAt: Date.now(),
        });
      }
      registerAssistantActions(workflowState, assistantActions);
      const assistantMessage = makeAssistantMessage(turn.answer, stepIndex, turn.agentNames);
      if (assistantActions.length > 0) {
        assistantMessage.metadata.learningActions = assistantActions.map((action) => ({
          id: action.id,
          kind: action.kind,
          label: action.label,
          status: action.status,
          confirmation: action.confirmation,
          payload: action.payload,
        }));
      }
      messages.push(assistantMessage);
      turns.push({
        turn: stepIndex + 1,
        kind: step.kind,
        status: 'completed',
        sentToModel: true,
        user: userText,
        assistant: turn.answer,
        uiEvent:
          step.kind === 'ui'
            ? {
                label: step.label,
                actionId: step.actionId || null,
                event: step.event || null,
                selection: step.selection || null,
                note: step.note || null,
                payload: step.payload || null,
              }
            : undefined,
        workflowEvent: workflowEvent || undefined,
        assistantActions,
        textOnlyConfirmationPrompts,
        agentNames: turn.agentNames,
        eventCounts: turn.eventCounts,
        durationMs: Date.now() - turnStartedAt,
        request: turn.request,
        events: turn.events,
        workflowStateBefore: stateBefore,
        workflowStateAfter: cloneJson(workflowState),
      });
      console.log(`  step ${stepIndex + 1} completed ${compact(turn.answer, 140)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      turns.push({
        turn: stepIndex + 1,
        kind: step.kind,
        status: 'failed',
        sentToModel: true,
        user: userText,
        assistant: '',
        uiEvent:
          step.kind === 'ui'
            ? {
                label: step.label,
                actionId: step.actionId || null,
                event: step.event || null,
                selection: step.selection || null,
                note: step.note || null,
                payload: step.payload || null,
              }
            : undefined,
        workflowEvent: workflowEvent || undefined,
        error: errorMessage,
        durationMs: Date.now() - turnStartedAt,
        request: buildChatRequest(service, messages, options, workflowState),
        events: [],
        workflowStateBefore: stateBefore,
        workflowStateAfter: cloneJson(workflowState),
      });
      console.log(`  step ${stepIndex + 1} failed ${errorMessage}`);
      break;
    }
  }

  const failed = turns.some((turn) => turn.status === 'failed');
  return {
    scenarioName: options.scenarioName,
    service: serviceInfo,
    model: options.model,
    status: failed ? 'failed' : 'completed',
    durationMs: Date.now() - startedAt,
    messages,
    turns,
    steps: options.steps,
    workflowState,
  };
}

function serviceSummary(service) {
  const layeredMemory = service.courseContext.layeredMemory;
  const problemBankPrompt = layeredMemory?.prompt || '';
  const problemBankTotalMatch = problemBankPrompt.match(
    /currently has (\d+) available problem-bank items|has 0 available problems/,
  );
  const problemBankTotal = problemBankPrompt.includes('has 0 available problems')
    ? 0
    : problemBankTotalMatch?.[1]
      ? Number(problemBankTotalMatch[1])
      : undefined;
  return {
    id: service.id,
    name: service.name,
    namespace: service.namespace,
    source: service.source,
    notebookCount: service.courseContext.notebooks.length,
    pageCount: service.courseContext.notebooks.reduce(
      (total, notebook) => total + notebook.pages.length,
      0,
    ),
    problemBankTotal,
    problemBankAttachedMatches: layeredMemory?.knowledgeMatches?.length || 0,
  };
}

function writeConversationTranscript(filePath, result) {
  const completedTurns = result.turns.filter((turn) => turn.status === 'completed').length;
  const recordedUiTurns = result.turns.filter((turn) => turn.status === 'recorded').length;
  const lines = [
    `# ${result.scenarioName}`,
    '',
    `- course: ${result.service.name}`,
    `- service: ${result.service.namespace}`,
    `- source: ${result.service.source}`,
    `- model: ${result.model}`,
    `- status: ${result.status}`,
    `- modelTurns: ${completedTurns}`,
    `- recordedUiEvents: ${recordedUiTurns}`,
    `- steps: ${result.turns.length}`,
    `- durationMs: ${result.durationMs}`,
    result.memoryDryRun
      ? `- memoryDryRun: ${result.memoryDryRun.ok ? 'ok' : 'failed'} (${result.memoryDryRun.jsonPath})`
      : '',
    '',
  ].filter((line) => line !== '');

  for (const turn of result.turns) {
    lines.push(`## Step ${turn.turn}`);
    lines.push('');
    lines.push(`- kind: ${turn.kind || 'user'}`);
    lines.push(`- status: ${turn.status}`);
    lines.push(`- sentToModel: ${turn.sentToModel ? 'yes' : 'no'}`);
    lines.push(`- durationMs: ${turn.durationMs}`);
    if (turn.eventCounts) lines.push(`- events: ${JSON.stringify(turn.eventCounts)}`);
    if (turn.error) lines.push(`- error: ${turn.error}`);
    if (turn.assistantActions?.length) {
      lines.push(`- assistantLearningActions: ${turn.assistantActions.length}`);
    }
    lines.push('');
    if (turn.kind === 'ui' && turn.uiEvent) {
      lines.push('### UI Event');
      lines.push('');
      lines.push(describeUiStep(turn.uiEvent));
      lines.push('');
      if (turn.workflowEvent) {
        lines.push('### UI Workflow Result');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(turn.workflowEvent, null, 2));
        lines.push('```');
        lines.push('');
      }
    }
    if (turn.kind === 'snapshot' && turn.snapshot) {
      lines.push('### State Snapshot');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(turn.snapshot, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (turn.kind === 'new_conversation' && turn.boundary) {
      lines.push('### Conversation Boundary');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(turn.boundary, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (turn.assistantActions?.length) {
      lines.push('### Assistant Learning Actions');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(turn.assistantActions, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (turn.sentToModel) {
      lines.push(turn.kind === 'ui' ? '### Sent To Model' : '### User');
      lines.push('');
      lines.push(turn.user);
      lines.push('');
      lines.push('### Assistant');
      lines.push('');
      lines.push(turn.assistant?.trim() || '(empty)');
    } else {
      lines.push('### Model Request');
      lines.push('');
      lines.push('(not sent)');
    }
    if (turn.workflowStateAfter) {
      lines.push('');
      lines.push('### Workflow State After Step');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(turn.workflowStateAfter, null, 2));
      lines.push('```');
    }
    lines.push('');
  }

  if (result.workflowState) {
    lines.push('## Final Workflow State');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(result.workflowState, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (result.memoryDryRun) {
    lines.push('## Memory Write Dry Run');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(result.memoryDryRun, null, 2));
    lines.push('```');
    lines.push('');
  }

  fs.writeFileSync(filePath, lines.join('\n'));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const firstQuestion = options.messages[0] || DEFAULT_MESSAGE;
  const outDir = options.outDir || path.join(OUT_ROOT, timestampSlug());
  ensureDir(outDir);

  let services = [buildMockCourseService(firstQuestion)];
  const discoveryErrors = [];
  let resolvedUser = null;
  if (options.discover || options.runMemoryDryRun) {
    try {
      resolvedUser = await resolveUserForDiscovery(options);
    } catch (error) {
      discoveryErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (options.discover) {
    try {
      services.push(...(await discoverCourseServices(options, firstQuestion)));
    } catch (error) {
      discoveryErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  services = services.filter((service) => shouldKeepService(service, options.courseFilters));
  if (options.limit > 0) services = services.slice(0, options.limit);

  if (services.length === 0) {
    throw new Error('No course services selected. Try --course=mock or --discover --user-id=...');
  }

  const serviceSummaries = services.map(serviceSummary);
  writeJson(path.join(outDir, 'services.json'), services);

  const plannedConversations = services.map((service) => {
    const plannedMessages = options.steps
      .map((step, index) => {
        const text = textSentToModel(step);
        if (!text) return null;
        return makeUserMessage(text, index, step.kind === 'ui' ? makeUiMetadata(step) : {});
      })
      .filter(Boolean);
    return {
      scenarioName: options.scenarioName,
      service: serviceSummary(service),
      steps: options.steps,
      modelBoundMessages: options.messages,
      dryRunNote:
        'Dry-run requests contain only planned model-bound messages. UI steps without sendText, snapshots, and new_conversation boundaries are transcript-only. Run with --run-api to capture assistant outputs, learning actions, workflow state, and full multi-turn request history.',
      firstTurnRequest: buildChatRequest(service, plannedMessages.slice(0, 1), options),
    };
  });
  writeJson(path.join(outDir, 'planned-conversations.json'), plannedConversations);

  const manifest = {
    createdAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    model: options.model,
    runApi: options.runApi,
    runMemoryDryRun: options.runMemoryDryRun,
    discover: options.discover,
    discoveryErrors,
    resolvedUser,
    selectedServices: serviceSummaries,
    scenarioName: options.scenarioName,
    steps: options.steps,
    modelBoundMessages: options.messages,
    stepCount: options.steps.length,
    modelBoundMessageCount: options.messages.length,
  };
  writeJson(path.join(outDir, 'manifest.json'), manifest);

  if (!options.runApi) {
    console.log(`Wrote dry-run course chat service artifacts to ${outDir}`);
    console.log(JSON.stringify({ services: serviceSummaries, discoveryErrors }, null, 2));
    console.log('Add --run-api to send the messages to local /api/chat and write transcripts.');
    return;
  }

  const results = [];
  for (const service of services) {
    console.log(`Running ${service.name} / ${options.scenarioName}...`);
    const result = await runConversationScenario(service, options);
    const basename = `${safeId(service.id)}-${safeId(options.scenarioName)}`;
    let memoryDryRunPath = null;
    if (options.runMemoryDryRun) {
      const memoryDryRun = await runMemoryWriteDryRun(
        options,
        result.workflowState.durableMemoryWriteCandidates,
      );
      memoryDryRunPath = `${basename}.memory-dry-run.json`;
      writeJson(path.join(outDir, memoryDryRunPath), memoryDryRun);
      result.memoryDryRun = {
        ok: memoryDryRun.ok,
        skipped: memoryDryRun.skipped,
        candidateCount: memoryDryRun.request?.candidates?.length || 0,
        executedCount: memoryDryRun.response?.counts?.executed || 0,
        plannedActions: memoryDryRun.response?.results?.map((item) => item.action) || [],
        error: memoryDryRun.error || null,
        jsonPath: memoryDryRunPath,
      };
    }
    writeJson(path.join(outDir, `${basename}.conversation.json`), result);
    writeConversationTranscript(path.join(outDir, `${basename}.conversation.md`), result);
    results.push({
      scenarioName: result.scenarioName,
      service: result.service,
      model: result.model,
      status: result.status,
      stepCount: result.turns.length,
      modelTurnCount: result.turns.filter((turn) => turn.sentToModel).length,
      completedTurnCount: result.turns.filter((turn) => turn.status === 'completed').length,
      recordedUiEventCount: result.turns.filter((turn) => turn.status === 'recorded').length,
      assistantLearningActionCount: result.turns.reduce(
        (total, turn) => total + (turn.assistantActions?.length || 0),
        0,
      ),
      pendingLearningActionCount: result.workflowState.pendingActions.length,
      confirmedLearningActionCount: result.workflowState.confirmedActions.length,
      textOnlyConfirmationPromptCount:
        result.workflowState.textOnlyConfirmationPrompts?.length || 0,
      durableMemoryWriteCandidateCount:
        result.workflowState.durableMemoryWriteCandidates?.length || 0,
      memoryDryRun: result.memoryDryRun || null,
      durationMs: result.durationMs,
      transcriptPath: `${basename}.conversation.md`,
      jsonPath: `${basename}.conversation.json`,
    });
  }

  appendSummaryResults(path.join(outDir, 'summary.json'), results);
  console.log(`Wrote full course chat conversations to ${outDir}`);
  console.log(
    JSON.stringify(
      results.map((result) => ({
        scenario: result.scenarioName,
        service: result.service.name,
        status: result.status,
        steps: result.stepCount,
        modelTurns: `${result.completedTurnCount}/${result.modelTurnCount}`,
        recordedUiEvents: result.recordedUiEventCount,
        learningActions: result.assistantLearningActionCount,
        confirmedActions: result.confirmedLearningActionCount,
        pendingActions: result.pendingLearningActionCount,
        textOnlyConfirmationPrompts: result.textOnlyConfirmationPromptCount,
        durableMemoryCandidates: result.durableMemoryWriteCandidateCount,
        memoryDryRun: result.memoryDryRun
          ? {
              ok: result.memoryDryRun.ok,
              skipped: result.memoryDryRun.skipped,
              actions: result.memoryDryRun.plannedActions,
              error: result.memoryDryRun.error,
              jsonPath: result.memoryDryRun.jsonPath,
            }
          : null,
        durationMs: result.durationMs,
        transcriptPath: result.transcriptPath,
      })),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
