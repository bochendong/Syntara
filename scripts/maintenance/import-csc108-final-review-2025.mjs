#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const DEFAULT_SOURCE_PATH =
  '/Users/dongpochen/Desktop/2025 Fall/CSC 108/讲义/老师讲义/Final_Review/Final_Review.docx';
const SOURCE_FILE_NAME = 'Final_Review.docx';
const SOURCE_DOCUMENT = 'CSC108 Final Review Handout';

const NOTEBOOK = {
  inputOutput: 'queue-csc108-05-input-output',
  dict: 'queue-csc108-07-dictionary',
  csv: 'queue-csc108-08-csv',
  regex: 'queue-csc108-09-regex',
  runtime: 'queue-csc108-10-running-time',
  testing: 'queue-csc108-02-control',
  class: 'queue-csc108-11-class',
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

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashText(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function block(code, lang = 'python') {
  return `\`\`\`${lang}\n${String(code).trimEnd()}\n\`\`\``;
}

function textBlock(text) {
  return block(text, 'text');
}

function choiceDraft(number, notebookId, title, stem, options, correctOptionId, topic) {
  const optionEntries = Object.entries(options);
  return {
    draftId: `csc108-final-review-2025-${String(number).padStart(3, '0')}`,
    notebookId,
    title,
    type: 'choice',
    status: 'published',
    source: 'pdf',
    points: 1,
    tags: ['CSC108', 'final-review', 'fall-2025', 'choice'],
    difficulty: 'medium',
    publicContent: {
      type: 'choice',
      stem: String(stem).trim(),
      selectionMode: 'single',
      options: optionEntries.map(([id, label]) => ({ id, label })),
    },
    grading: {
      type: 'choice',
      correctOptionIds: [correctOptionId],
      analysis: `Converted from the ${topic} material in the Final Review handout.`,
    },
    sourceMeta: {
      sourceFileName: SOURCE_FILE_NAME,
      sourceDocument: SOURCE_DOCUMENT,
      sourceQuestionId: `FR-${String(number).padStart(3, '0')}`,
      sourceQuestionNumber: number,
      sourceQuestionLabel: `FR ${number}`,
      sourceCategory: 'final-review-choice',
      sourceTopic: topic,
      answerSource: 'codex-curated-from-docx',
      convertedFromFinalReview: true,
      convertedFillBlankToChoice: /_{3,}/.test(stem),
      assignedNotebookId: notebookId,
    },
  };
}

const mysteryClass = `class Mystery:
    def __init__(self, n, m) -> None:
        self.n = n
        self.m = m

    def __eq__(self, other):
        return self.n == other.n

    def __str__(self):
        return f"(str) Mystery with n = {self.n}, m = {self.m}"

    def some_function(self):
        return self.m + self.n`;

const graphSetup = `Graph = {
    4: [2, 1, 3, 2, 5],
    5: [1, 3, 7],
    8: [2, 5, 1, 4],
}`;

const dictListSetup = `data = {
    'a': [1, 2, 3],
    'b': [4, 5, 6],
    'e': [3, 2],
}`;

const passText = `pass.txt
3 7 56
7 4 83
4 3 17
4 7 12
8 6 29
1 9 73
6 8 89
9 3 52
4 9 63
3 3 55
1 6 20
8 7 21`;

const wordText = `word.txt
0: c,k,C,f,w,s,I,u,t,m
1: m,d,E,r,x,u,M,a,r,c
2: r,f,I,j,b,H,q,A,f,m
3: u,M,r,A,h,q,p,H,i,f
4: t,i,m,k,w,S,u,F,u,j
5: s,c,p,s,u,E,t,j,h,b
6: g,h,g,h,r,H,s,o,w,g
7: o,a,e,a,s,I,c,i,r,p
8: j,e,i,y,g,R,C,S,e,n
9: l,l,d,R,u,t,w,a,E,z`;

const decryptCode = `def decrypt() -> str:
    H, text, key, password = {}, [], [], ""
    with open("pass.txt", "r") as fileOne:
        for line in fileOne:
            key.append(line.split())
            spice = 0
            taste = int(key[-1].pop()) % 3
            while spice < taste:
                fileOne.readline()
                spice += 1

    with open("word.txt", "r") as fileTwo:
        for line in fileTwo:
            line = line.strip().split(',')
            text.append(line)
            for index in range(len(line)):
                if line[index].isupper():
                    if len(H) % 2 == 0:
                        H[line[index]] = line[index - 1]
                    else:
                        H[line[index]] = line[index + 1]

    for k in key:
        password += H[text[int(k[0])][int(k[1])]]
    return password`;

const drafts = [
  choiceDraft(
    1,
    NOTEBOOK.dict,
    'Final Review: List Equality vs Dictionary Equality',
    `What is printed by this code?\n\n${block(`lst1 = [1, 2]
lst2 = [2, 1]
print(lst1 == lst2)

d1 = {'a': 1, 'b': 2}
d2 = {'b': 2, 'a': 1}
print(d1 == d2)`)}`,
    {
      A: 'False, then True',
      B: 'True, then False',
      C: 'True, then True',
      D: 'False, then False',
    },
    'A',
    'dictionary equality',
  ),
  choiceDraft(
    2,
    NOTEBOOK.dict,
    'Final Review: Duplicate Dictionary Key',
    `What is printed by this code?\n\n${block(`my_dict = {'a': 1, 'b': 2, 'a': 3}
print(my_dict)`)}`,
    {
      A: "{'a': 1, 'b': 2}",
      B: "{'a': 3, 'b': 2}",
      C: "{'a': [1, 3], 'b': 2}",
      D: 'Error',
    },
    'B',
    'dictionary duplicate keys',
  ),
  choiceDraft(
    3,
    NOTEBOOK.dict,
    'Final Review: Dictionary Lookup',
    `Assume this code has run:\n\n${block("d = {'a': 5, 'b': 3, 'e': 8}")}\n\nWhat is the value of \`d['b']\`?`,
    { A: '5', B: '3', C: '8', D: 'Error' },
    'B',
    'dictionary lookup',
  ),
  choiceDraft(
    4,
    NOTEBOOK.dict,
    'Final Review: Dictionary Addition',
    `Assume this code has run:\n\n${block("d = {'a': 5, 'b': 3, 'e': 8}")}\n\nWhat happens when evaluating \`d + {'f': 2}\`?`,
    {
      A: "It returns {'a': 5, 'b': 3, 'e': 8, 'f': 2}.",
      B: "It mutates d to include key 'f'.",
      C: 'It raises an error.',
      D: "It returns {'f': 2}.",
    },
    'C',
    'dictionary operations',
  ),
  choiceDraft(
    5,
    NOTEBOOK.dict,
    'Final Review: Missing Dictionary Key',
    `Assume this code has run:\n\n${block("d = {'a': 5, 'b': 3, 'e': 8}")}\n\nWhat happens when evaluating \`d[5]\`?`,
    {
      A: 'It returns 5.',
      B: 'It returns False.',
      C: 'It raises a KeyError.',
      D: 'It returns None.',
    },
    'C',
    'dictionary key errors',
  ),
  choiceDraft(
    6,
    NOTEBOOK.dict,
    'Final Review: Membership in a Dictionary',
    `Assume this code has run:\n\n${block("d = {'a': 5, 'b': 3, 'e': 8}")}\n\nWhat is the value of \`5 in d\`?`,
    { A: 'True', B: 'False', C: '5', D: 'Error' },
    'B',
    'dictionary membership',
  ),
  choiceDraft(
    7,
    NOTEBOOK.dict,
    'Final Review: pop Return Value',
    `Assume this code has run:\n\n${block("d = {'a': 5, 'b': 3, 'e': 8}")}\n\nWhat does \`d.pop('b')\` return?`,
    { A: "'b'", B: '3', C: "{'a': 5, 'e': 8}", D: 'None' },
    'B',
    'dictionary pop',
  ),
  choiceDraft(
    8,
    NOTEBOOK.dict,
    'Final Review: Dictionary of Lists Lookup',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat is the value of \`Graph[5]\`?`,
    {
      A: '[1, 3, 7]',
      B: '[2, 5, 1, 4]',
      C: '5',
      D: 'Error',
    },
    'A',
    'dictionary values as lists',
  ),
  choiceDraft(
    9,
    NOTEBOOK.dict,
    'Final Review: List Membership in Dictionary Value',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat is the value of \`[1, 3] in Graph[5]\`?`,
    { A: 'True', B: 'False', C: '[1, 3]', D: 'Error' },
    'B',
    'list membership',
  ),
  choiceDraft(
    10,
    NOTEBOOK.dict,
    'Final Review: Whole List Membership Check',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat is the value of \`[1, 3, 7] in Graph[5]\`?`,
    { A: 'True', B: 'False', C: '[1, 3, 7]', D: 'Error' },
    'B',
    'list membership',
  ),
  choiceDraft(
    11,
    NOTEBOOK.dict,
    'Final Review: append Return Value in Dictionary Value',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat does \`Graph[8].append(6)\` return?`,
    { A: '[2, 5, 1, 4, 6]', B: '6', C: 'None', D: 'Error' },
    'C',
    'list method return values',
  ),
  choiceDraft(
    12,
    NOTEBOOK.dict,
    'Final Review: Slice of a Dictionary Value',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat is the value of \`Graph[4][0:1]\`?`,
    { A: '2', B: '[2]', C: '[2, 1]', D: 'Error' },
    'B',
    'list slicing',
  ),
  choiceDraft(
    13,
    NOTEBOOK.dict,
    'Final Review: List as Dictionary Key',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat happens when running \`Graph[[1, 2]] = 6\`?`,
    {
      A: 'It creates a new key successfully.',
      B: 'It changes Graph[1] and Graph[2].',
      C: 'It raises an error because lists are unhashable.',
      D: 'It appends 6 to Graph[1].',
    },
    'C',
    'dictionary key types',
  ),
  choiceDraft(
    14,
    NOTEBOOK.dict,
    'Final Review: sort Return Value in Dictionary Value',
    `Assume this code has run:\n\n${block(graphSetup)}\n\nWhat does \`Graph[8].sort()\` return?`,
    { A: '[1, 2, 4, 5]', B: '[2, 5, 1, 4]', C: 'None', D: 'Error' },
    'C',
    'list method return values',
  ),
  choiceDraft(
    15,
    NOTEBOOK.dict,
    'Final Review: Iterating Over Dictionary Keys',
    `Assume this code has run:\n\n${block(dictListSetup)}\n\nWhat is printed by this code?\n\n${block(`for x in data:
    print(type(x))`)}`,
    {
      A: "<class 'str'> printed three times",
      B: "<class 'list'> printed three times",
      C: "<class 'dict'> printed once",
      D: 'Error',
    },
    'A',
    'dictionary iteration',
  ),
  choiceDraft(
    16,
    NOTEBOOK.dict,
    'Final Review: Iterating Over Dictionary Values',
    `Assume this code has run:\n\n${block(dictListSetup)}\n\nWhich statement best describes the two loops below?\n\n${block(`for x in data:
    print(data[x])

for x in data.values():
    print(x)`)}`,
    {
      A: 'Both loops print the three list values.',
      B: 'The first loop prints keys and the second loop prints values.',
      C: 'The first loop raises an error.',
      D: 'The second loop prints the keys.',
    },
    'A',
    'dictionary values iteration',
  ),
  choiceDraft(
    17,
    NOTEBOOK.dict,
    'Final Review: Dictionary Length',
    `Assume this code has run:\n\n${block(dictListSetup)}\n\nWhat is printed by \`print(len(data))\`?`,
    { A: '2', B: '3', C: '8', D: 'Error' },
    'B',
    'dictionary length',
  ),
  choiceDraft(
    18,
    NOTEBOOK.class,
    'Final Review: Reading Object Attributes',
    `Given this class:\n\n${block(mysteryClass)}\n\nWhat is printed?\n\n${block(`item = Mystery(1, 2)
print(item.n)
print(item.m)`)}`,
    {
      A: '1, then 2',
      B: '2, then 1',
      C: 'Mystery(1, 2)',
      D: 'Error',
    },
    'A',
    'class attributes',
  ),
  choiceDraft(
    19,
    NOTEBOOK.class,
    'Final Review: __eq__ Method',
    `Given this class:\n\n${block(mysteryClass)}\n\nWhat is printed?\n\n${block(`m1 = Mystery(3, 2)
m2 = Mystery(3, 1)
print(m1 == m2)`)}`,
    { A: 'True', B: 'False', C: 'None', D: 'Error' },
    'A',
    'class equality method',
  ),
  choiceDraft(
    20,
    NOTEBOOK.class,
    'Final Review: __str__ Method',
    `Given this class:\n\n${block(mysteryClass)}\n\nWhat is printed?\n\n${block(`m1 = Mystery(3, 2)
m1.n = 10
m1.m = 100
print(m1)`)}`,
    {
      A: '(str) Mystery with n = 10, m = 100',
      B: '(repr) Mystery with n = 10, m = 100',
      C: 'Mystery(10, 100)',
      D: 'Error',
    },
    'A',
    'class string representation',
  ),
  choiceDraft(
    21,
    NOTEBOOK.class,
    'Final Review: Calling a Method',
    `Given this class:\n\n${block(mysteryClass)}\n\nWhat is printed?\n\n${block(`m1 = Mystery(2, 4)
print(m1.some_function())`)}`,
    { A: '2', B: '4', C: '6', D: 'Error' },
    'C',
    'class method calls',
  ),
  choiceDraft(
    22,
    NOTEBOOK.csv,
    'Final Review: csv.reader Output',
    `Assume \`students.csv\` contains:\n\n${textBlock(`Name,Subject,Score
Alice,Math,90
Bob,English,85
Charlie,Science,92`)}\n\nWhat is printed by this code?\n\n${block(`import csv

with open("students.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        print(row)`)}`,
    {
      A: 'Each row is printed as a list of strings.',
      B: 'Each row is printed as one unchanged string.',
      C: 'Only the numeric scores are printed.',
      D: 'The code raises an error because scores are strings.',
    },
    'A',
    'csv.reader',
  ),
  choiceDraft(
    23,
    NOTEBOOK.csv,
    'Final Review: Manual CSV Splitting',
    `If you are not allowed to use the \`csv\` package, which code best reads a simple comma-separated file after skipping the header?`,
    {
      A: block(`with open("data.csv", "r") as csv_file:
    csv_file.readline()
    for line in csv_file:
        values = line.strip().split(",")
        print(values)`),
      B: block(`with open("data.csv", "r") as csv_file:
    for line in csv_file:
        values = line.strip().split()
        print(values[0])`),
      C: block(`with open("data.csv", "w") as csv_file:
    values = csv_file.readline().split(",")`),
      D: block(`with open("data.csv", "r") as csv_file:
    print(csv_file.write(","))`),
    },
    'A',
    'manual CSV parsing',
  ),
  choiceDraft(
    24,
    NOTEBOOK.csv,
    'Final Review: Writing CSV Rows',
    `Which statement best describes this code?\n\n${block(`import csv

data = [
    ["Name", "Subject", "Score"],
    ["Alice", "Math", 90],
    ["Bob", "English", 85],
]

with open("output.csv", "w") as f:
    writer = csv.writer(f)
    writer.writerows(data)`)}`,
    {
      A: 'It writes the rows to output.csv as comma-separated rows.',
      B: 'It prints the rows to the terminal.',
      C: 'It raises an error because 90 and 85 are integers.',
      D: 'It writes only the header row.',
    },
    'A',
    'csv.writer',
  ),
  choiceDraft(
    25,
    NOTEBOOK.runtime,
    'Final Review: for Loop Running Time',
    `Let \`L\` have length \`k\`, where \`k\` is large. How many times is \`"SU!"\` printed, and what is the growth?\n\n${block(`for item in L:
    print("SU!")`)}`,
    {
      A: 'k times; linear',
      B: '1 time; constant',
      C: 'k * k times; quadratic',
      D: '0 times; constant',
    },
    'A',
    'running time',
  ),
  choiceDraft(
    26,
    NOTEBOOK.runtime,
    'Final Review: Constant-Size Slice Loop',
    `Let \`L\` have length \`k\`, where \`k\` is much larger than 400. How many times is \`"SU!"\` printed, and what is the growth?\n\n${block(`for item in L[20:400]:
    print("SU!")`)}`,
    {
      A: 'k times; linear',
      B: '380 times; constant',
      C: '400 times; linear',
      D: 'k - 20 times; linear',
    },
    'B',
    'running time',
  ),
  choiceDraft(
    27,
    NOTEBOOK.runtime,
    'Final Review: Long Slice Loop',
    `Let \`L\` have length \`k\`, where \`k\` is large. How many times is \`"SU!"\` printed, and what is the growth?\n\n${block(`for item in L[10:]:
    print("SU!")`)}`,
    {
      A: '10 times; constant',
      B: 'k - 10 times; linear',
      C: 'k + 10 times; linear',
      D: 'k * k times; quadratic',
    },
    'B',
    'running time',
  ),
  choiceDraft(
    28,
    NOTEBOOK.runtime,
    'Final Review: Nested Slice Loop',
    `Let \`L\` have length \`k\`, where \`k\` is large. How many times is \`"SU!"\` printed, and what is the growth?\n\n${block(`i = 0
while i < len(L):
    for item in L[i:]:
        print("SU!")
    i = i + 1`)}`,
    {
      A: 'k times; linear',
      B: 'k(k + 1) / 2 times; quadratic',
      C: 'log k times; logarithmic',
      D: '0 times; constant',
    },
    'B',
    'running time',
  ),
  choiceDraft(
    29,
    NOTEBOOK.runtime,
    'Final Review: Loop Condition That Starts False',
    `Let \`L\` have positive length. How many times is \`"SU!"\` printed, and what is the growth?\n\n${block(`i = 0
while not (i < len(L)):
    for item in L:
        print("SU!")
    i = i + 1`)}`,
    {
      A: '0 times; constant',
      B: 'k times; linear',
      C: 'k * k times; quadratic',
      D: 'It always prints forever.',
    },
    'A',
    'running time',
  ),
  choiceDraft(
    30,
    NOTEBOOK.runtime,
    'Final Review: Multiplying a Zero Loop Counter',
    `Let \`L\` have positive length. What is the behaviour of this code?\n\n${block(`i = 0
while i < len(L):
    print("SU!")
    i = i * 2`)}`,
    {
      A: 'It prints once.',
      B: 'It prints log(k) times.',
      C: 'It never terminates because i stays 0.',
      D: 'It prints k times.',
    },
    'C',
    'running time',
  ),
  choiceDraft(
    31,
    NOTEBOOK.runtime,
    'Final Review: Nested Linear Work',
    `Assume \`do_something(L)\` has linear runtime in the length of \`L\`. What is the growth of this code?\n\n${block(`for i in range(len(L) // 2):
    for j in range(100):
        for k in range(len(L) // 3):
            do_something(L)`)}`,
    { A: 'O(1)', B: 'O(n)', C: 'O(n^2)', D: 'O(n^3)' },
    'D',
    'running time',
  ),
  choiceDraft(
    32,
    NOTEBOOK.runtime,
    'Final Review: Constant-Size Slice Work',
    `Assume \`do_something(L)\` has linear runtime in the length of \`L\`. What is the growth of this code?\n\n${block(`if len(L) == 1:
    do_something(L)
else:
    do_something(L[0:5])`)}`,
    { A: 'O(1)', B: 'O(log n)', C: 'O(n)', D: 'O(n^2)' },
    'A',
    'running time',
  ),
  choiceDraft(
    33,
    NOTEBOOK.runtime,
    'Final Review: Linear Work Inside k Iterations',
    `Assume \`do_something(L)\` has linear runtime in the length of \`L\`. What is the growth of this code?\n\n${block(`i = 0
k = len(L)
while i < k ** 2:
    do_something(L)
    do_something(L)
    do_something(L)
    i += k`)}`,
    { A: 'O(1)', B: 'O(n)', C: 'O(n^2)', D: 'O(n^3)' },
    'C',
    'running time',
  ),
  choiceDraft(
    34,
    NOTEBOOK.runtime,
    'Final Review: Early Return Running Time',
    `What is the growth of this code?\n\n${block(`for i in range(len(L)):
    if i == 5:
        return 10`)}`,
    { A: 'O(1)', B: 'O(log n)', C: 'O(n)', D: 'O(n^2)' },
    'A',
    'running time',
  ),
  choiceDraft(
    35,
    NOTEBOOK.runtime,
    'Final Review: Worst Case for a String Search',
    `Consider this function:\n\n${block(`def mystery(s: str, word: str) -> bool:
    word_len = len(word)
    for i in range(len(s) - word_len):
        if s[i : i + word_len] == word:
            return False
    return True`)}\n\nWhich call demonstrates the worst-case running time behaviour?`,
    {
      A: "mystery('enokitake', 'kit')",
      B: "mystery('skittered', 'kit')",
      C: "mystery('kittenish', 'kit')",
      D: "mystery('tightknit', 'kit')",
      E: "mystery('brookites', 'kit')",
    },
    'D',
    'running time',
  ),
  choiceDraft(
    36,
    NOTEBOOK.runtime,
    'Final Review: Best Case for a String Search',
    `Consider this function:\n\n${block(`def mystery(s: str, word: str) -> bool:
    word_len = len(word)
    for i in range(len(s) - word_len):
        if s[i : i + word_len] == word:
            return False
    return True`)}\n\nWhich call demonstrates the best-case running time behaviour?`,
    {
      A: "mystery('enokitake', 'kit')",
      B: "mystery('skittered', 'kit')",
      C: "mystery('kittenish', 'kit')",
      D: "mystery('tightknit', 'kit')",
      E: "mystery('brookites', 'kit')",
    },
    'C',
    'running time',
  ),
  choiceDraft(
    37,
    NOTEBOOK.testing,
    'Final Review: TextIO Type Annotation',
    `Which annotation should fill the blank?\n\n${block(`from typing import TextIO

def write_message(file: _____________, message: str) -> None:
    file.write(message + "\\n")`)}`,
    { A: 'str', B: 'TextIO', C: 'list[str]', D: 'dict[str, str]' },
    'B',
    'type annotations',
  ),
  choiceDraft(
    38,
    NOTEBOOK.testing,
    'Final Review: Matrix Type Annotation',
    `Which annotations best fill the blanks for a function that returns a rotated matrix?\n\n${block(`def rotate_matrix(matrix: _______________) -> _________________:
    ...`)}`,
    {
      A: 'matrix: int -> int',
      B: 'matrix: list[int] -> int',
      C: 'matrix: list[list[int]] -> list[list[int]]',
      D: 'matrix: TextIO -> TextIO',
    },
    'C',
    'type annotations',
  ),
  choiceDraft(
    39,
    NOTEBOOK.testing,
    'Final Review: Dictionary Type Annotation',
    `A "person to friends" dictionary maps a person's name to a list of that person's friends. Which annotation should fill the blank?\n\n${block(`def complete_person_to_friends(p2f: ______________________) -> None:
    ...`)}`,
    {
      A: 'dict[str, list[str]]',
      B: 'dict[list[str], str]',
      C: 'list[dict[str, str]]',
      D: 'TextIO',
    },
    'A',
    'type annotations',
  ),
  choiceDraft(
    40,
    NOTEBOOK.testing,
    'Final Review: Test That Reveals an Early Return Bug',
    `The function below incorrectly returns as soon as it sees a non-positive item.\n\n${block(`def filter_positive(L: list[int]) -> list[int]:
    acc = []
    for item in L:
        if item <= 0:
            return acc
        else:
            acc.append(item)
    return acc`)}\n\nWhich test reveals the bug?`,
    {
      A: 'assert filter_positive([1, 2]) == [1, 2]',
      B: 'assert filter_positive([-1, 2]) == [2]',
      C: 'assert filter_positive([]) == []',
      D: 'assert filter_positive([3]) == [3]',
    },
    'B',
    'testing',
  ),
  choiceDraft(
    41,
    NOTEBOOK.testing,
    'Final Review: Test Coverage for get_first_even',
    `Which set of tests best covers the main behaviours of this function?\n\n${block(`def get_first_even(items: list[int]) -> int:
    """Return the first even number from items, or -1 if no even number exists."""
    ...`)}`,
    {
      A: 'Only test [2], [4], and [6].',
      B: 'Test [], [1, 3, 5], [2, 3], [1, 4], and [0, 1].',
      C: 'Only test [1, 3, 5].',
      D: 'Only test very long lists.',
    },
    'B',
    'testing',
  ),
  choiceDraft(
    42,
    NOTEBOOK.testing,
    'Final Review: Test That Fails on Last-Even Bug',
    `This buggy implementation returns the last even number, not the first even number.\n\n${block(`def get_first_even(items: list[int]) -> int:
    even_number = -1
    for item in items:
        if item % 2 == 0:
            even_number = item
    return even_number`)}\n\nWhich test case should fail on the buggy implementation but pass on a correct implementation?`,
    {
      A: 'assert get_first_even([1, 3, 5]) == -1',
      B: 'assert get_first_even([1, 2, 4]) == 2',
      C: 'assert get_first_even([1, 3, 4]) == 4',
      D: 'assert get_first_even([]) == -1',
    },
    'B',
    'testing',
  ),
  choiceDraft(
    43,
    NOTEBOOK.testing,
    'Final Review: mask_string Precondition',
    `Which precondition is needed so this function can safely index \`mask[i]\` for every character in \`s\`?\n\n${block(`def mask_string(s: str, mask: list[bool], ch: str) -> str:
    masked_string = ""
    for i in range(len(s)):
        if mask[i]:
            masked_string = masked_string + ch
        else:
            masked_string = masked_string + s[i]
    return masked_string`)}`,
    {
      A: 'len(mask) == len(s)',
      B: 'len(mask) == len(ch)',
      C: 's is empty',
      D: 'mask contains only False',
    },
    'A',
    'testing',
  ),
  choiceDraft(
    44,
    NOTEBOOK.runtime,
    'Final Review: Identify the Sorting Algorithm',
    `A list is shown after each pass:\n\n${textBlock(`[10, 3, 1, 5, 6, 8, 2]  # Initial
[3, 10, 1, 5, 6, 8, 2]  # After one pass
[1, 3, 10, 5, 6, 8, 2]  # After two passes
[1, 3, 5, 10, 6, 8, 2]  # After three passes
[1, 3, 5, 6, 10, 8, 2]  # After four passes
[1, 3, 5, 6, 8, 10, 2]  # After five passes`)}\n\nWhich sorting algorithm is being executed?`,
    {
      A: 'Insertion sort',
      B: 'Selection sort',
      C: 'Bubble sort',
      D: 'Binary search',
    },
    'A',
    'sorting',
  ),
  choiceDraft(
    45,
    NOTEBOOK.runtime,
    'Final Review: Selection Sort Passes',
    `A list is being sorted alphabetically using selection sort.\n\n${textBlock(`Initial: ['B', 'M', 'E', 'A', 'C', 'D']
After one pass: ['A', 'M', 'E', 'B', 'C', 'D']
After two passes: ['A', 'B', 'E', 'M', 'C', 'D']`)}\n\nWhat are the next two passes?`,
    {
      A: "After three: ['A', 'B', 'C', 'M', 'E', 'D']; after four: ['A', 'B', 'C', 'D', 'E', 'M']",
      B: "After three: ['A', 'B', 'E', 'C', 'M', 'D']; after four: ['A', 'B', 'C', 'E', 'M', 'D']",
      C: "After three: ['A', 'B', 'M', 'E', 'C', 'D']; after four: ['A', 'B', 'C', 'D', 'E', 'M']",
      D: "After three: ['A', 'B', 'E', 'M', 'C', 'D']; after four: ['A', 'B', 'E', 'M', 'C', 'D']",
    },
    'A',
    'sorting',
  ),
  choiceDraft(
    46,
    NOTEBOOK.runtime,
    'Final Review: Fast Sort for Nearly Sorted List',
    `Consider the list \`['A', 'B', 'C', 'D', 'E']\`. Which simple sorting algorithm would you expect to be fastest on this already sorted list?`,
    {
      A: 'Insertion sort',
      B: 'Selection sort',
      C: 'Bubble sort must always be fastest',
      D: 'All algorithms must take exactly the same number of steps',
    },
    'A',
    'sorting',
  ),
  choiceDraft(
    47,
    NOTEBOOK.runtime,
    'Final Review: Bubble Sort Early Stop',
    `After how many full passes of bubble sort on \`[3, 1, 6, 4, 9, 8]\` could we stop because the list has become sorted?`,
    { A: '1', B: '2', C: '5', D: 'It is already sorted before any pass' },
    'A',
    'sorting',
  ),
  choiceDraft(
    48,
    NOTEBOOK.runtime,
    'Final Review: Insertion Sort Pass Count',
    `After how many insertion-sort passes on \`[9, 8, 3, 1, 6, 4]\` is the list sorted?`,
    { A: '1', B: '3', C: '5', D: '6' },
    'C',
    'sorting',
  ),
  choiceDraft(
    49,
    NOTEBOOK.regex,
    'Final Review: Regex Digit Runs',
    `What is returned by this expression?\n\n${block(`re.findall(r"\\d+", "My phone is 123-456-7890 and my ID is 999888.")`)}`,
    {
      A: "['123', '456', '7890', '999888']",
      B: "['123-456-7890', '999888']",
      C: "['1', '2', '3']",
      D: '[]',
    },
    'A',
    'regex',
  ),
  choiceDraft(
    50,
    NOTEBOOK.regex,
    'Final Review: Regex Negated Character Class',
    `What is returned by this expression?\n\n${block(`re.findall(r"[^aeiou]", "hello")`)}`,
    { A: "['h', 'l', 'l']", B: "['e', 'o']", C: "['hello']", D: '[]' },
    'A',
    'regex',
  ),
  choiceDraft(
    51,
    NOTEBOOK.regex,
    'Final Review: Regex Groups',
    `What is returned by this expression?\n\n${block(`re.findall(r"(\\d{4})-(\\d{2})-(\\d{2})", "2025-11-12 and 1997-12-18")`)}`,
    {
      A: "[('2025', '11', '12'), ('1997', '12', '18')]",
      B: "['2025-11-12', '1997-12-18']",
      C: "[('11', '12'), ('12', '18')]",
      D: '[]',
    },
    'A',
    'regex',
  ),
  choiceDraft(
    52,
    NOTEBOOK.regex,
    'Final Review: re.match vs re.search',
    `Which statement is true for this code?\n\n${block(`re.match(r"Hello", "He said Hello world")
re.search(r"Hello", "He said Hello world")`)}`,
    {
      A: 'Both calls find Hello.',
      B: 'match returns None, while search finds Hello.',
      C: 'match finds Hello, while search returns None.',
      D: 'Both calls return None.',
    },
    'B',
    'regex',
  ),
  choiceDraft(
    53,
    NOTEBOOK.csv,
    'Final Review: Tracing File-Based Decryption Key Length',
    `Trace this function using the given files.\n\n${block(decryptCode)}\n\n${textBlock(`${passText}

${wordText}`)}\n\nAfter the first \`with open("pass.txt", "r")\` block finishes, what is \`len(key)\`?`,
    { A: '4', B: '6', C: '9', D: '12' },
    'B',
    'file tracing',
  ),
  choiceDraft(
    54,
    NOTEBOOK.csv,
    'Final Review: Tracing File-Based Decryption Dictionary Length',
    `Trace this function using the given files.\n\n${block(decryptCode)}\n\n${textBlock(`${passText}

${wordText}`)}\n\nAfter the second \`with open("word.txt", "r")\` block finishes, what is \`len(H)\`?`,
    { A: '6', B: '8', C: '9', D: '12' },
    'C',
    'file tracing',
  ),
  choiceDraft(
    55,
    NOTEBOOK.csv,
    'Final Review: Tracing File-Based Decryption Password',
    `Trace this function using the given files.\n\n${block(decryptCode)}\n\n${textBlock(`${passText}

${wordText}`)}\n\nWhat does \`decrypt()\` return?`,
    { A: "'ruSure'", B: "'SpeedUp'", C: "'rUseHr'", D: "'Sure'" },
    'A',
    'file tracing',
  ),
  choiceDraft(
    56,
    NOTEBOOK.csv,
    'Final Review: Writing pass.txt and word.txt',
    `Which set of replacements best completes this skeleton so it writes \`pass.txt\` and \`word.txt\`?\n\n${block(`def writeFiles(dataForPass: list[list[int]], dataForWord: list[str]) -> None:
    for line in dataForPass:
        toBeWritten = []
        for item in line:
            toBeWritten += [__________________, " "]
        toBeWritten.append("\\n")

        with open(_________________________) as filePass:
            filePass._______________________
        with open(_________________________) as fileWord:
            for line in dataForWord:
                fileWord._______________________`)}`,
    {
      A: 'str(item); "pass.txt", "a"; writelines(toBeWritten); "word.txt", "w"; write(line + "\\n")',
      B: 'item; "pass.txt", "r"; read(toBeWritten); "word.txt", "r"; readline(line)',
      C: 'int(item); "pass.txt", "w"; readlines(toBeWritten); "word.txt", "a"; pop(line)',
      D: 'str(item); "word.txt", "a"; writelines(toBeWritten); "pass.txt", "w"; write(line)',
    },
    'A',
    'file writing',
  ),
];

function draftFingerprint(draft) {
  return hashText(
    normalizeText(
      [
        draft.type,
        draft.title,
        draft.publicContent.stem,
        ...(draft.publicContent.options ?? []).map((option) => option.label),
      ].join('\n'),
    ),
  );
}

function rowFingerprint(row) {
  const publicContent =
    row.publicContentJson && typeof row.publicContentJson === 'object' ? row.publicContentJson : {};
  const options = Array.isArray(publicContent.options)
    ? publicContent.options.map((option) => option.label)
    : [];
  return hashText(normalizeText([row.type, row.title, publicContent.stem, ...options].join('\n')));
}

function validateDrafts() {
  const ids = new Set();
  for (const draft of drafts) {
    if (draft.type === 'fill_blank') {
      throw new Error(`${draft.title} is fill_blank; Final Review imports must use choice.`);
    }
    if (draft.type !== 'choice') {
      throw new Error(`${draft.title} is ${draft.type}; expected choice.`);
    }
    if (ids.has(draft.sourceMeta.sourceQuestionId)) {
      throw new Error(`Duplicate source question id: ${draft.sourceMeta.sourceQuestionId}`);
    }
    ids.add(draft.sourceMeta.sourceQuestionId);
    if (!draft.notebookId) throw new Error(`${draft.title} missing notebookId`);
    const optionIds = new Set(draft.publicContent.options.map((option) => option.id));
    for (const correctId of draft.grading.correctOptionIds) {
      if (!optionIds.has(correctId)) {
        throw new Error(`${draft.title} correct option ${correctId} is not in options`);
      }
    }
  }
}

async function refreshSummaryFields(tx, courseId) {
  const notebooks = await tx.notebook.findMany({
    where: { courseId },
    select: { id: true },
  });
  await Promise.all(
    notebooks.map(async (notebook) => {
      const [problemCount, publishedProblemCount] = await Promise.all([
        tx.notebookProblem.count({ where: { notebookId: notebook.id } }),
        tx.notebookProblem.count({ where: { notebookId: notebook.id, status: 'published' } }),
      ]);
      await tx.notebook.update({
        where: { id: notebook.id },
        data: { problemCount, publishedProblemCount },
      });
    }),
  );

  const notebookAggregate = await tx.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    tx.notebookProblem.count({ where: { OR: [{ courseId }, { notebook: { courseId } }] } }),
    tx.notebookProblem.count({
      where: { status: 'published', OR: [{ courseId }, { notebook: { courseId } }] },
    }),
  ]);
  await tx.course.update({
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

async function main() {
  loadEnvLocal();
  validateDrafts();

  const write = hasFlag('write');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const sourcePath = argValue('source') || DEFAULT_SOURCE_PATH;
  const sourceBuffer = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath) : Buffer.from('');
  const sourceHash = sourceBuffer.length > 0 ? hashBuffer(sourceBuffer) : null;

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

    const assignedNotebookIds = Array.from(new Set(drafts.map((draft) => draft.notebookId)));
    const existingAssignedNotebookIds = new Set(
      (
        await prisma.notebook.findMany({
          where: { id: { in: assignedNotebookIds }, courseId },
          select: { id: true },
        })
      ).map((notebook) => notebook.id),
    );
    const missingAssignedNotebookIds = assignedNotebookIds.filter(
      (notebookId) => !existingAssignedNotebookIds.has(notebookId),
    );

    const existingRows = await prisma.notebookProblem.findMany({
      where: { OR: [{ courseId }, { notebook: { courseId } }] },
      select: { type: true, title: true, publicContentJson: true, sourceMeta: true },
    });
    const existingSourceIds = new Set();
    const existingFingerprints = new Set();
    for (const row of existingRows) {
      const sourceMeta = row.sourceMeta && typeof row.sourceMeta === 'object' ? row.sourceMeta : {};
      if (sourceMeta.sourceFileName === SOURCE_FILE_NAME) {
        existingSourceIds.add(String(sourceMeta.sourceQuestionId));
      }
      existingFingerprints.add(rowFingerprint(row));
      if (typeof sourceMeta.finalReviewDedupeFingerprint === 'string') {
        existingFingerprints.add(sourceMeta.finalReviewDedupeFingerprint);
      }
    }

    const duplicateSourceDrafts = [];
    const duplicateFingerprintDrafts = [];
    const draftsToInsert = [];
    for (const draft of drafts) {
      const fingerprint = draftFingerprint(draft);
      draft.sourceMeta.finalReviewDedupeFingerprint = fingerprint;
      if (existingSourceIds.has(String(draft.sourceMeta.sourceQuestionId))) {
        duplicateSourceDrafts.push(draft);
        continue;
      }
      if (existingFingerprints.has(fingerprint)) {
        duplicateFingerprintDrafts.push(draft);
        continue;
      }
      draftsToInsert.push(draft);
      existingFingerprints.add(fingerprint);
    }

    const summary = draftsToInsert.reduce(
      (acc, draft) => {
        acc.byNotebook[draft.notebookId] = (acc.byNotebook[draft.notebookId] ?? 0) + 1;
        acc.byTopic[draft.sourceMeta.sourceTopic] =
          (acc.byTopic[draft.sourceMeta.sourceTopic] ?? 0) + 1;
        return acc;
      },
      { byNotebook: {}, byTopic: {} },
    );

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          course,
          sourcePath,
          sourceFileName: SOURCE_FILE_NAME,
          sourceQuestionCount: drafts.length,
          duplicateSourceQuestionCount: duplicateSourceDrafts.length,
          duplicateFingerprintCount: duplicateFingerprintDrafts.length,
          insertQuestionCount: draftsToInsert.length,
          missingAssignedNotebookIds,
          summary,
        },
        null,
        2,
      ),
    );

    if (!write || draftsToInsert.length === 0) return;
    if (missingAssignedNotebookIds.length > 0) {
      throw new Error(`Missing CSC108 notebooks: ${missingAssignedNotebookIds.join(', ')}`);
    }

    await prisma.$transaction(
      async (tx) => {
        const notebookIds = (
          await tx.notebook.findMany({ where: { courseId }, select: { id: true } })
        ).map((notebook) => notebook.id);
        const scopeWhere =
          notebookIds.length > 0
            ? { OR: [{ courseId }, { notebookId: { in: notebookIds } }] }
            : { courseId };
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
            sourceFileMime:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sourceTextHash: sourceHash,
            draftCount: draftsToInsert.length,
            draftSnapshotJson: draftsToInsert,
            warnings: duplicateFingerprintDrafts.map(
              (draft) => `Skipped likely duplicate: ${draft.title}`,
            ),
          },
          select: { id: true },
        });

        for (let index = 0; index < draftsToInsert.length; index += 1) {
          const draft = draftsToInsert[index];
          await tx.notebookProblem.create({
            data: {
              courseId,
              notebookId: draft.notebookId,
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
                sourceTextHash: sourceHash,
              },
            },
          });
        }

        await tx.problemImportBatch.update({
          where: { id: importBatch.id },
          data: {
            status: 'committed',
            committedCount: draftsToInsert.length,
          },
        });

        await refreshSummaryFields(tx, courseId);
      },
      { timeout: 60_000 },
    );

    const finalReviewCount = await prisma.notebookProblem.count({
      where: {
        OR: [{ courseId }, { notebook: { courseId } }],
        sourceMeta: { path: ['sourceFileName'], equals: SOURCE_FILE_NAME },
      },
    });
    const courseAfter = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, problemCount: true, publishedProblemCount: true },
    });
    console.log(
      JSON.stringify(
        {
          insertedQuestionCount: draftsToInsert.length,
          finalReviewCount,
          courseAfter,
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
  process.exit(1);
});
