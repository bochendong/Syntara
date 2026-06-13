#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const DEFAULT_SOURCE_PATH =
  '/Users/dongpochen/Desktop/2025 Fall/CSC 108/讲义/老师讲义/Mid_Review/06_MidReview.pdf';
const SOURCE_FILE_NAME = '06_MidReview.pdf';
const SOURCE_EXAM = 'CSC108 Midterm Review Handout';

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

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function cleanLines(text) {
  return String(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function codeBlock(code, language = 'python') {
  return `\`\`\`${language}\n${String(code).trimEnd()}\n\`\`\``;
}

function textBlock(text) {
  return `\`\`\`text\n${String(text).trimEnd()}\n\`\`\``;
}

function answerLabel(value) {
  const text = String(value);
  if (text.includes('\n')) return textBlock(text);
  return text;
}

function unique(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function rotatedOptions(correct, distractors, number) {
  const pool = unique([
    correct,
    ...distractors,
    'Error',
    'No output',
    'None',
    'True',
    'False',
  ]).slice(0, 4);
  if (pool.length < 2) throw new Error(`Not enough options for ${correct}`);
  const correctIndex = pool.indexOf(correct);
  const targetIndex = number % pool.length;
  [pool[correctIndex], pool[targetIndex]] = [pool[targetIndex], pool[correctIndex]];
  return {
    options: pool.map((label, index) => ({
      id: String.fromCharCode(65 + index),
      label: answerLabel(label),
    })),
    correctOptionIds: [String.fromCharCode(65 + targetIndex)],
  };
}

function baseDraft(number, sourceQuestionId, overrides) {
  return {
    draftId: `csc108-midreview-2025-${String(number).padStart(3, '0')}`,
    notebookId: null,
    status: 'published',
    source: 'pdf',
    points: 1,
    tags: ['CSC108', 'mid-review', 'fall-2025'],
    difficulty: 'medium',
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId,
      sourceQuestionNumber: number,
      sourceQuestionLabel: sourceQuestionId,
    },
    validationErrors: [],
    ...overrides,
  };
}

function choiceDraft({
  number,
  title,
  stem,
  options,
  correctOptionIds,
  points = 1,
  difficulty = 'medium',
  section,
  topic,
  selectionMode,
}) {
  return baseDraft(number, `MR-${String(number).padStart(3, '0')}`, {
    title: `Mid Review ${number}: ${title}`,
    type: 'choice',
    points,
    tags: ['CSC108', 'mid-review', 'fall-2025', 'choice'],
    difficulty,
    publicContent: {
      type: 'choice',
      stem: cleanLines(stem),
      selectionMode: selectionMode ?? (correctOptionIds.length > 1 ? 'multiple' : 'single'),
      options,
    },
    grading: {
      type: 'choice',
      correctOptionIds,
      analysis: `Answer inferred from the ${topic ?? title} material in the source PDF.`,
    },
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId: `MR-${String(number).padStart(3, '0')}`,
      sourceQuestionNumber: number,
      sourceQuestionLabel: `MR-${String(number).padStart(3, '0')}`,
      sourceCategory: section ?? 'review-choice',
      sourceTopic: topic ?? title,
      answerSource: 'codex-solved-from-pdf',
    },
  });
}

function outputChoice(number, title, code, correct, distractors = [], section = 'code-output') {
  const resolved = rotatedOptions(correct, distractors, number);
  return choiceDraft({
    number,
    title,
    stem: `What is the output, value, or cause of error for this code?\n\n${codeBlock(code)}`,
    options: resolved.options,
    correctOptionIds: resolved.correctOptionIds,
    difficulty: 'easy',
    section,
    topic: 'code tracing',
  });
}

function conceptChoice(number, title, stem, correct, distractors = []) {
  const resolved = rotatedOptions(correct, distractors, number);
  return choiceDraft({
    number,
    title,
    stem,
    options: resolved.options,
    correctOptionIds: resolved.correctOptionIds,
    difficulty: 'easy',
    section: 'concept-identification',
    topic: title,
  });
}

function codeCase(id, expression, expected, description) {
  return { id, expression, expected, description };
}

function codeDraft({
  number,
  title,
  stem,
  starterCode,
  functionSignature,
  publicTests,
  secretTests,
  points = 5,
  difficulty = 'hard',
  constraints = [],
  section = 'code-writing',
}) {
  return baseDraft(number, `MR-${String(number).padStart(3, '0')}`, {
    title: `Mid Review ${number}: ${title}`,
    type: 'code',
    points,
    tags: ['CSC108', 'mid-review', 'fall-2025', 'code'],
    difficulty,
    publicContent: {
      type: 'code',
      stem: cleanLines(stem),
      language: 'python',
      starterCode: starterCode.trimEnd() + '\n',
      functionSignature,
      constraints,
      publicTests,
      sampleIO: [],
      secretConfigPresent: secretTests.length > 0,
    },
    grading: {
      type: 'code',
      publishRequirementsMet: true,
    },
    secretJudge: {
      language: 'python',
      secretTests,
      timeoutMs: 5000,
    },
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId: `MR-${String(number).padStart(3, '0')}`,
      sourceQuestionNumber: number,
      sourceQuestionLabel: `MR-${String(number).padStart(3, '0')}`,
      sourceCategory: section,
      sourceTopic: title,
      answerSource: 'tests-derived-from-pdf-examples',
    },
  });
}

let questionNumber = 0;
const nextNumber = () => {
  questionNumber += 1;
  return questionNumber;
};

const drafts = [];

const basicTraceRows = [
  {
    title: 'Negative String Index',
    code: "s = '12345'\nprint(s[-2])",
    correct: '4',
    distractors: ['3', '5', 'Error'],
  },
  {
    title: 'Escaped Quote and Newline Length',
    code: "print(len('what\\'\\ns'))",
    correct: '7',
    distractors: ['6', '8', 'Error'],
  },
  {
    title: 'Integer Reassignment',
    code: 'A = 4\nB = A\nB = B + 2\nprint(A, B)',
    correct: '4 6',
    distractors: ['6 6', '4, 6', 'Error'],
  },
  {
    title: 'String Step Slice',
    code: 's = "speedup"\nprint(s[::2])',
    correct: 'sedp',
    distractors: ['speedup', 'seu', 'eedup'],
  },
  {
    title: 'Membership in List of Strings',
    code: '"o" in ["csc148", "omg"]',
    correct: 'False',
    distractors: ['True', 'Error', 'None'],
  },
  {
    title: 'Membership in Nested List',
    code: 'L = [[1, 2, 3], [2, 3]]\nprint(2 in L)',
    correct: 'False',
    distractors: ['True', '2', 'Error'],
  },
  {
    title: 'List Membership with Sublist',
    code: 'print([2, 3] in [1, 2, 3])',
    correct: 'False',
    distractors: ['True', '[2, 3]', 'Error'],
  },
  {
    title: 'Nested List Indexing',
    code: 'L = [[1, 2, 3], [2, 3]]\nprint(L[-1][-1])',
    correct: '3',
    distractors: ['2', '[2, 3]', 'Error'],
  },
  {
    title: 'Membership Against an Integer',
    code: "[1, 2, 3, 4, 5, 6] in len('sb')",
    correct: 'Error',
    distractors: ['False', 'True', '2'],
  },
  {
    title: 'Nested List Membership',
    code: 'print([2, 3] in [1, [2, 3], 4])',
    correct: 'True',
    distractors: ['False', '[2, 3]', 'Error'],
  },
  {
    title: 'List Concatenation Without Mutation',
    code: 'def grow_once(base, extra):\n    base = base + extra\n    return base\n\nA = [1, 2]\ngrow_once(A, [3, 4])\nprint(A[3])',
    correct: 'Error',
    distractors: ['4', '[1, 2, 3, 4]', 'None'],
  },
  {
    title: 'String Index Then int Conversion',
    code: 'print(int("csc108"[-1]))',
    correct: '8',
    distractors: ['108', '"8"', 'Error'],
  },
  {
    title: 'List Used as List Index',
    code: 'lst = [1, 2, 3, 4]\nmildd = lst[1:-1]\nprint(lst[mildd])',
    correct: 'Error',
    distractors: ['[2, 3]', '3', 'None'],
  },
  {
    title: 'or Short-Circuit',
    code: 'print(1 + 4 == 5 or 4 / 0 == 1)',
    correct: 'True',
    distractors: ['False', 'Error', 'None'],
  },
  {
    title: 'and Short-Circuit',
    code: 'print(0 > 5 and (3 + "a"))',
    correct: 'False',
    distractors: ['True', 'Error', 'None'],
  },
  {
    title: 'String Plus Float',
    code: "print('1.5' + 2.0)",
    correct: 'Error',
    distractors: ['3.5', '1.52.0', '1.5 2.0'],
  },
  {
    title: 'String Slice Past End',
    code: 's = "speedup"\nprint(s[2:50])',
    correct: 'eedup',
    distractors: ['sedp', 'speedup', 'Error'],
  },
  {
    title: 'Empty String Short-Circuit',
    code: 's = ""\nprint(len(s) == 0 or s[0] == s[-1])',
    correct: 'True',
    distractors: ['False', 'Error', 'None'],
  },
  {
    title: 'String count Power',
    code: 's = "canada"\nr = s.count("a") ** 3\nprint(r)',
    correct: '27',
    distractors: ['9', '3', 'Error'],
  },
  {
    title: 'Single-Quoted String Escape',
    code: "s = 'i\\'m ok'\nprint(len(s))\nprint(s[:-2])",
    correct: '6\n' + "i'm ",
    distractors: ["6\ni'm", '7\nim ok', 'Error'],
  },
  {
    title: 'Double-Quoted String Escape',
    code: 's = "i\\\'m ok"\nprint(len(s))\nprint(s[:-2])',
    correct: '6\n' + "i'm ",
    distractors: ["6\ni'm", '7\nim ok', 'Error'],
  },
  {
    title: 'Substring Membership False',
    code: 'print("CT" in "CATS")',
    correct: 'False',
    distractors: ['True', 'Error', 'None'],
  },
  {
    title: 'Substring Membership True',
    code: 'print("C" in "CATS")',
    correct: 'True',
    distractors: ['False', 'Error', 'None'],
  },
  {
    title: 'Substring With Space',
    code: 'print("S R" in "CATS R")',
    correct: 'True',
    distractors: ['False', 'Error', 'None'],
  },
  {
    title: 'Loop Variable After for Loop',
    code: "for ch in 'dong':\n    print(ch)\nprint(ch)",
    correct: 'd\no\nn\ng\ng',
    distractors: ['d\no\nn\ng', 'Error', 'g'],
  },
  {
    title: 'append Return Value Reassignment',
    code: 'items = [0] + [2] + [4]\nitems = items.append(1)\nitems[1] = 3\nprint(items)',
    correct: 'Error',
    distractors: ['[0, 3, 4, 1]', 'None', '[0, 2, 4, 1]'],
  },
  {
    title: 'Printing append Result',
    code: 'items = [1, 2, 3, 4]\nprint(items.append(5))',
    correct: 'None',
    distractors: ['[1, 2, 3, 4, 5]', '5', 'Error'],
  },
  {
    title: 'extend With Non-Iterable',
    code: 'items = [1, 2, 3, 4]\nitems.extend(5)\nprint(items)',
    correct: 'Error',
    distractors: ['[1, 2, 3, 4, 5]', 'None', '[1, 2, 3, 4]'],
  },
  {
    title: 'Loop Variable Does Not Mutate List',
    code: 'values = [3.1, 2.7]\nfor value in values:\n    value = value - 1\n    print(values)',
    correct: '[3.1, 2.7]\n[3.1, 2.7]',
    distractors: ['[2.1, 1.7]', '[2.1, 2.7]\n[2.1, 1.7]', 'Error'],
  },
  {
    title: 'sort Return Value',
    code: 'nums = [1, 2, 3]\nsorted_nums = nums.sort()\nprint(sorted_nums)',
    correct: 'None',
    distractors: ['[1, 2, 3]', 'Error', '[]'],
  },
  {
    title: 'Assigning to Loop Variable',
    code: 's = [1, 0, 8]\nfor n in s:\n    n = 1\nprint(s)',
    correct: '[1, 0, 8]',
    distractors: ['[1, 1, 1]', '1\n0\n8', 'Error'],
  },
  {
    title: 'Slice Copy Mutation',
    code: 'L = [1, 2, 3, 4, 5]\nM = L[:]\nM[0] = 9\nprint(L)',
    correct: '[1, 2, 3, 4, 5]',
    distractors: ['[9, 2, 3, 4, 5]', 'Error', '[1, 2, 3, 4]'],
  },
  {
    title: 'Alias Mutation',
    code: 'L = [1, 2, 3, 4, 5]\nM = L\nL.append(6)\nprint(L)\nprint(M)',
    correct: '[1, 2, 3, 4, 5, 6]\n[1, 2, 3, 4, 5, 6]',
    distractors: ['[1, 2, 3, 4, 5, 6]\n[1, 2, 3, 4, 5]', 'None', 'Error'],
  },
  {
    title: 'append Inside Helper',
    code: 'def add(item, bag):\n    bag.append(item)\n    return bag\n\nprint(add(1, []))',
    correct: '[1]',
    distractors: ['[]', 'None', 'Error'],
  },
  {
    title: 'Helper Mutates List Argument',
    code: 'def add(item, bag):\n    bag.append(item)\n\nlst = [1, 2, 3]\nadd(1, lst)\nprint(lst)',
    correct: '[1, 2, 3, 1]',
    distractors: ['[1, 2, 3]', 'None', 'Error'],
  },
  {
    title: 'range Step and Empty Print',
    code: "for i in range(0, 5, 2):\n    print('a' * i)",
    correct: '\naa\naaaa',
    distractors: ['aa\naaaa', 'a\naa\naaa\naaaa', 'Error'],
  },
  {
    title: 'Descending range',
    code: 'n = 5\nfor i in range(n, 0, -1):\n    print(n - i)',
    correct: '0\n1\n2\n3\n4',
    distractors: ['5\n4\n3\n2\n1', '1\n2\n3\n4\n5', 'Error'],
  },
  {
    title: 'Repeated pop',
    code: 'lst = [1, 2, 3, 4, 5]\nfor i in range(0, 5):\n    print(lst.pop())',
    correct: '5\n4\n3\n2\n1',
    distractors: ['1\n2\n3\n4\n5', '[1, 2, 3, 4, 5]', 'Error'],
  },
  {
    title: 'pop While Indices Change',
    code: 'lst = [1, 2, 3, 4, 5]\nfor odd_pos in range(0, 5):\n    if odd_pos % 2 == 1:\n        print(lst.pop(odd_pos))',
    correct: '2\n5',
    distractors: ['2\n4', '2\n3\n4\n5', 'Error'],
  },
];

for (const row of basicTraceRows) {
  drafts.push(
    outputChoice(
      nextNumber(),
      row.title,
      row.code,
      row.correct,
      row.distractors,
      'basic-code-output',
    ),
  );
}

const conceptCode = `1  def f(s: str, target: str) -> int:
2      """
3      Return the number of times target appears in s.
4
5      >>> f('banana', 'a')
6      3
7      >>> f('banana', 'na')
8      2
9      >>> f('banana', 'x')
10     0
11     """
12     count = 0
13     for char in s:
14         if char.lower() == target:
15             count += 1
16     return count`;

for (const item of [
  {
    title: 'Identify if Body',
    question: 'Which line contains the body of the `if` statement?',
    correct: 'Line 15',
    distractors: ['Line 14', 'Line 13', 'Line 16'],
  },
  {
    title: 'Identify Function Arguments',
    question: 'Which lines contain function-call arguments?',
    correct: 'Lines 5, 7, and 9',
    distractors: ['Line 1', 'Line 14 only', 'Lines 12 and 15'],
  },
  {
    title: 'Identify Parameters',
    question: 'Which line contains parameters?',
    correct: 'Line 1',
    distractors: ['Lines 5, 7, and 9', 'Line 12', 'Line 14'],
  },
  {
    title: 'Identify Function Calls',
    question: 'Which lines contain function calls in the doctests?',
    correct: 'Lines 5, 7, and 9',
    distractors: ['Line 1', 'Line 12', 'Line 16'],
  },
  {
    title: 'Identify String Literals',
    question: 'Which lines contain string literals used as doctest arguments?',
    correct: 'Lines 5, 7, and 9',
    distractors: ['Line 1 only', 'Line 12 only', 'Line 16 only'],
  },
  {
    title: 'Identify Method Call',
    question: 'Which line contains a method call?',
    correct: 'Line 14',
    distractors: ['Line 1', 'Line 12', 'Line 16'],
  },
  {
    title: 'Identify Type Contract',
    question: 'Which part of the code is the type contract?',
    correct: '`s: str, target: str) -> int` on line 1',
    distractors: [
      'The assignment on line 12',
      'The return statement on line 16',
      'The doctest output on line 6',
    ],
  },
  {
    title: 'Identify Assignment Operation',
    question: 'Which line shows an assignment operation?',
    correct: 'Line 12',
    distractors: ['Line 1', 'Line 14', 'Line 16'],
  },
  {
    title: 'Identify Description',
    question: 'Which line is the description inside the docstring?',
    correct: 'Line 3',
    distractors: ['Line 1', 'Line 12', 'Line 16'],
  },
]) {
  drafts.push(
    conceptChoice(
      nextNumber(),
      item.title,
      `${item.question}\n\n${codeBlock(conceptCode)}`,
      item.correct,
      item.distractors,
    ),
  );
}

drafts.push(
  choiceDraft({
    number: nextNumber(),
    title: 'Trace a and b Values',
    stem:
      'Circle all code snippets that result in variable `a` referring to the int value `8` and variable `b` referring to the int value `8`.\n\n' +
      [
        'A.\n' + codeBlock('a = 6\nb = 14\nb -= a\na += 2'),
        'B.\n' + codeBlock('a = 16\nb = 16\na = b / 2\nb = a'),
        'C.\n' +
          codeBlock('a = 4\nb = 4\nif a > 2:\n    a *= 2\nelif b > 2:\n    b *= 2\nprint(a, b)'),
        'D.\n' +
          codeBlock('a = 4\nb = 4\nif a > 2:\n    a *= 2\nif b > 2:\n    b *= 2\nprint(a, b)'),
      ].join('\n\n'),
    options: [
      { id: 'A', label: 'Snippet A' },
      { id: 'B', label: 'Snippet B' },
      { id: 'C', label: 'Snippet C' },
      { id: 'D', label: 'Snippet D' },
    ],
    correctOptionIds: ['A', 'D'],
    selectionMode: 'multiple',
    section: 'trace',
    topic: 'variable tracing',
  }),
);

drafts.push(
  outputChoice(
    nextNumber(),
    'List Mutation Trace',
    `from typing import List

def increase(x: int) -> None:
    x = x + 1

def func(lst: List[int]) -> List[int]:
    increase(lst[0])
    lst[1] += 1
    lst = []
    lst.append(12)
    return lst

lst = []
x = 2
lst.append(x)
lst.append(7)
lst.append(x)
print(lst)
print(func(lst))
print(lst)`,
    '[2, 7, 2]\n[12]\n[2, 8, 2]',
    ['[2, 7, 2]\n[12]\n[2, 7, 2]', 'Error', '[12]\n[2, 8, 2]'],
    'trace',
  ),
);

drafts.push(
  outputChoice(
    nextNumber(),
    'Function Alias Trace',
    `def mystery(nums, extra):
    print("start :", nums)
    nums.append(len(nums))
    nums = nums + extra
    extra_value = nums.append(42)
    extra.append(extra_value)
    print("inside:", nums)
    return nums

a = [1, 2]
b = [10, 20]
c = mystery(a, b)
print("after :", a)
print("result:", c)
print("extra :", b)`,
    'start : [1, 2]\ninside: [1, 2, 2, 10, 20, 42]\nafter : [1, 2, 2]\nresult: [1, 2, 2, 10, 20, 42]\nextra : [10, 20, None]',
    [
      'start : [1, 2]\ninside: [1, 2, 10, 20, 42]\nafter : [1, 2]\nresult: [1, 2, 10, 20, 42]\nextra : [10, 20]',
      'Error',
      'No output',
    ],
    'trace',
  ),
);

const bugCodeTasks = [
  {
    title: 'Fix has_uppercase',
    stem: 'Repair the function so it returns `True` if `s` contains at least one uppercase letter, and `False` otherwise. The PDF version returns too early for some inputs.',
    starterCode: `def has_uppercase(s: str) -> bool:
    for char in s:
        if char.isupper():
            return True
        else:
            return False`,
    signature: 'def has_uppercase(s: str) -> bool:',
    publicTests: [
      codeCase('public-1', 'has_uppercase("a")', 'False', 'No uppercase letters'),
      codeCase('public-2', 'has_uppercase("A")', 'True', 'Single uppercase letter'),
      codeCase('public-3', 'has_uppercase("abCdef")', 'True', 'Uppercase after lowercase letters'),
    ],
    secretTests: [
      codeCase('secret-1', 'has_uppercase("abcdef")', 'False', 'All lowercase'),
      codeCase('secret-2', 'has_uppercase("")', 'False', 'Empty string'),
      codeCase('secret-3', 'has_uppercase("abcD")', 'True', 'Uppercase at end'),
    ],
  },
  {
    title: 'Fix lower_count',
    stem: 'Repair the function so it returns the number of lowercase letters in `s`. The accumulator must not reset during each loop iteration.',
    starterCode: `def lower_count(s: str) -> int:
    for char in s:
        acc = 0
        if char.islower():
            acc += 1
    return acc`,
    signature: 'def lower_count(s: str) -> int:',
    publicTests: [
      codeCase('public-1', 'lower_count("banana")', '6', 'All lowercase'),
      codeCase('public-2', 'lower_count("Banana")', '5', 'One uppercase letter'),
      codeCase('public-3', 'lower_count("BANANA")', '0', 'All uppercase'),
    ],
    secretTests: [
      codeCase('secret-1', 'lower_count("")', '0', 'Empty string'),
      codeCase('secret-2', 'lower_count("aB1c!")', '2', 'Mixed characters'),
    ],
  },
  {
    title: 'Fix upper_count',
    stem: 'Repair the function so it returns the number of uppercase letters in `s`. The return statement must happen after the loop has checked all characters.',
    starterCode: `def upper_count(s: str) -> int:
    acc = 0
    for c in s:
        if c.isupper():
            acc += 1
            return acc`,
    signature: 'def upper_count(s: str) -> int:',
    publicTests: [
      codeCase('public-1', 'upper_count("Hello")', '1', 'One uppercase'),
      codeCase('public-2', 'upper_count("HELLO")', '5', 'All uppercase'),
      codeCase('public-3', 'upper_count("hello")', '0', 'No uppercase'),
    ],
    secretTests: [
      codeCase('secret-1', 'upper_count("")', '0', 'Empty string'),
      codeCase('secret-2', 'upper_count("aB1C!")', '2', 'Mixed characters'),
    ],
  },
  {
    title: 'Fix in_order',
    stem: 'Repair the function so it returns `True` when `i`, `j`, and `k` are in nondecreasing or nonincreasing order. Equal adjacent numbers count as in order.',
    starterCode: `def in_order(i: int, j: int, k: int) -> bool:
    if i <= j:
        if j <= k:
            return True
    else:
        return False`,
    signature: 'def in_order(i: int, j: int, k: int) -> bool:',
    publicTests: [
      codeCase('public-1', 'in_order(1, 2, 3)', 'True', 'Increasing'),
      codeCase('public-2', 'in_order(3, 2, 1)', 'True', 'Decreasing'),
      codeCase('public-3', 'in_order(1, 3, 2)', 'False', 'Not in order'),
    ],
    secretTests: [
      codeCase('secret-1', 'in_order(1, 1, 2)', 'True', 'Equal values increasing'),
      codeCase('secret-2', 'in_order(3, 2, 2)', 'True', 'Equal values decreasing'),
      codeCase('secret-3', 'in_order(2, 1, 3)', 'False', 'Changes direction'),
    ],
  },
  {
    title: 'Build String Plus Reverse',
    stem: 'Implement `mystery_fun` so it returns the original string followed by the reverse of the string.',
    starterCode: `def mystery_fun(s: str) -> str:
    pass`,
    signature: 'def mystery_fun(s: str) -> str:',
    publicTests: [
      codeCase('public-1', 'mystery_fun("speed")', '"speeddeeps"', 'PDF example'),
      codeCase('public-2', 'mystery_fun("abc")', '"abccba"', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'mystery_fun("")', '""', 'Empty string'),
      codeCase('secret-2', 'mystery_fun("a")', '"aa"', 'Single character'),
    ],
  },
  {
    title: 'Fix findmax',
    stem: 'Repair `findmax` so it returns the largest value in a non-empty list, including lists where all values are negative.',
    starterCode: `def findmax(lst: list[int]) -> int:
    max_val = 0
    for i in range(len(lst)):
        if lst[i] > max_val:
            max_val = lst[i]
    return max_val`,
    signature: 'def findmax(lst: list[int]) -> int:',
    publicTests: [
      codeCase('public-1', 'findmax([1, 5, 3])', '5', 'Positive values'),
      codeCase('public-2', 'findmax([-5, -2, -9])', '-2', 'Negative values'),
    ],
    secretTests: [
      codeCase('secret-1', 'findmax([0])', '0', 'Single zero'),
      codeCase('secret-2', 'findmax([-3, 0, -1])', '0', 'Mixed values'),
    ],
  },
  {
    title: 'Fix reverselist',
    stem: 'Repair `reverselist` so it reverses the elements of `lst` in place and returns the same list.',
    starterCode: `def reverselist(lst: list[int]) -> list[int]:
    for i in range(len(lst)):
        lst[i] = lst[len(lst) - 1 - i]
        lst[len(lst) - 1 - i] = lst[i]
    return lst`,
    signature: 'def reverselist(lst: list[int]) -> list[int]:',
    publicTests: [
      codeCase(
        'public-1',
        '((lambda data: (reverselist(data), data))([1, 2, 3, 4, 5]))',
        '[[5, 4, 3, 2, 1], [5, 4, 3, 2, 1]]',
        'Odd length list',
      ),
      codeCase(
        'public-2',
        '((lambda data: (reverselist(data), data))([1, 2, 3, 4]))',
        '[[4, 3, 2, 1], [4, 3, 2, 1]]',
        'Even length list',
      ),
    ],
    secretTests: [
      codeCase(
        'secret-1',
        '((lambda data: (reverselist(data), data))([]))',
        '[[], []]',
        'Empty list',
      ),
      codeCase(
        'secret-2',
        '((lambda data: (reverselist(data), data))([9]))',
        '[[9], [9]]',
        'Single item',
      ),
    ],
  },
];

for (const task of bugCodeTasks) {
  drafts.push(
    codeDraft({
      number: nextNumber(),
      title: task.title,
      stem: `${task.stem}\n\nStarter code from the handout:\n\n${codeBlock(task.starterCode)}`,
      starterCode: task.starterCode,
      functionSignature: task.signature,
      publicTests: task.publicTests,
      secretTests: task.secretTests,
      section: 'bug-fix-code',
    }),
  );
}

drafts.push(
  conceptChoice(
    nextNumber(),
    'findmax Empty List Bug',
    `After changing \`max_val = 0\` to \`max_val = lst[0]\`, which input still causes an error?\n\n${codeBlock(`def findmax(lst):
    max_val = lst[0]
    for i in range(1, len(lst)):
        if lst[i] > max_val:
            max_val = lst[i]
    return max_val`)}`,
    'An empty list, `[]`',
    [
      'A list with negative values',
      'A list with one positive value',
      'A list with duplicate values',
    ],
  ),
);

const fileChoiceRows = [
  {
    title: 'write Consecutive Strings',
    code: "f = open('a.txt', 'w')\nf.write('final')\nf.write('is')\nf.write('coming')\nf.close()",
    correct: 'The file contains `finaliscoming`.',
    distractors: ['The file contains `final is coming`.', 'Error', 'The file is empty.'],
  },
  {
    title: 'join Then write',
    code: "f = open('a.txt', 'w')\nf.write(''.join(['final', 'is', 'coming']))\nf.close()",
    correct: 'The file contains `finaliscoming`.',
    distractors: ['The file contains `final is coming`.', 'Error', 'The file is empty.'],
  },
  {
    title: 'writelines With String',
    code: "f = open('a.txt', 'w')\nf.writelines('a\\nb\\nc\\n')\nf.close()",
    correct: 'The file contains three lines: `a`, `b`, and `c`.',
    distractors: ['Error', 'The file contains `abc` on one line.', 'The file is empty.'],
  },
  {
    title: 'writelines With Integers',
    code: "f = open('a.txt', 'w')\nL = [1, 2, 3]\nf.writelines(L)\nf.close()",
    correct: 'Error',
    distractors: [
      'The file contains `123`.',
      'The file contains three lines.',
      'The file is empty.',
    ],
  },
  {
    title: 'with open and Undefined Variable',
    code: 'with open("a.txt", "w") as file:\n    file.writelines(["Line 1", "Line 2", "Line 3"])\n    print(content)',
    correct: 'The file receives `Line 1Line 2Line 3`, then a NameError is raised.',
    distractors: [
      'The file remains empty.',
      'The code prints `Line 1Line 2Line 3`.',
      'No error occurs.',
    ],
  },
  {
    title: 'readlines After readline',
    code: 'f.readline()\nprint(f.readlines())',
    correct: "If the file contains `Da\\nYi\\nLe`, it prints `['Yi\\\\n', 'Le']`.",
    distractors: ["It prints `['Da\\\\n', 'Yi\\\\n', 'Le']`.", 'It prints `Da`.', 'Error'],
  },
  {
    title: 'Loop Over readlines',
    code: 'for line in f.readlines():\n    line = line.strip()\n    print(line)\n    f.readline()',
    correct:
      'Because `readlines()` reads the remaining lines at once, the loop prints every line from that returned list.',
    distractors: [
      'It prints every other line.',
      'It prints no lines.',
      'It raises an error before printing.',
    ],
  },
  {
    title: 'Loop Over read String',
    code: 'for line in f.read():\n    line = line.strip()\n    print(line)',
    correct: 'If the file contains `speed`, it prints one character per line.',
    distractors: ['It prints `speed` on one line.', 'It prints one word per line.', 'Error'],
  },
  {
    title: 'Printing Lines With Existing Newlines',
    code: 'f = open("a.txt", "w")\nf.writelines(["Line 1\\n", "Line 2\\n", "Line 3\\n"])\nf.close()\n\nf = open("a.txt", "r")\nfor line in f.readlines():\n    print(line)\n    f.readline()\nf.close()',
    correct:
      'It prints the three written lines, with extra blank lines because each `line` already contains `\\n`.',
    distractors: ['It prints every other line only.', 'It prints no lines.', 'Error'],
  },
  {
    title: 'Open Mode Without Existing File',
    code: 'open("new_file.txt", MODE)',
    correct: '`w` or `a` can create the file if it does not exist.',
    distractors: [
      'Only `r` can create the file.',
      '`readline` creates the file.',
      'No mode can create a file.',
    ],
  },
  {
    title: 'readline Newline Character',
    code: 'line = f.readline()',
    correct: '`readline()` keeps the trailing `\\n` unless it reads the final line without one.',
    distractors: [
      '`readline()` always strips `\\n`.',
      '`readline()` returns a list.',
      '`readline()` skips blank lines.',
    ],
  },
  {
    title: 'Detecting EOF With readline',
    code: 'line = f.readline()',
    correct: 'End of file is reached when `readline()` returns the empty string `""`.',
    distractors: [
      'End of file is reached when it returns `None`.',
      'End of file raises TypeError.',
      'End of file returns `False`.',
    ],
  },
  {
    title: 'Reading First Line of a Huge File',
    code: '# book.txt is 100GB; the laptop has 16GB RAM',
    correct:
      'Use `readline()` or iterate over the file so the whole file is not loaded into memory.',
    distractors: [
      'Use `read()` to load the whole file.',
      'Use `readlines()` to load all lines.',
      'Open the file in write mode.',
    ],
  },
];

for (const row of fileChoiceRows) {
  drafts.push(
    outputChoice(nextNumber(), row.title, row.code, row.correct, row.distractors, 'file-io-choice'),
  );
}

const codeWritingTasks = [
  {
    title: 'count_vowels',
    stem: 'Write `count_vowels(s: str) -> int` to count the number of vowels in a string. Count both lowercase and uppercase vowels.',
    starterCode: 'def count_vowels(s: str) -> int:\n    pass',
    signature: 'def count_vowels(s: str) -> int:',
    publicTests: [
      codeCase('public-1', 'count_vowels("hello")', '2', 'PDF example'),
      codeCase('public-2', 'count_vowels("AEIOU")', '5', 'PDF example'),
      codeCase('public-3', 'count_vowels("xyz")', '0', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'count_vowels("")', '0', 'Empty string'),
      codeCase('secret-2', 'count_vowels("SpeedUp")', '3', 'Mixed case'),
    ],
  },
  {
    title: 'is_postal_code',
    stem: 'Write `is_postal_code(s: str) -> bool` to check whether `s` has Canadian postal-code format `A1A 1A1`: letter, digit, letter, space, digit, letter, digit.',
    starterCode: 'def is_postal_code(s: str) -> bool:\n    pass',
    signature: 'def is_postal_code(s: str) -> bool:',
    publicTests: [
      codeCase('public-1', 'is_postal_code("K1A 0A6")', 'True', 'PDF example'),
      codeCase('public-2', 'is_postal_code("M5V 3A8")', 'True', 'PDF example'),
      codeCase('public-3', 'is_postal_code("invalid")', 'False', 'PDF example'),
      codeCase('public-4', 'is_postal_code("K1A0A6")', 'False', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'is_postal_code("k1a 0a6")', 'True', 'Lowercase letters allowed'),
      codeCase('secret-2', 'is_postal_code("K1A 0A")', 'False', 'Wrong length'),
      codeCase('secret-3', 'is_postal_code("1KA 0A6")', 'False', 'Wrong first character'),
    ],
  },
  {
    title: 'has_3_consecutive_letters',
    stem: 'Write `has_3_consecutive_letters(s: str) -> bool` to check whether `s` contains at least three adjacent alphabetic characters.',
    starterCode: 'def has_3_consecutive_letters(s: str) -> bool:\n    pass',
    signature: 'def has_3_consecutive_letters(s: str) -> bool:',
    publicTests: [
      codeCase('public-1', 'has_3_consecutive_letters("abc")', 'True', 'PDF example'),
      codeCase('public-2', 'has_3_consecutive_letters("xyz")', 'True', 'PDF example'),
      codeCase('public-3', 'has_3_consecutive_letters("ab")', 'False', 'PDF example'),
      codeCase('public-4', 'has_3_consecutive_letters("a1b2c")', 'False', 'PDF example'),
      codeCase('public-5', 'has_3_consecutive_letters("hello")', 'True', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'has_3_consecutive_letters("")', 'False', 'Empty string'),
      codeCase('secret-2', 'has_3_consecutive_letters("12ABC")', 'True', 'Uppercase letters'),
      codeCase('secret-3', 'has_3_consecutive_letters("ab1cd")', 'False', 'Interrupted runs'),
    ],
  },
  {
    title: 'find_first_uppercase',
    stem: 'Write `find_first_uppercase(s: str) -> int` to return the index of the first uppercase letter, or `-1` if none exists.',
    starterCode: 'def find_first_uppercase(s: str) -> int:\n    pass',
    signature: 'def find_first_uppercase(s: str) -> int:',
    publicTests: [
      codeCase('public-1', 'find_first_uppercase("hello")', '-1', 'PDF example'),
      codeCase('public-2', 'find_first_uppercase("Hello")', '0', 'PDF example'),
      codeCase('public-3', 'find_first_uppercase("hello World")', '6', 'PDF example'),
      codeCase('public-4', 'find_first_uppercase("123ABC")', '3', 'PDF example'),
      codeCase('public-5', 'find_first_uppercase("")', '-1', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'find_first_uppercase("abcD")', '3', 'Uppercase at end'),
      codeCase('secret-2', 'find_first_uppercase("ABC")', '0', 'Multiple uppercase letters'),
    ],
  },
  {
    title: 'letters_first_digits_last',
    stem: 'Write `letters_first_digits_last(s: str) -> str` to return a new string with all letters first, then all digits, ignoring other characters.',
    starterCode: 'def letters_first_digits_last(s: str) -> str:\n    pass',
    signature: 'def letters_first_digits_last(s: str) -> str:',
    publicTests: [
      codeCase('public-1', 'letters_first_digits_last("a1b2c3")', '"abc123"', 'PDF example'),
      codeCase(
        'public-2',
        'letters_first_digits_last("Hello123World")',
        '"HelloWorld123"',
        'PDF example',
      ),
      codeCase('public-3', 'letters_first_digits_last("123abc")', '"abc123"', 'PDF example'),
      codeCase('public-4', 'letters_first_digits_last("a@1#b$2%c^3")', '"abc123"', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'letters_first_digits_last("")', '""', 'Empty string'),
      codeCase('secret-2', 'letters_first_digits_last("!@#$%")', '""', 'No letters or digits'),
    ],
  },
  {
    title: 'find_palindrome_words',
    stem: 'Write `find_palindrome_words(s: str) -> int` to count the number of palindrome words. Words are separated by spaces.',
    starterCode: 'def find_palindrome_words(s: str) -> int:\n    pass',
    signature: 'def find_palindrome_words(s: str) -> int:',
    publicTests: [
      codeCase('public-1', 'find_palindrome_words("racecar level hello")', '2', 'PDF example'),
      codeCase('public-2', 'find_palindrome_words("abc def ghi")', '0', 'PDF example'),
      codeCase('public-3', 'find_palindrome_words("a level racecar")', '3', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'find_palindrome_words("")', '0', 'Empty string'),
      codeCase('secret-2', 'find_palindrome_words("noon civic kayak")', '3', 'All palindromes'),
    ],
  },
  {
    title: 'create_pattern_string',
    stem: 'Write `create_pattern_string(base: str, length: int) -> str` to create a forward/backward repeating pattern and truncate it to `length` characters.',
    starterCode: 'def create_pattern_string(base: str, length: int) -> str:\n    pass',
    signature: 'def create_pattern_string(base: str, length: int) -> str:',
    publicTests: [
      codeCase('public-1', 'create_pattern_string("abc", 7)', '"abcbabc"', 'PDF example'),
      codeCase('public-2', 'create_pattern_string("xy", 5)', '"xyxyx"', 'PDF example'),
      codeCase('public-3', 'create_pattern_string("a", 3)', '"aaa"', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'create_pattern_string("abc", 0)', '""', 'Zero length'),
      codeCase('secret-2', 'create_pattern_string("abcd", 10)', '"abcdcbabcd"', 'Longer base'),
    ],
  },
  {
    title: 'my_find',
    stem: 'Write `my_find(s: str, substring: str) -> int` to find the first occurrence of `substring` in `s`, similar to `str.find`.',
    starterCode: 'def my_find(s: str, substring: str) -> int:\n    pass',
    signature: 'def my_find(s: str, substring: str) -> int:',
    publicTests: [
      codeCase('public-1', 'my_find("hello world", "world")', '6', 'PDF example'),
      codeCase('public-2', 'my_find("hello world", "o")', '4', 'PDF example'),
      codeCase('public-3', 'my_find("hello world", "xyz")', '-1', 'PDF example'),
      codeCase('public-4', 'my_find("", "a")', '-1', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'my_find("aaaa", "aa")', '0', 'Overlapping possible match'),
      codeCase('secret-2', 'my_find("abc", "")', '0', 'Empty substring matches at index 0'),
    ],
  },
  {
    title: 'my_split',
    stem: 'Write `my_split(s: str, delimiter: str) -> list[str]` to split a string by `delimiter`, similar to `str.split`.',
    starterCode: 'def my_split(s: str, delimiter: str) -> list[str]:\n    pass',
    signature: 'def my_split(s: str, delimiter: str) -> list[str]:',
    publicTests: [
      codeCase(
        'public-1',
        'my_split("hello world python", " ")',
        '["hello", "world", "python"]',
        'PDF example',
      ),
      codeCase('public-2', 'my_split("a,b,c", ",")', '["a", "b", "c"]', 'PDF example'),
      codeCase('public-3', 'my_split("hello", "l")', '["he", "", "o"]', 'PDF example'),
      codeCase('public-4', 'my_split("", " ")', '[""]', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'my_split("abc", ",")', '["abc"]', 'Delimiter absent'),
      codeCase(
        'secret-2',
        'my_split("a--b--", "--")',
        '["a", "b", ""]',
        'Multi-character delimiter',
      ),
    ],
  },
  {
    title: 'get_all_substrings',
    stem: 'Write `get_all_substrings(s: str) -> list` to return all non-empty substrings of `s` in start-index order.',
    starterCode: 'def get_all_substrings(s: str) -> list:\n    pass',
    signature: 'def get_all_substrings(s: str) -> list:',
    publicTests: [
      codeCase(
        'public-1',
        'get_all_substrings("abc")',
        '["a", "ab", "abc", "b", "bc", "c"]',
        'PDF example',
      ),
      codeCase('public-2', 'get_all_substrings("xy")', '["x", "xy", "y"]', 'PDF example'),
      codeCase('public-3', 'get_all_substrings("")', '[]', 'PDF example'),
      codeCase('public-4', 'get_all_substrings("a")', '["a"]', 'PDF example'),
    ],
    secretTests: [
      codeCase(
        'secret-1',
        'get_all_substrings("aa")',
        '["a", "aa", "a"]',
        'Duplicate substrings preserved',
      ),
    ],
  },
  {
    title: 'time_on_task',
    stem: 'Write `time_on_task(total: int, chores: list[int]) -> int` to determine the largest number of chores that can be completed without exceeding `total`. Chores can be done in any order.',
    starterCode: 'def time_on_task(total: int, chores: list[int]) -> int:\n    pass',
    signature: 'def time_on_task(total: int, chores: list[int]) -> int:',
    publicTests: [
      codeCase('public-1', 'time_on_task(6, [3, 3, 6, 3])', '2', 'PDF example'),
      codeCase('public-2', 'time_on_task(6, [5, 5, 4, 3, 2, 1])', '3', 'PDF example'),
      codeCase('public-3', 'time_on_task(10, [1, 2, 3, 4, 5])', '4', 'PDF example'),
      codeCase('public-4', 'time_on_task(5, [6, 7, 8])', '0', 'PDF example'),
      codeCase('public-5', 'time_on_task(7, [2, 2, 2, 2])', '3', 'PDF example'),
    ],
    secretTests: [
      codeCase('secret-1', 'time_on_task(10, [])', '0', 'Empty list'),
      codeCase('secret-2', 'time_on_task(10, [1, 2, 3, 4])', '4', 'Exact total'),
    ],
  },
];

for (const task of codeWritingTasks) {
  drafts.push(
    codeDraft({
      number: nextNumber(),
      title: task.title,
      stem: task.stem,
      starterCode: task.starterCode,
      functionSignature: task.signature,
      publicTests: task.publicTests,
      secretTests: task.secretTests,
      section: 'code-writing',
    }),
  );
}

const cccTasks = [
  {
    title: 'Rovarspraket Translator',
    stem: 'Write `rovarspraket(word: str) -> str` to translate a lower-case English word into the CSC version of Rovarspraket. Vowels `a`, `e`, `i`, `o`, `u` remain unchanged. Every consonant becomes the consonant itself, then the closest vowel in the alphabet, then the next consonant. If tied between vowels, choose the earlier vowel. If the consonant is `z`, the next consonant is `z`.',
    starterCode: 'def rovarspraket(word: str) -> str:\n    pass',
    signature: 'def rovarspraket(word: str) -> str:',
    publicTests: [
      codeCase('public-1', 'rovarspraket("joy")', '"jikoyuz"', 'Sample 1'),
      codeCase('public-2', 'rovarspraket("ham")', '"hijamon"', 'Sample 2'),
    ],
    secretTests: [
      codeCase('secret-1', 'rovarspraket("a")', '"a"', 'Single vowel'),
      codeCase('secret-2', 'rovarspraket("b")', '"bac"', 'Single consonant'),
      codeCase('secret-3', 'rovarspraket("zap")', '"zuzapoq"', 'z rule'),
    ],
  },
  {
    title: 'Flipping Grid',
    stem: 'Write `flip_grid(flips: str) -> str` for the 2x2 grid initially shown as `1 2` / `3 4`. Each `H` flips horizontally, each `V` flips vertically. Return the final grid as two lines with one space between numbers.',
    starterCode: 'def flip_grid(flips: str) -> str:\n    pass',
    signature: 'def flip_grid(flips: str) -> str:',
    publicTests: [codeCase('public-1', 'flip_grid("HV")', '"4 3\\n2 1"', 'PDF sample')],
    secretTests: [
      codeCase('secret-1', 'flip_grid("H")', '"3 4\\n1 2"', 'Horizontal only'),
      codeCase('secret-2', 'flip_grid("V")', '"2 1\\n4 3"', 'Vertical only'),
      codeCase('secret-3', 'flip_grid("HHVV")', '"1 2\\n3 4"', 'Canceling flips'),
    ],
  },
  {
    title: 'Fiona Commute Arrival Time',
    stem: 'Write `arrival_time(departure: str) -> str`. Fiona normally needs 2 hours of travel. During rush hour, 07:00-10:00 and 15:00-19:00, her speed is half. Given a departure time `HH:MM`, return the arrival time `HH:MM` using a 24-hour clock.',
    starterCode: 'def arrival_time(departure: str) -> str:\n    pass',
    signature: 'def arrival_time(departure: str) -> str:',
    publicTests: [
      codeCase('public-1', 'arrival_time("05:00")', '"07:00"', 'Sample 1'),
      codeCase('public-2', 'arrival_time("07:00")', '"10:30"', 'Sample 2'),
      codeCase('public-3', 'arrival_time("23:20")', '"01:20"', 'Sample 3'),
    ],
    secretTests: [
      codeCase('secret-1', 'arrival_time("06:00")', '"09:00"', 'Enters morning rush hour'),
      codeCase('secret-2', 'arrival_time("14:00")', '"17:00"', 'Enters afternoon rush hour'),
    ],
  },
  {
    title: 'Sunflower Rotation',
    stem: 'Write `restore_sunflowers(grid: list[list[int]]) -> list[list[int]]`. The original sunflower table has rows and columns increasing from top-left to bottom-right. The input may have been rotated by a multiple of 90 degrees. Return the original orientation.',
    starterCode: 'def restore_sunflowers(grid: list[list[int]]) -> list[list[int]]:\n    pass',
    signature: 'def restore_sunflowers(grid: list[list[int]]) -> list[list[int]]:',
    publicTests: [
      codeCase('public-1', 'restore_sunflowers([[1, 3], [2, 9]])', '[[1, 3], [2, 9]]', 'Sample 1'),
      codeCase(
        'public-2',
        'restore_sunflowers([[4, 3, 1], [6, 5, 2], [9, 7, 3]])',
        '[[1, 2, 3], [3, 5, 7], [4, 6, 9]]',
        'Sample 2',
      ),
      codeCase(
        'public-3',
        'restore_sunflowers([[3, 7, 9], [2, 5, 6], [1, 3, 4]])',
        '[[1, 2, 3], [3, 5, 7], [4, 6, 9]]',
        'Sample 3',
      ),
    ],
    secretTests: [
      codeCase(
        'secret-1',
        'restore_sunflowers([[2, 1], [9, 3]])',
        '[[1, 3], [2, 9]]',
        'Vertical rotation case',
      ),
      codeCase(
        'secret-2',
        'restore_sunflowers([[9, 2], [3, 1]])',
        '[[1, 3], [2, 9]]',
        '180-degree rotation case',
      ),
    ],
  },
];

for (const task of cccTasks) {
  drafts.push(
    codeDraft({
      number: nextNumber(),
      title: task.title,
      stem: task.stem,
      starterCode: task.starterCode,
      functionSignature: task.signature,
      publicTests: task.publicTests,
      secretTests: task.secretTests,
      points: 8,
      difficulty: 'hard',
      section: 'contest-style-code',
    }),
  );
}

function validateDrafts() {
  if (drafts.length !== questionNumber) {
    throw new Error(`Draft counter mismatch: ${drafts.length} vs ${questionNumber}`);
  }
  if (drafts.some((draft) => draft.type === 'fill_blank')) {
    throw new Error('This import must not create fill_blank drafts.');
  }
  const invalidType = drafts.find((draft) => draft.type !== 'choice' && draft.type !== 'code');
  if (invalidType) {
    throw new Error(`Unsupported draft type: ${invalidType.type}`);
  }
  const ids = new Set();
  for (const draft of drafts) {
    const sourceQuestionId = String(draft.sourceMeta.sourceQuestionId);
    if (ids.has(sourceQuestionId)) throw new Error(`Duplicate source id: ${sourceQuestionId}`);
    ids.add(sourceQuestionId);
    if (draft.type === 'choice') {
      if (draft.publicContent.options.length < 2) throw new Error(`${draft.title} missing options`);
      if (draft.grading.correctOptionIds.length < 1) {
        throw new Error(`${draft.title} missing correct option ids`);
      }
    }
    if (draft.type === 'code') {
      if (!draft.publicContent.functionSignature?.trim()) {
        throw new Error(`${draft.title} missing function signature`);
      }
      if (draft.publicContent.publicTests.length === 0) {
        throw new Error(`${draft.title} missing public tests`);
      }
      if (!draft.secretJudge || draft.secretJudge.secretTests.length === 0) {
        throw new Error(`${draft.title} missing secret tests`);
      }
    }
  }
}

function summarizeDrafts(items) {
  return items.reduce(
    (acc, draft) => {
      acc.byType[draft.type] = (acc.byType[draft.type] ?? 0) + 1;
      acc.points += draft.points;
      if (draft.type === 'code') {
        acc.publicTests += draft.publicContent.publicTests.length;
        acc.secretTests += draft.secretJudge?.secretTests.length ?? 0;
      }
      return acc;
    },
    { byType: {}, points: 0, publicTests: 0, secretTests: 0 },
  );
}

async function refreshCourseSummaryFields(prisma, courseId) {
  const notebookAggregate = await prisma.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    prisma.notebookProblem.count({ where: { OR: [{ courseId }, { notebook: { courseId } }] } }),
    prisma.notebookProblem.count({
      where: { status: 'published', OR: [{ courseId }, { notebook: { courseId } }] },
    }),
  ]);

  await prisma.course.updateMany({
    where: { id: courseId },
    data: {
      notebookCount: notebookAggregate._count._all,
      sceneCount: notebookAggregate._sum.sceneCount ?? 0,
      problemCount,
      publishedProblemCount,
      speechReadyCount: notebookAggregate._sum.speechReadyCount ?? 0,
      speechTotalCount: notebookAggregate._sum.speechTotalCount ?? 0,
    },
  });
}

async function loadExistingSourceQuestionIds(prisma, courseId) {
  const rows = await prisma.notebookProblem.findMany({
    where: {
      OR: [{ courseId }, { notebook: { courseId } }],
    },
    select: {
      sourceMeta: true,
    },
  });
  const ids = new Set();
  for (const row of rows) {
    const sourceMeta = row.sourceMeta && typeof row.sourceMeta === 'object' ? row.sourceMeta : {};
    if (sourceMeta.sourceFileName !== SOURCE_FILE_NAME) continue;
    ids.add(String(sourceMeta.sourceQuestionId));
  }
  return ids;
}

async function main() {
  loadEnvLocal();
  validateDrafts();

  const write = hasFlag('write');
  const allowDuplicates = hasFlag('allow-duplicates');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const sourcePath = argValue('source') || DEFAULT_SOURCE_PATH;
  const pdfBuffer = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : Buffer.from('');
  const pdfHash = pdfBuffer.length > 0 ? hashBuffer(pdfBuffer) : null;

  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        courseCode: true,
        problemCount: true,
        publishedProblemCount: true,
      },
    });
    if (!course) throw new Error(`Course not found: ${courseId}`);

    const existingSourceIds = allowDuplicates
      ? new Set()
      : await loadExistingSourceQuestionIds(prisma, courseId);
    const draftsToInsert = drafts.filter(
      (draft) => !existingSourceIds.has(String(draft.sourceMeta.sourceQuestionId)),
    );

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          course,
          sourcePath,
          sourceFileName: SOURCE_FILE_NAME,
          sourceQuestionCount: drafts.length,
          duplicateSourceQuestionCount: drafts.length - draftsToInsert.length,
          insertQuestionCount: draftsToInsert.length,
          summary: summarizeDrafts(draftsToInsert),
        },
        null,
        2,
      ),
    );

    if (!write || draftsToInsert.length === 0) return;

    const notebookIds = (
      await prisma.notebook.findMany({
        where: { ownerId: course.ownerId, courseId },
        select: { id: true },
      })
    ).map((notebook) => notebook.id);
    const scopeWhere =
      notebookIds.length > 0
        ? { OR: [{ courseId }, { notebookId: { in: notebookIds } }] }
        : { courseId };

    await prisma.$transaction(
      async (tx) => {
        const [count, maxNumber] = await Promise.all([
          tx.notebookProblem.count({ where: scopeWhere }),
          tx.notebookProblem.aggregate({ where: scopeWhere, _max: { problemNumber: true } }),
        ]);
        const firstProblemNumber = (maxNumber._max.problemNumber ?? 0) + 1;
        const importBatch = await tx.problemImportBatch.create({
          data: {
            ownerId: course.ownerId,
            courseId,
            targetType: 'course',
            source: 'pdf',
            status: 'previewed',
            sourceFileName: SOURCE_FILE_NAME,
            sourceFileMime: 'application/pdf',
            sourceTextHash: pdfHash,
            draftCount: draftsToInsert.length,
            draftSnapshotJson: draftsToInsert,
            warnings: [],
          },
          select: { id: true },
        });

        for (let index = 0; index < draftsToInsert.length; index += 1) {
          const draft = draftsToInsert[index];
          const created = await tx.notebookProblem.create({
            data: {
              courseId,
              notebookId: null,
              title: draft.title,
              type: draft.type,
              status: draft.status,
              source: draft.source,
              order: count + index,
              problemNumber: firstProblemNumber + index,
              points: draft.points,
              tags: draft.tags,
              difficulty: draft.difficulty,
              publicContentJson: draft.publicContent,
              gradingJson: draft.grading,
              sourceMeta: {
                ...draft.sourceMeta,
                importBatchId: importBatch.id,
              },
            },
            select: { id: true },
          });

          if (draft.secretJudge) {
            await tx.notebookProblemSecret.create({
              data: {
                problemId: created.id,
                secretJudgeJson: draft.secretJudge,
              },
            });
          }
        }

        await tx.problemImportBatch.update({
          where: { id: importBatch.id },
          data: {
            status: 'committed',
            committedCount: draftsToInsert.length,
          },
        });
      },
      { timeout: 60_000 },
    );

    await refreshCourseSummaryFields(prisma, courseId);
    const after = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, problemCount: true, publishedProblemCount: true },
    });
    const imported = await prisma.notebookProblem.groupBy({
      by: ['type'],
      where: {
        courseId,
        sourceMeta: {
          path: ['sourceFileName'],
          equals: SOURCE_FILE_NAME,
        },
      },
      _count: { _all: true },
      _sum: { points: true },
    });
    console.log(JSON.stringify({ courseAfter: after, imported }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
