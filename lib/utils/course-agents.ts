import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { useSettingsStore } from '@/lib/store/settings';
import { getActionsForRole } from '@/lib/orchestration/registry/types';

/** 课程聊天列表中的 Agent（含生成角色与设置中的预设） */
export interface CourseAgentListItem {
  id: string;
  name: string;
  avatar: string;
  role: string;
  persona: string;
  color: string;
  priority: number;
  /** 来自哪个笔记本；预设 Agent 无此字段 */
  stageId?: string;
  isGenerated?: boolean;
}

/**
 * 汇总某课程下所有笔记本里的生成 Agent；若为空则回退到设置里选中的预设 Agent。
 */
export async function listAgentsForCourse(courseId: string): Promise<CourseAgentListItem[]> {
  void courseId;

  const registry = useAgentRegistry.getState();
  const selectedIds = useSettingsStore.getState().selectedAgentIds?.length
    ? useSettingsStore.getState().selectedAgentIds
    : ['default-1', 'default-2', 'default-3'];

  const fallback: CourseAgentListItem[] = [];
  for (const id of selectedIds) {
    const a = registry.getAgent(id);
    if (!a) continue;
    fallback.push({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      role: a.role,
      persona: a.persona,
      color: a.color,
      priority: a.priority,
      isGenerated: Boolean(a.isGenerated),
      stageId: a.boundStageId,
    });
  }

  return fallback;
}

/** 构造 /api/chat 所需的 agentConfigs 条目 */
export function toChatAgentConfig(item: CourseAgentListItem) {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    persona: item.persona,
    avatar: item.avatar,
    color: item.color,
    allowedActions: getActionsForRole(item.role),
    priority: item.priority,
    isGenerated: item.isGenerated,
    boundStageId: item.stageId,
  };
}
