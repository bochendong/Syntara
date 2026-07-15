import type { LanguageModel } from 'ai';
import { callLLM } from '@/lib/ai/llm';

export type PublicExplanationInput = {
  kind: 'concept' | 'problem';
  topic: string;
  courseName?: string;
  language: 'zh-CN' | 'en-US';
  sourceNotes: Array<{ title: string; content: string; sourceRef?: string }>;
};

function explanationPrompt(input: PublicExplanationInput): string {
  const sourceBoundary = input.sourceNotes.length
    ? [
        'Use the attached note excerpts first. Mark source-backed claims with [source: <title or sourceRef>].',
        'If the notes are insufficient, explicitly label additional material as general knowledge.',
        ...input.sourceNotes.map(
          (note, index) =>
            `SOURCE ${index + 1}: ${note.title}${note.sourceRef ? ` (${note.sourceRef})` : ''}\n${note.content}`,
        ),
      ].join('\n\n')
    : 'No course notes were supplied. Use general knowledge only and state that no course notes were used.';
  const task =
    input.kind === 'concept'
      ? [
          'Explain the concept as a self-contained lesson.',
          'Start with the learning target and an intuitive model.',
          'Give the exact definition, conditions, and boundaries.',
          'Walk through one checkable example.',
          'Correct at least one common misconception.',
          'End with one lightweight self-check question.',
        ]
      : [
          'Explain the problem completely.',
          'Restate the knowns, target, and easily missed constraints.',
          'Explain the method-selection signal and why the method applies.',
          'Show the solution step by step with the purpose and basis of each step.',
          'Give the final conclusion, a checking method, and common wrong approaches.',
        ];

  return [
    `Output language: ${input.language === 'en-US' ? 'English' : 'Simplified Chinese'}`,
    `Course: ${input.courseName || 'not specified'}`,
    `Topic or problem:\n${input.topic}`,
    `Requirements:\n- ${task.join('\n- ')}`,
    `Evidence boundary:\n${sourceBoundary}`,
    'Return polished Markdown only. Do not create calendar, practice, memory, or classroom actions.',
  ].join('\n\n');
}

export async function generatePublicExplanation(args: {
  model: LanguageModel;
  input: PublicExplanationInput;
}) {
  const result = await callLLM(
    {
      model: args.model,
      system:
        'You are a careful course tutor. Teach directly, preserve evidence boundaries, and return only the requested learner-facing Markdown.',
      prompt: explanationPrompt(args.input),
      maxOutputTokens: 7000,
      maxRetries: 0,
    },
    'public-api-explanation',
  );
  return { markdown: result.text.trim(), usage: result.usage };
}
