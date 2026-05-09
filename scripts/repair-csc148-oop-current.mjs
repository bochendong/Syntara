#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const NOTEBOOK_ID = 'Iy4-IqWo1l';
const SEMANTIC_RENDER_VERSION = 55;

const SCENE_IDS_BY_ORDER = {
  1: 'lgeWOLeIKHI_SvPOjQFNi',
  2: 'dYBl7BCXnB2IVr4BouLW5',
  3: 'E1XofkeZYqXKkDuwXNCNz',
  4: 'j_9yXned7F1ffJxEQ67su',
  5: '1mk9aS4tQAUxQInu1pKjW',
  6: 'yjyxvXtr3EW5RL1YOHwIg',
  7: 'bT9XmJqr9TgAFYKg0bhzO',
  8: 'WihLojWEVELs1Z3R_aX8C',
  9: '3y9XXuF9as300H76oLdK-',
  10: 'U0rRh5B1ibi2csBEHxzEK',
  11: 'WR9cLXy34F9SopNLeYrJw',
  12: '6FsWTLncbhorXtEN1ndsI',
  13: 'M0T27F9-deZPBSev8boil',
};

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function canvas(id, accent = '#0f766e') {
  return {
    id: `repair_${id}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    type: 'content',
    elements: [],
    theme: {
      backgroundColor: '#f8fafc',
      themeColors: [accent, '#0f172a', '#38bdf8', '#22c55e'],
      fontColor: '#0f172a',
      fontName: 'Microsoft YaHei',
    },
    background: { type: 'solid', color: '#f8fafc' },
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
    overflowPolicy: 'preserve_then_paginate',
    archetype: options.archetype || 'example',
    pattern: options.pattern || 'code_split',
    title,
    blocks,
  };
}

function slide(order, title, blocks, options = {}) {
  const id = SCENE_IDS_BY_ORDER[order];
  return {
    id,
    title,
    type: 'slide',
    order,
    content: {
      type: 'slide',
      canvas: canvas(id, options.accent),
      semanticDocument: doc(title, blocks, options),
      semanticRenderVersion: SEMANTIC_RENDER_VERSION,
      semanticRenderMode: 'auto',
      webRenderMode: 'scroll',
    },
    actions: [],
    whiteboard: null,
  };
}

function quiz(order) {
  return {
    id: SCENE_IDS_BY_ORDER[order],
    title: '即时检查：类、属性与 self',
    type: 'quiz',
    order,
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'oop-q1',
          type: 'single',
          points: 10,
          question:
            '阅读下面代码后，哪一项判断是正确的？\n\nclass Student:\n    name: str\n\ns = Student()',
          options: [
            { label: '实例 s 一定已经拥有 name 属性，值为 ""', value: 'A' },
            { label: 'Python 会自动生成 __init__，并把 name 设为 None', value: 'B' },
            {
              label: 'name: str 是类型标注；仅凭这段代码不能保证 s 已有 name 属性',
              value: 'C',
            },
            { label: '因为写了 name: str，所以访问 s.name 永远不会报错', value: 'D' },
          ],
          answer: 'C',
          analysis:
            '类型标注帮助阅读和静态检查，但不会自动给每个实例创建属性。要保证属性存在，通常需要在 __init__ 中执行 self.name = ...。',
        },
        {
          id: 'oop-q2',
          type: 'single',
          points: 10,
          question:
            '如果方法定义为 def like(self, n: int) -> None，而调用写作 tweet.like(10)，参数 self 从哪里来？',
          options: [
            { label: '调用方少传了一个参数，所以这行一定报错', value: 'A' },
            { label: '点号左边的 tweet 会自动作为 self 传入', value: 'B' },
            { label: 'self 总是 None，方法内部再重新创建对象', value: 'C' },
            { label: 'self 是类 Tweet 本身，而不是某个实例', value: 'D' },
          ],
          answer: 'B',
          analysis: '方法调用的点号语法会把接收者对象自动绑定到 self；显式写出的 10 则传给 n。',
        },
        {
          id: 'oop-q3',
          type: 'short_answer',
          points: 8,
          question:
            '用一两句话说明 self.userid = who 与 userid = who 的差别。可以结合“栈帧局部变量”和“实例属性”来解释。',
          answer:
            'self.userid = who 会在当前实例内部创建或更新 userid 属性；userid = who 只是在当前方法栈帧里创建局部变量，方法结束后不会留在对象上。',
          analysis: '核心是数据写到哪里：点号左边是对象，普通名字赋值留在函数局部作用域。',
          hasAnswer: true,
        },
      ],
    },
    actions: [],
    whiteboard: null,
  };
}

const tweetClassCode = `from datetime import date

class Tweet:
    """A tweet, like in Twitter.

    Attributes:
        userid: the id of the user who wrote the tweet.
        created_at: the date the tweet was written.
        content: the contents of the tweet.
        likes: the number of likes this tweet has received.
    """
    userid: str
    created_at: date
    content: str
    likes: int`;

const initializerCode = `class Tweet:
    def __init__(self, who: str, when: date, what: str) -> None:
        self.userid = who
        self.created_at = when
        self.content = what
        self.likes = 0

t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')`;

function scenes() {
  return [
    slide(
      1,
      'CSC148 OOP：从数据表示走向类',
      [
        {
          type: 'paragraph',
          text: '这组笔记把 CSC148 的 OOP 入门页整理成一条可讲课的路线：先看到裸列表和字典的问题，再引入类、实例、实例属性、初始化器和方法。',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '为什么需要类',
              text: '复杂实体需要固定结构，否则字段顺序、缺失字段和无关字段都会悄悄制造错误。',
              tone: 'warning',
            },
            {
              title: '对象里有什么',
              text: '实例属性保存当前对象自己的状态，例如一个 Tweet 的 userid、created_at、content、likes。',
              tone: 'info',
            },
            {
              title: '对象会做什么',
              text: '方法把核心行为放进类里，例如 tweet.like(10)，让数据和操作靠在一起。',
              tone: 'success',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '讲课重点',
          text: '计算机课的版式要让学生看见程序运行过程：代码、调用栈、堆对象和属性表应该反复一起出现。',
        },
      ],
      {
        layoutFamily: 'cover',
        teachingFlow: 'concept_explain',
        archetype: 'intro',
        accent: '#002A5C',
      },
    ),
    slide(
      2,
      '为什么列表和字典不够稳',
      [
        {
          type: 'paragraph',
          text: '如果要写一个类似 Twitter 的程序，我们需要表示一条 tweet：谁写的、什么时候写的、内容是什么、有多少 likes。列表和字典都能装下这些数据，但它们保护不了结构。',
        },
        {
          type: 'code_block',
          language: 'python',
          caption: '两种可行但脆弱的表示方式',
          code: `['David', '2017-09-19', 'Hello, I am so cool', 0]

{
    'userid': 'David',
    'created_at': '2017-09-19',
    'content': 'Hello, I am so cool',
    'likes': 0,
}`,
        },
        {
          type: 'table',
          caption: 'OOP 的动机不是“列表不能用”，而是“表示越复杂，错误越难防”。',
          headers: ['表示方式', '容易出错的地方', '类能改善什么'],
          rows: [
            ['列表', '顺序写错、下标含义不明显、pop 会破坏字段数量', '用命名属性表达结构'],
            ['字典', '漏键、拼错键、添加无关键都很容易', '把结构和操作集中到同一种类型里'],
            ['类', '需要先设计 API 和初始化规则', '让对象始终维持 tweet 形状'],
          ],
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'comparison_review', accent: '#007FA3' },
    ),
    slide(
      3,
      '定义类：docstring 与属性标注',
      [
        {
          type: 'code_block',
          language: 'python',
          code: tweetClassCode,
          caption: '这段代码已经定义了新类型 Tweet，但还没有创建任何具体 tweet 数据。',
        },
        {
          type: 'state_table',
          title: '类体里的三类信息',
          columns: ['代码成分', '作用', '是否创建实例属性'],
          rows: [
            ['class Tweet:', '声明一个新的 Python 类型', '否'],
            ['docstring', '解释这个类型和每个属性的含义', '否'],
            ['userid: str 等', '告诉工具这些属性预期是什么类型', '否'],
          ],
          caption: '这是 CSC148 里很常见的误区：写了属性标注，不等于实例已经有属性。',
        },
        {
          type: 'callout',
          tone: 'warning',
          title: '不要把标注当赋值',
          text: 'userid: str 是给人和工具看的信息；真正把值写入对象，需要执行 self.userid = ... 这样的赋值语句。',
        },
      ],
      {
        layoutFamily: 'code_walkthrough',
        teachingFlow: 'definition_to_example',
        accent: '#0f766e',
      },
    ),
    slide(
      4,
      '空实例：对象存在，但属性还不存在',
      [
        {
          type: 'code_trace',
          title: '追踪 Tweet() 后访问属性',
          language: 'python',
          code: `tweet = Tweet()
tweet.userid`,
          activeLines: [1, 2],
          steps: [
            {
              line: 1,
              state: [{ name: 'tweet', value: '指向一个新的 Tweet 实例' }],
              explanation: 'Tweet() 会创建一个对象，所以变量 tweet 可以引用它。',
            },
            {
              line: 2,
              state: [{ name: 'tweet.userid', value: '找不到这个属性' }],
              explanation: '类体里的 userid: str 没有在实例里创建 userid，因此属性查找失败。',
            },
          ],
          output: "AttributeError: 'Tweet' object has no attribute 'userid'",
        },
        {
          type: 'memory_diagram',
          title: '内存状态',
          stack: [{ name: 'tweet', value: 'ref', ref: 'tweet_obj' }],
          heap: [{ id: 'tweet_obj', label: 'Tweet 实例', fields: [], active: true }],
          links: [{ from: 'tweet', to: 'tweet_obj', label: '引用', active: true }],
          caption: '先区分两件事：对象已经存在；对象内部的属性表仍然是空的。',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'code_walkthrough', accent: '#C8102E' },
    ),
    slide(
      5,
      '__init__：把空对象初始化成可用对象',
      [
        {
          type: 'process_flow',
          title: '调用 Tweet(...) 背后的三步',
          orientation: 'vertical',
          context: [],
          steps: [
            { title: '1. 创建空对象', detail: 'Python 先在后台分配一个新的 Tweet 实例。' },
            {
              title: '2. 调用 __init__',
              detail: '新对象自动传给 self，其余显式参数传给 who、when、what。',
            },
            {
              title: '3. 返回对象引用',
              detail: '构造过程返回已经初始化好的对象；__init__ 本身的返回类型仍然是 None。',
            },
          ],
          summary: '这解释了为什么调用时只写 3 个实参，但 __init__ 的参数列表里有 self。',
        },
        {
          type: 'call_stack',
          title: '__init__ 调用时的栈帧',
          frames: [
            {
              name: '__init__',
              args: [
                { name: 'self', value: '<新 Tweet 对象>' },
                { name: 'who', value: "'Giovanna'" },
                { name: 'when', value: 'date(2017, 9, 18)' },
                { name: 'what', value: "'Hello'" },
              ],
              locals: [],
              note: 'self 由 Python 自动传入，调用者不手写。',
              active: true,
            },
          ],
          caption: '讲 self 时，栈帧比纯文字更有效。',
        },
      ],
      { layoutFamily: 'timeline', teachingFlow: 'code_walkthrough', accent: '#002A5C' },
    ),
    slide(
      6,
      '例题：逐行追踪 __init__ 与属性赋值',
      [
        {
          type: 'code_trace',
          title: '初始化 t1',
          language: 'python',
          code: initializerCode,
          activeLines: [2, 3, 4, 5],
          steps: [
            {
              line: 2,
              state: [{ name: 'self.userid', value: "'Giovanna'" }],
              explanation: 'self.userid = who 把参数 who 的值写入当前对象的 userid 属性。',
            },
            {
              line: 3,
              state: [{ name: 'self.created_at', value: 'date(2017, 9, 18)' }],
              explanation: 'created_at 也写进同一个对象，不是写到类里，也不是写到局部变量里。',
            },
            {
              line: 5,
              state: [{ name: 'self.likes', value: '0' }],
              explanation: 'likes 不由调用者决定，每个新 Tweet 都统一从 0 开始。',
            },
          ],
        },
        {
          type: 'memory_diagram',
          title: '初始化结束后的 t1',
          stack: [{ name: 't1', value: 'ref', ref: 't1_obj' }],
          heap: [
            {
              id: 't1_obj',
              label: 'Tweet 实例',
              fields: [
                { name: 'userid', value: "'Giovanna'" },
                { name: 'created_at', value: 'date(2017, 9, 18)' },
                { name: 'content', value: "'Hello'" },
                { name: 'likes', value: '0' },
              ],
              active: true,
            },
          ],
          links: [{ from: 't1', to: 't1_obj', label: '引用', active: true }],
          caption: '这张图应该成为本节课的核心图：变量在栈上，对象和属性在堆上。',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'code_walkthrough', accent: '#007FA3' },
    ),
    quiz(7),
    slide(
      8,
      '点号访问：从引用走到对象属性',
      [
        {
          type: 'code_trace',
          title: '读取初始化后的属性',
          language: 'python',
          code: `t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')
t1.userid
t1.created_at
t1.content
t1.likes`,
          activeLines: [2, 3, 4, 5],
          steps: [
            {
              line: 2,
              state: [{ name: 't1.userid', value: "'Giovanna'" }],
              explanation: 'Python 先沿着 t1 找到对象，再在对象的属性表里找 userid。',
            },
            {
              line: 5,
              state: [{ name: 't1.likes', value: '0' }],
              explanation: 'likes 是 __init__ 统一设定的初始状态。',
            },
          ],
        },
        {
          type: 'state_table',
          title: 't1 的属性表',
          columns: ['属性', '值', '来源'],
          rows: [
            ['userid', "'Giovanna'", '参数 who'],
            ['created_at', 'date(2017, 9, 18)', '参数 when'],
            ['content', "'Hello'", '参数 what'],
            ['likes', '0', '类的初始化规则'],
          ],
          caption: '课堂上可以让学生判断哪些值由外部传入，哪些由类自己规定。',
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'code_walkthrough', accent: '#0f766e' },
    ),
    slide(
      9,
      '从函数到方法：行为应该放在哪里',
      [
        {
          type: 'paragraph',
          text: '有了 Tweet 类型后，我们可以继续写普通函数操作它；但如果某个行为是 Tweet 的核心能力，就更适合放进类里成为方法。',
        },
        {
          type: 'code_block',
          language: 'python',
          caption: '同一个“点赞”行为的两种写法',
          code: `def like(tweet: Tweet, n: int) -> None:
    tweet.likes += n

class Tweet:
    ...

    def like(self, n: int) -> None:
        self.likes += n`,
        },
        {
          type: 'table',
          caption: 'CSC148 关心的是设计判断，不只是语法转换。',
          headers: ['选择', '适合场景', '调用方式'],
          rows: [
            ['普通函数', '一次性工具、不是类型核心能力', 'like(tweet, 3)'],
            ['方法', '大多数 Tweet 用户自然会需要的行为', 'tweet.like(3)'],
          ],
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'comparison_review', accent: '#002A5C' },
    ),
    slide(
      10,
      '方法调用：tweet.like(10) 为什么少写 self',
      [
        {
          type: 'code_trace',
          title: '点号语法自动传入接收者',
          language: 'python',
          code: `tweet = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')
tweet.like(10)
tweet.likes`,
          activeLines: [2, 3],
          steps: [
            {
              line: 2,
              state: [
                { name: 'self', value: 'tweet 指向的对象' },
                { name: 'n', value: '10' },
              ],
              explanation: '点号左边的 tweet 自动绑定到 self；括号里的 10 才是显式传给 n 的参数。',
            },
            {
              line: 3,
              state: [{ name: 'tweet.likes', value: '10' }],
              explanation: '方法修改的是这个具体 tweet 对象上的 likes 属性。',
            },
          ],
        },
        {
          type: 'state_table',
          title: '两种等价但风格不同的调用',
          columns: ['写法', '传给 self 的对象', '显式参数'],
          rows: [
            ['tweet.like(10)', 'tweet', '10'],
            ['Tweet.like(tweet, 10)', 'tweet', '10'],
            ['word.count("i")', 'word', '"i"'],
          ],
          caption: '几乎总是使用对象点号形式，因为它让“谁在执行这个行为”更清楚。',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'code_walkthrough', accent: '#C8102E' },
    ),
    slide(
      11,
      '方法、函数与 special methods',
      [
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '方法也是函数',
              text: '方法定义在类体里，第一个参数通常叫 self，表示要操作的那个实例。',
              tone: 'info',
            },
            {
              title: '__init__ 是 special method',
              text: '构造对象时自动调用，负责初始化实例属性。',
              tone: 'success',
            },
            {
              title: '__str__ 也是 special method',
              text: '当 print(obj) 需要字符串表示时，Python 会自动调用它。',
              tone: 'warning',
            },
          ],
        },
        {
          type: 'code_block',
          language: 'python',
          caption: 'special method 的共同点：你定义规则，Python 在特定场景自动调用。',
          code: `class Tweet:
    ...

    def __str__(self) -> str:
        return f'{self.userid}: {self.content} ({self.likes} likes)'

print(t1)`,
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '课程衔接',
          text: '后面的 linked list、tree、BST 都会反复使用同一套思想：对象保存状态，方法维护结构不变量。',
        },
      ],
      { layoutFamily: 'concept_cards', teachingFlow: 'concept_explain', accent: '#0f766e' },
    ),
    slide(
      12,
      '综合例题：补全 Tweet 初始化器与 like 方法',
      [
        {
          type: 'code_walkthrough',
          title: '完整可用的 Tweet 类骨架',
          language: 'python',
          code: `from datetime import date

class Tweet:
    userid: str
    created_at: date
    content: str
    likes: int

    def __init__(self, who: str, when: date, what: str) -> None:
        self.userid = who
        self.created_at = when
        self.content = what
        self.likes = 0

    def like(self, n: int) -> None:
        self.likes += n`,
          caption: '这份骨架把“状态初始化”和“核心行为”都放回 Tweet 类型里。',
          steps: [
            {
              title: '先保证状态完整',
              explanation: '__init__ 结束后，每个 Tweet 都应该有四个实例属性。',
            },
            {
              title: '再定义核心行为',
              explanation: 'like 方法只需要知道当前对象 self 和增加的点赞数 n。',
            },
            {
              title: '检查 API',
              explanation: '客户端可以写 t = Tweet(...); t.like(3); t.likes，这就是对象式调用。',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'warning',
          title: '常见错误',
          text: '如果把 self.likes += n 写成 likes += n，就不是在改对象属性；如果 __init__ 里漏掉 self.likes = 0，第一次调用 like 可能直接 AttributeError。',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'problem_walkthrough', accent: '#007FA3' },
    ),
    slide(
      13,
      '总结：OOP 入门要带走的模型',
      [
        {
          type: 'layout_cards',
          columns: 4,
          items: [
            {
              title: '类',
              text: '一种新的数据类型，定义对象应有的结构和核心行为。',
              tone: 'info',
            },
            {
              title: '实例',
              text: '由类创建出来的具体对象，每个实例有自己的属性值。',
              tone: 'success',
            },
            {
              title: 'self',
              text: '当前正在被初始化或操作的那个实例。',
              tone: 'warning',
            },
            {
              title: '方法',
              text: '定义在类里的函数，通常通过对象点号调用。',
              tone: 'neutral',
            },
          ],
        },
        {
          type: 'process_flow',
          title: '从这里走向后面的 CSC148',
          orientation: 'horizontal',
          context: [],
          steps: [
            { title: 'OOP', detail: '对象保存状态，方法维护行为。' },
            { title: 'Linked List', detail: '每个节点是对象，保存 item 和 next。' },
            { title: 'Trees / BST', detail: '每个节点或树对象保存子结构和搜索规则。' },
            { title: 'Recursion', detail: '方法常常递归处理对象内部的嵌套结构。' },
          ],
          summary: '所以这节课不是孤立语法，而是后面数据结构课程的地基。',
        },
      ],
      {
        layoutFamily: 'summary',
        teachingFlow: 'concept_explain',
        archetype: 'summary',
        accent: '#002A5C',
      },
    ),
  ];
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }

  const prisma = new PrismaClient();
  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: NOTEBOOK_ID },
      select: { id: true, courseId: true, ownerId: true, name: true },
    });
    if (!notebook) throw new Error(`Notebook not found: ${NOTEBOOK_ID}`);

    const updatedScenes = scenes();
    for (const scene of updatedScenes) {
      await prisma.scene.upsert({
        where: { id: scene.id },
        create: {
          id: scene.id,
          notebookId: NOTEBOOK_ID,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        },
        update: {
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        },
      });
    }

    await prisma.notebook.update({
      where: { id: NOTEBOOK_ID },
      data: {
        name: 'UTSG CSC148：OOP 入门笔记',
        description:
          '基于 CSC148 OOP introduction 整理：Tweet 表示问题、类、实例属性、__init__、self、方法调用和 special methods。',
        tags: ['CSC148', 'OOP', 'Python', 'Classes', 'Methods'],
        language: 'zh-CN',
        style: 'cs-code-walkthrough',
        updatedAt: new Date(),
      },
    });

    if (notebook.courseId) {
      await prisma.course.update({
        where: { id: notebook.courseId },
        data: {
          name: 'UTSG CSC148',
          courseCode: 'CSC148',
          university: 'University of Toronto St. George',
          tags: ['CSC148', 'Python', 'OOP', 'Data Structures'],
          updatedAt: new Date(),
        },
      });
    }

    console.log(`Updated ${updatedScenes.length} scenes for ${NOTEBOOK_ID}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
