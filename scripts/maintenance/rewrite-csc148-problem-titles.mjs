#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const COURSE_ID = 'cmqjfarz800158oi68s595q9n';
const SOURCE_PATH =
  '/Users/dongpochen/Github/TeachingPlatform/exports/course_questions_production_full_20260618/production-full-csc148-questions.json';

const SECTION_TOPICS = new Map([
  ['1. Python对象的基本模型与三要素', '对象三要素与变量绑定'],
  ['2. 不可变对象与可变对象：内存表现及操作', '可变对象与内存状态'],
  ['3. 对象引用、别名(aliasing)与副作用(side effect)', '对象别名与副作用'],
  ['4. 对象相等性与类型机制', '相等性与类型机制'],
  ['Python 类型注解基础：原始类型与复合类型', '类型注解基础'],
  ['函数头与参数命名及类型契约', '函数头与类型契约'],
  ['函数设计的例子、描述与文档注释', 'Docstring 与 doctest 示例'],
  ['高级类型注解：Any、Union、Optional、Callable', '高级类型注解'],
  ['属性与封装（公有/私有）', '属性封装与私有属性'],
  ['方法、调用与函数对比', '方法调用与函数对比'],
  ['特殊方法（魔术方法）与操作符支持', '魔术方法与操作符支持'],
  ['类与对象基础', '类与对象基础'],
  ['类的初始化与 self 语义', '初始化与 self 语义'],
  ['表示不变式与类的设计原则', '表示不变式与类设计'],
  ['抽象类与接口设计（Shape 示例）', '抽象类与接口设计'],
  ['方法继承、覆盖（override）与方法解析规则', '方法覆盖与解析顺序'],
  ['构造器扩展、继承总结与 object 超类', '构造器扩展与 object 超类'],
  ['类与对象示例（BankAccount）', 'BankAccount 类设计'],
  ['继承的动机与基本概念', '继承基础概念'],
  ['超类与子类的结构与继承示例', '超类与子类结构'],
  ['ADT 与具体数据结构的区别（以 Python 为例）', 'ADT 与数据结构实现'],
  ['ADT 概念与比喻', '抽象数据类型概念'],
  ['常见抽象数据类型（Set/Multiset/Iterable/List/Map）', '常见 ADT 接口'],
  ['栈（Stack）：定义、操作与典型应用', 'Stack 操作与应用'],
  ['队列（Queue）：定义、操作与典型应用', 'Queue 操作与应用'],
  ['Python 常见内置异常速览', 'Python 内置异常'],
  ['异常与抽象接口的问题描述', '异常与抽象接口'],
  ['异常处理结构：try / except / else / finally 用法', '异常处理流程'],
  ['空栈处理方案：自定义异常的设计与好处', '空栈与自定义异常'],
  ['空栈处理方案：静默返回或 None 的利弊', '空栈返回策略'],
  ['自定义异常实践与示例', '自定义异常实践'],
  ['删除、栈/队列应用与练习', '链表删除与 ADT 应用'],
  ['引言与动机', '链表动机与数组限制'],
  ['插入操作与尾指针优化', '链表插入与尾指针'],
  ['数组（List/Array）操作分析', '数组操作复杂度'],
  ['节点连接与遍历模板', '链表节点遍历'],
  ['链表的数据结构与类实现', '链表类结构'],
  ['案例：嵌套列表（Nested Lists）', '嵌套列表递归'],
  ['案例：树节点（Tree Node）', '树节点递归'],
  ['生成型递归（Generative Recursion）', '生成型递归'],
  ['累积递归（Accumulative Recursion）', '累积递归'],
  ['结构递归（Structural Recursion）', '结构递归'],
  ['Tree ADT 与实现细节', 'Tree ADT 实现'],
  ['二叉搜索树（BST）：性质与操作', 'BST 性质与操作'],
  ['复杂度与表达式树案例', '复杂度与表达式树'],
  ['常用术语与特殊树类型', '树术语与特殊树'],
  ['性质、证明与基本结论', '树性质与基本结论'],
  ['概述与定义', '树的概述与定义'],
]);

const TOPIC_RULES = [
  [/对象.*三要素|三要素|变量.*关系|变量.*绑定/i, '对象三要素与变量绑定'],
  [/memory model diagram|current state of memory|内存模型图/i, '内存模型图与对象状态'],
  [/assert a\[0] is b\[0]|所有断言通过|断言通过/i, '浅拷贝别名断言'],
  [/class implementations|class A:|class B:/i, '类对象内存状态'],
  [/safe_binary_op/i, '类型安全的二元运算'],
  [/append_sometimes/i, '列表追加函数调试'],
  [/SimpleString/i, 'SimpleString 魔术方法'],
  [/\bPoint\b/, 'Point 坐标相等判断'],
  [/\bPerson\b/, 'Person 类与成年判断'],
  [/DividingStack/i, 'DividingStack 入栈规则'],
  [/check_parenthesis/i, '括号平衡检测'],
  [/make_queue_from/i, 'Stack 转 Queue'],
  [/words_frequency/i, '字符串频率统计'],
  [/LinkedList\s+Weave|weave/i, '链表交替合并'],
  [/sum_nested/i, '嵌套列表求和'],
  [/sum_at_odd_depths/i, '嵌套列表奇数深度求和'],
  [/max_nested/i, '嵌套列表最大值'],
  [/max_nest|depth of a Nested List/i, '嵌套列表最大深度'],
  [/flatten_nested/i, '嵌套列表扁平化'],
  [/deep_copy_tree/i, '树的深拷贝'],
  [/Deep Copy in Nested/i, '嵌套列表深拷贝'],
  [/Linked List Append/i, '递归链表追加'],
  [/Linked List Delete/i, '递归链表删除'],
  [/palindrome/i, '回文字符串递归判断'],
  [/Reverse Number|function `reverse`|reverse\(/i, '数字反转递归'],
  [/Reverses String|reverse_string/i, '字符串反转递归'],
  [/Inorder, Preorder and Postorder|preorder|postorder|inorder/i, '树遍历顺序'],
  [/Sum Nodes in Tree/i, '树节点求和'],
  [/Find Max in Tree/i, '树中最大值'],
  [/Longest sequence of ascending values/i, '树中最长递增序列'],
  [/Count upper odd|count_up/i, '树中奇数计数'],
  [/BST Insert|insert\(self/i, 'BST 插入'],
  [/BST Search|find\(self/i, 'BST 查找'],
  [/BST Delete|delete\(self/i, 'BST 删除'],
  [/Preorder to BST/i, '先序序列构造 BST'],
  [/kth_largest/i, 'BST 第 k 大元素'],
  [/mirror\(self\)|BST.*mirror/i, 'BST 镜像操作'],
  [/id\(|object identity|identity/i, '对象身份 id'],
  [/type\(|isinstance/i, '类型判断与 isinstance'],
  [/小整数|id\(3\)|256|257/i, '小整数缓存与对象身份'],
  [/shallow|copy\(|deepcopy|浅拷贝|深拷贝/i, '浅拷贝与深拷贝'],
  [/alias|别名|side effect|副作用/i, '别名与副作用'],
  [/mutable|immutable|可变|不可变/i, '可变对象与不可变对象'],
  [/字符串参数|None 返回值|返回 None|names.*字符串|list\[str]|List\[str]/i, '参数与返回值类型注解'],
  [/函数名|参数名|布尔参数|超时时间|发送电子邮件|商品价格|命名/i, '函数命名与参数语义'],
  [/类型契约|参数.*返回|返回值.*注解|合法的参数和返回类型/i, '参数返回类型契约'],
  [/function annotation|函数注解|type annotation|类型注解/i, '函数类型注解'],
  [/__init__|不变式|representation invariant|余额|balance/i, '初始化与表示不变式'],
  [/docstring|doctest/i, 'Docstring 与 doctest'],
  [/\b(?:Any|Union|Optional|Callable)\b|typing\.(?:Any|Union|Optional|Callable)/, '高级类型注解'],
  [/private|public|封装|属性/i, '属性封装'],
  [/__repr__|__str__|__eq__|__len__|magic|魔术方法/i, '魔术方法'],
  [/Froogle/i, '对象协议与方法设计'],
  [/inherit|override|super\(|subclass|superclass|继承|覆盖/i, '继承与方法覆盖'],
  [/abstract|interface|Shape|抽象类/i, '抽象类接口'],
  [/BankAccount|bank account/i, 'BankAccount 类设计'],
  [/Stack|栈/i, 'Stack 操作'],
  [/Queue|队列/i, 'Queue 操作'],
  [/try|except|finally|raise|Exception|异常/i, '异常处理流程'],
  [/LinkedList|linked list|链表/i, '链表操作'],
  [/recursion|recursive|递归/i, '递归结构'],
  [/nested list|嵌套列表/i, '嵌套列表递归'],
  [/TreeNode|\bTree\b|树/i, '树结构'],
  [/\bBST\b|BinarySearchTree|二叉搜索树/i, 'BST 操作'],
  [/expression tree|表达式树/i, '表达式树'],
  [/complexity|时间复杂度|O\(/i, '复杂度分析'],
];

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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function stripMarkdown(value) {
  return cleanText(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\[[^\]]*考试原题[^\]]*]/g, ' ')
    .replace(/\((?:20\d{2})\s*(?:Final|TT\d?|tt\d?)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codeBlocks(value) {
  return [...String(value ?? '').matchAll(/```(?:python)?\s*\n([\s\S]*?)```/gi)].map((match) =>
    match[1].trim(),
  );
}

function firstCodeBlock(value) {
  return codeBlocks(value)[0] ?? '';
}

function firstFunctionOrClassName(text) {
  const code = firstCodeBlock(text) || text;
  const classMatch = code.match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  const functionMatch = code.match(/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (functionMatch && !/^__.+__$/.test(functionMatch[1])) return functionMatch[1];
  if (classMatch) return classMatch[1];
  if (functionMatch) return functionMatch[1];
  return '';
}

function sectionTopic(sectionTitle) {
  return SECTION_TOPICS.get(sectionTitle) || cleanText(sectionTitle).replace(/^(\d+\.)\s*/, '');
}

function topicFromRules(text, fallback = '') {
  const haystack = cleanText(text);
  for (const [pattern, topic] of TOPIC_RULES) {
    if (pattern.test(haystack)) return topic;
  }
  return fallback;
}

function compactPromptTopic(text, fallback) {
  const stripped = stripMarkdown(text)
    .replace(/^下列|^下面|^以下|^阅读|^观察|^考虑|^运行|^在 Python 中，?/g, '')
    .replace(/(下列|下面|以下)?哪[一项种个]?(.+)?(正确|最合适|输出|描述).*/g, '')
    .replace(/(的输出|输出结果|输出是哪一项|输出是什么).*/g, '')
    .replace(/[:：?？]+$/g, '')
    .trim();
  if (!stripped || stripped.length < 4) return fallback;
  return stripped.slice(0, 28);
}

function codeTraceTopic(question, sectionTitle) {
  const text = `${question?.question ?? ''}\n${question?.description ?? ''}\n${question?.title ?? ''}`;
  const code = firstCodeBlock(text);
  const fallback = sectionTopic(sectionTitle);

  if (/id\(/.test(code) && /type\(/.test(code)) return '对象身份与类型输出';
  if (/copy|deepcopy|\[:\]/.test(code)) return '拷贝与别名输出';
  if (/append|extend|\+=|\[[^\]]+]/.test(code) && /list|lst|arr|nums|L\b/.test(code)) {
    return '列表别名与可变对象输出';
  }
  if (/\bis\b/.test(code) || /id\(/.test(code)) return '对象身份比较输出';
  if (/try|except|finally|raise/.test(code)) return '异常处理执行顺序';
  if (/Stack|push|pop|is_empty/.test(code)) return 'Stack 操作追踪';
  if (/Queue|enqueue|dequeue/.test(code)) return 'Queue 操作追踪';
  if (/LinkedList|_Node|curr|next/.test(code)) return '链表指针追踪';
  if (/Tree|root|left|right|children/.test(code)) return '树遍历与节点关系';
  if (/BST|BinarySearchTree/.test(code)) return 'BST 操作追踪';
  if (/recursive|recursion|\bdef\b/.test(code) && /return/.test(code)) return '递归调用追踪';
  return topicFromRules(text, fallback);
}

function titlePrefix(problem, sourceQuestion) {
  if (problem.type === 'code') return '编程题';
  if (problem.type === 'choice') {
    return sourceQuestion?.questionType === 'code_tracing' ? '代码追踪' : '选择题';
  }
  if (problem.type === 'proof') return '证明题';
  if (problem.type === 'calculation') return '计算题';
  return '简答题';
}

function rawTextForQuestion(problem, sourceQuestion) {
  const content =
    problem.publicContentJson && typeof problem.publicContentJson === 'object'
      ? problem.publicContentJson
      : {};
  return [
    sourceQuestion?.title,
    sourceQuestion?.question,
    sourceQuestion?.description,
    sourceQuestion?.templateCode,
    sourceQuestion?.solutionCode,
    sourceQuestion?.codeAnswer,
    content.stem,
    content.stemTemplate,
    content.starterCode,
  ]
    .filter(Boolean)
    .join('\n');
}

function generateTitle(problem, sourceQuestion) {
  const sectionTitle =
    problem.sourceMeta?.sourceSectionTitle ||
    sourceQuestion?.sectionTitle ||
    sourceQuestion?.category ||
    '';
  const fallback = sectionTopic(sectionTitle);
  const text = rawTextForQuestion(problem, sourceQuestion);
  const prefix = titlePrefix(problem, sourceQuestion);
  let topic = fallback;

  if (problem.type === 'code') {
    const name = firstFunctionOrClassName(text);
    topic = name ? `实现 ${name}` : topicFromRules(text, compactPromptTopic(text, fallback));
  } else if (sourceQuestion?.questionType === 'code_tracing') {
    topic = codeTraceTopic(sourceQuestion, sectionTitle);
  } else {
    topic = topicFromRules(text, fallback);
  }

  return `${prefix}：${topic}`
    .replace(/\s+/g, ' ')
    .replace(/[。；;，,：:？?]+$/g, '')
    .slice(0, 80);
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const sourceData = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const sourceById = new Map(
    (sourceData.combinedQuestions || []).map((question) => [question.id, question]),
  );
  const prisma = new PrismaClient();

  try {
    const notebooks = await prisma.notebook.findMany({
      where: { courseId: COURSE_ID },
      select: { id: true },
    });
    const rows = await prisma.notebookProblem.findMany({
      where: { OR: [{ courseId: COURSE_ID }, { notebookId: { in: notebooks.map((n) => n.id) } }] },
      select: {
        id: true,
        title: true,
        type: true,
        problemNumber: true,
        publicContentJson: true,
        sourceMeta: true,
      },
      orderBy: { problemNumber: 'asc' },
    });

    const rewrites = rows.map((problem) => {
      const sourceQuestion = sourceById.get(problem.sourceMeta?.sourceQuestionId);
      return {
        id: problem.id,
        problemNumber: problem.problemNumber,
        oldTitle: problem.title,
        newTitle: generateTitle(problem, sourceQuestion),
      };
    });
    const changed = rewrites.filter((item) => item.oldTitle !== item.newTitle);
    const badAfter = rewrites.filter((item) => /```|\.{3}|\n|!\[|<img/i.test(item.newTitle));

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          total: rows.length,
          changed: changed.length,
          unchanged: rows.length - changed.length,
          badAfter: badAfter.length,
          samples: changed.slice(0, 80),
        },
        null,
        2,
      ),
    );

    if (!write) return;

    await prisma.$transaction(
      async (tx) => {
        for (const item of changed) {
          const problem = rows.find((row) => row.id === item.id);
          await tx.notebookProblem.update({
            where: { id: item.id },
            data: {
              title: item.newTitle,
              sourceMeta: {
                ...(problem?.sourceMeta || {}),
                titleRewrite: 'csc148-problem-title-rewrite-v1',
                titleRewriteAt: new Date().toISOString(),
                titleBeforeRewrite: item.oldTitle,
              },
            },
          });
        }
      },
      { timeout: 120_000 },
    );

    console.log(JSON.stringify({ updated: changed.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
