const PAGE_NARRATIONS = [
  [
    '我们先定一个标准：CSC148 的课件不只是呈现结论，而是要让学生看见程序运行时发生了什么。',
    '今天这套页面围绕三件事展开。第一，代码执行到哪一行；第二，变量和对象分别在哪里；第三，数据结构每次操作以后是否仍然合法。',
    '后面每一页都不要急着看答案。我们会先问：当前状态是什么，下一步为什么只能这样走。',
  ],
  [
    '先不要问最后答案是多少。nested loop trace 的第一件事，是分清楚现在在哪一层循环。',
    '外层 loop 负责选中一整行；一旦 row index 固定下来，内层 loop 才开始在这一行里移动 col index 和 value。',
    '所以我们每一步只问四件事：row index 有没有变，col index 有没有变，value 现在是多少，count 有没有因为第 6 行而增加。',
    '第 5 行是判断门。只有当前 value 等于 target，程序才会进入第 6 行；count 也只在第 6 行改变。',
  ],
  [
    '这一页我们处理 aliasing。很多 bug 来自一句误解：我把 list 传进函数，是不是复制了一份 list？答案通常是否定的。',
    '左边是 stack frame，里面放的是变量名和引用；右边是 heap object，真正的 list 和 string 对象在那里。',
    '看这页时要抓住一句话：变量名可以有多个，但它们可以指向同一个对象。只要改的是那个对象，所有引用都会看见变化。',
  ],
  [
    '递归最容易被讲成一句空话：函数调用自己。我们这里换一种看法：每次调用都会压入一个新的 frame，旧的 frame 暂停等待结果。',
    '左边的 call stack 从上到下表示谁正在运行，谁在等待。右边的 heap 显示每次 lst[1:] 创建出来的新 list。',
    '所以这页的重点不是背递归公式，而是看见 pending work：每一层都在等下一层返回以后，才能把自己的 lst[0] 加回去。',
  ],
  [
    '链表题不要先想成一串值，要先想成一串节点。每个节点有 item，也有 next；真正决定结构的是 next 指到哪里。',
    '这一页我们只关心指针动作。front 指向第一个节点，curr 或 prev 在遍历中移动，next 决定链条是否还连着。',
    '做链表操作时最重要的是顺序：先保留还需要的节点，再改指针。顺序错了，节点可能还在内存里，但从 front 已经找不到了。',
  ],
  [
    '双向链表不是把单链表多画一根线这么简单。每个节点同时维护 prev 和 next，所以一次插入通常要修四个方向关系。',
    '这一页看的是中间插入。我们先让新节点认识左右邻居，再让左右邻居反过来指向新节点。',
    '判断是否正确时不要只从 head 往右走，也要从 tail 往左走。两个方向都能互相对应，结构才真的合法。',
  ],
  [
    'BST 搜索不是遍历整棵树，而是不断用 invariant 排除不可能的区域。',
    '每一步只做一件事：把 target 和 current node 比较。如果 target 更小，就去左子树；如果更大，就去右子树。',
    '这页要让学生看到，连接线不是装饰。每一条左边、右边的边，都承载着“左小右大”这个规则。',
  ],
  [
    '现在把 BST 的大小规则拿掉，变成普通 tree。普通树也有 parent 和 children，但没有“左小右大”的承诺。',
    '所以遍历普通树时，不能通过比较值决定方向。我们只能按照 children 的顺序访问，并在访问完子树后回到父节点。',
    '这一页的目标是区分两件事：tree 的形状告诉我们能去哪；traversal rule 告诉我们按什么顺序去。',
  ],
  [
    'Graph traversal 和 tree traversal 最大的区别，是图可能有环，也可能从多个方向到达同一个节点。',
    '所以 BFS 和 DFS 都需要 frontier，也需要 visited。frontier 说明下一批要处理谁，visited 说明哪些节点已经被发现，不能重复加入。',
    '这一页先看 BFS。queue 的 front 决定谁先被处理；每检查一条边，都要问邻居是否已经 visited。',
  ],
  [
    'Stack 可以用 list 实现，但不能把它讲成普通 list。stack 的限制是：只允许在 top 这一端操作。',
    'push 把新元素放到 top，pop 也从 top 拿走元素。因此最后进入的元素，会最先离开。',
    '看这页时不要数所有位置，只看 top。top 在哪里，下一次 pop 就从哪里发生。',
  ],
  [
    'Queue 和 stack 的区别在端点职责。queue 有 front 和 back：front 负责离开，back 负责进入。',
    'enqueue 加到 back，dequeue 从 front 删除。所以最早进入的元素，会最早离开。',
    '这页要避免一个误区：queue 不是“反过来的 stack”，它是两个端点分工不同的数据结构。',
  ],
  [
    'Dictionary 的核心不是顺序，而是 key 到 value 的映射。我们关心的是这个 key 是否存在，以及它对应的 value 是什么。',
    'lookup 是读映射，mutation 是改映射。给同一个 key 重新赋值，不会多出一个同名 key，而是更新原来的 entry。',
    '这一页的讲法应该让学生形成一个动作链：查 key，取 value，必要时写回新的 value。',
  ],
  [
    '现在把 dictionary 放进真实代码里：统计单词次数。这个例子的关键是分支，而不是最终表格。',
    '每读到一个 word，都先问：这个 word 之前出现过吗？没出现过就初始化为 1，出现过就把旧值加 1。',
    '我们要训练的是 trace habit：每处理一个 token，counts 的状态都要能说清楚。',
  ],
  [
    'Invariant 是数据结构的承诺。只要结构处于合法状态，这些规则就必须成立。',
    '它不是写在最后的装饰句，而是每次操作之后都要重新检查的安全线。',
    '看这页时，我们不只问代码有没有跑完，还要问结构是否仍然满足 front、size、ordering 或 connectivity 这些承诺。',
  ],
  [
    '最后看一个综合操作：删除链表头节点。这个题同时考代码顺序、指针移动和 invariant。',
    '我们先看当前代码行，再看 front 和 old_front 怎么变，最后检查 size 和连通性。',
    '如果学生能把这三层同时说清楚，说明他们不是在背代码，而是在理解链表操作的执行过程。',
  ],
];

const PLAYABLE_STEP_BLOCK_TYPES = new Set([
  'code_trace',
  'memory_diagram',
  'pointer_diagram',
  'tree_diagram',
  'linear_structure',
]);

function computeBlockTargetIds(blocks) {
  const targetIds = Array.from({ length: blocks.length }, () => null);
  let sectionIndex = 0;
  let currentTitle = null;
  let currentOriginalIndexes = [];

  const pushCurrent = () => {
    if (!currentTitle && currentOriginalIndexes.length === 0) return;
    const sectionId = `block-section-${sectionIndex}`;
    currentOriginalIndexes.forEach((originalIndex, blockIndex) => {
      targetIds[originalIndex] = `${sectionId}-block-${blockIndex}`;
    });
    sectionIndex += 1;
    currentTitle = null;
    currentOriginalIndexes = [];
  };

  blocks.forEach((block, index) => {
    if (block?.type === 'heading') {
      pushCurrent();
      currentTitle = block.text || null;
      return;
    }
    currentOriginalIndexes.push(index);
  });
  pushCurrent();

  return targetIds;
}

function compactValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cleanSpeechText(text) {
  return String(text || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(
      /\b([A-Za-z][A-Za-z0-9]*)_([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z][A-Za-z0-9]*)*)\b/g,
      (_match, first, rest) => [first, ...String(rest).split('_')].join(' '),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeState(state) {
  if (!Array.isArray(state) || state.length === 0) return '';
  const hiddenInSpeech = new Set(['heap', 'call_stack']);
  const visibleState = state.filter((item) => !hiddenInSpeech.has(item?.name));
  const visible = visibleState
    .slice(0, 4)
    .map((item) => {
      const value = compactValue(item.value).replace(/[。.!！?？]+$/g, '');
      const compacted = value.length > 72 ? `${value.slice(0, 69)}...` : value;
      return `${cleanSpeechText(item.name || 'value')} = ${cleanSpeechText(compacted)}`;
    })
    .join('，');
  return visibleState.length > 4 ? `${visible}，还有 ${visibleState.length - 4} 个状态值` : visible;
}

function stepOpening(block, step, stepIndex, totalSteps) {
  const ordinal = `第 ${stepIndex + 1}/${totalSteps} 步`;
  switch (block?.type) {
    case 'code_trace':
      return typeof step?.line === 'number'
        ? `${ordinal}，先把注意力放到第 ${step.line} 行`
        : `${ordinal}，先看当前执行点`;
    case 'memory_diagram':
      return typeof step?.line === 'number'
        ? `${ordinal}，现在把代码行和内存图对齐到第 ${step.line} 行`
        : `${ordinal}，现在看 stack 和 heap 的对应关系`;
    case 'pointer_diagram':
      return `${ordinal}，先看哪些指针会改变，哪些节点必须保留下来`;
    case 'tree_diagram':
      return `${ordinal}，先定位当前节点，再决定下一条边`;
    case 'linear_structure':
      return `${ordinal}，先看操作发生在哪一端`;
    default:
      return ordinal;
  }
}

function buildStepNarration(block, step, stepIndex, totalSteps) {
  const fragments = [stepOpening(block, step, stepIndex, totalSteps)];
  if (step?.title) fragments.push(step.title);

  const explanation =
    step?.explanation || step?.detail || step?.note || step?.operation || step?.summary || '';
  if (explanation) fragments.push(explanation);

  const stateSummary = summarizeState(step?.state);
  if (stateSummary) fragments.push(`此时关键变量是：${stateSummary}`);

  if (block?.type === 'code_trace' && stepIndex + 1 < totalSteps) {
    fragments.push('下一步只看哪些变量会变，不要跳到最终答案');
  } else if (block?.type === 'memory_diagram') {
    fragments.push('注意变量名在 stack，真正被共享或修改的对象在 heap');
  } else if (block?.type === 'pointer_diagram') {
    fragments.push('改完以后，从 front 出发仍然应该能走到剩下的链表');
  } else if (block?.type === 'tree_diagram') {
    fragments.push('这一步的方向必须由当前结构规则决定');
  } else if (block?.type === 'linear_structure') {
    fragments.push('端点规则决定了这个结构和普通 list 的区别');
  }

  return cleanSpeechText(`${fragments.join('。')}。`.replace(/。+/g, '。'));
}

export function buildSceneActions(sceneId, order, title, blocks) {
  let actionIndex = 0;
  const nextId = (suffix) =>
    `${sceneId}-action-${String(actionIndex++).padStart(2, '0')}-${suffix}`;
  const actions = [
    {
      id: nextId('focus-header'),
      type: 'spotlight',
      title: '聚焦标题',
      elementId: 'header',
      dimOpacity: 0.42,
    },
  ];

  const narrationLines = PAGE_NARRATIONS[order] || [`这一页讲 ${title}。`];
  narrationLines.forEach((text, index) => {
    actions.push({
      id: nextId(`speech-${index + 1}`),
      type: 'speech',
      title: index === 0 ? '本页导入' : '讲解重点',
      text: cleanSpeechText(text),
      speed: 1,
    });
  });

  const blockTargetIds = computeBlockTargetIds(blocks);
  blocks.forEach((block, blockIndex) => {
    if (!PLAYABLE_STEP_BLOCK_TYPES.has(block?.type) || !Array.isArray(block.steps)) return;
    const blockId = blockTargetIds[blockIndex] || `block-section-0-block-${blockIndex}`;
    block.steps.forEach((step, stepIndex) => {
      actions.push({
        id: nextId(`step-${blockIndex + 1}-${stepIndex + 1}`),
        type: 'semantic_step',
        title: `步骤 ${stepIndex + 1}/${block.steps.length}`,
        blockId,
        stepIndex,
      });
      actions.push({
        id: nextId(`step-speech-${blockIndex + 1}-${stepIndex + 1}`),
        type: 'speech',
        title: `步骤 ${stepIndex + 1}/${block.steps.length}`,
        text: buildStepNarration(block, step, stepIndex, block.steps.length),
        speed: 1,
      });
    });
  });

  return actions;
}
