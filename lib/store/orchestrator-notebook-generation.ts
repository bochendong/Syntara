import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NotebookGenerationModelStage } from '@/lib/constants/notebook-generation-model-stages';
import type { NotebookGenerationModelMode } from '@/lib/constants/notebook-generation-model-presets';
import {
  DEFAULT_SLIDE_GENERATION_ROUTE,
  type SlideGenerationRoute,
} from '@/lib/generation/slide-generation-route';

export type OrchestratorOutlineLength = 'minimal' | 'compact' | 'standard' | 'extended';

/** 老师带做的完整例题 / 走读序列（多页 slide）的大致数量档；`none` 为不安排完整例题走读 */
export type OrchestratorWorkedExampleLevel = 'none' | 'light' | 'moderate' | 'heavy';

/** 各创建步骤单独指定的 OpenAI modelId；未设置的步骤使用上方「默认」模型 */
export type NotebookStageModelOverrides = Partial<
  Record<NotebookGenerationModelStage, string | null>
>;

export interface OrchestratorNotebookGenState {
  /** 生成笔记本时的模型策略：推荐搭配 / 自选 / 全开主模型 */
  notebookModelMode: NotebookGenerationModelMode;
  modelIdOverride: string | null;
  notebookStageModelOverrides: NotebookStageModelOverrides;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  generateSlides: boolean;
  slideGenerationRoute: SlideGenerationRoute;
  outlineLength: OrchestratorOutlineLength;
  workedExampleLevel: OrchestratorWorkedExampleLevel;
  includeQuizScenes: boolean;
  useAiImages: boolean;
  setNotebookModelMode: (v: NotebookGenerationModelMode) => void;
  setModelIdOverride: (v: string | null) => void;
  setNotebookStageModelOverride: (
    stage: NotebookGenerationModelStage,
    modelId: string | null,
  ) => void;
  setLanguage: (v: 'zh-CN' | 'en-US') => void;
  setWebSearch: (v: boolean) => void;
  setGenerateSlides: (v: boolean) => void;
  setSlideGenerationRoute: (v: SlideGenerationRoute) => void;
  setOutlineLength: (v: OrchestratorOutlineLength) => void;
  setWorkedExampleLevel: (v: OrchestratorWorkedExampleLevel) => void;
  setIncludeQuizScenes: (v: boolean) => void;
  setUseAiImages: (v: boolean) => void;
}

export const useOrchestratorNotebookGenStore = create<OrchestratorNotebookGenState>()(
  persist(
    (set) => ({
      notebookModelMode: 'recommended',
      modelIdOverride: null,
      notebookStageModelOverrides: {},
      language: 'zh-CN',
      webSearch: true,
      generateSlides: true,
      slideGenerationRoute: DEFAULT_SLIDE_GENERATION_ROUTE,
      outlineLength: 'standard',
      workedExampleLevel: 'moderate',
      includeQuizScenes: true,
      useAiImages: true,
      setNotebookModelMode: (notebookModelMode) => set({ notebookModelMode }),
      setModelIdOverride: (modelIdOverride) => set({ modelIdOverride }),
      setNotebookStageModelOverride: (stage, modelId) =>
        set((s) => {
          const next = { ...(s.notebookStageModelOverrides ?? {}) };
          if (!modelId?.trim()) {
            delete next[stage];
          } else {
            next[stage] = modelId.trim();
          }
          return { notebookStageModelOverrides: next };
        }),
      setLanguage: (language) => set({ language }),
      setWebSearch: (webSearch) => set({ webSearch }),
      setGenerateSlides: (generateSlides) => set({ generateSlides }),
      setSlideGenerationRoute: (slideGenerationRoute) => set({ slideGenerationRoute }),
      setOutlineLength: (outlineLength) => set({ outlineLength }),
      setWorkedExampleLevel: (workedExampleLevel) => set({ workedExampleLevel }),
      setIncludeQuizScenes: (includeQuizScenes) => set({ includeQuizScenes }),
      setUseAiImages: (useAiImages) => set({ useAiImages }),
    }),
    { name: 'synatra-orchestrator-nb-gen' },
  ),
);
