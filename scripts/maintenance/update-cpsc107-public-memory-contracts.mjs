import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const memoryTexts = {
  memory_cpsc107_course_public_20260611: `## 适用范围
CPSC107 整门课。

## 记忆边界
不记录 Racket、recursion、tree、search、tail recursion 等通用定义。共有记忆只保留这门课需要长期遵守的知识组织、设计 recipe、template rule、解题格式和可验收的作业输出规范。

## 执行合约
当学生问课程里的编程题、作业题、考试题或 starter code 时，回答必须先把题面里的显式要求当成验收条件，再结合本课程 recipe 生成答案。不要只给一个“能运行”的函数；要给符合本课格式和题目要求的提交版本。

## 必须输出
- 如果题面要求完整代码，代码块必须包含真实可运行的 Racket 代码，不要只放片段。
- 保留 starter 中要求的 imports 和 metadata tags；如果使用 \`@signature\`、\`@template-origin\` 等 spd tags，必须保留 \`(require spd/tags)\`。
- HTDF 代码题默认包含：\`@htdf\`、\`@signature\`、一句 purpose comment、真实 \`(check-expect ...)\`、\`@template-origin\`、完整 \`define\`。
- Purpose 是普通注释，不是 metadata tag；check-expect 是真实表达式，不是 metadata tag。
- 当答案使用 \`local\` helper 时，顶层 HtDF artifacts 仍然属于公开函数：\`@htdf\`、\`@signature\`、purpose、\`check-expect\`、stub、\`@template-origin\` 放在公开函数的顶层设计里；\`local\` 内只放局部 \`define\` 和必要的 accumulator/scope 注释。
- Function body 应从数据定义、signature、examples/check-expect 和 template 推出。
- 如果题面有 MUST / required / do not / submit / number 等措辞，把它们逐条纳入答案和代码。

## 禁止事项
- 不要发明不存在的 metadata tag，例如 \`(@purpose ...)\` 或 \`(@check-expect ...)\`。
- 不要把 \`@htdf\`、\`@signature\`、\`check-expect\` 或 \`@template-origin\` 写进 \`local\`；如果 helper 需要完整 HtDF design，把它设计成独立的顶层 helper。
- 不要把题面明确禁止的 API 写进代码，例如题目禁止 \`length\`、\`list-ref\` 时绝不能使用。
- 不要引入题面、starter code、当前/已学笔记本记忆中没有出现过的 API。题面只说 built-in functions 时，只能使用课程记忆或源材料明确学过的 built-ins；不确定时优先使用 template/helper 设计。
- 不要因为知道通用算法而跳过本课要求的 recipe、template 或 table。
- 不要把 starter 里的必要 require、assignment/problem tag 或语言 reader 改成不兼容的形式。

## 验收清单
- 答案是否直接回应学生问法，而不是复述整道题？
- 代码是否包含题面要求的全部 artifacts：signature、purpose、check-expects、template-origin、table、function definition 等？
- 每个 \`@...\` form 是否是课程真实 metadata，而不是臆造？
- 代码是否遵守题面所有 MUST / MUST NOT？
- 解释是否说明 template/table/case split 如何变成 cond 或 helper？

## 全课知识规则
- Racket 表达式要按 DrRacket 真实语法写，求值说明按最左边需要化简的表达式逐步展开。
- API 名称本身不是记忆对象；应记录数据类型、输入输出、template rule 和求值过程。
- API 边界是课程事实：不要把未出现在题面、源材料或已学记忆里的 Racket 函数当作可用工具。
- 判断 template rule 要从数据定义读：atomic、one-of、compound、ref、self-ref、mutual-ref，不能凭题目关键词猜。

## 递归和抽象
- List/template 题先写 empty/base case，再写 cons/recursive case；helper 来自数据边界，不是随意拆函数。
- Tree 或 mutual-reference 题要成对写 node/list helper；公开函数可以用 local 封装 helper。
- Local 题要区分 scope、closure、lifting；two one-of 先画交叉表再合并 case。
- Abstract/search/tail-recursion 题先说明 predicate/transformer/combiner、state/goal/successor、accumulator 含义和初始值。

## 检查点
你现在缺的是 recipe 的哪一步？这个 recursive call 来自哪个 self-reference？这个 helper 是因为哪个 field 的类型不是 primitive？这个 accumulator 代表什么，初始值是什么，每一步如何更新？`,

  memory_cpsc107_queue_01_racket_basics_public_20260611: `## 适用范围
CPSC107 notebook 01《Racket 基础：表达式、数据与求值规则》。

## 记忆边界
不记录 Racket primitive operators、String/Image API 或 \`if\` 的通用定义。共有记忆只保留本讲的求值格式、前缀表达式规范、基础类型边界和错误诊断方式。

## 触发条件
当学生问 Racket 表达式怎么写、怎么求值、为什么报错、数学式如何转前缀表达式、Boolean/String/Image/if/cond 基础语法时，优先应用本记忆。

## 执行合约
回答时先确认表达式的目标值和数据类型，再给 DrRacket 语法。解释求值时按“最内层可求值表达式 -> 得到 value -> 继续外层”的顺序展开，不要只给最终答案。

## 必须输出
- 数学式转换题：给出等价的 Racket 前缀表达式，并说明 operator 和 operands 的位置。
- 求值题：给出至少 2-3 步关键求值过程，直到 final value。
- 条件表达式题：说明 test expression 先求值，只有被选中的 branch 会继续求值。
- 报错题：指出是语法、arity、type 还是 undefined identifier，并给出最小修正。
- 图片表达式题：说明 image combinator 的参数顺序和嵌套关系。

## 禁止事项
- 不要写 Python/JavaScript 风格语法，例如 \`x + y\`、\`if (...) {}\`。
- 不要把没有被选中的 \`if\` branch 也拿去求值。
- 不要把字符串比较、数字比较和 Boolean 组合混用成不符合 Racket 类型的表达式。
- 不要为了简短省略导致错误定位所需的求值步骤。

## 验收清单
- 表达式能否直接放进 DrRacket 运行？
- 每一步求值是否只化简当前可求值的子表达式？
- 结果 value 的类型是否与题目目标一致？
- 错误解释是否指出具体错误种类和修正方式？

## 检查点
这个表达式最内层先算哪里？operator 是谁？每个 operand 是 value 了吗？这个 branch 真的会被执行吗？`,

  memory_cpsc107_queue_02_htdf_htdd_public_20260611: `## 适用范围
CPSC107 notebook 02《HTDF 与 HTDD：函数和数据设计配方》。

## 记忆边界
不记录 HTDF/HTDD 的普通定义。共有记忆记录本课使用的固定 recipe 格式、metadata/tag 规范、one-of template 和数据定义到函数模板的转换规则。

## 触发条件
当学生问函数设计、数据定义、signature、purpose、check-expect、stub、template、one-of data、template-origin 或 starter code 中缺 recipe 步骤时，优先应用本记忆。

## 执行合约
回答必须按 recipe 顺序组织。先写数据/函数契约，再写 examples/check-expect，再从 template 推出 body。不要直接跳到 body，也不要把 examples 或 purpose 伪装成 metadata tag。

## 必须输出
- HTDF 顺序：Function Name、Signature、Purpose、Examples/check-expect、Stub、Template、Function Body。
- HTDD 顺序：type comment、interpretation、examples、template、template rules。
- 代码题如果要求 \`@htdf\`、\`@signature\`、\`@template-origin\`，必须输出真实 metadata form。
- \`check-expect\` 必须是真实表达式；purpose 必须是普通注释或文本说明。
- One-of data 的 function template 必须用 \`cond\` 覆盖每个 alternative。

## 禁止事项
- 不要发明 \`(@purpose ...)\`、\`(@check-expect ...)\`。
- 不要在没有数据定义或 signature 的情况下凭感觉写 template。
- 不要让 signature、purpose、examples 和 body 互相矛盾。
- 不要漏掉 one-of 的某个 case。

## 验收清单
- Recipe 步骤是否完整且顺序正确？
- Signature 中每个输入和输出类型是否与题目一致？
- Examples 是否覆盖普通 case 和边界 case？
- Template-origin 是否来自真实数据定义规则？
- Body 是否能从 template 合理演化出来？

## 检查点
这个函数消费什么类型、产生什么类型？这个 one-of 有几个 alternative？每个 alternative 在 cond 里对应哪一问？`,

  memory_cpsc107_queue_03_ref_self_ref_public_20260611: `## 适用范围
CPSC107 notebook 03《Reference 与 Self-reference：从复合数据到 List 模板》。

## 记忆边界
不记录 list、first/rest、compound data 的通用说明。共有记忆记录如何从数据定义识别 reference/self-reference，并把它落实为 helper call、recursive call 和 ListOf template。

## 触发条件
当题目涉及 compound data、field 指向自定义类型、ListOfX、empty/cons、first/rest、struct/list template、helper 从哪里来、递归从哪里来时，优先应用本记忆。

## 执行合约
先读数据定义，再决定 template。field 是另一个自定义类型时调用 helper；field 或 rest 回到同一类数据时产生 recursive call。解释代码时必须说明 recursive call 对应哪个 self-reference。

## 必须输出
- Compound template：逐个 field 展开，并标出 primitive field、reference field 和 self-reference field。
- List template：\`empty\` base case + \`cons\` recursive case。
- Helper 说明：helper 不是随便拆出来的，而是由 field 类型或 mutually referenced 数据定义要求的。
- 代码题要保留 \`check-expect\`，并覆盖 empty/list boundary 和至少一个 non-empty case。

## 禁止事项
- 不要用 \`length\`/\`list-ref\` 代替结构递归，除非题目明确要求随机访问。
- 不要跳过 empty case。
- 不要把 helper 写成与数据定义无关的任意拆分。
- 不要在 recursive case 中递归同一个 input 而不推进到 \`rest\` 或子结构。

## 验收清单
- 每个 recursive call 是否对应一个 self-reference？
- 每个 helper call 是否对应一个 reference field？
- Base case 是否覆盖 empty 或 atomic alternative？
- Recursive case 是否处理 \`first\` 并递归处理 \`rest\`？

## 检查点
这个 field 的类型是什么？它是 primitive、reference 还是 self-reference？递归调用的参数比原问题更小了吗？`,

  memory_cpsc107_queue_04_recursion_bst_public_20260611: `## 适用范围
CPSC107 notebook 04《Recursion 与 BST：从 List 递归到二叉搜索树》。

## 记忆边界
不记录 recursion 或 BST 的通用定义。共有记忆记录如何从 structural template 推出 list 函数、如何利用 BST invariant 写分支，以及怎样解释 recursive case 的意义。

## 触发条件
当题目涉及 list structural recursion、count/filter/build image over list、BST lookup/insert、按 key 比较左右子树、或者问 recursive case 为什么这样写时，优先应用本记忆。

## 执行合约
先确定数据模板，再把每个 branch 的自然语言目标写出来。BST 题必须先写 invariant：左边 key 更小，右边 key 更大；代码分支必须由比较结果推出。

## 必须输出
- List 递归题：empty case、cons case、如何处理 \`first\`、如何组合 recursive result。
- BST 题：empty tree case、key found case、key smaller 去 left、key larger 去 right。
- 如果构造新 BST，必须保留 BST ordering invariant。
- 解释 recursive call 时说明“它解决的是剩余 list/对应 subtree 的同一问题”。

## 禁止事项
- 不要把 BST 当普通 binary tree 全树搜索，除非题目明确破坏 BST invariant。
- 不要在 recursive call 返回后忘记组合当前 node/list element。
- 不要漏掉 empty tree 或 empty list boundary。
- 不要在 BST 分支中把 \`<\` 和 \`>\` 的方向写反。

## 验收清单
- Base case 是否与数据定义的 atomic/empty alternative 对齐？
- Recursive case 是否推进到 \`rest\` 或某个 subtree？
- BST 分支是否完全由 key 比较和 invariant 决定？
- 结果是否保留原题要求的顺序或结构？

## 检查点
当前元素/节点要贡献什么？recursive result 代表什么？BST 这一步为什么只需要去一边？`,

  memory_cpsc107_queue_05_trees_public_20260611: `## 适用范围
CPSC107 notebook 05《Trees 与 Mutual Reference：递归类型和树形模板》。

## 记忆边界
不记录树的普通术语清单。共有记忆记录判断箭头标签、self-reference/reference/mutual-reference、以及 tree/list helper 成对出现的模板步骤。

## 触发条件
当题目涉及 tree、arbitrary arity tree、mutual reference、ListOfNode、node/list helper、箭头标 SR/R/MR、或要求根据数据定义写树形递归模板时，优先应用本记忆。

## 执行合约
先画或读数据定义依赖图，再判定箭头类型。代码必须由 mutual-reference templates 推出：处理 node 的函数调用处理 list 的 helper；处理 list 的 helper 再递归处理 first/rest 或子节点。

## 必须输出
- 箭头判断：SR 是同一数据定义回到自己；R 是单向引用别的定义；MR 是经过多个定义形成环。
- Tree function 通常至少有 node helper 和 list-of-children helper。
- List helper 必须有 empty case 和 cons case。
- Node helper 必须处理 node fields，并把 children/list field 交给 list helper。

## 禁止事项
- 不要把 mutual-reference 题压成一个巨大函数导致模板来源不清。
- 不要在 list helper 中漏掉 \`rest\` 的递归。
- 不要只处理当前 node 而忽略 children。
- 不要凭变量名判断箭头类型；必须从类型定义的引用关系判断。

## 验收清单
- 依赖图中每条箭头的标签是否能解释？
- 每个自定义数据定义是否有对应 helper/template？
- Node helper 和 list helper 是否互相调用且递归推进？
- Empty children/list case 是否正确返回 identity/base value？

## 检查点
这个数据定义有没有绕回自己？哪个 helper 负责 node？哪个 helper 负责 list of children？`,

  memory_cpsc107_queue_06_two_one_of_local_public_20260611: `## 适用范围
CPSC107 notebook 06《Two One-of 与 Local：交叉模板、作用域和封装》。

## 记忆边界
不记录 local、closure 或 two one-of 的通用定义。共有记忆记录 two one-of 表格合并、local stepper、lifting、encapsulated template，以及这些内容在作业/考试答案中的可执行提交规范。

## 触发条件
当题目出现以下任一信号时，优先应用本记忆：
- 两个 one-of 参数、两个同步变化的输入，或题面明确说 two one-of。
- 题面要求 submit/fill in a 2-one-of table。
- 题面要求 number table cells and corresponding cond question/answer pairs。
- 题面要求同时遍历、只遍历一次，或禁止 \`length\` / \`list-ref\`。
- 题目涉及 \`overlay\`、image 组合，且顺序影响可视结果。

## 执行合约
回答 two one-of 编程题时，先给交叉表，再说明哪些格子可以合并，最后给符合题面要求的代码。代码必须体现表格编号到 cond 分支的对应关系，而不是只写一个看起来能跑的函数。

## 必须输出
- Cross-product table：行列来自两个 one-of 参数或一个 one-of 参数加一个题面条件。
- Table cells 必须编号，例如 \`[1]\`、\`[2]\`、\`[3]\`、\`[4]\`。
- Cond question/answer pairs 必须复用这些编号，例如 \`[1][2][3]\` 对应一个停止分支，\`[4]\` 对应递归分支。
- 如果题面要求 \`@template-origin\`，代码中必须出现真实 metadata form，例如 \`(@template-origin 2-one-of)\`。
- 如果题面要求 examples/check-expects，代码中必须出现真实 \`(check-expect ...)\`。
- 如果题面禁止 \`length\`、\`list-ref\`，代码必须用同步递归，每步只取 \`first/rest\` 并同步更新另一个参数。

## Two One-of 格式
遇到两个 one-of 参数时，不要急着写所有 cond case。先画 cross product table，再合并相同答案的格子。合并后的 cond 分支仍然要能追溯回原表格编号。

## Image/overlay 常见错误
- \`overlay\` 的第一个参数画在最上层。
- 如果题面示例里小圆在上面、大圆在下面，递归生成的更小图像要作为 \`overlay\` 第一个参数，当前较大的圆放后面。
- check-expect 的 expected image 也要用同样的 top-to-bottom 顺序；不要 function body 写对了但测试期望顺序写反。

## 禁止事项
- 不要用 \`length\` 或 \`list-ref\` 解决题面要求同步遍历的 two one-of 题。
- 不要把 \`@template-origin\` 写成注释或占位文字。
- 不要使用 \`(@purpose ...)\` 或 \`(@check-expect ...)\` 这类不存在的 metadata tag。
- 不要随意引入 local/helper；只有当数据边界、封装要求或题面要求需要 helper 时才引入。

## 验收清单
- 表格是否有编号 cell？
- cond 分支是否能对应回表格编号？
- 代码是否保留 starter 必要 require 和课程 metadata？
- \`@template-origin\` 是否是题面/模板要求的真实 form？
- 是否完全遵守题面禁止的 API？
- image 题的 \`overlay\` 顺序和 check-expect 顺序是否都与题面可视示例一致？

## Local 规则
local 内部可以用外层定义，外层不能直接用 local 内部定义。讲 scope 时用“总公司/外包公司”的比喻；讲 closure 时只把引用外层变量的 local function 判为 closure，普通 value 不是 closure。

## Local/HtDF 边界
使用 \`local\` 封装 helper 时，\`local\` 内只写局部 \`define\`。公开函数的 HtDF 设计元素保留在外层顶级位置：\`@htdf\`、\`@signature\`、purpose、\`check-expect\`、stub、\`@template-origin\` 不进入 \`local\`。如果题目要求某个 helper 有完整 HtDF design，那个 helper 应该作为独立顶层函数出现，而不是把 tags/tests 塞进 \`local\`。

## Lifting/Stepper
local stepper 要把 local definition lift 成带编号的新定义，如 b_0、bee_0、foo_0。判断 lifted definitions 数量时，先数 local 中 define 的个数，再乘实际调用次数。

## Encapsulation
Course/ListOfCourse 这类互相递归模板要用 \`@template-origin Course ListOfCourse encapsulated\`，把两个 helper 包进一个公开函数里。

## 检查点
两个 one-of 的表格能合并成几类？这个 local function 有没有引用外层参数？公开函数是否只暴露一个入口，把互相递归 helper 封装在 local 里？`,

  memory_cpsc107_queue_07_abstract_public_20260611: `## 适用范围
CPSC107 notebook 07《Abstract Functions：filter、map、build-list 与 fold》。

## 记忆边界
不记录 filter/map/fold 的普通定义。共有记忆记录如何把题目意图翻译成 predicate、transformer、builder 或 combiner，以及何时使用 named helper、lambda 或 local。

## 触发条件
当题目要求使用 abstract functions，或出现 filter/map/build-list/fold、lambda、predicate、transformer、combiner、avoid explicit recursion、抽象重写时，优先应用本记忆。

## 执行合约
先判断题目要“保留、转换、生成、汇总”哪一种操作，再选择 abstraction。回答必须说明选择理由，不能只是把递归代码机械改成某个高阶函数。

## 必须输出
- filter：说明保留条件，给出 predicate。
- map：说明每个元素如何转换，给出 transformer。
- build-list：说明 index 如何变成元素，给出 builder。
- foldr/foldl：说明 base value、combiner 参数含义、结果如何累积。
- 代码题要说明 helper/lambda 的输入输出，必要时用 local 封装。

## 禁止事项
- 题目要求 abstraction 时，不要手写显式递归当最终答案。
- 不要用 \`map\` 做 filter 的事，或用 \`filter\` 做 transform 的事。
- 不要忽略 fold 的 base value。
- 不要写参数顺序不清楚的 lambda；必要时改成 named helper。
- 本讲默认可用抽象函数边界是 \`filter\`、\`map\`、\`build-list\`、\`foldr\`、\`foldl\`，以及 named helper/lambda。不要把 \`apply\` 等未在本讲出现的高阶 API 当作已学工具，除非题面或源材料明确给出。

## 验收清单
- 选择的 abstraction 是否匹配题意？
- Predicate/transformer/builder/combiner 是否各自只做一件事？
- 返回类型是否与 abstraction 的返回类型一致？
- Edge case 如 empty list 是否由 abstraction/base value 正确处理？

## 检查点
这题是在保留元素、改变元素、按 index 生成元素，还是把所有元素合成一个结果？`,

  memory_cpsc107_queue_08_search_public_20260611: `## 适用范围
CPSC107 notebook 08《Search：Generative Recursion 与 Backtracking》。

## 记忆边界
不记录 search problem 的普通定义。共有记忆记录 solve 模板、state/goal/successor/visited 的组织方式、backtracking 分支和 TA assignment 的提交结构。

## 触发条件
当题目涉及 search、generative recursion、backtracking、work through states、path finding、next-search-problems、visited/worklist、solve function 或 TA assignment search 模板时，优先应用本记忆。

## 执行合约
先把问题抽象成 search state，再写 start state、goal test、successor function 和 result/path 表示。代码必须体现“当前 state 是否成功 -> 否则生成 next states -> 递归/回溯尝试”的模板。

## 必须输出
- State 表示：说明一个 state 里包含哪些信息。
- Goal test：说明什么时候搜索成功。
- Successors：说明如何从当前 state 生成下一批 search problems。
- Failure/base case：说明没有候选或走到死路时返回什么。
- Backtracking：说明一个分支失败后如何尝试下一个分支。
- 如果题目有 visited/avoid cycles，必须说明 visited 如何更新。

## 禁止事项
- 不要把 generative recursion 说成普通 structural recursion；next states 不一定是原数据的直接 subpart。
- 不要漏掉失败返回值。
- 不要在有环图/状态空间中忽略 visited。
- 不要只给 final path 而不解释 state 和 successor。

## 验收清单
- State、goal、successor、failure 是否都明确？
- Recursive call 是否作用在生成的新 search problem 上？
- 回溯是否会尝试剩余候选？
- visited/worklist 是否避免重复状态？

## 检查点
当前 state 是什么？下一步有哪些可能？成功条件是什么？如果这条路失败，代码如何回头试下一条？`,

  memory_cpsc107_queue_09_tail_recursion_public_20260611: `## 适用范围
CPSC107 notebook 09《Tail Recursion 与 Accumulator：从普通递归到 Worklist》。

## 记忆边界
不记录 tail recursion 的普通定义。共有记忆记录 accumulator invariant、初始值、更新规则、local helper 结构和 worklist/visited 的状态组织。

## 触发条件
当题目涉及 accumulator、tail recursion、worklist、visited、避免回溯、把普通递归改成尾递归、或者问 helper 参数代表什么时，优先应用本记忆。

## 执行合约
先写 accumulator invariant：accumulator 在任意时刻代表什么。再写初始值和每一步更新。最终代码中 recursive call 必须是 tail position；如果 call 返回后还要做运算，就不是 tail recursive。

## 必须输出
- Accumulator meaning/invariant：一句话说明 acc 保存的部分结果或待处理工作。
- Initial value：说明为什么从这个值开始。
- Update rule：说明处理当前元素/state 后 acc 如何变。
- Helper structure：通常用 local helper 隐藏 acc，只暴露原题要求的 public function。
- Local/HtDF boundary：公开 wrapper 拥有顶层 \`@htdf\`、\`@signature\`、purpose、\`check-expect\`、stub、\`@template-origin\`；accumulator local helper 只作为局部 \`define\` 出现，除非题目明确要求独立顶层 helper。
- Worklist 题必须说明 worklist 与 visited 分别存什么。

## 禁止事项
- 不要只加一个参数就声称是 accumulator；必须说明 invariant。
- 不要在 recursive call 外面再做 \`+\`、\`cons\`、\`append\` 等后续工作。
- 不要让 public function 要求学生手动传 acc，除非题目要求。
- 不要为了满足 helper design 把 \`@htdf\`、\`@signature\`、\`check-expect\`、\`@template-origin\` 写进 \`local\`。
- 不要在 worklist 搜索中忘记更新 visited。

## 验收清单
- Recursive call 是否是分支中的最后一个动作？
- Accumulator 初始值是否对应“还没处理任何输入”的状态？
- 每一步更新是否保持 invariant？
- Public wrapper 是否用正确初值调用 local helper？
- Worklist/visited 是否防止重复处理？

## 检查点
acc 现在代表什么？处理一个元素后它怎么变？递归回来后还需要做事吗？`,
};

async function updateMemory(id, text) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT "id", "title", "text" FROM "StudyMemory" WHERE "id" = $1 AND "status" = $2',
    id,
    'active',
  );
  if (rows.length !== 1) {
    throw new Error(`Expected one active StudyMemory row for ${id}, found ${rows.length}`);
  }
  if (rows[0].text === text) {
    return { title: rows[0].title, changed: false };
  }
  await prisma.$executeRawUnsafe(
    'UPDATE "StudyMemory" SET "text" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2',
    text,
    id,
  );
  await prisma.$executeRawUnsafe('DELETE FROM "StudyMemoryChunk" WHERE "memoryId" = $1', id);
  return { title: rows[0].title, changed: true };
}

const updated = [];
for (const [id, text] of Object.entries(memoryTexts)) {
  const result = await updateMemory(id, text);
  updated.push({ id, title: result.title, changed: result.changed, chars: text.length });
}

console.log(
  JSON.stringify(
    {
      updated,
      invalidatedVectorChunksFor: updated.filter((item) => item.changed).map((item) => item.id),
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
