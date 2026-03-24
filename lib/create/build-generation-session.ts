import { nanoid } from 'nanoid';
import { setSessionStorageJson, storePdfBlob } from '@/lib/utils/image-storage';
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
  pdfFile: File | null;
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
    pdfFile,
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
  let pdfProvId = pdfProviderId;
  let pdfProvCfg = pdfProviderConfig;

  if (pdfFile) {
    pdfStorageKey = await storePdfBlob(pdfFile);
    pdfFileName = pdfFile.name;
  }

  return {
    sessionId: nanoid(),
    courseId: courseId.trim(),
    requirements,
    pdfText: '',
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
