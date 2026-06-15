#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, 'tmp', 'reply-agent-eval');
const DEFAULT_BASE_URL = process.env.REPLY_AGENT_TEST_BASE_URL || 'http://localhost:3000';

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

async function loadProblemPromptBuilderForEval() {
  const ts = await import('typescript');
  const source = readText('lib/chat/problem-explain-prompt.ts');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    exports: module.exports,
    module,
    require(id) {
      throw new Error(`Unexpected runtime require while evaluating prompt builder: ${id}`);
    },
  };
  vm.runInNewContext(transpiled, sandbox, {
    filename: 'lib/chat/problem-explain-prompt.ts',
  });
  return module.exports.buildProblemExplainPrompt;
}

function compact(input, max = 4000) {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function pickDeterministic(items, seed, predicate = () => true) {
  const filtered = items.filter(predicate);
  if (filtered.length === 0) return null;
  const index = Math.abs(
    Array.from(seed).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7),
  );
  return filtered[index % filtered.length];
}

function problemText(question) {
  return compact(
    [
      question.title ? `Title: ${question.title}` : '',
      question.question || question.description || '',
      question.templateCode ? `Starter code:\n${question.templateCode}` : '',
      question.publicTestCode ? `Public tests:\n${compact(question.publicTestCode, 1200)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    7000,
  );
}

function makeNotebookRequest(sample) {
  return {
    message: sample.question,
    conversation: sample.conversation || [],
    attachments: sample.attachments || [],
    notebook: {
      id: sample.notebookId,
      name: sample.notebookName,
      description:
        sample.notebookDescription || `${sample.courseCode} reply-agent evaluation notebook`,
      scenes: sample.scenes || [
        {
          id: `${sample.notebookId}-section-1`,
          order: 1,
          type: 'markdown',
          title: sample.sectionTitle || sample.notebookName,
          knowledgeDigest: sample.contextDigest || sample.expectedFocus || '',
        },
      ],
    },
    course: {
      id: sample.courseId,
      name: sample.courseName,
      purpose: 'university',
      language: 'zh-CN',
      tags: sample.tags || [],
      courseCode: sample.courseCode,
    },
    options: { allowWrite: false, preferWebSearch: false },
  };
}

function buildSamples() {
  const csc108 = readJson('queue/production-csc108-questions.json').combinedQuestions || [];
  const mat102 = readJson('queue/production-mat102-questions.json').combinedQuestions || [];
  const csc108Code = pickDeterministic(
    csc108,
    'csc108-code',
    (q) => q.language === 'python' && q.templateCode && q.publicTestCode,
  );
  const csc108Regex = pickDeterministic(csc108, 'csc108-regex', (q) =>
    /regex|re|email|temperature/i.test(`${q.title} ${q.description}`),
  );
  const mat102Proof = pickDeterministic(mat102, 'mat102-proof', (q) =>
    /proof|证明|prove/i.test(`${q.questionType} ${q.title} ${q.description}`),
  );
  const mat102Logic = pickDeterministic(mat102, 'mat102-logic', (q) =>
    /logic|逻辑|条件|命题/i.test(`${q.category} ${q.title} ${q.description}`),
  );
  const cpscStarter = readText('题库/CPSC 107/mt2-p4-starter.rkt');
  const cpscSolution = readText('题库/CPSC 107/mt2-p4-solution.rkt');
  const cpscStarter2 = readText('题库/CPSC 107/mt2-p5-starter.rkt');
  const cpscSolution2 = readText('题库/CPSC 107/mt2-p5-solution.rkt');

  return [
    csc108Code && {
      id: 'csc108-code',
      courseId: 'eval-csc108',
      courseCode: 'CSC108',
      courseName: 'CSC108',
      notebookId: 'eval-csc108-code',
      notebookName: csc108Code.category || 'CSC108 Code Practice',
      tags: ['python', 'code'],
      expectedFocus: 'Python function implementation, examples, public/secret test awareness.',
      question: `我不会这道 CSC108 代码题。请完整讲解思路，然后给完整代码，不要复述整道题。\n\n${problemText(csc108Code)}`,
      referenceAnswer: csc108Code.secretTestCode
        ? `Secret tests used only for evaluator review:\n${compact(csc108Code.secretTestCode, 1600)}`
        : '',
    },
    csc108Regex && {
      id: 'csc108-regex',
      courseId: 'eval-csc108',
      courseCode: 'CSC108',
      courseName: 'CSC108',
      notebookId: 'eval-csc108-regex',
      notebookName: csc108Regex.category || 'CSC108 Regex Practice',
      tags: ['python', 'regex'],
      expectedFocus: 'Regex or string parsing explanation with code and examples.',
      question: `请像 CSC108 老师一样讲这道题，重点解释模式怎么想，不要只是给答案。\n\n${problemText(csc108Regex)}`,
      referenceAnswer: csc108Regex.secretTestCode
        ? `Secret tests used only for evaluator review:\n${compact(csc108Regex.secretTestCode, 1600)}`
        : '',
    },
    mat102Proof && {
      id: 'mat102-proof',
      courseId: 'eval-mat102',
      courseCode: 'MAT102',
      courseName: 'MAT102',
      notebookId: mat102Proof.notebookId || 'eval-mat102-proof',
      notebookName: mat102Proof.notebookTitle || mat102Proof.category || 'MAT102 Proof Practice',
      tags: ['proof', 'math'],
      expectedFocus: 'Proof strategy, definitions, and common mistakes.',
      question: `我不会这道 MAT102 题。请先讲证明/解题策略，再给清楚步骤。\n\n${problemText(mat102Proof)}`,
    },
    mat102Logic && {
      id: 'mat102-logic',
      courseId: 'eval-mat102',
      courseCode: 'MAT102',
      courseName: 'MAT102',
      notebookId: mat102Logic.notebookId || 'eval-mat102-logic',
      notebookName: mat102Logic.notebookTitle || mat102Logic.category || 'MAT102 Logic Practice',
      tags: ['logic', 'symbolization'],
      expectedFocus: 'Symbolization reasoning and not just final option.',
      question: `请讲解这道 MAT102 逻辑题，说明为什么这样符号化。\n\n${problemText(mat102Logic)}`,
    },
    {
      id: 'mat136-integral',
      courseId: 'eval-mat136',
      courseCode: 'MAT136',
      courseName: 'MAT136',
      notebookId: 'eval-mat136-improper-integrals',
      notebookName: 'MAT136 Improper Integrals',
      tags: ['calculus', 'integral'],
      expectedFocus: 'Calculus explanation with setup, limit conversion, and convergence check.',
      question:
        '我在 MAT136 学 improper integrals。请讲一个典型题：为什么 \\int_1^\\infty 1/x^p dx 要分 p>1 和 p<=1？请用学生能跟上的方式解释，不要写成很长讲义。',
    },
    {
      id: 'cpsc107-abstract-functions',
      courseId: 'eval-cpsc107',
      courseCode: 'CPSC107',
      courseName: 'CPSC107',
      notebookId: 'eval-cpsc107-abstract',
      notebookName: 'CPSC107 Abstract Functions',
      tags: ['racket', 'abstract-functions'],
      expectedFocus: 'Racket HtDP design recipe, abstract functions, no recursion when forbidden.',
      question: `请讲解这道 CPSC107 Racket 题怎么做。不要只贴答案，要解释为什么符合 abstract function 要求。\n\nStarter:\n${compact(cpscStarter, 6500)}`,
      referenceAnswer: compact(cpscSolution, 6500),
    },
    {
      id: 'cpsc107-two-one-of',
      courseId: 'eval-cpsc107',
      courseCode: 'CPSC107',
      courseName: 'CPSC107',
      notebookId: 'eval-cpsc107-two-one-of',
      notebookName: 'CPSC107 Two One-of',
      tags: ['racket', 'two-one-of'],
      expectedFocus: '2-one-of simultaneous traversal, no length/list-ref, design recipe.',
      question: `请讲解这道 CPSC107 2-one-of 题怎么做。要解释 cond 情况怎么从表格来，不要只给代码。\n\nStarter:\n${compact(cpscStarter2, 6500)}`,
      referenceAnswer: compact(cpscSolution2, 6500),
    },
  ].filter(Boolean);
}

function auditPrompt(prompt) {
  const joined = `${prompt.systemPrompt || ''}\n${prompt.userPrompt || ''}`;
  const userPrompt = String(prompt.userPrompt || '');
  const metadata = prompt.metadata || {};
  const replyContext = metadata.replyContext || {};
  const starterSection =
    userPrompt.split('Starter code:\n')[1]?.split('\n\nPublic examples:')[0] || '';
  const docstringPattern = /("""|''')([\s\S]*?)\1/g;
  let docstringMatch;
  let hasLongPythonDocstringInStarter = false;
  while ((docstringMatch = docstringPattern.exec(starterSection))) {
    if (docstringMatch[2].length > 500) {
      hasLongPythonDocstringInStarter = true;
      break;
    }
  }
  return {
    totalChars: joined.length,
    userPromptChars: userPrompt.length,
    hasRole: /teacher|tutor|老师|copilot/i.test(prompt.systemPrompt || ''),
    hasFormat: /strict JSON|Return this JSON shape/i.test(joined),
    hasStyle: /不要复述|teach|讲解|清晰|concise|简洁/i.test(joined),
    hasContextCapsules: /Relevant context capsules:\n(?:none|\d+\. )/.test(joined),
    hasReplyContextMetadata: Boolean(replyContext.plan && replyContext.audit),
    replyContextWithinBudget: replyContext.audit ? replyContext.audit.withinBudget === true : false,
    noOperationsSchema: !/"operations"\s*:/.test(joined),
    noKnowledgeGapInstruction: !/knowledgeGap|学习缺口|durable private/i.test(joined),
    noPlannerDump:
      !/\nplan:\n|tool_usage_policy|counts: facts=|metadata_filtered_problem_matches/.test(joined),
    noFullNotebookDump: !/reference units|unit \d+ \|/.test(joined),
    noLongPythonDocstringInStarter: !hasLongPythonDocstringInStarter,
  };
}

function responseText(response) {
  const blocks = response.answerDocument?.blocks || [];
  const blockText = blocks
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      if (typeof block.text === 'string') return block.text;
      if (Array.isArray(block.items)) return block.items.join(' ');
      if (typeof block.code === 'string') return block.code;
      return '';
    })
    .join('\n');
  return `${response.answer || ''}\n${blockText}`;
}

function responseCode(response) {
  const blocks = response.answerDocument?.blocks || [];
  for (const block of blocks) {
    if (block && typeof block === 'object' && typeof block.code === 'string') {
      return block.code;
    }
  }
  const match = String(response.answer || '').match(
    /```(?:racket|rkt|python|py)?\s*\n([\s\S]+?)```/i,
  );
  return match?.[1] || '';
}

function auditResponse(response, sample) {
  const answer = String(response.answer || '');
  const blocks = response.answerDocument?.blocks || [];
  const text = responseText(response);
  const code = responseCode(response);
  const hasReasoningMarkers =
    /思路|步骤|关键|核心|结论|易错|为什么|因为|由于|所以|因此|例如|反例|假设|先|再|最后|分情况|case/i.test(
      answer,
    );
  const audit = {
    hasAnswer: answer.trim().length > 20,
    hasAnswerDocument: Boolean(response.answerDocument),
    doesNotStartWithProblemOriginal: !/^题目原文/.test(answer.trim()),
    hasTeachingStructure: blocks.length >= 2 || (answer.trim().length > 120 && hasReasoningMarkers),
    replyOnly:
      response.knowledgeGap === false && response.operations
        ? (response.operations.insert || []).length === 0 &&
          (response.operations.update || []).length === 0 &&
          (response.operations.delete || []).length === 0
        : true,
  };
  if (sample?.id === 'cpsc107-two-one-of') {
    audit.cpsc107NoFakeMetadataTags = !/\(@(?:purpose|check-expect)\b/i.test(code);
    audit.cpsc107HasTwoOneOfOrigin = /\(@template-origin\s+2-one-of\s*\)/i.test(code);
    audit.cpsc107HasTableAndPairs =
      /(2-one-of table|IN THIS TABLE|TABLE WE ABBREVIATE|Cond question\/answer|\[1\][\s\S]{0,900}\[2\])/i.test(
        text,
      );
    audit.cpsc107OverlayOrder =
      /\(overlay\s+\(\s*create-target\s+\(\s*rest\s+los\)\s+\(\s*(?:-\s+n\s+1|sub1\s+n)\s*\)[\s\S]{0,160}\(circle\s+\(\*\s*5\s+n\)/i.test(
        code,
      );
  }
  return audit;
}

async function runProblemPromptBuilderFixture(outDir) {
  const buildProblemExplainPrompt = await loadProblemPromptBuilderForEval();
  const problem = {
    id: 'fixture-code-problem',
    courseId: 'eval-csc108',
    notebookId: 'eval-csc108-code',
    notebookName: 'CSC108 Code Practice',
    title: 'Longest Wrapped Chain',
    type: 'code',
    status: 'published',
    source: 'manual',
    order: 1,
    points: 1,
    tags: ['python', 'list'],
    difficulty: 'medium',
    publicContent: {
      type: 'code',
      language: 'python',
      stem: 'Return the length of the longest consecutive chain of e. The chain may wrap from the end of the list to the beginning.',
      functionSignature: 'def count_longest_chain_wrap(lst: list[int], e: int) -> int:',
      starterCode: 'def count_longest_chain_wrap(lst: list[int], e: int) -> int:\n    pass\n',
      constraints: ['Return 0 for an empty list.', 'The chain can wrap around once.'],
      publicTests: [
        {
          id: 'public-1',
          expression: 'count_longest_chain_wrap([5, 5, 1, 5], 5)',
          expected: '3',
        },
      ],
      sampleIO: [
        {
          input: 'count_longest_chain_wrap([5,5,1,2,5,5], 5)',
          output: '4',
        },
      ],
      secretConfigPresent: true,
    },
    grading: {
      type: 'code',
      analysis:
        'A correct solution handles the empty list and caps the two-pass result at len(lst).',
    },
    secretJudge: {
      language: 'python',
      timeoutMs: 5000,
      secretTests: [
        {
          id: 'hidden-sentinel',
          expression: 'SECRET_CASE_SENTINEL([5,5,5], 5)',
          expected: 'SECRET_EXPECTED_SENTINEL',
        },
      ],
    },
    sourceMeta: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const prompt = buildProblemExplainPrompt({
    problem,
    problemTitle: problem.title,
    problemContent: problem.publicContent,
    notebookName: problem.notebookName,
    currentAnswer: {
      code: 'def count_longest_chain_wrap(lst: list[int], e: int) -> int:\n    longest = 0\n    return longest\n',
    },
    latestAttempt: {
      id: 'attempt-fixture',
      problemId: problem.id,
      userId: 'eval-user',
      kind: 'submit',
      status: 'failed',
      score: 0,
      answer: {
        code: 'def count_longest_chain_wrap(lst: list[int], e: int) -> int:\n    longest = 0\n    return longest\n',
      },
      result: {
        correct: false,
        feedback: 'Public tests: 1 failed; Secret tests: 4 failed.',
        publicSummary: {
          total: 3,
          passed: 2,
          failed: 1,
          failureSummary: 'Wrap-around example failed.',
        },
        secretSummary: {
          total: 4,
          passed: 0,
          failed: 4,
          failureSummary: 'Hidden edge cases failed.',
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  const audit = {
    hasStudentContext: /学生作答上下文/.test(prompt),
    hasCurrentAnswer: /学生当前编辑区内容/.test(prompt) && /return longest/.test(prompt),
    hasLatestAttempt: /最近记录：submit，状态 failed/.test(prompt),
    hasPublicSummary: /公开测试：通过 2\/3/.test(prompt),
    hasSecretSummary: /隐藏测试：通过 0\/4/.test(prompt),
    noSecretCaseLeak: !/SECRET_CASE_SENTINEL|SECRET_EXPECTED_SENTINEL|secretTests/i.test(prompt),
  };
  const result = { prompt, audit };
  fs.writeFileSync(
    path.join(outDir, 'problem-prompt-fixture.json'),
    JSON.stringify(result, null, 2),
  );
  return audit;
}

async function fetchPromptLog(promptLogId) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "id", "source", "systemPrompt", "userPrompt", "metadata", "createdAt" FROM "LLMPromptLog" WHERE "id" = $1',
      promptLogId,
    );
    return rows[0] || null;
  } finally {
    await prisma.$disconnect();
  }
}

async function runApiSample(sample, outDir) {
  const payload = makeNotebookRequest(sample);
  const response = await fetch(`${DEFAULT_BASE_URL}/api/notebooks/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${sample.id}: ${response.status} ${JSON.stringify(json)}`);
  }
  const prompt = json?.promptLogId ? await fetchPromptLog(json.promptLogId) : null;
  const result = {
    sample,
    response: json,
    prompt: prompt
      ? {
          id: prompt.id,
          source: prompt.source,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          metadata: prompt.metadata,
          createdAt: prompt.createdAt,
        }
      : null,
    promptAudit: prompt ? auditPrompt(prompt) : null,
    responseAudit: auditResponse(json || {}, sample),
  };
  fs.writeFileSync(path.join(outDir, `${sample.id}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const runApi = process.argv.includes('--run-api');
  const samples = buildSamples();
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : samples.length;
  const selected = samples.slice(0, Number.isFinite(limit) && limit > 0 ? limit : samples.length);
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const outDir = path.join(OUT_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    baseUrl: DEFAULT_BASE_URL,
    runApi,
    sampleCount: selected.length,
    samples: selected.map((sample) => ({
      id: sample.id,
      courseCode: sample.courseCode,
      notebookName: sample.notebookName,
      expectedFocus: sample.expectedFocus,
      hasReferenceAnswer: Boolean(sample.referenceAnswer),
    })),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const problemPromptAudit = await runProblemPromptBuilderFixture(outDir);

  if (!runApi) {
    fs.writeFileSync(
      path.join(outDir, 'requests.json'),
      JSON.stringify(selected.map(makeNotebookRequest), null, 2),
    );
    console.log(`Wrote dry-run samples to ${outDir}`);
    console.log('Problem prompt fixture audit:');
    console.log(JSON.stringify(problemPromptAudit, null, 2));
    console.log('Use --run-api to call the local reply API.');
    return;
  }

  const results = [];
  for (const sample of selected) {
    console.log(`Running ${sample.id}...`);
    results.push(await runApiSample(sample, outDir));
  }
  const summary = results.map((result) => ({
    id: result.sample.id,
    courseCode: result.sample.courseCode,
    promptAudit: result.promptAudit,
    responseAudit: result.responseAudit,
    promptLogId: result.response?.promptLogId,
  }));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(outDir, 'problem-prompt-audit.json'),
    JSON.stringify(problemPromptAudit, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log('Problem prompt fixture audit:');
  console.log(JSON.stringify(problemPromptAudit, null, 2));
  console.log(`Wrote evaluation artifacts to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
