import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrchestratorOutlineLength = 'minimal' | 'compact' | 'standard' | 'extended';

/** 老师带做的完整例题 / 走读序列（多页 slide）的大致数量档；`none` 为不安排完整例题走读 */
export type OrchestratorWorkedExampleLevel = 'none' | 'light' | 'moderate' | 'heavy';

export interface OrchestratorNotebookGenState {
  modelIdOverride: string | null;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  outlineLength: OrchestratorOutlineLength;
  workedExampleLevel: OrchestratorWorkedExampleLevel;
  includeQuizScenes: boolean;
  useAiImages: boolean;
  setModelIdOverride: (v: string | null) => void;
  setLanguage: (v: 'zh-CN' | 'en-US') => void;
  setWebSearch: (v: boolean) => void;
  setOutlineLength: (v: OrchestratorOutlineLength) => void;
  setWorkedExampleLevel: (v: OrchestratorWorkedExampleLevel) => void;
  setIncludeQuizScenes: (v: boolean) => void;
  setUseAiImages: (v: boolean) => void;
}

export const useOrchestratorNotebookGenStore = create<OrchestratorNotebookGenState>()(
  persist(
    (set) => ({
      modelIdOverride: null,
      language: 'zh-CN',
      webSearch: true,
      outlineLength: 'standard',
      workedExampleLevel: 'moderate',
      includeQuizScenes: true,
      useAiImages: true,
      setModelIdOverride: (modelIdOverride) => set({ modelIdOverride }),
      setLanguage: (language) => set({ language }),
      setWebSearch: (webSearch) => set({ webSearch }),
      setOutlineLength: (outlineLength) => set({ outlineLength }),
      setWorkedExampleLevel: (workedExampleLevel) => set({ workedExampleLevel }),
      setIncludeQuizScenes: (includeQuizScenes) => set({ includeQuizScenes }),
      setUseAiImages: (useAiImages) => set({ useAiImages }),
    }),
    { name: 'synatra-orchestrator-nb-gen' },
  ),
);
