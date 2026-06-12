import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = '/Users/dongpochen/Github/OpenMAIC';
const screenshotPath = '/Users/dongpochen/Desktop/截屏2026-06-12 下午3.06.22.png';
const outPng = path.join(root, 'design-mocks/course-classmates-social-priority-v2.png');
const outSvg = path.join(root, 'design-mocks/course-classmates-social-priority-v2.svg');

const W = 2928;
const H = 1594;
const contentX = 225;
const contentW = 2460;
const tabY = 672;
const contentTop = 815;

const avatarFiles = [
  'R1.avif',
  'SR7.avif',
  'R12.avif',
  'SSR2.avif',
  'R18.avif',
  'SR3.avif',
  'R7.avif',
  'SSR4.avif',
];

const students = [
  {
    name: '陈知行',
    meta: 'UTM · 本周 46 题',
    status: '答题正确率 91% · 可优先联系',
    tag: 'S 级',
    percent: 92,
    memory: 18,
    problems: 46,
    mastery: '91%',
    color: '#3b82f6',
    accent: '#dbeafe',
    online: true,
    rank: 1,
    access: '优先邀请',
    locked: false,
  },
  {
    name: 'Mia Zhang',
    meta: 'UTSG · 本周 31 题',
    status: '连续 5 天学习 · 匹配权 +2',
    tag: 'A 级',
    percent: 78,
    memory: 9,
    problems: 31,
    mastery: '84%',
    color: '#10b981',
    accent: '#d1fae5',
    online: true,
    rank: 2,
    access: '可发邀请',
    locked: false,
  },
  {
    name: '林若安',
    meta: 'UTM · 本周 17 题',
    status: '还差 8 题进入优先池',
    tag: 'B 级',
    percent: 49,
    memory: 12,
    problems: 17,
    mastery: '63%',
    color: '#f59e0b',
    accent: '#fef3c7',
    online: false,
    rank: 6,
    access: '待解锁',
    locked: true,
  },
  {
    name: 'Noah Li',
    meta: 'UTSG · 本周 73 题',
    status: '本周榜首 · 开放同伴答疑',
    tag: 'S 级',
    percent: 96,
    memory: 24,
    problems: 73,
    mastery: '94%',
    color: '#8b5cf6',
    accent: '#ede9fe',
    online: true,
    rank: 3,
    access: '优先展示',
    locked: false,
  },
  {
    name: '王以澄',
    meta: 'UTM · 本周 6 题',
    status: '完成今日 10 题解锁可见度',
    tag: '新手',
    percent: 21,
    memory: 4,
    problems: 6,
    mastery: '38%',
    color: '#06b6d4',
    accent: '#cffafe',
    online: false,
    rank: 21,
    access: '低曝光',
    locked: true,
  },
  {
    name: 'Ava Chen',
    meta: 'UTSG · 本周 28 题',
    status: '错题复盘完整 · 可组队',
    tag: 'A 级',
    percent: 71,
    memory: 15,
    problems: 28,
    mastery: '79%',
    color: '#ef4444',
    accent: '#fee2e2',
    online: true,
    rank: 4,
    access: '可发邀请',
    locked: false,
  },
  {
    name: '周亦然',
    meta: 'UTM · 本周 62 题',
    status: '覆盖 8/11 章 · 匹配权 +3',
    tag: 'S 级',
    percent: 89,
    memory: 21,
    problems: 62,
    mastery: '87%',
    color: '#14b8a6',
    accent: '#ccfbf1',
    online: true,
    rank: 5,
    access: '优先邀请',
    locked: false,
  },
  {
    name: 'Ethan Wu',
    meta: 'UTSG · 本周 39 题',
    status: '答题质量稳定 · 可被推荐',
    tag: 'A 级',
    percent: 74,
    memory: 11,
    problems: 39,
    mastery: '81%',
    color: '#6366f1',
    accent: '#e0e7ff',
    online: false,
    rank: 7,
    access: '可被邀请',
    locked: false,
  },
];

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function text(value, x, y, size, fill = '#0f172a', weight = 500, extra = '') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
}

function rect(x, y, w, h, fill, stroke = 'none', rx = 0, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
}

function pathEl(d, stroke, width = 4, extra = '') {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
}

async function imageDataUri(filePath, size = 128) {
  const png = await sharp(filePath).resize(size, size, { fit: 'cover' }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function main() {
  const avatarUris = await Promise.all(
    avatarFiles.map((file) => imageDataUri(path.join(root, 'public/avatars/user-avators', file))),
  );

  const defs = `
    <defs>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.075"/>
      </filter>
      <filter id="tinyShadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.09"/>
      </filter>
      ${students
        .map(
          (_, index) => `
            <clipPath id="avatarClip${index}">
              <circle cx="${0}" cy="${0}" r="1"/>
            </clipPath>
          `,
        )
        .join('')}
    </defs>
  `;

  const tabTextY = tabY + 42;
  const tabLineY = tabY + 78;
  const tabs = `
    ${rect(0, 650, W, H - 650, '#f6f8fc', 'none')}
    ${rect(contentX, 650, contentW, 104, '#f6f8fc', 'none')}
    <line x1="${contentX}" y1="${tabLineY}" x2="${contentX + contentW}" y2="${tabLineY}" stroke="#dbe3ef" stroke-width="2"/>

    <g transform="translate(${contentX + 1} ${tabY + 18})" opacity="0.78">
      ${pathEl('M3 5c8-4 17-3 25 2v27c-8-5-17-6-25-2V5zM31 7c8-5 17-6 25-2v27c-8-4-17-3-25 2V7zM31 7v27', '#64748b', 3)}
      ${text('笔记本', 76, 26, 25, '#475569', 700)}
      ${rect(178, 4, 42, 30, '#e8f1ff', 'none', 15)}
      ${text('11', 192, 26, 18, '#2563eb', 800)}
    </g>

    <g transform="translate(${contentX + 265} ${tabY + 18})" opacity="0.78">
      ${rect(0, 6, 30, 22, 'none', '#64748b', 5, 'stroke-width="3"')}
      ${pathEl('M5 12h20M8 6v-5h14v5', '#64748b', 3)}
      ${text('课程资料', 50, 26, 25, '#475569', 700)}
    </g>

    <g transform="translate(${contentX + 545} ${tabY + 18})">
      ${pathEl('M8 28c0-9 24-9 24 0M20 15a8 8 0 1 0 0-16 8 8 0 0 0 0 16M37 28c0-6 16-6 16 0M45 17a6 6 0 1 0 0-12', '#2563eb', 3.2)}
      ${text('课友', 70, 26, 25, '#2563eb', 800)}
      ${rect(132, 4, 54, 30, '#e8f1ff', 'none', 15)}
      ${text('227', 148, 26, 18, '#2563eb', 800)}
    </g>
    ${rect(contentX + 545, tabLineY - 3, 188, 5, '#3b67ff', 'none', 3)}
  `;

  const summaryY = contentTop;
  const summary = `
    <g filter="url(#softShadow)">
      ${rect(contentX, summaryY, contentW, 150, '#ffffff', '#dfe7f2', 30)}
    </g>
    <g transform="translate(${contentX + 34} ${summaryY + 32})">
      ${text('优先社交权', 0, 28, 30, '#0f172a', 800)}
      ${text('题做得好、掌握更稳的同学，会获得更高曝光、更多邀请额度和优先匹配。', 0, 66, 19, '#64748b', 500)}
      <g transform="translate(0 86)">
        ${rect(0, 0, 178, 38, '#eff6ff', '#bfdbfe', 19)}
        ${text('我的社交分 86', 22, 26, 18, '#2563eb', 800)}
        ${rect(196, 0, 170, 38, '#ecfdf5', '#bbf7d0', 19)}
        ${text('本周邀请 5/6', 220, 26, 18, '#059669', 800)}
        ${rect(384, 0, 196, 38, '#fff7ed', '#fed7aa', 19)}
        ${text('再做 4 题 +1 权益', 408, 26, 18, '#ea580c', 800)}
        ${rect(598, 0, 210, 38, '#f5f3ff', '#ddd6fe', 19)}
        ${text('优先池门槛 25 题', 622, 26, 18, '#7c3aed', 800)}
      </g>
    </g>
    <g transform="translate(${contentX + 1450} ${summaryY + 34})">
      ${rect(0, 0, 330, 48, '#f8fafc', '#dbe3ef', 18)}
      ${pathEl('M28 26l10 10M33 22a12 12 0 1 1-24 0 12 12 0 0 1 24 0', '#94a3b8', 3)}
      ${text('搜索课友 / 学号昵称', 58, 31, 18, '#94a3b8', 500)}
      ${rect(356, 0, 92, 48, '#2563eb', 'none', 18)}
      ${text('全部', 386, 31, 18, '#ffffff', 800)}
      ${rect(460, 0, 120, 48, '#f8fafc', '#dbe3ef', 18)}
      ${text('优先池', 493, 31, 18, '#475569', 700)}
      ${rect(592, 0, 120, 48, '#f8fafc', '#dbe3ef', 18)}
      ${text('可组队', 625, 31, 18, '#475569', 700)}
      ${rect(724, 0, 230, 48, '#f8fafc', '#dbe3ef', 18)}
      ${text('社交分排序', 774, 31, 18, '#475569', 700)}
      ${pathEl('M920 18l11 11 11-11', '#94a3b8', 3)}
    </g>
  `;

  const cardW = 597;
  const cardH = 246;
  const gap = 24;
  const gridY = 1000;

  const cards = students
    .map((student, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = contentX + col * (cardW + gap);
      const y = gridY + row * (cardH + gap);
      const avatarX = x + 30;
      const avatarY = y + 34;
      const progressW = 320;
      const progressX = x + 230;
      const progressY = y + 133;
      const clippedName = truncate(student.name, 12);
      const clippedStatus = truncate(student.status, 18);
      return `
        <g>
          <g filter="url(#softShadow)">
            ${rect(x, y, cardW, cardH, '#ffffff', '#dfe7f2', 26)}
          </g>
          ${rect(x, y, 12, cardH, student.accent, 'none', '26 0 0 26')}
          ${rect(x + 30, y + 30, 92, 92, student.accent, 'none', 28)}
          <clipPath id="studentAvatar${index}">
            <circle cx="${avatarX + 46}" cy="${avatarY + 46}" r="40"/>
          </clipPath>
          <image href="${avatarUris[index]}" x="${avatarX + 6}" y="${avatarY + 6}" width="80" height="80" clip-path="url(#studentAvatar${index})"/>
          ${student.online ? `<circle cx="${avatarX + 100}" cy="${avatarY + 18}" r="11" fill="#ffffff"/><circle cx="${avatarX + 100}" cy="${avatarY + 18}" r="7" fill="#22c55e"/>` : ''}
          ${text(clippedName, x + 148, y + 58, 26, '#0f172a', 800)}
          ${text(student.meta, x + 148, y + 88, 17, '#64748b', 600)}
          ${rect(x + cardW - 150, y + 34, 112, 34, student.accent, 'none', 17)}
          ${text(student.tag, x + cardW - 122, y + 58, 17, student.color, 800)}
          ${rect(x + 148, y + 105, 350, 38, student.locked ? '#fff7ed' : '#f8fafc', student.locked ? '#fed7aa' : '#e2e8f0', 18)}
          ${text(clippedStatus, x + 168, y + 130, 17, student.locked ? '#9a3412' : '#334155', 700)}
          ${rect(progressX, progressY + 35, progressW, 12, '#eef2f7', 'none', 6)}
          ${rect(progressX, progressY + 35, Math.round((progressW * student.percent) / 100), 12, student.color, 'none', 6)}
          ${text(`${student.percent}`, progressX, progressY + 24, 18, student.color, 800)}
          ${text('社交分', progressX + 48, progressY + 24, 16, '#94a3b8', 600)}
          ${rect(x + 30, y + 132, 132, 34, student.locked ? '#f8fafc' : '#0f172a', student.locked ? '#e2e8f0' : 'none', 17)}
          ${text(`#${student.rank} ${student.access}`, x + 52, y + 155, 16, student.locked ? '#94a3b8' : '#ffffff', 800)}
          <g transform="translate(${x + 30} ${y + 169})">
            ${rect(0, 0, 160, 48, '#f8fafc', '#e2e8f0', 16)}
            ${text(String(student.memory), 34, 30, 21, '#2563eb', 800)}
            ${text('记忆', 84, 30, 16, '#64748b', 600)}
            ${rect(178, 0, 170, 48, '#f8fafc', '#e2e8f0', 16)}
            ${text(String(student.problems), 214, 30, 21, '#059669', 800)}
            ${text('本周题', 266, 30, 16, '#64748b', 600)}
            ${rect(366, 0, 168, 48, '#f8fafc', '#e2e8f0', 16)}
            ${text(student.mastery, 394, 30, 21, '#7c3aed', 800)}
            ${text('正确率', 462, 30, 16, '#64748b', 600)}
          </g>
        </g>
      `;
    })
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${defs}
      <style>
        text {
          font-family: Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
          letter-spacing: 0;
        }
      </style>
      ${tabs}
      ${summary}
      ${cards}
    </svg>
  `;

  const base = await sharp(screenshotPath).resize(W, H).png().toBuffer();
  const overlay = Buffer.from(svg);
  await sharp(base).composite([{ input: overlay, left: 0, top: 0 }]).png().toFile(outPng);
  await fs.writeFile(outSvg, svg.trim());
  console.log(outPng);
  console.log(outSvg);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
