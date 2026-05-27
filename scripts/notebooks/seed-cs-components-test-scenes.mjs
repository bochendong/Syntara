import { buildSceneActions } from './seed-cs-components-test-actions.mjs';

export const NOTEBOOK_ID = 'nb-cs-components-test';

function defaultCanvas(id, accent = '#007FA3') {
  return {
    id: `slide_${id}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: {
      backgroundColor: '#f8fafc',
      themeColors: [accent, '#0f766e', '#C8102E', '#7c3aed', '#111827'],
      fontColor: '#111827',
      fontName: 'Inter',
      outline: { color: accent, width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [],
    background: {
      type: 'solid',
      color: '#f8fafc',
    },
    type: 'content',
  };
}

function doc(title, blocks, options = {}) {
  return {
    version: 1,
    language: 'zh-CN',
    profile: 'code',
    disciplineStyle: 'code',
    teachingFlow: options.teachingFlow || 'code_walkthrough',
    layout: options.layout || { mode: 'stack' },
    layoutFamily: options.layoutFamily || 'code_walkthrough',
    density: options.density || 'standard',
    visualRole: 'none',
    overflowPolicy: 'compress_first',
    archetype: options.archetype || 'example',
    pattern: options.pattern || 'auto',
    title,
    blocks,
  };
}

function slideScene(order, title, blocks, options = {}) {
  const id = `${NOTEBOOK_ID}-p${String(order + 1).padStart(2, '0')}`;
  return {
    id,
    notebookId: NOTEBOOK_ID,
    title,
    type: 'slide',
    order,
    content: {
      type: 'slide',
      canvas: defaultCanvas(id, options.accent),
      semanticDocument: doc(title, blocks, options),
      semanticRenderVersion: 56,
      semanticRenderMode: 'auto',
      webRenderMode: 'scroll',
    },
    actions: buildSceneActions(id, order, title, blocks),
    whiteboard: null,
  };
}

function doublyNode(id, label, prev, next, options = {}) {
  return {
    id,
    label,
    fields: [
      { name: 'prev', value: prev },
      { name: 'item', value: `'${label}'` },
      { name: 'next', value: next },
    ],
    ...options,
  };
}

function doublyLinks(pairs, activeLabels = []) {
  const active = new Set(activeLabels);
  return pairs.flatMap(([from, to]) => [
    { from, to, label: 'next', active: active.has(`${from}.next`) },
    { from: to, to: from, label: 'prev', active: active.has(`${to}.prev`) },
  ]);
}

export function buildScenes() {
  return [
    slideScene(
      0,
      'CS 组件渲染测试：总览',
      [
        {
          type: 'paragraph',
          text: '这份测试 deck 用来检查计算机课专属语义组件：代码追踪、内存模型、递归调用栈、链表、普通树、BST、Stack、Queue、Dictionary 和不变量检查。',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '程序怎么跑',
              text: 'Trace 组件显示当前行、变量状态和执行步骤。',
              tone: 'info',
            },
            {
              title: '对象在哪里',
              text: 'Memory 组件区分 stack 变量、heap 对象和引用。',
              tone: 'success',
            },
            {
              title: '结构是否正确',
              text: 'LinkedList、Tree、BST、Stack、Queue、Invariant 组件用来讲数据结构的操作顺序和合法性。',
              tone: 'warning',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '测试目标',
          text: '每一页都应该能独立表达一个 CS mental model，而不是退化成普通知识点卡片。',
        },
      ],
      { archetype: 'intro', layoutFamily: 'cover', teachingFlow: 'concept_explain' },
    ),
    slideScene(
      1,
      'Trace：nested loop 逐步执行',
      [
        {
          type: 'code_trace',
          title: '追踪 count_target',
          language: 'python',
          code: 'def count_target(grid: list[list[int]], target: int) -> int:\n    count = 0\n    for row_index, row in enumerate(grid):\n        for col_index, value in enumerate(row):\n            if value == target:\n                count += 1\n    return count\n\nanswer = count_target([[1, 2, 1], [3, 1]], 1)',
          inputs: [
            { name: 'grid', value: '[[1, 2, 1], [3, 1]]' },
            { name: 'target', value: '1' },
          ],
          activeLines: [2, 3, 4, 5, 6, 7],
          steps: [
            {
              line: 2,
              state: [{ name: 'count', value: '0' }],
              explanation:
                '进入函数后先设 count 为 0。先不要数最终答案；count 只会在第 6 行真正执行时改变。',
            },
            {
              line: 3,
              state: [
                { name: 'row_index', value: '0' },
                { name: 'row', value: '[1, 2, 1]' },
                { name: 'count', value: '0' },
              ],
              explanation:
                '外层 loop 先选中第 0 行。此时 row index 是 0，row 是 [1, 2, 1]；接下来内层 loop 会在这一行里从左到右移动。',
            },
            {
              line: 4,
              state: [
                { name: 'row_index', value: '0' },
                { name: 'col_index', value: '0' },
                { name: 'value', value: '1' },
                { name: 'count', value: '0' },
              ],
              explanation:
                '内层 loop 从这一行的第 0 格开始。注意 row index 仍然是 0，变化的是 col index 和 value。现在 value 是 1，要交给第 5 行判断。',
            },
            {
              line: 6,
              state: [
                { name: 'value', value: '1' },
                { name: 'target', value: '1' },
                { name: 'count', value: '1' },
              ],
              explanation:
                '第 5 行判断通过，所以第 6 行才执行。count 从 0 变成 1；这一次增加来自第 0 行第 0 格。',
            },
            {
              line: 4,
              state: [
                { name: 'row_index', value: '0' },
                { name: 'col_index', value: '1' },
                { name: 'value', value: '2' },
                { name: 'count', value: '1' },
              ],
              explanation:
                '还在第 0 行。外层没有动，row index 仍然是 0；内层向右移动，col index 变成 1，value 变成 2。',
            },
            {
              line: 5,
              state: [
                { name: 'value', value: '2' },
                { name: 'target', value: '1' },
                { name: 'count', value: '1' },
              ],
              explanation: '第 5 行判断不通过，所以第 6 行不会执行。count 没有机会改变，仍然是 1。',
            },
            {
              line: 4,
              state: [
                { name: 'row_index', value: '0' },
                { name: 'col_index', value: '2' },
                { name: 'value', value: '1' },
                { name: 'count', value: '1' },
              ],
              explanation:
                '仍然在第 0 行，内层移动到第 2 格。row index 不变，col index 变成 2，value 又变成 1。',
            },
            {
              line: 6,
              state: [
                { name: 'value', value: '1' },
                { name: 'target', value: '1' },
                { name: 'count', value: '2' },
              ],
              explanation:
                '第 5 行再次通过，所以第 6 行执行。count 从 1 变成 2；到这里，第 0 行已经被内层 loop 扫完。',
            },
            {
              line: 3,
              state: [
                { name: 'row_index', value: '1' },
                { name: 'row', value: '[3, 1]' },
                { name: 'count', value: '2' },
              ],
              explanation:
                '第 0 行扫完以后，控制权回到外层 loop。外层选中第 1 行，row index 变成 1；新的内层 loop 会从 col index 为 0 重新开始。',
            },
            {
              line: 5,
              state: [
                { name: 'row_index', value: '1' },
                { name: 'col_index', value: '0' },
                { name: 'value', value: '3' },
                { name: 'count', value: '2' },
              ],
              explanation:
                '现在看第 1 行第 0 格。value 是 3，第 5 行判断不通过，所以第 6 行不会执行，count 保持 2。',
            },
            {
              line: 6,
              state: [
                { name: 'row_index', value: '1' },
                { name: 'col_index', value: '1' },
                { name: 'value', value: '1' },
                { name: 'count', value: '3' },
              ],
              explanation:
                '内层移动到第 1 行第 1 格，value 是 1。判断通过后第 6 行执行，count 从 2 变成 3。',
            },
            {
              line: 7,
              state: [{ name: 'return', value: '3' }],
              explanation:
                '所有 row 都扫完以后才返回 count。这个 3 不是猜出来的，而是第 6 行一共执行了三次。',
            },
          ],
          output: '3',
        },
      ],
      { accent: '#007FA3' },
    ),
    slideScene(
      2,
      'Memory：aliasing 与对象引用',
      [
        {
          type: 'memory_diagram',
          title: 'Memory Trace：list 参数传递',
          language: 'python',
          code: "def shout_at(words: list[str], index: int) -> None:\n    words[index] = words[index].upper()\n\nsentence = ['winter', 'is', 'coming', 'believe', 'me!']\nshout_at(sentence, 3)\nafter_call = sentence",
          activeLines: [1, 2, 4, 5, 6],
          frames: [
            {
              name: '__main__',
              variables: [
                { name: 'sentence', value: 'ref', ref: 'id2' },
                { name: 'after_call', value: 'ref', ref: 'id2' },
              ],
              active: true,
            },
          ],
          stack: [
            { name: 'sentence', value: 'ref', ref: 'id2' },
            { name: 'after_call', value: 'ref', ref: 'id2' },
          ],
          heap: [
            {
              id: 'id2',
              label: 'list',
              fields: [
                { name: '0', value: 'id10' },
                { name: '1', value: 'id11' },
                { name: '2', value: 'id12' },
                { name: '3', value: 'id15' },
                { name: '4', value: 'id14' },
              ],
              active: true,
            },
            { id: 'id10', label: 'str', fields: [{ name: 'value', value: 'winter' }] },
            { id: 'id11', label: 'str', fields: [{ name: 'value', value: 'is' }] },
            { id: 'id12', label: 'str', fields: [{ name: 'value', value: 'coming' }] },
            {
              id: 'id15',
              label: 'str',
              fields: [{ name: 'value', value: 'BELIEVE' }],
              active: true,
            },
            { id: 'id14', label: 'str', fields: [{ name: 'value', value: 'me!' }] },
          ],
          links: [{ from: 'sentence', to: 'id2', label: 'points to', active: true }],
          steps: [
            {
              title: '创建 list',
              line: 4,
              frames: [
                {
                  name: '__main__',
                  variables: [{ name: 'sentence', value: 'ref', ref: 'id2' }],
                  active: true,
                },
              ],
              stack: [{ name: 'sentence', value: 'ref', ref: 'id2' }],
              heap: [
                {
                  id: 'id2',
                  label: 'list',
                  fields: [
                    { name: '0', value: 'id10' },
                    { name: '1', value: 'id11' },
                    { name: '2', value: 'id12' },
                    { name: '3', value: 'id13' },
                    { name: '4', value: 'id14' },
                  ],
                  active: true,
                },
                { id: 'id10', label: 'str', fields: [{ name: 'value', value: 'winter' }] },
                { id: 'id11', label: 'str', fields: [{ name: 'value', value: 'is' }] },
                { id: 'id12', label: 'str', fields: [{ name: 'value', value: 'coming' }] },
                { id: 'id13', label: 'str', fields: [{ name: 'value', value: 'believe' }] },
                { id: 'id14', label: 'str', fields: [{ name: 'value', value: 'me!' }] },
              ],
              links: [{ from: 'sentence', to: 'id2', label: 'points to', active: true }],
              explanation: 'list 对象在 heap 中；`sentence` 这个变量只保存指向 `id2` 的引用。',
            },
            {
              title: '传入参数',
              line: 5,
              frames: [
                {
                  name: 'shout_at',
                  variables: [
                    { name: 'words', value: 'ref', ref: 'id2' },
                    { name: 'index', value: '3' },
                  ],
                  active: true,
                },
                {
                  name: '__main__',
                  variables: [{ name: 'sentence', value: 'ref', ref: 'id2' }],
                },
              ],
              stack: [{ name: 'sentence', value: 'ref', ref: 'id2' }],
              heap: [
                {
                  id: 'id2',
                  label: 'list',
                  fields: [
                    { name: '0', value: 'id10' },
                    { name: '1', value: 'id11' },
                    { name: '2', value: 'id12' },
                    { name: '3', value: 'id13' },
                    { name: '4', value: 'id14' },
                  ],
                  active: true,
                },
                { id: 'id10', label: 'str', fields: [{ name: 'value', value: 'winter' }] },
                { id: 'id11', label: 'str', fields: [{ name: 'value', value: 'is' }] },
                { id: 'id12', label: 'str', fields: [{ name: 'value', value: 'coming' }] },
                { id: 'id13', label: 'str', fields: [{ name: 'value', value: 'believe' }] },
                { id: 'id14', label: 'str', fields: [{ name: 'value', value: 'me!' }] },
              ],
              links: [
                { from: 'sentence', to: 'id2', label: 'argument' },
                { from: 'words', to: 'id2', label: 'parameter', active: true },
              ],
              explanation:
                '`shout_at(sentence, 3)` 不复制 list；参数 `words` 拿到的是同一个 `id2`。',
            },
            {
              title: '修改 list slot',
              line: 2,
              frames: [
                {
                  name: 'shout_at',
                  variables: [
                    { name: 'words', value: 'ref', ref: 'id2' },
                    { name: 'index', value: '3' },
                  ],
                  active: true,
                },
                {
                  name: '__main__',
                  variables: [{ name: 'sentence', value: 'ref', ref: 'id2' }],
                },
              ],
              stack: [{ name: 'sentence', value: 'ref', ref: 'id2' }],
              heap: [
                {
                  id: 'id2',
                  label: 'list',
                  fields: [
                    { name: '0', value: 'id10' },
                    { name: '1', value: 'id11' },
                    { name: '2', value: 'id12' },
                    { name: '3', value: 'id15' },
                    { name: '4', value: 'id14' },
                  ],
                  active: true,
                },
                { id: 'id10', label: 'str', fields: [{ name: 'value', value: 'winter' }] },
                { id: 'id11', label: 'str', fields: [{ name: 'value', value: 'is' }] },
                { id: 'id12', label: 'str', fields: [{ name: 'value', value: 'coming' }] },
                {
                  id: 'id15',
                  label: 'str',
                  fields: [{ name: 'value', value: 'BELIEVE' }],
                  active: true,
                },
                { id: 'id14', label: 'str', fields: [{ name: 'value', value: 'me!' }] },
              ],
              links: [
                { from: 'sentence', to: 'id2', label: 'same object' },
                { from: 'words', to: 'id2', label: 'mutates', active: true },
              ],
              explanation:
                '`words[index] = ...` 修改的是 `id2` 这个 list 的第 3 格，所以 `sentence` 之后也会看到变化。',
            },
            {
              title: '回到 main',
              line: 6,
              frames: [
                {
                  name: '__main__',
                  variables: [
                    { name: 'sentence', value: 'ref', ref: 'id2' },
                    { name: 'after_call', value: 'ref', ref: 'id2' },
                  ],
                  active: true,
                },
              ],
              stack: [
                { name: 'sentence', value: 'ref', ref: 'id2' },
                { name: 'after_call', value: 'ref', ref: 'id2' },
              ],
              heap: [
                {
                  id: 'id2',
                  label: 'list',
                  fields: [
                    { name: '0', value: 'id10' },
                    { name: '1', value: 'id11' },
                    { name: '2', value: 'id12' },
                    { name: '3', value: 'id15' },
                    { name: '4', value: 'id14' },
                  ],
                  active: true,
                },
                { id: 'id10', label: 'str', fields: [{ name: 'value', value: 'winter' }] },
                { id: 'id11', label: 'str', fields: [{ name: 'value', value: 'is' }] },
                { id: 'id12', label: 'str', fields: [{ name: 'value', value: 'coming' }] },
                {
                  id: 'id15',
                  label: 'str',
                  fields: [{ name: 'value', value: 'BELIEVE' }],
                  active: true,
                },
                { id: 'id14', label: 'str', fields: [{ name: 'value', value: 'me!' }] },
              ],
              links: [{ from: 'sentence', to: 'id2', label: 'reads', active: true }],
              explanation:
                '`after_call = sentence` 只是多了一个变量名；函数 frame 消失后，heap 里的 `id2` 仍然是同一个被修改过的 list。',
            },
          ],
          caption:
            '这个组件要让学生看见参数传递的本质：frame 可以变，变量名可以变，但引用的 object id 没变。',
        },
      ],
      { accent: '#0ea5e9' },
    ),
    slideScene(
      3,
      'Call Stack：递归调用与返回',
      [
        {
          type: 'code_trace',
          title: '递归 sum_ordinary',
          language: 'python',
          code: 'def sum_ordinary(lst: list[int]) -> int:\n    if lst == []:\n        return 0\n    return lst[0] + sum_ordinary(lst[1:])\n\nanswer = sum_ordinary([5, 1, 3, 9])',
          activeLines: [2, 3, 4, 6],
          steps: [
            {
              line: 6,
              state: [
                { name: 'phase', value: '第一次调用' },
                { name: 'event', value: 'answer 调用 id100，建立第一个栈帧。' },
                { name: 'call_stack', value: '__main__(answer=?) > sum_ordinary(lst=id100)' },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                '程序从 __main__ 调用 sum_ordinary。栈帧里的 lst 不是 list 本身，而是指向 heap 里的 id100。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '向下一层递归' },
                {
                  name: 'event',
                  value: '第一层暂停，lst[1:] 创建新 list id200，再调用 id200。',
                },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                '递归调用发生时，当前 frame 留在 stack 里等待；新的 frame 压到栈顶，参数 lst 指向 id200。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '继续压栈' },
                {
                  name: 'event',
                  value: '第二层也暂停，slice 又创建 id300。',
                },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; waiting=id1 + call(id300)) > sum_ordinary(lst=id300)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                '现在 stack 里有三层 sum_ordinary。每一层的 lst 变量都叫 lst，但它们指向不同的 list object。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '继续压栈' },
                { name: 'event', value: '第三层暂停，slice 创建只含 9 的 id400。' },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; waiting=id1 + call(id300)) > sum_ordinary(lst=id300; waiting=id3 + call(id400)) > sum_ordinary(lst=id400)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                '这一步开始很像你图里的结构：左边 stack 继续变高，右边 heap 里多了一个更短的 list。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '压到空列表' },
                { name: 'event', value: '第四层暂停，lst[1:] 创建空 list id500。' },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; waiting=id1 + call(id300)) > sum_ordinary(lst=id300; waiting=id3 + call(id400)) > sum_ordinary(lst=id400; waiting=id9 + call(id500)) > sum_ordinary(lst=id500)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id500:list[] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                '递归一直推进到空列表。此时栈顶的 lst 指向 id500，也就是 heap 里的 empty list。',
            },
            {
              line: 3,
              state: [
                { name: 'phase', value: 'base case' },
                { name: 'event', value: 'id500 这一层命中空列表，返回 0。' },
                { name: 'return_value', value: '0' },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; waiting=id1 + call(id300)) > sum_ordinary(lst=id300; waiting=id3 + call(id400)) > sum_ordinary(lst=id400; waiting=id9 + call(id500)) > sum_ordinary(lst=id500; return=0)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id500:list[] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                'base case 是 call stack 开始变矮的转折点。栈顶先返回，下面暂停的 frame 才会恢复。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '返回上一层' },
                { name: 'event', value: 'id400 这一层恢复，计算 9 + 0 = 9。' },
                { name: 'return_value', value: '9' },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; waiting=id1 + call(id300)) > sum_ordinary(lst=id300; waiting=id3 + call(id400)) > sum_ordinary(lst=id400; return=9)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id500:list[] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation: '现在不再创建新 list 了，而是沿着 call stack 往回计算返回值。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '继续回溯' },
                { name: 'event', value: 'id300 这一层恢复，计算 3 + 9 = 12。' },
                { name: 'return_value', value: '12' },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; waiting=id1 + call(id300)) > sum_ordinary(lst=id300; return=12)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id500:list[] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation: '返回时，heap 对象还在图里；真正变化的是哪些 stack frame 还没有弹出。',
            },
            {
              line: 4,
              state: [
                { name: 'phase', value: '继续回溯' },
                { name: 'event', value: 'id200 这一层恢复，计算 1 + 12 = 13。' },
                { name: 'return_value', value: '13' },
                {
                  name: 'call_stack',
                  value:
                    '__main__(answer=?) > sum_ordinary(lst=id100; waiting=id5 + call(id200)) > sum_ordinary(lst=id200; return=13)',
                },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id500:list[] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation: '每弹出一层，返回值就交给更下面那层继续相加。',
            },
            {
              line: 6,
              state: [
                { name: 'phase', value: '回到 __main__' },
                { name: 'event', value: 'id100 这一层返回 18，__main__ 得到 answer。' },
                { name: 'answer', value: '18' },
                { name: 'return_value', value: '18' },
                { name: 'call_stack', value: '__main__(answer=18)' },
                {
                  name: 'heap',
                  value:
                    'id100:list[0=id5,1=id1,2=id3,3=id9] | id200:list[0=id1,1=id3,2=id9] | id300:list[0=id3,1=id9] | id400:list[0=id9] | id500:list[] | id5:int=5 | id1:int=1 | id3:int=3 | id9:int=9',
                },
              ],
              explanation:
                '递归结束后，call stack 又只剩 __main__。这张图同时解释了栈帧、参数引用和 slice 产生的新 list。',
            },
          ],
          output: '18',
        },
      ],
      { accent: '#7c3aed' },
    ),
    slideScene(
      4,
      'LinkedList：节点与 next 指针',
      [
        {
          type: 'pointer_diagram',
          kind: 'linked_list',
          title: '在 curr 后插入节点 X',
          operation: '目标：把 A -> B -> C 变成 A -> B -> X -> C。',
          headLabel: 'front',
          nullLabel: 'None',
          nodes: [
            {
              id: 'n1',
              label: 'A',
              fields: [
                { name: 'item', value: "'A'" },
                { name: 'next', value: 'n2' },
              ],
              active: true,
            },
            {
              id: 'n2',
              label: 'B',
              fields: [
                { name: 'item', value: "'B'" },
                { name: 'next', value: 'nX' },
              ],
            },
            {
              id: 'nX',
              label: 'X',
              fields: [
                { name: 'item', value: "'X'" },
                { name: 'next', value: 'n3' },
              ],
              active: true,
            },
            {
              id: 'n3',
              label: 'C',
              fields: [
                { name: 'item', value: "'C'" },
                { name: 'next', value: 'None' },
              ],
            },
          ],
          pointers: [
            { name: 'front', to: 'n1' },
            { name: 'curr', to: 'n2' },
            { name: 'new', to: 'nX' },
          ],
          links: [
            { from: 'n1', to: 'n2', label: 'next' },
            { from: 'n2', to: 'nX', label: 'next', active: true },
            { from: 'nX', to: 'n3', label: 'next' },
          ],
          steps: [
            {
              title: '原始链表',
              operation: 'front -> A\ncurr -> B',
              explanation:
                '先确定插入位置：curr 指向 B。现在 B.next 是 C，所以 C 是插入点后面的第一个节点。',
              nodes: [
                {
                  id: 'n1',
                  label: 'A',
                  fields: [
                    { name: 'item', value: "'A'" },
                    { name: 'next', value: 'n2' },
                  ],
                },
                {
                  id: 'n2',
                  label: 'B',
                  fields: [
                    { name: 'item', value: "'B'" },
                    { name: 'next', value: 'n3' },
                  ],
                  active: true,
                },
                {
                  id: 'n3',
                  label: 'C',
                  fields: [
                    { name: 'item', value: "'C'" },
                    { name: 'next', value: 'None' },
                  ],
                },
              ],
              pointers: [
                { name: 'front', to: 'n1' },
                { name: 'curr', to: 'n2' },
              ],
              links: [
                { from: 'n1', to: 'n2', label: 'next' },
                { from: 'n2', to: 'n3', label: 'next', active: true },
              ],
            },
            {
              title: '创建新节点',
              operation: "new = _Node('X')",
              explanation:
                '新节点先只是一个独立节点，还没有进入链表。此时 front 能到达的链仍然是 A -> B -> C。',
              nodes: [
                {
                  id: 'n1',
                  label: 'A',
                  fields: [
                    { name: 'item', value: "'A'" },
                    { name: 'next', value: 'n2' },
                  ],
                },
                {
                  id: 'n2',
                  label: 'B',
                  fields: [
                    { name: 'item', value: "'B'" },
                    { name: 'next', value: 'n3' },
                  ],
                },
                {
                  id: 'n3',
                  label: 'C',
                  fields: [
                    { name: 'item', value: "'C'" },
                    { name: 'next', value: 'None' },
                  ],
                },
                {
                  id: 'nX',
                  label: 'X',
                  fields: [
                    { name: 'item', value: "'X'" },
                    { name: 'next', value: 'None' },
                  ],
                  active: true,
                  muted: true,
                },
              ],
              pointers: [
                { name: 'front', to: 'n1' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                { from: 'n1', to: 'n2', label: 'next' },
                { from: 'n2', to: 'n3', label: 'next' },
              ],
            },
            {
              title: '先接后半段',
              operation: 'new.next = curr.next',
              explanation:
                '先让 X.next 指向 C。这样即使下一步改掉 B.next，也不会丢失 C 以及它后面的整段链表。',
              nodes: [
                {
                  id: 'n1',
                  label: 'A',
                  fields: [
                    { name: 'item', value: "'A'" },
                    { name: 'next', value: 'n2' },
                  ],
                },
                {
                  id: 'n2',
                  label: 'B',
                  fields: [
                    { name: 'item', value: "'B'" },
                    { name: 'next', value: 'n3' },
                  ],
                },
                {
                  id: 'nX',
                  label: 'X',
                  fields: [
                    { name: 'item', value: "'X'" },
                    { name: 'next', value: 'n3' },
                  ],
                  active: true,
                },
                {
                  id: 'n3',
                  label: 'C',
                  fields: [
                    { name: 'item', value: "'C'" },
                    { name: 'next', value: 'None' },
                  ],
                },
              ],
              pointers: [
                { name: 'front', to: 'n1' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                { from: 'n1', to: 'n2', label: 'next' },
                { from: 'n2', to: 'n3', label: 'next' },
                { from: 'nX', to: 'n3', label: 'next', active: true },
              ],
            },
            {
              title: '再接前半段',
              operation: 'curr.next = new',
              explanation:
                '现在可以安全地把 B.next 改成 X。链表从 front 走下去会变成 A -> B -> X -> C。',
              nodes: [
                {
                  id: 'n1',
                  label: 'A',
                  fields: [
                    { name: 'item', value: "'A'" },
                    { name: 'next', value: 'n2' },
                  ],
                },
                {
                  id: 'n2',
                  label: 'B',
                  fields: [
                    { name: 'item', value: "'B'" },
                    { name: 'next', value: 'nX' },
                  ],
                  active: true,
                },
                {
                  id: 'nX',
                  label: 'X',
                  fields: [
                    { name: 'item', value: "'X'" },
                    { name: 'next', value: 'n3' },
                  ],
                  active: true,
                },
                {
                  id: 'n3',
                  label: 'C',
                  fields: [
                    { name: 'item', value: "'C'" },
                    { name: 'next', value: 'None' },
                  ],
                },
              ],
              pointers: [
                { name: 'front', to: 'n1' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                { from: 'n1', to: 'n2', label: 'next' },
                { from: 'n2', to: 'nX', label: 'next', active: true },
                { from: 'nX', to: 'n3', label: 'next' },
              ],
            },
            {
              title: '插入完成',
              operation: 'self._size += 1',
              explanation:
                '结构已经重接完成，最后更新 size。讲 linked list 时，核心是引用重连的顺序，而不是对象在内存里的地址。',
              nodes: [
                {
                  id: 'n1',
                  label: 'A',
                  fields: [
                    { name: 'item', value: "'A'" },
                    { name: 'next', value: 'n2' },
                  ],
                },
                {
                  id: 'n2',
                  label: 'B',
                  fields: [
                    { name: 'item', value: "'B'" },
                    { name: 'next', value: 'nX' },
                  ],
                },
                {
                  id: 'nX',
                  label: 'X',
                  fields: [
                    { name: 'item', value: "'X'" },
                    { name: 'next', value: 'n3' },
                  ],
                },
                {
                  id: 'n3',
                  label: 'C',
                  fields: [
                    { name: 'item', value: "'C'" },
                    { name: 'next', value: 'None' },
                  ],
                },
              ],
              pointers: [
                { name: 'front', to: 'n1' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                { from: 'n1', to: 'n2', label: 'next' },
                { from: 'n2', to: 'nX', label: 'next' },
                { from: 'nX', to: 'n3', label: 'next' },
              ],
            },
          ],
          caption: 'LinkedList 页应该突出 pointer rewiring：先保住后半段，再把前半段接到新节点。',
        },
      ],
      { accent: '#0f766e' },
    ),
    slideScene(
      5,
      'DoublyLinkedList：prev/next 双向重连',
      [
        {
          type: 'pointer_diagram',
          kind: 'linked_list',
          variant: 'doubly',
          title: '在 curr 后插入节点 X',
          operation: '目标：把 A <-> B <-> C 变成 A <-> B <-> X <-> C。',
          headLabel: 'head',
          tailLabel: 'tail',
          nullLabel: 'None',
          nodes: [
            doublyNode('n1', 'A', 'None', 'n2'),
            doublyNode('n2', 'B', 'n1', 'nX'),
            doublyNode('nX', 'X', 'n2', 'n3', { active: true }),
            doublyNode('n3', 'C', 'nX', 'None'),
          ],
          pointers: [
            { name: 'head', to: 'n1' },
            { name: 'tail', to: 'n3' },
            { name: 'curr', to: 'n2' },
            { name: 'new', to: 'nX' },
          ],
          links: doublyLinks(
            [
              ['n1', 'n2'],
              ['n2', 'nX'],
              ['nX', 'n3'],
            ],
            ['n2.next', 'nX.prev'],
          ),
          steps: [
            {
              title: '原始双向链表',
              operation: 'head -> A\ntail -> C\ncurr -> B',
              explanation:
                '先确认两个方向都合法：从 head 走 next 是 A、B、C；从 tail 走 prev 是 C、B、A。curr 指向 B，after 就是 B.next。',
              nodes: [
                doublyNode('n1', 'A', 'None', 'n2'),
                doublyNode('n2', 'B', 'n1', 'n3', { active: true }),
                doublyNode('n3', 'C', 'n2', 'None'),
              ],
              pointers: [
                { name: 'head', to: 'n1' },
                { name: 'tail', to: 'n3' },
                { name: 'curr', to: 'n2' },
              ],
              links: doublyLinks(
                [
                  ['n1', 'n2'],
                  ['n2', 'n3'],
                ],
                ['n2.next', 'n3.prev'],
              ),
            },
            {
              title: '创建新节点',
              operation: "new = _DNode('X')",
              explanation:
                'X 现在还不是链表的一部分。它的 prev 和 next 都是 None，所以从 head 或 tail 都走不到 X。',
              nodes: [
                doublyNode('n1', 'A', 'None', 'n2'),
                doublyNode('n2', 'B', 'n1', 'n3'),
                doublyNode('nX', 'X', 'None', 'None', { active: true, muted: true }),
                doublyNode('n3', 'C', 'n2', 'None'),
              ],
              pointers: [
                { name: 'head', to: 'n1' },
                { name: 'tail', to: 'n3' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: doublyLinks([
                ['n1', 'n2'],
                ['n2', 'n3'],
              ]),
            },
            {
              title: '先让 X 认识左边',
              operation: 'new.prev = curr',
              explanation:
                '先把 X.prev 指回 B。此时只是 X 知道自己的左邻居，B 还没有把 next 改到 X。',
              nodes: [
                doublyNode('n1', 'A', 'None', 'n2'),
                doublyNode('n2', 'B', 'n1', 'n3'),
                doublyNode('nX', 'X', 'n2', 'None', { active: true }),
                doublyNode('n3', 'C', 'n2', 'None'),
              ],
              pointers: [
                { name: 'head', to: 'n1' },
                { name: 'tail', to: 'n3' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                ...doublyLinks([
                  ['n1', 'n2'],
                  ['n2', 'n3'],
                ]),
                { from: 'nX', to: 'n2', label: 'prev', active: true },
              ],
            },
            {
              title: '再让 X 认识右边',
              operation: 'new.next = curr.next',
              explanation:
                '现在 X.next 指向 C。这样 X 同时知道左边是 B、右边是 C，但两边的旧节点还没有全部反向承认 X。',
              nodes: [
                doublyNode('n1', 'A', 'None', 'n2'),
                doublyNode('n2', 'B', 'n1', 'n3'),
                doublyNode('nX', 'X', 'n2', 'n3', { active: true }),
                doublyNode('n3', 'C', 'n2', 'None'),
              ],
              pointers: [
                { name: 'head', to: 'n1' },
                { name: 'tail', to: 'n3' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                ...doublyLinks([
                  ['n1', 'n2'],
                  ['n2', 'n3'],
                ]),
                { from: 'nX', to: 'n2', label: 'prev' },
                { from: 'nX', to: 'n3', label: 'next', active: true },
              ],
            },
            {
              title: '右边节点反向指回 X',
              operation: 'curr.next.prev = new',
              explanation:
                'C.prev 从 B 改成 X。双向链表的关键就在这里：只改 next 不够，右边节点的 prev 也必须同步。',
              nodes: [
                doublyNode('n1', 'A', 'None', 'n2'),
                doublyNode('n2', 'B', 'n1', 'n3'),
                doublyNode('nX', 'X', 'n2', 'n3', { active: true }),
                doublyNode('n3', 'C', 'nX', 'None', { active: true }),
              ],
              pointers: [
                { name: 'head', to: 'n1' },
                { name: 'tail', to: 'n3' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: [
                ...doublyLinks([['n1', 'n2']]),
                { from: 'n2', to: 'n3', label: 'next' },
                { from: 'nX', to: 'n2', label: 'prev' },
                { from: 'nX', to: 'n3', label: 'next' },
                { from: 'n3', to: 'nX', label: 'prev', active: true },
              ],
            },
            {
              title: '最后左边节点接到 X',
              operation: 'curr.next = new',
              explanation:
                '最后把 B.next 改成 X。现在从 head 往右是 A、B、X、C；从 tail 往左是 C、X、B、A。',
              nodes: [
                doublyNode('n1', 'A', 'None', 'n2'),
                doublyNode('n2', 'B', 'n1', 'nX', { active: true }),
                doublyNode('nX', 'X', 'n2', 'n3', { active: true }),
                doublyNode('n3', 'C', 'nX', 'None'),
              ],
              pointers: [
                { name: 'head', to: 'n1' },
                { name: 'tail', to: 'n3' },
                { name: 'curr', to: 'n2' },
                { name: 'new', to: 'nX' },
              ],
              links: doublyLinks(
                [
                  ['n1', 'n2'],
                  ['n2', 'nX'],
                  ['nX', 'n3'],
                ],
                ['n2.next', 'nX.prev'],
              ),
            },
          ],
          caption:
            '双向链表的讲解重点是双向 invariant：node.next.prev == node，node.prev.next == node。',
        },
      ],
      { accent: '#0f766e' },
    ),
    slideScene(
      6,
      'BST：搜索路径与 invariant',
      [
        {
          type: 'tree_diagram',
          kind: 'bst',
          title: '搜索 7',
          rootId: 'n8',
          target: '7',
          path: ['n8', 'n3', 'n6', 'n7'],
          decision: '7 < 8，向左；7 > 3，向右；7 > 6，向右，命中节点 7。',
          invariant: 'BST invariant：每个节点左子树的值都更小，右子树的值都更大。',
          nodes: [
            { id: 'n8', label: '8', left: 'n3', right: 'n10' },
            { id: 'n3', label: '3', left: 'n1', right: 'n6' },
            { id: 'n10', label: '10', right: 'n14' },
            { id: 'n1', label: '1' },
            { id: 'n6', label: '6', left: 'n4', right: 'n7' },
            { id: 'n14', label: '14' },
            { id: 'n4', label: '4' },
            { id: 'n7', label: '7', active: true },
          ],
          steps: [
            {
              title: '从 root 开始',
              current: 'n8',
              path: ['n8'],
              comparison: 'target = 7, current = 8',
              direction: 'left',
              result: '7 < 8，所以目标如果存在，只可能在 8 的左子树。',
            },
            {
              title: '比较节点 3',
              current: 'n3',
              path: ['n8', 'n3'],
              comparison: 'target = 7, current = 3',
              direction: 'right',
              result: '7 > 3，所以向右走；左子树里的值都小于 3，不可能有 7。',
            },
            {
              title: '比较节点 6',
              current: 'n6',
              path: ['n8', 'n3', 'n6'],
              comparison: 'target = 7, current = 6',
              direction: 'right',
              result: '7 > 6，所以继续去 6 的右子树。',
            },
            {
              title: '命中节点 7',
              current: 'n7',
              path: ['n8', 'n3', 'n6', 'n7'],
              comparison: 'target = 7, current = 7',
              direction: 'found',
              result: '当前节点的值等于目标值，搜索结束，返回这个节点。',
            },
          ],
          caption: 'BST 页应该突出每一步比较如何依赖 invariant 排除一半子树。',
        },
      ],
      { accent: '#f59e0b' },
    ),
    slideScene(
      7,
      'Tree：多叉树遍历',
      [
        {
          type: 'tree_diagram',
          kind: 'tree',
          title: '目录树 preorder traversal',
          rootId: 'root',
          path: ['root', 'src', 'components'],
          decision:
            '普通 tree 没有 left/right invariant；重点是 children 的顺序、当前节点、以及回溯到父节点。',
          invariant:
            'Tree invariant：每个非 root 节点只有一个 parent；从 root 沿 children 可以到达所有节点。',
          nodes: [
            { id: 'root', label: 'project', children: ['src', 'tests', 'docs'] },
            { id: 'src', label: 'src', children: ['components', 'lib', 'app'] },
            { id: 'tests', label: 'tests', children: ['unit', 'e2e'] },
            { id: 'docs', label: 'docs' },
            { id: 'components', label: 'components' },
            { id: 'lib', label: 'lib' },
            { id: 'app', label: 'app' },
            { id: 'unit', label: 'unit' },
            { id: 'e2e', label: 'e2e' },
          ],
          steps: [
            {
              title: '访问 root',
              current: 'root',
              path: ['root'],
              comparison: 'visit(project)',
              direction: 'visit',
              result: 'preorder 先处理当前节点，再按照 children 的顺序进入第一个 child。',
            },
            {
              title: '进入 src',
              current: 'src',
              path: ['root', 'src'],
              comparison: 'next child of project is src',
              direction: 'visit',
              result: 'src 不是二叉树节点，它有三个 children：components、lib、app。',
            },
            {
              title: '访问 components',
              current: 'components',
              path: ['root', 'src', 'components'],
              comparison: 'first child of src is components',
              direction: 'visit',
              result:
                'components 没有 children，是 leaf；访问完后要回到 src，继续看下一个 sibling。',
            },
            {
              title: '回到 src，继续 lib',
              current: 'lib',
              path: ['root', 'src', 'lib'],
              comparison: 'next sibling after components is lib',
              direction: 'backtrack',
              result: 'tree traversal 常见难点不是比较大小，而是记住“处理完 child 后回到 parent”。',
            },
            {
              title: '完成 src 子树',
              current: 'app',
              path: ['root', 'src', 'app'],
              comparison: 'last child of src is app',
              direction: 'aggregate',
              result:
                'components、lib、app 都处理完，src 子树完成，下一步会回到 project 去 tests。',
            },
          ],
          caption: '普通 Tree 页需要支持多叉 children，并把 traversal/backtracking 讲清楚。',
        },
      ],
      { accent: '#0891b2' },
    ),
    slideScene(
      8,
      'Graph：BFS frontier 与 visited',
      [
        {
          type: 'graph_trace',
          algorithm: 'bfs',
          title: '从 A 开始做 BFS',
          directed: false,
          startId: 'A',
          nodes: [
            { id: 'A', label: 'A', x: 120, y: 120 },
            { id: 'B', label: 'B', x: 300, y: 70 },
            { id: 'C', label: 'C', x: 300, y: 190 },
            { id: 'D', label: 'D', x: 500, y: 45 },
            { id: 'E', label: 'E', x: 500, y: 135 },
            { id: 'F', label: 'F', x: 500, y: 235 },
            { id: 'G', label: 'G', x: 660, y: 145 },
          ],
          edges: [
            { from: 'A', to: 'B' },
            { from: 'A', to: 'C' },
            { from: 'B', to: 'D' },
            { from: 'B', to: 'E' },
            { from: 'C', to: 'E' },
            { from: 'C', to: 'F' },
            { from: 'E', to: 'G' },
            { from: 'F', to: 'G' },
          ],
          steps: [
            {
              title: '初始化',
              action: 'enqueue',
              current: 'A',
              frontier: ['A'],
              visited: ['A'],
              order: [],
              explanation: '从 A 开始。BFS 会在发现节点时立刻标记 visited，并把它放进 queue。',
              result: 'queue = [A]',
            },
            {
              title: '取出 A',
              action: 'dequeue',
              current: 'A',
              frontier: [],
              visited: ['A'],
              order: ['A'],
              explanation: 'dequeue 取出队首 A，并把 A 放进访问顺序。接下来检查 A 的邻居。',
              result: 'order = A',
            },
            {
              title: '检查 A-B',
              action: 'enqueue',
              current: 'A',
              currentEdge: ['A', 'B'],
              frontier: ['B'],
              visited: ['A', 'B'],
              order: ['A'],
              activeEdges: ['A->B'],
              explanation: 'B 还没有 visited，所以把 B 标记为 visited，并加入 queue 队尾。',
              result: 'queue = [B]',
            },
            {
              title: '检查 A-C',
              action: 'enqueue',
              current: 'A',
              currentEdge: ['A', 'C'],
              frontier: ['B', 'C'],
              visited: ['A', 'B', 'C'],
              order: ['A'],
              activeEdges: ['A->B', 'A->C'],
              explanation: 'C 也是新发现的节点。B 已经排在前面，所以 C 加到 B 后面。',
              result: 'queue = [B, C]',
            },
            {
              title: '取出 B',
              action: 'dequeue',
              current: 'B',
              frontier: ['C'],
              visited: ['A', 'B', 'C'],
              order: ['A', 'B'],
              activeEdges: ['A->B', 'A->C'],
              explanation: 'B 在 queue 的 front，所以先处理 B，而不是刚加入较晚的 C。',
              result: 'order = A, B',
            },
            {
              title: '扩展 B 的邻居',
              action: 'enqueue',
              current: 'B',
              currentEdge: ['B', 'D'],
              frontier: ['C', 'D', 'E'],
              visited: ['A', 'B', 'C', 'D', 'E'],
              order: ['A', 'B'],
              activeEdges: ['A->B', 'A->C', 'B->D', 'B->E'],
              explanation: 'D 和 E 都是第一次发现，按 adjacency list 的顺序加入队尾。',
              result: 'queue = [C, D, E]',
            },
            {
              title: '取出 C，跳过 E',
              action: 'skip',
              current: 'C',
              currentEdge: ['C', 'E'],
              frontier: ['D', 'E', 'F'],
              visited: ['A', 'B', 'C', 'D', 'E', 'F'],
              order: ['A', 'B', 'C'],
              activeEdges: ['A->B', 'A->C', 'B->D', 'B->E', 'C->F'],
              explanation: 'C 的邻居 E 已经 visited，所以不能再入队；F 是新节点，所以加入队尾。',
              result: 'queue = [D, E, F]',
            },
            {
              title: '继续按 queue 顺序',
              action: 'done',
              current: 'D',
              frontier: ['E', 'F'],
              visited: ['A', 'B', 'C', 'D', 'E', 'F'],
              order: ['A', 'B', 'C', 'D'],
              activeEdges: ['A->B', 'A->C', 'B->D', 'B->E', 'C->F'],
              explanation: 'BFS 的层次感来自 queue：A 的邻居 B、C 会先于更远的 D、E、F 被处理。',
              result: '下一步会处理 E，再处理 F。',
            },
          ],
          invariant:
            'Graph traversal invariant：一个节点一旦进入 visited，就不能再次加入 frontier；否则有环时会重复处理。',
          caption: 'Graph 页重点支持 DFS/BFS 的 frontier、visited、order 和当前边检查。',
        },
      ],
      { accent: '#0ea5e9' },
    ),
    slideScene(
      9,
      'Stack：push/pop 与 LIFO',
      [
        {
          type: 'linear_structure',
          kind: 'stack',
          title: 'Undo 操作栈',
          operation: 'push(x) 把新操作放到栈顶；pop() 只能从栈顶拿走最近加入的操作。',
          items: [
            { id: 'open', label: 'open file' },
            { id: 'type', label: 'type text' },
            { id: 'format', label: 'format title', active: true },
          ],
          steps: [
            {
              title: '初始栈',
              operation: 'undo_stack',
              items: [
                { id: 'open', label: 'open file' },
                { id: 'type', label: 'type text' },
                { id: 'format', label: 'format title', active: true },
              ],
              focus: ['format'],
              explanation: '栈顶是最近发生的操作。undo 时，不需要扫描整段历史，只看栈顶即可。',
              result: 'top = format title',
            },
            {
              title: 'push(save)',
              operation: 'push(save file)',
              items: [
                { id: 'open', label: 'open file' },
                { id: 'type', label: 'type text' },
                { id: 'format', label: 'format title' },
                { id: 'save', label: 'save file', changed: true },
              ],
              focus: ['save'],
              explanation: '新操作总是压到栈顶。原来的元素顺序不变，只是最上面多了一格。',
              result: 'top = save file',
            },
            {
              title: 'pop()',
              operation: 'pop()',
              items: [
                { id: 'open', label: 'open file' },
                { id: 'type', label: 'type text' },
                { id: 'format', label: 'format title', active: true },
              ],
              focus: ['format'],
              explanation: 'pop 移除 save file，返回它；新的栈顶回到 format title。',
              result: 'returned save file',
            },
          ],
          caption: 'Stack 页强调 LIFO：最后进入的元素最先离开，两个操作都发生在同一端。',
        },
      ],
      { accent: '#0284c7' },
    ),
    slideScene(
      10,
      'Queue：enqueue/dequeue 与 FIFO',
      [
        {
          type: 'linear_structure',
          kind: 'queue',
          title: '打印任务队列',
          operation: 'enqueue 从队尾加入；dequeue 从队首移除，所以服务顺序保持先来先服务。',
          items: [
            { id: 'a', label: 'A.pdf', active: true },
            { id: 'b', label: 'B.pdf' },
            { id: 'c', label: 'C.pdf' },
          ],
          steps: [
            {
              title: '初始队列',
              operation: 'front -> back',
              items: [
                { id: 'a', label: 'A.pdf', active: true },
                { id: 'b', label: 'B.pdf' },
                { id: 'c', label: 'C.pdf' },
              ],
              focus: ['a'],
              explanation: 'A.pdf 最早进入，所以它在队首。下一次 dequeue 只能先处理 A.pdf。',
              result: 'front = A.pdf',
            },
            {
              title: 'enqueue(D.pdf)',
              operation: 'enqueue D.pdf',
              items: [
                { id: 'a', label: 'A.pdf' },
                { id: 'b', label: 'B.pdf' },
                { id: 'c', label: 'C.pdf' },
                { id: 'd', label: 'D.pdf', changed: true },
              ],
              focus: ['d'],
              explanation: '新任务只能加入队尾，不会插到 A、B、C 的前面。',
              result: 'back = D.pdf',
            },
            {
              title: 'dequeue()',
              operation: 'dequeue()',
              items: [
                { id: 'b', label: 'B.pdf', active: true },
                { id: 'c', label: 'C.pdf' },
                { id: 'd', label: 'D.pdf' },
              ],
              focus: ['b'],
              explanation: 'dequeue 移除队首 A.pdf；B.pdf 变成新的队首。队列讲的是两端职责不同。',
              result: 'returned A.pdf',
            },
          ],
          caption: 'Queue 页强调 FIFO：最早进入的元素最先离开，入队和出队发生在不同端。',
        },
      ],
      { accent: '#e11d48' },
    ),
    slideScene(
      11,
      'Dictionary：lookup 与 mutation',
      [
        {
          type: 'dictionary_diagram',
          title: 'scores 字典当前状态',
          operation:
            'dictionary 用 key 直接定位 value；mutation 会改变某个 key 对应的 value，而不是创建一个全新的 dict。',
          lookupKey: "'bob'",
          result: "scores['bob'] == 91",
          entries: [
            { key: "'amy'", value: '88' },
            {
              key: "'bob'",
              value: '91',
              active: true,
              changed: true,
              note: "record_score(scores, 'bob', 7) 刚更新了这个 entry。",
            },
            { key: "'chen'", value: '95' },
          ],
          caption:
            'Dictionary 页重点测试 key/value 映射、当前 lookup key、以及 mutation 后 value 的局部变化。',
        },
        {
          type: 'code_trace',
          title: '追踪 record_score',
          language: 'python',
          code: "def record_score(scores: dict[str, int], name: str, points: int) -> None:\n    if name in scores:\n        scores[name] += points\n    else:\n        scores[name] = points\n\nscores = {'amy': 88, 'bob': 84, 'chen': 95}\nrecord_score(scores, 'bob', 7)",
          inputs: [
            { name: 'scores', value: "{'amy': 88, 'bob': 84, 'chen': 95}" },
            { name: 'name', value: "'bob'" },
            { name: 'points', value: '7' },
          ],
          activeLines: [2, 3, 5],
          steps: [
            {
              line: 2,
              state: [
                { name: 'name', value: "'bob'" },
                { name: 'name in scores', value: 'True' },
              ],
              explanation: "先做 membership lookup：'bob' 是 scores 的一个 key，所以会走 if 分支。",
            },
            {
              line: 3,
              state: [
                { name: "scores['bob']", value: '84' },
                { name: 'points', value: '7' },
              ],
              explanation:
                "scores[name] 先读出旧 value：scores['bob'] 是 84。这里的 name 不是位置，而是 key。",
            },
            {
              line: 3,
              state: [
                { name: "scores['bob']", value: '91' },
                { name: 'scores', value: "{'amy': 88, 'bob': 91, 'chen': 95}" },
              ],
              explanation:
                "执行 += 后，只有 key 'bob' 对应的 value 从 84 变成 91，其他 entry 不变。",
            },
          ],
          output: "{'amy': 88, 'bob': 91, 'chen': 95}",
        },
      ],
      { accent: '#6366f1', density: 'dense' },
    ),
    slideScene(
      12,
      'Dictionary Trace：统计单词次数',
      [
        {
          type: 'code_trace',
          title: '追踪 count_words',
          language: 'python',
          code: "def count_words(words: list[str]) -> dict[str, int]:\n    counts = {}\n    for word in words:\n        if word in counts:\n            counts[word] += 1\n        else:\n            counts[word] = 1\n    return counts\n\nresult = count_words(['cat', 'dog', 'cat', 'cat'])",
          inputs: [{ name: 'words', value: "['cat', 'dog', 'cat', 'cat']" }],
          activeLines: [2, 3, 4, 5, 7, 8],
          steps: [
            {
              line: 2,
              state: [{ name: 'counts', value: '{}' }],
              explanation:
                '先创建空 dictionary。此时还没有任何 key，后面的循环会逐步把 word 放进去。',
            },
            {
              line: 3,
              state: [
                { name: 'word', value: "'cat'" },
                { name: 'counts', value: '{}' },
              ],
              explanation: "第一次循环，word 是 'cat'。注意 word 会作为 dictionary 的 key 使用。",
            },
            {
              line: 7,
              state: [
                { name: "'cat' in counts", value: 'False' },
                { name: "counts['cat']", value: '1' },
                { name: 'counts', value: "{'cat': 1}" },
              ],
              explanation:
                "'cat' 还不是 counts 的 key，所以走 else 分支，插入一个新 entry：'cat' -> 1。",
            },
            {
              line: 3,
              state: [
                { name: 'word', value: "'dog'" },
                { name: 'counts', value: "{'cat': 1}" },
              ],
              explanation: "第二次循环，word 是 'dog'。dictionary 里目前只有 'cat'。",
            },
            {
              line: 7,
              state: [
                { name: "'dog' in counts", value: 'False' },
                { name: "counts['dog']", value: '1' },
                { name: 'counts', value: "{'cat': 1, 'dog': 1}" },
              ],
              explanation: "'dog' 也不是已有 key，所以再插入一个新 entry：'dog' -> 1。",
            },
            {
              line: 3,
              state: [
                { name: 'word', value: "'cat'" },
                { name: 'counts', value: "{'cat': 1, 'dog': 1}" },
              ],
              explanation: "第三次循环又遇到 'cat'。这次 dictionary 已经有这个 key。",
            },
            {
              line: 5,
              state: [
                { name: "'cat' in counts", value: 'True' },
                { name: "counts['cat']", value: '2' },
                { name: 'counts', value: "{'cat': 2, 'dog': 1}" },
              ],
              explanation:
                "因为 'cat' 已存在，所以执行 counts[word] += 1，把旧 value 从 1 更新到 2。",
            },
            {
              line: 5,
              state: [
                { name: 'word', value: "'cat'" },
                { name: "counts['cat']", value: '3' },
                { name: 'counts', value: "{'cat': 3, 'dog': 1}" },
              ],
              explanation: "第四次循环还是 'cat'，再次更新同一个 key 的 value：2 变成 3。",
            },
            {
              line: 8,
              state: [{ name: 'return', value: "{'cat': 3, 'dog': 1}" }],
              explanation: '循环结束后返回 counts。最终 dictionary 记录每个 word 出现了几次。',
            },
          ],
          output: "{'cat': 3, 'dog': 1}",
        },
        {
          type: 'dictionary_diagram',
          title: '最终 counts 字典',
          operation:
            '这页强调：word 是 key；counts[word] 是通过 key 找到的 value；+= 只更新对应 key 的 value。',
          lookupKey: "'cat'",
          result: "counts['cat'] == 3",
          entries: [
            {
              key: "'cat'",
              value: '3',
              active: true,
              changed: true,
              note: "第三、四次循环都更新了 'cat' 这个 key。",
            },
            { key: "'dog'", value: '1', note: "'dog' 只出现一次，所以 value 保持 1。" },
          ],
          caption:
            '这个例子比单次 lookup 更适合 trace：它同时展示 insert 和 update 两种 dictionary mutation。',
        },
      ],
      { accent: '#4f46e5', density: 'dense' },
    ),
    slideScene(
      13,
      'Invariant：结构是否合法',
      [
        {
          type: 'invariant_panel',
          title: 'LinkedList invariant 检查',
          structure: 'LinkedList',
          invariant:
            'front 必须指向链表第一个节点；从 front 沿 next 走最终必须到 None；size 必须等于可达节点数量。',
          checks: [
            {
              label: 'front',
              text: 'front 指向 n1，n1 是链表第一个节点。',
              status: 'holds',
              reason: '没有节点在 n1 前面。',
            },
            {
              label: 'last.next',
              text: '最后一个可达节点 n3 的 next 是 None。',
              status: 'holds',
            },
            {
              label: 'size',
              text: 'size 记录为 4，但从 front 只能数到 3 个节点。',
              status: 'violated',
              reason: 'size 字段没有随删除操作更新。',
            },
            {
              label: 'cycle',
              text: '目前没有检测到 next 指针回到旧节点。',
              status: 'unknown',
              reason: '需要完整遍历或 visited set 才能确认。',
            },
          ],
          caption: 'Invariant 组件用于把“结构正确”讲成可检查的条件。',
        },
      ],
      { accent: '#84cc16' },
    ),
    slideScene(
      14,
      '综合测试：删除链表头节点',
      [
        {
          type: 'code_trace',
          title: 'delete_front',
          language: 'python',
          code: 'def delete_front(self) -> Any:\n    old_front = self._front\n    self._front = self._front.next\n    self._size -= 1\n    return old_front.item',
          activeLines: [2, 3, 4, 5],
          steps: [
            {
              line: 2,
              state: [{ name: 'old_front', value: 'n1' }],
              explanation: '先保存旧头节点，否则移动 front 后就不容易取出原来的 item。',
            },
            {
              line: 3,
              state: [{ name: 'self._front', value: 'n2' }],
              explanation: 'front 越过 n1，直接指向第二个节点。',
            },
            {
              line: 4,
              state: [{ name: 'self._size', value: '2' }],
              explanation: '结构变化后必须同步维护 size。',
            },
          ],
          output: "'A'",
        },
        {
          type: 'pointer_diagram',
          kind: 'linked_list',
          title: '删除后的结构',
          operation: 'front 已经从 n1 移到 n2；n1 变成不可达旧节点。',
          headLabel: 'front',
          nullLabel: 'None',
          nodes: [
            {
              id: 'n2',
              label: 'B',
              fields: [
                { name: 'item', value: "'B'" },
                { name: 'next', value: 'n3' },
              ],
              active: true,
            },
            {
              id: 'n3',
              label: 'C',
              fields: [
                { name: 'item', value: "'C'" },
                { name: 'next', value: 'None' },
              ],
            },
          ],
          pointers: [{ name: 'front', to: 'n2' }, { name: 'old_front' }],
          links: [{ from: 'n2', to: 'n3', label: 'next', active: true }],
          caption: '综合页测试 Trace + LinkedList 在同一页的纵向排版。',
        },
        {
          type: 'invariant_panel',
          title: '删除后的 invariant',
          structure: 'LinkedList',
          invariant: 'front 指向第一个可达节点；最后节点 next is None；size 等于节点数。',
          checks: [
            {
              label: 'front',
              text: 'front 指向 n2，n2 是当前链表第一个可达节点。',
              status: 'holds',
            },
            {
              label: 'size',
              text: '可达节点是 n2 和 n3，size 也更新为 2。',
              status: 'holds',
            },
          ],
          caption: '这页用于检查多个 CS 组件堆叠时是否仍然清楚。',
        },
      ],
      { accent: '#C8102E', density: 'dense' },
    ),
  ];
}
