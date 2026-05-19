import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { buildVisionUserContent } from '@/lib/generation/prompt-formatters';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { runWithRequestContext } from '@/lib/server/request-context';
import {
  combineTokenUsage,
  estimateGenerationCost,
  shouldSkipCreditChargeForTestRequest,
} from './_lib/cost';
import {
  buildPlanningQualityRetryPrompt,
  evaluatePlanningQuality,
  planningQualityScore,
} from './_lib/quality';
import { inferCourseRouteFromText, normalizeTier, tierBounds } from './_lib/routes';
import {
  compactSourceImages,
  compactText,
  sourceImagesForPrompt,
  sourceImagesForVision,
  sourcePagesForPrompt,
} from './_lib/source-utils';
import {
  describePlanParseFailure,
  normalizeCoursePlan,
  normalizeCourseSpine,
  parseCourseSpinePlan,
  parsePlan,
} from './_lib/normalization';
import type { HtmlCostEstimate, PlanningQualityIssue, RequestBody, TokenUsage } from './_lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const tier = normalizeTier(body.pageBudgetTier || body.pageCountTier);
    const bounds = tierBounds(tier);
    const sourcePackage = body.sourcePackage;
    const sourcePages = Array.isArray(sourcePackage?.sourcePages)
      ? sourcePackage.sourcePages
      : Array.isArray(body.sourcePages)
        ? body.sourcePages
        : [];
    const requestedPlanningStage = body.planningStage === 'course-spine' ? 'course-spine' : 'full';
    const hasSeededStructuredInput =
      requestedPlanningStage === 'full' && Boolean(body.coursePlanSeed || body.courseSpineSeed);
    const sourceImages = compactSourceImages(sourcePackage?.sourceImages);
    const sourceText = compactText(
      sourcePackage?.sourceText,
      hasSeededStructuredInput ? 4000 : 12000,
    );
    const effectiveFileName = sourcePackage?.fileName || body.fileName;
    const effectiveFileType = sourcePackage?.fileType || body.fileType || 'unknown';
    const imageUsePolicy = body.imageUsePolicy || 'prefer-source-images';
    if (!effectiveFileName || sourcePages.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing fileName or sourcePages');
    }
    const isNotebookMode = body.mode === 'notebook';
    const planningContextText = [
      sourcePackage?.subject,
      body.subject,
      body.title,
      effectiveFileName,
      sourcePackage?.fileName,
      sourcePages
        .slice(0, 10)
        .map((page) => [page.title, page.summary, page.concreteAnchor].filter(Boolean).join('\n'))
        .join('\n\n'),
      sourceText.slice(0, 3000),
    ]
      .filter(Boolean)
      .join('\n');
    const routeHint = inferCourseRouteFromText(planningContextText);
    const parseContext = { routeHint, contextText: planningContextText };

    const { model, modelInfo, modelString } = await resolveModelFromHeaders(req, {
      allowOpenAIModelOverride: true,
    });
    const planningVisionImages =
      !hasSeededStructuredInput && modelInfo?.capabilities?.vision
        ? sourceImagesForVision(sourcePackage?.sourceImages)
        : [];
    const skipCreditCharge = shouldSkipCreditChargeForTestRequest(req);
    const planningStage = requestedPlanningStage;

    if (planningStage === 'course-spine') {
      const lightSystem = [
        'You are a senior curriculum director.',
        'Return only a compact JSON director statement for a lesson. Do not write slide outlines, html prompts, narration, or page layouts.',
        'All visible course text must be Simplified Chinese, except code identifiers and unavoidable source terms.',
        'coursePlan must stay lightweight: one targetLearner sentence, one courseGoal sentence, 2-3 coreQuestions, no narrativeArc.',
        'courseSpine owns the movie-script structure: logline, openingHook, centralQuestion, 3-5 acts, recurringExample, visualMotif, closingCallback.',
        'Return JSON only. No markdown fences.',
      ].join('\n');
      const lightPrompt = [
        isNotebookMode
          ? '为这个 notebook 生成轻量 coursePlan + courseSpine。'
          : '为这个源文件生成轻量 coursePlan + courseSpine。',
        '',
        `标题：${body.title || effectiveFileName}`,
        `科目/主题：${sourcePackage?.subject || body.subject || '-'}`,
        `页数档位：${bounds.label}，预计最终 slides.length 必须在 ${bounds.min}-${bounds.max} 之间。`,
        `课程路线初判：${routeHint}`,
        '',
        '边界：',
        '- 不要输出 slideOutlines。',
        '- 不要输出 slides。',
        '- 不要输出 htmlPrompt。',
        '- 不要写 narrativeArc；叙事推进只写到 courseSpine.acts。',
        '- coursePlan 只回答：教谁、学会什么、带着哪几个问题学。',
        '- courseSpine 负责：开场钩子、中心问题、acts、结尾回扣。',
        '',
        'JSON schema：',
        JSON.stringify(
          {
            lessonTitle: 'string',
            pageCountTier: tier,
            pageCount: 'number',
            coursePlan: {
              targetLearner: '1 句',
              courseGoal: '1 句',
              prerequisiteAssumptions: ['最多 3 条'],
              coreQuestions: ['2-3 个整课级学生问题'],
              sourceDigest: ['0-2 条最高层源材料取舍；可为空'],
              pacingStrategy: '1 句，说明节奏约束；不写叙事弧线',
            },
            courseSpine: {
              logline: '一句话整课主线，像电影 logline',
              openingHook: '第 2 页要提出的开场总问题',
              centralQuestion: '整节课反复回答的中心问题',
              acts: [
                {
                  id: 'act-setup',
                  act: 'setup | development | turn | synthesis',
                  title: '总：建立问题',
                  purpose: '这一幕在整课中的作用',
                  pages: [1, 2],
                  keyQuestion: '这一幕驱动的问题',
                  visualMotif: '贯穿这一幕的视觉/例子母题',
                },
              ],
              recurringExample: '中间页反复回到的例子、对象、材料或场景',
              visualMotif: '贯穿整课的视觉母题',
              closingCallback: '最后一页如何回扣 openingHook / centralQuestion',
            },
            planningNotes: ['最多 3 条，仅记录关键取舍'],
          },
          null,
          2,
        ),
        '',
        '源文本摘录：',
        sourceText.slice(0, 7000) || '无额外源文本摘录。',
        '',
        '源页摘要：',
        sourcePagesForPrompt(sourcePages),
      ].join('\n');

      const lightRun = await runWithRequestContext(
        req,
        '/api/generation-quality/html-lesson-plan',
        async () => {
          const result = await callLLM(
            {
              model,
              system: lightSystem,
              prompt: lightPrompt,
              maxOutputTokens: Math.min(modelInfo?.outputWindow || 8000, 8000),
            },
            'html-lesson-plan-test-course-spine',
            {
              retries: 1,
              validate: (text) =>
                Boolean(
                  parseCourseSpinePlan(text, tier, body.title || effectiveFileName || 'HTML 课程'),
                ),
            },
          );
          return {
            result,
            plan: parseCourseSpinePlan(
              result.text,
              tier,
              body.title || effectiveFileName || 'HTML 课程',
            ),
            usage: combineTokenUsage([result.usage as TokenUsage | undefined]),
          };
        },
        {
          operationCode: 'html_lesson_plan_test',
          chargeReason: 'HTML 轻量 coursePlan 测试',
          serviceLabel: 'HTML lightweight course spine generation',
          skipCreditCharge,
        },
      );

      if (!lightRun.plan) {
        return apiError(
          'PARSE_FAILED',
          502,
          'Failed to parse lightweight coursePlan JSON',
          lightRun.result.text.slice(0, 2000),
        );
      }

      return apiSuccess({
        plan: lightRun.plan,
        model: modelString,
        usage: lightRun.usage,
        costEstimate: estimateGenerationCost(
          modelString,
          lightRun.usage ?? undefined,
        ) as HtmlCostEstimate | null,
        skippedCreditCharge: skipCreditCharge,
        planningQuality: null,
        planningRetryCount: 0,
        planningRetryReasons: [],
      });
    }

    const seedCoursePlan =
      body.coursePlanSeed && typeof body.coursePlanSeed === 'object'
        ? normalizeCoursePlan(body.coursePlanSeed, body.title || effectiveFileName || 'HTML 课程')
        : null;
    const seedCourseSpine =
      body.courseSpineSeed && typeof body.courseSpineSeed === 'object'
        ? normalizeCourseSpine(
            body.courseSpineSeed,
            body.title || effectiveFileName || 'HTML 课程',
            seedCoursePlan ||
              normalizeCoursePlan(undefined, body.title || effectiveFileName || 'HTML 课程'),
            bounds.max,
          )
        : null;
    const seededStructuredPlan = Boolean(seedCoursePlan || seedCourseSpine);
    const sourcePagePromptLimit = seededStructuredPlan ? Math.min(16, bounds.max + 6) : 28;

    const system = [
      'You are a senior curriculum planner and presentation prompt engineer.',
      seededStructuredPlan
        ? 'Your job is to expand an approved lightweight course spine into compact slideOutlines and compact slide records. Do not write long html prompts; the server will synthesize htmlPrompt from your structured fields.'
        : isNotebookMode
          ? 'Your job is to plan an entire subject notebook deck from one uploaded notebook source file, then write the exact prompt for each slide that will be sent to a separate HTML/CSS slide generator.'
          : 'Your job is to plan an entire lesson deck from uploaded-file source material, then write the exact prompt for each slide that will be sent to a separate HTML/CSS slide generator.',
      'All visible slide content must be Simplified Chinese, except code identifiers, API names, variables, filenames, and unavoidable source terms.',
      'You must control slide capacity upstream. Do not ask a later HTML generator to fit too much content into one page.',
      'A slide prompt should describe one focused teaching move, a small amount of content, and an explicit content budget.',
      'The whole deck must read like a movie script for a lesson: one logline, a clear opening hook, 3-5 acts, page-to-page callbacks, and a final return to the opening question.',
      'Use a 总-分-总 structure: first establish the central question, then split it into evidence/examples/steps, then synthesize and callback. Do not let pages feel like independent mini-lessons.',
      'You must decide the canvas upstream. Use canvasMode "slide" for concise 1600×900 pages, "tall" for ordinary teaching pages that need 1200-1400px height, and "long" only for real vertical walkthroughs such as math proofs/long derivations and CS trace/memory/code walkthroughs.',
      'Tall/long pages are deliberate formats, not layout escapes. Use "tall" when a 16:9 slide would force footer overlap but the page is still one compact teaching move; use "long" only when the teaching action genuinely needs a vertical sequence.',
      'For mathematics source files, first identify the canonical mathematical object, notation, representation, and verification move from the source. The visual plan must use editable mathematical structures such as definition boards, symbolic notation, tables, diagrams, derivation ladders, proof blocks, or worked examples. Do not ask for decorative/AI illustrations as the main teaching visual.',
      'When adapting examples, choose small examples that preserve the source concept and can be checked on the slide. Do not introduce whimsical symbols, decorative sets, or new notation unless the source uses them.',
      'When source figures are attached as vision input, inspect the actual images before assigning any sourceImageIds.',
      'Do not assign sourceImageIds by page number, filename, or source proximity alone. An image can support a slide only when its actual visual content matches the slide objective.',
      'Never call a photo, sample frame, or visual example an architecture diagram, table, chart, pipeline, or flowchart unless it visibly is one.',
      'Do not repeat the same source image across multiple slides unless the plan intentionally performs close reading of the same figure from different angles, and explain that reason in planningNotes and htmlPrompt.',
      'If no source image visually supports a slide, leave sourceImageIds empty. Do not force images for decoration.',
      'The first slide must be a cover slide with pageKind "cover"; it is not an intro lesson slide, the title is the only mandatory visible text, and it must not contain the first teaching explanation. Its visual plan must require a full-bleed hero/background with the title directly overlaid, not a centered title card or panel.',
      'The second slide must be an intro slide with pageKind "intro"; it should orient the learner before the first content explanation.',
      'The final slide must be a summary slide with pageKind "summary"; it should consolidate the notebook and must not introduce a new topic.',
      'Every slide and slideOutline must include a continuity object. It must say what it inherits from the previous slide, what single page move it performs, what it prepares next, and how it callbacks to the course spine.',
      'A slide prompt must also name the subject route when it is clear: math, computer-science, science, business, humanities, or social-science. The downstream HTML generator will use that route as a hard teaching-grammar constraint.',
      'The slide title and the title requested inside htmlPrompt must be identical. Do not use one title for planning and another title for rendering.',
      'Every htmlPrompt must separate mandatory content from optional/deletable content. Mandatory content includes title, stated counts, core formulas, reasons, conclusions, and checkpoints.',
      'If a slide title or prompt says a number of items, the prompt must list exactly that many visible items and forbid changing the count.',
      'The deck structure must be: slide 1 cover, slide 2 intro, final slide summary. Only slides between intro and summary may carry the main source teaching sequence.',
      'When a slide contains definitions plus example/checkpoint content, the prompt must tell the HTML generator to use non-overlapping flex/grid flow and to reduce optional copy instead of clipping cards.',
      'You may adapt or replace a source example with a shorter equivalent example when that better fits the slide, but keep the same learning objective, mark sourceUsage as adapted or new-example, and explain the reason in sourceUseRationale.',
      'Do not plan lecture notes, narration, animation, or teacher actions. Only plan static editable HTML PPT slides.',
      seededStructuredPlan
        ? 'For every slide, set htmlPrompt to an empty string. Never generate full htmlPrompt prose in this stage.'
        : '',
      'Return JSON only. No markdown fences, no explanation.',
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = [
      isNotebookMode
        ? '为下面这个 testfile 科目目录里的单个文件规划一本完整 notebook 的 HTML PPT slides。'
        : '为下面这个 testfile 源文件规划一整节课的 HTML PPT slides。',
      '',
      isNotebookMode
        ? `科目：${sourcePackage?.subject || body.subject || body.title || effectiveFileName}`
        : `文件：${effectiveFileName}（${effectiveFileType}）`,
      isNotebookMode ? `来源文件数：${body.sourceFileCount || '-'}` : '',
      isNotebookMode
        ? `Notebook 标题：${body.title || effectiveFileName}`
        : `文件主题：${body.title || effectiveFileName}`,
      isNotebookMode
        ? `Notebook 说明：${body.description || '-'}`
        : `文件说明：${body.description || '-'}`,
      `源材料长度：${sourcePackage?.sourceText?.length || body.sourceTextLength || 0}`,
      `源材料解析器：${sourcePackage?.parser || '-'}`,
      `原文图片数量：${sourceImages.length}`,
      planningVisionImages.length
        ? `原文图片视觉输入：已随本次请求附带 ${planningVisionImages.length} 张可看原图；必须先看图再决定 sourceImageIds。`
        : '原文图片视觉输入：无可看原图或当前模型未启用 vision；只能依赖图片说明，不确定时不要分配图片。',
      `原文图片策略：${imageUsePolicy === 'prefer-source-images' ? '优先复用原文图片' : '文本优先，图片只在必要时使用'}`,
      sourcePackage?.warnings?.length ? `解析警告：${sourcePackage.warnings.join('；')}` : '',
      `用户选择页数档位：${bounds.label}`,
      `你需要自己决定精确页数，但 slides.length 必须在 ${bounds.min}-${bounds.max} 之间。`,
      '',
      '核心目标：',
      '- 先做两遍源材料分析，再写 slides：第一遍提取知识主线/教学顺序；第二遍盘点每张原文图实际是什么、能不能支持某一页。',
      seededStructuredPlan
        ? '- 本阶段只展开 slideOutlines 和 compact slides；slides[].htmlPrompt 一律填空字符串，由后端根据结构化字段自动合成。'
        : '- 输出时必须先形成轻量 coursePlan 和 courseSpine，再形成 slideOutlines，最后才写 slides[].htmlPrompt。不要一上来就写页面布局。',
      seedCoursePlan || seedCourseSpine
        ? '- 已有通过的轻量 coursePlan/courseSpine 作为硬锚点：保持同一个中心问题、logline、openingHook 和 closingCallback；这里只展开逐页 outline/htmlPrompt，不要重写成另一节课。'
        : '',
      '- coursePlan 不是教案正文，只负责导演阐述：targetLearner 1 句、courseGoal 1 句、coreQuestions 2-3 个、prerequisiteAssumptions 最多 3 个、pacingStrategy 1 句。',
      '- 不要在 coursePlan 里写 narrativeArc；叙事弧线、总分总推进、acts 和回扣全部由 courseSpine 负责。',
      '- coursePlan.sourceDigest 只允许 0-3 条最高层取舍；详细源材料依据必须下沉到每页 slideOutlines/sourceAnchors/sourceUseRationale。',
      '- 禁止在 coursePlan 写逐页细节、长段源材料复述、完整讲解稿或页面布局。逐页怎么讲由 slideOutlines 负责，怎么画由 htmlPrompt 负责。',
      '- courseSpine 负责回答“这节课像一部短片怎样推进”：一句话 logline、开场钩子、中心问题、3-5 幕 acts、反复出现的例子/视觉母题、结尾回扣。',
      '- 必须用总-分-总：第 2 页提出总问题；中间页每页只推进一个分镜动作；最后 1 页回扣开场问题和整课 logline。',
      '- 每个 slideOutline 和 slide 都必须写 continuity：actId、rhetoricalRole、fromPrevious、pageMove、toNext、callbackToSpine，不能让上一页和下一页割裂。',
      '- slideOutlines 负责回答“每页教学上解决什么问题”：learnerQuestion、teachingObjective、keyPoints、sourceAnchors、sourceUseRationale、visualPlan、必需可见内容和可删内容。',
      seededStructuredPlan
        ? '- slides[].htmlPrompt 必须全部填 ""；不要输出长 prompt。'
        : '- slides[].htmlPrompt 只能是对 slideOutline 和 continuity 的渲染翻译；不能在 htmlPrompt 里新增第二个主题、额外例题、额外图或新的教学目标。',
      sourceImages.length
        ? '- planningNotes 必须包含 2-5 条图像盘点/取舍记录，例如“img_2 实际是视觉样例，不适合作架构图；只用于能力示例页”。'
        : '',
      isNotebookMode
        ? '- 先做整本 notebook 的内容分配：跨文件合并、删繁就简、分章节组织，再给每一页写可直接发送给 HTML 生成接口的 prompt。'
        : '- 先做整节课内容分配，再给每一页写可直接发送给 HTML 生成接口的 prompt。',
      '- 第 1 页必须是封面页，pageKind 必须是 cover；封面只建立 notebook/课程主题识别，不展开正文；主标题是唯一必须文字，最多 1 行极短副标题/元信息可选。',
      '- 第 1 页封面必须规划为 full-bleed 主视觉：标题直接叠在全幅背景/主视觉上，不要标题卡、半透明面板、居中盒子，也不要显示“notebook 封面”“封面页”“cover”“主视觉”“背景”等占位词。',
      '- 第 2 页必须是介绍/导入页，pageKind 必须是 intro；它负责说明为什么学、学习路径和 3-4 个入口问题，不讲完整正文。',
      '- 最后 1 页必须是总结页，pageKind 必须是 summary；它负责 3-5 条 takeaway、回看路径和下一步问题，不新增新知识。',
      isNotebookMode
        ? '- 不需要机械覆盖每个源页；可以合并相邻页、跳过重复页、用更短的新例子替代源文件冗长例子，但必须保留这本 notebook 的知识主线。'
        : '- 不要机械照搬源页；可以合并相邻页、跳过重复页、用更短的新例子替代源文件冗长例子，但必须保留这节课的知识主线。',
      isNotebookMode
        ? '- 每一页都要说明它来自哪个文件/主题，sourceCoverage 里优先写“文件名 + 源页/主题”。'
        : '- 每一页都要说明它覆盖哪个源页/主题。',
      '- 标准 16:9 页最多 3 个主要内容区；标题区不算，底部一句结论/检查点算 1 个内容区。tall 中高页面可以有 3-5 个内容区；long 长页面可以有 4-7 个纵向 section。',
      '- 不要把一整页源文件塞进一页 PPT；如果密度过高，拆到下一页或删掉次要内容。',
      '- 每页必须选择 canvasMode：默认是 slide（1600×900）；如果只是普通教学页略微放不下，使用 tall（1600×1200 或 1600×1400）；只有数学证明/长推导/完整例题拆解、CS execution trace / memory diagram / call stack / 代码题讲解等需要纵向过程时，才使用 long。',
      '- 如果使用 canvasMode=tall，canvasHeight 只能选 1200 或 1400 附近；tall 仍然是课件页，不是网页文章。',
      '- 如果使用 canvasMode=long，canvasHeight 只能选 1800、2200、2400、2800 或 3200 附近；long 仍然是 1600px 同宽课件板，不是网页文章。',
      '- 如果一页在 16:9 中需要用底部结论条覆盖主内容才能放下，说明这页应该拆页、压缩内容，或规划为 tall/long；绝对不能规划成会 overlap 的 16:9。',
      '- 每页必须绑定 sourceAnchors：从原文段落、定义、公式、表格、图片、代码片段或例子中选 1-3 个锚点；不要只写“来源：第几页”。',
      '- sourceCoverage 说明覆盖范围，sourceAnchors 说明具体证据/素材。两者都要填写。',
      '- 每页必须填写 sourceUseRationale：说明为什么直接使用原材料、为什么改写、为什么换成更短例子，或为什么不使用原图。不要写空泛理由。',
      sourceImages.length
        ? '- 有原文图片时，优先用 sourceImageIds 分配给真正需要看图/读表/读论文图示的页面；不要把所有图片都塞到封面或介绍页。'
        : '- 如果没有原文图片，sourceImageIds 必须为空数组，不要虚构 img_1。',
      sourceImages.length
        ? '- sourceImageIds 只能分配给视觉语义匹配的页面：图表页用图表，架构页用真实架构/流程图，视觉样例页用样例图。不要把普通照片或示例画面包装成架构图。'
        : '',
      sourceImages.length
        ? '- 默认每张原文图最多分配给 1 页；如果同一张图需要跨页复用，必须在 planningNotes 和相关 htmlPrompt 中说明“同图二次精读”的不同教学角度。'
        : '',
      sourceImages.length
        ? '- 当一页分配 sourceImageIds 后，htmlPrompt 必须明确要求 HTML 生成器使用这些图片 ID 占位，例如 <img src="img_1">，并保留图片页码/说明。'
        : '',
      '- 对论文/阅读材料优先规划：问题背景、核心图表阅读、方法/证据拆解、结果解释、局限与启发；不要写成空泛课程概览。',
      '- 页面类型要服务教学节奏：cover / intro / summary / process / table / math / code / example。',
      `- 本文件初步识别课程路线为：${routeHint}；除非源材料强烈反证，否则所有页面的 courseRoute 都要沿用这个路线。`,
      '- 先判断课程路线：数学 / 计算机科学 / 自然科学 / 商科经济 / 人文 / 社科 / 通用；每页 htmlPrompt 都要写清楚“课程路线：xxx”。',
      '- 每页 JSON 必须输出结构化字段 courseRoute；CS 页还必须输出 csRoute，数学页还必须输出 mathRoute。',
      '- 课程路线会影响页面结构：数学走定义/命题/推导/证明/例题，CS 走标准页或专属语义组件，商科走数字/决策/案例/矩阵。',
      '- CS/OOP 内容尤其要克制：除非必须，不要生成长代码页；用短例子、对比、状态观察代替完整教程。',
      '- CS 标准页仍然存在：intro / concept / summary / process / table / example 不要强行做 trace；但整本 CS notebook 至少要包含一个真正的 CS 专属语义页，除非源材料完全没有代码、对象、数据结构或状态变化。',
      '- CS 专属版式只在强信号时使用，并在 htmlPrompt 写清楚“CS 版式：xxx”：Execution Trace、Memory Diagram、Call Stack、Pointer Diagram、Tree Diagram、Graph Trace、Linear Structure、Dictionary Diagram、Invariant Check、Composite Operation。',
      '- CS/OOP/引用/属性用 Memory Diagram；递归用 Call Stack；linked list 用 Pointer Diagram；tree/BST 用 Tree Diagram；BFS/DFS 用 Graph Trace；stack/queue 用 Linear Structure；dictionary 用 Dictionary Diagram；结构合法性用 Invariant Check。',
      '- 数学内容可以用外部更短例子替换源文件长例子，但不能改变要讲的定义、判定或证明动作。',
      '- 数学也有标准页：intro / summary / process / table 不需要强行公式化。',
      '- 数学专属版式只在需要时使用，并在 htmlPrompt 写清楚“数学版式：xxx”：Definition/Theorem Board、Formula Focus、Derivation Ladder、Proof Walkthrough、Worked Example、Concept Map、Comparison Table。',
      '- 数学页必须先识别源材料里的标准数学对象、符号、表示法和验证动作，再决定 visualPlan；不要把数学内容规划成 AI 插图、抽象波纹图、装饰图或图片占位。',
      '- 数学 visualPlan 应该是可编辑数学结构：定义板、符号表、集合/对象表、公式聚焦、条件对比、图/关系结构、推导阶梯、证明框架或例题拆解。具体结构由源材料主题决定，不要写死某一种模板。',
      '- 如果为了容量替换例子，必须保持同一个数学概念，并选择小而可检查的例子；不要引入源材料没有的随意符号、装饰性集合或新记号。',
      '- 数学证明或长推导如果 16:9 单页放不下，应分配到多页或把该页规划为 canvasMode=tall/long；普通 16:9 页只保留一个证明动作。',
      '- 计划必须让每页视觉上可做：不要出现一页同时要代码、表格、trace、完整例题答案、前后文总结。',
      '- 每页 title 字段必须和 htmlPrompt 里要求显示的标题逐字一致。',
      '- 如果页标题里有“5 个/4 步/3 条”等数量，htmlPrompt 里的可见条目数量必须匹配，不能让后续生成器自行减少。',
      '- 如果某页需要公式、步骤、理由、检查点，必须在 htmlPrompt 里标成“必需保留”，不能放进可删内容。',
      '- 页面拥挤时，优先删邻近上下文/装饰标签/次级解释；不能删核心题干、公式、步骤、理由、答案或总结判断。',
      '- 每页必须有 learnerQuestion：用一句学生视角的问题驱动这一页，不要只写“介绍/总结”。',
      '- 每页 keyPoints 只放 2-5 个短点，必须是真正要显示/支撑的知识结构，不要写讲稿段落。',
      '- 每页 mandatoryVisibleContent 明确列出页面必须展示的文本/公式/代码/图题/结论；optionalContent 明确列出可以被压缩或删除的材料。',
      '- sourceUseRationale 要进入 htmlPrompt，帮助 HTML 生成器知道哪些内容必须来自源材料，哪些可以为了容量被改写。',
      seededStructuredPlan
        ? [
            '',
            'htmlPrompt 生成方式：',
            '- 每个 slides[].htmlPrompt 必须填空字符串 ""。',
            '- 后端会用 title、pageKind、canvasMode、courseRoute、csRoute/mathRoute、learnerQuestion、keyPoints、sourceAnchors、sourceUseRationale、visualPlan、mandatoryVisibleContent、optionalContent、continuity 和 contentBudget 自动合成长 prompt。',
            '- 所以你必须把真正要显示的标题、卡片/表格/公式/代码/结论、必需保留内容、可删内容和源材料锚点都写进结构化字段。',
          ].join('\n')
        : [
            '',
            '每个 htmlPrompt 必须包含：',
            '- 明确说明画布：如果 canvasMode=slide，写“生成一张 1600×900、16:9、自包含 HTML/CSS PPT 页面”；如果 canvasMode=tall，写“生成一张宽 1600px、高约 Npx 的 HTML/CSS 中高课件页”；如果 canvasMode=long，写“生成一张宽 1600px、目标高度约 Npx 的 HTML/CSS 长页面教学版式”。',
            '- 第几页/总页数、页面类型、密度档、这一页唯一主教学动作。',
            '- 整课电影主线：courseSpine.logline、openingHook、centralQuestion、closingCallback。',
            '- 本页分镜功能：continuity.rhetoricalRole、fromPrevious、pageMove、toNext、callbackToSpine。',
            '- 如果是第 1 页：页面类型必须写“封面页”，主标题是唯一必须文字；最多 1 行极短副标题/元信息可选，不能放入口问题、目录、正文讲解或占位说明文字。',
            '- 如果是第 1 页：htmlPrompt 必须要求使用内置封面背景/主视觉语言，例如科技封面 tech_hero_title、电影感 cinematic_title_frame、学术几何 academic_hero_cover 或 image_title_overlay；优先使用 /slide-backgrounds/ 下的本地内置背景，必须 full-bleed 铺满画布，标题直接叠在背景上，不能生成白底空封面或标题卡/面板封面。',
            '- 如果是第 2 页：页面类型必须写“介绍页/导入页”，包含本 notebook 为什么重要、先看哪几个入口、如何进入正文。',
            '- 如果是最后 1 页：页面类型必须写“总结页”，包含 3-5 条 takeaway、回看路线/检查清单、下一步问题。',
            '- 课程路线：数学 / 计算机科学 / 自然科学 / 商科经济 / 人文 / 社科 / 通用。',
            '- 如果课程路线是计算机科学，写明 CS 版式：standard 或具体专属版式。',
            '- 如果课程路线是数学，写明数学版式：standard 或具体专属版式。',
            '- 可见内容必须简体中文；可以保留必要英文代码标识。',
            '- 精确列出本页要出现的标题、卡片/表格/公式/代码/结论内容。',
            '- 必需保留清单：逐条列出不能省略的内容，尤其是数量型清单、理由、结论、检查点。',
            '- 可删内容清单：如果拥挤只能删哪些次级内容。',
            '- 源材料锚点：列出本页来自哪段原文/哪个公式/哪个例子/哪张图；如果使用原文图，列出 sourceImageIds。',
            '- 源材料取舍理由：说明本页为何直接使用/改写/换例/不用图。',
            '- 如果使用原文图：写清图片真实角色（架构图/流程图/结果表/视觉样例/论文截图/对比图/代码截图等）、真实图题/页码和该图支持的教学判断。',
            '- 如果没有合适原文图：明确写“本页不使用原文图，不要虚构图片”。',
            '- 同一页不要重复渲染同一个 source image；如果需要对比两个概念，用 DOM 文本/表格/卡片对比。',
            '- 给出容量预算：可见中文/等价字符范围、最多几个内容区、最多几个块。',
            '- 给出画布预算：canvasMode 和 canvasHeight；长页必须说明允许纵向自然展开但禁止横向滚动。',
            '- 布局要求：主内容必须用正常 flex/grid flow，不要让底部条、大卡片、例题结果或检查点覆盖上方内容。',
            '- 明确禁止：内容重叠、裁切、DOM 越界、负坐标、无关公式、无关例题、用 fixed height 裁掉正文；标准 16:9 页禁止滚动，长页禁止横向滚动和网页文章化。',
          ].join('\n'),
      '',
      'JSON schema：',
      JSON.stringify(
        {
          lessonTitle: 'string',
          pageCountTier: tier,
          pageCount: 'number',
          coursePlan: {
            targetLearner: '1 句，目标学习者画像',
            courseGoal: '1 句，整课学习结果',
            prerequisiteAssumptions: ['最多 3 条'],
            coreQuestions: ['2-3 个整课级学生问题'],
            sourceDigest: ['0-3 条最高层源材料取舍；逐页依据写到 slideOutlines'],
            pacingStrategy: '1 句，说明节奏约束；不写叙事弧线',
          },
          courseSpine: {
            logline: '一句话整课主线，像电影 logline',
            openingHook: '第 2 页要提出的开场总问题',
            centralQuestion: '整节课反复回答的中心问题',
            acts: [
              {
                id: 'act-setup',
                act: 'setup | development | turn | synthesis',
                title: '总：建立问题',
                purpose: '这一幕在整课中的作用',
                pages: [1, 2],
                keyQuestion: '这一幕驱动的问题',
                visualMotif: '贯穿这一幕的视觉/例子母题',
              },
            ],
            recurringExample: '中间页反复回到的例子、对象、材料或场景',
            visualMotif: '贯穿整课的视觉母题',
            closingCallback: '最后一页如何回扣 openingHook / centralQuestion',
          },
          slideOutlines: [
            {
              id: 'slide-1',
              order: 1,
              title: 'string',
              canvasMode: 'slide | tall | long',
              canvasHeight: 900,
              learnerQuestion: 'string',
              teachingObjective: 'string',
              keyPoints: ['string'],
              sourceAnchors: ['具体原文锚点、公式、表格、图片、代码或例子'],
              sourceImageIds: ['img_1'],
              sourceUseRationale: '为什么直接使用/改写/换例/不用图',
              continuity: {
                actId: 'act-setup',
                rhetoricalRole: 'opening | setup | build | turn | example | synthesis | callback',
                fromPrevious: '承接上一页的结论/问题；第 1 页说明如何建立主题识别',
                pageMove: '本页只推进一个教学分镜动作',
                toNext: '本页结尾把学生带向下一页的问题',
                callbackToSpine: '本页如何回扣 courseSpine.centralQuestion',
              },
              visualPlan: 'string',
              mandatoryVisibleContent: ['string'],
              optionalContent: ['string'],
            },
          ],
          planningNotes: ['string'],
          slides: [
            {
              id: 'slide-1',
              order: 1,
              title: 'string',
              pageKind: 'cover | intro | summary | process | table | math | code | example',
              canvasMode: 'slide | tall | long',
              canvasHeight: 900,
              courseRoute:
                'general | math | computer-science | science | business | humanities | social-science',
              csRoute:
                'standard | execution-trace | memory-diagram | call-stack | pointer-diagram | tree-diagram | graph-trace | linear-structure | dictionary-diagram | invariant-check | composite-operation',
              mathRoute:
                'standard | definition-theorem | formula-focus | derivation | proof | worked-example | concept-map | comparison-table',
              density: 'light | standard | dense',
              objective: 'string',
              learnerQuestion: 'string',
              keyPoints: ['string'],
              sourceCoverage: ['源页编号或主题'],
              sourceAnchors: ['具体原文锚点、公式、表格、图片、代码或例子'],
              sourceImageIds: ['img_1'],
              sourceUseRationale: '为什么直接使用/改写/换例/不用图',
              continuity: {
                actId: 'act-setup',
                rhetoricalRole: 'opening | setup | build | turn | example | synthesis | callback',
                fromPrevious: '承接上一页的结论/问题；第 1 页说明如何建立主题识别',
                pageMove: '本页只推进一个教学分镜动作',
                toNext: '本页结尾把学生带向下一页的问题',
                callbackToSpine: '本页如何回扣 courseSpine.centralQuestion',
              },
              visualPlan: 'string',
              mandatoryVisibleContent: ['string'],
              optionalContent: ['string'],
              densityTarget: 'light | standard | dense',
              sourceUsage: 'direct | adapted | new-example | synthesis',
              contentBudget: {
                visibleCharsMin: 80,
                visibleCharsMax: 260,
                mainRegions: 2,
                blockCount: 4,
                mustDeleteIfCrowded: ['string'],
              },
              htmlPrompt: seededStructuredPlan
                ? ''
                : '完整、可直接发送给 HTML 生成接口的中文 prompt',
            },
          ],
        },
        null,
        2,
      ),
      '',
      '原文图片清单：',
      sourceImagesForPrompt(sourceImages),
      '',
      seedCoursePlan || seedCourseSpine
        ? [
            '已通过轻量主线锚点：',
            JSON.stringify(
              {
                coursePlan: seedCoursePlan,
                courseSpine: seedCourseSpine,
              },
              null,
              2,
            ),
            '',
          ].join('\n')
        : '',
      '源文本摘录（用于避免泛泛总结；不要整段塞进页面）：',
      sourceText || '无额外源文本摘录。',
      '',
      '源页材料：',
      sourcePagesForPrompt(sourcePages, sourcePagePromptLimit),
    ].join('\n');

    const buildPlanningParams = (nextPrompt: string) =>
      planningVisionImages.length
        ? {
            model,
            system,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(nextPrompt, planningVisionImages, 'zh-CN'),
              },
            ],
            maxOutputTokens: Math.min(
              modelInfo?.outputWindow || (seededStructuredPlan ? 14000 : 32000),
              seededStructuredPlan ? 14000 : 32000,
            ),
          }
        : {
            model,
            system,
            prompt: nextPrompt,
            maxOutputTokens: Math.min(
              modelInfo?.outputWindow || (seededStructuredPlan ? 14000 : 32000),
              seededStructuredPlan ? 14000 : 32000,
            ),
          };

    const planningRun = await runWithRequestContext(
      req,
      '/api/generation-quality/html-lesson-plan',
      async () => {
        const initialResult = await callLLM(buildPlanningParams(prompt), 'html-lesson-plan-test', {
          retries: 1,
          validate: (text) => Boolean(parsePlan(text, tier, parseContext)),
        });
        const initialPlan = parsePlan(initialResult.text, tier, parseContext);
        if (!initialPlan) {
          return {
            result: initialResult,
            plan: null,
            quality: null,
            retryCount: 0,
            retryReasons: [] as PlanningQualityIssue[],
            usage: combineTokenUsage([initialResult.usage as TokenUsage | undefined]),
          };
        }

        const initialQuality = evaluatePlanningQuality({
          plan: initialPlan,
          bounds,
          routeHint,
          sourceImages,
          imageUsePolicy,
        });

        if (initialQuality.blockingIssueCount === 0) {
          return {
            result: initialResult,
            plan: initialPlan,
            quality: initialQuality,
            retryCount: 0,
            retryReasons: [] as PlanningQualityIssue[],
            usage: combineTokenUsage([initialResult.usage as TokenUsage | undefined]),
          };
        }
        if (seededStructuredPlan) {
          return {
            result: initialResult,
            plan: initialPlan,
            quality: initialQuality,
            retryCount: 0,
            retryReasons: [] as PlanningQualityIssue[],
            usage: combineTokenUsage([initialResult.usage as TokenUsage | undefined]),
          };
        }

        const retryPrompt = buildPlanningQualityRetryPrompt({
          originalPrompt: prompt,
          previousPlan: initialPlan,
          quality: initialQuality,
          bounds,
        });
        const retryResult = await callLLM(
          buildPlanningParams(retryPrompt),
          'html-lesson-plan-test-quality-retry',
          {
            retries: 0,
            validate: (text) => Boolean(parsePlan(text, tier, parseContext)),
          },
        );
        const retryPlan = parsePlan(retryResult.text, tier, parseContext);
        const retryQuality = retryPlan
          ? evaluatePlanningQuality({
              plan: retryPlan,
              bounds,
              routeHint,
              sourceImages,
              imageUsePolicy,
            })
          : null;
        const useRetry =
          retryPlan &&
          retryQuality &&
          planningQualityScore(retryQuality) <= planningQualityScore(initialQuality);

        return {
          result: useRetry ? retryResult : initialResult,
          plan: useRetry ? retryPlan : initialPlan,
          quality: useRetry ? retryQuality : initialQuality,
          retryCount: 1,
          retryReasons: initialQuality.issues,
          usage: combineTokenUsage([
            initialResult.usage as TokenUsage | undefined,
            retryResult.usage as TokenUsage | undefined,
          ]),
        };
      },
      {
        operationCode: 'html_lesson_plan_test',
        chargeReason: isNotebookMode ? 'HTML 整本笔记本规划测试' : 'HTML 整节课规划测试',
        serviceLabel: isNotebookMode
          ? 'HTML notebook plan generation'
          : 'HTML lesson plan generation',
        skipCreditCharge,
      },
    );

    const plan = planningRun.plan;
    if (!plan) {
      const parseFailure = describePlanParseFailure(planningRun.result.text, tier);
      return apiError(
        'PARSE_FAILED',
        502,
        'Failed to parse lesson plan JSON',
        `${parseFailure}\n\n${planningRun.result.text.slice(0, 2000)}`,
      );
    }

    const usage = planningRun.usage;
    return apiSuccess({
      plan,
      model: modelString,
      usage,
      costEstimate: estimateGenerationCost(
        modelString,
        usage ?? undefined,
      ) as HtmlCostEstimate | null,
      skippedCreditCharge: skipCreditCharge,
      planningQuality: planningRun.quality,
      planningRetryCount: planningRun.retryCount,
      planningRetryReasons: planningRun.retryReasons,
    });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to generate HTML lesson plan',
      error instanceof Error ? error.message : String(error),
    );
  }
}
