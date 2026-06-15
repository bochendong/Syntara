#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const MARKDOWN_PATH = path.join(ROOT, 'queue/CSC108/12_FinalExam_2025_Questions.md');
const SOURCE_FILE_NAME = 'CSC108H5F_FinalExam_2025_Questions.pdf';
const SOURCE_EXAM = 'CSC108H5F Fall 2025 Final Examination';
const IMPORT_VERSION = 'csc108-final-exam-2025-questions-2026-06-13';

const NOTEBOOK = {
  basic: 'queue-csc108-01-basic-operations',
  functions: 'queue-csc108-02-control',
  loops: 'queue-csc108-03-loop',
  lists: 'queue-csc108-04-list',
  inputOutput: 'queue-csc108-05-input-output',
  fileIo: 'queue-csc108-06-file-io',
  dict: 'queue-csc108-07-dictionary',
  csv: 'queue-csc108-08-csv',
  regex: 'queue-csc108-09-regex',
  runtime: 'queue-csc108-10-running-time',
  class: 'queue-csc108-11-class',
};

const MCQ_META = {
  1: { answer: 'A', notebookId: NOTEBOOK.fileIo, topic: 'file I/O and readlines' },
  2: { answer: 'A', notebookId: NOTEBOOK.runtime, topic: 'bubble sort first pass' },
  3: { answer: 'C', notebookId: NOTEBOOK.lists, topic: 'nested lists and matrix row access' },
  4: { answer: 'B', notebookId: NOTEBOOK.dict, topic: 'dictionary inversion' },
  5: { answer: 'A', notebookId: NOTEBOOK.dict, topic: 'n-gram dictionary construction' },
  6: { answer: 'C', notebookId: NOTEBOOK.runtime, topic: 'selection sort passes' },
  7: { answer: 'C', notebookId: NOTEBOOK.runtime, topic: 'insertion sort comparisons' },
  8: { answer: 'B', notebookId: NOTEBOOK.lists, topic: 'tuple immutability with mutable contents' },
  9: { answer: 'B', notebookId: NOTEBOOK.dict, topic: 'nested dictionary access' },
  10: { answer: 'C', notebookId: NOTEBOOK.fileIo, topic: 'file writing line count' },
  11: { answer: 'B', notebookId: NOTEBOOK.dict, topic: 'hashable dictionary keys' },
  12: { answer: 'A', notebookId: NOTEBOOK.dict, topic: 'nested dictionary accumulation' },
  13: { answer: 'C', notebookId: NOTEBOOK.dict, topic: 'dictionary aliasing' },
  14: { answer: 'B', notebookId: NOTEBOOK.lists, topic: 'matrix traversal and accumulation' },
  15: { answer: 'B', notebookId: NOTEBOOK.fileIo, topic: 'file reading and split' },
  16: { answer: 'B', notebookId: NOTEBOOK.dict, topic: 'n-gram lookup' },
  17: { answer: 'D', notebookId: NOTEBOOK.runtime, topic: 'nested-loop iteration count' },
  18: { answer: 'C', notebookId: NOTEBOOK.lists, topic: 'matrix diagonal computation' },
  19: { answer: 'C', notebookId: NOTEBOOK.fileIo, topic: 'write mode truncation' },
  20: { answer: 'B', notebookId: NOTEBOOK.runtime, topic: 'nested-loop trace' },
  21: { answer: 'B', notebookId: NOTEBOOK.dict, topic: 'dictionary pop and get' },
  22: { answer: 'B', notebookId: NOTEBOOK.runtime, topic: 'Big-O with nested loops' },
  23: { answer: 'C', notebookId: NOTEBOOK.dict, topic: 'None values in dictionaries' },
};

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

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function cleanLines(text) {
  return String(text)
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function stripQuestionNumber(title) {
  return title
    .replace(/^MCQ\s+\d+\.\s*/i, '')
    .replace(/^Q\d+[a-z]?\.\s*/i, '')
    .replace(/^\([a-c]\)\s*/i, '')
    .trim();
}

function expected(value) {
  return JSON.stringify(value);
}

function block(code, language = 'python') {
  return `~~~${language}\n${String(code).trimEnd()}\n~~~`;
}

function pyCase(body) {
  return `(lambda __ns: (exec(${JSON.stringify(body)}, __ns, __ns), __ns["__case"]())[1])(globals())`;
}

function loadMarkdownSections(markdown) {
  const headingPattern = /^(#{3,4})\s+(.+)$/gm;
  const matches = [...markdown.matchAll(headingPattern)];
  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const title = match[2].trim();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
    sections.set(title, cleanLines(markdown.slice(start, end)));
  }
  return sections;
}

function section(sections, heading) {
  const value = sections.get(heading);
  if (!value) throw new Error(`Missing Markdown section: ${heading}`);
  return value;
}

function splitChoiceSection(rawSection) {
  const lines = cleanLines(rawSection).split('\n');
  const firstOptionIndex = lines.findIndex((line) => /^[A-Z]\.\s*/.test(line));
  if (firstOptionIndex < 0) throw new Error('Choice section does not contain options.');

  const stem = cleanLines(lines.slice(0, firstOptionIndex).join('\n'));
  const options = [];
  let current = null;

  for (const line of lines.slice(firstOptionIndex)) {
    const match = line.match(/^([A-Z])\.\s*(.*)$/);
    if (match) {
      if (current) options.push(current);
      current = { id: match[1], labelLines: [match[2]] };
      continue;
    }
    if (!current) continue;
    current.labelLines.push(line);
  }
  if (current) options.push(current);

  return {
    stem,
    options: options.map((option) => ({
      id: option.id,
      label: cleanLines(option.labelLines.join('\n')),
    })),
  };
}

function baseDraft({
  order,
  sourceQuestionId,
  sourceQuestionLabel,
  sourceQuestionNumber,
  sourceQuestionPart,
  notebookId,
  title,
  type,
  points,
  difficulty = 'medium',
  tags = [],
  publicContent,
  grading,
  secretJudge,
  sourceCategory,
  sourceTopic,
}) {
  return {
    draftId: `csc108-final-2025-${String(order).padStart(2, '0')}`,
    notebookId,
    title,
    type,
    status: 'published',
    source: 'pdf',
    points,
    tags: Array.from(new Set(['CSC108', 'final-exam', 'fall-2025', ...tags])).slice(0, 16),
    difficulty,
    publicContent,
    grading,
    secretJudge,
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceExam: SOURCE_EXAM,
      sourceQuestionId,
      sourceQuestionLabel,
      sourceQuestionNumber,
      sourceQuestionPart,
      sourceQuestionOrder: order,
      sourceCategory,
      sourceTopic,
      assignedNotebookId: notebookId,
      importVersion: IMPORT_VERSION,
    },
    validationErrors: [],
  };
}

function choiceDraft({ order, heading, sourceQuestionId, sourceQuestionNumber, notebookId, answer, points, topic, tags }) {
  const parsed = splitChoiceSection(heading.section);
  return baseDraft({
    order,
    sourceQuestionId,
    sourceQuestionLabel: sourceQuestionId,
    sourceQuestionNumber,
    notebookId,
    title: stripQuestionNumber(heading.title),
    type: 'choice',
    points,
    difficulty: 'easy',
    tags: ['choice', ...(tags ?? [])],
    publicContent: {
      type: 'choice',
      stem: parsed.stem,
      selectionMode: 'single',
      options: parsed.options,
    },
    grading: {
      type: 'choice',
      correctOptionIds: [answer],
      analysis: `Correct option inferred from ${topic}.`,
    },
    sourceCategory: 'multiple-choice',
    sourceTopic: topic,
  });
}

function codeDraft({
  order,
  sourceQuestionId,
  sourceQuestionNumber,
  sourceQuestionPart,
  notebookId,
  title,
  stem,
  points,
  starterCode,
  functionSignature,
  publicTests,
  secretTests = [],
  difficulty = 'medium',
  tags = [],
  topic,
  constraints = [],
}) {
  return baseDraft({
    order,
    sourceQuestionId,
    sourceQuestionLabel: sourceQuestionId,
    sourceQuestionNumber,
    sourceQuestionPart,
    notebookId,
    title,
    type: 'code',
    points,
    difficulty,
    tags: ['code', ...tags],
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
      analysis: `Autograded with public and hidden Python checks for ${topic}.`,
    },
    secretJudge:
      secretTests.length > 0
        ? {
            language: 'python',
            secretTests,
            timeoutMs: 5000,
          }
        : undefined,
    sourceCategory: 'code',
    sourceTopic: topic,
  });
}

function buildMcqDrafts(sections) {
  return Array.from({ length: 23 }, (_, index) => {
    const number = index + 1;
    const headingTitle = [...sections.keys()].find((key) => key.startsWith(`MCQ ${number}. `));
    if (!headingTitle) throw new Error(`Missing MCQ ${number}`);
    const meta = MCQ_META[number];
    return choiceDraft({
      order: number,
      heading: { title: headingTitle, section: section(sections, headingTitle) },
      sourceQuestionId: `MCQ ${number}`,
      sourceQuestionNumber: number,
      notebookId: meta.notebookId,
      answer: meta.answer,
      points: 1,
      topic: meta.topic,
      tags: ['mcq'],
    });
  });
}

function buildTestingMutationDraft(sections) {
  return codeDraft({
    order: 24,
    sourceQuestionId: 'Q24',
    sourceQuestionNumber: 24,
    notebookId: NOTEBOOK.lists,
    title: 'Testing Mutation Detection',
    points: 2,
    topic: 'list mutation testing',
    stem: section(sections, 'Q24. Testing: Mutation Detection'),
    starterCode: `
def double_positives(nums: list[int]) -> None:
    """Mutate <nums> by doubling all positive values in place."""
    for i in range(len(nums)):
        if nums[i] > 0:
            nums[i] = nums[i] * 2


def test_double_positives_mutates() -> None:
    original = [1, -2, 3]

    # TODO: keep a reference to the original list object.

    double_positives(original)

    assert original == [2, -2, 6]
    assert False
`.trim(),
    functionSignature: 'def test_double_positives_mutates() -> None:',
    publicTests: [
      {
        id: 'public_runs_with_correct_function',
        description: 'The test passes with the correct implementation.',
        expression: 'test_double_positives_mutates() is None',
        expected: expected(true),
      },
      {
        id: 'public_checks_object_identity',
        description: 'The test uses object identity.',
        expression: '" is " in __import__("inspect").getsource(test_double_positives_mutates)',
        expected: expected(true),
      },
    ],
    secretTests: [
      {
        id: 'secret_catches_non_mutating_bug',
        description: 'The test fails if the function returns a new list instead of mutating.',
        expression: pyCase(`
def __case():
    old = double_positives
    try:
        globals()['double_positives'] = lambda nums: [n * 2 if n > 0 else n for n in nums]
        try:
            test_double_positives_mutates()
        except AssertionError:
            return True
        return False
    finally:
        globals()['double_positives'] = old
`),
        expected: expected(true),
      },
    ],
  });
}

function buildDeepCopyDraft(sections) {
  return codeDraft({
    order: 25,
    sourceQuestionId: 'Q25',
    sourceQuestionNumber: 25,
    notebookId: NOTEBOOK.lists,
    title: 'Testing Deep Copy Detection',
    points: 2,
    topic: 'nested list deep-copy testing',
    stem: section(sections, 'Q25. Testing: Deep Copy Detection'),
    starterCode: `
def copy_matrix(matrix: list[list[int]]) -> list[list[int]]:
    """Return a deep copy of <matrix>."""
    result = []
    for row in matrix:
        result.append(row[:])
    return result


def test_copy_matrix_deep_copy() -> None:
    original = [[1, 2], [3, 4]]
    copied = copy_matrix(original)

    # Verify it is not the same outer list.
    assert False

    # Verify the inner lists are also copied, not shared.
    assert False
`.trim(),
    functionSignature: 'def test_copy_matrix_deep_copy() -> None:',
    publicTests: [
      {
        id: 'public_runs_with_correct_function',
        description: 'The test passes with a correct deep-copy implementation.',
        expression: 'test_copy_matrix_deep_copy() is None',
        expected: expected(true),
      },
      {
        id: 'public_uses_is_not',
        description: 'The test checks object identity with is not.',
        expression: '"is not" in __import__("inspect").getsource(test_copy_matrix_deep_copy)',
        expected: expected(true),
      },
    ],
    secretTests: [
      {
        id: 'secret_catches_shallow_copy',
        description: 'The test fails for a shallow copy implementation.',
        expression: pyCase(`
def __case():
    old = copy_matrix
    try:
        globals()['copy_matrix'] = lambda matrix: matrix[:]
        try:
            test_copy_matrix_deep_copy()
        except AssertionError:
            return True
        return False
    finally:
        globals()['copy_matrix'] = old
`),
        expected: expected(true),
      },
    ],
  });
}

function buildNoMutationDraft(sections) {
  return codeDraft({
    order: 26,
    sourceQuestionId: 'Q26',
    sourceQuestionNumber: 26,
    notebookId: NOTEBOOK.lists,
    title: 'Testing Return Versus Mutate',
    points: 2,
    topic: 'list non-mutation testing',
    stem: section(sections, 'Q26. Testing: Return vs. Mutate'),
    starterCode: `
def remove_negatives(nums: list[int]) -> list[int]:
    """Return a NEW list containing only non-negative values
    from <nums>. The original list <nums> must NOT be modified.
    """
    i = 0
    while i < len(nums):
        if nums[i] < 0:
            nums.pop(i)
        else:
            i += 1
    return nums


def test_remove_negatives_no_mutation() -> None:
    original = [1, -2, 3, -4]
    result = remove_negatives(original)

    # This assertion catches the bug:
    assert False
`.trim(),
    functionSignature: 'def test_remove_negatives_no_mutation() -> None:',
    publicTests: [
      {
        id: 'public_catches_given_bug',
        description: 'The completed test catches the provided buggy implementation.',
        expression: pyCase(`
def __case():
    try:
        test_remove_negatives_no_mutation()
    except AssertionError:
        return True
    return False
`),
        expected: expected(true),
      },
    ],
    secretTests: [
      {
        id: 'secret_mentions_original_state',
        description: 'The test asserts the original list state.',
        expression:
          '"[1, -2, 3, -4]" in __import__("inspect").getsource(test_remove_negatives_no_mutation)',
        expected: expected(true),
      },
    ],
  });
}

function buildWriteTreeDraft(sections) {
  return codeDraft({
    order: 27,
    sourceQuestionId: 'Q27',
    sourceQuestionNumber: 27,
    notebookId: NOTEBOOK.fileIo,
    title: 'File I/O Writing Patterns',
    points: 6,
    topic: 'file writing with generated string patterns',
    stem: section(sections, 'Q27. File I/O: Writing Patterns'),
    starterCode: `
def write_tree(filename: str, height: int) -> None:
    """Write a tree pattern to <filename> with <height> rows."""
    pass
`.trim(),
    functionSignature: 'def write_tree(filename: str, height: int) -> None:',
    publicTests: [
      {
        id: 'public_height_3',
        description: 'Writes the height 3 example exactly.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    fd, path = tempfile.mkstemp()
    os.close(fd)
    try:
        write_tree(path, 3)
        with open(path) as f:
            return f.read()
    finally:
        os.remove(path)
`),
        expected: expected('  *  \n *** \n*****\n'),
      },
      {
        id: 'public_height_1',
        description: 'Writes one row.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    fd, path = tempfile.mkstemp()
    os.close(fd)
    try:
        write_tree(path, 1)
        with open(path) as f:
            return f.read()
    finally:
        os.remove(path)
`),
        expected: expected('*\n'),
      },
    ],
    secretTests: [
      {
        id: 'secret_height_0',
        description: 'Writes no rows for height 0.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    fd, path = tempfile.mkstemp()
    os.close(fd)
    try:
        write_tree(path, 0)
        with open(path) as f:
            return f.read()
    finally:
        os.remove(path)
`),
        expected: expected(''),
      },
      {
        id: 'secret_height_4',
        description: 'Writes centred rows for height 4.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    fd, path = tempfile.mkstemp()
    os.close(fd)
    try:
        write_tree(path, 4)
        with open(path) as f:
            return f.read()
    finally:
        os.remove(path)
`),
        expected: expected('   *   \n  ***  \n ***** \n*******\n'),
      },
    ],
  });
}

function buildRegexDraft(sections) {
  return codeDraft({
    order: 28,
    sourceQuestionId: 'Q28',
    sourceQuestionNumber: 28,
    notebookId: NOTEBOOK.regex,
    title: 'Regular Expression Login Validation',
    points: 3,
    topic: 'regex anchors and capture groups',
    stem: section(sections, 'Q28. Regular Expression'),
    starterCode: 'pattern = r""',
    functionSignature: 'pattern = r"..."',
    publicTests: [
      {
        id: 'public_franco',
        description: 'Matches lowercase username with digits and captures groups.',
        expression: '__import__("re").fullmatch(pattern, "franco123.uoftCSC").groups()',
        expected: expected(['franco123', 'CSC']),
      },
      {
        id: 'public_maria',
        description: 'Matches lowercase username and captures department.',
        expression: '__import__("re").fullmatch(pattern, "maria.uoftECE").groups()',
        expected: expected(['maria', 'ECE']),
      },
      {
        id: 'public_reject_missing_department',
        description: 'Rejects missing department code.',
        expression: '__import__("re").fullmatch(pattern, "invalid.uoft") is None',
        expected: expected(true),
      },
    ],
    secretTests: [
      {
        id: 'secret_reject_no_username',
        description: 'Rejects a login with no username.',
        expression: '__import__("re").fullmatch(pattern, ".uoftCSC") is None',
        expected: expected(true),
      },
      {
        id: 'secret_reject_four_department_letters',
        description: 'Rejects a four-letter department.',
        expression: '__import__("re").fullmatch(pattern, "user123.uoftABCD") is None',
        expected: expected(true),
      },
      {
        id: 'secret_reject_uppercase_username',
        description: 'Rejects uppercase username or lowercase department letters.',
        expression: '__import__("re").fullmatch(pattern, "User.uoftCsc") is None',
        expected: expected(true),
      },
    ],
  });
}

function parsonsChoiceDraft({ order, sourceQuestionId, sourceQuestionNumber, notebookId, title, stem, answer, options, topic }) {
  return baseDraft({
    order,
    sourceQuestionId,
    sourceQuestionLabel: sourceQuestionId,
    sourceQuestionNumber,
    notebookId,
    title,
    type: 'choice',
    points: 3,
    difficulty: 'medium',
    tags: ['choice', 'parsons'],
    publicContent: {
      type: 'choice',
      stem: cleanLines(stem),
      selectionMode: 'single',
      options,
    },
    grading: {
      type: 'choice',
      correctOptionIds: [answer],
      analysis: `Correct sequence inferred from ${topic}.`,
    },
    sourceCategory: 'parsons',
    sourceTopic: topic,
  });
}

function buildParsonsDrafts(sections) {
  return [
    parsonsChoiceDraft({
      order: 29,
      sourceQuestionId: 'Q29',
      sourceQuestionNumber: 29,
      notebookId: NOTEBOOK.dict,
      title: 'Group Words by Length',
      stem: section(sections, 'Q29. Group Words by Length'),
      topic: 'dictionary grouping accumulator',
      answer: 'A',
      options: [
        {
          id: 'A',
          label: cleanLines(`
B
C
    D
    F
        H
    I
A
`),
        },
        {
          id: 'B',
          label: cleanLines(`
B
C
    D
    E
        G
A
`),
        },
        {
          id: 'C',
          label: cleanLines(`
B
C
    D
    F
        J
A
`),
        },
        {
          id: 'D',
          label: 'UNSOLVABLE',
        },
      ],
    }),
    parsonsChoiceDraft({
      order: 30,
      sourceQuestionId: 'Q30',
      sourceQuestionNumber: 30,
      notebookId: NOTEBOOK.runtime,
      title: 'Selection Sort One Pass',
      stem: section(sections, 'Q30. Selection Sort: One Pass'),
      topic: 'selection sort one-pass algorithm',
      answer: 'A',
      options: [
        {
          id: 'A',
          label: cleanLines(`
G
A
    D
        E
J
`),
        },
        {
          id: 'B',
          label: cleanLines(`
F
B
    C
        E
H
`),
        },
        {
          id: 'C',
          label: cleanLines(`
G
A
    C
        I
`),
        },
        {
          id: 'D',
          label: 'UNSOLVABLE',
        },
      ],
    }),
  ];
}

function buildEvBrandsDraft(sections) {
  return codeDraft({
    order: 31,
    sourceQuestionId: 'Q31',
    sourceQuestionNumber: 31,
    notebookId: NOTEBOOK.csv,
    title: 'Electric Vehicle Data Processing',
    points: 5,
    topic: 'comma-separated file processing',
    stem: section(sections, 'Q31. Electric Vehicle Data Processing'),
    starterCode: `
def get_ev_brands(filename: str) -> list[str]:
    """Return brands of all fully electric vehicles in <filename>."""
    pass
`.trim(),
    functionSignature: 'def get_ev_brands(filename: str) -> list[str]:',
    publicTests: [
      {
        id: 'public_example',
        description: 'Returns EV brands from the example file.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    content = """Toyota, Corolla, 32000 euros, PHEV, 14.0 kWh, 6.1L, 6.4L, 12 kWh, 50.0 L
Skoda, Enyaq, 43999 euros, EV, 13.0 kWh, 16.1 kWh, 20.1 kWh, 85.0 kWh
Skoda, Elroq, 34999 euros, EV, 12.7 kWh, 16.0 kWh, 19.6 kWh, 85.0 kWh
Volkswagen, Golf, 23999 euros, IntCE, 7.5 L, 6.7 L, 6.8 L, 55.0 L
Volkswagen, ID.4, 46999 euros, EV, 13.0 kWh, 16.1 kWh, 20.1 kWh, 85.0 kWh
Mercedes Benz, CLA, 68000 euros, EV, 13 kWh, 15.6 kWh, 18.3 kWh, 73.1 kWh
"""
    fd, path = tempfile.mkstemp(text=True)
    os.close(fd)
    try:
        with open(path, 'w') as f:
            f.write(content)
        return get_ev_brands(path)
    finally:
        os.remove(path)
`),
        expected: expected(['Skoda', 'Skoda', 'Volkswagen', 'Mercedes Benz']),
      },
    ],
    secretTests: [
      {
        id: 'secret_no_evs',
        description: 'Returns an empty list when no EVs exist.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    content = """Toyota, Corolla, 32000 euros, PHEV
Volkswagen, Golf, 23999 euros, IntCE
"""
    fd, path = tempfile.mkstemp(text=True)
    os.close(fd)
    try:
        with open(path, 'w') as f:
            f.write(content)
        return get_ev_brands(path)
    finally:
        os.remove(path)
`),
        expected: expected([]),
      },
      {
        id: 'secret_strips_type_spacing',
        description: 'Handles spaces around comma-separated fields.',
        expression: pyCase(`
def __case():
    import os
    import tempfile
    content = """A Brand, Model X, 10 euros, EV, extra
B Brand, Model Y, 10 euros, PHEV, extra
A Brand, Model Z, 10 euros, EV, extra
"""
    fd, path = tempfile.mkstemp(text=True)
    os.close(fd)
    try:
        with open(path, 'w') as f:
            f.write(content)
        return get_ev_brands(path)
    finally:
        os.remove(path)
`),
        expected: expected(['A Brand', 'A Brand']),
      },
    ],
  });
}

const PERSON_REFERENCE = `
class Person:
    """A person with a name and friends."""

    def __init__(self, name: str):
        self.name = name
        self.friends = []

    def __str__(self):
        return f"{self.name} ({len(self.friends)} friends)"

    def add_friend(self, other):
        if other not in self.friends:
            self.friends.append(other)
`.trim();

function buildPersonDraft(sections) {
  return codeDraft({
    order: 32,
    sourceQuestionId: 'Q32a',
    sourceQuestionNumber: 32,
    sourceQuestionPart: 'a',
    notebookId: NOTEBOOK.class,
    title: 'Person Class',
    points: 4,
    topic: 'class attributes and methods',
    stem: section(sections, 'Q32a. The Person Class'),
    starterCode: `
class Person:
    """A person with a name and friends."""
    pass
`.trim(),
    functionSignature: 'class Person:',
    publicTests: [
      {
        id: 'public_initial_string',
        description: 'Initializes name, empty friends, and string form.',
        expression: 'str(Person("Alice"))',
        expected: expected('Alice (0 friends)'),
      },
      {
        id: 'public_add_friend_once',
        description: 'Adds a friend.',
        expression: pyCase(`
def __case():
    alice = Person("Alice")
    bob = Person("Bob")
    alice.add_friend(bob)
    return [str(alice), len(alice.friends), alice.friends[0].name]
`),
        expected: expected(['Alice (1 friends)', 1, 'Bob']),
      },
    ],
    secretTests: [
      {
        id: 'secret_no_duplicate_friend',
        description: 'Does not add duplicate friends.',
        expression: pyCase(`
def __case():
    alice = Person("Alice")
    bob = Person("Bob")
    alice.add_friend(bob)
    alice.add_friend(bob)
    return len(alice.friends)
`),
        expected: expected(1),
      },
    ],
  });
}

function buildNetworkDraft(sections) {
  return codeDraft({
    order: 33,
    sourceQuestionId: 'Q32b',
    sourceQuestionNumber: 32,
    sourceQuestionPart: 'b',
    notebookId: NOTEBOOK.class,
    title: 'Network Class',
    points: 3,
    topic: 'class with dictionary of objects',
    stem: `${section(sections, 'Q32b. The Network Class')}\n\nThe ` +
      '`Person` class is already available for this standalone problem.',
    starterCode: `
${PERSON_REFERENCE}


class Network:
    """A social network mapping names to Person objects."""
    pass
`.trim(),
    functionSignature: 'class Network:',
    publicTests: [
      {
        id: 'public_add_and_get_person',
        description: 'Adds and retrieves people.',
        expression: pyCase(`
def __case():
    net = Network()
    net.add_person("Alice")
    net.add_person("Bob")
    alice = net.get_person("Alice")
    return [sorted(net.members.keys()), str(alice)]
`),
        expected: expected([['Alice', 'Bob'], 'Alice (0 friends)']),
      },
    ],
    secretTests: [
      {
        id: 'secret_duplicate_name_does_nothing',
        description: 'Does not replace an existing person with the same name.',
        expression: pyCase(`
def __case():
    net = Network()
    net.add_person("Alice")
    first = net.get_person("Alice")
    net.add_person("Alice")
    return [len(net.members), net.get_person("Alice") is first]
`),
        expected: expected([1, true]),
      },
    ],
  });
}

function buildPopularDraft(sections) {
  return codeDraft({
    order: 34,
    sourceQuestionId: 'Q32c',
    sourceQuestionNumber: 32,
    sourceQuestionPart: 'c',
    notebookId: NOTEBOOK.class,
    title: 'Finding the Most Popular People',
    points: 6,
    topic: 'method that counts object references',
    stem: `${section(sections, 'Q32c. Finding the Most Popular People')}\n\nThe ` +
      '`Person` class and the basic `Network` methods are already available for this standalone problem.',
    starterCode: `
${PERSON_REFERENCE}


class Network:
    """A social network mapping names to Person objects."""

    def __init__(self):
        self.members = {}

    def add_person(self, name: str) -> None:
        if name not in self.members:
            self.members[name] = Person(name)

    def get_person(self, name: str) -> Person:
        return self.members[name]

    def get_most_popular(self) -> list[str]:
        pass
`.trim(),
    functionSignature: 'def get_most_popular(self) -> list[str]:',
    publicTests: [
      {
        id: 'public_example_alice',
        description: 'Returns Alice as most popular in the first example state.',
        expression: pyCase(`
def __case():
    net = Network()
    for name in ["Alice", "Bob", "Carol", "David"]:
        net.add_person(name)
    alice = net.get_person("Alice")
    bob = net.get_person("Bob")
    carol = net.get_person("Carol")
    david = net.get_person("David")
    bob.add_friend(alice)
    carol.add_friend(alice)
    david.add_friend(alice)
    david.add_friend(bob)
    return net.get_most_popular()
`),
        expected: expected(['Alice']),
      },
      {
        id: 'public_example_tie',
        description: 'Returns tied names in alphabetical order.',
        expression: pyCase(`
def __case():
    net = Network()
    for name in ["Alice", "Bob", "Carol", "David"]:
        net.add_person(name)
    alice = net.get_person("Alice")
    bob = net.get_person("Bob")
    carol = net.get_person("Carol")
    david = net.get_person("David")
    bob.add_friend(alice)
    carol.add_friend(alice)
    david.add_friend(alice)
    david.add_friend(bob)
    carol.add_friend(bob)
    alice.add_friend(bob)
    return net.get_most_popular()
`),
        expected: expected(['Alice', 'Bob']),
      },
    ],
    secretTests: [
      {
        id: 'secret_empty_network',
        description: 'Returns an empty list for an empty network.',
        expression: 'Network().get_most_popular()',
        expected: expected([]),
      },
      {
        id: 'secret_alphabetical_tie',
        description: 'Sorts ties alphabetically.',
        expression: pyCase(`
def __case():
    net = Network()
    for name in ["Zoe", "Amy", "Mia"]:
        net.add_person(name)
    zoe = net.get_person("Zoe")
    amy = net.get_person("Amy")
    mia = net.get_person("Mia")
    mia.add_friend(zoe)
    mia.add_friend(amy)
    return net.get_most_popular()
`),
        expected: expected(['Amy', 'Zoe']),
      },
    ],
  });
}

function buildDrafts(markdown) {
  if (/^## Bonus Question\b/m.test(markdown)) {
    throw new Error('Bonus Question section is still present in the Markdown source.');
  }
  const sections = loadMarkdownSections(markdown);
  return [
    ...buildMcqDrafts(sections),
    buildTestingMutationDraft(sections),
    buildDeepCopyDraft(sections),
    buildNoMutationDraft(sections),
    buildWriteTreeDraft(sections),
    buildRegexDraft(sections),
    ...buildParsonsDrafts(sections),
    buildEvBrandsDraft(sections),
    buildPersonDraft(sections),
    buildNetworkDraft(sections),
    buildPopularDraft(sections),
  ];
}

function summarizeDrafts(items) {
  return items.reduce(
    (acc, draft) => {
      acc.byType[draft.type] = (acc.byType[draft.type] ?? 0) + 1;
      acc.byNotebook[draft.notebookId] = (acc.byNotebook[draft.notebookId] ?? 0) + 1;
      acc.points += draft.points;
      if (draft.type === 'code') {
        acc.publicTests += draft.publicContent.publicTests.length;
        acc.secretTests += draft.secretJudge?.secretTests.length ?? 0;
      }
      return acc;
    },
    { byType: {}, byNotebook: {}, points: 0, publicTests: 0, secretTests: 0 },
  );
}

function validateDrafts(drafts) {
  if (drafts.length !== 34) throw new Error(`Expected 34 non-bonus drafts, found ${drafts.length}`);
  const ids = new Set();
  for (const draft of drafts) {
    if (/^(?:MCQ|Q)\s*\d+/i.test(draft.title)) {
      throw new Error(`Title contains a question number: ${draft.title}`);
    }
    if (ids.has(draft.sourceMeta.sourceQuestionId)) {
      throw new Error(`Duplicate source question id: ${draft.sourceMeta.sourceQuestionId}`);
    }
    ids.add(draft.sourceMeta.sourceQuestionId);
    if (!draft.notebookId) throw new Error(`${draft.title} is missing notebookId`);
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

async function refreshSummaryFields(prisma, courseId) {
  const notebooks = await prisma.notebook.findMany({
    where: { courseId },
    select: { id: true },
  });

  await Promise.all(
    notebooks.map(async (notebook) => {
      const [problemCount, publishedProblemCount] = await Promise.all([
        prisma.notebookProblem.count({ where: { notebookId: notebook.id } }),
        prisma.notebookProblem.count({ where: { notebookId: notebook.id, status: 'published' } }),
      ]);
      await prisma.notebook.update({
        where: { id: notebook.id },
        data: { problemCount, publishedProblemCount },
      });
    }),
  );

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

async function existingSourceProblems(prisma, courseId) {
  return prisma.notebookProblem.findMany({
    where: {
      OR: [{ courseId }, { notebook: { courseId } }],
      sourceMeta: {
        path: ['sourceFileName'],
        equals: SOURCE_FILE_NAME,
      },
    },
    select: { id: true, order: true, problemNumber: true },
    orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }],
  });
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const keepExisting = hasFlag('keep-existing');
  const courseId = argValue('course-id') || process.env.CSC108_COURSE_ID || DEFAULT_COURSE_ID;
  const markdownPath = argValue('markdown') || MARKDOWN_PATH;
  const markdown = fs.readFileSync(markdownPath, 'utf8');
  const drafts = buildDrafts(markdown);
  validateDrafts(drafts);

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

    const targetNotebookIds = Array.from(new Set(drafts.map((draft) => draft.notebookId)));
    const notebooks = await prisma.notebook.findMany({
      where: { id: { in: targetNotebookIds }, courseId },
      select: { id: true, name: true },
    });
    const notebookNames = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]));
    const missingNotebookIds = targetNotebookIds.filter((id) => !notebookNames.has(id));
    const existing = await existingSourceProblems(prisma, courseId);
    const draftsToInsert = keepExisting && existing.length > 0 ? [] : drafts;

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          course,
          markdownPath,
          sourceFileName: SOURCE_FILE_NAME,
          importVersion: IMPORT_VERSION,
          sourceQuestionCount: drafts.length,
          existingSourceProblemCount: existing.length,
          insertQuestionCount: draftsToInsert.length,
          replaceExisting: !keepExisting,
          missingNotebookIds,
          summary: summarizeDrafts(draftsToInsert),
          byNotebookName: Object.fromEntries(
            Object.entries(summarizeDrafts(draftsToInsert).byNotebook).map(([id, count]) => [
              notebookNames.get(id) ?? id,
              count,
            ]),
          ),
        },
        null,
        2,
      ),
    );

    if (!write || draftsToInsert.length === 0) return;
    if (missingNotebookIds.length > 0) {
      throw new Error(`Missing CSC108 notebooks: ${missingNotebookIds.join(', ')}`);
    }

    const allCourseNotebookIds = (
      await prisma.notebook.findMany({
        where: { ownerId: course.ownerId, courseId },
        select: { id: true },
      })
    ).map((notebook) => notebook.id);
    const scopeWhere =
      allCourseNotebookIds.length > 0
        ? { OR: [{ courseId }, { notebookId: { in: allCourseNotebookIds } }] }
        : { courseId };

    await prisma.$transaction(
      async (tx) => {
        const oldIds = existing.map((item) => item.id);
        const oldFirstProblemNumber =
          existing.length > 0
            ? Math.min(...existing.map((item) => item.problemNumber ?? Number.POSITIVE_INFINITY))
            : null;
        const oldFirstOrder =
          existing.length > 0
            ? Math.min(...existing.map((item) => item.order ?? Number.POSITIVE_INFINITY))
            : null;

        if (oldIds.length > 0) {
          await tx.notebookProblem.deleteMany({ where: { id: { in: oldIds } } });
        }

        const [count, maxNumber] = await Promise.all([
          tx.notebookProblem.count({ where: scopeWhere }),
          tx.notebookProblem.aggregate({ where: scopeWhere, _max: { problemNumber: true } }),
        ]);
        const firstProblemNumber =
          Number.isFinite(oldFirstProblemNumber) && oldFirstProblemNumber !== null
            ? oldFirstProblemNumber
            : (maxNumber._max.problemNumber ?? 0) + 1;
        const firstOrder =
          Number.isFinite(oldFirstOrder) && oldFirstOrder !== null ? oldFirstOrder : count;

        const importBatch = await tx.problemImportBatch.create({
          data: {
            ownerId: course.ownerId,
            courseId,
            targetType: 'course',
            source: 'pdf-markdown',
            status: 'previewed',
            sourceFileName: SOURCE_FILE_NAME,
            sourceFileMime: 'text/markdown',
            sourceTextHash: hashText(markdown),
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
              notebookId: draft.notebookId,
              title: draft.title,
              type: draft.type,
              status: draft.status,
              source: draft.source,
              order: firstOrder + index,
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

    await refreshSummaryFields(prisma, courseId);
    const imported = await prisma.notebookProblem.findMany({
      where: {
        OR: [{ courseId }, { notebook: { courseId } }],
        sourceMeta: {
          path: ['sourceFileName'],
          equals: SOURCE_FILE_NAME,
        },
      },
      select: {
        id: true,
        title: true,
        type: true,
        points: true,
        notebookId: true,
        sourceMeta: true,
      },
      orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }],
    });
    const after = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, problemCount: true, publishedProblemCount: true },
    });
    console.log(
      JSON.stringify(
        {
          importedCount: imported.length,
          importedSummary: summarizeDrafts(
            imported.map((problem) => ({
              type: problem.type,
              notebookId: problem.notebookId,
              points: problem.points,
              publicContent: { publicTests: [] },
              secretJudge: undefined,
            })),
          ),
          byNotebookName: imported.reduce((acc, problem) => {
            const key = notebookNames.get(problem.notebookId) ?? problem.notebookId ?? 'UNASSIGNED';
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
          courseAfter: after,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
