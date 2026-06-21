const COURSE_ID_KEYS = {
  cmpnueg4p001d8o017jee1mjq: 'CSC108',
  cmpc9dqgv000p8ogmrsjl5co8: 'CPSC107',
  cmqjfarz800158oi68s595q9n: 'CSC148',
  cmndgvcc10001l404oe8aymjc: 'CSC148',
  cmpd5bird007v8ogmjuuiio03: 'MAT102',
  cmpanemia001v8ouzmhttvkrn: 'MAT136',
};

const COURSE_KEYS = ['CSC108', 'CPSC107', 'CSC148', 'MAT102', 'MAT136'];

const CANONICAL_CONCEPT_TAGS = new Set([
  'Python 基础',
  '表达式',
  '变量绑定',
  '字符串',
  '类型',
  '函数与控制',
  'docstring',
  'return',
  'Boolean',
  '循环列表',
  'range',
  'accumulator',
  'mutation',
  'aliasing',
  '文件与数据结构',
  'Dictionary',
  'File IO',
  'CSV',
  'TextIO',
  '搜索复杂度',
  'Regex DFA',
  'Big-O',
  'Search Sort',
  'Class OOP',
  'self',
  'attributes',
  'Racket 基础',
  'prefix expression',
  'if cond',
  'HtDF/HtDD',
  'signature purpose',
  'template origin',
  'Reference ListOf',
  'self reference',
  'one-of',
  'Recursion BST',
  'BST invariant',
  'mutual reference',
  'Local Abstract',
  'fold lambda',
  'Search genrec',
  'Tail worklist',
  'Python 内存模型',
  'Function Testing',
  'precondition',
  'pytest',
  'Representation Invariant',
  'inheritance polymorphism',
  'ADT Stack Queue',
  'Exceptions',
  'Linked List',
  'Recursion Tree BST',
  'Tree template',
  'Running Time',
  'recursive sorting',
  '逻辑证明',
  '量词',
  '反证逆否',
  '集合关系',
  '集合运算',
  'equivalence relation',
  '函数',
  '双射',
  'composition',
  '归纳计数',
  'strong induction',
  '数论',
  '图论',
  '群论',
  'modular arithmetic',
  'homomorphism',
  '积分基础',
  'FTC',
  'Riemann sum',
  '积分技巧',
  'u-sub',
  'by parts',
  '积分应用',
  'volume',
  'improper',
  '数列级数',
  'convergence tests',
  'Power Series',
  '微分方程',
  '参数极坐标',
  'Taylor',
  'initial value',
]);

const NOISY_EXACT_TAGS = new Set([
  '题库',
  'pdf',
  'mcq',
  'choice',
  'multiple_choice',
  'code',
  'code_tracing',
  'short_answer',
  'fill_blank',
  'calculation',
  'proof',
  'markdown',
  '学生版笔记',
  '无图笔记本',
  'ai生成练习',
]);

const NOISY_TAG_PATTERNS = [
  /^csc\d+$/i,
  /^cpsc\d+$/i,
  /^mat\d+$/i,
  /^q\d+[a-z]?$/i,
  /^p\d+[a-z]?$/i,
  /^week\s*\d+/i,
  /^week\d+_solutions?$/i,
  /^\d+\.\s+/,
  /(?:^|[-_\s])20\d{2}(?:[-_\s]|$)/i,
  /(?:midterm|mid[-_\s]?review|final|exam|term[-_\s]?test|make[_\s-]?up|script|solutions?|practice\d*)/i,
  /(?:source|pdf|question|booklet|answer[-_\s]?key)/i,
  /^fall[-_\s]?\d{4}$/i,
  /^winter[-_\s]?\d{4}$/i,
  /^f[_\s-]?mc$/i,
  /^tt\d/i,
  /^utsg/i,
];

function compactText(value, depth = 0) {
  if (value == null || depth > 3) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => compactText(item, depth + 1))
      .join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .slice(0, 30)
      .map((item) => compactText(item, depth + 1))
      .join(' ');
  }
  return '';
}

function compactSourceMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const safeEntries = Object.entries(value).filter(([key]) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes('concept') ||
      normalized.includes('category') ||
      normalized.includes('section') ||
      normalized.includes('notebooktitle') ||
      normalized.includes('notebookname') ||
      normalized.includes('questiontitle') ||
      normalized === 'titlebeforerewrite' ||
      normalized === 'sourcefunctionname' ||
      normalized === 'sourcecourse'
    );
  });
  return safeEntries.map(([, item]) => compactText(item)).join(' ');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTag(value) {
  return normalizeText(value).slice(0, 48);
}

function isNoisyTag(tag) {
  const normalized = normalizeText(tag).toLowerCase();
  if (!normalized) return true;
  if (NOISY_EXACT_TAGS.has(normalized)) return true;
  return NOISY_TAG_PATTERNS.some((pattern) => pattern.test(normalized));
}

function cleanExistingTags(tags) {
  return Array.from(
    new Set((tags || []).map(normalizeTag).filter((tag) => tag && !isNoisyTag(tag))),
  );
}

function existingCanonicalTags(tags) {
  return Array.from(
    new Set((tags || []).map(normalizeTag).filter((tag) => CANONICAL_CONCEPT_TAGS.has(tag))),
  );
}

function resolveProblemCourseKey(input) {
  const courseId = normalizeText(input.courseId).toLowerCase();
  if (COURSE_ID_KEYS[courseId]) return COURSE_ID_KEYS[courseId];

  const haystack = [
    input.courseCode,
    input.courseName,
    input.notebookName,
    input.title,
    ...(input.tags || []),
    compactSourceMeta(input.sourceMeta),
  ]
    .map(normalizeText)
    .join(' ')
    .toUpperCase()
    .replace(/[\s_-]+/g, '');

  return COURSE_KEYS.find((key) => haystack.includes(key)) || 'GENERIC';
}

function createConceptCollector() {
  const seen = new Set();
  const concepts = [];
  return {
    add(label) {
      const normalized = normalizeTag(label);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      concepts.push(normalized);
    },
    values() {
      return concepts;
    },
  };
}

function hasAny(haystack, patterns) {
  return patterns.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(haystack) : haystack.includes(pattern.toLowerCase()),
  );
}

function addConceptAliases(courseKey, add, hintText) {
  if (!hintText) return;

  if (courseKey === 'CSC108') {
    if (hasAny(hintText, [/\bdictionary\b|\bdict\b|字典/i])) {
      add('文件与数据结构');
      add('Dictionary');
    }
    if (hasAny(hintText, [/file io|\bfile\b|textio|文件/i])) add('File IO');
    if (hasAny(hintText, [/\bcsv\b/i])) add('CSV');
    if (hasAny(hintText, [/stringmethod|string method|\bstring\b|字符串/i])) add('字符串');
    if (hasAny(hintText, [/\blist\b|\bloop\b|循环|列表/i])) add('循环列表');
    if (hasAny(hintText, [/\bregex\b|\bdfa\b|正则|自动机/i])) {
      add('搜索复杂度');
      add('Regex DFA');
    }
    if (hasAny(hintText, [/big-o|complexity|复杂度/i])) add('Big-O');
    if (hasAny(hintText, [/search|sort|搜索|排序/i])) add('Search Sort');
    if (hasAny(hintText, [/oop|\bclass\b|object|ticket|类|对象/i])) add('Class OOP');
    if (hasAny(hintText, [/\bbasic\b|python 基础|基础/i])) add('Python 基础');
  }

  if (courseKey === 'CPSC107') {
    if (hasAny(hintText, [/racket|primitive|prefix|前缀/i])) add('Racket 基础');
    if (hasAny(hintText, [/htdf|htdd|design recipe|设计配方/i])) add('HtDF/HtDD');
    if (hasAny(hintText, [/listof|one-of|self-reference|自引用|列表模板/i])) {
      add('Reference ListOf');
    }
    if (hasAny(hintText, [/bst|binary search tree|二叉搜索树/i])) add('Recursion BST');
    if (hasAny(hintText, [/local|abstract|lambda|fold|高阶|抽象/i])) add('Local Abstract');
    if (hasAny(hintText, [/generative|search|backtracking|搜索|回溯/i])) add('Search genrec');
    if (hasAny(hintText, [/tail|worklist|accumulator|尾递归|工作表/i])) add('Tail worklist');
  }

  if (courseKey === 'CSC148') {
    if (hasAny(hintText, [/memory model|object model|对象三要素|内存模型|对象模型|\bid\b/i])) {
      add('Python 内存模型');
    }
    if (hasAny(hintText, [/alias|浅拷贝|引用|别名/i])) add('aliasing');
    if (hasAny(hintText, [/mutation|mutable|可变对象|变异|原地/i])) add('mutation');
    if (hasAny(hintText, [/pytest|testing|precondition|函数设计|测试|前置条件/i])) {
      add('Function Testing');
    }
    if (hasAny(hintText, [/class|oop|method|attribute|类与对象|实例属性|方法/i])) {
      add('Class OOP');
    }
    if (hasAny(hintText, [/invariant|表示不变式|不变式/i])) add('Representation Invariant');
    if (hasAny(hintText, [/inheritance|polymorphism|继承|多态/i])) {
      add('inheritance polymorphism');
    }
    if (hasAny(hintText, [/adt|stack|queue|抽象数据类型|栈|队列/i])) {
      add('ADT Stack Queue');
    }
    if (hasAny(hintText, [/exception|异常/i])) add('Exceptions');
    if (hasAny(hintText, [/linked list|链表|节点/i])) add('Linked List');
    if (hasAny(hintText, [/recursion|tree|bst|递归|树|二叉搜索树/i])) {
      add('Recursion Tree BST');
    }
    if (hasAny(hintText, [/running time|big-o|complexity|复杂度/i])) add('Running Time');
  }

  if (courseKey === 'MAT102') {
    if (hasAny(hintText, [/set theory|set|集合/i])) {
      add('集合关系');
      add('集合运算');
    }
    if (hasAny(hintText, [/logic|proof|命题|逻辑|证明/i])) add('逻辑证明');
    if (hasAny(hintText, [/quantifier|forall|exists|量词/i])) add('量词');
    if (hasAny(hintText, [/contradiction|contrapositive|counterexample|反证|逆否|反例/i])) {
      add('反证逆否');
    }
    if (hasAny(hintText, [/function|injective|surjective|bijective|函数|映射|单射|满射|双射/i])) {
      add('函数');
    }
    if (hasAny(hintText, [/induction|counting|归纳|计数/i])) add('归纳计数');
    if (hasAny(hintText, [/number theory|modular|gcd|数论|同余|整除/i])) add('数论');
    if (hasAny(hintText, [/graph|图论/i])) add('图论');
    if (hasAny(hintText, [/group|homomorphism|isomorphism|群|同态|同构/i])) add('群论');
  }

  if (courseKey === 'MAT136') {
    if (hasAny(hintText, [/integral|定积分|积分|riemann|黎曼/i])) add('积分基础');
    if (hasAny(hintText, [/ftc|fundamental theorem|基本定理/i])) add('FTC');
    if (hasAny(hintText, [/riemann|黎曼|右端点|左端点/i])) add('Riemann sum');
    if (hasAny(hintText, [/substitution|u-sub|parts|partial fractions|换元|分部积分|部分分式/i])) {
      add('积分技巧');
    }
    if (hasAny(hintText, [/substitution|u-sub|换元/i])) add('u-sub');
    if (hasAny(hintText, [/area|volume|arc length|work|面积|体积|弧长|做功|应用/i])) {
      add('积分应用');
    }
    if (hasAny(hintText, [/improper|反常积分/i])) add('improper');
    if (hasAny(hintText, [/series|sequence|convergence|级数|数列|收敛/i])) add('数列级数');
    if (hasAny(hintText, [/power series|taylor|maclaurin|幂级数|泰勒/i])) add('Power Series');
    if (
      hasAny(hintText, [
        /differential equation|euler|slope field|equilibrium|logistic|qualitative|numerical|微分方程|斜率场|初值/i,
      ])
    ) {
      add('微分方程');
    }
    if (hasAny(hintText, [/parametric|polar|参数|极坐标/i])) add('参数极坐标');
  }
}

function addCsc108Concepts(add, haystack) {
  if (
    hasAny(haystack, [
      /basic|operator|expression|calculate|arithmetic|formula|area|discount|celsius|fahrenheit|inclusive|even number|swap/i,
      /表达式|运算|算术|变量|赋值|基础/,
    ])
  ) {
    add('Python 基础');
  }
  if (
    hasAny(haystack, [
      /expression|operator|calculate|arithmetic|modulo|integer division|area|discount/i,
      /表达式|运算|取模|整除/,
    ])
  ) {
    add('表达式');
  }
  if (hasAny(haystack, [/variable|assignment|binding|swap|name binding/i, /变量|赋值|绑定/])) {
    add('变量绑定');
  }
  if (
    hasAny(haystack, [
      /string|stringmethod|slice|substring|index|split|join|strip|replace/i,
      /字符串|切片|索引|文本/,
    ])
  ) {
    add('字符串');
  }
  if (
    hasAny(haystack, [/\btype\b|\bint\b|\bfloat\b|\bstr\b|\bbool\b|conversion|input/i, /类型|转换/])
  ) {
    add('类型');
  }
  if (
    hasAny(haystack, [
      /function|docstring|return|parameter|argument|conditional|\bif\b|\belif\b|boolean|predicate|is even/i,
      /函数|条件|参数|返回|布尔/,
    ])
  ) {
    add('函数与控制');
  }
  if (
    hasAny(haystack, [
      /docstring|doctest|function design|header|annotation/i,
      /函数说明|文档字符串/,
    ])
  ) {
    add('docstring');
  }
  if (hasAny(haystack, [/return|print|none/i, /返回|输出/])) add('return');
  if (hasAny(haystack, [/boolean|predicate|condition|and|or|not|true|false/i, /布尔|条件判断/])) {
    add('Boolean');
  }
  if (
    hasAny(haystack, [
      /loop|for loop|while|range|accumulator|list|nested|alias|mutation|append|parsons/i,
      /循环|列表|嵌套|累加/,
    ])
  ) {
    add('循环列表');
  }
  if (hasAny(haystack, [/range|step|stop/i, /循环边界/])) add('range');
  if (hasAny(haystack, [/accumulator|running total|counting|counter|sum/i, /累加|计数器/])) {
    add('accumulator');
  }
  if (
    hasAny(haystack, [/mutation|mutate|append|extend|sort|reverse|remove|pop/i, /可变|原地|修改/])
  ) {
    add('mutation');
  }
  if (hasAny(haystack, [/alias|aliasing|copy|deep copy|shallow copy/i, /别名|共享对象|复制/])) {
    add('aliasing');
  }
  if (
    hasAny(haystack, [
      /dictionary|dict|file|csv|textio|reader|open|readline|write|data structure/i,
      /字典|文件|数据结构/,
    ])
  ) {
    add('文件与数据结构');
  }
  if (hasAny(haystack, [/dictionary|dict|key|value|mapping/i, /字典|键值/])) add('Dictionary');
  if (
    hasAny(haystack, [
      /file io|file|open|readline|readlines|write|with statement/i,
      /文件读写|文件/,
    ])
  ) {
    add('File IO');
  }
  if (hasAny(haystack, [/csv|comma separated|reader/i, /表格|逗号分隔/])) add('CSV');
  if (hasAny(haystack, [/textio|file object/i, /文件对象/])) add('TextIO');
  if (
    hasAny(haystack, [
      /regex|regular expression|dfa|search|sort|binary search|linear search|big-o|runtime|complexity/i,
      /正则|自动机|搜索|排序|复杂度/,
    ])
  ) {
    add('搜索复杂度');
  }
  if (hasAny(haystack, [/regex|regular expression|dfa|finite automaton/i, /正则|自动机/])) {
    add('Regex DFA');
  }
  if (hasAny(haystack, [/big-o|runtime|running time|complexity|theta|omega/i, /复杂度|运行时间/])) {
    add('Big-O');
  }
  if (
    hasAny(haystack, [
      /search|sort|binary search|linear search|selection sort|insertion sort|merge sort/i,
      /搜索|排序/,
    ])
  ) {
    add('Search Sort');
  }
  if (
    hasAny(haystack, [
      /oop|class|object|self|attribute|method|ticket|__init__/i,
      /类|对象|属性|方法/,
    ])
  ) {
    add('Class OOP');
  }
  if (hasAny(haystack, [/self|method call/i, /\bself\b/])) add('self');
  if (hasAny(haystack, [/attribute|instance variable|field|__init__/i, /属性/])) add('attributes');
}

function addCpsc107Concepts(add, haystack) {
  if (hasAny(haystack, [/racket|primitive|prefix|operator|if|cond|evaluation/i, /求值|前缀/]))
    add('Racket 基础');
  if (hasAny(haystack, [/prefix|expression|operator/i, /前缀表达式/])) add('prefix expression');
  if (hasAny(haystack, [/if|cond|branch|conditional/i, /条件|分支/])) add('if cond');
  if (
    hasAny(haystack, [
      /htdf|htdd|design recipe|signature|purpose|stub|template origin|check-expect/i,
      /设计配方|签名|模板来源/,
    ])
  )
    add('HtDF/HtDD');
  if (hasAny(haystack, [/signature|purpose|check-expect|examples?/i, /签名|用途|测试/]))
    add('signature purpose');
  if (hasAny(haystack, [/template origin|template-origin|template/i, /模板来源|模板/]))
    add('template origin');
  if (
    hasAny(haystack, [
      /reference|self-reference|listof|one-of|list recursion/i,
      /自引用|引用|列表模板/,
    ])
  )
    add('Reference ListOf');
  if (hasAny(haystack, [/self-reference|recursive data/i, /自引用/])) add('self reference');
  if (hasAny(haystack, [/one-of|two one-of|cross product/i, /分类讨论/])) add('one-of');
  if (
    hasAny(haystack, [/recursion|bst|binary search tree|natural helper|lookup/i, /递归|二叉搜索树/])
  )
    add('Recursion BST');
  if (hasAny(haystack, [/bst invariant|binary search tree|lookup-key/i, /bst|二叉搜索树/]))
    add('BST invariant');
  if (
    hasAny(haystack, [
      /mutual-reference|mutual recursion|node\/listofnode|mutual/i,
      /互相引用|互递归/,
    ])
  )
    add('mutual reference');
  if (
    hasAny(haystack, [
      /local|abstract|filter|map|build-list|fold|lambda|closure|lifting/i,
      /局部|抽象|高阶/,
    ])
  )
    add('Local Abstract');
  if (hasAny(haystack, [/foldr|foldl|fold|lambda/i, /折叠|匿名函数/])) add('fold lambda');
  if (
    hasAny(haystack, [
      /search|generative recursion|genrec|backtracking|state|successors/i,
      /搜索|回溯/,
    ])
  )
    add('Search genrec');
  if (
    hasAny(haystack, [/tail recursion|tail|accumulator|worklist|visited/i, /尾递归|工作表|累加器/])
  )
    add('Tail worklist');
}

function addCsc148Concepts(add, haystack) {
  if (
    hasAny(haystack, [
      /memory model|object model|object identity|alias|mutation|\bid\b|variable binding|对象三要素|内存模型|对象标识|变量绑定|可变对象/,
    ])
  )
    add('Python 内存模型');
  if (hasAny(haystack, [/alias|aliasing|共享对象|别名/])) add('aliasing');
  if (hasAny(haystack, [/mutation|mutable|可变对象|变异|原地/])) add('mutation');
  if (
    hasAny(haystack, [
      /function design|testing|pytest|precondition|docstring|type annotation|函数设计|类型注解|文档注释/,
    ])
  )
    add('Function Testing');
  if (hasAny(haystack, [/precondition|前置条件/])) add('precondition');
  if (hasAny(haystack, [/pytest|test|测试/])) add('pytest');
  if (
    hasAny(haystack, [
      /class|object|oop|method|attribute|inheritance|polymorphism|self|类与对象|构造|实例属性|方法|继承|多态/,
    ])
  )
    add('Class OOP');
  if (hasAny(haystack, [/representation invariant|rep invariant|invariant|表示不变式|不变式/]))
    add('Representation Invariant');
  if (
    hasAny(haystack, [
      /inheritance|polymorphism|override|superclass|subclass|继承|多态|覆盖|子类|超类/,
    ])
  )
    add('inheritance polymorphism');
  if (hasAny(haystack, [/adt|stack|queue|interface|abstract data type|抽象数据类型|栈|队列|接口/]))
    add('ADT Stack Queue');
  if (hasAny(haystack, [/exception|try|except|raise|finally|异常/])) add('Exceptions');
  if (hasAny(haystack, [/linked list|node|_first|链表|节点/])) add('Linked List');
  if (
    hasAny(haystack, [
      /recursion|tree|bst|recursive|traversal|nested list|递归|树|二叉搜索树|遍历|嵌套列表/,
    ])
  )
    add('Recursion Tree BST');
  if (hasAny(haystack, [/tree template|tree adt|traversal|树模板|遍历/])) add('Tree template');
  if (hasAny(haystack, [/running time|runtime|big-o|complexity|omega|theta|时间复杂度|复杂度/]))
    add('Running Time');
  if (hasAny(haystack, [/sort|sorting|merge sort|quicksort|排序/])) add('recursive sorting');
}

function addMat102Concepts(add, haystack) {
  if (
    hasAny(haystack, [
      /logic|proof|quantifier|contradiction|contrapositive|命题|逻辑|证明|量词|反证|逆否/,
    ])
  )
    add('逻辑证明');
  if (hasAny(haystack, [/quantifier|forall|exists|全称|存在|量词/])) add('量词');
  if (hasAny(haystack, [/contradiction|contrapositive|counterexample|反证|逆否|反例/]))
    add('反证逆否');
  if (hasAny(haystack, [/set|relation|equivalence|partition|cartesian|集合|关系|等价|笛卡尔/]))
    add('集合关系');
  if (
    hasAny(haystack, [/set theory|set operation|union|intersection|complement|集合运算|交|并|补/])
  )
    add('集合运算');
  if (
    hasAny(haystack, [
      /equivalence relation|reflexive|symmetric|transitive|等价关系|自反|对称|传递/,
    ])
  )
    add('equivalence relation');
  if (
    hasAny(haystack, [
      /function|mapping|injective|surjective|bijective|inverse|composition|函数|映射|单射|满射|双射|逆映射|复合/,
    ])
  )
    add('函数');
  if (hasAny(haystack, [/bijective|bijection|双射/])) add('双射');
  if (hasAny(haystack, [/composition|复合/])) add('composition');
  if (hasAny(haystack, [/induction|counting|pigeonhole|recurrence|归纳|计数|鸽巢|递推/]))
    add('归纳计数');
  if (hasAny(haystack, [/strong induction|强归纳/])) add('strong induction');
  if (
    hasAny(haystack, [
      /number theory|divisibility|gcd|modular|congruence|diophantine|数论|整除|最大公约数|同余|模/,
    ])
  )
    add('数论');
  if (hasAny(haystack, [/graph|degree|path|cycle|tree|图论|路径|环|度/])) add('图论');
  if (
    hasAny(haystack, [
      /group|subgroup|cyclic|homomorphism|isomorphism|kernel|群|子群|循环群|同态|同构|核/,
    ])
  )
    add('群论');
  if (hasAny(haystack, [/modular|congruence|同余|模运算/])) add('modular arithmetic');
  if (hasAny(haystack, [/homomorphism|isomorphism|kernel|同态|同构|核/])) add('homomorphism');
}

function addMat136Concepts(add, haystack) {
  if (
    hasAny(haystack, [
      /integral|integration|riemann|ftc|antiderivative|definite integral|定积分|积分|黎曼|基本定理|原函数/,
    ])
  )
    add('积分基础');
  if (hasAny(haystack, [/fundamental theorem|ftc|基本定理/])) add('FTC');
  if (hasAny(haystack, [/riemann sum|riemann sums|黎曼和|右端点和/])) add('Riemann sum');
  if (
    hasAny(haystack, [
      /substitution|u-sub|parts|partial fractions|trig substitution|换元|分部积分|部分分式|三角代换/,
    ])
  )
    add('积分技巧');
  if (hasAny(haystack, [/substitution|u-sub|换元/])) add('u-sub');
  if (hasAny(haystack, [/integration by parts|by parts|分部积分/])) add('by parts');
  if (
    hasAny(haystack, [
      /area|volume|average value|arc length|work|physics|kinematics|面积|体积|平均值|弧长|做功|应用积分/,
    ])
  )
    add('积分应用');
  if (hasAny(haystack, [/volume|washer|shell|cross sections|体积|截面/])) add('volume');
  if (hasAny(haystack, [/improper|p-integral|反常积分/])) add('improper');
  if (
    hasAny(haystack, [
      /sequence|series|convergence|divergence|ratio|root|alternating|comparison|级数|数列|收敛|发散|比值|比较判别/,
    ])
  )
    add('数列级数');
  if (
    hasAny(haystack, [
      /convergence test|ratio test|root test|comparison test|alternating|收敛判别|比值判别|比较判别|交错/,
    ])
  )
    add('convergence tests');
  if (
    hasAny(haystack, [
      /power series|taylor|maclaurin|radius|interval of convergence|幂级数|泰勒|收敛半径|收敛区间/,
    ])
  )
    add('Power Series');
  if (
    hasAny(haystack, [
      /differential equation|separable|slope field|euler|equilibrium|logistic|qualitative|numerical|initial value|growth|decay|微分方程|可分离|斜率场|初值/,
    ])
  ) {
    add('微分方程');
  }
  if (hasAny(haystack, [/parametric|polar|参数|极坐标/])) add('参数极坐标');
  if (hasAny(haystack, [/taylor|maclaurin|泰勒/])) add('Taylor');
  if (hasAny(haystack, [/initial value|初值/])) add('initial value');
}

function addConceptsForCourse(courseKey, add, haystack) {
  if (courseKey === 'CSC108') addCsc108Concepts(add, haystack);
  if (courseKey === 'CPSC107') addCpsc107Concepts(add, haystack);
  if (courseKey === 'CSC148') addCsc148Concepts(add, haystack);
  if (courseKey === 'MAT102') addMat102Concepts(add, haystack);
  if (courseKey === 'MAT136') addMat136Concepts(add, haystack);
}

function fallbackCleanTags(tags) {
  return cleanExistingTags(tags)
    .filter((tag) => tag.length <= 40)
    .slice(0, 4);
}

export function normalizeProblemConceptTags(input) {
  const courseKey = resolveProblemCourseKey(input || {});
  const normalizedInputTags = (input?.tags || []).map(normalizeTag).filter(Boolean);
  const existingConcepts = existingCanonicalTags(normalizedInputTags);
  const alreadyCanonical =
    existingConcepts.length > 0 &&
    normalizedInputTags.every((tag) => CANONICAL_CONCEPT_TAGS.has(tag));
  if (alreadyCanonical) return existingConcepts.slice(0, 6);

  const collector = createConceptCollector();
  const add = (label) => collector.add(label);
  const sourceMeta =
    input?.sourceMeta && typeof input.sourceMeta === 'object' ? input.sourceMeta : {};
  const hintText = [cleanExistingTags(input?.tags || []).join(' '), compactSourceMeta(sourceMeta)]
    .map(normalizeText)
    .join(' ')
    .toLowerCase();
  const haystack = [
    input?.title,
    input?.type,
    input?.difficulty,
    input?.courseCode,
    input?.courseName,
    ...(input?.tags || []),
    compactSourceMeta(sourceMeta),
    compactText(input?.publicContent),
  ]
    .map(normalizeText)
    .join(' ')
    .toLowerCase();

  addConceptAliases(courseKey, add, hintText);
  addConceptsForCourse(courseKey, add, haystack);

  const concepts = collector.values();
  if (concepts.length > 0) return concepts.slice(0, 6);
  return fallbackCleanTags(input?.tags || []);
}

export function problemConceptTopics(input, fallback = '未标注') {
  const concepts = normalizeProblemConceptTags(input);
  return concepts.length > 0 ? concepts : [fallback];
}
