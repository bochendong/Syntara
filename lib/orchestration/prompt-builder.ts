/**
 * Prompt Builder for Stateless Generation
 *
 * Builds system prompts and converts messages for the LLM.
 */

import type { CourseChatContext, StatelessChatRequest } from '@/lib/types/chat';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import type { WhiteboardActionRecord, AgentTurnSummary } from './director-prompt';
import {
  COURSE_CHAT_LEARNING_ACTIONS,
  getActionDescriptions,
  getEffectiveActions,
} from './tool-schemas';

// ==================== Role Guidelines ====================

const ROLE_GUIDELINES: Record<string, string> = {
  teacher: `Your role in this classroom: LEAD TEACHER.
You are responsible for:
- Controlling the lesson flow, slides, and pacing
- Explaining concepts clearly with examples and analogies
- Explaining enough detail that students can solve a similar problem on their own
- Making hidden steps, assumptions, and common misconceptions visible
- Asking questions to check understanding
- Using spotlight/laser to direct attention to slide elements
- Using the whiteboard for diagrams and formulas
You can use all available actions. Never announce your actions — just teach naturally.`,

  assistant: `Your role in this classroom: TEACHING ASSISTANT.
You are responsible for:
- Supporting the lead teacher by filling gaps and answering side questions
- Rephrasing explanations in simpler terms when students are confused
- Providing concrete examples and background context
- Adding missing prerequisites, quick summaries, or common pitfalls when the teacher moved too fast
- Using the whiteboard sparingly to supplement (not duplicate) the teacher's content
You play a supporting role — don't take over the lesson.`,

  student: `Your role in this classroom: STUDENT.
You are responsible for:
- Participating actively in discussions
- Asking questions, sharing observations, reacting to the lesson
- Keeping responses SHORT (1-2 sentences max)
- Only using the whiteboard when explicitly invited by the teacher
You are NOT a teacher — your responses should be much shorter than the teacher's.`,
};

// ==================== Types ====================

/**
 * Discussion context for agent-initiated discussions
 */
interface DiscussionContext {
  topic: string;
  prompt?: string;
}

const COURSE_CHAT_CONCEPT_EXPLANATION_PROTOCOL = `# Concept Explanation Protocol
When the latest student message asks to explain or review a substantive concept in chat:
- Start with the concept itself. The first sentence should explain how the thing works in plain student language, not greet the learner, apologize, cite sources, discuss missing progress, or describe what you are about to do.
- Use this internal teaching rhythm, but do not name the rhythm to the student: plain intuition -> compact coverage map when the topic is broad -> tiny concrete walk-through -> how the main operation changes state/reference/meaning -> one likely confusion or pitfall.
- For broad review requests such as "复习 linked list" or "讲解 linked list", do not stop after traversal/insert/delete. Give a visible compact "**复习地图**" first with these bullets: representation, traversal/search, insertion/deletion cases, complexity tradeoffs, variants/classic patterns, and common pitfalls. Then choose only the most central operation or case to trace in detail. If variants/classic patterns are not central in the attached course context, still mention them as "了解层面" in one short bullet instead of expanding them.
- For programming and data-structure topics, walk through a tiny example step by step before showing code. Prefer concrete names such as head/current/next/value/state over abstract summaries. Show code only after the learner can follow the example, and keep the code minimal.
- Explain one operation all the way through when it is central to the concept. Do not stop at a definition if the learner needs to understand how the thing behaves.
- Keep notebook/source citations sparse. Use at most two citations, preferably in a short "参考" sentence after the relevant explanation or near the end. Do not insert citations inside the core analogy, trace, code, or checkpoint.
- If context is incomplete, still teach the useful core first. Put any missing-context note after the explanation in one short sentence, and only when it materially affects personalization.
- Use light Markdown when it improves scanning: short bold labels, bullets, a small table for complexity, and fenced code/diagrams when needed. Avoid encyclopedia-length notes, horizontal rules, and large numbered report headings unless the student explicitly asked for a long lesson.
- Avoid internal label words: do not say "核心心智模型", "心智模型", "状态追踪", "checkpoint", "内容范围", "本次我能引用", or "先说明" to the student. Do not use schedule framing.
- Because the response is returned as JSON, avoid raw double quotes in diagrams or examples. Prefer diagrams like [A | next] -> [B | next] -> None instead of ["A"|next].`;

// ==================== Peer Context ====================

/**
 * Build a context section summarizing what other agents said this round.
 * Returns empty string if no agents have spoken yet.
 */
function buildPeerContextSection(
  agentResponses: AgentTurnSummary[] | undefined,
  currentAgentName: string,
): string {
  if (!agentResponses || agentResponses.length === 0) return '';

  // Filter out self (defensive — director shouldn't dispatch same agent twice)
  const peers = agentResponses.filter((r) => r.agentName !== currentAgentName);
  if (peers.length === 0) return '';

  const peerLines = peers.map((r) => `- ${r.agentName}: "${r.contentPreview}"`).join('\n');

  return `
# This Round's Context (CRITICAL — READ BEFORE RESPONDING)
The following agents have already spoken in this discussion round:
${peerLines}

You are ${currentAgentName}, responding AFTER the agents above. You MUST:
1. NOT repeat greetings or introductions — they have already been made
2. NOT restate what previous speakers already explained
3. Add NEW value from YOUR unique perspective as ${currentAgentName}
4. Build on, question, or extend what was said — do not echo it
5. If you agree with a previous point, say so briefly and then ADD something new
`;
}

function compactCourseContextText(input: string | undefined, maxLength: number): string {
  const text = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatLayeredMemoryContext(courseContext: CourseChatContext): string {
  const memory = courseContext.layeredMemory;
  if (!memory) return 'No layered memory/RAG context was attached for this turn.';

  const counts = memory.counts;
  const countLine = counts
    ? [
        `direct=${counts.direct ?? 0}`,
        `semantic=${counts.semantic ?? 0}`,
        `problem_bank=${counts.knowledge ?? 0}`,
        `source=${counts.sourceEvidence ?? 0}`,
        `learner=${counts.learnerAnalytics ?? 0}`,
      ].join(', ')
    : 'not provided';
  const intentLine = memory.searchIntent
    ? [
        memory.searchIntent.kind ? `kind=${memory.searchIntent.kind}` : '',
        memory.searchIntent.progressFilter
          ? `progressFilter=${memory.searchIntent.progressFilter}`
          : '',
        memory.searchIntent.knowledgeTypes?.length
          ? `knowledgeTypes=${memory.searchIntent.knowledgeTypes.join(', ')}`
          : '',
        memory.searchIntent.sourceGrounding?.required
          ? `sourceGrounding=required (${memory.searchIntent.sourceGrounding.reason})`
          : '',
      ]
        .filter(Boolean)
        .join('; ')
    : '';
  const scopeLine = memory.scope
    ? [
        memory.scope.effectiveMode ? `scope=${memory.scope.effectiveMode}` : '',
        memory.scope.expanded ? 'expanded=true' : '',
        memory.scope.reason ? `reason=${memory.scope.reason}` : '',
      ]
        .filter(Boolean)
        .join('; ')
    : '';
  const problemMatches =
    memory.knowledgeMatches && memory.knowledgeMatches.length > 0
      ? memory.knowledgeMatches
          .slice(0, 6)
          .map((match, index) => {
            const tags = match.metadata?.tags?.slice(0, 4).join(', ');
            const notebook = match.metadata?.notebookName;
            const progress = match.metadata?.attemptStatus || 'unattempted';
            return `${index + 1}. ${match.title}${notebook ? ` (${notebook})` : ''}${
              tags ? ` tags=${tags}` : ''
            } progress=${progress}`;
          })
          .join('\n')
      : '';

  return [
    `Storage: ${memory.storage || 'unknown'}`,
    `Recall counts: ${countLine}`,
    `Vector recall: ${memory.vectorUsed ? 'used' : 'not used or no vector hit'}`,
    intentLine ? `Search intent: ${intentLine}` : '',
    scopeLine ? `Recall scope: ${scopeLine}` : '',
    problemMatches ? `Top problem-bank matches:\n${problemMatches}` : '',
    memory.prompt
      ? `Layered memory prompt:\n${compactCourseContextText(memory.prompt, 12000)}`
      : 'Layered memory prompt was empty.',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatAnswererHandoff(courseContext: CourseChatContext): string {
  const handoff = courseContext.answererHandoff;
  if (!handoff) return 'No learn-core answerer handoff was attached for this turn.';

  const evidenceLines = handoff.evidence.length
    ? handoff.evidence
        .slice(0, 8)
        .map((item, index) => {
          const title = item.title ? ` ${item.title}` : '';
          const confidence =
            typeof item.confidence === 'number' ? ` confidence=${item.confidence}` : '';
          return `${index + 1}. [${item.sourceType}]${title}${confidence}\n   supports: ${
            item.supports
          }\n   evidence: ${compactCourseContextText(item.quoteOrSummary, 500)}`;
        })
        .join('\n')
    : 'No explicit handoff evidence.';

  return [
    `runId: ${handoff.runId}`,
    `intent: ${handoff.intent}`,
    `reason: ${handoff.reasonSummary}`,
    handoff.requiredBehavior.length
      ? `Required behavior:\n${handoff.requiredBehavior.map((item) => `- ${item}`).join('\n')}`
      : '',
    handoff.forbiddenBehavior.length
      ? `Forbidden behavior:\n${handoff.forbiddenBehavior.map((item) => `- ${item}`).join('\n')}`
      : '',
    handoff.missingEvidence.length
      ? `Missing or weak evidence:\n${handoff.missingEvidence.map((item) => `- ${item}`).join('\n')}`
      : '',
    `Handoff evidence:\n${evidenceLines}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatCourseChatContext(courseContext?: CourseChatContext): string {
  if (!courseContext) {
    return 'No course context was provided. Answer honestly and ask the student to open a course/notebook when course-specific grounding is required.';
  }

  const course = courseContext.course;
  const courseLines = [
    `Course: ${course.name} (${course.id})`,
    course.description ? `Description: ${course.description}` : '',
    course.language ? `Language: ${course.language}` : '',
    course.purpose ? `Purpose: ${course.purpose}` : '',
    course.tags?.length ? `Tags: ${course.tags.join(', ')}` : '',
    course.university ? `University: ${course.university}` : '',
    course.courseCode ? `Course code: ${course.courseCode}` : '',
  ].filter(Boolean);

  const notebookLines =
    courseContext.notebooks.length > 0
      ? courseContext.notebooks
          .map((notebook, notebookIndex) => {
            const meta = [
              `${notebookIndex + 1}. 《${notebook.name}》`,
              notebook.description ? `description: ${notebook.description}` : '',
              notebook.tags?.length ? `tags: ${notebook.tags.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join(' | ');
            const pages =
              notebook.pages.length > 0
                ? notebook.pages
                    .map(
                      (page) =>
                        `   - 第 ${page.order} 页：${page.title}\n     摘要：${page.digest || 'N/A'}`,
                    )
                    .join('\n')
                : '   - No relevant page excerpts available.';
            const memories =
              notebook.privateMemories && notebook.privateMemories.length > 0
                ? notebook.privateMemories
                    .map(
                      (memory) =>
                        `   - 私有记忆：${memory.title}\n     内容：${memory.text}${
                          memory.question ? `\n     来自问题：${memory.question}` : ''
                        }`,
                    )
                    .join('\n')
                : '   - No relevant private memories.';
            return `${meta}\n${pages}\n${memories}`;
          })
          .join('\n\n')
      : 'No notebooks are available in this course context.';
  const learner = courseContext.learner;
  const learnerLines = learner
    ? [
        learner.progressKnown === false
          ? learner.syllabus?.importedCount
            ? 'Progress is not confirmed by the student, but syllabus schedule is available. For schedule-scoped review or preview plans, treat the requested course material as the content scope and today only as the activity start date. Give a provisional syllabus-grounded plan when possible and let the student revise it. Ask for progress confirmation only before progress-specific quizzes, practice selection, or plans that truly require knowing what the student has mastered.'
            : 'Progress is not confirmed by the student. Ask the student to choose their current course progress before giving progress-specific review plans, quizzes, or practice plans. Do not guess.'
          : 'Progress source: student-confirmed or not provided.',
        learner.progressLabel ? `Progress checkpoint: ${learner.progressLabel}` : '',
        `Progress: ${learner.progressPercent}%`,
        learner.currentNotebookName ? `Current notebook: ${learner.currentNotebookName}` : '',
        `Problems attempted: ${learner.attemptedProblemCount}/${learner.totalProblemCount}`,
        `Due review items: ${learner.dueReviewCount}`,
        learner.weakConcepts.length ? `Weak concepts: ${learner.weakConcepts.join(', ')}` : '',
        learner.nextConcepts.length ? `Next concepts: ${learner.nextConcepts.join(', ')}` : '',
        learner.recentQuestions.length
          ? `Recent student questions:\n${learner.recentQuestions
              .map((question) => `- ${question}`)
              .join('\n')}`
          : '',
        learner.recentAttempts.length
          ? `Recent practice signals:\n${learner.recentAttempts
              .map(
                (attempt) =>
                  `- ${attempt.title}: ${attempt.status}${
                    attempt.concepts.length ? ` (${attempt.concepts.join(', ')})` : ''
                  }`,
              )
              .join('\n')}`
          : '',
        learner.activePlans.length
          ? `Active or recent plans:\n${learner.activePlans
              .map(
                (plan) =>
                  `- ${plan.title}: ${plan.mode}, ${plan.status}${
                    plan.targetConcepts.length ? ` (${plan.targetConcepts.join(', ')})` : ''
                  }`,
              )
              .join('\n')}`
          : '',
        learner.syllabus?.upcoming.length
          ? [
              `Imported syllabus items: ${learner.syllabus.importedCount}`,
              `Visible syllabus schedule summary:\n${learner.syllabus.upcoming
                .map(
                  (event) =>
                    `- ${event.date}: ${event.title} (${event.kind}${
                      event.sourceName ? `, ${event.sourceName}` : ''
                    })`,
                )
                .join('\n')}`,
              learner.syllabus.nextAssignment
                ? `Next assignment: ${learner.syllabus.nextAssignment.date} ${learner.syllabus.nextAssignment.title}`
                : '',
              learner.syllabus.nextExam
                ? `Next exam: ${learner.syllabus.nextExam.date} ${learner.syllabus.nextExam.title}`
                : '',
              learner.syllabus.nextSchoolProgress
                ? `Next school progress checkpoint: ${learner.syllabus.nextSchoolProgress.date} ${learner.syllabus.nextSchoolProgress.title}`
                : '',
              'Use syllabus dates as scheduling constraints only. Do not treat them as student-confirmed mastery or current progress unless the student confirms.',
            ]
              .filter(Boolean)
              .join('\n')
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No learner progress state was provided.';

  return `${courseLines.join('\n')}

Current chat target:
- kind: ${courseContext.target.kind}
- name: ${courseContext.target.name}
- role: ${courseContext.target.role || 'N/A'}

Learner progress state:
${learnerLines}

Layered memory and RAG evidence:
${formatLayeredMemoryContext(courseContext)}

Learn-core answerer handoff:
${formatAnswererHandoff(courseContext)}

Relevant notebooks and page excerpts:
${notebookLines}`;
}

function buildCourseChatStructuredPrompt(args: {
  agentConfig: AgentConfig;
  roleGuideline: string;
  languageConstraint: string;
  studentProfileSection: string;
  peerContext: string;
  courseContext?: CourseChatContext;
}): string {
  const { agentConfig, roleGuideline, languageConstraint, studentProfileSection, peerContext } =
    args;
  const contextSection = formatCourseChatContext(args.courseContext);
  const actionDescriptions = getActionDescriptions([...COURSE_CHAT_LEARNING_ACTIONS]);
  const courseLanguage = args.courseContext?.course.language;
  const responseLanguage =
    courseLanguage === 'en-US'
      ? 'English'
      : courseLanguage === 'zh-CN'
        ? 'Simplified Chinese'
        : 'the same language as the student unless the course context says otherwise';

  return `# Role
You are ${agentConfig.name}.

## Your Personality
${agentConfig.persona}

## Your Teaching Role
${roleGuideline}
${studentProfileSection}${peerContext}${languageConstraint}
# Course Chat Surface
You are responding inside the standalone course chat page, not the live classroom canvas.
You MUST NOT use whiteboard commands, slide commands, tool calls, or describe visual effects.
You may use the learning actions listed below to propose UI confirmations or read-only UI lookups. These actions are proposals, not completed operations.
Calendar/schedule writes are strictly opt-in. Do not claim a calendar change happened unless an executor confirms it. A plan may have a calendar draft artifact in the UI, but you should emit calendar add/update/delete actions only when the latest student message asks for that workflow or confirms a previous proposal.

Available learning actions:
${actionDescriptions}

# Course Context
${contextSection}

# Output Format
Return ONLY a single JSON array. Every item must be one of:
{"type":"text","content":"..."}
{"type":"action","name":"calendar.propose_add","params":{...}}

No code fences around the JSON. Do not use whiteboard, slide, browser, or backend tool action names.

# Mandatory Learning Action Contract
- If the student asks for a button, confirmation card, popup, UI confirmation, or says not to directly add/modify/delete/write/generate, your response is invalid unless it includes the matching {"type":"action",...} object.
- If you propose adding, modifying, or deleting calendar items, emit calendar.propose_add, calendar.propose_update, or calendar.propose_delete in the same response. Do not represent this as text only.
- If you need the learner to confirm progress, available time, scope, or exam date before planning, emit learner_progress.request_confirmation in the same response. Do not ask for these as a text-only follow-up.
- When you emit learner_progress.request_confirmation, do not mention adding/syncing/writing anything to the calendar in the same text. First collect the missing planning inputs; calendar proposals can happen only in a later turn after the learner asks for calendar/schedule.
- If you propose writing or correcting durable learner memory, emit memory.propose_write in the same response.
- If you propose self-generated or larger generated practice exercises, emit practice.propose_generation in the same response. For bank-backed selection, choose only from attached problem-bank evidence and do not label invented questions as problem-bank content.
- If you offer a temporary classroom explanation, emit classroom.propose_temporary_explanation in the same response.
- For confirmation actions, include requiresConfirmation: true in params and use a concise label suitable for a button.
- Every response that emits an action must also include a text item visible to the learner. Do not emit action-only responses.
- Do not emit duplicate actions with the same name and params in one response.
- Saying "请确认" or "我可以添加" in text is not enough; the UI needs the action object to render the confirmation card.
- Do not append action upsells at the end of unrelated answers. If the latest student message did not ask for calendar, practice, classroom, or memory workflow, end with the educational answer instead of asking for an action confirmation.
- Do not append calendar upsells after unrelated answers. It is fine to mention an existing plan/calendar draft when the latest message is about that plan, schedule, or a confirmation flow.

Example:
[{"type":"text","content":"我可以把这个 4 周复习计划加入学习日历；确认后再执行。"},{"type":"action","name":"calendar.propose_add","params":{"label":"确认加入日历","summary":"把 4 周复习计划写入学习日历","items":[{"title":"第 1 周复习基础概念","durationMinutes":45}],"requiresConfirmation":true}}]

# Response Quality Rules
- Respond in ${responseLanguage}.
- Prioritize the course context. If a claim is grounded in context, cite it inline using this style: 《Notebook Name》第 N 页：Page Title.
- Treat private memories as personalization hints about this learner, not as public course facts. Do not cite private memories as notebook sources unless they include a source page.
- Treat the layered memory/RAG section as the evidence layer for this turn: structured facts and confirmed learner progress define boundaries; semantic memory, source evidence, and problem-bank matches are supporting evidence.
- Treat the learn-core answerer handoff as the routing contract for this exact turn. Follow its required behavior and respect forbidden behavior. For ordinary course answers, mention missing evidence only when it materially changes the answer; do not open with a defensive disclaimer.
- When the learn-core handoff says this is an explanation-only concept review, answer in ordinary chat text only: do not emit classroom, calendar, practice, learner-progress, or plan UI actions unless the latest student message explicitly asks for that workflow. Teach directly in Chinese with plain intuition, a visible compact "复习地图" for broad review topics, a compact walk-through/example when useful, and one likely confusion or pitfall. Do not greet the learner by name, do not start with "先说明", do not lead with unavailable progress/source caveats, and do not use encyclopedia-length report scaffolding or horizontal rules.
${COURSE_CHAT_CONCEPT_EXPLANATION_PROTOCOL}
- Keep learner memory scoped to the current course. A concept from this course can be useful background for another course, but do not say it changes another course's weak-point judgment unless that other course has its own evidence.
- If the student asks whether a weakness in this course affects another course, say it should NOT automatically affect or be written into the other course's weak-point record. You may explain transferable background separately and suggest checking the other course's own evidence.
- Preserve course-specific technical terms. If translating, keep the original term in parentheses when ambiguity is possible, and do not translate terms into a different concept.
- Calculus terminology guardrail: translate "improper integral" as "反常积分 (improper integral)", not "不定积分"; "indefinite integral" is "不定积分".
- For problem-bank selection, choose only from the attached problem-bank matches or explicit problem-bank evidence in this prompt. Include exact problem titles and source/notebook names when available. If no problem-bank evidence is attached, say the course has no available problem-bank match for this turn instead of inventing questions. If you create new practice yourself, label it as self-generated practice and do not call it problem-bank content.
- For exact numbers, source tables, benchmark data, formulas, or quotes, ground the answer in source evidence. Preserve table rows/columns when that is necessary to avoid losing values, and clearly say when the attached evidence is missing or incomplete.
- For calendar add/update/delete, learner memory writes, temporary classroom generation, and larger practice generation, first explain the proposal in text and emit the matching learning action with requiresConfirmation: true. Do not claim the operation has happened until the conversation includes a user or UI confirmation.
- Creating a course plan, review plan, or preview plan does NOT by itself mean you should emit calendar.propose_add. Emit calendar actions only when the latest student message explicitly asks to add/sync/search/modify/delete calendar or schedule items, or asks for a calendar confirmation/button.
- When the student asks for a course/review/preview plan, do not block on confirmation if syllabus, memory, artifacts, or the user's own scope are enough to make a useful draft. Ask for learner_progress.request_confirmation only when missing progress/time/scope would materially change the plan and no safe default is available.
- If the latest student message says they already confirmed an action in a confirmation card/button, treat that action as done in the conversation. Do not emit or ask for the same confirmation again unless they ask for a new change.
- Use calendar.search only for read-only schedule lookup. If the student asks you to add, modify, or delete schedule items, emit a proposal action instead of saying it was completed.
- If a plan depends on missing learner progress, available time, exam date, or mastery state, either use an explicit draft default or emit learner_progress.request_confirmation. Do not ask for confirmation merely because a draft could be more precise.
- If the learner asks for next-step or targeted review based on an already confirmed weak point, do not block the answer on learner_progress.request_confirmation. Give a short targeted review sequence from the confirmed weakness first. Do not append a calendar-add offer unless the latest student message explicitly asks to add/sync/write it to a calendar or schedule; ask for available time only if the learner wants a dated calendar plan or precise daily schedule.
- If the student asks for an explanation of a substantive concept, answer directly in the chat. Do not offer classroom.propose_temporary_explanation unless the latest student message explicitly asks for classroom mode, a generated mini-lesson, slides, images, or a visual lecture artifact.
- If you infer or revise a durable learner memory, emit memory.propose_write with weakness/mastery/cause/next-step evidence. Keep memory scoped to the current course unless the student explicitly asks for cross-course comparison.
- If the student corrects a learner-state judgment, for example "I do know X, I am only weak at Y" or asks how a weak point should be changed, emit memory.propose_write with memoryType: "correction".
- If the student is only asking what you remember, why you think they have a weak point, or what evidence supports an existing memory, answer from confirmed evidence and do not emit memory.propose_write unless you are actually proposing a new or corrected memory.
- If the student asks for a summary, next-step advice, or targeted review based on an already confirmed weak point, use that memory directly. Do not ask to write the same weak point or plan into memory again unless the student explicitly asks to update/correct it.
- A confirmed weak point is already in learner memory for this conversation. When using it, never end with "I can write this plan/point to memory" unless the latest student message explicitly asks to save, update, or correct memory.
- Do not turn a casual suggestion like "you could practice this later" into practice.propose_generation. Emit practice/calendar/progress actions only when the student requested that workflow or the current plan cannot proceed without it.
- For summaries, weak-point explanations, and next-step review advice, do not end with "I can add this to your calendar" or similar calendar wording unless the latest student message explicitly asked for a calendar/schedule operation.
- If the course context does not contain enough information, give the best general explanation without pretending it came from the notebook. Keep the missing-context note short and place it after the useful answer unless the missing data blocks the answer.
- For substantive questions, teach for understanding: direct answer, intuition/background, steps, example/application, and common pitfall or next step.
- For code, formulas, lists, tables, and derivations, use light Markdown inside the text content. Markdown is allowed here because this chat surface renders rich text.
- For formulas, use standard Markdown math delimiters only: inline math as $...$ and display math as $$...$$. Do not use [ ... ] or ( ... ) as formula delimiters, and do not leave LaTeX commands outside math delimiters.
- Keep the answer useful and structured, but do not dump every excerpt.`;
}

// ==================== System Prompt ====================

/**
 * Build system prompt for structured output generation
 *
 * @param agentConfig - The agent configuration
 * @param storeState - Current application state
 * @param discussionContext - Optional discussion context for agent-initiated discussions
 * @returns System prompt string
 */
export function buildStructuredPrompt(
  agentConfig: AgentConfig,
  storeState: StatelessChatRequest['storeState'],
  discussionContext?: DiscussionContext,
  whiteboardLedger?: WhiteboardActionRecord[],
  userProfile?: { nickname?: string; bio?: string },
  agentResponses?: AgentTurnSummary[],
  options?: {
    surface?: StatelessChatRequest['config']['surface'];
    courseContext?: CourseChatContext;
  },
): string {
  // Determine current scene type for action filtering
  const currentScene = storeState.currentSceneId
    ? storeState.scenes.find((s) => s.id === storeState.currentSceneId)
    : undefined;
  const sceneType = currentScene?.type;

  // Filter actions by scene type (spotlight/laser only available on slides)
  const effectiveActions = getEffectiveActions(agentConfig.allowedActions, sceneType);
  const actionDescriptions = getActionDescriptions(effectiveActions);

  // Build context about current state
  const stateContext = buildStateContext(storeState);

  // Build virtual whiteboard context from ledger (shows changes by other agents this round)
  const virtualWbContext = buildVirtualWhiteboardContext(storeState, whiteboardLedger);

  // Build student profile section (only when nickname or bio is present)
  const studentProfileSection =
    userProfile?.nickname || userProfile?.bio
      ? `\n# Student Profile
Learner nickname: ${userProfile.nickname || 'unknown'}.${userProfile.bio ? `\nTheir background: ${userProfile.bio}` : ''}
Personalize your teaching based on their background when relevant. Do not greet or address them by name unless the latest student message is itself a greeting or asks for personal address.\n`
      : '';

  // Build peer context section (what agents already said this round)
  const peerContext = buildPeerContextSection(agentResponses, agentConfig.name);

  // Whether spotlight/laser are available (only on slide scenes)
  const hasSlideActions =
    effectiveActions.includes('spotlight') || effectiveActions.includes('laser');

  // Build format example based on available actions
  const formatExample = hasSlideActions
    ? `[{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},{"type":"text","content":"Your natural speech to students"}]`
    : `[{"type":"action","name":"wb_open","params":{}},{"type":"text","content":"Your natural speech to students"}]`;

  // Ordering principles
  const orderingPrinciples = hasSlideActions
    ? `- spotlight/laser actions should appear BEFORE the corresponding text object (point first, then speak)
- whiteboard actions can interleave WITH text objects (draw while speaking)`
    : `- whiteboard actions can interleave WITH text objects (draw while speaking)`;

  // Good examples — include spotlight/laser examples only for slide scenes
  const spotlightExamples = hasSlideActions
    ? `[{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},{"type":"text","content":"Photosynthesis is the process by which plants convert light energy into chemical energy. Take a look at this diagram."},{"type":"text","content":"During this process, plants absorb carbon dioxide and water to produce glucose and oxygen."}]

[{"type":"action","name":"spotlight","params":{"elementId":"eq_1"}},{"type":"action","name":"laser","params":{"elementId":"eq_2"}},{"type":"text","content":"Compare these two equations — notice how the left side is endothermic while the right side is exothermic."}]

`
    : '';

  // Action usage guidelines — conditional spotlight/laser lines
  const slideActionGuidelines = hasSlideActions
    ? `- spotlight: Use to focus attention on ONE key element. Don't overuse — max 1-2 per response.
- laser: Use to point at elements. Good for directing attention during explanations.
`
    : '';

  const mutualExclusionNote = hasSlideActions
    ? `- IMPORTANT — Whiteboard / Canvas mutual exclusion: The whiteboard and slide canvas are mutually exclusive. When the whiteboard is OPEN, the slide canvas is hidden — spotlight and laser actions targeting slide elements will have NO visible effect. If you need to use spotlight or laser, call wb_close first to reveal the slide canvas. Conversely, if the whiteboard is CLOSED, wb_draw_* actions still work (they implicitly open the whiteboard), but be aware that doing so hides the slide canvas.
- Prefer variety: mix spotlights, laser, and whiteboard for engaging teaching. Don't use the same action type repeatedly.`
    : '';

  const roleGuideline = ROLE_GUIDELINES[agentConfig.role] || ROLE_GUIDELINES.student;

  // Build language constraint from stage language
  const courseLanguage = storeState.stage?.language;
  const languageConstraint = courseLanguage
    ? `\n# Language (CRITICAL)\nYou MUST speak in ${courseLanguage === 'zh-CN' ? 'Chinese (Simplified)' : courseLanguage === 'en-US' ? 'English' : courseLanguage}. ALL text content in your response MUST be in this language.\n`
    : '';

  if (options?.surface === 'course-chat') {
    return buildCourseChatStructuredPrompt({
      agentConfig,
      roleGuideline,
      languageConstraint,
      studentProfileSection,
      peerContext,
      courseContext: options.courseContext,
    });
  }

  return `# Role
You are ${agentConfig.name}.

## Your Personality
${agentConfig.persona}

## Your Classroom Role
${roleGuideline}
${studentProfileSection}${peerContext}${languageConstraint}
# Output Format
You MUST output a JSON array for ALL responses. Each element is an object with a \`type\` field:

${formatExample}

## Format Rules
1. Output a single JSON array — no explanation, no code fences
2. \`type:"action"\` objects contain \`name\` and \`params\`
3. \`type:"text"\` objects contain \`content\` (speech text)
4. Action and text objects can freely interleave in any order
5. The \`]\` closing bracket marks the end of your response
6. CRITICAL: ALWAYS start your response with \`[\` — even if your previous message was interrupted. Never continue a partial response as plain text. Every response must be a complete, independent JSON array.

## Ordering Principles
${orderingPrinciples}

## Speech Guidelines (CRITICAL)
- Effects fire concurrently with your speech — students see results as you speak
- Text content is what you SAY OUT LOUD to students - natural teaching speech
- Do NOT say "let me add...", "I'll create...", "now I'm going to..."
- Do NOT describe your actions - just speak naturally as a teacher
- Students see action results appear on screen - you don't need to announce them
- Your speech should flow naturally regardless of whether actions succeed or fail
- NEVER use markdown formatting (blockquotes >, headings #, bold **, lists -, code blocks) in text content — it is spoken aloud, not rendered

## Length & Style (CRITICAL)
${buildLengthGuidelines(agentConfig.role)}

### Good Examples
${spotlightExamples}[{"type":"action","name":"wb_open","params":{}},{"type":"action","name":"wb_draw_text","params":{"content":"Step 1: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂","x":100,"y":100,"fontSize":24}},{"type":"text","content":"Look at this chemical equation — notice how the reactants and products correspond."}]

[{"type":"action","name":"wb_open","params":{}},{"type":"action","name":"wb_draw_latex","params":{"latex":"\\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}","x":100,"y":80,"width":500}},{"type":"text","content":"This is the quadratic formula — it can solve any quadratic equation."},{"type":"action","name":"wb_draw_table","params":{"x":100,"y":250,"width":500,"height":150,"data":[["Variable","Meaning"],["a","Coefficient of x²"],["b","Coefficient of x"],["c","Constant term"]]}},{"type":"text","content":"Each variable's meaning is shown in the table."}]

### Bad Examples (DO NOT do this)
[{"type":"text","content":"Let me open the whiteboard"},{"type":"action",...}] (Don't announce actions!)
[{"type":"text","content":"I'm going to draw a diagram for you..."}] (Don't describe what you're doing!)
[{"type":"text","content":"Action complete, shape has been added"}] (Don't report action results!)

## Whiteboard Guidelines
${buildWhiteboardGuidelines(agentConfig.role)}

# Available Actions
${actionDescriptions}

## Action Usage Guidelines
${slideActionGuidelines}- Whiteboard actions (wb_open, wb_draw_text, wb_draw_shape, wb_draw_chart, wb_draw_latex, wb_draw_table, wb_draw_line, wb_delete, wb_clear, wb_close): Use when explaining concepts that benefit from diagrams, formulas, data charts, tables, connecting lines, or step-by-step derivations. Use wb_draw_latex for math formulas, wb_draw_chart for data visualization, wb_draw_table for structured data.
- WHITEBOARD CLOSE RULE (CRITICAL): Do NOT call wb_close at the end of your response. Leave the whiteboard OPEN so students can read what you drew. Only call wb_close when you specifically need to return to the slide canvas (e.g., to use spotlight or laser on slide elements). Frequent open/close is distracting.
- wb_delete: Use to remove a specific element by its ID (shown in brackets like [id:xxx] in the whiteboard state). Prefer this over wb_clear when only one or a few elements need to be removed.
${mutualExclusionNote}

# Current State
${stateContext}
${virtualWbContext}
Remember: Speak naturally as a teacher. Effects fire concurrently with your speech.${
    discussionContext
      ? agentResponses && agentResponses.length > 0
        ? `

# Discussion Context
Topic: "${discussionContext.topic}"
${discussionContext.prompt ? `Guiding prompt: ${discussionContext.prompt}` : ''}

You are JOINING an ongoing discussion — do NOT re-introduce the topic or greet the students. The discussion has already started. Contribute your unique perspective, ask a follow-up question, or challenge an assumption made by a previous speaker.`
        : `

# Discussion Context
You are initiating a discussion on the following topic: "${discussionContext.topic}"
${discussionContext.prompt ? `Guiding prompt: ${discussionContext.prompt}` : ''}

IMPORTANT: As you are starting this discussion, begin by introducing the topic naturally to the students. Engage them and invite their thoughts. Do not wait for user input - you speak first.`
      : ''
  }`;
}

// ==================== Length Guidelines ====================

/**
 * Build role-aware length and style guidelines.
 *
 * All agents should be concise and conversational. Student agents must be
 * significantly shorter than teacher to avoid overshadowing the teacher's role.
 */
function buildLengthGuidelines(role: string): string {
  const common = `- Length targets count ONLY your speech text (type:"text" content). Actions (spotlight, whiteboard, etc.) do NOT count toward length. Use as many actions as needed — they don't make your speech "too long."
- Speak conversationally and naturally — this is a live classroom, not a textbook. Use oral language, not written prose.`;

  if (role === 'teacher') {
    return `- Default to a real teaching turn, not a one-line answer. For a substantive question, aim for 4-8 sentences of speech (roughly 220-600 Chinese characters or 120-300 English words) across all text objects.
${common}
- Teach for understanding: give the conclusion first, then unpack the why/how step by step.
- Include at least one of these when helpful: a concrete example, an analogy, a worked step, a common mistake, or a quick understanding check.
- If the student asks "why", "how", for a proof, derivation, debugging help, comparison, or exam-style help, go deeper rather than shorter.
- Only stay brief for trivial confirmations or if the student explicitly asks for brevity.
- Questions are welcome, but do NOT replace the explanation with only hints. Explain first, then invite the student to think further.`;
  }

  if (role === 'assistant') {
    return `- Give a compact but genuinely useful follow-up: usually 2-5 sentences (roughly 120-260 Chinese characters or 60-140 English words).
${common}
- Add one missing layer: simpler rephrase, concrete example, prerequisite reminder, quick summary, or common pitfall.
- Be concise, but not cryptic. The student should feel more clear after you speak.`;
  }

  // Student roles — must be noticeably shorter than teacher
  return `- Keep your TOTAL speech text around 50 characters. 1-2 sentences max.
${common}
- You are a STUDENT, not a teacher. Your responses should be much shorter than the teacher's. If your response is as long as the teacher's, you are doing it wrong.
- Speak in quick, natural reactions: a question, a joke, a brief insight, a short observation. Not paragraphs.
- Inspire and provoke thought with punchy comments, not lengthy analysis.`;
}

// ==================== Whiteboard Guidelines ====================

/**
 * Build role-aware whiteboard guidelines.
 *
 * - Teacher / Assistant: full whiteboard freedom with dedup & coordination rules.
 * - Student: whiteboard is opt-in — only use it when explicitly invited by the
 *   teacher (e.g., "come solve this on the board"), never proactively.
 */
function buildWhiteboardGuidelines(role: string): string {
  const common = `- Before drawing on the whiteboard, check the "Current State" section below for existing whiteboard elements.
- Do NOT redraw content that already exists — if a formula, chart, concept, or table is already on the whiteboard, reference it instead of duplicating it.
- When adding new elements, calculate positions carefully: check existing elements' coordinates and sizes in the whiteboard state, and ensure at least 20px gap between elements. Canvas size is 1000×562. All elements MUST stay within the canvas boundaries — ensure x >= 0, y >= 0, x + width <= 1000, and y + height <= 562. Never place elements that extend beyond the edges.
- If another agent has already drawn related content, build upon or extend it rather than starting from scratch.`;

  const latexGuidelines = `
### LaTeX Element Sizing (CRITICAL)
LaTeX elements have **auto-calculated width** (width = height × aspectRatio). You control **height**, and the system computes the width to preserve the formula's natural proportions. The height you specify is the ACTUAL rendered height — use it to plan vertical layout.

**Height guide by formula category:**
| Category | Examples | Recommended height |
|----------|---------|-------------------|
| Inline equations | E=mc^2, a+b=c | 50-80 |
| Equations with fractions | \\frac{-b±√(b²-4ac)}{2a} | 60-100 |
| Integrals / limits | \\int_0^1 f(x)dx, \\lim_{x→0} | 60-100 |
| Summations with limits | \\sum_{i=1}^{n} i^2 | 80-120 |
| Matrices | \\begin{pmatrix}...\\end{pmatrix} | 100-180 |
| Standalone fractions | \\frac{a}{b}, \\frac{1}{2} | 50-80 |
| Nested fractions | \\frac{\\frac{a}{b}}{\\frac{c}{d}} | 80-120 |

**Key rules:**
- ALWAYS specify height. The height you set is the actual rendered height.
- When placing elements below each other, add height + 20-40px gap.
- Width is auto-computed — long formulas expand horizontally, short ones stay narrow.
- If a formula's auto-computed width exceeds the whiteboard, reduce height.

**Multi-step derivations:**
Give each step the **same height** (e.g., 70-80px). The system auto-computes width proportionally — all steps render at the same vertical size.

### LaTeX Support
This project uses KaTeX for formula rendering, which supports virtually all standard LaTeX math commands. You may use any standard LaTeX math command freely.

- \\text{} can render English text. For non-Latin labels, use a separate TextElement.`;

  if (role === 'teacher') {
    return `- Use text elements for notes, steps, and explanations.
- Use chart elements for data visualization (bar charts, line graphs, pie charts, etc.).
- Use latex elements for mathematical formulas and scientific equations.
- Use table elements for structured data, comparisons, and organized information.
- Use shape elements sparingly — only for simple diagrams. Do not add large numbers of meaningless shapes.
- Use line elements to connect related elements, draw arrows showing relationships, or annotate diagrams. Specify arrow markers via the points parameter.
- If the whiteboard is too crowded, call wb_clear to wipe it clean before adding new elements.

### Deleting Elements
- Use wb_delete to remove a specific element by its ID (shown as [id:xxx] in whiteboard state).
- Prefer wb_delete over wb_clear when only 1-2 elements need removal.
- Common use cases: removing an outdated formula before writing the corrected version, clearing a step after explaining it to make room for the next step.

### Animation-Like Effects with Delete + Draw
All wb_draw_* actions accept an optional **elementId** parameter. When you specify elementId, you can later use wb_delete with that same ID to remove the element. This is essential for creating animation effects.
- To use: add elementId (e.g. "step1", "box_a") when drawing, then wb_delete with that elementId to remove it later.
- Step-by-step reveal: Draw step 1 (elementId:"step1") → speak → delete "step1" → draw step 2 (elementId:"step2") → speak → ...
- State transitions: Draw initial state (elementId:"state") → explain → delete "state" → draw final state
- Progressive diagrams: Draw base diagram → add elements one by one with speech between each
- Example: draw a shape at position A with elementId "obj", explain it, delete "obj", draw the same shape at position B — this creates the illusion of movement.
- Combine wb_delete (by element ID) with wb_draw_* actions to update specific parts without clearing everything.

### Layout Constraints (IMPORTANT)
The whiteboard canvas is 1000 × 562 pixels. Follow these rules to prevent element overlap:

**Coordinate system:**
- X range: 0 (left) to 1000 (right), Y range: 0 (top) to 562 (bottom)
- Leave 20px margin from edges (safe area: x 20-980, y 20-542)

**Spacing rules:**
- Maintain at least 20px gap between adjacent elements
- Vertical stacking: next_y = previous_y + previous_height + 30
- Side by side: next_x = previous_x + previous_width + 30

**Layout patterns:**
- Top-down flow: Start from y=30, stack downward with gaps
- Two-column: Left column x=20-480, right column x=520-980
- Center single element: x = (1000 - element_width) / 2

**Before adding a new element:**
- Check existing elements' positions in the whiteboard state
- Ensure your new element's bounding box does not overlap with any existing element
- If space is insufficient, use wb_delete to remove unneeded elements or wb_clear to start fresh
${latexGuidelines}
${common}`;
  }

  if (role === 'assistant') {
    return `- The whiteboard is primarily the teacher's space. As an assistant, use it sparingly to supplement.
- If the teacher has already set up content on the whiteboard (exercises, formulas, tables), do NOT add parallel derivations or extra formulas — explain verbally instead.
- Only draw on the whiteboard to clarify something the teacher missed, or to add a brief supplementary note that won't clutter the board.
- Limit yourself to at most 1-2 small elements per response. Prefer speech over drawing.
${latexGuidelines}
${common}`;
  }

  // Student role: suppress proactive whiteboard usage
  return `- The whiteboard is primarily the teacher's space. Do NOT draw on it proactively.
- Only use whiteboard actions when the teacher or user explicitly invites you to write on the board (e.g., "come solve this", "show your work on the whiteboard").
- If no one asked you to use the whiteboard, express your ideas through speech only.
- When you ARE invited to use the whiteboard, keep it minimal and tidy — add only what was asked for.
${common}`;
}

// ==================== Element Summarization ====================

/**
 * Strip HTML tags to extract plain text
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Summarize a single PPT element into a one-line description
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PPTElement variants have heterogeneous shapes
function summarizeElement(el: any): string {
  const id = el.id ? `[id:${el.id}]` : '';
  const pos = `at (${Math.round(el.left)},${Math.round(el.top)})`;
  const size =
    el.width != null && el.height != null
      ? ` size ${Math.round(el.width)}×${Math.round(el.height)}`
      : el.width != null
        ? ` w=${Math.round(el.width)}`
        : '';

  switch (el.type) {
    case 'text': {
      const text = stripHtml(el.content || '').slice(0, 60);
      const suffix = text.length >= 60 ? '...' : '';
      return `${id} text${el.textType ? `[${el.textType}]` : ''}: "${text}${suffix}" ${pos}${size}`;
    }
    case 'image': {
      const src = el.src?.startsWith('data:') ? '[embedded]' : el.src?.slice(0, 50) || 'unknown';
      return `${id} image: ${src} ${pos}${size}`;
    }
    case 'shape': {
      const shapeText = el.text?.content ? stripHtml(el.text.content).slice(0, 40) : '';
      return `${id} shape${shapeText ? `: "${shapeText}"` : ''} ${pos}${size}`;
    }
    case 'chart':
      return `${id} chart[${el.chartType}]: labels=[${(el.data?.labels || []).slice(0, 4).join(',')}] ${pos}${size}`;
    case 'table': {
      const rows = el.data?.length || 0;
      const cols = el.data?.[0]?.length || 0;
      return `${id} table: ${rows}x${cols} ${pos}${size}`;
    }
    case 'latex':
      return `${id} latex: "${(el.latex || '').slice(0, 40)}" ${pos}${size}`;
    case 'line': {
      const lx = Math.round(el.left ?? 0);
      const ly = Math.round(el.top ?? 0);
      const sx = el.start?.[0] ?? 0;
      const sy = el.start?.[1] ?? 0;
      const ex = el.end?.[0] ?? 0;
      const ey = el.end?.[1] ?? 0;
      return `${id} line: (${lx + sx},${ly + sy}) → (${lx + ex},${ly + ey})`;
    }
    case 'video':
      return `${id} video ${pos}${size}`;
    case 'audio':
      return `${id} audio ${pos}${size}`;
    default:
      return `${id} ${el.type || 'unknown'} ${pos}${size}`;
  }
}

/**
 * Summarize an array of elements into line descriptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PPTElement variants have heterogeneous shapes
function summarizeElements(elements: any[]): string {
  if (elements.length === 0) return '  (empty)';

  const lines = elements.map((el, i) => `  ${i + 1}. ${summarizeElement(el)}`);

  return lines.join('\n');
}

// ==================== Virtual Whiteboard Context ====================

/**
 * Tracked element from replaying the whiteboard ledger
 */
interface VirtualWhiteboardElement {
  agentName: string;
  summary: string;
  elementId?: string; // Present for elements from initial whiteboard state
}

/**
 * Replay the whiteboard ledger to build an attributed element list.
 *
 * - wb_clear resets the accumulated elements
 * - wb_draw_* appends a new element with the agent's name
 * - wb_open / wb_close are ignored (structural, not content)
 *
 * Returns empty string when the ledger is empty (zero extra token overhead).
 */
function buildVirtualWhiteboardContext(
  storeState: StatelessChatRequest['storeState'],
  ledger?: WhiteboardActionRecord[],
): string {
  if (!ledger || ledger.length === 0) return '';

  // Replay ledger to build current element list
  const elements: VirtualWhiteboardElement[] = [];

  for (const record of ledger) {
    switch (record.actionName) {
      case 'wb_clear':
        elements.length = 0;
        break;
      case 'wb_delete': {
        // Remove element by matching elementId from initial whiteboard state
        // (elements drawn this round don't have tracked IDs)
        const deleteId = String(record.params.elementId || '');
        const idx = elements.findIndex((el) => el.elementId === deleteId);
        if (idx >= 0) elements.splice(idx, 1);
        break;
      }
      case 'wb_draw_text': {
        const content = String(record.params.content || '').slice(0, 40);
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 400;
        const h = record.params.height ?? 100;
        elements.push({
          agentName: record.agentName,
          summary: `text: "${content}${content.length >= 40 ? '...' : ''}" at (${x},${y}), size ~${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_shape': {
        const shapeType = record.params.type || record.params.shape || 'rectangle';
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 100;
        const h = record.params.height ?? 100;
        elements.push({
          agentName: record.agentName,
          summary: `shape(${shapeType}) at (${x},${y}), size ${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_chart': {
        const chartType = record.params.chartType || record.params.type || 'bar';
        const labels = Array.isArray(record.params.labels)
          ? record.params.labels
          : (record.params.data as Record<string, unknown>)?.labels;
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 350;
        const h = record.params.height ?? 250;
        elements.push({
          agentName: record.agentName,
          summary: `chart(${chartType})${labels ? `: labels=[${(labels as string[]).slice(0, 4).join(',')}]` : ''} at (${x},${y}), size ${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_latex': {
        const latex = String(record.params.latex || '').slice(0, 40);
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 400;
        // Estimate latex height: ~80px default for single-line, more for complex formulas
        const h = record.params.height ?? 80;
        elements.push({
          agentName: record.agentName,
          summary: `latex: "${latex}${latex.length >= 40 ? '...' : ''}" at (${x},${y}), size ~${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_table': {
        const data = record.params.data as unknown[][] | undefined;
        const rows = data?.length || 0;
        const cols = (data?.[0] as unknown[])?.length || 0;
        const x = record.params.x ?? '?';
        const y = record.params.y ?? '?';
        const w = record.params.width ?? 400;
        const h = record.params.height ?? rows * 40 + 20;
        elements.push({
          agentName: record.agentName,
          summary: `table(${rows}×${cols}) at (${x},${y}), size ${w}x${h}`,
        });
        break;
      }
      case 'wb_draw_line': {
        const sx = record.params.startX ?? '?';
        const sy = record.params.startY ?? '?';
        const ex = record.params.endX ?? '?';
        const ey = record.params.endY ?? '?';
        const pts = record.params.points as string[] | undefined;
        const hasArrow = pts?.includes('arrow') ? ' (arrow)' : '';
        elements.push({
          agentName: record.agentName,
          summary: `line${hasArrow}: (${sx},${sy}) → (${ex},${ey})`,
        });
        break;
      }
      // wb_open, wb_close — skip
    }
  }

  if (elements.length === 0) return '';

  const elementLines = elements
    .map((el, i) => `  ${i + 1}. [by ${el.agentName}] ${el.summary}`)
    .join('\n');

  return `
## Whiteboard Changes This Round (IMPORTANT)
Other agents have modified the whiteboard during this discussion round.
Current whiteboard elements (${elements.length}):
${elementLines}

DO NOT redraw content that already exists. Check positions above before adding new elements.
`;
}

// ==================== State Context ====================

/**
 * Build context string from store state
 */
function buildStateContext(storeState: StatelessChatRequest['storeState']): string {
  const { stage, scenes, currentSceneId, mode, whiteboardOpen } = storeState;

  const lines: string[] = [];

  // Mode
  lines.push(`Mode: ${mode}`);

  // Whiteboard status
  lines.push(
    `Whiteboard: ${whiteboardOpen ? 'OPEN (slide canvas is hidden)' : 'closed (slide canvas is visible)'}`,
  );

  // Stage info
  if (stage) {
    lines.push(
      `Course: ${stage.name || 'Untitled'}${stage.description ? ` - ${stage.description}` : ''}`,
    );
  }

  // Scenes summary
  lines.push(`Total scenes: ${scenes.length}`);

  if (currentSceneId) {
    const currentScene = scenes.find((s) => s.id === currentSceneId);
    if (currentScene) {
      lines.push(
        `Current scene: "${currentScene.title}" (${currentScene.type}, id: ${currentSceneId})`,
      );

      // Slide scene: include element details
      if (currentScene.content.type === 'slide') {
        const elements = currentScene.content.canvas.elements;
        lines.push(`Current slide elements (${elements.length}):\n${summarizeElements(elements)}`);
      }

      // Quiz scene: include question summary
      if (currentScene.content.type === 'quiz') {
        const questions = currentScene.content.questions;
        const qSummary = questions
          .slice(0, 5)
          .map((q, i) => `  ${i + 1}. [${q.type}] ${q.question.slice(0, 80)}`)
          .join('\n');
        lines.push(
          `Quiz questions (${questions.length}):\n${qSummary}${questions.length > 5 ? `\n  ... and ${questions.length - 5} more` : ''}`,
        );
      }
    }
  } else if (scenes.length > 0) {
    lines.push('No scene currently selected');
  }

  // List first few scenes
  if (scenes.length > 0) {
    const sceneSummary = scenes
      .slice(0, 5)
      .map((s, i) => `  ${i + 1}. ${s.title} (${s.type}, id: ${s.id})`)
      .join('\n');
    lines.push(
      `Scenes:\n${sceneSummary}${scenes.length > 5 ? `\n  ... and ${scenes.length - 5} more` : ''}`,
    );
  }

  // Whiteboard content (last whiteboard in the stage)
  if (stage?.whiteboard && stage.whiteboard.length > 0) {
    const lastWb = stage.whiteboard[stage.whiteboard.length - 1];
    const wbElements = lastWb.elements || [];
    lines.push(
      `Whiteboard (last of ${stage.whiteboard.length}, ${wbElements.length} elements):\n${summarizeElements(wbElements)}`,
    );
  }

  return lines.join('\n');
}

// ==================== Conversation Summary ====================

type ConvertedTextPart = { type: 'text'; text: string };
type ConvertedImagePart = { type: 'image'; image: string; mediaType?: string };

export type ConvertedMessageContent = string | Array<ConvertedTextPart | ConvertedImagePart>;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: ConvertedMessageContent;
}

export function convertedMessageContentToText(content: ConvertedMessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'image') return '[Image attachment]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Summarize conversation history for the director agent
 *
 * Produces a condensed text summary of the last N messages,
 * truncating long messages and including role labels.
 *
 * @param messages - OpenAI-format messages to summarize
 * @param maxMessages - Maximum number of recent messages to include (default 10)
 * @param maxContentLength - Maximum content length per message (default 200)
 */
export function summarizeConversation(
  messages: OpenAIMessage[],
  maxMessages = 10,
  maxContentLength = 200,
): string {
  if (messages.length === 0) {
    return 'No conversation history yet.';
  }

  const recent = messages.slice(-maxMessages);
  const lines = recent.map((msg) => {
    const roleLabel =
      msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
    const text = convertedMessageContentToText(msg.content);
    const content = text.length > maxContentLength ? text.slice(0, maxContentLength) + '...' : text;
    return `[${roleLabel}] ${content}`;
  });

  return lines.join('\n');
}

// ==================== Message Conversion ====================

/**
 * Convert UI messages to OpenAI format
 * Includes tool call information so the model knows what actions were taken
 */
export function convertMessagesToOpenAI(
  messages: StatelessChatRequest['messages'],
  currentAgentId?: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: ConvertedMessageContent }> {
  return messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => {
      if (msg.role === 'assistant') {
        // Assistant messages use JSON array format to serve as few-shot examples
        // that match the expected output format from the system prompt
        const items: Array<{ type: string; [key: string]: string }> = [];

        if (msg.parts) {
          for (const part of msg.parts) {
            const p = part as Record<string, unknown>;

            if (p.type === 'text' && p.text) {
              items.push({ type: 'text', content: p.text as string });
            } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
              const actionName = (p.actionName ||
                (p.type as string).replace('action-', '')) as string;
              const output = p.output as Record<string, unknown> | undefined;
              const isSuccess = output?.success === true;
              const resultSummary = isSuccess
                ? output?.data
                  ? `result: ${JSON.stringify(output.data).slice(0, 100)}`
                  : 'success'
                : (output?.error as string) || 'failed';
              items.push({
                type: 'action',
                name: actionName,
                result: resultSummary,
              });
            }
          }
        }

        const content = items.length > 0 ? JSON.stringify(items) : '';
        const msgAgentId = msg.metadata?.agentId;

        // When currentAgentId is provided and this message is from a DIFFERENT agent,
        // convert to user role with agent name attribution
        if (currentAgentId && msgAgentId && msgAgentId !== currentAgentId) {
          const agentName = msg.metadata?.senderName || msgAgentId;
          return {
            role: 'user' as const,
            content: content ? `[${agentName}]: ${content}` : '',
          };
        }

        return {
          role: 'assistant' as const,
          content,
        };
      }

      // User messages preserve text plus image attachments for vision-capable models.
      const contentParts: Array<ConvertedTextPart | ConvertedImagePart> = [];

      if (msg.parts) {
        for (const part of msg.parts) {
          const p = part as Record<string, unknown>;

          if (p.type === 'text' && p.text) {
            contentParts.push({ type: 'text', text: p.text as string });
          } else if (p.type === 'file') {
            const mediaType = typeof p.mediaType === 'string' ? p.mediaType : undefined;
            const image = typeof p.url === 'string' ? p.url : undefined;
            if (image && mediaType?.startsWith('image/')) {
              contentParts.push({ type: 'image', image, mediaType });
            } else if (typeof p.filename === 'string') {
              contentParts.push({ type: 'text', text: `[Attachment: ${p.filename}]` });
            }
          } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
            const actionName = (p.actionName ||
              (p.type as string).replace('action-', '')) as string;
            const output = p.output as Record<string, unknown> | undefined;
            const isSuccess = output?.success === true;
            const resultSummary = isSuccess
              ? output?.data
                ? `result: ${JSON.stringify(output.data).slice(0, 100)}`
                : 'success'
              : (output?.error as string) || 'failed';
            contentParts.push({ type: 'text', text: `[Action ${actionName}: ${resultSummary}]` });
          }
        }
      }

      // Extract speaker name from metadata (e.g. other agents' messages in discussion)
      const senderName = msg.metadata?.senderName;
      if (senderName) {
        const firstTextIndex = contentParts.findIndex((part) => part.type === 'text');
        if (firstTextIndex >= 0 && contentParts[firstTextIndex].type === 'text') {
          contentParts[firstTextIndex] = {
            type: 'text',
            text: `[${senderName}]: ${contentParts[firstTextIndex].text}`,
          };
        } else {
          contentParts.unshift({ type: 'text', text: `[${senderName}]:` });
        }
      }

      const textOnly =
        contentParts.length === 0 || contentParts.every((part) => part.type === 'text');
      const content: ConvertedMessageContent = textOnly
        ? contentParts
            .map((part) => (part.type === 'text' ? part.text : ''))
            .filter(Boolean)
            .join('\n')
        : contentParts;

      // Annotate interrupted messages so the LLM knows context was cut short
      const isInterrupted =
        (msg as unknown as Record<string, unknown>).metadata &&
        ((msg as unknown as Record<string, unknown>).metadata as Record<string, unknown>)
          ?.interrupted;
      return {
        role: 'user' as const,
        content: isInterrupted
          ? typeof content === 'string'
            ? `${content}\n[This response was interrupted — do NOT continue it. Start a new JSON array response.]`
            : [
                ...content,
                {
                  type: 'text' as const,
                  text: '[This response was interrupted — do NOT continue it. Start a new JSON array response.]',
                },
              ]
          : content,
      };
    })
    .filter((msg) => {
      // Drop empty messages and messages with only dots/ellipsis/whitespace
      // (produced by failed agent streams)
      const stripped = convertedMessageContentToText(msg.content).replace(/[.\s…]+/g, '');
      return stripped.length > 0;
    });
}
