import { CreditTransactionKind, type PrismaClient, type Prisma } from '@prisma/client';
import type { AppNotification } from '@/lib/notifications/types';

type NotificationDbClient = PrismaClient | Prisma.TransactionClient;
const TOKEN_USAGE_GROUP_WINDOW_MS = 3 * 60 * 1000;

type CreditNotificationRow = {
  id: string;
  kind: CreditTransactionKind;
  delta: number;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

type UsageContext = {
  key: string;
  label: string;
};

type TokenUsageGroup = {
  context: UsageContext;
  rows: CreditNotificationRow[];
  newestCreatedAt: Date;
};

function formatDeltaLabel(delta: number): string {
  return `${delta > 0 ? '+' : ''}${delta} credits`;
}

function buildNotificationTitle(row: CreditNotificationRow): string {
  switch (row.kind) {
    case CreditTransactionKind.COURSE_PURCHASE:
      return '课程购买扣款成功';
    case CreditTransactionKind.NOTEBOOK_PURCHASE:
      return '笔记本购买扣款成功';
    case CreditTransactionKind.CREATOR_COURSE_SALE:
      return '课程收益到账';
    case CreditTransactionKind.CREATOR_NOTEBOOK_SALE:
      return '笔记本收益到账';
    case CreditTransactionKind.TOKEN_USAGE:
      return '模型调用已扣费';
    case CreditTransactionKind.WELCOME_BONUS:
      if (row.referenceType === 'admin_grant') return '积分已到账';
      if (row.referenceType === 'credits_backfill') return '欢迎积分已补发';
      return '欢迎积分已到账';
    default:
      return row.delta >= 0 ? '积分到账' : '积分扣费';
  }
}

function buildNotificationBody(row: CreditNotificationRow): string {
  const balanceText = `当前余额 ${row.balanceAfter} credits`;

  switch (row.kind) {
    case CreditTransactionKind.COURSE_PURCHASE:
      return `你购买课程时扣除了 ${Math.abs(row.delta)} credits，${balanceText}。`;
    case CreditTransactionKind.NOTEBOOK_PURCHASE:
      return `你购买笔记本时扣除了 ${Math.abs(row.delta)} credits，${balanceText}。`;
    case CreditTransactionKind.CREATOR_COURSE_SALE:
      return `你的课程售出后到账 ${row.delta} credits，${balanceText}。`;
    case CreditTransactionKind.CREATOR_NOTEBOOK_SALE:
      return `你的笔记本售出后到账 ${row.delta} credits，${balanceText}。`;
    case CreditTransactionKind.TOKEN_USAGE:
      return `本次模型调用扣除了 ${Math.abs(row.delta)} credits，${balanceText}。`;
    case CreditTransactionKind.WELCOME_BONUS:
      if (row.referenceType === 'admin_grant') {
        return `管理员已向你发放 ${row.delta} credits，${balanceText}。`;
      }
      if (row.referenceType === 'credits_backfill') {
        return `系统已补发 ${row.delta} credits，${balanceText}。`;
      }
      return `账户已收到 ${row.delta} credits，${balanceText}。`;
    default:
      return row.description?.trim() || balanceText;
  }
}

function buildSourceLabel(kind: CreditTransactionKind): string {
  switch (kind) {
    case CreditTransactionKind.COURSE_PURCHASE:
      return '课程购买';
    case CreditTransactionKind.NOTEBOOK_PURCHASE:
      return '笔记本购买';
    case CreditTransactionKind.CREATOR_COURSE_SALE:
      return '课程收益';
    case CreditTransactionKind.CREATOR_NOTEBOOK_SALE:
      return '笔记本收益';
    case CreditTransactionKind.TOKEN_USAGE:
      return '模型调用';
    case CreditTransactionKind.WELCOME_BONUS:
      return '系统发放';
    default:
      return '积分通知';
  }
}

function getMetadataString(
  metadata: Prisma.JsonValue | null,
  key: 'route' | 'source' | 'modelString',
): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function inferUsageContext(row: CreditNotificationRow): UsageContext {
  const route = row.referenceId?.trim() || getMetadataString(row.metadata, 'route');
  const source = getMetadataString(row.metadata, 'source');
  const fingerprint = `${route} ${source}`.toLowerCase();

  if (
    fingerprint.includes('micro-lesson') ||
    fingerprint.includes('scene-outlines') ||
    fingerprint.includes('scene-content') ||
    fingerprint.includes('scene-actions') ||
    fingerprint.includes('notebook-metadata') ||
    fingerprint.includes('slide-content') ||
    fingerprint.includes('slide-actions')
  ) {
    return { key: 'notebook_generation', label: '笔记本生成' };
  }

  if (
    fingerprint.includes('/api/chat') ||
    fingerprint.includes('send-message') ||
    fingerprint.includes('/api/pbl/chat')
  ) {
    return { key: 'chat', label: '对话' };
  }

  if (fingerprint.includes('quiz-grade')) {
    return { key: 'quiz_grade', label: '测验批改' };
  }

  if (fingerprint.includes('repair-slide-math')) {
    return { key: 'slide_repair', label: '课件修复' };
  }

  if (route) {
    return { key: `route:${route}`, label: '模型调用' };
  }

  if (source) {
    return { key: `source:${source}`, label: '模型调用' };
  }

  return { key: 'generic_llm_usage', label: '模型调用' };
}

function mapTokenUsageGroupToNotification(group: TokenUsageGroup): AppNotification {
  if (group.rows.length === 1) {
    return mapCreditTransactionToNotification(group.rows[0]);
  }

  const totalDelta = group.rows.reduce((sum, row) => sum + row.delta, 0);
  const newestRow = group.rows[0];
  const usageCount = group.rows.length;

  return {
    id: `token-usage-group:${newestRow.id}`,
    kind: 'credit_spent',
    title: `${group.context.label}共扣费`,
    body: `本次${group.context.label}触发了 ${usageCount} 次模型调用，共扣除 ${Math.abs(totalDelta)} credits，当前余额 ${newestRow.balanceAfter} credits。`,
    tone: 'negative',
    presentation: 'banner',
    amountLabel: `-${Math.abs(totalDelta)} credits`,
    delta: totalDelta,
    balanceAfter: newestRow.balanceAfter,
    sourceKind: 'TOKEN_USAGE_GROUP',
    sourceLabel: group.context.label,
    createdAt: newestRow.createdAt.toISOString(),
  };
}

function shouldAppendToTokenUsageGroup(
  group: TokenUsageGroup,
  row: CreditNotificationRow,
  context: UsageContext,
): boolean {
  if (group.context.key !== context.key) return false;
  return group.newestCreatedAt.getTime() - row.createdAt.getTime() <= TOKEN_USAGE_GROUP_WINDOW_MS;
}

export function mapCreditTransactionToNotification(row: CreditNotificationRow): AppNotification {
  const tone = row.delta >= 0 ? 'positive' : 'negative';

  return {
    id: row.id,
    kind: row.delta >= 0 ? 'credit_gain' : 'credit_spent',
    title: buildNotificationTitle(row),
    body: buildNotificationBody(row),
    tone,
    presentation: 'banner',
    amountLabel: formatDeltaLabel(row.delta),
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    sourceKind: row.kind,
    sourceLabel: buildSourceLabel(row.kind),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listUserNotifications(
  db: NotificationDbClient,
  userId: string,
  limit = 50,
): Promise<AppNotification[]> {
  const rows = await db.creditTransaction.findMany({
    where: {
      userId,
      delta: {
        not: 0,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.max(20, Math.min(limit * 6, 300)),
    select: {
      id: true,
      kind: true,
      delta: true,
      balanceAfter: true,
      description: true,
      referenceType: true,
      referenceId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const notifications: AppNotification[] = [];
  let currentTokenUsageGroup: TokenUsageGroup | null = null;

  const flushTokenUsageGroup = () => {
    if (!currentTokenUsageGroup) return;
    notifications.push(mapTokenUsageGroupToNotification(currentTokenUsageGroup));
    currentTokenUsageGroup = null;
  };

  for (const row of rows) {
    const isTokenUsageGroupCandidate =
      row.kind === CreditTransactionKind.TOKEN_USAGE && row.referenceType === 'llm_usage';

    if (!isTokenUsageGroupCandidate) {
      flushTokenUsageGroup();
      notifications.push(mapCreditTransactionToNotification(row));
      continue;
    }

    const context = inferUsageContext(row);
    if (
      currentTokenUsageGroup &&
      shouldAppendToTokenUsageGroup(currentTokenUsageGroup, row, context)
    ) {
      currentTokenUsageGroup.rows.push(row);
      continue;
    }

    flushTokenUsageGroup();
    currentTokenUsageGroup = {
      context,
      rows: [row],
      newestCreatedAt: row.createdAt,
    };
  }

  flushTokenUsageGroup();
  return notifications.slice(0, Math.max(1, Math.min(limit, 100)));
}
