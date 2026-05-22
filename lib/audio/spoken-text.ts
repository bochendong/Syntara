import type { Action, SpeechAction } from '@/lib/types/action';
import { normalizeLatexSource } from '@/lib/latex-utils';

export type SpokenNarrationLanguage = 'zh-CN' | 'en-US';

const CJK_CHAR_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const SIMPLE_TOKEN_PATTERN = String.raw`(?:[\p{L}\p{N}π∞]+(?:\s*[\^_]\s*\{?[\p{L}\p{N}π∞+\-]+\}?)?|\([^()]+\)|\[[^\]]+\]|\{[^{}]+\})`;
const SIMPLE_FORMULA_PATTERN = String.raw`(?:${SIMPLE_TOKEN_PATTERN}(?:\s*[+\-*/]\s*${SIMPLE_TOKEN_PATTERN})*)`;

const LATEX_COMMAND_MAP: Record<string, Record<SpokenNarrationLanguage, string>> = {
  '\\alpha': { 'zh-CN': 'alpha', 'en-US': 'alpha' },
  '\\beta': { 'zh-CN': 'beta', 'en-US': 'beta' },
  '\\theta': { 'zh-CN': 'theta', 'en-US': 'theta' },
  '\\pi': { 'zh-CN': '派', 'en-US': 'pi' },
  '\\infty': { 'zh-CN': '无穷', 'en-US': 'infinity' },
  '\\times': { 'zh-CN': '乘以', 'en-US': 'times' },
  '\\cdot': { 'zh-CN': '乘以', 'en-US': 'times' },
  '\\div': { 'zh-CN': '除以', 'en-US': 'divided by' },
  '\\pm': { 'zh-CN': '正负', 'en-US': 'plus or minus' },
  '\\neq': { 'zh-CN': '不等于', 'en-US': 'does not equal' },
  '\\leq': { 'zh-CN': '小于等于', 'en-US': 'is less than or equal to' },
  '\\geq': { 'zh-CN': '大于等于', 'en-US': 'is greater than or equal to' },
};

function inferNarrationLanguage(text: string): SpokenNarrationLanguage {
  return CJK_CHAR_REGEX.test(text) ? 'zh-CN' : 'en-US';
}

function cleanupMathToken(token: string): string {
  return token
    .trim()
    .replace(/^\{|\}$/g, '')
    .replace(/^\(|\)$/g, '')
    .trim();
}

function cleanupSpokenText(text: string): string {
  return text
    .replace(/\$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([，。！？；：,.!?;:])/g, '$1')
    .replace(/([（(])\s+/g, '$1')
    .replace(/\s+([）)])/g, '$1')
    .trim();
}

function stripOuterBrackets(token: string): string {
  const trimmed = token.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('(') && trimmed.endsWith(')')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function replaceBinaryOperator(text: string, operatorPattern: string, spoken: string): string {
  const regex = new RegExp(
    `(${SIMPLE_TOKEN_PATTERN})\\s*(?:${operatorPattern})\\s*(${SIMPLE_TOKEN_PATTERN})`,
    'gu',
  );

  let previous = text;
  let next = text.replace(regex, (_match, left: string, right: string) => {
    return `${left} ${spoken} ${right}`;
  });

  while (next !== previous) {
    previous = next;
    next = next.replace(regex, (_match, left: string, right: string) => {
      return `${left} ${spoken} ${right}`;
    });
  }

  return next;
}

function formatPower(base: string, exponent: string, language: SpokenNarrationLanguage): string {
  const normalizedBase = cleanupMathToken(base);
  const normalizedExponent = cleanupMathToken(exponent);

  if (language === 'zh-CN') {
    if (normalizedExponent === '2') return `${normalizedBase}的平方`;
    return `${normalizedBase}的${normalizedExponent}次方`;
  }

  if (normalizedExponent === '2') return `${normalizedBase} squared`;
  if (normalizedExponent === '3') return `${normalizedBase} cubed`;
  return `${normalizedBase} to the power of ${normalizedExponent}`;
}

function formatFraction(
  numerator: string,
  denominator: string,
  language: SpokenNarrationLanguage,
): string {
  const top = cleanupMathToken(numerator);
  const bottom = cleanupMathToken(denominator);
  return language === 'zh-CN' ? `${bottom}分之${top}` : `${top} over ${bottom}`;
}

function formatRoot(
  radicand: string,
  degree: string | undefined,
  language: SpokenNarrationLanguage,
): string {
  const normalizedRadicand = cleanupMathToken(radicand);
  const normalizedDegree = degree ? cleanupMathToken(degree) : '';
  if (language === 'zh-CN') {
    if (!normalizedDegree) return `根号${normalizedRadicand}`;
    if (normalizedDegree === '3') return `${normalizedRadicand}的立方根`;
    return `${normalizedRadicand}的${normalizedDegree}次方根`;
  }

  if (!normalizedDegree) return `the square root of ${normalizedRadicand}`;
  if (normalizedDegree === '3') return `the cube root of ${normalizedRadicand}`;
  return `the ${normalizedDegree}th root of ${normalizedRadicand}`;
}

function formatIntegral(
  integrand: string,
  respectTo: string | undefined,
  language: SpokenNarrationLanguage,
  lowerBound?: string,
  upperBound?: string,
): string {
  const normalizedIntegrand = verbalizeMathText(stripOuterBrackets(integrand), language);
  const normalizedRespectTo = respectTo
    ? verbalizeMathText(stripOuterBrackets(respectTo), language)
    : '';
  const normalizedLower = lowerBound
    ? verbalizeMathText(stripOuterBrackets(lowerBound), language)
    : '';
  const normalizedUpper = upperBound
    ? verbalizeMathText(stripOuterBrackets(upperBound), language)
    : '';

  if (language === 'zh-CN') {
    const target = normalizedRespectTo
      ? `对${normalizedIntegrand}关于${normalizedRespectTo}积分`
      : `对${normalizedIntegrand}积分`;
    if (normalizedLower && normalizedUpper) {
      return `从${normalizedLower}到${normalizedUpper}，${target}`;
    }
    return target;
  }

  const target = normalizedRespectTo
    ? `integrate ${normalizedIntegrand} with respect to ${normalizedRespectTo}`
    : `integrate ${normalizedIntegrand}`;
  if (normalizedLower && normalizedUpper) {
    return `from ${normalizedLower} to ${normalizedUpper}, ${target}`;
  }
  return target;
}

function formatDerivative(
  subject: string,
  variable: string,
  language: SpokenNarrationLanguage,
  partial = false,
): string {
  const normalizedSubject = verbalizeMathText(stripOuterBrackets(subject), language);
  const normalizedVariable = verbalizeMathText(stripOuterBrackets(variable), language);

  if (language === 'zh-CN') {
    return partial
      ? `${normalizedSubject}对${normalizedVariable}求偏导`
      : `${normalizedSubject}对${normalizedVariable}求导`;
  }

  return partial
    ? `the partial derivative of ${normalizedSubject} with respect to ${normalizedVariable}`
    : `the derivative of ${normalizedSubject} with respect to ${normalizedVariable}`;
}

function formatNaryOperator(
  body: string,
  index: string,
  upperBound: string,
  language: SpokenNarrationLanguage,
  operator: 'sum' | 'product',
): string {
  const normalizedBody = verbalizeMathText(stripOuterBrackets(body), language);
  const normalizedIndex = verbalizeMathText(stripOuterBrackets(index), language);
  const normalizedUpper = verbalizeMathText(stripOuterBrackets(upperBound), language);
  const noun =
    language === 'zh-CN'
      ? operator === 'sum'
        ? '求和'
        : '求乘积'
      : operator === 'sum'
        ? 'sum'
        : 'product';

  if (language === 'zh-CN') {
    return `从${normalizedIndex}到${normalizedUpper}，对${normalizedBody}${noun}`;
  }

  return `take the ${noun} of ${normalizedBody} from ${normalizedIndex} to ${normalizedUpper}`;
}

function formatLogarithm(
  argument: string,
  language: SpokenNarrationLanguage,
  base?: string,
  natural = false,
): string {
  const normalizedArgument = verbalizeMathText(stripOuterBrackets(argument), language);
  const normalizedBase = base ? verbalizeMathText(stripOuterBrackets(base), language) : '';

  if (language === 'zh-CN') {
    if (natural) return `${normalizedArgument}的自然对数`;
    if (normalizedBase) return `以${normalizedBase}为底${normalizedArgument}的对数`;
    return `${normalizedArgument}的对数`;
  }

  if (natural) return `the natural logarithm of ${normalizedArgument}`;
  if (normalizedBase) return `the logarithm of ${normalizedArgument} with base ${normalizedBase}`;
  return `the logarithm of ${normalizedArgument}`;
}

function verbalizeMathText(text: string, language: SpokenNarrationLanguage): string {
  let next = normalizeLatexSource(text).replace(/\\left|\\right/g, '');

  for (const [command, translations] of Object.entries(LATEX_COMMAND_MAP).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    next = next.replaceAll(command, translations[language]);
  }

  const setOperatorReplacements = [
    {
      pattern: /\\notin\b|∉/gu,
      spoken: language === 'zh-CN' ? ' 不属于 ' : ' does not belong to ',
    },
    {
      pattern: /\\subseteq\b|⊆/gu,
      spoken: language === 'zh-CN' ? ' 子集 ' : ' is a subset of ',
    },
    {
      pattern: /\\subset\b|⊂/gu,
      spoken: language === 'zh-CN' ? ' 真子集 ' : ' is a proper subset of ',
    },
    {
      pattern: /\\supseteq\b|⊇/gu,
      spoken: language === 'zh-CN' ? ' 超集 ' : ' is a superset of ',
    },
    {
      pattern: /\\supset\b|⊃/gu,
      spoken: language === 'zh-CN' ? ' 真超集 ' : ' is a proper superset of ',
    },
    {
      pattern: /\\in\b|∈/gu,
      spoken: language === 'zh-CN' ? ' 属于 ' : ' belongs to ',
    },
    {
      pattern: /\\cup\b|∪/gu,
      spoken: language === 'zh-CN' ? ' 并集 ' : ' union ',
    },
    {
      pattern: /\\cap\b|∩/gu,
      spoken: language === 'zh-CN' ? ' 交集 ' : ' intersection ',
    },
  ] as const;

  for (const replacement of setOperatorReplacements) {
    next = next.replace(replacement.pattern, replacement.spoken);
  }

  next = next.replace(
    /\\frac\s*\{d\}\s*\{d\s*([^{}]+)\}\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, variable: string, subject: string) => formatDerivative(subject, variable, language),
  );

  next = next.replace(
    /\\frac\s*\{d\s*([^{}]+)\}\s*\{d\s*([^{}]+)\}/gu,
    (_match, subject: string, variable: string) => formatDerivative(subject, variable, language),
  );

  next = next.replace(
    /\\frac\s*\{\\partial\s*([^{}]+)\}\s*\{\\partial\s*([^{}]+)\}/gu,
    (_match, subject: string, variable: string) =>
      formatDerivative(subject, variable, language, true),
  );

  next = next.replace(
    /d\/d([A-Za-z])\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, variable: string, subject: string) => formatDerivative(subject, variable, language),
  );

  next = next.replace(/d([A-Za-z])\/d([A-Za-z])/gu, (_match, subject: string, variable: string) =>
    formatDerivative(subject, variable, language),
  );

  next = next.replace(
    /∂([A-Za-z0-9\u3400-\u9fffπ∞]+)\/∂([A-Za-z])/gu,
    (_match, subject: string, variable: string) =>
      formatDerivative(subject, variable, language, true),
  );

  next = next.replace(
    new RegExp(
      `\\\\int\\s*_\\{([^{}]+)\\}\\s*\\^\\{([^{}]+)\\}\\s*(${SIMPLE_FORMULA_PATTERN})\\s*d\\s*([A-Za-z])`,
      'gu',
    ),
    (_match, lower: string, upper: string, integrand: string, respectTo: string) =>
      formatIntegral(integrand, respectTo, language, lower, upper),
  );

  next = next.replace(
    new RegExp(`\\\\int\\s*(${SIMPLE_FORMULA_PATTERN})\\s*d\\s*([A-Za-z])`, 'gu'),
    (_match, integrand: string, respectTo: string) =>
      formatIntegral(integrand, respectTo, language),
  );

  next = next.replace(
    new RegExp(
      `∫\\s*_\\{?([^{}^\\s]+)\\}?\\s*\\^\\{?([^{}\\s]+)\\}?\\s*(${SIMPLE_FORMULA_PATTERN})\\s*d\\s*([A-Za-z])`,
      'gu',
    ),
    (_match, lower: string, upper: string, integrand: string, respectTo: string) =>
      formatIntegral(integrand, respectTo, language, lower, upper),
  );

  next = next.replace(
    new RegExp(`∫\\s*(${SIMPLE_FORMULA_PATTERN})\\s*d\\s*([A-Za-z])`, 'gu'),
    (_match, integrand: string, respectTo: string) =>
      formatIntegral(integrand, respectTo, language),
  );

  next = next.replace(
    /\\sum\s*_\{([^{}]+)\}\s*\^\{([^{}]+)\}\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:_[A-Za-z0-9\u3400-\u9fffπ∞{}]+)?)/gu,
    (_match, index: string, upper: string, body: string) =>
      formatNaryOperator(body, index, upper, language, 'sum'),
  );

  next = next.replace(
    /\\prod\s*_\{([^{}]+)\}\s*\^\{([^{}]+)\}\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:_[A-Za-z0-9\u3400-\u9fffπ∞{}]+)?)/gu,
    (_match, index: string, upper: string, body: string) =>
      formatNaryOperator(body, index, upper, language, 'product'),
  );

  next = next.replace(
    /∑\s*_\{?([^{}^]+)\}?\s*\^?\{?([^{} ]+)\}?\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:_[A-Za-z0-9\u3400-\u9fffπ∞{}]+)?)/gu,
    (_match, index: string, upper: string, body: string) =>
      formatNaryOperator(body, index, upper, language, 'sum'),
  );

  next = next.replace(
    /∏\s*_\{?([^{}^]+)\}?\s*\^?\{?([^{} ]+)\}?\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:_[A-Za-z0-9\u3400-\u9fffπ∞{}]+)?)/gu,
    (_match, index: string, upper: string, body: string) =>
      formatNaryOperator(body, index, upper, language, 'product'),
  );

  next = next.replace(
    /\\log_\{([^{}]+)\}\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, base: string, argument: string) => formatLogarithm(argument, language, base),
  );

  next = next.replace(
    /\blog_\{([^{}]+)\}\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, base: string, argument: string) => formatLogarithm(argument, language, base),
  );

  next = next.replace(
    /\\ln\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, argument: string) => formatLogarithm(argument, language, undefined, true),
  );

  next = next.replace(
    /\bln\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, argument: string) => formatLogarithm(argument, language, undefined, true),
  );

  next = next.replace(
    /\\log\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, argument: string) => formatLogarithm(argument, language),
  );

  next = next.replace(
    /\blog\s*([A-Za-z0-9\u3400-\u9fffπ∞]+(?:\([^()]*\))?)/gu,
    (_match, argument: string) => formatLogarithm(argument, language),
  );

  next = next.replace(
    /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gu,
    (_match, numerator: string, denominator: string) =>
      formatFraction(
        verbalizeMathText(numerator, language),
        verbalizeMathText(denominator, language),
        language,
      ),
  );

  next = next.replace(
    /\\sqrt(?:\[(.+?)\])?\{([^{}]+)\}/gu,
    (_match, degree: string | undefined, radicand: string) =>
      formatRoot(verbalizeMathText(radicand, language), degree, language),
  );

  next = replaceBinaryOperator(
    next,
    '>=|≥',
    language === 'zh-CN' ? '大于等于' : 'is greater than or equal to',
  );
  next = replaceBinaryOperator(
    next,
    '<=|≤',
    language === 'zh-CN' ? '小于等于' : 'is less than or equal to',
  );
  next = replaceBinaryOperator(next, '!=|≠', language === 'zh-CN' ? '不等于' : 'does not equal');
  next = replaceBinaryOperator(next, '=', language === 'zh-CN' ? '等于' : 'equals');
  next = replaceBinaryOperator(next, '\\+', language === 'zh-CN' ? '加' : 'plus');
  next = replaceBinaryOperator(next, '×|\\*|·', language === 'zh-CN' ? '乘以' : 'times');

  next = next.replace(
    /([A-Za-z0-9\u3400-\u9fffπ∞]+|\([^()]+\)|\[[^\]]+\])\s*\^\s*\{([^{}]+)\}/gu,
    (_match, base: string, exponent: string) =>
      formatPower(base, verbalizeMathText(exponent, language), language),
  );

  next = next.replace(
    /([A-Za-z0-9\u3400-\u9fffπ∞]+|\([^()]+\)|\[[^\]]+\])\s*\^\s*([A-Za-z0-9\u3400-\u9fffπ∞]+)/gu,
    (_match, base: string, exponent: string) => formatPower(base, exponent, language),
  );

  next = next.replace(
    /([A-Za-z0-9\u3400-\u9fffπ∞]+|\([^()]+\))([²³])/gu,
    (_match, base: string, exponent: string) =>
      formatPower(base, exponent === '²' ? '2' : '3', language),
  );

  next = next.replace(
    /([A-Za-z0-9\u3400-\u9fffπ∞]+)\s*_\s*\{([^{}]+)\}/gu,
    (_match, base: string, subscript: string) =>
      language === 'zh-CN'
        ? `${base}下标${verbalizeMathText(subscript, language)}`
        : `${base} sub ${verbalizeMathText(subscript, language)}`,
  );

  next = next.replace(
    /([A-Za-z0-9\u3400-\u9fffπ∞]+)\s*_\s*([A-Za-z0-9\u3400-\u9fffπ∞]+)/gu,
    (_match, base: string, subscript: string) =>
      language === 'zh-CN' ? `${base}下标${subscript}` : `${base} sub ${subscript}`,
  );

  next = next.replace(/(\d+(?:\.\d+)?)\s*%/gu, (_match, value: string) =>
    language === 'zh-CN' ? `百分之${value}` : `${value} percent`,
  );

  next = next.replace(/≥/g, language === 'zh-CN' ? '大于等于' : 'is greater than or equal to');
  next = next.replace(/≤/g, language === 'zh-CN' ? '小于等于' : 'is less than or equal to');
  next = next.replace(/≠/g, language === 'zh-CN' ? '不等于' : 'does not equal');
  next = next.replace(/±/g, language === 'zh-CN' ? '正负' : 'plus or minus');

  return cleanupSpokenText(next);
}

function verbalizeCodeSpanText(code: string, language: SpokenNarrationLanguage): string {
  const inner = code.replace(/^`|`$/g, '').trim();
  if (!inner) return '';

  const looksLikeMath =
    /[\^_=<>≤≥∈∉⊂⊆∪∩\\]/u.test(inner) &&
    !/[()[\];]|define|lambda|cond|check-expect|require/u.test(inner);
  if (looksLikeMath) return verbalizeMathText(inner, language);

  let next = inner
    .replace(/\bcheck-expect\b/gi, 'check expect')
    .replace(/\bdefine-struct\b/gi, 'define struct')
    .replace(/\belse\b/g, language === 'zh-CN' ? 'else 分支' : 'else branch')
    .replace(/=>/g, language === 'zh-CN' ? ' 得到 ' : ' returns ')
    .replace(/->/g, language === 'zh-CN' ? ' 到 ' : ' to ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  next = next.replace(/\b([A-Za-z][\w-]*)\?/g, (_match, name: string) =>
    language === 'zh-CN' ? `${name} 问号` : `${name} question mark`,
  );

  return cleanupSpokenText(next);
}

function cleanupDirectAddressMeta(text: string, language: SpokenNarrationLanguage): string {
  if (language !== 'zh-CN') {
    return text
      .replace(/\bstudents should understand\b/gi, 'you should notice')
      .replace(/\bstudents need to see\b/gi, 'you need to notice')
      .replace(/\bthis page is designed to\b/gi, 'we use this page to');
  }

  return text
    .replace(/要让学生明白/g, '这里要看清')
    .replace(/让学生明白/g, '先看清')
    .replace(/学生需要看到/g, '你需要看到')
    .replace(/学生需要/g, '你需要')
    .replace(/学生要/g, '你要')
    .replace(/学生可以/g, '你可以')
    .replace(/本页旨在/g, '这一页我们用来')
    .replace(/本页的目标是让学生/g, '这一页我们要');
}

export function verbalizeNarrationText(text: string, language?: SpokenNarrationLanguage): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const resolvedLanguage = language || inferNarrationLanguage(trimmed);
  const codeSpans: string[] = [];
  const masked = trimmed.replace(/`[^`]+`/g, (match) => {
    const marker = `\uE000CODE${codeSpans.length}\uE001`;
    codeSpans.push(match);
    return marker;
  });
  const spoken = verbalizeMathText(masked, resolvedLanguage);
  const restored = codeSpans.reduce(
    (next, code, index) =>
      next.replaceAll(`\uE000CODE${index}\uE001`, verbalizeCodeSpanText(code, resolvedLanguage)),
    spoken,
  );
  return cleanupDirectAddressMeta(cleanupSpokenText(restored), resolvedLanguage);
}

export function verbalizeSpeechActions(
  actions: Action[],
  language?: SpokenNarrationLanguage,
): Action[] {
  return actions.map((action) => {
    if (action.type !== 'speech' || !action.text?.trim()) return action;
    const nextText = verbalizeNarrationText((action as SpeechAction).text, language);
    if (nextText === action.text) return action;
    return {
      ...action,
      text: nextText,
    };
  });
}
