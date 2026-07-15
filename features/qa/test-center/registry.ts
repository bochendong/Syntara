export type PlatformTestCategory = 'notebook' | 'calendar' | 'practice' | 'teaching' | 'memory';

export interface PlatformTestStep {
  title: string;
  action: string;
  evidence: string;
}

export interface PlatformTestScenario {
  id: string;
  order: number;
  title: string;
  summary: string;
  category: PlatformTestCategory;
  entryHref: string;
  entryLabel: string;
  setup: string[];
  inputs: string[];
  outputs: string[];
  prompts?: string[];
  steps: PlatformTestStep[];
  passCriteria: string[];
  recommended?: boolean;
  recommendationReason?: string;
}

export const PLATFORM_TEST_CATEGORY_LABELS: Record<PlatformTestCategory, string> = {
  notebook: '笔记本生成',
  calendar: '日历计划',
  practice: '题目练习',
  teaching: '知识讲解',
  memory: '记忆与复习',
};

export const CORE_PLATFORM_TEST_SCENARIOS: PlatformTestScenario[] = [
  {
    id: 'notebook-overview-image',
    order: 1,
    title: '上传文件，生成一页式学习 Cheat Sheet',
    summary: '验证资料理解、速查结构提取和正式图片生成能形成独立链路，不创建笔记本内容。',
    category: 'notebook',
    entryHref: '/creator',
    entryLabel: '前往创作入口',
    setup: [
      '准备一份结构清晰的 PDF、PPTX 或 Markdown 课程资料',
      '记录文件名、页数和三个关键知识点',
    ],
    inputs: ['课程资料文件', 'Cheat Sheet 标题（可选）', '资料用途与重点（可选）'],
    outputs: [
      '上传成功状态',
      '可核对的资料摘要',
      '一张包含定义、方法、边界、对照与检索词的 A4 Cheat Sheet',
    ],
    prompts: [
      '请根据上传资料生成一张一页式学习 Cheat Sheet，覆盖定义、方法条件、结论边界、复习路线和检索入口。',
    ],
    steps: [
      {
        title: '上传资料',
        action: '选择文件并等待解析完成。',
        evidence: '文件名、类型、大小和解析状态可见。',
      },
      {
        title: '识别结构',
        action: '检查系统提取的主题、章节和关键概念。',
        evidence: '三个预先记录的关键知识点至少命中两个。',
      },
      {
        title: '生成概览',
        action: '触发 Cheat Sheet 生成并等待任务完成。',
        evidence: '进度、成功或失败状态清楚，不暴露内部推理。',
      },
      {
        title: '验收结果',
        action: '打开 Cheat Sheet，检查定义、方法条件、边界、对照表和检索词。',
        evidence: '图片可读、无截断，并能追溯到上传资料。',
      },
    ],
    passCriteria: [
      '资料没有被错误识别为题库',
      'Cheat Sheet 覆盖资料主线且不编造知识点',
      '刷新后仍能找到生成结果',
      '运行前后都不会创建或修改笔记本内容',
    ],
  },
  {
    id: 'notebook-summary-content',
    order: 2,
    title: '上传文件，AI 路由并生成结构化笔记',
    summary: '验证 AI 能区分课程讲义、研究论文和日常资料，并输出适合快速查阅的对应结构。',
    category: 'notebook',
    entryHref: '/creator',
    entryLabel: '前往创作入口',
    setup: ['至少准备一份课程讲义和一份研究论文', '先使用 AI 自动路由，再用手动路径分别验收生成器'],
    inputs: ['原始资料文件', 'AI 自动路由或手动指定路径', '输出语言'],
    outputs: [
      '路由类型、置信度、判断理由和原文信号',
      '课程型：完整定义、知识脉络、做题想法、选法逻辑、解题格式、代表题型',
      '研究型：研究问题、主张—证据—边界、方法 pipeline、实验指标、局限和复现信息',
      '好笔记的保留、省略和使用规则，以及可折叠的完整 Markdown',
    ],
    prompts: [
      '直接读取原文件，先判断资料用途，再调用对应结构化生成器；不得用课程上下文猜测资料类型。',
    ],
    steps: [
      {
        title: '上传与路由',
        action: '上传资料并选择 AI 自动路由。',
        evidence: '页面显示选中的生成器、置信度、判断理由和原文信号。',
      },
      {
        title: '验收课程路径',
        action: '上传课程讲义，检查定义、方法选择、解题格式和代表题型。',
        evidence: '定义完整；题目经过代表性筛选；做题想法与落笔格式分开显示。',
      },
      {
        title: '验收研究路径',
        action: '上传研究论文，检查研究问题、主张、方法、证据、指标和边界。',
        evidence: '没有套用课程做题模板；每条核心主张能回到证据及其边界。',
      },
      {
        title: '保存与重开',
        action: '刷新浏览器并重新打开运行历史。',
        evidence: '路由判断、结构化字段和完整 Markdown 均未丢失。',
      },
    ],
    passCriteria: [
      'AI 自动路由与资料实际类型一致，并显示可核查依据',
      '课程型结果能先回答定义、选法、做题想法和书写格式，而不是堆叠全文',
      '课程例题只保留能代表方法或边界的题型，且不丢关键步骤',
      '研究型结果以主张、证据、指标、边界和复现为中心，不套课程模板',
      '刷新后仍能查看完整结构化结果，且测试不会写入业务数据库',
    ],
  },
  {
    id: 'calendar-natural-language-crud',
    order: 3,
    title: '上传文件生成日历，并用自然语言增删改日程',
    summary: '覆盖 syllabus 提取、日历草稿确认，以及自然语言添加、修改、删除的完整闭环。',
    category: 'calendar',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['准备包含作业、考试和日期的课程大纲', '确保至少有两个日期相近但标题不同的事项'],
    inputs: ['课程大纲文件', '新增日程指令', '修改日程指令', '删除日程指令'],
    outputs: ['待确认的日历草稿', '确认后写入的日历事项', '每次变更的明确反馈'],
    prompts: [
      '把这份 syllabus 里的作业和考试整理成日历。',
      '下周三晚上 8 点添加 45 分钟复习。',
      '把刚才的复习改到周四晚上 7 点。',
      '删除刚才创建的复习日程。',
    ],
    steps: [
      {
        title: '导入日期',
        action: '上传大纲并检查提取出的日期事项。',
        evidence: '标题、日期、来源和事项类型可核对。',
      },
      { title: '确认写入', action: '确认日历草稿后再写入。', evidence: '未确认前日历不发生变化。' },
      {
        title: '自然语言增改',
        action: '先添加事项，再用相对指代修改它。',
        evidence: '系统命中唯一事项并显示修改前后差异。',
      },
      {
        title: '自然语言删除',
        action: '请求删除并完成确认。',
        evidence: '删除目标明确，确认后事项消失。',
      },
    ],
    passCriteria: [
      '日期和时区正确',
      '所有写操作都需要确认',
      '歧义目标不会被直接修改或删除',
      '刷新后日历状态与操作结果一致',
    ],
  },
  {
    id: 'question-source-routing',
    order: 4,
    title: '题库与笔记题源路由',
    summary:
      '从左侧选择完整题源样本，只调整请求题量，观察 AI 如何规划检索词、执行本地 RAG、验收候选并按拒绝原因重试。',
    category: 'practice',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: [
      '使用本地 MAT136 / CSC148 脱敏题库快照',
      '从测试样本中切换空题库、充足题库和部分题库',
      '样本会自动带入课程、主题、现有题数和 Mock 笔记',
    ],
    inputs: ['完整题源测试样本', '请求题量'],
    outputs: [
      'AI 检索计划',
      'RAG 候选与混合分数',
      '逐题接受/拒绝理由',
      '重试检索词',
      '最终选题与补题',
    ],
    prompts: [
      '题库为空、笔记为空',
      '题库为空、有笔记',
      '题库充足',
      '题库不全、笔记为空',
      '题库不全、有笔记',
    ],
    steps: [
      {
        title: '选择测试样本',
        action: '从左侧选择题源样本，并设置不同请求题量。',
        evidence: '样本明确显示课程、主题、题库状态、候选题数和笔记是否提供。',
      },
      {
        title: '执行题源路由',
        action: '先让 AI 生成检索计划，再执行本地混合 RAG，并由 AI 逐题验收。',
        evidence: '结果展示每条 query、语义/词汇/混合分、拒绝原因与下一轮检索词。',
      },
      {
        title: '切换状态对照',
        action: '在同一页面重复运行其他题源状态。',
        evidence: '所有结果进入同一个本地历史列表，可直接比较。',
      },
    ],
    passCriteria: [
      '题库充足时不额外生成',
      '题库为空时生成所需题量',
      '题库不全时优先使用原题并补足缺口',
      '有笔记时补题可由笔记支持',
      '不虚构题库 ID，结果不写业务数据库',
    ],
  },
  {
    id: 'concept-text-explanation',
    order: 5,
    title: '知识点 / 题目文字讲解',
    summary:
      '用左侧 10 条固定样本比较知识点与题目讲解，并直接展示每条样本实际注入的模拟笔记提取知识。',
    category: 'teaching',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['直接从左侧选择 5 条知识点样本或 5 条题目样本', '不需要预先生成笔记历史'],
    inputs: ['10 条固定讲解样本', '可见的模拟笔记提取章节', '知识点或完整题面'],
    outputs: ['正式课程总控的文字讲解', '实际注入的模拟笔记知识', '讲解依据边界'],
    prompts: [
      '用文字给我讲清楚“递归为什么需要基线条件”，给出准确条件、例子、误区和自检。',
      '请先重述题意和关键条件，再说明选法、逐步解答、检查方法和常见错误。',
    ],
    steps: [
      {
        title: '选择固定测试',
        action: '从左侧 10 条样本中直接切换，不再使用下拉菜单组装条件。',
        evidence: '每条样本都明确标注知识点/题目以及有笔记/无笔记。',
      },
      {
        title: '核对模拟笔记',
        action: '带笔记的样本会在运行前展示标题、源文件、章节摘要和提取正文。',
        evidence: '人可以直接对照“页面展示的知识”与“模型实际引用的知识”。',
      },
      {
        title: '执行正式讲解',
        action: '把受控上下文交给正式课程总控讲解器。',
        evidence: '无笔记时不暗示读取资料；有笔记时能引用实际笔记内容且不越过证据边界。',
      },
      {
        title: '对照结果',
        action: '保持输入不变，只切换笔记条件后重新生成。',
        evidence: '可以从本地历史直接比较结构、例子、结论和来源差异。',
      },
    ],
    passCriteria: [
      '知识点讲解包含直觉、准确表述、条件、例子、误区和自检',
      '题目讲解准确重述题面，并说明选法、步骤、检查与最终结论',
      '有笔记时引用的是页面已展示的模拟提取知识，不伪造不存在的来源',
      '无笔记时明确使用一般知识，不声称来自课程笔记',
      '10 条固定测试和完整上下文轨迹刷新后仍可查看',
    ],
  },
  {
    id: 'concept-ppt-explanation',
    order: 6,
    title: '讲解某个知识点（PPT 版）',
    summary: '验证用户明确要求后，文字教学目标能被转换成短小、可播放的临时课堂。',
    category: 'teaching',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['选择一个适合 1–2 页讲清的知识点', '准备必须出现的概念、例子和视觉元素'],
    inputs: ['知识点', 'PPT 形式的明确请求', '页数或讲解时长（可选）'],
    outputs: ['生成前确认动作', '1–2 页临时课堂', '可播放的讲解内容和返回路径'],
    prompts: ['把“二分查找的不变量”做成 2 页以内的 PPT 给我讲解，包含一个数组例子。'],
    steps: [
      {
        title: '明确请求',
        action: '要求用 PPT 讲解并给出页数限制。',
        evidence: '只有明确请求才触发课堂生成。',
      },
      {
        title: '确认生成',
        action: '检查计划并确认消耗型生成动作。',
        evidence: '生成前能看到目标、页数和预期产物。',
      },
      {
        title: '播放课堂',
        action: '打开生成结果并逐页播放。',
        evidence: '文字、图片、公式和讲解顺序一致。',
      },
      { title: '回到对话', action: '返回原对话继续追问。', evidence: '上下文和课堂结果仍可访问。' },
    ],
    passCriteria: [
      '未明确请求时不生成 PPT',
      '默认控制在 1–2 页',
      '每页有明确教学职责且无内容截断',
      '生成失败可恢复到原对话并重试',
    ],
  },
  {
    id: 'memory-review-plan',
    order: 7,
    title: '创建模拟学习记忆，并生成复习计划',
    summary: '联合刷题、问答和显式记忆，验证系统能提炼薄弱点、原因和下一步教学动作。',
    category: 'memory',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['创建模拟用户', '准备刷题记录、问答记录和一条显式记忆，其中包含可解释的共同弱点'],
    inputs: ['刷题记录', '问答记录', '显式学习记忆', '可用时间或目标日期（可选）'],
    outputs: ['证据化学习画像', '可执行复习计划', '每项计划对应的证据与理由'],
    prompts: ['根据这个模拟用户的刷题、问答和记忆，生成一份复习计划，并说明每一步依据。'],
    steps: [
      {
        title: '写入模拟记忆',
        action: '分别建立刷题、问答和显式记忆。',
        evidence: '三种来源可区分、可追溯、可删除。',
      },
      {
        title: '提炼学习状态',
        action: '读取掌握度、弱点、原因和最近变化。',
        evidence: '结论引用具体来源而非复述全文。',
      },
      {
        title: '生成复习计划',
        action: '基于证据生成目标、任务、重点和自测。',
        evidence: '每个任务都有理由和完成信号。',
      },
      {
        title: '验证更新',
        action: '补充一条新成功记录后重新生成。',
        evidence: '计划能根据新证据调整而不是固定不变。',
      },
    ],
    passCriteria: [
      '三类记忆都参与但不会机械拼接',
      '计划优先处理有证据的弱点',
      '过期或矛盾记忆有可信度处理',
      '计划不会在未确认时自动写入日历',
    ],
  },
];

export const RECOMMENDED_PLATFORM_TEST_SCENARIOS: PlatformTestScenario[] = [
  {
    id: 'end-to-end-learning-loop',
    order: 9,
    title: 'CSC148 完整学习闭环回归',
    summary:
      '使用真实 CSC148 本地课程包和题库，验证课程检索、AI 问答、题库练习与昂贵结果归档的跨模块交接。',
    category: 'memory',
    entryHref: '/test/end-to-end-learning-loop',
    entryLabel: '进入 CSC148 闭环',
    setup: [
      '使用仓库内 CSC148 课程快照与生产题库快照',
      '登录一个测试用户，确保 AI 费用和结果都归属到该账户',
    ],
    inputs: ['CSC148 学习主题', '一次 AI 知识问答', '一次题库检索或练习', '验收状态与备注'],
    outputs: ['课程证据', 'AI 讲解结果', '匹配题库入口', '可跨刷新恢复的完整测试运行记录'],
    steps: [
      {
        title: '读取课程',
        action: '检索 CSC148 notebook 与章节内容。',
        evidence: '命中结果可回到真实本地课程片段。',
      },
      {
        title: 'AI 课程问答',
        action: '带着课程和题库证据调用正式模型。',
        evidence: '保存完整 prompt、输出、模型、token 和费用。',
      },
      {
        title: '进入题库',
        action: '从问答证据进入匹配题目并检查解析。',
        evidence: '题目来自 CSC148 真实题库快照。',
      },
      {
        title: '归档验收',
        action: '标记通过或失败并保存备注。',
        evidence: '刷新或退出浏览器后仍能恢复历次运行。',
      },
    ],
    passCriteria: [
      '课程、题库和 AI 证据属于同一个 CSC148 测试上下文',
      'AI 回复不能编造本地课程或题库不存在的内容',
      '每次运行追加保存，不覆盖以前付费生成的结果',
      '完整链路失败时能定位到检索、模型、题库或保存阶段',
    ],
    recommended: true,
    recommendationReason:
      'CSC148 已经具备真实课程内容和题库快照，适合作为平台发布前的完整学习闭环基准。',
  },
  {
    id: 'file-ingestion-boundaries',
    order: 10,
    title: '文件输入边界与混合内容',
    summary: '覆盖空文件、损坏文件、超大文件、多文件、扫描 PDF，以及“资料与题目混合”的输入。',
    category: 'notebook',
    entryHref: '/creator',
    entryLabel: '前往创作入口',
    setup: [
      '准备正常、空白、损坏、扫描版、超大和重复文件',
      '准备一份全部是题目和一份资料题目混合的文件',
    ],
    inputs: ['边界文件集合', '重复上传操作', '中途取消操作'],
    outputs: ['明确的格式与大小反馈', '可恢复的解析状态', '正确的资料/题目路由判断'],
    steps: [
      {
        title: '格式边界',
        action: '逐个上传空白、损坏和不支持的文件。',
        evidence: '错误指向具体文件和原因。',
      },
      {
        title: '容量边界',
        action: '上传超大文件和多文件组合。',
        evidence: '限制、进度和剩余文件状态清楚。',
      },
      {
        title: '内容路由',
        action: '上传全题目与混合内容文件。',
        evidence: '全题目输入不会误写笔记本或公共记忆。',
      },
      {
        title: '重复与取消',
        action: '重复上传并在解析中取消。',
        evidence: '不会留下幽灵任务或重复资源。',
      },
    ],
    passCriteria: [
      '所有失败都给出用户可行动反馈',
      '单个文件失败不拖垮整批',
      '内容类型判断符合课程合同',
      '取消和重复上传保持数据一致',
    ],
    recommended: true,
    recommendationReason:
      '十条主流程都依赖文件入口，输入边界是最容易制造脏数据和不可恢复任务的地方。',
  },
  {
    id: 'generation-recovery-idempotency',
    order: 11,
    title: '生成中断、重试与幂等性',
    summary: '模拟超时、断网、刷新、取消和重复点击，验证长任务可以恢复且不会重复扣费或写入。',
    category: 'notebook',
    entryHref: '/creator',
    entryLabel: '前往创作入口',
    setup: ['选择一个需要较长生成时间的资料', '准备观察任务 ID、生成记录和计费记录'],
    inputs: ['长任务', '断网或请求中断', '刷新与重复点击'],
    outputs: ['可理解的公开进度', '可恢复任务状态', '唯一生成结果和一致计费'],
    steps: [
      {
        title: '启动长任务',
        action: '生成笔记本或 PPT 并记录任务 ID。',
        evidence: '进度可以刷新或重新读取。',
      },
      {
        title: '制造中断',
        action: '断网、刷新页面或关闭后重开。',
        evidence: '任务状态不会永久卡在假进度。',
      },
      {
        title: '重试恢复',
        action: '对失败阶段执行重试。',
        evidence: '复用已有成功产物，只补失败阶段。',
      },
      {
        title: '核对副作用',
        action: '检查资源、积分和任务记录。',
        evidence: '没有重复资源、重复扣费或多份记忆。',
      },
    ],
    passCriteria: [
      '刷新后能恢复真实任务状态',
      '重复点击不会创建并行重复任务',
      '重试不会重复扣费或覆盖成功结果',
      '失败原因和下一步操作清楚',
    ],
    recommended: true,
    recommendationReason:
      '图片、PPT 和笔记本都是长任务；没有恢复与幂等测试，线上偶发故障会直接变成数据问题。',
  },
  {
    id: 'user-data-isolation',
    order: 12,
    title: '多用户、跨课程与权限隔离',
    summary: '验证用户、课程、笔记本、题库、日历和记忆之间不会串数据或越权读写。',
    category: 'memory',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['创建两个模拟用户和两门课程', '为双方写入相似标题但不同内容的记录'],
    inputs: ['用户 A/B', '课程 A/B', '同名日程、记忆和题目记录'],
    outputs: ['严格按用户和课程过滤的上下文', '越权请求拒绝结果', '删除后的真实不可见状态'],
    steps: [
      {
        title: '构造同名数据',
        action: '在两个用户与课程中创建相似记录。',
        evidence: '记录拥有明确 ownerId 与 courseId。',
      },
      {
        title: '切换上下文',
        action: '切换用户、课程和笔记本执行查询。',
        evidence: '每次只返回当前范围数据。',
      },
      {
        title: '尝试越权',
        action: '使用另一用户的资源 ID 直接访问或修改。',
        evidence: '接口与 UI 都拒绝访问。',
      },
      {
        title: '删除验证',
        action: '删除记忆或日程后再次检索。',
        evidence: '缓存和检索层都不再返回已删除内容。',
      },
    ],
    passCriteria: [
      '不同用户之间无数据泄漏',
      '不同课程的记忆不会错误影响选题',
      '直接 URL/API 访问同样受权限保护',
      '删除在结构化数据和检索索引中一致生效',
    ],
    recommended: true,
    recommendationReason:
      '学习记忆和日历属于敏感用户数据，隔离测试应当是发布门槛而不是普通功能检查。',
  },
  {
    id: 'evidence-source-traceability',
    order: 13,
    title: '答案、选题与计划的证据可追溯性',
    summary: '检查模型给出的事实、用户画像、选题理由和复习计划是否都能回到真实来源。',
    category: 'teaching',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['准备包含相近概念和少量冲突信息的资料', '准备可明确核对的题库与用户历史'],
    inputs: ['课程资料', '题库记录', '学习历史', '解释或计划请求'],
    outputs: ['来源标识', '证据摘要', '冲突或低置信度提示'],
    steps: [
      {
        title: '知识讲解',
        action: '请求讲解资料中的一个事实。',
        evidence: '关键结论能定位到资料来源。',
      },
      {
        title: '个性化选题',
        action: '请求依据弱点选择题目。',
        evidence: '理由引用真实作答记录和题目元数据。',
      },
      {
        title: '生成计划',
        action: '请求复习计划。',
        evidence: '每项任务说明来自哪条弱点或截止时间。',
      },
      {
        title: '制造冲突',
        action: '加入一条冲突或低置信度信息。',
        evidence: '系统暴露不确定性而不是强行合并。',
      },
    ],
    passCriteria: [
      '不引用不存在的资料、题目或历史',
      '证据与结论之间有直接关系',
      '冲突信息不会被静默覆盖',
      '用户能从计划回看支撑证据',
    ],
    recommended: true,
    recommendationReason: '平台的核心价值不是只生成内容，而是让教学动作可信、可解释、可纠错。',
  },
  {
    id: 'state-persistence-concurrency',
    order: 14,
    title: '刷新、跨标签页与并发状态一致性',
    summary: '验证对话、生成任务、日历、练习和记忆在刷新、多个标签页及重复操作下保持一致。',
    category: 'calendar',
    entryHref: '/learn',
    entryLabel: '前往学习工作台',
    setup: ['同一用户打开两个标签页', '准备一个生成任务和一个可修改日历事项'],
    inputs: ['并行标签页', '重复确认动作', '刷新与重新登录'],
    outputs: ['一致的最新状态', '冲突提示或确定的合并策略', '不会重复执行的写操作'],
    steps: [
      { title: '双端读取', action: '两个标签页打开同一课程与日历。', evidence: '初始数据一致。' },
      {
        title: '并发修改',
        action: '分别修改同一事项或确认同一动作。',
        evidence: '只有一次生效，冲突结果清楚。',
      },
      {
        title: '刷新重登',
        action: '刷新并退出后重新登录。',
        evidence: '服务端或本地真相正确恢复。',
      },
      {
        title: '核对关联状态',
        action: '检查对话、通知、记忆和计划。',
        evidence: '相关模块没有保留旧缓存。',
      },
    ],
    passCriteria: [
      '重复确认不产生重复写入',
      '两个标签页最终收敛到同一状态',
      '刷新和重登不丢失已确认结果',
      '冲突不会静默覆盖用户最新操作',
    ],
    recommended: true,
    recommendationReason:
      '大量流程同时使用本地状态、异步任务和服务端数据，状态一致性需要独立验收。',
  },
];

export type MemoryPhaseTwoGroup = 'setup' | 'write' | 'manage' | 'ai';

export interface MemoryPhaseTwoTestScenario extends PlatformTestScenario {
  phaseTwoGroup: MemoryPhaseTwoGroup;
  shortTitle: string;
}

const MEMORY_TEST_SETUP = [
  '从四个只读人物基线中独立选择本条测试用户',
  '每次运行创建一次性浏览器本地副本，读取结果后立即销毁',
];

export const SECOND_PHASE_MEMORY_TEST_SCENARIOS: MemoryPhaseTwoTestScenario[] = [
  {
    id: 'memory-simulated-user',
    order: 8,
    shortTitle: '四档平台使用历史',
    title: '第二阶段 01：四档平台用户与完整使用历史',
    summary:
      '建立新用户、轻度用户、活跃用户和重度用户四份完整本地历史，对照检查题目、作答、聊天、资料、日历、精确事实与分层记忆。',
    category: 'memory',
    phaseTwoGroup: 'setup',
    entryHref: '/test/memory-simulated-user',
    entryLabel: '测试四档平台用户',
    setup: ['浏览器支持 localStorage 与 IndexedDB', '四个 memory-test- userId 相互隔离'],
    inputs: ['刚注册的新用户', '轻度使用者', '持续活跃用户', '长期重度使用者'],
    outputs: [
      '四份独立的题目、逐次作答、聊天、资料与日历记录',
      '短期状态、私有长期记忆、共有课程记忆与精确事实的分层统计',
      '选择后仅显示该人物的只读来源历史与派生记忆',
    ],
    steps: [
      {
        title: '刚注册的新用户',
        action: '加载 3 天内开始使用平台的初学者。',
        evidence: '2 道题、3 次作答、1 段对话，来源与记忆都很少。',
      },
      {
        title: '轻度使用者',
        action: '加载使用 21 天、偶尔学习的基础水平用户。',
        evidence: '9 道题、15 次作答、4 段对话、1 份资料与 6 条私有长期记忆。',
      },
      {
        title: '持续活跃用户',
        action: '加载跨 94 天持续学习的中等水平用户。',
        evidence: '28 道题、54 次作答、14 段对话、3 份资料与 18 条私有长期记忆。',
      },
      {
        title: '长期重度使用者',
        action: '加载跨 286 天高频使用平台的高阶用户。',
        evidence: '72 道题、168 次作答、38 段对话、8 份资料、14 个日历事项与 42 条私有长期记忆。',
      },
    ],
    passCriteria: [
      '四个用户的使用量、学习水平、来源记录与记忆状态明显不同',
      '逐次作答保留为来源记录，长期记忆是跨证据提炼结果',
      '四份信息均来自各自的浏览器本地沙盒',
      '第一条中的选择不会影响任何后续测试',
    ],
  },
  {
    id: 'memory-problem-writeback',
    order: 9,
    shortTitle: '做题后更新记忆',
    title: '第二阶段 02：用户做题后的记忆更新',
    summary: '用十二个彼此独立的做题场景，覆盖新增、修正、强化、短期更新和不应写入记忆等边界。',
    category: 'memory',
    phaseTwoGroup: 'write',
    entryHref: '/test/memory-problem-writeback',
    entryLabel: '测试做题写入',
    setup: MEMORY_TEST_SETUP,
    inputs: [
      '十二个固定人物与题目场景',
      '完整题干、正确答案/评分 rubric 与用户原始提交彼此分离',
      '选项、长简答、代码追踪、证明、超时与提示后重答',
    ],
    outputs: [
      '平台运行时判题分数与反馈',
      '本次实际新增或更新的记忆',
      '写入目标 userId、problemId 与 attemptIds 来源证据',
    ],
    steps: [
      {
        title: '周小满重做旧错题',
        action: '复用已有递归题，再次出现规模没有缩小的错误。',
        evidence: '更新短期状态，并新增稳定错误记忆。',
      },
      {
        title: '周小满首次做新章节题',
        action: '创建第一道 Representation Invariants 题。',
        evidence: '新增题目来源与 RI 知识缺口记忆。',
      },
      {
        title: '林澈复习旧题后掌握',
        action: '重做已有树遍历题并正确通过。',
        evidence: '原地修正既有薄弱记忆，不制造重复记忆。',
      },
      {
        title: '陈知遥做新章节综合题',
        action: '第一次完成摊还复杂度证明题。',
        evidence: '记录会算总成本但不会形式化证明的新缺口。',
      },
      {
        title: '顾言川完成熟悉高阶多选题',
        action: '提交摊还分析多选项，由平台在运行时计算正误。',
        evidence: '只更新短期最近作答，不新增长期记忆。',
      },
      {
        title: '顾言川暴露高阶证明盲点',
        action: '新证明题遗漏空子树边界。',
        evidence: '即使是高阶用户，也会新增可追溯的高阶薄弱记忆。',
      },
      {
        title: '林澈选对答案但理由错误',
        action: '选择正确选项，但用 RecursionError 解释终止性。',
        evidence: '不能只看 correct 状态，错误推理仍应形成误解记忆。',
      },
      {
        title: '周小满超时且没有答案',
        action: '记录题目和超时 attempt，但没有可分析答案。',
        evidence: '不猜测掌握或薄弱点，保持 0 条学习记忆变化。',
      },
      {
        title: '陈知遥出现一次粗心错误',
        action: '已掌握题目中偶发漏写 return。',
        evidence: '只更新短期状态，不立刻降级长期掌握。',
      },
      {
        title: '林澈跨题重复相同错误',
        action: '在链表递归中重复树递归的规模错误。',
        evidence: '把新证据合并进原长期薄弱记忆，不新增重复条目。',
      },
      {
        title: '周小满在提示后答对',
        action: '先失败，在明确提示后完成题目。',
        evidence: '记录依赖支架，不误写成独立掌握。',
      },
      {
        title: '顾言川新章节首次答对',
        action: '第一次完成图 DFS 新章节题。',
        evidence: '单次正确只更新短期状态，证据不足时不固化长期掌握。',
      },
    ],
    passCriteria: [
      '左侧每一项都是可独立运行的测试，不是流程步骤',
      '右侧只展示本次新增或更新的记忆',
      'after 快照 userId 与实际写入目标一致',
      '记忆能回到真实 problemId 与 attemptIds',
    ],
  },
  {
    id: 'memory-source-upload-writeback',
    order: 10,
    shortTitle: '上传资料后更新',
    title: '第二阶段 03：用户上传资料后的记忆更新',
    summary: '上传 CSC148 资料，验证完整资料留在知识库，只有课程特有的回答契约进入长期记忆。',
    category: 'memory',
    phaseTwoGroup: 'write',
    entryHref: '/test/memory-source-upload-writeback',
    entryLabel: '测试资料写入',
    setup: MEMORY_TEST_SETUP,
    inputs: ['含 class contract 与 Representation Invariants 的 CSC148 资料'],
    outputs: ['IndexedDB 资料记录', '课程契约 StudyMemory', 'uploaded_material 来源引用'],
    steps: [
      {
        title: '提交资料',
        action: '把测试资料保存到本地 IndexedDB。',
        evidence: '返回本地 materialId、文件信息与存储计数。',
      },
      {
        title: '区分层级',
        action: '检查知识库与长期记忆边界。',
        evidence: '通用定义未被整段复制到长期记忆。',
      },
      {
        title: '检查契约',
        action: '查看新 StudyMemory。',
        evidence: '保留 attributes、RI 和课程本地答题约束。',
      },
    ],
    passCriteria: [
      '资料真实写入浏览器 IndexedDB',
      '课程特有契约可追溯',
      '不存在前端伪造的成功结果',
    ],
  },
  {
    id: 'memory-question-writeback',
    order: 11,
    shortTitle: '提问后更新记忆',
    title: '第二阶段 04：用户提问知识点后的记忆更新',
    summary: '创建真实对话与问题，检查提问触发的短期学习诊断是否服务于下一次教学。',
    category: 'memory',
    phaseTwoGroup: 'write',
    entryHref: '/test/memory-question-writeback',
    entryLabel: '测试提问写入',
    setup: MEMORY_TEST_SETUP,
    inputs: ['关于树递归参数为什么必须缩小的问题'],
    outputs: ['真实 Conversation/Message', '掌握、薄弱、原因、下一教学动作记忆'],
    steps: [
      {
        title: '创建对话',
        action: '为模拟用户创建测试会话。',
        evidence: 'conversationId 和 messageId 可见。',
      },
      { title: '写入问题', action: '记录知识点提问。', evidence: '对话消息计数增加。' },
      {
        title: '检查诊断',
        action: '查看派生学习记忆。',
        evidence: '记忆不是问题原文摘要，而是教学可用状态。',
      },
    ],
    passCriteria: [
      '记录学生会什么、不会什么、为什么和下一步',
      '来源关联到 conversation/message',
      '问题原文不充当主要记忆',
    ],
  },
  {
    id: 'memory-structured-facts-calendar',
    order: 12,
    shortTitle: '资料、偏好与日历',
    title: '第二阶段 05：个人资料、偏好、习惯与日历记忆',
    summary: '验证精确当前值的新增、覆盖和事件历史，并把日历作为一种结构化记忆统一管理。',
    category: 'memory',
    phaseTwoGroup: 'manage',
    entryHref: '/test/memory-structured-facts-calendar',
    entryLabel: '测试结构化记忆',
    setup: MEMORY_TEST_SETUP,
    inputs: ['姓名与专业', '语言与讲解顺序', '学习时长习惯', '复习日历时间'],
    outputs: ['MemoryFact 当前值', 'created/superseded 事件', '可人工增改删的事实列表'],
    steps: [
      {
        title: '写入资料',
        action: '写入姓名和专业。',
        evidence: 'profile namespace 出现两个当前事实。',
      },
      {
        title: '写入偏好',
        action: '写入语言、讲解顺序和学习时长。',
        evidence: 'preference/habit 当前值可见。',
      },
      {
        title: '创建日历',
        action: '创建复习事件。',
        evidence: 'calendar:event key 与时区可核对。',
      },
      {
        title: '修改日历',
        action: '覆盖同一 event key。',
        evidence: '当前值更新，账本保留旧值和新值。',
      },
    ],
    passCriteria: [
      '精确事实覆盖语义旧值',
      '日历与其他事实使用统一 CRUD',
      '修改通过事件账本人工验收',
    ],
  },
  {
    id: 'memory-layered-query',
    order: 13,
    shortTitle: '查询与分层召回',
    title: '第二阶段 06：查询某个记忆与分层召回',
    summary: '输入自然语言查询，检查结构化事实、工作记忆和本地公共/私有记忆的读取顺序与证据。',
    category: 'memory',
    phaseTwoGroup: 'manage',
    entryHref: '/test/memory-layered-query',
    entryLabel: '测试记忆查询',
    setup: [...MEMORY_TEST_SETUP, '本条测试自行准备查询所需的分层证据'],
    inputs: ['关于掌握状态、薄弱点或复习安排的查询'],
    outputs: ['本地读取计划', '各层命中数量', '事实与 memoryId 证据'],
    steps: [
      {
        title: '精确值查询',
        action: '查询语言、习惯或日历。',
        evidence: 'MemoryFact 在语义文本之前返回。',
      },
      {
        title: '学习状态查询',
        action: '查询递归掌握与薄弱点。',
        evidence: '直接/语义记忆包含来源 ID。',
      },
      {
        title: '读取顺序',
        action: '展开 read plan。',
        evidence: '事实、工作记忆、公共/私有记忆和关键词召回顺序明确。',
      },
    ],
    passCriteria: [
      '查询返回真实浏览器本地证据',
      '当前事实不会被旧文本覆盖',
      '检索计划和命中内容均可见',
    ],
  },
  {
    id: 'memory-source-cascade-delete',
    order: 14,
    shortTitle: '来源删除联动',
    title: '第二阶段 07：题目、聊天与资料删除后的记忆联动',
    summary: '分别删除本地题目、聊天和上传资料，验证派生学习记忆与来源索引一并消失。',
    category: 'memory',
    phaseTwoGroup: 'manage',
    entryHref: '/test/memory-source-cascade-delete',
    entryLabel: '测试来源删除',
    setup: [...MEMORY_TEST_SETUP, '本条测试自行准备题目、聊天、资料及其关联记忆'],
    inputs: ['problemId', 'conversationId', 'materialId'],
    outputs: ['删除前后快照', '精确数量 delta', '删除后的再次查询结果'],
    steps: [
      {
        title: '删除题目',
        action: '从来源列表删除测试题。',
        evidence: '题目、attempts 和题目派生记忆同步减少。',
      },
      {
        title: '删除聊天',
        action: '从来源列表删除测试会话。',
        evidence: '会话、消息派生记忆同步减少。',
      },
      {
        title: '删除资料',
        action: '从来源列表删除 IndexedDB 资料。',
        evidence: '资料记录和资料派生公共记忆同步减少。',
      },
      {
        title: '再次查询',
        action: '重新运行相同记忆查询。',
        evidence: '直接与语义召回均不再出现已删来源。',
      },
    ],
    passCriteria: [
      '浏览器本地删除链路执行来源联动清理',
      '工作记忆、公共/私有记忆和关键词召回没有残留命中',
      'delta 能精确说明删除对象',
    ],
  },
  {
    id: 'memory-ai-question-generation',
    order: 15,
    shortTitle: 'AI 基于记忆出题',
    title: '第二阶段 08：AI 基于用户记忆出题',
    summary: '根据掌握、薄弱、语言和练习习惯生成三道递进题，并核对每题引用的真实证据。',
    category: 'memory',
    phaseTwoGroup: 'ai',
    entryHref: '/test/memory-ai-question-generation',
    entryLabel: '测试个性化出题',
    setup: [...MEMORY_TEST_SETUP, '本条自行准备学习诊断和偏好证据', '系统 LLM 可用'],
    inputs: ['当前全部分层记忆'],
    outputs: ['易/中/难三道题', '适配说明', '每题 evidenceIds 机器校验'],
    prompts: ['根据我的薄弱点、掌握状态、语言和练习习惯，给我出三道递进题。'],
    steps: [
      {
        title: '组装证据',
        action: '读取当前分层记忆。',
        evidence: '实际送入模型的 evidence 列表可见。',
      },
      {
        title: '生成三题',
        action: '调用真实模型生成递进题。',
        evidence: '题量、难度和内容可人工核对。',
      },
      {
        title: '验证引用',
        action: '校验所有 evidenceId。',
        evidence: '不存在页面证据列表之外的 ID。',
      },
    ],
    passCriteria: ['题目针对当前薄弱点', '难度形成递进', '全部引用真实存在'],
  },
  {
    id: 'memory-ai-explanation',
    order: 16,
    shortTitle: 'AI 基于记忆讲解',
    title: '第二阶段 09：AI 基于用户记忆讲解知识点',
    summary: '根据理解程度、语言和讲解顺序偏好解释递归缩小问题规模，并展示适配依据。',
    category: 'memory',
    phaseTwoGroup: 'ai',
    entryHref: '/test/memory-ai-explanation',
    entryLabel: '测试个性化讲解',
    setup: [...MEMORY_TEST_SETUP, '本条自行准备提问诊断和讲解偏好', '系统 LLM 可用'],
    inputs: ['当前学习诊断', '语言和 explanation_style'],
    outputs: ['个性化知识点讲解', '适配说明', 'evidenceIds 机器校验'],
    prompts: ['根据我的理解程度和讲解偏好，讲清楚树递归为什么必须缩小问题规模。'],
    steps: [
      {
        title: '识别起点',
        action: '读取已掌握与薄弱状态。',
        evidence: '讲解不会从错误的知识起点开始。',
      },
      {
        title: '遵循偏好',
        action: '按用户讲解顺序生成。',
        evidence: '直觉、小例子、定义、代码顺序可核对。',
      },
      {
        title: '验证引用',
        action: '检查诊断和偏好证据 ID。',
        evidence: '所有引用均对应真实记录。',
      },
    ],
    passCriteria: ['讲解针对真实误区', '语言和讲解顺序生效', '没有编造记忆'],
  },
  {
    id: 'memory-ai-review-plan',
    order: 17,
    shortTitle: 'AI 制定复习计划',
    title: '第二阶段 10：AI 基于记忆制定复习计划',
    summary: '综合薄弱点、课程契约、学习时长和日历，为模拟用户制定三天可执行复习计划。',
    category: 'memory',
    phaseTwoGroup: 'ai',
    entryHref: '/test/memory-ai-review-plan',
    entryLabel: '测试复习计划',
    setup: [...MEMORY_TEST_SETUP, '本条自行准备学习记忆、习惯和日历事件', '系统 LLM 可用'],
    inputs: ['薄弱点', '35 分钟学习习惯', '当前日历事件'],
    outputs: ['三天复习安排', '每项时间和依据', 'evidenceIds 机器校验'],
    prompts: ['根据我的记忆、日历与学习习惯，制定接下来三天的复习计划。'],
    steps: [
      {
        title: '读取约束',
        action: '读取日历、习惯与薄弱点。',
        evidence: '证据列表包含当前精确值。',
      },
      {
        title: '生成计划',
        action: '调用模型生成三天安排。',
        evidence: '时段不冲突且时长适合用户。',
      },
      {
        title: '验证依据',
        action: '逐项检查计划引用。',
        evidence: '每项能回到弱点、习惯或日历事实。',
      },
    ],
    passCriteria: ['计划使用当前日历而非旧值', '安排符合学习时长', '复习重点来自真实薄弱点'],
  },
  {
    id: 'memory-ai-next-action',
    order: 18,
    shortTitle: 'AI 推荐下一动作',
    title: '第二阶段 11：AI 基于记忆选择下一学习动作',
    summary: '验证 AI 能在多层记忆中选择此刻最值得执行的学习动作，并说明优先级依据。',
    category: 'memory',
    phaseTwoGroup: 'ai',
    entryHref: '/test/memory-ai-next-action',
    entryLabel: '测试下一学习动作',
    setup: [...MEMORY_TEST_SETUP, '本条自行准备至少两种记忆证据', '系统 LLM 可用'],
    inputs: ['全部当前记忆与可执行时间'],
    outputs: ['一个主要动作', '后续动作', '优先级与 evidenceIds'],
    prompts: ['结合我现在会什么、不会什么和可用时间，告诉我下一步应该做什么。'],
    steps: [
      {
        title: '比较证据',
        action: '读取学习状态、偏好与时间。',
        evidence: '候选依据均来自当前记录。',
      },
      {
        title: '选择动作',
        action: '生成主要动作与后续动作。',
        evidence: '动作具体、可执行且有时间边界。',
      },
      { title: '检查优先级', action: '核对模型说明。', evidence: '优先处理影响最大的真实薄弱点。' },
    ],
    passCriteria: ['不是泛泛学习建议', '动作适合当前时长', '优先级能回到真实证据'],
  },
];

export function isMemoryPhaseTwoScenario(
  scenarioId: string,
): scenarioId is MemoryPhaseTwoTestScenario['id'] {
  return SECOND_PHASE_MEMORY_TEST_SCENARIOS.some((scenario) => scenario.id === scenarioId);
}

export const PLATFORM_TEST_SCENARIOS = [
  ...CORE_PLATFORM_TEST_SCENARIOS,
  ...SECOND_PHASE_MEMORY_TEST_SCENARIOS,
  ...RECOMMENDED_PLATFORM_TEST_SCENARIOS,
];

export function getPlatformTestScenario(id: string): PlatformTestScenario | undefined {
  return PLATFORM_TEST_SCENARIOS.find((scenario) => scenario.id === id);
}
