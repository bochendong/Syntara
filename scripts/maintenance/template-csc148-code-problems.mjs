#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { normalizeCsc148TreeBstPublicContent } from './csc148-tree-bst-template-normalizer.mjs';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmqjfarz800158oi68s595q9n';
const TEMPLATE_VERSION = 'csc148-code-statement-template-v2';

const TEMPLATE_KIND_BY_SOURCE_ID = new Map([
  ['notebook_88', 'single_function'],
  ['notebook_508', 'single_function'],
  ['notebook_515', 'single_class'],
  ['notebook_518', 'single_class'],
  ['notebook_486', 'single_class'],
  ['notebook_490', 'single_class'],
  ['notebook_559', 'inheritance'],
  ['notebook_538', 'inheritance'],
  ['notebook_1355', 'inheritance'],
  ['notebook_1356', 'inheritance'],
  ['notebook_1357', 'single_class'],
  ['notebook_1208', 'adt'],
  ['notebook_1211', 'adt'],
  ['notebook_1213', 'single_function'],
  ['notebook_1359', 'adt'],
  ['notebook_1360', 'adt'],
  ['notebook_1094', 'single_function'],
  ['notebook_1209', 'adt'],
  ['notebook_1212', 'single_function'],
  ['notebook_1373', 'adt'],
  ['notebook_1374', 'adt'],
  ['notebook_1101', 'adt'],
  ['notebook_1166', 'adt'],
  ['notebook_1200', 'single_function'],
  ['notebook_1210', 'inheritance'],
  ['notebook_1941', 'linked_list'],
  ['notebook_1942', 'linked_list'],
  ['notebook_1944', 'linked_list'],
  ['notebook_1414', 'linked_list'],
  ['notebook_1943', 'linked_list'],
  ['notebook_2124', 'linked_list'],
  ['notebook_1409', 'linked_list'],
  ['notebook_1387', 'linked_list'],
  ['notebook_1940', 'linked_list'],
  ['notebook_1392', 'linked_list'],
  ['notebook_1394', 'linked_list'],
  ['notebook_2126', 'single_function'],
  ['notebook_2127', 'single_function'],
  ['notebook_2128', 'single_function'],
  ['notebook_2129', 'single_function'],
  ['notebook_2130', 'single_function'],
  ['notebook_2143', 'single_function'],
  ['notebook_1959', 'single_function'],
  ['notebook_2009', 'linked_list'],
  ['notebook_2010', 'linked_list'],
  ['notebook_1961', 'tree'],
  ['notebook_2008', 'single_function'],
  ['notebook_2007', 'single_function'],
  ['notebook_2125', 'single_function'],
  ['notebook_2135', 'bst'],
  ['notebook_2139', 'tree'],
  ['notebook_2140', 'tree'],
  ['notebook_2141', 'tree'],
  ['notebook_2142', 'tree'],
  ['notebook_2144', 'tree'],
  ['notebook_2131', 'bst'],
  ['notebook_2132', 'bst'],
  ['notebook_2134', 'bst'],
  ['notebook_2136', 'bst'],
  ['notebook_2137', 'bst'],
  ['notebook_2138', 'bst'],
]);

const TITLE_OVERRIDES = new Map([
  ['notebook_88', '实现 safe_binary_op 类型安全二元运算'],
  ['notebook_2124', '链表交替合并'],
  ['notebook_2126', '递归求嵌套列表总和'],
  ['notebook_2127', '递归求嵌套列表奇数深度总和'],
  ['notebook_2128', '递归查找嵌套列表最大值'],
  ['notebook_2129', '递归计算嵌套列表最大深度'],
  ['notebook_2130', '递归扁平化嵌套列表'],
  ['notebook_2143', '嵌套列表深拷贝'],
  ['notebook_2009', '递归追加链表节点'],
  ['notebook_2010', '递归删除链表节点值'],
  ['notebook_2135', '实现 BST 三种遍历'],
  ['notebook_2139', '递归求树节点总和'],
  ['notebook_2140', '递归查找树中最大值'],
  ['notebook_2141', '实现 Tree 最长递增路径'],
  ['notebook_2142', '统计 Tree 指定深度内的奇数节点'],
  ['notebook_2144', '递归深拷贝树'],
  ['notebook_2131', '实现 BST 插入'],
  ['notebook_2132', '实现 BST 查找'],
  ['notebook_2134', '实现 BST 删除'],
  ['notebook_2136', '由先序遍历构造 BST'],
  ['notebook_2137', '查找 BST 第 k 大元素'],
  ['notebook_2138', '镜像翻转 BST'],
]);

const SIGNATURE_OVERRIDES = new Map([
  ['notebook_486', 'class Person; Person.is_adult(self) -> bool'],
  [
    'notebook_490',
    'class BankAccount; BankAccount.deposit(self, amount: float) -> None; BankAccount.withdraw(self, password: str, amount: float) -> None',
  ],
  ['notebook_559', 'class Shape; class Circle(Shape); class Square(Shape)'],
  ['notebook_538', 'class Animal; class Dog(Animal)'],
  [
    'notebook_1355',
    'class QuizQuestion; class MultipleChoiceQuestion(QuizQuestion); class NumericalQuestion(QuizQuestion)',
  ],
  [
    'notebook_1356',
    'class LivingBeing; class Movable; class Bird(LivingBeing, Movable); class Fish(LivingBeing, Movable)',
  ],
  ['notebook_1357', 'class Riding'],
  ['notebook_1208', 'class Stack; class LimitedStack(Stack)'],
  ['notebook_1211', 'class DividingStack(Stack)'],
  ['notebook_1359', 'make_queue_from(stack: Stack) -> Queue'],
  ['notebook_1360', 'class DividingStack(Stack)'],
  ['notebook_1209', 'make_queue_from(stack: Stack) -> Queue'],
  ['notebook_1373', 'class MyStack'],
  ['notebook_1374', 'class MyQueue'],
  ['notebook_1101', 'is_palindrome_using_queue_stack(s: str) -> bool'],
  ['notebook_1166', 'class Stack'],
  ['notebook_1210', 'raiser(num: int) -> None; notice(num: int) -> None'],
  [
    'notebook_1941',
    'Solution.removeElements(self, head: ListNode | None, val: int) -> ListNode | None',
  ],
  ['notebook_1942', 'Solution.isPalindrome(self, head: ListNode | None) -> bool'],
  ['notebook_1944', 'Solution.deleteDuplicates(self, head: ListNode | None) -> ListNode | None'],
  [
    'notebook_1414',
    'class LinkedList; LinkedList.append(self, item) -> None; LinkedList.delete_at_index(self, index: int) -> None',
  ],
  ['notebook_1943', 'addTwoNumbers(l1: ListNode | None, l2: ListNode | None) -> ListNode | None'],
  ['notebook_2124', 'LinkedList.weave(self, other: LinkedList) -> None'],
  ['notebook_1409', 'class TailLinkedList; TailLinkedList.append(self, item) -> None'],
  ['notebook_1387', 'print_linky_list(node: _Node | None) -> list'],
  ['notebook_1940', 'Solution.reverseList(self, head: ListNode | None) -> ListNode | None'],
  ['notebook_1392', 'class LinkedList; LinkedList.append(self, item) -> None'],
  ['notebook_1394', 'build_linked_list(items: list) -> _Node | None'],
  ['notebook_2009', 'Node.append(self, item) -> None'],
  ['notebook_2010', 'Node.delete_value(self, value) -> Node | None'],
  ['notebook_1961', 'max_in_tree(root: TreeNode | None) -> int | None'],
  [
    'notebook_2135',
    'BinarySearchTree.inorder(self) -> str; BinarySearchTree.preorder(self) -> str; BinarySearchTree.postorder(self) -> str',
  ],
  ['notebook_2139', 'sum_tree(root: TreeNode | None) -> int'],
  ['notebook_2140', 'find_max_in_tree(root: TreeNode | None) -> int | None'],
  ['notebook_2141', 'Tree.longest_ascending_sequence(self) -> int'],
  ['notebook_2142', 'Tree.count_upper_odd(self, n: int) -> int'],
  ['notebook_2144', 'deep_copy_tree(root: TreeNode | None) -> TreeNode | None'],
  ['notebook_2131', 'BinarySearchTree.insert(self, item: Any) -> None'],
  ['notebook_2132', 'BinarySearchTree.find(self, item: Any) -> bool'],
  ['notebook_2134', 'BinarySearchTree.delete(self, item: Any) -> bool'],
  ['notebook_2136', 'preorder_to_BST(prelist: list[int]) -> BinarySearchTree'],
  ['notebook_2137', 'kth_largest(root: TreeNode | None, k: int) -> int | None'],
  ['notebook_2138', 'BinarySearchTree.mirror(self) -> None'],
]);

const BANK_ACCOUNT_STARTER = `class BankAccount:
    """A simple bank account with an account number, password, and balance."""

    accountNumber: str
    password: str
    balance: float

    def __init__(self, accountNumber: str, password: str, balance: float) -> None:
        """Initialize this account.

        Raise ValueError if accountNumber has more than 20 characters.
        If balance is negative, store 0.0 instead.
        """
        pass

    def deposit(self, amount: float) -> None:
        """Deposit amount into this account if amount is positive."""
        pass

    def withdraw(self, password: str, amount: float) -> None:
        """Withdraw amount when the password is correct and funds are sufficient."""
        pass
`;

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sourceQuestionId(problem) {
  return String(problem.sourceMeta?.sourceQuestionId ?? '');
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function compactSpaces(value) {
  return cleanText(value)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripMarkdownForTitle(value) {
  return cleanText(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/^#+\s*/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/[:：。；;，,]+$/g, '')
    .trim();
}

function shorten(value, maxLength) {
  const text = stripMarkdownForTitle(value);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return cut.replace(/[，,。；;：:\s][^，,。；;：:\s]*$/u, '').trim() || cut.trim();
}

function looksLikePurePythonSkeleton(stem) {
  const text = cleanText(stem);
  return /^(?:from\s|import\s|class\s|def\s)/m.test(text) && !/^#+\s/m.test(text);
}

function extractStarterFromStem(stem) {
  const text = cleanText(stem);
  return looksLikePurePythonSkeleton(text) ? `${text}\n` : '';
}

function starterFor(problem, content) {
  const existing = cleanText(content.starterCode);
  if (existing) return `${existing}\n`;

  const sourceId = sourceQuestionId(problem);
  if (sourceId === 'notebook_490') return BANK_ACCOUNT_STARTER;

  const fromStem = extractStarterFromStem(content.stem);
  return fromStem || existing;
}

function inferTemplateKind(problem, content, starterCode) {
  const sourceId = sourceQuestionId(problem);
  const mapped = TEMPLATE_KIND_BY_SOURCE_ID.get(sourceId);
  if (mapped) return mapped;

  const haystack = `${problem.title}\n${problem.tags?.join('\n') ?? ''}\n${content.stem}\n${starterCode}`;
  if (/BinarySearchTree|\bBST\b|二叉搜索树/i.test(haystack)) return 'bst';
  if (/\bTree\b|TreeNode|_subtrees|树/i.test(haystack)) return 'tree';
  if (/LinkedList|ListNode|_Node|链表/i.test(haystack)) return 'linked_list';
  if (/Stack|Queue|栈|队列/i.test(haystack)) return 'adt';
  if (/inherit|subclass|super\(|override|继承|子类|父类/i.test(haystack)) return 'inheritance';
  if (/^class\s+/m.test(starterCode)) return 'single_class';
  return 'single_function';
}

function declarationSummary(starterCode) {
  const classes = [];
  const topLevelFunctions = [];
  const methods = [];

  for (const line of cleanText(starterCode).split('\n')) {
    const classMatch = line.match(/^class\s+([A-Za-z_]\w*(?:\([^)]*\))?)\s*:/);
    if (classMatch) {
      classes.push(classMatch[1]);
      continue;
    }

    const topDefMatch = line.match(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
    if (topDefMatch) {
      topLevelFunctions.push({
        name: topDefMatch[1],
        signature: line.trim(),
      });
      continue;
    }

    const methodMatch = line.match(/^\s{4}def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
    if (methodMatch) {
      methods.push({
        name: methodMatch[1],
        signature: line.trim(),
      });
    }
  }

  return {
    classes: [...new Set(classes)],
    topLevelFunctions,
    methods,
  };
}

function targetApiLabel(problem, content, starterCode, templateKind) {
  const sourceId = sourceQuestionId(problem);
  const override = SIGNATURE_OVERRIDES.get(sourceId);
  if (override) return override;

  const declarations = declarationSummary(starterCode);
  if (declarations.topLevelFunctions.length > 0 && templateKind !== 'single_class') {
    return declarations.topLevelFunctions.map((item) => item.signature).join('; ');
  }
  if (declarations.classes.length > 0) {
    const nonInitMethods = declarations.methods
      .filter((method) => method.name !== '__init__')
      .map((method) => method.signature);
    return [
      ...declarations.classes.map((className) => `class ${className}`),
      ...nonInitMethods.slice(0, 6),
    ].join('; ');
  }
  return cleanText(content.functionSignature) || '按照右侧起始代码实现目标接口';
}

function normalizedTitle(problem, content, starterCode, templateKind) {
  const sourceId = sourceQuestionId(problem);
  const override = TITLE_OVERRIDES.get(sourceId);
  if (override) return `编程题：${override}`;

  const before = shorten(problem.sourceMeta?.titleBeforeRewrite, 42);
  if (
    before &&
    !/^##/.test(before) &&
    !/\.\.\.$/.test(before) &&
    !/^[A-Za-z0-9_()'" +*/-]{20,}$/.test(before)
  ) {
    return `编程题：${before.replace(/^编程题[：:]\s*/, '')}`.slice(0, 80);
  }

  const declarations = declarationSummary(starterCode);
  const firstFunction = declarations.topLevelFunctions[0]?.name;
  const firstClass = declarations.classes[0]?.replace(/\(.*/, '');
  const api = firstFunction || firstClass || cleanText(content.functionSignature).split(/[(:]/)[0];
  const noun =
    templateKind === 'bst'
      ? 'BST 操作'
      : templateKind === 'tree'
        ? '树递归操作'
        : templateKind === 'linked_list'
          ? '链表操作'
          : templateKind === 'adt'
            ? 'ADT 操作'
            : templateKind === 'inheritance'
              ? '继承结构'
              : templateKind === 'single_class'
                ? '类行为'
                : '函数';
  return `编程题：实现 ${api || noun} ${noun}`.replace(/\s+/g, ' ').slice(0, 80);
}

function overviewBody(templateKind, targetApi) {
  const subject =
    templateKind === 'bst'
      ? '二叉搜索树题'
      : templateKind === 'tree'
        ? '递归树题'
        : templateKind === 'linked_list'
          ? '链表题'
          : templateKind === 'adt'
            ? '抽象数据类型题'
            : templateKind === 'inheritance'
              ? '继承与多类设计题'
              : templateKind === 'single_class'
                ? '单类设计题'
                : '函数实现题';
  return `这是一个 CSC148 ${subject}。请根据给定接口实现 ${targetApi}，并保持右侧起始代码中的公开 API、类名、函数名和方法签名不变。`;
}

function requirementBody(content, starterCode) {
  if (Array.isArray(content.statementSections)) {
    const existingRequirement = content.statementSections.find(
      (section) => section?.id === 'requirements',
    )?.body;
    return cleanText(existingRequirement);
  }

  const stem = cleanText(content.stem);
  if (!stem) return '';
  if (looksLikePurePythonSkeleton(stem) && cleanText(starterCode).includes(stem.slice(0, 80))) {
    return '';
  }
  return stem.slice(0, 7800);
}

function publicTestDescriptions(content) {
  return (content.publicTests ?? [])
    .map((test) => cleanText(test.description))
    .filter(Boolean)
    .slice(0, 5);
}

function baseConstraints(templateKind) {
  const constraints = [
    '保留题目给出的公开类名、函数名和方法名。',
    '不要改变目标接口的参数顺序、返回约定或调用方式。',
    '提交代码必须能被公开测试和隐藏测试直接 import 运行，不需要交互式输入。',
  ];

  if (templateKind !== 'single_function') {
    constraints.push('每次公开方法调用后，都要让对象保持一致且有效的状态。');
  }

  if (templateKind === 'single_class' || templateKind === 'inheritance') {
    constraints.push('所有需要的实例属性都应该先在 __init__ 中初始化，再被其它方法使用。');
  }

  if (templateKind === 'inheritance') {
    constraints.push('按照 starter code 中的类层级使用继承和方法重写。');
  }

  if (templateKind === 'adt') {
    constraints.push('遵守 Stack/Queue 等 ADT 接口，以及空结构时的指定行为。');
  }

  if (templateKind === 'linked_list') {
    constraints.push('正确处理空链表、单节点链表，以及发生在 head 位置的更新。');
    constraints.push('维护节点链接，不要丢失、重复或意外跳过已有节点。');
  }

  if (templateKind === 'tree') {
    constraints.push('递归调用前先处理空树或叶子节点。');
    constraints.push('使用 starter code 给出的树表示，不要替换成另一套数据模型。');
  }

  if (templateKind === 'bst') {
    constraints.push('每次操作后都要维护二叉搜索树的排序不变式。');
    constraints.push(
      '使用课程 BinarySearchTree 模板时，非空节点的左右孩子应该是 empty BST 对象，而不是 None。',
    );
  }

  return constraints.slice(0, 12);
}

function invariantItems(templateKind) {
  if (templateKind === 'bst') {
    return [
      '左子树中的每个值都小于或等于根节点值。',
      '右子树中的每个值都大于或等于根节点值。',
      '空 BST 的 _root、_left、_right 都是 None；非空 BST 的空孩子用 BinarySearchTree(None) 表示。',
    ];
  }
  if (templateKind === 'tree') {
    return [
      '空 Tree 的 _root 是 None，_subtrees 是空列表。',
      '递归方法应先处理当前根节点，再组合各个子树的结果。',
    ];
  }
  if (templateKind === 'linked_list') {
    return [
      '每个节点保存一个 item，以及指向下一个节点的引用。',
      '会修改链表的方法必须保持剩余节点仍然可达。',
      '空 head 和单节点链表需要单独考虑。',
    ];
  }
  if (templateKind === 'adt') {
    return [
      '内部表示只应该通过 ADT 要求的方法来改变。',
      '空栈或空队列的行为必须和 starter code 及测试保持一致。',
    ];
  }
  if (templateKind === 'inheritance') {
    return [
      '如果题目要求类层级，共同行为应放在基类中。',
      '子类方法可以扩展或重写基类行为，但不能破坏公开接口。',
    ];
  }
  if (templateKind === 'single_class') {
    return ['每个实例都应该把自己的状态保存在 self 上。', '公开方法返回后，对象仍应处于有效状态。'];
  }
  return [];
}

function statementSections(problem, content, starterCode, templateKind, targetApi) {
  if (
    problem.sourceMeta?.codeStatementTemplate === TEMPLATE_VERSION &&
    Array.isArray(content.statementSections) &&
    content.statementSections.length > 0
  ) {
    return content.statementSections;
  }

  const sections = [
    {
      id: 'task',
      kind: 'overview',
      title: '任务',
      body: overviewBody(templateKind, targetApi),
      items: [],
    },
    {
      id: 'interface',
      kind: 'interface',
      title: '接口与起始代码',
      body: '右侧代码编辑器已经放入本题的起始代码。请在保留接口的前提下补全缺失逻辑。',
      items: [`目标接口：${targetApi}`],
      code:
        cleanText(content.functionSignature) && cleanText(content.functionSignature) !== targetApi
          ? cleanText(content.functionSignature)
          : undefined,
      codeLanguage: 'python',
    },
  ];

  const body = requirementBody(content, starterCode);
  const testDescriptions = publicTestDescriptions(content);
  const requirementItems = [
    '补全 starter code 中的 pass 或 raise NotImplementedError 位置。',
    ...(testDescriptions.length > 0
      ? [`至少需要通过公开测试覆盖的行为：${testDescriptions.join('、')}。`]
      : []),
  ];

  sections.push({
    id: 'requirements',
    kind: 'requirements',
    title: '实现要求',
    body: body || undefined,
    items: requirementItems,
  });

  const invariants = invariantItems(templateKind);
  if (invariants.length > 0) {
    sections.push({
      id: 'state',
      kind: 'invariants',
      title:
        templateKind === 'single_class' || templateKind === 'inheritance'
          ? '对象状态'
          : '表示不变式',
      items: invariants,
    });
  }

  return sections
    .map((section) => ({
      ...section,
      body: section.body ? compactSpaces(section.body) : undefined,
      items: [...new Set(section.items ?? [])].filter(Boolean),
    }))
    .filter((section) => section.body || section.items.length > 0 || section.code)
    .slice(0, 10);
}

function starterDescription(templateKind) {
  if (templateKind === 'bst') {
    return '右侧编辑器包含课程使用的 BinarySearchTree 模板；请保留 empty BST 的表示方式，并补全目标方法。';
  }
  if (templateKind === 'tree') {
    return '右侧编辑器包含课程使用的 Tree/TreeNode 模板；请使用递归处理空树、叶子和子树组合。';
  }
  if (templateKind === 'linked_list') {
    return '右侧编辑器包含链表节点或链表类模板；请保留节点结构，只调整指针逻辑。';
  }
  if (templateKind === 'adt') {
    return '右侧编辑器包含 Stack/Queue 等 ADT 模板；请按给定接口补全方法，不要改测试依赖的类名和方法名。';
  }
  if (templateKind === 'inheritance') {
    return '右侧编辑器包含多类或继承模板；请保留继承结构，并在对应类中补全行为。';
  }
  return '右侧编辑器包含本题起始代码；请保留函数或类接口，只补全缺失实现。';
}

function normalizeProblem(problem) {
  const sourceId = sourceQuestionId(problem);
  const content =
    problem.publicContentJson &&
    typeof problem.publicContentJson === 'object' &&
    !Array.isArray(problem.publicContentJson)
      ? problem.publicContentJson
      : {};

  const initialStarter = starterFor(problem, content);
  const templateKind = inferTemplateKind(problem, content, initialStarter);
  const normalizedBase = normalizeCsc148TreeBstPublicContent(
    {
      ...content,
      starterCode: initialStarter || content.starterCode,
    },
    sourceId,
  );
  const starterCode = cleanText(normalizedBase.starterCode)
    ? `${cleanText(normalizedBase.starterCode)}\n`
    : undefined;
  const targetApi = targetApiLabel(problem, normalizedBase, starterCode ?? '', templateKind);
  const title = normalizedTitle(problem, normalizedBase, starterCode ?? '', templateKind);
  const constraints = baseConstraints(templateKind);
  const nextPublicContent = {
    ...normalizedBase,
    stem: overviewBody(templateKind, targetApi),
    language: 'python',
    ...(starterCode ? { starterCode } : {}),
    functionSignature: targetApi,
    constraints,
    statementSections: statementSections(
      problem,
      normalizedBase,
      starterCode ?? '',
      templateKind,
      targetApi,
    ),
    starterCodeDescription: starterDescription(templateKind),
  };

  return {
    title,
    templateKind,
    publicContentJson: nextPublicContent,
    sourceMeta: {
      ...(problem.sourceMeta && typeof problem.sourceMeta === 'object' ? problem.sourceMeta : {}),
      codeStatementTemplate: TEMPLATE_VERSION,
      codeTemplateKind: templateKind,
      codeStatementTemplatedAt:
        typeof problem.sourceMeta?.codeStatementTemplatedAt === 'string'
          ? problem.sourceMeta.codeStatementTemplatedAt
          : new Date().toISOString(),
    },
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function sameJson(a, b) {
  return JSON.stringify(stableJson(a)) === JSON.stringify(stableJson(b));
}

function firstDiffPath(a, b, pathName = '$') {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return pathName;
    if (a.length !== b.length) return `${pathName}.length`;
    for (let index = 0; index < a.length; index += 1) {
      const diff = firstDiffPath(a[index], b[index], `${pathName}[${index}]`);
      if (diff) return diff;
    }
    return '';
  }

  if (
    a &&
    typeof a === 'object' &&
    !Array.isArray(a) &&
    b &&
    typeof b === 'object' &&
    !Array.isArray(b)
  ) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const diff = firstDiffPath(a[key], b[key], `${pathName}.${key}`);
      if (diff) return diff;
    }
    return '';
  }

  return Object.is(a, b) ? '' : pathName;
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const prisma = new PrismaClient();

  try {
    const notebooks = await prisma.notebook.findMany({
      where: { courseId },
      select: { id: true },
    });
    const notebookIds = notebooks.map((notebook) => notebook.id);
    const problems = await prisma.notebookProblem.findMany({
      where: {
        type: 'code',
        status: 'published',
        OR: [{ courseId }, { notebookId: { in: notebookIds } }],
      },
      orderBy: [{ problemNumber: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        type: true,
        tags: true,
        problemNumber: true,
        publicContentJson: true,
        sourceMeta: true,
      },
    });

    const updates = problems.map((problem) => ({
      problem,
      normalized: normalizeProblem(problem),
    }));
    const changed = updates.filter(
      ({ problem, normalized }) =>
        problem.title !== normalized.title ||
        !sameJson(problem.publicContentJson, normalized.publicContentJson) ||
        !sameJson(problem.sourceMeta, normalized.sourceMeta),
    );

    const summary = {
      mode: write ? 'write' : 'dry-run',
      courseId,
      totalCodeProblems: problems.length,
      changed: changed.length,
      changeReasons: {
        title: updates.filter((item) => item.problem.title !== item.normalized.title).length,
        publicContent: updates.filter(
          (item) => !sameJson(item.problem.publicContentJson, item.normalized.publicContentJson),
        ).length,
        sourceMeta: updates.filter(
          (item) => !sameJson(item.problem.sourceMeta, item.normalized.sourceMeta),
        ).length,
      },
      firstContentDiff:
        updates
          .map((item) => ({
            problemNumber: item.problem.problemNumber,
            path: firstDiffPath(item.problem.publicContentJson, item.normalized.publicContentJson),
          }))
          .find((item) => item.path)?.path ?? '',
      templateKinds: updates.reduce((acc, item) => {
        acc[item.normalized.templateKind] = (acc[item.normalized.templateKind] ?? 0) + 1;
        return acc;
      }, {}),
      emptyStarterAfter: updates.filter(
        (item) => !cleanText(item.normalized.publicContentJson.starterCode),
      ).length,
      emptyConstraintsAfter: updates.filter(
        (item) => (item.normalized.publicContentJson.constraints ?? []).length === 0,
      ).length,
      suspectTitles: updates
        .filter((item) =>
          /##|```|~~~|\.{3}|实现 (that|to|represents|implements)$/i.test(item.normalized.title),
        )
        .map((item) => ({
          problemNumber: item.problem.problemNumber,
          title: item.normalized.title,
        })),
      preview: changed.slice(0, 12).map(({ problem, normalized }) => ({
        problemNumber: problem.problemNumber,
        oldTitle: problem.title,
        newTitle: normalized.title,
        templateKind: normalized.templateKind,
        functionSignature: normalized.publicContentJson.functionSignature,
        sections: normalized.publicContentJson.statementSections.map((section) => section.title),
        constraints: normalized.publicContentJson.constraints.slice(0, 3),
      })),
    };

    console.log(JSON.stringify(summary, null, 2));

    if (!write) return;

    await prisma.$transaction(
      changed.map(({ problem, normalized }) =>
        prisma.notebookProblem.update({
          where: { id: problem.id },
          data: {
            title: normalized.title,
            publicContentJson: normalized.publicContentJson,
            sourceMeta: normalized.sourceMeta,
          },
        }),
      ),
    );

    console.log(`Updated ${changed.length} CSC148 code problems.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
