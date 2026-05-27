#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';
import { generatedNotebookDir } from '../shared/paths.mjs';

const RUN_STAMP = '20260519';
const DATA_PATH = path.resolve(process.cwd(), 'scripts/notebooks/mat102-queue-zh-notebooks.json');
const SKIP_SLUGS = new Set(['sets-and-propositional-logic', 'induction-i']);
const DRY_RUN = process.argv.includes('--dry-run');

const COURSE_SPINES = {
  'logic-quantifiers-implications': {
    logline: '把含变量的句子变成可证明、可反驳的数学断言。',
    centralQuestion: '一句数学话到底在对哪些对象下承诺，又要怎样证明或否定？',
    closingCallback: '先找量词和条件，再决定证明、反例、逆否或否定该怎么走。',
  },
  'relations-equivalence-orders': {
    logline: '把对象之间的比较关系变成可以逐条检查的性质和结构。',
    centralQuestion: '一个关系到底比较了什么，哪些性质是真的，失败时反例在哪里？',
    closingCallback: '先把关系看成一批有序对，再用性质、反例和反证组织证明。',
  },
  'functions-i': {
    logline: '把函数看成带有定义域、陪域和规则的结构运输工具。',
    centralQuestion: '一个函数到底把哪些输入送到哪里，哪些行为由定义域和陪域决定？',
    closingCallback: '每次做函数题，都先分清定义域、陪域、规则、像和原像。',
  },
  'functions-ii-cardinality': {
    logline: '用可逆性、双射和单射来比较集合大小，尤其是无限集合的大小。',
    centralQuestion: '什么时候两个集合真的一样大，什么时候直觉里的大小比较会失效？',
    closingCallback: '比较集合大小时，不看图像密不密，而看能不能构造合适的函数。',
  },
  'number-theory-i-euclidean-algorithm': {
    logline: '把整除语言变成整数方程，再用余数和回代做可计算的证明。',
    centralQuestion: '为什么余数、最大公因数和贝祖恒等式能把整除问题算出来？',
    closingCallback: '遇到整除题，先翻译成整数方程，再看余数和最大公因数怎样推进。',
  },
  'number-theory-ii-primes': {
    logline: '用最大公因数和素数性质控制整数方程与分解。',
    centralQuestion: '什么时候线性整数方程有解，素数为什么能支撑消去和唯一分解？',
    closingCallback: '先做最大公因数检查，再用互素整除和素数性质推动证明。',
  },
  'number-theory-iii-modular-arithmetic': {
    logline: '把整数按余数分组，在有限的同余世界里做加法、乘法和证明。',
    centralQuestion: '为什么只看余数也能可靠计算，什么时候消去和逆元才合法？',
    closingCallback: '模运算先看同余类，再看运算是否良定义，最后检查能否消去或取逆。',
  },
  'group-theory-foundations': {
    logline: '从具体对称和模运算里抽出同一套群结构。',
    centralQuestion: '哪些规则足够保证一个运算世界像群一样运行？',
    closingCallback: '每个群例子都要回到运算、公理、单位元、逆元和子群判别。',
  },
  'group-morphisms-isomorphisms': {
    logline: '用保运算的函数识别群结构在换名字后是否仍然相同。',
    centralQuestion: '一个映射只是普通函数，还是确实保留了群的运算结构？',
    closingCallback: '同态先查良定义和保运算，同构再加上双射和不变量检查。',
  },
};

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

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function loadNotebookSpecs() {
  const records = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  return records
    .filter((record) => !SKIP_SLUGS.has(record.slug))
    .map((record) => ({
      ...record,
      id: `nb-mat102-zh-${record.slug}-${RUN_STAMP}`,
    }));
}

function directIntent(intent) {
  return String(intent)
    .replaceAll('让学生看到', '看见')
    .replaceAll('让学生知道', '先知道')
    .replaceAll('让学生把', '把')
    .replaceAll('让学生', '我们要')
    .replaceAll('学生', '你')
    .replaceAll('讲的时候', '这里')
    .replace(/^介绍/, '这里先介绍')
    .replace(/^预览/, '这里先预览')
    .replace(/^定义/, '这里给出定义：')
    .replace(/^说明/, '这里要说明')
    .replace(/^解释/, '这里要解释')
    .replace(/^强调/, '这里特别强调')
    .replace(/^提醒/, '这里提醒你')
    .replace(/^总结/, '最后总结')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakExpressionText(text) {
  let value = String(text ?? '');

  const replacements = [
    ['P(1) 和 P(k) => P(k+1)', 'P 括号一括号，以及 P 括号 k 括号推出 P 括号 k 加一括号'],
    ['2n + 2 <= 4n', '二 n 加二小于等于四 n'],
    ['5 | (6^k - 1)', '五整除六的 k 次方减一'],
    ['6^k - 1 = 5d', '六的 k 次方减一等于五 d'],
    ['2^n x 2^n', '二的 n 次方乘二的 n 次方'],
    ['sum 1/[n(n+1)] = k/(k+1)', '一除以 n 乘 n 加一的求和等于 k 除以 k 加一'],
    ['f^{-1}(V)', 'f 的逆像记号作用在 V 上'],
    ['f^{-1}', 'f 的逆像记号'],
    ['f([-1,2]) = [0,4]', 'f 作用在负一到二这个区间上，得到零到四这个区间'],
    ['p: R^3 -> R^2', 'p 是从三维实数空间到二维实数空间的映射'],
    ['f o g = id 和 g o f = id', 'f 复合 g 等于恒等映射，并且 g 复合 f 等于恒等映射'],
    ['|S| <= |T|', 'S 的基数小于等于 T 的基数'],
    ['N、Z、Q、R、Z+', '自然数、整数、有理数、实数、正整数'],
    ['N、Z、Q、R', '自然数、整数、有理数、实数'],
    ['N 和偶自然数', '自然数集合和偶自然数集合'],
    ['Cantor-Schroder-Bernstein', '康托尔、施罗德、伯恩斯坦'],
    ['a = bk', 'a 等于 b 乘 k'],
    ['a = qb + r', 'a 等于 q 乘 b 加 r'],
    ['0 <= r < b', '零小于等于 r，并且 r 小于 b'],
    ['3 | n^3 - n', '三整除 n 的三次方减 n'],
    ['gcd(616,427)=7', '六百一十六和四百二十七的最大公因数等于七'],
    ['am + bn = gcd(a,b)', 'a m 加 b n 等于 a 和 b 的最大公因数'],
    ['504x + 1155y = 42', '五百零四 x 加一千一百五十五 y 等于四十二'],
    ['a | bc 且 gcd(a,b)=1，则 a | c', 'a 整除 b c，并且 a 和 b 互素，就能推出 a 整除 c'],
    ['ax + by = d', 'a x 加 b y 等于 d'],
    ['ax + by = c', 'a x 加 b y 等于 c'],
    ['gcd(a,b) | c', 'a 和 b 的最大公因数整除 c'],
    ['x = -32 + 55n、y = 14 - 24n', 'x 等于负三十二加五十五 n，y 等于十四减二十四 n'],
    ['p | ab => p | a or p | b', 'p 整除 a b，就推出 p 整除 a 或者 p 整除 b'],
    ['p | n iff p | n^2', 'p 整除 n，当且仅当 p 整除 n 的平方'],
    ['sqrt(p)', '根号 p'],
    ['4^441', '四的四百四十一次方'],
    ['a congruent b mod n', 'a 与 b 模 n 同余'],
    ['n | (b-a)', 'n 整除 b 减 a'],
    ['1 congruent 29 mod 4', '一与二十九模四同余'],
    ['[0] 到 [n-1] 和 Z_n', '零类到 n 减一类，以及 Z 下标 n'],
    ['Z4', 'Z 下标四'],
    ['a congruent r、b congruent s', 'a 与 r 同余，b 与 s 同余'],
    ['mod 10', '模十'],
    ['mod 4', '模四'],
    ['Zp', 'Z 下标 p'],
    ['a^(p-1) congruent 1 mod p', 'a 的 p 减一次方与一模 p 同余'],
    ['Z_n', 'Z 下标 n'],
    ['[0]_n', '零类下标 n'],
    ['Z8*', 'Z 八星号'],
    ['D3', 'D 三'],
    ['(ab)^-1 = b^-1 a^-1', 'a b 的逆元等于 b 的逆元乘 a 的逆元'],
    ['ab^-1 in H', 'a 乘 b 的逆元属于 H'],
    ['{h in G : hgh^-1 = g}', '所有满足 h g h 的逆元等于 g 的 h 组成的集合'],
    ['Z2、{[1]6,[5]6} 和 <[2]4>', 'Z 二、模六里的两个可逆类、以及由二生成的模四子群'],
    ['phi(xy)=phi(x)phi(y)', 'phi 作用在 x y 上，等于 phi 作用在 x，再乘 phi 作用在 y'],
    ['phi: Z6 -> Z12, phi([x]6)=[2x]12', 'phi 从 Z 六到 Z 十二，把 x 类送到二 x 类'],
    ['[x]6 -> [3x]12', 'x 的模六类送到三 x 的模十二类'],
    ['[x]6 -> [x]12', 'x 的模六类送到 x 的模十二类'],
    ['Z12 -> Z6', 'Z 十二到 Z 六'],
    ['ker(phi)', '映射 phi 的核'],
    ['im(phi)', '映射 phi 的像'],
    [
      'every infinite cyclic group is isomorphic to Z、finite cyclic group of order n is isomorphic to Zn',
      '每个无限循环群都同构于整数加法群；每个 n 阶有限循环群都同构于 Z 下标 n',
    ],
    [
      'every infinite cyclic group is isomorphic to Z、finite cyclic group of order n is isomorphic to Z 下标 n',
      '每个无限循环群都同构于整数加法群；每个 n 阶有限循环群都同构于 Z 下标 n',
    ],
    ['Zn', 'Z 下标 n'],
    ['base case', '起始情形'],
    ['induction hypothesis', '归纳假设'],
    ['target statement', '目标命题'],
    ['strong induction', '强归纳'],
    ['codomain', '陪域'],
    ['domain', '定义域'],
    ['range', '值域'],
    ['graph', '图像'],
    ['left-total', '左全关系'],
    ['functional', '函数性关系'],
    ['preimage', '原像'],
    ['inverse function', '反函数'],
    ['inverse', '逆映射'],
    ['one-to-one', '单射'],
    ['onto', '满射'],
    ['bijection', '双射'],
    ['countability', '可数性'],
    ['countable', '可数'],
    ['countably infinite', '可数无限'],
    ['cardinality', '基数'],
    ['diagonalization', '对角线法'],
    ['well-ordering', '良序原理'],
    ['division algorithm', '带余除法'],
    ['Bezout identity', '贝祖恒等式'],
    ['Bezout', '贝祖'],
    ['quotient', '商'],
    ['remainder', '余数'],
    ['back-substitution', '回代'],
    ['particular solution', '一个特解'],
    ['general solution', '通解'],
    ['non-negative solutions', '非负整数解'],
    ['cancellation principle', '消去原则'],
    ['modular arithmetic', '模运算'],
    ['congruence modulo n', '模 n 同余'],
    ['reflexive', '自反'],
    ['irreflexive', '反自反'],
    ['symmetric', '对称'],
    ['anti-symmetric', '反对称'],
    ['transitive', '传递'],
    ['left-total', '左全'],
    ['total', '完全'],
    ['equivalence relation', '等价关系'],
    ['subgroup', '子群'],
    ['closure', '封闭性'],
    ['associativity', '结合律'],
    ['identity', '单位元'],
    ['inverses', '逆元'],
    ['commutativity', '交换律'],
    ['non-Abelian', '非阿贝尔'],
    ['Abelian', '阿贝尔'],
    ['rotation', '旋转'],
    ['reflection', '反射'],
    ['kernel', '核'],
    ['image', '像'],
    ['homomorphism', '同态'],
    ['isomorphism', '同构'],
    ['injective', '单射'],
    ['bijective', '双射'],
    ['not well-defined', '不良定义'],
    ['well-defined', '良定义'],
    ['homomorphic', '同态'],
    ['operation', '运算'],
    ['number system', '数系'],
    ['preserving group 运算', '保留群运算'],
    ['preserving group operation', '保留群运算'],
  ];

  for (const [from, to] of replacements) value = value.replaceAll(from, to);

  value = value
    .replace(/\bforall\b/g, '对所有')
    .replace(/\bexists\b/g, '存在')
    .replace(/\bnot forall\b/g, '并非对所有')
    .replace(/\bnot exists\b/g, '不存在')
    .replace(/\biff\b/g, '当且仅当')
    .replace(/\bif-then\b/g, '如果那么')
    .replace(/\b([A-Za-z])\^\(([^)]+)\)/g, (_, base, exponent) => {
      const spokenExponent = exponent.replaceAll('+', '加').replaceAll('-', '减');
      return `${base} 的 ${spokenExponent} 次方`;
    })
    .replace(/\b([A-Za-z])\^-1\b/g, '$1 的逆元')
    .replace(/\b([A-Za-z])_\{([^}]+)\}/g, '$1 下标 $2')
    .replace(/\b([A-Za-z])_([A-Za-z0-9]+)\b/g, '$1 下标 $2')
    .replace(/=>/g, '推出')
    .replace(/<=/g, '小于等于')
    .replace(/>=/g, '大于等于')
    .replace(/!=/g, '不等于')
    .replace(/->/g, '到')
    .replace(/[{}]/g, '')
    .replace(/\^/g, '的')
    .replace(/_/g, '下标')
    .replace(/</g, '小于')
    .replace(/>/g, '大于')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitizeMathForSpeech(value);
}

function cleanSpeech(text) {
  return speakExpressionText(
    String(text)
      .replaceAll('让学生', '让你')
      .replaceAll('学生', '你')
      .replaceAll('讲的时候', '这里')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .replace(/\s+([。！？；：，])/g, '$1')
    .replace(/([。！？；：，])\s+/g, '$1')
    .replace(/和\s+基数/g, '和基数')
    .replace(/和\s+映射/g, '和映射')
    .replace(/核\s+记录/g, '核记录')
    .replace(/遇到Z/g, '遇到 Z')
    .replace(/推进到Z/g, '推进到 Z')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2');
}

function supportFor(title, intent) {
  const text = `${title} ${intent}`;
  if (
    /群|Abelian|non-Abelian|子群|循环群|同态|同构|kernel|image|homomorphism|isomorphism/.test(text)
  ) {
    return {
      method: '代数结构题先看集合和运算，再看这个运算保留了什么。对象名字可以变，结构关系不能乱。',
      trap: '不要只看公式好不好看。要先检查运算有没有定义好，再检查单位元、逆元、封闭性或保运算这些条件。',
    };
  }
  if (/量词|全称|存在|蕴含|逆否|反例|否定/.test(text)) {
    return {
      method: '这里不要急着翻译成一句散文。先找量词，再找变量范围，最后找条件和结论。',
      trap: '最容易乱的是顺序和否定位置。只要量词顺序变了，后面的选择能不能依赖前面的变量，意思就可能完全改变。',
    };
  }
  if (
    /函数|domain|codomain|range|preimage|inverse|one-to-one|onto|bijection|cardinality|集合的像|原像|单射|满射|双射|基数|可数|Cantor/.test(
      text,
    )
  ) {
    return {
      method:
        '函数题先把定义域、陪域和规则分开看。很多错误不是算错，而是一开始把函数的数据看漏了。',
      trap: '特别注意陪域和值域不一样，原像也不等于真的反函数。先判断定义，再谈计算。',
    };
  }
  if (/关系|等价|偏序|极大|极小|上界|下界|反证/.test(text)) {
    return {
      method: '先确定对象集合，再确定关系到底比较什么。之后每一个性质都要变成一个可以检查的问题。',
      trap: '不要凭图像感觉说它成立。性质成立要能覆盖所有对象；性质失败只需要拿出一个清楚的反例。',
    };
  }
  if (/整除|数论|gcd|欧几里得|Bezout|素数|丢番图|mod|同余|费马|Zp/.test(text)) {
    return {
      method:
        '数论题先把符号翻译成整数方程或余数条件。翻译清楚以后，证明通常就是代入、取余、回代。',
      trap: '不要把普通算术的消去直接搬进模运算。能不能消去，通常要先看互素条件或模数是不是素数。',
    };
  }
  if (/归纳|递归|base case|induction|strong|Sigma|铺砖/.test(text)) {
    return {
      method: '归纳题一定要分清三句话：起点成立，假设第 k 步成立，目标是推出第 k 加一步。',
      trap: '最危险的是把要证明的结论偷偷当成已知。写 induction hypothesis 时，只能假设已经允许假设的那一层。',
    };
  }
  return {
    method: '先把对象、条件、结论分开。证明课里，每一行都应该回答“我现在用了哪个定义”。',
    trap: '不要跳过中间的判断动作。看起来像直觉的地方，往往正是需要写清楚的证明步骤。',
  };
}

function spineFor(spec) {
  const spine = COURSE_SPINES[spec.slug];
  if (!spine) throw new Error(`Missing course spine for ${spec.slug}`);
  return spine;
}

function takeawayFor(spec, order, spine) {
  if (order === spec.slides.length - 1) {
    return `最后把《${spec.title}》收束成一条主线：${spine.closingCallback}`;
  }
  const nextTitle = spec.slides[order + 1][0];
  return `这一页先收到这里。下一页进入《${nextTitle}》，刚才这个动作会变成下一步要检查的工具。`;
}

function conceptName(title) {
  return String(title).replace(
    /^(封面|引入|问题框架|核心桥梁|桥梁|总览|定义|回顾|例题|常见错误|总结与下节钩子|总结)：/,
    '',
  );
}

function pageMoveFor(title) {
  if (/^封面/.test(title)) return '先把整本课的入口问题立起来。';
  if (/^总览/.test(title)) return '先把后面会反复出现的工具排成路线。';
  if (/^引入/.test(title)) return '用一个具体入口，把新概念为什么需要出现讲清楚。';
  if (/^回顾/.test(title)) return '把之前已经学过的工具拿回来，作为这一页的支点。';
  if (/^定义/.test(title)) return '把直觉压成可检查、可引用的定义。';
  if (/^问题框架/.test(title)) return '把真正容易卡住的问题摆到台面上。';
  if (/^(核心桥梁|桥梁)/.test(title)) return '把前面的语言接到今天要用的关键工具。';
  if (/^例题/.test(title)) return '把刚才的方法放进具体题目里，检查每一步为什么能走。';
  if (/^常见错误/.test(title)) return '反过来检查哪些习惯会让证明或计算断掉。';
  if (/^总结/.test(title)) return '把整本课的工具收成一张可以继续使用的地图。';
  return '继续推进本节的下一步工具。';
}

function fromPreviousFor(spec, order, spine) {
  const [title] = spec.slides[order];
  if (order === 0) {
    return `这本《${spec.title}》从一个主问题开始：${spine.centralQuestion}`;
  }
  const [previousTitle] = spec.slides[order - 1];
  return `上一页《${previousTitle}》已经铺好一个动作，现在《${title}》把它推进到${conceptName(title)}。`;
}

function workedBoardLeadFor(title) {
  if (/^封面/.test(title)) return '现在看右侧的视觉线索，把它当成这一讲的第一张路线图。';
  if (/^总览/.test(title)) return '现在看右侧的路线材料，先确认这些工具会按什么顺序出现。';
  if (/^例题/.test(title))
    return '现在看右侧例题。先读题目给了什么，再判断要调用哪一个定义或定理。';
  if (/常见错误/.test(title))
    return '现在看右侧错误提醒。不要只记错在哪里，要说出是哪条定义或条件被破坏了。';
  if (/总结/.test(title)) return '现在看右侧总结区，把分散工具重新排成一条可复用的路线。';
  return '现在看右侧材料。先确定对象，再看条件，最后看结论是怎样被推出或定义出来的。';
}

function groupsFor(spec, order) {
  const [title, rawIntent] = spec.slides[order];
  const spine = spineFor(spec);
  const intent = directIntent(rawIntent);
  const support = supportFor(title, intent);
  const move = pageMoveFor(title);

  return [
    [
      `${fromPreviousFor(spec, order, spine)} ${move}`,
      `先看标题区：这一页在整条路线里的位置，是为了回应这个主问题：${spine.centralQuestion}`,
    ],
    [intent, `这一步回到本节主线：${spine.logline}`],
    [workedBoardLeadFor(title), support.trap],
    [
      `本页真正要带走的是一个动作：遇到${conceptName(title)}，先把对象、条件和要证明的结论分开。`,
      takeawayFor(spec, order, spine),
    ],
  ];
}

function buildActions(scene, groups) {
  const spotlights = (scene.actions || []).filter((action) => action?.type === 'spotlight');
  if (spotlights.length < groups.length) {
    throw new Error(
      `${scene.title}: expected ${groups.length} spotlights, found ${spotlights.length}`,
    );
  }

  const actions = [];
  let speechIndex = 1;
  groups.forEach((lines, groupIndex) => {
    const spotlight = spotlights[groupIndex];
    actions.push({
      ...spotlight,
      id: spotlight.id || `${scene.id}-spotlight-${String(groupIndex + 1).padStart(2, '0')}`,
    });
    for (const line of lines) {
      actions.push({
        id: `${scene.id}-speech-mat102-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${scene.title} ${speechIndex}`,
        text: cleanSpeech(line),
      });
      speechIndex += 1;
    }
  });
  return actions;
}

function validateActions(scene) {
  const elementIds = new Set(
    (scene.content?.canvas?.elements || []).map((element) => element?.id).filter(Boolean),
  );
  const distantStyle =
    /学生|讲的时候|让学生|学习者|听众|用户|课堂停顿|帮学生|学生应该|学生会|可以让学生/;
  const badMath = /[{}_^√∫θΔπαβγλμσΣΩ∞≈≤≥≠±×÷]|=>|<=|>=|[<>]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/;
  const templateSmell = /不是孤立概念|右侧例题或图像|这一页解决什么问题/;
  const englishPower =
    /\b(?:squared|cubed|to the (?:zero|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)|over two|over three)\b/i;
  const seen = new Set();
  for (const action of scene.actions || []) {
    if (action.id) {
      if (seen.has(action.id)) throw new Error(`${scene.title}: duplicate action id ${action.id}`);
      seen.add(action.id);
    }
    if (action.type === 'spotlight' && !elementIds.has(action.elementId)) {
      throw new Error(`${scene.title}: invalid spotlight target ${action.elementId}`);
    }
    if (action.type !== 'speech') continue;
    const text = action.text || '';
    if (distantStyle.test(text)) throw new Error(`${scene.title}: distant style in "${text}"`);
    if (badMath.test(text)) throw new Error(`${scene.title}: TTS-unfriendly math in "${text}"`);
    if (templateSmell.test(text)) throw new Error(`${scene.title}: template smell in "${text}"`);
    if (englishPower.test(text))
      throw new Error(`${scene.title}: English power wording in "${text}"`);
  }
}

function writeArtifacts(notebookId, scenes) {
  const outputDir = generatedNotebookDir(notebookId);
  const scenesPath = path.join(outputDir, 'notebook-scenes.json');
  const actionsPath = path.join(outputDir, 'scene-actions.json');
  if (!fs.existsSync(scenesPath)) return false;

  const fileScenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
  const actionBySceneId = new Map(scenes.map((scene) => [scene.id, scene.actions]));
  const nextFileScenes = fileScenes.map((scene) => ({
    ...scene,
    actions: actionBySceneId.get(scene.id) || scene.actions,
  }));
  fs.writeFileSync(scenesPath, JSON.stringify(nextFileScenes, null, 2));
  fs.writeFileSync(
    actionsPath,
    JSON.stringify(
      nextFileScenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        order: scene.order,
        actions: scene.actions,
      })),
      null,
      2,
    ),
  );
  return true;
}

async function main() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  const specs = loadNotebookSpecs();

  try {
    let totalScenes = 0;
    let totalSpeech = 0;
    let totalSpotlights = 0;
    let artifactCount = 0;

    for (const spec of specs) {
      const notebook = await prisma.notebook.findUnique({
        where: { id: spec.id },
        include: { scenes: { orderBy: { order: 'asc' } } },
      });
      if (!notebook) throw new Error(`Notebook not found: ${spec.id}`);
      if (notebook.scenes.length !== spec.slides.length) {
        throw new Error(
          `${spec.id}: expected ${spec.slides.length} scenes, found ${notebook.scenes.length}`,
        );
      }

      const updatedScenes = notebook.scenes.map((scene, order) => {
        const expectedTitle = spec.slides[order][0];
        if (scene.title !== expectedTitle) {
          throw new Error(
            `${spec.id}: scene ${order + 1} title mismatch: ${scene.title} !== ${expectedTitle}`,
          );
        }
        const nextScene = { ...scene, actions: buildActions(scene, groupsFor(spec, order)) };
        validateActions(nextScene);
        return nextScene;
      });

      const speechTotal = updatedScenes.reduce(
        (sum, scene) => sum + scene.actions.filter((action) => action.type === 'speech').length,
        0,
      );
      const spotlightTotal = updatedScenes.reduce(
        (sum, scene) => sum + scene.actions.filter((action) => action.type === 'spotlight').length,
        0,
      );

      if (!DRY_RUN) {
        for (const scene of updatedScenes) {
          await prisma.scene.update({
            where: { id: scene.id },
            data: { actions: scene.actions },
          });
        }
        await prisma.notebook.update({
          where: { id: spec.id },
          data: { updatedAt: new Date() },
        });
        if (writeArtifacts(spec.id, updatedScenes)) artifactCount += 1;
      }

      totalScenes += updatedScenes.length;
      totalSpeech += speechTotal;
      totalSpotlights += spotlightTotal;
      console.log(
        `${DRY_RUN ? 'Would update' : 'Updated'} ${spec.title}: ${updatedScenes.length} scenes, ${speechTotal} speech segments, ${spotlightTotal} spotlights`,
      );
    }

    console.log(
      `${DRY_RUN ? 'Would update' : 'Updated'} MAT102 remaining total: ${totalScenes} scenes, ${totalSpeech} speech segments, ${totalSpotlights} spotlights, ${artifactCount} artifact dirs`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
