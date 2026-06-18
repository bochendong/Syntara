import type {
  NotebookProblemAttemptAnswer,
  NotebookProblemAttemptRecord,
  NotebookProblemGrading,
  NotebookProblemPublicContent,
} from '@/lib/problem-bank';
import type { NotebookProblemClientRecord } from '@/lib/utils/notebook-problem-api';

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanPromptText(input: string | undefined): string {
  return decodeBasicHtmlEntities(input || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(
      /<\/?(?:p|div|span|strong|em|b|i|u|ul|ol|li|table|thead|tbody|tr|td|th|pre|code|blockquote|h[1-6]|section|article|figure|figcaption|img|a|sup|sub)\b[^>]*>/gi,
      ' ',
    )
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipPromptText(input: string, maxLength = 6000): string {
  if (input.length <= maxLength) return input;
  return `${input.slice(0, maxLength)}\n...`;
}

function formatAttemptAnswerForPrompt(answer: NotebookProblemAttemptAnswer | null | undefined) {
  if (!answer) return '';
  const lines: string[] = [];
  if (answer.text?.trim()) lines.push(`文本答案：${clipPromptText(answer.text.trim(), 1600)}`);
  if (answer.code?.trim()) lines.push(`代码答案：\n${clipPromptText(answer.code.trim(), 2600)}`);
  if (answer.selectedOptionIds?.length) {
    lines.push(`选择：${answer.selectedOptionIds.join('、')}`);
  }
  const blankEntries = Object.entries(answer.blanks || {}).filter(([, value]) => value.trim());
  if (blankEntries.length > 0) {
    lines.push(`填空：${blankEntries.map(([key, value]) => `${key}: ${value}`).join('；')}`);
  }
  if (answer.images?.length) {
    lines.push(`图片答案：${answer.images.length} 张（这里只提供数量，不提供图片内容）`);
  }
  return lines.join('\n');
}

function formatCaseSummaryForPrompt(
  label: string,
  summary: NonNullable<NotebookProblemAttemptRecord['result']>['publicSummary'],
) {
  if (!summary) return '';
  const parts = [`${label}：通过 ${summary.passed}/${summary.total}`];
  if (summary.failed > 0) parts.push(`未通过 ${summary.failed} 个`);
  if (summary.failureSummary) parts.push(`摘要：${clipPromptText(summary.failureSummary, 900)}`);
  return parts.join('，');
}

function formatAttemptForPrompt(attempt: NotebookProblemAttemptRecord | null | undefined) {
  if (!attempt) return '';
  const lines = [
    `最近记录：${attempt.kind}，状态 ${attempt.status}${
      typeof attempt.score === 'number' ? `，得分 ${attempt.score}` : ''
    }`,
  ];
  const answer = formatAttemptAnswerForPrompt(attempt.answer);
  if (answer) lines.push(`最近提交内容：\n${answer}`);
  const result = attempt.result;
  if (result) {
    if (typeof result.correct === 'boolean')
      lines.push(`判定：${result.correct ? '正确' : '不正确'}`);
    if (typeof result.earnedPoints === 'number') lines.push(`获得分数：${result.earnedPoints}`);
    if (result.runTarget) lines.push(`运行范围：${result.runTarget}`);
    const publicSummary = formatCaseSummaryForPrompt('公开测试', result.publicSummary);
    if (publicSummary) lines.push(publicSummary);
    const secretSummary = formatCaseSummaryForPrompt('隐藏测试', result.secretSummary);
    if (secretSummary) {
      lines.push(`${secretSummary}（不包含隐藏测试用例内容）`);
    }
    if (result.feedback) lines.push(`反馈：${clipPromptText(result.feedback, 1200)}`);
    if (result.analysis) lines.push(`分析：${clipPromptText(result.analysis, 1200)}`);
    if (result.error) lines.push(`错误：${clipPromptText(result.error, 1200)}`);
    const failedPublicCases = (result.publicCases || [])
      .filter((item) => !item.passed)
      .slice(0, 4)
      .map((item) => {
        const detail = item.error || item.actual || item.stdout || '';
        return `${item.description || item.id}${detail ? `：${clipPromptText(detail, 500)}` : ''}`;
      });
    if (failedPublicCases.length > 0) {
      lines.push(`未通过的公开用例：${failedPublicCases.join('；')}`);
    }
  }
  return lines.join('\n');
}

function formatStudentContextForPrompt(args: {
  currentAnswer?: NotebookProblemAttemptAnswer | null;
  latestAttempt?: NotebookProblemAttemptRecord | null;
}) {
  const lines: string[] = [];
  const currentAnswer = formatAttemptAnswerForPrompt(args.currentAnswer);
  if (currentAnswer) {
    lines.push(`学生当前编辑区内容：\n${currentAnswer}`);
  }
  const latestAttempt = formatAttemptForPrompt(args.latestAttempt);
  if (latestAttempt) {
    lines.push(latestAttempt);
  }
  if (lines.length === 0) return '';
  return [
    '学生作答上下文：',
    '使用这些信息判断学生卡在哪里；不要责备学生，也不要暴露隐藏测试细节。',
    lines.join('\n\n'),
  ].join('\n');
}

function formatProblemContentForPrompt(content: NotebookProblemPublicContent): string {
  const lines: string[] = [];
  if ('stem' in content) {
    lines.push(`题干：${cleanPromptText(content.stem)}`);
  }
  if (content.type === 'choice') {
    lines.push(`选择方式：${content.selectionMode === 'multiple' ? '多选' : '单选'}`);
    lines.push(
      `选项：${content.options
        .map((option) => `${option.id}. ${cleanPromptText(option.label)}`)
        .join('\n')}`,
    );
  }
  if (content.type === 'fill_blank') {
    lines.push(`题干：${cleanPromptText(content.stemTemplate)}`);
    lines.push(
      `空格：${content.blanks
        .map((blank) => `${blank.id}${blank.placeholder ? `（${blank.placeholder}）` : ''}`)
        .join('、')}`,
    );
  }
  if (content.type === 'calculation' && content.unit) {
    lines.push(`单位：${content.unit}`);
  }
  if (content.type === 'code') {
    if (content.functionSignature) lines.push(`函数签名：${content.functionSignature}`);
    if (content.constraints.length > 0) lines.push(`约束：${content.constraints.join('；')}`);
    if (content.sampleIO.length > 0) {
      lines.push(
        `样例：${content.sampleIO
          .map((item, index) => {
            const note = item.explanation ? `，说明：${cleanPromptText(item.explanation)}` : '';
            return `样例${index + 1} 输入 ${item.input}，输出 ${item.output}${note}`;
          })
          .join('\n')}`,
      );
    }
    if (content.starterCode) lines.push(`起始代码：\n${clipPromptText(content.starterCode, 3000)}`);
  }
  if (content.explanation) {
    lines.push(`题目已有说明：${cleanPromptText(content.explanation)}`);
  }
  const images = content.assets?.images || [];
  if (images.length > 0) {
    lines.push(
      `题目图片：${images
        .map((image) => image.caption || image.alt || image.id)
        .filter(Boolean)
        .join('；')}`,
    );
  }
  return lines.filter(Boolean).join('\n');
}

function formatGradingForPrompt(grading: NotebookProblemGrading): string {
  switch (grading.type) {
    case 'choice':
      return [
        `正确选项：${grading.correctOptionIds.join('、')}`,
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'fill_blank':
      return [
        `参考答案：${grading.blanks
          .map((blank) => `${blank.id}: ${blank.acceptedAnswers.join(' / ')}`)
          .join('；')}`,
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'calculation':
      return [
        grading.referenceAnswer ? `参考答案：${grading.referenceAnswer}` : '',
        grading.acceptedForms.length > 0 ? `可接受形式：${grading.acceptedForms.join('；')}` : '',
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'short_answer':
      return [
        grading.referenceAnswer ? `参考答案：${cleanPromptText(grading.referenceAnswer)}` : '',
        grading.rubric ? `评分标准：${cleanPromptText(grading.rubric)}` : '',
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'proof':
      return [
        grading.referenceProof ? `参考证明：${cleanPromptText(grading.referenceProof)}` : '',
        grading.rubric ? `评分标准：${cleanPromptText(grading.rubric)}` : '',
        grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    case 'code':
      return grading.analysis ? `解析：${cleanPromptText(grading.analysis)}` : '';
    default:
      return '';
  }
}

export function buildProblemExplainPrompt(args: {
  problem: NotebookProblemClientRecord;
  problemTitle: string;
  problemContent: NotebookProblemPublicContent;
  notebookName: string;
  currentAnswer?: NotebookProblemAttemptAnswer | null;
  latestAttempt?: NotebookProblemAttemptRecord | null;
}): string {
  const gradingText = formatGradingForPrompt(args.problem.grading);
  const studentContextText = formatStudentContextForPrompt({
    currentAnswer: args.currentAnswer,
    latestAttempt: args.latestAttempt,
  });
  return clipPromptText(
    [
      '学生意图：讲解这道已经提供的题，重点是辅导学生理解和完成，不是查找题目或复述题面。',
      `学生正在做《${args.notebookName}》中的一道题，不会做。请作为这个章节的 AI 老师，完整讲解整道题。`,
      [
        '讲解要求：不要以“题目原文：”开头，也不要大段复述题面。',
        '先用 1-2 句中文解释这题到底要做什么和突破口，再讲考点、步骤、答案/代码和易错点。',
        '如果是代码题，要解释函数签名、docstring/contract、输入输出、核心算法或正则表达式，并用样例快速验证。',
        '如果是数学题或证明题，所有公式必须用 $...$ 或 $$...$$ 包起来；证明文本不要放进 ``` fenced code block，只有真实程序代码才用代码块。',
        '题面里的占位符、变量、函数名、正则和代码片段必须用反引号包起来，例如 `<s>`、`<integer>C`、`re.search`，避免被 Markdown 当作 HTML。',
        '语气像在旁边辅导学生，清晰但不要啰嗦。',
      ].join('\n'),
      `题目标题：${args.problemTitle || args.problem.title}`,
      `题型：${args.problem.type}`,
      args.problem.problemNumber ? `题号：${args.problem.problemNumber}` : '',
      formatProblemContentForPrompt(args.problemContent),
      studentContextText,
      gradingText ? `\n可参考的标准答案或解析：\n${gradingText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    14000,
  );
}
