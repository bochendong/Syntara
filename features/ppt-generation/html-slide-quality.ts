export function visibleTextFromHtmlDocument(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasCoverVisualBackground(html: string): boolean {
  const text = html.toLowerCase();
  const hasBuiltInImage = /\/slide-backgrounds\/|built_in_hero_background/.test(text);
  const hasGradient = /\b(?:linear|radial|conic)-gradient\s*\(/i.test(html);
  const hasBackgroundImage = /background(?:-image)?\s*:\s*(?!\s*(?:#fff|#ffffff|white)\b)/i.test(
    html,
  );
  const hasVisualLayer =
    /class=["'][^"']*(?:hero|cover|visual|backdrop|glow|mesh|grid|network|poster|cinematic)[^"']*["']/i.test(
      html,
    );
  return hasBuiltInImage || hasGradient || (hasBackgroundImage && hasVisualLayer);
}

export function hasBuiltInCoverImage(html: string): boolean {
  return /(?:<img\b[^>]*\bsrc\s*=\s*["']\/slide-backgrounds\/|url\(\s*["']?\/slide-backgrounds\/)/i.test(
    html,
  );
}

export function hasExternalCoverAsset(html: string): boolean {
  return (
    /\b(?:src|href)\s*=\s*["']https?:\/\//i.test(html) || /url\(\s*["']?https?:\/\//i.test(html)
  );
}

export function hasForbiddenCoverVisibleText(visibleText: string): boolean {
  return /(?:notebook\s*封面|封面页|标题页|cover\s*(?:page|slide|visual)?|main\s*visual|background|placeholder|主视觉|背景)/i.test(
    visibleText,
  );
}

export function hasCoverTitleCardShell(html: string): boolean {
  const normalized = html.replace(/\s+/g, ' ');
  const classMatch =
    /class=["'][^"']*(?:title-card|title-panel|hero-card|hero-panel|cover-card|cover-panel|glass-card|glass-panel|text-card|text-panel|content-card|content-panel|title-box|hero-box|cover-box)[^"']*["']/i.test(
      normalized,
    );
  const styleMatch =
    /(?:title|hero|cover|text|content)[\w-]*(?:card|panel|surface|box)[^{]*\{[^}]*?(?:backdrop-filter|background\s*:\s*rgba|border-radius\s*:\s*(?:2[4-9]|[3-9]\d)px)/i.test(
      normalized,
    ) ||
    /(?:card|panel|surface|box)[\w-]*(?:title|hero|cover|text|content)[^{]*\{[^}]*?(?:backdrop-filter|background\s*:\s*rgba|border-radius\s*:\s*(?:2[4-9]|[3-9]\d)px)/i.test(
      normalized,
    );
  const inlinePanelMatch =
    /<(?:div|section|article)[^>]*style=["'][^"']*(?:backdrop-filter|background\s*:\s*rgba)[^"']*border-radius\s*:\s*(?:2[4-9]|[3-9]\d)px/i.test(
      normalized,
    ) ||
    /<(?:div|section|article)[^>]*style=["'][^"']*border-radius\s*:\s*(?:2[4-9]|[3-9]\d)px[^"']*(?:backdrop-filter|background\s*:\s*rgba)/i.test(
      normalized,
    );
  return classMatch || styleMatch || inlinePanelMatch;
}

export function getCoverQualityRisks(
  html: string,
  visibleText = visibleTextFromHtmlDocument(html),
) {
  const risks: string[] = [];

  if (!hasBuiltInCoverImage(html)) {
    risks.push('封面没有使用 /slide-backgrounds/ 本地背景图。');
  }
  if (!hasCoverVisualBackground(html)) {
    risks.push('封面缺少明确 hero/cover/visual 背景层。');
  }
  if (hasExternalCoverAsset(html)) {
    risks.push('封面引用了外部 http(s) 素材。');
  }
  if (hasForbiddenCoverVisibleText(visibleText)) {
    risks.push('封面可见文案包含 cover/background/placeholder/封面页 等占位词。');
  }
  if (hasCoverTitleCardShell(html)) {
    risks.push('封面标题被放进 title/card/panel/glass/content box，而不是直接叠在主视觉上。');
  }

  return Array.from(new Set(risks)).slice(0, 5);
}
