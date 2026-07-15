import type { ImageGenerationResult, StudyCoverOverlaySpec } from '@/lib/media/types';

const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1448;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(value: string | null | undefined, maxChars: number): string {
  return String(value || '')
    .replace(/\b([A-Za-z])_\{([^}]+)\}/g, '$1($2)')
    .replace(/\b([A-Za-z])_([A-Za-z0-9]+)/g, '$1($2)')
    .replace(/\\(?:to|rightarrow)/g, '→')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\(?:\(|\))/g, '')
    .replace(/\\/g, '')
    .replace(/\$+/g, '')
    .replace(/同敛散/g, '敛散性相同')
    .replace(/a\(n\)=f\(n\)，且 f 在 \[1,∞\) 连续、为正、递减/g, 'a(n)=f(n)；f 连续、正、递减')
    .replace(/正项级数，且能找到已知敛散性的基准级数/g, '非负连续函数 f(x)≤g(x)，比较反常积分')
    .replace(
      /0≤a\(n\)≤b\(n\) 迁移收敛结论，用 0≤b\(n\)≤a\(n\) 迁移发散结论/g,
      '小积分发散则大积分发散；大积分收敛则小积分收敛',
    )
    .replace(
      /证收敛找更大的收敛级数；证发散找更小的发散级数。/g,
      '0≤f≤g：f 发散则 g 发散；g 收敛则 f 收敛。',
    )
    .replace(/用 小积分/g, '小积分')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function textUnits(value: string): number {
  return Array.from(value).reduce((sum, char) => sum + (/^[\x00-\xff]$/.test(char) ? 0.58 : 1), 0);
}

function wrapText(value: string, maxUnits: number, maxLines = 2): string[] {
  const chars = Array.from(value);
  const lines: string[] = [];
  let current = '';
  for (const char of chars) {
    if (current && textUnits(current + char) > maxUnits) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines - 1) break;
    } else {
      current += char;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function tspans(lines: string[], x: number, lineHeight: number): string {
  return lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
}

function methodEnglish(label: string): string {
  const normalized = label.replace(/\s+/g, '').toLowerCase();
  if (normalized.includes('发散判别') || normalized.includes('divergence')) {
    return 'Divergence Test';
  }
  if (normalized.includes('积分判别') || normalized.includes('integral')) return 'Integral Test';
  if (normalized.includes('比较法') || normalized.includes('比较判别')) return 'Comparison Test';
  if (normalized.includes('比值判别') || normalized.includes('ratio')) return 'Ratio Test';
  return '';
}

function normalizeSpec(spec: StudyCoverOverlaySpec): StudyCoverOverlaySpec {
  return {
    title: cleanText(spec.title, 64) || '学习概览',
    courseLabel: cleanText(spec.courseLabel, 24),
    routeTitle: cleanText(spec.routeTitle, 18) || '知识路线',
    routeItems: (spec.routeItems || [])
      .map((item) => cleanText(item, 36))
      .filter(Boolean)
      .slice(0, 5),
    sideTitle: cleanText(spec.sideTitle, 18),
    sideItems: (spec.sideItems || [])
      .map((item) => cleanText(item, 46))
      .filter(Boolean)
      .slice(0, 4),
    footerTitle: cleanText(spec.footerTitle, 18) || '复习提醒',
    footerText: cleanText(spec.footerText, 72) || '先看条件，再下结论。',
    definition: cleanText(spec.definition, 220),
    methods: (spec.methods || [])
      .map((item) => ({
        name: cleanText(item.name, 28),
        trigger: cleanText(item.trigger, 90),
        rule: cleanText(item.rule, 120),
        boundary: cleanText(item.boundary, 90),
      }))
      .filter((item) => item.name && item.rule)
      .slice(0, 5),
    keyPoints: (spec.keyPoints || [])
      .map((item) => ({
        title: cleanText(item.title, 24),
        detail: cleanText(item.detail, 130),
      }))
      .filter((item) => item.title && item.detail)
      .slice(0, 5),
    learningSteps: (spec.learningSteps || [])
      .map((item) => cleanText(item, 100))
      .filter(Boolean)
      .slice(0, 6),
    keywords: (spec.keywords || [])
      .map((item) => cleanText(item, 36))
      .filter(Boolean)
      .slice(0, 12),
  };
}

function denseStudyCoverOverlaySvg(
  spec: StudyCoverOverlaySpec,
  width: number,
  height: number,
): string {
  const sx = width / DEFAULT_WIDTH;
  const sy = height / DEFAULT_HEIGHT;
  const colors = ['#eef7df', '#e7f0fa', '#fff1c6', '#f8e2e7', '#eee5f7'];
  const methods = (spec.methods || []).slice(0, 4);
  const keyPoints = spec.keyPoints?.length
    ? spec.keyPoints.slice(0, 4)
    : (spec.sideItems || []).slice(0, 4).map((item, index) => {
        const [title, ...detail] = item.split(/[：:]/);
        return { title: title || `关键点 ${index + 1}`, detail: detail.join('：') || item };
      });
  const learningSteps = (spec.learningSteps || []).slice(0, 5);
  const keywords = Array.from(
    new Set([
      ...(spec.keywords || []),
      ...methods.flatMap((method) => [method.name, methodEnglish(method.name)]),
    ]),
  )
    .filter(Boolean)
    .slice(0, 10);
  const titleSize = spec.title.length > 34 ? 37 : spec.title.length > 22 ? 45 : 56;
  const definitionLines = wrapText(spec.definition || spec.footerText, 61, 2);

  const methodCards = methods
    .map((method, index) => {
      const x = 40 + index * 154;
      const trigger = wrapText(method.trigger, 9.3, 3);
      const rule = wrapText(method.rule, 9.3, 4);
      const boundary = wrapText(method.boundary || '按条件判断', 11.5, 3);
      return `
        <g>
          <rect x="${x}" y="270" width="142" height="286" rx="14" fill="#ffffff" stroke="#64748b" stroke-width="1.5"/>
          <rect x="${x}" y="270" width="142" height="48" rx="14" fill="${colors[index]}"/>
          <rect x="${x}" y="302" width="142" height="16" fill="${colors[index]}"/>
          <circle cx="${x + 19}" cy="294" r="12" fill="#ffffff" stroke="#64748b"/>
          <text x="${x + 19}" y="300" text-anchor="middle" font-size="15" font-weight="700" fill="#334155">${index + 1}</text>
          <text x="${x + 38}" y="301" font-size="18" font-weight="800" fill="#172033">${escapeXml(method.name)}</text>
          <text x="${x + 12}" y="340" font-size="12" font-weight="700" fill="#64748b">${escapeXml(methodEnglish(method.name) || 'METHOD')}</text>
          <text x="${x + 12}" y="368" font-size="14" font-weight="800" fill="#334155">何时考虑</text>
          <text x="${x + 12}" y="390" font-size="13.5" font-weight="500" fill="#334155">${tspans(trigger, x + 12, 19)}</text>
          <line x1="${x + 12}" y1="445" x2="${x + 130}" y2="445" stroke="#cbd5e1"/>
          <text x="${x + 12}" y="468" font-size="14" font-weight="800" fill="#334155">规则与结论</text>
          <text x="${x + 12}" y="490" font-size="13" font-weight="500" fill="#334155">${tspans(rule, x + 12, 18)}</text>
          <rect x="${x + 8}" y="508" width="126" height="42" rx="8" fill="#fff7d6"/>
          <text x="${x + 14}" y="524" font-size="10.5" font-weight="600" fill="#7c5b16">${tspans(boundary, x + 14, 12)}</text>
        </g>`;
    })
    .join('');

  const keyPointCards = keyPoints
    .map((item, index) => {
      const y = 264 + index * 92;
      const detailLines = wrapText(item.detail, 16.5, 3);
      return `
        <rect x="674" y="${y}" width="310" height="80" rx="11" fill="${colors[index]}" stroke="#94a3b8"/>
        <circle cx="695" cy="${y + 22}" r="10" fill="#ffffff" stroke="#64748b"/>
        <text x="695" y="${y + 27}" text-anchor="middle" font-size="13" font-weight="700" fill="#334155">${index + 1}</text>
        <text x="714" y="${y + 25}" font-size="17" font-weight="800" fill="#1e293b">${escapeXml(item.title)}</text>
        <text x="694" y="${y + 49}" font-size="13.5" font-weight="500" fill="#334155">${tspans(detailLines, 694, 17)}</text>`;
    })
    .join('');

  const stepCards = (
    learningSteps.length
      ? learningSteps
      : ['先读定义', '检查必要条件', '匹配方法', '写出结论', '回看边界']
  )
    .slice(0, 5)
    .map((step, index) => {
      const x = 40 + index * 123;
      const lines = wrapText(step, 7.2, 4);
      return `
        <rect x="${x}" y="652" width="112" height="130" rx="12" fill="#ffffff" stroke="#cbd5e1"/>
        <circle cx="${x + 56}" cy="676" r="16" fill="${colors[index]}" stroke="#64748b"/>
        <text x="${x + 56}" y="682" text-anchor="middle" font-size="16" font-weight="800" fill="#334155">${index + 1}</text>
        <text x="${x + 12}" y="712" font-size="13.5" font-weight="600" fill="#334155">${tspans(lines, x + 12, 18)}</text>`;
    })
    .join('');

  const comparisonRows = methods
    .map((method, index) => {
      const y = 917 + index * 86;
      return `
        <rect x="40" y="${y}" width="614" height="86" fill="${index % 2 ? '#ffffff' : '#f7f9fc'}"/>
        <text x="50" y="${y + 28}" font-size="14.5" font-weight="800" fill="#1e293b">${tspans(wrapText(method.name, 6.8, 2), 50, 17)}</text>
        <text x="165" y="${y + 24}" font-size="12.5" font-weight="500" fill="#334155">${tspans(wrapText(method.trigger, 10.2, 3), 165, 16)}</text>
        <text x="345" y="${y + 24}" font-size="12.5" font-weight="500" fill="#334155">${tspans(wrapText(method.rule, 9, 4), 345, 15)}</text>
        <text x="505" y="${y + 24}" font-size="12" font-weight="500" fill="#7c2d12">${tspans(wrapText(method.boundary || '核对适用条件', 8, 4), 505, 15)}</text>`;
    })
    .join('');

  const summaryLines = wrapText(spec.definition || spec.footerText, 17, 7);
  const keywordItems = keywords
    .map((keyword, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 692 + column * 142;
      const y = 1040 + row * 38;
      return `<rect x="${x}" y="${y - 22}" width="130" height="29" rx="8" fill="${colors[index % colors.length]}"/><text x="${x + 10}" y="${y - 2}" font-size="12.5" font-weight="600" fill="#334155">${escapeXml(keyword)}</text>`;
    })
    .join('');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}">
    <g transform="scale(${sx} ${sy})" font-family="Hiragino Sans GB, Heiti SC, sans-serif">
      <rect x="20" y="18" width="984" height="1412" rx="20" fill="#fffefa" stroke="#d8dee7" stroke-width="2"/>
      <text x="40" y="76" font-size="18" font-weight="700" fill="#64748b">${escapeXml(spec.courseLabel || '学习资料速查')}</text>
      <text x="40" y="136" font-size="${titleSize}" font-weight="800" fill="#111827">${escapeXml(spec.title)}</text>
      <path d="M40 158 H984" stroke="#c8b7e8" stroke-width="10" stroke-linecap="round" opacity="0.75"/>
      <text x="40" y="190" font-size="16.5" font-weight="500" fill="#475569">${tspans(definitionLines, 40, 21)}</text>

      <rect x="40" y="220" width="238" height="34" rx="10" fill="#e8f4df"/>
      <text x="53" y="244" font-size="18" font-weight="800" fill="#243448">1. 方法框架与判定流程</text>
      ${methodCards}
      <rect x="54" y="570" width="586" height="29" rx="9" fill="#fff0a8"/>
      <text x="347" y="590" text-anchor="middle" font-size="14" font-weight="700" fill="#5f4a18">先检查条件 → 选择判别法 → 写出结论 → 记录无结论边界</text>

      <rect x="674" y="220" width="250" height="34" rx="10" fill="#e4edf8"/>
      <text x="687" y="244" font-size="18" font-weight="800" fill="#243448">2. 关键条件与边界</text>
      ${keyPointCards}

      <rect x="40" y="610" width="210" height="34" rx="10" fill="#f0e8fa"/>
      <text x="53" y="634" font-size="18" font-weight="800" fill="#243448">3. 五步复习路线</text>
      ${stepCards}

      <rect x="40" y="824" width="210" height="34" rx="10" fill="#e4edf8"/>
      <text x="53" y="848" font-size="18" font-weight="800" fill="#243448">4. 四方法对照表</text>
      <rect x="40" y="872" width="614" height="45" fill="#eaf0f6" stroke="#94a3b8"/>
      <text x="50" y="900" font-size="13" font-weight="800" fill="#334155">方法</text>
      <text x="165" y="900" font-size="13" font-weight="800" fill="#334155">何时考虑</text>
      <text x="345" y="900" font-size="13" font-weight="800" fill="#334155">规则 / 结论</text>
      <text x="505" y="900" font-size="13" font-weight="800" fill="#7c2d12">边界</text>
      <rect x="40" y="917" width="614" height="344" fill="none" stroke="#94a3b8"/>
      ${comparisonRows}

      <rect x="674" y="660" width="310" height="270" rx="16" fill="#fff2a8" stroke="#b6a45a"/>
      <text x="692" y="692" font-size="18" font-weight="800" fill="#3f3a24">5. 一句话总览</text>
      <text x="692" y="726" font-size="14.5" font-weight="500" fill="#4b4630">${tspans(summaryLines, 692, 21)}</text>

      <rect x="674" y="956" width="310" height="305" rx="16" fill="#ffffff" stroke="#94a3b8" stroke-dasharray="7 6"/>
      <text x="692" y="990" font-size="18" font-weight="800" fill="#243448">6. 可检索关键词</text>
      ${keywordItems}

      <rect x="40" y="1328" width="944" height="56" rx="16" fill="#e9f2fb"/>
      <text x="62" y="1363" font-size="17" font-weight="700" fill="#334155">学习提示：${escapeXml(spec.footerText)}</text>
    </g>
  </svg>`;
}

export function studyCoverOverlaySvg(
  rawSpec: StudyCoverOverlaySpec,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): string {
  const spec = normalizeSpec(rawSpec);
  if ((spec.methods?.length || 0) >= 2) {
    return denseStudyCoverOverlaySvg(spec, width, height);
  }
  const sx = width / DEFAULT_WIDTH;
  const sy = height / DEFAULT_HEIGHT;
  const routeColors = ['#fff0a8', '#dcefd2', '#dceaf8', '#f5d9df', '#eadcf7'];
  const titleSize = spec.title.length > 34 ? 44 : spec.title.length > 22 ? 52 : 66;
  const routeItems = spec.routeItems.length
    ? spec.routeItems
    : ['资料总览', '核心概念', '方法与证据'];
  const routeCards = routeItems
    .map((item, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 80 + column * 282;
      const y = 302 + row * 138;
      const lines = wrapText(item, 10.5, 2);
      return `
        <g>
          <rect x="${x}" y="${y}" width="250" height="104" rx="18" fill="${routeColors[index]}" stroke="#536273" stroke-width="2"/>
          <circle cx="${x + 28}" cy="${y + 28}" r="15" fill="#ffffff" stroke="#536273" stroke-width="1.5"/>
          <text x="${x + 28}" y="${y + 35}" text-anchor="middle" font-size="20" font-weight="700" fill="#334155">${index + 1}</text>
          <text x="${x + 125}" y="${y + (lines.length === 1 ? 62 : 48)}" text-anchor="middle" font-size="28" font-weight="700" fill="#172033">${tspans(lines, x + 125, 34)}</text>
        </g>`;
    })
    .join('');

  const sideItems = (spec.sideItems || [])
    .map((item, index) => {
      const y = 326 + index * 88;
      const lines = wrapText(item, 10.5, 3);
      return `
        <circle cx="690" cy="${y - 6}" r="6" fill="${routeColors[index % routeColors.length]}" stroke="#536273" stroke-width="1.5"/>
        <text x="710" y="${y}" font-size="20" font-weight="600" fill="#253246">${tspans(lines, 710, 26)}</text>`;
    })
    .join('');

  const comparisonRows = routeItems.slice(0, 5).map((item, index) => {
    const y = 792 + index * 64;
    const english = methodEnglish(item);
    return `
      <rect x="80" y="${y - 36}" width="864" height="58" fill="${index % 2 ? '#fbfcfe' : '#f4f7fa'}"/>
      <circle cx="108" cy="${y - 7}" r="7" fill="${routeColors[index]}" stroke="#536273" stroke-width="1"/>
      <text x="128" y="${y}" font-size="24" font-weight="700" fill="#1e293b">${escapeXml(item)}</text>
      <text x="598" y="${y}" font-size="20" font-weight="500" fill="#64748b">${escapeXml(english || `步骤 ${index + 1}`)}</text>`;
  });
  const comparisonHeight = Math.max(224, routeItems.slice(0, 5).length * 64 + 54);
  const footerY = Math.min(1240, 742 + comparisonHeight + 46);
  const footerLines = wrapText(spec.footerText, 34, 2);

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}">
    <g transform="scale(${sx} ${sy})">
      <rect x="34" y="28" width="956" height="1390" rx="26" fill="#fffefa" fill-opacity="0.965" stroke="#d8dee7" stroke-width="2"/>
      <path d="M78 188 C310 198 565 183 940 193" fill="none" stroke="#c8b7e8" stroke-width="12" stroke-linecap="round" opacity="0.72"/>
      <text x="80" y="116" font-size="${titleSize}" font-weight="800" fill="#111827">${escapeXml(spec.title)}</text>
      ${spec.courseLabel ? `<rect x="80" y="139" width="${Math.max(136, spec.courseLabel.length * 24 + 42)}" height="38" rx="19" fill="#dbeafe"/><text x="101" y="166" font-size="22" font-weight="700" fill="#1e4f7a">${escapeXml(spec.courseLabel)}</text>` : ''}

      <rect x="80" y="224" width="184" height="46" rx="14" fill="#e8f4df"/>
      <text x="102" y="256" font-size="25" font-weight="800" fill="#243448">${escapeXml(spec.routeTitle)}</text>
      <path d="M282 248 H614" stroke="#94a3b8" stroke-width="2" stroke-dasharray="7 7"/>
      ${routeCards}

      <rect x="650" y="224" width="294" height="420" rx="20" fill="#ffffff" stroke="#94a3b8" stroke-width="2" stroke-dasharray="8 7"/>
      <rect x="672" y="246" width="186" height="44" rx="12" fill="#e4edf8"/>
      <text x="692" y="277" font-size="24" font-weight="800" fill="#243448">${escapeXml(spec.sideTitle || '关键边界')}</text>
      ${sideItems}

      <rect x="80" y="704" width="864" height="${comparisonHeight}" rx="20" fill="#ffffff" stroke="#aab4c2" stroke-width="2"/>
      <rect x="80" y="704" width="864" height="58" rx="20" fill="#f0e8fa"/>
      <rect x="80" y="742" width="864" height="20" fill="#f0e8fa"/>
      <text x="108" y="742" font-size="26" font-weight="800" fill="#243448">方法索引</text>
      <text x="598" y="742" font-size="20" font-weight="700" fill="#64748b">检索关键词</text>
      ${comparisonRows.join('')}

      <rect x="80" y="${footerY}" width="864" height="144" rx="22" fill="#fff2a8" stroke="#b6a45a" stroke-width="2"/>
      <path d="M790 ${footerY} h154 v44 l-44 -44z" fill="#ffe57c" opacity="0.8"/>
      <text x="112" y="${footerY + 46}" font-size="26" font-weight="800" fill="#3f3a24">${escapeXml(spec.footerTitle)}</text>
      <text x="112" y="${footerY + 88}" font-size="25" font-weight="600" fill="#4b4630">${tspans(footerLines, 112, 34)}</text>

      <circle cx="936" cy="1328" r="20" fill="#dceaf8"/>
      <path d="M925 1328 l8 8 l15 -18" fill="none" stroke="#35536f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

export async function compositeStudyCoverBuffer(args: {
  source: Buffer;
  spec: StudyCoverOverlaySpec;
  width?: number;
  height?: number;
}): Promise<Buffer> {
  const width = args.width || DEFAULT_WIDTH;
  const height = args.height || DEFAULT_HEIGHT;
  const sharp = (await import('sharp')).default;
  const base = await sharp(args.source)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: Buffer.from(studyCoverOverlaySvg(args.spec, width, height)) }])
    .png()
    .toBuffer();
}

export async function compositeStudyCoverResult(
  result: ImageGenerationResult,
  spec: StudyCoverOverlaySpec,
): Promise<ImageGenerationResult> {
  if (!result.base64) return result;
  const source = Buffer.from(
    result.base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''),
    'base64',
  );
  const width = result.width || DEFAULT_WIDTH;
  const height = result.height || DEFAULT_HEIGHT;
  const composed = await compositeStudyCoverBuffer({ source, spec, width, height });
  return {
    ...result,
    url: undefined,
    base64: `data:image/png;base64,${composed.toString('base64')}`,
    width,
    height,
  };
}
