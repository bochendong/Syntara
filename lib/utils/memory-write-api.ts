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
  targetType?: 'platform' | 'course' | 'notebook' | null;
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
    targetType?: 'platform' | 'course' | 'notebook' | null;
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
    targetType?: 'platform' | 'course' | 'notebook';
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
    targetType: 'platform' | 'course' | 'notebook';
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
    title: initialTitle(status, candidate),
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
    candidate.contentType === 'current_fact' ||
    candidate.contentType === 'preference' ||
    candidate.contentType === 'profile' ||
    candidate.contentType === 'weakness' ||
    candidate.contentType === 'learning_pattern' ||
    candidate.contentType === 'problem_attempt' ||
    candidate.contentType === 'conversation_summary' ||
    candidate.contentType === 'course_requirement' ||
    candidate.contentType === 'notebook_requirement'
  ) {
    return 'writing_study_memory';
  }
  return 'detecting';
}

function initialTitle(status: MemoryActivityStatus, candidate?: MemoryWriteCandidate) {
  if (isScheduleMemoryCandidate(candidate)) return '课程安排写入中';
  if (candidate?.contentType === 'current_fact') return '重要信息写入中';
  if (candidate?.contentType === 'preference') return '学习偏好写入中';
  if (candidate?.contentType === 'profile') return '个人背景写入中';
  if (candidate?.contentType === 'weakness') return '薄弱点写入中';
  if (candidate?.contentType === 'learning_pattern') return '学习方式写入中';
  if (candidate?.contentType === 'problem_attempt') return '掌握情况写入中';
  if (candidate?.contentType === 'conversation_summary') return '对话摘要写入中';
  if (candidate?.contentType === 'course_requirement') return '课程要求写入中';
  if (candidate?.contentType === 'notebook_requirement') return '笔记本要求写入中';
  if (candidate?.contentType === 'source_original') return '资料理解写入中';
  if (candidate?.contentType === 'problem_original') return '题目资料写入中';
  if (status === 'writing_fact') return '我正在更新对你的了解';
  if (status === 'writing_study_memory') return '我正在整理一条学习记忆';
  if (status === 'indexing_source') return '我正在读这份资料';
  return '我正在判断这条信息以后会不会帮到你';
}

function initialLayer(candidate: MemoryWriteCandidate): MemoryActivityLayer {
  if (candidate.contentType === 'source_original' || candidate.contentType === 'problem_original') {
    return 'knowledge_index';
  }
  if (candidate.fact?.namespace && candidate.fact.key) return 'structured_fact';
  if (
    candidate.contentType === 'current_fact' ||
    candidate.contentType === 'preference' ||
    candidate.contentType === 'profile'
  ) {
    return 'structured_fact';
  }
  if (
    candidate.contentType === 'weakness' ||
    candidate.contentType === 'learning_pattern' ||
    candidate.contentType === 'problem_attempt' ||
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
    title: completedTitle(result, candidate),
    description: completedDescription(result, candidate),
    status: 'completed',
    layer: result.layer,
    chips: chipsFromResult(result, candidate),
    detailHref: detailHref(result),
  };
}

function completedTitle(result: MemoryWriteResult, candidate?: MemoryWriteCandidate) {
  if (isScheduleMemoryCandidate(candidate)) return '课程安排已更新';
  if (candidate?.contentType === 'current_fact') return '重要信息已更新';
  if (candidate?.contentType === 'preference') return '学习偏好已更新';
  if (candidate?.contentType === 'profile') return '个人背景已更新';
  if (candidate?.contentType === 'weakness') return '薄弱点已更新';
  if (candidate?.contentType === 'learning_pattern') return '学习方式已更新';
  if (candidate?.contentType === 'problem_attempt') return '掌握情况已更新';
  if (candidate?.contentType === 'conversation_summary') return '对话摘要已更新';
  if (candidate?.contentType === 'course_requirement') return '课程要求已更新';
  if (candidate?.contentType === 'notebook_requirement') return '笔记本要求已更新';
  if (candidate?.contentType === 'source_original') return '资料理解已更新';
  if (candidate?.contentType === 'problem_original') return '题目资料已更新';
  if (result.action === 'write_fact') return '学习偏好已更新';
  if (result.action === 'write_study_memory') return '学习记忆已更新';
  return '我已经整理好这次记忆更新';
}

function completedDescription(result: MemoryWriteResult, candidate?: MemoryWriteCandidate) {
  const title = candidate?.studyMemory?.title || result.memory?.title || candidate?.title || '';
  const text = candidate?.studyMemory?.text || candidate?.text || '';
  const reason = candidate?.studyMemory?.reason || result.reason || '';
  const subject = title || text || reason;
  if (isScheduleMemoryCandidate(candidate)) {
    return compact(`课程安排：${subject}。之后安排复习、提醒和学习计划时我会参考这个时间。`, 220);
  }
  if (candidate?.contentType === 'current_fact') {
    return compact(`重要信息：${subject}。之后回答和规划时我会把它纳入考虑。`, 220);
  }
  if (candidate?.contentType === 'preference') {
    return compact(`学习偏好：${subject}。之后我会按这个偏好调整讲解和互动方式。`, 220);
  }
  if (candidate?.contentType === 'profile') {
    return compact(`个人背景：${subject}。之后我会用它理解你的学习目标和上下文。`, 220);
  }
  if (candidate?.contentType === 'weakness') {
    return compact(`薄弱点：${title || text || reason}。${reason ? `原因：${reason}` : ''}`, 220);
  }
  if (candidate?.contentType === 'learning_pattern') {
    return compact(`学习方式：${title || text || reason}。我会据此调整讲解和练习安排。`, 220);
  }
  if (candidate?.contentType === 'problem_attempt') {
    return compact(`掌握情况：${subject}`, 220);
  }
  if (candidate?.contentType === 'conversation_summary') {
    return compact(`对话摘要：${subject}。之后继续这个主题时，我会参考这段上下文。`, 220);
  }
  if (
    candidate?.contentType === 'course_requirement' ||
    candidate?.contentType === 'notebook_requirement'
  ) {
    return compact(`课程要求：${title || text}。之后回答时我会遵守这个格式或规则。`, 220);
  }
  if (reason) return compact(reason, 220);
  if (title) return `之后我会参考「${title}」来更贴近你的学习状态。`;
  if (text) return compact(text, 220);
  if (result.fact) return '这条事实/偏好已经更新，之后回答时我会把它纳入考虑。';
  return result.reason || '这条信息已经加入平台记忆，之后我会用它更好地帮助你。';
}

function candidateMemorySubject(candidate?: MemoryWriteCandidate) {
  return [
    candidate?.studyMemory?.title,
    candidate?.title,
    candidate?.studyMemory?.text,
    candidate?.text,
    candidate?.studyMemory?.reason,
  ]
    .filter((item): item is string => Boolean(item?.trim()))
    .join(' ');
}

function isScheduleMemoryCandidate(candidate?: MemoryWriteCandidate) {
  return /(考试|测验|quiz|test|midterm|final|ddl|deadline|due|作业|assignment|日程|calendar|syllabus|上课|office hour|due date)/i.test(
    candidateMemorySubject(candidate),
  );
}

function skippedTitle(result: MemoryWriteResult) {
  if (result.action === 'index_knowledge_source') return '这份原文还在等待整理';
  if (result.action === 'write_business_record') return '这次更适合放进练习记录';
  if (result.action === 'ignore') return '这条暂时不用记住';
  return '这次没有写入记忆';
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
  if (candidate.targetType === 'platform') return '平台';
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
