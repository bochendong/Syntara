'use client';

import {
  addMemoryActivity,
  updateMemoryActivity,
  type MemoryActivityInput,
  type MemoryActivityLayer,
  type MemoryActivityStatus,
} from '@/lib/store/memory-activity';
import { backendJson } from '@/lib/utils/backend-api';

export type MemoryWriteTrigger =
  | 'explicit_user'
  | 'fact_correction'
  | 'chat_turn_end'
  | 'problem_attempt'
  | 'source_import'
  | 'periodic_summary'
  | 'manual'
  | 'agent_tool';

export type MemoryWriteContentType =
  | 'current_fact'
  | 'preference'
  | 'profile'
  | 'course_requirement'
  | 'notebook_requirement'
  | 'learning_pattern'
  | 'weakness'
  | 'conversation_summary'
  | 'source_original'
  | 'problem_original'
  | 'problem_attempt'
  | 'other';

export type MemoryWriteCandidate = {
  id?: string | null;
  trigger: MemoryWriteTrigger;
  contentType: MemoryWriteContentType;
  targetType?: 'course' | 'notebook' | null;
  targetId?: string | null;
  conversationId?: string | null;
  title?: string | null;
  text?: string | null;
  privacy?: 'public' | 'private' | null;
  scopeType?: 'user' | 'course' | 'notebook' | 'conversation' | null;
  scopeId?: string | null;
  source?: string | null;
  sourceRef?: unknown;
  fact?: {
    namespace?: string | null;
    key?: string | null;
    valueJson?: unknown;
    confidence?: number | null;
  } | null;
  studyMemory?: {
    targetType?: 'course' | 'notebook' | null;
    targetId?: string | null;
    scope?: 'public' | 'private' | null;
    kind?: string | null;
    title?: string | null;
    text?: string | null;
    reason?: string | null;
    question?: string | null;
    sourceReferences?: unknown;
  } | null;
};

export type MemoryWriteResult = {
  candidateId: string | null;
  action:
    | 'write_fact'
    | 'write_study_memory'
    | 'index_knowledge_source'
    | 'write_business_record'
    | 'ignore'
    | 'needs_confirmation';
  layer: MemoryActivityLayer;
  reason: string;
  executed: boolean;
  scope: {
    scopeType?: 'user' | 'course' | 'notebook' | 'conversation';
    scopeId?: string | null;
    targetType?: 'course' | 'notebook';
    targetId?: string | null;
    privacy?: 'public' | 'private';
  };
  fact?: {
    id: string;
    scopeType: string;
    scopeId: string | null;
    namespace: string;
    key: string;
  };
  memory?: {
    id: string;
    courseId: string | null;
    notebookId: string | null;
    targetType: 'course' | 'notebook';
    title: string;
    scope: 'public' | 'private';
  };
  error?: string;
};

export type MemoryWriteResponse = {
  storage: 'database';
  dryRun: boolean;
  results: MemoryWriteResult[];
  counts: {
    total: number;
    executed: number;
    needsConfirmation: number;
    skipped: number;
  };
};

export async function writeMemoryWithActivity(args: {
  candidate?: MemoryWriteCandidate;
  candidates?: MemoryWriteCandidate[];
  dryRun?: boolean;
}): Promise<MemoryWriteResponse> {
  const candidates = args.candidates || (args.candidate ? [args.candidate] : []);
  const activityIds = candidates.map((candidate) => addMemoryActivity(initialActivity(candidate)));
  try {
    const response = await backendJson<MemoryWriteResponse>('/api/memory/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    response.results.forEach((result, index) => {
      const activityId = activityIds[index];
      if (!activityId) return;
      updateMemoryActivity(
        activityId,
        activityFromResult(result, candidates[index], response.dryRun),
      );
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    activityIds.forEach((activityId) => {
      updateMemoryActivity(activityId, {
        title: '记忆没有写入',
        description: message,
        status: 'failed',
        layer: 'none',
        chips: ['失败'],
        error: message,
      });
    });
    throw error;
  }
}

function initialActivity(candidate: MemoryWriteCandidate): MemoryActivityInput {
  const status = initialStatus(candidate);
  return {
    title: initialTitle(status),
    description: candidateTitle(candidate),
    status,
    layer: initialLayer(candidate),
    chips: initialChips(candidate),
  };
}

function initialStatus(candidate: MemoryWriteCandidate): MemoryActivityStatus {
  if (candidate.contentType === 'source_original' || candidate.contentType === 'problem_original') {
    return 'indexing_source';
  }
  if (candidate.fact?.namespace && candidate.fact.key) return 'writing_fact';
  if (
    candidate.contentType === 'weakness' ||
    candidate.contentType === 'learning_pattern' ||
    candidate.contentType === 'conversation_summary' ||
    candidate.contentType === 'course_requirement' ||
    candidate.contentType === 'notebook_requirement'
  ) {
    return 'writing_study_memory';
  }
  return 'detecting';
}

function initialTitle(status: MemoryActivityStatus) {
  if (status === 'writing_fact') return '正在更新记忆';
  if (status === 'writing_study_memory') return '正在写入记忆';
  if (status === 'indexing_source') return '正在加入知识索引';
  return '正在判断是否值得记住';
}

function initialLayer(candidate: MemoryWriteCandidate): MemoryActivityLayer {
  if (candidate.contentType === 'source_original' || candidate.contentType === 'problem_original') {
    return 'knowledge_index';
  }
  if (candidate.fact?.namespace && candidate.fact.key) return 'structured_fact';
  if (
    candidate.contentType === 'weakness' ||
    candidate.contentType === 'learning_pattern' ||
    candidate.contentType === 'conversation_summary' ||
    candidate.contentType === 'course_requirement' ||
    candidate.contentType === 'notebook_requirement'
  ) {
    return 'study_memory';
  }
  return 'none';
}

function initialChips(candidate: MemoryWriteCandidate) {
  return [
    layerLabel(initialLayer(candidate)),
    scopeLabelFromCandidate(candidate),
    candidate.privacy || candidate.studyMemory?.scope || '',
  ].filter(Boolean);
}

function activityFromResult(
  result: MemoryWriteResult,
  candidate: MemoryWriteCandidate | undefined,
  dryRun: boolean,
): Partial<MemoryActivityInput> {
  if (result.error) {
    return {
      title: '记忆没有写入',
      description: result.error,
      status: 'failed',
      layer: result.layer,
      chips: [...chipsFromResult(result, candidate), '失败'],
      error: result.error,
    };
  }
  if (result.action === 'needs_confirmation') {
    return {
      title: '要记住这条吗？',
      description: candidateTitle(candidate) || result.reason,
      status: 'needs_confirmation',
      layer: result.layer,
      chips: [...chipsFromResult(result, candidate), '待确认'],
    };
  }
  if (dryRun) {
    return {
      title: '记忆写入已规划',
      description: result.reason,
      status: 'skipped',
      layer: result.layer,
      chips: [...chipsFromResult(result, candidate), '预演'],
    };
  }
  if (!result.executed) {
    return {
      title: skippedTitle(result),
      description: result.reason,
      status: 'skipped',
      layer: result.layer,
      chips: chipsFromResult(result, candidate),
    };
  }
  return {
    title: completedTitle(result),
    description: completedDescription(result, candidate),
    status: 'completed',
    layer: result.layer,
    chips: chipsFromResult(result, candidate),
    detailHref: detailHref(result),
  };
}

function completedTitle(result: MemoryWriteResult) {
  if (result.action === 'write_fact') return '偏好/事实已更新';
  if (result.action === 'write_study_memory') return '记忆已写入';
  return '记忆活动已完成';
}

function completedDescription(result: MemoryWriteResult, candidate?: MemoryWriteCandidate) {
  if (result.memory?.title) return result.memory.title;
  if (result.fact) return `${result.fact.namespace}.${result.fact.key}`;
  return candidateTitle(candidate) || result.reason;
}

function skippedTitle(result: MemoryWriteResult) {
  if (result.action === 'index_knowledge_source') return '原文等待索引';
  if (result.action === 'write_business_record') return '应写入做题记录';
  if (result.action === 'ignore') return '未写入记忆';
  return '记忆没有写入';
}

function candidateTitle(candidate?: MemoryWriteCandidate) {
  const text =
    candidate?.studyMemory?.title ||
    candidate?.title ||
    candidate?.studyMemory?.text ||
    candidate?.text ||
    '';
  return compact(text, 96);
}

function chipsFromResult(result: MemoryWriteResult, candidate?: MemoryWriteCandidate) {
  return [
    layerLabel(result.layer),
    result.scope.scopeType || result.scope.targetType || scopeLabelFromCandidate(candidate),
    result.scope.privacy || candidate?.privacy || candidate?.studyMemory?.scope || '',
  ].filter(Boolean);
}

function layerLabel(layer: MemoryActivityLayer) {
  if (layer === 'structured_fact') return '事实';
  if (layer === 'study_memory') return '记忆';
  if (layer === 'knowledge_index') return '原文索引';
  if (layer === 'business_record') return '做题记录';
  return '';
}

function scopeLabelFromCandidate(candidate?: MemoryWriteCandidate) {
  if (!candidate) return '';
  if (candidate.scopeType === 'user') return '全局';
  if (candidate.scopeType === 'course' || candidate.targetType === 'course') return '课程';
  if (candidate.scopeType === 'notebook' || candidate.targetType === 'notebook') return '笔记本';
  if (candidate.scopeType === 'conversation') return '当前对话';
  return '';
}

function detailHref(result: MemoryWriteResult) {
  if (result.memory?.notebookId) {
    return `/classroom/${encodeURIComponent(result.memory.notebookId)}/memory/detail?memoryId=${encodeURIComponent(result.memory.id)}`;
  }
  if (result.memory?.courseId) {
    return `/course/${encodeURIComponent(result.memory.courseId)}/memory`;
  }
  if (result.fact?.scopeType === 'course' && result.fact.scopeId) {
    return `/course/${encodeURIComponent(result.fact.scopeId)}/memory`;
  }
  if (result.fact?.scopeType === 'notebook' && result.fact.scopeId) {
    return `/classroom/${encodeURIComponent(result.fact.scopeId)}/memory`;
  }
  return undefined;
}

function compact(value: string, maxChars: number) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}
