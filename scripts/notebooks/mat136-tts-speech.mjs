const DIGIT_WORDS = {
  0: '零',
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
  10: '十',
  11: '十一',
  12: '十二',
  16: '十六',
  32: '三十二',
  34: '三十四',
  36: '三十六',
  38: '三十八',
  40: '四十',
  49: '四十九',
};

function speakNumber(value) {
  const normalized = String(value);
  return DIGIT_WORDS[normalized] ?? normalized;
}

function speakSubscript(value) {
  return String(value)
    .replaceAll('{', '')
    .replaceAll('}', '')
    .replace(/i\s*-\s*1/g, 'i 减一')
    .replace(/i-1/g, 'i 减一')
    .replace(/\b(\d+)\b/g, (_, number) => speakNumber(number));
}

function speakPower(base, exponent) {
  const spokenBase = speakBase(base);
  const normalizedExponent = String(exponent).replaceAll('{', '').replaceAll('}', '').trim();
  if (normalizedExponent === '2') return `${spokenBase} 的平方`;
  if (normalizedExponent === '3') return `${spokenBase} 的三次方`;
  if (normalizedExponent === '4') return `${spokenBase} 的四次方`;
  const spokenExponent = speakSubscript(normalizedExponent);
  if (/^[零一二三四五六七八九十]+$/.test(spokenBase)) return `${spokenBase}的${spokenExponent}次方`;
  return `${spokenBase} 的 ${spokenExponent} 次方`;
}

function speakBase(value) {
  const token = String(value);
  if (/^\d+$/.test(token)) return speakNumber(token);
  if (token === 'alpha') return '阿尔法';
  if (token === 'theta') return '西塔';
  return token;
}

function speakTrig(fn) {
  if (fn === 'sine') return '正弦';
  if (fn === 'cosine') return '余弦';
  if (fn === 'tangent') return '正切';
  if (fn === 'secant') return '正割';
  return fn;
}

export function sanitizeMathForSpeech(text) {
  let value = String(text ?? '');

  const replacements = [
    ['f(x_i)', 'f 括号 x 下标 i 括号'],
    ['f(c_i)', 'f 括号 c 下标 i 括号'],
    ['x_i squared', 'x 下标 i 的平方'],
    ['x_{i-1}', 'x 下标 i 减一'],
    ['x_{i}', 'x 下标 i'],
    ['x_i', 'x 下标 i'],
    ['x_0', 'x 下标零'],
    ['x_1', 'x 下标一'],
    ['x_n', 'x 下标 n'],
    ['c_i', 'c 下标 i'],
    ['A_i', 'A 下标 i'],
    ['L_4', 'L 下标四'],
    ['R_4', 'R 下标四'],
    ['L_n', 'L 下标 n'],
    ['S(P,c)', 'S 括号 P 逗号 c 括号'],
    ['F(b)+C', 'F 括号 b 括号加 C'],
    ['F(a)-C', 'F 括号 a 括号减 C'],
    ['F(b)', 'F 括号 b 括号'],
    ['F(a)', 'F 括号 a 括号'],
    ['A(x)', 'A 括号 x 括号'],
    ['A(y)', 'A 括号 y 括号'],
    ['A(h)', 'A 括号 h 括号'],
    ['f(2x)', 'f 括号二 x 括号'],
    ['f(x)', 'f 括号 x 括号'],
    ['f(t)', 'f 括号 t 括号'],
    ['f(u)', 'f 括号 u 括号'],
    ['g(x)', 'g 括号 x 括号'],
    ['G(x)', 'G 括号 x 括号'],
    ['r(y)', 'r 括号 y 括号'],
    ['r(h)', 'r 括号 h 括号'],
    ['w(h)', 'w 括号 h 括号'],
    ['s(h)', 's 括号 h 括号'],
    ['sin(2x)', '正弦括号二 x 括号'],
    ['cos(2x)', '余弦括号二 x 括号'],
    ['cos(x to the fourth)', '余弦括号 x 的四次方括号'],
    ['[0,6]', '从零到六'],
    ['[0,1]', '从零到一'],
  ];

  for (const [from, to] of replacements) {
    value = value.replaceAll(from, to);
  }

  value = value
    .replace(
      /\b([A-Za-z])_\{([^}]+)\}/g,
      (_, base, subscript) => `${base} 下标 ${speakSubscript(subscript)}`,
    )
    .replace(
      /\b([A-Za-z])_([A-Za-z0-9]+)/g,
      (_, base, subscript) => `${base} 下标 ${speakSubscript(subscript)}`,
    )
    .replace(/\b([A-Za-z0-9]+)\^([A-Za-z0-9{}+-]+)/g, (_, base, exponent) =>
      speakPower(base, exponent),
    )
    .replace(/([A-Za-z])²/g, (_, base) => `${base} 的平方`)
    .replace(/([A-Za-z])³/g, (_, base) => `${base} 的三次方`)
    .replace(/\b(alpha|theta|[a-zA-Z]) squared\b/g, (_, base) => `${speakBase(base)} 的平方`)
    .replace(/\b(alpha|theta|[a-zA-Z]) cubed\b/g, (_, base) => `${speakBase(base)} 的三次方`)
    .replace(
      /\b(alpha|theta|[a-zA-Z]) to the fourth\b/g,
      (_, base) => `${speakBase(base)} 的四次方`,
    )
    .replace(/\b(alpha|theta|[a-zA-Z]) to x\b/g, (_, base) => `${speakBase(base)} 的 x 次方`)
    .replace(/\be to ([a-zA-Z])\b/g, (_, exponent) => `e 的 ${speakBase(exponent)} 次方`)
    .replace(/\be to the fourth\b/g, 'e 的四次方')
    .replace(
      /\b(sine|cosine|tangent|secant) squared theta\b/g,
      (_, fn) => `${speakTrig(fn)}西塔 的平方`,
    )
    .replace(
      /\b(sine|cosine|tangent|secant) cubed theta\b/g,
      (_, fn) => `${speakTrig(fn)}西塔 的三次方`,
    )
    .replace(/\bcosine fourth theta\b/g, '余弦西塔的四次方')
    .replace(/\bcosine two theta\b/g, '余弦二倍西塔')
    .replace(/\bsine theta\b/g, '正弦西塔')
    .replace(/\bcosine theta\b/g, '余弦西塔')
    .replace(/\btangent theta\b/g, '正切西塔')
    .replace(/\bsecant theta\b/g, '正割西塔')
    .replace(/\bsine\b/g, '正弦')
    .replace(/\bcosine\b/g, '余弦')
    .replace(/\btangent\b/g, '正切')
    .replace(/\bsecant\b/g, '正割')
    .replace(
      /\barcsine of ([A-Za-z]) over three\b/g,
      (_, numerator) => `反正弦括号 ${speakBase(numerator)} 除以三括号`,
    )
    .replace(/\barctan\b/g, '反正切')
    .replace(/\btan\b/g, '正切')
    .replace(/\bsec\b/g, '正割')
    .replace(/\bsin\b/g, '正弦')
    .replace(/\bcos\b/g, '余弦')
    .replace(/\bln absolute x\b/g, 'x 绝对值的自然对数')
    .replace(/\bln one plus x 的平方\b/g, '一加 x 的平方的自然对数')
    .replace(/\bln x\b/g, 'x 的自然对数')
    .replace(/\bone over one plus x 的平方\b/g, '一除以一加 x 的平方')
    .replace(/\bx over one plus x 的平方\b/g, 'x 除以一加 x 的平方')
    .replace(/\bpi over six\b/g, '派除以六')
    .replace(/\bpi over four\b/g, '派除以四')
    .replace(/\bpi over three\b/g, '派除以三')
    .replace(/\bpi\b/g, '派')
    .replace(/\balpha\b/g, '阿尔法')
    .replace(/\btheta\b/g, '西塔')
    .replace(
      /\bsquare root of ([a-zA-Z0-9 -]+?) minus ([a-zA-Z0-9 ]+?) squared\b/g,
      '根号$1减$2的平方',
    )
    .replace(/\bsquare root of\b/g, '根号')
    .replace(/\bsquare root x\b/g, '根号 x')
    .replace(/\bsquare root\b/g, '根号')
    .replace(/\bplus\b/g, '加')
    .replace(/\bminus\b/g, '减')
    .replace(/\btimes\b/g, '乘')
    .replace(/\bover\b/g, '除以')
    .replace(/\bequals\b/g, '等于')
    .replace(/\btwo\b/g, '二')
    .replace(/\bthree\b/g, '三')
    .replace(/\bfour\b/g, '四')
    .replace(/\bsix\b/g, '六')
    .replace(/\beight\b/g, '八')
    .replace(/\btwelve\b/g, '十二')
    .replace(/\bsixteen\b/g, '十六')
    .replace(/\bforty-nine\b/g, '四十九')
    .replace(/\bzero\b/g, '零')
    .replace(/\bone\b/g, '一')
    .replace(/(正弦|余弦|正切|正割) squared/g, '$1的平方')
    .replace(
      /(正弦|余弦|正切|正割) cubed ([A-Za-z])/g,
      (_, fn, variable) => `${fn} ${speakBase(variable)} 的三次方`,
    )
    .replace(
      /(正弦|余弦|正切|正割) squared ([A-Za-z])/g,
      (_, fn, variable) => `${fn} ${speakBase(variable)} 的平方`,
    )
    .replace(/([三四]) squared/g, '$1的平方')
    .replace(/\bsomething squared\b/g, '某个式子的平方')
    .replace(/边长 squared/g, '边长的平方')
    .replace(
      /(\[[^\]]+\]|[A-Za-z] 括号 [^，。；]+? 括号) squared/g,
      (_, expression) => `${expression.replace(/^\[|\]$/g, '')} 的平方`,
    )
    .replace(/\bdx\b/g, 'd x')
    .replace(/\bdu\b/g, 'd u')
    .replace(/\bdv\b/g, 'd v')
    .replace(/\bdt\b/g, 'd t')
    .replace(/\bdy\b/g, 'd y')
    .replace(/\bdh\b/g, 'd h')
    .replace(/\bd theta\b/g, 'd 西塔')
    .replace(/\s+/g, ' ')
    .trim();

  return value;
}
