const DEFAULT_PROFILE = {
  answerContract: [
    '先判断任务类型，再选择课程内的模板/规则，而不是直接给泛化答案。',
    '先用静态记忆里的课程约束控制答案形状，再用 RAG 或题库证据补细节。',
    '如果当前题面、starter、source 与记忆冲突，优先当前题面，并说明不确定点。',
  ],
  diagnosisContract: [
    '诊断时必须区分：学生会什么、不会什么、为什么不会、下一步怎么教。',
    '不要只记录学生问过什么；要把问题转成可教学的掌握信号、薄弱点和错误类型。',
    '若证据不足，先用一个小检查题确认，而不是把一次对话上升为长期结论。',
  ],
  reviewContract: [
    '复习计划从当前薄弱点和最近尝试出发，优先选择小而可验证的下一步。',
    '题目推荐走题库/RAG，不把大量题目静态塞进 prompt。',
    '复习输出要包含今天先做什么、做完如何判断修复、下一步如何升级。',
  ],
  ragBoundary: [
    '完整讲义、题库、长例题和普通概念解释属于知识库/RAG。',
    '长期文本只保存会改变后续答案的课程私有规则、模板、检查点和本地约定。',
    '通用定义不进静态记忆，除非老师材料改变了该概念在本课里的用法。',
  ],
};

export const TEACHING_CONTROL_VERSION = 'teaching-control-v1';

export const TEACHING_CONTROL_COURSE_PROFILES = {
  CPSC107: {
    answerContract: [
      '答案必须优先匹配 CPSC107 的 HtDF/HtDD、template-origin、local/helper、genrec、accumulator/worklist 等课程配方。',
      'Racket 解法不是只要能跑；必须说明数据定义如何推出模板，模板如何推出 body。',
      '不要引入课程未学工具，如 match、for/list、hash table、mutation/set!，除非题面明确允许。',
      'search/graph 题要先分清普通 genrec、try-catch、tail-recursive worklist、visited/path accumulator。',
    ],
    diagnosisContract: [
      'HtDF 错误：signature/purpose/tests/stub/template-origin/definition 顺序或顶层位置错误。',
      '模板错误：只看题目关键词，没有从 data definition / template rules 推出递归结构。',
      'local 边界错误：把公开 HtDF tags 或 check-expect 塞进 local helper。',
      'search/tail recursion 错误：没有说明 todo/worklist、visited、accumulator invariant 和更新规则。',
    ],
    reviewContract: [
      '复习从一道小题检查 recipe artifact，再升级到模板选择，再升级到完整函数实现。',
      '对 search + tail recursion 薄弱者，先手算一轮 worklist/visited 更新，再写代码。',
      '对 template-origin 薄弱者，先让学生标出数据形状和 helper 关系，再写 body。',
    ],
    ragBoundary: [
      '完整 Racket 讲义、每本 notebook 的长例子、题库原文和所有 check-expect 细节走 RAG。',
      '静态长期记忆只保留课程配方、工具边界、错误类型和提交检查清单。',
      '普通 Racket 语法定义不进长期记忆，除非影响本课配方或 DrRacket 求值判断。',
    ],
  },
  CSC108: {
    answerContract: [
      '答案必须先识别当前 notebook 已学工具，选择最朴素的 Python 解法。',
      '函数题保留题目给的 header、type annotation、参数名和 starter docstring。',
      '实现写在 docstring 后面；函数内返回结果，不额外 print，除非题目要求输出。',
      '不要为早期章节引入 list comprehension、lambda、异常、dataclass、pathlib、pandas、numpy 等未学工具。',
    ],
    diagnosisContract: [
      'docstring 错误：改写/删除 starter docstring，或没有把 docstring 当 contract 读。',
      'return/print 错误：函数产生 None、把屏幕输出当返回值，或把测试代码写进函数体。',
      '状态追踪错误：没有跟踪变量当前值、类型、mutation/aliasing、文件指针或 accumulator。',
      '边界错误：空字符串/list/dict/file、单元素、重复值、大小写、换行或 range end 少 1。',
    ],
    reviewContract: [
      '复习函数设计时先让学生复述 header 和 docstring contract，再补 body。',
      '追踪题复习要画变量表或状态表，而不是只给最终输出。',
      '代码题复习优先用一个普通 case 和一个边界 case 验证修复。',
    ],
    ragBoundary: [
      '完整题库、exam PDF、public/secret tests 和长代码答案走题库/RAG。',
      '静态长期记忆只保留 docstring contract、章节工具边界、错误类型和检查清单。',
      '普通 Python API 用法不重复存，除非本课 starter 或判题规则有特殊要求。',
    ],
  },
  CSC148: {
    answerContract: [
      '答案必须按 CSC148 的 Function Design Recipe、Class Design Recipe、ADT、Linked List、Tree、BST 模板组织。',
      '类题优先检查 docstring、public attributes、representation invariants、public interface 和 mutation contract。',
      'annotation 只声明属性类型，不创建 instance attribute；真正创建发生在 __init__ 或方法赋值。',
      '不要把通用 Python 技巧顶替课程模板；数据结构题要解释 object identity、aliasing、mutation 和 recursive representation。',
    ],
    diagnosisContract: [
      'recipe 错误：header/docstring/precondition/examples/body 顺序或职责不清。',
      'RI 错误：没有维护 representation invariant，或没有用 invariant 判断 method 是否正确。',
      'memory model 错误：混淆 rebinding 与 mutation，aliasing 追踪错误。',
      'data-structure 错误：把 Python list 思维套到 linked list/tree/BST，忽略 empty/head/leaf/invariant case。',
    ],
    reviewContract: [
      '复习 OOP 时先让学生说清 class contract、attributes、RI，再看方法体。',
      '复习 linked list/tree/BST 时先画对象/节点结构，再写 traversal 或 recursive case。',
      '对 runtime 薄弱者，先定义 input size，再找主导步骤，不从代码行数猜复杂度。',
    ],
    ragBoundary: [
      '完整 production questions、starter code、树/链表长模板和 exam 原文走题库/RAG。',
      '静态长期记忆只保存课程 recipe、class/RI 本地约定、数据结构模板和错误类型。',
      '普通 OOP 定义不进长期记忆；像 Tweet 这种本课 class contract 的 attributes 和 RI 才进长期记忆。',
    ],
  },
  MAT102: {
    answerContract: [
      '答案必须 proof-first：先识别命题结构，再选择证明模板，最后写可检查的数学文字。',
      '每一步都要说明使用的定义或定理，不用例子代替证明。',
      '存在命题给 witness；任意命题取 arbitrary object；集合相等证明双向包含。',
      '关系、函数、数论、群论题必须先写 universe/domain/operation，再逐条验证定义。',
    ],
    diagnosisContract: [
      '逻辑骨架错误：量词否定、蕴含/逆否、iff 双向证明不完整。',
      '证明目标错误：把结论写进假设，或用特殊例子替代任意证明。',
      '定义展开错误：subset/image/preimage/injective/surjective/divides/congruence/kernel/subgroup 没有按定义写。',
      '结构验证错误：关系性质、群公理、homomorphism operation 或 kernel identity 漏项。',
    ],
    reviewContract: [
      '复习时先让学生把题目翻译成逻辑形式，再选 proof template。',
      '每次只练一个证明动作：arbitrary object、witness、双向包含、induction step 或 subgroup test。',
      '错题复盘要指出缺失的是定义、量词、证明方向还是结构条件。',
    ],
    ragBoundary: [
      '完整题库、长证明、课程例题和群论/数论具体题面走 RAG。',
      '静态长期记忆只保留 proof templates、常见错因、定义展开顺序和检查清单。',
      '普通数学定义不大量静态注入，除非本课证明写法有特殊口径。',
    ],
  },
  MAT136: {
    answerContract: [
      '答案必须先分类题型，再选择计算、判别或建模模板。',
      '计算题先写结构再化简；判别题先说明 test 及适用条件；建模题先定义变量/区域再写 integral。',
      '必须保留区间、端点、危险点、正负性、单调性、收敛测试前提、series center 和 endpoint 检查。',
      '概念解释要说明为什么工具适用，不只给最后数值。',
    ],
    diagnosisContract: [
      '模板选择错误：u-sub、trig-sub、parts、comparison、ratio、Taylor 或几何切片选错。',
      '条件遗漏：反常积分危险点、series divergence test、endpoint、positive/decreasing 条件漏写。',
      '变量/边界错误：上下限、differential、切片方向、top-bottom/right-left 不一致。',
      '概念混淆：sequence a_n 与 series sum a_n、radius 与 interval、area 与 volume 混淆。',
    ],
    reviewContract: [
      '复习先做题型分类，再做模板选择，再做条件检查，最后才计算。',
      '对级数薄弱者先练 divergence/geometric/p-series/comparison/ratio 的选择条件。',
      '对积分建模薄弱者先画区域、定变量、写未化简 integral，再求值。',
    ],
    ragBoundary: [
      '完整讲义、长例题、每页图像/讲解稿和题库走 RAG。',
      '静态长期记忆只保留模板选择规则、条件检查、常见错因和复习路线。',
      '标准 Calculus 公式不重复静态存，除非课程讲义强调了特殊符号或步骤。',
    ],
  },
};

export function normalizeTeachingControlCourseCode(courseCode) {
  const code = String(courseCode || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (code.includes('CPSC107')) return 'CPSC107';
  if (code.includes('CSC108')) return 'CSC108';
  if (code.includes('CSC148')) return 'CSC148';
  if (code.includes('MAT102')) return 'MAT102';
  if (code.includes('MAT136')) return 'MAT136';
  return code || 'GENERAL';
}

export function getTeachingControlProfile(courseCode) {
  const normalized = normalizeTeachingControlCourseCode(courseCode);
  return {
    ...DEFAULT_PROFILE,
    ...(TEACHING_CONTROL_COURSE_PROFILES[normalized] || {}),
  };
}

export function teachingControlMemoryKind(level) {
  return level === 'course' ? 'course_teaching_control' : 'notebook_teaching_control';
}

export function teachingControlMemoryReason(courseCode, level) {
  const normalized = normalizeTeachingControlCourseCode(courseCode);
  return level === 'course'
    ? `${normalized} 教学控制记忆：控制答题模板、错误诊断、复习计划和 RAG 边界。`
    : `${normalized} 笔记本教学控制记忆：控制当前单元的答题模板、诊断检查和下一步教学动作。`;
}

export function withTeachingControlSourceReference(sourceReferences, extra = {}) {
  const existing = Array.isArray(sourceReferences) ? sourceReferences : [];
  const legacyMetadata =
    sourceReferences && !Array.isArray(sourceReferences) ? sourceReferences : null;
  const title = extra.notebookName
    ? `${extra.notebookName} teaching control source`
    : `${extra.courseId || extra.legacyMemoryId || 'course'} teaching control source`;
  return [
    {
      order: 1,
      title,
      why: `Generated by ${TEACHING_CONTROL_VERSION} from ${extra.textSource || extra.maintainedBy || 'maintenance memory source'}.`,
      memorySystem: TEACHING_CONTROL_VERSION,
      ...extra,
      legacyMetadata,
    },
    ...existing,
  ];
}

function formatBullets(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function compactLegacyText(text, maxChars = 12000) {
  const normalized = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}\n\n[legacy detail truncated; retrieve full source through source/RAG if needed]`;
}

function deriveNotebookControlFocus({ title, legacyText }) {
  const haystack = `${title || ''}\n${legacyText || ''}`;
  const signals = [];
  if (/docstring|function design|precondition|doctest/i.test(haystack)) {
    signals.push(
      '本单元优先检查 function contract、docstring/examples、precondition 和 return type。',
    );
  }
  if (/class|__init__|self|representation invariant|ri\b/i.test(haystack)) {
    signals.push(
      '本单元优先检查 class contract、attributes、RI、method mutation 和 public interface。',
    );
  }
  if (/linked list|_node|head|next/i.test(haystack)) {
    signals.push('本单元优先画节点引用，检查 empty/head/current/previous 指针变化。');
  }
  if (/tree|bst|binarysearchtree/i.test(haystack)) {
    signals.push('本单元优先根据 empty/leaf/subtree 或 BST invariant 分 case。');
  }
  if (/htdf|htdd|template-origin|check-expect|racket/i.test(haystack)) {
    signals.push('本单元优先按 HtDF/HtDD artifact 和 template-origin 判断答案形状。');
  }
  if (/series|integral|taylor|improper|ratio test|comparison/i.test(haystack)) {
    signals.push('本单元优先做题型分类、适用条件检查和端点/危险点检查。');
  }
  if (/proof|subset|bijection|induction|homomorphism|kernel|subgroup/i.test(haystack)) {
    signals.push('本单元优先展开定义、确认量词和 proof template。');
  }
  return signals.length
    ? signals
    : ['本单元先按课程级教学控制判断题型，再使用 legacy 操作材料里的局部模板和检查点。'];
}

export function buildTeachingControlMemoryText({
  courseCode,
  level,
  title,
  legacyText,
  notebookId,
  notebookTitle,
}) {
  const normalizedCourseCode = normalizeTeachingControlCourseCode(courseCode);
  const profile = getTeachingControlProfile(normalizedCourseCode);
  const isCourse = level === 'course';
  const focus = isCourse
    ? [`${normalizedCourseCode} 课程级控制：后续答疑、题解、诊断和复习计划都先读这里。`]
    : deriveNotebookControlFocus({ title: notebookTitle || title, legacyText });
  const targetLine = isCourse
    ? `course:${normalizedCourseCode}`
    : `notebook:${notebookId || notebookTitle || title || 'unknown'}`;

  return [
    `## 教学控制记忆 (${TEACHING_CONTROL_VERSION})`,
    `target: ${targetLine}`,
    `role: ${isCourse ? 'course controller' : 'notebook specialist'}`,
    '',
    '这条记忆不是资料摘要。它控制下一次回答怎么贴合课程、怎么诊断学生、怎么安排复习，以及哪些内容应该走 RAG。',
    '',
    '## 静态注入优先级',
    '1. 结构化当前事实：课程/用户/当前目标等精确值。',
    '2. 短期学生状态：会什么、不会什么、为什么不会、下一步怎么教。',
    `3. ${isCourse ? '课程级答题控制' : '当前笔记本局部模板和检查点'}。`,
    '4. 动态发现：题库、讲义原文、长例题和历史尝试。',
    '',
    '## 本层控制焦点',
    formatBullets(focus),
    '',
    '## Answer contract',
    formatBullets(profile.answerContract),
    '',
    '## Common mistakes',
    formatBullets(profile.diagnosisContract),
    '',
    '## Validation checklist',
    formatBullets(profile.reviewContract),
    '',
    '## 禁止事项',
    formatBullets(profile.ragBoundary),
    '',
    '## Legacy 操作材料',
    '以下内容只作为可检索的局部操作材料。静态回答时优先使用上面的教学控制；需要具体 API、例题或长细节时再动态召回这里。',
    '',
    compactLegacyText(legacyText),
  ]
    .filter(Boolean)
    .join('\n');
}
