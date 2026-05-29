#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

const NOTEBOOKS = [
  'nb-mat136-riemann-integral-week1-20260518135718',
  'nb-mat136-definite-integral-week1-20260518150500',
  'nb-mat136-substitution-week2-20260518183518',
  'nb-mat136-inverse-substitution-week2-v2-20260519174000',
  'nb-mat136-integration-by-parts-week2-v2-20260519151624',
  'nb-mat136-area-volume-imagegen-20260521',
];

const GENERATED_FOCUS_PREFIX = 'lecture-focus-generated:';
const CANVAS_WIDTH = 1000;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

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

function pageNumber(scene) {
  const match = String(scene.id).match(/-p(\d+)$/);
  if (match) return match[1];
  return String((scene.order ?? 0) + 1).padStart(2, '0');
}

function slugify(value) {
  const raw = String(value);
  const ascii = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  let hash = 0;
  for (const char of raw) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${ascii || 'target'}-${hash.toString(36)}`;
}

function labelFromElement(element) {
  const name = String(element?.name ?? '');
  if (name.includes('semantic-hit-map:')) return name.split('semantic-hit-map:').at(-1).trim();
  if (name.includes(GENERATED_FOCUS_PREFIX))
    return name.split(GENERATED_FOCUS_PREFIX).at(-1).trim();
  return element?.label || element?.semanticId || element?.title || element?.id || '讲解区域';
}

function rectFromElement(element) {
  return {
    left: Number(element.left ?? 0),
    top: Number(element.top ?? 0),
    width: Number(element.width ?? CANVAS_WIDTH),
    height: Number(element.height ?? 562.5),
  };
}

function makeShape(id, label, rect) {
  return {
    id,
    top: rect.top,
    left: rect.left,
    fill: '#ffffff',
    lock: true,
    name: `${GENERATED_FOCUS_PREFIX}${label}`,
    path: HOTSPOT_PATH,
    type: 'shape',
    width: rect.width,
    height: rect.height,
    rotate: 0,
    opacity: 0,
    outline: {
      color: '#ffffff',
      style: 'solid',
      width: 0,
    },
    viewBox: [200, 200],
    fixedRatio: false,
  };
}

function clampRect(rect) {
  const left = Math.max(0, Math.min(980, rect.left));
  const top = Math.max(0, Math.min(540, rect.top));
  const width = Math.max(20, Math.min(CANVAS_WIDTH - left, rect.width));
  const height = Math.max(20, Math.min(562.5 - top, rect.height));
  return { left, top, width, height };
}

function splitHorizontal(rect, labels, options = {}) {
  const gap = options.gap ?? 0;
  const topInset = options.topInset ?? 0;
  const bottomInset = options.bottomInset ?? 0;
  const leftInset = options.leftInset ?? 0;
  const rightInset = options.rightInset ?? 0;
  const usable = {
    left: rect.left + leftInset,
    top: rect.top + topInset,
    width: rect.width - leftInset - rightInset,
    height: rect.height - topInset - bottomInset,
  };
  const width = (usable.width - gap * (labels.length - 1)) / labels.length;
  return labels.map((label, index) => ({
    label,
    rect: clampRect({
      left: usable.left + index * (width + gap),
      top: usable.top,
      width,
      height: usable.height,
    }),
  }));
}

function shapeTargets(scene) {
  const elements = scene.content?.canvas?.elements;
  if (!Array.isArray(elements)) return [];
  return elements
    .filter((element) => element?.type === 'shape' && element?.id)
    .map((element) => ({
      id: element.id,
      label: labelFromElement(element),
      rect: rectFromElement(element),
      generated: String(element.name ?? '').startsWith(GENERATED_FOCUS_PREFIX),
    }));
}

function imageFallbackTarget(scene) {
  const element = scene.content?.canvas?.elements?.find(
    (item) => item?.type === 'image' && item?.id,
  );
  if (!element) return null;
  return {
    id: element.id,
    label: scene.title,
    rect: rectFromElement(element),
    generated: false,
  };
}

function generatedTarget(scene, key, label, rect) {
  return {
    id: `${scene.id}-focus-${slugify(key || label)}`,
    label,
    rect: clampRect(rect),
    generated: true,
  };
}

function getExistingByLabel(targets, includes) {
  return targets.find((target) => includes.some((part) => target.label.includes(part)));
}

function expandDefiniteTargets(scene, baseTargets) {
  const extra = [];
  const p = pageNumber(scene);

  if (scene.title === '定积分的基本性质') {
    const top = getExistingByLabel(baseTargets, ['线性性质']);
    const bottom = getExistingByLabel(baseTargets, ['区间与变量性质']);
    if (top) {
      splitHorizontal(top.rect, ['零长度积分', '常数倍提出', '加减拆分'], {
        gap: 12,
        topInset: 8,
        bottomInset: 8,
      }).forEach((target) =>
        extra.push(generatedTarget(scene, `${p}-${target.label}`, target.label, target.rect)),
      );
    }
    if (bottom) {
      splitHorizontal(bottom.rect, ['区间可加', '变量名不重要'], {
        gap: 24,
        topInset: 6,
        bottomInset: 6,
      }).forEach((target) =>
        extra.push(generatedTarget(scene, `${p}-${target.label}`, target.label, target.rect)),
      );
    }
  }

  if (scene.title === 'FTC II 计算例题') {
    const examples = getExistingByLabel(baseTargets, ['三个基础计算']);
    if (examples) {
      splitHorizontal(examples.rect, ['例 1：幂函数', '例 2：指数函数', '例 3：根号函数'], {
        gap: 18,
      }).forEach((target) =>
        extra.push(generatedTarget(scene, `${p}-${target.label}`, target.label, target.rect)),
      );
    }
  }

  return extra;
}

function expandRiemannTargets(scene) {
  if (scene.title === '黎曼积分：从矩形到极限') {
    return [
      generatedTarget(scene, 'riemann-map-title', '标题：从矩形到极限', {
        left: 22,
        top: 24,
        width: 582,
        height: 66,
      }),
      generatedTarget(scene, 'riemann-map-area-heading', '第 1 步标题：面积等于累积量', {
        left: 34,
        top: 130,
        width: 185,
        height: 50,
      }),
      generatedTarget(scene, 'riemann-map-area-graph', '第 1 步图像：曲线下面积', {
        left: 29,
        top: 188,
        width: 112,
        height: 200,
      }),
      generatedTarget(scene, 'riemann-map-area-text', '第 1 步文字：许多小矩形累加', {
        left: 134,
        top: 235,
        width: 90,
        height: 98,
      }),
      generatedTarget(scene, 'riemann-map-first-arrow', '从面积到分割箭头', {
        left: 232,
        top: 238,
        width: 36,
        height: 62,
      }),
      generatedTarget(scene, 'riemann-map-partition-heading', '第 2 步标题：分割区间 P', {
        left: 270,
        top: 130,
        width: 205,
        height: 58,
      }),
      generatedTarget(scene, 'riemann-map-partition-notation', '第 2 步符号：切点顺序', {
        left: 278,
        top: 190,
        width: 188,
        height: 48,
      }),
      generatedTarget(scene, 'riemann-map-partition-graph', '第 2 步图像：切出小区间', {
        left: 276,
        top: 240,
        width: 198,
        height: 160,
      }),
      generatedTarget(scene, 'riemann-map-second-arrow', '从分割到采样箭头', {
        left: 486,
        top: 238,
        width: 36,
        height: 62,
      }),
      generatedTarget(scene, 'riemann-map-sample-heading', '第 3 步标题：采样点 c 下标 i', {
        left: 524,
        top: 130,
        width: 195,
        height: 56,
      }),
      generatedTarget(scene, 'riemann-map-sample-rule', '第 3 步文字：每段取一点', {
        left: 528,
        top: 184,
        width: 180,
        height: 56,
      }),
      generatedTarget(scene, 'riemann-map-sample-graph', '第 3 步图像：采样点决定高度', {
        left: 524,
        top: 240,
        width: 198,
        height: 170,
      }),
      generatedTarget(scene, 'riemann-map-third-arrow', '从采样到极限箭头', {
        left: 728,
        top: 238,
        width: 36,
        height: 62,
      }),
      generatedTarget(scene, 'riemann-map-limit-heading', '第 4 步标题：网格变细和稳定', {
        left: 762,
        top: 130,
        width: 205,
        height: 56,
      }),
      generatedTarget(scene, 'riemann-map-limit-text', '第 4 步文字：和趋于稳定', {
        left: 770,
        top: 184,
        width: 190,
        height: 64,
      }),
      generatedTarget(scene, 'riemann-map-limit-graph', '第 4 步图像：细矩形贴近曲线', {
        left: 762,
        top: 242,
        width: 200,
        height: 138,
      }),
      generatedTarget(scene, 'riemann-map-limit-formula', '第 4 步公式：矩形和', {
        left: 784,
        top: 378,
        width: 140,
        height: 58,
      }),
      generatedTarget(scene, 'riemann-map-bottom-question', '底部问题：矩形和怎样逼近面积', {
        left: 122,
        top: 459,
        width: 766,
        height: 72,
      }),
    ];
  }

  if (scene.title !== 'MAT 136 · 黎曼积分') return [];

  return [
    generatedTarget(scene, 'riemann-cover-core-question', '核心问题：矩形近似到面积极限', {
      left: 210,
      top: 182,
      width: 590,
      height: 48,
    }),
    generatedTarget(scene, 'riemann-cover-coarse-graph', '粗分割图像主体', {
      left: 22,
      top: 246,
      width: 278,
      height: 140,
    }),
    generatedTarget(scene, 'riemann-cover-first-arrow', '第一次细化箭头', {
      left: 294,
      top: 294,
      width: 54,
      height: 58,
    }),
    generatedTarget(scene, 'riemann-cover-finer-graph', '较细分割图像主体', {
      left: 326,
      top: 246,
      width: 250,
      height: 140,
    }),
    generatedTarget(scene, 'riemann-cover-second-arrow', '第二次细化箭头', {
      left: 578,
      top: 294,
      width: 50,
      height: 58,
    }),
    generatedTarget(scene, 'riemann-cover-finest-graph', '更细分割图像主体', {
      left: 626,
      top: 246,
      width: 252,
      height: 140,
    }),
    generatedTarget(scene, 'riemann-cover-stable-a', '稳定面积箭头与 A', {
      left: 832,
      top: 260,
      width: 145,
      height: 105,
    }),
    generatedTarget(scene, 'riemann-cover-route-sums', '路线：Riemann sums', {
      left: 130,
      top: 466,
      width: 250,
      height: 52,
    }),
    generatedTarget(scene, 'riemann-cover-route-integrability', '路线：integrability', {
      left: 430,
      top: 466,
      width: 190,
      height: 52,
    }),
    generatedTarget(scene, 'riemann-cover-route-definite-integral', '路线：definite integral', {
      left: 654,
      top: 466,
      width: 265,
      height: 52,
    }),
  ];
}

function expandCoverTargets(scene) {
  const title = scene.title;
  if (title === 'MAT 136 · 换元法') {
    return [
      generatedTarget(scene, 'sub-cover-flow', '换元法四步流程', {
        left: 20,
        top: 110,
        width: 610,
        height: 245,
      }),
      generatedTarget(scene, 'sub-cover-chain-rule', '反向链式法则', {
        left: 680,
        top: 92,
        width: 285,
        height: 310,
      }),
      generatedTarget(scene, 'sub-cover-key', '今日 u 选择重点', {
        left: 70,
        top: 438,
        width: 790,
        height: 64,
      }),
    ];
  }

  if (title === 'MAT 136 · 逆换元法') {
    return [
      generatedTarget(scene, 'inverse-cover-roots', '三种根号形状', {
        left: 44,
        top: 118,
        width: 208,
        height: 245,
      }),
      generatedTarget(scene, 'inverse-cover-circle', '单位圆三角形', {
        left: 360,
        top: 116,
        width: 310,
        height: 250,
      }),
      generatedTarget(scene, 'inverse-cover-goal', '目标：根号变三角函数', {
        left: 60,
        top: 430,
        width: 735,
        height: 70,
      }),
    ];
  }

  return [];
}

function expandTargets(notebookId, scene, baseTargets) {
  if (notebookId === 'nb-mat136-riemann-integral-week1-20260518135718') {
    return expandRiemannTargets(scene);
  }

  if (notebookId === 'nb-mat136-definite-integral-week1-20260518150500') {
    return expandDefiniteTargets(scene, baseTargets);
  }

  if (notebookId === 'nb-mat136-area-volume-imagegen-20260521') {
    return [];
  }

  if (baseTargets.length === 0) {
    return expandCoverTargets(scene);
  }

  return [];
}

function uniqueTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    if (!target?.id || seen.has(target.id)) return false;
    seen.add(target.id);
    return true;
  });
}

export function targetsForScene(notebookId, scene) {
  const baseTargets = shapeTargets(scene).filter((target) => !target.generated);
  const expanded = expandTargets(notebookId, scene, baseTargets);
  const fallback =
    baseTargets.length || expanded.length ? [] : [imageFallbackTarget(scene)].filter(Boolean);
  return uniqueTargets([...expanded, ...baseTargets, ...fallback]);
}

function targetByLabel(targets, includes) {
  return targets.find((target) => includes.some((part) => target.label.includes(part))) ?? null;
}

function rangePlanForScene(scene) {
  if (scene.title === 'MAT 136 · 黎曼积分') {
    return [
      { start: 1, end: 2, labels: ['核心问题：矩形近似到面积极限'] },
      { start: 3, end: 4, labels: ['粗分割图像主体'] },
      { start: 5, end: 5, labels: ['第一次细化箭头'] },
      { start: 6, end: 7, labels: ['较细分割图像主体'] },
      { start: 8, end: 8, labels: ['第二次细化箭头'] },
      { start: 9, end: 10, labels: ['更细分割图像主体'] },
      { start: 11, end: 12, labels: ['稳定面积箭头与 A'] },
      { start: 13, end: 13, labels: ['路线：Riemann sums'] },
      { start: 14, end: 14, labels: ['路线：integrability'] },
      { start: 15, end: 15, labels: ['路线：definite integral'] },
      { start: 16, end: 16, labels: ['课程路线条'] },
    ];
  }

  if (scene.title === '黎曼积分：从矩形到极限') {
    return [
      { start: 1, end: 2, labels: ['标题：从矩形到极限'] },
      { start: 3, end: 3, labels: ['第 1 步标题：面积等于累积量'] },
      { start: 4, end: 4, labels: ['第 1 步图像：曲线下面积'] },
      { start: 5, end: 5, labels: ['第 1 步文字：许多小矩形累加'] },
      { start: 6, end: 6, labels: ['从面积到分割箭头'] },
      { start: 7, end: 7, labels: ['第 2 步标题：分割区间 P'] },
      { start: 8, end: 8, labels: ['第 2 步符号：切点顺序'] },
      { start: 9, end: 9, labels: ['第 2 步图像：切出小区间'] },
      { start: 10, end: 10, labels: ['从分割到采样箭头'] },
      { start: 11, end: 11, labels: ['第 3 步标题：采样点 c 下标 i'] },
      { start: 12, end: 12, labels: ['第 3 步图像：采样点决定高度'] },
      { start: 13, end: 13, labels: ['从采样到极限箭头'] },
      { start: 14, end: 14, labels: ['第 4 步标题：网格变细和稳定'] },
      { start: 15, end: 15, labels: ['第 4 步公式：矩形和'] },
      { start: 16, end: 16, labels: ['底部问题：矩形和怎样逼近面积'] },
    ];
  }

  if (scene.title === '面积为什么是累积量？') {
    return [
      { start: 1, end: 2, labels: ['恒定高度图像'] },
      { start: 3, end: 4, labels: ['速度乘时间'] },
      { start: 5, end: 7, labels: ['变化高度图像'] },
      { start: 8, end: 9, labels: ['局部近似文字'] },
      { start: 10, end: 10, labels: ['底部核心想法'] },
    ];
  }

  if (scene.title === '第一步：分割区间 P') {
    return [
      { start: 1, end: 4, labels: ['上方分割线'] },
      { start: 5, end: 6, labels: ['橙色小区间'] },
      { start: 7, end: 8, labels: ['左侧分割表示'] },
      { start: 9, end: 10, labels: ['右侧等分备注'] },
      { start: 11, end: 12, labels: ['底部直觉'] },
    ];
  }

  if (scene.title === '第二步：选择采样点 c_i') {
    return [
      { start: 1, end: 2, labels: ['承接宽度'] },
      { start: 3, end: 4, labels: ['左端点面板'] },
      { start: 5, end: 6, labels: ['右端点面板'] },
      { start: 7, end: 8, labels: ['中点面板'] },
      { start: 9, end: 10, labels: ['面积公式框'] },
      { start: 11, end: 12, labels: ['底部总结'] },
    ];
  }

  if (scene.title === '第三步：把矩形面积加起来') {
    return [
      { start: 1, end: 2, labels: ['左侧矩形总图'] },
      { start: 3, end: 4, labels: ['橙色矩形'] },
      { start: 5, end: 6, labels: ['单个矩形公式'] },
      { start: 7, end: 8, labels: ['所有矩形相加'] },
      { start: 9, end: 10, labels: ['底部名称'] },
      { start: 11, end: 12, labels: ['底部名称'] },
    ];
  }

  if (scene.title === '例题 1：左黎曼和估计 √x') {
    return [
      { start: 1, end: 2, labels: ['题目条件区'] },
      { start: 3, end: 4, labels: ['图像与四段分割'] },
      { start: 5, end: 6, labels: ['左端点橙点'] },
      { start: 7, end: 8, labels: ['计算步骤区'] },
      { start: 9, end: 10, labels: ['数值结果'] },
      { start: 11, end: 12, labels: ['底部提醒'] },
    ];
  }

  if (scene.title === '例题 2：只有表格，也能算右黎曼和') {
    return [
      { start: 1, end: 2, labels: ['表格题目区'] },
      { start: 3, end: 4, labels: ['数据表格区'] },
      { start: 5, end: 6, labels: ['右端点矩形区'] },
      { start: 7, end: 8, labels: ['右端点列表'] },
      { start: 9, end: 10, labels: ['右黎曼和计算区'] },
      { start: 11, end: 12, labels: ['底部提醒'] },
    ];
  }

  if (scene.title === '三种常见采样规则') {
    return [
      { start: 1, end: 2, labels: ['承接两道例题'] },
      { start: 3, end: 4, labels: ['左端点和面板'] },
      { start: 5, end: 6, labels: ['右端点和面板'] },
      { start: 7, end: 8, labels: ['中点和面板'] },
      { start: 9, end: 10, labels: ['底部比较'] },
    ];
  }

  if (scene.title === '高估 / 低估：先看单调性') {
    return [
      { start: 1, end: 2, labels: ['承接三规则'] },
      { start: 3, end: 4, labels: ['递增左端点低估'] },
      { start: 5, end: 6, labels: ['递增右端点高估'] },
      { start: 7, end: 8, labels: ['递减左端点高估'] },
      { start: 9, end: 10, labels: ['递减右端点低估'] },
      { start: 11, end: 12, labels: ['底部不等式'] },
    ];
  }

  if (scene.title === '让分割变细：mesh 趋近 0') {
    return [
      { start: 1, end: 2, labels: ['粗分割面板'] },
      { start: 3, end: 4, labels: ['refine 箭头'] },
      { start: 5, end: 6, labels: ['细分割面板'] },
      { start: 7, end: 10, labels: ['mesh 定义框'] },
      { start: 11, end: 12, labels: ['底部问题'] },
    ];
  }

  if (scene.title === '什么时候叫“可黎曼积分”？') {
    return [
      { start: 1, end: 2, labels: ['任意采样点'] },
      { start: 3, end: 4, labels: ['三种和收敛'] },
      { start: 5, end: 8, labels: ['右侧同一个极限'] },
      { start: 9, end: 10, labels: ['可积定义框'] },
      { start: 11, end: 12, labels: ['下一节命名'] },
    ];
  }

  if (scene.title === '本节课总结：黎曼积分的流程') {
    return [
      { start: 1, end: 2, labels: ['顶部五步流程'] },
      { start: 3, end: 4, labels: ['顶部五步流程'] },
      { start: 5, end: 6, labels: ['左侧可积结论'] },
      { start: 7, end: 8, labels: ['黎曼和公式回顾'] },
      { start: 9, end: 10, labels: ['右侧细化图'] },
      { start: 11, end: 11, labels: ['右侧细化图'] },
      { start: 12, end: 12, labels: ['底部下节课'] },
    ];
  }

  if (scene.title === '定积分的基本性质') {
    return [
      { start: 1, end: 1, labels: ['线性性质'] },
      { start: 2, end: 2, labels: ['零长度积分'] },
      { start: 3, end: 3, labels: ['常数倍提出'] },
      { start: 4, end: 4, labels: ['加减拆分'] },
      { start: 5, end: 6, labels: ['区间可加'] },
      { start: 7, end: 8, labels: ['变量名不重要'] },
      { start: 9, end: 12, labels: ['性质总结'] },
    ];
  }

  if (scene.title === 'FTC II 计算例题') {
    return [
      { start: 1, end: 1, labels: ['三个基础计算'] },
      { start: 2, end: 3, labels: ['例 1'] },
      { start: 4, end: 4, labels: ['例 2'] },
      { start: 5, end: 8, labels: ['例 3'] },
      { start: 9, end: 12, labels: ['定积分结果提醒'] },
    ];
  }

  return [];
}

function pickTarget(targets, scene, index, speechCount) {
  if (targets.length === 1) return targets[0];
  const speechNumber = index + 1;
  for (const range of rangePlanForScene(scene)) {
    if (speechNumber >= range.start && speechNumber <= range.end) {
      const target = targetByLabel(targets, range.labels);
      if (target) return target;
    }
  }

  const proportionalIndex = Math.min(
    targets.length - 1,
    Math.floor((index / Math.max(1, speechCount)) * targets.length),
  );
  return targets[proportionalIndex];
}

function generatedElementsForTargets(targets) {
  return targets
    .filter((target) => target.generated)
    .map((target) => makeShape(target.id, target.label, target.rect));
}

export function rebuildSceneContent(scene, targets) {
  const content = structuredClone(scene.content ?? {});
  if (!content.canvas) content.canvas = {};
  if (!Array.isArray(content.canvas.elements)) content.canvas.elements = [];

  const originalElements = content.canvas.elements.filter(
    (element) => !String(element?.name ?? '').startsWith(GENERATED_FOCUS_PREFIX),
  );
  const existingIds = new Set(originalElements.map((element) => element.id));
  const generatedElements = generatedElementsForTargets(targets).filter(
    (element) => !existingIds.has(element.id),
  );

  content.canvas.elements = [...originalElements, ...generatedElements];
  return content;
}

export function rebuildActions(scene, targets) {
  const speechActions = (Array.isArray(scene.actions) ? scene.actions : []).filter(
    (action) => action?.type === 'speech',
  );
  const actions = [];
  let activeTargetId = null;

  speechActions.forEach((speech, index) => {
    const target = pickTarget(targets, scene, index, speechActions.length);
    if (target && target.id !== activeTargetId) {
      actions.push({
        id: `${scene.id}-spotlight-focus-${String(index + 1).padStart(3, '0')}`,
        type: 'spotlight',
        elementId: target.id,
        title: target.label,
        description: `聚焦讲解区域：${target.label}`,
        dimOpacity: 0.76,
      });
      activeTargetId = target.id;
    }
    actions.push({
      ...speech,
      text: sanitizeMathForSpeech(speech.text),
    });
  });

  return actions;
}

export function validateScene(scene, content, actions) {
  const elementIds = new Set(
    (content.canvas?.elements ?? []).map((element) => element?.id).filter(Boolean),
  );
  const invalid = actions
    .filter((action) => action?.type === 'spotlight')
    .filter((action) => !elementIds.has(action.elementId));

  if (invalid.length > 0) {
    throw new Error(
      `Invalid spotlight targets in ${scene.title}: ${invalid.map((action) => action.elementId).join(', ')}`,
    );
  }
}

async function enhanceNotebook(prisma, notebookId) {
  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    include: { scenes: { orderBy: { order: 'asc' } } },
  });
  if (!notebook) throw new Error(`Notebook not found: ${notebookId}`);

  let speechTotal = 0;
  let spotlightTotal = 0;
  let generatedTargetTotal = 0;

  for (const scene of notebook.scenes) {
    const targets = targetsForScene(notebookId, scene);
    const actions = rebuildActions(scene, targets);
    const content = rebuildSceneContent(scene, targets);
    validateScene(scene, content, actions);

    speechTotal += actions.filter((action) => action.type === 'speech').length;
    spotlightTotal += actions.filter((action) => action.type === 'spotlight').length;
    generatedTargetTotal += targets.filter((target) => target.generated).length;

    if (!DRY_RUN) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { content, actions },
      });
    }
  }

  if (!DRY_RUN) {
    await prisma.notebook.update({
      where: { id: notebookId },
      data: { updatedAt: new Date() },
    });
  }

  console.log(
    `${DRY_RUN ? 'Would enhance' : 'Enhanced'} ${notebook.name}: scenes=${notebook.scenes.length}, speech=${speechTotal}, spotlights=${spotlightTotal}, generatedTargets=${generatedTargetTotal}`,
  );
}

async function main() {
  loadEnvLocal();
  const prisma = new PrismaClient();

  try {
    for (const notebookId of NOTEBOOKS) {
      await enhanceNotebook(prisma, notebookId);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
