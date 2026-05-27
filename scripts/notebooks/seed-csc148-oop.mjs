#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { TESTFILE_ROOT } from '../shared/paths.mjs';

const COURSE_ID = 'course-utsg-csc148';
const NOTEBOOK_ID = 'nb-utsg-csc148-oop-intro';
const SOURCE_PATH = path.join(TESTFILE_ROOT, 'oop.md');
const COURSE_AVATAR = '/avatars/notebook-agents/avatar2.avif';
const NOTEBOOK_AVATAR = '/avatars/notebook-agents/avatar3.avif';
const NOW = new Date();

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function buildUserId(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'user-anonymous';
  const safe = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `user-${safe || 'anonymous'}`;
}

function readSourceSummary() {
  const absolutePath = path.resolve(process.cwd(), SOURCE_PATH);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Source markdown not found: ${SOURCE_PATH}`);
  }

  const markdown = fs.readFileSync(absolutePath, 'utf8');
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Introduction to OOP';
  const headings = Array.from(markdown.matchAll(/^#{2,3}\s+(.+)$/gm)).map((match) =>
    match[1].trim(),
  );
  const lineCount = markdown.split(/\r?\n/).length;
  const hash = crypto.createHash('sha256').update(markdown).digest('hex').slice(0, 12);

  return { markdown, title, headings, lineCount, hash };
}

function defaultCanvas(id, accent = '#002A5C') {
  return {
    id: `slide_${id}`,
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: {
      backgroundColor: '#f8fafc',
      themeColors: [accent, '#C8102E', '#007FA3', '#0f766e', '#111827'],
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
    language: 'en-US',
    profile: 'code',
    disciplineStyle: 'code',
    teachingFlow: options.teachingFlow || 'concept_explain',
    layout: options.layout || { mode: 'stack' },
    layoutFamily: options.layoutFamily || 'concept_cards',
    density: options.density || 'standard',
    visualRole: 'none',
    overflowPolicy: 'compress_first',
    archetype: options.archetype || 'concept',
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
      semanticRenderVersion: 55,
      semanticRenderMode: 'auto',
      webRenderMode: 'scroll',
    },
    actions: [],
    whiteboard: null,
  };
}

function quizScene(order) {
  return {
    id: `${NOTEBOOK_ID}-quiz`,
    notebookId: NOTEBOOK_ID,
    title: 'Practice: OOP mental model',
    type: 'quiz',
    order,
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'oop-q1',
          type: 'single',
          question:
            'Why does CSC148 introduce a Tweet class instead of representing tweets only with lists or dictionaries?',
          options: [
            { label: 'To enforce a shared structure and reduce malformed data', value: 'A' },
            { label: 'Because Python dictionaries cannot store strings', value: 'B' },
            { label: 'Because lists and dictionaries cannot be passed to functions', value: 'C' },
            { label: 'To make every attribute private by default', value: 'D' },
          ],
          answer: 'A',
          analysis:
            'The main design goal is protecting against mistakes: a class gives the data a named structure and controlled operations.',
        },
        {
          id: 'oop-q2',
          type: 'single',
          question: 'What does the annotation `userid: str` inside the class body do at runtime?',
          options: [
            { label: 'It creates `userid` on every new Tweet object', value: 'A' },
            {
              label: 'It documents the expected type for tools, but creates no instance attribute',
              value: 'B',
            },
            { label: 'It makes `userid` impossible to change', value: 'C' },
            { label: 'It calls `__init__` automatically', value: 'D' },
          ],
          answer: 'B',
          analysis:
            'The notes emphasize that type annotations support tools such as PyCharm; the attributes are actually created by assignments like `self.userid = who`.',
        },
        {
          id: 'oop-q3',
          type: 'code_tracing',
          question: 'After the code runs, what are `t1.userid` and `t1.likes`?',
          codeSnippet:
            "from datetime import date\n\nclass Tweet:\n    def __init__(self, who: str, when: date, what: str) -> None:\n        self.userid = who\n        self.created_at = when\n        self.content = what\n        self.likes = 0\n\n    def like(self, n: int) -> None:\n        self.likes += n\n\nt1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')\nt1.like(3)",
          answer: "t1.userid == 'Giovanna' and t1.likes == 3",
          analysis:
            '`__init__` creates `likes` with value 0. Calling `t1.like(3)` passes `t1` to `self` and increments that object attribute.',
          hasAnswer: true,
        },
        {
          id: 'oop-q4',
          type: 'short_answer',
          question:
            'In one or two sentences, explain why `tweet.like(10)` has one explicit argument even though `like` has two parameters.',
          answer:
            'Dot notation automatically passes the object to the left of the dot as `self`; the explicit argument 10 is passed to `n`.',
          analysis:
            'This is the same mechanism behind `word.count("i")`: the receiver object becomes the first parameter.',
          hasAnswer: true,
        },
      ],
    },
    actions: [],
    whiteboard: null,
  };
}

function buildScenes(source) {
  const sourceLine = `${SOURCE_PATH} (${source.lineCount} lines, sha256 ${source.hash})`;
  return [
    slideScene(
      0,
      'CSC148 OOP: why classes enter the story',
      [
        {
          type: 'paragraph',
          text: 'This notebook turns the CSC148 OOP introduction into a teaching sequence: start with messy tweet data, introduce a class as a custom type, then use memory diagrams to make `self`, attributes, and methods concrete.',
        },
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: 'Data shape',
              text: 'A tweet needs a user id, creation date, content, and likes. The class gives that bundle a name.',
              tone: 'info',
            },
            {
              title: 'Error prevention',
              text: 'Lists and dictionaries can represent tweets, but they do not protect against missing fields or wrong order.',
              tone: 'warning',
            },
            {
              title: 'Object mindset',
              text: 'The object becomes the central thing: it owns both its state and the behaviours most users need.',
              tone: 'success',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Source',
          text: `Seeded from ${sourceLine}. Main sections: ${source.headings.slice(0, 7).join('; ')}.`,
        },
      ],
      { archetype: 'intro', layoutFamily: 'cover', accent: '#002A5C' },
    ),
    slideScene(
      1,
      'The tweet representation problem',
      [
        {
          type: 'paragraph',
          text: 'The notes begin with a practical modelling question: if we were writing Twitter, how should one tweet be represented in Python?',
        },
        {
          type: 'code_block',
          language: 'python',
          code: "['David', '2017-09-19', 'Hello, I am so cool', 0]\n\n{\n    'userid': 'David',\n    'created_at': '2017-09-19',\n    'content': 'Hello, I am so cool',\n    'likes': 0,\n}",
          caption:
            'Both representations can hold the data, but neither explains what the data is supposed to be.',
        },
        {
          type: 'table',
          caption:
            'The problem is not that lists and dictionaries are unusable; it is that they are too permissive.',
          headers: ['Representation', 'What can go wrong', 'CSC148 lesson'],
          rows: [
            [
              'List',
              'Values can be in the wrong order; `pop` can remove a required field.',
              'Position is fragile.',
            ],
            [
              'Dictionary',
              'Keys can be missing or unrelated keys can be added.',
              'Names help, but structure is still informal.',
            ],
            [
              'Class',
              'The intended attributes and behaviours live together.',
              'A custom type can encode the model.',
            ],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Teaching line',
          text: 'Frame this as a design move: classes help protect a program from everyday representation mistakes.',
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'comparison_review', accent: '#007FA3' },
    ),
    slideScene(
      2,
      'A class is a new Python type',
      [
        {
          type: 'definition',
          title: 'Class',
          text: 'A class is the formal name for a type of data in Python. An object whose type is `Tweet` is an instance of class `Tweet`.',
        },
        {
          type: 'definition',
          title: 'Instance attribute',
          text: 'An instance attribute is one piece of data bundled inside a particular object, such as `userid`, `created_at`, `content`, or `likes` for one tweet.',
        },
        {
          type: 'code_block',
          language: 'python',
          code: 'from datetime import date\n\nclass Tweet:\n    """A tweet, like in Twitter.\n\n    Attributes:\n        userid: the id of the user who wrote the tweet.\n        created_at: the date the tweet was written.\n        content: the contents of the tweet.\n        likes: the number of likes this tweet has received.\n    """\n    userid: str\n    created_at: date\n    content: str\n    likes: int',
          caption:
            'The docstring explains meaning; the annotations explain expected types to tools.',
        },
        {
          type: 'callout',
          tone: 'warning',
          title: 'Important trap',
          text: 'Attribute annotations do not create instance variables at runtime. The actual attributes appear only when assignments run, usually inside `__init__`.',
        },
      ],
      { layoutFamily: 'concept_cards', teachingFlow: 'definition_to_example', accent: '#002A5C' },
    ),
    slideScene(
      3,
      'Why `Tweet()` is still empty',
      [
        {
          type: 'code_trace',
          title: 'Tracing the empty instance',
          language: 'python',
          code: 'tweet = Tweet()\ntweet.userid',
          activeLines: [1, 2],
          steps: [
            {
              line: 1,
              state: [{ name: 'tweet', value: 'reference to a new Tweet object' }],
              explanation: '`Tweet()` creates an object, so the variable `tweet` can point to it.',
            },
            {
              line: 2,
              state: [{ name: 'tweet.userid', value: 'not found' }],
              explanation:
                'The annotation `userid: str` did not create the attribute, so attribute lookup fails.',
            },
          ],
          output: "AttributeError: 'Tweet' object has no attribute 'userid'",
        },
        {
          type: 'memory_diagram',
          title: 'Memory after `tweet = Tweet()`',
          stack: [{ name: 'tweet', value: 'ref', ref: 'tweet_obj' }],
          heap: [{ id: 'tweet_obj', label: 'Tweet instance', fields: [], active: true }],
          links: [{ from: 'tweet', to: 'tweet_obj', label: 'points to', active: true }],
          caption: 'There is an object, but its instance-attribute table is empty.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'How to teach it',
          text: 'Separate “object exists” from “object has attributes”. This distinction is the doorway into `__init__`.',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'code_walkthrough', accent: '#C8102E' },
    ),
    slideScene(
      4,
      '`__init__` builds the instance state',
      [
        {
          type: 'code_trace',
          title: 'Initializer trace',
          language: 'python',
          code: "def __init__(self, who: str, when: date, what: str) -> None:\n    self.userid = who\n    self.created_at = when\n    self.content = what\n    self.likes = 0\n\nt1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')",
          activeLines: [1, 2, 3, 4, 5],
          steps: [
            {
              line: 1,
              state: [
                { name: 'self', value: 'new Tweet object' },
                { name: 'who', value: "'Giovanna'" },
                { name: 'when', value: 'date(2017, 9, 18)' },
                { name: 'what', value: "'Hello'" },
              ],
              explanation:
                'Python passes the newly created object into `self`; the three explicit arguments fill the other parameters.',
            },
            {
              line: 2,
              state: [{ name: 'self.userid', value: "'Giovanna'" }],
              explanation:
                '`self.userid = who` creates an attribute on the object, not a local variable in the stack frame.',
            },
            {
              line: 5,
              state: [{ name: 'self.likes', value: '0' }],
              explanation:
                'The client chooses the first three initial values, but every new tweet starts with zero likes.',
            },
          ],
        },
        {
          type: 'memory_diagram',
          title: 'After the initializer returns',
          stack: [{ name: 't1', value: 'ref', ref: 't1_obj' }],
          heap: [
            {
              id: 't1_obj',
              label: 'Tweet instance',
              fields: [
                { name: 'userid', value: "'Giovanna'" },
                { name: 'created_at', value: '2017-09-18' },
                { name: 'content', value: "'Hello'" },
                { name: 'likes', value: '0' },
              ],
              active: true,
            },
          ],
          links: [{ from: 't1', to: 't1_obj', label: 'points to', active: true }],
          caption: 'The instance now carries a consistent tweet-shaped bundle of state.',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'code_walkthrough', accent: '#002A5C' },
    ),
    slideScene(
      5,
      'What really happens on construction',
      [
        {
          type: 'process_flow',
          title: 'Calling `Tweet(...)` is a three-step protocol',
          orientation: 'vertical',
          steps: [
            {
              title: '1. Allocate',
              detail: 'Python creates a new, empty `Tweet` object behind the scenes.',
            },
            {
              title: '2. Initialize',
              detail:
                'Python calls `__init__`, passing the new object to `self` and the explicit arguments to the remaining parameters.',
            },
            {
              title: '3. Return the object',
              detail:
                'The newly initialized object is returned by the construction process, not by `__init__` itself.',
            },
          ],
          summary:
            'This explains why `__init__` has return type `None` even though `Tweet(...)` gives us a usable object.',
        },
        {
          type: 'call_stack',
          title: 'Stack frame during `__init__`',
          frames: [
            {
              name: '__init__',
              args: [
                { name: 'self', value: '<new Tweet object>' },
                { name: 'who', value: "'Giovanna'" },
                { name: 'when', value: 'date(2017, 9, 18)' },
                { name: 'what', value: "'Hello'" },
              ],
              locals: [],
              note: '`self` is automatic; the client never passes it explicitly.',
              active: true,
            },
            {
              name: '<module>',
              args: [],
              locals: [{ name: 't1', value: 'waiting for returned object' }],
              active: false,
            },
          ],
          caption: 'The strange-looking `self` parameter becomes ordinary when we draw the call.',
        },
      ],
      { layoutFamily: 'timeline', teachingFlow: 'code_walkthrough', accent: '#0f766e' },
    ),
    slideScene(
      6,
      'Dot notation reads object state',
      [
        {
          type: 'code_trace',
          title: 'Reading attributes after construction',
          language: 'python',
          code: "t1 = Tweet('Giovanna', date(2017, 9, 18), 'Hello')\nt1.userid\nt1.created_at\nt1.content\nt1.likes",
          activeLines: [2, 3, 4, 5],
          steps: [
            {
              line: 2,
              state: [{ name: 't1.userid', value: "'Giovanna'" }],
              explanation: 'Python follows `t1` to the object and looks up the `userid` attribute.',
            },
            {
              line: 5,
              state: [{ name: 't1.likes', value: '0' }],
              explanation:
                '`likes` was initialized by the class design, even though the client did not pass it.',
            },
          ],
        },
        {
          type: 'state_table',
          title: 'Attribute table for `t1`',
          columns: ['Attribute', 'Value', 'Who chose it?'],
          rows: [
            ['userid', "'Giovanna'", 'Client argument `who`'],
            ['created_at', '2017-09-18', 'Client argument `when`'],
            ['content', "'Hello'", 'Client argument `what`'],
            ['likes', '0', 'Class initializer'],
          ],
          caption: 'A useful classroom move is to ask students which values the client controls.',
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'code_walkthrough', accent: '#007FA3' },
    ),
    slideScene(
      7,
      'Functions become methods when behaviour belongs to the type',
      [
        {
          type: 'paragraph',
          text: 'The notes first show helper functions such as `like(tweet, n)` and `retweet(...)`, then move `like` inside the class. That move changes how users discover and call the behaviour.',
        },
        {
          type: 'code_block',
          language: 'python',
          code: 'def like(tweet: Tweet, n: int) -> None:\n    tweet.likes += n\n\nclass Tweet:\n    ...\n\n    def like(self, n: int) -> None:\n        self.likes += n',
          caption:
            'The body is almost the same; the receiver object is now called `self` and the method lives in the class body.',
        },
        {
          type: 'table',
          caption:
            'The design question is whether most users of the type should get the behaviour automatically.',
          headers: ['Choice', 'When it fits', 'Cost'],
          rows: [
            [
              'Method',
              'Core behaviour of the class, such as liking a tweet.',
              'Adds to the class API.',
            ],
            [
              'Function',
              'Task-specific operation outside the core abstraction.',
              'Must be imported separately.',
            ],
          ],
        },
      ],
      { layoutFamily: 'comparison', teachingFlow: 'comparison_review', accent: '#002A5C' },
    ),
    slideScene(
      8,
      '`self` in method calls',
      [
        {
          type: 'code_trace',
          title: 'Dot notation passes the receiver',
          language: 'python',
          code: "tweet = Tweet('Rukhsana', date(2017, 9, 16), 'Hey!')\ntweet.like(10)\ntweet.likes",
          activeLines: [2, 3],
          steps: [
            {
              line: 2,
              state: [
                { name: 'self', value: 'tweet object' },
                { name: 'n', value: '10' },
              ],
              explanation:
                '`tweet.like(10)` automatically passes `tweet` as `self`, so only `10` is written as an explicit argument.',
            },
            {
              line: 3,
              state: [{ name: 'tweet.likes', value: '10' }],
              explanation:
                'The method mutates the `likes` attribute stored on that particular object.',
            },
          ],
        },
        {
          type: 'state_table',
          title: 'Two equivalent calls',
          columns: ['Call form', 'Object sent to `self`', 'Other argument'],
          rows: [
            ['tweet.like(10)', 'tweet', '10'],
            ['Tweet.like(tweet, 10)', 'tweet', '10'],
            ['word.count("i")', 'word', '"i"'],
          ],
          caption:
            'CSC148 usually prefers the object-dot form because it keeps the object central.',
        },
      ],
      { layoutFamily: 'code_walkthrough', teachingFlow: 'code_walkthrough', accent: '#C8102E' },
    ),
    slideScene(
      9,
      'Special methods and the API boundary',
      [
        {
          type: 'layout_cards',
          columns: 3,
          items: [
            {
              title: '`__init__`',
              text: 'Called automatically during construction to initialize instance attributes.',
              tone: 'info',
            },
            {
              title: '`__str__`',
              text: 'Called automatically by `print(obj)` when we define a readable representation.',
              tone: 'success',
            },
            {
              title: 'API judgment',
              text: 'Methods should be behaviours most users need; one-off operations can stay as functions.',
              tone: 'warning',
            },
          ],
        },
        {
          type: 'code_block',
          language: 'python',
          code: '>>> print(t1)\nGiovanna said "Hello" on 2017-09-18 (0 likes)',
          caption:
            'The notes preview `__str__` as another special method that Python calls for us.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Bridge to later CSC148',
          text: 'This OOP mental model becomes the foundation for linked lists, trees, BSTs, and recursion over objects: each node is an object with state and behaviour.',
        },
      ],
      {
        layoutFamily: 'summary',
        teachingFlow: 'concept_explain',
        archetype: 'summary',
        accent: '#0f766e',
      },
    ),
    quizScene(10),
  ];
}

async function resolveOwner(prisma) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const ownerName = process.env.OWNER_NAME?.trim() || 'CSC148 Instructor';

  if (ownerEmail) {
    const existing = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true, email: true, name: true },
    });
    const ownerId = existing?.id || buildUserId(ownerEmail);
    await prisma.user.upsert({
      where: { id: ownerId },
      create: {
        id: ownerId,
        email: ownerEmail,
        name: existing?.name || ownerName,
      },
      update: {
        email: ownerEmail,
        name: existing?.name || ownerName,
      },
    });
    return { id: ownerId, email: ownerEmail, name: existing?.name || ownerName };
  }

  const existingUser = await prisma.user.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, email: true, name: true },
  });
  if (existingUser) return existingUser;

  const fallbackEmail = 'csc148@local.test';
  const fallbackId = buildUserId(fallbackEmail);
  await prisma.user.upsert({
    where: { id: fallbackId },
    create: {
      id: fallbackId,
      email: fallbackEmail,
      name: ownerName,
    },
    update: {
      email: fallbackEmail,
      name: ownerName,
    },
  });
  return { id: fallbackId, email: fallbackEmail, name: ownerName };
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and configure it.');
  }

  const source = readSourceSummary();
  const scenes = buildScenes(source);
  const prisma = new PrismaClient();

  try {
    const owner = await resolveOwner(prisma);

    await prisma.course.upsert({
      where: { id: COURSE_ID },
      create: {
        id: COURSE_ID,
        ownerId: owner.id,
        name: 'UTSG CSC148',
        description:
          'University of Toronto St. George CSC148 course space for object-oriented programming, recursion, linked lists, trees, and data structures.',
        language: 'en-US',
        tags: ['CSC148', 'UTSG', 'Python', 'OOP', 'Data Structures'],
        purpose: 'university',
        university: 'University of Toronto St. George',
        courseCode: 'CSC148',
        avatarUrl: COURSE_AVATAR,
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
      update: {
        ownerId: owner.id,
        name: 'UTSG CSC148',
        description:
          'University of Toronto St. George CSC148 course space for object-oriented programming, recursion, linked lists, trees, and data structures.',
        language: 'en-US',
        tags: ['CSC148', 'UTSG', 'Python', 'OOP', 'Data Structures'],
        purpose: 'university',
        university: 'University of Toronto St. George',
        courseCode: 'CSC148',
        avatarUrl: COURSE_AVATAR,
        listedInCourseStore: false,
        coursePriceCents: 0,
      },
    });

    await prisma.notebook.upsert({
      where: { id: NOTEBOOK_ID },
      create: {
        id: NOTEBOOK_ID,
        ownerId: owner.id,
        courseId: COURSE_ID,
        name: source.title,
        description: `CSC148 notebook seeded from ${SOURCE_PATH}: custom types, Tweet attributes, __init__, self, dot notation, methods, and special methods. Source checksum: ${source.hash}.`,
        tags: ['OOP', 'Python', 'Classes', 'Methods', 'CSC148'],
        avatarUrl: NOTEBOOK_AVATAR,
        language: 'en-US',
        style: 'cs-worked-example',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
      },
      update: {
        ownerId: owner.id,
        courseId: COURSE_ID,
        name: source.title,
        description: `CSC148 notebook seeded from ${SOURCE_PATH}: custom types, Tweet attributes, __init__, self, dot notation, methods, and special methods. Source checksum: ${source.hash}.`,
        tags: ['OOP', 'Python', 'Classes', 'Methods', 'CSC148'],
        avatarUrl: NOTEBOOK_AVATAR,
        language: 'en-US',
        style: 'cs-worked-example',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
      },
    });

    await prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
    await prisma.scene.createMany({
      data: scenes.map((scene) => ({
        id: scene.id,
        notebookId: scene.notebookId,
        title: scene.title,
        type: scene.type,
        order: scene.order,
        content: scene.content,
        actions: scene.actions,
        whiteboard: scene.whiteboard,
      })),
    });

    await prisma.course.update({
      where: { id: COURSE_ID },
      data: { updatedAt: NOW },
    });
    await prisma.notebook.update({
      where: { id: NOTEBOOK_ID },
      data: { updatedAt: NOW },
    });

    console.log('Seeded UTSG CSC148 OOP notebook.');
    console.log(`Owner: ${owner.name || '-'} <${owner.email || '-'}> (${owner.id})`);
    console.log(`Course URL: /course/${COURSE_ID}`);
    console.log(`Notebook URL: /classroom/${NOTEBOOK_ID}`);
    console.log(`Scenes: ${scenes.length}`);
    console.log(`Source: ${SOURCE_PATH} (${source.lineCount} lines, sha256 ${source.hash})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
