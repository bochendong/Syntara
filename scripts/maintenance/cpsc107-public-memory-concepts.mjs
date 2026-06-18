export const CPSC107_COURSE_MEMORY_ID = 'memory_cpsc107_course_public_20260611';
export const CPSC107_COURSE_MEMORY_TITLE = 'CPSC107 课程共有记忆';

export const CPSC107_NOTEBOOK_DESCRIPTIONS = {
  'queue-cpsc107-01-racket-basics':
    'Racket 前缀表达式、operand 求值顺序、if/cond 只走被选中分支；用于判断 operator、value 与报错类型。',
  'queue-cpsc107-02-htdf-htdd':
    'HtDF/HtDD 从数据定义推模板；重点是 signature、purpose、tests、stub、template-origin 的顶层位置。',
  'queue-cpsc107-03-ref-self-ref':
    'Reference/self-reference 与 ListOf 模板；重点是 field 类型决定 helper call，self-reference 决定 recursive call。',
  'queue-cpsc107-04-recursion-bst':
    'Structural recursion 与 BST invariant；重点是当前节点贡献、recursive result 组合，以及 BST 只搜一边。',
  'queue-cpsc107-05-trees-mutual-reference':
    'Tree / mutual-reference 模板；重点是 node helper、ListOfNode helper、fn-for--node / fn-for--lon 成对出现。',
  'queue-cpsc107-06-two-one-of-local':
    'Two one-of cross-product、local scope、closure、lifting 与 encapsulated；重点是 local 不自动等于 encapsulated。',
  'queue-cpsc107-07-abstract-functions':
    'Filter/map/build-list/foldr/foldl 选择；重点是 use-abstract-fn、lambda 参数含义与 fn-composition。',
  'queue-cpsc107-08-search':
    'try-catch search 与 genrec 分开；重点是 state、goal test、successors、failure result、local try 和 termination argument。',
  'queue-cpsc107-09-tail-recursion':
    'Accumulator、tail position、worklist/visited；重点是说明 acc 不变量、初始值、更新规则和 local helper 边界。',
};

export const CPSC107_PUBLIC_MEMORY_TEXTS = {
  [CPSC107_COURSE_MEMORY_ID]: `## 答题目标
CPSC107 的答案重点不是“能跑”，而是按设计配方从数据定义推出模板，再由模板推出代码。提交答案通常要保留 HtDF/HtDD 要素、合适的 tests、清楚的 purpose、正确的 template-origin，以及符合当前章节工具边界的 function definition。

## 模板选择顺序
1. 先读题目给的数据定义：atomic、one-of、compound、reference、self-reference、mutual-reference、graph，还是生成式问题。
2. 再判断主函数采用的模板策略：ordinary template、2-one-of cross product、encapsulated local helpers、use-abstract-fn、genrec、try-catch、accumulator/worklist。
3. template-origin 只记录主解法实际使用的模板来源。输入类型、题目关键词、helper 的内部实现，都不能自动变成 template-origin。
4. 如果题目来自 abstract functions 章节，优先考虑 filter、map、build-list、foldr、foldl；多个 abstract functions 组合时写 fn-composition。
5. 如果题目是 search / graph，先分清：普通 genrec、graph natural recursion、tail-recursive worklist graph，还是 graph step 里用 map 生成 next work。

## 提交前检查
- HtDF tags、signature、purpose、tests、commented stub、template-origin、definition 是否都在顶层正确位置。
- local helper 是否只是实现细节；不要把公开 HtDF tags 或 check-expect 放进 local。
- genrec 是否写了 termination argument：Base Case、reduction step、argument。
- accumulator/worklist 是否说明含义、初始值、更新规则；tandem worklists 是否说明长度和顺序保持一致。
- graph traversal 是否说明 generate-node/get-room 的 generative step，并用 path、visited 或 worklist 防止 cycle。`,

  memory_cpsc107_queue_01_racket_basics_public_20260611: `## 记忆角色
Notebook 01 的内部共有记忆。它不是列表页 concept card，而是回答 Racket 基础题时可直接使用的操作指导、例子和检查清单。硬性格式和工具边界仍以 Course Pack 为准。

## 核心概念
- Racket 使用前缀表达式：operator 在最前面，operands 跟在后面。
- 求值时先把 operands 变成 value，再应用 operator。
- if/cond 的重点是先求 test，只继续被选中的 branch。
- 'and' / 'or' 使用 short-circuit evaluation：结果已确定后，后面的表达式不再求值。
- Boolean、String、Image、Number 是讨论输入输出类型和求值结果的基础材料。
- 这一章常见问题不是复杂设计配方，而是能不能按 DrRacket 语法正确写出 primitive expressions、函数调用、字符串操作和图片组合。

## 基础表达式规则
数学中缀式要改成 Racket 前缀式；嵌套表达式从内到外求值。

~~~racket
(+ (* 2 3) (- 10 4))
~~~

求值顺序：
1. '(* 2 3)' 先变成 '6'。
2. '(- 10 4)' 再变成 '6'。
3. '(+ 6 6)' 变成 '12'。

常见 primitive operator：
- arithmetic: '+', '-', '*', '/', 'sqr', 'sqrt', 'abs'
- boolean: 'and', 'or', 'not'

常见 comparison expressions：

~~~racket
(< x y)
(<= x y)
(> x y)
(>= x y)
(= x y)
~~~

## if / cond 求值
'if' 先求 test，只求被选中的 branch。不要把未选中的 branch 也拿去求值。

~~~racket
(if (> 3 2)
    "yes"
    (/ 1 0))
~~~

这个表达式产生 '"yes"'，不会因为未选中的 '(/ 1 0)' 报错。

'cond' 也是从上到下检查 question，第一个 true 的 answer 被采用。

~~~racket
(cond [(< n 0) "negative"]
      [(= n 0) "zero"]
      [else "positive"])
~~~

## Short-circuit evaluation
'and' 和 'or' 不是普通“先求完所有 operands 再应用 operator”的函数调用；它们会短路。

- 'and' 从左到右求值；遇到 false 就立刻产生 false，后面的表达式不再求值。
- 'or' 从左到右求值；遇到 true 就立刻产生 true，后面的表达式不再求值。
- 'not' 没有短路问题，因为它只消费一个 Boolean。

~~~racket
(and false (/ 1 0)) ; produces false, does not evaluate (/ 1 0)
(or true (/ 1 0))   ; produces true, does not evaluate (/ 1 0)
(and (> 3 2) (< 4 5)) ; produces true
(or (< 3 2) (= 4 4))  ; produces true
~~~

讲解短路题时要明确：先看左边是否已经决定整个表达式结果；如果结果已决定，不要继续求右边，也不要把右边的潜在 error 算进去。

## Image 怎么用
如果题目使用 image，先看 starter 是否已经 require 图片库；在普通 DrRacket 练习里通常需要图片库，例如 '(require 2htdp/image)'。提交环境是否需要 require 以题目 starter / Course Pack 为准。

常见 image constructors：
- '(circle radius mode color)'：圆。
- '(rectangle width height mode color)'：矩形。
- '(text string size color)'：文字图片。
- 'empty-image'：空图片。

常见 image combinators：
- '(beside img1 img2 ...)'：左右摆放。
- '(above img1 img2 ...)'：上下摆放。
- '(overlay img1 img2 ...)'：叠放，前面的通常覆盖在后面的中心。
- '(rotate angle img)'：旋转图片。

例子：

~~~racket
(require 2htdp/image)

(define DOT (circle 10 "solid" "red"))
(define BAR (rectangle 60 12 "solid" "blue"))

(above DOT
       (beside BAR BAR))
~~~

讲解 image 题时要说清楚：每个 image expression 的结果仍然是一个 Image value；'above'、'beside'、'overlay' 消费 Image 并产生新的 Image。

## String 怎么用
String 是带双引号的文本 value。字符串题先判断操作是拼接、长度、取字符，还是切片。

常见 string operations：
- '(string-append s1 s2 ...)'：拼接字符串。
- '(string-length s)'：字符串长度。
- '(substring s start end)'：从 start inclusive 切到 end exclusive。
- '(string-ref s index)'：取第 index 个字符；index 从 0 开始。
- '(string=? s1 s2)'：比较两个字符串内容是否相同。

切片重点：Racket 的 string index 从 0 开始，'substring' 的 end 不包含在结果里。

~~~racket
(substring "abcdef" 1 4) ; produces "bcd"
(substring "abcdef" 0 3) ; produces "abc"
(string-append "CS" "C" "107") ; produces "CSC107"
(string-length "CSC107") ; produces 6
~~~

常见错误：
- 把 end 当成包含位置，导致多取或少取一个字符。
- 忘记字符串要用双引号。
- 用 '=' 比较字符串；字符串内容比较应使用 'string=?'。

## Function 与 global constant
函数定义把重复表达式命名，并明确参数如何进入 body。

~~~racket
(define WIDTH 100)

(define (double n)
  (* 2 n))

(define (label name)
  (string-append "Hi, " name))
~~~

global constant 通常用大写命名，用来避免在多个地方硬编码同一个数值或图片。

## 常见学生困惑
- 把数学中缀式直接写进 Racket。
- 同时化简多个子表达式，跳过 DrRacket 的一步一步求值顺序。
- 把没有被选中的 if branch 也拿去求值。
- 把 'and' / 'or' 当成普通函数，误以为所有 operands 都会先求值。
- image 题不知道要先确认图片库/starter，再组合 constructor 和 combinator。
- string slicing 忘记 0-based index 和 end-exclusive rule。
- 报错时分不清 syntax、arity、type 或 undefined identifier。

## 解释抓手
问学生：operator 是谁？每个 operand 是 value 了吗？下一步最左边需要化简的表达式是哪一个？当前数据是 Number、String、Boolean 还是 Image？这个 function 消费什么、产生什么？

## 回答检查清单
- 先指出表达式的 operator 和 operands。
- 判断每个 operand 是否已经是 value。
- 'if' / 'cond' 只解释被选中的 branch，不要同时求所有 branch。
- 'and' / 'or' 要先检查是否短路；短路后面的表达式不求值，潜在 error 不发生。
- image 题要确认是否需要 require、每个 constructor 的参数顺序，以及组合函数产生的新 Image。
- string 题要确认 index 从 0 开始，'substring' 的 end 不包含。
- 报错题要分清 syntax error、arity error、type error、undefined identifier。`,

  memory_cpsc107_queue_02_htdf_htdd_public_20260611: `## 记忆角色
Notebook 02 的内部共有记忆。它不是列表页 concept card，而是 HtDF/HtDD 题的操作指导、模板骨架和错误检查。精确 artifact spec 仍以 Course Pack 为准。

## 核心概念
- HtDF 是把函数从契约、例子和模板推到实现的流程。
- HtDD 是把数据定义、解释、例子和模板规则连起来。
- Purpose 是普通注释；check-expect 是真实测试表达式。
- @template-origin 的来源是主函数模板：atomic、one-of、compound、ref、self-ref、mutual-ref、use-abstract-fn、genrec、accumulator 等。
- one-of 分成 enumeration 和 itemization；enumeration 通常不用 else 吞掉未列出的固定值，itemization 要用 predicate/range/structure question 区分每种形状。

## 常见学生困惑
- 先写 body，再回头补 signature 和 examples。
- 把 purpose/check-expect 误写成不存在的 metadata tag。
- 只凭题目主题猜 template，而不是读数据定义。
- one-of data 没有在 cond 中覆盖所有 alternative。

## 解释抓手
问学生：函数消费什么、产生什么？数据定义有几个 alternative？每个 alternative 在 template 里对应哪一问？

## HtDF 最小骨架
回答函数设计题时，先写 recipe，再写 body：

~~~racket
(@htdf double)
(@signature Number -> Number)
;; produce n doubled
(check-expect (double 0) 0)
(check-expect (double 3) 6)

; (define (double n) 0) ;stub

(@template-origin Number)

(define (double n)
  (* 2 n))
~~~

## HtDD 常见数据形状
Atomic non-distinct data 是像 Number、String、Image 这种同一类型里有很多值的数据；template 通常直接用参数。

~~~racket
;; Age is Natural
;; interp. a person's age in years

(@template-origin Age)

(define (fn-for-age a)
  (... a))
~~~

Atomic distinct data 是一个固定值本身有意义，例如 false、empty、"unknown"。One-of 可以混合 atomic distinct、atomic non-distinct、compound 或其他 reference。

Compound data 要记 selector；field 是 primitive 就直接用，field 是 reference 就调 helper。

~~~racket
(define-struct student (name grade))
;; Student is (make-student String Natural)
;; interp. a student with name and grade

(@template-origin Student)

(define (fn-for-student s)
  (... (student-name s)
       (student-grade s)))
~~~

## HtDD / one-of 骨架
one-of 的 template 来自 alternatives，不是题目关键词：

~~~racket
;; TrafficLight is one of:
;; - "red"
;; - "yellow"
;; - "green"
;; interp. a traffic light colour

(@template-origin TrafficLight)

(define (fn-for-tl tl)
  (cond [(string=? tl "red") (...)]
        [(string=? tl "yellow") (...)]
        [(string=? tl "green") (...)]))
~~~

Itemization 不是全是固定枚举值时，要用 predicate 或 structure question 区分每种形状：

~~~racket
;; MaybeNumber is one of:
;; - false
;; - Number
;; interp. false means missing, Number means present

(@template-origin MaybeNumber)

(define (fn-for-mn mn)
  (cond [(false? mn) (...)]
        [else
         (... mn)]))
~~~

## Stub / dummy result
Stub 要保持函数名、参数数量和返回类型的 dummy value：
- Number / Natural 通常用 0。
- Boolean 通常用 false。
- String 通常用 ""。
- Image 通常用 empty-image。
- List 通常用 empty。
- 自定义 compound result 通常用一个合法 sample value。

## 回答检查清单
- '@htdf' 名称必须和函数定义一致。
- '@signature' 类型首字母按课程习惯大写，如 'Natural'、'String'、'Boolean'。
- purpose 是普通注释，不是 tag。
- stub 要注释掉且保持原函数名/参数数量。
- HtDD 是否写了 interp 和 examples；template 是否来自 data definition。
- one-of 是 enumeration 还是 itemization；cond 分支是否覆盖每个 alternative。
- '@template-origin' 来自主函数实际模板，不由 helper 或题目标题决定。`,

  memory_cpsc107_queue_03_ref_self_ref_public_20260611: `## 记忆角色
Notebook 03 的内部共有记忆。它不是列表页 concept card，而是从数据定义推出 reference/self-reference/ListOf 模板的操作指导。具体模板推导规则仍以 Course Pack 为准。

## 核心概念
- Reference field 表示当前数据定义引用另一个数据定义，通常带来 helper call。
- Self-reference 表示数据定义回到自己，通常带来 recursive call。
- ListOf template 的核心是 empty case 和 cons case。
- helper 不是随便拆函数，而是数据定义边界要求出来的。

## 常见学生困惑
- 看见 list 就用 length/list-ref，而不是按 empty/cons 结构递归。
- 漏掉 empty case。
- field 类型是自定义类型时，没有调用对应 helper。
- recursive case 没有推进到 rest 或更小子结构。

## 解释抓手
问学生：这个 field 的类型是什么？它是 primitive、reference 还是 self-reference？recursive call 的输入变小了吗？

## ListOf 模板例子
如果数据定义是 '(listof X)'，先写 empty / cons 两问：

~~~racket
(@template-origin (listof X))

(define (fn-for-lox lox)
  (cond [(empty? lox) (...)]
        [else
         (... (first lox)
              (fn-for-lox (rest lox)))]))
~~~

如果 'first' 是 compound/reference 数据，就自然调用对应 helper：

~~~racket
(define (fn-for-lop lop)
  (cond [(empty? lop) (...)]
        [else
         (... (fn-for-person (first lop))
              (fn-for-lop (rest lop)))]))
~~~

## Reference / self-reference 判断
- Reference：field 的类型是另一个数据定义，例如 Person 里有 Address；template 调对应 helper。
- Self-reference：数据定义直接或间接回到自己，例如 ListOfX 的 rest 是 ListOfX；template 出现 recursive call。
- ListOf primitive：'(first lox)' 可以直接使用。
- ListOf compound/reference：'(first lox)' 要交给对应 helper。

Compound 里混合 primitive 和 reference 时，不要把所有 field 都当 primitive：

~~~racket
(define-struct course (name prereqs))
;; Course is (make-course String ListOfCourse)

(@template-origin Course ListOfCourse)

(define (fn-for-course c)
  (... (course-name c)
       (fn-for-loc (course-prereqs c))))

(define (fn-for-loc loc)
  (cond [(empty? loc) (...)]
        [else
         (... (fn-for-course (first loc))
              (fn-for-loc (rest loc)))]))
~~~

## 解题流程
1. 先读 HTDD，标出每个 field 的类型。
2. primitive field 直接使用 selector。
3. reference field 调对应 helper。
4. self-reference field 调当前函数或同一数据定义的 helper。
5. list 的 recursive call 必须推进到 '(rest xs)'。

## 回答检查清单
- empty case 是否存在。
- recursive case 是否使用了 '(first ...)' 和 '(rest ...)'。
- 'first' 的类型如果不是 primitive，是否调用 helper。
- reference field 是否调用 helper；self-reference 是否产生 recursive call。
- recursive call 的输入是否严格变小。`,

  memory_cpsc107_queue_04_recursion_bst_public_20260611: `## 记忆角色
Notebook 04 的内部共有记忆。它不是列表页 concept card，而是 structural recursion、helper 来源和 BST lookup 的操作指导。递归提交格式和工具边界仍以 Course Pack 为准。

## 核心概念
- Structural recursion 的 body 来自数据模板：base case 对应 empty/atomic，recursive case 对应 rest/subtree。
- 当前元素或节点要贡献一部分结果，再和 recursive result 组合。
- BST 的关键不是全树搜索，而是利用 invariant：左边 key 更小，右边 key 更大。
- lookup/insert 的分支应由 key 比较和 BST invariant 推出。

## 常见学生困惑
- 把 BST 当普通 binary tree 搜两边。
- recursive call 返回后忘记组合当前元素。
- base case 和数据定义 alternative 对不上。
- 比较方向写反。

## 解释抓手
问学生：当前元素贡献什么？recursive result 代表什么？BST 这一步为什么只需要去一边？

## List structural recursion 例子
先让 template 决定结构，再填入具体逻辑：

~~~racket
(@template-origin (listof Natural))

(define (sum lon)
  (cond [(empty? lon) 0]
        [else
         (+ (first lon)
            (sum (rest lon)))]))
~~~

这里 '(first lon)' 是当前元素贡献，'(sum (rest lon))' 是 rest 的 recursive result。

## Natural structural recursion 例子
Natural 的普通递归通常按 zero / positive 两种情况写：

~~~racket
(@template-origin Natural)

(define (fact n)
  (cond [(zero? n) 1]
        [else
         (* n (fact (sub1 n)))]))
~~~

这里 recursive call 的问题规模从 n 变成 '(sub1 n)'；如果题目还没学 accumulator，不要为了 tail recursion 改写这个模板。

## produce-list 递归例子
如果函数产生 list，recursive result 通常也是 list，当前元素用 'cons' 加到结果前面：

~~~racket
(define (positives lon)
  (cond [(empty? lon) empty]
        [else
         (if (> (first lon) 0)
             (cons (first lon)
                   (positives (rest lon)))
             (positives (rest lon)))]))
~~~

## BST lookup 例子
BST 不应无条件搜两边；用 invariant 只走必要的一边：

~~~racket
(define (lookup-key k bst)
  (cond [(false? bst) false]
        [(= k (node-key bst)) (node-val bst)]
        [(< k (node-key bst))
         (lookup-key k (node-left bst))]
        [else
         (lookup-key k (node-right bst))]))
~~~

## 回答检查清单
- recursive case 是否解释了“当前贡献 + recursive result”。
- helper 是否来自数据定义中的 reference，而不是随便拆函数。
- BST 是否利用 key ordering 跳过一边。
- base case 是否对应数据定义中的 empty/false alternative。`,

  memory_cpsc107_queue_05_trees_public_20260611: `## 记忆角色
Notebook 05 的内部共有记忆。它不是列表页 concept card，而是 tree / mutual-reference 模板的操作指导和命名例子。mutual-reference 的 artifact 和 template 规则仍以 Course Pack 为准。

## 核心概念
- 树题常有 node helper 和 list-of-children helper。
- SR 是同一数据定义回到自己；R 是引用别的定义；MR 是多个定义绕回形成环。
- Mutual reference 的函数模板通常成对出现，不能只写一个大函数糊过去。
- list helper 处理 children/dependents 的 empty 和 cons case。
- 课程模板示例里 private/local helper 常用双连字符命名，例如 fn-for--node / fn-for--lon；具体设计里也常用 public-name--node / public-name--lon 表示隐藏的数据边界。

## 常见学生困惑
- 凭变量名判断 SR/R/MR，而不是看类型定义引用关系。
- node helper 处理了当前节点，却忘了 children。
- list helper 没有递归处理 rest。
- 两个 helper 的 output type 没想清楚就开始写 body。

## 解释抓手
问学生：哪个 helper 负责单个 node？哪个 helper 负责 ListOfNode？这条类型箭头最后会不会绕回自己？

## Mutual-reference 模板例子
树形数据通常需要一对 helper：一个处理 node，一个处理 children list。课程模板常用双连字符表示被封装的内部 helper 名称。

~~~racket
(@template-origin Node ListOfNode)

(define (fn-for--node n)
  (... (node-label n)
       (fn-for--lon (node-children n))))

(define (fn-for--lon lon)
  (cond [(empty? lon) (...)]
        [else
         (... (fn-for--node (first lon))
              (fn-for--lon (rest lon)))]))
~~~

如果这是一个公开函数封装两个 helper，'@template-origin' 才可能加入 'encapsulated'：

~~~racket
(@template-origin Node ListOfNode encapsulated)

(define (public-name n0)
  (local [(define (public-name--node n) (...))
          (define (public-name--lon lon) (...))]
    (public-name--node n0)))
~~~

## Tree 结果组合模式
Tree 题通常不是“递归一下就结束”，而是要说清楚当前 node 的 contribution 如何和 children results 合并。

常见目标：
- count nodes：当前 node 贡献 1，children list 汇总所有 child count。
- collect labels：当前 label cons 到 children labels 前面，或 append children results。
- find/search：当前 node 先检查；失败再试 children list。
- map tree：当前 node 变形，children list 递归变形。

例子：

~~~racket
(define (count--node n)
  (+ 1
     (count--lon (node-children n))))

(define (count--lon lon)
  (cond [(empty? lon) 0]
        [else
         (+ (count--node (first lon))
            (count--lon (rest lon)))]))
~~~

## SR / R / MR 快速判断
- SR：一个 data definition 直接引用自己。
- R：一个 data definition 引用另一个，但不绕回来。
- MR：两个或多个 data definitions 最后绕回形成 cycle。
- Tree 常见形状是 Node -> ListOfNode -> Node，所以是 mutual-reference。

## 回答检查清单
- 是否同时有 node helper 和 list helper。
- helper 名称是否体现隐藏的数据边界，例如 'fn-for--node' / 'fn-for--lon'。
- list helper 是否处理 empty 和 cons。
- 当前 node 的贡献和 children recursive results 是否都被使用。
- 如果是 search，失败时是否继续搜索 rest children。
- 'encapsulated' 只在公开入口封装一组 template helper 时使用。`,

  memory_cpsc107_queue_06_two_one_of_local_public_20260611: `## 记忆角色
Notebook 06 的内部共有记忆。它不是列表页 concept card，而是 two one-of、local、closure、lifting、encapsulated 的操作指导。2-one-of、local 和 encapsulated 的提交合约仍以 Course Pack 为准。

## 核心概念
- Two one-of 先画 cross-product table，再合并结果相同的格子。
- local 用来把只服务当前公开函数的定义藏起来。
- closure 指 local function 使用了外层变量；普通 local value 不等于 closure。
- lifting/stepper 可以把 local definitions 临时 lift 成带编号的新定义。
- Encapsulated template 表示公开函数把一组课程模板 helper 封装在 local 中，只暴露一个入口；它不是“只要用了 local 就自动加”。

## 常见学生困惑
- 不画表格直接写一串 cond，导致 case 合并没有依据。
- 把 public function 的 @htdf/@signature/check-expect 塞进 local。
- 看到 local 就机械加 encapsulated；07 章 abstract-function 里的短 local predicate/helper 仍然应该用 use-abstract-fn / fn-composition。
- 不区分 scope、closure 和 lifting。

## 解释抓手
问学生：哪些 table cells 可以合并？这个 helper 是否只在当前函数里有意义？公开函数是不是只暴露一个入口？

## Two one-of 操作流程
1. 先列出两个参数各自的 alternatives。
2. 画 cross-product table，不要直接写嵌套 cond。
3. 每个格子写结果或策略。
4. 合并结果相同的格子。
5. 最后才把表格翻译成 cond。

## Two one-of 表格例子
如果两个输入都是 one-of，先看 cross product，再合并结果相同的格子。

~~~text
          b = false       b = Number
a = false missing         missing
a = Number missing         combine numbers
~~~

这种表格常翻译成：

~~~racket
(cond [(false? a) (...)]
      [(false? b) (...)]
      [else
       (... a b)])
~~~

先处理能合并的大格子，比机械写四个 nested cases 更符合 2-one-of 目的。

## local / encapsulated 边界例子
普通 local helper 只写局部 'define'，不要把公开设计标签放进 local：

~~~racket
(@htdf public-name)
(@signature X -> Y)
;; purpose
(check-expect (public-name sample) expected)

; (define (public-name x) dummy) ;stub

(@template-origin X encapsulated)

(define (public-name x0)
  (local [(define (public-name--x x)
            (... x))]
    (public-name--x x0)))
~~~

如果 helper 被要求是完整 HtDF design，就放在顶层；不要把 '@htdf'、'@signature'、'check-expect' 写进 local。

## Structural try-catch / encapsulated 模板
当题目是 structural mutual-reference tree search，而且结果类型是“真实答案或 false”时，list helper 常用 try-catch 形状：先搜索 first 分支，如果返回不是 false 就立刻返回，否则继续 rest。这里的 try-catch 不是异常处理；'try' 只是 local value，保存第一次 recursive attempt 的结果。

~~~racket
(@template-origin Person ListOfPerson try-catch encapsulated)

(define (find n0 p0)
  (local [(define (find--person n p)
            (if (string=? (person-name p) n)
                (person-age p)
                (find--lop n (person-kids p))))

          (define (find--lop n lop)
            (cond [(empty? lop) false]
                  [else
                   (local [(define try
                             (find--person n (first lop)))]
                     (if (not (false? try))
                         try
                         (find--lop n (rest lop))))]))]
    (find--person n0 p0)))
~~~

这个 template-origin 的含义：
- 'Person ListOfPerson' 来自互相递归的数据模板。
- 'try-catch' 来自 first-success / failure-result 搜索。
- 'encapsulated' 来自公开函数把两个 helper 封装进 local。
- 这类 structural tree search 不自动写 'genrec'；只有 recursive problem 是生成出来的新 state/problem 时才用 genrec。

## scope / closure / lifting 例子
local 内部可以看见外层变量；外层不能看见 local 里面的名字。

~~~racket
(define (add-to-all n lon)
  (local [(define (add-n x)
            (+ x n))]
    (map add-n lon)))
~~~

'add-n' 是 closure，因为它引用了外层的 'n'。如果 local 里只是 '(define LIMIT 10)'，那是 local value，不是 closure function。

Stepper/lifting 题中，每次执行 local，local definitions 会被 lift 成带编号的新名字。数 lifted definitions 时，先数 local 里的 define，再看这段 local 实际运行了几次。

## 回答检查清单
- 'local' 是否只是封装实现细节。
- 'encapsulated' 是否来自课程模板/题面要求，而不是因为出现了 local。
- structural try-catch 是否在 list helper 里先保存 try，失败才递归处理 rest。
- two one-of 是否先画 cross-product table，再合并格子。
- closure 判断是否看 local function 有没有使用外层变量。
- stepper/lifting 题是否数清每次调用生成的 lifted definitions。`,

  memory_cpsc107_queue_07_abstract_public_20260611: `## 记忆角色
Notebook 07 的内部共有记忆。它不是列表页 concept card，而是 abstract functions 题的选择规则、模板骨架和 function-composition 例子。已学/未学 API 边界仍以 Course Pack 为准。

## 核心概念
- filter 回答“保留哪些元素”，核心是 predicate。
- map 回答“每个元素变成什么”，核心是 transformer。
- build-list 回答“index 如何生成元素”，核心是 builder。
- foldr/foldl 回答“如何把一串元素合成一个结果”，核心是 base value 和 combiner。
- named helper 和 lambda 都是在表达 predicate/transformer/builder/combiner。
- 本章题面说 built-in functions 时，优先理解为本章已学的 filter/map/build-list/foldr/foldl，而不是任意 Racket API。

## 常见学生困惑
- 用 map 做 filter 的事，或用 filter 做 transform 的事。
- fold 的 base value 和 combiner output type 对不上。
- 不说明 lambda 参数含义。
- 把没学过的高阶函数当成默认可用工具。

## 解释抓手
问学生：这题是在保留、转换、生成，还是汇总？如果是 fold，base value 是什么，combiner 的每个参数代表什么？

## 选择模板
- 保留部分元素：'filter'，'@template-origin use-abstract-fn'。
- 每个元素变形：'map'，'@template-origin use-abstract-fn'。
- 按 index 生成 list：'build-list'，'@template-origin use-abstract-fn'。
- 汇总成一个值：'foldr' / 'foldl'，'@template-origin use-abstract-fn'。
- 多个 abstract functions 串起来：'@template-origin use-abstract-fn fn-composition'。

## Abstract function 工具箱
filter 的 helper/lambda 必须产生 Boolean：

~~~racket
(filter positive? lon)
(filter (lambda (p) (> (person-age p) 18)) lop)
~~~

map 的 helper/lambda 对每个元素产生一个新元素：

~~~racket
(map sqr lon)
(map person-name lop)
~~~

build-list 的 lambda 消费 index，常用 '(add1 i)' 生成 1..n：

~~~racket
(build-list 5 add1) ; produces (list 1 2 3 4 5)
(build-list n (lambda (i) (* 2 i)))
~~~

foldr/foldl 的 combiner 要把当前元素和 accumulated result 合成同类型结果：

~~~racket
(foldr + 0 lon)
(foldr cons empty lox)
(foldr string-append "" los)
~~~

## function-composition 例子

~~~racket
(@template-origin use-abstract-fn fn-composition)

(define (adult-names lop)
  (map person-name
       (filter adult? lop)))
~~~

先 'filter' 出符合条件的 people，再 'map' selector 取名字。这个不是普通 '(listof X)' recursion template。

## fold 例子

~~~racket
(@template-origin use-abstract-fn)

(define (sum lon)
  (foldr + 0 lon))
~~~

fold 的 base value 必须和最终结果类型一致；combiner 的结果也必须回到同一类型。

## lambda 参数解释
回答时不要只说“这里用了 lambda”。要说明参数含义：
- filter lambda 的参数是当前元素，结果是是否保留。
- map lambda 的参数是当前元素，结果是转换后的元素。
- build-list lambda 的参数是 index。
- foldr lambda 常见参数是 current element 和 recursive result。

## 回答检查清单
- 不要用未学过的 'apply' 解决本章题，除非题面或 Course Pack 明确允许。
- lambda 参数要能解释：当前元素是什么，acc/result 是什么。
- 如果用了多个 abstract functions，'@template-origin' 要体现 'fn-composition'。
- 如果题目来自本章，优先给 abstract-function 解法，而不是退回普通递归。`,

  memory_cpsc107_queue_08_search_public_20260611: `## 记忆角色
Notebook 08 的内部共有记忆。它不是列表页 concept card，而是 try-catch search / genrec 的操作指导、模板骨架和 termination argument 例子。Search 在这里指 failure-result search；generative recursion 是生成下一批问题的机制，二者不要合并成一个泛泛标签。

## 核心概念
- try-catch search 题先抽象 state，再定义 start、goal test、successors、failure result 和 solution result。
- Generative recursion 的下一步不是直接 subpart，而是生成出来的新 search problems。
- 纯 genrec 模板必须写 Termination argument：Base Case、reduction step、argument 三件事都要出现。
- try-catch 表示 list helper 用 local 保存 try：如果 try 不是 false 就返回，否则继续尝试 rest。
- visited/worklist 用来控制状态空间，避免重复处理或丢失待处理状态。

## 常见学生困惑
- 把 generative recursion 说成普通 structural recursion。
- 写了 @template-origin genrec 但没有 termination argument。
- 把 try-catch failure-result pattern 和 generic generative recursion 混成一类模板。
- 只给 final path，不解释 state 和 successor。
- 没有 failure/base case。
- 有环或重复状态时忘记 visited。

## 解释抓手
问学生：当前 state 里必须记什么？成功条件是什么？下一批 states 怎么生成？这条路失败时代码如何试下一条？

## Search / genrec / graph 区分
- Pure genrec：题目只要求生成下一个问题并递归解决；'@template-origin genrec'，必须写 termination argument。
- try-catch search：某条路可能失败，失败后要试下一条；常见 '@template-origin genrec try-catch'，但 helper 名称要跟题面模板走。
- Graph search：successors 来自 graph edges / get-neighbors；如果可能有 cycle，需要 path、visited 或 worklist 防重复。
- Tail-recursive graph traversal 通常属于 Notebook 09；Notebook 08 更关注 try-catch search 和 genrec 生成下一批问题。

## State 设计清单
设计 SearchState 时先问：
1. 当前走到哪里？
2. 已经选择/访问了什么？
3. 还剩哪些候选？
4. 成功时要返回什么形式的 solution？
5. 失败时返回 false、empty，还是其他 failure result？

## 纯 genrec 模板例子

~~~racket
(@template-origin genrec)
;; Termination argument
;; Base Case: l <= CUTOFF
;; reduction step: l / 2
;; argument: since CUTOFF > 0, repeatedly dividing l by 2
;;           eventually makes l <= CUTOFF

(define (escher-square l)
  (cond [(<= l CUTOFF) (draw-piece l)]
        [else
         (overlay (escher-square (/ l 2))
                  (draw-piece l))]))
~~~

纯 genrec 的关键是：recursive problem 不是数据结构 subpart，而是函数生成出来的新问题，所以必须写 termination argument。

## try-catch local result pattern

~~~racket
(@template-origin genrec try-catch)

(define (fn-for-state s)
  (cond [(solved? s) (solution s)]
        [(empty? (next-states s)) false]
        [else
         (fn-for-los (next-states s))]))

(define (fn-for-los los)
  (cond [(empty? los) false]
        [else
         (local [(define try (fn-for-state (first los)))]
           (if (not (false? try))
               try
               (fn-for-los (rest los))))]))
~~~

## successor 生成例子
如果题目要求从候选项生成下一批 search problems，可以用已学 abstract functions；这时 template-origin 可能需要体现 use-abstract-fn。

~~~racket
(define (next-states s)
  (map (lambda (choice) (extend-state s choice))
       (filter (lambda (choice) (valid-choice? s choice))
               (state-choices s))))
~~~

解释时要说明：filter 去掉无效候选；map 把每个有效候选变成一个新的 search state。

## Graph backtracking 提醒
非 tail-recursive graph search 常见结构是：
- 当前 node 是 goal，返回 path/solution。
- 当前 node 已在 path/visited 中，返回 false。
- 否则生成 neighbors，交给 list helper 一个个 try。

如果 local helper 只服务公开函数，可以封装；但公开函数的 HtDF artifacts 仍在顶层。graph 的精确 template-origin 要按题目/课程 source：通常会包含 graph 数据定义、genrec、try-catch；如果 path/visited 作为参数推进，也要体现 accumulator。

## 回答检查清单
- 先定义 state / start / goal / successors / failure result。
- list helper 是否用 try-catch 尝试第一条路，失败才试 rest。
- 纯 genrec 是否写 termination argument。
- successor 是否说明由什么生成；如果用了 filter/map，是否能解释 predicate/transformer。
- graph/search 有 cycle 时是否说明 path、visited 或 worklist 防重复。`,

  memory_cpsc107_queue_09_tail_recursion_public_20260611: `## 记忆角色
Notebook 09 的内部共有记忆。它不是列表页 concept card，而是 accumulator、tail recursion、worklist 的操作指导、模板骨架和检查清单。accumulator/local helper/template-origin 的硬性规则仍以 Course Pack 为准。

## 核心概念
- Accumulator 不是“多加一个参数”，而是保存某个明确的不变量。
- Tail recursion 的 recursive call 是当前分支最后一个动作；如果回来后还要 +、cons、append，就不是 tail position。
- Public wrapper 负责设置 accumulator 初始值；local helper 负责递归推进。
- Worklist 是“还没处理的任务”，visited 是“已经处理/见过的状态”。

## 常见学生困惑
- 只说用了 accumulator，却说不出 acc 代表什么。
- 初始值和“不处理任何输入”的状态对不上。
- recursive call 后面还有额外运算。
- local helper 的封装和公开函数的 HtDF 设计边界混在一起。

## 解释抓手
问学生：acc 现在代表什么？初始值为什么对？处理一个元素后 acc 怎么更新？递归回来后还需要做事吗？

## accumulator wrapper 骨架

~~~racket
(@htdf sum)
(@signature (listof Number) -> Number)
;; produce the sum of the numbers in lon
(check-expect (sum empty) 0)
(check-expect (sum (list 1 2 3)) 6)

; (define (sum lon) 0) ;stub

(@template-origin (listof Number) accumulator)

(define (sum lon0)
  ;; acc is Number; sum of the numbers seen so far
  (local [(define (fn-for-lon lon acc)
            (cond [(empty? lon) acc]
                  [else
                   (fn-for-lon (rest lon)
                               (+ acc (first lon)))]))]
    (fn-for-lon lon0 0)))
~~~

这里 'acc' 的初始值是 0，因为还没看任何元素时 seen-so-far 的和是 0。recursive call 是分支最后一步，所以是 tail position。

## worklist / graph 提醒
worklist 保存尚未处理的任务，visited 保存已经见过的节点。若有 tandem accumulators，例如 nn-wl 和 path-wl，必须说明它们如何同步更新。课程 graph 模板通常写 '-wl' 命名。

## tail position 判断
看 recursive call 是否是当前分支的最后一个动作：

~~~racket
;; tail-recursive branch
(fn-for-lon (rest lon) (+ acc (first lon)))

;; not tail-recursive: recursive call returns 后还要 +
(+ (first lon)
   (fn-for-lon (rest lon)))

;; not tail-recursive: recursive call returns 后还要 cons
(cons (first lon)
      (fn-for-lon (rest lon)))
~~~

## tandem accumulator 例子
多个 accumulator 要分别说明 invariant，并说明它们同步关系。

~~~racket
(define (walk nn-wl visited)
  ;; nn-wl is (listof Natural); node number worklist
  ;; visited is (listof Natural); node numbers already processed
  (cond [(empty? nn-wl) visited]
        [(member? (first nn-wl) visited)
         (walk (rest nn-wl) visited)]
        [else
         (walk (append (neighbors (first nn-wl))
                       (rest nn-wl))
               (cons (first nn-wl) visited))]))
~~~

## Graph natural recursion 模板
普通 graph recursion 不使用 worklist；课程源模板叫 fn-for-graph/nr：

~~~racket
(@template-origin genrec arb-tree accumulator)

#;
(define (fn-for-graph/nr map num0)
  (local [(define (fn-for-node n)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn nexts)])))

          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (first lonn)
                        (fn-for-node (generate-node map (first lonn)))
                        (fn-for-lonn (rest lonn)))]))]

    (fn-for-? ...num0)))
~~~

如果题面说 MUST NOT rename local functions，那么 fn-for-node / fn-for-lonn 和原参数名都要保留；只按题目允许 add additional parameters。

## Graph worklist / tail recursion 模板
Tail-recursive graph traversal 按课程源材料使用 nn-wl 这类 worklist 名：

~~~racket
(@template-origin genrec arb-tree accumulator)

#;
(define (fn-for-graph/tr map num0)
  ;; nn-wl is (listof Natural); node number worklist
  ;; fn-for-node adds the unvisited direct subs of n
  ;; fn-for-lonn takes node numbers off one at a time to call fn-for-node
  (local [(define (fn-for-node n nn-wl)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn (append nexts nn-wl))])))

          (define (fn-for-lonn nn-wl visited)
            (cond [(empty? nn-wl) (...)]
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl))]))]

    (fn-for-? ...num0)))
~~~

如果 next work 用 'map' 或 'filter' 从 edges 生成 neighbors，template-origin 在 graph/genrec/accumulator 基础上还要考虑 'use-abstract-fn'。如果题目要求保留 path 与 state work 的对应关系，要用 'state-wl' / 'path-wl' 这类 tandem worklists，并说明长度和顺序如何保持一致。

## 回答检查清单
- 每个 accumulator 是否有一句 invariant 注释。
- 初始值是否对应“还没处理输入”的状态。
- recursive call 之后是否还有 '+'、'cons'、'append' 等额外工作；如果有就不是 tail recursion。
- worklist 更新是否保持“未处理任务”含义；visited/path 是否防止 cycle。
- tandem accumulators 是否同步更新。
- wrapper 的 HtDF 标签留在顶层；local helper 只写实现，除非题面要求独立 helper。`,
};
