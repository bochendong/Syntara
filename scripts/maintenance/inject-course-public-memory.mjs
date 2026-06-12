#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_TARGET_ENV_CANDIDATES = [
  'ONLINE_DATABASE_URL',
  'PRODUCTION_DATABASE_URL',
  'VERCEL_DATABASE_URL',
  'TARGET_DATABASE_URL',
];

function usage() {
  console.log(`Usage:
  pnpm memory:inject-course -- --course-id <id> --memory-file <path> [--write]

Options:
  --course-id <id>         Target server course id. Can also be provided by the JSON file.
  --memory-file <path>     JSON or JSONL memories to upsert.
  --title <title>          Single-memory mode title. Requires --text or --text-file.
  --text <text>            Single-memory mode body.
  --text-file <path>       Read single-memory body from a file.
  --target-env <name>      Target DB env var. Default: first of ONLINE_DATABASE_URL,
                           PRODUCTION_DATABASE_URL, VERCEL_DATABASE_URL, TARGET_DATABASE_URL.
  --env-file <path>        Extra env file to load. Can be repeated.
  --kind <kind>            Default memory kind. Default: course_constraint.
  --source <source>        Default memory source. Default: maintenance_course_memory_injection.
  --reason <reason>        Single-memory mode reason.
  --question <question>    Single-memory mode question.
  --source-reference <label=source>
                           Single-memory source reference. Can be repeated.
  --archive-missing        Archive active public course memories not present in the input list.
  --write                  Actually mutate the target DB. Without this, dry-run only.

Memory file formats:
  [
    {
      "notebookId": "queue-cpsc107-01-racket-basics",
      "title": "CPSC 107 HDtF format",
      "text": "Future answers should follow signature, purpose, examples/tests, then implementation.",
      "kind": "course_format",
      "reason": "Teacher-specific answer format.",
      "sourceReferences": [{ "label": "lecture notes", "source": "week 1" }]
    }
  ]

  { "courseId": "course_123", "memories": [ ... ] }

Entries with notebookId write notebook-level public memory. Entries without
notebookId write course-level public memory. The script upserts by memory id
when provided, otherwise by title within the same active/public target scope.`);
}

function parseArgs(argv) {
  const args = {
    envFiles: [],
    sourceReferences: [],
    write: false,
    archiveMissing: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };
    const readValue = (name) => {
      const prefix = `--${name}=`;
      if (arg.startsWith(prefix)) return arg.slice(prefix.length);
      return nextValue();
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--archive-missing') {
      args.archiveMissing = true;
    } else if (arg === '--course-id' || arg.startsWith('--course-id=')) {
      args.courseId = readValue('course-id');
    } else if (arg === '--memory-file' || arg.startsWith('--memory-file=')) {
      args.memoryFile = readValue('memory-file');
    } else if (arg === '--title' || arg.startsWith('--title=')) {
      args.title = readValue('title');
    } else if (arg === '--text' || arg.startsWith('--text=')) {
      args.text = readValue('text');
    } else if (arg === '--text-file' || arg.startsWith('--text-file=')) {
      args.textFile = readValue('text-file');
    } else if (arg === '--target-env' || arg.startsWith('--target-env=')) {
      args.targetEnv = readValue('target-env');
    } else if (arg === '--env-file' || arg.startsWith('--env-file=')) {
      args.envFiles.push(readValue('env-file'));
    } else if (arg === '--kind' || arg.startsWith('--kind=')) {
      args.kind = readValue('kind');
    } else if (arg === '--source' || arg.startsWith('--source=')) {
      args.source = readValue('source');
    } else if (arg === '--reason' || arg.startsWith('--reason=')) {
      args.reason = readValue('reason');
    } else if (arg === '--question' || arg.startsWith('--question=')) {
      args.question = readValue('question');
    } else if (arg === '--source-reference' || arg.startsWith('--source-reference=')) {
      args.sourceReferences.push(parseSourceReference(readValue('source-reference')));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseSourceReference(value) {
  const separator = value.indexOf('=');
  if (separator < 0) return { source: value.trim() };
  return {
    label: value.slice(0, separator).trim(),
    source: value.slice(separator + 1).trim(),
  };
}

function parseEnvLine(line) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match || match[1].startsWith('#')) return null;
  let value = match[2].trim();
  const commentIndex = value.search(/\s+#/);
  if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [match[1], value];
}

function loadEnvFiles(extraFiles) {
  for (const filePath of ['.env', '.env.local', ...extraFiles]) {
    const resolved = path.resolve(ROOT, filePath);
    if (!fs.existsSync(resolved)) continue;
    for (const line of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      process.env[key] ??= value;
    }
  }
}

function chooseTargetEnv(explicitName) {
  if (explicitName) return explicitName;
  return DEFAULT_TARGET_ENV_CANDIDATES.find((name) => process.env[name]?.trim());
}

function requiredEnv(name, label) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${label} env var ${name} is not configured.`);
  return value;
}

function createPrisma(url) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: ['error'],
  });
}

function createMemoryId() {
  return `memory_${crypto.randomUUID().replace(/-/g, '')}`;
}

function parseJsonInput(filePath) {
  const resolved = path.resolve(ROOT, filePath);
  const source = fs.readFileSync(resolved, 'utf8');
  if (resolved.endsWith('.jsonl')) {
    return {
      resolved,
      data: source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${error.message}`);
          }
        }),
    };
  }

  try {
    return { resolved, data: JSON.parse(source) };
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function readEntries(args) {
  const defaultSourceReferences = args.memoryFile
    ? [{ label: 'memory file', source: path.relative(ROOT, path.resolve(ROOT, args.memoryFile)) }]
    : args.sourceReferences;

  if (args.memoryFile) {
    const { data, resolved } = parseJsonInput(args.memoryFile);
    if (Array.isArray(data)) {
      return { courseId: null, entries: data, filePath: resolved, defaultSourceReferences };
    }
    if (data && typeof data === 'object') {
      if (Array.isArray(data.memories)) {
        return {
          courseId: typeof data.courseId === 'string' ? data.courseId : null,
          entries: data.memories,
          filePath: resolved,
          defaultSourceReferences,
        };
      }
      if (Array.isArray(data.entries)) {
        return {
          courseId: typeof data.courseId === 'string' ? data.courseId : null,
          entries: data.entries,
          filePath: resolved,
          defaultSourceReferences,
        };
      }
      if (typeof data.title === 'string' || typeof data.text === 'string') {
        return {
          courseId: typeof data.courseId === 'string' ? data.courseId : null,
          entries: [data],
          filePath: resolved,
          defaultSourceReferences,
        };
      }
    }
    throw new Error(
      '--memory-file must contain an array, { memories: [...] }, or one memory object.',
    );
  }

  if (args.title || args.text || args.textFile) {
    const text = args.textFile
      ? fs.readFileSync(path.resolve(ROOT, args.textFile), 'utf8').trim()
      : args.text;
    return {
      courseId: null,
      entries: [
        {
          title: args.title,
          text,
          reason: args.reason,
          question: args.question,
          sourceReferences: args.sourceReferences,
        },
      ],
      filePath: null,
      defaultSourceReferences,
    };
  }

  throw new Error('Provide --memory-file or single-memory --title plus --text/--text-file.');
}

function normalizeEntry(raw, index, defaults) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Memory entry ${index + 1} must be an object.`);
  }

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!title) throw new Error(`Memory entry ${index + 1} is missing title.`);
  if (!text) throw new Error(`Memory entry ${index + 1} is missing text.`);

  const status = typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim() : 'active';
  if (!['active', 'archived'].includes(status)) {
    throw new Error(`Memory entry ${index + 1} status must be active or archived.`);
  }
  const notebookId =
    typeof raw.notebookId === 'string' && raw.notebookId.trim() ? raw.notebookId.trim() : null;
  const targetType =
    typeof raw.targetType === 'string' && raw.targetType.trim()
      ? raw.targetType.trim()
      : notebookId
        ? 'notebook'
        : 'course';
  if (!['course', 'notebook'].includes(targetType)) {
    throw new Error(`Memory entry ${index + 1} targetType must be course or notebook.`);
  }
  if (targetType === 'notebook' && !notebookId) {
    throw new Error(`Memory entry ${index + 1} targetType notebook requires notebookId.`);
  }

  const sourceReferences =
    raw.sourceReferences === undefined ? defaults.sourceReferences : raw.sourceReferences;

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null,
    targetType,
    notebookId,
    title,
    text,
    kind: typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : defaults.kind,
    status,
    source:
      typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : defaults.source,
    reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : null,
    question: typeof raw.question === 'string' && raw.question.trim() ? raw.question.trim() : null,
    sourceReferences,
  };
}

async function ensureStudyMemoryTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StudyMemory" (
      "id" TEXT PRIMARY KEY,
      "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "courseId" TEXT REFERENCES "Course"("id") ON DELETE CASCADE,
      "notebookId" TEXT REFERENCES "Notebook"("id") ON DELETE CASCADE,
      "targetType" TEXT NOT NULL,
      "scope" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'manual',
      "status" TEXT NOT NULL DEFAULT 'active',
      "source" TEXT NOT NULL DEFAULT 'manual',
      "title" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "reason" TEXT,
      "question" TEXT,
      "sourceReferences" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudyMemory_owner_target_course_updated_idx"
    ON "StudyMemory" ("ownerId", "targetType", "courseId", "updatedAt" DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudyMemory_owner_target_notebook_updated_idx"
    ON "StudyMemory" ("ownerId", "targetType", "notebookId", "updatedAt" DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StudyMemory_owner_scope_status_updated_idx"
    ON "StudyMemory" ("ownerId", "scope", "status", "updatedAt" DESC)
  `);
}

function targetKey(target) {
  return target.targetType === 'notebook' ? `notebook:${target.notebookId}` : 'course';
}

async function findExistingMemory(prisma, target, entry) {
  const rows = entry.id
    ? await prisma.$queryRawUnsafe(
        `
          SELECT *
          FROM "StudyMemory"
          WHERE
            "id" = $1
            AND "ownerId" = $2
            AND "targetType" = $3
            AND "scope" = 'public'
            AND "courseId" = $4
            AND (
              ($5::text IS NULL AND "notebookId" IS NULL)
              OR "notebookId" = $5
            )
          LIMIT 1
        `,
        entry.id,
        target.ownerId,
        target.targetType,
        target.courseId,
        target.notebookId,
      )
    : await prisma.$queryRawUnsafe(
        `
          SELECT *
          FROM "StudyMemory"
          WHERE
            "ownerId" = $1
            AND "targetType" = $2
            AND "scope" = 'public'
            AND "courseId" = $3
            AND (
              ($4::text IS NULL AND "notebookId" IS NULL)
              OR "notebookId" = $4
            )
            AND "title" = $5
          ORDER BY
            CASE WHEN "status" = 'active' THEN 0 ELSE 1 END,
            "updatedAt" DESC
          LIMIT 1
        `,
        target.ownerId,
        target.targetType,
        target.courseId,
        target.notebookId,
        entry.title,
      );
  return rows[0] || null;
}

async function upsertMemory(prisma, target, entry) {
  const existing = await findExistingMemory(prisma, target, entry);
  const sourceReferences =
    entry.sourceReferences === undefined ? null : JSON.stringify(entry.sourceReferences);

  if (existing) {
    const rows = await prisma.$queryRawUnsafe(
      `
        UPDATE "StudyMemory"
        SET
          "courseId" = $3,
          "notebookId" = $4,
          "targetType" = $5,
          "kind" = $6,
          "status" = $7,
          "source" = $8,
          "title" = $9,
          "text" = $10,
          "reason" = $11,
          "question" = $12,
          "sourceReferences" = $13::jsonb,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "ownerId" = $2
        RETURNING *
      `,
      existing.id,
      target.ownerId,
      target.courseId,
      target.notebookId,
      target.targetType,
      entry.kind,
      entry.status,
      entry.source,
      entry.title,
      entry.text,
      entry.reason,
      entry.question,
      sourceReferences,
    );
    await clearVectorChunks(prisma, existing.id);
    return { action: 'updated', memory: rows[0] };
  }

  const id = entry.id || createMemoryId();
  const rows = await prisma.$queryRawUnsafe(
    `
      INSERT INTO "StudyMemory" (
        "id", "ownerId", "courseId", "notebookId", "targetType",
        "scope", "kind", "status", "source", "title", "text",
        "reason", "question", "sourceReferences",
        "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5,
        'public', $6, $7, $8, $9, $10,
        $11, $12, $13::jsonb,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `,
    id,
    target.ownerId,
    target.courseId,
    target.notebookId,
    target.targetType,
    entry.kind,
    entry.status,
    entry.source,
    entry.title,
    entry.text,
    entry.reason,
    entry.question,
    sourceReferences,
  );
  await clearVectorChunks(prisma, id);
  return { action: 'created', memory: rows[0] };
}

async function clearVectorChunks(prisma, memoryId) {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('"StudyMemoryChunk"')::text AS "tableName"`,
  );
  if (!tableRows[0]?.tableName) return;
  try {
    await prisma.$executeRawUnsafe(
      'DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1',
      memoryId,
    );
  } catch (error) {
    if (error?.code !== 'P2010' && error?.meta?.code !== '42P01') {
      console.warn(`[memory-inject] Failed to clear vector chunks for ${memoryId}:`, error.message);
    }
  }
}

async function listCoursePublicMemories(prisma, courseId) {
  return prisma.$queryRawUnsafe(
    `
      SELECT *
      FROM "StudyMemory"
      WHERE
        "scope" = 'public'
        AND "courseId" = $1
      ORDER BY "updatedAt" DESC
    `,
    courseId,
  );
}

function titleKey(title) {
  return title.trim().toLowerCase();
}

function targetKeyFromRow(row) {
  return row.targetType === 'notebook' ? `notebook:${row.notebookId}` : 'course';
}

async function resolvePlannedEntries(prisma, course, entries) {
  const notebookIds = [
    ...new Set(
      entries
        .filter((entry) => entry.targetType === 'notebook')
        .map((entry) => entry.notebookId)
        .filter(Boolean),
    ),
  ];
  const notebooks = notebookIds.length
    ? await prisma.notebook.findMany({
        where: { id: { in: notebookIds }, courseId: course.id },
        select: { id: true, ownerId: true, name: true },
      })
    : [];
  const notebooksById = new Map(notebooks.map((notebook) => [notebook.id, notebook]));

  return entries.map((entry, index) => {
    if (entry.targetType === 'course') {
      return {
        entry,
        target: {
          targetType: 'course',
          courseId: course.id,
          notebookId: null,
          ownerId: course.ownerId,
          label: `course:${course.name}`,
        },
      };
    }

    const notebook = notebooksById.get(entry.notebookId);
    if (!notebook) {
      throw new Error(
        `Memory entry ${index + 1} references notebook ${entry.notebookId}, but it was not found in course ${course.id}.`,
      );
    }
    return {
      entry,
      target: {
        targetType: 'notebook',
        courseId: course.id,
        notebookId: notebook.id,
        ownerId: notebook.ownerId,
        label: `notebook:${notebook.name}`,
      },
    };
  });
}

async function archiveMissingMemories(prisma, courseId, plannedEntries) {
  const keepIds = new Set(plannedEntries.map(({ entry }) => entry.id).filter(Boolean));
  const keepTitleKeys = new Set(
    plannedEntries.map(({ entry, target }) => `${targetKey(target)}:${titleKey(entry.title)}`),
  );
  const includedTargets = new Set(plannedEntries.map(({ target }) => targetKey(target)));
  const rows = await listCoursePublicMemories(prisma, courseId);
  const missing = rows.filter(
    (row) =>
      row.status === 'active' &&
      includedTargets.has(targetKeyFromRow(row)) &&
      !keepIds.has(row.id) &&
      !keepTitleKeys.has(`${targetKeyFromRow(row)}:${titleKey(row.title || '')}`),
  );

  const archived = [];
  for (const row of missing) {
    const updated = await prisma.$queryRawUnsafe(
      `
        UPDATE "StudyMemory"
        SET "status" = 'archived', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $1 AND "ownerId" = $2
        RETURNING *
      `,
      row.id,
      row.ownerId,
    );
    await clearVectorChunks(prisma, row.id);
    archived.push(updated[0]);
  }
  return archived;
}

function printPlan({ course, targetEnv, plannedEntries, existing, archiveMissing, write }) {
  console.log(write ? 'Mode: write' : 'Mode: dry-run');
  console.log(`Target env: ${targetEnv}`);
  console.log(
    `Course: ${course.name} (${course.id}) owner=${course.ownerId} code=${course.courseCode || 'N/A'}`,
  );
  console.log(`Input memories: ${plannedEntries.length}`);
  for (const { entry, target } of plannedEntries) {
    const match = existing.find(
      (row) =>
        targetKeyFromRow(row) === targetKey(target) &&
        (row.title === entry.title || (entry.id && row.id === entry.id)),
    );
    const action = match ? 'update' : 'create';
    console.log(`- ${action}: [${target.label}] ${entry.title}`);
  }
  if (archiveMissing) {
    console.log('Archive missing: enabled');
  }
}

async function injectCourseMemory(args) {
  loadEnvFiles(args.envFiles);
  const targetEnv = chooseTargetEnv(args.targetEnv);
  if (!targetEnv) {
    throw new Error(
      `No target database is configured. Add ONLINE_DATABASE_URL to .env.local or pass --target-env. Tried: ${DEFAULT_TARGET_ENV_CANDIDATES.join(', ')}.`,
    );
  }

  const input = readEntries(args);
  const courseId = args.courseId || input.courseId;
  if (!courseId?.trim()) {
    throw new Error('Missing required --course-id or courseId in --memory-file.');
  }

  const defaults = {
    kind: args.kind || 'course_constraint',
    source: args.source || 'maintenance_course_memory_injection',
    sourceReferences: input.defaultSourceReferences,
  };

  const entries = input.entries.map((entry, index) => normalizeEntry(entry, index, defaults));
  if (entries.length === 0) throw new Error('No memories to inject.');

  const targetUrl = requiredEnv(targetEnv, 'Target database');
  const prisma = createPrisma(targetUrl);

  try {
    await ensureStudyMemoryTable(prisma);
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        courseCode: true,
        university: true,
        listedInCourseStore: true,
      },
    });
    if (!course) throw new Error(`Course not found in ${targetEnv}: ${courseId}`);

    const plannedEntries = await resolvePlannedEntries(prisma, course, entries);
    const existing = await listCoursePublicMemories(prisma, course.id);
    printPlan({
      course,
      targetEnv,
      plannedEntries,
      existing,
      archiveMissing: args.archiveMissing,
      write: args.write,
    });

    if (!args.write) {
      if (args.archiveMissing) {
        const keepTitleKeys = new Set(
          plannedEntries.map(
            ({ entry, target }) => `${targetKey(target)}:${titleKey(entry.title)}`,
          ),
        );
        const includedTargets = new Set(plannedEntries.map(({ target }) => targetKey(target)));
        const missing = existing.filter(
          (row) =>
            row.status === 'active' &&
            includedTargets.has(targetKeyFromRow(row)) &&
            !keepTitleKeys.has(`${targetKeyFromRow(row)}:${titleKey(row.title || '')}`),
        );
        console.log(`Dry-run archive candidates: ${missing.length}`);
        for (const row of missing) console.log(`- archive: ${row.title} (${row.id})`);
      }
      console.log('Dry-run complete. Re-run with --write to mutate the target DB.');
      return;
    }

    const results = [];
    for (const { entry, target } of plannedEntries) {
      results.push(await upsertMemory(prisma, target, entry));
    }

    const archived = args.archiveMissing
      ? await archiveMissingMemories(prisma, course.id, plannedEntries)
      : [];

    console.log('Write complete.');
    console.log(`Created: ${results.filter((item) => item.action === 'created').length}`);
    console.log(`Updated: ${results.filter((item) => item.action === 'updated').length}`);
    console.log(`Archived missing: ${archived.length}`);
    for (const result of results) {
      console.log(`- ${result.action}: ${result.memory.title} (${result.memory.id})`);
    }
    for (const row of archived) {
      console.log(`- archived: ${row.title} (${row.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
} else {
  injectCourseMemory(args).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
