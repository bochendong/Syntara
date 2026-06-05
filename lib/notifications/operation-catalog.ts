export type NotificationSurface =
  | 'toast'
  | 'notification-banner'
  | 'notification-feed'
  | 'confirm-dialog';

export type NotificationOutcome = 'success' | 'error' | 'info' | 'warning' | 'loading' | 'message';

export type NotificationOperationDomain =
  | 'admin'
  | 'audio'
  | 'commerce'
  | 'course'
  | 'credits'
  | 'editor'
  | 'export'
  | 'generation'
  | 'gamification'
  | 'problem-bank'
  | 'profile'
  | 'review'
  | 'settings'
  | 'stage'
  | 'study-companion'
  | 'whiteboard';

export interface NotificationOperation {
  id: string;
  domain: NotificationOperationDomain;
  label: string;
  trigger: string;
  surfaces: readonly NotificationSurface[];
  outcomes: readonly NotificationOutcome[];
  sourceFiles: readonly string[];
  notes?: string;
}

export type NotificationCenterTransactionKind =
  | 'WELCOME_BONUS'
  | 'COURSE_PURCHASE'
  | 'NOTEBOOK_PURCHASE'
  | 'CREATOR_COURSE_SALE'
  | 'CREATOR_NOTEBOOK_SALE'
  | 'TOKEN_USAGE'
  | 'CASH_TO_COMPUTE_TRANSFER'
  | 'CASH_TO_PURCHASE_TRANSFER'
  | 'LESSON_REWARD'
  | 'QUIZ_COMPLETION_REWARD'
  | 'QUIZ_ACCURACY_BONUS'
  | 'REVIEW_REWARD'
  | 'DAILY_TASK_REWARD'
  | 'STREAK_BONUS'
  | 'CHARACTER_UNLOCK_SPEND'
  | 'AVATAR_UNLOCK_SPEND'
  | 'GACHA_DRAW_SPEND'
  | 'NOTEBOOK_GENERATION_USAGE'
  | 'LOW_BALANCE'
  | 'NOTEBOOK_GENERATION_GROUP'
  | 'TOKEN_USAGE_GROUP'
  | 'QUIZ_REWARD_GROUP'
  | 'CREDIT_TRANSFER_GROUP';

export interface NotificationCenterTransactionSource {
  kind: NotificationCenterTransactionKind;
  label: string;
  trigger: string;
  surfaces: readonly Extract<NotificationSurface, 'notification-banner' | 'notification-feed'>[];
}

export const NOTIFICATION_CENTER_TRANSACTION_SOURCES: readonly NotificationCenterTransactionSource[] =
  [
    {
      kind: 'WELCOME_BONUS',
      label: '欢迎/充值/管理员发放积分',
      trigger: '系统欢迎积分、Stripe 充值到账、管理员发放或历史补发。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'COURSE_PURCHASE',
      label: '课程购买扣费',
      trigger: '用户购买商城课程。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'NOTEBOOK_PURCHASE',
      label: '笔记本购买扣费',
      trigger: '用户购买商城笔记本。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'CREATOR_COURSE_SALE',
      label: '课程创作者收益',
      trigger: '已发布课程被其他用户购买。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'CREATOR_NOTEBOOK_SALE',
      label: '笔记本创作者收益',
      trigger: '已发布笔记本被其他用户购买。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'TOKEN_USAGE',
      label: '模型/搜索/图片生成扣费',
      trigger: 'LLM、联网搜索、图片生成、页面修复、测验批改等计费调用完成。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'CASH_TO_COMPUTE_TRANSFER',
      label: '现金积分转算力积分',
      trigger: '用户把现金积分转换为算力积分。',
      surfaces: ['notification-banner', 'notification-feed'],
    },
    {
      kind: 'CASH_TO_PURCHASE_TRANSFER',
      label: '现金积分转购买积分',
      trigger: '用户把现金积分转换为购买积分。',
      surfaces: ['notification-banner', 'notification-feed'],
    },
    {
      kind: 'LESSON_REWARD',
      label: '看课奖励',
      trigger: '用户完成课程学习里程碑。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'QUIZ_COMPLETION_REWARD',
      label: '做题完成奖励',
      trigger: '用户完成一组题目。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'QUIZ_ACCURACY_BONUS',
      label: '测验正确率加成',
      trigger: '用户测验正确率达到奖励条件。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'REVIEW_REWARD',
      label: '错题回顾奖励',
      trigger: '用户完成错题回顾。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'DAILY_TASK_REWARD',
      label: '日常任务奖励',
      trigger: '用户完成每日任务。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'STREAK_BONUS',
      label: '连续学习奖励',
      trigger: '用户达成连续学习条件。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'CHARACTER_UNLOCK_SPEND',
      label: '角色解锁扣费',
      trigger: '用户花费奖励币解锁陪伴角色。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'AVATAR_UNLOCK_SPEND',
      label: '头像收藏解锁扣费',
      trigger: '用户花费奖励币解锁头像或外观收藏。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'GACHA_DRAW_SPEND',
      label: '抽卡扣费',
      trigger: '用户花费奖励币进行抽卡。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'NOTEBOOK_GENERATION_USAGE',
      label: '旧版笔记本生成扣费',
      trigger: '历史数据中的旧版笔记本生成计费流水。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'LOW_BALANCE',
      label: '低余额提醒',
      trigger: '算力积分或奖励币低于阈值。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'NOTEBOOK_GENERATION_GROUP',
      label: '笔记本生成合并扣费',
      trigger: '一次笔记本生成中的多段计费流水被合并展示。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'TOKEN_USAGE_GROUP',
      label: '短时间模型调用合并扣费',
      trigger: '相同上下文内多次模型调用被合并展示。',
      surfaces: ['notification-feed'],
    },
    {
      kind: 'QUIZ_REWARD_GROUP',
      label: '测验奖励合并到账',
      trigger: '测验完成奖励与正确率加成被合并展示。',
      surfaces: ['notification-banner'],
    },
    {
      kind: 'CREDIT_TRANSFER_GROUP',
      label: '积分转换合并展示',
      trigger: '现金转出与目标账户转入两条流水被合并展示。',
      surfaces: ['notification-banner', 'notification-feed'],
    },
  ];

// Living inventory for product actions that can surface a toast, app banner,
// notification-center item, or native confirmation prompt.
export const NOTIFICATION_OPERATION_CATALOG: readonly NotificationOperation[] = [
  {
    id: 'commerce.store-course-copy',
    domain: 'commerce',
    label: '商城课程加入/购买',
    trigger: '用户从商城加入免费或付费共享课程、购买单个笔记本或提交课程评价。',
    surfaces: ['toast', 'notification-banner', 'notification-feed'],
    outcomes: ['success', 'error'],
    sourceFiles: ['app/store/courses/page.tsx', 'app/store/courses/[id]/page.tsx'],
    notes: '购买和收益类积分流水还会进入通知中心。',
  },
  {
    id: 'commerce.notebook-move-from-store',
    domain: 'commerce',
    label: '商城笔记本移动到课程',
    trigger: '用户把购买得到的笔记本移动到指定课程。',
    surfaces: ['toast', 'confirm-dialog'],
    outcomes: ['success', 'error'],
    sourceFiles: ['app/store/page.tsx', 'app/course/[id]/page.tsx'],
  },
  {
    id: 'course.management',
    domain: 'course',
    label: '课程与笔记本管理',
    trigger: '用户删除课程/笔记本、发布/取消发布、更新笔记本信息或处理发布限制。',
    surfaces: ['toast', 'confirm-dialog'],
    outcomes: ['success', 'error', 'info'],
    sourceFiles: ['app/my-courses/page.tsx', 'app/course/[id]/page.tsx'],
  },
  {
    id: 'course.materials',
    domain: 'course',
    label: '课程资料管理',
    trigger: '用户读取、上传、下载或删除课程资料。',
    surfaces: ['toast', 'confirm-dialog'],
    outcomes: ['success', 'error'],
    sourceFiles: ['components/courses/course-materials-panel.tsx'],
  },
  {
    id: 'generation.notebook-create',
    domain: 'generation',
    label: '笔记本创建队列',
    trigger: '用户从创建页提交生成任务、取消任务，或后台任务完成/失败。',
    surfaces: ['toast', 'notification-banner'],
    outcomes: ['success', 'error', 'info'],
    sourceFiles: [
      'components/create/create-notebook-composer.tsx',
      'components/chat/chat-page-client.tsx',
    ],
  },
  {
    id: 'generation.classroom-resume-media-sync',
    domain: 'generation',
    label: '课堂生成续跑、媒体生成与同步',
    trigger: '用户继续生成未完成页面、为当前页补图、取消排队生成或同步发布者更新。',
    surfaces: ['toast', 'confirm-dialog'],
    outcomes: ['success', 'error', 'info'],
    sourceFiles: ['app/classroom/[id]/page.tsx'],
  },
  {
    id: 'stage.ask-and-discussion',
    domain: 'stage',
    label: '舞台问答与侧栏语音',
    trigger: '用户向课堂侧栏提问、播放侧栏语音回复或模型配置缺失。',
    surfaces: ['toast'],
    outcomes: ['error', 'warning'],
    sourceFiles: ['components/stage.tsx', 'components/stage/scene-sidebar.tsx'],
  },
  {
    id: 'stage.playback-and-speech',
    domain: 'audio',
    label: '播放与语音合成',
    trigger: '用户播放讲解、批量合成语音、试听讲解或遇到 TTS/浏览器音频限制。',
    surfaces: ['toast'],
    outcomes: ['success', 'error', 'info', 'loading', 'message'],
    sourceFiles: [
      'components/stage.tsx',
      'components/header.tsx',
      'components/stage/slide-narration-editor.tsx',
      'components/audio/speech-button.tsx',
      'components/audio/tts-config-popover.tsx',
      'components/gamification/live2d-companion-data.ts',
      'components/roundtable/index.tsx',
    ],
  },
  {
    id: 'stage.slide-repair-and-rerender',
    domain: 'editor',
    label: '幻灯片修复、重排与重新渲染',
    trigger: '用户执行 Grid/Layout Cards 重排、AI 修复、回滚修复或 Notebook LaTeX 重新渲染。',
    surfaces: ['toast'],
    outcomes: ['success', 'error', 'info'],
    sourceFiles: ['components/stage.tsx', 'components/stage/use-slide-repair.ts'],
  },
  {
    id: 'stage.element-and-media-editing',
    domain: 'editor',
    label: '元素编辑与媒体插入',
    trigger: '用户创建形状、添加图片、等待字体加载或调用未实现的画布操作。',
    surfaces: ['toast'],
    outcomes: ['error', 'info', 'warning'],
    sourceFiles: [
      'components/stage/slide-element-inspector.tsx',
      'components/slide-renderer/Editor/Canvas/ShapeCreateCanvas.tsx',
      'components/slide-renderer/components/element/ProsemirrorEditor.tsx',
      'lib/hooks/use-canvas-operations.ts',
      'components/generation/media-popover.tsx',
    ],
  },
  {
    id: 'export.pptx',
    domain: 'export',
    label: 'PPTX 导出',
    trigger: '用户导出当前课程/笔记本为 PPTX。',
    surfaces: ['toast'],
    outcomes: ['success', 'error'],
    sourceFiles: ['lib/export/use-export-pptx.ts', 'components/header.tsx'],
  },
  {
    id: 'problem-bank.practice',
    domain: 'problem-bank',
    label: '题库练习',
    trigger: '用户加载题目/作答记录、提交答案、运行公开测试或删除题目。',
    surfaces: ['toast', 'notification-banner', 'confirm-dialog'],
    outcomes: ['success', 'error'],
    sourceFiles: [
      'components/problem-bank/problem-bank-view.tsx',
      'components/problem-bank/course-problem-bank-view.tsx',
      'components/problem-bank/problem-edit-dialog.tsx',
    ],
  },
  {
    id: 'problem-bank.import-and-edit',
    domain: 'problem-bank',
    label: '题库导入与编辑',
    trigger: '用户生成导入预览、编辑 JSON 草稿、保存草稿表单、提交导入或上传照片答案。',
    surfaces: ['toast'],
    outcomes: ['success', 'error'],
    sourceFiles: [
      'components/problem-bank/problem-bank-view.tsx',
      'components/problem-bank/course-problem-bank-view.tsx',
      'components/problem-bank/problem-edit-dialog.tsx',
    ],
  },
  {
    id: 'review.route-and-map',
    domain: 'review',
    label: '复习路线与地图',
    trigger: '用户读取笔记本、生成/删除复习路线、完成关卡、补给节点或提现奖励积分。',
    surfaces: ['toast', 'notification-banner', 'confirm-dialog'],
    outcomes: ['success', 'error'],
    sourceFiles: [
      'app/review/[id]/loading/page.tsx',
      'app/review/[id]/page.tsx',
      'app/review/[id]/map/page.tsx',
    ],
  },
  {
    id: 'study-companion.memory',
    domain: 'study-companion',
    label: '学习陪伴提醒',
    trigger: '用户完成测验、产生新的薄弱点、生成复习地图或笔记本生成完成。',
    surfaces: ['notification-banner'],
    outcomes: ['success'],
    sourceFiles: [
      'lib/learning/study-memory.ts',
      'components/scene-renderers/quiz-view.tsx',
      'app/review/[id]/loading/page.tsx',
      'components/create/create-notebook-composer.tsx',
      'components/chat/chat-page-client.tsx',
    ],
  },
  {
    id: 'credits.top-up-and-transfer',
    domain: 'credits',
    label: '充值、积分转换与余额变化',
    trigger: '用户发起 Stripe 充值、取消/完成支付、转换现金积分或余额同步。',
    surfaces: ['toast', 'notification-banner', 'notification-feed'],
    outcomes: ['success', 'error', 'message'],
    sourceFiles: ['app/top-up/page.tsx', 'lib/server/notifications.ts'],
    notes: '余额不足提醒由通知中心生成 banner。',
  },
  {
    id: 'gamification.rewards-and-unlocks',
    domain: 'gamification',
    label: '成长奖励与外观解锁',
    trigger: '用户领取成长奖励、结算里程碑、解锁/应用角色或头像框。',
    surfaces: ['toast', 'notification-banner', 'notification-feed'],
    outcomes: ['success', 'error', 'info'],
    sourceFiles: [
      'components/gamification/gamification-summary-card.tsx',
      'components/gamification/live2d-companion-hub.tsx',
      'components/gamification/avatar-collection-store-card.tsx',
      'components/user-profile/profile-avatar-frame-picker.tsx',
      'lib/server/notifications.ts',
    ],
  },
  {
    id: 'profile.avatar-upload',
    domain: 'profile',
    label: '个人头像上传',
    trigger: '用户上传头像时文件过大或文件类型不合法。',
    surfaces: ['toast'],
    outcomes: ['error'],
    sourceFiles: ['components/create/greeting-bar.tsx'],
  },
  {
    id: 'settings.general',
    domain: 'settings',
    label: '通用设置',
    trigger: '用户清理本地缓存或尝试调用未配置模型。',
    surfaces: ['toast'],
    outcomes: ['success', 'error'],
    sourceFiles: [
      'components/settings/general-settings.tsx',
      'components/chat/use-chat-sessions.ts',
    ],
  },
  {
    id: 'whiteboard.history',
    domain: 'whiteboard',
    label: '白板历史与清空',
    trigger: '用户恢复白板历史记录或清空白板。',
    surfaces: ['toast'],
    outcomes: ['success', 'error'],
    sourceFiles: [
      'components/whiteboard/whiteboard-history.tsx',
      'components/whiteboard/index.tsx',
    ],
  },
  {
    id: 'admin.session-and-credits',
    domain: 'admin',
    label: '管理员登录、发放积分与解锁',
    trigger: '管理员登录、搜索用户、发放积分、补发积分或解锁用户资产。',
    surfaces: ['toast', 'confirm-dialog'],
    outcomes: ['success', 'error'],
    sourceFiles: ['components/admin/admin-entry.tsx', 'components/admin/admin-credits-section.tsx'],
  },
];

export function getNotificationOperationsBySurface(
  surface: NotificationSurface,
): NotificationOperation[] {
  return NOTIFICATION_OPERATION_CATALOG.filter((operation) => operation.surfaces.includes(surface));
}

export function getNotificationOperationsByDomain(
  domain: NotificationOperationDomain,
): NotificationOperation[] {
  return NOTIFICATION_OPERATION_CATALOG.filter((operation) => operation.domain === domain);
}
