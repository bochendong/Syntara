#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'repair-image-notebook-action-focus.mjs';
const SCRIPT_VERSION = '2026-05-29.v1';

const STOP_ANCHORS = new Set([
  'in',
  's',
  'py',
  'startswith',
  'endswith',
  'start',
  'end',
  'true',
  'false',
  '开头',
  '出现',
  '结尾',
  '判断',
  '方法',
  '对应',
  '题目',
  '任务',
  '区域',
  '内容',
  '本页',
]);

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function usage() {
  return [
    `Usage: node scripts/maintenance/${SCRIPT_NAME} --notebook-id <id-or-classroom-url> [--write]`,
    '',
    'Removes saved image-notebook spotlight/laser actions when the following speech does not',
    'semantically match that recovered component. Defaults to dry-run.',
  ].join('\n');
}

function readOptions(name) {
  const values = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function notebookIdFromValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const classroomMatch = raw.match(/\/classroom\/([^/?#]+)/);
  if (classroomMatch) return decodeURIComponent(classroomMatch[1]);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const last = url.pathname.split('/').filter(Boolean).at(-1);
      return last ? decodeURIComponent(last) : null;
    } catch {
      return null;
    }
  }
  return raw.replace(/^['"]|['"]$/g, '');
}

function parseNotebookIds() {
  const explicit = [...readOptions('--notebook-id'), ...readOptions('--notebook')];
  const positional = process.argv.slice(2).filter((arg, index, all) => {
    if (arg.startsWith('--')) return false;
    const previous = all[index - 1];
    return previous !== '--notebook-id' && previous !== '--notebook';
  });
  const ids = [...explicit, ...positional]
    .flatMap((value) => String(value).split(','))
    .map(notebookIdFromValue)
    .filter(Boolean);
  return [...new Set(ids)];
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeFocusText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[“”"'`·,，.。:：;；!?！？()[\]{}<>《》、/\\|_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectFocusAnchors(text) {
  const normalized = normalizeFocusText(text);
  if (!normalized) return [];
  const anchors = new Set();
  if (normalized.length >= 3 && normalized.length <= 42) anchors.add(normalized);

  for (const token of normalized.match(/[a-z][a-z0-9_]{2,}/g) || []) {
    if (!STOP_ANCHORS.has(token)) anchors.add(token);
  }
  for (const token of normalized.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    if (!STOP_ANCHORS.has(token)) anchors.add(token);
    for (let size = 2; size <= Math.min(4, token.length); size += 1) {
      for (let i = 0; i <= token.length - size; i += 1) {
        const piece = token.slice(i, i + size);
        if (!STOP_ANCHORS.has(piece)) anchors.add(piece);
      }
    }
  }
  return [...anchors];
}

function componentAnchors(component) {
  const raw = [
    component.label,
    component.role,
    component.layoutSlot,
    ...(Array.isArray(component.visibleText) ? component.visibleText : []),
    ...(Array.isArray(component.formulas) ? component.formulas : []),
    component.diagramPrompt || '',
  ];
  const anchors = new Set();
  raw.forEach((item) => collectFocusAnchors(item).forEach((anchor) => anchors.add(anchor)));
  return [...anchors].slice(0, 80);
}

function focusTargetsFromPromptPlan(promptPlan) {
  if (!isRecord(promptPlan) || !Array.isArray(promptPlan.componentPlans)) return new Map();
  const recoveredIds = new Set(
    (promptPlan.recoveryResult?.components || [])
      .filter((component) => isRecord(component) && Array.isArray(component.bbox))
      .map((component) => component.componentId),
  );
  const targets = new Map();
  for (const component of promptPlan.componentPlans) {
    if (!isRecord(component) || component.participatesInMask === false) continue;
    if (recoveredIds.size > 0 && !recoveredIds.has(component.id)) continue;
    targets.set(component.id, {
      id: component.id,
      label: String(component.label || component.id),
      anchors: componentAnchors(component),
    });
  }
  return targets;
}

function speechText(action) {
  return String(action?.text || action?.content || '').trim();
}

function targetId(action) {
  if (!isRecord(action)) return null;
  for (const key of ['elementId', 'targetElementId', 'targetId', 'focusTargetId']) {
    if (typeof action[key] === 'string' && action[key].trim()) return action[key].trim();
  }
  return null;
}

function segmentMatchesTarget(text, target) {
  const segment = normalizeFocusText(text);
  if (!segment) return false;
  const label = normalizeFocusText(target.label);
  if (label && (segment.includes(label) || label.includes(segment))) return true;
  let hits = 0;
  for (const anchor of target.anchors || []) {
    if (!anchor || STOP_ANCHORS.has(anchor)) continue;
    if (segment.includes(anchor)) hits += anchor.length >= 4 ? 2 : 1;
    if (hits >= 3) return true;
  }
  return false;
}

function nextSpeech(actions, index) {
  for (let i = index + 1; i < actions.length; i += 1) {
    if (actions[i]?.type === 'speech') return actions[i];
    if (actions[i]?.type === 'spotlight' || actions[i]?.type === 'laser') return null;
  }
  return null;
}

function repairScene(scene) {
  const promptPlan = scene.content?.imageNotebookPromptPlan;
  const focusTargets = focusTargetsFromPromptPlan(promptPlan);
  if (focusTargets.size === 0 || !Array.isArray(scene.actions)) {
    return { changed: false, actions: scene.actions, removed: [] };
  }

  const removed = [];
  const actions = scene.actions.filter((action, index, all) => {
    if (action?.type !== 'spotlight' && action?.type !== 'laser') return true;
    const id = targetId(action);
    const target = id ? focusTargets.get(id) : undefined;
    if (!target) {
      removed.push({ index, targetId: id || '', reason: 'target-not-recovered-or-not-planned' });
      return false;
    }
    const speech = nextSpeech(all, index);
    if (!speech || !segmentMatchesTarget(speechText(speech), target)) {
      removed.push({ index, targetId: id, reason: 'speech-target-mismatch' });
      return false;
    }
    return true;
  });

  return { changed: removed.length > 0, actions, removed };
}

async function main() {
  loadEnvLocal();
  const notebookIds = parseNotebookIds();
  const write = hasFlag('--write');
  const wantsHelp = hasFlag('--help');
  if (wantsHelp || notebookIds.length === 0) {
    console.log(usage());
    process.exitCode = wantsHelp ? 0 : 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Set it in .env.local or the current shell.');
  }

  const prisma = new PrismaClient();
  try {
    console.log(`${SCRIPT_NAME} ${SCRIPT_VERSION} ${write ? '(write)' : '(dry-run)'}`);
    for (const notebookId of notebookIds) {
      const notebook = await prisma.notebook.findUnique({
        where: { id: notebookId },
        select: { id: true, name: true },
      });
      if (!notebook) {
        console.warn(`Notebook not found: ${notebookId}`);
        continue;
      }

      const scenes = await prisma.scene.findMany({
        where: { notebookId },
        orderBy: { order: 'asc' },
      });
      let changedCount = 0;
      for (const [sceneIndex, scene] of scenes.entries()) {
        const result = repairScene(scene);
        if (!result.changed) continue;
        changedCount += 1;
        console.log(
          `- scene ${sceneIndex + 1} "${scene.title || scene.id || ''}": removed ${
            result.removed.length
          } focus action(s)`,
        );
        for (const item of result.removed) {
          console.log(`  · ${item.targetId || '(none)'} ${item.reason}`);
        }
        if (write) {
          await prisma.scene.update({
            where: { id: scene.id },
            data: { actions: result.actions },
          });
        }
      }

      console.log(
        `Notebook ${notebook.id} "${notebook.name}": ${changedCount} scene(s) need repair.`,
      );
      if (write && changedCount > 0) console.log(`Updated notebook ${notebook.id}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
