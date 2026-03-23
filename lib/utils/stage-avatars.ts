import { pickStableNotebookAgentAvatarUrl } from '@/lib/constants/notebook-agent-avatars';
import { listStages } from '@/lib/utils/stage-storage';
import { backendJson } from '@/lib/utils/backend-api';

/** 为缺少 avatarUrl 的笔记本补全稳定头像（与 DB v10 迁移一致，可重复调用） */
export async function ensureStagesHaveAvatars(): Promise<void> {
  const all = await listStages();
  const missing = all.filter((s) => !s.avatarUrl?.trim());
  if (missing.length === 0) return;
  await Promise.all(missing.map((s) =>
    backendJson(`/api/notebooks/${encodeURIComponent(s.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatarUrl: pickStableNotebookAgentAvatarUrl(s.id),
      }),
    }),
  ));
}
