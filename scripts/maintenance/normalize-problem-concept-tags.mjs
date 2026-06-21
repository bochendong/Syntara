import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { normalizeProblemConceptTags } from '../../lib/problem-bank/concept-tags.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DEFAULT_COURSE_IDS = [
  'cmpnueg4p001d8o017jee1mjq',
  'cmpc9dqgv000p8ogmrsjl5co8',
  'cmqjfarz800158oi68s595q9n',
  'cmpd5bird007v8ogmjuuiio03',
  'cmpanemia001v8ouzmhttvkrn',
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('export ')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    write: false,
    courseIds: [],
    limit: null,
  };
  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else if (arg.startsWith('--course-id=')) {
      args.courseIds.push(arg.slice('--course-id='.length).trim());
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      args.limit = Number.isFinite(value) && value > 0 ? value : null;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/maintenance/normalize-problem-concept-tags.mjs [--write] [--course-id=<id>] [--limit=<n>]

Default is dry-run for the main imported courses.`);
      process.exit(0);
    }
  }
  args.courseIds = args.courseIds.filter(Boolean);
  return args;
}

function sameTags(a, b) {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function topTags(problems, key = 'tags') {
  const counts = new Map();
  for (const problem of problems) {
    for (const tag of problem[key] || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);
}

function noisyTags(tags) {
  return tags.filter(([tag]) =>
    /midterm|mid[-_\s]?review|final|exam|202\d|choice|multiple_choice|mcq|code_tracing|short_answer|fill_blank|calculation|csc\d+|cpsc\d+|mat\d+|题库|pdf|^q\d+$|^p\d+$/i.test(
      tag,
    ),
  );
}

function problemInput(problem, courseId) {
  return {
    courseId: problem.courseId || problem.notebook?.courseId || courseId,
    notebookId: problem.notebookId,
    notebookName: problem.notebook?.name,
    title: problem.title,
    type: problem.type,
    tags: problem.tags || [],
    difficulty: problem.difficulty,
    publicContent: problem.publicContentJson,
    sourceMeta: problem.sourceMeta || {},
  };
}

async function main() {
  loadEnvFile(path.join(ROOT, '.env'));
  loadEnvFile(path.join(ROOT, '.env.local'));
  const args = parseArgs(process.argv.slice(2));
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const courseIds = args.courseIds.length > 0 ? args.courseIds : DEFAULT_COURSE_IDS;

  try {
    for (const courseId of courseIds) {
      const problems = await prisma.notebookProblem.findMany({
        where: { OR: [{ courseId }, { notebook: { courseId } }] },
        include: {
          notebook: {
            select: {
              id: true,
              name: true,
              courseId: true,
            },
          },
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        ...(args.limit ? { take: args.limit } : {}),
      });

      const changes = problems
        .map((problem) => ({
          id: problem.id,
          title: problem.title,
          before: problem.tags || [],
          after: normalizeProblemConceptTags(problemInput(problem, courseId)),
        }))
        .filter((item) => !sameTags(item.before, item.after));

      console.log(
        JSON.stringify(
          {
            courseId,
            problemCount: problems.length,
            changedCount: changes.length,
            noisyBefore: noisyTags(topTags(problems)),
            topBefore: topTags(problems),
            topAfter: topTags(changes.map((item) => ({ tags: item.after }))),
            sampleChanges: changes.slice(0, 8),
            mode: args.write ? 'write' : 'dry-run',
          },
          null,
          2,
        ),
      );

      if (!args.write || changes.length === 0) continue;
      for (const change of changes) {
        await prisma.notebookProblem.update({
          where: { id: change.id },
          data: { tags: change.after },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
