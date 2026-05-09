import type {
  SceneOutline,
  SharedExampleMemory,
  SceneContinuityContext,
} from '@/lib/types/generation';

const MAX_SHARED_EXAMPLES = 4;
const MAX_ITEMS_PER_EXAMPLE = 5;
const MAX_SNIPPET_LENGTH = 220;

const GENERIC_CODE_LABELS = new Set([
  'list',
  'dict',
  'str',
  'int',
  'float',
  'bool',
  'date',
  'self',
  'None',
  'True',
  'False',
  'class',
  'object',
  'Object',
  'String',
  'Array',
  'Map',
  'Set',
  'JSON',
]);

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function trimForPrompt(value: string | undefined, maxLength = MAX_SNIPPET_LENGTH): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/\(\s*\)$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || 'example';
}

function normalizeLabel(value: string): string | null {
  const stripped = value
    .replace(/^class\s+/i, '')
    .replace(/^def\s+/i, '')
    .replace(/\(\s*\)$/g, '')
    .trim();
  if (!stripped || stripped.length > 40) return null;
  if (GENERIC_CODE_LABELS.has(stripped)) return null;
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(stripped)) return null;
  return stripped;
}

function exampleAliases(label: string, aliases?: string[]): string[] {
  return uniq([label, `${label}()`, ...(aliases || [])]);
}

function collectOutlineText(outline: SceneOutline): string {
  const plan = outline.teachingPagePlan;
  const worked = outline.workedExampleConfig;
  return [
    outline.title,
    outline.description,
    ...(outline.keyPoints || []),
    outline.teachingObjective,
    outline.studentThinkingMove,
    plan?.title,
    plan?.openingMove,
    plan?.concreteAnchor,
    plan?.studentThinkingMove,
    plan?.transferRule,
    worked?.problemStatement,
    ...(worked?.givens || []),
    ...(worked?.asks || []),
    ...(worked?.constraints || []),
    ...(worked?.solutionPlan || []),
    ...(worked?.walkthroughSteps || []),
    ...(worked?.commonPitfalls || []),
    worked?.finalAnswer,
    worked?.codeSnippet,
  ]
    .filter(Boolean)
    .join('\n');
}

function extractCandidateLabels(text: string): string[] {
  const candidates: string[] = [];
  const codeLiteralPattern = /`([^`]{2,80})`/g;
  for (const match of text.matchAll(codeLiteralPattern)) {
    const normalized = normalizeLabel(match[1]);
    if (normalized) candidates.push(normalized);
  }

  const constructorPattern = /\b([A-Z][A-Za-z0-9_]{1,40})\s*\(\s*\)/g;
  for (const match of text.matchAll(constructorPattern)) {
    const normalized = normalizeLabel(match[1]);
    if (normalized) candidates.push(normalized);
  }

  const classNamePattern = /\b(class\s+[A-Z][A-Za-z0-9_]{1,40}|[A-Z][A-Za-z0-9_]{2,40})\b/g;
  for (const match of text.matchAll(classNamePattern)) {
    const normalized = normalizeLabel(match[1]);
    if (normalized) candidates.push(normalized);
  }

  return uniq(candidates);
}

function outlineMentionsExample(outline: SceneOutline, example: SharedExampleMemory): boolean {
  const text = collectOutlineText(outline);
  return exampleAliases(example.label, example.aliases).some((alias) => text.includes(alias));
}

function splitConcreteLines(outline: SceneOutline): string[] {
  const plan = outline.teachingPagePlan;
  return [
    plan?.concreteAnchor,
    outline.description,
    ...(outline.keyPoints || []),
    outline.teachingObjective,
    plan?.openingMove,
    plan?.studentThinkingMove,
    plan?.transferRule,
    outline.workedExampleConfig?.problemStatement,
    outline.workedExampleConfig?.codeSnippet,
  ]
    .filter(Boolean)
    .flatMap((text) => String(text).split(/\n+/))
    .map((line) => trimForPrompt(line))
    .filter(Boolean);
}

function extractConcreteSnippets(
  outlines: SceneOutline[],
  example: SharedExampleMemory,
  kind: 'canonical' | 'malformed' | 'rules',
): string[] {
  const aliases = exampleAliases(example.label, example.aliases);
  const lines = outlines.flatMap(splitConcreteLines);
  const malformedPattern =
    /(错误|失败|缺少|非法|混乱|失守|missing|invalid|malformed|wrong|error|failure)/i;
  const rulePattern = /(必须|需要|边界|规则|职责|集中|守住|should|must|rule|boundary|responsib)/i;

  return uniq(
    lines.filter((line) => {
      const mentionsExample = aliases.some((alias) => line.includes(alias));
      if (kind === 'malformed') return malformedPattern.test(line);
      if (kind === 'rules') return mentionsExample || rulePattern.test(line);
      return (
        mentionsExample ||
        /`[^`]+`/.test(line) ||
        /\[[^\]]+\]|\{[^}]+\}/.test(line)
      );
    }),
  ).slice(0, MAX_ITEMS_PER_EXAMPLE);
}

function mergeSharedExamples(examples: SharedExampleMemory[]): SharedExampleMemory[] {
  const byId = new Map<string, SharedExampleMemory>();
  for (const example of examples) {
    const id = example.id || `example_${slugify(example.label)}`;
    const previous = byId.get(id);
    if (!previous) {
      byId.set(id, {
        ...example,
        id,
        aliases: exampleAliases(example.label, example.aliases),
      });
      continue;
    }
    byId.set(id, {
      ...previous,
      aliases: uniq([...(previous.aliases || []), ...(example.aliases || [])]),
      canonicalData: uniq([...(previous.canonicalData || []), ...(example.canonicalData || [])]),
      malformedData: uniq([...(previous.malformedData || []), ...(example.malformedData || [])]),
      rules: uniq([...(previous.rules || []), ...(example.rules || [])]),
      lessonRole: previous.lessonRole || example.lessonRole,
      introducedInOutlineId: previous.introducedInOutlineId || example.introducedInOutlineId,
    });
  }
  return Array.from(byId.values()).slice(0, MAX_SHARED_EXAMPLES);
}

function inferSharedExamples(outlines: SceneOutline[]): SharedExampleMemory[] {
  const existing = mergeSharedExamples(outlines.flatMap((outline) => outline.sharedExamples || []));
  const byLabel = new Map<
    string,
    { label: string; outlineIds: Set<string>; outlines: SceneOutline[] }
  >();

  for (const outline of outlines) {
    const labels = extractCandidateLabels(collectOutlineText(outline));
    for (const label of labels) {
      const key = label.toLowerCase();
      const record = byLabel.get(key) || { label, outlineIds: new Set(), outlines: [] };
      record.outlineIds.add(outline.id);
      if (!record.outlines.some((item) => item.id === outline.id)) record.outlines.push(outline);
      byLabel.set(key, record);
    }

    const exampleId = outline.workedExampleConfig?.exampleId?.trim();
    if (exampleId) {
      const label = normalizeLabel(exampleId) || normalizeLabel(outline.title) || outline.title;
      if (label) {
        const key = label.toLowerCase();
        const record = byLabel.get(key) || { label, outlineIds: new Set(), outlines: [] };
        record.outlineIds.add(outline.id);
        if (!record.outlines.some((item) => item.id === outline.id)) record.outlines.push(outline);
        byLabel.set(key, record);
      }
    }
  }

  const inferred: SharedExampleMemory[] = [];
  for (const record of byLabel.values()) {
    if (record.outlineIds.size < 2) continue;
    const firstOutline = record.outlines[0];
    const base: SharedExampleMemory = {
      id: `example_${slugify(record.label)}`,
      label: record.label,
      aliases: exampleAliases(record.label),
      description: trimForPrompt(
        firstOutline.teachingPagePlan?.concreteAnchor ||
          firstOutline.description ||
          firstOutline.title,
      ),
      introducedInOutlineId: firstOutline.id,
      lessonRole: trimForPrompt(
        firstOutline.teachingPagePlan?.transferRule || firstOutline.teachingObjective,
      ),
    };
    inferred.push({
      ...base,
      canonicalData: extractConcreteSnippets(record.outlines, base, 'canonical'),
      malformedData: extractConcreteSnippets(record.outlines, base, 'malformed'),
      rules: extractConcreteSnippets(record.outlines, base, 'rules'),
    });
  }

  return mergeSharedExamples([...existing, ...inferred]);
}

function summarizeOutlineForHandoff(outline: SceneOutline | undefined): string | undefined {
  if (!outline) return undefined;
  const plan = outline.teachingPagePlan;
  return trimForPrompt(
    plan?.transferRule ||
      plan?.studentThinkingMove ||
      plan?.concreteAnchor ||
      outline.description ||
      outline.title,
    180,
  );
}

function currentJobForOutline(outline: SceneOutline): string | undefined {
  const plan = outline.teachingPagePlan;
  return trimForPrompt(
    outline.continuity?.currentJob ||
      plan?.studentThinkingMove ||
      plan?.openingMove ||
      outline.description,
    180,
  );
}

function sortedOutlines(outlines: SceneOutline[]): SceneOutline[] {
  return [...outlines].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function replaceCurrentOutline(outline: SceneOutline, allOutlines?: SceneOutline[]): SceneOutline[] {
  if (!allOutlines?.length) return [outline];
  let found = false;
  const replaced = allOutlines.map((candidate) => {
    if (candidate.id !== outline.id) return candidate;
    found = true;
    return {
      ...candidate,
      ...outline,
      sharedExamples: mergeSharedExamples([
        ...(candidate.sharedExamples || []),
        ...(outline.sharedExamples || []),
      ]),
    };
  });
  return found ? replaced : [...replaced, outline];
}

export function attachDeckMemoryToOutlines(outlines: SceneOutline[]): SceneOutline[] {
  if (outlines.length === 0) return outlines;
  const sorted = sortedOutlines(outlines);
  const sortedIndexById = new Map(sorted.map((outline, index) => [outline.id, index]));
  const sharedExamples = inferSharedExamples(outlines);

  return outlines.map((outline) => {
    const sortedIndex = sortedIndexById.get(outline.id) ?? outline.order ?? 0;
    const previous = sorted[sortedIndex - 1];
    const next = sorted[sortedIndex + 1];
    const usesExampleIds = uniq([
      ...(outline.usesExampleIds || []),
      ...(outline.continuity?.usesExampleIds || []),
      ...sharedExamples
        .filter((example) => outlineMentionsExample(outline, example))
        .map((example) => example.id),
    ]);
    const continuity: SceneContinuityContext = {
      ...outline.continuity,
      usesExampleIds: usesExampleIds.length
        ? usesExampleIds
        : outline.continuity?.usesExampleIds,
      previousHandoff:
        outline.continuity?.previousHandoff || summarizeOutlineForHandoff(previous),
      currentJob: currentJobForOutline(outline),
      nextHandoff: outline.continuity?.nextHandoff || summarizeOutlineForHandoff(next),
    };

    return {
      ...outline,
      sharedExamples: sharedExamples.length
        ? mergeSharedExamples([...(outline.sharedExamples || []), ...sharedExamples])
        : outline.sharedExamples,
      usesExampleIds: usesExampleIds.length ? usesExampleIds : outline.usesExampleIds,
      continuity,
    };
  });
}

export function enrichOutlineWithDeckMemory(
  outline: SceneOutline,
  allOutlines?: SceneOutline[],
): SceneOutline {
  const enrichedOutlines = attachDeckMemoryToOutlines(replaceCurrentOutline(outline, allOutlines));
  return enrichedOutlines.find((candidate) => candidate.id === outline.id) || enrichedOutlines[0] || outline;
}

function relevantExamplesForOutline(outline: SceneOutline): SharedExampleMemory[] {
  const examples = outline.sharedExamples || [];
  const explicitIds = new Set([
    ...(outline.usesExampleIds || []),
    ...(outline.continuity?.usesExampleIds || []),
  ]);
  const explicit = examples.filter((example) => explicitIds.has(example.id));
  if (explicit.length > 0) return explicit.slice(0, MAX_SHARED_EXAMPLES);
  return examples.filter((example) => outlineMentionsExample(outline, example)).slice(0, MAX_SHARED_EXAMPLES);
}

function formatExampleForPrompt(
  example: SharedExampleMemory,
  language: 'zh-CN' | 'en-US',
): string[] {
  const lines =
    language === 'zh-CN'
      ? [
          `- ${example.label} (${example.id})`,
          example.aliases?.length ? `  - 可识别写法：${example.aliases.join('、')}` : '',
          `  - 含义：${trimForPrompt(example.description)}`,
          example.canonicalData?.length
            ? `  - 规范/已知样本：${example.canonicalData.map((item) => trimForPrompt(item, 120)).join('；')}`
            : '',
          example.malformedData?.length
            ? `  - 已暴露的错误样本：${example.malformedData.map((item) => trimForPrompt(item, 120)).join('；')}`
            : '',
          example.rules?.length
            ? `  - 相关规则：${example.rules.map((item) => trimForPrompt(item, 120)).join('；')}`
            : '',
          example.lessonRole ? `  - 教学作用：${trimForPrompt(example.lessonRole)}` : '',
        ]
      : [
          `- ${example.label} (${example.id})`,
          example.aliases?.length ? `  - Recognize as: ${example.aliases.join(', ')}` : '',
          `  - Meaning: ${trimForPrompt(example.description)}`,
          example.canonicalData?.length
            ? `  - Canonical / known samples: ${example.canonicalData.map((item) => trimForPrompt(item, 120)).join('; ')}`
            : '',
          example.malformedData?.length
            ? `  - Previously exposed invalid samples: ${example.malformedData.map((item) => trimForPrompt(item, 120)).join('; ')}`
            : '',
          example.rules?.length
            ? `  - Related rules: ${example.rules.map((item) => trimForPrompt(item, 120)).join('; ')}`
            : '',
          example.lessonRole ? `  - Teaching role: ${trimForPrompt(example.lessonRole)}` : '',
        ];
  return lines.filter(Boolean);
}

export function formatDeckMemoryForPrompt(args: {
  outline: SceneOutline;
  allOutlines?: SceneOutline[];
  language: 'zh-CN' | 'en-US';
}): string {
  const current = enrichOutlineWithDeckMemory(args.outline, args.allOutlines);
  const examples = relevantExamplesForOutline(current);
  const continuity = current.continuity;
  const hasContinuity =
    continuity?.previousHandoff || continuity?.currentJob || continuity?.nextHandoff;
  if (!hasContinuity && examples.length === 0) return '';

  if (args.language === 'zh-CN') {
    return [
      '## Deck Memory / 前后页上下文',
      '',
      '这部分是生成本页内容时必须使用的上下文，不是要原样显示给学生的文本。它用来解释当前页里的简称、例子和承接关系。',
      continuity?.previousHandoff ? `- 上一页交给本页：${continuity.previousHandoff}` : '',
      continuity?.currentJob ? `- 本页要完成：${continuity.currentJob}` : '',
      continuity?.nextHandoff ? `- 本页要交给下一页：${continuity.nextHandoff}` : '',
      examples.length > 0 ? '' : '',
      examples.length > 0 ? '### 共享例子' : '',
      ...examples.flatMap((example) => formatExampleForPrompt(example, args.language)),
      examples.length > 0
        ? '生成时：如果本页标题、描述或 PagePlan 只写了例子简称，也要按这里的共享含义理解；不要重新发明另一个例子。'
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    '## Deck Memory / Neighbor Context',
    '',
    'This is required context for generating this page. It is not text to copy verbatim for students; use it to resolve recurring shorthand examples and page handoffs.',
    continuity?.previousHandoff ? `- Previous page hands off: ${continuity.previousHandoff}` : '',
    continuity?.currentJob ? `- This page must accomplish: ${continuity.currentJob}` : '',
    continuity?.nextHandoff ? `- This page should hand off: ${continuity.nextHandoff}` : '',
    examples.length > 0 ? '' : '',
    examples.length > 0 ? '### Shared examples' : '',
    ...examples.flatMap((example) => formatExampleForPrompt(example, args.language)),
    examples.length > 0
      ? 'When this page uses only the example label, resolve it using this shared meaning; do not invent a different example.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
