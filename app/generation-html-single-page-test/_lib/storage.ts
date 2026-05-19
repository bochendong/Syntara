import {
  HTML_SINGLE_PAGE_MODEL,
  STORAGE_KEY,
  type HtmlSinglePagePreset,
  type StoredError,
  type StoredRun,
  type StoredState,
} from './types';
import {
  getPresetCanvasHeight,
  getPresetCanvasMode,
  PAGE_PRESETS,
  shouldUseGeneratedIllustration,
} from './presets';

export function readStoredState(): StoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function isLegacyEnglishPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /Create one 16:9 HTML\/CSS PowerPoint-style/i.test(value) &&
    /\bTopic:\b|\bAudience:\b|\bContent:\b/i.test(value)
  );
}

export function isDeprecatedDefaultPrompt(value: unknown): value is string {
  return typeof value === 'string' && /AI 导师评估实验室/.test(value);
}

export function isDeprecatedIntroPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：用瞬时速度引出导数/.test(value) &&
    (!/CSS 小图标/.test(value) ||
      !/主要可读中文文字字号不要低于 24px/.test(value) ||
      /加一个「今天会解决」小横条/.test(value) ||
      /简单 CSS 小图示/.test(value) ||
      /不要图片素材/.test(value))
  );
}

export function isDeprecatedSummaryPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：rubric 约束生成一周后/.test(value) &&
    (!/页面只能包含/.test(value) ||
      !/不要 dashboard 化/.test(value) ||
      !/总可见文字控制在 160-260/.test(value) ||
      !/所有可读文字字号不要低于 22px/.test(value) ||
      !/不要拉伸成大空白卡片/.test(value))
  );
}

export function isDeprecatedProcessPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：从上传 PDF 到可用题库/.test(value) &&
    (!/页面只能包含：标题区、5 个流程步骤、一个风险提示条/.test(value) ||
      !/不要把流程页做成表格页/.test(value) ||
      !/主流程区必须紧跟标题区/.test(value) ||
      !/slide-content 内宽约 1472px/.test(value) ||
      !/步骤标题字号不低于 30px/.test(value) ||
      !/不要使用负 margin/.test(value) ||
      !/总可见文字控制在 190-300/.test(value))
  );
}

export function isDeprecatedTablePrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：页面类型稳定性矩阵/.test(value) &&
    (!/页面只能包含：标题区、一个真实 HTML table、一句短阅读规则/.test(value) ||
      !/表格只能包含表头 \+ 5 行正文/.test(value) ||
      !/不要用 div 假表格/.test(value))
  );
}

export function isDeprecatedMathPrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：链式法则：从复合函数到导数/.test(value) &&
    (!/页面只能包含：标题区、核心公式区、三行推导、一个例题、一个提醒/.test(value) ||
      !/所有主要公式必须是真实 MathML/.test(value) ||
      !/公式卡片最多 3 个/.test(value))
  );
}

export function isDeprecatedCodePrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：追踪二分查找的状态变化/.test(value) &&
    (!/页面只能包含：标题区、左侧代码块、右侧 3 步 trace、最终返回结果/.test(value) ||
      !/trace 只展示 3 步/.test(value) ||
      !/代码字体建议 20-24px/.test(value))
  );
}

export function isDeprecatedExamplePrompt(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /主题：盈亏平衡分析例题/.test(value) &&
    (!/页面只能包含：题目区、已知条件区、3 个求解步骤、最终答案\/检查/.test(value) ||
      !/不要额外添加第二道题/.test(value) ||
      !/总可见文字控制在 170-300/.test(value))
  );
}

export function shouldReplaceCachedPrompt(value: unknown): value is string {
  return (
    isLegacyEnglishPrompt(value) ||
    isDeprecatedDefaultPrompt(value) ||
    isDeprecatedIntroPrompt(value) ||
    isDeprecatedSummaryPrompt(value) ||
    isDeprecatedProcessPrompt(value) ||
    isDeprecatedTablePrompt(value) ||
    isDeprecatedMathPrompt(value) ||
    isDeprecatedCodePrompt(value) ||
    isDeprecatedExamplePrompt(value)
  );
}

export function sanitizePromptByPreset(
  savedPromptByPreset: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    PAGE_PRESETS.map((preset) => {
      const savedPrompt = savedPromptByPreset[preset.id];
      return [preset.id, shouldReplaceCachedPrompt(savedPrompt) ? preset.prompt : savedPrompt];
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export function sanitizeRunsByPreset(
  savedRunsByPreset: StoredState['runsByPreset'],
): Record<string, StoredRun> {
  return Object.fromEntries(
    Object.entries(savedRunsByPreset || {}).filter((entry): entry is [string, StoredRun] => {
      const run = entry[1];
      return Boolean(run && !shouldReplaceCachedPrompt(run.prompt));
    }),
  );
}

export function sanitizeErrorsByPreset(
  savedErrorsByPreset: StoredState['errorsByPreset'],
): Record<string, StoredError> {
  return Object.fromEntries(
    Object.entries(savedErrorsByPreset || {}).filter((entry): entry is [string, StoredError] => {
      const error = entry[1];
      return Boolean(error && !shouldReplaceCachedPrompt(error.prompt));
    }),
  );
}

export function hasDeprecatedRunValues(values: Record<string, StoredRun>): boolean {
  return Object.values(values).some((run) => shouldReplaceCachedPrompt(run.prompt));
}

export function hasDeprecatedErrorValues(values: Record<string, StoredError>): boolean {
  return Object.values(values).some((error) => shouldReplaceCachedPrompt(error.prompt));
}

export function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function getPresetSignature(preset: HtmlSinglePagePreset): string {
  return hashText(
    JSON.stringify({
      id: preset.id,
      version: preset.version,
      prompt: preset.prompt,
      model: HTML_SINGLE_PAGE_MODEL,
      canvasMode: getPresetCanvasMode(preset),
      canvasHeight: getPresetCanvasHeight(preset),
      codeRoute: preset.codeRoute || null,
      courseRoute: preset.courseRoute || 'general',
      csRoute: preset.csRoute || 'standard',
      mathRoute: preset.mathRoute || 'standard',
      densityProfile: preset.densityProfile,
      requiredAnchors: preset.requiredAnchors,
      forbiddenAnchors: preset.forbiddenAnchors || [],
      illustrationMode: shouldUseGeneratedIllustration(preset) ? 'ai-illustration-slot-v2' : 'none',
      imageGenerationMode: shouldUseGeneratedIllustration(preset)
        ? 'deferred-placeholder-v2'
        : 'none',
    }),
  );
}

export function isRunExpired(run: StoredRun | undefined, preset: HtmlSinglePagePreset): boolean {
  return Boolean(run && run.presetSignature !== getPresetSignature(preset));
}

export function writeStoredState(next: StoredState) {
  if (typeof window === 'undefined') return;
  const runsByPreset = next.runsByPreset || {};
  const errorsByPreset = next.errorsByPreset || {};
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedPresetId: next.selectedPresetId,
      promptByPreset: next.promptByPreset || {},
      runsByPreset,
      errorsByPreset,
      history: Object.values(runsByPreset)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 20),
      errors: Object.values(errorsByPreset)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 20),
    }),
  );
}
