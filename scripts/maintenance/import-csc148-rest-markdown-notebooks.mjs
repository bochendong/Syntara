#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmqjfarz800158oi68s595q9n';
const IMPORT_VERSION = 'csc148-rest-markdown-notebooks-2026-06-18';
const PUBLIC_ROOT = path.join(ROOT, 'public', 'generated-notebooks');
const IMAGEGEN_DIR = path.join(ROOT, 'output', 'imagegen', 'csc148-rest');
const SOURCE_INDEX_URL = 'https://www.teach.cs.toronto.edu/~csc148h/notes/';

const IMAGE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function m(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

function loadEnvFiles() {
  for (const filename of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, filename);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || match[1].startsWith('#')) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] ??= value;
    }
  }
}

function parseArgs(argv) {
  const args = {
    write: false,
    courseId: process.env.CSC148_COURSE_ID || DEFAULT_COURSE_ID,
    only: null,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--course-id=')) args.courseId = arg.slice('--course-id='.length);
    else if (arg.startsWith('--only=')) {
      args.only = new Set(
        arg
          .slice('--only='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `
Usage:
  node scripts/maintenance/import-csc148-rest-markdown-notebooks.mjs [--write] [--course-id=${DEFAULT_COURSE_ID}] [--only=02,03]

Creates or updates CSC148 Chinese Markdown notebooks 02-12 and their imagegen illustrations.
Without --write, the script renders local PNG assets and prints the planned DB writes.
  `.trim();
}

function imageMarkdown(plan) {
  return `![${plan.imageAlt}](${plan.publicImagePath})`;
}

function bullets(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function vocabTable(rows) {
  return [
    '| 词 | 在 CSC148 里要怎么理解 |',
    '| --- | --- |',
    ...rows.map(([term, desc]) => `| \`${term}\` | ${desc} |`),
  ].join('\n');
}

function renderExamples(examples) {
  return examples
    .map(
      (example, index) => m`
### 例 ${index + 1}: ${example.title}

${example.prompt}

${example.code ? `~~~python\n${example.code.trim()}\n~~~` : ''}

追踪重点：

${bullets(example.trace)}

${example.answer ? `结论：${example.answer}` : ''}
      `,
    )
    .join('\n\n');
}

function buildSections(plan) {
  const sourceMeta = {
    sourceKind: 'u-toronto-csc148-notes',
    sourceUrl: SOURCE_INDEX_URL,
    importVersion: IMPORT_VERSION,
    notebookOrder: plan.order,
    topicKey: plan.topicKey,
  };

  if (plan.customSections) {
    return plan.customSections.map((section, index) => ({
      ...section,
      sourceMeta: {
        ...sourceMeta,
        sourceUrls: plan.sourceUrls,
      },
      order: index,
    }));
  }

  return [
    {
      title: '学习路线',
      summary: plan.summary,
      markdown: m`
这本笔记接在第一本 **Python 记忆模型** 后面。第一本解决“变量到底保存什么”，这一本解决本主题里“代码应该怎么读、怎么写、怎么测”。

${imageMarkdown(plan)}

本本的目标：

${bullets(plan.goals)}

读代码时保持一个习惯：先说清楚对象和引用，再说清楚函数调用、对象方法、递归调用或数据结构操作。这样后面的追踪题不会变成凭感觉猜。
      `,
      sourceMeta,
    },
    {
      title: '核心模型',
      summary: plan.coreSummary,
      markdown: m`
${plan.coreIntro}

${vocabTable(plan.vocabulary)}

本主题最容易混的不是语法，而是“这行代码改变了哪里”。你可以用下面这组问题强迫自己慢下来：

${bullets(plan.coreQuestions)}
      `,
      sourceMeta,
    },
    {
      title: '追踪方法',
      summary: '给学生一个可以反复使用的 tracing recipe。',
      markdown: m`
遇到这类题时，不要直接跳答案。按下面顺序写出中间状态：

${numbered(plan.tracingRecipe)}

一个好的 trace 不一定很长，但一定要让别人看出：

${bullets(plan.goodTrace)}
      `,
      sourceMeta,
    },
    {
      title: '例题精讲',
      summary: '用几个典型例子把概念落到代码上。',
      markdown: m`
下面的例子都不是为了背答案，而是训练你看出“状态在哪里变化”。

${renderExamples(plan.examples)}
      `,
      sourceMeta,
    },
    {
      title: '常见错误',
      summary: '提前拆掉本主题最常见的错误模型。',
      markdown: m`
这些错误在 CSC148 的练习和测验里很常见：

${plan.pitfalls
  .map(
    (pitfall) => m`
### ${pitfall.title}

错因：${pitfall.why}

修正：${pitfall.fix}
    `,
  )
  .join('\n\n')}
      `,
      sourceMeta,
    },
    {
      title: '小练习',
      summary: '短题练习，适合课堂后立即自测。',
      markdown: m`
把答案写在纸上，再运行 Python 检查。

${plan.practice
  .map(
    (item, index) => m`
### 练习 ${index + 1}: ${item.title}

${item.prompt}

${item.code ? `~~~python\n${item.code.trim()}\n~~~` : ''}

检查：${item.check}
    `,
  )
  .join('\n\n')}
      `,
      sourceMeta,
    },
    {
      title: '自测清单',
      summary: '确认学生是否能进入下一本 notebook。',
      markdown: m`
如果下面每一项都能说清楚，就可以进入下一本。

${bullets(plan.checklist)}

最后问自己一句：如果把输入换成空结构、单元素结构、嵌套结构，代码还保持同一个解释吗？CSC148 很多题就在这里拉开差距。
      `,
      sourceMeta,
    },
  ].map((section, index) => ({
    ...section,
    order: index,
  }));
}

const NOTEBOOK_PLANS = [
  {
    order: '02',
    topicKey: 'functions-design-recipe',
    id: 'queue-csc148-02-functions-design-recipe',
    name: '02 - 函数、契约与设计配方',
    description:
      'CSC148 中文 Markdown 笔记：函数调用、参数、返回值、precondition、type annotation 与设计配方。',
    tags: ['CSC148', 'Python', '函数', '设计配方'],
    imageSource: 'csc148-02-call-stack.png',
    imageAlt: '函数调用栈示意图：main frame 调用 mess_about frame，return 后函数 frame 消失。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/python-recap/memory_model_part2.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/python-recap/design_recipe.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/python-recap/preconditions.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/python-recap/type_annotations.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/nested_lists.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/inheritance/inheritance_methods.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/full_tracing.html',
    ],
    customSections: [
      {
        title: '函数不是代码片段，而是一份契约',
        summary: '先建立 CSC148 对函数的基本要求：名字、输入、输出、说明、例子、测试。',
        markdown: m`
很多初学者一看到题目就立刻写函数体。但在还没确认问题、输入、输出和例子之前，直接写代码很容易写出“看起来像答案”的东西。

这一章把函数当成一份 **contract** 来读：

- 调用者需要知道：这个函数叫什么、要传什么、返回什么、什么时候可以调用。
- 实现者需要知道：可以假设什么、必须保证什么、有没有修改外部可见对象。
- 阅读者需要看到：至少几个例子，最好包含普通例子和边界例子。

一个合格的 CSC148 函数通常至少要有这些部分：

1. meaningful name：名字说明函数要做什么。
2. parameter list：每个参数有清楚的名字。
3. type annotations：参数和返回值的类型写在 header 里。
4. docstring：一句话说明返回值，必要时说明 preconditions。
5. examples：用 doctest 风格给出调用和预期结果。
6. body：只在规格清楚之后写。
7. tests：用例子和额外边界情况检查实现。

先看一个很小但完整的函数：

~~~python
def is_even(value: int) -> bool:
    """Return whether value is even.

    >>> is_even(2)
    True
    >>> is_even(17)
    False
    """
    return value % 2 == 0
~~~

这里的重点不是 \`%\`，而是结构：\`value: int\` 和 \`-> bool\` 是 type contract；docstring 说明返回值；两个例子告诉读者函数应该怎么用。
        `,
      },
      {
        title: 'Function Design Recipe：五步写函数',
        summary: '按设计配方的五步流程，从例子到测试，而不是从函数体开始。',
        markdown: m`
Function Design Recipe 可以拆成五步。顺序很重要：

1. **Write example uses**：先写函数调用例子和预期返回值。
2. **Write the function header**：写函数名、参数名、type contract。
3. **Write the function description**：在 docstring 里说明返回什么。
4. **Implement the function body**：现在才写函数体。
5. **Test the function**：用前面的例子和额外 corner cases 检查。

例如题目是：写一个函数，判断一个字符串是否包含大写字母。

第一步不要写循环，先写例子：

~~~python
"""
>>> has_uppercase('CSC148')
True
>>> has_uppercase('python')
False
>>> has_uppercase('')
False
"""
~~~

第二、三步写 header 和说明：

~~~python
def has_uppercase(text: str) -> bool:
    """Return whether text contains at least one uppercase letter.

    >>> has_uppercase('CSC148')
    True
    >>> has_uppercase('python')
    False
    >>> has_uppercase('')
    False
    """
~~~

第四步写函数体：

~~~python
def has_uppercase(text: str) -> bool:
    """Return whether text contains at least one uppercase letter.

    >>> has_uppercase('CSC148')
    True
    >>> has_uppercase('python')
    False
    >>> has_uppercase('')
    False
    """
    for ch in text:
        if ch.isupper():
            return True
    return False
~~~

第五步测试时，不只测普通字符串，也要测空字符串、全大写、含数字但无大写等边界情况。

这套流程的目的不是形式主义，而是逼你在写实现前先回答三个问题：输入是什么？输出是什么？什么情况算正确？
        `,
      },
      {
        title: 'Python Type Annotations：基础写法',
        summary: '解释 Python 中对象有类型、变量没有固定类型，以及函数 annotation 的基本语法。',
        markdown: m`
Python 和很多语言不同：**对象有类型，变量名本身没有固定类型**。所以变量可以先指向一个 \`int\`，之后再指向一个 \`str\`。但是写函数时，我们仍然要说明希望调用者传入什么类型的对象。

基本类型直接写类型名：

| 类型 | 例子 |
| --- | --- |
| \`int\` | \`0\`, \`148\`, \`-3\` |
| \`float\` | \`4.53\`, \`2.0\` |
| \`str\` | \`'hello'\`, \`''\` |
| \`bool\` | \`True\`, \`False\` |
| \`None\` | \`None\` |

函数参数 annotation 写在参数名后面：

~~~python
def can_divide(num: int, divisor: int) -> bool:
    """Return whether num is evenly divisible by divisor."""
    return num % divisor == 0
~~~

复合类型用方括号写“里面装的类型”：

~~~python
def total_length(words: list[str]) -> int:
    """Return the total length of all strings in words."""
    return sum(len(word) for word in words)
~~~

三个最常见的复合类型：

| type contract | 意思 | 例子 |
| --- | --- | --- |
| \`list[int]\` | 元素都是 \`int\` 的 list | \`[1, 2, 3]\` |
| \`dict[str, int]\` | key 是 \`str\`，value 是 \`int\` | \`{'a': 1}\` |
| \`tuple[str, bool, float]\` | 固定长度，每个位置有自己的类型 | \`('ok', True, 3.5)\` |

注意：\`list\` 和 \`list[int]\` 不一样。\`list\` 只说“这是个列表”，\`list[int]\` 还说“每个元素都是整数”。在 CSC148 里，能具体就不要偷懒。
        `,
      },
      {
        title: '比较难写的 Type Contract',
        summary: '集中讲嵌套类型、union、None、Any、Callable、method annotation。',
        markdown: m`
这一节专门整理 CSC148 里容易写错的 type contract。

### 1. 返回两个列表

\`split_numbers\` 这个例子的返回值不是一个 list，而是一个 tuple，里面有两个 list：

~~~python
def split_numbers(numbers: list[int]) -> tuple[list[int], list[int]]:
    """Return non-negative numbers and negative numbers separately."""
    pos = []
    neg = []
    for n in numbers:
        if n >= 0:
            pos.append(n)
        else:
            neg.append(n)
    return pos, neg
~~~

\`tuple[list[int], list[int]]\` 的意思是：返回一个长度为 2 的 tuple，第一个位置是 \`list[int]\`，第二个位置也是 \`list[int]\`。

### 2. 嵌套 list

~~~python
def flatten_once(groups: list[list[int]]) -> list[int]:
    """Return a new list containing the numbers from each inner list."""
    result = []
    for group in groups:
        result.extend(group)
    return result
~~~

\`list[list[int]]\` 不是“二维数组”这个模糊说法，而是一个 list，里面的每个元素又是 \`list[int]\`。

### 3. 字典里装 tuple

~~~python
def item_names(inventory: dict[int, tuple[str, int]]) -> list[str]:
    """Return the names of all items in inventory."""
    return [item_info[0] for item_info in inventory.values()]
~~~

这里 \`dict[int, tuple[str, int]]\` 表示 key 是商品编号，value 是 \`(description, quantity)\`。

### 4. 可能失败时返回 \`None\`

~~~python
def find_pos(numbers: list[int]) -> int | None:
    """Return the first positive number, or None if there is none."""
    for n in numbers:
        if n > 0:
            return n
    return None
~~~

\`int | None\` 比“可能返回 int，也可能没有结果”清楚得多。

### 5. 参数本身是函数：Callable

~~~python
from typing import Callable


def compare_nums(num1: int, num2: int,
                 comp: Callable[[int, int], bool]) -> int:
    """Return num1 or num2 depending on comp(num1, num2)."""
    if comp(num1, num2):
        return num1
    else:
        return num2
~~~

\`Callable[[int, int], bool]\` 的意思是：\`comp\` 是一个函数，它接收两个 \`int\`，返回一个 \`bool\`。

### 6. class 里 method 的 annotation

method 的第一个参数 \`self\` 按惯例不写 annotation：

~~~python
from __future__ import annotations


class Inventory:
    size: int
    items: dict[int, tuple[str, int]]

    def add_item(self, item: str, quantity: int) -> None:
        ...

    def copy(self) -> Inventory:
        ...
~~~

\`from __future__ import annotations\` 让类的方法可以在 annotation 里写这个类自己的名字。

### 7. Any 要少用

~~~python
from typing import Any


def get_first(items: list) -> Any:
    return items[0]
~~~

\`Any\` 的意思是“任何非 \`None\` 类型”。它有时必要，但滥用会让 type annotation 失去沟通价值。能写 \`list[str]\` 就不要写 \`list\` 或 \`Any\`。
        `,
      },
      {
        title: 'isinstance：运行时类型判断',
        summary: '`isinstance` 用来检查对象当前属于哪类；它和 type annotation 解决的是不同问题。',
        markdown: m`
Type annotation 写在函数 header 里，表达“这个函数希望接收什么类型”。但它本身不是普通 \`if\` 条件，也不会在函数体里自动帮你分支。

如果代码运行时需要根据对象类型走不同分支，就会用到 \`isinstance\`。

基本写法：

~~~python
isinstance(5, int)       # True
isinstance(5, str)       # False
isinstance('hi', str)    # True
~~~

\`isinstance(obj, T)\` 问的是：

> \`obj\` 当前引用的对象，是不是 \`T\` 这个类型的 instance？

它常和 union type 搭配出现。例如 nested list 的参数可能是 \`int | list\`：

~~~python
def describe(obj: int | list) -> str:
    """Return a short description of obj."""
    if isinstance(obj, int):
        return 'single integer'
    else:
        return 'list structure'
~~~

这里 \`obj: int | list\` 是 contract，说明合法输入有两类；\`isinstance(obj, int)\` 是运行时检查，决定这一轮到底走哪个分支。

在继承里，\`isinstance\` 会考虑 subclass 关系：

~~~python
employee = SalariedEmployee(99, 'Ada', 90000.0)

isinstance(employee, SalariedEmployee)  # True
isinstance(employee, Employee)          # True
~~~

这和 \`type(employee) == Employee\` 不一样。后者只问“实际 class 是否正好是 Employee”，不会把 subclass 算进去。

什么时候该用 \`isinstance\`？

- 处理 union type，例如 \`int | list\`。
- 在 \`__eq__\` 里确认 \`other\` 是否支持同一种比较语义。
- 需要区分 built-in type 或 class hierarchy 时。

什么时候不要滥用？

如果你发现代码里到处写：

~~~python
if isinstance(shape, Circle):
    ...
elif isinstance(shape, Rectangle):
    ...
~~~

这通常说明应该考虑 polymorphism：把变化放进 class method，让 client 调用共同 interface。

一句话总结：

> type annotation 是写给 contract 和工具看的；\`isinstance\` 是程序运行时真的执行的类型分支。
        `,
      },
      {
        title: 'Preconditions：函数什么时候可以被调用',
        summary: '解释 precondition 是调用者必须满足的条件，也是函数设计的一部分。',
        markdown: m`
type contract 只能说明“类型对不对”，但不能表达所有要求。比如一个 list 是 \`list[int]\`，它可能为空、可能未排序、可能长度不够。

**Precondition** 是函数参数必须满足的额外条件。它写在 docstring 里，是函数 interface 的一部分。

看这个例子：

~~~python
def decreases_at(numbers: list[int]) -> int:
    """Return the index of the first number that is less than its predecessor.

    >>> decreases_at([3, 6, 9, 12, 2, 1, 8, 5])
    4
    """
~~~

这里只写了 \`list[int]\` 还不够。为了保证函数一定能返回一个 index，我们还需要类似这样的 precondition：

~~~python
def decreases_at(numbers: list[int]) -> int:
    """Return the index of the first number that is less than its predecessor.

    Preconditions:
      - len(numbers) >= 2
      - there is at least one index i such that numbers[i] < numbers[i - 1]
    """
~~~

precondition 的两面：

- 对调用者：限制你怎么用函数。你必须先保证条件满足。
- 对实现者：允许你少写一些防御代码，让实现更简单或更快。

例如 binary search 的前提是 list 已排序。如果每次搜索都先检查 list 是否排序，检查本身可能比搜索还慢。所以这个要求通常写成 precondition：调用者必须传入 sorted list。
        `,
      },
      {
        title: '检查 Preconditions：assert 和 check_contracts',
        summary: '用 max_length 讲 docstring、assert、PythonTA check_contracts 的关系。',
        markdown: m`
precondition 写在 docstring 里，理论上靠调用者阅读。但实际写代码时，我们常常希望它能被检查。

我们用这个 running example 来看 precondition 检查：

~~~python
def max_length(strings: list[str]) -> int:
    """Return the maximum length of a string in strings.

    Preconditions:
      - strings != []
    """
    max_so_far = -1
    for s in strings:
        if len(s) > max_so_far:
            max_so_far = len(s)

    return max_so_far
~~~

一种直接办法是在函数体开头加 \`assert\`：

~~~python
def max_length(strings: list[str]) -> int:
    """Return the maximum length of a string in strings.

    Preconditions:
      - strings != []
    """
    assert strings != [], 'Precondition violated: empty list.'

    max_so_far = -1
    for s in strings:
        if len(s) > max_so_far:
            max_so_far = len(s)

    return max_so_far
~~~

但这样会把同一个条件写两遍：docstring 一次，\`assert\` 一次。CSC148 使用 PythonTA 的 \`check_contracts\` 来自动检查 type annotations 和 preconditions：

~~~python
from python_ta.contracts import check_contracts


@check_contracts
def max_length(strings: list[str]) -> int:
    """Return the maximum length of a string in strings.

    Preconditions:
      - strings != []
    """
    max_so_far = -1
    for s in strings:
        if len(s) > max_so_far:
            max_so_far = len(s)

    return max_so_far
~~~

\`@check_contracts\` 是 decorator。它给函数增加额外行为：每次调用时检查 argument 是否符合 type annotation，也检查 docstring 里的 precondition；函数返回时也会检查 return type。
        `,
      },
      {
        title: 'Call Stack：函数调用时 Python 保存什么',
        summary: '解释 frame、parameter binding、local variable、return 后 frame 消失。',
        markdown: m`
函数调用不是“跳进函数体”这么简单。Python 必须记录当前正在运行哪个函数，以及这个函数里的局部变量。这个记录单位叫 **stack frame**，一叠 frame 组成 **call stack**。

每次调用函数时，Python 做三件事：

1. 创建一个新的 frame，并把它放到 call stack 顶部。
2. 在这个 frame 里创建参数名。
3. 从左到右计算 arguments，把得到的对象引用绑定给对应参数。

看这个例子：

~~~python
def mess_about(n: int, s: str) -> None:
    message = s * n
    print(message)


if __name__ == '__main__':
    count = 13
    word = 'nonsense'
    mess_about(count, word)
~~~

调用 \`mess_about(count, word)\` 时，可以把参数绑定理解成：

~~~python
n = count
s = word
~~~

但这两个名字是在新的 \`mess_about\` frame 里创建的，不是在 main frame 里创建的。

![函数调用栈示意图](/generated-notebooks/queue-csc148-02-functions-design-recipe/csc148-02-call-stack.png)

执行到 \`message = s * n\` 后，\`message\` 也是 \`mess_about\` frame 里的 local variable。函数 return 或走到函数末尾时，这个 frame 会被删除，\`n\`、\`s\`、\`message\` 都消失。

所以如果函数调用结束后写：

~~~python
print(n)
~~~

会得到 \`NameError\`，因为 \`n\` 从来不是 main frame 里的变量。
        `,
      },
      {
        title: 'Call Stack 例题：return、局部变量和 alias',
        summary: '用三个小例子训练学生判断函数调用结束后外部变量是否改变。',
        markdown: m`
### 例 1：重新赋值局部变量，不影响外部变量

~~~python
def emphasized(s: str) -> str:
    s = s + s + '!'
    return s


word = 'moo'
result = emphasized(word)
~~~

追踪：

- 调用时创建 \`emphasized\` frame。
- parameter \`s\` 和 main frame 里的 \`word\` 一开始都引用 \`'moo'\`。
- \`s = s + s + '!'\` 创建新字符串 \`'moomoo!'\`，然后让局部变量 \`s\` 指向它。
- \`word\` 仍然指向 \`'moo'\`。
- return value 是 \`'moomoo!'\`，被 main frame 里的 \`result\` 接住。

结论：\`word == 'moo'\`，\`result == 'moomoo!'\`。

### 例 2：对 list 重新赋值，不等于修改 list

~~~python
def add_words(lst: list[str]) -> None:
    lst = lst + ['believe', 'me!']


sentence = ['winter', 'is', 'coming']
add_words(sentence)
~~~

\`lst = lst + [...]\` 创建新 list，只让局部变量 \`lst\` 改指向新对象。调用结束后这个局部变量消失，外部的 \`sentence\` 没变。

结论：\`sentence == ['winter', 'is', 'coming']\`。

### 例 3：调用 list method，真的修改对象

~~~python
def add_words(lst: list[str]) -> None:
    lst.extend(['believe', 'me!'])


sentence = ['winter', 'is', 'coming']
add_words(sentence)
~~~

\`extend\` 修改的是 \`lst\` 和 \`sentence\` 共同引用的那个 list 对象。frame 消失后，对象仍然存在，修改也仍然存在。

结论：\`sentence == ['winter', 'is', 'coming', 'believe', 'me!']\`。

判断这类题时，不要问“函数里变量名叫什么”，要问“这个语句是让局部变量改指向，还是修改了某个可变对象本身？”
        `,
      },
      {
        title: '练习与自测',
        summary:
          '给学生可立即检查的练习，覆盖 design recipe、annotation、precondition、call stack。',
        markdown: m`
### 练习 1：补全设计配方

写一个函数 \`first_long_word(words: list[str], min_length: int) -> str\`，返回第一个长度大于 \`min_length\` 的字符串。

要求：

- 先写两个 doctest examples。
- 写清楚 type annotations。
- 如果你打算假设一定存在这样的字符串，把它写成 precondition。

### 练习 2：写 type contract

给下面这些规格写函数 header：

1. 输入一个 \`dict[str, list[int]]\`，返回所有整数的总和。
2. 输入一个 \`list[tuple[str, int]]\`，返回分数最高的名字。
3. 输入两个整数和一个比较函数，比较函数接收两个 \`int\` 并返回 \`bool\`。
4. 输入一个 \`list[int]\`，返回第一个偶数；如果没有偶数，返回 \`None\`。

参考答案：

~~~python
def total_values(data: dict[str, list[int]]) -> int:
    ...


def best_name(scores: list[tuple[str, int]]) -> str:
    ...


from typing import Callable


def choose(num1: int, num2: int,
           comp: Callable[[int, int], bool]) -> int:
    ...


def first_even(numbers: list[int]) -> int | None:
    ...
~~~

### 练习 3：画 call stack

追踪下面代码执行到 \`return total\` 之前时的 call stack：

~~~python
def total_after_tax(price: float, tax_rate: float) -> float:
    tax = price * tax_rate
    total = price + tax
    return total


subtotal = 20.0
final = total_after_tax(subtotal, 0.13)
~~~

你应该画出两个 frame：

- main frame：\`subtotal\` 保存 \`id20\`
- \`total_after_tax\` frame：\`price\` 保存 \`id20\`，\`tax_rate\` 保存 \`id013\`，\`tax\` 保存 \`id26\`，\`total\` 保存 \`id226\`

对象区可以写：

- \`id20\`：\`type=float\`，\`value=20.0\`
- \`id013\`：\`type=float\`，\`value=0.13\`
- \`id26\`：\`type=float\`，\`value=2.6\`
- \`id226\`：\`type=float\`，\`value=22.6\`

调用结束后，函数 frame 消失，main frame 新增 \`final\`，它保存返回值对象的 id：\`id226\`。

### 自测清单

- 我能按五步 design recipe 写函数，而不是先写函数体。
- 我能解释 type annotation 是一种 contract，不是 Python 变量的永久类型。
- 我能写 \`tuple[list[int], list[int]]\`、\`int | None\`、\`Callable[[int, int], bool]\` 这类 contract。
- 我能区分 type contract 和 precondition。
- 我能解释 \`@check_contracts\` 检查 argument、precondition 和 return type。
- 我能画出函数调用时 frame 被 push，return 后 frame 被 pop。
        `,
      },
    ],
    summary: '把函数看成有契约的计算单元，而不是一段临时拼起来的代码。',
    goals: [
      '区分 parameter、argument、return value 和 side effect。',
      '会写 docstring、type annotation 和 precondition。',
      '能用 design recipe 把问题拆成签名、例子、主体和测试。',
    ],
    coreSummary: '函数是带名字的计算过程，契约决定调用者和实现者各自负责什么。',
    coreIntro:
      'CSC148 里的函数不是“能跑就行”。一个函数应该让调用者知道它要什么、保证什么、什么时候不负责。',
    vocabulary: [
      ['parameter', '函数定义里的名字，例如 `def f(x):` 里的 `x`。'],
      ['argument', '函数调用时传入的对象，例如 `f(10)` 里的 `10`。'],
      ['return', '函数把一个对象交回给调用者；没有显式 return 时结果是 `None`。'],
      ['precondition', '调用者必须保证的条件；函数体可以在这个前提下工作。'],
      ['side effect', '函数除了返回值之外，还修改了外部可见状态。'],
    ],
    coreQuestions: [
      '函数调用前，每个 argument 指向哪个对象？',
      '函数内部的 parameter 是否只是新的局部变量名？',
      '函数有没有修改可变对象，还是只返回了新对象？',
      'precondition 没满足时，错在调用者还是函数实现？',
    ],
    tracingRecipe: [
      '先计算所有 argument 表达式。',
      '创建函数调用的局部 frame，把 parameter 绑定到 argument 的对象引用。',
      '逐行执行函数体，记录 return 或 side effect。',
      '调用结束后，局部变量消失，但被修改的可变对象仍然保留修改。',
    ],
    goodTrace: [
      '能标出哪些变量是局部的，哪些对象来自调用者。',
      '能说明 return value 是新对象、旧对象，还是 `None`。',
      '能判断调用结束后外部变量看到什么变化。',
    ],
    examples: [
      {
        title: '返回新列表，不改旧列表',
        prompt: '判断 `nums` 在调用后是否改变。',
        code: `
def add_one_all(nums: list[int]) -> list[int]:
    return [n + 1 for n in nums]

nums = [10, 20]
result = add_one_all(nums)
        `,
        trace: [
          '`nums` 和 parameter `nums` 在函数内部一开始指向同一个列表对象。',
          '列表推导式创建了一个新列表 `[11, 21]`。',
          '原来的列表 `[10, 20]` 没有被改。',
        ],
        answer: '`nums == [10, 20]`，`result == [11, 21]`。',
      },
      {
        title: '修改参数指向的可变对象',
        prompt: '判断函数有没有 side effect。',
        code: `
def drop_first(items: list[str]) -> None:
    items.pop(0)

names = ['Ada', 'Grace', 'Lin']
drop_first(names)
        `,
        trace: [
          '`items` 是局部变量名，但它引用调用者传入的同一个 list。',
          '`pop(0)` 修改这个 list 对象本身。',
          '函数返回 `None`，但外部的 `names` 会看到修改。',
        ],
        answer: "`names == ['Grace', 'Lin']`。",
      },
      {
        title: 'precondition 不是自动检查',
        prompt: '这个函数什么时候是调用者的责任？',
        code: `
def first_longer(words: list[str], length: int) -> str:
    \"\"\"Precondition: there is a word longer than length.\"\"\"
    for word in words:
        if len(word) > length:
            return word
        `,
        trace: [
          'docstring 写了 precondition，表示调用者必须提供至少一个符合条件的词。',
          '如果没有这样的词，函数会隐式返回 `None`，这违反了返回类型。',
          '要么调用者保证条件，要么函数需要改成显式处理失败情况。',
        ],
        answer: '在 CSC148 中，写清楚 precondition 后，调用者不能随便传坏输入。',
      },
    ],
    pitfalls: [
      {
        title: '把 parameter 当成外部变量本身',
        why: 'parameter 是局部名字，不是外部变量名的替身。',
        fix: '看它是否修改了同一个可变对象，而不是看 parameter 名字是否相同。',
      },
      {
        title: '忘记 return',
        why: 'Python 没有显式 return 时返回 `None`。',
        fix: '每个声明返回非 `None` 的分支，都要能走到 return。',
      },
      {
        title: 'precondition 写了但不使用',
        why: 'precondition 是契约，不是装饰。',
        fix: '实现时可以依赖它，测试时也要包含违反 precondition 的讨论。',
      },
    ],
    practice: [
      {
        title: '追踪局部变量',
        prompt: '写出调用结束后 `x` 和 `y` 的值。',
        code: `
def f(x: list[int]) -> list[int]:
    x = x + [99]
    return x

x = [1, 2]
y = f(x)
        `,
        check: '`x` 没被改；`y` 指向新列表。',
      },
      {
        title: '设计一个 helper',
        prompt: '写一个 `count_positive(nums)`，要求没有 side effect，并给出两个例子。',
        code: '',
        check: '函数只读 `nums`，返回 `int`，不要修改 `nums`。',
      },
    ],
    checklist: [
      '我能解释 argument 和 parameter 的区别。',
      '我能判断一个函数是否有 side effect。',
      '我能写出有 precondition 的 docstring。',
      '我能用 design recipe 写一个小函数，而不是直接堆代码。',
    ],
  },
  {
    order: '03',
    topicKey: 'testing',
    id: 'queue-csc148-03-testing',
    name: '03 - 测试：例子、边界与性质',
    description:
      'CSC148 中文 Markdown 笔记：单元测试、边界情况、pytest、doctest 与 property-based testing 思维。',
    tags: ['CSC148', 'Python', 'testing', 'pytest'],
    imageSource: 'csc148-03-testing.png',
    imageAlt: '测试像实验台：输入样本经过测试装置，输出通过或失败的信号。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/testing/how_to_test.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/testing/choosing_tests.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/testing/code_coverage.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/testing/hypothesis.html',
    ],
    customSections: [
      {
        title: '测试不是“跑一下没报错”',
        summary: '建立测试的目标：用可重复的证据检查函数规格。',
        markdown: m`
函数设计完成后，下一步不是手动在 console 里随便试两个输入，而是写一套可以反复运行的测试。

![测试笔记示意图](/generated-notebooks/queue-csc148-03-testing/csc148-03-testing.png)

这一章先抓住一句话：

> 测试不是证明程序永远正确；测试是用有代表性的输入，尽早暴露实现和规格之间的差异。

手动复制粘贴例子有两个问题：

- 容易看错输出，尤其是 list/dict/string 很长的时候。
- 不能稳定重复运行；你改完代码后很难确认旧功能有没有被破坏。

所以 CSC148 会用三层工具：

1. \`doctest\`：把 docstring 里的小例子自动跑起来。
2. \`pytest\`：把更完整的 unit tests 放在单独测试文件里。
3. coverage / property-based testing：帮助你发现测试没覆盖到的分支或性质。

这本 notebook 的重点是第二层：怎么写真正有用的 unit tests。
        `,
      },
      {
        title: 'Doctest：docstring 里的最小例子',
        summary: '先保留少量例子用于沟通规格，但不要把所有测试塞进 docstring。',
        markdown: m`
doctest 会读取 docstring 里的 \`>>>\` 例子，并自动比较实际输出和预期输出。

例如有一个函数：

~~~python
def is_even(value: int) -> bool:
    """Return whether value is even.

    >>> is_even(2)
    True
    >>> is_even(17)
    False
    """
    return value % 2 == 0
~~~

在文件底部加入：

~~~python
if __name__ == '__main__':
    import doctest
    doctest.testmod()
~~~

运行这个文件时，Python 会自动运行 docstring 里的两个例子。

doctest 适合做两件事：

- 给读者展示“这个函数怎么用”。
- 做最基础的 sanity check。

但它不适合承担完整测试套件。原因很简单：如果把所有边界情况都写进 docstring，函数说明会变得很长，真正的规格反而不清楚。所以 docstring 里留 2-3 个核心例子，完整测试放到单独的 test file。
        `,
      },
      {
        title: 'Pytest Unit Test：一个函数一个清楚场景',
        summary: '用 pytest 写 CSC148 常见的 unit test 文件。',
        markdown: m`
本课程用 \`pytest\` 来组织 unit tests。约定很简单：

- 测试文件通常叫 \`test_xxx.py\`。
- 每个测试函数名以 \`test_\` 开头。
- 每个测试函数可以有多个 \`assert\`，但最好围绕一个清楚场景。

假设源文件 \`numbers.py\` 里有：

~~~python
def largest(numbers: list[int]) -> int:
    """Return the largest number in numbers.

    Preconditions:
      - numbers != []
    """
    biggest = numbers[0]
    for number in numbers:
        if number > biggest:
            biggest = number
    return biggest
~~~

测试文件 \`test_numbers.py\` 可以这样写：

~~~python
from numbers import largest


def test_largest_one_item() -> None:
    """Test largest on the smallest valid list."""
    actual = largest([7])
    expected = 7

    assert actual == expected


def test_largest_at_beginning() -> None:
    """Test when the largest item is first."""
    assert largest([9, 2, 3, 4]) == 9


def test_largest_at_end() -> None:
    """Test when the largest item is last."""
    assert largest([2, 3, 4, 9]) == 9


def test_largest_all_negative() -> None:
    """Test a list of negative numbers."""
    assert largest([-10, -3, -25]) == -3
~~~

注意：这些测试不是为了“数量多”，而是为了覆盖不同场景。一个好的测试名应该让你不看函数体也知道它在检查什么。
        `,
      },
      {
        title: '怎么选测试：按输入性质分类',
        summary: '把无限多输入分成有意义的类别，再为每类挑代表测试。',
        markdown: m`
测试的难点不在语法，而在选哪些输入。

核心策略是：

1. 把所有可能调用分成有意义的类别。
2. 每个类别选一个代表输入。
3. 用这些测试给出“如果每类都过，就比较可信”的论证。

对 \`largest(numbers)\`，可以这样分类：

| 输入性质 | 代表测试 | 为什么重要 |
| --- | --- | --- |
| 最小合法输入 | \`[7]\` | 检查 precondition 下的最小情况 |
| 最大值在开头 | \`[9, 2, 3]\` | 检查初始化是否正确 |
| 最大值在中间 | \`[2, 9, 3]\` | 检查循环更新 |
| 最大值在结尾 | \`[2, 3, 9]\` | 检查循环没有提前停 |
| 全是负数 | \`[-10, -3, -25]\` | 抓住错误初始化为 0 的 bug |
| 有重复最大值 | \`[5, 9, 9, 1]\` | 检查重复值不影响结果 |

对应 pytest：

~~~python
def test_largest_in_middle() -> None:
    assert largest([2, 9, 3]) == 9


def test_largest_duplicate_max() -> None:
    assert largest([5, 9, 9, 1]) == 9
~~~

你写测试时可以问这些问题：

- list 是否可能为空？如果空违反 precondition，就不要当作普通正确性测试。
- 长度 1 有没有单独测？
- 关键元素在开头、中间、结尾会不会影响算法？
- 负数、0、重复值、已排序/逆序是否相关？
- 多个参数之间的关系是否相关？例如第一个数大于第二个数，还是相反？
        `,
      },
      {
        title: '测试 Side Effect：返回值不是唯一结果',
        summary: '用会修改 list 的函数讲如何检查变异。',
        markdown: m`
有些函数的目的不是返回新值，而是修改传入的可变对象。这类函数的 unit test 不能只检查 return value。

例如：

~~~python
def insert_after(lst: list[int], n1: int, n2: int) -> None:
    """After each occurrence of n1 in lst, insert n2.

    >>> nums = [5, 1, 2, 1, 6]
    >>> insert_after(nums, 1, 99)
    >>> nums
    [5, 1, 99, 2, 1, 99, 6]
    """
~~~

测试要检查两件事：

1. 函数返回 \`None\`。
2. 原来的 list 对象内容被正确修改。

~~~python
from insert import insert_after


def test_insert_after_one_occurrence() -> None:
    nums = [5, 1, 6]
    result = insert_after(nums, 1, 99)

    assert result is None
    assert nums == [5, 1, 99, 6]


def test_insert_after_multiple_occurrences() -> None:
    nums = [1, 1, 2]
    insert_after(nums, 1, 99)

    assert nums == [1, 99, 1, 99, 2]


def test_insert_after_no_occurrences() -> None:
    nums = [5, 6, 7]
    insert_after(nums, 1, 99)

    assert nums == [5, 6, 7]
~~~

这类测试和第一本 memory model 是连着的：如果函数通过 alias 修改了 list 对象，调用者的变量也会看到变化。所以测试必须检查调用后的对象状态。
        `,
      },
      {
        title: 'Preconditions 怎么测',
        summary: '区分合法输入测试、违反 precondition 的测试，以及 check_contracts 的错误测试。',
        markdown: m`
precondition 是调用者必须满足的条件。普通 unit tests 应该测试 **满足 precondition 的输入**。

例如：

~~~python
def middle(items: list[int]) -> int:
    """Return the middle item of items.

    Preconditions:
      - len(items) % 2 == 1
      - items != []
    """
    return items[len(items) // 2]
~~~

好的普通测试：

~~~python
def test_middle_one_item() -> None:
    assert middle([8]) == 8


def test_middle_three_items() -> None:
    assert middle([10, 20, 30]) == 20


def test_middle_five_items() -> None:
    assert middle([1, 2, 3, 4, 5]) == 3
~~~

不要把 \`middle([])\` 或 \`middle([1, 2])\` 当作“函数应该返回什么”的普通测试，因为这些调用违反 precondition。

如果课程代码用了 \`@check_contracts\` 或你显式写了 \`assert\` 来检查 precondition，可以单独测试“坏输入会被拒绝”：

~~~python
import pytest


def test_middle_rejects_empty_list() -> None:
    with pytest.raises(AssertionError):
        middle([])
~~~

判断规则：

- 如果规格说输入必须满足某条件，正确性测试只覆盖满足条件的输入。
- 如果实现有 runtime checking，才用 \`pytest.raises\` 测违反条件时是否抛错。
        `,
      },
      {
        title: '标准库 unittest 长什么样',
        summary: '补充 Python unittest.TestCase 写法，帮助学生认出另一种常见单元测试格式。',
        markdown: m`
本课程主要用 \`pytest\`，但你也会在别的项目里看到 Python 标准库的 \`unittest\`。它表达的是同一件事：写 unit tests，只是语法更像一个测试类。

同样测试 \`largest\`：

~~~python
import unittest
from numbers import largest


class TestLargest(unittest.TestCase):
    def test_one_item(self) -> None:
        self.assertEqual(largest([7]), 7)

    def test_largest_at_end(self) -> None:
        self.assertEqual(largest([2, 3, 9]), 9)

    def test_all_negative(self) -> None:
        self.assertEqual(largest([-10, -3, -25]), -3)


if __name__ == '__main__':
    unittest.main()
~~~

对应关系：

| pytest | unittest |
| --- | --- |
| \`assert actual == expected\` | \`self.assertEqual(actual, expected)\` |
| \`assert result is None\` | \`self.assertIsNone(result)\` |
| \`with pytest.raises(Error)\` | \`with self.assertRaises(Error)\` |

本课程写作业时优先按课程要求使用 \`pytest\`；但理解 \`unittest\` 有助于你读别人的测试。
        `,
      },
      {
        title: 'Code Coverage：测试有没有跑到每一行',
        summary: '用 shortest_string 展示 coverage 如何发现遗漏分支。',
        markdown: m`
只按输入类别做 black-box testing 有时还不够。复杂函数里可能有某个分支从来没被测试跑到。**Code coverage** 是一种 white-box testing 工具：它关心测试运行时哪些代码行被执行过。

看这个函数：

~~~python
def shortest_string(strings: list[str]) -> str | None:
    """Return the shortest string in strings.

    If there is a tie, return the smaller string using <.
    Return None if strings is empty.
    """
    if strings == []:
        return None

    shortest = strings[0]
    for string in strings:
        if len(string) < len(shortest):
            shortest = string
        elif len(string) == len(shortest) and string < shortest:
            shortest = string

    return shortest
~~~

这些测试看起来不错：

~~~python
def test_shortest_empty() -> None:
    assert shortest_string([]) is None


def test_shortest_no_ties() -> None:
    assert shortest_string(['cat', 'a', 'computer']) == 'a'


def test_shortest_tie() -> None:
    assert shortest_string(['cat', 'a', 'b']) == 'a'
~~~

但第三个测试并没有执行 \`elif\` 里的赋值，因为 \`'b' < 'a'\` 是 False。要覆盖这个分支，需要让更小的同长度字符串出现在后面：

~~~python
def test_shortest_tie_smaller_string_second() -> None:
    assert shortest_string(['cat', 'b', 'a']) == 'a'
~~~

重点：100% coverage 不等于程序一定正确，但 coverage 能提醒你“有代码从来没被测到”。
        `,
      },
      {
        title: 'Property-Based Testing：从单个例子到性质',
        summary: '简要引入 Hypothesis，用性质检查大量生成输入。',
        markdown: m`
普通 unit test 是具体输入输出对：

~~~python
def test_insert_after_example() -> None:
    nums = [5, 1, 2, 1, 6]
    insert_after(nums, 1, 99)
    assert nums == [5, 1, 99, 2, 1, 99, 6]
~~~

property-based testing 换一个角度：找出对很多输入都应该成立的性质。可以用 \`insert_after\` 这个函数举例：

- \`insert_after\` 总是返回 \`None\`。
- list 长度增加的数量，等于原 list 中 \`n1\` 出现的次数。

用 Hypothesis 可以这样写：

~~~python
from hypothesis import given
from hypothesis.strategies import integers, lists

from insert import insert_after


@given(lists(integers()), integers(), integers())
def test_insert_after_returns_none(lst: list[int], n1: int, n2: int) -> None:
    assert insert_after(lst, n1, n2) is None


@given(lists(integers()), integers(), integers())
def test_insert_after_length_change(lst: list[int], n1: int, n2: int) -> None:
    original_length = len(lst)
    n1_count = lst.count(n1)

    insert_after(lst, n1, n2)

    assert len(lst) - original_length == n1_count
~~~

property test 不取代 unit tests。它适合补充：用少量代码跑很多输入，检查函数必须满足的整体性质。
        `,
      },
      {
        title: '常见错误与自测清单',
        summary: '收束测试章节，给出测试写作检查标准。',
        markdown: m`
### 常见错误

1. **只测 happy path**
   - 错误：只测 \`largest([3, 6, 4])\`。
   - 修正：加入长度 1、负数、重复最大值、最大值在不同位置。

2. **测试里复制实现逻辑**
   - 错误：为了算 expected，在测试里又写一遍复杂算法。
   - 修正：小输入手算 expected，或检查独立性质。

3. **忘记测试 side effect**
   - 错误：只写 \`assert insert_after(nums, 1, 99) is None\`。
   - 修正：还要 \`assert nums == expected\`。

4. **把违反 precondition 的输入当普通测试**
   - 错误：规格说 \`items != []\`，却要求函数必须处理空 list。
   - 修正：普通 correctness tests 只测满足 precondition 的输入；runtime check 另测。

### 自测清单

- 我能解释 doctest 和 pytest unit test 各自适合放什么。
- 我能为一个函数按输入性质列出测试类别。
- 我能写至少 4 个 pytest 测试函数，每个名字说明场景。
- 我能测试返回值，也能测试 list/dict 的变异。
- 我能判断违反 precondition 的输入是否应该进入普通测试。
- 我能用 coverage 思维发现没有跑到的分支。
- 我能写出一个简单 property-based testing 的性质。
        `,
      },
    ],
    summary: '把测试当成对规格的检验，而不是运行几次代码看看没报错。',
    goals: [
      '会从 docstring 和 precondition 推出测试案例。',
      '会区分 normal case、edge case 和 invalid case。',
      '能写出能抓 bug 的 pytest 测试。',
    ],
    coreSummary: '测试的目标不是证明程序正确，而是用有代表性的案例暴露错误。',
    coreIntro: '好测试来自规格。你先读函数应该做什么，再挑输入覆盖重要分支和边界。',
    vocabulary: [
      ['unit test', '针对一个函数或方法的小测试。'],
      ['edge case', '空结构、单元素、重复值、边界数值等容易出错的输入。'],
      ['fixture', '测试前准备的对象或数据。'],
      ['regression test', '针对已经发现的 bug 写的测试，防止以后改回去。'],
      ['property', '很多输入都应该满足的性质，例如排序后长度不变。'],
    ],
    coreQuestions: [
      '函数的输入空间有哪些类别？',
      '每个分支至少有没有一个测试？',
      '边界情况是否覆盖空、单元素、重复、极端数值？',
      '测试是在检查返回值，还是也要检查 side effect？',
    ],
    tracingRecipe: [
      '先写出函数规格：输入、输出、precondition、side effect。',
      '按类别列测试，而不是随便挑几个数字。',
      '每个测试只检查一个清晰事实。',
      '先让测试失败一次，再修实现，确认测试真的能抓 bug。',
    ],
    goodTrace: [
      '测试名称能说明场景。',
      'assert 的期望值来自手算，不来自被测函数。',
      '对 mutable 输入，测试调用前后对象状态。',
    ],
    examples: [
      {
        title: '测试返回值',
        prompt: '为 `middle` 写三个测试类别。',
        code: `
def middle(items: list[int]) -> int:
    \"\"\"Return the middle item. Precondition: len(items) is odd.\"\"\"
    return items[len(items) // 2]
        `,
        trace: [
          'normal case: 长度 3 或 5。',
          'edge case: 长度 1。',
          'invalid case: 长度偶数违反 precondition，不作为正常测试。',
        ],
        answer: '`[9] -> 9` 是必须有的边界测试。',
      },
      {
        title: '测试 side effect',
        prompt: '测试 `clear_small` 时不能只看 return。',
        code: `
def clear_small(nums: list[int], limit: int) -> None:
    nums[:] = [n for n in nums if n >= limit]
        `,
        trace: [
          '返回值应该是 `None`。',
          '真正要检查的是原 list 对象内容被改。',
          '还要测全部保留、全部删除、空列表。',
        ],
        answer: '测试应 assert `nums == expected`，而不是只 assert 函数返回。',
      },
      {
        title: '性质测试的想法',
        prompt: '排序函数可以检查哪些性质？',
        code: `
def sorted_copy(nums: list[int]) -> list[int]:
    ...
        `,
        trace: [
          '结果长度和输入长度相同。',
          '结果元素多重集合和输入相同。',
          '结果相邻元素满足非降序。',
          '如果规格说不修改输入，还要检查输入不变。',
        ],
        answer: '性质测试比只测一个 `[3, 1, 2]` 更有力量。',
      },
    ],
    pitfalls: [
      {
        title: '测试复制实现逻辑',
        why: '如果测试里也写同样的错误算法，测试不会发现 bug。',
        fix: '期望结果用手算、小样本或独立性质得到。',
      },
      {
        title: '只测 happy path',
        why: '大部分 bug 出现在空、单元素、重复和边界。',
        fix: '每个函数至少先问空结构和最小合法输入。',
      },
      {
        title: '忽略 mutable 输入',
        why: '函数可能返回正确，但偷偷改了输入。',
        fix: '对 list/dict/对象参数，调用前后都检查。',
      },
    ],
    practice: [
      {
        title: '给函数列测试类别',
        prompt: '为 `all_same(items)` 列 5 个测试输入。',
        code: '',
        check: '至少包含空、单元素、全相同、前两个不同、最后一个不同。',
      },
      {
        title: '写一个 regression test',
        prompt: '假设 `remove_first` 在找不到元素时错误地删除最后一个元素，写一个测试抓住它。',
        code: '',
        check: '输入中不含目标元素时，列表应该保持不变。',
      },
    ],
    checklist: [
      '我能从规格推出测试类别。',
      '我能区分正常输入和违反 precondition 的输入。',
      '我能测试 side effect。',
      '我能写出至少一个性质测试思路。',
    ],
  },
  {
    order: '04',
    topicKey: 'oop-basics',
    id: 'queue-csc148-04-oop-basics',
    name: '04 - 面向对象：类、实例与表示不变量',
    description:
      'CSC148 中文 Markdown 笔记：class、instance、attribute、method、constructor、representation invariant。',
    tags: ['CSC148', 'OOP', 'class', 'object'],
    imageSource: 'csc148-04-oop-basics.png',
    imageAlt: '类像蓝图，实例像根据蓝图做出的对象卡片。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/object-oriented-programming/oop_intro.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/object-oriented-programming/representation_invariants.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/object-oriented-programming/class_design_recipe.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/object-oriented-programming/class_design.html',
    ],
    customSections: [
      {
        title: '为什么要有 class',
        summary: '从一组总是一起出现的数据开始，理解 class 是为了组织状态和行为。',
        markdown: m`
面向对象不是“把代码写得高级一点”，而是解决一个很朴素的问题：有些数据总是一起出现，而且围绕这些数据有一组固定操作。

假设我们要表示一条 tweet。最直接的做法可能是 list：

~~~python
tweet = ['david', 'Hello CSC148!', 0]
~~~

这能跑，但问题马上出现：

- \`tweet[0]\` 到底是 user id 还是内容？
- \`tweet[2]\` 能不能是负数？
- 谁负责保证内容不超过长度限制？
- 如果以后还要记录发布时间，所有使用 \`tweet[1]\`、\`tweet[2]\` 的代码会不会一起坏掉？

用 dict 稍微好一点：

~~~python
tweet = {
    'userid': 'david',
    'content': 'Hello CSC148!',
    'likes': 0,
}
~~~

但 dict 仍然只是“散装数据”。任何地方都可以随便写：

~~~python
tweet['likes'] = -100
tweet['content'] = ''
~~~

class 的作用，就是把这些散装数据变成一个有边界的对象：对象保存自己的状态，也提供修改状态的方法。更重要的是，一个设计良好的 class 会说明：什么状态是合法的，什么状态不应该出现。

![类、实例与对象状态示意图](/generated-notebooks/queue-csc148-04-oop-basics/csc148-04-oop-basics.png)

这一章的主线是 **Representation Invariant**，简称 RI。你可以先把它理解成一句话：

> RI 是一个对象内部状态必须一直满足的规则。

没有 RI，class 只是把变量包起来；有了 RI，class 才开始像一个真正的抽象。
        `,
      },
      {
        title: 'Class 和 Instance',
        summary: 'class 是类型定义，instance 是运行时真实存在的对象。',
        markdown: m`
class 和 instance 的区别必须先分清。

- **class**：定义一种对象应该有哪些 attributes、能调用哪些 methods。
- **instance**：根据 class 创建出来的具体对象，运行时真实存在。

例如：

~~~python
class Tweet:
    """A tweet by one user."""


t1 = Tweet()
t2 = Tweet()
~~~

\`Tweet\` 是 class；\`t1\` 和 \`t2\` 是两个不同的 instance。

这件事和 Python 记忆模型完全一致：

- 变量 \`t1\` 保存一个对象 id。
- 变量 \`t2\` 保存另一个对象 id。
- 两个对象都属于 \`Tweet\` 这个 class。
- 但两个对象内部保存的 attribute values 可以不同。

所以不要说“class 里存了这条 tweet 的内容”。更准确的说法是：

> class 定义每个 Tweet 对象应该怎样被创建和使用；每个 instance 才保存自己的具体内容。

这也是后面 RI 的基础。RI 不是约束 class 这个蓝图，而是约束每一个 instance 的内部状态。
        `,
      },
      {
        title: '`__init__`、`self` 和对象创建',
        summary: '用对象创建过程解释 self：self 是当前正在初始化或调用方法的那个对象。',
        markdown: m`
创建对象时，Python 会做两件关键的事：

1. 先创建一个新的 instance 对象。
2. 调用 \`__init__\`，并把这个新对象作为 \`self\` 传进去。

看一个完整版本：

~~~python
class Tweet:
    """A tweet by one user."""

    userid: str
    content: str
    likes: int

    def __init__(self, userid: str, content: str) -> None:
        """Initialize this tweet."""
        self.userid = userid
        self.content = content
        self.likes = 0


t1 = Tweet('david', 'Hello CSC148!')
~~~

执行 \`Tweet('david', 'Hello CSC148!')\` 时，可以按这个顺序追踪：

1. Python 创建一个新的 \`Tweet\` object，假设它的 id 是 \`idA\`。
2. Python 调用 \`Tweet.__init__(idA, 'david', 'Hello CSC148!')\`。
3. 在 \`__init__\` 的 stack frame 里，\`self\` 指向 \`idA\`。
4. \`self.userid = 'david'\` 给 \`idA\` 这个对象加上 \`userid\`。
5. \`self.content = 'Hello CSC148!'\` 给同一个对象加上 \`content\`。
6. \`self.likes = 0\` 给同一个对象加上 \`likes\`。
7. \`__init__\` 结束后，变量 \`t1\` 指向 \`idA\`。

这里最重要的一句是：

> \`self\` 不是特殊对象；它只是当前方法调用中，指向“这个对象”的参数名。

所以 \`self.content\` 的意思不是“class 里的 content”，而是“当前这个 instance 的 content attribute”。
        `,
      },
      {
        title: 'Instance Attributes：对象的内部表示',
        summary: 'attributes 不是随便塞进去的变量，而是一个对象的 representation。',
        markdown: m`
一个对象内部用哪些 attributes 保存状态，叫做它的 **representation**。例如 \`Tweet\` 可以用三个 attributes 表示：

~~~python
class Tweet:
    """A tweet by one user.

    Instance Attributes:
      - userid: the id of the user who wrote this tweet
      - content: the text of this tweet
      - likes: the number of likes this tweet has received
    """

    userid: str
    content: str
    likes: int
~~~

这段文档不是装饰。它告诉你每个 \`Tweet\` instance 内部应该有哪些状态，以及这些状态分别代表什么。

但是只列 attributes 还不够。比如：

~~~python
t = Tweet('david', 'Hello!')
t.likes = -3
~~~

\`likes\` 仍然是 \`int\`，但这个对象已经不合理了。再比如：

~~~python
t.content = 'x' * 10000
~~~

\`content\` 仍然是 \`str\`，但如果我们规定 tweet 内容最多 280 个字符，这个对象也不合理。

因此，一个 class 的设计不能只写“有哪些 attributes”。它还必须写清楚：

> 这些 attributes 满足什么条件时，这个对象才算处于合法状态？

这个问题就是 RI 要回答的问题。
        `,
      },
      {
        title: 'Representation Invariant：对象合法状态的定义',
        summary: 'RI 是所有 instance attributes 必须一直满足的条件。',
        markdown: m`
**Representation Invariant** 是写在 class docstring 里的规则，用来描述每个 instance 的 attributes 必须满足什么条件。

对 \`Tweet\`，我们可以这样写：

~~~python
class Tweet:
    """A tweet by one user.

    Instance Attributes:
      - userid: the id of the user who wrote this tweet
      - content: the text of this tweet
      - likes: the number of likes this tweet has received

    Representation Invariants:
      - self.userid != ''
      - 0 < len(self.content) <= 280
      - self.likes >= 0
    """

    userid: str
    content: str
    likes: int
~~~

这三条 RI 分别排除了三种坏状态：

| RI | 排除的坏状态 |
| --- | --- |
| \`self.userid != ''\` | 不知道是谁发的 tweet |
| \`0 < len(self.content) <= 280\` | 内容为空或太长 |
| \`self.likes >= 0\` | 点赞数为负数 |

RI 的重点不是为了让 docstring 好看，而是为了让后面的代码可以放心推理。

例如，如果我们知道 \`self.likes >= 0\` 一直成立，那么写 \`unlike\` 时就不会允许它把 likes 减到负数。如果我们知道 \`self.content\` 永远非空，那么展示 tweet 时就不用处理空内容的特殊情况。

可以把 RI 当成 class 的“内部法律”：

- 对外：告诉 client code 不要把对象弄坏。
- 对内：提醒 class 的每个 method 修改状态后必须恢复合法状态。
- 对测试：告诉我们哪些状态必须被覆盖。
        `,
      },
      {
        title: 'RI 和 Type Annotation 的关系',
        summary: 'type annotation 是 RI 的一部分，但 RI 还要表达更具体的语义约束。',
        markdown: m`
type annotation 和 RI 很容易混在一起。它们都在描述对象状态，但层次不同。

看这三个 attribute annotations：

~~~python
userid: str
content: str
likes: int
~~~

它们表达的是类型约束：

- \`userid\` 必须是 \`str\`。
- \`content\` 必须是 \`str\`。
- \`likes\` 必须是 \`int\`。

但它们没有表达这些约束：

- \`userid\` 不能是空字符串。
- \`content\` 不能为空，也不能超过 280 个字符。
- \`likes\` 不能是负数。

所以 RI 需要补上 type annotation 表达不了的规则：

~~~python
Representation Invariants:
  - self.userid != ''
  - 0 < len(self.content) <= 280
  - self.likes >= 0
~~~

更一般地说：

| 约束 | 例子 | 解决什么问题 |
| --- | --- | --- |
| Type annotation | \`likes: int\` | 这个 attribute 是什么类型 |
| RI | \`self.likes >= 0\` | 这个 attribute 的合法取值范围 |
| RI | \`self.start <= self.end\` | 多个 attributes 之间的关系 |

第三种尤其重要。很多 RI 不是约束单个 attribute，而是约束 attributes 之间必须保持一致。

例如：

~~~python
class TimeInterval:
    """A time interval.

    Instance Attributes:
      - start: the starting time
      - end: the ending time

    Representation Invariants:
      - self.start <= self.end
    """

    start: int
    end: int
~~~

\`start: int\` 和 \`end: int\` 都成立时，仍然可能出现 \`start > end\` 的坏对象。RI 负责把这种语义错误排除掉。
        `,
      },
      {
        title: '谁负责维护 RI',
        summary: '__init__ 和每个修改状态的方法，都必须让对象保持合法。',
        markdown: m`
RI 一旦写下，就不是“建议”，而是 class 必须维护的承诺。

有两个地方最关键：

1. \`__init__\` 结束时，新对象必须满足 RI。
2. 每个会修改 attributes 的 public method 结束时，对象必须重新满足 RI。

先看 \`__init__\`：

~~~python
class Tweet:
    """A tweet by one user.

    Representation Invariants:
      - self.userid != ''
      - 0 < len(self.content) <= 280
      - self.likes >= 0
    """

    userid: str
    content: str
    likes: int

    def __init__(self, userid: str, content: str) -> None:
        """Initialize this tweet.

        Preconditions:
          - userid != ''
          - 0 < len(content) <= 280
        """
        self.userid = userid
        self.content = content
        self.likes = 0
~~~

这里 \`__init__\` 依赖 preconditions 来保证前两条 RI；它自己把 \`likes\` 设成 \`0\`，保证第三条 RI。

再看一个 mutating method：

~~~python
def like(self, n: int) -> None:
    """Add n likes to this tweet.

    Preconditions:
      - n >= 0
    """
    self.likes += n
~~~

如果调用前 \`self.likes >= 0\`，并且 \`n >= 0\`，那么执行后 \`self.likes >= 0\` 仍然成立。这个 method 维护了 RI。

但是下面这个 method 就有问题：

~~~python
def unlike(self, n: int) -> None:
    """Remove n likes from this tweet.

    Preconditions:
      - n >= 0
    """
    self.likes -= n
~~~

如果原来 \`self.likes == 3\`，调用 \`unlike(10)\` 后会变成 \`-7\`，RI 被破坏。

一种修法是拒绝会破坏 RI 的调用：

~~~python
def unlike(self, n: int) -> bool:
    """Remove n likes from this tweet and return whether it succeeded.

    Preconditions:
      - n >= 0
    """
    if n > self.likes:
        return False

    self.likes -= n
    return True
~~~

判断一个 mutating method 是否正确，不只是看它有没有完成操作，还要看它结束时对象是否仍然合法。
        `,
      },
      {
        title: '违反 RI 会发生什么',
        summary: '对象一旦进入坏状态，后续方法的含义会一起变得不可靠。',
        markdown: m`
RI 最容易被低估，因为坏状态有时不会立刻报错。

看这个对象：

~~~python
t = Tweet('david', 'Hello!')
t.likes = -100
~~~

Python 不会自动阻止这行赋值。可是从这个时刻开始，\`t\` 已经不是一个合法的 \`Tweet\` 对象了。

问题不只在这一行。坏状态会污染后面的所有推理：

~~~python
t.like(5)
print(t.likes)   # -95
~~~

\`like\` 方法本来是增加点赞数，但对象已经处在坏状态里，所以调用后仍然荒谬。

再看内容长度：

~~~python
t.content = ''
~~~

如果 display method 默认认为 \`content\` 非空，就可能写出这样的代码：

~~~python
def first_character(self) -> str:
    """Return the first character of this tweet."""
    return self.content[0]
~~~

这个方法只有在 RI 保持成立时才安全。如果外部代码直接把 \`content\` 改成空字符串，method 本身看起来没错，但调用时会崩。

所以 RI 的意义是把 class 的推理边界固定下来：

- class 内部的方法可以假设 RI 在方法开始时成立。
- 方法自己必须保证 RI 在方法结束时成立。
- client code 不应该绕过 public interface 去制造坏状态。

对象不是一堆可以随便改的字段。对象是一组被 RI 管住的状态。
        `,
      },
      {
        title: 'Public Interface 和 Private Representation',
        summary: '使用者应该依赖 public methods，而不是依赖对象内部怎么存。',
        markdown: m`
如果 client code 可以随便改 attributes，RI 很容易被破坏。所以 class 设计里要区分两件事：

- **public interface**：外部使用者应该怎么使用这个对象。
- **private representation**：对象内部具体怎么保存状态。

Python 没有强制 private，但约定用 leading underscore 表示“这是内部实现，不要直接依赖”：

~~~python
class Tweet:
    """A tweet by one user.

    Instance Attributes:
      - userid: the id of the user who wrote this tweet

    Private Instance Attributes:
      - _content: the text of this tweet
      - _likes: the number of likes this tweet has received

    Representation Invariants:
      - self.userid != ''
      - 0 < len(self._content) <= 280
      - self._likes >= 0
    """

    userid: str
    _content: str
    _likes: int
~~~

这不是说外部代码技术上完全访问不了 \`_likes\`。Python 仍然允许：

~~~python
t._likes = -100
~~~

但是这行代码违反了 class 的使用约定。正确做法是通过 public methods：

~~~python
t.like(3)
t.unlike(1)
~~~

为什么要这样麻烦？因为 public interface 可以保护 RI。比如 \`unlike\` 可以拒绝让 likes 变成负数。

还有一个更深的好处：内部表示可以改变，而外部用法不必改变。

例如第一版用 \`_likes: int\`：

~~~python
_likes: int
~~~

以后我们想记录每个点赞用户，可以改成：

~~~python
_liked_by: set[str]
~~~

只要 \`like\`、\`unlike\`、\`num_likes\` 这些 public methods 的行为不变，client code 就不用知道内部发生了什么变化。

这就是 information hiding：不是为了藏代码，而是为了让抽象稳定。
        `,
      },
      {
        title: 'Class Design Recipe：围绕 RI 设计类',
        summary: '先定义合法对象和 public interface，再写具体 method bodies。',
        markdown: m`
写 class 时，不要先冲进 \`__init__\`。更稳的顺序是：

1. 写一句话说明这个 class 表示什么。
2. 写出 client code 会怎样创建和使用对象。
3. 决定 public attributes 和 public methods。
4. 决定 private attributes。
5. 写出 Representation Invariants。
6. 实现 \`__init__\`，保证新对象满足 RI。
7. 实现 public methods，保证每个 method 结束后 RI 仍然成立。

以 \`Tweet\` 为例，先写目标：

~~~python
class Tweet:
    """A tweet by one user."""
~~~

再写想要的使用方式：

~~~python
t = Tweet('david', 'Hello CSC148!')
t.like(3)
print(t.num_likes())
~~~

这会逼你先设计 public interface：

- \`__init__(userid, content)\`
- \`like(n)\`
- \`unlike(n)\`
- \`num_likes()\`
- \`content()\` 或 \`edit_content(new_content)\`

然后才决定内部表示：

~~~python
userid: str
_content: str
_likes: int
~~~

最后写 RI：

~~~python
Representation Invariants:
  - self.userid != ''
  - 0 < len(self._content) <= 280
  - self._likes >= 0
~~~

这个顺序的好处是：你不是在“给代码补文档”，而是在实现之前先定义什么叫合法对象。

当 class 越来越复杂时，RI 会变得更重要。因为你不可能靠脑子记住所有 attribute 之间的关系；你需要把这些关系写成 class 的设计承诺。
        `,
      },
      {
        title: 'Composition：对象里包含对象',
        summary: '当一个对象保存另一个对象或一组对象时，RI 可以约束对象之间的关系。',
        markdown: m`
class 不只保存 \`int\`、\`str\`、\`list\`。一个对象也可以保存另一个对象。

例如：

~~~python
class User:
    """A user account.

    Instance Attributes:
      - userid: this user's id
      - tweets: tweets written by this user

    Representation Invariants:
      - self.userid != ''
      - all(tweet.userid == self.userid for tweet in self.tweets)
    """

    userid: str
    tweets: list[Tweet]
~~~

这里 \`User\` 和 \`Tweet\` 之间是 composition：\`User\` 对象里有一个 attribute 指向一组 \`Tweet\` 对象。

注意 RI 变复杂了。它不只是说 \`tweets\` 是 \`list[Tweet]\`，还说：

> 这个 user 的 tweets 里，每条 tweet 的 userid 都必须和这个 user 的 userid 一致。

这就是对象设计中很常见的关系型 RI。再看几个例子：

| class | attribute | 可能的 RI |
| --- | --- | --- |
| \`Playlist\` | \`songs: list[Song]\` | \`len(self.songs) == len(set(self.songs))\` |
| \`Course\` | \`students: dict[str, Student]\` | 所有 key 都等于对应 student 的 id |
| \`ShoppingCart\` | \`items: list[CartItem]\` | 每个 item 的 quantity 都大于 0 |

后面学 ADT、linked list、tree 时，你会不断看到这种模式：对象内部有对象，对象之间有关系，而 RI 负责把这些关系写清楚。

所以这一章最后要留下的不是“class 语法”，而是这个设计习惯：

> 先定义对象的合法状态，再实现改变状态的方法。
        `,
      },
    ],
    summary: '建立 class 和 instance 的区别，并学会用 representation invariant 管住对象状态。',
    goals: [
      '区分 class、instance、attribute 和 method。',
      '会追踪 `self` 指向哪个对象。',
      '理解 representation invariant 是对象内部状态的承诺。',
    ],
    coreSummary: '类定义对象能保存什么、能做什么；实例是运行时真实存在的对象。',
    coreIntro: 'OOP 的核心不是“把函数塞进类里”，而是把数据和操作绑定到一个稳定的抽象上。',
    vocabulary: [
      ['class', '对象的蓝图，定义初始化方式和方法。'],
      ['instance', '根据 class 创建出的具体对象。'],
      ['attribute', '对象内部保存的状态，例如 `self.name`。'],
      ['method', '定义在 class 里的函数，第一个参数通常是 `self`。'],
      ['representation invariant', '对象属性必须一直满足的条件。'],
    ],
    coreQuestions: [
      '`self` 现在指向哪个 instance？',
      '这个方法是在读属性，还是在修改属性？',
      '外部用户应该知道哪些 public method，不应该依赖哪些 private attribute？',
      '每个 public method 执行后，RI 是否仍然成立？',
    ],
    tracingRecipe: [
      '创建对象时，先建立一个 instance 对象。',
      '执行 `__init__`，把 `self` 绑定到这个新对象。',
      '方法调用 `obj.method(arg)` 等价于把 `obj` 作为 `self` 传入。',
      '每次改 attribute 后，检查 RI。',
    ],
    goodTrace: [
      '能画出对象和属性引用。',
      '能说明两个 instance 的属性是否共享对象。',
      '能指出哪些方法会改变对象状态。',
    ],
    examples: [
      {
        title: '追踪 `self`',
        prompt: '判断 `counter.value` 最后是多少。',
        code: `
class Counter:
    def __init__(self) -> None:
        self.value = 0

    def bump(self) -> None:
        self.value += 1

counter = Counter()
counter.bump()
counter.bump()
        `,
        trace: [
          '`Counter()` 创建一个新 instance。',
          '`__init__` 把 `value` 设成 `0`。',
          '两次 `bump` 都把同一个对象的 `value` 增加 1。',
        ],
        answer: '`counter.value == 2`。',
      },
      {
        title: '两个对象不是一个对象',
        prompt: '判断 `a` 和 `b` 是否互相影响。',
        code: `
a = Counter()
b = Counter()
a.bump()
        `,
        trace: [
          '`a` 和 `b` 是两个不同 instance。',
          '`a.bump()` 只修改 `a` 指向的对象。',
          '`b.value` 仍然是初始化后的值。',
        ],
        answer: '`a.value == 1`，`b.value == 0`。',
      },
      {
        title: 'RI 约束内部状态',
        prompt: '一个 `BankAccount` 的 balance 应该满足什么？',
        code: `
class BankAccount:
    \"\"\"Representation Invariant: self.balance >= 0\"\"\"
        `,
        trace: [
          '每个 public method 执行前后都应该保持 `balance >= 0`。',
          '如果 `withdraw` 可能让 balance 变负，就要拒绝或抛异常。',
          '测试要覆盖刚好取完、取太多、存款后再取。',
        ],
        answer: 'RI 是类内部状态的安全线。',
      },
    ],
    pitfalls: [
      {
        title: '把 class attribute 当 instance attribute',
        why: 'class attribute 被所有实例共享，容易造成意外别名。',
        fix: '可变状态通常在 `__init__` 里写成 `self.items = []`。',
      },
      {
        title: '直接依赖 private attribute',
        why: '外部代码如果依赖 `_items`，类的表示就被锁死。',
        fix: '通过 public method 交流，保留修改内部表示的空间。',
      },
      {
        title: '方法忘记维护 RI',
        why: '对象一旦进入坏状态，后续方法都会变难推理。',
        fix: '每个修改状态的方法都在结尾检查 RI。',
      },
    ],
    practice: [
      {
        title: '设计一个类',
        prompt: '为 `Playlist` 写出 attributes、RI 和 3 个 public methods。',
        code: '',
        check: 'RI 至少说明歌曲列表里元素类型，以及当前索引是否合法。',
      },
      {
        title: '追踪两个实例',
        prompt: '写一个小例子证明两个 `Counter()` 不共享 `value`。',
        code: '',
        check: '打印两个对象的 `value`，只修改其中一个。',
      },
    ],
    checklist: [
      '我能解释 `self`。',
      '我能区分类和实例。',
      '我能写一个 RI。',
      '我能判断一个方法是否修改对象状态。',
    ],
  },
  {
    order: '05',
    topicKey: 'inheritance-polymorphism',
    id: 'queue-csc148-05-inheritance-polymorphism',
    name: '05 - 继承、重写与多态',
    description:
      'CSC148 中文 Markdown 笔记：inheritance、method overriding、polymorphism、special methods 与 Liskov-style reasoning。',
    tags: ['CSC148', 'OOP', 'inheritance', 'polymorphism'],
    imageSource: 'csc148-05-inheritance.png',
    imageAlt: '继承像一张类的家谱：子类继承父类行为，也可以重写部分方法。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/inheritance/inheritance_methods.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/inheritance/inheritance_attributes.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/inheritance/inheritance_init.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/inheritance/inheritance_design.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/inheritance/python_special_methods.html',
    ],
    customSections: [
      {
        title: '继承解决什么问题',
        summary: '继承不是为了少写几行代码，而是为了表达一组类共享同一个 public interface。',
        markdown: m`
上一章我们把一个 class 看成“状态 + 行为 + RI”。这一章的问题是：如果有几种对象很像，但又不完全一样，应该怎么设计？

例如一个 payroll system 里可能有两类员工：

- \`SalariedEmployee\`：每月固定工资。
- \`HourlyEmployee\`：按小时工资和工作时长计算工资。

它们不完全一样，因为工资算法不同；但它们又确实共享很多东西：

- 每个员工都有 \`id_\` 和 \`name\`。
- 每个员工都应该能计算本月工资。
- client code 想处理“一组员工”，而不是在每个地方分别判断员工类型。

如果不用继承，你很容易写出这样的代码：

~~~python
def monthly_payroll(employees: list) -> float:
    total = 0.0
    for employee in employees:
        if employee.kind == 'salaried':
            total += employee.salary / 12
        elif employee.kind == 'hourly':
            total += employee.hourly_wage * employee.hours_per_month
    return total
~~~

这段代码的问题不是不能运行，而是扩展性很差。每加一种员工，\`monthly_payroll\` 都要改。

继承的目标是把共同的 public interface 放在 superclass 里，让每个 subclass 自己负责不同的实现：

~~~python
def monthly_payroll(employees: list[Employee]) -> float:
    total = 0.0
    for employee in employees:
        total += employee.get_monthly_payment()
    return total
~~~

这段代码只关心一件事：每个对象都支持 \`get_monthly_payment()\`。具体怎么算，由对象自己的 class 决定。

![继承与共享接口示意图](/generated-notebooks/queue-csc148-05-inheritance-polymorphism/csc148-05-inheritance.png)

所以这章的主线是：

> 继承用来定义共享接口；多态让 client code 只依赖接口，而不依赖具体 subclass。
        `,
      },
      {
        title: 'Superclass、Subclass 和 is-a 关系',
        summary: '子类不是“借用父类代码”，而是父类概念的一种具体版本。',
        markdown: m`
继承最基本的语法是：

~~~python
class Employee:
    """An employee of a company."""


class SalariedEmployee(Employee):
    """An employee with a fixed annual salary."""


class HourlyEmployee(Employee):
    """An employee paid by hourly wage."""
~~~

这里：

- \`Employee\` 是 **superclass** / **base class** / **parent class**。
- \`SalariedEmployee\` 和 \`HourlyEmployee\` 是 **subclass** / **derived class** / **child class**。
- \`SalariedEmployee(Employee)\` 表示：\`SalariedEmployee\` 是一种 \`Employee\`。

判断继承是否合适，先问一句：

> 每个 subclass object 是否都可以当作 superclass object 使用？

如果答案是 yes，继承可能合适。比如 salaried employee 确实是一种 employee。

如果答案只是“它们有重复代码”，那不一定该用继承。重复代码可以通过 helper function、composition 或重新设计接口来解决。

Python 里可以用 \`isinstance\` 看这种关系：

~~~python
fred = SalariedEmployee(99, 'Fred', 60000.0)

isinstance(fred, SalariedEmployee)  # True
isinstance(fred, Employee)          # True
~~~

第二个结果很重要：如果一个函数需要 \`Employee\`，那么 \`SalariedEmployee\` object 也可以传进去。这个能力是后面 polymorphism 的基础。
        `,
      },
      {
        title: 'Abstract Class：只定义共同接口',
        summary: '抽象父类可以规定 subclasses 必须实现哪些方法。',
        markdown: m`
有些 superclass 不应该直接创建对象。比如 \`Employee\` 只是“员工”这个共同概念；真正拿工资的对象应该是某种具体员工。

这种 class 可以设计成 **abstract class**。它定义共同接口，但把某些具体实现留给 subclass。

~~~python
class Employee:
    """An employee of a company.

    This is an abstract class. Only subclasses should be instantiated.
    """

    id_: int
    name: str

    def get_monthly_payment(self) -> float:
        """Return this employee's monthly payment."""
        raise NotImplementedError
~~~

\`get_monthly_payment\` 是一个 abstract method。它告诉所有 subclass：

> 如果你想成为一种 Employee，你就必须提供这个方法。

为什么不直接在 \`Employee\` 里写算法？因为 superclass 不知道具体员工怎么算工资。固定工资和按小时工资的算法不同。

但是 abstract method 仍然有价值。它把 shared public interface 写下来，让 client code 可以相信：

~~~python
def print_payment(employee: Employee) -> None:
    print(employee.get_monthly_payment())
~~~

这个函数不需要知道 \`employee\` 的具体 subclass。它只依赖 \`Employee\` 规定的接口。
        `,
      },
      {
        title: 'Override：子类提供自己的实现',
        summary: '子类写同名方法，会替换 superclass 版本。',
        markdown: m`
当 subclass 定义了和 superclass 同名的方法，就叫 **override**。

例如：

~~~python
class SalariedEmployee(Employee):
    """An employee with a fixed annual salary."""

    salary: float

    def get_monthly_payment(self) -> float:
        """Return this employee's monthly payment."""
        return self.salary / 12


class HourlyEmployee(Employee):
    """An employee paid by hourly wage."""

    hourly_wage: float
    hours_per_month: float

    def get_monthly_payment(self) -> float:
        """Return this employee's monthly payment."""
        return self.hourly_wage * self.hours_per_month
~~~

这两个 subclass 都实现了 \`get_monthly_payment\`，但算法不同。

调用时，Python 看的是对象的实际 class：

~~~python
fred: Employee = SalariedEmployee(99, 'Fred', 60000.0)
barney: Employee = HourlyEmployee(23, 'Barney', 25.0, 160.0)

fred.get_monthly_payment()     # SalariedEmployee version
barney.get_monthly_payment()   # HourlyEmployee version
~~~

变量 annotation 是 \`Employee\`，但对象实际类型不同，所以调用到的方法也不同。

override 时要守住一个原则：

> 子类可以改变实现，但不能破坏父类接口的承诺。

如果 \`Employee.get_monthly_payment()\` 承诺返回 \`float\`，subclass 版本也应该返回 \`float\`。如果 client code 按 \`Employee\` 的接口使用对象，subclass 不能偷偷换规则。
        `,
      },
      {
        title: 'Method Lookup：Python 如何找方法',
        summary: '方法查找从对象的实际 class 开始，而不是从变量标注开始。',
        markdown: m`
继承题最常见的追踪问题是：这一行到底调用了哪个方法？

规则很简单：

1. 从对象的实际 class 开始找。
2. 如果这个 class 里有同名方法，就用它。
3. 如果没有，就沿着继承链向 superclass 找。
4. 找到方法后，\`self\` 仍然绑定到原来的对象。

看这个例子：

~~~python
class Employee:
    def get_monthly_payment(self) -> float:
        raise NotImplementedError

    def annual_payment(self) -> float:
        return self.get_monthly_payment() * 12


class SalariedEmployee(Employee):
    salary: float

    def get_monthly_payment(self) -> float:
        return self.salary / 12
~~~

现在执行：

~~~python
fred: Employee = SalariedEmployee(99, 'Fred', 60000.0)
fred.annual_payment()
~~~

追踪顺序是：

1. \`fred\` 指向的对象实际是 \`SalariedEmployee\`。
2. Python 先在 \`SalariedEmployee\` 里找 \`annual_payment\`，找不到。
3. Python 到 \`Employee\` 里找，找到 \`Employee.annual_payment\`。
4. 执行 \`Employee.annual_payment\`，其中 \`self\` 仍然是 \`fred\` 指向的 \`SalariedEmployee\` object。
5. 方法体里调用 \`self.get_monthly_payment()\`。
6. 这次 lookup 又从 \`SalariedEmployee\` 开始，找到 \`SalariedEmployee.get_monthly_payment\`。

这就是为什么 superclass 里的方法可以调用 abstract method：真正运行时，\`self\` 可能是某个已经实现该方法的 subclass object。
        `,
      },
      {
        title: 'Polymorphism：同一段代码处理不同子类',
        summary: 'client code 只依赖 shared interface，不需要 if type 判断。',
        markdown: m`
**Polymorphism** 的意思是：同一段代码可以处理不同具体类型的对象，只要它们支持同一个 interface。

例如：

~~~python
def monthly_payroll(employees: list[Employee]) -> float:
    """Return the total monthly payment for all employees."""
    total = 0.0
    for employee in employees:
        total += employee.get_monthly_payment()
    return total
~~~

这个函数不关心每个 employee 到底是 \`SalariedEmployee\` 还是 \`HourlyEmployee\`。它只依赖 \`Employee\` 的 shared public interface：每个 employee 都有 \`get_monthly_payment()\`。

这比下面这种写法更稳：

~~~python
def monthly_payroll(employees: list[Employee]) -> float:
    total = 0.0
    for employee in employees:
        if isinstance(employee, SalariedEmployee):
            total += employee.salary / 12
        elif isinstance(employee, HourlyEmployee):
            total += employee.hourly_wage * employee.hours_per_month
    return total
~~~

第二种写法的问题：

- client code 知道太多 subclass 的内部 attributes。
- 每新增一种 employee，都要回来改这个函数。
- class 自己的方法失去意义，逻辑散落在外面。

多态写法的好处是：

> 把变化放在 subclass 里，把稳定的调用留给 client code。

这也是继承在这门课里的核心用法：定义一个 shared public interface，让不同 subclass 各自实现。
        `,
      },
      {
        title: '继承 attributes 和 initializer',
        summary: '子类继承方法，不会自动拥有父类 attributes；attributes 来自初始化过程。',
        markdown: m`
继承里最容易误会的一句话是：“子类继承父类 attributes。”

更准确地说：

> 子类继承方法；instance attributes 是运行 \`__init__\` 时被赋值出来的。

如果所有 employee 都有 \`id_\` 和 \`name\`，可以把共同初始化放在 superclass：

~~~python
class Employee:
    id_: int
    name: str

    def __init__(self, id_: int, name: str) -> None:
        """Initialize this employee."""
        self.id_ = id_
        self.name = name
~~~

如果 subclass 还需要额外 attribute，就 override \`__init__\`，并显式调用 superclass initializer：

~~~python
class SalariedEmployee(Employee):
    salary: float

    def __init__(self, id_: int, name: str, salary: float) -> None:
        """Initialize this salaried employee."""
        Employee.__init__(self, id_, name)
        self.salary = salary
~~~

\`Employee.__init__(self, id_, name)\` 这行非常关键。它不是创建一个新的 \`Employee\` 对象，而是把当前这个 \`SalariedEmployee\` object 传给 \`Employee.__init__\`，让它负责初始化共同 attributes。

如果漏掉这行：

~~~python
class SalariedEmployee(Employee):
    def __init__(self, id_: int, name: str, salary: float) -> None:
        self.salary = salary
~~~

那么新对象只有 \`salary\`，没有 \`id_\` 和 \`name\`。不是因为没有“继承 attributes”，而是因为没有运行那段给 attributes 赋值的代码。

记住：

- methods 存在 class 里，可以被 subclass 继承。
- attributes 存在 instance 里，必须由某段初始化代码创建。
        `,
      },
      {
        title: 'Tracing Initialization：初始化时 self 一直是谁',
        summary:
          '追踪 subclass 初始化，要看同一个对象如何依次获得 common attributes 和 subclass-specific attributes。',
        markdown: m`
初始化继承结构时，最容易混乱的是 \`self\`。

看这段代码：

~~~python
fred = SalariedEmployee(99, 'Fred', 60000.0)
~~~

假设新对象 id 是 \`idA\`，追踪过程如下：

1. Python 创建一个新的 \`SalariedEmployee\` object，id 是 \`idA\`。
2. Python 调用 \`SalariedEmployee.__init__(idA, 99, 'Fred', 60000.0)\`。
3. 在 \`SalariedEmployee.__init__\` 里，\`self\` 指向 \`idA\`。
4. 执行 \`Employee.__init__(self, id_, name)\`。
5. 这等价于调用 \`Employee.__init__(idA, 99, 'Fred')\`。
6. \`Employee.__init__\` 给同一个对象 \`idA\` 加上 \`id_\` 和 \`name\`。
7. 回到 \`SalariedEmployee.__init__\`，继续执行 \`self.salary = salary\`。
8. 同一个对象 \`idA\` 现在又有了 \`salary\`。
9. 最后变量 \`fred\` 指向 \`idA\`。

这里没有两个对象。没有“父类对象包着子类对象”。只有一个 \`SalariedEmployee\` object，只是初始化过程复用了 \`Employee.__init__\` 里的代码。

这个模型也解释了为什么 superclass method 能读到 subclass object 上的 attributes：方法执行时，\`self\` 是真实对象，不是方法所在 class 的一个拷贝。
        `,
      },
      {
        title: 'Inherited Method 的四种选择',
        summary: '子类继承一个方法后，可以直接使用、实现抽象方法、完全替换或扩展父类行为。',
        markdown: m`
当 subclass 从 superclass 继承一个方法时，有四种常见选择。

### 1. 直接使用

如果 superclass 里的实现已经适合 subclass，就不要 override。

~~~python
class Employee:
    def annual_payment(self) -> float:
        return self.get_monthly_payment() * 12
~~~

只要每个 subclass 正确实现 \`get_monthly_payment\`，就都可以直接继承 \`annual_payment\`。

### 2. 实现 abstract method

如果 superclass 里的方法只是：

~~~python
def get_monthly_payment(self) -> float:
    raise NotImplementedError
~~~

那么 concrete subclass 必须 override 它。

### 3. 完全替换

如果 superclass 有默认实现，但 subclass 需要完全不同的行为，可以 override 并替换。

~~~python
class SalariedEmployee(Employee):
    def get_monthly_payment(self) -> float:
        return self.salary / 12
~~~

### 4. 扩展父类行为

有时 subclass 想保留 superclass 的一部分逻辑，再加一点自己的工作。initializer 是最典型例子：

~~~python
class SalariedEmployee(Employee):
    def __init__(self, id_: int, name: str, salary: float) -> None:
        Employee.__init__(self, id_, name)
        self.salary = salary
~~~

这不是替换全部初始化逻辑，而是在共同初始化之后扩展 subclass-specific state。

选择哪一种，取决于 subclass 和 superclass 的关系。不要为了“看起来用了继承”而 override；每次 override 都应该有清楚理由。
        `,
      },
      {
        title: '继承设计：什么时候该用，什么时候不该用',
        summary: '继承适合共享 public interface；不适合只为复用几行代码。',
        markdown: m`
继承很强，但不应该乱用。一个简单判断是：

> subclass 是否真的可以在任何需要 superclass 的地方使用？

适合继承的情况：

- 多个 class 共享同一个 public interface。
- client code 希望用同一种方式处理它们。
- subclass 能遵守 superclass 的方法规格。
- superclass 改动不会让 subclass 语义变得奇怪。

不适合继承的情况：

- 只是碰巧有几行重复代码。
- 两个 class 只是“有关联”，不是 is-a 关系。
- subclass 需要改变 public method 的含义。
- subclass 加了太多只有自己能用的 public methods，导致 shared interface 失去意义。

在这门课里，继承最重要的用途是：

> 用 abstract superclass 定义 shared public interface；每个 subclass 实现这个 interface。

所以我们通常希望 subclass 不要随便改变 superclass 的 public interface：

- 不要让 override 后的方法参数含义变窄。
- 不要让返回值保证变弱。
- 不要让 client code 必须知道具体 subclass 才能正确使用。

如果你发现自己在很多地方写 \`if isinstance(...)\`，这通常是一个信号：变化可能应该放回 subclass method 里，而不是散落在 client code 里。
        `,
      },
      {
        title: '`object` 和 Special Methods',
        summary: '所有 class 最终都继承自 object；special methods 也是普通 override 规则的一部分。',
        markdown: m`
Python 里几乎所有对象都可以追溯到一个共同 superclass：\`object\`。

这解释了一个小现象：即使 class body 是空的，也仍然能创建对象。

~~~python
class Empty:
    pass


x = Empty()
~~~

这是因为 \`Empty\` 继承了 \`object.__init__\`。

special methods 也遵守普通的继承和 override 规则。比如 \`print(x)\` 会需要字符串表示，于是 Python 会找 \`__str__\`：

~~~python
class Employee:
    id_: int
    name: str

    def __str__(self) -> str:
        return f'{self.name} ({self.id_})'
~~~

再比如 \`==\` 会找 \`__eq__\`：

~~~python
class Employee:
    id_: int
    name: str

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Employee):
            return False

        return self.id_ == other.id_
~~~

如果你不写 \`__eq__\`，Python 会使用从 \`object\` 继承来的默认行为；默认比较更接近“是不是同一个对象”。如果你写了 \`__eq__\`，就是 override 这个 special method，让 \`==\` 按你的对象语义工作。

所以 special method 并不是另一套规则。它们只是名字特殊，会被 Python 语法或内置函数自动调用。

这一章的最后一句话：

> 继承的机械规则是 method lookup；继承的设计目标是 shared public interface。
        `,
      },
    ],
    summary: '理解继承真正复用的是接口和行为约定，而不只是复制代码。',
    goals: [
      '会追踪 method lookup。',
      '理解 overriding 和 extension 的区别。',
      '能用多态写出不关心具体子类的代码。',
    ],
    coreSummary: '继承让子类获得父类接口；多态让同一段代码可以处理不同子类对象。',
    coreIntro: '继承不是为了炫技。只有当子类确实是父类的一种，并且能遵守父类承诺时，继承才合适。',
    vocabulary: [
      ['superclass', '父类，提供共同接口和默认行为。'],
      ['subclass', '子类，继承父类并可增加或重写行为。'],
      ['override', '子类提供同名方法，替换父类版本。'],
      ['polymorphism', '调用者只依赖共同接口，不需要知道具体类型。'],
      ['special method', '`__str__`、`__eq__`、`__len__` 等由 Python 协议调用的方法。'],
    ],
    coreQuestions: [
      '这个对象的运行时类型是什么？',
      'Python 找方法时先看哪个 class？',
      '子类重写后是否仍满足父类方法的规格？',
      '`super()` 是在复用父类逻辑，还是掩盖设计问题？',
    ],
    tracingRecipe: [
      '从对象的实际 class 开始找方法。',
      '如果子类没有，再沿继承链向父类找。',
      '执行找到的方法时，`self` 仍然是原来的对象。',
      '如果方法调用 `super()`，再转到父类版本继续执行。',
    ],
    goodTrace: [
      '能写出 method lookup 的顺序。',
      '能说明被调用的是哪个 class 里的方法。',
      '能判断多态代码依赖的是接口还是具体实现。',
    ],
    examples: [
      {
        title: 'method lookup',
        prompt: '判断调用的是哪个 `speak`。',
        code: `
class Animal:
    def speak(self) -> str:
        return 'sound'

class Dog(Animal):
    def speak(self) -> str:
        return 'woof'

pet: Animal = Dog()
pet.speak()
        `,
        trace: [
          '变量类型标注是 `Animal`，但对象实际类型是 `Dog`。',
          'method lookup 从 `Dog` 开始。',
          '`Dog.speak` 存在，所以调用它。',
        ],
        answer: "返回 `'woof'`。",
      },
      {
        title: '多态循环',
        prompt: '为什么这个循环不用 `if type(...)`？',
        code: `
def total_area(shapes: list[Shape]) -> float:
    total = 0.0
    for shape in shapes:
        total += shape.area()
    return total
        `,
        trace: [
          '函数只要求每个对象支持 `area()`。',
          '每个具体子类自己决定面积怎么算。',
          '调用者不需要知道是 Circle、Rectangle 还是 Triangle。',
        ],
        answer: '这就是多态带来的接口抽象。',
      },
      {
        title: 'special method',
        prompt: '为什么 `print(obj)` 会调用 `__str__`？',
        code: `
class Card:
    def __str__(self) -> str:
        return 'A♠'
        `,
        trace: [
          '`print` 需要字符串表示。',
          'Python 协议会寻找对象的 `__str__`。',
          '实现 special method 可以让对象融入 Python 语法。',
        ],
        answer: 'special method 是 Python 数据模型的一部分。',
      },
    ],
    pitfalls: [
      {
        title: '用继承表示“碰巧有重复代码”',
        why: '重复代码不等于 is-a 关系。',
        fix: '如果不是一种父类对象，优先考虑组合或 helper。',
      },
      {
        title: '子类破坏父类规格',
        why: '调用者按父类接口使用对象，子类不能偷偷改契约。',
        fix: 'override 时保持输入要求不更强、输出保证不更弱。',
      },
      {
        title: '到处写 `type(x) == ...`',
        why: '这样绕开多态，让代码难扩展。',
        fix: '把变化放进子类方法，调用共同接口。',
      },
    ],
    practice: [
      {
        title: '画 method lookup',
        prompt: '给一个三层继承结构，标出 `obj.method()` 的查找顺序。',
        code: '',
        check: '从实际 class 开始，不从变量标注开始。',
      },
      {
        title: '写多态函数',
        prompt: '设计 `render_all(items)`，只要求每个 item 有 `render()` 方法。',
        code: '',
        check: '函数体里不应该出现具体子类判断。',
      },
    ],
    checklist: [
      '我能追踪 method lookup。',
      '我知道 override 后 `self` 仍是原对象。',
      '我能解释多态为什么减少 `if type`。',
      '我能判断继承是否表达真实 is-a 关系。',
    ],
  },
  {
    order: '06',
    topicKey: 'adts-stacks-queues',
    id: 'queue-csc148-06-adts-stacks-queues',
    name: '06 - 抽象数据类型：Stack、Queue 与接口',
    description:
      'CSC148 中文 Markdown 笔记：ADT、interface、implementation、Stack、Queue 与 client reasoning。',
    tags: ['CSC148', 'ADT', 'stack', 'queue'],
    imageSource: 'csc148-06-adts.png',
    imageAlt: 'ADT 像一份接口契约：用户看到行为，具体实现藏在后面。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/abstract-data-types/introduction.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/abstract-data-types/stacks_and_queues.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/abstract-data-types/exceptions.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/abstract-data-types/efficiency.html',
    ],
    customSections: [
      {
        title: '什么是 Abstract Data Type',
        summary: 'ADT 用“数据是什么、能做什么”定义类型，而不是先谈怎么存。',
        markdown: m`
这一章开始，重点从“怎样写一个 class”转到“怎样设计一个可以被别人稳定使用的数据类型”。

![ADT 像一份接口契约：用户看到行为，具体实现藏在后面。](/generated-notebooks/queue-csc148-06-adts-stacks-queues/csc148-06-adts.png)

**Abstract Data Type**，简称 **ADT**，可以先这样理解：

> ADT 是一组数据和操作的行为规格。它告诉 client 可以做什么，不要求 client 知道内部怎么做。

比如一个成绩册可以支持这些操作：

- 新增一名学生的成绩。
- 查询某个学生某次作业的成绩。
- 修改某个成绩。
- 删除一条记录。

这些操作描述的是成绩册这个“类型”的行为。至于底层用什么存，都还不是重点。你可以用 list of lists：

~~~python
grades = [['Sadia', 78, 82],
          ['Yuan', 75, 64],
          ['Elise', 80, 71]]
items = ['A1', 'midterm']
~~~

也可以用 dictionary of dictionaries：

~~~python
grades = {
    'A1': {'Sadia': 78, 'Yuan': 75, 'Elise': 80},
    'midterm': {'Sadia': 82, 'Yuan': 64, 'Elise': 71},
}
~~~

这两种存法都可能实现同一个“成绩册”抽象。ADT 的核心句子是：

> 先说清楚外部行为，再决定内部表示。

这和前面学过的 class design recipe 是连在一起的。public methods 是别人能依赖的承诺，private attributes 是实现者可以调整的内部细节。
        `,
      },
      {
        title: 'Interface vs Implementation',
        summary: 'interface 是 client 能依赖的边界，implementation 是 class 内部的实现选择。',
        markdown: m`
学习 ADT 时，最重要的分界线是：

| 角度 | 问的问题 | 例子 |
| --- | --- | --- |
| interface | 这个对象支持哪些 public operations？ | \`push\`、\`pop\`、\`is_empty\` |
| implementation | 这些 operations 内部怎么完成？ | 用 \`list\`、linked list、或别的数据结构 |

当你是 **client**，你只应该依赖 interface：

~~~python
if stack.is_empty():
    print('nothing to remove')
else:
    item = stack.pop()
~~~

当你是 **implementer**，你才需要关心内部表示：

~~~python
class Stack:
    _items: list

    def __init__(self) -> None:
        self._items = []
~~~

不要写这样的 client code：

~~~python
if stack._items == []:
    print('nothing to remove')
~~~

这段代码的问题不是“Python 不允许”。Python 确实允许你访问 \`_items\`。问题是它越过了抽象边界：如果以后 \`Stack\` 不再用 list 实现，所有偷看 \`_items\` 的 client code 都会坏。

所以 ADT 给我们的是一种合作方式：

- client 承诺只调用 public methods。
- implementer 承诺 public methods 的行为稳定。
- private representation 可以在不通知 client 的情况下改变。

这就是为什么 \`list\`、\`dict\` 不是 ADT 本身。它们是 Python 里已经选定内部实现的具体数据结构。ADT 是更抽象的行为规格。
        `,
      },
      {
        title: 'Stack ADT：LIFO 行为',
        summary: 'Stack 的核心规则是 last-in, first-out：最后加入的元素最先被移除。',
        markdown: m`
**Stack** 存一组 item，但它不允许 client 随便指定删除哪一个 item。Stack 只允许从“顶端”删除。

Stack 的核心行为叫 **LIFO**：

> Last-In, First-Out：最后进入的 item，最先出来。

把 Stack 想成一叠盘子：新盘子只能放到最上面，拿盘子也只能从最上面拿。

常见 Stack interface：

| operation | 行为 |
| --- | --- |
| \`is_empty()\` | 判断 stack 是否没有 item |
| \`push(item)\` | 把 \`item\` 加到 stack 顶端 |
| \`pop()\` | 删除并返回 stack 顶端的 item |

追踪例子：

~~~python
s = Stack()
s.push('A')
s.push('B')
s.push('C')
x = s.pop()
s.push('D')
y = s.pop()
~~~

一步一步看抽象状态：

| 代码 | stack 从底到顶 | 返回值 |
| --- | --- | --- |
| \`s = Stack()\` | \`[]\` | |
| \`s.push('A')\` | \`[A]\` | |
| \`s.push('B')\` | \`[A, B]\` | |
| \`s.push('C')\` | \`[A, B, C]\` | |
| \`x = s.pop()\` | \`[A, B]\` | \`x == 'C'\` |
| \`s.push('D')\` | \`[A, B, D]\` | |
| \`y = s.pop()\` | \`[A, B]\` | \`y == 'D'\` |

最后 \`x\` 是 \`'C'\`，\`y\` 是 \`'D'\`。不要按“加入顺序”猜，要按“谁现在在顶端”追踪。
        `,
      },
      {
        title: 'Stack 的接口设计',
        summary: '接口要写清楚操作、返回值、变异效果，以及空 stack 时的行为。',
        markdown: m`
一个好的 ADT interface 不只是列方法名。它还要说清楚每个方法的 contract。

下面是一个只写 interface 的 \`Stack\` class。方法体先不实现，重点看 docstring。

~~~python
from typing import Any


class Stack:
    """A last-in-first-out stack of items."""

    def __init__(self) -> None:
        """Initialize a new empty stack."""

    def is_empty(self) -> bool:
        """Return whether this stack contains no items."""

    def push(self, item: Any) -> None:
        """Add item to the top of this stack."""

    def pop(self) -> Any:
        """Remove and return the item at the top of this stack.

        Preconditions:
        - not self.is_empty()
        """
~~~

这里有四个设计点：

1. \`__init__\` 创建空 stack。
2. \`is_empty\` 不修改 stack，只回答状态。
3. \`push\` 会修改 stack，但没有返回值。
4. \`pop\` 既会修改 stack，又会返回被删除的 item。

\`pop\` 的 precondition 很关键：如果 stack 是空的，\`pop\` 没有正常答案。因为没有“顶端 item”可以返回。

在追踪 \`pop\` 时，要同时写出两个变化：

- 返回了哪个 item。
- stack 本身少了哪个 item。

例如：

~~~python
s.push('A')
s.push('B')
item = s.pop()
~~~

执行后：

- \`item == 'B'\`
- \`s\` 里还剩 \`'A'\`

很多错误答案只写返回值，忘了 \`pop\` 是 mutating method。
        `,
      },
      {
        title: '用 list 实现 Stack',
        summary: '同一个 Stack interface 可以由 list 实现；这里选择 list 的末尾作为栈顶。',
        markdown: m`
现在从 implementer 的角度看：如果用 Python \`list\` 实现 \`Stack\`，需要先做一个内部表示选择。

我们选择：

> \`self._items\` 的末尾表示 stack 顶端。

代码可以这样写：

~~~python
from typing import Any


class Stack:
    """A last-in-first-out stack of items.

    Private Instance Attributes:
    - _items: The items stored in this stack.
              The end of the list represents the top of the stack.
    """
    _items: list

    def __init__(self) -> None:
        """Initialize a new empty stack."""
        self._items = []

    def is_empty(self) -> bool:
        """Return whether this stack contains no items."""
        return self._items == []

    def push(self, item: Any) -> None:
        """Add item to the top of this stack."""
        self._items.append(item)

    def pop(self) -> Any:
        """Remove and return the item at the top of this stack.

        Preconditions:
        - not self.is_empty()
        """
        return self._items.pop()
~~~

注意：\`_items\` 是 private instance attribute。它只是这个版本的实现方式，不是 Stack ADT 的一部分。

我们也可以选择 list 的开头作为栈顶：

~~~python
def push(self, item: Any) -> None:
    self._items.insert(0, item)

def pop(self) -> Any:
    return self._items.pop(0)
~~~

这个版本仍然可以满足 Stack 的 LIFO 行为。也就是说，ADT 层面它是对的。但它的效率会差很多，这一点后面会回到。

先把层次分清：

- interface 问：\`push\` 后谁在顶端，\`pop\` 返回谁？
- implementation 问：顶端到底存在 list 的哪一端？
- efficiency 问：这个选择快不快？
        `,
      },
      {
        title: 'Queue ADT：FIFO 行为',
        summary: 'Queue 的核心规则是 first-in, first-out：最早加入的元素最先被移除。',
        markdown: m`
**Queue** 和 Stack 一样，也是一组 item，加进去、拿出来。但 Queue 的删除顺序不同。

Queue 的核心行为叫 **FIFO**：

> First-In, First-Out：最早进入的 item，最先出来。

常见 Queue interface：

| operation | 行为 |
| --- | --- |
| \`is_empty()\` | 判断 queue 是否没有 item |
| \`enqueue(item)\` | 把 \`item\` 加到 queue 末尾 |
| \`dequeue()\` | 删除并返回 queue 最前面的 item |

追踪例子：

~~~python
q = Queue()
q.enqueue('A')
q.enqueue('B')
q.enqueue('C')
x = q.dequeue()
q.enqueue('D')
y = q.dequeue()
~~~

一步一步看抽象状态：

| 代码 | queue 从前到后 | 返回值 |
| --- | --- | --- |
| \`q = Queue()\` | \`[]\` | |
| \`q.enqueue('A')\` | \`[A]\` | |
| \`q.enqueue('B')\` | \`[A, B]\` | |
| \`q.enqueue('C')\` | \`[A, B, C]\` | |
| \`x = q.dequeue()\` | \`[B, C]\` | \`x == 'A'\` |
| \`q.enqueue('D')\` | \`[B, C, D]\` | |
| \`y = q.dequeue()\` | \`[C, D]\` | \`y == 'B'\` |

最后 \`x\` 是 \`'A'\`，\`y\` 是 \`'B'\`。

Stack 和 Queue 最容易混的地方是：它们都支持“加入”和“删除”，但删除规则完全不同。
        `,
      },
      {
        title: 'Queue 的接口设计',
        summary: 'Queue 的接口要强调队首和队尾，并说明 dequeue 对空 queue 的要求。',
        markdown: m`
Queue 的 interface 和 Stack 很像，但方法名会提醒你不同的抽象图像。

~~~python
from typing import Any


class Queue:
    """A first-in-first-out queue of items."""

    def __init__(self) -> None:
        """Initialize a new empty queue."""

    def is_empty(self) -> bool:
        """Return whether this queue contains no items."""

    def enqueue(self, item: Any) -> None:
        """Add item to the back of this queue."""

    def dequeue(self) -> Any:
        """Remove and return the item at the front of this queue.

        Preconditions:
        - not self.is_empty()
        """
~~~

这里的关键词是 **front** 和 **back**：

- \`enqueue\` 加到 back。
- \`dequeue\` 从 front 删除。

如果用 list 实现 Queue，有两种常见选择：

| 表示选择 | enqueue | dequeue |
| --- | --- | --- |
| list 开头是 front | \`append(item)\` | \`pop(0)\` |
| list 末尾是 front | \`insert(0, item)\` | \`pop()\` |

这两种都可以实现 FIFO。差别是效率：一个操作会在 list 开头插入或删除，可能需要移动很多元素。

所以 Queue 是一个非常好的提醒：

> 行为正确只是第一步；实现选择还会影响运行时间。

但不管实现怎么选，client code 都应该长这样：

~~~python
if not q.is_empty():
    next_item = q.dequeue()
~~~

client 不应该知道 front 在 \`_items[0]\` 还是 \`_items[-1]\`。
        `,
      },
      {
        title: 'Stack 和 Queue 的共同抽象',
        summary: '两者都隐藏内部存储，只让 client 通过固定操作改变抽象状态。',
        markdown: m`
Stack 和 Queue 看起来只是顺序不同，但它们共同训练的是同一种抽象能力。

它们都有三类操作：

| 操作类型 | Stack | Queue |
| --- | --- | --- |
| 判断是否为空 | \`is_empty()\` | \`is_empty()\` |
| 加入 item | \`push(item)\` | \`enqueue(item)\` |
| 删除并返回 item | \`pop()\` | \`dequeue()\` |

它们的不同点只在删除规则：

- Stack 删除最近加入的 item。
- Queue 删除最早加入的 item。

看一段 client code：

~~~python
def process_all(container) -> list:
    """Remove every item from container and return the removal order."""
    removed = []
    while not container.is_empty():
        removed.append(container.remove())
    return removed
~~~

如果我们想让 Stack、Queue、PriorityQueue 都被同一段代码处理，可以设计一个更一般的接口：\`is_empty\`、\`add\`、\`remove\`。

不同 ADT 可以共享操作名字，但给出不同的 remove 语义：

- Stack 的 \`remove\`：删除 newest item。
- Queue 的 \`remove\`：删除 oldest item。
- PriorityQueue 的 \`remove\`：删除 priority 最高的 item。

这就是 ADT 的价值：client 可以围绕一组稳定操作写程序，而实现者可以在类内部决定“下一项”到底意味着什么。

以后你看到一个问题时，可以先问：

> 我需要按什么顺序拿出 item？

如果答案是“最近的先处理”，常常是 Stack。如果答案是“先来的先处理”，常常是 Queue。
        `,
      },
      {
        title: '空 Stack / 空 Queue：Precondition 还是 Exception',
        summary: '空结构上的 remove 操作没有正常返回值，接口必须说清楚怎么处理。',
        markdown: m`
\`pop\` 和 \`dequeue\` 都有一个共同问题：如果结构是空的，应该发生什么？

有两种常见设计。

第一种：把“非空”写成 precondition。

~~~python
def pop(self) -> Any:
    """Remove and return the item at the top of this stack.

    Preconditions:
    - not self.is_empty()
    """
~~~

这种设计的意思是：client 有责任在调用前保证 stack 非空。

~~~python
if not s.is_empty():
    item = s.pop()
~~~

如果 client 违反 precondition，method 不需要保证正常行为。

第二种：让 method 在空结构上 raise 一个 exception。

~~~python
def pop(self) -> Any:
    """Remove and return the item at the top of this stack.

    Raise an EmptyStackError if this stack is empty.
    """
~~~

这种设计的意思是：\`pop\` 自己会检查空结构，并用明确的异常报告失败。

两种设计都可以，但不要含糊。最糟糕的是不写清楚，让 client 不知道空结构时会返回 \`None\`、raise error，还是做别的事。

在 CSC148 里，ADT 的异常行为也是 interface 的一部分。也就是说，client 可以依赖的不只是“正常情况下返回什么”，还包括“失败时如何失败”。
        `,
      },
      {
        title: '自定义 Exception 作为接口的一部分',
        summary: '自定义异常能让错误信息更具体，也让 client 精准处理失败情况。',
        markdown: m`
如果所有错误都只用 \`ValueError\` 或 \`IndexError\`，client 很难判断到底哪里出问题。

对 Stack，可以定义一个更具体的异常：

~~~python
class EmptyStackError(Exception):
    """Exception raised when calling pop on an empty stack."""
~~~

然后在 \`pop\` 里使用：

~~~python
class Stack:
    _items: list

    def pop(self) -> Any:
        """Remove and return the item at the top of this stack.

        Raise an EmptyStackError if this stack is empty.
        """
        if self.is_empty():
            raise EmptyStackError
        else:
            return self._items.pop()
~~~

client 可以选择处理这个异常：

~~~python
try:
    item = s.pop()
except EmptyStackError:
    item = None
~~~

也可以在函数里把异常转化成自己的返回规格：

~~~python
def second_from_top(s: Stack) -> Any | None:
    """Return the second item from the top of s.

    Return None if s has fewer than two items.
    Do not change s.
    """
    try:
        top = s.pop()
    except EmptyStackError:
        return None

    try:
        second = s.pop()
    except EmptyStackError:
        s.push(top)
        return None

    s.push(second)
    s.push(top)
    return second
~~~

这段代码有两个细节值得看：

- 如果 stack 原本只有一个 item，函数会把 \`top\` 放回去，保证“不改变 s”。
- 返回类型写成 \`Any | None\`，因为失败情况会返回 \`None\`。

异常不是和 contract 分开的东西。异常就是 contract 的一部分。
        `,
      },
      {
        title: 'Implementation 会影响效率',
        summary: '同一个 ADT 行为可以有多个正确实现，但运行时间可能完全不同。',
        markdown: m`
ADT 把 interface 和 implementation 分开，不代表 implementation 不重要。

看两个 Stack 实现。

版本 A：list 末尾是栈顶。

~~~python
def push(self, item: Any) -> None:
    self._items.append(item)

def pop(self) -> Any:
    return self._items.pop()
~~~

版本 B：list 开头是栈顶。

~~~python
def push(self, item: Any) -> None:
    self._items.insert(0, item)

def pop(self) -> Any:
    return self._items.pop(0)
~~~

这两个版本在 Stack 行为上都正确，都会满足 LIFO。但版本 A 通常快很多。

原因来自 Python list 的内存模型：

- list 的元素引用连续存放。
- 访问 \`lst[i]\` 很快，因为可以直接算位置。
- 在 list 末尾添加或删除通常很快。
- 在 list 开头插入或删除通常很慢，因为后面的元素都要移动。

用 Big-O 粗略描述：

| 操作 | list 末尾 | list 开头 |
| --- | --- | --- |
| 添加 | 通常 $O(1)$ | $O(n)$ |
| 删除 | $O(1)$ | $O(n)$ |

所以我们会说：用 list 末尾表示 stack top，是更好的 implementation choice。

Queue 也会遇到类似问题。如果用普通 list，一端插入另一端删除，总有一个操作可能需要移动很多元素。之后学习 linked list 时，会看到另一种更适合实现 Queue 的底层结构。

这里要把三句话分开：

- 这个实现是否符合 ADT 行为？这是 correctness。
- 这个实现是否隐藏了 private representation？这是 design。
- 这个实现随着数据变大会不会变慢？这是 efficiency。
        `,
      },
      {
        title: 'ADT 思维总结',
        summary: '用 ADT 思考，就是先建立行为契约，再让实现服务于契约。',
        markdown: m`
这一章真正想训练的不是背 Stack 和 Queue 的方法名，而是一种读程序和设计程序的方式。

看到一个数据类型时，先问 interface：

- 它存的是什么抽象数据？
- client 可以调用哪些 public methods？
- 每个 method 是否 mutates the object？
- 每个 method 的返回值是什么？
- 边界情况是 precondition，还是会 raise exception？

然后再问 implementation：

- private attributes 是什么？
- representation invariant 是什么？
- public methods 是否维护这个 RI？
- client 有没有偷看 private attributes？

最后再问 efficiency：

- 常用操作会不会随着 item 数量增长而变慢？
- 当前底层结构适不适合这个 ADT？
- 有没有更好的实现可以不改变 client code？

把 Stack 和 Queue 放在一起记：

| ADT | 加入 | 删除 | 顺序 |
| --- | --- | --- | --- |
| Stack | \`push\` 到 top | \`pop\` from top | LIFO |
| Queue | \`enqueue\` 到 back | \`dequeue\` from front | FIFO |

一个成熟的 ADT 设计应该让 client 有这样的体验：

> 我知道怎么用它，也知道它承诺什么；至于里面怎么存，我不需要知道。

这就是抽象的作用。它不是把细节变没，而是把细节放到正确的位置：client 看到行为，implementer 管理表示。
        `,
      },
    ],
  },
  {
    order: '07',
    topicKey: 'exceptions-runtime',
    id: 'queue-csc148-07-exceptions-runtime',
    name: '07 - 异常与运行时间分析',
    description:
      'CSC148 中文 Markdown 笔记：exceptions、raise、try/except、runtime、Big-O 和增长率。',
    tags: ['CSC148', 'exceptions', 'runtime', 'Big-O'],
    imageSource: 'csc148-07-exceptions-runtime.png',
    imageAlt: '异常像安全网，运行时间像随输入规模增长的计时器。',
    summary: '把错误处理和效率分析都看成程序规格的一部分。',
    goals: [
      '理解什么时候 raise，什么时候 catch。',
      '能读懂异常传播路径。',
      '会用 Big-O 描述代码增长趋势。',
    ],
    coreSummary: '异常处理关注非正常路径；运行时间分析关注输入规模变大时成本怎么增长。',
    coreIntro:
      '正确性不只是正常输入返回答案。一个完整程序还要说明失败时怎么失败，以及数据变大时能不能承受。',
    vocabulary: [
      ['raise', '主动报告异常，让调用者知道当前路径无法正常完成。'],
      ['try/except', '捕获并处理某类异常。'],
      ['propagation', '异常沿调用栈向上传播，直到被处理或终止程序。'],
      ['Big-O', '忽略常数和低阶项，只描述增长阶。'],
      ['worst-case', '最坏情况下的运行时间上界。'],
    ],
    coreQuestions: [
      '这里失败是正常业务情况，还是程序员错误？',
      '谁有足够信息处理这个异常？',
      '循环次数和输入长度有什么关系？',
      '嵌套循环是否真的都跑满？',
    ],
    tracingRecipe: [
      '异常题：标出 raise 发生在哪一层调用。',
      '向上找最近能匹配的 except。',
      'runtime 题：先找和输入规模有关的循环或递归。',
      '保留最高阶增长项，丢掉常数因子。',
    ],
    goodTrace: [
      '能说明异常是否被捕获。',
      '能解释为什么某段代码不会继续执行。',
      '能把代码行数转成关于 n 的增长式。',
    ],
    examples: [
      {
        title: '异常传播',
        prompt: '判断 `print` 是否执行。',
        code: `
def parse_age(text: str) -> int:
    if not text.isdigit():
        raise ValueError
    return int(text)

parse_age('ten')
print('done')
        `,
        trace: [
          '`text.isdigit()` 为 False。',
          '函数 raise `ValueError`。',
          '没有 try/except 捕获，程序终止。',
        ],
        answer: "`print('done')` 不执行。",
      },
      {
        title: '捕获异常的位置',
        prompt: '为什么 except 通常放在有恢复策略的地方？',
        code: `
try:
    age = parse_age(user_input)
except ValueError:
    age = 0
        `,
        trace: [
          '调用者知道无效输入时要给默认值。',
          '`parse_age` 只负责发现解析失败。',
          '处理策略和检测位置可以分开。',
        ],
        answer: 'catch 的地方应该有能力决定下一步。',
      },
      {
        title: 'Big-O 读循环',
        prompt: '这段代码是什么阶？',
        code: `
for i in range(n):
    for j in range(10):
        print(i, j)
        `,
        trace: ['外层循环运行 n 次。', '内层循环固定 10 次。', '总步数大约是 10n。'],
        answer: 'Big-O 是 $O(n)$，不是 $O(n^2)$。',
      },
    ],
    pitfalls: [
      {
        title: 'catch 太宽',
        why: '`except Exception` 会吞掉意外 bug。',
        fix: '只捕获你知道如何处理的具体异常。',
      },
      {
        title: '把常数循环看成平方',
        why: '嵌套不一定是 $n^2$，要看每层次数是否随 n 变。',
        fix: '给每个循环写出次数表达式。',
      },
      {
        title: '只看平均直觉',
        why: '课程常问 worst-case。',
        fix: '明确说你分析的是 worst-case、best-case 还是 average-case。',
      },
    ],
    practice: [
      {
        title: '异常路径',
        prompt: '画出一个三层函数调用里异常向上传播的路线。',
        code: '',
        check: '最近的 matching except 会接住它。',
      },
      {
        title: 'runtime 分类',
        prompt: '给三个片段分别判断 $O(1)$、$O(n)$、$O(n^2)$。',
        code: '',
        check: '先数和 n 相关的操作次数。',
      },
    ],
    checklist: [
      '我能解释 raise 和 except 的分工。',
      '我能追踪异常传播。',
      '我能从循环结构推出 Big-O。',
      '我不会只凭“嵌套循环”四个字判断复杂度。',
    ],
  },
  {
    order: '08',
    topicKey: 'linked-lists',
    id: 'queue-csc148-08-linked-lists',
    name: '08 - 链表：节点、链接与变异',
    description:
      'CSC148 中文 Markdown 笔记：linked list nodes、head、rest、traversal、insertion、deletion 与 recursive linked lists。',
    tags: ['CSC148', 'linked list', 'node', 'mutation'],
    imageSource: 'csc148-08-linked-lists.png',
    imageAlt: '链表是一串节点卡片，每个节点保存值和到下一个节点的引用。',
    summary: '用节点和引用理解链表，而不是把链表当成可以随机索引的 list。',
    goals: [
      '会画节点对象和 next 引用。',
      '能追踪 traversal、insert 和 delete。',
      '知道链表操作为什么常常需要保存 previous。',
    ],
    coreSummary: '链表的结构存在于节点之间的引用，不存在于连续数组位置。',
    coreIntro: 'Python list 的核心能力是 index；linked list 的核心能力是从 head 顺着 next 走。',
    vocabulary: [
      ['node', '保存一个值和一个到下个节点引用的对象。'],
      ['head', '链表第一个节点的引用。'],
      ['next', '从当前节点到后继节点的引用。'],
      ['traversal', '从 head 开始逐个节点访问。'],
      ['relink', '修改 next 引用以插入或删除节点。'],
    ],
    coreQuestions: [
      '现在手里有哪个节点的引用？',
      '要访问下一个节点，需要沿哪个 `.next` 走？',
      '如果要删除当前节点，是否还保留 previous？',
      '空链表和单节点链表是否单独处理？',
    ],
    tracingRecipe: [
      '先画 head 指向第一个节点或 None。',
      '每个节点画出 value 和 next。',
      '遍历时移动 curr，不要丢掉 head。',
      '改链接前先保存会被断开的节点引用。',
    ],
    goodTrace: [
      '每次 `.next` 改变都能在图上标出来。',
      '能处理 head 位置插入/删除。',
      '不会把 curr 移动误认为节点消失。',
    ],
    examples: [
      {
        title: '遍历求长度',
        prompt: '为什么要用 `curr`？',
        code: `
count = 0
curr = head
while curr is not None:
    count += 1
    curr = curr.next
        `,
        trace: [
          '`curr` 一开始引用 head 节点。',
          '每轮访问当前节点，然后沿 next 到下一个节点。',
          '`head` 不动，所以链表入口没有丢。',
        ],
        answer: '遍历结束时 `count` 是节点数。',
      },
      {
        title: '在头部插入',
        prompt: '插入新节点到最前面需要几步？',
        code: `
new_node.next = head
head = new_node
        `,
        trace: [
          '先让新节点指向旧 head。',
          '再把 head 改成新节点。',
          '顺序反过来会丢掉旧链表入口。',
        ],
        answer: '插入头部是 $O(1)$。',
      },
      {
        title: '删除中间节点',
        prompt: '为什么需要 previous？',
        code: `
prev.next = curr.next
        `,
        trace: [
          '`prev` 指向要删除节点的前一个节点。',
          '`curr` 是要删除的节点。',
          '把 `prev.next` 跳过 `curr`，链表就不再包含 curr。',
        ],
        answer: '删除不是擦掉对象，而是改链接。',
      },
    ],
    pitfalls: [
      {
        title: '移动 head',
        why: '如果遍历时直接 `head = head.next`，可能丢掉链表入口。',
        fix: '用 `curr` 遍历，保留 head。',
      },
      {
        title: '插入顺序写反',
        why: '先改 head 可能让旧链表不可达。',
        fix: '先连新节点到旧链，再更新入口。',
      },
      {
        title: '忘记空链表',
        why: '空链表没有 head 节点可访问。',
        fix: '访问 `.next` 前先检查是否为 None。',
      },
    ],
    practice: [
      {
        title: '画链表',
        prompt: '画出三个节点的链表，以及 `curr = head.next` 后 curr 指向哪里。',
        code: '',
        check: 'head 没变，curr 指向第二个节点。',
      },
      {
        title: '删除第一个元素',
        prompt: '写出删除 head 节点的两行伪代码。',
        code: '',
        check: '入口变成旧 head 的 next。',
      },
    ],
    checklist: [
      '我能画出节点和 next。',
      '我知道 traversal 不等于 random access。',
      '我能说明插入/删除其实是改引用。',
      '我能处理空链表和头节点特例。',
    ],
  },
  {
    order: '09',
    topicKey: 'recursion-basics',
    id: 'queue-csc148-09-recursion-basics',
    name: '09 - 递归基础：base case 与 self-similar data',
    description:
      'CSC148 中文 Markdown 笔记：recursion、base case、recursive case、nested lists 与递归设计配方。',
    tags: ['CSC148', 'recursion', 'nested list'],
    imageSource: 'csc148-09-recursion-basics.png',
    imageAlt: '递归像嵌套任务盒：每层处理更小的同类问题，直到 base case。',
    summary: '递归不是神秘技巧，而是把问题拆成同形的小问题。',
    goals: [
      '能识别 base case 和 recursive case。',
      '会对嵌套 list 写递归函数。',
      '理解递归调用返回后如何组合结果。',
    ],
    coreSummary: '递归函数调用自己，但每次应该处理更小或更简单的问题。',
    coreIntro: '递归适合结构本身就是递归的资料，比如嵌套 list、linked list、tree。',
    vocabulary: [
      ['base case', '不用继续递归就能直接回答的情况。'],
      ['recursive case', '把问题拆成一个或多个更小的同类问题。'],
      ['nested list', '元素可以是 int，也可以是另一层 list 的结构。'],
      ['combine', '把递归调用结果合成当前层答案。'],
      ['progress measure', '证明递归会停下来的“变小”指标。'],
    ],
    coreQuestions: [
      '输入结构的最小形式是什么？',
      '每次递归调用的输入是否更小？',
      '递归调用返回的结果代表什么？',
      '当前层要如何和子结果组合？',
    ],
    tracingRecipe: [
      '先写 base case，不急着写 recursive case。',
      '假设递归调用对更小输入已经正确。',
      '用这个假设写当前层逻辑。',
      '检查每个分支都会走向 base case。',
    ],
    goodTrace: [
      '能说出每个递归调用的输入。',
      '能标出 base case 何时触发。',
      '能说明返回值如何逐层合并。',
    ],
    examples: [
      {
        title: '列表求和',
        prompt: '递归版 sum 的 base case 是什么？',
        code: `
def sum_list(nums: list[int]) -> int:
    if nums == []:
        return 0
    return nums[0] + sum_list(nums[1:])
        `,
        trace: [
          '空列表直接返回 0。',
          '非空时，把第一个元素和剩余列表的和相加。',
          '`nums[1:]` 比原列表短，所以会停。',
        ],
        answer: 'base case 是空列表。',
      },
      {
        title: '嵌套列表计数',
        prompt: '为什么需要判断元素是不是 list？',
        code: `
def count_ints(obj: int | list) -> int:
    if isinstance(obj, int):
        return 1
    total = 0
    for item in obj:
        total += count_ints(item)
    return total
        `,
        trace: [
          '如果 obj 是 int，直接数 1 个。',
          '如果 obj 是 list，就对每个元素递归。',
          '元素可能还是 list，所以递归结构自然匹配。',
        ],
        answer: '`[1, [2, 3], []]` 的结果是 3。',
      },
      {
        title: '递归假设',
        prompt: '写 recursive case 时能假设什么？',
        code: `
return nums[0] + sum_list(nums[1:])
        `,
        trace: [
          '可以假设 `sum_list(nums[1:])` 已经正确返回剩余元素的和。',
          '当前层只需要把 `nums[0]` 加进去。',
          '这不是循环展开，而是递归设计思想。',
        ],
        answer: '递归假设让代码变短，也让证明变清楚。',
      },
    ],
    pitfalls: [
      {
        title: '没有 progress',
        why: '递归调用输入不变会无限递归。',
        fix: '每次调用都要让结构更小，例如列表更短或树高度更低。',
      },
      {
        title: 'base case 太晚',
        why: '先访问 `nums[0]` 再检查空列表会报错。',
        fix: '先处理最小结构，再拆分。',
      },
      {
        title: '把递归当循环展开',
        why: '手动展开很快失控。',
        fix: '用递归假设：更小问题已经会返回正确答案。',
      },
    ],
    practice: [
      {
        title: '写 base case',
        prompt: '为 `max_nested(obj)` 写出 int 和空 list 的处理策略。',
        code: '',
        check: '先确定空 list 是否在 precondition 里被禁止。',
      },
      {
        title: '追踪返回',
        prompt: '手算 `count_ints([1, [2, []]])`。',
        code: '',
        check: '结果是 2。',
      },
    ],
    checklist: [
      '我能指出 base case。',
      '我能说明递归输入如何变小。',
      '我能用递归假设写当前层。',
      '我能对 nested list 写递归。',
    ],
  },
  {
    order: '10',
    topicKey: 'recursion-tracing',
    id: 'queue-csc148-10-recursion-tracing',
    name: '10 - 递归追踪：调用栈、分支与返回值',
    description:
      'CSC148 中文 Markdown 笔记：recursive tracing、call stack、branching recursion、accumulators 与 debugging recursion。',
    tags: ['CSC148', 'recursion', 'call stack', 'tracing'],
    imageSource: 'csc148-10-recursion-tracing.png',
    imageAlt: '递归调用像一叠 call frame，每层等待更小问题返回。',
    summary: '学会追踪递归调用栈，而不是只盯着函数体一行行看。',
    goals: [
      '能画出 call stack。',
      '能追踪 branching recursion 的多条路径。',
      '能判断返回值如何沿栈向上合并。',
    ],
    coreSummary: '每次递归调用都有自己的局部 frame；返回时才回到上一层继续组合。',
    coreIntro: '递归难不是因为代码长，而是因为同一个函数会同时有很多未完成的调用。',
    vocabulary: [
      ['call frame', '一次函数调用的局部变量和执行位置。'],
      ['unwind', '递归到达 base case 后，返回值逐层回到上层。'],
      ['branching recursion', '一个调用产生多个递归调用。'],
      ['accumulator', '把已经处理的信息作为参数带入下一层。'],
      ['trace tree', '用树状图表示递归调用关系。'],
    ],
    coreQuestions: [
      '当前 frame 的参数是什么？',
      '这一层还在等哪个递归调用返回？',
      '返回值代表整个子问题，还是部分累计结果？',
      'branching 时两个子结果如何合并？',
    ],
    tracingRecipe: [
      '为每次调用写一行：函数名和参数。',
      '遇到 base case 立即写返回值。',
      '返回上一层时，把子结果代回表达式。',
      'branching recursion 用树状 trace，不要挤成一条线。',
    ],
    goodTrace: [
      '每个 frame 的参数不同且更小。',
      '每个返回值都有来源。',
      '能区分调用顺序和最终组合结构。',
    ],
    examples: [
      {
        title: '追踪 factorial',
        prompt: '写出 `fact(4)` 的调用和返回。',
        code: `
def fact(n: int) -> int:
    if n == 0:
        return 1
    return n * fact(n - 1)
        `,
        trace: [
          '调用链：fact(4) -> fact(3) -> fact(2) -> fact(1) -> fact(0)。',
          'fact(0) 返回 1。',
          '返回时依次得到 1、2、6、24。',
        ],
        answer: '`fact(4) == 24`。',
      },
      {
        title: 'branching recursion',
        prompt: '为什么 Fibonacci trace 是树？',
        code: `
def fib(n: int) -> int:
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
        `,
        trace: [
          '`fib(4)` 会调用 `fib(3)` 和 `fib(2)`。',
          '`fib(3)` 又会调用 `fib(2)` 和 `fib(1)`。',
          '同一参数可能被重复计算。',
        ],
        answer: 'trace 形状是分支树，不是一条调用链。',
      },
      {
        title: 'accumulator 版本',
        prompt: 'accumulator 里的信息代表什么？',
        code: `
def sum_acc(nums: list[int], acc: int) -> int:
    if nums == []:
        return acc
    return sum_acc(nums[1:], acc + nums[0])
        `,
        trace: [
          '`acc` 保存已经处理过的前缀和。',
          '每次递归列表变短，acc 变大。',
          'base case 时 acc 就是总和。',
        ],
        answer: 'accumulator 是跨 frame 传递的部分答案。',
      },
    ],
    pitfalls: [
      {
        title: '混淆局部变量',
        why: '每个 frame 都有自己的参数和局部变量。',
        fix: 'trace 时把每次调用单独写一行。',
      },
      {
        title: '忽略返回阶段',
        why: '递归答案通常在 unwind 时组合出来。',
        fix: 'base case 之后继续写返回值如何回到上一层。',
      },
      {
        title: 'branching trace 画成线',
        why: '多个递归调用会形成树状依赖。',
        fix: '用 trace tree 表示每个子调用。',
      },
    ],
    practice: [
      {
        title: '画 call stack',
        prompt: '画出 `fact(3)` 到 base case 前的 stack。',
        code: '',
        check: '栈里有 fact(3)、fact(2)、fact(1)、fact(0)。',
      },
      {
        title: '画 fib trace tree',
        prompt: '画出 `fib(4)` 的完整调用树。',
        code: '',
        check: '你应该看到 `fib(2)` 出现多次。',
      },
    ],
    checklist: [
      '我能画递归调用栈。',
      '我能写出返回值逐层合并。',
      '我能识别 branching recursion。',
      '我能解释 accumulator 的含义。',
    ],
  },
  {
    order: '11',
    topicKey: 'trees-bsts',
    id: 'queue-csc148-11-trees-bsts',
    name: '11 - Trees 与 Binary Search Trees',
    description:
      'CSC148 中文 Markdown 笔记：tree recursion、root、subtree、traversal、BST invariant、search/insert。',
    tags: ['CSC148', 'trees', 'BST', 'recursion'],
    imageSource: 'csc148-11-trees-bsts.png',
    imageAlt: '树由 root 和 subtrees 组成，BST 的搜索路径由大小关系决定。',
    summary: '把 tree 看成递归数据结构，再用 BST invariant 做高效搜索。',
    goals: [
      '理解 root、children、subtree 的递归结构。',
      '会写 tree traversal。',
      '会用 BST invariant 追踪 search 和 insert。',
    ],
    coreSummary: 'Tree 的每个 subtree 仍然是 tree；BST 给左右子树加上有序约束。',
    coreIntro:
      'Tree 是 CSC148 后半段最重要的递归结构。你写 tree 方法时，几乎总是在对 subtrees 做递归。',
    vocabulary: [
      ['root', '树的入口节点。'],
      ['subtree', '某个 child 为 root 的整棵子树。'],
      ['leaf', '没有 children 的节点。'],
      ['traversal', '按某种顺序访问树中所有节点。'],
      ['BST invariant', '左子树所有值小于 root，右子树所有值大于 root。'],
    ],
    coreQuestions: [
      '当前 root 的值是什么？',
      '要对每个 subtree 做同样问题吗？',
      'traversal 的访问顺序是什么？',
      'BST 搜索时可以丢弃哪半边？',
    ],
    tracingRecipe: [
      '先处理空树或 leaf。',
      '把问题拆给每个 subtree。',
      '按 traversal 顺序组合结果。',
      'BST 题先用 invariant 决定走左还是右。',
    ],
    goodTrace: [
      '能标出每个递归调用处理哪棵 subtree。',
      '能说明 traversal 顺序。',
      'BST 搜索不会同时走左右两边。',
    ],
    examples: [
      {
        title: 'Tree sum',
        prompt: '为什么 tree sum 是递归？',
        code: `
def sum_tree(t: Tree) -> int:
    total = t.root
    for subtree in t.subtrees:
        total += sum_tree(subtree)
    return total
        `,
        trace: [
          '当前层贡献 root 值。',
          '每个 subtree 的和由递归调用给出。',
          '把所有子树结果加起来。',
        ],
        answer: 'tree 的定义直接诱导递归。',
      },
      {
        title: 'BST search',
        prompt: '搜索目标比 root 小时走哪边？',
        code: `
if item == root:
    return True
elif item < root:
    return search(left, item)
else:
    return search(right, item)
        `,
        trace: [
          'BST invariant 保证左边都小于 root。',
          '如果 item < root，右边不可能有答案。',
          '每一步只保留一棵 subtree。',
        ],
        answer: '搜索路径是一条从 root 往下的路线。',
      },
      {
        title: 'inorder traversal',
        prompt: 'BST 的 inorder 为什么得到排序结果？',
        code: `
inorder(left)
visit(root)
inorder(right)
        `,
        trace: [
          '左子树所有值小于 root。',
          '右子树所有值大于 root。',
          '递归地对左右子树使用同一顺序。',
        ],
        answer: 'BST 的 inorder traversal 给出递增序列。',
      },
    ],
    pitfalls: [
      {
        title: '把 tree 当 list',
        why: 'tree 不是线性结构，不能只看 next。',
        fix: '对每个 child/subtree 分别递归。',
      },
      {
        title: 'BST 搜索走两边',
        why: '如果两边都走，就浪费了 BST invariant。',
        fix: '比较 item 和 root，只选择一边。',
      },
      {
        title: '忘记空树',
        why: '很多实现用空树作为 base case。',
        fix: '每个递归方法先处理空结构。',
      },
    ],
    practice: [
      {
        title: '画搜索路径',
        prompt: '在一棵 BST 上搜索 42，标出比较和走向。',
        code: '',
        check: '每一步只走左或右，不会两边都走。',
      },
      {
        title: '写 traversal',
        prompt: '写 preorder、inorder、postorder 的访问顺序。',
        code: '',
        check: '明确 root 在左/右子树访问之前、中间还是之后。',
      },
    ],
    checklist: [
      '我能把 tree 方法写成 root + subtrees 的递归。',
      '我能解释 leaf 和 empty tree 的 base case。',
      '我能用 BST invariant 搜索。',
      '我能说明 inorder traversal 为什么排序。',
    ],
  },
  {
    order: '12',
    topicKey: 'recursive-sorting',
    id: 'queue-csc148-12-recursive-sorting',
    name: '12 - 递归排序：分治、merge sort 与 quicksort',
    description:
      'CSC148 中文 Markdown 笔记：divide and conquer、merge sort、quicksort、partition、runtime tradeoffs。',
    tags: ['CSC148', 'sorting', 'merge sort', 'quicksort'],
    imageSource: 'csc148-12-recursive-sorting.png',
    imageAlt: '递归排序把卡片分成小堆，分别排好，再合并或拼接。',
    summary: '用 divide-and-conquer 理解递归排序，而不是背代码模板。',
    goals: [
      '理解 merge sort 的 split、sort、merge。',
      '理解 quicksort 的 pivot、partition、recursive sort。',
      '会比较递归排序的运行时间和空间权衡。',
    ],
    coreSummary: '递归排序把大问题拆成小问题，小问题排好后再组合成整体有序。',
    coreIntro:
      '排序是递归思想的综合练习：base case、recursive case、combine 和 runtime 都在同一个算法里出现。',
    vocabulary: [
      ['divide and conquer', '分解问题、解决子问题、合并结果。'],
      ['merge', '把两个已排序序列合成一个已排序序列。'],
      ['pivot', 'quicksort 中用来划分小于/大于区间的元素。'],
      ['partition', '按 pivot 把数据分成几组。'],
      ['stable sort', '相等元素保持原相对顺序的排序。'],
    ],
    coreQuestions: [
      'base case 是什么规模？',
      '递归调用处理的是哪些子列表？',
      'combine 步骤是否假设子结果已经排序？',
      '每一层做多少额外工作，总共有多少层？',
    ],
    tracingRecipe: [
      '先画 split 或 partition 的结果。',
      '对子列表递归排序，直到长度 0 或 1。',
      '回到上一层时执行 merge 或拼接。',
      'runtime 分析时分别数层数和每层工作。',
    ],
    goodTrace: [
      '能看出每个子问题更小。',
      'merge sort trace 有合并阶段。',
      'quicksort trace 有 pivot 和 partition。',
    ],
    examples: [
      {
        title: 'merge sort trace',
        prompt: '追踪 `[4, 1, 3, 2]`。',
        code: `
split: [4, 1] and [3, 2]
sort each half
merge [1, 4] and [2, 3]
        `,
        trace: ['每半再拆到单元素。', '单元素天然有序。', '合并时每次取两个有序列表当前较小者。'],
        answer: '最终得到 `[1, 2, 3, 4]`。',
      },
      {
        title: 'quicksort partition',
        prompt: '选择 pivot 3 后如何分组？',
        code: `
items = [4, 1, 3, 2, 5]
pivot = 3
        `,
        trace: [
          '小于 pivot: `[1, 2]`。',
          '等于 pivot: `[3]`。',
          '大于 pivot: `[4, 5]`。',
          '递归排序小于组和大于组。',
        ],
        answer: '组合为 sorted(smaller) + equal + sorted(larger)。',
      },
      {
        title: 'runtime 直觉',
        prompt: '为什么 merge sort 是 $O(n \\log n)$？',
        code: '',
        trace: [
          '每层 merge 总共处理 n 个元素。',
          '每次规模大约减半，所以层数是 $\\log n$。',
          '总工作是每层 $n$ 乘以层数 $\\log n$。',
        ],
        answer: '$O(n \\log n)$。',
      },
    ],
    pitfalls: [
      {
        title: '忘记 combine 的前提',
        why: 'merge 只有在两边已经排序时才正确。',
        fix: '先递归排序子列表，再 merge。',
      },
      {
        title: 'quicksort pivot 选择影响性能',
        why: '极端不平衡 partition 会退化。',
        fix: '分析 worst-case 和 average-case 时要分开说。',
      },
      {
        title: '把 slicing 成本忽略得太随意',
        why: 'Python slicing 会创建新列表。',
        fix: '课程题若关心精确成本，要把复制成本也算进去。',
      },
    ],
    practice: [
      {
        title: '手画 merge',
        prompt: '把 `[1, 5, 8]` 和 `[2, 3, 7]` 合并。',
        code: '',
        check: '每一步比较两个列表当前第一个元素。',
      },
      {
        title: 'quicksort 一层',
        prompt: '对 `[6, 2, 9, 1, 6]` 用 pivot 6 分组。',
        code: '',
        check: '注意等于 pivot 的元素不应该丢。',
      },
    ],
    checklist: [
      '我能画 merge sort 的 split 和 merge。',
      '我能画 quicksort 的 partition。',
      '我能解释 $O(n \\log n)$ 的层数乘每层工作。',
      '我能说出 quicksort worst-case 为什么可能变差。',
    ],
  },
];

const LATE_NOTEBOOK_OVERRIDES = {
  '07': {
    topicKey: 'linked-lists',
    name: '07 - Linked Lists：节点、链接与变异',
    description:
      'CSC148 中文 Markdown 笔记：linked list nodes、head、next、traversal、mutation 与运行时间。',
    tags: ['CSC148', 'linked list', 'node', 'mutation'],
    imageSource: 'csc148-08-linked-lists.png',
    imageAlt: '链表是一串节点卡片，每个节点保存值和到下一个节点的引用。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/linked-lists/linked_list_intro.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/linked-lists/linked_list_traversal.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/linked-lists/linked_list_mutation.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/linked-lists/linked_list_efficiency.html',
    ],
    customSections: [
      {
        title: '为什么需要 Linked List',
        summary: '链表用引用连接节点，和 Python list 的连续存储模型完全不同。',
        markdown: m`
Python \`list\` 很适合按 index 访问元素：

~~~python
items[0]
items[10]
items[i]
~~~

但它的代价是：元素引用通常连续存放。要在开头插入或删除时，后面的许多元素都可能需要移动。

**Linked List** 采用另一种想法：

> 不要求元素连续存放；每个节点自己保存“下一个节点在哪里”。

![链表是一串节点卡片，每个节点保存值和到下一个节点的引用。](/generated-notebooks/queue-csc148-07-exceptions-runtime/csc148-08-linked-lists.png)

一个链表不是靠 index 组织起来的，而是靠一串引用组织起来的：

~~~text
head -> nodeA -> nodeB -> nodeC -> None
~~~

这会改变你读代码的方式：

- Python list 的问题常常是“第 i 个位置在哪里”。
- Linked list 的问题常常是“我现在手里有哪个节点的引用”。
- 修改 linked list 通常不是移动数据，而是修改 \`next\` 引用。

这一章的核心模型很朴素：

> 节点里存数据，节点之间用引用连接。
        `,
      },
      {
        title: 'Node：链表的最小单位',
        summary: '每个节点保存 item 和 next；next 要么指向下一个节点，要么是 None。',
        markdown: m`
链表通常从一个内部节点类开始：

~~~python
from typing import Any


class _Node:
    """A node in a linked list.

    Instance Attributes:
    - item: The data stored in this node.
    - next: The next node in the list, or None if there is no next node.
    """
    item: Any
    next: _Node | None

    def __init__(self, item: Any) -> None:
        """Initialize a new node storing item."""
        self.item = item
        self.next = None
~~~

\`_Node\` 前面的下划线表示：这是实现细节，不是 client 应该直接使用的 public class。

一个三节点链表可以这样手动搭出来：

~~~python
first = _Node('A')
second = _Node('B')
third = _Node('C')

first.next = second
second.next = third
~~~

内存图应该读成：

~~~text
first -> ['A' | next] -> ['B' | next] -> ['C' | None]
~~~

注意这里的 \`next\` 存的是引用，不是把整个下一个节点“嵌进来”。这和第一章的 memory model 是同一套思想：变量和 attributes 保存对象 id，id 对应的对象存在对象区。
        `,
      },
      {
        title: 'LinkedList class：只暴露链表操作',
        summary: 'LinkedList 对外提供方法，对内只保存 head 这个入口引用。',
        markdown: m`
client 不应该直接拿 \`_Node\` 拼链表。更好的设计是提供一个 \`LinkedList\` class。

~~~python
class LinkedList:
    """A linked list implementation of the List ADT.

    Private Instance Attributes:
    - _first: The first node in this linked list, or None if this list is empty.
    """
    _first: _Node | None

    def __init__(self) -> None:
        """Initialize an empty linked list."""
        self._first = None
~~~

这里 \`_first\` 是链表入口，也常叫 head。

空链表：

~~~text
_first -> None
~~~

非空链表：

~~~text
_first -> nodeA -> nodeB -> nodeC -> None
~~~

这个设计和 ADT 章节连在一起：

- client 看到的是 \`LinkedList\` 的 public methods。
- implementer 管理 \`_first\` 和 \`_Node.next\`。
- client 不应该依赖 \`_first\`、\`_Node\`、\`next\` 这些 private representation。

链表的 RI 通常至少包括：

- 从 \`_first\` 出发，沿 \`next\` 最终会到达 \`None\`。
- 每个 \`next\` 要么是 \`_Node\`，要么是 \`None\`。
- 链表不应该形成环，除非这个 class 明确设计成 cyclic structure。
        `,
      },
      {
        title: 'Traversal：沿 next 一步步走',
        summary: '链表没有随机访问；遍历时用 curr 移动，保留 head 不动。',
        markdown: m`
链表最常见的代码模板是 traversal。

例如求长度：

~~~python
def __len__(self) -> int:
    """Return the number of items in this linked list."""
    curr = self._first
    count = 0

    while curr is not None:
        count += 1
        curr = curr.next

    return count
~~~

关键变量是 \`curr\`。

追踪时这样想：

1. \`curr\` 一开始指向第一个节点。
2. 当前节点处理完后，执行 \`curr = curr.next\`。
3. \`curr\` 指向下一个节点。
4. 如果 \`curr is None\`，说明已经走过最后一个节点。

为什么不用 \`self._first = self._first.next\`？

因为 \`self._first\` 是链表入口。遍历时改掉入口，就可能让前面的节点从链表中消失。遍历应该移动临时变量 \`curr\`，不是移动 head。

查找某个 item 也是同一个模板：

~~~python
def __contains__(self, item: Any) -> bool:
    """Return whether item is in this linked list."""
    curr = self._first

    while curr is not None:
        if curr.item == item:
            return True
        curr = curr.next

    return False
~~~

这两个例子都说明：linked list 的基本动作不是 indexing，而是沿引用走。
        `,
      },
      {
        title: 'Index-based access：为什么是 O(n)',
        summary: '访问第 i 个节点必须从 head 走 i 步，不能像 Python list 一样直接跳过去。',
        markdown: m`
如果要实现 \`lst[i]\` 这样的操作，链表必须从头开始数。

~~~python
def get_at(self, index: int) -> Any:
    """Return the item at position index.

    Preconditions:
    - index >= 0
    - index < len(self)
    """
    curr = self._first
    curr_index = 0

    while curr_index < index:
        curr = curr.next
        curr_index += 1

    return curr.item
~~~

这里即使你想访问第 500 个节点，也必须经过前 499 个节点。

所以：

| 操作 | Python list | linked list |
| --- | --- | --- |
| 访问 \`i\` 号位置 | $O(1)$ | $O(n)$ |
| 从 head 开始遍历所有元素 | $O(n)$ | $O(n)$ |

这就是数据结构取舍：

- Python list 牺牲开头插入/删除，换来快速 index access。
- Linked list 牺牲快速 index access，换来局部 relink 的灵活性。

注意这里的 $n$ 是链表长度。分析 linked list 时，输入规模经常不是“代码里有几个变量”，而是“从 head 能走到多少个节点”。
        `,
      },
      {
        title: 'Insertion：插入不是移动元素，而是改链接',
        summary: '链表插入的关键是先保住旧链，再让前一个节点指向新节点。',
        markdown: m`
在链表开头插入最简单：

~~~python
def prepend(self, item: Any) -> None:
    """Add item to the front of this linked list."""
    new_node = _Node(item)
    new_node.next = self._first
    self._first = new_node
~~~

顺序不能随便换。

正确顺序：

~~~text
new_node.next -> old first
_first -> new_node
~~~

如果先写 \`self._first = new_node\`，旧的链表入口就丢了，后面再想接回去会很麻烦。

插入到中间时，需要找到插入位置前一个节点：

~~~python
def insert_after(prev: _Node, item: Any) -> None:
    """Insert item after prev."""
    new_node = _Node(item)
    new_node.next = prev.next
    prev.next = new_node
~~~

画图时看三件事：

1. \`prev\` 原来指向谁。
2. \`new_node.next\` 先接到旧的后继节点。
3. \`prev.next\` 再改成新节点。

链表插入的本质是 relink。节点对象没有被平移，后面的节点也没有被整体搬家。
        `,
      },
      {
        title: 'Deletion：删除节点就是让链绕过它',
        summary: '删除中间节点需要 previous；删除 head 是一个单独入口更新。',
        markdown: m`
删除链表节点时，不是把对象“擦掉”。你做的是让链表入口不再能走到它。

删除 head：

~~~python
def remove_first(self) -> None:
    """Remove the first item from this linked list.

    Preconditions:
    - self._first is not None
    """
    self._first = self._first.next
~~~

删除中间节点：

~~~python
prev.next = curr.next
~~~

这里：

- \`curr\` 是要删除的节点。
- \`prev\` 是 \`curr\` 前面的节点。
- 改完后，从 \`prev\` 会直接走到 \`curr.next\`。

为什么必须有 \`prev\`？

因为单向链表的节点只知道“下一个是谁”，不知道“上一个是谁”。如果你手里只有 \`curr\`，就不能直接修改前一个节点的 \`next\`。

所以很多删除算法会同时维护两个变量：

~~~python
prev = None
curr = self._first

while curr is not None and curr.item != item:
    prev = curr
    curr = curr.next
~~~

找到后还要分两种情况：

- \`prev is None\`：删除的是 head。
- \`prev is not None\`：删除的是中间或末尾节点。
        `,
      },
      {
        title: 'Linked List 的运行时间取舍',
        summary: '链表的优势不是所有操作都快，而是在已知节点位置时 relink 很快。',
        markdown: m`
Linked list 和 Python list 的差别可以整理成这张表：

| 操作 | Python list | linked list |
| --- | --- | --- |
| 访问 index \`i\` | $O(1)$ | $O(n)$ |
| 搜索某个值 | $O(n)$ | $O(n)$ |
| 在开头插入 | $O(n)$ | $O(1)$ |
| 在开头删除 | $O(n)$ | $O(1)$ |
| 已经有前一个节点时插入/删除 | 通常需要移动元素 | $O(1)$ |

这张表不要机械背，要理解原因：

- Python list 依赖连续位置，所以 index access 快。
- Linked list 依赖节点引用，所以从头走到第 i 个位置慢。
- 但 linked list 一旦拿到相关节点，改 \`next\` 引用很快。

所以 linked list 不是“更高级的 list”。它适合另一类问题：你经常在局部插入/删除，并且可以自然地拿到附近节点。

后面学 trees、BST 时会继续用同一个思想：对象之间用引用连接，结构本身不再是线性的连续数组。
        `,
      },
    ],
  },
  '08': {
    topicKey: 'recursion',
    name: '08 - Recursion：递归结构、调用栈与分支',
    description:
      'CSC148 中文 Markdown 笔记：base case、recursive case、nested lists、partial tracing、call stack 与 branching recursion。',
    tags: ['CSC148', 'recursion', 'call stack', 'nested list'],
    imageSource: 'csc148-09-recursion-basics.png',
    imageAlt: '递归像嵌套任务盒：每层处理更小的同类问题，直到 base case。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/recursion_motivation.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/nested_lists.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/partial_tracing.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/writing_recursive_functions_a.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/writing_recursive_functions_b.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/recursion_failures.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/full_tracing.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursion/branching_recursion.html',
    ],
    customSections: [
      {
        title: '递归到底在解决什么问题',
        summary: '递归适合把一个问题拆成同类型的小问题，而不是为了少写循环。',
        markdown: m`
递归不是“函数调用自己”这么简单。真正重要的是：

> 当前问题可以拆成一个或多个更小的同类问题。

![递归像嵌套任务盒：每层处理更小的同类问题，直到 base case。](/generated-notebooks/queue-csc148-08-linked-lists/csc148-09-recursion-basics.png)

最简单的例子是列表求和：

~~~python
def sum_list(nums: list[int]) -> int:
    """Return the sum of nums."""
    if nums == []:
        return 0
    else:
        return nums[0] + sum_list(nums[1:])
~~~

这里的拆分是：

- 整个列表的和
- 等于第一个元素
- 加上剩下列表的和

\`sum_list(nums[1:])\` 仍然是“对一个 list[int] 求和”，只是输入更短。

递归函数必须回答两个问题：

1. **base case**：什么时候可以直接回答？
2. **recursive case**：怎样把问题变成更小的同类问题？

如果这两个问题不清楚，递归代码通常会变成靠感觉写。
        `,
      },
      {
        title: 'Base Case 和 Recursive Case',
        summary: 'base case 让递归停下；recursive case 负责向更小的问题前进。',
        markdown: m`
递归函数的结构通常长这样：

~~~python
def f(problem):
    if problem is small enough:
        return direct_answer
    else:
        smaller_answer = f(smaller_problem)
        return combine_current_layer_with(smaller_answer)
~~~

以 factorial 为例：

~~~python
def factorial(n: int) -> int:
    """Return n!.

    Preconditions:
    - n >= 0
    """
    if n == 0:
        return 1
    else:
        return n * factorial(n - 1)
~~~

这里：

- base case：\`n == 0\`
- recursive case：\`n * factorial(n - 1)\`
- progress measure：\`n\` 每次减少 1

如果缺少 progress，递归不会停：

~~~python
def bad_factorial(n: int) -> int:
    if n == 0:
        return 1
    else:
        return n * bad_factorial(n)
~~~

这段代码的问题不是语法，而是 \`n\` 没有变小。每一层都把同一个问题丢给下一层。
        `,
      },
      {
        title: 'Nested List：递归数据结构',
        summary: 'nested list 的元素本身可能还是 nested list，所以天然适合递归。',
        markdown: m`
递归最自然的场景是递归数据结构。

例如 nested list：

~~~python
NestedIntList = int | list['NestedIntList']
~~~

它的定义是递归的：

- 一个 nested int list 可以是一个 \`int\`。
- 也可以是一个 list，里面每个元素又是 nested int list。

例子：

~~~python
3
[1, 2, 3]
[1, [2, 3], [], [4, [5]]]
~~~

统计里面有多少个 int：

~~~python
def count_ints(obj: int | list) -> int:
    """Return the number of integers in obj."""
    if isinstance(obj, int):
        return 1
    else:
        total = 0
        for sublist in obj:
            total += count_ints(sublist)
        return total
~~~

重点是：循环不是递归的对立面。这里外层 list 需要循环遍历每个元素，而每个元素可能需要递归处理。

对 \`[1, [2, 3], []]\`：

- \`1\` 贡献 1。
- \`[2, 3]\` 递归后贡献 2。
- \`[]\` 递归后贡献 0。
- 总数是 3。
        `,
      },
      {
        title: 'isinstance 在递归中的作用',
        summary: 'nested list 递归需要在运行时区分 int base case 和 list recursive case。',
        markdown: m`
在 nested list 代码里，\`isinstance\` 不是可有可无的语法点。它正好对应递归定义的两种情况。

Nested int list 的定义是：

- 如果对象是 \`int\`，它本身就是一个最小 nested list。
- 如果对象是 \`list\`，它里面的每个元素又是 nested list。

所以代码里的分支应该贴着这个定义写：

~~~python
def sum_nested(obj: int | list) -> int:
    """Return the sum of all integers in obj."""
    if isinstance(obj, int):
        return obj
    else:
        total = 0
        for sublist in obj:
            total += sum_nested(sublist)
        return total
~~~

这里 \`isinstance(obj, int)\` 负责识别 base case。只要它是 \`int\`，就不应该继续循环，因为 \`int\` 里面没有子元素。

如果 \`obj\` 不是 \`int\`，根据 type contract \`obj: int | list\`，它就应该是 \`list\`。这时进入 recursive case，遍历每个 sub-nested-list。

常见错误是直接写：

~~~python
for sublist in obj:
    total += sum_nested(sublist)
~~~

如果 \`obj\` 是 \`5\`，这段代码会尝试遍历一个 integer，直接报错。也就是说，它没有处理递归结构中最小的那种对象。

还要注意：\`type(obj) == list\` 通常不如 \`isinstance(obj, list)\` 灵活。后面遇到继承时，\`isinstance\` 会把 subclass 也算作对应 superclass 的 instance。

在递归题里可以把 \`isinstance\` 当作一句问题：

> 当前这一层是 base case，还是 recursive case？
        `,
      },
      {
        title: 'Partial Tracing：不要展开整棵调用树',
        summary: '用递归假设读代码，比手动展开每一层更稳定。',
        markdown: m`
递归追踪有两种方式。

第一种是 full tracing：把每一次调用都画出来。它适合小输入，但很快变得很长。

第二种是 partial tracing：只追踪当前层，并假设递归调用能正确处理更小输入。

看这个函数：

~~~python
def nested_sum(obj: int | list) -> int:
    """Return the sum of all integers in obj."""
    if isinstance(obj, int):
        return obj
    else:
        total = 0
        for sublist in obj:
            total += nested_sum(sublist)
        return total
~~~

如果输入是：

~~~python
[10, [20, 30], [40]]
~~~

partial tracing 可以这样写：

1. 当前对象是 list，不是 int。
2. 对每个元素调用 \`nested_sum\`。
3. 根据递归假设：
   - \`nested_sum(10)\` 返回 10。
   - \`nested_sum([20, 30])\` 返回 50。
   - \`nested_sum([40])\` 返回 40。
4. 当前层把它们加起来，返回 100。

这不是偷懒，而是递归设计的核心：相信更小问题已经被同一个函数正确解决，然后专注当前层如何组合答案。
        `,
      },
      {
        title: '递归设计配方',
        summary: '先识别结构，再写 base case，最后用递归假设完成当前层。',
        markdown: m`
写递归函数时，可以按这个顺序来：

1. 确定输入的递归结构。
2. 写出最小情况，也就是 base case。
3. 写出怎样得到更小的同类输入。
4. 假设递归调用已经正确。
5. 写当前层如何组合结果。

例子：判断 nested list 里是否包含某个值。

~~~python
def nested_contains(obj: int | list, target: int) -> bool:
    """Return whether target appears in obj."""
    if isinstance(obj, int):
        return obj == target
    else:
        for sublist in obj:
            if nested_contains(sublist, target):
                return True
        return False
~~~

这里的 base case 是 \`obj\` 是 int。recursive case 是 \`obj\` 是 list，于是对每个元素递归。

注意短路逻辑：只要某个子结构里找到了 target，就可以直接返回 \`True\`。如果所有子结构都没有，才返回 \`False\`。

递归函数不一定都要加总。有些递归是在找、有些是在判断、有些是在构造新结构。关键是你要说清楚递归调用的返回值代表什么。
        `,
      },
      {
        title: 'Call Stack：每次调用都有自己的 frame',
        summary: '递归不是同一组变量反复改；每次调用都会创建新的局部 frame。',
        markdown: m`
递归难追踪，是因为同一个函数会同时有多层未完成的调用。

~~~python
def factorial(n: int) -> int:
    if n == 0:
        return 1
    else:
        return n * factorial(n - 1)

factorial(3)
~~~

到达 base case 前，call stack 里大致是：

~~~text
factorial(0)
factorial(1)
factorial(2)
factorial(3)
main
~~~

每一层都有自己的 \`n\`：

- \`factorial(3)\` 的 \`n\` 是 3。
- \`factorial(2)\` 的 \`n\` 是 2。
- \`factorial(1)\` 的 \`n\` 是 1。
- \`factorial(0)\` 的 \`n\` 是 0。

当 \`factorial(0)\` 返回 1 后，调用栈开始 unwind：

~~~text
factorial(1) returns 1 * 1 = 1
factorial(2) returns 2 * 1 = 2
factorial(3) returns 3 * 2 = 6
~~~

所以递归 trace 必须写两段：调用向下走，以及返回向上合并。
        `,
      },
      {
        title: 'Branching Recursion',
        summary: '一个调用产生多个递归调用时，trace 形状是树，不是一条线。',
        markdown: m`
有些递归每一层只产生一个递归调用，叫 linear recursion。

有些递归会产生多个递归调用，叫 branching recursion。

典型例子：

~~~python
def fib(n: int) -> int:
    """Return the nth Fibonacci number.

    Preconditions:
    - n >= 0
    """
    if n <= 1:
        return n
    else:
        return fib(n - 1) + fib(n - 2)
~~~

\`fib(4)\` 的调用关系像这样：

~~~text
fib(4)
├─ fib(3)
│  ├─ fib(2)
│  │  ├─ fib(1)
│  │  └─ fib(0)
│  └─ fib(1)
└─ fib(2)
   ├─ fib(1)
   └─ fib(0)
~~~

这里 \`fib(2)\` 被重复计算了。这就是 branching recursion 的重要运行时间风险：代码很短，但调用数量可能增长很快。

遇到 branching recursion，不要把 trace 挤成一条竖线。它的自然形状就是树。
        `,
      },
      {
        title: '递归常见错误',
        summary: '递归错误通常来自 base case 不对、输入没有变小、或者子结果组合错。',
        markdown: m`
递归 bug 通常不是随机的。常见有四类。

### 1. base case 不完整

~~~python
def first(nums: list[int]) -> int:
    return nums[0]
~~~

如果空列表是可能输入，就必须处理；如果空列表不允许，就要写 precondition。

### 2. 输入没有变小

~~~python
return sum_list(nums)
~~~

这会把同一个问题交给下一层，永远到不了 base case。

### 3. recursive case 没有连接到 base case

例如每次递归虽然变化了，但可能跳不过某些状态，或者在某些分支里不变小。

### 4. 组合子结果时含义错了

~~~python
def count_ints(obj: int | list) -> int:
    if isinstance(obj, int):
        return obj
~~~

如果函数目标是“数 int 个数”，base case 应该返回 1，不是返回这个 int 的值。

调试递归时，先别急着 print 很多层。先问：

- base case 是否覆盖了最小输入？
- 每次递归调用的输入是否更小？
- 递归调用返回值的含义和函数 docstring 是否一致？
        `,
      },
    ],
  },
  '09': {
    topicKey: 'binary-search-trees',
    name: '09 - Binary Search Trees：有序树与搜索',
    description:
      'CSC148 中文 Markdown 笔记：BST invariant、search、insert、delete、height 与 worst-case/best-case。',
    tags: ['CSC148', 'BST', 'tree', 'search'],
    imageSource: 'csc148-11-trees-bsts.png',
    imageAlt: 'BST 的搜索路径由 root 比较决定，每一步只保留左或右子树。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/binary-search-trees/bst_intro.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/binary-search-trees/bst_implementation.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/binary-search-trees/bst_mutation.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/binary-search-trees/bst_efficiency.html',
    ],
    customSections: [
      {
        title: 'BST 是带顺序约束的 Tree',
        summary: 'BST 在普通二叉树上加入 invariant，让搜索可以每一步丢掉半边。',
        markdown: m`
Binary Search Tree，简称 **BST**，是一种带有顺序约束的二叉树。

![BST 的搜索路径由 root 比较决定，每一步只保留左或右子树。](/generated-notebooks/queue-csc148-09-recursion-basics/csc148-11-trees-bsts.png)

BST 的核心 invariant：

> 对每个节点，左子树里的所有值都小于当前节点；右子树里的所有值都大于当前节点。

一棵 BST 可以这样画：

~~~text
        10
       /  \\
      4    15
     / \\     \\
    2   7     20
~~~

检查 root 10：

- 左边 4、2、7 都小于 10。
- 右边 15、20 都大于 10。

还要递归检查每棵子树：

- 以 4 为 root 的子树也满足 BST invariant。
- 以 15 为 root 的子树也满足 BST invariant。

所以 BST invariant 不是只检查 root 一层，而是每一个节点都要满足。
        `,
      },
      {
        title: 'Multiset ADT 和 BST 的关系',
        summary: 'BST 常用来实现支持 search、insert、delete 的集合类 ADT。',
        markdown: m`
BST 常常用来实现 Set 或 Multiset 这样的 ADT。

一个 Multiset 可以支持：

- \`contains(item)\`
- \`insert(item)\`
- \`delete(item)\`
- \`is_empty()\`

ADT 层面只关心这些操作的行为。BST 是一种 implementation choice。

为什么 BST 适合做这种实现？

因为有了顺序 invariant，搜索不用扫描所有元素。

假设搜索 7：

~~~text
        10
       /  \\
      4    15
     / \\     \\
    2   7     20
~~~

追踪：

1. 7 小于 10，所以右子树全部丢掉。
2. 7 大于 4，所以 4 的左子树丢掉。
3. 到达 7，找到。

每一步都用比较结果决定方向。这是 BST 和普通 tree 最大的不同。
        `,
      },
      {
        title: 'BST 的表示与空树',
        summary: '实现 BST 时，空树通常是一个 root 为 None 的对象，而不是 None 本身。',
        markdown: m`
一种常见实现是：

~~~python
from typing import Any


class BinarySearchTree:
    """A Binary Search Tree.

    Private Instance Attributes:
    - _root: The item stored at the root, or None if this tree is empty.
    - _left: The left subtree.
    - _right: The right subtree.
    """
    _root: Any | None
    _left: BinarySearchTree | None
    _right: BinarySearchTree | None
~~~

空树可以表示为：

~~~python
self._root = None
self._left = None
self._right = None
~~~

非空树通常满足：

~~~python
self._root is not None
self._left is not None
self._right is not None
~~~

这样做的好处是：每棵子树本身仍然是 \`BinarySearchTree\` 对象，递归方法写起来一致。

但也带来一个 RI：

- 如果 \`_root is None\`，那么 \`_left\` 和 \`_right\` 都应该是 \`None\`。
- 如果 \`_root is not None\`，那么左右子树应该是 \`BinarySearchTree\`。
- 左子树所有元素小于 root。
- 右子树所有元素大于 root。
        `,
      },
      {
        title: 'Search：每一步只走一边',
        summary: 'BST search 的关键是利用 invariant，而不是遍历整棵树。',
        markdown: m`
BST search 可以写成：

~~~python
def __contains__(self, item: Any) -> bool:
    """Return whether item is in this BST."""
    if self.is_empty():
        return False
    elif item == self._root:
        return True
    elif item < self._root:
        return item in self._left
    else:
        return item in self._right
~~~

这段代码最重要的是两个 \`elif\`：

- \`item < self._root\`：只搜左边。
- \`item > self._root\`：只搜右边。

如果你在 BST search 里同时搜左右两边，就没有用上 BST invariant。

追踪搜索 20：

~~~text
10 -> 15 -> 20
~~~

每一步都是一次比较：

1. 20 > 10，走右。
2. 20 > 15，走右。
3. 20 == 20，找到。

搜索失败也类似。只要走到空树，就说明目标不存在，因为每一步被丢掉的半边都不可能包含目标。
        `,
      },
      {
        title: 'Insert：递归地找到空位置',
        summary: '插入新值时保持 BST invariant，目标是把 item 放到正确的空子树位置。',
        markdown: m`
BST insert 的基本思路：

1. 如果当前树为空，把 item 放到 root。
2. 如果 item 小于 root，插入左子树。
3. 如果 item 大于 root，插入右子树。
4. 如果 item 等于 root，看 ADT 规格决定是否允许重复。

代码骨架：

~~~python
def insert(self, item: Any) -> None:
    """Insert item into this BST."""
    if self.is_empty():
        self._root = item
        self._left = BinarySearchTree()
        self._right = BinarySearchTree()
    elif item < self._root:
        self._left.insert(item)
    elif item > self._root:
        self._right.insert(item)
~~~

追踪插入 6：

~~~text
        10
       /
      4
       \\
        7
~~~

1. 6 < 10，去左子树。
2. 6 > 4，去右子树。
3. 6 < 7，去 7 的左子树。
4. 该位置为空，放入 6。

插入不是“找一个 list 位置插进去”，而是沿比较路径找到一棵空子树。
        `,
      },
      {
        title: 'Delete：最麻烦的是两个 children',
        summary: '删除节点时要同时保持二叉树结构和 BST invariant。',
        markdown: m`
BST deletion 分情况讨论。

### 1. 删除 leaf

直接让这棵子树变空。

### 2. 删除只有一个 child 的节点

用唯一的 child 替代当前节点。

### 3. 删除有两个 children 的节点

不能随便拿一个 child 上来，因为可能破坏 BST invariant。

常见做法：

1. 找到当前节点的 predecessor，也就是左子树里最大的值。
2. 用 predecessor 替换当前 root。
3. 在左子树中删除那个 predecessor。

为什么 predecessor 合适？

- 它小于当前节点右子树里的所有值。
- 它大于或等于当前节点左子树里剩余的所有值。
- 放到 root 位置后，左右顺序仍然成立。

也可以使用 successor：右子树里最小的值。思想相同。

删除题一定要画图。只靠脑子想，很容易把某一棵子树弄丢。
        `,
      },
      {
        title: 'Height 决定效率',
        summary: 'BST search/insert/delete 的时间取决于走过的高度，不只取决于元素个数。',
        markdown: m`
BST 的搜索路径从 root 往下走，所以运行时间和树高有关。

如果树比较平衡：

~~~text
        8
      /   \\
     4     12
    / \\   /  \\
   2   6 10  14
~~~

搜索路径长度大约是 $\\log n$。

如果树退化成一条链：

~~~text
2
 \\
  4
   \\
    6
     \\
      8
~~~

搜索路径可能是 $n$。

所以：

| 情况 | search / insert |
| --- | --- |
| best / balanced | $O(\\log n)$ |
| worst / chain-like | $O(n)$ |

BST 不是自动保证快速。它快的前提是高度小。输入顺序、插入策略、是否自平衡都会影响高度。
        `,
      },
      {
        title: 'BST Trace 的检查清单',
        summary: 'BST 题最重要的是每一步说明比较结果和被丢弃的子树。',
        markdown: m`
做 BST 题时，每一步 trace 都应该写出：

- 当前 root 是什么。
- 目标值和 root 的比较结果。
- 下一步走左还是右。
- 哪一半被排除，为什么。

例如搜索 5：

~~~text
        10
       /  \\
      4    15
     / \\ 
    2   7
~~~

trace：

1. 5 < 10，所以只可能在左子树。
2. 5 > 4，所以只可能在 4 的右子树。
3. 5 < 7，所以只可能在 7 的左子树。
4. 7 的左子树为空，因此 5 不在树中。

这个答案比“没找到”好，因为它展示了 BST invariant 如何一步步排除不可能的区域。

记住一句话：

> 普通 tree search 可能要看所有节点；BST search 每一步只保留一个方向。
        `,
      },
    ],
  },
  10: {
    topicKey: 'trees',
    name: '10 - Trees：递归树结构与遍历',
    description:
      'CSC148 中文 Markdown 笔记：root、subtrees、tree recursion、traversal、mutation 与 expression trees。',
    tags: ['CSC148', 'trees', 'recursion', 'traversal'],
    imageSource: 'csc148-11-trees-bsts.png',
    imageAlt: '树由 root 和 subtrees 递归组成，每棵 subtree 仍然是一棵 tree。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/trees/tree_introduction.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/trees/tree_implementation.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/trees/mutating_trees.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/trees/expression_trees.html',
    ],
    customSections: [
      {
        title: 'Tree 是非线性的递归结构',
        summary: 'tree 的每个 child 又是 subtree，所以 tree 方法天然用递归表达。',
        markdown: m`
Linked list 每个节点最多只有一个 next。Tree 不同：一个节点可以有多个 children。

![树由 root 和 subtrees 递归组成，每棵 subtree 仍然是一棵 tree。](/generated-notebooks/queue-csc148-10-recursion-tracing/csc148-11-trees-bsts.png)

tree 的递归定义：

> 一棵 tree 有一个 root value，以及零棵或多棵 subtrees。

例子：

~~~text
        A
      / | \\
     B  C  D
       / \\
      E   F
~~~

这里：

- \`A\` 是 root。
- \`B\`、\`C\`、\`D\` 是 A 的 children。
- 以 \`C\` 为 root 的部分也是一棵 tree。
- \`B\`、\`E\`、\`F\`、\`D\` 是 leaves。

Tree 题的关键不是“从左到右扫”，而是：

> 当前 root 做一部分工作，把剩下的同类问题交给 subtrees。
        `,
      },
      {
        title: 'Tree class 的表示',
        summary: '一个 Tree object 保存 root 和 subtrees；subtrees 是 Tree 对象列表。',
        markdown: m`
一种常见实现：

~~~python
from typing import Any


class Tree:
    """A recursive tree data structure.

    Private Instance Attributes:
    - _root: The item stored at this tree's root, or None if the tree is empty.
    - _subtrees: The list of all subtrees of this tree.
    """
    _root: Any | None
    _subtrees: list[Tree]
~~~

空树：

~~~python
self._root = None
self._subtrees = []
~~~

非空树：

~~~python
self._root is not None
self._subtrees == [Tree(...), Tree(...), ...]
~~~

这个表示有一个重要 RI：

- 如果 \`_root is None\`，那么 \`_subtrees\` 必须为空。
- 如果 \`_root is not None\`，那么 \`_subtrees\` 中每个元素都是 \`Tree\`。

为什么不是 \`_children: list[Any]\`？

因为 child 不是只有一个值。child 下面可能还有自己的 children。用 \`list[Tree]\` 才能表达完整 subtree。
        `,
      },
      {
        title: 'Tree Recursion：root + subtrees',
        summary: '写 tree 方法时，通常先处理 root，再递归处理每一棵 subtree。',
        markdown: m`
求 tree 中所有值的数量：

~~~python
def __len__(self) -> int:
    """Return the number of items in this tree."""
    if self.is_empty():
        return 0
    else:
        size = 1
        for subtree in self._subtrees:
            size += len(subtree)
        return size
~~~

结构是：

1. 空树直接返回 0。
2. 非空树的 root 贡献 1。
3. 每棵 subtree 的大小由递归调用给出。
4. 当前层把结果加起来。

求 tree 中是否包含某个 item：

~~~python
def __contains__(self, item: Any) -> bool:
    """Return whether item is in this tree."""
    if self.is_empty():
        return False
    elif self._root == item:
        return True
    else:
        for subtree in self._subtrees:
            if item in subtree:
                return True
        return False
~~~

这段代码会在普通 tree 中搜索，最坏情况下可能看完所有节点。和 BST 不同，普通 tree 没有大小顺序帮助你排除某些 subtree。
        `,
      },
      {
        title: 'Traversal：访问顺序本身也是设计',
        summary: 'preorder、postorder 和 level-order 给出不同的访问顺序和用途。',
        markdown: m`
Tree traversal 指按某种顺序访问所有节点。

### Preorder

先访问 root，再访问 subtrees。

~~~python
def preorder(t: Tree) -> list:
    if t.is_empty():
        return []

    items = [t._root]
    for subtree in t._subtrees:
        items.extend(preorder(subtree))
    return items
~~~

### Postorder

先访问 subtrees，最后访问 root。

~~~python
def postorder(t: Tree) -> list:
    if t.is_empty():
        return []

    items = []
    for subtree in t._subtrees:
        items.extend(postorder(subtree))
    items.append(t._root)
    return items
~~~

对于这棵树：

~~~text
        A
      / | \\
     B  C  D
       / \\
      E   F
~~~

- preorder: A, B, C, E, F, D
- postorder: B, E, F, C, D, A

Traversal 的区别不是语法细节，而是“什么时候处理 root”。
        `,
      },
      {
        title: 'Tree Mutation：空树是特殊情况',
        summary: '修改 tree 时，要同时维护 root/subtrees 的 RI，尤其小心空树。',
        markdown: m`
Tree mutation 比只读递归更容易错，因为要维护 representation invariant。

例如向 tree 添加一个 child：

~~~python
def add_subtree(self, subtree: Tree) -> None:
    """Add subtree as a subtree of this tree.

    Preconditions:
    - not self.is_empty()
    """
    self._subtrees.append(subtree)
~~~

这里 precondition 很重要：空树没有 root，给空树添加 child 会让结构变得奇怪。

删除某个值时，也要小心：

- 如果删除 root，要决定整棵树如何重组。
- 如果删除 subtree 中的某个值，要递归修改那棵 subtree。
- 如果某棵 subtree 变空，要决定是否从 \`_subtrees\` 中移除。

Tree mutation 的通用检查：

1. 操作前是否可能是空树？
2. 操作后 \`_root is None\` 和 \`_subtrees == []\` 是否仍然一致？
3. 有没有把某棵 subtree 从 list 里丢掉？
4. recursive call 修改的是正确那棵 subtree 吗？
        `,
      },
      {
        title: 'Tree 的运行时间',
        summary: '普通 tree 没有排序 invariant，许多操作最坏情况下要访问所有节点。',
        markdown: m`
普通 tree search：

~~~python
def __contains__(self, item: Any) -> bool:
    if self.is_empty():
        return False
    elif self._root == item:
        return True
    else:
        return any(item in subtree for subtree in self._subtrees)
~~~

最坏情况：

- item 不在 tree 中。
- item 在最后才访问到的 leaf。

这时可能要看每个节点，所以是 $O(n)$，其中 $n$ 是 tree 中节点数。

tree 的高度也常常重要：

- height 是从 root 到最深 leaf 的最长路径长度。
- 一些操作和 height 有关。
- 对普通 tree 来说，height 可能接近 $n$，也可能远小于 $n$。

不要自动把 tree 操作想成 $O(\\log n)$。只有像 BST 这样有额外结构约束，并且高度比较小的时候，才可能出现 logarithmic 行为。
        `,
      },
      {
        title: 'Expression Tree',
        summary: '表达式树把算式表示成 root operator 和 operand subtrees。',
        markdown: m`
Tree 不只用来存层级数据，也可以表示表达式。

算式：

~~~text
(3 + 5) * 2
~~~

可以表示成：

~~~text
       mul
       / \\
      +   2
     / \\
    3   5
~~~

这里：

- leaf 是数字。
- internal node 是 operator。
- 每棵 subtree 是一个子表达式。

求值时自然递归：

1. 如果是数字节点，直接返回数字。
2. 如果是 operator 节点，先递归求左右子表达式。
3. 再把 operator 应用到两个结果上。

这说明 tree 的力量在于：它能直接表达“整体由子结构组成”的对象。表达式、文件夹、网页 DOM、组织结构，都可以用类似模型理解。
        `,
      },
      {
        title: 'Tree 和 BST 的边界',
        summary: 'BST 是一种特殊 tree；普通 tree traversal 不能直接套用 BST search 结论。',
        markdown: m`
Tree 和 BST 的关系：

> 每棵 BST 都是一棵 tree，但不是每棵 tree 都是 BST。

普通 tree：

- children 数量可以是 0、1、2 或更多。
- 没有值大小顺序。
- search 最坏情况通常要看所有节点。

BST：

- 每个节点最多有 left 和 right 两棵子树。
- 左边小于 root，右边大于 root。
- search 可以每一步只走一边。

所以不要把 BST 的性质误用到普通 tree：

~~~python
if item < t._root:
    search only left side
~~~

这只在 BST 里成立。普通 tree 的 children 没有排序含义。

学习顺序上，可以这样理解：

- Tree 给你递归结构。
- BST 在 tree 上加 invariant。
- Invariant 带来更快的 search，但也要求 insert/delete 更小心。
        `,
      },
    ],
  },
  11: {
    topicKey: 'exceptions',
    name: '11 - Exceptions：错误路径与控制流',
    description:
      'CSC148 中文 Markdown 笔记：raise、try/except、exception propagation、else/finally 与异常设计。',
    tags: ['CSC148', 'exceptions', 'control flow'],
    imageSource: 'csc148-07-exceptions-runtime.png',
    imageAlt: '异常沿调用栈向上传播，直到被合适的 handler 捕获。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/exceptions/exceptions-intro.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/exceptions/exceptions-structure.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/exceptions/exceptions-design.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/exceptions/exceptions-additional-clauses.html',
    ],
    customSections: [
      {
        title: 'Exception 是非正常路径的控制流',
        summary: '异常不是返回值；它会打断当前执行路径，并沿 call stack 向上传播。',
        markdown: m`
程序不只需要处理正常输入，也需要说明失败时怎么失败。

![异常沿调用栈向上传播，直到被合适的 handler 捕获。](/generated-notebooks/queue-csc148-11-trees-bsts/csc148-07-exceptions-runtime.png)

看一个简单例子：

~~~python
def parse_age(text: str) -> int:
    """Return text converted to an age."""
    if not text.isdigit():
        raise ValueError
    return int(text)
~~~

\`raise ValueError\` 的意思不是“返回一个错误对象”。它的意思是：

> 当前函数无法正常完成，立刻中断，把异常交给 caller。

如果 caller 没有处理，这个异常会继续向上传播，直到：

- 被某个 matching \`except\` 捕获；或者
- 到达最外层，程序终止并显示 traceback。

所以 exception 是控制流的一部分。它改变程序接下来执行哪一行。
        `,
      },
      {
        title: 'raise：在发现无法继续时报告失败',
        summary: 'raise 应该用于当前函数无法按 contract 正常返回的情况。',
        markdown: m`
什么时候应该 \`raise\`？

当函数发现自己无法满足 docstring 承诺时，就应该考虑 raise。

例子：

~~~python
def reciprocal(n: int) -> float:
    """Return 1 / n.

    Raise a ZeroDivisionError if n is 0.
    """
    if n == 0:
        raise ZeroDivisionError
    return 1 / n
~~~

也可以自己定义更具体的异常：

~~~python
class EmptyStackError(Exception):
    """Raised when calling pop on an empty stack."""
~~~

然后：

~~~python
def pop(self) -> Any:
    """Remove and return the top item.

    Raise an EmptyStackError if this stack is empty.
    """
    if self.is_empty():
        raise EmptyStackError
    return self._items.pop()
~~~

自定义异常的好处是：client 可以精准捕获它，而不是捕获一大类模糊错误。
        `,
      },
      {
        title: 'try/except：谁有恢复策略，谁处理',
        summary: 'except 不应该乱放；只有知道下一步怎么恢复的代码才应该捕获异常。',
        markdown: m`
\`try/except\` 的基本结构：

~~~python
try:
    age = parse_age(user_input)
except ValueError:
    age = 0
~~~

这里 caller 知道输入无效时要用默认值 0，所以它有处理策略。

但如果你只是这样写：

~~~python
try:
    result = complicated_operation()
except Exception:
    pass
~~~

这通常很危险。

问题是：

- \`Exception\` 太宽，会吞掉你没预料到的 bug。
- \`pass\` 没有恢复策略，只是把失败藏起来。
- 程序之后可能在更奇怪的状态下继续运行。

更好的原则：

> 只捕获你知道如何处理的具体异常。

如果当前层不知道怎么处理，就让异常继续传播给更上层。
        `,
      },
      {
        title: 'Propagation：异常如何沿 call stack 传播',
        summary: '异常发生后，当前 frame 结束，异常回到 caller，直到遇到合适 handler。',
        markdown: m`
看这段代码：

~~~python
def f() -> None:
    g()
    print('f done')

def g() -> None:
    h()
    print('g done')

def h() -> None:
    raise ValueError

f()
~~~

执行过程：

1. \`f\` 调用 \`g\`。
2. \`g\` 调用 \`h\`。
3. \`h\` raise \`ValueError\`。
4. \`h\` 立刻结束，没有正常 return。
5. 异常回到 \`g\`；\`g\` 没有 \`except\`，所以 \`print('g done')\` 不执行。
6. 异常回到 \`f\`；\`f\` 没有 \`except\`，所以 \`print('f done')\` 不执行。
7. 程序终止，显示 traceback。

traceback 的顺序会告诉你异常经过哪些 frame。读 traceback 时，不要只看最后一行，也要看调用链。
        `,
      },
      {
        title: '多个 except：从具体到一般',
        summary: '多个 except 会按顺序匹配；更具体的异常应该放前面。',
        markdown: m`
一个 \`try\` 可以有多个 \`except\`：

~~~python
try:
    value = int(text)
    result = 100 / value
except ValueError:
    result = None
except ZeroDivisionError:
    result = float('inf')
~~~

如果 \`text == 'abc'\`，\`int(text)\` raise \`ValueError\`。

如果 \`text == '0'\`，转换成功，但除法 raise \`ZeroDivisionError\`。

多个 except 的匹配规则：

1. 从上到下检查。
2. 第一个 matching handler 执行。
3. 执行完后跳过剩下的 except。

如果你写：

~~~python
except Exception:
    ...
except ValueError:
    ...
~~~

\`ValueError\` 分支永远没有机会执行，因为 \`ValueError\` 也是 \`Exception\` 的一种。通常更具体的异常要写在更一般的异常前面。
        `,
      },
      {
        title: '为什么不要只返回特殊值',
        summary: '异常能把正常结果和失败路径分开，避免 client 忘记检查特殊值。',
        markdown: m`
失败时能不能返回 \`None\` 或 \`-1\`？

有时可以，但要小心。

例如：

~~~python
def find_index(items: list[str], target: str) -> int:
    """Return the index of target, or -1 if target is not present."""
~~~

这里 \`-1\` 是特殊值。client 必须记得检查：

~~~python
index = find_index(names, 'Mina')
if index != -1:
    print(names[index])
~~~

如果忘记检查，Python 的 \`names[-1]\` 反而是合法访问，会拿到最后一个元素，bug 很隐蔽。

异常的优势是：

- 失败路径不会被误当成正常值。
- caller 可以在合适层级处理。
- 正常代码不必层层传递特殊值。

设计时要问：失败是不是这个函数 contract 的正常一部分？如果是，返回 \`None\` 并写进 type annotation 可能合适。如果失败表示无法完成操作，exception 往往更清楚。
        `,
      },
      {
        title: 'else 和 finally',
        summary: 'else 表示没有异常时执行；finally 表示无论是否异常都执行。',
        markdown: m`
\`try/except\` 还可以配 \`else\` 和 \`finally\`。

~~~python
try:
    value = int(text)
except ValueError:
    print('not an integer')
else:
    print('converted:', value)
finally:
    print('done trying')
~~~

含义：

- \`except\`：发生匹配异常时执行。
- \`else\`：try block 没有异常时执行。
- \`finally\`：无论有没有异常都执行。

\`finally\` 常用于清理动作，例如关闭文件、释放资源、记录日志。

需要注意：\`finally\` 不是“处理异常”。如果异常没有被 \`except\` 捕获，\`finally\` 执行完后，异常仍然会继续传播。

所以不要把 \`finally\` 当成万能补救。它保证清理，不保证恢复。
        `,
      },
      {
        title: 'Exception 设计原则',
        summary: '异常设计要写进 docstring，并让错误类型表达真正的问题。',
        markdown: m`
写带异常的函数或方法时，docstring 要说明异常路径：

~~~python
def dequeue(self) -> Any:
    """Remove and return the front item.

    Raise an EmptyQueueError if this queue is empty.
    """
~~~

好的异常设计通常满足：

- 异常类型具体，能表达问题。
- docstring 写清楚什么时候 raise。
- caller 可以选择捕获，也可以让它传播。
- 不用异常隐藏程序员错误。

常见坏味道：

~~~python
except Exception:
    return None
~~~

这会把各种错误混成一个 \`None\`，让 debug 变难。

更好的写法是：

~~~python
try:
    item = queue.dequeue()
except EmptyQueueError:
    item = None
~~~

只处理你真正预期的失败情况。

这一章的主线是：正常路径用 return 表达，异常路径用 raise/except 表达。两条路径都属于函数 contract。
        `,
      },
    ],
  },
  12: {
    topicKey: 'running-time',
    name: '12 - Running Time：Big-O、Omega 与 Theta',
    description:
      'CSC148 中文 Markdown 笔记：runtime analysis、input size、Big-O、Omega、Theta、worst/best case 与常见数据结构成本。',
    tags: ['CSC148', 'running time', 'Big-O', 'Omega', 'Theta'],
    imageSource: 'csc148-12-recursive-sorting.png',
    imageAlt: '运行时间分析关注输入规模变大时，操作数量如何增长。',
    sourceUrls: [
      'https://www.teach.cs.toronto.edu/~csc148h/notes/abstract-data-types/efficiency.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/linked-lists/linked_list_efficiency.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/binary-search-trees/bst_efficiency.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursive-sorting/recursive_sorting.html',
      'https://www.teach.cs.toronto.edu/~csc148h/notes/recursive-sorting/recursive_sorting_efficiency.html',
    ],
    customSections: [
      {
        title: 'Running Time 关心增长，不是秒表数字',
        summary: '运行时间分析关注输入规模变大时，步骤数量如何增长。',
        markdown: m`
运行时间不是问“我的电脑上跑了几秒”。秒表结果会受机器、系统负载、实现细节影响。

![运行时间分析关注输入规模变大时，操作数量如何增长。](/generated-notebooks/queue-csc148-12-recursive-sorting/csc148-12-recursive-sorting.png)

在 CSC148 里，我们更关心：

> 输入规模变大时，算法需要的基本工作量怎样增长？

例如：

~~~python
def contains(items: list[int], target: int) -> bool:
    for item in items:
        if item == target:
            return True
    return False
~~~

如果目标不在 list 中，函数要检查所有元素。输入长度是 $n$，检查次数大约是 $n$。

所以我们说 worst-case running time 是 linear，也就是 $O(n)$。

这里的 $n$ 必须说清楚。它通常是输入 list 的长度、tree 的节点数、字符串长度，或者某个数据结构的 size。
        `,
      },
      {
        title: 'Input Size：先定义 n',
        summary: '复杂度分析前，先说明 n 表示什么，否则答案没有意义。',
        markdown: m`
分析运行时间第一步不是看循环，而是定义输入规模。

例子：

~~~python
def print_grid(rows: int, cols: int) -> None:
    for r in range(rows):
        for c in range(cols):
            print(r, c)
~~~

这里有两个规模：

- $r$ 表示 rows。
- $c$ 表示 cols。

运行时间是 $O(r c)$，不应该随便写成 $O(n^2)$，除非你额外说明 rows 和 cols 都大约是 $n$。

再看 linked list：

~~~python
curr = self._first
while curr is not None:
    curr = curr.next
~~~

这里 $n$ 是从 \`_first\` 出发能走到的节点数。

BST search：

~~~python
if item < self._root:
    return item in self._left
else:
    return item in self._right
~~~

这里运行时间更自然地先用 $h$ 表示 tree height，再讨论 $h$ 和节点数 $n$ 的关系。
        `,
      },
      {
        title: 'Big-O：上界',
        summary: 'Big-O 表示增长速度不超过某个阶，常用于 worst-case upper bound。',
        markdown: m`
**Big-O** 是上界。

直观说：

> $T(n) \\in O(g(n))$ 表示当 $n$ 很大时，$T(n)$ 的增长不会比 $g(n)$ 快太多。

在 CSC148 里，你可以先把它理解成“最多这个量级”。

例子：

~~~python
for item in items:
    print(item)
~~~

如果 \`len(items) == n\`，循环运行 $n$ 次，所以是 $O(n)$。

常数会被忽略：

- $5n$ 是 $O(n)$。
- $100n + 30$ 是 $O(n)$。
- $3n^2 + 10n + 5$ 是 $O(n^2)$。

低阶项也会被忽略，因为当 $n$ 很大时，最高阶项主导增长。

常见阶：

| 记号 | 名字 | 输入翻倍时的直觉 |
| --- | --- | --- |
| $O(1)$ | constant | 大致不变 |
| $O(\\log n)$ | logarithmic | 只多一点 |
| $O(n)$ | linear | 大约翻倍 |
| $O(n^2)$ | quadratic | 大约四倍 |
| $O(2^n)$ | exponential | 增长非常快 |
        `,
      },
      {
        title: 'Omega：下界',
        summary: 'Omega 表示至少需要某个量级的工作，是 lower bound。',
        markdown: m`
**Omega**，写作 $\\Omega$，表示下界。

直观说：

> $T(n) \\in \\Omega(g(n))$ 表示当 $n$ 很大时，$T(n)$ 至少按 $g(n)$ 这个量级增长。

如果 Big-O 是“不会更坏超过这里”，Omega 就是“不会更好低于这里”。

例子：打印 list 所有元素。

~~~python
def print_all(items: list[int]) -> None:
    for item in items:
        print(item)
~~~

这个函数必须打印每个元素，所以至少要做 $n$ 次输出。它是 $\\Omega(n)$。

同时它也不会做超过线性量级的工作，所以它是 $O(n)$。

注意：Omega 不是 best-case 的同义词。它是数学上的 lower bound。课程里如果说 best-case，需要明确是某个输入类别下的运行时间；如果说 $\\Omega$，是在描述增长下界。
        `,
      },
      {
        title: 'Theta：紧确界',
        summary: 'Theta 表示上界和下界同阶，也就是增长量级被夹住了。',
        markdown: m`
**Theta**，写作 $\\Theta$，表示 tight bound。

直观说：

> $T(n) \\in \\Theta(g(n))$ 表示 $T(n)$ 的增长和 $g(n)$ 同一个量级。

也就是：

- $T(n) \\in O(g(n))$
- 且 $T(n) \\in \\Omega(g(n))$

例子：

~~~python
def total(items: list[int]) -> int:
    result = 0
    for item in items:
        result += item
    return result
~~~

如果 \`len(items) == n\`：

- 循环一定运行 $n$ 次，所以是 $\\Omega(n)$。
- 循环只运行 $n$ 次，没有嵌套额外增长，所以是 $O(n)$。
- 因此它是 $\\Theta(n)$。

一句话区分：

| 记号 | 中文直觉 |
| --- | --- |
| $O(g(n))$ | 最多这个量级 |
| $\\Omega(g(n))$ | 至少这个量级 |
| $\\Theta(g(n))$ | 正好这个量级 |
        `,
      },
      {
        title: 'Worst-case、Best-case 和 Average-case',
        summary: '同一段代码在不同输入下可能有不同运行时间，必须说明分析哪一种情况。',
        markdown: m`
看搜索 list：

~~~python
def contains(items: list[int], target: int) -> bool:
    for item in items:
        if item == target:
            return True
    return False
~~~

如果 target 是第一个元素：

- 只检查一次。
- best-case 是 $\\Theta(1)$。

如果 target 不存在：

- 检查所有 $n$ 个元素。
- worst-case 是 $\\Theta(n)$。

如果 target 随机出现在 list 中，average-case 通常仍然是 $\\Theta(n)$，因为平均大约要看一半元素，而 $n/2$ 和 $n$ 同阶。

所以写答案时不要只写“这是 $O(n)$”。更好的表达是：

> worst-case running time is $\\Theta(n)$, where $n$ is the length of \`items\`.

这句话同时说明了 case、bound 和 input size。
        `,
      },
      {
        title: '从代码结构读复杂度',
        summary: '循环层数只是线索，真正要数的是随 n 增长的操作次数。',
        markdown: m`
单层循环通常是 linear：

~~~python
for i in range(n):
    print(i)
~~~

运行 $n$ 次，所以是 $\\Theta(n)$。

固定次数内层循环仍然是 linear：

~~~python
for i in range(n):
    for j in range(10):
        print(i, j)
~~~

总次数是 $10n$，所以是 $\\Theta(n)$，不是 $\\Theta(n^2)$。

两个都随 $n$ 增长的嵌套循环：

~~~python
for i in range(n):
    for j in range(n):
        print(i, j)
~~~

总次数是 $n^2$，所以是 $\\Theta(n^2)$。

三角形循环：

~~~python
for i in range(n):
    for j in range(i):
        print(i, j)
~~~

总次数是：

$$0 + 1 + 2 + \\cdots + (n - 1) = \\frac{n(n - 1)}{2}$$

所以是 $\\Theta(n^2)$。

不要靠“看起来嵌套”判断。要写出次数表达式。
        `,
      },
      {
        title: '数据结构操作成本',
        summary: '同一行代码在不同数据结构里成本不同，复杂度分析要知道底层操作。',
        markdown: m`
运行时间分析不能只看代码行数，还要知道每个操作的成本。

Python list：

| 操作 | 常见成本 |
| --- | --- |
| \`lst[i]\` | $O(1)$ |
| \`append\` 到末尾 | 通常 $O(1)$ |
| \`pop()\` 末尾删除 | $O(1)$ |
| \`insert(0, item)\` | $O(n)$ |
| \`pop(0)\` | $O(n)$ |

Linked list：

| 操作 | 常见成本 |
| --- | --- |
| 访问第 i 个位置 | $O(n)$ |
| 从 head 遍历 | $O(n)$ |
| 已有节点引用时 relink | $O(1)$ |

BST：

| 情况 | search / insert |
| --- | --- |
| balanced | $O(\\log n)$ |
| worst-case chain | $O(n)$ |

所以“同样是 Stack”，如果用 list 末尾当 top，\`push/pop\` 通常是 $O(1)$；如果用 list 开头当 top，操作可能是 $O(n)$。

ADT 行为一样，不代表 implementation efficiency 一样。
        `,
      },
      {
        title: '递归算法的运行时间',
        summary: '递归复杂度要看子问题数量、子问题规模，以及每层额外工作。',
        markdown: m`
递归运行时间可以先用三个问题分析：

1. 每次调用产生几个递归调用？
2. 每个子问题规模变成多大？
3. 当前层除了递归调用，还做多少额外工作？

线性递归：

~~~python
def factorial(n: int) -> int:
    if n == 0:
        return 1
    return n * factorial(n - 1)
~~~

每次只有一个子调用，规模减 1，所以调用层数是 $n$，总时间 $\\Theta(n)$。

branching recursion：

~~~python
def fib(n: int) -> int:
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
~~~

每层可能产生两个子调用，而且有大量重复计算。运行时间会比线性大很多。

merge sort：

- 每层总共 merge $n$ 个元素。
- 每次规模约减半。
- 层数是 $\\log n$。
- 总时间是 $\\Theta(n \\log n)$。

递归复杂度不是看函数体短不短，而是看调用树有多大。
        `,
      },
      {
        title: 'Sorting 的增长率对比',
        summary: 'merge sort 稳定在 n log n；quicksort 通常快，但 worst-case 可能退化。',
        markdown: m`
Merge sort 的主线：

1. split 成两半。
2. 递归排序两半。
3. merge 两个 sorted lists。

运行时间：

$$\\Theta(n \\log n)$$

因为每层总工作是 $n$，层数是 $\\log n$。

Quicksort 的主线：

1. 选择 pivot。
2. partition 成 smaller、equal、larger。
3. 递归排序 smaller 和 larger。
4. 拼接结果。

如果 partition 很平衡，quicksort 通常是：

$$\\Theta(n \\log n)$$

如果 pivot 每次都很差，partition 极度不平衡，worst-case 可能变成：

$$\\Theta(n^2)$$

所以分析排序时要说清楚：

- 算法是哪一个？
- 分析 average-case 还是 worst-case？
- partition 或 merge 每层做了多少工作？
        `,
      },
      {
        title: '写复杂度答案的格式',
        summary: '一个完整答案要说明 case、变量含义、界的类型和理由。',
        markdown: m`
好的复杂度答案不应该只有一个符号。

推荐格式：

> The worst-case running time is $\\Theta(n)$, where $n$ is the length of \`items\`, because the loop may inspect every element once.

拆开看：

- worst-case：说明情况。
- $\\Theta(n)$：说明 tight bound。
- $n$ is the length of \`items\`：说明输入规模。
- because：给理由。

如果只能证明上界，就写 Big-O：

> The running time is $O(n^2)$.

如果想强调至少要看所有元素，就写 Omega：

> Any algorithm that prints all $n$ items is $\\Omega(n)$, because each item must be output at least once.

如果上下界同阶，就写 Theta：

> This function is $\\Theta(n)$ because it is both $O(n)$ and $\\Omega(n)$.

最后记住：Big-O、Omega、Theta 是关于增长的语言。它们不是程序速度的装饰符，而是你和别人精确讨论算法成本的共同词汇。
        `,
      },
    ],
  },
};

for (const plan of NOTEBOOK_PLANS) {
  Object.assign(plan, LATE_NOTEBOOK_OVERRIDES[plan.order] ?? {});
  plan.publicDir = path.join(PUBLIC_ROOT, plan.id);
  plan.publicImagePath = `/generated-notebooks/${plan.id}/${plan.imageSource}`;
  plan.imageFilePath = path.join(plan.publicDir, plan.imageSource);
  plan.imageSourcePath = path.join(IMAGEGEN_DIR, plan.imageSource);
}

function collectImageReferences(markdown) {
  const matches = markdown.matchAll(/!\[[^\]]*]\((\/generated-notebooks\/[^)\s]+)\)/g);
  return [...matches].map((match) => match[1]);
}

function auditNotebook(plan, sections) {
  const errors = [];
  if (sections.length < 7) errors.push(`${plan.id}: expected at least 7 sections`);
  if (!sections.some((section) => section.markdown.includes(plan.publicImagePath))) {
    errors.push(`${plan.id}: image not referenced`);
  }
  for (const section of sections) {
    if (/^\s*[*-]\s*$/m.test(section.markdown)) {
      errors.push(`${plan.id}/${section.title}: orphan list marker`);
    }
    if (/Disclaimer|Speed Up Education|not for sale/i.test(section.markdown)) {
      errors.push(`${plan.id}/${section.title}: leaked source boilerplate`);
    }
  }
  const referenced = new Set(
    sections.flatMap((section) => collectImageReferences(section.markdown)),
  );
  if (!referenced.has(plan.publicImagePath)) errors.push(`${plan.id}: public image missing`);
  if (errors.length) throw new Error(`Notebook audit failed:\n${errors.join('\n')}`);
}

function mimeTypeForPath(filePath) {
  return (
    IMAGE_MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
  );
}

async function ensureNotebookImageAssetTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookImageAsset" (
      "id" TEXT PRIMARY KEY,
      "path" TEXT NOT NULL UNIQUE,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "sha256" TEXT NOT NULL,
      "source" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "NotebookImageAsset_sha256_idx" ON "NotebookImageAsset"("sha256")',
  );
}

async function upsertImageAsset(prisma, plan) {
  const bytes = fs.readFileSync(plan.imageFilePath);
  const fileStat = fs.statSync(plan.imageFilePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const mimeType = mimeTypeForPath(plan.imageFilePath);
  await prisma.$executeRaw`
    INSERT INTO "NotebookImageAsset" (
      "id",
      "path",
      "mimeType",
      "data",
      "sizeBytes",
      "sha256",
      "source",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${plan.publicImagePath},
      ${mimeType},
      ${bytes},
      ${fileStat.size},
      ${sha256},
      ${'scripts/maintenance/import-csc148-rest-markdown-notebooks.mjs'},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("path") DO UPDATE SET
      "mimeType" = EXCLUDED."mimeType",
      "data" = EXCLUDED."data",
      "sizeBytes" = EXCLUDED."sizeBytes",
      "sha256" = EXCLUDED."sha256",
      "source" = EXCLUDED."source",
      "updatedAt" = CURRENT_TIMESTAMP
  `;
}

async function renderPlanImage(plan) {
  if (!fs.existsSync(plan.imageSourcePath)) {
    throw new Error(`Missing imagegen source for ${plan.id}: ${plan.imageSourcePath}`);
  }
  fs.mkdirSync(plan.publicDir, { recursive: true });
  await sharp(plan.imageSourcePath).png().toFile(plan.imageFilePath);
}

async function resolveCourse(prisma, preferredCourseId) {
  const course = await prisma.course.findUnique({
    where: { id: preferredCourseId },
    select: { id: true, name: true, courseCode: true, ownerId: true },
  });
  if (!course) throw new Error(`Course not found: ${preferredCourseId}`);
  return course;
}

async function upsertNotebook(prisma, course, plan, sections) {
  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: plan.id },
      create: {
        id: plan.id,
        ownerId: course.ownerId,
        courseId: course.id,
        name: plan.name,
        description: plan.description,
        tags: plan.tags,
        avatarUrl: plan.publicImagePath,
        language: 'zh-CN',
        style: 'source-markdown-with-imagegen-figures',
        notebookKind: 'markdown',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        sceneCount: sections.length,
        sectionCount: sections.length,
        speechReadyCount: 0,
        speechTotalCount: 0,
        speechStatus: 'no_speech',
        coverSlideJson: Prisma.DbNull,
        coverImagePath: plan.publicImagePath,
      },
      update: {
        ownerId: course.ownerId,
        courseId: course.id,
        name: plan.name,
        description: plan.description,
        tags: plan.tags,
        avatarUrl: plan.publicImagePath,
        language: 'zh-CN',
        style: 'source-markdown-with-imagegen-figures',
        notebookKind: 'markdown',
        listedInNotebookStore: false,
        notebookPriceCents: 0,
        sceneCount: sections.length,
        sectionCount: sections.length,
        speechReadyCount: 0,
        speechTotalCount: 0,
        speechStatus: 'no_speech',
        coverSlideJson: Prisma.DbNull,
        coverImagePath: plan.publicImagePath,
        contentVersion: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    await tx.scene.deleteMany({ where: { notebookId: plan.id } });
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId: plan.id } });
    await tx.markdownNotebookSection.createMany({
      data: sections.map((section) => ({
        ...section,
        notebookId: plan.id,
        courseId: course.id,
      })),
    });
  });
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

  await prisma.course.update({
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFiles();

  const selectedPlans = NOTEBOOK_PLANS.filter(
    (plan) => !args.only || args.only.has(plan.order) || args.only.has(plan.id),
  );
  if (!selectedPlans.length) throw new Error('No notebooks selected.');

  const prisma = new PrismaClient();
  try {
    const course = await resolveCourse(prisma, args.courseId);
    const rendered = [];
    for (const plan of selectedPlans) {
      await renderPlanImage(plan);
      const sections = buildSections(plan);
      auditNotebook(plan, sections);
      rendered.push({ plan, sections });
    }

    console.log(`Mode: ${args.write ? 'write' : 'dry-run'}`);
    console.log(`Course: ${course.name} (${course.id}) code=${course.courseCode ?? 'n/a'}`);
    console.log(`Import version: ${IMPORT_VERSION}`);
    for (const { plan, sections } of rendered) {
      const sizeBytes = fs.statSync(plan.imageFilePath).size;
      console.log(
        `- ${plan.id}: ${sections.length} sections, image=${plan.publicImagePath} (${sizeBytes} bytes)`,
      );
      for (const section of sections) {
        console.log(`  ${section.order + 1}. ${section.title}`);
      }
    }

    if (!args.write) {
      console.log('Dry-run complete. Re-run with --write to mutate the target DB.');
      return;
    }

    await ensureNotebookImageAssetTable(prisma);
    for (const { plan, sections } of rendered) {
      await upsertNotebook(prisma, course, plan, sections);
      await upsertImageAsset(prisma, plan);
    }
    await refreshCourseSummaryFields(prisma, course.id);

    const notebooks = await prisma.notebook.findMany({
      where: { courseId: course.id, id: { in: selectedPlans.map((plan) => plan.id) } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        notebookKind: true,
        sceneCount: true,
        sectionCount: true,
        contentVersion: true,
        _count: { select: { scenes: true, markdownSections: true } },
      },
    });
    console.log('Write complete.');
    console.log(JSON.stringify({ notebooks, persistedImageAssets: selectedPlans.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
