#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const DEFAULT_SOURCE_PATH =
  '/Users/dongpochen/Desktop/2025 Fall/CSC 108/题库/CSC108H5_Midterm_2025_V1.pdf';
const SOURCE_FILE_NAME = 'CSC108H5_Midterm_2025_V1.pdf';
const SOURCE_EXAM = 'CSC108H5 Fall 2025 Midterm Version A';

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

function normalizeEscapedCodeNewlines(code) {
  const escapedNewlineToken = '\u0000CSC108_ESCAPED_NEWLINE\u0000';
  return String(code)
    .replace(/\\\\n/g, escapedNewlineToken)
    .replace(/\\n/g, '\n')
    .replaceAll(escapedNewlineToken, '\\n');
}

function block(code) {
  return `\`\`\`python\n${normalizeEscapedCodeNewlines(code).trimEnd()}\n\`\`\``;
}

function cleanLines(text) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function baseDraft(questionNumber, sourceQuestionId, overrides) {
  return {
    draftId: `csc108-midterm-2025-v1-${String(questionNumber).padStart(2, '0')}`,
    notebookId: null,
    status: 'published',
    source: 'pdf',
    points: 1,
    tags: ['CSC108', 'midterm', 'fall-2025'],
    difficulty: 'medium',
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId,
      sourceQuestionNumber: questionNumber,
      sourceQuestionLabel: sourceQuestionId,
    },
    validationErrors: [],
    ...overrides,
  };
}

function choiceDraft(questionNumber, title, stem, options, correctOptionId, topic) {
  return baseDraft(questionNumber, `MCQ ${questionNumber}`, {
    title: `MCQ ${questionNumber}: ${title}`,
    type: 'choice',
    points: 1,
    tags: ['CSC108', 'midterm', 'fall-2025', 'mcq'],
    difficulty: 'easy',
    publicContent: {
      type: 'choice',
      stem: cleanLines(stem),
      selectionMode: 'single',
      options: Object.entries(options).map(([id, label]) => ({ id, label })),
    },
    grading: {
      type: 'choice',
      correctOptionIds: [correctOptionId],
      analysis: `Answer inferred from the ${topic} concept tested by the source PDF.`,
    },
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId: `MCQ ${questionNumber}`,
      sourceQuestionNumber: questionNumber,
      sourceQuestionLabel: `MCQ ${questionNumber}`,
      sourceCategory: 'multiple-choice',
      sourceTopic: topic,
      answerSource: 'codex-solved-from-pdf',
    },
  });
}

function fillBlankDraft(questionNumber, title, stemTemplate, blanks, topic) {
  return baseDraft(questionNumber, `Q${questionNumber}`, {
    title: `Q${questionNumber}: ${title}`,
    type: 'fill_blank',
    points: 2,
    tags: ['CSC108', 'midterm', 'fall-2025', 'fill-blank'],
    publicContent: {
      type: 'fill_blank',
      stemTemplate: cleanLines(stemTemplate),
      blanks: blanks.map((blank, index) => ({
        id: blank.id,
        placeholder: blank.placeholder ?? `Blank ${index + 1}`,
      })),
    },
    grading: {
      type: 'fill_blank',
      blanks: blanks.map((blank) => ({
        id: blank.id,
        acceptedAnswers: blank.acceptedAnswers,
        caseSensitive: blank.caseSensitive ?? false,
      })),
      analysis: `Answer inferred from the ${topic} concept tested by the source PDF.`,
    },
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId: `Q${questionNumber}`,
      sourceQuestionNumber: questionNumber,
      sourceQuestionLabel: `Q${questionNumber}`,
      sourceCategory: 'fill-in-the-blanks-short-code',
      sourceTopic: topic,
      answerSource: 'codex-solved-from-pdf',
    },
  });
}

function shortAnswerDraft(questionNumber, title, stem, points, referenceAnswer, topic) {
  return baseDraft(questionNumber, `Q${questionNumber}`, {
    title: `Q${questionNumber}: ${title}`,
    type: 'short_answer',
    points,
    tags: ['CSC108', 'midterm', 'fall-2025', 'short-answer'],
    publicContent: {
      type: 'short_answer',
      stem: cleanLines(stem),
    },
    grading: {
      type: 'short_answer',
      referenceAnswer,
      rubric: 'Grade for correctness, required order, and indentation where applicable.',
      analysis: `Reference answer inferred from the ${topic} concept tested by the source PDF.`,
    },
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId: `Q${questionNumber}`,
      sourceQuestionNumber: questionNumber,
      sourceQuestionLabel: `Q${questionNumber}`,
      sourceCategory: 'short-answer',
      sourceTopic: topic,
      answerSource: 'codex-solved-from-pdf',
    },
  });
}

function codeDraft({
  questionNumber,
  title,
  stem,
  points,
  starterCode,
  functionSignature,
  publicTests,
  secretTests,
  difficulty = 'hard',
  constraints = [],
}) {
  return baseDraft(questionNumber, `Q${questionNumber}`, {
    title: `Q${questionNumber}: ${title}`,
    type: 'code',
    points,
    tags: ['CSC108', 'midterm', 'fall-2025', 'code'],
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
      sourceQuestionId: `Q${questionNumber}`,
      sourceQuestionNumber: questionNumber,
      sourceQuestionLabel: `Q${questionNumber}`,
      sourceCategory: 'code-writing',
      sourceTopic: title,
      answerSource: 'tests-derived-from-pdf-examples',
    },
  });
}

const drafts = [
  choiceDraft(
    1,
    'Function Calls and Parameters',
    `Which call matches this function's header?\n\n${block('def g(s: str, n: int) -> str:\\n    ...')}`,
    {
      A: 'g(2, "hi")',
      B: 'g("hi")',
      C: 'g("hi", 3)',
      D: 'g()',
      E: 'None of the above',
    },
    'C',
    'function calls and parameters',
  ),
  choiceDraft(
    2,
    'Operators and Types',
    'What is the value of `7 // 3` in Python?',
    {
      A: '2.333...',
      B: '2',
      C: '3',
      D: '1',
      E: 'None of the above',
    },
    'B',
    'integer floor division',
  ),
  choiceDraft(
    3,
    'Lists and Accumulators',
    'Which method removes the last item from the list `lst`?',
    {
      A: 'lst.append(x)',
      B: 'lst.remove(x)',
      C: 'lst.pop()',
      D: 'lst[-1]',
      E: 'None of the above',
    },
    'C',
    'list methods',
  ),
  choiceDraft(
    4,
    'Conditionals and Variables',
    `What happens if you use a variable directly in a conditional before assigning it a value?\n\n${block('if y > 0:\\n    print("positive")')}`,
    {
      A: 'It prints "positive" by default.',
      B: 'It treats y as 0.',
      C: 'It skips the conditional without error.',
      D: 'It prints nothing.',
      E: 'It raises a NameError because y is not defined.',
    },
    'E',
    'undefined variables',
  ),
  choiceDraft(
    5,
    'Loops and Range',
    `Given:\n\n${block('s = 0\\nfor i in range(4):\\n    s += i')}\n\nWhat does ` +
      '`s` equal after the code above is run?',
    {
      A: 'Sum of 0 through 3',
      B: 'Sum of 1 through 4',
      C: '0 + 1 + 2 + 3 + 4',
      D: 'Infinite loop',
      E: 'None of the above',
    },
    'A',
    'range and accumulation',
  ),
  choiceDraft(
    6,
    "Booleans and DeMorgan's Law",
    'Which expression is equivalent to `not (x and y)`?',
    {
      A: 'not x and not y',
      B: 'not x or not y',
      C: 'x or y',
      D: 'not x or y',
      E: 'None of the above',
    },
    'B',
    "DeMorgan's Law",
  ),
  choiceDraft(
    7,
    'Lists and Accumulators',
    `Given:\n\n${block('lst = [10, 20, 30]\\nprint(lst[1:])')}\n\nWhat is the output?`,
    {
      A: '[10]',
      B: '[20, 30]',
      C: '[10, 20]',
      D: 'Error',
      E: 'None of the above',
    },
    'B',
    'list slicing',
  ),
  choiceDraft(
    8,
    'Function Calls and Parameters',
    `Given:\n\n${block('def f(x, y=2):\\n    return x * y\\nanswer = f(3)')}\n\nWhat is the value of ` +
      '`answer` after the code above is executed?',
    {
      A: '3',
      B: '6',
      C: 'Error (missing parameter)',
      D: '[3,2]',
      E: 'None',
    },
    'B',
    'default parameters',
  ),
  choiceDraft(
    9,
    'Strings vs Lists and Mutation',
    'Which statement causes an error?',
    {
      A: 's = "cat"; s[0] = "b"',
      B: 'lst = [1, 2, 3]; lst[0] = 9',
      C: 's = "cat"; s = "bat"',
      D: 'lst = [1, 2]; lst.append(3)',
      E: 'None of the above',
    },
    'A',
    'string immutability',
  ),
  choiceDraft(
    10,
    'Conditionals and Refactoring',
    `Given:\n\n${block('x = 4\\nif x > 5:\\n    print("big")\\nelif x == 4:\\n    print("equal")\\nelse:\\n    print("small")')}\n\nWhat is printed?`,
    {
      A: 'big',
      B: 'equal',
      C: 'small',
      D: 'nothing',
      E: 'None of the above',
    },
    'B',
    'if/elif/else flow',
  ),
  choiceDraft(
    11,
    'Operators and Types',
    'Suppose `x = 7.0` and `y = 3`. What is the type of `x // y`?',
    {
      A: 'int',
      B: 'float',
      C: 'str',
      D: 'bool',
      E: 'None of the above',
    },
    'B',
    'numeric operator result types',
  ),
  choiceDraft(
    12,
    "Booleans and DeMorgan's Law",
    `Given the following valid fragment of code:\n\n${block('if not (n > 0 or n < 0):')}\n\nWhich conditional is equivalent to it?`,
    {
      A: 'if n == 0:',
      B: 'if n != 0:',
      C: 'if not n:',
      D: 'if n > 0 and n < 0:',
      E: 'None of the above',
    },
    'A',
    "DeMorgan's Law",
  ),
  choiceDraft(
    13,
    'Lists and Accumulators',
    `Given:\n\n${block('nums = [1, 2, 3]\\ns = 0\\nfor n in nums:\\n    s += n\\nprint(s)')}\n\nWhat is the output of this code?`,
    {
      A: '0',
      B: '3',
      C: '6',
      D: 'Error',
      E: 'None of the above',
    },
    'C',
    'for loops and accumulation',
  ),
  choiceDraft(
    14,
    'Loops and Range',
    `Given:\n\n${block('s = "abc"\\nfor ch in s:\\n    print(ch.upper(), end="")')}\n\nWhat is the output of this code?`,
    {
      A: 'abc',
      B: 'ABC',
      C: 'a b c',
      D: 'Error',
      E: 'None of the above',
    },
    'B',
    'string iteration',
  ),
  choiceDraft(
    15,
    'Operators and Types',
    'Which expression evaluates to `True`?',
    {
      A: '5 % 2 == 2.5',
      B: '10 / 3 == 3.333',
      C: '4 // 2 == 2',
      D: '7 / 2 == 3',
      E: 'None of the above',
    },
    'C',
    'operators and equality',
  ),
  choiceDraft(
    16,
    'Conditionals and Refactoring',
    `Which of the following is equivalent to:\n\n${block('if grade >= 90:\\n    letter = "A"\\nelse:\\n    if grade >= 80:\\n        letter = "B"\\n    else:\\n        letter = "C"')}`,
    {
      A: block(
        'if grade >= 90:\\n    letter = "A"\\nelif grade >= 80:\\n    letter = "B"\\nelse:\\n    letter = "C"',
      ),
      B: block(
        'if grade >= 80:\\n    letter = "B"\\nelif grade >= 90:\\n    letter = "A"\\nelse:\\n    letter = "C"',
      ),
      C: 'Both A. and B.',
      D: 'Neither A. nor B.',
      E: 'None of the above',
    },
    'A',
    'conditional refactoring',
  ),
  choiceDraft(
    17,
    "Booleans and DeMorgan's Law",
    'If `x` is an integer, which boolean expression is always `False`?',
    {
      A: 'x < 5 or x >= 5',
      B: 'x < 5 and x >= 5',
      C: 'x == 5 or x == 6',
      D: 'not(x < 0 and x > 0)',
      E: 'None of the above',
    },
    'B',
    'boolean contradictions',
  ),
  choiceDraft(
    18,
    'Strings vs Lists and Mutation',
    `Given:\n\n${block('lst = [1, 2, 3]\\nlst2 = lst\\nlst2[0] = 9\\nprint(lst)')}\n\nWhat is the output of this code?`,
    {
      A: '[1, 2, 3]',
      B: '[9, 2, 3]',
      C: '[1, 9, 3]',
      D: 'Error',
      E: 'None of the above',
    },
    'B',
    'list aliasing and mutation',
  ),
  choiceDraft(
    19,
    'Loops and Range',
    `Given:\n\n${block('for i in range(2, 7, 2):\\n    print(str(i) + " ")')}\n\nWhat is the output of this code?`,
    {
      A: '2 3 4 5 6',
      B: '2 4 6',
      C: '2 4',
      D: '3 5',
      E: 'None of the above',
    },
    'B',
    'range start stop step',
  ),
  choiceDraft(
    20,
    'Function Calls and Parameters',
    `Given:\n\n${block('def f(x, y=2):\\n    print(x * y)\\nanswer = f(2, 4)')}\n\nWhat is the value of ` +
      '`answer` after the code above is executed?',
    {
      A: '4',
      B: '8',
      C: 'Error (missing parameter)',
      D: '[2,4]',
      E: 'None',
    },
    'E',
    'print return value',
  ),
  choiceDraft(
    21,
    'Strings vs Lists and Mutation',
    `Given:\n\n${block('s = "hello"\\nprint(s.replace("l", "x", 1))\\nprint(s)')}\n\nWhat is the output of this code?`,
    {
      A: 'hexxo then hexxo',
      B: 'hexlo then hexlo',
      C: 'hexlo then hello',
      D: 'hello then hello',
      E: 'None of the above',
    },
    'C',
    'string replace and immutability',
  ),
  fillBlankDraft(
    23,
    'Boolean Refactoring',
    `Rewrite the following statement without using the ` +
      '`or` operator:\n\n' +
      `${block('if (x > 5 or y <= 0):\\n    print("Valid")')}\n\nComplete:\n\n${block('if ____:\\n    print("Valid")')}`,
    [
      {
        id: 'blank_1',
        placeholder: 'condition',
        acceptedAnswers: ['not (x <= 5 and y > 0)', 'not(x <= 5 and y > 0)'],
      },
    ],
    'boolean refactoring',
  ),
  fillBlankDraft(
    24,
    'Conditional Simplification',
    `The code below is too long:\n\n${block('if n % 2 == 0:\\n    even = True\\nelse:\\n    even = False')}\n\nRefactor the code. Rewrite it on one line below. You must use a boolean expression.\n\n${block('even = ____')}`,
    [
      {
        id: 'blank_1',
        placeholder: 'boolean expression',
        acceptedAnswers: ['n % 2 == 0', '(n % 2 == 0)', 'n%2==0'],
      },
    ],
    'conditional simplification',
  ),
  fillBlankDraft(
    25,
    'Using a Helper Function',
    `You are given the following helper function:\n\n${block('def exists_triangle(a: int, b: int, c: int) -> bool:\\n    """Return True if sides <a>, <b>, <c> form a triangle."""')}\n\nComplete the body of the function below so it returns whether the string ` +
      '`s` is a "triangle string." A triangle string is formed by three consecutive groups of digits (all 1s, then 2s, then 3s). Each group may contain zero or more digits. For example, `"1112223333"` corresponds to sides `(3, 3, 4)`, which form a valid triangle. You may assume every input string `s` only contains the digits 1, 2, and 3.\n\n' +
      `${block('def is_triangle_string(s: str) -> bool:\\n    return exists_triangle(____, ____, ____)')}`,
    [
      {
        id: 'blank_1',
        placeholder: 'first argument',
        acceptedAnswers: ['s.count("1")', "s.count('1')"],
      },
      {
        id: 'blank_2',
        placeholder: 'second argument',
        acceptedAnswers: ['s.count("2")', "s.count('2')"],
      },
      {
        id: 'blank_3',
        placeholder: 'third argument',
        acceptedAnswers: ['s.count("3")', "s.count('3')"],
      },
    ],
    'helper functions and string count',
  ),
  fillBlankDraft(
    26,
    'Range and Accumulator',
    `Complete this loop. The loop computes the product of the numbers from 1 through 4.\n\n${block('total = 1\\n\\nfor i in range(____, ____):\\n    total *= i')}`,
    [
      {
        id: 'blank_1',
        placeholder: 'range start',
        acceptedAnswers: ['1'],
      },
      {
        id: 'blank_2',
        placeholder: 'range stop',
        acceptedAnswers: ['5'],
      },
    ],
    'range and accumulation',
  ),
  shortAnswerDraft(
    27,
    'File I/O in a Loop',
    `Assume the file ` +
      '`data.txt` initially contains:\n\n' +
      `${block('init')}\n\nNow consider this Python code:\n\n${block('for i in range(3):\\n    with open("data.txt", "w") as f:\\n        f.write(f"W{i}\\\\n")\\n    with open("data.txt", "a") as f:\\n        f.write(f"A{i}\\\\n")')}\n\nAfter the code executes, what are the exact contents of ` +
      '`data.txt`?',
    2,
    'W2\nA2',
    'file writing and append mode',
  ),
  shortAnswerDraft(
    28,
    'Accumulator Pattern with a String',
    `Order and indent the code blocks below to count the number of vowels in a string ` +
      '`s`. You may not need all of these blocks.\n\n' +
      [
        'A. for ch in s:',
        'B. if ch in "aeiou":',
        'C. count += 1',
        'D. count = 0',
        'E. return count',
        'F. count = ""',
        'G. count = count + ch',
      ].join('\n'),
    3,
    ['D', 'A', '    B', '        C', 'E'].join('\n'),
    'Parsons accumulator pattern',
  ),
  shortAnswerDraft(
    29,
    'While Loop Simulation',
    'Order and indent the code blocks below so they read integers from a list `nums` until a negative number is found. Return the sum of all numbers before the first negative. You may not need all of these blocks.\n\n' +
      [
        'A. while i < len(nums) and nums[i] >= 0:',
        'B. total = 0',
        'C. total += nums[i]',
        'D. i = 0',
        'E. return total',
        'F. i += 1',
        'G. while i < len(nums):',
        'H. return i',
        'I. print(total)',
      ].join('\n'),
    3,
    ['B', 'D', 'A', '    C', '    F', 'E'].join('\n'),
    'Parsons while loop',
  ),
  shortAnswerDraft(
    30,
    'List Mutation vs String Immutability',
    'Order and indent the code blocks below to replace all occurrences of `"a"` with `"x"` in a list of characters `lst`. You may not need all of these blocks.\n\n' +
      [
        'A. if lst[i] == "a":',
        'B. for i in range(len(lst)):',
        'C. lst[i] = "x"',
        'D. return lst',
        'E. s = s.replace("a", "x")',
        'F. lst.append("x")',
        'G. return s',
      ].join('\n'),
    3,
    ['B', '    A', '        C', 'D'].join('\n'),
    'Parsons list mutation',
  ),
  codeDraft({
    questionNumber: 31,
    title: 'Alternating Case String',
    points: 5,
    stem:
      'Write a function `alt_case(s: str) -> str` that returns a new string where characters at even indices (0, 2, 4, ...) are uppercase and characters at odd indices (1, 3, 5, ...) are lowercase. The function must work for any string.\n\nExamples:\n\n' +
      block(
        '>>> alt_case("hello")\n"HeLlO"\n\n>>> alt_case("Programming")\n"PrOgRaMmInG"\n\n>>> alt_case("a")\n"A"',
      ),
    starterCode: 'def alt_case(s: str) -> str:\n    pass',
    functionSignature: 'def alt_case(s: str) -> str:',
    publicTests: [
      {
        id: 'public-1',
        description: 'Example: hello',
        expression: 'alt_case("hello")',
        expected: '"HeLlO"',
      },
      {
        id: 'public-2',
        description: 'Example: Programming',
        expression: 'alt_case("Programming")',
        expected: '"PrOgRaMmInG"',
      },
      {
        id: 'public-3',
        description: 'Example: single character',
        expression: 'alt_case("a")',
        expected: '"A"',
      },
    ],
    secretTests: [
      {
        id: 'secret-1',
        description: 'Empty string',
        expression: 'alt_case("")',
        expected: '""',
      },
      {
        id: 'secret-2',
        description: 'Mixed letters and non-letters',
        expression: 'alt_case("AbC123!")',
        expected: '"AbC123!"',
      },
      {
        id: 'secret-3',
        description: 'Lowercase even and odd positions',
        expression: 'alt_case("python")',
        expected: '"PyThOn"',
      },
    ],
  }),
  codeDraft({
    questionNumber: 32,
    title: 'Average Temperature and Second Hottest',
    points: 10,
    stem:
      'Implement both functions below.\n\n(a) Write `average_temperature(temps: list[float]) -> int` that returns the average of the entries in `temps`, rounded to the nearest integer using Python built-in `round`. If the list is empty, return `0`. Assume the list contains only numeric values.\n\n' +
      '(b) Write `second_hottest(temps: list[float]) -> int` that returns the second highest distinct temperature in the input list. You must use at least one loop. Do not use `max()`, `min()`, `sorted()`, or `sort()`. If the list has fewer than two distinct temperature values, return `0`. Temperatures may include positive and negative numbers.\n\nExamples:\n\n' +
      block(
        '>>> average_temperature([20.0, 21.0, 22.0])\n21\n\n>>> average_temperature([30.4, 30.6])\n30\n\n>>> average_temperature([])\n0\n\n>>> second_hottest([20.0, 21.0, 22.0])\n21\n\n>>> second_hottest([30.4, 30.6])\n30\n\n>>> second_hottest([15.0, 15.0, 15.0])\n0\n\n>>> second_hottest([])\n0',
      ),
    starterCode:
      'def average_temperature(temps: list[float]) -> int:\n    pass\n\n\ndef second_hottest(temps: list[float]) -> int:\n    pass',
    functionSignature:
      'def average_temperature(temps: list[float]) -> int:\ndef second_hottest(temps: list[float]) -> int:',
    publicTests: [
      {
        id: 'public-1',
        description: 'Average example 1',
        expression: 'average_temperature([20.0, 21.0, 22.0])',
        expected: '21',
      },
      {
        id: 'public-2',
        description: 'Average example with Python rounding',
        expression: 'average_temperature([30.4, 30.6])',
        expected: '30',
      },
      {
        id: 'public-3',
        description: 'Average empty list',
        expression: 'average_temperature([])',
        expected: '0',
      },
      {
        id: 'public-4',
        description: 'Second hottest example 1',
        expression: 'second_hottest([20.0, 21.0, 22.0])',
        expected: '21',
      },
      {
        id: 'public-5',
        description: 'Second hottest example with decimals',
        expression: 'second_hottest([30.4, 30.6])',
        expected: '30',
      },
      {
        id: 'public-6',
        description: 'Second hottest fewer than two distinct values',
        expression: 'second_hottest([15.0, 15.0, 15.0])',
        expected: '0',
      },
      {
        id: 'public-7',
        description: 'Second hottest empty list',
        expression: 'second_hottest([])',
        expected: '0',
      },
    ],
    secretTests: [
      {
        id: 'secret-1',
        description: 'Average includes negative values',
        expression: 'average_temperature([-1.0, 1.0, 2.0])',
        expected: '1',
      },
      {
        id: 'secret-2',
        description: 'Average exact integer result',
        expression: 'average_temperature([2.5, 3.5])',
        expected: '3',
      },
      {
        id: 'secret-3',
        description: 'Second hottest ignores duplicate maximum',
        expression: 'second_hottest([5.0, 1.0, 5.0, 3.0])',
        expected: '3',
      },
      {
        id: 'secret-4',
        description: 'Second hottest with negatives',
        expression: 'second_hottest([-5.0, -1.0, -3.0])',
        expected: '-3',
      },
    ],
    constraints: [
      'Do not use max(), min(), sorted(), or sort() for second_hottest.',
      'Use at least one loop for second_hottest.',
    ],
  }),
  codeDraft({
    questionNumber: 33,
    title: 'Mark Boundaries',
    points: 5,
    stem:
      'Write a function `mark_boundaries(items: list[str]) -> list[str]` that returns a new list where the string `"---"` is inserted between groups of identical consecutive items in `items`. Insert exactly one marker between two groups that differ, leave runs of identical items unchanged, do not modify the original list, and return `[]` if the input list is empty.\n\nExamples:\n\n' +
      block(
        '>>> mark_boundaries(["A", "A", "B", "B", "C"])\n["A", "A", "---", "B", "B", "---", "C"]\n\n>>> mark_boundaries(["X", "Y", "Z"])\n["X", "---", "Y", "---", "Z"]\n\n>>> mark_boundaries(["Same", "Same", "Same"])\n["Same", "Same", "Same"]\n\n>>> mark_boundaries([])\n[]',
      ),
    starterCode: 'def mark_boundaries(items: list[str]) -> list[str]:\n    pass',
    functionSignature: 'def mark_boundaries(items: list[str]) -> list[str]:',
    publicTests: [
      {
        id: 'public-1',
        description: 'Example with grouped repeats',
        expression: 'mark_boundaries(["A", "A", "B", "B", "C"])',
        expected: '["A", "A", "---", "B", "B", "---", "C"]',
      },
      {
        id: 'public-2',
        description: 'Example with all boundaries',
        expression: 'mark_boundaries(["X", "Y", "Z"])',
        expected: '["X", "---", "Y", "---", "Z"]',
      },
      {
        id: 'public-3',
        description: 'Example with one group',
        expression: 'mark_boundaries(["Same", "Same", "Same"])',
        expected: '["Same", "Same", "Same"]',
      },
      {
        id: 'public-4',
        description: 'Empty list',
        expression: 'mark_boundaries([])',
        expected: '[]',
      },
    ],
    secretTests: [
      {
        id: 'secret-1',
        description: 'Single item list',
        expression: 'mark_boundaries(["A"])',
        expected: '["A"]',
      },
      {
        id: 'secret-2',
        description: 'Returns to an earlier value as a new group',
        expression: 'mark_boundaries(["A", "B", "B", "A"])',
        expected: '["A", "---", "B", "B", "---", "A"]',
      },
      {
        id: 'secret-3',
        description: 'Does not mutate the original list',
        expression: '((lambda data: (mark_boundaries(data), data))(["A", "B"]))',
        expected: '[["A", "---", "B"], ["A", "B"]]',
      },
    ],
  }),
];

function validateDrafts() {
  if (drafts.length !== 32) {
    throw new Error(`Expected 32 drafts, found ${drafts.length}`);
  }
  const ids = new Set();
  const numbers = new Set();
  for (const draft of drafts) {
    if (ids.has(draft.sourceMeta.sourceQuestionId)) {
      throw new Error(`Duplicate source question id: ${draft.sourceMeta.sourceQuestionId}`);
    }
    ids.add(draft.sourceMeta.sourceQuestionId);
    if (numbers.has(draft.sourceMeta.sourceQuestionNumber)) {
      throw new Error(`Duplicate source question number: ${draft.sourceMeta.sourceQuestionNumber}`);
    }
    numbers.add(draft.sourceMeta.sourceQuestionNumber);
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
