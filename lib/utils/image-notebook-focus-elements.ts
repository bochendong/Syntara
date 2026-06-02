import {
  IMAGE_NOTEBOOK_CANVAS_HEIGHT,
  IMAGE_NOTEBOOK_CANVAS_WIDTH,
  type ImageNotebookPagePromptPlan,
} from '@/lib/generation/image-notebook-quality';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement, PPTShapeElement, Slide } from '@/lib/types/slides';

const GENERATED_FOCUS_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const GENERATED_FOCUS_TARGET_RE = /lecture-focus-generated|semantic-hit-map/i;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isImageNotebookFocusElement(element: unknown): boolean {
  if (!isRecord(element)) return false;
  return GENERATED_FOCUS_TARGET_RE.test(
    `${String(element.id || '')} ${String(element.name || '')}`,
  );
}

function clampRect(
  rect: { left: number; top: number; width: number; height: number },
  slide: Slide,
) {
  const viewportSize = slide.viewportSize || IMAGE_NOTEBOOK_CANVAS_WIDTH;
  const viewportRatio =
    slide.viewportRatio || IMAGE_NOTEBOOK_CANVAS_HEIGHT / IMAGE_NOTEBOOK_CANVAS_WIDTH;
  const canvasHeight = viewportSize * viewportRatio;
  const left = Math.max(0, Math.min(viewportSize - 20, rect.left));
  const top = Math.max(0, Math.min(canvasHeight - 20, rect.top));
  return {
    left: round1(left),
    top: round1(top),
    width: round1(Math.max(20, Math.min(viewportSize - left, rect.width))),
    height: round1(Math.max(20, Math.min(canvasHeight - top, rect.height))),
  };
}

function focusShape(args: {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}): PPTShapeElement {
  return {
    id: args.id,
    name: `lecture-focus-generated: ${args.label}`,
    type: 'shape',
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: GENERATED_FOCUS_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function focusLabelForComponent(
  component: NonNullable<ImageNotebookPagePromptPlan['componentPlans']>[number],
): string {
  const visibleText = [...(component.visibleText || []), ...(component.formulas || [])]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' / ');
  return visibleText ? `${component.label}: ${visibleText}` : component.label;
}

export function buildImageNotebookFocusElementsFromPromptPlan(
  promptPlan: ImageNotebookPagePromptPlan | undefined,
  slide: Slide,
): PPTShapeElement[] {
  const recoveredById = new Map(
    (promptPlan?.recoveryResult?.components || [])
      .filter((component) => component.bbox)
      .map((component) => [component.componentId, component] as const),
  );
  if (recoveredById.size === 0) return [];

  const scaleX = (slide.viewportSize || IMAGE_NOTEBOOK_CANVAS_WIDTH) / IMAGE_NOTEBOOK_CANVAS_WIDTH;
  const scaleY =
    ((slide.viewportSize || IMAGE_NOTEBOOK_CANVAS_WIDTH) *
      (slide.viewportRatio || IMAGE_NOTEBOOK_CANVAS_HEIGHT / IMAGE_NOTEBOOK_CANVAS_WIDTH)) /
    IMAGE_NOTEBOOK_CANVAS_HEIGHT;

  return (promptPlan?.componentPlans || [])
    .filter((component) => component.participatesInMask)
    .flatMap((component) => {
      const recovered = recoveredById.get(component.id);
      const bbox = recovered?.bbox;
      if (!bbox) return [];
      const rect = clampRect(
        {
          left: bbox[0] * scaleX,
          top: bbox[1] * scaleY,
          width: bbox[2] * scaleX,
          height: bbox[3] * scaleY,
        },
        slide,
      );
      return focusShape({
        id: component.id,
        label: focusLabelForComponent(component) || component.id,
        ...rect,
      });
    });
}

export function ensureImageNotebookFocusElementsInContent(content: SlideContent): SlideContent {
  const plannedFocusElements = buildImageNotebookFocusElementsFromPromptPlan(
    content.imageNotebookPromptPlan,
    content.canvas,
  );
  if (plannedFocusElements.length === 0) return content;

  const elements = content.canvas.elements;
  const existingIds = new Set(elements.map((element) => element.id));
  const missingFocusElements = plannedFocusElements.filter(
    (element) => !existingIds.has(element.id),
  );
  if (missingFocusElements.length === 0) return content;

  return {
    ...content,
    canvas: {
      ...content.canvas,
      elements: [...elements, ...missingFocusElements] as PPTElement[],
    },
  };
}
