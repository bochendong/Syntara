#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CPSC107_COURSE_MEMORY_ID,
  CPSC107_COURSE_MEMORY_TITLE,
  CPSC107_PUBLIC_MEMORY_TEXTS,
} from './cpsc107-public-memory-concepts.mjs';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpc9dqgv000p8ogmrsjl5co8';
const COURSE_ID = process.env.CPSC107_COURSE_ID || DEFAULT_COURSE_ID;
const QUEUE_DIR = path.join(ROOT, 'queue', 'CPSC107');
const COURSE_MEMORY_ID = CPSC107_COURSE_MEMORY_ID;
const COURSE_MEMORY_TITLE = CPSC107_COURSE_MEMORY_TITLE;
const COURSE_MEMORY_TEXT = CPSC107_PUBLIC_MEMORY_TEXTS[COURSE_MEMORY_ID];

const PDFS = [
  {
    file: '01_Rackert_基础.pdf',
    notebookId: 'queue-cpsc107-01-racket-basics',
    name: '01 - Racket 基础：表达式、数据与求值规则',
    description:
      'CPSC107 无图笔记本：Racket 前缀表达式、primitive data、function、evaluation rule、global variable 与 if。',
    tags: ['CPSC107', 'Racket', '无图笔记本', 'Week 1'],
    memoryId: 'memory_cpsc107_queue_01_racket_basics_public_20260611',
    memoryTitle: 'CPSC107 Racket 基础公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 01《Racket 基础：表达式、数据与求值规则》。

## 记忆边界
共有记忆要记录本讲高频 Racket 基础工具：前缀表达式、求值规则、if/cond、and/or short-circuit、Number/String/Image primitive operations、function 和 global constant。具体 require 与 starter 文件要求仍以 Course Pack 和题目给定代码为准。

## 知识路径
1. 数学式要转成 DrRacket 前缀表达式：operator 在最前面，operands 从里到外、从左到右变成 value。
2. Boolean、String、Image 和 primitive data 用来说明函数消费什么、产生什么，也要保留常见操作例子，方便回答“怎么切字符串”“怎么组合图片”。
3. function、global variable、evaluation rule、if/cond 和 and/or short-circuit 要放在“表达式如何求值”的同一条线上理解。

## 格式规则
- 前缀表达式要写成 DrRacket 真实语法，例如 (+ (- 3 2) (/ 4 5))。
- 求值步骤每一步只化简最左边需要化简的表达式。
- and/or 要按短路求值判断：结果已确定后，后面的表达式不再求值。
- String 切片使用 substring，index 从 0 开始，end 不包含。
- Image 题要确认 starter 是否已经提供图片库，再使用 circle、rectangle、text、above、beside、overlay、rotate 等基础函数。
- global variable 一般大写，并解释为什么共享常量比在每个函数里硬编码更清楚。

## 检查点
这一步化简的是哪一个最左边还没变成 value 的表达式？这个 if/cond/and/or 是否已经决定不需要继续求某些表达式？这个函数的输入、输出和 check-expect 是否先写清楚了？当前题需要的是 Number、String、Boolean 还是 Image 操作？`,
  },
  {
    file: '02_htdf_htdd.pdf',
    notebookId: 'queue-cpsc107-02-htdf-htdd',
    name: '02 - HTDF 与 HTDD：函数和数据设计配方',
    description:
      'CPSC107 无图笔记本：HTDF 七步、purpose/signature/stub、HTDD、atomic distinct/non-distinct、one-of。',
    tags: ['CPSC107', 'HTDF', 'HTDD', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_02_htdf_htdd_public_20260611',
    memoryTitle: 'CPSC107 HTDF/HTDD 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 02《HTDF 与 HTDD：函数和数据设计配方》。

## 记忆边界
不记录 HTDF/HTDD 的普通定义。共有记忆记录本课使用的固定 recipe 格式，以及判断数据 template rule 的知识规则。

## HTDF 格式
HTDF 顺序固定为：Function Name、Signature、Purpose、Examples、Stub、Template、Function Body。函数代码应由 recipe 前面步骤推出，而不是脱离 recipe 单独出现。

## 关键规则
- Purpose 必须是一句话，短且说明 input/output；不要写成多段解释。
- Signature 首字母要大写，如 Number、String、Boolean、Image、Natural。
- Stub 要有正确函数名、参数数量和 dummy result；Number/Natural 通常用 0，String 用 ""，Image 用 empty-image。
- check-expect 是判断函数行为的证据，通常要先写 3-5 个实用例子。

## HTDD 格式
HTDD 要写数据名、interp、examples/常量、dd-template-rules 和 template body。Atomic non-distinct、atomic distinct、one-of、compound、ref、self-ref 都要从数据形状判断，不要凭题目关键词猜。one-of 要区分 enumeration 和 itemization：enumeration 全是固定 distinct values；itemization 可以混合 false、范围、字符串或 compound 等不同形状。

## One-of 习惯
枚举型数据要用 cond 分支穷尽列出的值；normal enumerations 不要随手用 else。Itemization 要先判断每个 subclass 的 predicate 或 distinct value。

## 检查点
你现在缺的是 HTDF 的哪一步？这个数据是 atomic distinct、atomic non-distinct，还是 one-of？template rule 能不能从数据定义本身读出来？`,
  },
  {
    file: '03_ref_self_ref.pdf',
    notebookId: 'queue-cpsc107-03-ref-self-ref',
    name: '03 - Reference 与 Self-reference：从复合数据到 List 模板',
    description:
      'CPSC107 无图笔记本：ref、自引用、ListOf primitive/compound、one-of template 和历史考题模板。',
    tags: ['CPSC107', 'reference', 'self-reference', 'List', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_03_ref_self_ref_public_20260611',
    memoryTitle: 'CPSC107 Reference/Self-reference 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 03《Reference 与 Self-reference：从复合数据到 List 模板》。

## 记忆边界
不记录 list、first/rest、compound data 的通用说明。共有记忆记录如何从数据定义读出 ref/self-ref，并把它落实成 template。

## 知识路径
1. 先讲 compound data 中某个 field 是另一个自定义数据时，要在 template 里调用 helper，这就是 ref。
2. 再用 cons/list 进入 self-reference：ListOfInteger 的 rest 仍然是 ListOfInteger。
3. 接着区分 ListOf primitive 与 ListOf compound：first 是 primitive 时直接用，first 是自定义数据时调用对应 helper。
4. 最后用 Waldo、Peat 这类历史题训练 one-of + compound + self-ref 混合判断。

## 格式规则
- ListOfX 的 template 先写 empty case，再写 else/cons case。
- self-ref 的位置通常在 (fn-for-x (rest xs))，ref 的位置通常在 (fn-for-y (first xs)) 或某个 selector 上。
- one-of 中若某个 subclass 是 struct，要用 predicate 分支；若是 distinct value，要用 string=?/false?/empty? 等对应判断。

## 检查点
这个 field 的类型是不是另一个自定义数据？如果是 list，first 和 rest 分别是什么类型？template 里哪里应该自然调用 helper？`,
  },
  {
    file: '04_recursion_bst.pdf',
    notebookId: 'queue-cpsc107-04-recursion-bst',
    name: '04 - Recursion 与 BST：从 List 递归到二叉搜索树',
    description:
      'CPSC107 无图笔记本：List recursion、helper、tree terminology、BST invariant 与 lookup-key。',
    tags: ['CPSC107', 'recursion', 'BST', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_04_recursion_bst_public_20260611',
    memoryTitle: 'CPSC107 Recursion/BST 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 04《Recursion 与 BST：从 List 递归到二叉搜索树》。

## 记忆边界
不记录 recursion 或 BST 的通用定义。共有记忆记录从 template 推出 helper 的方式，以及 BST lookup 的分支写法。

## 教学路径
1. 先问“我该怎么操作一个 list”，把 count odds、beside n rectangles、map add1 这类问题都拉回 ListOf 数据定义。
2. 用 ListOfInteger 的 one-of/self-ref template 写递归框架，再把具体题目填进 empty 和 cons 分支。
3. Package/Gift/Dimensions 题体现 helper 的来源：数据定义里用了另一个自定义数据，template 自然会调用 helper。
4. 后半讲从 tree 术语过渡到 BST，再用 key、left、right 和 invariant 写 lookup-key。

## 格式规则
- 递归题先写对应 HTDD/template，再写 HTDF；不要凭直觉直接写 function body。
- helper 命名要体现数据边界，例如 package-required-dims 调 gift-required-dims。
- BST lookup 按 false/base case、key 相等、target 小走 left、target 大走 right 的顺序写。

## 检查点
这个 recursive call 是来自哪个 self-reference？这个 helper 是因为哪个 field 的类型不是 primitive？BST lookup 有没有利用 left/right invariant 跳过不可能的子树？`,
  },
  {
    file: '05_trees.pdf',
    notebookId: 'queue-cpsc107-05-trees-mutual-reference',
    name: '05 - Trees 与 Mutual Reference：递归类型和树形模板',
    description:
      'CPSC107 无图笔记本：R/SR/MR/NH/NR/NMR 标注、Node/ListOfNode、Course/ListOfCourse mutual recursion。',
    tags: ['CPSC107', 'trees', 'mutual-reference', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_05_trees_public_20260611',
    memoryTitle: 'CPSC107 Trees/Mutual Reference 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 05《Trees 与 Mutual Reference：递归类型和树形模板》。

## 记忆边界
不记录树的普通术语清单。共有记忆记录判断箭头标签和互相递归模板的步骤。

## 箭头判断规则
先找最容易判断的 self-reference：ListOfX 里 rest 指向 ListOfX 通常是 SR。再看几个数据定义是否形成环；如果 A 经过 B/C 又回到 A，则相关箭头是 MR。剩下单向使用别的数据定义的是 R。

## Recursion Type
函数调用图里，自己调用自己是 NR；几个 helper 绕一圈回到原函数是 NMR；只是按数据定义自然调用另一个 helper，不形成环的通常是 NH。

## 树形模板
Node/ListOfNode 或 Course/ListOfCourse 要成对写 helper。处理树时，一个 helper 处理单个 node/course，另一个 helper 处理 list of children/dependents。合并结果时，常见是 cons 当前节点，再 append 子树结果。

## 检查点
这条箭头能不能最终回到自己？这是数据定义里的 reference，还是函数模板里的 natural helper？树题是不是同时写了 node 和 list helper？`,
  },
  {
    file: '06_two_one_of_local.pdf',
    notebookId: 'queue-cpsc107-06-two-one-of-local',
    name: '06 - Two One-of 与 Local：交叉模板、作用域和封装',
    description:
      'CPSC107 无图笔记本：two one-of cross product table、local scope、closure/lifting、encapsulated template、try-catch local。',
    tags: ['CPSC107', 'two one-of', 'local', 'encapsulation', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_06_two_one_of_local_public_20260611',
    memoryTitle: 'CPSC107 Two One-of/Local 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 06《Two One-of 与 Local：交叉模板、作用域和封装》。

## 记忆边界
不记录 local 或 closure 的通用定义。共有记忆记录 two one-of 表格合并、local stepper、lifting 和 encapsulated template 的格式规则。

## Two One-of 格式
遇到两个 one-of 参数时，先画 cross product of type comments table。不要急着写 8 个 case；先看哪些情况能合并。本讲 decoder 最终把 empty list、ops empty、keep、space、remove 合并成 5 个核心分支。

## Local 规则
local 内部可以用外层定义，外层不能直接用 local 内部定义。讲 scope 时用“总公司/外包公司”的比喻；讲 closure 时只把引用外层变量的 local function 判为 closure，普通 value 不是 closure。

## Local/HtDF 边界
使用 local 封装 helper 时，local 内只写局部 define。公开函数的 HtDF 设计元素保留在外层顶级位置：@htdf、@signature、purpose、check-expect、stub、@template-origin 不进入 local。encapsulated 不是“只要用了 local 就自动加”；它用于题目/source 明确给出或要求的封装模板，尤其是 mutual-reference helper 被藏进一个公开入口时。如果题目要求某个 helper 有完整 HtDF design，那个 helper 应该作为独立顶层函数出现，而不是把 tags/tests 塞进 local。

## Lifting/Stepper
local stepper 要把 local definition lift 成带编号的新定义，如 b_0、bee_0、foo_0。判断 lifted definitions 数量时，先数 local 中 define 的个数，再乘实际调用次数。

## Encapsulation
Course/ListOfCourse 这类互相递归模板要用 @template-origin Course ListOfCourse encapsulated，把两个 helper 包进一个公开函数里。封装模板里的 helper 名称要体现隐藏的数据边界，课程示例常用 fn-for--course/fn-for--loc 或 public-name--course/public-name--loc。

## 检查点
两个 one-of 的表格能合并成几类？这个 local function 有没有引用外层参数？公开函数是否只暴露一个入口，把互相递归 helper 封装在 local 里？`,
  },
  {
    file: '07_Abstract.pdf',
    notebookId: 'queue-cpsc107-07-abstract-functions',
    name: '07 - Abstract Functions：filter、map、build-list 与 fold',
    description:
      'CPSC107 无图笔记本：filter/map/build-list/foldr/foldl、lambda、struct list 处理和 abstract fold signature 推导。',
    tags: ['CPSC107', 'abstract functions', 'fold', 'lambda', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_07_abstract_public_20260611',
    memoryTitle: 'CPSC107 Abstract Functions 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 07《Abstract Functions：filter、map、build-list 与 fold》。

## 记忆边界
不记录 filter/map/fold 的普通定义。共有记忆记录如何把题目意图翻译成 predicate、transformer、builder 或 combiner。

## 知识路径
1. filter：先问“保留什么”，把条件写成 predicate，可以用 named helper 或 lambda。
2. map：先问“每个元素变成什么”，对 struct list 可以直接 map selector，再和 filter 组合。
3. build-list：先问 index 如何变成目标元素，注意 build-list 从 0 开始。
4. foldr/foldl：先追踪 x 和 y/acc 的含义，尤其 string-append 下 foldr 和 foldl 顺序不同。

## API 边界
本讲默认可用抽象函数边界是 filter、map、build-list、foldr、foldl，以及 named helper/lambda。不要把 apply 等未在本讲出现的高阶 API 当作已学工具，除非题面或源材料明确给出。

## Abstract Fold
推导 fold-treasure signature 时，不要背答案。先给 local 中每个 helper 的 output 起类型变量 X/Y/Z，再从 c1、c2、b1-b4 在函数体中的位置反推 signature。

## 检查点
这题要筛掉元素、改造元素、按 index 生成元素，还是把整串元素折叠成一个结果？fold 的 base value 和 combiner output 类型是否一致？`,
  },
  {
    file: '08_Search.pdf',
    notebookId: 'queue-cpsc107-08-search',
    name: '08 - Search：Generative Recursion 与 Backtracking',
    description:
      'CPSC107 无图笔记本：search problem、branching、solve template、try local、TA assignment next-state。',
    tags: ['CPSC107', 'search', 'generative recursion', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_08_search_public_20260611',
    memoryTitle: 'CPSC107 Search 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 08《Search：Generative Recursion 与 Backtracking》。

## 记忆边界
不记录 search problem 的普通定义。这里的 Search 指 backtracking search；共有记忆记录 solve/solve-list 的 try-catch 模板、branching 解释和 next-search-problems 的设计顺序。Generative recursion 只作为“生成下一批问题”的机制单独理解，并且纯 genrec 答案必须写 Termination argument。

## 知识路径
1. 先把 backtracking search problem 拆成 states、start state、goal test、successor function、failure result 和 solution path。
2. 纯 genrec 模板要写 Base Case、reduction step、argument，说明为什么生成的问题最终会到 base case。
3. Backtracking 例题中，每个候选项都分成“不选/选”两个分支；branch 返回新的 state list。
4. solve-cs 先检查 solved，再检查 options empty，最后把 branches 交给 solve-locs。
5. solve-locs 必须用 local 存 try：如果 try 不是 false 就返回，否则继续 rest。

## TA Assignment 格式
先定义 SearchState，把 current assignment 和 remaining slots 放进 state。next-search-problems 是关键：先 local 取出 cur-assign、cur-slot，再写 all-criteria?，最后用 filter 找可用 TA，用 map 生成下一批 state。

## 检查点
当前 state 里必须记住哪些信息，下一步才知道约束是否满足？goal test、empty failure case、successor function 分别在哪里？try 为什么要判断 not false? 而不是 true?`,
  },
  {
    file: '09_Tail_Recursion.pdf',
    notebookId: 'queue-cpsc107-09-tail-recursion',
    name: '09 - Tail Recursion 与 Accumulator：从普通递归到 Worklist',
    description:
      'CPSC107 无图笔记本：accumulator、tail recursion、result-so-far、worklist accumulator、tree traversal。',
    tags: ['CPSC107', 'tail recursion', 'accumulator', 'worklist', '无图笔记本'],
    memoryId: 'memory_cpsc107_queue_09_tail_recursion_public_20260611',
    memoryTitle: 'CPSC107 Tail Recursion/Accumulator 公共记忆',
    memoryText: `## 适用范围
CPSC107 notebook 09《Tail Recursion 与 Accumulator：从普通递归到 Worklist》。

## 记忆边界
不记录 tail recursion 的普通定义。共有记忆记录 accumulator 含义、初始化方式和 local helper 结构。

## 知识路径
1. 先对比普通递归：recursive call 返回后还要做额外运算，所以会回溯。
2. 再讲 accumulator：把中间结果作为参数传给下一层，recursive call 成为最后一步。
3. list 题先问“要告诉下面的人什么”：skipl 需要 index counter，max repeats 需要 pre/num/history max，list-range 需要 min/max，alphabetical order 需要 previous string。
4. tree/worklist 题要同时记录 result so far 和 todo/wish list。

## 格式规则
- @template-origin 要写明 accumulator。
- 外层公开函数负责初始化 accumulator；local helper 负责递归推进。
- 公开 wrapper 拥有顶层 @htdf、@signature、purpose、check-expect、stub、@template-origin；accumulator/local helper 只作为局部 define 出现，除非题目明确要求独立顶层 helper。accumulator 的主策略要写 accumulator；只有题目/source 同时给出或要求 encapsulated template 时，才额外加入 encapsulated。
- tail recursion 判断看最后执行的是 function call 还是 operator。
- worklist 版本处理 node 时，把 children append 到 todo，再继续处理 first todo。

## 检查点
这个 accumulator 的含义是什么？初始值是什么？每一步如何更新？递归调用之后还有没有额外计算？worklist 里还剩哪些节点没处理？`,
  },
];

function usage() {
  return [
    'Usage: pnpm notebooks:import-cpsc107-markdown -- [--write]',
    '',
    'Imports queue/CPSC107 PDFs as markdown notebooks without scenes/images/speech.',
    'Default is dry-run. Set CPSC107_COURSE_ID to override the course target.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { write: false, help: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--write') args.write = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadEnvFiles() {
  for (const envFile of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, envFile);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] != null) continue;
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function pageCount(pdfPath) {
  const output = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const match = output.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error(`Could not read page count for ${pdfPath}`);
  return Number(match[1]);
}

function extractPage(pdfPath, pageNumber) {
  return execFileSync(
    'pdftotext',
    ['-layout', '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, '-'],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
}

function isBoilerplatePage(rawText, pageNumber) {
  const compact = rawText.replace(/\s+/g, ' ').trim();
  if (!compact) return true;
  if (
    /Disclaimer/i.test(compact) &&
    /not substitute to the university course material/i.test(compact)
  ) {
    return true;
  }
  if (
    pageNumber === 1 &&
    /Systematic Program Design|Introduction to Computer Programming/i.test(compact) &&
    /导师：\s*Bochen Dong/i.test(compact)
  ) {
    return true;
  }
  return false;
}

function cleanPageText(rawText) {
  const dropPatterns = [
    /^\s*·\s*$/,
    /^\s*WEEK\s+\d+\s+CPSC\s+\d+\s*\|\|/i,
    /^\s*CPSC\s+\d+\s*\|\|/i,
    /^\s*导师：\s*Bochen Dong/i,
    /^\s*UBC\s+Week/i,
    /^\s*UBC\s*校\s*区/i,
    /^\s*\d+\s*$/,
  ];
  const lines = rawText
    .replace(/\f/g, '\n')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .filter((line) => !dropPatterns.some((pattern) => pattern.test(line)));

  return lines
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function isCodeLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('(') ||
    trimmed.startsWith(')') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith(']') ||
    trimmed.startsWith(';') ||
    trimmed.startsWith('@') ||
    /^\s{2,}\(/.test(line) ||
    /^\s{2,};/.test(line)
  );
}

function pageTitle(pageNumber, text) {
  const candidate = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        line.length <= 80 &&
        !line.includes('___') &&
        !/^(Example|Answer|Question|Note|Exercise)[:：]?$/i.test(line) &&
        !line.startsWith('(') &&
        !line.startsWith(';'),
    );
  return candidate ? `第 ${pageNumber} 页：${candidate}` : `第 ${pageNumber} 页`;
}

function renderPageMarkdown(text) {
  const out = [];
  let inCode = false;
  const closeCode = () => {
    if (!inCode) return;
    out.push('```');
    out.push('');
    inCode = false;
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      closeCode();
      if (out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (isCodeLine(line)) {
      if (!inCode) {
        if (out.length > 0 && out[out.length - 1] !== '') out.push('');
        out.push('```racket');
        inCode = true;
      }
      out.push(line.replace(/```/g, "'''"));
      continue;
    }
    closeCode();
    out.push(line.trim());
  }
  closeCode();
  return out
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function summarize(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function buildSections(meta) {
  const pdfPath = path.join(QUEUE_DIR, meta.file);
  const pages = pageCount(pdfPath);
  const sections = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const rawText = extractPage(pdfPath, pageNumber);
    if (isBoilerplatePage(rawText, pageNumber)) continue;
    const cleaned = cleanPageText(rawText);
    if (!cleaned || cleaned.replace(/\s+/g, '').length < 20) continue;
    const markdown = renderPageMarkdown(cleaned);
    if (!markdown) continue;
    sections.push({
      id: `${meta.notebookId}-p${String(pageNumber).padStart(2, '0')}`,
      title: pageTitle(pageNumber, cleaned),
      order: sections.length,
      markdown,
      summary: summarize(markdown),
      sourceMeta: {
        sourceKind: 'queue-pdf',
        sourcePath: `queue/CPSC107/${meta.file}`,
        pdfPage: pageNumber,
      },
    });
  }

  return { pageCount: pages, sections };
}

async function refreshCourseSummaryFields(prisma, courseId) {
  const notebookAggregate = await prisma.notebook.aggregate({
    where: { courseId },
    _count: { _all: true },
    _sum: {
      sceneCount: true,
      speechReadyCount: true,
      speechTotalCount: true,
    },
  });
  const [problemCount, publishedProblemCount] = await Promise.all([
    prisma.notebookProblem.count({
      where: { OR: [{ courseId }, { notebook: { courseId } }] },
    }),
    prisma.notebookProblem.count({
      where: {
        status: 'published',
        OR: [{ courseId }, { notebook: { courseId } }],
      },
    }),
  ]);

  await prisma.course.updateMany({
    where: { id: courseId },
    data: {
      notebookCount: notebookAggregate._count._all,
      sceneCount: notebookAggregate._sum.sceneCount ?? 0,
      problemCount,
      publishedProblemCount,
      speechReadyCount: notebookAggregate._sum.speechReadyCount ?? 0,
      speechTotalCount: notebookAggregate._sum.speechTotalCount ?? 0,
    },
  });
}

async function clearVectorChunks(prisma, memoryId) {
  const tableRows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('"StudyMemoryChunk"')::text AS "tableName"`,
  );
  if (!tableRows[0]?.tableName) return;
  await prisma.$executeRawUnsafe('DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1', memoryId);
}

async function upsertMarkdownNotebook(prisma, course, meta, sections) {
  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: meta.notebookId },
      create: {
        id: meta.notebookId,
        ownerId: course.ownerId,
        courseId: course.id,
        name: meta.name,
        description: meta.description,
        tags: meta.tags,
        avatarUrl: null,
        language: 'zh-CN',
        style: 'source-markdown',
        notebookKind: 'markdown',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        sceneCount: sections.length,
        sectionCount: sections.length,
        speechReadyCount: 0,
        speechTotalCount: 0,
        speechStatus: 'no_speech',
        coverSlideJson: Prisma.DbNull,
        coverImagePath: null,
      },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: meta.name,
        description: meta.description,
        tags: meta.tags,
        avatarUrl: null,
        language: 'zh-CN',
        style: 'source-markdown',
        notebookKind: 'markdown',
        sceneCount: sections.length,
        sectionCount: sections.length,
        speechReadyCount: 0,
        speechTotalCount: 0,
        speechStatus: 'no_speech',
        coverSlideJson: Prisma.DbNull,
        coverImagePath: null,
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    await tx.scene.deleteMany({ where: { notebookId: meta.notebookId } });
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId: meta.notebookId } });
    if (sections.length > 0) {
      await tx.markdownNotebookSection.createMany({
        data: sections.map((section) => ({
          ...section,
          notebookId: meta.notebookId,
          courseId: course.id,
        })),
      });
    }
  });
}

async function upsertNotebookPublicMemory(prisma, course, meta) {
  const memoryText = CPSC107_PUBLIC_MEMORY_TEXTS[meta.memoryId] || meta.memoryText;
  await prisma.studyMemory.upsert({
    where: { id: meta.memoryId },
    create: {
      id: meta.memoryId,
      ownerId: course.ownerId,
      courseId: course.id,
      notebookId: meta.notebookId,
      targetType: 'notebook',
      scope: 'public',
      kind: 'notebook_operational_guide',
      status: 'active',
      source: 'manual_queue_rewrite',
      title: meta.memoryTitle,
      text: memoryText,
      reason: `CPSC107 单本笔记本详细操作记忆：${meta.name}。包含指导、模板例子和检查清单。`,
      sourceReferences: Prisma.DbNull,
    },
    update: {
      ownerId: course.ownerId,
      courseId: course.id,
      notebookId: meta.notebookId,
      targetType: 'notebook',
      scope: 'public',
      kind: 'notebook_operational_guide',
      status: 'active',
      source: 'manual_queue_rewrite',
      title: meta.memoryTitle,
      text: memoryText,
      reason: `CPSC107 单本笔记本详细操作记忆：${meta.name}。包含指导、模板例子和检查清单。`,
      sourceReferences: Prisma.DbNull,
      updatedAt: new Date(),
    },
  });
  await clearVectorChunks(prisma, meta.memoryId);
}

async function upsertCoursePublicMemory(prisma, course) {
  const courseMemoryText = CPSC107_PUBLIC_MEMORY_TEXTS[COURSE_MEMORY_ID] || COURSE_MEMORY_TEXT;
  await prisma.studyMemory.upsert({
    where: { id: COURSE_MEMORY_ID },
    create: {
      id: COURSE_MEMORY_ID,
      ownerId: course.ownerId,
      courseId: course.id,
      notebookId: null,
      targetType: 'course',
      scope: 'public',
      kind: 'course_concept_card',
      status: 'active',
      source: 'manual_course_rewrite',
      title: COURSE_MEMORY_TITLE,
      text: courseMemoryText,
      reason: 'CPSC107 整门课 concept card；精确课程合约由 Course Pack 直接注入。',
      sourceReferences: Prisma.DbNull,
    },
    update: {
      ownerId: course.ownerId,
      courseId: course.id,
      notebookId: null,
      targetType: 'course',
      scope: 'public',
      kind: 'course_concept_card',
      status: 'active',
      source: 'manual_course_rewrite',
      title: COURSE_MEMORY_TITLE,
      text: courseMemoryText,
      reason: 'CPSC107 整门课 concept card；精确课程合约由 Course Pack 直接注入。',
      sourceReferences: Prisma.DbNull,
      updatedAt: new Date(),
    },
  });
  await clearVectorChunks(prisma, COURSE_MEMORY_ID);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFiles();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Add it to .env.local or the shell env.');
  }

  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({
      where: { id: COURSE_ID },
      select: { id: true, name: true, courseCode: true, ownerId: true },
    });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);

    console.log(`Mode: ${args.write ? 'write' : 'dry-run'}`);
    console.log(`Course: ${course.name} (${course.id}) owner=${course.ownerId}`);

    const prepared = PDFS.map((meta) => {
      const { pageCount: sourcePages, sections } = buildSections(meta);
      return { meta, sourcePages, sections };
    });

    for (const item of prepared) {
      console.log(
        `- ${args.write ? 'upsert' : 'would upsert'}: ${item.meta.name} (${item.sections.length}/${item.sourcePages} sections)`,
      );
    }
    console.log(
      `- ${args.write ? 'upsert' : 'would upsert'} notebook public memories: ${PDFS.length}`,
    );
    console.log(
      `- ${args.write ? 'upsert' : 'would upsert'} course public memory: ${COURSE_MEMORY_TITLE}`,
    );

    if (!args.write) {
      console.log('Dry-run complete. Re-run with --write to mutate the target DB.');
      return;
    }

    for (const item of prepared) {
      await upsertMarkdownNotebook(prisma, course, item.meta, item.sections);
      await upsertNotebookPublicMemory(prisma, course, item.meta);
    }
    await upsertCoursePublicMemory(prisma, course);
    await refreshCourseSummaryFields(prisma, course.id);

    const created = await prisma.notebook.findMany({
      where: { id: { in: PDFS.map((item) => item.notebookId) } },
      select: {
        id: true,
        name: true,
        notebookKind: true,
        sceneCount: true,
        sectionCount: true,
        _count: { select: { scenes: true, markdownSections: true, studyMemories: true } },
      },
      orderBy: { id: 'asc' },
    });
    const courseMemoryCount = await prisma.studyMemory.count({
      where: {
        courseId: course.id,
        notebookId: null,
        targetType: 'course',
        scope: 'public',
        status: 'active',
      },
    });
    const notebookMemoryCount = await prisma.studyMemory.count({
      where: {
        courseId: course.id,
        notebookId: { in: PDFS.map((item) => item.notebookId) },
        targetType: 'notebook',
        scope: 'public',
        status: 'active',
      },
    });
    console.log('Write complete.');
    console.log(`- active course public memories: ${courseMemoryCount}`);
    console.log(`- active notebook public memories: ${notebookMemoryCount}`);
    for (const notebook of created) {
      console.log(
        `- ${notebook.id}: kind=${notebook.notebookKind}, sections=${notebook._count.markdownSections}, scenes=${notebook._count.scenes}, memories=${notebook._count.studyMemories}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
