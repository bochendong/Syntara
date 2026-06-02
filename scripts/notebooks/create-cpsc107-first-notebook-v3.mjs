#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-cpsc107-first-notebook-v3.mjs';
const NOTEBOOK_ID = 'queue-cpsc107-01-racket-basics';
const COURSE_ID = process.env.CPSC107_COURSE_ID || 'cmpc9dqgv000p8ogmrsjl5co8';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'CPSC107', NOTEBOOK_ID);
const PUBLIC_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const VERSION = 'v3';

const COLORS = {
  ink: '#111827',
  muted: '#374151',
  teal: '#087b77',
  tealDark: '#075e5a',
  tealLight: '#dff2ef',
  brown: '#8a6238',
  brownSoft: '#a78b65',
  grid: '#edf1f3',
  grid2: '#dfe6e9',
};

const MARKERS = [
  { name: 'red', hex: '#ff0000', cn: '红色', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', cn: '绿色', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', cn: '蓝色', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', cn: '青色', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', cn: '品红色', match: (r, g, b) => r > 170 && b > 170 && g < 100 },
  { name: 'yellow', hex: '#ffff00', cn: '黄色', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const LAYOUTS = {
  red: { marker: [[388, 14], [1228, 14], [388, 178], [1228, 178]], body: [420, 42, 760, 116] },
  lime: { marker: [[72, 194], [1132, 194], [72, 478], [1132, 478]], body: [126, 220, 1000, 220] },
  blue: { marker: [[1152, 194], [1518, 194], [1152, 478], [1518, 478]], body: [1180, 220, 300, 220] },
  cyan: { marker: [[92, 508], [704, 508], [92, 746], [704, 746]], body: [126, 528, 540, 190] },
  magenta: { marker: [[760, 508], [1450, 508], [760, 746], [1450, 746]], body: [790, 528, 620, 190] },
  yellow: { marker: [[326, 768], [1300, 768], [326, 864], [1300, 864]], body: [370, 786, 890, 54] },
};

const CODE_BANK = {
  sourcePdf: 'queue/CPSC107/01_Rackert_基础.pdf',
  snippets: [
    {
      id: 'math-to-racket',
      sourcePages: [5],
      code: [
        '3 - 2                      -> (- 3 2)',
        '3 - 2 + 4/5                -> (+ (- 3 2) (/ 4 5))',
        '(6 - 4)(3 + 2)             -> (* (- 6 4) (+ 3 2))',
      ],
    },
    {
      id: 'primitive-operators',
      sourcePages: [5],
      code: [
        '(sqr 2)              ;; Output 4',
        '(sqrt 9)             ;; Output 3',
        '(quotient 75 7)      ;; Output 10',
        '(remainder 75 7)     ;; Output 5',
      ],
    },
    {
      id: 'eval-plus',
      sourcePages: [6],
      code: ['(+ (* 12 3) (- 2 1 3))', '(+ 36 (- 2 1 3))', '(+ 36 -2)', '34'],
    },
    {
      id: 'boolean-examples',
      sourcePages: [8],
      code: [
        '(and true true)                  ;; Output: True',
        '(or true false)                  ;; Output: True',
        '(not true)                       ;; Output: False',
        '(and (or true false) false)      ;; Output: False',
      ],
    },
    {
      id: 'short-circuit-eval',
      sourcePages: [9],
      code: [
        '(and (< 3 5)',
        '     (or (< 1 3) (= 1 3))',
        '     (or (> 1 5) (> 2 5)))',
        '⇒ (and true (or (< 1 3) (= 1 3))',
        '        (or (> 1 5) (> 2 5)))',
        '⇒ (and true true (or (> 1 5) (> 2 5)))',
        '⇒ (and true true (or false false))',
        '⇒ false',
      ],
    },
    {
      id: 'short-circuit-practice',
      sourcePages: [10],
      code: ['(and (< 3 5) (< 4 8) (7 < 6) (< 2 3))'],
    },
    {
      id: 'string-functions',
      sourcePages: [11],
      code: [
        '(string-append "123" "456" "789") ;; "123456789"',
        '(string-length "123")             ;; 3',
        '(substring "123" 0 1)             ;; "1"',
        '(string=? "123" "456")           ;; False',
      ],
    },
    {
      id: 'image-functions',
      sourcePages: [12],
      code: [
        '(require 2htdp/image)',
        '(circle 10 "solid" "red")',
        '(rectangle 10 20 "outline" "red")',
        '(text "hello" 24 "orange")',
        '(above image_1 image_2 ...)',
        '(beside image_1 image_2 ...)',
        '(overlay image_1 image_2 ...)',
        '(rotate 30 image)',
      ],
    },
    {
      id: 'primitive-data-examples',
      sourcePages: [13],
      code: ['true', '123', '"123"', '(circle 10 "solid" "red")'],
    },
    {
      id: 'function-template',
      sourcePages: [14],
      code: ['(define (函数名 变量一 变量二)', '  函数逻辑', '  )'],
    },
    {
      id: 'function-eval',
      sourcePages: [15],
      code: [
        '(define (f x) (* x x))',
        '(define (g x y) (- x y))',
        '',
        '(g (f 2) (g 3 1))',
        '⇒ (g (* 2 2) (g 3 1))',
        '⇒ (g 4 (g 3 1))',
        '⇒ (g 4 (- 3 1))',
        '⇒ (g 4 2)',
        '⇒ (- 4 2)',
        '⇒ 2',
      ],
    },
    {
      id: 'term-eval',
      sourcePages: [16],
      code: [
        '(define (term x y) (* x (sqr y)))',
        '',
        '(term (- 5 3) (+ 1 2))',
        '⇒ (term 2 (+ 1 2))',
        '⇒ (term 2 3)',
        '⇒ (* 2 (sqr 3))',
        '⇒ (* 2 9)',
        '⇒ 18',
      ],
    },
    {
      id: 'global-constants',
      sourcePages: [17],
      code: [
        '(define DISCOUNT 0.2)',
        '(define TAX-RATE 0.13)',
        '',
        '(define (cal_final-price total_price)',
        '  (* (* total_price DISCOUNT) TAX-RATE)',
        '  )',
        '',
        '(cal_final-price 200)',
      ],
    },
    {
      id: 'if-template',
      sourcePages: [18],
      code: ['(if question-expression', '    true-answer', '    false-answer', '    )'],
    },
    {
      id: 'if-eval',
      sourcePages: [19],
      code: [
        '(define IMAGE_HEIGHT 10)',
        '(define IMAGE_WIDTH 5)',
        '',
        '(if (> IMAGE_HEIGHT IMAGE_WIDTH)',
        '    "Tall"',
        '    "Wide"',
        '    )',
      ],
    },
    {
      id: 'foo-exercise',
      sourcePages: [20],
      code: [
        '(define A 5)',
        '(define B 10)',
        '',
        '(define (foo x y)',
        '  (+ (* A x y B) (+ x y x)))',
        '',
        '(foo 1 2)',
      ],
    },
    {
      id: 'cond-eval',
      sourcePages: [21, 22],
      code: [
        '(cond',
        '  [(2 > 3) "ab"]',
        '  [(4 < 2) "def"]',
        '  [else "g"])',
        '⇒ (cond',
        '    [false "ab"]',
        '    [(4 < 2) "def"]',
        '    [else "g"])',
        '⇒ (cond [false "def"] [else "g"])',
        '⇒ "g"',
      ],
    },
  ],
};

function snippet(id) {
  const found = CODE_BANK.snippets.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown snippet ${id}`);
  return found;
}

function slide({ title, sceneTitle, rule, mainSnippetId, mainTitle, mainNote, right, trace, result, bottom }) {
  const mainSnippet = snippet(mainSnippetId);
  return {
    title,
    sceneTitle,
    rule,
    mainSnippetId,
    components: [
      component('red', '本页主线', 'rule', [rule]),
      component('lime', mainTitle || '讲义代码', 'code', mainSnippet.code, mainSnippetId),
      component('blue', right.title, 'note', right.lines),
      component('cyan', trace.title, 'note', trace.lines),
      component('magenta', result.title, 'note', result.lines),
      component('yellow', '底部规则', 'flow', bottom),
    ],
    mainNote,
  };
}

function component(marker, label, kind, lines, snippetId = null) {
  return { marker, label, kind, lines, snippetId, speech: '' };
}

const PAGES = [
  slide({
    title: 'Racket 读法：operator 放在最前面',
    sceneTitle: '前缀表达式',
    rule: '(operator operand operand ...)',
    mainSnippetId: 'math-to-racket',
    mainTitle: '从熟悉写法翻成 Racket',
    mainNote: '先看每行右侧：operator 都被移到括号第一位。',
    right: { title: '不是数学排版', lines: ['Racket 不靠中缀位置读算式', '先读括号第一格', '再读后面的 operands'] },
    trace: { title: '读一行', lines: ['3 - 2', '=> (- 3 2)', '第一个位置是 -'] },
    result: { title: '嵌套时', lines: ['先算里面：(- 6 4)', '再算另一个：(+ 3 2)', '最后外层：(*)'] },
    bottom: ['读括号', 'operator first', 'operands 先变成值'],
  }),
  slide({
    title: 'Primitive Operators：语言给好的积木',
    sceneTitle: '基础操作符',
    rule: 'built-in function 直接调用',
    mainSnippetId: 'primitive-operators',
    mainTitle: '讲义代码',
    mainNote: 'sqr、sqrt、quotient、remainder 都已经由语言提供。',
    right: { title: '共同结构', lines: ['函数名在第一格', '输入放在后面', '结果直接变成 value'] },
    trace: { title: 'call to primitive', lines: ['(sqr 2) -> 4', '(sqrt 9) -> 3', '不用自己写定义'] },
    result: { title: '商和余数', lines: ['75 = 7 * 10 + 5', 'quotient -> 10', 'remainder -> 5'] },
    bottom: ['看第一格', '确认输入', '得到 value'],
  }),
  slide({
    title: '逐步求值：每一步只化简一处',
    sceneTitle: '表达式求值',
    rule: '从左到右，从里到外',
    mainSnippetId: 'eval-plus',
    mainTitle: '讲义求值过程',
    mainNote: '每一行只做一次合法化简，trace 才能被检查。',
    right: { title: '先算左边', lines: ['(* 12 3)', '=> 36', '外层 + 先等着'] },
    trace: { title: '再算右边', lines: ['(- 2 1 3)', '=> -2', '(+ 36 -2)'] },
    result: { title: '最终 value', lines: ['(+ 36 -2)', '=> 34', '答案是 value'] },
    bottom: ['找最内层', '化简一处', '写下一行'],
  }),
  slide({
    title: 'Boolean：true 和 false 也是值',
    sceneTitle: '逻辑表达式',
    rule: 'Boolean value: true / false',
    mainSnippetId: 'boolean-examples',
    mainTitle: '讲义代码',
    mainNote: '逻辑表达式最终也会化成一个 value：true 或 false。',
    right: { title: 'and / or', lines: ['and：全部 true 才 true', 'or：一个 true 就 true', 'not：反过来'] },
    trace: { title: '先算小块', lines: ['(or true false) -> true', '(not true) -> false', '再回到外层'] },
    result: { title: '嵌套例子', lines: ['(and (or true false) false)', '=> (and true false)', '=> false'] },
    bottom: ['先化 Boolean', '再连 and/or', '最后一个 value'],
  }),
  slide({
    title: '短路求值：结果确定就停',
    sceneTitle: '短路求值',
    rule: 'AND 遇 false 可停；OR 遇 true 可停',
    mainSnippetId: 'short-circuit-eval',
    mainTitle: '讲义 trace',
    mainNote: '这页的核心是：一旦结果已确定，后面不必继续算。',
    right: { title: '关键位置', lines: ['or 的第一项已是 true', '整段 or 直接 true', '这一步要写出来'] },
    trace: { title: 'and 继续看', lines: ['true', 'true', '最后一段变成 false'] },
    result: { title: '收缩成结果', lines: ['(and true true false)', '=> false', 'false 让整体确定'] },
    bottom: ['or 看见 true', 'and 看见 false', '能停就停'],
  }),
  slide({
    title: '短路求值：先看 Racket 能不能读',
    sceneTitle: '短路练习',
    rule: '(operator operand operand ...)',
    mainSnippetId: 'short-circuit-practice',
    mainTitle: '讲义原题',
    mainNote: '外层第一格是 and；真正的陷阱在其中一个 operand。',
    right: { title: '问题在这里', lines: ['(7 < 6)', '第一格是 7，不是 operator', '(< 7 6) 才是比较式'] },
    trace: { title: '修正后逐个 operand 化成值', lines: ['(< 3 5) -> true', '(< 4 8) -> true', '(< 7 6) -> false', '(< 2 3) -> true'] },
    result: { title: 'and 收缩成一行', lines: ['(and true true false true)', '=> false', '后面不用再改变结果'] },
    bottom: ['operator first', 'operands 从左到右', '能停就停'],
  }),
  slide({
    title: 'String：双引号里的数据',
    sceneTitle: '字符串操作',
    rule: '"123" 是 String；123 是 number',
    mainSnippetId: 'string-functions',
    mainTitle: '讲义代码',
    mainNote: '先确认数据类型，再选对应的 string 函数。',
    right: { title: '四个动作', lines: ['append：拼起来', 'length：数长度', 'substring：切片', 'string=?：比较'] },
    trace: { title: '切片规则', lines: ['(substring "123" 0 1)', '拿 index 0', '前取后不取'] },
    result: { title: '类型提醒', lines: ['"123" 不是 123', '字符串函数处理 String', '数学函数处理 number'] },
    bottom: ['看引号', '确定类型', '选对应函数'],
  }),
  slide({
    title: 'Image：代码也可以画图',
    sceneTitle: '图像函数',
    rule: '(require 2htdp/image) 放在最上面',
    mainSnippetId: 'image-functions',
    mainTitle: '讲义代码',
    mainNote: '这页不背细节，先知道每个函数产出的是 image。',
    right: { title: '基础图形', lines: ['circle', 'rectangle', 'text', '都会产生 image'] },
    trace: { title: '组合图像', lines: ['above：上下排', 'beside：左右排', 'overlay：叠起来'] },
    result: { title: '常见误会', lines: ['(text "hello" ...)', '结果是 image', '不是 string'] },
    bottom: ['先 require', '造 image', '组合 image'],
  }),
  slide({
    title: 'Primitive Data：程序里的原子材料',
    sceneTitle: '基础数据类型',
    rule: '基础数据类型会组合成复杂数据',
    mainSnippetId: 'primitive-data-examples',
    mainTitle: '四类常见值',
    mainNote: 'true、123、"123"、image 看起来都像数据，但类型不同。',
    right: { title: '四种类型', lines: ['Booleans', 'numbers', 'image', 'String'] },
    trace: { title: '为什么分类型', lines: ['同样写法不一定同类', '"123" 和 123 不一样', '函数要吃对类型'] },
    result: { title: '原子数据', lines: ['基础类型像材料', '以后用它们组成', '更复杂的数据'] },
    bottom: ['先看值', '判断类型', '再决定操作'],
  }),
  slide({
    title: 'Function：把一段逻辑命名',
    sceneTitle: '函数定义结构',
    rule: '(define (name parameter ...) body)',
    mainSnippetId: 'function-template',
    mainTitle: '函数基本结构',
    mainNote: 'define 是把逻辑命名；调用时才真正开始求值。',
    right: { title: '三个位置', lines: ['函数名', '参数', 'body'] },
    trace: { title: '参数是占位', lines: ['变量一、变量二', '调用时被具体值替换', '定义时还没执行'] },
    result: { title: '像数学函数', lines: ['f(x,y)', '输入不同', 'body 重新计算'] },
    bottom: ['先定义名字', '调用给值', '代入 body'],
  }),
  slide({
    title: '函数求值：先算参数，再展开函数',
    sceneTitle: '函数求值规则',
    rule: '先简化最左边需要简化的表达式',
    mainSnippetId: 'function-eval',
    mainTitle: '讲义 trace',
    mainNote: '外层 g 要等两个参数都变成 value 后才展开。',
    right: { title: '定义不执行', lines: ['define 先放入环境', '真正计算从调用开始', '(g ... ...) 是起点'] },
    trace: { title: '参数先算', lines: ['(f 2) -> 4', '(g 3 1) -> 2', '再进入外层 g'] },
    result: { title: '最后展开', lines: ['(g 4 2)', '=> (- 4 2)', '=> 2'] },
    bottom: ['看调用', '参数变 value', '展开 body'],
  }),
  slide({
    title: 'term 练习：两个参数本身也是表达式',
    sceneTitle: 'term 练习',
    rule: '参数先化简，body 后展开',
    mainSnippetId: 'term-eval',
    mainTitle: '讲义 trace',
    mainNote: 'x 和 y 不是直接给的 value，所以先处理参数表达式。',
    right: { title: 'x 的值', lines: ['(- 5 3)', '=> 2', 'x = 2'] },
    trace: { title: 'y 的值', lines: ['(+ 1 2)', '=> 3', 'y = 3'] },
    result: { title: '代入 body', lines: ['(* 2 (sqr 3))', '=> (* 2 9)', '=> 18'] },
    bottom: ['x 先变值', 'y 先变值', '再算 body'],
  }),
  slide({
    title: 'Global Variable：共享的名字',
    sceneTitle: '全局常量',
    rule: '全局名字可以在函数 body 中被读到',
    mainSnippetId: 'global-constants',
    mainTitle: '讲义代码',
    mainNote: 'DISCOUNT 和 TAX-RATE 是共享资源，函数里直接使用。',
    right: { title: '先读 define', lines: ['DISCOUNT = 0.2', 'TAX-RATE = 0.13', '名字通常大写'] },
    trace: { title: '调用时', lines: ['total_price = 200', '全局名字也替换', '再按乘法求值'] },
    result: { title: '为什么有用', lines: ['资源写一次', '多个函数共用', '以后修改集中'] },
    bottom: ['读全局 define', '读函数参数', '代入求值'],
  }),
  slide({
    title: 'if：只选择一个分支执行',
    sceneTitle: 'if 结构',
    rule: '(if question true-answer false-answer)',
    mainSnippetId: 'if-template',
    mainTitle: 'if 模板',
    mainNote: 'if 的第一步永远是先把 question-expression 算成 Boolean。',
    right: { title: 'true 情况', lines: ['question => true', '整个 if 替换成', 'true-answer'] },
    trace: { title: 'false 情况', lines: ['question => false', '整个 if 替换成', 'false-answer'] },
    result: { title: '只走一边', lines: ['不是两边都算', '选择一个 answer', '作为整个 if 的值'] },
    bottom: ['先算 question', '选一支', '整个 if 变成值'],
  }),
  slide({
    title: 'if 求值：Tall 还是 Wide',
    sceneTitle: 'if 求值',
    rule: 'question-expression 先变 Boolean',
    mainSnippetId: 'if-eval',
    mainTitle: '讲义代码',
    mainNote: '这里先比较高度和宽度，再决定整个 if 留哪一支。',
    right: { title: '先看常量', lines: ['IMAGE_HEIGHT = 10', 'IMAGE_WIDTH = 5', '名字先替换'] },
    trace: { title: '问题表达式', lines: ['(> IMAGE_HEIGHT IMAGE_WIDTH)', '=> (> 10 5)', '=> true'] },
    result: { title: '选择分支', lines: ['question => true', '保留 "Tall"', '丢掉 "Wide"'] },
    bottom: ['替换名字', '算 question', '选 answer'],
  }),
  slide({
    title: 'foo 练习：全局变量和参数混在一起',
    sceneTitle: 'foo 练习',
    rule: '先替换名字，再按求值规则化简',
    mainSnippetId: 'foo-exercise',
    mainTitle: '讲义代码',
    mainNote: 'A 和 B 来自全局；x 和 y 来自这次函数调用。',
    right: { title: '两类名字', lines: ['A = 5', 'B = 10', 'x = 1, y = 2'] },
    trace: { title: '进入 body', lines: ['(+ (* A x y B)', '   (+ x y x))', '先把名字换掉'] },
    result: { title: '求值顺序', lines: ['先算乘法那段', '再算加法那段', '最后外层 +'] },
    bottom: ['全局名字', '参数名字', 'body 求值'],
  }),
  slide({
    title: 'cond：多个条件从上往下试',
    sceneTitle: 'cond 结构',
    rule: '(cond [question answer] ... [else answer])',
    mainSnippetId: 'cond-eval',
    mainTitle: '讲义 trace',
    mainNote: 'cond 从第一行开始试，遇到 true 才选择对应 answer。',
    right: { title: '第一行', lines: ['(2 > 3)', '=> false', '跳过 "ab"'] },
    trace: { title: '第二行', lines: ['(4 < 2)', '=> false', '继续往下'] },
    result: { title: 'else', lines: ['前面都 false', '选 else', '=> "g"'] },
    bottom: ['从上往下', 'false 跳过', 'else 兜底'],
  }),
  slide({
    title: 'Racket 基础总结：读、算、分类型',
    sceneTitle: 'Racket 基础总结',
    rule: '读代码不是背答案，是按规则改写',
    mainSnippetId: 'short-circuit-practice',
    mainTitle: '用一行代码复盘',
    mainNote: '这一行把 operator、operand、Boolean、短路都串起来。',
    right: { title: '读法', lines: ['先找 operator', '再看 operands', '确认每段能读'] },
    trace: { title: '求值', lines: ['primitive 直接化值', '函数先算参数', 'if / cond 先算问题'] },
    result: { title: '类型', lines: ['Number / String', 'Boolean / Image', '不同类型不同操作'] },
    bottom: ['能读', '能算', '能解释为什么'],
  }),
];

const SPEECH = {
  本页主线: '先看本页最上方的规则，这就是这页所有代码动作的读法。',
  底部规则: '底部把这页能带走的操作顺序压成一句规则，后面做题时照这个顺序检查。',
};

for (const page of PAGES) {
  for (const component of page.components) {
    component.speech =
      SPEECH[component.label] ||
      (component.kind === 'code'
        ? `这一块保留讲义原始代码。讲的时候不要改写代码 token，而是沿着旁边的圈注和 trace 看它怎么被 Racket 读取。`
        : `这一块聚焦“${component.label}”：${component.lines.join('；')}。`);
  }
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function markerFor(name) {
  const marker = MARKERS.find((item) => item.name === name);
  if (!marker) throw new Error(`Unknown marker ${name}`);
  return marker;
}

function gridSvg() {
  let out = '<rect width="1600" height="900" fill="#fffefe"/>';
  for (let x = 0; x <= SOURCE_WIDTH; x += 30) out += `<line x1="${x}" y1="0" x2="${x}" y2="900" stroke="${COLORS.grid}" stroke-width="1"/>`;
  for (let y = 0; y <= SOURCE_HEIGHT; y += 30) out += `<line x1="0" y1="${y}" x2="1600" y2="${y}" stroke="${COLORS.grid}" stroke-width="1"/>`;
  for (let x = 0; x <= SOURCE_WIDTH; x += 150) out += `<line x1="${x}" y1="0" x2="${x}" y2="900" stroke="${COLORS.grid2}" stroke-width="1.2" opacity="0.6"/>`;
  for (let y = 0; y <= SOURCE_HEIGHT; y += 150) out += `<line x1="0" y1="${y}" x2="1600" y2="${y}" stroke="${COLORS.grid2}" stroke-width="1.2" opacity="0.6"/>`;
  return out;
}

function text(x, y, content, options = {}) {
  const size = options.size ?? 30;
  const fill = options.fill ?? COLORS.ink;
  const weight = options.weight ?? 500;
  const family = options.family ?? 'Noteworthy, Hiragino Sans GB, STHeiti, PingFang SC, sans-serif';
  const anchor = options.anchor ?? 'start';
  const rotate = options.rotate ? ` transform="rotate(${options.rotate} ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="0"${rotate}>${esc(content)}</text>`;
}

function multiText(x, y, lines, options = {}) {
  const size = options.size ?? 28;
  const lineHeight = options.lineHeight ?? Math.round(size * 1.35);
  const fill = options.fill ?? COLORS.ink;
  const weight = options.weight ?? 500;
  const family = options.family ?? 'Noteworthy, Hiragino Sans GB, STHeiti, PingFang SC, sans-serif';
  const rotate = options.rotate ? ` transform="rotate(${options.rotate} ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="0"${rotate}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line || ' ')}</tspan>`)
    .join('')}</text>`;
}

function codeText(x, y, lines, options = {}) {
  const maxLen = Math.max(...lines.map((line) => line.length), 1);
  const size = options.size ?? Math.max(19, Math.min(36, Math.floor(850 / Math.max(maxLen, 24))));
  const lineHeight = options.lineHeight ?? Math.round(size * 1.32);
  return multiText(x, y, lines, {
    size,
    lineHeight,
    fill: options.fill ?? COLORS.ink,
    weight: options.weight ?? 500,
    family: 'Menlo, Monaco, Consolas, monospace',
    rotate: options.rotate,
  });
}

function pathLine(d, options = {}) {
  const stroke = options.stroke ?? COLORS.teal;
  const width = options.width ?? 4;
  const opacity = options.opacity ?? 1;
  const dash = options.dash ? ` stroke-dasharray="${options.dash}"` : '';
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${dash}/>`;
}

function washPath(x, y, width, height, options = {}) {
  const fill = options.fill ?? COLORS.tealLight;
  const opacity = options.opacity ?? 0.5;
  const rotate = options.rotate ? ` transform="rotate(${options.rotate} ${x + width / 2} ${y + height / 2})"` : '';
  return `<path d="M ${x + 6} ${y + 11} C ${x + width * 0.24} ${y - 8}, ${x + width * 0.72} ${y + 3}, ${x + width - 8} ${y + 8} L ${
    x + width - 2
  } ${y + height - 10} C ${x + width * 0.72} ${y + height + 5}, ${x + width * 0.28} ${y + height + 10}, ${x + 4} ${y + height - 8} Z" fill="${fill}" opacity="${opacity}"${rotate}/>`;
}

function looseCircle(cx, cy, rx, ry, options = {}) {
  const stroke = options.stroke ?? COLORS.teal;
  const width = options.width ?? 4;
  const opacity = options.opacity ?? 1;
  return (
    pathLine(`M ${cx - rx} ${cy - 2} C ${cx - rx + 20} ${cy - ry - 20}, ${cx + rx - 20} ${cy - ry - 16}, ${cx + rx} ${cy} C ${cx + rx + 12} ${
      cy + ry + 4
    }, ${cx - rx + 10} ${cy + ry + 18}, ${cx - rx} ${cy - 2}`, { stroke, width, opacity }) +
    pathLine(`M ${cx - rx + 7} ${cy + 5} C ${cx - rx + 48} ${cy - ry - 8}, ${cx + rx - 55} ${cy - ry - 25}, ${cx + rx - 8} ${cy + 4} C ${
      cx + rx + 2
    } ${cy + ry}, ${cx - rx + 30} ${cy + ry + 9}, ${cx - rx + 7} ${cy + 5}`, { stroke, width: width * 0.55, opacity: opacity * 0.5 })
  );
}

function star(x, y, size = 20) {
  return `<path d="M ${x} ${y - size} L ${x + 5} ${y - 5} L ${x + size} ${y - 6} L ${x + 8} ${y + 2} L ${x + 12} ${y + size} L ${x} ${
    y + 9
  } L ${x - 12} ${y + size} L ${x - 8} ${y + 2} L ${x - size} ${y - 6} L ${x - 5} ${y - 5} Z" fill="${COLORS.teal}"/>`;
}

function arrowHead(x, y, angle, fill = COLORS.brown) {
  return `<path d="M ${x} ${y} l -18 -8 l 7 8 l -7 8 Z" fill="${fill}" transform="rotate(${angle} ${x} ${y})"/>`;
}

function markerSquares(component) {
  const marker = markerFor(component.marker);
  return LAYOUTS[component.marker].marker.map(([x, y]) => `<rect x="${x}" y="${y}" width="16" height="16" fill="${marker.hex}"/>`).join('');
}

function drawHeader(page) {
  const ruleSize = page.rule.length > 44 ? 24 : 34;
  return [
    text(800, 78, page.title, { size: 54, weight: 700, anchor: 'middle', rotate: -0.8 }),
    codeText(800 - Math.min(360, page.rule.length * 8), 142, [page.rule], { size: ruleSize, fill: COLORS.tealDark }),
    pathLine('M 540 158 C 658 174, 946 174, 1062 158', { stroke: COLORS.brown, width: 3.6, opacity: 0.75 }),
  ].join('');
}

function drawMainCode(page) {
  const component = page.components[1];
  const code = component.lines;
  const lineCount = code.length;
  const maxLen = Math.max(...code.map((line) => line.length), 1);
  const fontSize = Math.max(
    16,
    Math.min(37, Math.floor(870 / Math.max(maxLen, 26)), Math.floor(210 / Math.max(lineCount * 1.32, 1)), lineCount > 6 ? 21 : 37),
  );
  const lineHeight = Math.round(fontSize * 1.32);
  const codeY = lineCount > 6 ? 260 : 330;
  const codeBottom = codeY + (lineCount - 1) * lineHeight;
  const showNote = codeBottom < 410;
  const noteY = codeBottom + 38;
  return [
    star(132, 244, 18),
    text(166, 250, component.label, { size: 34, weight: 700, rotate: -1 }),
    washPath(155, 274, 1000, Math.min(178, Math.max(86, lineCount * lineHeight + 24)), { opacity: 0.45, rotate: -0.35 }),
    codeText(186, codeY, code, { size: fontSize, lineHeight }),
    lineCount <= 4 ? pathLine('M 190 356 C 250 370, 344 370, 410 356', { stroke: COLORS.brownSoft, width: 4, opacity: 0.55 }) : '',
    showNote ? text(188, noteY, page.mainNote, { size: 25, fill: COLORS.muted, rotate: -0.2 }) : '',
    pathLine('M 904 311 C 1008 250, 1088 248, 1156 284', { stroke: COLORS.brown, width: 4, opacity: 0.72 }),
    arrowHead(1156, 284, 13, COLORS.brown),
  ].join('');
}

function drawRight(page) {
  const component = page.components[2];
  return [
    text(1180, 236, component.label, { size: 34, weight: 700, rotate: 0.6 }),
    multiText(1190, 300, component.lines, { size: 25, lineHeight: 36, fill: component.lines.some((line) => line.includes('不能')) ? COLORS.brown : COLORS.muted }),
    pathLine('M 1176 318 C 1240 334, 1322 333, 1384 316', { stroke: COLORS.brown, width: 4, opacity: 0.55 }),
  ].join('');
}

function drawTrace(page) {
  const component = page.components[3];
  const codeLike = component.lines.some((line) => line.includes('->') || line.includes('=>'));
  return [
    text(128, 514, component.label, { size: 31, weight: 700, rotate: -0.5 }),
    pathLine('M 126 532 C 270 548, 450 548, 610 532', { stroke: COLORS.teal, width: 3.8, opacity: 0.75 }),
    codeLike
      ? codeText(160, 592, component.lines, { size: Math.min(28, Math.max(20, Math.floor(470 / Math.max(...component.lines.map((line) => line.length), 1)))) })
      : multiText(160, 592, component.lines, { size: 26, lineHeight: 36 }),
    pathLine('M 155 676 C 232 692, 310 693, 398 675', { stroke: COLORS.teal, width: 4, opacity: 0.72 }),
  ].join('');
}

function drawResult(page) {
  const component = page.components[4];
  const codeLike = component.lines.some((line) => line.includes('->') || line.includes('=>') || line.startsWith('('));
  return [
    text(790, 514, component.label, { size: 33, weight: 700, rotate: 0.4 }),
    codeLike
      ? codeText(814, 580, component.lines, { size: Math.min(34, Math.max(22, Math.floor(560 / Math.max(...component.lines.map((line) => line.length), 1)))) })
      : multiText(820, 584, component.lines, { size: 27, lineHeight: 38 }),
    pathLine('M 1042 602 C 1095 640, 1190 640, 1248 603', { stroke: COLORS.brown, width: 4.5, opacity: 0.7 }),
  ].join('');
}

function drawBottom(page) {
  const items = page.components[5].lines;
  const y = 804;
  const parts = [star(370, 800, 22)];
  let x = 416;
  for (const [index, item] of items.entries()) {
    parts.push(text(x, y, item, { size: 30, weight: 700, rotate: index % 2 ? 0.2 : -0.4 }));
    x += Math.max(210, item.length * 24);
    if (index < items.length - 1) {
      parts.push(pathLine(`M ${x - 20} 794 C ${x + 24} 786, ${x + 70} 786, ${x + 112} 798`, { stroke: COLORS.brown, width: 4, opacity: 0.8 }));
      parts.push(arrowHead(x + 112, 798, 7, COLORS.brown));
      x += 140;
    }
  }
  parts.push(pathLine('M 414 824 C 604 842, 1014 842, 1408 822', { stroke: COLORS.brown, width: 3.5, opacity: 0.65, dash: '1 16' }));
  return parts.join('');
}

function slideSvg(page, includeMarkers) {
  const texture = '<defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.025"/></feComponentTransfer></filter></defs><rect width="1600" height="900" filter="url(#paper)" opacity="0.55"/>';
  const markers = includeMarkers ? page.components.map(markerSquares).join('') : '';
  return `<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">${gridSvg()}${texture}${drawHeader(page)}${drawMainCode(page)}${drawRight(page)}${drawTrace(page)}${drawResult(page)}${drawBottom(page)}${markers}</svg>`;
}

async function renderPage(pageNumber) {
  const page = PAGES[pageNumber - 1];
  const label = pageLabel(pageNumber);
  ensureDir(path.join(QUEUE_DIR, `${VERSION}-marker-generated`));
  ensureDir(PUBLIC_DIR);
  await sharp(Buffer.from(slideSvg(page, true)))
    .png()
    .toFile(path.join(QUEUE_DIR, `${VERSION}-marker-generated`, `page-${label}.png`));
  await sharp(Buffer.from(slideSvg(page, true))).png().toFile(path.join(PUBLIC_DIR, `${VERSION}-marker-slide-${label}.png`));
  await sharp(Buffer.from(slideSvg(page, false))).png().toFile(path.join(PUBLIC_DIR, `${VERSION}-slide-${label}.png`));
}

async function decodeRaw(filePath) {
  const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function componentsForColor(raw, marker) {
  const seen = new Uint8Array(raw.width * raw.height);
  const components = [];
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const offset = y * raw.width + x;
      if (seen[offset]) continue;
      const i = offset * 3;
      if (!marker.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) continue;
      const stack = [[x, y]];
      seen[offset] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= raw.width || ny >= raw.height) continue;
          const no = ny * raw.width + nx;
          if (seen[no]) continue;
          const ni = no * 3;
          if (marker.match(raw.data[ni] || 0, raw.data[ni + 1] || 0, raw.data[ni + 2] || 0)) {
            seen[no] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (count > 40) components.push({ minX, minY, maxX, maxY, count });
    }
  }
  return components;
}

function bboxForMarker(markerName) {
  const points = LAYOUTS[markerName].marker;
  const xs = points.map(([x]) => x + 8);
  const ys = points.map(([, y]) => y + 8);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function toCanvasBbox([left, top, right, bottom]) {
  return [
    Math.round((left / SOURCE_WIDTH) * CANVAS_WIDTH * 10) / 10,
    Math.round((top / SOURCE_HEIGHT) * CANVAS_HEIGHT * 10) / 10,
    Math.round((right / SOURCE_WIDTH) * CANVAS_WIDTH * 10) / 10,
    Math.round((bottom / SOURCE_HEIGHT) * CANVAS_HEIGHT * 10) / 10,
  ];
}

function markerPoints(markerName) {
  return LAYOUTS[markerName].marker.map(([x, y], index) => ({
    corner: ['top-left', 'top-right', 'bottom-left', 'bottom-right'][index],
    x: Math.round(((x + 8) / SOURCE_WIDTH) * CANVAS_WIDTH * 10) / 10,
    y: Math.round(((y + 8) / SOURCE_HEIGHT) * CANVAS_HEIGHT * 10) / 10,
  }));
}

function buildPrompt(page, pageNumber) {
  return `Use case: scientific-educational
Asset type: 16:9 Simplified Chinese hand-drawn CPSC107 code notebook slide with recoverable component corner markers

Generate page ${pageNumber} as a code-first classroom notebook page. The exact code must come from the provided lecture code bank and must not be invented, optimized, translated, or rewritten.

Student-visible prose must be Simplified Chinese. Racket keywords, literals, strings, and code comments from the code bank must remain exactly as provided.
Do not write course code, course name, teacher name, date, page number, or week label on the slide.

Slide title: ${page.title}
Top rule: ${page.rule}

Components:
${page.components
  .map((component) => {
    const marker = markerFor(component.marker);
    return `- ${component.label}; marker ${marker.hex}; content:\n${component.lines.join('\n')}`;
  })
  .join('\n\n')}

Marker target: exactly 24 isolated square markers, 4 per component, colors #ff0000, #00ff00, #0048ff, #00ffff, #ff00ff, #ffff00.`;
}

function buildPromptPlan(page, pageNumber, prompt) {
  const componentPlans = page.components.map((component, index) => {
    const marker = markerFor(component.marker);
    return {
      id: `${NOTEBOOK_ID}-${VERSION}-p${pageLabel(pageNumber)}-${marker.name}`,
      label: component.label,
      role: component.kind,
      order: index + 1,
      markerColorName: marker.name,
      markerColorHex: marker.hex,
      visibleText: component.lines,
      sourceSnippetId: component.snippetId,
      participatesInMask: true,
    };
  });
  return {
    schemaVersion: 1,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    componentPlans,
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 16,
      markerCountPerComponent: 4,
      colorPool: MARKERS.map(({ name, hex }) => ({ name, hex })),
    },
    compiledImagePrompt: prompt,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor: Object.fromEntries(componentPlans.map((component) => [component.markerColorHex, 4])),
    },
    recoveryResult: { status: 'pending' },
  };
}

function preparePrompts() {
  const promptDir = path.join(QUEUE_DIR, `${VERSION}-prompts`);
  const planDir = path.join(QUEUE_DIR, `${VERSION}-prompt-plans`);
  ensureDir(promptDir);
  ensureDir(planDir);
  writeJson(path.join(QUEUE_DIR, 'code-bank.json'), CODE_BANK);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const prompt = buildPrompt(page, pageNumber);
    fs.writeFileSync(path.join(promptDir, `page-${label}.prompt.md`), prompt);
    writeJson(path.join(planDir, `page-${label}.prompt-plan.json`), buildPromptPlan(page, pageNumber, prompt));
  }
  writeJson(path.join(QUEUE_DIR, `${VERSION}-outline.json`), {
    notebookId: NOTEBOOK_ID,
    title: 'Racket 基础：从表达式到条件求值',
    pageCount: PAGES.length,
    sourcePdf: CODE_BANK.sourcePdf,
    pages: PAGES.map((page, index) => ({
      pageNumber: index + 1,
      title: page.title,
      sceneTitle: page.sceneTitle,
      components: page.components.map(({ label, marker, kind, snippetId }) => ({ label, marker, kind, snippetId })),
    })),
  });
  console.log(`[prepare] wrote ${PAGES.length} prompts`);
}

async function recoverPage(pageNumber) {
  const label = pageLabel(pageNumber);
  const markerPublic = path.join(PUBLIC_DIR, `${VERSION}-marker-slide-${label}.png`);
  const promptPlanPath = path.join(QUEUE_DIR, `${VERSION}-prompt-plans`, `page-${label}.prompt-plan.json`);
  const plan = readJson(promptPlanPath);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  for (const component of plan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    if (components.length !== 4) findings.push(`${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`);
    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: marker.hex,
      bbox: toCanvasBbox(bboxForMarker(marker.name)),
      markerPoints: markerPoints(marker.name),
      markerCount: components.length,
    });
  }
  const recoveryResult = {
    status: findings.length ? 'failed' : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl: `${PUBLIC_PATH}/${VERSION}-marker-slide-${label}.png`,
    cleanImageUrl: `${PUBLIC_PATH}/${VERSION}-slide-${label}.png`,
    originalMarkerImageDimensions: { width: raw.width, height: raw.height },
    findings,
    components: recoveredComponents,
  };
  writeJson(promptPlanPath, { ...plan, recoveryResult });
  return recoveryResult;
}

async function renderPages(pageNumbers) {
  preparePrompts();
  const summary = [];
  for (const pageNumber of pageNumbers) {
    await renderPage(pageNumber);
    const recoveryResult = await recoverPage(pageNumber);
    summary.push({ pageNumber, status: recoveryResult.status, findings: recoveryResult.findings });
    console.log(`[render] page-${pageLabel(pageNumber)} ${recoveryResult.status}`);
  }
  writeJson(path.join(QUEUE_DIR, `${VERSION}-marker-recovery-summary.json`), summary);
}

function focusRegionsFromPlan(promptPlan) {
  const recoveredById = new Map((promptPlan.recoveryResult?.components || []).map((component) => [component.componentId, component]));
  return promptPlan.componentPlans.map((component) => {
    const recovered = recoveredById.get(component.id);
    const [left, top, right, bottom] = recovered.bbox;
    return {
      id: component.id,
      label: component.label,
      role: component.role,
      left,
      top,
      width: Math.round((right - left) * 10) / 10,
      height: Math.round((bottom - top) * 10) / 10,
      order: component.order,
    };
  });
}

function imageElement(pageNumber) {
  const label = pageLabel(pageNumber);
  return {
    id: `${NOTEBOOK_ID}-${VERSION}-image-${label}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_PATH}/${VERSION}-slide-${label}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    outline: { color: '#ffffff', width: 0, style: 'solid' },
    opacity: 0,
  };
}

function canvasFor(pageNumber, focusRegions) {
  return {
    id: `${NOTEBOOK_ID}-${VERSION}-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#087b77', '#8a6238', '#111827'],
      fontColor: '#111827',
      fontName: 'Inter',
      outline: { color: '#087b77', width: 2, style: 'solid' },
    },
    elements: [imageElement(pageNumber), ...focusRegions.map(hotspotElement)],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function actionsForPage(page, pageNumber, focusRegions) {
  return page.components.flatMap((component, index) => {
    const region = focusRegions[index];
    return [
      {
        id: `${NOTEBOOK_ID}-${VERSION}-p${pageLabel(pageNumber)}-spotlight-${index + 1}`,
        type: 'spotlight',
        elementId: region.id,
        title: component.label,
        description: `聚焦“${component.label}”区域。`,
        dimOpacity: 0.76,
      },
      {
        id: `${NOTEBOOK_ID}-${VERSION}-p${pageLabel(pageNumber)}-speech-${index + 1}`,
        type: 'speech',
        title: `讲解：${component.label}`,
        text: component.speech,
      },
    ];
  });
}

async function writeNarrationFiles() {
  const outDir = path.join(QUEUE_DIR, `${VERSION}-narration`);
  ensureDir(outDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const promptPlan = readJson(path.join(QUEUE_DIR, `${VERSION}-prompt-plans`, `page-${label}.prompt-plan.json`));
    const focusRegions = focusRegionsFromPlan(promptPlan);
    writeJson(path.join(outDir, `page-${label}.actions.json`), {
      notebookId: NOTEBOOK_ID,
      pageNumber,
      sceneTitle: page.sceneTitle,
      actions: actionsForPage(page, pageNumber, focusRegions),
    });
  }
  console.log(`[narration] wrote ${PAGES.length} files`);
}

async function renderContactSheet() {
  const columns = 3;
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 30;
  const composites = [];
  for (let pageNumber = 1; pageNumber <= PAGES.length; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const file = path.join(PUBLIC_DIR, `${VERSION}-slide-${label}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="12" y="21" fill="#ffffff" font-size="15" font-family="Arial">${pageNumber}. ${esc(PAGES[pageNumber - 1].sceneTitle)}</text></svg>`;
    const thumb = await sharp(file)
      .resize(thumbWidth, thumbHeight)
      .extend({ bottom: labelHeight, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: ((pageNumber - 1) % columns) * thumbWidth,
      top: Math.floor((pageNumber - 1) / columns) * (thumbHeight + labelHeight),
    });
  }
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(PAGES.length / columns) * (thumbHeight + labelHeight),
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(PUBLIC_DIR, `${VERSION}-contact-sheet.png`));
  console.log(`[contact-sheet] ${path.join(PUBLIC_DIR, `${VERSION}-contact-sheet.png`)}`);
}

function loadEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const now = new Date();
    const scenes = [];
    for (const [index, page] of PAGES.entries()) {
      const pageNumber = index + 1;
      const label = pageLabel(pageNumber);
      const promptPlan = readJson(path.join(QUEUE_DIR, `${VERSION}-prompt-plans`, `page-${label}.prompt-plan.json`));
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') throw new Error(`Page ${pageNumber} recovery is not passed`);
      scenes.push({
        id: `${NOTEBOOK_ID}-${VERSION}-p${label}`,
        notebookId: NOTEBOOK_ID,
        title: page.sceneTitle,
        type: 'slide',
        order: index,
        content: {
          type: 'slide',
          canvas: canvasFor(pageNumber, focusRegions),
          webRenderMode: 'slide',
          semanticHitMap: {
            version: 1,
            source: 'deterministic-code-corner-marker-recovery-v3',
            sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
            canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            regions: focusRegions.map((region) => ({
              id: region.id,
              semanticId: region.id,
              label: region.label,
              canvasRect: {
                left: region.left,
                top: region.top,
                width: region.width,
                height: region.height,
              },
            })),
          },
          imageNotebookPromptPlan: promptPlan,
          sourceCodeBank: CODE_BANK,
        },
        actions: actionsForPage(page, pageNumber, focusRegions),
        whiteboard: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: course.ownerId,
          courseId: course.id,
          name: 'Racket 基础：从表达式到条件求值',
          description:
            'CPSC107 第一本代码批注笔记本：Racket 前缀表达式、primitive operators、求值规则、Boolean、String、Image、函数、全局常量、if 与 cond。',
          tags: ['CPSC107', 'Racket', '代码课', '求值规则', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'code-annotated-notebook-v3',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: 'Racket 基础：从表达式到条件求值',
          description:
            'CPSC107 第一本代码批注笔记本：Racket 前缀表达式、primitive operators、求值规则、Boolean、String、Image、函数、全局常量、if 与 cond。',
          tags: ['CPSC107', 'Racket', '代码课', '求值规则', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'code-annotated-notebook-v3',
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] replaced ${NOTEBOOK_ID}; scenes=${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

function pageNumbersFromArgs() {
  const pageIndex = process.argv.indexOf('--page');
  if (pageIndex >= 0) return [Number(process.argv[pageIndex + 1])];
  return PAGES.map((_, index) => index + 1);
}

function usage() {
  console.log(`Usage:
  node scripts/notebooks/${SCRIPT_NAME} --prepare-prompts
  node scripts/notebooks/${SCRIPT_NAME} --render [--page <n>]
  node scripts/notebooks/${SCRIPT_NAME} --write-narration
  node scripts/notebooks/${SCRIPT_NAME} --contact-sheet
  node scripts/notebooks/${SCRIPT_NAME} --seed-db`);
}

async function main() {
  if (process.argv.includes('--prepare-prompts')) return preparePrompts();
  if (process.argv.includes('--render')) return renderPages(pageNumbersFromArgs());
  if (process.argv.includes('--write-narration')) return writeNarrationFiles();
  if (process.argv.includes('--contact-sheet')) return renderContactSheet();
  if (process.argv.includes('--seed-db')) return seedDb();
  usage();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
