export function extractHtml(text: string): string {
  const withoutFence = text
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const match = withoutFence.match(/(?:<!doctype html>\s*)?<html\b[\s\S]*<\/html>/i);
  return (match?.[0] || withoutFence).trim();
}

export function sanitizeHtml(html: string): string {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[\s\S]*?\/?>/gi, '')
    .replace(/<form\b[\s\S]*?<\/form>/gi, '')
    .replace(/<base\b[\s\S]*?\/?>/gi, '')
    .replace(/<link\b[\s\S]*?\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*'javascript:[^']*'/gi, '')
    .trim();

  if (/<html\b/i.test(cleaned) && /<\/html>$/i.test(cleaned)) {
    return cleaned;
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>生成的 HTML PPT 页面</title>
</head>
<body>${cleaned}</body>
</html>`;
}

export function countMathBlocks(html: string): number {
  return html.match(/<math(?:\s|>)/gi)?.length || 0;
}

export function getVisibleText(html: string): string {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getStyleText(html: string): string {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1])
    .join('\n');
}
