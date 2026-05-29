import {
  IMAGE_NOTEBOOK_MARKER_COLOR_POOL,
  IMAGE_NOTEBOOK_PROMPT_CANVAS_HEIGHT,
  IMAGE_NOTEBOOK_PROMPT_CANVAS_WIDTH,
  IMAGE_NOTEBOOK_PROMPT_PLAN_SCHEMA_VERSION,
  formatImageNotebookStyleBriefForPrompt,
  formatImageNotebookDensityPolicyForPrompt,
  normalizeImageNotebookStyleBrief,
  resolveImageNotebookDensityPolicyForPageCount,
  type ImageNotebookMarkerColorName,
  type ImageNotebookPagePromptPlan,
  type ImageNotebookPromptComponentPlan,
  type ImageNotebookPromptComponentRole,
  type ImageNotebookPromptLayoutSlot,
  type ImageNotebookPromptStyleProfile,
  type ImageNotebookStyleBrief,
} from '@/lib/generation/image-notebook-quality';
import type { SceneOutline } from '@/lib/types/generation';

const MASKABLE_COMPONENT_LIMIT = IMAGE_NOTEBOOK_MARKER_COLOR_POOL.length;

type BuildPromptPlanArgs = {
  outline: SceneOutline;
  allOutlines?: SceneOutline[];
  notebookTitle?: string;
  notebookGoal?: string;
  language?: 'zh-CN' | 'en-US';
  stylePrompt?: string;
  styleBrief?: ImageNotebookStyleBrief;
  sourceImageHints?: string;
};

type AttachPromptPlansArgs = Omit<BuildPromptPlanArgs, 'outline' | 'allOutlines'>;

function compactLine(value: unknown, maxLength = 420): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function textList(values: Array<unknown>, limit: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    const text = compactLine(value, 520);
    if (!text) continue;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function promptHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildStyleProfile(args: {
  stylePrompt?: string;
  styleBrief?: ImageNotebookStyleBrief;
}): ImageNotebookPromptStyleProfile {
  const styleBrief = normalizeImageNotebookStyleBrief(args.styleBrief, args.stylePrompt);
  return {
    id: 'default-hand-drawn-notebook',
    label: 'Recoverable hand-drawn notebook page',
    baselineRules: [
      ...formatImageNotebookStyleBriefForPrompt(styleBrief).map((rule) =>
        rule.startsWith('- ') ? rule.slice(2) : rule,
      ),
      'No photorealism, no UI chrome, no watermark.',
    ],
    styleBrief,
    ...(styleBrief.userStylePrompt
      ? { userStylePrompt: compactLine(styleBrief.userStylePrompt, 900) }
      : {}),
  };
}

function roleFromFocusRole(value: unknown): ImageNotebookPromptComponentRole {
  if (
    value === 'opening' ||
    value === 'setup' ||
    value === 'formula' ||
    value === 'example' ||
    value === 'proof' ||
    value === 'strategy' ||
    value === 'pitfall' ||
    value === 'takeaway' ||
    value === 'visual'
  ) {
    return value;
  }
  return 'other';
}

function slotForOrder(order: number): ImageNotebookPromptLayoutSlot {
  if (order <= 1) return 'top-full';
  if (order >= 6) return 'bottom-full';
  return (['middle-left', 'middle-center-left', 'middle-center-right', 'middle-right'][
    (order - 2) % 4
  ] || 'free') as ImageNotebookPromptLayoutSlot;
}

function componentId(outline: SceneOutline, suffix: string): string {
  return `${outline.id || `page-${outline.order || 1}`}-${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function deriveComponentsFromBrief(outline: SceneOutline): ImageNotebookPromptComponentPlan[] {
  const brief = outline.imageNotebookBrief;
  const components: ImageNotebookPromptComponentPlan[] = [];
  const push = (component: Omit<ImageNotebookPromptComponentPlan, 'order' | 'layoutSlot'>) => {
    if (!component.label.trim()) return;
    const order = components.length + 1;
    components.push({
      ...component,
      order,
      layoutSlot: slotForOrder(order),
      visibleText: component.visibleText.filter(Boolean).slice(0, 8),
      formulas: component.formulas.filter(Boolean).slice(0, 6),
    });
  };

  push({
    id: componentId(outline, 'header'),
    label: 'Header / 本页承接',
    role: 'header',
    visibleText: textList(
      [
        brief?.title || outline.title,
        brief?.pageMove.fromPrevious,
        brief?.pageMove.currentJob || outline.studentThinkingMove || outline.description,
      ],
      3,
    ),
    formulas: [],
    diagramPrompt: undefined,
    participatesInMask: true,
  });

  if (brief?.componentPlans?.length) {
    return brief.componentPlans;
  }

  if (brief?.visibleContent.mustShow?.length || outline.keyPoints?.length) {
    push({
      id: componentId(outline, 'core-content'),
      label: brief?.focusRegions.find((region) => region.role === 'setup')?.label || '核心内容',
      role: 'setup',
      visibleText: textList(
        [...(brief?.visibleContent.mustShow || []), ...(outline.keyPoints || [])],
        6,
      ),
      formulas: [],
      diagramPrompt: brief?.visualBrief,
      participatesInMask: true,
    });
  }

  if (brief?.visibleContent.formulas?.length) {
    push({
      id: componentId(outline, 'formulas'),
      label: '公式 / 符号',
      role: 'formula',
      visibleText: [],
      formulas: textList(brief.visibleContent.formulas, 6),
      diagramPrompt: undefined,
      participatesInMask: true,
    });
  }

  const exampleSteps = textList(
    [
      ...(brief?.visibleContent.exampleSteps || []),
      ...(outline.workedExampleConfig?.walkthroughSteps || []),
      outline.workedExampleConfig?.problemStatement,
    ],
    6,
  );
  if (exampleSteps.length) {
    push({
      id: componentId(outline, 'worked-example'),
      label: outline.workedExampleConfig?.role === 'walkthrough' ? '例题走读' : '例题 / 证明步骤',
      role: outline.workedExampleConfig?.kind === 'proof' ? 'proof' : 'example',
      visibleText: exampleSteps,
      formulas: [],
      diagramPrompt: outline.workedExampleConfig?.problemStatement,
      participatesInMask: true,
    });
  }

  if (brief?.visibleContent.commonPitfalls?.length) {
    push({
      id: componentId(outline, 'pitfalls'),
      label: '易错点',
      role: 'pitfall',
      visibleText: textList(brief.visibleContent.commonPitfalls, 4),
      formulas: [],
      diagramPrompt: undefined,
      participatesInMask: true,
    });
  }

  if (brief?.visibleContent.bottomTakeaway || brief?.pageMove.toNext) {
    push({
      id: componentId(outline, 'bottom-question'),
      label: '底部问题',
      role: 'question',
      visibleText: textList([brief.visibleContent.bottomTakeaway, brief.pageMove.toNext], 2),
      formulas: [],
      diagramPrompt: undefined,
      participatesInMask: true,
    });
  }

  if (components.length <= 1 && brief?.focusRegions?.length) {
    for (const region of brief.focusRegions.slice(0, 5)) {
      push({
        id: componentId(outline, region.id),
        label: region.label,
        role: roleFromFocusRole(region.role),
        visibleText: [region.label],
        formulas: [],
        diagramPrompt: undefined,
        participatesInMask: true,
      });
    }
  }

  return components.slice(0, MASKABLE_COMPONENT_LIMIT);
}

function assignMarkerColors(
  components: ImageNotebookPromptComponentPlan[],
): ImageNotebookPromptComponentPlan[] {
  let markerIndex = 0;
  return components.map((component, index) => {
    const participatesInMask =
      component.participatesInMask !== false &&
      component.role !== 'decoration' &&
      markerIndex < MASKABLE_COMPONENT_LIMIT;
    const color = participatesInMask ? IMAGE_NOTEBOOK_MARKER_COLOR_POOL[markerIndex] : undefined;
    if (participatesInMask) markerIndex += 1;
    return {
      ...component,
      id: component.id || `component-${index + 1}`,
      order: index + 1,
      layoutSlot: component.layoutSlot || slotForOrder(index + 1),
      participatesInMask,
      ...(color
        ? {
            markerColorName: color.name as ImageNotebookMarkerColorName,
            markerColorHex: color.hex,
          }
        : {
            markerColorName: undefined,
            markerColorHex: undefined,
          }),
    };
  });
}

function componentContent(component: ImageNotebookPromptComponentPlan): string {
  const parts = [
    component.visibleText.length ? `Content: ${component.visibleText.join('；')}` : '',
    component.formulas.length ? `Formulas: ${component.formulas.join('；')}` : '',
    component.diagramPrompt ? `Diagram/visual: ${component.diagramPrompt}` : '',
  ].filter(Boolean);
  return parts.join('\n   ');
}

export function compileImageNotebookPrompt(args: {
  outline: SceneOutline;
  allOutlines?: SceneOutline[];
  notebookTitle?: string;
  notebookGoal?: string;
  language?: 'zh-CN' | 'en-US';
  stylePrompt?: string;
  styleBrief?: ImageNotebookStyleBrief;
  sourceImageHints?: string;
  componentPlans: ImageNotebookPromptComponentPlan[];
}): string {
  const { outline } = args;
  const allOutlines = args.allOutlines?.length ? args.allOutlines : [outline];
  const pageIndex = Math.max(
    1,
    allOutlines.findIndex((item) => item.id === outline.id) + 1 || outline.order || 1,
  );
  const densityPolicy = resolveImageNotebookDensityPolicyForPageCount(allOutlines.length);
  const maskableComponents = args.componentPlans.filter(
    (component) => component.participatesInMask,
  );
  const ordinaryForbiddenColors = IMAGE_NOTEBOOK_MARKER_COLOR_POOL.map((color) => color.hex);
  const styleProfile = buildStyleProfile({
    stylePrompt: args.stylePrompt,
    styleBrief: args.styleBrief,
  });
  const learningComponentLines = maskableComponents.map((component, index) =>
    [
      `${index + 1}. ${component.label}`,
      `   Marker color: pure ${component.markerColorName} ${component.markerColorHex}`,
      `   Layout slot: ${component.layoutSlot}`,
      `   Role: ${component.role}`,
      `   ${componentContent(component) || 'Content: keep this component visually compact and student-facing.'}`,
      `   Put four ${component.markerColorName} corner markers around this whole component.`,
    ].join('\n'),
  );
  const decorationLines = args.componentPlans
    .filter((component) => !component.participatesInMask)
    .map(
      (component) =>
        `- ${component.label}: ${componentContent(component) || 'decorative support only'}; do not add markers.`,
    );

  return [
    'Use case: scientific-educational',
    'Asset type: 16:9 hand-drawn course notebook slide with recoverable component corner markers',
    '',
    'Primary request:',
    `Generate one ${args.notebookTitle || 'course'} hand-drawn notebook slide.`,
    'The slide should look like a normal classroom notebook page, except that each marker-tracked learning component has four tiny colored corner markers for software recovery.',
    '',
    'Slide title:',
    `“${outline.imageNotebookBrief?.title || outline.title}”`,
    '',
    'Student-visible style:',
    ...styleProfile.baselineRules.map((rule) => `- ${rule}`),
    '',
    'Notebook context:',
    args.notebookGoal ? `- Goal: ${compactLine(args.notebookGoal, 420)}` : '',
    `- Page ${pageIndex} of ${allOutlines.length}.`,
    `- Visible language: ${args.language || outline.language || 'zh-CN'}.`,
    `- Density policy:\n${formatImageNotebookDensityPolicyForPrompt(densityPolicy)}`,
    args.sourceImageHints ? `- Source image hints: ${compactLine(args.sourceImageHints, 900)}` : '',
    '',
    'Layout:',
    '- Follow the layout slot listed for each learning component.',
    '- Top/header components should read first; bottom/question components should close the page.',
    '- Keep generous whitespace between components: at least 56 px between the header/title component and the middle component row, at least 32 px between neighboring middle components, and at least 40 px between learning components and decorative sketches.',
    '- Keep every marker-tracked component inside one simple logical rectangular area; do not make a component diagonal, staggered, or split across multiple distant clusters.',
    '- Do not split one component into multiple far-apart islands.',
    '- Decorative sketches are allowed, but decorations must not receive corner markers.',
    '- Do not draw any colored frame, border, bracket, or guide line around a component.',
    '',
    'Corner marker protocol:',
    `- There are exactly ${maskableComponents.length} marker-tracked learning components.`,
    '- Each marker-tracked component must have exactly four tiny isolated colored square markers: one near the outer top-left corner, one near top-right, one near bottom-left, and one near bottom-right.',
    '- Place the four markers just outside the visual boundary of that component, as if they mark the component bounding box.',
    '- Markers should be close enough to tightly recover the component area, but not touching text, formulas, graph lines, arrows, or fills.',
    '- Leave at least 30 px of blank low-texture page background around every marker so it can be removed cleanly.',
    `- Markers are solid colored squares, about 16 px on a ${IMAGE_NOTEBOOK_PROMPT_CANVAS_WIDTH}×${IMAGE_NOTEBOOK_PROMPT_CANVAS_HEIGHT} image.`,
    '- Do not connect the markers with lines.',
    '- Do not draw colored rectangles or colored outlines.',
    `- The only pure-color marks in the entire image should be these ${maskableComponents.length * 4} marker squares.`,
    `- The pure marker colors are reserved only for markers: ${ordinaryForbiddenColors.join(', ')}.`,
    '',
    'Learning components and marker colors:',
    learningComponentLines.join('\n\n'),
    decorationLines.length
      ? `\nUnmarked decorative/support elements:\n${decorationLines.join('\n')}`
      : '',
    '',
    'Validation target:',
    `The output is valid only if it contains exactly ${maskableComponents.length * 4} isolated colored square markers: ${maskableComponents
      .map((component) => `4 ${component.markerColorName}`)
      .join(', ')}.`,
    'No colored connecting lines, no colored borders, no missing corner markers, and no extra pure-color marker-like squares.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildImageNotebookPromptPlan(
  args: BuildPromptPlanArgs,
): ImageNotebookPagePromptPlan {
  const sourceComponents = args.outline.imageNotebookPromptPlan?.componentPlans?.length
    ? args.outline.imageNotebookPromptPlan.componentPlans
    : deriveComponentsFromBrief(args.outline);
  const componentPlans = assignMarkerColors(sourceComponents);
  const maskableComponents = componentPlans.filter((component) => component.participatesInMask);
  const styleProfile = buildStyleProfile({
    stylePrompt: args.stylePrompt,
    styleBrief: args.styleBrief,
  });
  const compiledImagePrompt = compileImageNotebookPrompt({
    ...args,
    componentPlans,
  });
  const markerCountsByColor: Record<string, number> = {};
  for (const component of maskableComponents) {
    if (component.markerColorHex) markerCountsByColor[component.markerColorHex] = 4;
  }
  return {
    schemaVersion: IMAGE_NOTEBOOK_PROMPT_PLAN_SCHEMA_VERSION,
    canvas: {
      width: IMAGE_NOTEBOOK_PROMPT_CANVAS_WIDTH,
      height: IMAGE_NOTEBOOK_PROMPT_CANVAS_HEIGHT,
      aspectRatio: '16:9',
    },
    styleProfile,
    componentPlans,
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 16,
      markerCountPerComponent: 4,
      blankBackgroundPaddingPx: 30,
      maxMaskableComponents: MASKABLE_COMPONENT_LIMIT,
      colorPool: IMAGE_NOTEBOOK_MARKER_COLOR_POOL.map((color) => ({
        name: color.name,
        hex: color.hex,
      })),
      ordinaryContentForbiddenColors: IMAGE_NOTEBOOK_MARKER_COLOR_POOL.map((color) => color.hex),
    },
    compiledImagePrompt,
    promptHash: promptHash(compiledImagePrompt),
    validationTarget: {
      maskableComponentCount: maskableComponents.length,
      totalMarkerCount: maskableComponents.length * 4,
      markerCountsByColor,
      forbiddenVisibleMarks: [
        'colored connecting lines',
        'colored component borders',
        'colored rectangular outlines',
        'extra pure-color squares outside marker corners',
      ],
    },
    recoveryResult: { status: 'pending' },
  };
}

export function attachImageNotebookPromptPlan(
  outline: SceneOutline,
  args: BuildPromptPlanArgs,
): SceneOutline {
  const promptPlan = buildImageNotebookPromptPlan({ ...args, outline });
  return {
    ...outline,
    imageNotebookPromptPlan: promptPlan,
    imageNotebookPrompt: promptPlan.compiledImagePrompt,
  };
}

export function attachImageNotebookPromptPlans(
  outlines: SceneOutline[],
  args: AttachPromptPlansArgs,
): SceneOutline[] {
  return outlines.map((outline) =>
    attachImageNotebookPromptPlan(outline, {
      ...args,
      outline,
      allOutlines: outlines,
    }),
  );
}
