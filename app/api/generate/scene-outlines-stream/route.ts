/**
 * Scene Outlines Streaming API (SSE)
 *
 * Streams outline generation via Server-Sent Events.
 * Emits individual outline objects as they're parsed from the LLM response,
 * so the frontend can display them incrementally.
 *
 * SSE events:
 *   { type: 'outline', data: SceneOutline, index: number }
 *   { type: 'done', outlines: SceneOutline[] }
 *   { type: 'error', error: string }
 */

import { NextRequest } from 'next/server';
import { streamLLM } from '@/lib/ai/llm';
import { buildPrompt, PROMPT_IDS } from '@/lib/generation/prompts';
import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import {
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
  uniquifyMediaElementIds,
  formatTeacherPersonaForPrompt,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { nanoid } from 'nanoid';
import type {
  UserRequirements,
  PdfImage,
  SceneOutline,
  ImageMapping,
} from '@/lib/types/generation';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import type { CoursePurpose } from '@/lib/utils/database';
import type {
  OrchestratorOutlineLength,
  OrchestratorWorkedExampleLevel,
} from '@/lib/store/orchestrator-notebook-generation';
const log = createLogger('Outlines Stream');

export const maxDuration = 300;

function buildOrchestratorPreferencesBlock(
  language: 'zh-CN' | 'en-US',
  prefs?: {
    length: OrchestratorOutlineLength;
    includeQuizScenes: boolean;
    workedExampleLevel?: OrchestratorWorkedExampleLevel;
  } | null,
): string {
  if (!prefs) return '';

  const exampleLevel: OrchestratorWorkedExampleLevel = prefs.workedExampleLevel ?? 'moderate';

  const lengthZh: Record<OrchestratorOutlineLength, string> = {
    compact: '**篇幅**：简短——总场景数（与幻灯页数大致对应）宜在 **10 个以下**，紧凑成课。',
    standard: '**篇幅**：中等——总场景数（与幻灯页数大致对应）宜在 **约 10–20 个** 范围内。',
    extended: '**篇幅**：深入——总场景数（与幻灯页数大致对应）宜 **超过 20 个**，可分阶段展开。',
  };
  const lengthEn: Record<OrchestratorOutlineLength, string> = {
    compact:
      '**Length**: Brief — target **under 10** scenes (roughly one scene per slide/page); keep it tight.',
    standard:
      '**Length**: Standard — target **about 10–20** scenes (roughly one scene per slide/page).',
    extended:
      '**Length**: Deep — target **more than 20** scenes (roughly one scene per slide/page); staged progression is OK.',
  };

  const exampleZh: Record<OrchestratorWorkedExampleLevel, string> = {
    none: '**例题数量**：**无**——不要规划独立的「老师讲完整例题 / 分步走读」类 `slide` 序列（含证明走读、代码走读、大题拆解等）；以概念、框架与要点为主，除非用户在需求原文中明确要求讲题。',
    light:
      '**例题数量（老师带做的完整例题 / 走读，多为 `slide` 序列）**：**少量**——除非用户明确要求，优先概念与框架；完整例题（含证明走读、代码走读、大题分步讲解等）宜控制在 **约 0–1 组**，可提纲式点到为止。',
    moderate:
      '**例题数量**：**中等**——安排 **约 2–4 组** 完整例题讲解（可跨多页 `slide`），与知识点穿插，讲清思路与常见错因。',
    heavy:
      '**例题数量**：**丰富**——安排 **约 5 组及以上** 完整例题讲解，必要时同一难点用多页 `slide` 分步拆解，并覆盖变式与边界情况（在篇幅允许内）。',
  };
  const exampleEn: Record<OrchestratorWorkedExampleLevel, string> = {
    none: '**Worked-example density**: **None** — do **not** plan dedicated teacher-led full worked-example / step-by-step walkthrough `slide` sequences (proof walkthroughs, code walkthroughs, large-problem decompositions); stay concept/framework-first unless the user explicitly asks for problem walkthroughs in the requirement text.',
    light:
      '**Worked-example density (teacher-led walkthroughs, usually `slide` sequences)**: **Light** — unless the user explicitly asks, prioritize concepts/structure; aim for **about 0–1** full worked-example sequences (proof/code/large-problem walkthroughs), keep demos sketch-level.',
    moderate:
      '**Worked-example density**: **Moderate** — plan **about 2–4** full worked-example sequences (may span multiple `slide` scenes), interleaved with concepts; explain reasoning and common pitfalls.',
    heavy:
      '**Worked-example density**: **Rich** — plan **about 5+** full worked-example sequences; when needed, break hard ideas across multiple `slide` scenes with variants and edge cases (within the page budget).',
  };

  const quizZh = prefs.includeQuizScenes
    ? '**测验与题目**：请在合适位置安排若干 `quiz` 场景，用于练习与自测；讲题与例题仍以 `slide` 为主。'
    : '**测验与题目**：不要规划独立的 `quiz` 类型场景；知识点以 `slide`（及必要的 `interactive`）呈现，尽量不安排测验页。';
  const quizEn = prefs.includeQuizScenes
    ? '**Quizzes**: Include several `quiz` scenes for practice/self-check; keep worked teaching mainly on `slide`.'
    : '**Quizzes**: Do **not** plan standalone `quiz` scenes; teach with `slide` (and `interactive` when helpful), avoid quiz pages.';

  const title =
    language === 'zh-CN'
      ? '## 用户在本轮指定的生成偏好'
      : '## User-selected generation preferences for this run';
  const lines =
    language === 'zh-CN'
      ? [
          title,
          '',
          lengthZh[prefs.length],
          '',
          exampleZh[exampleLevel],
          '',
          quizZh,
          '',
          '以上偏好优先于默认篇幅/例题/测验策略；若与用户原文需求冲突，以用户原文为准。',
        ]
      : [
          title,
          '',
          lengthEn[prefs.length],
          '',
          exampleEn[exampleLevel],
          '',
          quizEn,
          '',
          'These preferences override default length/example/quiz heuristics unless the user text explicitly conflicts.',
        ];

  return lines.join('\n');
}

function buildCourseContextForPrompt(args: {
  language: 'zh-CN' | 'en-US';
  courseContext?: {
    name?: string;
    description?: string;
    tags?: string[];
    purpose?: CoursePurpose;
    university?: string;
    courseCode?: string;
    language?: 'zh-CN' | 'en-US';
  };
}): string {
  const { language, courseContext } = args;
  if (!courseContext) return language === 'zh-CN' ? '无' : 'N/A';
  return [
    `name: ${courseContext.name || ''}`,
    `description: ${courseContext.description || ''}`,
    `tags: ${(courseContext.tags || []).join(', ')}`,
    `purpose: ${courseContext.purpose || ''}`,
    `university: ${courseContext.university || ''}`,
    `courseCode: ${courseContext.courseCode || ''}`,
    `courseLanguage: ${courseContext.language || ''}`,
    'Use this context to tune tone, prerequisites, and scenario examples.',
  ].join('\n');
}

/**
 * Incremental JSON array parser.
 * Extracts complete top-level objects from a partially-streamed JSON array.
 * Returns newly found objects (skipping `alreadyParsed` count).
 */
function extractNewOutlines(buffer: string, alreadyParsed: number): SceneOutline[] {
  const results: SceneOutline[] = [];

  // Find the start of the JSON array (skip any markdown fencing)
  const stripped = buffer.replace(/^[\s\S]*?(?=\[)/, '');
  const arrayStart = stripped.indexOf('[');
  if (arrayStart === -1) return results;

  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  let objectCount = 0;

  for (let i = arrayStart + 1; i < stripped.length; i++) {
    const char = stripped[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        objectCount++;
        if (objectCount > alreadyParsed) {
          try {
            const obj = JSON.parse(stripped.substring(objectStart, i + 1));
            results.push(obj);
          } catch {
            // Incomplete or invalid JSON — skip
          }
        }
        objectStart = -1;
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get API configuration from request headers
    const {
      model: languageModel,
      modelInfo,
      modelString,
    } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });

    if (!body.requirements) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Requirements are required');
    }

    const { requirements, pdfText, pdfImages, imageMapping, researchContext, agents } = body as {
      requirements: UserRequirements;
      pdfText?: string;
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      researchContext?: string;
      agents?: AgentInfo[];
      coursePurpose?: CoursePurpose;
      outlinePreferences?: {
        length: OrchestratorOutlineLength;
        includeQuizScenes: boolean;
        workedExampleLevel?: OrchestratorWorkedExampleLevel;
      } | null;
      courseContext?: {
        name?: string;
        description?: string;
        tags?: string[];
        purpose?: CoursePurpose;
        university?: string;
        courseCode?: string;
        language?: 'zh-CN' | 'en-US';
      };
    };

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Build prompt (same logic as generateSceneOutlinesFromRequirements)
    let availableImagesText =
      requirements.language === 'zh-CN' ? '无可用图片' : 'No images available';
    let visionImages: Array<{ id: string; src: string }> | undefined;

    if (pdfImages && pdfImages.length > 0) {
      if (hasVision && imageMapping) {
        // Vision mode: split into vision images (first N) and text-only (rest)
        const allWithSrc = pdfImages.filter((img) => imageMapping[img.id]);
        const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
        const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
        const noSrcImages = pdfImages.filter((img) => !imageMapping[img.id]);

        const visionDescriptions = visionSlice.map((img) =>
          formatImagePlaceholder(img, requirements.language),
        );
        const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
          formatImageDescription(img, requirements.language),
        );
        availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

        visionImages = visionSlice.map((img) => ({
          id: img.id,
          src: imageMapping[img.id],
          width: img.width,
          height: img.height,
        }));
      } else {
        // Text-only mode: full descriptions
        availableImagesText = pdfImages
          .map((img) => formatImageDescription(img, requirements.language))
          .join('\n');
      }
    }

    // Build media generation policy based on enabled flags
    const imageGenerationEnabled = req.headers.get('x-image-generation-enabled') === 'true';
    const videoGenerationEnabled = req.headers.get('x-video-generation-enabled') === 'true';
    let mediaGenerationPolicy = '';
    if (!imageGenerationEnabled && !videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any mediaGenerations in the outlines. Both image and video generation are disabled.**';
    } else if (!imageGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any image mediaGenerations (type: "image") in the outlines. Image generation is disabled. Video generation is allowed.**';
    } else if (!videoGenerationEnabled) {
      mediaGenerationPolicy =
        '**IMPORTANT: Do NOT include any video mediaGenerations (type: "video") in the outlines. Video generation is disabled. Image generation is allowed.**';
    }

    // Build teacher context from agents (if available)
    const teacherContext = formatTeacherPersonaForPrompt(agents);
    const userProfile =
      requirements.userNickname || requirements.userBio
        ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
        : '';
    const purposePolicy =
      body.coursePurpose === 'research'
        ? requirements.language === 'zh-CN'
          ? '课程用途：科研。优先生成概念、方法论与案例式说明；通常不插入测验、正式题目讲解或独立 interactive 交互页面（除非用户明确要求做交互式模拟/可视化）。'
          : 'Course purpose: research. Prefer concept, methodology, and case-based explanation; avoid quizzes, formal worked-problem teaching, or standalone interactive pages unless the user explicitly asks for an interactive simulation or visualization.'
        : body.coursePurpose === 'daily'
          ? requirements.language === 'zh-CN'
            ? '课程用途：日常生活。优先口语化、风趣、易懂的表达，通常不插入测验或正式题目讲解（除非用户明确要求）。'
            : 'Course purpose: daily life. Prefer conversational, friendly tone; avoid quizzes or formal worked-problem teaching unless explicitly requested.'
          : body.coursePurpose === 'university'
            ? requirements.language === 'zh-CN'
              ? '课程用途：大学课程。可适当加入作业/考试导向练习；需要老师讲题时，优先用 slide 场景做例题讲解，把 quiz 主要用于学生练习/自测。解题尽量基于课程已学前置知识，避免超纲。'
              : 'Course purpose: university. Include homework/exam-oriented practice when suitable; when the teacher should explain a problem, prefer slide-based worked examples, while quizzes remain mainly for student practice/self-check. Keep solutions within in-syllabus prerequisites.'
            : '';

    const courseContext = buildCourseContextForPrompt({
      language: requirements.language,
      courseContext: body.courseContext,
    });

    const orchestratorPreferences = buildOrchestratorPreferencesBlock(
      requirements.language,
      body.outlinePreferences ?? null,
    );

    const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
      requirement: requirements.requirement,
      language: requirements.language,
      pdfContent: pdfText
        ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS)
        : requirements.language === 'zh-CN'
          ? '无'
          : 'None',
      availableImages: availableImagesText,
      userProfile,
      researchContext: researchContext || (requirements.language === 'zh-CN' ? '无' : 'None'),
      mediaGenerationPolicy,
      teacherContext,
      purposePolicy,
      courseContext,
      orchestratorPreferences,
    });

    if (!prompts) {
      return apiError('INTERNAL_ERROR', 500, 'Prompt template not found');
    }

    log.info(
      `Generating outlines: "${requirements.requirement.substring(0, 50)}" [model=${modelString}]`,
    );

    // Create SSE stream with heartbeat to prevent connection timeout
    const encoder = new TextEncoder();
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const stream = new ReadableStream({
      async start(controller) {
        // Heartbeat: periodically send SSE comments to keep the connection alive.
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const startHeartbeat = () => {
          stopHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`:heartbeat\n\n`));
            } catch {
              stopHeartbeat();
            }
          }, HEARTBEAT_INTERVAL_MS);
        };
        const stopHeartbeat = () => {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        };

        const MAX_STREAM_RETRIES = 2;

        try {
          startHeartbeat();

          const streamParams = visionImages?.length
            ? {
                model: languageModel,
                system: prompts.system,
                messages: [
                  {
                    role: 'user' as const,
                    content: buildVisionUserContent(prompts.user, visionImages),
                  },
                ],
                maxOutputTokens: modelInfo?.outputWindow,
              }
            : {
                model: languageModel,
                system: prompts.system,
                prompt: prompts.user,
                maxOutputTokens: modelInfo?.outputWindow,
              };

          let parsedOutlines: SceneOutline[] = [];
          let lastError: string | undefined;

          for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            try {
              const result = await runWithRequestContext(
                req,
                '/api/generate/scene-outlines-stream',
                () => streamLLM(streamParams, 'scene-outlines-stream'),
              );

              let fullText = '';
              parsedOutlines = [];

              for await (const chunk of result.textStream) {
                fullText += chunk;

                // Try to extract new outlines from the accumulated text
                const newOutlines = extractNewOutlines(fullText, parsedOutlines.length);
                for (const outline of newOutlines) {
                  // Ensure ID and order
                  const enriched = {
                    ...normalizeSceneOutlineContentProfile(outline),
                    id: outline.id || nanoid(),
                    order: parsedOutlines.length + 1,
                  };
                  parsedOutlines.push(enriched);

                  const event = JSON.stringify({
                    type: 'outline',
                    data: enriched,
                    index: parsedOutlines.length - 1,
                  });
                  controller.enqueue(encoder.encode(`data: ${event}\n\n`));
                }
              }

              // Validate: got outlines?
              if (parsedOutlines.length > 0) break;

              // Empty result — retry if we have attempts left
              lastError = fullText.trim()
                ? 'LLM response could not be parsed into outlines'
                : 'LLM returned empty response';

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Empty outlines (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                );
                // Notify client a retry is happening
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
              }
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);

              if (attempt <= MAX_STREAM_RETRIES) {
                log.warn(
                  `Stream error (attempt ${attempt}/${MAX_STREAM_RETRIES + 1}), retrying...`,
                  error,
                );
                const retryEvent = JSON.stringify({
                  type: 'retry',
                  attempt,
                  maxAttempts: MAX_STREAM_RETRIES + 1,
                });
                controller.enqueue(encoder.encode(`data: ${retryEvent}\n\n`));
                continue;
              }
            }
          }

          if (parsedOutlines.length > 0) {
            // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
            const uniquifiedOutlines = uniquifyMediaElementIds(parsedOutlines);
            // Send done event with all outlines
            const doneEvent = JSON.stringify({
              type: 'done',
              outlines: uniquifiedOutlines,
            });
            controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
          } else {
            // All retries exhausted, no outlines produced
            log.error(
              `Outline generation failed after ${MAX_STREAM_RETRIES + 1} attempts: ${lastError}`,
            );
            const errorEvent = JSON.stringify({
              type: 'error',
              error: lastError || 'Failed to generate outlines',
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
          }
        } catch (error) {
          const errorEvent = JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        } finally {
          stopHeartbeat();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error('Streaming error:', error);
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
