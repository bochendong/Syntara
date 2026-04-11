import type { NotebookContentDocument, NotebookContentLanguage } from './schema';
import { inferNotebookContentProfileFromText } from './profile';

function extractFenceCode(input: string): { prose: string; code?: string; language?: string } {
  const match = input.match(/```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/);
  if (!match) return { prose: input };
  const language = (match[1] || '').trim() || undefined;
  const code = (match[2] || '').trim() || undefined;
  return {
    prose: input.replace(match[0], '').trim(),
    code,
    language,
  };
}

function normalizePlainText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function toBulletItems(description: string, keyPoints: string[]): string[] {
  const raw = [...keyPoints, description]
    .flatMap((item) => normalizePlainText(item).split('\n'))
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[-*•]\s*/, '').trim());
  return Array.from(new Set(raw)).slice(0, 8);
}

export function buildNotebookContentDocumentFromText(args: {
  text: string;
  title?: string;
  language?: NotebookContentLanguage;
}): NotebookContentDocument {
  const normalized = normalizePlainText(args.text);
  const profile = inferNotebookContentProfileFromText(args.text);
  return {
    version: 1,
    language: args.language || 'zh-CN',
    profile,
    archetype: 'concept',
    title: args.title,
    blocks: [
      {
        type: 'paragraph',
        text:
          normalized ||
          args.text.trim() ||
          (args.language === 'en-US' ? 'No content.' : '暂无内容。'),
      },
    ],
  };
}

export function buildNotebookContentDocumentFromInsert(args: {
  title: string;
  description: string;
  keyPoints: string[];
  language?: NotebookContentLanguage;
}): NotebookContentDocument {
  const {
    prose,
    code,
    language: codeLanguage,
  } = extractFenceCode([args.description, ...args.keyPoints].join('\n'));
  const subtitle = normalizePlainText(args.description);
  const bullets = toBulletItems(prose || args.description, args.keyPoints);
  const profile = inferNotebookContentProfileFromText(
    [args.title, args.description, ...args.keyPoints, code || ''].join('\n'),
  );

  const blocks: NotebookContentDocument['blocks'] = [];
  if (subtitle) {
    blocks.push({ type: 'paragraph', text: subtitle });
  }
  if (bullets.length > 0 && !(code && profile === 'code')) {
    blocks.push({ type: 'bullet_list', items: bullets });
  }
  if (code && profile === 'code' && bullets.length > 0) {
    blocks.push({
      type: 'code_walkthrough',
      title: args.language === 'en-US' ? 'Code Walkthrough' : '代码讲解',
      language: codeLanguage || 'text',
      code,
      caption: args.language === 'en-US' ? 'Code snippet' : '代码片段',
      steps: bullets.slice(0, 6).map((item) => ({
        explanation: item,
      })),
    });
  } else if (code) {
    blocks.push({
      type: 'code_block',
      language: codeLanguage || 'text',
      code,
      caption: args.language === 'en-US' ? 'Code snippet' : '代码片段',
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      type: 'paragraph',
      text:
        args.language === 'en-US' ? 'Summary is not available yet.' : '暂时没有可展示的内容摘要。',
    });
  }

  return {
    version: 1,
    language: args.language || 'zh-CN',
    profile,
    archetype: profile === 'code' ? 'example' : 'concept',
    title: args.title,
    blocks,
  };
}
