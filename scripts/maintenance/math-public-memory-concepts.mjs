export const MAT102_COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
export const MAT136_COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';

export const MAT102_COURSE_MEMORY_ID = 'memory_mat102_course_public_20260615';
export const MAT136_COURSE_MEMORY_ID = 'memory_9e1ee986d4e747009680e01ee94efa5a';

function m(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

export const MATH_COURSE_MEMORY_TEXTS = {
  [MAT102_COURSE_MEMORY_ID]: m`
## 记忆角色
MAT102 的课程级公共记忆。它不是某个知识点摘要，而是 proof-first 课程的总答题协议：先识别命题结构和证明目标，再选择证明模板，最后写出可检查的数学文字。

## 总答题协议
1. 先翻译命题类型：集合包含、集合相等、存在/任意、蕴含、双向证明、反证、归纳、函数性质、数论命题、关系/群结构。
2. 再选择 1-2 个证明模板：direct proof、contrapositive、contradiction、case split、element-chasing、induction、Bezout/modular arithmetic、homomorphism/kernel。
3. 写 proof 时先声明任意对象或存在对象：Let x be arbitrary、Assume ...、Choose ...。不要直接跳到结论。
4. 每一步都要说明用了哪个定义：subset、image/preimage、injective/surjective、divides、congruent、equivalence relation、subgroup、kernel 等。
5. 最后用目标句收口：therefore ...，或 hence the desired statement follows。

## 常用证明模板
集合包含：
~~~text
To prove A subset B, let x in A. Use definitions to show x in B.
~~~

集合相等：
~~~text
Prove A subset B and B subset A separately.
~~~

存在命题：
~~~text
Give a witness, then verify it satisfies the condition.
~~~

任意命题：
~~~text
Let the object be arbitrary, then prove the required property without assuming extra facts.
~~~

反证：
~~~text
Assume the negation of the target. Derive a contradiction with a definition, theorem, or earlier assumption.
~~~

归纳：
~~~text
Base case. Induction hypothesis. Inductive step. Conclude by induction.
~~~

## 禁止/高风险习惯
- 用例子代替证明。
- 把结论写进假设。
- 对存在命题没有给 witness。
- 对任意命题只证明了一个特殊例子。
- 证明函数单射/满射时不从定义出发。
- 数论题只算几个数，不写整除或同余定义。
- 关系/群论题漏掉封闭性、单位元、逆元、运算保留等结构条件。
`,

  [MAT136_COURSE_MEMORY_ID]: m`
## 记忆角色
MAT136 的课程级公共记忆。它控制 Calculus II 的解题口径：先分类题型，再选计算/判别/建模模板，而不是把每题都写成泛泛的公式解释。

## 总答题协议
1. 先判题型：积分计算、定积分/FTC、几何建模、微分方程、数列极限、反常积分、级数判别、幂级数区间、Taylor 展开。
2. 再选模板：u-sub、trig-sub、integration by parts、slice/washer、separable ODE、monotone bounded sequence、comparison/integral/ratio test、Taylor template。
3. 写答案时必须保留条件：区间、端点、危险点、函数正负、单调性、收敛测试前提、power series center 和 endpoint 检查。
4. 计算题先写结构，再化简；判别题先说明使用哪个 test 及其条件；建模题先定义变量、画/描述区域，再写 integral。
5. 如果题目是概念解释，要回答“为什么这个工具适用”，而不是只给最后数值。

## 常用模板选择
- 根号形状 a^2-x^2、a^2+x^2、x^2-a^2：优先考虑三角代换。
- 乘积且一部分求导会变简单：考虑 integration by parts。
- 曲线间面积/体积：先找交点和切片方向，再写 top-bottom、right-left 或 A(x)/A(y)。
- 反常积分：先找危险点并拆区间，再决定 p-integral、comparison 或 limit comparison。
- 级数：先 divergence test；若 fail，再选 geometric、p-series、telescoping、integral/comparison/ratio。
- 幂级数：先读 center，再用 ratio test 找 radius，最后单独检查 endpoints。

## 检查清单
- 上下限、变量和 differential 是否一致？
- 反常积分是否拆了所有危险点？
- 判别法的条件是否满足？
- 级数题是否区分 sequence a_n 和 series sum a_n？
- 幂级数是否检查端点？
- Taylor 题是直接列导数，还是从已知级数替换/求导/积分得到？
`,
};

export const MAT102_NOTEBOOK_MEMORY_SPECS = [
  {
    memoryId: 'memory_mat102_sets_propositions_public_20260602',
    notebookId: 'mat102-sets-propositions-proof-v2',
    title: 'MAT102 集合与命题证明入口',
    text: m`
## 记忆角色
Notebook 01 的详细操作记忆。回答集合、命题、真值表、子集和集合相等题时，用它把题目转成 element-chasing 或逻辑表格，而不是用直觉判断。

## 核心模板
证明 A subset B：
~~~text
Let x in A. Unpack the definition of A. Use those facts to prove x in B. Therefore A subset B.
~~~

证明 A = B：
~~~text
Prove A subset B and B subset A.
~~~

证明 x in set-builder：
~~~text
Check the universe, then verify the predicate after the vertical bar.
~~~

## 常见题型
- set-builder notation：先读 universe，再读条件。
- union/intersection/difference/complement：把符号翻译成 or/and/not。
- De Morgan laws：用 element-chasing 或真值表证明。
- power set：元素是 subsets，不是原集合的普通元素。
- proposition：用 truth table 或等价变形检查 tautology/contradiction。

## 常见错误
- 把 subset 符号当成 element 符号。
- 证明集合相等只证明一个方向。
- 只画 Venn diagram，没有写 proof。
- power set 题把 {a} 和 a 混淆。
- 逻辑连接词中 P implies Q 只有 P true、Q false 时为 false。

## 检查清单
每一步是否从定义出发？变量 x 是否任意？集合相等是否两个方向都有？真值表是否覆盖所有 truth assignments？结尾是否明确回到原命题？
`,
  },
  {
    memoryId: 'memory_mat102_logic_quantifiers_public_20260602',
    notebookId: 'mat102-logic-quantifiers-proof-v2',
    title: 'MAT102 量词、蕴含与否定',
    text: m`
## 记忆角色
Notebook 02 的详细操作记忆。回答量词、否定、蕴含、逆否和充要条件题时，先处理逻辑骨架，再代入具体数学内容。

## 量词模板
任意命题：
~~~text
Let x be arbitrary. Prove P(x).
~~~

存在命题：
~~~text
Choose a concrete witness x = .... Verify P(x).
~~~

否定规则：
~~~text
not forall x, P(x)  becomes  exists x such that not P(x)
not exists x, P(x)  becomes  forall x, not P(x)
not (P and Q)       becomes  not P or not Q
not (P or Q)        becomes  not P and not Q
~~~

## 蕴含证明
Direct proof：
~~~text
Assume P. Show Q.
~~~

Contrapositive：
~~~text
Assume not Q. Show not P.
~~~

If and only if：
~~~text
Prove P implies Q and Q implies P separately.
~~~

## 常见错误
- 否定量词时只加 not，没有交换 forall/exists。
- 把 converse 当成 contrapositive。
- 证明 iff 只写一个方向。
- 存在命题没有 witness。
- 任意命题选择了一个特殊例子。

## 检查清单
先写出原命题的逻辑形式。若要求否定，量词和连接词是否全部正确翻转？若要求证明蕴含，开头是否明确 assume antecedent？若是 iff，两个方向是否都有标题？
`,
  },
  {
    memoryId: 'memory_mat102_relations_equivalence_orders_public_20260602',
    notebookId: 'mat102-relations-equivalence-orders-proof-v2',
    title: 'MAT102 反证、关系与序结构',
    text: m`
## 记忆角色
Notebook 03 的详细操作记忆。回答反证法、二元关系、等价关系、偏序、极大/最大和上下界题时，先列定义，再逐条验证。

## 反证模板
~~~text
Assume the statement is false. Keep all original assumptions. Derive an impossible conclusion, such as a contradiction with definition, parity, order, or earlier theorem. Therefore the original statement is true.
~~~

## 关系性质模板
给定 relation R on A：
- reflexive：for all a in A, aRa。
- symmetric：if aRb then bRa。
- antisymmetric：if aRb and bRa then a=b。
- transitive：if aRb and bRc then aRc。

等价关系要证明 reflexive、symmetric、transitive。偏序要证明 reflexive、antisymmetric、transitive。

## 等价类与划分
等价类 [a] 是所有与 a related 的元素。证明两个等价类相等，常用方法是取任意 x in [a]，推出 x in [b]，再反向证明。

## 序结构
- maximum 是集合里的一个元素，且大于等于所有元素。
- maximal 是没有别的元素严格大于它。
- upper bound 不一定在集合内。
- supremum 是最小的 upper bound。

## 常见错误
- symmetric 和 antisymmetric 混淆。
- 等价关系漏掉其中一个性质。
- 用例子说明 transitive，而不是任取 a,b,c 证明。
- maximum 和 maximal 混用。
- upper bound 与 maximum 混用。

## 检查清单
关系题先写 universe A。每个性质是否用任意元素证明？若要否定某性质，是否给出明确反例？序结构题是否区分“在集合内”和“界可以在集合外”？
`,
  },
  {
    memoryId: 'memory_mat102_functions_i_public_20260602',
    notebookId: 'mat102-functions-i-proof-v2',
    title: 'MAT102 函数、像集与单双射',
    text: m`
## 记忆角色
Notebook 04 的详细操作记忆。回答函数定义、像、原像、单射、满射、双射和复合函数题时，必须按定义写 proof，不要只画箭头图。

## 函数与像/原像
函数 f: A -> B 要有 domain A、codomain B，并且每个 a in A 有唯一输出 f(a) in B。

Image：
~~~text
y in f(S) means there exists x in S such that f(x)=y.
~~~

Preimage：
~~~text
x in f^{-1}(T) means f(x) in T.
~~~

## 单射/满射模板
Injective：
~~~text
Assume f(a1)=f(a2). Use algebra/definitions to prove a1=a2.
~~~

Surjective：
~~~text
Let y in codomain be arbitrary. Find x in domain such that f(x)=y.
~~~

Bijective：prove both injective and surjective。

## 复合函数
证明 g o f 的性质时先检查 codomain/domain 是否匹配。单射复合通常从 g(f(a1))=g(f(a2)) 开始，先用 g injective，再用 f injective。

## 常见错误
- 满射时把 y 取在 image，而不是 codomain。
- 单射时假设 a1=a2，而不是从 f(a1)=f(a2) 出发。
- 把 inverse image 当成 inverse function。
- 忽略 codomain，导致 surjective 判断错误。

## 检查清单
先写 domain/codomain。像集题是否有 exists x？原像题是否只需检查 f(x) in T？单射/满射是否严格按定义开头？
`,
  },
  {
    memoryId: 'memory_mat102_functions_ii_cardinality_public_20260602',
    notebookId: 'mat102-functions-ii-cardinality-proof-v2',
    title: 'MAT102 逆函数、基数与可数性',
    text: m`
## 记忆角色
Notebook 05 的详细操作记忆。回答逆函数、双射、集合大小、可数性、对角线法和幂集定理时，先把“大小相同”翻译成是否存在 bijection。

## 逆函数模板
函数有 inverse function 通常需要 bijective。证明 g 是 f 的 inverse：
~~~text
Show g(f(x))=x for all x in domain, and f(g(y))=y for all y in codomain.
~~~

## 基数模板
|A| = |B|：
~~~text
Construct a bijection f: A -> B, then prove injective and surjective.
~~~

|A| <= |B|：
~~~text
Construct an injection A -> B.
~~~

可数：
~~~text
Show a listing, or a bijection/injection with N depending on the theorem allowed.
~~~

## 对角线法
对角线法证明“不可能列完”。假设有一个 list 覆盖所有对象，然后构造一个新对象在第 n 位故意不同于第 n 个列表元素，推出新对象不在列表中。

## 幂集定理
证明没有 surjection f: A -> P(A)。构造 D={a in A | a notin f(a)}，然后问 D=f(d) 是否导致 d in D iff d notin D 的矛盾。

## 常见错误
- 用“看起来无限”代替 bijection/injection。
- 对角线法没有说明新对象为什么和每一项都不同。
- 把 subset 与 element of power set 混淆。
- 证明 inverse 时只验证一个方向。

## 检查清单
大小题是否明确构造函数？函数是否真的从 A 到 B？是否证明 injective/surjective？不可数证明是否有 contradiction structure？
`,
  },
  {
    memoryId: 'memory_mat102_number_theory_i_public_20260602',
    notebookId: 'mat102-number-theory-i-euclidean-proof-v2',
    title: 'MAT102 整除、gcd 与欧几里得算法',
    text: m`
## 记忆角色
Notebook 06 的详细操作记忆。回答整除、良序原理、带余除法、gcd、Euclidean algorithm 和 Bezout 题时，必须把整数条件和定义写出来。

## 整除模板
a divides b：
~~~text
There exists k in Z such that b = ak.
~~~

证明整除题时，目标永远是构造这个整数 k。

## 带余除法
对整数 a 和正整数 b，存在唯一 q,r 使得 a=bq+r 且 0<=r<b。题目中 remainder 的范围不能漏。

## gcd 与 Bezout
gcd(a,b) 是正的 common divisor 中最大的那个。Euclidean algorithm 用连续余数求 gcd：
~~~text
a = bq + r, so gcd(a,b)=gcd(b,r).
~~~

Bezout identity：
~~~text
gcd(a,b)=ax+by for some integers x,y.
~~~

用 extended Euclidean algorithm 从最后一个非零余数往回代。

## 常见错误
- 写 a divides b 时把等式方向写反。
- 忘记 k 必须是 integer。
- gcd 必须为正。
- Euclidean algorithm 停在余数为 0 时，gcd 是上一个非零余数。
- Bezout 回代符号出错。

## 检查清单
整除命题是否出现 exists integer？带余除法是否写 0<=r<b？gcd 计算是否保留每一步？Bezout 是否回代到原始 a,b 的线性组合？
`,
  },
  {
    memoryId: 'memory_mat102_number_theory_ii_public_20260602',
    notebookId: 'mat102-number-theory-ii-primes-proof-v2',
    title: 'MAT102 丢番图方程、素数与唯一分解',
    text: m`
## 记忆角色
Notebook 07 的详细操作记忆。回答线性丢番图方程、素数、互素、Euclid lemma、唯一分解和无穷素数题时，先判断是构造解还是证明不可解。

## 线性丢番图方程
ax + by = c 有整数解当且仅当 gcd(a,b) divides c。求解模板：
1. 用 Euclidean algorithm 找 d=gcd(a,b)。
2. 若 d 不整除 c，则无整数解。
3. 若 d 整除 c，把 Bezout identity 乘以 c/d 得一个 particular solution。
4. 写 general solution。

## 素数与互素
p prime：若 p divides ab，则 p divides a 或 p divides b。常和 Euclid lemma 搭配。

证明 irrational 或不可分解题时，常用 prime factorization 中某个 prime 的指数奇偶矛盾。

## 无穷素数模板
~~~text
Assume finitely many primes p1,...,pn. Consider N=p1...pn+1. No pi divides N, so N has a prime divisor not in the list. Contradiction.
~~~

## 常见错误
- 只找到一个解，忘记 general solution。
- 忘记 gcd(a,b) divides c 的可解条件。
- 把 prime 和 composite 的定义混淆。
- 唯一分解题没有说明指数/素因子唯一。

## 检查清单
方程题先算 gcd。素数题是否用了 prime divides product 的性质？反证题的矛盾是否落在整除、互素或唯一分解上？
`,
  },
  {
    memoryId: 'memory_mat102_number_theory_iii_public_20260602',
    notebookId: 'mat102-number-theory-iii-modular-proof-v2',
    title: 'MAT102 同余、模运算与费马小定理',
    text: m`
## 记忆角色
Notebook 08 的详细操作记忆。回答同余、模运算、消去律、乘法逆元、线性同余和 Fermat little theorem 题时，先写 modulus 和 gcd 条件。

## 同余定义
a congruent b mod n：
~~~text
n divides a-b.
~~~

证明同余题时，可以转成整除，也可以使用同余的加法、乘法、幂运算规则。

## 消去与逆元
乘法消去不是永远合法。若 ac congruent bc mod n，要消去 c，通常需要 gcd(c,n)=1。

c mod n 有乘法逆元当且仅当 gcd(c,n)=1。用 extended Euclidean algorithm 找 x 使 cx congruent 1 mod n。

## 线性同余
ax congruent b mod n。先令 d=gcd(a,n)：
- 若 d 不整除 b，则无解。
- 若 d 整除 b，则可约化并找逆元。

## Fermat Little Theorem
若 p prime 且 gcd(a,p)=1，则 a^{p-1} congruent 1 mod p。也可得到 a^p congruent a mod p。

## 常见错误
- 模数 n 没有固定。
- 直接除以一个数，没有检查互素。
- 把 mod 运算当成普通等号运算。
- Fermat 小定理忘记 p 必须 prime，且 a 与 p 互素。

## 检查清单
每一步是否在同一个 modulus 下？消去/求逆是否有 gcd=1？线性同余是否先检查 gcd(a,n)|b？Fermat 条件是否满足？
`,
  },
  {
    memoryId: 'memory_mat102_induction_i_public_20260601',
    notebookId: 'nb-mat102-zh-induction-i-skill-v2-20260601',
    title: 'MAT102 归纳法、强归纳与结构归纳',
    text: m`
## 记忆角色
Notebook 09 的详细操作记忆。回答归纳法题时，最重要的是写清楚 proposition P(n)、base case、induction hypothesis 和 inductive step。

## 普通归纳模板
~~~text
Let P(n) be ...
Base case: prove P(n0).
Induction hypothesis: assume P(k) for an arbitrary k >= n0.
Inductive step: prove P(k+1).
Therefore P(n) holds for all n >= n0.
~~~

## 强归纳模板
~~~text
Assume P(n0), P(n0+1), ..., P(k). Prove P(k+1).
~~~

适合当前项可能依赖多个前面项的问题，例如递归定义、分解、数论存在性。

## 结构归纳
先读数据如何生成：base constructors 和 recursive constructors。证明时分别证明 base object，并假设 recursive parts 满足性质，再证明构造出的新对象满足性质。

## 常见错误
- IH 写成 assume P(k+1)，把要证明的结论放进假设。
- base case 起点错。
- inductive step 没有使用 IH。
- 强归纳只假设 P(k)，但题目需要多个前项。
- 只验证前几项，以为就是证明。

## 检查清单
P(n) 是否明确？base case 是否覆盖所有起点？IH 是否只假设已知范围？step 是否真的推出 k+1？结尾是否声明 by induction？
`,
  },
  {
    memoryId: 'memory_queue_mat102_11grouptheory_2_public_cover_20260602',
    notebookId: 'queue-mat102-11grouptheory-2',
    title: 'MAT102 群论 I 公共记忆',
    text: m`
## 记忆角色
Notebook 10 的详细操作记忆。回答群、子群、循环群和元素阶题时，先确定集合与运算，再逐条检查公理。

## 群定义
群是 set G 配 operation *，满足：
1. closure：a*b in G。
2. associativity：(a*b)*c=a*(b*c)。
3. identity：存在 e 使 ea=ae=a。
4. inverse：每个 a 有 a^{-1} 使 aa^{-1}=a^{-1}a=e。

Abelian group 额外要求 commutative。

## 子群模板
证明 H <= G：
~~~text
Show H is nonempty. For all a,b in H, show ab^{-1} in H.
~~~

或者按课程要求分别验证 closure、identity、inverse。注意 H 的运算继承自 G。

## 循环群与阶
<g>={g^n | n in Z}。元素阶是最小正整数 k 使 g^k=e；如果不存在则 infinite order。

## 常见错误
- 忘记指定 operation。
- 把 closure 当成自动成立。
- 只验证左单位元或左逆元。
- 子群题没有说明 H 是 G 的 subset。
- 循环群题只列正幂，忘记负幂/逆元。

## 检查清单
对象是集合还是元素？运算是什么？公理是否逐条覆盖？子群是否先确认 subset/nonempty？循环群 generator 是否真的生成目标集合？
`,
  },
  {
    memoryId: 'memory_queue_mat102_12grouptheoryii_public_cover_20260602',
    notebookId: 'queue-mat102-12grouptheoryii',
    title: 'MAT102 群论 II 公共记忆',
    text: m`
## 记忆角色
Notebook 11 的详细操作记忆。回答群同态、核、像、同构和商结构入门题时，核心是“保运算”而不是只看函数是否双射。

## 同态模板
phi: G -> H 是 homomorphism：
~~~text
For all a,b in G, prove phi(ab)=phi(a)phi(b).
~~~

左右两边的 operation 可能不同，要按各自群的运算解释。

## kernel 和 image
Kernel：
~~~text
ker(phi) = {g in G | phi(g)=e_H}
~~~

Image：
~~~text
im(phi) = {phi(g) | g in G}
~~~

常见结论：ker(phi) 是 G 的 subgroup，im(phi) 是 H 的 subgroup。证明时用 subgroup test。

## 同构
Isomorphism 是 bijective homomorphism。证明两个群同构需要构造 phi，证明 homomorphism，再证明 injective/surjective。

## 常见错误
- 只证明函数是 bijection，忘记 homomorphism。
- kernel 用错 identity：必须是 codomain 的 identity。
- phi(ab) 中 ab 用 domain operation，phi(a)phi(b) 用 codomain operation。
- 把 image 和 codomain 混淆。

## 检查清单
同态等式是否对任意 a,b 证明？两个群的运算是否区分？kernel 是否映到 e_H？同构是否包含 homomorphism + bijection 两部分？
`,
  },
];
