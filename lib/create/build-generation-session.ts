import { nanoid } from 'nanoid';
import { setSessionStorageJson, storePdfBlob } from '@/lib/utils/image-storage';
import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';
import type { UserRequirements } from '@/lib/types/generation';

/** 与 `/create`、`generation-preview` 使用的 sessionStorage 结构一致 */
export type GenerationSessionState = {
  sessionId: string;
  courseId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfImages: unknown[];
  imageStorageIds: unknown[];
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  sceneOutlines: null;
  currentStep: 'generating';
};

export async function buildGenerationSessionState(options: {
  courseId: string;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  sourceFile: File | null;
  userNickname?: string;
  userBio?: string;
  pdfProviderId?: string;
  pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
}): Promise<GenerationSessionState> {
  const {
    courseId,
    requirement,
    language,
    webSearch,
    sourceFile,
    userNickname,
    userBio,
    pdfProviderId,
    pdfProviderConfig,
  } = options;

  const requirements: UserRequirements = {
    requirement,
    language,
    userNickname,
    userBio,
    webSearch: webSearch || undefined,
  };

  let pdfStorageKey: string | undefined;
  let pdfFileName: string | undefined;
  let pdfText = '';
  let pdfProvId = pdfProviderId;
  let pdfProvCfg = pdfProviderConfig;

  if (sourceFile) {
    const lowerName = sourceFile.name.toLowerCase();
    const mime = (sourceFile.type || '').toLowerCase();
    const isPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf');
    const isMarkdown =
      mime === 'text/markdown' || mime === 'text/x-markdown' || lowerName.endsWith('.md');

    if (isPdf) {
      pdfStorageKey = await storePdfBlob(sourceFile);
      pdfFileName = sourceFile.name;
    } else if (isMarkdown) {
      const raw = (await sourceFile.text()).replace(/\u0000/g, '').trim();
      if (!raw) {
        throw new Error('Markdown 文件为空，无法用于生成。');
      }
      pdfText = raw.slice(0, MAX_PDF_CONTENT_CHARS);
      pdfProvId = undefined;
      pdfProvCfg = undefined;
    } else {
      throw new Error('目前只支持 PDF 或 Markdown（.md）文件。');
    }
  }

  return {
    sessionId: nanoid(),
    courseId: courseId.trim(),
    requirements,
    pdfText,
    pdfImages: [],
    imageStorageIds: [],
    pdfStorageKey,
    pdfFileName,
    pdfProviderId: pdfProvId,
    pdfProviderConfig: pdfProvCfg,
    sceneOutlines: null,
    currentStep: 'generating',
  };
}

export function persistGenerationSession(sessionState: GenerationSessionState): void {
  setSessionStorageJson(
    'generationSession',
    sessionState,
    '保存「生成会话」到浏览器缓存（generationSession）时失败：',
  );
}
