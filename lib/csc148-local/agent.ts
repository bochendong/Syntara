import { getCsc148LocalDataset, searchCsc148LocalDataset } from '@/lib/csc148-local/data';
import type {
  Csc148LocalAgentDataFlowStep,
  Csc148LocalAgentPromptPart,
  Csc148LocalAgentRun,
  Csc148LocalSearchHit,
} from '@/lib/csc148-local/types';

const CSC148_AGENT_SYSTEM_PROMPT = `
你是 Syntara 的 CSC148 本地课程助教。你的回答只能使用当前本地课程包和本地题库证据。

课程边界：
- 课程代码：CSC148。
- 优先覆盖 Python memory model、function design recipe、testing、OOP、inheritance、ADT、Stack、Queue、exceptions、linked list、recursion、tree、BST、sorting、runtime。
- 回答代码设计题时必须保留 CSC148 的风格：完整 function/class contract、type annotations、docstring examples、Instance Attributes、Representation Invariants、public/private boundary。
- 不要把 CPSC107 的 HtDF / mutual reference 模板混入 CSC148。

链路要求：
- 先说明命中的课程内容与题库证据。
- 再给学习/练习建议。
- 如果本地题库证据不足，要明确说“本地题库没有足够证据”，不要编造题目。
- 对缺失图片的老题，只能标注缺失，不能假装看到了图。
`.trim();

function normalizeQueryForTrace(message: string): string {
  return message
    .replace(/\bri\b/gi, 'representation invariant')
    .replace(/链表/g, 'linked list')
    .replace(/树/g, 'tree')
    .replace(/不变量/g, 'representation invariant')
    .trim();
}

function trimEvidence(value: string | null | undefined, maxLength: number): string {
  if (!value) return '';
  const compact = value
    .replace(/!\[[^\]]*]\([^)]+\)/g, '[image]')
    .replace(/\s+/g, ' ')
    .trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function cleanEvidenceTitle(value: string): string {
  return value
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSectionEvidence(
  hit: Extract<Csc148LocalSearchHit, { kind: 'section' }>,
  index: number,
) {
  return [
    `课程证据 ${index + 1}: ${hit.notebook.name} / ${hit.section.title}`,
    `score=${hit.score}`,
    `summary=${hit.section.summary ?? 'N/A'}`,
    `excerpt=${trimEvidence(hit.section.markdown, 520)}`,
  ].join('\n');
}

function formatProblemEvidence(
  hit: Extract<Csc148LocalSearchHit, { kind: 'problem' }>,
  index: number,
) {
  const problem = hit.problem;
  return [
    `题库证据 ${index + 1}: ${problem.title}`,
    `score=${hit.score}`,
    `type=${problem.type}; difficulty=${problem.difficulty}; section=${problem.sectionTitle ?? 'N/A'}`,
    `tags=${problem.tags.join(', ') || 'N/A'}`,
    `question=${trimEvidence(problem.question, 520)}`,
    problem.options.length
      ? `options=${problem.options.map((option, i) => `${String.fromCharCode(65 + i)}. ${trimEvidence(option, 120)}`).join(' | ')}`
      : '',
    problem.correctAnswer ? `answer=${problem.correctAnswer}` : '',
    problem.explanation ? `explanation=${trimEvidence(problem.explanation, 360)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPromptParts(args: {
  userMessage: string;
  normalizedQuery: string;
  sectionEvidence: string;
  problemEvidence: string;
}): Csc148LocalAgentPromptPart[] {
  return [
    {
      role: 'system',
      title: 'CSC148 agent system prompt',
      content: CSC148_AGENT_SYSTEM_PROMPT,
    },
    {
      role: 'developer',
      title: '本地数据约束',
      content: `
本次运行是 /test/end-to-end-learning-loop/chat 的 CSC148 闭环测试。
- 课程内容来自 data/csc148/course.json。
- 题库来自 data/csc148/problem-bank.json。
- 不调用数据库、不调用正式聊天 API、不调用 LLM provider。
- 当前 normalized query: ${args.normalizedQuery}
      `.trim(),
    },
    {
      role: 'user',
      title: '用户问题',
      content: args.userMessage,
    },
    {
      role: 'developer',
      title: '检索到的课程证据',
      content: args.sectionEvidence || '没有命中课程内容。',
    },
    {
      role: 'developer',
      title: '检索到的题库证据',
      content: args.problemEvidence || '没有命中题库题目。',
    },
  ];
}

function buildAssistantReply(args: {
  selectedSections: Extract<Csc148LocalSearchHit, { kind: 'section' }>[];
  selectedProblems: Extract<Csc148LocalSearchHit, { kind: 'problem' }>[];
}): string {
  const sectionLines = args.selectedSections.map(
    (hit, index) => `${index + 1}. ${hit.section.title}（${hit.notebook.name}）`,
  );
  const problemLines = args.selectedProblems.map(
    (hit, index) =>
      `${index + 1}. ${cleanEvidenceTitle(hit.problem.title)}（${hit.problem.type} / ${hit.problem.difficulty}）`,
  );
  const firstSection = args.selectedSections[0];
  const firstProblem = args.selectedProblems[0];

  return `
我先按本地 CSC148 包做了检索，没有走数据库或正式聊天 API。

命中的课程内容：
${sectionLines.length ? sectionLines.join('\n') : '- 本地课程内容没有足够命中。'}

命中的题库入口：
${problemLines.length ? problemLines.join('\n') : '- 本地题库没有足够命中。'}

建议链路：
1. 先讲 ${firstSection ? `「${firstSection.section.title}」` : '当前问题对应的课程片段'}，目标是把概念边界讲清楚。
2. 再用 ${firstProblem ? `「${cleanEvidenceTitle(firstProblem.problem.title)}」` : '本地题库里的匹配题'} 做诊断，观察学生是概念不清、trace 出错，还是模板不完整。
3. 如果是代码设计题，回复必须显式检查 type contract、docstring examples、RI、public/private boundary 和 edge cases。

这是一条本地可解释回复：右侧检查器可以切换查看检索证据、完整 prompt 和每一步数据流。
  `.trim();
}

export function buildCsc148LocalAgentRun(userMessage: string): Csc148LocalAgentRun {
  const dataset = getCsc148LocalDataset();
  const normalizedQuery = normalizeQueryForTrace(userMessage);
  const hits = searchCsc148LocalDataset(normalizedQuery, 14);
  const selectedSections = hits
    .filter(
      (hit): hit is Extract<Csc148LocalSearchHit, { kind: 'section' }> => hit.kind === 'section',
    )
    .slice(0, 4);
  const selectedProblems = hits
    .filter(
      (hit): hit is Extract<Csc148LocalSearchHit, { kind: 'problem' }> => hit.kind === 'problem',
    )
    .slice(0, 6);

  const sectionEvidence = selectedSections.map(formatSectionEvidence).join('\n\n---\n\n');
  const problemEvidence = selectedProblems.map(formatProblemEvidence).join('\n\n---\n\n');
  const promptParts = buildPromptParts({
    userMessage,
    normalizedQuery,
    sectionEvidence,
    problemEvidence,
  });
  const prompt = promptParts
    .map((part) => `## ${part.role.toUpperCase()}: ${part.title}\n\n${part.content}`)
    .join('\n\n');

  const dataFlow: Csc148LocalAgentDataFlowStep[] = [
    {
      id: 'input',
      label: '1. 用户输入',
      input: 'textarea message',
      output: userMessage,
      detail: '页面把用户问题作为本地 agent run 的唯一动态输入。',
    },
    {
      id: 'normalize',
      label: '2. Query normalization',
      input: userMessage,
      output: normalizedQuery,
      detail: '把 RI、链表、树、不变量等别名展开，降低本地关键词检索漏召。',
    },
    {
      id: 'load-local-data',
      label: '3. 读取本地课程包',
      input: 'data/csc148/course.json + data/csc148/problem-bank.json',
      output: `${dataset.course.notebookCount} notebooks / ${dataset.course.sectionCount} sections / ${dataset.problemBank.stats.total} problems`,
      detail: '只读取 repo 本地 JSON，不访问 Prisma、IndexedDB、远端 API 或 LLM。',
    },
    {
      id: 'retrieve',
      label: '4. 本地检索',
      input: normalizedQuery,
      output: `${hits.length} hits: ${selectedSections.length} sections + ${selectedProblems.length} problems selected`,
      detail: '按 title、summary、section、tags、question、explanation、templateCode 加权打分。',
    },
    {
      id: 'assemble-prompt',
      label: '5. Prompt assembly',
      input: 'system prompt + local constraints + selected evidence + user message',
      output: `${prompt.length} characters`,
      detail: '把可见证据直接拼进 prompt，方便检查 agent 到底看见了什么。',
    },
    {
      id: 'reply',
      label: '6. 本地回复生成',
      input: 'assembled prompt',
      output: 'deterministic local reply',
      detail: '本地构建阶段提供确定性预览；正式测试页会把同一 prompt 交给系统模型并保存完整输出。',
    },
  ];

  return {
    userMessage,
    prompt,
    promptParts,
    dataFlow,
    hits,
    selectedSections,
    selectedProblems,
    assistantReply: buildAssistantReply({ selectedSections, selectedProblems }),
  };
}
