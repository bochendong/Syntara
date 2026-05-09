import { nanoid } from 'nanoid';
import type { Action } from '@/lib/types/action';
import type { NotebookContentBlock, NotebookContentDocument } from '@/lib/notebook-content';
import {
  buildSemanticSpotlightSections,
  flattenSemanticSpotlightTargets,
  type SemanticSpotlightBlockTarget,
} from '@/lib/notebook-content/semantic-spotlight';

type SupportedLanguage = 'zh-CN' | 'en-US';
type TeachingLens = 'syntax' | 'oop' | 'data_structure' | 'algorithm';
type CsTeachingTopic =
  | 'oop_representation'
  | 'oop_boundary'
  | 'oop_init'
  | 'oop_method'
  | 'oop_invariant'
  | 'oop_interface'
  | 'oop_design'
  | 'memory_aliasing'
  | 'doubly_linked_list'
  | 'linked_list'
  | 'bst'
  | 'tree_traversal'
  | 'tree'
  | 'graph_search'
  | 'stack'
  | 'queue'
  | 'linear_structure'
  | 'dictionary'
  | 'loop_trace'
  | 'recursion'
  | 'generic';

const OOP_TOPICS = new Set<CsTeachingTopic>([
  'oop_representation',
  'oop_boundary',
  'oop_init',
  'oop_method',
  'oop_invariant',
  'oop_interface',
  'oop_design',
  'memory_aliasing',
]);

const CS_BLOCK_TYPES = new Set<NotebookContentBlock['type']>([
  'paragraph',
  'bullet_list',
  'code_block',
  'code_walkthrough',
  'code_trace',
  'state_table',
  'call_stack',
  'memory_diagram',
  'pointer_diagram',
  'tree_diagram',
  'graph_trace',
  'invariant_panel',
  'dictionary_diagram',
  'linear_structure',
  'table',
  'callout',
  'definition',
  'example',
  'process_flow',
]);

function normalizeLanguage(language?: string): SupportedLanguage {
  return language === 'en-US' ? 'en-US' : 'zh-CN';
}

function cleanText(value: string | undefined): string {
  return (value || '')
    .replace(/\\par\b/g, ' ')
    .replace(/\\\s+/g, ' ')
    .replace(/\\code(?:\[[^\]]*])?\{([^{}]+)\}/g, '$1')
    .replace(/\\texttt\{([^{}]+)\}/g, '$1')
    .replace(/\\_/g, '_')
    .replace(/\\[()]/g, '')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/在学生已经理解[^，。；;]*后，?\s*进一步指出[:：]?/g, '')
    .replace(/本页用于连接([^。；;]+)的必要性/g, '现在把$1连起来看')
    .replace(/本页用于/g, '这里先看')
    .replace(/本页明确/g, '这里要看清')
    .replace(/进一步指出[:：]?/g, '接着看：')
    .replace(/\bself\s+dot\s+([A-Za-z_][A-Za-z0-9_]*)/gi, 'self.$1')
    .replace(/__init__/g, 'init 方法')
    .replace(/\bself\b/g, 'self')
    .replace(
      /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
      (_match, owner: string, method: string) => `${owner} 的 ${method.replace(/_/g, ' ')} 方法(`,
    )
    .replace(
      /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\b/g,
      (_match, owner: string, attributes: string) =>
        `${owner} 的 ${attributes
          .split('.')
          .map((attribute) => attribute.replace(/_/g, ' '))
          .join(' 的 ')} 属性`,
    )
    .replace(
      /\b_([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z][A-Za-z0-9]*)*)\b/g,
      (_match, name: string) => `私有 ${name.split('_').join(' ')}`,
    )
    .replace(
      /\b([A-Za-z][A-Za-z0-9]*)_([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z][A-Za-z0-9]*)*)\b/g,
      (_match, first: string, rest: string) => [first, ...rest.split('_')].join(' '),
    )
    .replace(/>=/g, ' 大于等于 ')
    .replace(/<=/g, ' 小于等于 ')
    .replace(/==/g, ' 等于 ')
    .replace(/\+=/g, ' 加上并保存为 ')
    .replace(/->/g, ' 返回 ')
    .replace(/\s+/g, ' ')
    .replace(/[。.!！?？]+$/g, '')
    .trim();
}

function isOopTopic(topic: CsTeachingTopic): boolean {
  return OOP_TOPICS.has(topic);
}

function spokenName(value: string | undefined): string {
  return cleanText(value)
    .replace(/_/g, ' ')
    .replace(/\bidx\b/g, 'index')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceJoin(language: SupportedLanguage, parts: Array<string | undefined | false>) {
  const cleaned = parts.map((part) => cleanText(part || '')).filter(Boolean);
  if (!cleaned.length) return language === 'en-US' ? 'Let us inspect this step.' : '我们看这一步。';
  const separator = language === 'en-US' ? '. ' : '。';
  const ending = language === 'en-US' ? '.' : '。';
  return `${cleaned.join(separator)}${ending}`;
}

function collectStringValues(value: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStringValues(item, depth + 1));
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
    if (['type', 'language', 'code', 'source', 'id', 'audioUrl'].includes(key)) return [];
    return collectStringValues(nested, depth + 1);
  });
}

function targetSearchText(
  title: string | undefined,
  targets: readonly SemanticSpotlightBlockTarget[],
) {
  return cleanText(
    [
      title,
      ...targets.map((target) => target.title),
      ...targets.map((target) => target.text),
      ...targets.flatMap((target) => collectStringValues(target.block).slice(0, 24)),
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();
}

function inferTopic(
  title: string | undefined,
  targets: readonly SemanticSpotlightBlockTarget[],
): CsTeachingTopic {
  const titleText = cleanText(title).toLowerCase();
  const text = targetSearchText(title, targets);
  const scores = new Map<CsTeachingTopic, number>();
  const add = (topic: CsTeachingTopic, amount: number, condition = true) => {
    if (!condition) return;
    scores.set(topic, (scores.get(topic) || 0) + amount);
  };
  const hasAny = (haystack: string, needles: string[]) =>
    needles.some((needle) => haystack.includes(needle.toLowerCase()));
  const hasOopSignal =
    /tweet|class|__init__|self\b|method|attribute|instance|object|invariant|类|对象|实例|属性|方法|初始化|不变量|表示不变式|设计类/i.test(
      `${titleText}\n${text}`,
    );
  const addNeedles = (topic: CsTeachingTopic, titleNeedles: string[], bodyNeedles: string[]) => {
    add(topic, 6, hasAny(titleText, titleNeedles));
    add(topic, 2, hasAny(text, bodyNeedles));
  };

  addNeedles(
    'graph_search',
    ['bfs', 'dfs', 'graph', '图搜索'],
    ['bfs', 'dfs', 'frontier', 'visited', 'graph', '邻居'],
  );
  addNeedles(
    'doubly_linked_list',
    ['doubly', '双向链表', 'prev/next'],
    ['doubly', '双向链表', 'prev 指针', 'prev/next'],
  );
  addNeedles(
    'linked_list',
    ['linked list', 'linkedlist', '链表'],
    ['linked list', '链表', 'next 指针', 'relink'],
  );
  addNeedles(
    'bst',
    ['bst', 'binary search tree', '二叉搜索树'],
    ['bst', 'binary search tree', '二叉搜索树', '左小右大'],
  );
  addNeedles(
    'tree_traversal',
    ['多叉树', 'tree traversal', '树遍历'],
    ['多叉树', 'tree traversal', 'children', 'root', '遍历'],
  );
  addNeedles(
    'recursion',
    ['递归', 'call stack', '调用栈'],
    ['recursive', 'recursion', '递归', 'call stack', '调用栈'],
  );
  addNeedles('stack', ['stack', 'push', 'pop', '栈'], ['stack', 'push', 'pop', 'lifo', '栈']);
  addNeedles(
    'queue',
    ['queue', 'enqueue', 'dequeue', '队列'],
    ['queue', 'enqueue', 'dequeue', 'fifo', '队列'],
  );
  addNeedles(
    'oop_representation',
    ['为什么需要类', '列表或字典表示', 'list 和 dict', '保护不了规则'],
    ['内置容器', 'custom type', '字段含义', '列表问题', '字典问题', '旧表示', '错误状态'],
  );
  addNeedles(
    'oop_init',
    ['init 方法', '初始化器', '构造器', '__init__', '把值放进对象'],
    ['init 方法', '__init__', '初始化器', '构造器', 'self.userid', '构造调用'],
  );
  addNeedles(
    'oop_method',
    ['函数、方法', '函数改成方法', '点号', '方法调用'],
    ['method', '方法', 'dot lookup', '点号', 'like 方法', 'self'],
  );
  addNeedles(
    'oop_design',
    ['设计配方', '方法设计', '类设计', '设计类', '要不要设计类'],
    ['class design', '设计配方', 'course 类', '类设计', '设计类', '状态', '操作'],
  );
  addNeedles(
    'oop_interface',
    ['公有', '私有', '接口', '信息隐藏'],
    ['public', 'private', '公有', '私有', '接口', 'client', '信息隐藏'],
  );
  addNeedles(
    'oop_invariant',
    ['invariant', '不变量', '不变式', '表示不变量', '表示不变式'],
    ['invariant', '不变量', '不变式', '表示不变量', '表示不变式', '合法状态'],
  );
  addNeedles('dictionary', ['dictionary', '字典'], ['dictionary', 'dict', '字典', 'lookup', 'key']);
  addNeedles(
    'loop_trace',
    ['nested loop', 'loop', '循环'],
    ['for ', 'while ', 'loop', '循环', 'row index', 'col index'],
  );
  addNeedles(
    'memory_aliasing',
    ['aliasing', '内存', '引用'],
    ['aliasing', '引用', 'heap', 'stack frame', 'memory'],
  );
  addNeedles(
    'oop_boundary',
    ['属性类型标注', '定义 tweet 类', '定义 course 类', '类、对象', '类不是术语表', '实例属性'],
    ['class', 'object', '实例属性', '类', '对象', 'tweet', '字段', '属性注解'],
  );
  add('oop_boundary', 4, hasOopSignal && hasAny(titleText, ['类', '对象', '实例', '属性']));
  add('oop_design', 4, hasOopSignal && hasAny(titleText, ['收束', '真实问题', '顺序']));

  for (const target of targets) {
    const block = target.block as NotebookContentBlock & {
      kind?: string;
      variant?: string;
      algorithm?: string;
    };
    add('loop_trace', hasOopSignal ? 1 : 8, block.type === 'code_trace' || block.type === 'state_table');
    add('memory_aliasing', 8, block.type === 'memory_diagram');
    add('graph_search', 10, block.type === 'graph_trace');
    add('dictionary', 8, block.type === 'dictionary_diagram');
    add('doubly_linked_list', 10, block.type === 'pointer_diagram' && block.variant === 'doubly');
    add('linked_list', 8, block.type === 'pointer_diagram' && block.variant !== 'doubly');
    add('bst', 10, block.type === 'tree_diagram' && block.kind === 'bst');
    add('tree_traversal', 8, block.type === 'tree_diagram' && block.kind !== 'bst');
    add('stack', 9, block.type === 'linear_structure' && block.kind === 'stack');
    add('queue', 9, block.type === 'linear_structure' && block.kind === 'queue');
    add('recursion', 6, block.type === 'call_stack');
  }

  const priority: CsTeachingTopic[] = [
    'oop_init',
    'oop_method',
    'oop_invariant',
    'oop_interface',
    'oop_design',
    'oop_representation',
    'oop_boundary',
    'memory_aliasing',
    'graph_search',
    'doubly_linked_list',
    'linked_list',
    'bst',
    'tree_traversal',
    'recursion',
    'stack',
    'queue',
    'dictionary',
    'loop_trace',
    'linear_structure',
    'tree',
    'generic',
  ];
  const [best] = priority
    .map((topic, order) => ({ topic, order, score: scores.get(topic) || 0 }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  return best?.score ? best.topic : 'generic';
}

function codeLine(code: string | undefined, line: number | undefined): string {
  if (typeof line !== 'number' || !code) return '';
  return cleanText(code.split('\n')[line - 1] || '');
}

function firstNonEmpty(values: Array<string | undefined | false>): string {
  const found = values.find((value) => Boolean(cleanText(value || '')));
  return typeof found === 'string' ? cleanText(found) : '';
}

function blockStepCount(block: NotebookContentBlock): number {
  const steps = Array.isArray((block as { steps?: unknown[] }).steps)
    ? (block as { steps: unknown[] }).steps
    : [];
  switch (block.type) {
    case 'code_walkthrough':
    case 'code_trace':
    case 'memory_diagram':
    case 'pointer_diagram':
    case 'tree_diagram':
    case 'graph_trace':
    case 'linear_structure':
      return steps.length;
    default:
      return 0;
  }
}

function blockLens(block: NotebookContentBlock): TeachingLens | null {
  switch (block.type) {
    case 'code_block':
    case 'code_walkthrough':
    case 'code_trace':
    case 'state_table':
      return 'syntax';
    case 'memory_diagram':
      return 'oop';
    case 'graph_trace':
      return 'algorithm';
    case 'call_stack':
      return 'algorithm';
    case 'tree_diagram':
      return blockStepCount(block) ? 'algorithm' : 'data_structure';
    case 'pointer_diagram':
    case 'invariant_panel':
    case 'dictionary_diagram':
    case 'linear_structure':
      return 'data_structure';
    default:
      return null;
  }
}

function isCsNarrationTarget(target: SemanticSpotlightBlockTarget): boolean {
  return CS_BLOCK_TYPES.has(target.block.type) || blockLens(target.block) !== null;
}

function isSteppedBlock(block: NotebookContentBlock): boolean {
  return blockStepCount(block) > 0;
}

function narrationStepIndices(block: NotebookContentBlock, topic: CsTeachingTopic): number[] {
  const total = blockStepCount(block);
  if (total <= 0) return [];
  if (total <= 4) return Array.from({ length: total }, (_value, index) => index);

  const indices = isOopTopic(topic)
    ? [0, 1, Math.floor(total / 2), total - 1]
    : [0, 1, 2, total - 1];
  return [...new Set(indices.filter((index) => index >= 0 && index < total))].sort(
    (a, b) => a - b,
  );
}

function shouldIncludeTarget(
  target: SemanticSpotlightBlockTarget,
  allTargets: readonly SemanticSpotlightBlockTarget[],
): boolean {
  if (!isCsNarrationTarget(target)) return false;

  if (target.block.type === 'code_block') {
    return !allTargets.some(
      (other) =>
        other.sectionId === target.sectionId &&
        other.id !== target.id &&
        ['code_walkthrough', 'code_trace', 'memory_diagram'].includes(other.block.type),
    );
  }

  if (target.block.type === 'paragraph') {
    return cleanText(target.text).length >= 40;
  }

  return true;
}

function selectNarrationTargets(
  rawTargets: readonly SemanticSpotlightBlockTarget[],
): SemanticSpotlightBlockTarget[] {
  const candidates = rawTargets.filter((target) => shouldIncludeTarget(target, rawTargets));
  const stepped = candidates.filter((target) => isSteppedBlock(target.block));
  if (!stepped.length) return candidates.slice(0, 5);

  const supportTypes = new Set<NotebookContentBlock['type']>([
    'example',
    'process_flow',
    'state_table',
    'call_stack',
    'invariant_panel',
    'dictionary_diagram',
  ]);
  const support = candidates
    .filter((target) => !isSteppedBlock(target.block) && supportTypes.has(target.block.type))
    .slice(0, 3);
  const keepIds = new Set([...stepped, ...support].map((target) => target.id));
  return candidates.filter((target) => keepIds.has(target.id));
}

function lensPriority(lens: TeachingLens): number {
  if (lens === 'algorithm') return 4;
  if (lens === 'data_structure') return 3;
  if (lens === 'oop') return 2;
  return 1;
}

function primaryLens(targets: readonly SemanticSpotlightBlockTarget[]): TeachingLens {
  const lenses = targets.map((target) => blockLens(target.block)).filter(Boolean) as TeachingLens[];
  return lenses.sort((a, b) => lensPriority(b) - lensPriority(a))[0] || 'syntax';
}

function pageIntro(
  title: string | undefined,
  targets: readonly SemanticSpotlightBlockTarget[],
  language: SupportedLanguage,
  topic: CsTeachingTopic,
): string {
  const lens = primaryLens(targets);
  const topicTitle = cleanText(title) || targets[0]?.title || '';
  if (language === 'en-US') {
    if (topic === 'oop_representation') {
      return 'Start with the real question: if a list or dictionary can store the data, why invent a class? Because storing values is not the same as protecting their meaning, legal range, and allowed operations.';
    }
    if (topic === 'oop_boundary') {
      return 'On this page, separate three words before touching code: a class is the type, an object is one concrete value of that type, and instance attributes are the state carried by that object.';
    }
    if (topic === 'oop_init') {
      return 'Read the initializer as a construction scene. Python has already made a new object; self is the temporary name for that object, and the initializer decides what state must be written onto it.';
    }
    if (topic === 'oop_method') {
      return 'For method calls, the dot is the key move. The object on the left of the dot is quietly passed into self, so the method is really about changing or reading that object.';
    }
    if (topic === 'oop_invariant') {
      return 'Treat the invariant as the object’s exit check. We do not trust a method just because it runs; we trust it only if the object is still legal when the method finishes.';
    }
    if (topic === 'oop_interface') {
      return 'This page is about design boundaries: public interface is the promise clients may rely on, and private representation is the machinery the class protects from accidental damage.';
    }
    if (topic === 'oop_design') {
      return 'Read this as a design recipe, not a code dump: first name the object’s state, then name the operations clients need, then write the invariant that every operation must preserve.';
    }
    if (topic === 'doubly_linked_list') {
      return 'Read the doubly linked list as two promises at once: next must work left to right, and prev must work right to left. A correct insertion has to repair both directions.';
    }
    if (topic === 'linked_list') {
      return 'For a linked list, do not start by writing assignments. First name the handle, the current node, the node you might lose, and the link that must be rewired.';
    }
    if (topic === 'bst') {
      return 'For a BST, every move is justified by the ordering rule. The point is not to memorize a path; it is to ask whether the target belongs left or right at the current node.';
    }
    if (topic === 'tree_traversal') {
      return 'For a general tree, separate the node you are visiting from the traversal rule. The children list tells us what remains to be explored.';
    }
    if (topic === 'graph_search') {
      return 'For graph search, track two pieces of state: frontier says who is waiting, and visited says who should not be processed again.';
    }
    if (topic === 'stack') {
      return 'For a stack, focus on the single active end. Push and pop are not random list operations; both happen at the top.';
    }
    if (topic === 'queue') {
      return 'For a queue, the two ends have different jobs. New items enter at the back, and work leaves from the front.';
    }
    if (topic === 'dictionary') {
      return 'For a dictionary, split the move into two questions: does this key exist, and are we reading, inserting, or updating its value?';
    }
    const prefix = topicTitle ? `For "${topicTitle}", ` : 'For this page, ';
    if (lens === 'oop') {
      return `${prefix}we first separate names from objects. Do not ask only what the code says; ask which name points to which heap object, and which object is actually being changed.`;
    }
    if (lens === 'data_structure') {
      return `${prefix}we treat the structure as a set of promises. Before writing code, identify the endpoints, the links, and the invariant that must still hold after each operation.`;
    }
    if (lens === 'algorithm') {
      return `${prefix}we focus on the strategy, not just the visit order. Track who is waiting to be processed, who is already done, and which data structure decides the next move.`;
    }
    return `${prefix}we build an execution model. Before trying to write the function, name the changing variables, the current line, and the condition that decides the next line.`;
  }

  if (topic === 'oop_representation') {
    return '这页先问一个真实问题：数据明明可以放进 list 或 dict，为什么还要类？关键不是“能不能存”，而是这些字段的含义、合法范围、允许的操作，能不能被同一个结构保护起来。';
  }
  if (topic === 'oop_boundary') {
    return '这页先把三个词分开：类是类型，对象是这个类型造出来的具体东西，实例属性是这个对象自己带着的状态。后面所有 OOP 代码，先按这三层来读。';
  }
  if (topic === 'oop_init') {
    return '这页把 init 方法当成一个“建对象现场”来讲：Python 先造出一个新对象，self 临时指向它，然后构造器负责把必要状态写到这个对象上。';
  }
  if (topic === 'oop_method') {
    return '这页看点号调用。点号左边的对象会自动站到 self 的位置，所以读方法时不要只看参数列表，要先问：这次调用的中心对象是谁？';
  }
  if (topic === 'oop_invariant') {
    return '这页不是背不变式，而是练一种验收动作：每个方法结束前，都要检查对象是不是还合法。能跑完不够，跑完之后状态还要对。';
  }
  if (topic === 'oop_interface') {
    return '这页讲设计边界：公有接口是给客户端的承诺，私有属性是类内部用来保护表示的零件。学生写不出来时，通常是还没分清这两层。';
  }
  if (topic === 'oop_design') {
    return '这页把题目变成类设计。不要先抄代码，先写三件事：对象要保存哪些状态，客户端需要哪些操作，每个操作结束后要守住什么 invariant。';
  }
  if (topic === 'loop_trace') {
    return '这页先把 nested loop 看成两个时钟：outer loop 决定当前是哪一行，inner loop 决定这一行里扫到哪一格。写代码前先把这两个进度分开。';
  }
  if (topic === 'doubly_linked_list') {
    return '双向链表要同时守两条路：沿 next 从左往右能走通，沿 prev 从右往左也能走通。插入节点不是放进去就完了，两个方向的连接都要修好。';
  }
  if (topic === 'linked_list') {
    return '链表题先别急着写赋值。先指出 handle、当前节点、可能会丢的节点，以及这一步到底要重接哪一条 link。';
  }
  if (topic === 'bst') {
    return 'BST 的每一步都要由大小规则决定。不要背路径，先问目标值和当前节点比，下一步应该去左边还是右边。';
  }
  if (topic === 'tree_traversal') {
    return '普通 tree 遍历要分清两件事：当前访问的是哪个节点，以及 traversal rule 规定接下来处理哪些 children。';
  }
  if (topic === 'graph_search') {
    return '图搜索先盯住两份状态：frontier 里是谁还在等，visited 里是谁已经处理过。BFS 和 DFS 的差别，就藏在 frontier 怎么取下一个。';
  }
  if (topic === 'stack') {
    return 'stack 只看 top 这一端。push 和 pop 不是随便改 list，而是在同一个端点上放入和拿走。';
  }
  if (topic === 'queue') {
    return 'queue 要看两端分工：新任务从 back 进入，旧任务从 front 离开。会写 queue，先要会指出 front 和 back。';
  }
  if (topic === 'dictionary') {
    return '字典题先拆成两个问题：key 在不在？如果在，是读 value 还是更新 value；如果不在，是不是要插入新 entry。';
  }
  const prefix = topicTitle ? `现在看 ${topicTitle}，` : '现在，';
  if (lens === 'oop') {
    return `${prefix}先把“名字”和“对象”分开。不要只问代码写了什么，要问哪个变量指向哪个 heap 对象，真正被修改的是哪个对象。`;
  }
  if (lens === 'data_structure') {
    return `${prefix}把数据结构看成一组必须守住的承诺。写代码前先找端点、指针或字段，再问操作之后 invariant 还成不成立。`;
  }
  if (lens === 'algorithm') {
    return `${prefix}重点不是背访问顺序，而是看策略。我们要追踪谁还在等待处理、谁已经处理过，以及哪个结构决定下一步。`;
  }
  return `${prefix}先建立执行模型。写代码前不要急着敲语法，先列出会变化的变量、当前执行行，以及决定下一行的条件。`;
}

function closingChecklist(
  lens: TeachingLens,
  language: SupportedLanguage,
  topic: CsTeachingTopic,
): string {
  if (language === 'en-US') {
    if (topic === 'oop_representation') {
      return 'The writing move is: when a container starts needing field meaning, validity rules, and attached behavior, stop treating it as loose data and start designing a class.';
    }
    if (topic === 'oop_init') {
      return 'Before writing an initializer, list the attributes that must exist immediately after construction, then write exactly one self attribute assignment for each one.';
    }
    if (topic === 'oop_method') {
      return 'Before writing a method, ask: what object is self, what state do I read, what state do I change, and what must still be true at the end?';
    }
    if (topic === 'doubly_linked_list') {
      return 'Before writing a doubly linked-list mutation, write the next links and prev links as two separate checklists; the operation is not done until both directions agree.';
    }
    if (topic === 'linked_list') {
      return 'Before changing a linked-list link, save every node you will still need, then rewire one pointer at a time and check that the chain is still reachable.';
    }
    if (topic === 'bst') {
      return 'Before writing BST code, ask: what comparison decides the branch, what subtree can still contain the target, and does the left-small/right-large invariant remain true?';
    }
    if (topic === 'tree_traversal') {
      return 'Before writing tree traversal code, ask: what do I do at the current node, how do I combine child results, and what is the base case for no children?';
    }
    if (topic === 'graph_search') {
      return 'Before writing graph search, ask: what is the frontier, when do I mark visited, and what data structure chooses the next node?';
    }
    if (topic === 'stack') {
      return 'Before using a stack, ask which item is at the top and whether this line pushes a new item or pops the most recent one.';
    }
    if (topic === 'queue') {
      return 'Before using a queue, ask which item is at the front, which end receives new work, and why FIFO is the right rule here.';
    }
    if (topic === 'dictionary') {
      return 'Before writing dictionary code, ask: what is the key, what should happen on a miss, and does this line read, insert, or update the value?';
    }
    if (lens === 'oop') {
      return 'Before writing similar object code, ask three questions: where is the name stored, which object does it reference, and does this line replace the reference or mutate the object?';
    }
    if (lens === 'data_structure') {
      return 'Before writing a data-structure operation, ask: which handle changes, which link could be lost, and which invariant proves the structure is still legal?';
    }
    if (lens === 'algorithm') {
      return 'Before writing the algorithm, ask: what is the frontier, when do we mark something done, and what rule chooses the next item?';
    }
    return 'Before writing similar code, ask: what state do I need, how does one iteration change it, and what condition stops the process?';
  }

  if (topic === 'oop_representation') {
    return '以后看到 list 或 dict 装一组固定含义的数据，先问：字段含义谁来保证，合法值谁来检查，相关操作应该放在哪里？如果这些问题都靠人记，就该考虑类。';
  }
  if (topic === 'oop_init') {
    return '写 init 方法前，先列对象出生后必须立刻存在的属性；每个属性都应该能对应到一行 self 的属性赋值。';
  }
  if (topic === 'oop_method') {
    return '写方法前，先问：self 是哪个对象，我读哪些状态，改哪些状态，方法结束后 invariant 还成不成立？';
  }
  if (topic === 'oop_invariant') {
    return '以后写类的方法，不要只问代码有没有执行完；要在 return 前问一次：所有表示不变式现在还是真的吗？';
  }
  if (topic === 'oop_interface') {
    return '设计接口前，先分两列：客户端合理需要什么，内部实现必须藏什么。能被外部随便改坏的东西，就不该直接公开。';
  }
  if (topic === 'loop_trace') {
    return '写 nested loop 前，先画两层进度：outer loop 选当前 row，inner loop 扫 row 里的 value，再决定什么时候更新累计状态。';
  }
  if (topic === 'doubly_linked_list') {
    return '写双向链表 mutation 前，把 next 清单和 prev 清单分开列；两个方向都能走通，操作才算真的完成。';
  }
  if (topic === 'linked_list') {
    return '改链表 link 前，先保存后面还要用的节点，再一条一条重接指针，最后检查从 handle 出发还能不能走完整条链。';
  }
  if (topic === 'bst') {
    return '写 BST 代码前，先问：比较结果决定去哪边，哪棵子树还有可能包含目标，左小右大的 invariant 是否仍然成立？';
  }
  if (topic === 'tree_traversal') {
    return '写 tree traversal 前，先问：当前节点做什么，每个 child 的结果怎么合并，没有 child 时返回什么？';
  }
  if (topic === 'graph_search') {
    return '写图搜索前，先问：frontier 是什么，什么时候放进 visited，下一步由 queue、stack 还是递归调用栈决定？';
  }
  if (topic === 'stack') {
    return '写 stack 代码前，先问 top 是谁，这一行是在 push 新元素，还是 pop 最近加入的元素。';
  }
  if (topic === 'queue') {
    return '写 queue 代码前，先问 front 是谁，新元素从哪一端进入，为什么这里必须按 FIFO 顺序处理。';
  }
  if (topic === 'dictionary') {
    return '写 dictionary 代码前，先问：key 是什么，miss 时怎么办，这一行是在读 value、插入 entry，还是更新旧 value？';
  }
  if (lens === 'oop') {
    return '写类似对象代码前，先问三件事：名字存在哪里，引用指向哪个对象，这一行是在换引用，还是在改对象本身？';
  }
  if (lens === 'data_structure') {
    return '写数据结构操作前，先问：哪个 handle 会变，哪条 link 可能丢，最后用哪个 invariant 证明结构仍然合法？';
  }
  if (lens === 'algorithm') {
    return '写算法前，先问：frontier 是什么，什么时候标记 done，下一步由 queue、stack、call stack 还是比较规则决定？';
  }
  return '写类似代码前，先问：我要保存哪些状态，一轮执行怎样改变状态，什么条件让过程停止？';
}

function summarizeStatePairs(state: readonly { name: string; value: string }[] | undefined) {
  if (!state?.length) return '';
  return state
    .slice(0, 4)
    .map((item) => `${spokenName(item.name)} = ${cleanText(item.value)}`)
    .join('，');
}

function summarizeStateChange(
  current: readonly { name: string; value: string }[] | undefined,
  previous: readonly { name: string; value: string }[] | undefined,
  language: SupportedLanguage,
) {
  if (!current?.length) return '';
  const previousValues = new Map((previous || []).map((item) => [item.name, item.value]));
  const changed = current.filter((item) => previousValues.get(item.name) !== item.value);
  if (!changed.length) {
    const state = summarizeStatePairs(current);
    if (!state) return '';
    return language === 'en-US' ? `The key state is ${state}` : `此时关键状态是：${state}`;
  }
  const changeText = changed
    .slice(0, 3)
    .map((item) => {
      const before = previousValues.get(item.name);
      const name = spokenName(item.name);
      const value = cleanText(item.value);
      return before === undefined
        ? `${name} = ${value}`
        : language === 'en-US'
          ? `${name} changes from ${cleanText(before)} to ${value}`
          : `${name} 从 ${cleanText(before)} 变成 ${value}`;
    })
    .join(language === 'en-US' ? ', ' : '，');
  return language === 'en-US'
    ? `The change to track is ${changeText}`
    : `这一步要盯住的变化是：${changeText}`;
}

function codeTraceStepNarration(
  block: Extract<NotebookContentBlock, { type: 'code_trace' }>,
  stepIndex: number,
  language: SupportedLanguage,
  topic: CsTeachingTopic,
) {
  const step = block.steps[stepIndex];
  const previous = block.steps[stepIndex - 1];
  const sourceLine = codeLine(block.code, step?.line);
  if (isOopTopic(topic)) {
    const lineText =
      typeof step?.line === 'number'
        ? language === 'en-US'
          ? `At line ${step.line}, ask which object this line is about`
          : `第 ${step.line} 行先问：这一步围绕哪个对象发生`
        : language === 'en-US'
          ? 'At this point, ask which object owns the state'
          : '到这一步，先问这些状态属于哪个对象';
    const oopPurpose =
      language === 'en-US'
        ? firstNonEmpty([
            topic === 'oop_representation' &&
              'The point is not execution mechanics; the point is whether this representation can keep the Tweet state complete and meaningful',
            topic === 'oop_init' &&
              'The initializer is building a valid object: each assignment should create one required instance attribute',
            topic === 'oop_method' &&
              'The dot call chooses the receiver object; the method then reads or changes that object through self',
            topic === 'oop_invariant' &&
              'The useful check is whether this line could leave the object in an illegal state',
            topic === 'oop_interface' &&
              'Ask whether this line belongs in the public promise or inside the protected representation',
            'Read this line through object state: what is created, what is named, and what attribute changes?',
          ])
        : firstNonEmpty([
            topic === 'oop_representation' &&
              '重点不是执行表，而是这个表示法能不能保证 Tweet 的状态完整、有含义',
            topic === 'oop_init' &&
              'init 方法是在建一个合法对象：每次赋值都应该补上一个必需的实例属性',
            topic === 'oop_method' &&
              '点号调用先选中接收对象；方法体再通过 self 读或改这个对象',
            topic === 'oop_invariant' &&
              '有用的检查是：这一行会不会让对象离开合法状态',
            topic === 'oop_interface' &&
              '先判断这一行是在定义客户端能用的承诺，还是类内部保护表示的细节',
            '按对象状态来读：这一步创建了什么、给谁命名、哪个属性发生变化',
          ]);
    const change = summarizeStateChange(step?.state, previous?.state, language);
    const checkpoint =
      language === 'en-US'
        ? 'After this step, you should be able to point to the receiver object and the attribute that changed'
        : '读完这步，只要能指出接收对象是谁、哪个属性变了，就抓住重点了';
    return sentenceJoin(language, [lineText, oopPurpose, step?.explanation, change, checkpoint]);
  }
  const isCondition = /\bif\b|while\b/.test(sourceLine);
  const isLoop = /\bfor\b|enumerate|range/.test(sourceLine);
  const isReturn = /\breturn\b/.test(sourceLine);
  const lineText =
    typeof step?.line === 'number'
      ? language === 'en-US'
        ? `Line ${step.line} is not just syntax; ask what decision or state update it performs`
        : `第 ${step.line} 行不要只读语法，先问它是在做判断、推进循环，还是更新状态`
      : language === 'en-US'
        ? 'At the current execution point, ask what state changes'
        : '到当前执行点，先问状态发生了什么';
  const purpose =
    language === 'en-US'
      ? firstNonEmpty([
          isCondition && 'This line is a gate: decide whether the body runs',
          isLoop && 'This line advances the loop cursor',
          isReturn && 'This line hands the accumulated state back to the caller',
          topic === 'loop_trace' &&
            'For nested loops, keep the outer cursor and inner cursor separate',
          'Use this line to update the execution table by hand',
        ])
      : firstNonEmpty([
          isCondition && '这一行是 gate：先判断条件真假，再决定里面的代码跑不跑',
          isLoop && '这一行是在移动循环指针：看 row index 或 col index 走到哪里',
          isReturn && '这一行把已经累计好的状态交回调用者',
          topic === 'loop_trace' &&
            'nested loop 这里要把外层进度和内层进度分开，不要混成一个 index',
          '这一行的任务，是让你能手动更新执行表',
        ]);
  const change = summarizeStateChange(step?.state, previous?.state, language);
  const thinking =
    language === 'en-US'
      ? 'Before moving on, say what value you would write into the trace table'
      : '继续下一步前，先说清你会在 trace 表里写下哪个新值';

  return sentenceJoin(language, [lineText, purpose, step?.explanation, change, thinking]);
}

function memoryStepNarration(
  block: Extract<NotebookContentBlock, { type: 'memory_diagram' }>,
  stepIndex: number,
  language: SupportedLanguage,
  topic: CsTeachingTopic,
) {
  const step = block.steps[stepIndex];
  const lineText =
    typeof step?.line === 'number'
      ? language === 'en-US'
        ? `Match line ${step.line} to the memory picture`
        : `把第 ${step.line} 行和内存图对齐`
      : language === 'en-US'
        ? 'Match the current code point to the memory picture'
        : '把当前代码点和内存图对齐';
  const stackNames = (step?.frames?.flatMap((frame) => frame.variables) || step?.stack || [])
    .slice(0, 3)
    .map((item) => spokenName(item.name))
    .filter(Boolean);
  const heapIds = (step?.heap || [])
    .slice(0, 3)
    .map((item) => item.id)
    .filter(Boolean);
  const model =
    language === 'en-US'
      ? `The useful question is whether this line creates a new object, stores a reference, or mutates an object already on the heap`
      : `真正有用的问题是：这一行在新建对象、保存引用，还是修改 heap 里已经存在的对象`;
  const anchor =
    language === 'en-US'
      ? stackNames.length || heapIds.length
        ? `Point to it: stack names ${stackNames.join(', ') || 'none'}, heap objects ${heapIds.join(', ') || 'none'}`
        : ''
      : stackNames.length || heapIds.length
        ? `图上要能指出来：stack 里的名字是 ${stackNames.join('、') || '无'}，heap 里的对象是 ${
            heapIds.join('、') || '无'
          }`
        : '';
  const topicRule =
    language === 'en-US'
      ? topic === 'oop_init'
        ? 'self is not magic; it is the name currently pointing at the new object being initialized'
        : topic === 'memory_aliasing'
          ? 'If two names point to the same object, a mutation through either name is visible through the other'
          : ''
      : topic === 'oop_init'
        ? 'self 不是魔法词，它就是当前指向新对象的那个名字'
        : topic === 'memory_aliasing'
          ? '如果两个名字指向同一个对象，从任意一个名字改对象，另一个名字也会看到变化'
          : '';

  return sentenceJoin(language, [
    lineText,
    step?.title,
    step?.explanation,
    model,
    anchor,
    topicRule,
  ]);
}

function pointerStepNarration(
  block: Extract<NotebookContentBlock, { type: 'pointer_diagram' }>,
  stepIndex: number,
  language: SupportedLanguage,
) {
  const step = block.steps[stepIndex];
  const variant = block.variant === 'doubly' ? 'doubly' : 'linked';
  const habit =
    language === 'en-US'
      ? variant === 'doubly'
        ? 'For a doubly linked list, every next change needs the matching prev change'
        : 'For a linked list, protect the node you still need before changing a link'
      : variant === 'doubly'
        ? '双向链表每改一条 next，都要检查对应的 prev'
        : '链表改 link 之前，先保住后面还要用的节点';
  return sentenceJoin(language, [step?.title, step?.operation, step?.explanation, habit]);
}

function treeStepNarration(
  block: Extract<NotebookContentBlock, { type: 'tree_diagram' }>,
  stepIndex: number,
  language: SupportedLanguage,
) {
  const step = block.steps[stepIndex];
  const isBst = block.kind === 'bst';
  const path = step?.path?.length ? step.path.join(' → ') : block.path.join(' → ');
  const model =
    language === 'en-US'
      ? isBst
        ? 'The next move must come from the BST ordering rule, not from guessing'
        : 'Keep the current node and the traversal rule separate'
      : isBst
        ? '下一步必须由 BST 的大小规则决定，不能靠猜'
        : '把当前节点和遍历规则分开看';
  const pathText = path
    ? language === 'en-US'
      ? `Current path: ${path}`
      : `当前路径是 ${path}`
    : '';
  return sentenceJoin(language, [step?.title, step?.comparison, step?.result, pathText, model]);
}

function graphStepNarration(
  block: Extract<NotebookContentBlock, { type: 'graph_trace' }>,
  stepIndex: number,
  language: SupportedLanguage,
) {
  const step = block.steps[stepIndex];
  const frontierName =
    block.algorithm === 'dfs_stack'
      ? 'stack'
      : block.algorithm === 'dfs_recursive'
        ? 'call stack'
        : 'queue';
  const frontier = step?.frontier?.length ? `${frontierName} = [${step.frontier.join(', ')}]` : '';
  const visited = step?.visited?.length ? `visited = {${step.visited.join(', ')}}` : '';
  const model =
    language === 'en-US'
      ? `The ${frontierName} decides who gets processed next; visited prevents duplicate work`
      : `${frontierName} 决定下一步处理谁，visited 防止重复处理`;
  return sentenceJoin(language, [
    step?.title,
    step?.explanation,
    frontier,
    visited,
    step?.result,
    model,
  ]);
}

function linearStepNarration(
  block: Extract<NotebookContentBlock, { type: 'linear_structure' }>,
  stepIndex: number,
  language: SupportedLanguage,
) {
  const step = block.steps[stepIndex];
  const rule =
    language === 'en-US'
      ? block.kind === 'stack'
        ? 'A stack is not a general list here; the top is the only active end'
        : 'A queue separates responsibilities: enter at the back, leave from the front'
      : block.kind === 'stack'
        ? '这里的 stack 不是普通 list，真正能操作的是 top 这一端'
        : 'queue 的关键是两端分工：从 back 进入，从 front 离开';
  return sentenceJoin(language, [
    step?.title,
    step?.operation,
    step?.explanation,
    step?.result,
    rule,
  ]);
}

function codeWalkthroughStepNarration(
  block: Extract<NotebookContentBlock, { type: 'code_walkthrough' }>,
  stepIndex: number,
  language: SupportedLanguage,
  topic: CsTeachingTopic,
) {
  const step = block.steps[stepIndex];
  const focus = step?.focus
    ? language === 'en-US'
      ? `Focus: ${step.focus}`
      : `先看 ${step.focus}`
    : '';
  const designQuestion =
    language === 'en-US'
      ? firstNonEmpty([
          topic === 'oop_init' &&
            'The writing question is: which attribute must exist after construction?',
          topic === 'oop_method' &&
            'The writing question is: which object state does this method read or change?',
          topic === 'oop_invariant' &&
            'The writing question is: which legal-state rule must this line preserve?',
          topic === 'oop_interface' &&
            'The writing question is: is this part a client-facing promise or an internal detail?',
          topic === 'oop_design' &&
            'The writing question is: what design decision does this line encode?',
          'The writing question is: what small responsibility does this line carry?',
        ])
      : firstNonEmpty([
          topic === 'oop_init' && '写代码时先问：对象出生后，哪个属性必须存在？',
          topic === 'oop_method' &&
            '写代码时先问：这个方法读的是 self 的哪部分状态，改的是哪部分状态？',
          topic === 'oop_invariant' && '写代码时先问：这一行要维护哪条合法状态规则？',
          topic === 'oop_interface' && '写代码时先问：这是给客户端的承诺，还是类内部的实现细节？',
          topic === 'oop_design' && '写代码时先问：这一行对应哪一个设计决定？',
          '写代码时先问：这一小段代码负责解决什么具体问题？',
        ]);
  const habit =
    language === 'en-US'
      ? 'Write only the lines that answer that question, then check the object state'
      : '先写能回答这个问题的那几行，再检查对象状态有没有变成你预期的样子';
  return sentenceJoin(language, [step?.title, designQuestion, focus, step?.explanation, habit]);
}

function stepNarration(
  block: NotebookContentBlock,
  stepIndex: number,
  language: SupportedLanguage,
  topic: CsTeachingTopic,
): string {
  switch (block.type) {
    case 'code_walkthrough':
      return codeWalkthroughStepNarration(block, stepIndex, language, topic);
    case 'code_trace':
      return codeTraceStepNarration(block, stepIndex, language, topic);
    case 'memory_diagram':
      return memoryStepNarration(block, stepIndex, language, topic);
    case 'pointer_diagram':
      return pointerStepNarration(block, stepIndex, language);
    case 'tree_diagram':
      return treeStepNarration(block, stepIndex, language);
    case 'graph_trace':
      return graphStepNarration(block, stepIndex, language);
    case 'linear_structure':
      return linearStepNarration(block, stepIndex, language);
    default:
      return language === 'en-US'
        ? `Now look at step ${stepIndex + 1}. Explain the state change before moving on.`
        : `现在看第 ${stepIndex + 1} 步。先说清楚状态怎么变，再继续。`;
  }
}

function summarizeItems(items: readonly string[] | undefined, limit = 3) {
  return (items || [])
    .slice(0, limit)
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join('；');
}

function blockNarration(
  block: NotebookContentBlock,
  language: SupportedLanguage,
  topic: CsTeachingTopic,
): string {
  switch (block.type) {
    case 'paragraph':
      return sentenceJoin(language, [
        language === 'en-US'
          ? 'Start by turning the paragraph into a question we can test in code'
          : '先把这段话翻成一个能在代码里检查的问题',
        block.text,
      ]);
    case 'bullet_list':
      return language === 'en-US'
        ? sentenceJoin(language, [
            'Read these bullets as separate checks, not as a list to memorize',
            summarizeItems(block.items),
          ])
        : sentenceJoin(language, ['这几条要当成检查动作来读', summarizeItems(block.items)]);
    case 'example':
      return sentenceJoin(language, [
        language === 'en-US'
          ? 'Before solving the example, restate the task as a design question'
          : '例题不要先写答案，先把题目翻译成设计问题',
        block.problem,
        block.goal,
      ]);
    case 'process_flow':
      return sentenceJoin(language, [
        language === 'en-US'
          ? 'This flow is the order of thinking before the order of code'
          : '这个流程先是思考顺序，然后才是代码顺序',
        block.summary ||
          block.steps
            .slice(0, 3)
            .map((step) => `${step.title}: ${step.detail}`)
            .join('；'),
      ]);
    case 'definition':
      return sentenceJoin(language, [
        language === 'en-US'
          ? 'Turn this definition into an object you can point to in code'
          : '定义不要停在词面上，要能对应到代码里哪个对象、属性或方法',
        block.title,
        block.text,
      ]);
    case 'table':
      return language === 'en-US'
        ? 'Read the table by comparing columns: each row should answer what changes, what stays stable, and what rule is being protected.'
        : '表格不要横着扫完就算了，要按列比较：哪一列在变，哪一列保持稳定，哪一列对应正在维护的规则。';
    case 'callout':
      return sentenceJoin(language, [
        language === 'en-US'
          ? 'Pause here and state the rule before continuing'
          : '这里先停一下，把规则说清楚再继续',
        block.title,
        block.text,
      ]);
    case 'state_table':
      return language === 'en-US'
        ? 'Read this table as an execution log: each row is one moment in time, and each column is one piece of state you must be able to update by hand.'
        : '把这张表当成执行记录来读：每一行是一个时间点，每一列是一个你必须能手动更新的状态。';
    case 'call_stack':
      return language === 'en-US'
        ? 'Read the call stack from top to bottom. The top frame is running; lower frames are waiting with their local variables preserved.'
        : '调用栈要从栈顶往下读：栈顶正在执行，下面的 frame 都在暂停等待，而且各自的局部变量还保留着。';
    case 'dictionary_diagram':
      return language === 'en-US'
        ? 'For a dictionary, always separate the lookup question from the mutation question: first ask whether the key exists, then decide whether to insert or update.'
        : '字典题先分清 lookup 和 mutation：先问 key 在不在，再决定是插入新 entry，还是更新旧 value。';
    case 'invariant_panel':
      return sentenceJoin(language, [
        language === 'en-US'
          ? 'An invariant is the proof that the structure is still legal'
          : 'invariant 是结构仍然合法的证明',
        block.invariant,
        language === 'en-US'
          ? 'Do not trust the operation until each check still holds'
          : '不要只看操作做完了，要逐条检查这些条件还成不成立',
      ]);
    case 'code_block':
      return language === 'en-US'
        ? 'Before copying this code, identify the state it keeps and the decision points that move execution forward.'
        : '不要先抄代码，先找它保存了哪些状态，以及哪些判断会推动执行往下走。';
    default:
      if (topic === 'oop_design') {
        return language === 'en-US'
          ? 'Read the requirement, then name the concrete design choice it forces.'
          : '先读题目要求，再说它逼着我们做出哪个具体设计决定。';
      }
      return language === 'en-US'
        ? 'Name the state, the operation, and the rule that must still be true after the operation.'
        : '说清三个东西：现在的状态、正在做的操作、操作后必须仍然成立的规则。';
  }
}

export function buildCsNarrationActions({
  document,
  title,
  language,
}: {
  document?: NotebookContentDocument;
  title?: string;
  language?: string;
}): Action[] {
  if (!document) return [];

  const lang = normalizeLanguage(language || document.language);
  const sections = buildSemanticSpotlightSections(document);
  const rawTargets = flattenSemanticSpotlightTargets(sections).filter(isCsNarrationTarget);
  const targets = selectNarrationTargets(rawTargets);
  const isCodeDocument = document.profile === 'code' || document.disciplineStyle === 'code';
  if (!targets.length || !isCodeDocument) return [];

  const actions: Action[] = [];
  const nextId = () => `action_${nanoid(8)}`;
  const firstTargetId = targets[0]?.id || sections[0]?.id || 'header';
  const lens = primaryLens(targets);
  const topic = inferTopic(title || document.title, rawTargets);

  actions.push({
    id: nextId(),
    type: 'spotlight',
    title: lang === 'en-US' ? 'Focus the teaching model' : '聚焦讲解模型',
    elementId: firstTargetId,
    dimOpacity: 0.5,
  });
  actions.push({
    id: nextId(),
    type: 'speech',
    title: lang === 'en-US' ? 'Opening' : '导入',
    text: pageIntro(title || document.title, targets, lang, topic),
    speed: 1,
  });

  for (const target of targets) {
    const totalSteps = blockStepCount(target.block);
    actions.push({
      id: nextId(),
      type: 'spotlight',
      title: lang === 'en-US' ? 'Focus the current component' : '聚焦当前组件',
      elementId: target.id,
      dimOpacity: 0.45,
    });

    if (totalSteps === 0) {
      actions.push({
        id: nextId(),
        type: 'speech',
        title: target.title || (lang === 'en-US' ? 'Component explanation' : '组件讲解'),
        text: blockNarration(target.block, lang, topic),
        speed: 1,
      });
      continue;
    }

    for (const stepIndex of narrationStepIndices(target.block, topic)) {
      actions.push({
        id: nextId(),
        type: 'semantic_step',
        title: lang === 'en-US' ? `Show step ${stepIndex + 1}` : `切换到第 ${stepIndex + 1} 步`,
        blockId: target.id,
        stepIndex,
      });
      actions.push({
        id: nextId(),
        type: 'speech',
        title:
          target.title ||
          (lang === 'en-US' ? `Step ${stepIndex + 1} explanation` : `第 ${stepIndex + 1} 步讲解`),
        text: stepNarration(target.block, stepIndex, lang, topic),
        speed: 1,
      });
    }
  }

  actions.push({
    id: nextId(),
    type: 'speech',
    title: lang === 'en-US' ? 'Before coding checklist' : '写代码前的检查',
    text: closingChecklist(lens, lang, topic),
    speed: 1,
  });

  return actions;
}
