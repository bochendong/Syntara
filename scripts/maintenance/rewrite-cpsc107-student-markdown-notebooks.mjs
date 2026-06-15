#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpc9dqgv000p8ogmrsjl5co8';
const COURSE_ID = process.env.CPSC107_COURSE_ID || DEFAULT_COURSE_ID;
const REWRITE_VERSION = 'student-structured-2026-06-11';

function md(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

const NOTEBOOKS = [
  {
    id: 'queue-cpsc107-01-racket-basics',
    name: '01 - Racket 基础：表达式、数据与求值规则',
    description:
      'CPSC107 学生版结构化笔记：Racket 表达式、primitive data、function、evaluation rule、if 与 cond。',
    tags: ['CPSC107', 'Racket', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: '学习路线',
        markdown: md`
# Racket 基础学习路线

这一讲的目标不是背 API，而是建立一个稳定的读代码顺序：

1. 看清楚一个 expression 的 operator 和 operands。
2. 判断 operands 什么时候已经是 value。
3. 按 Racket 的求值规则，从左到右、从里到外逐步化简。
4. 区分 primitive data：Number、Boolean、String、Image。
5. 用 function、global constant、if 和 cond 把表达式组织成程序。

本讲最重要的问题是：当前这一步，Racket 下一步会化简哪一个表达式？
        `,
      },
      {
        title: 'Racket 表达式与求值顺序',
        markdown: md`
# Racket 表达式与求值顺序

Racket 使用前缀写法：operator 放在最前面，operands 跟在后面。

    3 - 2
    (- 3 2)

    3 - 2 + 4 / 5
    (+ (- 3 2) (/ 4 5))

    (6 - 4)(3 + 2)
    (* (- 6 4) (+ 3 2))

常用 primitive operators 包括 +、-、\*、/、sqr、sqrt、quotient、remainder。

求值时采用固定规则：

1. 找到最左边还没有变成 value 的 subexpression。
2. 先把 operands 化简成 value。
3. 再执行 operator。

例子：

    (+ (* 12 3) (- 2 1 3))
    (+ 36 (- 2 1 3))
    (+ 36 -2)
    34

检查点：如果你跳步了，问自己“我是不是同时化简了两个地方？”
        `,
      },
      {
        title: 'Boolean、String 与 Image',
        markdown: md`
# Boolean、String 与 Image

Boolean 只有 true 和 false。逻辑连接词在 Racket 中写作：

    (and true false)
    (or true false)
    (not true)

and 和 or 有短路求值：

- and 遇到 false，后面不需要继续算。
- or 遇到 true，后面不需要继续算。

String 用双引号包起来。

    (string-append "CPSC" "107")
    (string-length "Racket")
    (substring "Racket" 0 3)
    (string=? "a" "b")

Image 来自 2htdp/image，需要先写：

    (require 2htdp/image)

常见 image expression：

    (circle 10 "solid" "red")
    (rectangle 10 20 "outline" "blue")
    (text "hello" 24 "orange")
    (beside (circle 10 "solid" "red")
            (square 20 "outline" "black"))

重点不是记住所有 image API，而是知道每个 expression 的 output type 是 Image。
        `,
      },
      {
        title: 'Function 与 Global Constant',
        markdown: md`
# Function 与 Global Constant

Function 是可以重复使用的一段计算规则。

    (define (square-area side)
      (* side side))

读一个 function call 时，先把参数化简成 value，再把函数体中的参数替换成对应 value。

    (square-area (+ 2 3))
    (square-area 5)
    (* 5 5)
    25

Global constant 用来保存多处共享的固定值，通常使用大写命名。

    (define TAX-RATE 0.13)
    (define DISCOUNT 0.2)

    (define (discounted-tax amount)
      (* (* amount DISCOUNT) TAX-RATE))

使用 global constant 的好处是：固定值只定义一次，后续修改时不用在多个 function body 中寻找硬编码数字。

检查点：这个值是否会被多个函数共享？如果会，优先考虑定义成 constant。
        `,
      },
      {
        title: 'if 与 cond',
        markdown: md`
# if 与 cond

if 有三个部分：

    (if question-expression
        true-answer
        false-answer)

求值规则：

- 如果 question-expression 化简为 true，整个 if 替换成 true-answer。
- 如果 question-expression 化简为 false，整个 if 替换成 false-answer。

例子：

    (define IMAGE-HEIGHT 10)
    (define IMAGE-WIDTH 5)

    (if (> IMAGE-HEIGHT IMAGE-WIDTH)
        "Tall"
        "Wide")
    (if (> 10 5) "Tall" "Wide")
    (if true "Tall" "Wide")
    "Tall"

cond 用来处理多个分支：

    (cond
      [(< x 0) "negative"]
      [(= x 0) "zero"]
      [else "positive"])

检查点：如果只有两个分支，用 if；如果有多个互斥情况，用 cond。
        `,
      },
      {
        title: '练习清单',
        markdown: md`
# 练习清单

你应该能独立完成这些任务：

- 把普通数学表达式改写成 Racket 前缀表达式。
- 对包含 function call、global constant、if、cond 的表达式逐步求值。
- 判断一个 expression 的结果类型是 Number、Boolean、String 还是 Image。
- 写一个简单 function，并给出至少两个 check-expect。

做逐步求值题时，每一行只做一件事。不要为了快而跳过“最左边需要化简的表达式”。
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-02-htdf-htdd',
    name: '02 - HTDF 与 HTDD：函数和数据设计配方',
    description:
      'CPSC107 学生版结构化笔记：HTDF 七步、HTDD、atomic data、one-of 与 template rules。',
    tags: ['CPSC107', 'HTDF', 'HTDD', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: 'HTDF 七步',
        markdown: md`
# HTDF 七步

HTDF 是 How to Design Functions。它把“写函数”拆成可检查的步骤：

1. Function Name：函数名要表达函数做什么。
2. Signature：写清楚输入类型和输出类型。
3. Purpose：一句话说明函数根据输入产生什么输出。
4. Examples：用 check-expect 写具体行为。
5. Stub：先写一个能跑、但只返回 dummy value 的函数。
6. Template：从输入数据类型推出函数结构。
7. Function Body：把真实计算填进 template。

HTDF 的核心价值是：函数体不是凭感觉写出来的，而是由前面几步自然推出。
        `,
      },
      {
        title: 'HTDF 示例：圆面积',
        markdown: md`
# HTDF 示例：圆面积

需求：给定圆的半径，计算圆面积。

    (@htdf circle-area)
    (@signature Number -> Number)
    ;; produce the area of a circle with radius r
    (check-expect (circle-area 0) 0)
    (check-expect (circle-area 1) 3.14)
    (check-expect (circle-area 2) 12.56)

    ; stub
    ; (define (circle-area r) 0)

    (@template-origin Number)
    (@template
     (define (circle-area r)
       (... r)))

    (define (circle-area r)
      (* 3.14 (* r r)))

注意：

- Signature 中类型首字母大写，例如 Number、String、Boolean、Image。
- Purpose 要短，说明 input 和 output。
- check-expect 是函数行为的证据，不只是装饰。
- Stub 的返回值类型必须和 signature 的 output type 一致。
        `,
      },
      {
        title: 'Stub、Template 与 Function Body',
        markdown: md`
# Stub、Template 与 Function Body

Stub 是临时函数定义，用来先让文件可以运行。

常见 dummy result：

- Number / Integer / Natural：0
- String：""
- Boolean：false
- Image：empty-image

Template 是根据数据类型写出的函数骨架。对于 atomic non-distinct data，例如 Number 或 String，template 通常只是使用参数本身：

    (@template-origin Number)
    (@template
     (define (fn-for-number n)
       (... n)))

Function Body 要回到 examples：每个 check-expect 都应该能被函数体解释。

检查点：如果你写不出 function body，先不要硬写代码；回头看 examples 是否足够具体，template 是否来自正确的数据类型。
        `,
      },
      {
        title: 'HTDD：设计数据',
        markdown: md`
# HTDD：设计数据

HTDD 是 How to Design Data。它描述一种数据如何表示现实中的信息。

一个完整的数据定义通常包含：

1. Data definition name。
2. Type comment。
3. Interpretation。
4. Examples / constants。
5. Template rules。
6. Template body。

Atomic non-distinct data：同一类型下可能有很多不同值，例如 Number、String、Image。

Atomic distinct data：只有少数明确值，常用于枚举或特殊值，例如 false、"red"、empty。

判断 template rule 时要看数据定义本身，而不是看题目关键词。
        `,
      },
      {
        title: 'One-of 与 Itemization',
        markdown: md`
# One-of 与 Itemization

one-of 用来表示一个数据可能属于多个情况之一。课程里常见两类：

- Enumeration：每个 case 都是固定的 distinct value，例如 "red"、"yellow"、"green"。
- Itemization：case 的形状可以不同，例如 false、某个 Natural 范围、某个 String 或某个 struct。

例子：

    ;; TrafficLight is one of:
    ;; - "red"
    ;; - "yellow"
    ;; - "green"
    ;; interp. the current color of a traffic light

    (define TL-RED "red")
    (define TL-YELLOW "yellow")
    (define TL-GREEN "green")

Template：

    (@template-origin one-of)
    (@template
     (define (fn-for-traffic-light tl)
       (cond [(string=? tl "red") (...)]
             [(string=? tl "yellow") (...)]
             [(string=? tl "green") (...)])))

普通 enumeration 要尽量列完整每个分支，不要随手用 else 吃掉未分析的情况。

Itemization 的每个分支要问“这个值属于哪一种形状”，可能用 false?、number? + range check、string=? 或 structure predicate。
        `,
      },
      {
        title: '检查清单',
        markdown: md`
# 检查清单

写函数前先问：

- Function name 是否能看出用途？
- Signature 是否写对输入输出类型？
- Purpose 是否是一句话？
- check-expect 是否覆盖普通情况和边界情况？
- Stub 是否返回正确类型的 dummy result？
- Template 是否来自数据定义？
- Function body 是否能解释所有 examples？

设计数据前先问：

- 这是 atomic non-distinct、atomic distinct、one-of、compound，还是 reference？
- 数据定义有没有 interpretation？
- Template rule 能否从 type comment 直接读出来？
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-03-ref-self-ref',
    name: '03 - Reference 与 Self-reference：从复合数据到 List 模板',
    description:
      'CPSC107 学生版结构化笔记：reference、self-reference、ListOf primitive/compound 与模板推导。',
    tags: ['CPSC107', 'reference', 'self-reference', 'List', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: '从数据定义读模板',
        markdown: md`
# 从数据定义读模板

本讲重点是：template 不是背出来的，而是从数据定义读出来的。

遇到一个新的数据定义时，按顺序问：

1. 它是 atomic、one-of 还是 compound？
2. 如果是 compound，每个 field 的类型是什么？
3. 有没有 field 指向另一个自定义数据？这就是 reference。
4. 有没有 field 或 list 的 rest 又回到同一种数据？这就是 self-reference。

reference 会产生 helper call；self-reference 会产生 recursive call。
        `,
      },
      {
        title: 'Compound Data 与 Reference',
        markdown: md`
# Compound Data 与 Reference

如果 compound data 的某个 field 是另一个自定义数据，template 中要调用对应 helper。

例子：

    (define-struct gift (name price))
    ;; Gift is (make-gift String Number)

    (define-struct package (label content))
    ;; Package is (make-package String Gift)

Package 的 content field 是 Gift，所以 Package template 会 reference Gift template。

    (define (fn-for-package p)
      (... (package-label p)
           (fn-for-gift (package-content p))))

检查点：field type 如果不是 primitive，通常就要考虑 helper。
        `,
      },
      {
        title: 'ListOf 与 Self-reference',
        markdown: md`
# ListOf 与 Self-reference

ListOfX 的数据定义通常是 one-of：

    ;; ListOfNumber is one of:
    ;; - empty
    ;; - (cons Number ListOfNumber)

rest 的类型仍然是 ListOfNumber，所以这是 self-reference。

Template：

    (define (fn-for-lon lon)
      (cond [(empty? lon) (...)]
            [else
             (... (first lon)
                  (fn-for-lon (rest lon)))]))

empty case 是 base case；rest 上的 recursive call 来自 self-reference。
        `,
      },
      {
        title: 'ListOf Compound Data',
        markdown: md`
# ListOf Compound Data

如果 list 的 first 是 primitive，可以直接使用 first。

如果 list 的 first 是 compound 或自定义数据，要调用对应 helper。

    ;; ListOfGift is one of:
    ;; - empty
    ;; - (cons Gift ListOfGift)

    (define (fn-for-log log)
      (cond [(empty? log) (...)]
            [else
             (... (fn-for-gift (first log))
                  (fn-for-log (rest log)))]))

这里有两个动作：

- first 上调用 Gift helper，这是 reference。
- rest 上调用同一个 ListOfGift helper，这是 self-reference。
        `,
      },
      {
        title: '考试题常见混合结构',
        markdown: md`
# 考试题常见混合结构

很多题会把 one-of、compound、reference、self-reference 混在一起。

处理顺序：

1. 先给每个数据定义标注 template rule。
2. 找出所有 reference：field type 指向另一个自定义数据。
3. 找出所有 self-reference：rest 或 field 回到自己。
4. 每个自定义数据先写自己的 template。
5. 最后把 HTDF 函数体填进 template。

不要先写 function body。先让数据定义告诉你 helper 和 recursive call 应该出现在哪里。
        `,
      },
      {
        title: '检查清单',
        markdown: md`
# 检查清单

写模板时逐项检查：

- empty case 有没有处理？
- compound field 是否都取出来了？
- 自定义 field 是否调用 helper？
- rest 是否产生 recursive call？
- one-of 是否每种情况都有分支？
- function body 是否只是在 template 的空位里填入业务逻辑？

一句话记忆：reference 找 helper，self-reference 找 recursive call。
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-04-recursion-bst',
    name: '04 - Recursion 与 BST：从 List 递归到二叉搜索树',
    description:
      'CPSC107 学生版结构化笔记：List recursion、natural helper、tree terminology、BST invariant 与 lookup。',
    tags: ['CPSC107', 'recursion', 'BST', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: '递归从模板开始',
        markdown: md`
# 递归从模板开始

递归不是“函数自己调用自己”这么简单。对 CPSC107 来说，recursive call 应该来自 self-reference。

ListOfNumber template：

    (define (fn-for-lon lon)
      (cond [(empty? lon) (...)]
            [else
             (... (first lon)
                  (fn-for-lon (rest lon)))]))

写 count、sum、map、filter 这类函数时，先保留 template，再根据题意填空。

检查点：如果题目是 list 递归，先找到 empty case 和 cons case；不要直接从 function body 开始。
        `,
      },
      {
        title: 'Natural Helper 的来源',
        markdown: md`
# Natural Helper 的来源

helper 不是为了让代码看起来复杂，而是因为数据定义中出现了另一个自定义数据。

如果 Package 包含 Gift：

    (define (package-total-price p)
      (gift-price (package-content p)))

更复杂时，Package 的函数自然会调用 Gift 的函数。

判断 helper 的问题：

- 当前 field 是 primitive 吗？如果是，可以直接用。
- 当前 field 是自定义数据吗？如果是，应该写 helper。
- 当前 field 是 list 吗？如果是，通常还需要 ListOf helper。

helper 的名字应体现它处理的数据类型和任务。
        `,
      },
      {
        title: 'Tree 与 BST',
        markdown: md`
# Tree 与 BST

Tree 的基本术语：

- node：树中的节点。
- root：最顶层节点。
- child：某节点直接连接的下一层节点。
- leaf：没有 child 的节点。

BST 是 Binary Search Tree。它的重要 invariant 是：

- 左子树所有 key 小于当前 key。
- 右子树所有 key 大于当前 key。
- 每个子树本身也必须满足 BST invariant。

写 BST 函数时，要利用 invariant 跳过不可能的子树。
        `,
      },
      {
        title: 'BST lookup 模板',
        markdown: md`
# BST lookup 模板

lookup-key 的核心分支：

1. 空树：找不到，返回 false 或约定的 failure value。
2. target 等于当前 key：返回当前 node 对应 value。
3. target 小于当前 key：只去 left。
4. target 大于当前 key：只去 right。

结构示意：

    (define (lookup-key target bst)
      (cond [(false? bst) false]
            [(= target (node-key bst)) (node-value bst)]
            [(< target (node-key bst))
             (lookup-key target (node-left bst))]
            [else
             (lookup-key target (node-right bst))]))

检查点：如果你同时搜索 left 和 right，你可能没有使用 BST invariant。
        `,
      },
      {
        title: '递归题练习路径',
        markdown: md`
# 递归题练习路径

做递归题按这个顺序：

1. 写或找到数据定义。
2. 标出 self-reference。
3. 复制 template。
4. 填 base case。
5. 填 recursive case 中 first/current node 的处理。
6. 决定如何 combine 当前结果和 recursive result。

常见 combine：

- count：加 1。
- sum：加当前数值。
- produce list：cons 当前结果。
- search：当前满足就返回，否则递归继续。
- BST lookup：根据 key 只走一个方向。
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-05-trees-mutual-reference',
    name: '05 - Trees 与 Mutual Reference：递归类型和树形模板',
    description:
      'CPSC107 学生版结构化笔记：R/SR/MR、NH/NR/NMR、Node/ListOfNode 与 mutual recursion。',
    tags: ['CPSC107', 'trees', 'mutual-reference', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: 'Reference 标签：R、SR、MR',
        markdown: md`
# Reference 标签：R、SR、MR

读数据定义时常见三种箭头：

- R：reference，单向引用另一个数据定义。
- SR：self-reference，数据定义直接回到自己。
- MR：mutual-reference，几个数据定义绕一圈回到彼此。

判断顺序：

1. 先找 ListOfX 的 rest，这通常是 SR。
2. 再看一组数据定义是否形成环；能绕回来的就是 MR。
3. 剩下单向使用其他数据定义的是 R。

这些标签决定 template 中会出现 helper call、recursive call，还是 mutually recursive helpers。
        `,
      },
      {
        title: '函数递归类型：NH、NR、NMR',
        markdown: md`
# 函数递归类型：NH、NR、NMR

从函数调用图看：

- NH：natural helper。一个函数调用另一个 helper，但没有形成递归环。
- NR：natural recursion。函数直接调用自己。
- NMR：natural mutual recursion。多个 helper 互相调用，最终绕回起点。

数据定义里的 R/SR/MR 经常对应到函数模板里的 NH/NR/NMR。

检查点：如果 helper 调用图绕一圈回到自己，就不是普通 helper，而是 mutual recursion。
        `,
      },
      {
        title: 'Node 与 ListOfNode 模板',
        markdown: md`
# Node 与 ListOfNode 模板

树形数据常见结构：一个 Node 有 label 和 children，children 是 ListOfNode。

模板通常成对出现：

    (define (fn-for--node n)
      (... (node-label n)
           (fn-for--lon (node-children n))))

    (define (fn-for--lon lon)
      (cond [(empty? lon) (...)]
            [else
             (... (fn-for--node (first lon))
                  (fn-for--lon (rest lon)))]))

fn-for--node 处理单个节点；fn-for--lon 处理一串 children。双连字符表示这是模板内部/封装内部的 helper 名称，不是公开 API。
        `,
      },
      {
        title: 'Course / ListOfCourse Mutual Recursion',
        markdown: md`
# Course / ListOfCourse Mutual Recursion

课程先修关系、目录树、文件夹结构都常用 mutual recursion。

处理方法：

1. 一个 helper 处理单个 Course。
2. 一个 helper 处理 ListOfCourse。
3. Course helper 会调用 ListOfCourse helper 处理 prerequisites 或 children。
4. ListOfCourse helper 会调用 Course helper 处理 first。

如果公开函数只应该暴露一个入口，可以把两个 helper 放进 local 中封装。

检查点：公开函数应表达任务；内部 helper 应表达数据边界。
        `,
      },
      {
        title: '树题常见输出',
        markdown: md`
# 树题常见输出

树题常见任务：

- count nodes：当前 node 计 1，加上 children 中所有 node 数。
- collect labels：cons 当前 label，再 append children 的结果。
- search：当前 node 命中就返回，否则在 children 中继续找。
- map tree：重建当前 node，并递归处理 children。

写 function body 时先决定每个 helper 的 output type。两个 helper 的 output type 不一定相同，但必须能被组合。
        `,
      },
      {
        title: '检查清单',
        markdown: md`
# 检查清单

- 有没有漏写 ListOf helper？
- 单个 node helper 是否处理了所有 field？
- List helper 是否有 empty case 和 cons case？
- mutual recursion 的两个 helper 是否互相调用？
- 公开函数是否只暴露必要入口？
- combine 当前 node 和 children result 的方式是否与 output type 一致？
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-06-two-one-of-local',
    name: '06 - Two One-of 与 Local：交叉模板、作用域和封装',
    description:
      'CPSC107 学生版结构化笔记：two one-of cross product、local scope、closure、lifting 与 encapsulated template。',
    tags: ['CPSC107', 'two one-of', 'local', 'encapsulation', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: 'Two One-of 的交叉表',
        markdown: md`
# Two One-of 的交叉表

当一个函数有两个 one-of 参数时，不要立刻写一长串 cond。先画 cross product table。

例如第一个参数有 3 种情况，第二个参数有 3 种情况，理论上有 9 格。

步骤：

1. 列出第一个 one-of 的所有情况。
2. 列出第二个 one-of 的所有情况。
3. 填每一格应该返回什么。
4. 找可以合并的行、列或格子。
5. 再写 cond。

这样写出来的分支更少，也更容易解释。
        `,
      },
      {
        title: '合并 Cases',
        markdown: md`
# 合并 Cases

合并分支时，依据是“结果和逻辑相同”，不是因为分支看起来短。

常见合并方式：

- 某一行所有格子结果一样：先判断第一个参数。
- 某一列所有格子结果一样：先判断第二个参数。
- 多个格子都属于同一个逻辑条件：写成一个 predicate。
- 剩余情况完全统一：最后可以用 else。

检查点：每个被合并的 case，都要能回到交叉表中找到依据。
        `,
      },
      {
        title: 'Local 的作用域',
        markdown: md`
# Local 的作用域

local 允许你把只服务于当前函数的 helper 放在内部。

    (define (outer x)
      (local [(define y (+ x 1))
              (define (helper z)
                (+ z y))]
        (helper x)))

规则：

- local 内部可以使用外层参数和定义。
- local 外部不能直接使用 local 内部定义。
- 如果 local function 使用了外层变量，它形成 closure。

检查点：这个 helper 是否只对当前函数有意义？如果是，适合放进 local。
        `,
      },
      {
        title: 'Lifting 与 Stepper',
        markdown: md`
# Lifting 与 Stepper

理解 local 的求值时，可以把 local 中的定义 lift 成临时的全局名字。

例子：

    (define (f x)
      (local [(define a (+ x 1))]
        (* a a)))

当调用 (f 3) 时，可以想象产生一个临时定义：

    (define a_0 (+ 3 1))
    (* a_0 a_0)

如果 local function 引用了外层参数，lifting 后要把对应 value 固定进去。

检查点：数 lifted definitions 时，先数 local 里有几个 define，再看 local 被执行了几次。
        `,
      },
      {
        title: 'Encapsulated Template',
        markdown: md`
# Encapsulated Template

Mutual recursion 的 helper 常常不应该暴露给外部使用。可以把它们封装在一个公开函数的 local 中。

这时 \`encapsulated\` 不是一个随便加的词。它表示：公开函数的设计把课程模板 helper 封装在 local 里，外部只暴露一个入口。普通 local helper 或 07 章 abstract-function 里的短 predicate/helper，不会自动让 @template-origin 加 encapsulated。

结构：

    (define (public-fn c)
      (local [(define (fn-for--course c)
                (... (fn-for--loc (course-prereqs c))))

              (define (fn-for--loc loc)
                (cond [(empty? loc) (...)]
                      [else
                       (... (fn-for--course (first loc))
                            (fn-for--loc (rest loc)))]))]
        (fn-for--course c)))

公开函数负责表达任务；local helper 负责处理数据结构。

提交格式上，公开函数的 \`@template-origin\` 要把“主模板来源”和 \`encapsulated\` 都写出来。例如 Course/ListOfCourse 互相递归 helper 被封装在 local 中：

    (@template-origin Course ListOfCourse encapsulated)

如果 source/problem 明确给了类似 Natural encapsulated 的封装模板，也要保留这个封装信息：

    (@template-origin Natural encapsulated)

注意：\`@htdf\`、\`@signature\`、\`check-expect\` 和 \`@template-origin\` 仍然属于公开函数的顶层设计，不要写进 local 里面。local 内部只放局部 \`define\`。
        `,
      },
      {
        title: '检查清单',
        markdown: md`
# 检查清单

- two one-of 是否先画了交叉表？
- 合并分支是否有表格依据？
- local helper 是否只在当前函数中使用？
- local function 是否引用了外层变量？
- lifting 时每个 local define 是否都被展开？
- mutual recursion helper 是否应该被封装？
- 这个 local 是否真的属于 source/problem 要求的 encapsulated-template 模式？
- 公开函数的 tags/tests 是否还留在顶层，而不是塞进 local？
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-07-abstract-functions',
    name: '07 - Abstract Functions：filter、map、build-list 与 fold',
    description:
      'CPSC107 学生版结构化笔记：filter、map、build-list、foldr/foldl、lambda 与抽象函数签名。',
    tags: ['CPSC107', 'abstract functions', 'fold', 'lambda', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: '为什么使用 Abstract Functions',
        markdown: md`
# 为什么使用 Abstract Functions

Abstract functions 把常见递归模式封装好。你不需要每次都手写 ListOf template，而是选择合适的操作：

- filter：保留满足条件的元素。
- map：把每个元素转换成新元素。
- build-list：根据 index 生成 list。
- foldr / foldl：把一串元素合并成一个结果。

关键不是背函数名，而是把题目意图翻译成 predicate、transformer、builder 或 combiner。
        `,
      },
      {
        title: 'filter：保留什么',
        markdown: md`
# filter：保留什么

filter 需要一个 predicate。predicate 输入一个元素，输出 Boolean。

例子：保留所有正数。

    (define (positive-only lon)
      (filter positive? lon))

如果条件比较复杂，可以写 helper：

    (define (long-name? s)
      (> (string-length s) 6))

    (define (long-names los)
      (filter long-name? los))

检查点：filter 不改变元素，只决定每个元素留下还是丢掉。
        `,
      },
      {
        title: 'map 与 build-list',
        markdown: md`
# map 与 build-list

map 问的是：每个元素要变成什么？

    (define (add1-all lon)
      (map add1 lon))

对 struct list，常见写法是 map selector：

    (define (gift-names log)
      (map gift-name log))

build-list 问的是：index 如何变成目标元素？

    (define (first-n-squares n)
      (build-list n sqr))

build-list 的 index 从 0 开始。如果需要 1 到 n，通常在 builder 中 add1。
        `,
      },
      {
        title: 'foldr 与 foldl',
        markdown: md`
# foldr 与 foldl

fold 把 list 合并成一个结果。

    (foldr + 0 (list 1 2 3))
    6

foldr 从右结合；foldl 从左累计。对于 +、\* 这类结合性强的操作，结果常常一样；对于 string-append、cons 这类顺序敏感操作，结果可能不同。

理解 combiner：

- x：当前元素。
- y 或 acc：已经合并好的结果。
- base：empty list 时的结果。

检查点：base 的类型必须和最终 output type 一致。
        `,
      },
      {
        title: 'lambda 与局部 helper',
        markdown: md`
# lambda 与局部 helper

如果 helper 很短，只在一个 abstract function 中使用，可以写 lambda。

    (define (larger-than n lon)
      (filter (lambda (x) (> x n)) lon))

lambda 适合表达局部规则；如果规则复杂、需要复用、或需要单独测试，写 named helper 更清楚。

选择标准：

- 一行能说明白：lambda。
- 多个条件或需要 check-expect：named helper。
- 多处复用：named helper。
        `,
      },
      {
        title: '推导 Abstract Fold Signature',
        markdown: md`
# 推导 Abstract Fold Signature

遇到自定义数据的 fold，不要背 signature。先给每个 helper 的 output 起类型变量。

方法：

1. 看每个数据定义需要几个 helper。
2. 给每个 helper 的 output 标成 X、Y、Z。
3. 看 combiner 的参数来自哪些 field 和哪些 recursive result。
4. 看 base value 的类型。
5. 从函数体位置反推 signature。

检查点：每个 recursive result 的类型必须和它所在 helper 的 output type 对齐。
        `,
      },
      {
        title: '选择工具的检查清单',
        markdown: md`
# 选择工具的检查清单

- 要删掉不满足条件的元素：filter。
- 要把每个元素变成另一个元素：map。
- 要根据 0 到 n-1 的 index 生成元素：build-list。
- 要把整串元素汇总成一个值：foldr 或 foldl。
- 条件或转换依赖外层变量：lambda 或 local helper。
- 顺序很重要：特别检查 foldr 和 foldl 的差异。
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-08-search',
    name: '08 - Search：Generative Recursion 与 Backtracking',
    description:
      'CPSC107 学生版结构化笔记：search problem、generative recursion、backtracking、solve 模板与 state 设计。',
    tags: ['CPSC107', 'search', 'generative recursion', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: 'Search Problem 的组成',
        markdown: md`
# Search Problem 的组成

一个 search problem 通常包含：

- State：当前问题状态。
- Start state：从哪里开始。
- Goal test：什么时候算解决。
- Successor function：下一步能走到哪些状态。
- Path 或 assignment：记录到达当前状态的选择。

Generative recursion 的特点是：下一批问题不是直接来自数据定义中的 rest，而是由当前 state 生成。

检查点：如果 recursive call 的输入是“新生成的问题”，这就是 generative recursion。

纯 genrec 设计还要写 Termination argument：

- Base Case：什么条件会停止。
- reduction step：每次 recursive call 怎样让问题变小或更接近停止。
- argument：为什么反复做这个 reduction 一定会到 base case。
        `,
      },
      {
        title: 'solve 模板',
        markdown: md`
# solve 模板

一个常见 solve 结构：

    (define (solve p)
      (cond [(solved? p) (solution p)]
            [else
             (solve-list (next-problems p))]))

    (define (solve-list lop)
      (cond [(empty? lop) false]
            [else
             (local [(define try (solve (first lop)))]
               (if (not (false? try))
                   try
                   (solve-list (rest lop))))]))

solve 处理一个 state；solve-list 处理多个候选 state。

try 的意义是：先尝试第一个分支，如果它找到 solution，就立刻返回；否则继续尝试剩下分支。
        `,
      },
      {
        title: 'Backtracking',
        markdown: [
          '# Backtracking',
          '',
          'Backtracking 的核心是：当前选择失败时，退回去尝试另一个选择。',
          '',
          '常见分支：',
          '',
          '- 不选当前候选。',
          '- 选择当前候选。',
          '',
          '每个分支都生成一个新的 state。solve-list 逐个尝试这些 state。',
          '',
          '判断返回值时不要只问 true 或 false。很多 search 函数的成功结果可能是一条 path、一个 assignment 或一个 board；失败才是 false。',
          '',
          '所以常见判断是：',
          '',
          '    (not (false? try))',
          '',
          '而不是：',
          '',
          '    (true? try)',
        ].join('\n'),
      },
      {
        title: 'State 设计',
        markdown: md`
# State 设计

设计 state 时问：下一步判断约束需要知道哪些信息？

以 assignment 问题为例，state 可能包括：

- current assignment：已经做出的选择。
- remaining slots：还没有处理的位置。
- available candidates：还可以使用的对象。
- constraints：判断某个 candidate 是否可用的条件。

next-problems 的任务：

1. 取出当前要处理的位置。
2. 找到所有满足条件的 candidate。
3. 对每个 candidate 生成一个新 state。
4. 去掉已经完成的位置，更新 assignment。

State 太少会导致下一步无法判断；state 太多会让函数难以维护。
        `,
      },
      {
        title: '剪枝与终止',
        markdown: md`
# 剪枝与终止

Search 容易爆炸，所以要尽早失败：

- 如果当前 state 已经违反约束，直接返回 false。
- 如果没有可选分支，返回 false。
- 如果达到 goal，返回 solution。

终止条件至少包括：

1. solved? 成功。
2. dead end 失败。
3. candidate list empty 失败。

检查点：每一次 generative recursive call 都应该让问题更接近终止，不能反复生成同一个 state。
        `,
      },
      {
        title: '检查清单',
        markdown: md`
# 检查清单

- State 是否包含下一步需要的全部信息？
- solved? 检查的是什么？
- next-problems 是否只生成合法下一步？
- solve-list 是否正确处理 empty candidate list？
- try 失败时是否继续 rest？
- 成功结果是什么类型？失败是否统一为 false？
        `,
      },
    ],
  },
  {
    id: 'queue-cpsc107-09-tail-recursion',
    name: '09 - Tail Recursion 与 Accumulator：从普通递归到 Worklist',
    description:
      'CPSC107 学生版结构化笔记：accumulator、tail recursion、multiple accumulators 与 worklist traversal。',
    tags: ['CPSC107', 'tail recursion', 'accumulator', 'worklist', '学生版笔记', 'Markdown'],
    sections: [
      {
        title: '为什么需要 Accumulator',
        markdown: md`
# 为什么需要 Accumulator

普通递归经常在 recursive call 返回后继续做计算。

    (define (sum lon)
      (cond [(empty? lon) 0]
            [else
             (+ (first lon)
                (sum (rest lon)))]))

Tail recursion 把“目前已经算出的结果”放进参数中传下去，让 recursive call 成为最后一步。

Accumulator 的核心问题：

- 它代表什么？
- 初始值是什么？
- 每一步如何更新？
        `,
      },
      {
        title: 'Tail Recursive List 模板',
        markdown: md`
# Tail Recursive List 模板

通常使用外层公开函数初始化 accumulator，local helper 负责递归。

    (define (sum-tr lon0)
      (local [(define (fn-for-lon lon acc)
                (cond [(empty? lon) acc]
                      [else
                       (fn-for-lon (rest lon)
                                   (+ acc (first lon)))]))]
        (fn-for-lon lon0 0)))

这里 acc 表示：已经处理过的元素之和。

检查点：recursive call 后面没有额外的 +、cons、append 等运算，才是 tail position。
        `,
      },
      {
        title: '设计 Accumulator',
        markdown: md`
# 设计 Accumulator

不同题目需要不同 accumulator：

- count / sum：result so far。
- skip every n：当前 index。
- max repeats：previous item、current run length、best run length。
- list range：目前 min 和 max。
- alphabetical order：previous string。

写 accumulator invariant：

    acc 表示已经处理过的元素中，满足某条件的累计结果。

如果一句话说不清 acc 的含义，函数很容易写错。
        `,
      },
      {
        title: '多个 Accumulators',
        markdown: md`
# 多个 Accumulators

有些题不止需要一个“目前结果”。

例子：判断字符串列表是否按字母顺序排列，可能需要：

- previous：上一个字符串。
- remaining：还没检查的列表。

例子：找最长连续重复，可能需要：

- previous：上一项。
- current-count：当前连续长度。
- best-count：目前见过的最大长度。

多个 accumulators 的原则：每个参数都必须有清楚含义，不能只是为了让代码能跑而加参数。
        `,
      },
      {
        title: 'Worklist Traversal',
        markdown: md`
# Worklist Traversal

Tree 上的 tail recursion 常用 worklist。

Worklist 表示：还没有处理、但之后需要处理的节点。

常见结构：

    (define (tree-labels t0)
      (local [(define (fn-for-work todo result)
                (cond [(empty? todo) result]
                      [else
                       (fn-for-work
                        (append (node-children (first todo))
                                (rest todo))
                        (cons (node-label (first todo)) result))]))]
        (fn-for-work (list t0) empty)))

todo 是待处理节点；result 是已经收集的结果。

检查点：每一步都要从 todo 中拿走一个节点，并把它的 children 加回 todo。
        `,
      },
      {
        title: '检查清单',
        markdown: md`
# 检查清单

- accumulator 的含义是否写得出来？
- 初始值是否对应“还没处理任何元素”的状态？
- 每一步更新是否只依赖当前元素和旧 accumulator？
- recursive call 是否是最后一步？
- multiple accumulators 是否都有必要？
- worklist 是否保证每次处理一个 item，并最终变空？
        `,
      },
    ],
  },
];

const BANNED_PATTERNS = [
  /答疑须知/,
  /睡了吗/,
  /女朋友/,
  /裤裆/,
  /微信/,
  /回微信/,
  /发语音/,
  /打开\s*racket/i,
  /向学生展示/,
  /脱裤/,
  /皇子|皇上|皇帝/,
  /老师教/,
  /讲课/,
  /教师自用/,
  /导师：/,
  /Bochen Dong/i,
];

function usage() {
  return [
    'Usage: node scripts/maintenance/rewrite-cpsc107-student-markdown-notebooks.mjs [--write]',
    '',
    'Rewrites all queue-cpsc107-* markdown notebooks into structured student-facing notes.',
    'Default is dry-run. Set CPSC107_COURSE_ID to override the target course.',
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

function summarize(markdown) {
  return markdown
    .replace(/^\s{4}.+$/gm, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
}

function validateContent() {
  const violations = [];
  for (const notebook of NOTEBOOKS) {
    for (const section of notebook.sections) {
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(section.markdown) || pattern.test(section.title)) {
          violations.push(`${notebook.id} / ${section.title} matched ${pattern}`);
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Student-facing rewrite contains banned source material:\n${violations.join('\n')}`,
    );
  }
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

async function rewriteNotebook(prisma, course, notebook) {
  const sections = notebook.sections.map((section, index) => ({
    id: `${notebook.id}-student-s${String(index + 1).padStart(2, '0')}`,
    title: section.title,
    order: index,
    markdown: section.markdown,
    summary: summarize(section.markdown),
    sourceMeta: {
      sourceKind: 'student-facing-rewrite',
      rewriteVersion: REWRITE_VERSION,
      originalNotebookId: notebook.id,
      curation: ['structured markdown notes', 'student-facing course concepts and examples'],
    },
  }));

  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: notebook.id },
      create: {
        id: notebook.id,
        ownerId: course.ownerId,
        courseId: course.id,
        name: notebook.name,
        description: notebook.description,
        tags: notebook.tags,
        avatarUrl: null,
        language: 'zh-CN',
        style: 'student-markdown',
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
        name: notebook.name,
        description: notebook.description,
        tags: notebook.tags,
        avatarUrl: null,
        language: 'zh-CN',
        style: 'student-markdown',
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
    await tx.scene.deleteMany({ where: { notebookId: notebook.id } });
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId: notebook.id } });
    await tx.markdownNotebookSection.createMany({
      data: sections.map((section) => ({
        ...section,
        notebookId: notebook.id,
        courseId: course.id,
      })),
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFiles();
  validateContent();

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

    for (const notebook of NOTEBOOKS) {
      console.log(
        `- ${args.write ? 'rewrite' : 'would rewrite'} ${notebook.id}: ${notebook.sections.length} student sections`,
      );
    }

    if (!args.write) {
      console.log('Dry-run complete. Re-run with --write to mutate the target DB.');
      return;
    }

    for (const notebook of NOTEBOOKS) {
      await rewriteNotebook(prisma, course, notebook);
    }
    await refreshCourseSummaryFields(prisma, course.id);

    const rewritten = await prisma.notebook.findMany({
      where: { id: { in: NOTEBOOKS.map((notebook) => notebook.id) } },
      select: {
        id: true,
        name: true,
        notebookKind: true,
        style: true,
        sceneCount: true,
        sectionCount: true,
        _count: { select: { scenes: true, markdownSections: true } },
      },
      orderBy: { id: 'asc' },
    });
    console.log('Write complete.');
    for (const notebook of rewritten) {
      console.log(
        `- ${notebook.id}: kind=${notebook.notebookKind}, style=${notebook.style}, sections=${notebook._count.markdownSections}, scenes=${notebook._count.scenes}`,
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
