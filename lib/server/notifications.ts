import {
  CreditTransactionKind,
  type CreditAccountType,
  type PrismaClient,
  type Prisma,
} from '@/lib/server/generated-prisma';
import type { AppNotification, AppNotificationDetail } from '@/lib/notifications/types';
import {
  formatComputeCreditsLabel,
  formatCashCreditsLabel,
  formatCreditsUsdCompactLabel,
  formatPurchaseCreditsLabel,
} from '@/lib/utils/credits';

type NotificationDbClient = PrismaClient | Prisma.TransactionClient;
const TOKEN_USAGE_GROUP_WINDOW_MS = 3 * 60 * 1000;
const NOTEBOOK_GENERATION_GROUP_IDLE_GAP_MS = 5 * 60 * 1000;
const CREDIT_TRANSFER_GROUP_WINDOW_MS = 15 * 1000;
const QUIZ_REWARD_GROUP_WINDOW_MS = 60 * 1000;

const NOTEBOOK_GENERATION_OPERATION_CODES = new Set([
  'notebook_metadata_generation',
  'notebook_research',
  'scene_outline_generation',
  'scene_content_generation',
  'scene_actions_generation',
  'agent_profile_generation',
  'media_image_generation',
]);

type CreditNotificationRow = {
  id: string;
  kind: CreditTransactionKind;
  accountType: CreditAccountType;
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

type NotebookGenerationGroup = {
  notebookKey: string;
  notebookLabel: string;
  rows: CreditNotificationRow[];
  newestCreatedAt: Date;
  oldestCreatedAt: Date;
};

type CreditTransferGroup = {
  kind: 'CASH_TO_COMPUTE_TRANSFER' | 'CASH_TO_PURCHASE_TRANSFER';
  rows: CreditNotificationRow[];
  newestCreatedAt: Date;
  oldestCreatedAt: Date;
};

type QuizRewardGroup = {
  referenceKey: string;
  rows: CreditNotificationRow[];
  newestCreatedAt: Date;
  oldestCreatedAt: Date;
};

type NotificationMetadata = Record<string, Prisma.JsonValue>;

function normalizeNotificationAccountType(
  accountType: CreditAccountType,
): 'CASH' | 'COMPUTE' | 'PURCHASE' {
  if (accountType === 'CASH') return 'CASH';
  if (accountType === 'PURCHASE') return 'PURCHASE';
  return 'COMPUTE';
}

const OPERATION_LABELS: Record<string, string> = {
  notebook_metadata_generation: '生成笔记本标题与简介',
  notebook_research: '为新笔记本补充联网资料',
  scene_outline_generation: '生成笔记本大纲',
  scene_content_generation: '生成页面内容',
  scene_actions_generation: '生成讲解动作',
  agent_profile_generation: '生成讲解角色',
  notebook_chat: '笔记本助手对话',
  notebook_prerequisite_search: '笔记本助手补充前置知识检索',
  slide_repair_general: '修复当前页面讲解',
  slide_repair_math: '修复当前数学页面',
  slide_repair_code: '修复当前代码页面',
  media_image_generation: '生成笔记本媒体图片',
  web_search: '联网搜索',
  quiz_grade: '测验批改',
};

function formatAccountValue(accountType: CreditAccountType, value: number): string {
  switch (accountType) {
    case 'COMPUTE':
      return formatComputeCreditsLabel(value);
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(value);
    default:
      return formatCashCreditsLabel(value);
  }
}

function formatAccountCompactValue(accountType: CreditAccountType, value: number): string {
  switch (accountType) {
    case 'COMPUTE':
      return formatComputeCreditsLabel(value);
    case 'PURCHASE':
      return formatPurchaseCreditsLabel(value);
    default:
      return formatCreditsUsdCompactLabel(value);
  }
}

function getMetadataObject(metadata: Prisma.JsonValue | null): NotificationMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata as NotificationMetadata;
}

function getMetadataString(metadata: Prisma.JsonValue | null, key: string): string {
  const object = getMetadataObject(metadata);
  if (!object) return '';
  const value = object[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getMetadataNumber(metadata: Prisma.JsonValue | null, key: string): number | null {
  const object = getMetadataObject(metadata);
  if (!object) return null;
  const value = object[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatProviderLabel(providerId: string): string {
  const normalized = providerId.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'openai-image') return 'OpenAI Image';
  if (normalized === 'anthropic') return 'Anthropic';
  if (normalized === 'google') return 'Google';
  return providerId;
}

function inferLegacyOperationCode(row: CreditNotificationRow): string {
  const route = row.referenceId?.trim() || getMetadataString(row.metadata, 'route');
  const source = getMetadataString(row.metadata, 'source');
  const fingerprint = `${route} ${source}`.toLowerCase();

  if (fingerprint.includes('scene-outlines')) return 'scene_outline_generation';
  if (fingerprint.includes('scene-content') || fingerprint.includes('slide-content')) {
    return 'scene_content_generation';
  }
  if (fingerprint.includes('scene-actions') || fingerprint.includes('slide-actions')) {
    return 'scene_actions_generation';
  }
  if (fingerprint.includes('notebook-metadata')) return 'notebook_metadata_generation';
  if (fingerprint.includes('agent-profiles')) return 'agent_profile_generation';
  if (fingerprint.includes('send-message') || fingerprint.includes('/api/chat')) {
    return 'notebook_chat';
  }
  if (fingerprint.includes('quiz-grade')) return 'quiz_grade';
  if (fingerprint.includes('repair-slide-math')) return 'slide_repair_math';
  if (fingerprint.includes('repair-slide-code')) return 'slide_repair_code';
  if (fingerprint.includes('repair-slide-general')) return 'slide_repair_general';
  if (row.referenceType === 'image_generation') return 'media_image_generation';
  if (row.referenceType === 'web_search') return 'web_search';
  return '';
}

function getOperationCode(row: CreditNotificationRow): string {
  return getMetadataString(row.metadata, 'operationCode') || inferLegacyOperationCode(row);
}

function getReasonLabel(row: CreditNotificationRow): string {
  const explicit = getMetadataString(row.metadata, 'chargeReason');
  if (explicit) return explicit;

  const operationCode = getOperationCode(row);
  if (operationCode) return OPERATION_LABELS[operationCode] || operationCode;

  if (row.referenceType === 'image_generation') return '生成媒体图片';
  if (row.referenceType === 'web_search') return '联网搜索';
  if (row.referenceType === 'llm_usage') return '模型调用';
  return '';
}

function getNotebookLabel(row: CreditNotificationRow): string {
  return (
    getMetadataString(row.metadata, 'notebookName') || getMetadataString(row.metadata, 'notebookId')
  );
}

function getCourseLabel(row: CreditNotificationRow): string {
  return (
    getMetadataString(row.metadata, 'courseName') || getMetadataString(row.metadata, 'courseId')
  );
}

function getSceneLabel(row: CreditNotificationRow): string {
  const sceneTitle = getMetadataString(row.metadata, 'sceneTitle');
  const sceneOrder = getMetadataNumber(row.metadata, 'sceneOrder');
  if (sceneOrder && sceneTitle) return `第 ${sceneOrder} 页 · ${sceneTitle}`;
  if (sceneOrder) return `第 ${sceneOrder} 页`;
  return sceneTitle;
}

function getModelLabel(row: CreditNotificationRow): string {
  const modelString = getMetadataString(row.metadata, 'modelString');
  if (modelString) return modelString;

  const providerId = getMetadataString(row.metadata, 'providerId');
  const modelId = getMetadataString(row.metadata, 'modelId');
  if (providerId && modelId) return `${providerId}:${modelId}`;
  return modelId;
}

function getServiceLabel(row: CreditNotificationRow): string {
  const explicit = getMetadataString(row.metadata, 'serviceLabel');
  if (explicit) return explicit;

  if (row.referenceType === 'web_search') return 'Tavily Web Search';
  if (row.referenceType === 'image_generation') {
    const providerLabel = formatProviderLabel(getMetadataString(row.metadata, 'providerId'));
    return providerLabel ? `${providerLabel} API` : 'Image Generation API';
  }
  if (row.referenceType === 'llm_usage') {
    const providerLabel = formatProviderLabel(getMetadataString(row.metadata, 'providerId'));
    return providerLabel ? `${providerLabel} LLM API` : 'LLM API';
  }
  return '';
}

function buildSourceLabel(row: CreditNotificationRow): string {
  switch (row.kind) {
    case CreditTransactionKind.COURSE_PURCHASE:
      return '课程购买';
    case CreditTransactionKind.NOTEBOOK_PURCHASE:
      return '笔记本购买';
    case CreditTransactionKind.CREATOR_COURSE_SALE:
      return '课程收益';
    case CreditTransactionKind.CREATOR_NOTEBOOK_SALE:
      return '笔记本收益';
    case CreditTransactionKind.TOKEN_USAGE:
      return getReasonLabel(row) || '模型调用';
    case CreditTransactionKind.CASH_TO_COMPUTE_TRANSFER:
      return row.accountType === 'CASH' ? '转出至算力积分' : '转入算力积分';
    case CreditTransactionKind.CASH_TO_PURCHASE_TRANSFER:
      return row.accountType === 'CASH' ? '转出至购买积分' : '转入购买积分';
    case CreditTransactionKind.LESSON_REWARD:
      return '看课奖励';
    case CreditTransactionKind.QUIZ_COMPLETION_REWARD:
      return '做题奖励';
    case CreditTransactionKind.QUIZ_ACCURACY_BONUS:
      return '高正确率奖励';
    case CreditTransactionKind.REVIEW_REWARD:
      return '错题回顾奖励';
    case CreditTransactionKind.DAILY_TASK_REWARD:
      return '日常任务奖励';
    case CreditTransactionKind.STREAK_BONUS:
      return '连续学习奖励';
    case CreditTransactionKind.CHARACTER_UNLOCK_SPEND:
      return '角色解锁';
    case CreditTransactionKind.AVATAR_UNLOCK_SPEND:
      return '头像收藏解锁';
    case CreditTransactionKind.WELCOME_BONUS:
      if (row.referenceType === 'stripe_top_up') return 'Stripe 充值';
      return '系统发放';
    default:
      return '积分通知';
  }
}

function buildSourceKind(row: CreditNotificationRow): string {
  if (
    row.kind === CreditTransactionKind.WELCOME_BONUS &&
    row.referenceType === 'gamification_daily_sign_in'
  ) {
    return 'DAILY_SIGN_IN_REWARD';
  }
  return row.kind;
}

function buildNotificationDetails(row: CreditNotificationRow): AppNotificationDetail[] {
  const details: AppNotificationDetail[] = [];
  const notebookLabel = getNotebookLabel(row);
  const sceneLabel = getSceneLabel(row);
  const courseLabel = getCourseLabel(row);
  const modelLabel = getModelLabel(row);
  const serviceLabel = getServiceLabel(row);
  const reasonLabel = getReasonLabel(row);

  if (notebookLabel) details.push({ key: 'notebook', label: '笔记本', value: notebookLabel });
  if (sceneLabel) details.push({ key: 'scene', label: '页面', value: sceneLabel });
  if (courseLabel && !notebookLabel)
    details.push({ key: 'course', label: '课程', value: courseLabel });
  if (modelLabel) details.push({ key: 'model', label: '模型', value: modelLabel });
  if (serviceLabel) details.push({ key: 'service', label: '服务', value: serviceLabel });
  if (reasonLabel) details.push({ key: 'reason', label: '原因', value: reasonLabel });

  return details;
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
    case CreditTransactionKind.TOKEN_USAGE: {
      const reasonLabel = getReasonLabel(row);
      return `${reasonLabel || '模型调用'}已扣费`;
    }
    case CreditTransactionKind.CASH_TO_COMPUTE_TRANSFER:
      return row.accountType === 'CASH' ? '现金积分已转出' : '算力积分已到账';
    case CreditTransactionKind.CASH_TO_PURCHASE_TRANSFER:
      return row.accountType === 'CASH' ? '现金积分已转出' : '购买积分已到账';
    case CreditTransactionKind.LESSON_REWARD:
      return '看课奖励已到账';
    case CreditTransactionKind.QUIZ_COMPLETION_REWARD:
      return '做题奖励已到账';
    case CreditTransactionKind.QUIZ_ACCURACY_BONUS:
      return '高正确率奖励已到账';
    case CreditTransactionKind.REVIEW_REWARD:
      return '错题回顾奖励已到账';
    case CreditTransactionKind.DAILY_TASK_REWARD:
      return '日常任务奖励已到账';
    case CreditTransactionKind.STREAK_BONUS:
      return '连续学习奖励已到账';
    case CreditTransactionKind.CHARACTER_UNLOCK_SPEND:
      return '陪伴角色已解锁';
    case CreditTransactionKind.AVATAR_UNLOCK_SPEND:
      return '头像收藏已解锁';
    case CreditTransactionKind.WELCOME_BONUS:
      if (row.referenceType === 'stripe_top_up') return '充值积分已到账';
      if (row.referenceType === 'admin_grant') return '积分已到账';
      if (row.referenceType === 'credits_backfill') return '欢迎积分已补发';
      return '欢迎积分已到账';
    default:
      return row.delta >= 0 ? '积分到账' : '积分扣费';
  }
}

function buildNotificationBody(row: CreditNotificationRow): string {
  const balanceText = `当前余额 ${formatAccountValue(row.accountType, row.balanceAfter)}`;

  switch (row.kind) {
    case CreditTransactionKind.COURSE_PURCHASE:
      return `你购买课程时扣除了 ${formatAccountValue(row.accountType, Math.abs(row.delta))}，${balanceText}。`;
    case CreditTransactionKind.NOTEBOOK_PURCHASE:
      return `你购买笔记本时扣除了 ${formatAccountValue(row.accountType, Math.abs(row.delta))}，${balanceText}。`;
    case CreditTransactionKind.CREATOR_COURSE_SALE:
      return `你的课程售出后到账 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.CREATOR_NOTEBOOK_SALE:
      return `你的笔记本售出后到账 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.TOKEN_USAGE: {
      const notebookLabel = getNotebookLabel(row);
      const courseLabel = getCourseLabel(row);
      const sceneLabel = getSceneLabel(row);
      const reasonLabel = getReasonLabel(row) || '模型调用';
      const modelLabel = getModelLabel(row);
      const serviceLabel = getServiceLabel(row);
      const target = notebookLabel
        ? `笔记本《${notebookLabel}》`
        : courseLabel
          ? `课程《${courseLabel}》`
          : sceneLabel
            ? `当前页面`
            : '本次调用';
      const sceneSuffix = notebookLabel && sceneLabel ? `的 ${sceneLabel}` : '';
      const serviceAndModel = [serviceLabel, modelLabel].filter(Boolean).join(' / ');
      return `${target}${sceneSuffix}在${reasonLabel}时${serviceAndModel ? `使用 ${serviceAndModel} ` : ''}扣除了 ${formatAccountValue(row.accountType, Math.abs(row.delta))}，${balanceText}。`;
    }
    case CreditTransactionKind.CASH_TO_COMPUTE_TRANSFER:
      return row.accountType === 'CASH'
        ? `你已转出 ${formatAccountValue(row.accountType, Math.abs(row.delta))} 到算力积分，${balanceText}。`
        : `你已收到 ${formatAccountValue(row.accountType, row.delta)}，来源为现金积分转换，${balanceText}。`;
    case CreditTransactionKind.CASH_TO_PURCHASE_TRANSFER:
      return row.accountType === 'CASH'
        ? `你已转出 ${formatAccountValue(row.accountType, Math.abs(row.delta))} 到购买积分，${balanceText}。`
        : `你已收到 ${formatAccountValue(row.accountType, row.delta)}，来源为现金积分转换，${balanceText}。`;
    case CreditTransactionKind.LESSON_REWARD:
      return `你完成课程学习里程碑后获得了 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.QUIZ_COMPLETION_REWARD:
      return `你完成一组题后获得了 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.QUIZ_ACCURACY_BONUS:
      return `这次做题正确率达标，额外获得了 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.REVIEW_REWARD:
      return `你回顾错题后获得了 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.DAILY_TASK_REWARD:
      return `你完成了今日任务清单，获得 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.STREAK_BONUS:
      return `连续学习奖励已到账 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    case CreditTransactionKind.CHARACTER_UNLOCK_SPEND:
      return `你花费 ${formatAccountValue(row.accountType, Math.abs(row.delta))} 解锁了新的陪伴角色，${balanceText}。`;
    case CreditTransactionKind.AVATAR_UNLOCK_SPEND:
      return `你花费 ${formatAccountValue(row.accountType, Math.abs(row.delta))} 解锁了新的头像收藏，${balanceText}。`;
    case CreditTransactionKind.WELCOME_BONUS:
      if (row.referenceType === 'stripe_top_up') {
        const packTitle = getMetadataString(row.metadata, 'packTitle');
        return `你通过 Stripe${packTitle ? ` 购买 ${packTitle}` : ''}到账 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
      }
      if (row.referenceType === 'admin_grant') {
        return `管理员已向你发放 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
      }
      if (row.referenceType === 'credits_backfill') {
        return `系统已补发 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
      }
      return `账户已收到 ${formatAccountValue(row.accountType, row.delta)}，${balanceText}。`;
    default:
      return row.description?.trim() || balanceText;
  }
}

function inferUsageContext(row: CreditNotificationRow): UsageContext {
  const operationCode = getOperationCode(row);
  const notebookKey =
    getMetadataString(row.metadata, 'notebookId') ||
    getMetadataString(row.metadata, 'notebookName');
  const sceneKey =
    getMetadataString(row.metadata, 'sceneId') ||
    `${getMetadataNumber(row.metadata, 'sceneOrder') ?? ''}:${getMetadataString(row.metadata, 'sceneTitle')}`;
  const modelKey = getModelLabel(row).toLowerCase();
  const serviceKey = getServiceLabel(row).toLowerCase();
  const routeKey = (
    row.referenceId?.trim() || getMetadataString(row.metadata, 'route')
  ).toLowerCase();
  const sourceKey = getMetadataString(row.metadata, 'source').toLowerCase();

  return {
    key: [operationCode, notebookKey, sceneKey, modelKey, serviceKey, routeKey, sourceKey]
      .filter(Boolean)
      .join('|'),
    label: getReasonLabel(row) || '模型调用',
  };
}

function getNotebookKey(row: CreditNotificationRow): string {
  return getMetadataString(row.metadata, 'notebookId') || getMetadataString(row.metadata, 'notebookName');
}

function isNotebookGenerationGroupCandidate(row: CreditNotificationRow): boolean {
  if (row.kind !== CreditTransactionKind.TOKEN_USAGE) return false;

  const notebookKey = getNotebookKey(row);
  if (!notebookKey) return false;

  const operationCode = getOperationCode(row);
  return NOTEBOOK_GENERATION_OPERATION_CODES.has(operationCode);
}

function summarizeOperationLabels(rows: CreditNotificationRow[]): string {
  const labels = Array.from(
    new Set(
      rows
        .map((row) => getReasonLabel(row))
        .filter((label): label is string => Boolean(label)),
    ),
  );

  if (labels.length <= 3) return labels.join('、');
  return `${labels.slice(0, 3).join('、')} 等 ${labels.length} 项`;
}

function buildNotebookGenerationDetails(group: NotebookGenerationGroup): AppNotificationDetail[] {
  const newestRow = group.rows[0];
  const details: AppNotificationDetail[] = [];
  const notebookLabel = getNotebookLabel(newestRow) || group.notebookLabel;
  const courseLabel = getCourseLabel(newestRow);
  const stageSummary = summarizeOperationLabels(group.rows);

  if (notebookLabel) details.push({ key: 'notebook', label: '笔记本', value: notebookLabel });
  if (courseLabel) details.push({ key: 'course', label: '课程', value: courseLabel });
  if (stageSummary) details.push({ key: 'stages', label: '生成阶段', value: stageSummary });

  return details;
}

function mapNotebookGenerationGroupToNotification(group: NotebookGenerationGroup): AppNotification {
  if (group.rows.length === 1) {
    return mapCreditTransactionToNotification(group.rows[0]);
  }

  const newestRow = group.rows[0];
  const totalDelta = group.rows.reduce((sum, row) => sum + row.delta, 0);
  const usageCount = group.rows.length;
  const stageSummary = summarizeOperationLabels(group.rows);

  return {
    id: `notebook-generation-group:${newestRow.id}`,
    kind: 'credit_spent',
    title: '笔记本生成共扣费',
    body: `笔记本《${group.notebookLabel}》这次生成我帮你合并记成一笔了。共触发 ${usageCount} 次生成调用${stageSummary ? `，涵盖 ${stageSummary}` : ''}，总计消耗 ${formatAccountValue(
      newestRow.accountType,
      Math.abs(totalDelta),
    )}，当前余额 ${formatAccountValue(newestRow.accountType, newestRow.balanceAfter)}。`,
    tone: 'negative',
    presentation: 'banner',
    amountLabel: `-${formatAccountCompactValue(newestRow.accountType, Math.abs(totalDelta))}`,
    delta: totalDelta,
    balanceAfter: newestRow.balanceAfter,
    accountType: normalizeNotificationAccountType(newestRow.accountType),
    sourceKind: 'NOTEBOOK_GENERATION_GROUP',
    sourceLabel: '笔记本生成',
    createdAt: newestRow.createdAt.toISOString(),
    details: buildNotebookGenerationDetails(group),
  };
}

function mapTokenUsageGroupToNotification(group: TokenUsageGroup): AppNotification {
  if (group.rows.length === 1) {
    return mapCreditTransactionToNotification(group.rows[0]);
  }

  const totalDelta = group.rows.reduce((sum, row) => sum + row.delta, 0);
  const newestRow = group.rows[0];
  const usageCount = group.rows.length;
  const details = buildNotificationDetails(newestRow);
  const notebookLabel = getNotebookLabel(newestRow);
  const sceneLabel = getSceneLabel(newestRow);
  const serviceAndModel = [getServiceLabel(newestRow), getModelLabel(newestRow)]
    .filter(Boolean)
    .join(' / ');
  const target = notebookLabel
    ? `笔记本《${notebookLabel}》`
    : sceneLabel
      ? `页面 ${sceneLabel}`
      : '本次操作';

  return {
    id: `token-usage-group:${newestRow.id}`,
    kind: 'credit_spent',
    title: `${group.context.label}共扣费`,
    body: `${target}在${group.context.label}时触发了 ${usageCount} 次${serviceAndModel ? ` ${serviceAndModel}` : ''}调用，共扣除 ${formatAccountValue(
      newestRow.accountType,
      Math.abs(totalDelta),
    )}，当前余额 ${formatAccountValue(newestRow.accountType, newestRow.balanceAfter)}。`,
    tone: 'negative',
    presentation: 'banner',
    amountLabel: `-${formatAccountCompactValue(newestRow.accountType, Math.abs(totalDelta))}`,
    delta: totalDelta,
    balanceAfter: newestRow.balanceAfter,
    accountType: normalizeNotificationAccountType(newestRow.accountType),
    sourceKind: 'TOKEN_USAGE_GROUP',
    sourceLabel: group.context.label,
    createdAt: newestRow.createdAt.toISOString(),
    details,
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

function shouldAppendToNotebookGenerationGroup(
  group: NotebookGenerationGroup,
  row: CreditNotificationRow,
): boolean {
  if (group.notebookKey !== getNotebookKey(row)) return false;
  return group.oldestCreatedAt.getTime() - row.createdAt.getTime() <= NOTEBOOK_GENERATION_GROUP_IDLE_GAP_MS;
}

function isCreditTransferKind(
  kind: CreditTransactionKind,
): kind is 'CASH_TO_COMPUTE_TRANSFER' | 'CASH_TO_PURCHASE_TRANSFER' {
  return (
    kind === CreditTransactionKind.CASH_TO_COMPUTE_TRANSFER ||
    kind === CreditTransactionKind.CASH_TO_PURCHASE_TRANSFER
  );
}

function shouldAppendToCreditTransferGroup(
  group: CreditTransferGroup,
  row: CreditNotificationRow,
): boolean {
  if (group.kind !== row.kind) return false;
  const previousAmount = Math.abs(group.rows[group.rows.length - 1]?.delta ?? 0);
  if (previousAmount <= 0 || Math.abs(row.delta) <= 0) return false;
  if (previousAmount !== Math.abs(row.delta)) return false;
  return group.oldestCreatedAt.getTime() - row.createdAt.getTime() <= CREDIT_TRANSFER_GROUP_WINDOW_MS;
}

function mapCreditTransferGroupToNotification(group: CreditTransferGroup): AppNotification {
  if (group.rows.length === 1) {
    return mapCreditTransactionToNotification(group.rows[0]);
  }

  const preferredRow =
    group.rows.find((row) => row.delta < 0 && row.accountType === 'CASH') ??
    group.rows.find((row) => row.delta < 0) ??
    group.rows.find((row) => row.delta > 0 && row.accountType !== 'CASH') ??
    group.rows[0];
  const base = mapCreditTransactionToNotification(preferredRow);

  return {
    ...base,
    id: `credit-transfer-group:${preferredRow.id}`,
    createdAt: group.newestCreatedAt.toISOString(),
  };
}

function isQuizRewardKind(
  kind: CreditTransactionKind,
): kind is 'QUIZ_COMPLETION_REWARD' | 'QUIZ_ACCURACY_BONUS' {
  return (
    kind === CreditTransactionKind.QUIZ_COMPLETION_REWARD ||
    kind === CreditTransactionKind.QUIZ_ACCURACY_BONUS
  );
}

function getQuizReferenceKey(row: CreditNotificationRow): string {
  return getMetadataString(row.metadata, 'referenceKey') || row.referenceId?.trim() || '';
}

function shouldAppendToQuizRewardGroup(group: QuizRewardGroup, row: CreditNotificationRow): boolean {
  if (!isQuizRewardKind(row.kind)) return false;
  if (group.referenceKey !== getQuizReferenceKey(row)) return false;
  return group.oldestCreatedAt.getTime() - row.createdAt.getTime() <= QUIZ_REWARD_GROUP_WINDOW_MS;
}

function mapQuizRewardGroupToNotification(group: QuizRewardGroup): AppNotification {
  if (group.rows.length === 1) {
    return mapCreditTransactionToNotification(group.rows[0]);
  }

  const newestRow = group.rows[0];
  const totalDelta = group.rows.reduce((sum, row) => sum + row.delta, 0);
  const hasAccuracyBonus = group.rows.some(
    (row) => row.kind === CreditTransactionKind.QUIZ_ACCURACY_BONUS,
  );
  const details = buildNotificationDetails(newestRow);
  const base = mapCreditTransactionToNotification(newestRow);

  return {
    ...base,
    id: `quiz-reward-group:${newestRow.id}`,
    title: hasAccuracyBonus ? '测验奖励（含正确率加成）已到账' : '测验奖励已到账',
    body: hasAccuracyBonus
      ? `测验完成奖励与正确率加成已合并到账，共 ${formatAccountValue(
          newestRow.accountType,
          totalDelta,
        )}，当前余额 ${formatAccountValue(newestRow.accountType, newestRow.balanceAfter)}。`
      : `测验奖励已到账 ${formatAccountValue(newestRow.accountType, totalDelta)}，当前余额 ${formatAccountValue(
          newestRow.accountType,
          newestRow.balanceAfter,
        )}。`,
    amountLabel: `+${formatAccountCompactValue(newestRow.accountType, Math.abs(totalDelta))}`,
    delta: totalDelta,
    sourceKind: hasAccuracyBonus ? 'QUIZ_REWARD_GROUP' : newestRow.kind,
    sourceLabel: hasAccuracyBonus ? '测验奖励（合并）' : base.sourceLabel,
    createdAt: group.newestCreatedAt.toISOString(),
    details,
  };
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
    amountLabel: `${row.delta > 0 ? '+' : row.delta < 0 ? '-' : ''}${formatAccountCompactValue(
      row.accountType,
      Math.abs(row.delta),
    )}`,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    sourceKind: buildSourceKind(row),
    accountType: normalizeNotificationAccountType(row.accountType),
    sourceLabel: buildSourceLabel(row),
    createdAt: row.createdAt.toISOString(),
    details: buildNotificationDetails(row),
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
      accountType: {
        in: ['CASH', 'COMPUTE', 'PURCHASE'],
      },
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
      accountType: true,
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
  let currentNotebookGenerationGroup: NotebookGenerationGroup | null = null;
  let currentCreditTransferGroup: CreditTransferGroup | null = null;
  let currentQuizRewardGroup: QuizRewardGroup | null = null;

  const flushTokenUsageGroup = () => {
    if (!currentTokenUsageGroup) return;
    notifications.push(mapTokenUsageGroupToNotification(currentTokenUsageGroup));
    currentTokenUsageGroup = null;
  };

  const flushNotebookGenerationGroup = () => {
    if (!currentNotebookGenerationGroup) return;
    notifications.push(mapNotebookGenerationGroupToNotification(currentNotebookGenerationGroup));
    currentNotebookGenerationGroup = null;
  };

  const flushCreditTransferGroup = () => {
    if (!currentCreditTransferGroup) return;
    notifications.push(mapCreditTransferGroupToNotification(currentCreditTransferGroup));
    currentCreditTransferGroup = null;
  };

  const flushQuizRewardGroup = () => {
    if (!currentQuizRewardGroup) return;
    notifications.push(mapQuizRewardGroupToNotification(currentQuizRewardGroup));
    currentQuizRewardGroup = null;
  };

  for (const row of rows) {
    if (isQuizRewardKind(row.kind) && getQuizReferenceKey(row)) {
      flushTokenUsageGroup();
      flushNotebookGenerationGroup();
      flushCreditTransferGroup();

      if (currentQuizRewardGroup && shouldAppendToQuizRewardGroup(currentQuizRewardGroup, row)) {
        currentQuizRewardGroup.rows.push(row);
        currentQuizRewardGroup.oldestCreatedAt = row.createdAt;
        continue;
      }

      flushQuizRewardGroup();
      currentQuizRewardGroup = {
        referenceKey: getQuizReferenceKey(row),
        rows: [row],
        newestCreatedAt: row.createdAt,
        oldestCreatedAt: row.createdAt,
      };
      continue;
    }

    flushQuizRewardGroup();

    if (isCreditTransferKind(row.kind)) {
      flushTokenUsageGroup();
      flushNotebookGenerationGroup();

      if (
        currentCreditTransferGroup &&
        shouldAppendToCreditTransferGroup(currentCreditTransferGroup, row)
      ) {
        currentCreditTransferGroup.rows.push(row);
        currentCreditTransferGroup.oldestCreatedAt = row.createdAt;
        continue;
      }

      flushCreditTransferGroup();
      currentCreditTransferGroup = {
        kind: row.kind,
        rows: [row],
        newestCreatedAt: row.createdAt,
        oldestCreatedAt: row.createdAt,
      };
      continue;
    }

    flushCreditTransferGroup();

    if (isNotebookGenerationGroupCandidate(row)) {
      flushTokenUsageGroup();

      if (
        currentNotebookGenerationGroup &&
        shouldAppendToNotebookGenerationGroup(currentNotebookGenerationGroup, row)
      ) {
        currentNotebookGenerationGroup.rows.push(row);
        currentNotebookGenerationGroup.oldestCreatedAt = row.createdAt;
        continue;
      }

      flushNotebookGenerationGroup();
      currentNotebookGenerationGroup = {
        notebookKey: getNotebookKey(row),
        notebookLabel: getNotebookLabel(row) || getNotebookKey(row),
        rows: [row],
        newestCreatedAt: row.createdAt,
        oldestCreatedAt: row.createdAt,
      };
      continue;
    }

    const isTokenUsageGroupCandidate =
      row.kind === CreditTransactionKind.TOKEN_USAGE && row.referenceType === 'llm_usage';

    if (!isTokenUsageGroupCandidate) {
      flushTokenUsageGroup();
      flushNotebookGenerationGroup();
      notifications.push(mapCreditTransactionToNotification(row));
      continue;
    }

    flushNotebookGenerationGroup();
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
  flushNotebookGenerationGroup();
  flushCreditTransferGroup();
  flushQuizRewardGroup();
  return notifications.slice(0, Math.max(1, Math.min(limit, 100)));
}
