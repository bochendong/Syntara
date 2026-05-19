import type { HtmlCourseRoute } from './types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractCoverTitle(prompt: string, densityContract?: string): string {
  const joined = [densityContract || '', prompt].join('\n');
  const patterns = [
    /Mandatory visible content:\s*exact title\s*["“]([^"”]+)["”]/i,
    /页面标题[:：]\s*([^\n]+)/,
    /Slide\s+\d+\/\d+:\s*([^\n]+)/i,
    /主标题[「:：]\s*([^」\n]+)/,
    /title=\{([^}]+)\}/i,
    /主题[:：]\s*([^\n]+)/,
  ];
  for (const pattern of patterns) {
    const match = joined.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1]
        .replace(/[。；;]$/g, '')
        .trim()
        .slice(0, 90);
    }
  }
  return 'Untitled';
}

function detectCoverTemplate(args: {
  pageKind?: string;
  prompt: string;
  densityContract?: string;
  courseRoute: HtmlCourseRoute;
}): 'tech' | 'cinematic' | 'academic' | 'image' | null {
  if (args.pageKind !== 'cover') return null;
  const text = [args.prompt, args.densityContract || '', args.courseRoute].join('\n').toLowerCase();
  if (/cinematic_title_frame/.test(text)) return 'cinematic';
  if (/tech_hero_title/.test(text) || args.courseRoute === 'computer-science') return 'tech';
  if (
    /academic_hero_cover/.test(text) ||
    args.courseRoute === 'math' ||
    args.courseRoute === 'science'
  ) {
    return 'academic';
  }
  if (/image_title_overlay|\/slide-backgrounds\/|封面背景|主视觉/.test(text)) return 'image';
  return null;
}

function extractCoverSubtitle(args: {
  prompt: string;
  densityContract?: string;
  title: string;
  template: 'tech' | 'cinematic' | 'academic' | 'image';
  courseRoute: HtmlCourseRoute;
}): string {
  const joined = [args.prompt, args.densityContract || ''].join('\n');
  const explicit =
    joined.match(/副标题[:：]\s*([^\n]+)/)?.[1]?.trim() ||
    joined.match(/subtitle[:：]\s*([^\n]+)/i)?.[1]?.trim() ||
    joined.match(/\\text\{([^}]+)\}/)?.[1]?.trim();
  if (explicit && !/可选|optional|最多|omit|省略|placeholder|封面|背景|主视觉/i.test(explicit)) {
    return explicit.replace(/^[-•]\s*/, '').slice(0, 80);
  }
  if (/inheritance|继承/i.test(args.title) || /inheritance|继承/i.test(joined)) {
    return '继承、内存模型与多态接口';
  }
  if (args.courseRoute === 'computer-science') {
    return '对象模型、接口与状态设计';
  }
  if (args.template === 'tech') {
    return /[a-z]/i.test(args.title)
      ? 'Complete guide to pricing, features and best value.'
      : '用一页建立主题、结构和判断主线';
  }
  if (args.template === 'cinematic') {
    return '把画面、人物和主题放回同一条叙事线';
  }
  if (args.template === 'academic') {
    return '从关键对象进入结构化理解';
  }
  return '建立主题边界，进入正文之前先看清主线';
}

export function buildBuiltInCoverHtml(args: {
  pageKind?: string;
  prompt: string;
  densityContract?: string;
  courseRoute: HtmlCourseRoute;
}): string | null {
  const template = detectCoverTemplate(args);
  if (!template) return null;
  const title = extractCoverTitle(args.prompt, args.densityContract);
  const subtitle = extractCoverSubtitle({
    prompt: args.prompt,
    densityContract: args.densityContract,
    title,
    template,
    courseRoute: args.courseRoute,
  });
  const config = {
    tech: {
      src: '/slide-backgrounds/product-launch-dark-photo.png',
      fallback: '#080a12',
      titleColor: '#ffffff',
      bodyColor: 'rgba(248,250,252,.84)',
      accent: 'rgba(249,115,22,.72)',
      shade: 'rgba(2,6,23,.38)',
      align: 'center',
    },
    cinematic: {
      src: '/slide-backgrounds/cinematic-stage-photo.png',
      fallback: '#130d23',
      titleColor: '#d6a84f',
      bodyColor: 'rgba(248,250,252,.84)',
      accent: 'rgba(214,168,79,.62)',
      shade: 'rgba(5,5,15,.42)',
      align: 'center',
    },
    academic: {
      src: '/slide-backgrounds/academic-blueprint-photo.png',
      fallback: '#eef5ff',
      titleColor: '#17365d',
      bodyColor: '#38516f',
      accent: 'rgba(37,99,235,.72)',
      shade: 'rgba(255,255,255,.42)',
      align: 'center',
    },
    image: {
      src: '/slide-backgrounds/lecture-hall-photo.png',
      fallback: '#14213d',
      titleColor: '#ffffff',
      bodyColor: 'rgba(248,250,252,.86)',
      accent: 'rgba(214,90,49,.78)',
      shade: 'rgba(2,6,23,.36)',
      align: 'left',
    },
  }[template];
  const isLeft = config.align === 'left';
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const titleSize = title.replace(/\s+/g, '').length > 34 ? 68 : 76;
  const contentLeft = isLeft ? '120px' : '50%';
  const transform = isLeft ? 'translateY(-50%)' : 'translate(-50%, -50%)';
  const width = isLeft ? '760px' : '1040px';
  const textAlign = isLeft ? 'left' : 'center';
  const cinematicCorners =
    template === 'cinematic'
      ? '<div class="corner-a" aria-hidden="true"></div><div class="corner-b" aria-hidden="true"></div>'
      : '';
  const subtitleHtml = safeSubtitle ? `<p class="subtitle">${safeSubtitle}</p>` : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1600, initial-scale=1" />
  <style>
    html, body {
      width: 1600px;
      height: 900px;
      margin: 0;
      overflow: hidden;
      background: ${config.fallback};
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .slide {
      position: relative;
      width: 1600px;
      height: 900px;
      overflow: hidden;
      background: ${config.fallback};
      color: ${config.titleColor};
      box-sizing: border-box;
    }
    .built-in-hero-background {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .slide::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(2,6,23,.20), ${config.shade} 46%, rgba(2,6,23,.18)),
        radial-gradient(circle at 50% 44%, rgba(2,6,23,.70) 0%, rgba(2,6,23,.42) 30%, rgba(2,6,23,.08) 68%);
    }
    .center-veil {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 43%;
      width: 28%;
      background: linear-gradient(90deg, rgba(2,6,23,.08), rgba(2,6,23,.40), rgba(2,6,23,.08));
    }
    .top-rule {
      position: absolute;
      left: 48px;
      right: 48px;
      top: 92px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.38), transparent);
    }
    .corner-a, .corner-b {
      position: absolute;
      width: 118px;
      height: 118px;
      border-color: ${config.accent};
      opacity: .68;
    }
    .corner-a { left: 42px; top: 42px; border-left: 2px solid; border-top: 2px solid; }
    .corner-b { right: 42px; bottom: 42px; border-right: 2px solid; border-bottom: 2px solid; }
    .hero-copy {
      position: absolute;
      left: ${contentLeft};
      top: 50%;
      width: ${width};
      transform: ${transform};
      text-align: ${textAlign};
      z-index: 2;
    }
    h1 {
      margin: 0;
      color: ${config.titleColor};
      font-size: ${titleSize}px;
      line-height: 1.12;
      font-weight: 860;
      letter-spacing: 0;
      text-shadow: 0 22px 52px rgba(0,0,0,.42);
    }
    .subtitle {
      margin: 42px auto 0;
      max-width: 680px;
      color: ${config.bodyColor};
      font-size: 24px;
      line-height: 1.38;
      font-weight: 650;
      letter-spacing: 0;
      text-shadow: 0 12px 32px rgba(0,0,0,.40);
    }
  </style>
</head>
<body>
  <section class="slide">
    <img class="built-in-hero-background" src="${config.src}" alt="" />
    <div class="center-veil" aria-hidden="true"></div>
    <div class="top-rule" aria-hidden="true"></div>
    ${cinematicCorners}
    <div class="hero-copy">
      <h1>${safeTitle}</h1>
      ${subtitleHtml}
    </div>
  </section>
</body>
</html>`;
}
