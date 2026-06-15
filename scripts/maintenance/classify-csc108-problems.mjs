#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';

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

function meta(problem) {
  return problem.sourceMeta && typeof problem.sourceMeta === 'object' ? problem.sourceMeta : {};
}

function content(problem) {
  return problem.publicContentJson && typeof problem.publicContentJson === 'object'
    ? problem.publicContentJson
    : {};
}

function problemText(problem) {
  const publicContent = content(problem);
  return [
    problem.title,
    publicContent.stem,
    publicContent.prompt,
    publicContent.question,
    publicContent.starterCode,
    publicContent.functionSignature,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function numberedMap(entries) {
  return new Map(
    entries.map(([number, notebookId, reason]) => [String(number), { notebookId, reason }]),
  );
}

const PRODUCTION_FUNCTION_NOTEBOOKS = {
  calculate_area: [NOTEBOOK.functions, 'production basic function'],
  is_even: [NOTEBOOK.functions, 'production basic function'],
  convert_temperature: [NOTEBOOK.functions, 'production basic function'],
  is_in_range: [NOTEBOOK.functions, 'production basic function'],
  calculate_discount: [NOTEBOOK.functions, 'production basic function'],
  swap_values: [NOTEBOOK.lists, 'tuple return belongs with sequence/list material'],
  get_absolute_difference: [NOTEBOOK.functions, 'production basic function'],

  is_triangle_string: [NOTEBOOK.functions, 'string methods plus function/control'],
  is_palindrome: [NOTEBOOK.functions, 'string slicing plus function/control'],
  is_triple_string: [NOTEBOOK.functions, 'string slicing plus function/control'],
  count_vowels: [NOTEBOOK.functions, 'string methods plus function/control'],
  is_postal_code: [NOTEBOOK.functions, 'string indexing plus function/control'],
  has_3_consecutive_letters: [NOTEBOOK.loops, 'string scan needs loops'],
  find_first_uppercase: [NOTEBOOK.loops, 'string scan needs loops'],
  letters_first_digits_last: [NOTEBOOK.loops, 'string scan needs loops'],
  my_find: [NOTEBOOK.runtime, 'linear search implementation'],
  my_split: [NOTEBOOK.lists, 'split returns list'],
  find_palindrome_words: [NOTEBOOK.lists, 'word splitting/list processing'],
  time_on_task: [NOTEBOOK.runtime, 'sorting/greedy runtime-flavoured problem'],
  word_pattern: [NOTEBOOK.dict, 'pattern matching is dictionary-shaped'],

  get_flyer_info: [NOTEBOOK.functions, 'ticket string indexing plus function/control'],
  visits_airport: [NOTEBOOK.functions, 'ticket string indexing plus function/control'],
  get_seat_type: [NOTEBOOK.functions, 'ticket conditionals'],
  is_valid_seat: [NOTEBOOK.functions, 'ticket conditionals'],
  is_valid_flyer: [NOTEBOOK.functions, 'ticket conditionals'],
  is_valid_ticket: [NOTEBOOK.functions, 'ticket helper functions/control'],
  days_until: [NOTEBOOK.functions, 'ticket arithmetic/control'],
};

const PRODUCTION_CATEGORY_NOTEBOOKS = {
  Basic: NOTEBOOK.functions,
  Loop: NOTEBOOK.loops,
  List: NOTEBOOK.lists,
  Dictionary: NOTEBOOK.dict,
  Regex: NOTEBOOK.regex,
  OOP: NOTEBOOK.class,
};

const MIDTERM_MAP = numberedMap([
  [1, NOTEBOOK.functions, 'function call/header'],
  [2, NOTEBOOK.basic, 'operators and numeric types'],
  [3, NOTEBOOK.lists, 'list method'],
  [4, NOTEBOOK.functions, 'conditionals and variables'],
  [5, NOTEBOOK.loops, 'for range accumulator'],
  [6, NOTEBOOK.functions, 'boolean logic'],
  [7, NOTEBOOK.lists, 'list slicing'],
  [8, NOTEBOOK.functions, 'function call/default parameter'],
  [9, NOTEBOOK.lists, 'strings vs list mutation'],
  [10, NOTEBOOK.functions, 'conditionals'],
  [11, NOTEBOOK.basic, 'operators and numeric types'],
  [12, NOTEBOOK.functions, 'boolean logic'],
  [13, NOTEBOOK.lists, 'list accumulator'],
  [14, NOTEBOOK.inputOutput, 'print end parameter and output tracing'],
  [15, NOTEBOOK.functions, 'boolean expression'],
  [16, NOTEBOOK.functions, 'conditionals'],
  [17, NOTEBOOK.functions, 'boolean logic'],
  [18, NOTEBOOK.lists, 'list aliasing'],
  [19, NOTEBOOK.inputOutput, 'print output plus str conversion'],
  [20, NOTEBOOK.inputOutput, 'print return value'],
  [21, NOTEBOOK.basic, 'string replace immutability'],
  [23, NOTEBOOK.functions, 'boolean refactoring'],
  [24, NOTEBOOK.functions, 'conditional simplification'],
  [25, NOTEBOOK.functions, 'helper function'],
  [26, NOTEBOOK.loops, 'range accumulator'],
  [27, NOTEBOOK.fileIo, 'file I/O'],
  [28, NOTEBOOK.loops, 'string accumulator loop'],
  [29, NOTEBOOK.lists, 'while loop over list'],
  [30, NOTEBOOK.lists, 'list mutation'],
  [31, NOTEBOOK.loops, 'string indexing loop'],
  [32, NOTEBOOK.lists, 'list processing'],
  [33, NOTEBOOK.lists, 'list processing'],
]);

const MID_REVIEW_MAP = numberedMap([
  [1, NOTEBOOK.basic, 'string indexing'],
  [2, NOTEBOOK.inputOutput, 'escape sequence/string length'],
  [3, NOTEBOOK.basic, 'variable reassignment'],
  [4, NOTEBOOK.basic, 'string slicing'],
  [5, NOTEBOOK.lists, 'list membership'],
  [6, NOTEBOOK.lists, 'nested list membership'],
  [7, NOTEBOOK.lists, 'list membership'],
  [8, NOTEBOOK.lists, 'nested list indexing'],
  [9, NOTEBOOK.lists, 'list expression/type error'],
  [10, NOTEBOOK.lists, 'nested list membership'],
  [11, NOTEBOOK.lists, 'function plus list non-mutation'],
  [12, NOTEBOOK.inputOutput, 'int conversion from string'],
  [13, NOTEBOOK.lists, 'list slicing/indexing'],
  [14, NOTEBOOK.functions, 'boolean short-circuit'],
  [15, NOTEBOOK.functions, 'boolean short-circuit'],
  [16, NOTEBOOK.inputOutput, 'string/numeric conversion error'],
  [17, NOTEBOOK.basic, 'string slicing'],
  [18, NOTEBOOK.functions, 'boolean short-circuit'],
  [19, NOTEBOOK.basic, 'string count and exponent'],
  [20, NOTEBOOK.inputOutput, 'string escape sequence'],
  [21, NOTEBOOK.inputOutput, 'string escape sequence'],
  [22, NOTEBOOK.basic, 'substring membership'],
  [23, NOTEBOOK.basic, 'substring membership'],
  [24, NOTEBOOK.basic, 'substring membership'],
  [25, NOTEBOOK.loops, 'for loop variable'],
  [26, NOTEBOOK.lists, 'append return value'],
  [27, NOTEBOOK.lists, 'append return value'],
  [28, NOTEBOOK.lists, 'extend expects iterable'],
  [29, NOTEBOOK.lists, 'loop over list and mutation model'],
  [30, NOTEBOOK.runtime, 'sort method behaviour'],
  [31, NOTEBOOK.lists, 'loop variable over list'],
  [32, NOTEBOOK.lists, 'slice copy mutation'],
  [33, NOTEBOOK.lists, 'list alias mutation'],
  [34, NOTEBOOK.lists, 'helper mutates list'],
  [35, NOTEBOOK.lists, 'helper mutates list argument'],
  [36, NOTEBOOK.inputOutput, 'print output with empty string'],
  [37, NOTEBOOK.loops, 'descending range'],
  [38, NOTEBOOK.lists, 'pop in loop'],
  [39, NOTEBOOK.lists, 'pop while indices change'],
  [40, NOTEBOOK.functions, 'identify if body in function'],
  [41, NOTEBOOK.functions, 'function-call arguments'],
  [42, NOTEBOOK.functions, 'parameters'],
  [43, NOTEBOOK.functions, 'function calls'],
  [44, NOTEBOOK.functions, 'doctest string literals in function context'],
  [45, NOTEBOOK.functions, 'method call in function context'],
  [46, NOTEBOOK.functions, 'type contract'],
  [47, NOTEBOOK.functions, 'assignment in function context'],
  [48, NOTEBOOK.functions, 'docstring description'],
  [49, NOTEBOOK.basic, 'variable trace'],
  [50, NOTEBOOK.lists, 'function/list mutation trace'],
  [51, NOTEBOOK.lists, 'function alias/list trace'],
  [52, NOTEBOOK.loops, 'fix string loop'],
  [53, NOTEBOOK.loops, 'fix string loop accumulator'],
  [54, NOTEBOOK.loops, 'fix string loop accumulator'],
  [55, NOTEBOOK.functions, 'conditional function'],
  [56, NOTEBOOK.functions, 'string reverse with function'],
  [57, NOTEBOOK.runtime, 'linear maximum scan'],
  [58, NOTEBOOK.lists, 'reverse list in place'],
  [59, NOTEBOOK.runtime, 'linear scan edge case'],
  [60, NOTEBOOK.fileIo, 'file write'],
  [61, NOTEBOOK.fileIo, 'file write with join'],
  [62, NOTEBOOK.fileIo, 'writelines'],
  [63, NOTEBOOK.fileIo, 'writelines type error'],
  [64, NOTEBOOK.fileIo, 'with open'],
  [65, NOTEBOOK.csv, 'TextIO readline/readlines'],
  [66, NOTEBOOK.csv, 'TextIO loop over readlines'],
  [67, NOTEBOOK.csv, 'TextIO read string iteration'],
  [68, NOTEBOOK.csv, 'TextIO read and print lines'],
  [69, NOTEBOOK.fileIo, 'open modes'],
  [70, NOTEBOOK.csv, 'TextIO readline newline'],
  [71, NOTEBOOK.csv, 'TextIO EOF with readline'],
  [72, NOTEBOOK.csv, 'TextIO large file read strategy'],
  [73, NOTEBOOK.loops, 'string loop code'],
  [74, NOTEBOOK.functions, 'string validation with conditionals'],
  [75, NOTEBOOK.loops, 'string scan loop'],
  [76, NOTEBOOK.loops, 'string scan loop'],
  [77, NOTEBOOK.loops, 'string partition loop'],
  [78, NOTEBOOK.lists, 'split words into list'],
  [79, NOTEBOOK.loops, 'pattern string loop'],
  [80, NOTEBOOK.runtime, 'linear search implementation'],
  [81, NOTEBOOK.lists, 'split returns list'],
  [82, NOTEBOOK.lists, 'all substrings list'],
  [83, NOTEBOOK.runtime, 'sorting/greedy runtime-flavoured problem'],
  [84, NOTEBOOK.loops, 'contest string loop'],
  [85, NOTEBOOK.loops, 'contest loop over commands'],
  [86, NOTEBOOK.loops, 'contest simulation/control loop'],
  [87, NOTEBOOK.lists, 'nested list grid'],
]);

function classifyProduction(problem) {
  const sourceMeta = meta(problem);
  const functionName = String(sourceMeta.sourceFunctionName ?? '').trim();
  const explicit = PRODUCTION_FUNCTION_NOTEBOOKS[functionName];
  if (explicit) {
    return { notebookId: explicit[0], reason: explicit[1] };
  }

  const categoryNotebook = PRODUCTION_CATEGORY_NOTEBOOKS[sourceMeta.sourceCategory];
  if (categoryNotebook) {
    return {
      notebookId: categoryNotebook,
      reason: `production category ${sourceMeta.sourceCategory}`,
    };
  }

  return null;
}

function classifyExamProblem(problem) {
  const sourceMeta = meta(problem);
  const sourceFileName = String(sourceMeta.sourceFileName ?? '');
  const number = String(sourceMeta.sourceQuestionNumber ?? '');
  if (sourceFileName === 'CSC108H5_Midterm_2025_V1.pdf') return MIDTERM_MAP.get(number) ?? null;
  if (sourceFileName === '06_MidReview.pdf') return MID_REVIEW_MAP.get(number) ?? null;
  if (sourceFileName === 'CSC108H5F_FinalExam_2025_Questions.pdf' && sourceMeta.assignedNotebookId) {
    return {
      notebookId: String(sourceMeta.assignedNotebookId),
      reason: String(sourceMeta.sourceTopic ?? 'final exam assigned notebook'),
    };
  }
  if (sourceFileName === 'Final_Review.docx' && sourceMeta.assignedNotebookId) {
    return {
      notebookId: String(sourceMeta.assignedNotebookId),
      reason: String(sourceMeta.sourceTopic ?? 'final review assigned notebook'),
    };
  }
  return null;
}

function classifyByFallbackKeywords(problem) {
  const text = problemText(problem);
  if (/\bclass\b|__init__|\bself\b|oop/.test(text)) {
    return { notebookId: NOTEBOOK.class, reason: 'fallback class keyword' };
  }
  if (/regex|regular expression|\bre\.|findall|match|search/.test(text)) {
    return { notebookId: NOTEBOOK.regex, reason: 'fallback regex keyword' };
  }
  if (/dictionary|\bdict\b|\.items\(|\.keys\(|\.values\(|\.get\(/.test(text)) {
    return { notebookId: NOTEBOOK.dict, reason: 'fallback dictionary keyword' };
  }
  if (/textio|csv|csv\.reader|csv\.writer/.test(text)) {
    return { notebookId: NOTEBOOK.csv, reason: 'fallback TextIO/CSV keyword' };
  }
  if (/open\(|readline|readlines|writelines|with open|file i\/o/.test(text)) {
    return { notebookId: NOTEBOOK.fileIo, reason: 'fallback file I/O keyword' };
  }
  if (/binary search|big-?o|running time|complexity|\bsort\(|\bsorted\(|linear search/.test(text)) {
    return { notebookId: NOTEBOOK.runtime, reason: 'fallback runtime/search/sort keyword' };
  }
  if (
    /list\[|\blst\b|\bnums\b|\bitems\b|append\(|extend\(|pop\(|sort\(|\[[^\]]*,[^\]]*\]/.test(text)
  ) {
    return { notebookId: NOTEBOOK.lists, reason: 'fallback list keyword' };
  }
  if (/\bfor\b|\bwhile\b|range\(|accumulator|loop/.test(text)) {
    return { notebookId: NOTEBOOK.loops, reason: 'fallback loop keyword' };
  }
  if (
    /\bdef\b|\breturn\b|docstring|parameter|argument|conditional|\bif\b|\belif\b|\belse\b/.test(
      text,
    )
  ) {
    return { notebookId: NOTEBOOK.functions, reason: 'fallback function/control keyword' };
  }
  if (/string|str\.|slice|substring|operator|type|variable|assignment/.test(text)) {
    return { notebookId: NOTEBOOK.basic, reason: 'fallback basic keyword' };
  }
  return null;
}

function classify(problem) {
  const sourceMeta = meta(problem);
  if (sourceMeta.sourceFileName === 'production-csc108-questions.json') {
    return classifyProduction(problem) ?? classifyByFallbackKeywords(problem);
  }
  return classifyExamProblem(problem) ?? classifyByFallbackKeywords(problem);
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

  const [problemCount, publishedProblemCount] = await Promise.all([
    prisma.notebookProblem.count({ where: { OR: [{ courseId }, { notebook: { courseId } }] } }),
    prisma.notebookProblem.count({
      where: { status: 'published', OR: [{ courseId }, { notebook: { courseId } }] },
    }),
  ]);

  await prisma.course.update({
    where: { id: courseId },
    data: { problemCount, publishedProblemCount },
  });
}

function groupByNotebook(items, notebookNames) {
  const grouped = new Map();
  for (const item of items) {
    const key = item.targetNotebookId ?? 'UNCLASSIFIED';
    const entry = grouped.get(key) ?? {
      notebookId: key,
      notebookName: notebookNames.get(key) ?? key,
      count: 0,
      reasons: {},
    };
    entry.count += 1;
    entry.reasons[item.reason] = (entry.reasons[item.reason] ?? 0) + 1;
    grouped.set(key, entry);
  }
  return [...grouped.values()].sort((a, b) => a.notebookId.localeCompare(b.notebookId));
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const courseId = argValue('course-id') || process.env.CSC108_COURSE_ID || DEFAULT_COURSE_ID;
  const includeAssigned = !hasFlag('only-unassigned');
  const prisma = new PrismaClient();

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, name: true, courseCode: true },
    });
    if (!course) throw new Error(`Course not found: ${courseId}`);

    const notebooks = await prisma.notebook.findMany({
      where: { courseId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    const notebookIds = new Set(notebooks.map((notebook) => notebook.id));
    const notebookNames = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]));

    const problems = await prisma.notebookProblem.findMany({
      where: includeAssigned
        ? { OR: [{ courseId }, { notebook: { courseId } }] }
        : { courseId, notebookId: null },
      select: {
        id: true,
        courseId: true,
        notebookId: true,
        title: true,
        type: true,
        status: true,
        problemNumber: true,
        order: true,
        tags: true,
        publicContentJson: true,
        sourceMeta: true,
      },
      orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }],
    });

    const planned = [];
    const unchanged = [];
    const unclassified = [];
    const missingNotebookIds = new Set();

    for (const problem of problems) {
      const classification = classify(problem);
      if (!classification) {
        unclassified.push({
          id: problem.id,
          problemNumber: problem.problemNumber,
          title: problem.title,
          currentNotebookId: problem.notebookId,
        });
        continue;
      }

      if (!notebookIds.has(classification.notebookId)) {
        missingNotebookIds.add(classification.notebookId);
        continue;
      }

      const item = {
        id: problem.id,
        problemNumber: problem.problemNumber,
        title: problem.title,
        type: problem.type,
        currentNotebookId: problem.notebookId,
        targetNotebookId: classification.notebookId,
        reason: classification.reason,
        sourceFileName: meta(problem).sourceFileName ?? null,
        sourceCategory: meta(problem).sourceCategory ?? null,
      };

      if (problem.notebookId === classification.notebookId) unchanged.push(item);
      else planned.push(item);
    }

    const report = {
      mode: write ? 'write' : 'dry-run',
      course,
      scannedProblemCount: problems.length,
      plannedMoveCount: planned.length,
      unchangedCount: unchanged.length,
      unclassifiedCount: unclassified.length,
      missingNotebookIds: [...missingNotebookIds],
      plannedByTarget: groupByNotebook(planned, notebookNames),
      unclassified: unclassified.slice(0, 50),
      sampleMoves: planned.slice(0, 80).map((item) => ({
        problemNumber: item.problemNumber,
        title: item.title,
        from: notebookNames.get(item.currentNotebookId) ?? item.currentNotebookId ?? 'UNASSIGNED',
        to: notebookNames.get(item.targetNotebookId) ?? item.targetNotebookId,
        reason: item.reason,
      })),
    };
    console.log(JSON.stringify(report, null, 2));

    if (!write || planned.length === 0) return;
    if (missingNotebookIds.size > 0) {
      throw new Error(`Missing target notebooks: ${[...missingNotebookIds].join(', ')}`);
    }
    if (unclassified.length > 0) {
      throw new Error(`Refusing to write with ${unclassified.length} unclassified problems.`);
    }

    const classifiedAt = new Date().toISOString();
    await prisma.$transaction(
      async (tx) => {
        for (const item of planned) {
          const problem = problems.find((row) => row.id === item.id);
          const sourceMeta = meta(problem);
          await tx.notebookProblem.update({
            where: { id: item.id },
            data: {
              courseId,
              notebookId: item.targetNotebookId,
              sourceMeta: {
                ...sourceMeta,
                assignedNotebookId: item.targetNotebookId,
                previousNotebookId: item.currentNotebookId ?? null,
                csc108ClassificationReason: item.reason,
                csc108ClassifiedAt: classifiedAt,
              },
            },
          });
        }
      },
      { timeout: 60_000 },
    );

    await refreshSummaryFields(prisma, courseId);
    console.log(JSON.stringify({ updatedProblemCount: planned.length, classifiedAt }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
