#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const COURSE_ID = process.env.CSC108_COURSE_ID || DEFAULT_COURSE_ID;
const QUEUE_DIR = path.join(ROOT, 'queue', 'CSC108');
const IMPORT_VERSION = 'csc108-word-markdown-notebooks-2026-06-12';

function m(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

const NOTEBOOKS = [
  {
    index: '01',
    sourceFile: '01_基础运算.docx',
    notebookId: 'queue-csc108-01-basic-operations',
    name: '01 - Python 基础：运算、变量与字符串',
    description:
      'CSC108 学生版 Markdown 笔记：数学运算符、运算顺序、变量命名、赋值、数值类型和字符串基础。',
    tags: ['CSC108', 'Python', 'Markdown', '基础运算'],
    sections: [
      {
        title: '学习路线',
        markdown: m`
这本笔记把 Python 入门的第一组能力连起来：先会读表达式，再会保存结果，最后会处理字符串。

你需要掌握四件事：

- 数学表达式如何按 Python 的规则求值。
- int 和 float 在运算结果中如何变化。
- 变量名如何写，赋值语句如何更新变量。
- 字符串如何拼接、重复、比较和调用方法。

学习时不要只背操作符。更重要的是能解释：某一步为什么先算，结果是什么类型，变量现在指向哪个值。
        `,
      },
      {
        title: '数学运算符和结果类型',
        markdown: m`
Python 常用数学运算符：

| 运算符 | 意义 | 例子 | 结果 |
| --- | --- | --- | --- |
| + | 加法 | 3 + 2 | 5 |
| - | 减法 | 6 - 1 | 5 |
| * | 乘法 | 3 * 4 | 12 |
| / | 除法 | 6 / 2 | 3.0 |
| // | 整数除法，取商 | 7 // 3 | 2 |
| % | 取余数 | 7 % 3 | 1 |
| ** | 乘方 | 2 ** 3 | 8 |

两个最容易错的点：

- / 的结果总是 float，即使看起来刚好整除。
- 除 / 以外，如果任意一边是 float，结果通常也是 float；两边都是 int 时通常得到 int。

任何数除以 0 都会触发 ZeroDivisionError。// 和 % 也不能把 0 放在右边。
        `,
      },
      {
        title: '例题 1：表达式逐步求值',
        markdown: m`
题目：求下面表达式的值和类型。

~~~python
8 / 2 * (2 + 2)
6 / 3 * 2 + 1
6 / 3 * (2 + 1)
(3 / 1000) * 2 + 2 ** 3 * 1
(3.0 // 1000) * 2 + 2 ** 3 * 1
~~~

步骤：

1. 先算括号。
2. 再算 **。
3. 再算 *、/、//、%，同一层从左到右。
4. 最后算 +、-。

参考结果：

~~~text
8 / 2 * (2 + 2)        -> 4.0 * 4 -> 16.0
6 / 3 * 2 + 1          -> 2.0 * 2 + 1 -> 5.0
6 / 3 * (2 + 1)        -> 2.0 * 3 -> 6.0
(3 / 1000) * 2 + 8     -> 0.003 * 2 + 8 -> 8.006
(3.0 // 1000) * 2 + 8  -> 0.0 * 2 + 8 -> 8.0
~~~

检查点：只要中间用了 /，后面就很可能一路保持 float。
        `,
      },
      {
        title: '变量、赋值和命名',
        markdown: m`
变量是给值起名字。赋值语句的右边会先被计算，然后把结果绑定到左边的变量名。

~~~python
y = 12
x = 3
z = y + x
~~~

执行后，z 的值是 15。

变量命名规则：

- 必须以字母或下划线开头，不能以数字开头。
- 只能包含字母、数字和下划线。
- 区分大小写，age、Age、AGE 是三个不同变量。
- Python 常用 snake_case，例如 student_count。

合法变量名示例：

~~~python
__name
rtn_98
A_bc_def
student_count
~~~

不建议使用 algo-ace，因为 - 会被 Python 当成减号。
        `,
      },
      {
        title: '例题 2：变量更新追踪',
        markdown: m`
题目：下面代码最后会输出什么？

~~~python
x = 3
y = 12
z = y + x
x = z - 5
y = x * 2
print(x, y, z)
~~~

步骤：

1. x = 3，y = 12。
2. z = y + x，所以 z = 15。
3. x = z - 5，所以 x 被更新为 10。
4. y = x * 2，使用的是更新后的 x，所以 y = 20。

结果：

~~~text
10 20 15
~~~

易错点：变量不是数学里的永久等式。x = z - 5 之后，旧的 x = 3 已经不再是当前值。
        `,
      },
      {
        title: '字符串基础操作',
        markdown: m`
字符串是字符序列。空格、换行、标点、中文和 emoji 都是字符，len 会数它们。

~~~python
len("Hello世界")      # 7
len("")              # 0
"Hello" + ", World!" # "Hello, World!"
"Na" * 4             # "NaNaNaNa"
~~~

字符串比较区分大小写，并按字典序比较：

~~~python
"aBc" == "abc"       # False
"apple" < "banana"  # True
"abc" < "abC"       # False
~~~

常用方法：

| 方法 | 作用 |
| --- | --- |
| s.upper() | 转成大写，返回新字符串 |
| s.lower() | 转成小写，返回新字符串 |
| s.replace(old, new) | 替换子串，返回新字符串 |
| s.count(substring) | 统计子串出现次数 |
| s.find(substring) | 找第一次出现的位置，找不到返回 -1 |
| s.isalpha() | 是否全是字母 |
| s.isdigit() | 是否全是数字 |

字符串本身不可变，所以这些方法不会原地改掉旧字符串。
        `,
      },
      {
        title: '例题 3：字符串表达式',
        markdown: m`
已知：

~~~python
str1 = "University "
str2 = "of "
str3 = "British Columbia"
~~~

目标 A：得到 "University of British Columbia"。

~~~python
str1 + str2 + str3
~~~

目标 B：得到 "Universe"。

思路：从 "University " 中取前 7 个字符 "Univers"，再接上 "e"。

~~~python
str1[:7] + "e"
~~~

再看换行字符：

~~~python
print(len("hello\nworld"))   # 11
print(len("hello\\nworld"))  # 12
~~~

第一行里 \n 是一个换行字符。第二行里 \\n 是两个普通字符：反斜杠和 n。
        `,
      },
    ],
  },
  {
    index: '02',
    sourceFile: '02_Control.docx',
    notebookId: 'queue-csc108-02-control',
    name: '02 - 函数、Docstring 与条件控制',
    description:
      'CSC108 学生版 Markdown 笔记：函数 header、type contract、docstring、print/return、if/elif/else、作用域。',
    tags: ['CSC108', 'Python', 'Markdown', 'Control'],
    sections: [
      {
        title: '函数设计的基本结构',
        markdown: m`
一个清楚的函数至少包含四层信息：

1. header：函数名、参数名和类型、返回类型。
2. docstring：说明函数做什么，并给出示例。
3. body：真正计算并 return 结果。
4. tests：用示例和边界情况检查函数。

例子：

~~~python
def is_even(value: int) -> bool:
    """Return True if and only if value is divisible by 2.

    >>> is_even(2)
    True
    >>> is_even(17)
    False
    """
    return value % 2 == 0
~~~

函数名和参数名要尽量有意义。看见 is_even(value) 时，读者应该能猜到它在判断 value 是否为偶数。
        `,
      },
      {
        title: 'Docstring 为什么重要',
        markdown: m`
Docstring 不是给 Python 看的装饰，而是给人和测试看的契约。

一个好的 docstring 应该说明：

- 每个参数代表什么。
- 返回值代表什么。
- 至少两三个典型示例。
- 必要时包含边界情况。

不清楚的版本：

~~~python
def abcdef(n):
    if n == 1:
        return 2
    if n == 2:
        return 3
    if n == 3:
        return 1
~~~

更清楚的版本：

~~~python
def next_traffic_light(light: int) -> int:
    """Return the next traffic light code.

    1 means red, 2 means yellow, and 3 means green.

    >>> next_traffic_light(1)
    2
    >>> next_traffic_light(2)
    3
    """
    if light == 1:
        return 2
    if light == 2:
        return 3
    return 1
~~~

检查点：如果别人只读 header 和 docstring，是否已经知道这个函数的输入输出规则？
        `,
      },
      {
        title: '例题 1：print 和 return 的区别',
        markdown: m`
题目：下面代码执行时屏幕上会出现什么？函数调用的结果又是什么？

~~~python
def foo_1(a: int, b: int) -> int:
    x = a + 2
    print(x)
    y = b // 3
    print(y)
    return x * y

result = foo_1(0, 8)
print(result)
~~~

步骤：

1. a = 0，所以 x = 2，先 print 2。
2. b = 8，所以 y = 2，接着 print 2。
3. 函数 return 4，result 接住 4。
4. 最后一行 print(result)，再输出 4。

输出：

~~~text
2
2
4
~~~

核心区别：print 是把信息显示在终端；return 是把结果交回给调用者，让后续代码继续使用。
        `,
      },
      {
        title: '条件表达式和分支',
        markdown: m`
if 语句会根据布尔表达式选择执行路径。

~~~python
if condition:
    ...
elif another_condition:
    ...
else:
    ...
~~~

常用比较和逻辑：

| 写法 | 意义 |
| --- | --- |
| x == y | 是否相等 |
| x != y | 是否不相等 |
| x < y | 是否小于 |
| a < x < b | x 是否在开区间中 |
| cond1 and cond2 | 两个条件都为真 |
| cond1 or cond2 | 至少一个条件为真 |
| not cond | 取反 |

分支越多，越要检查每条路径是否都有 return。特别是函数返回 bool 时，很多 if/else 可以直接化简成布尔表达式。
        `,
      },
      {
        title: '例题 2：把嵌套 if 化简',
        markdown: m`
题目：把下面逻辑写得更清楚。

~~~python
def in_window(x: int) -> bool:
    if x < 1:
        if x > -5:
            return True
        else:
            return False
    else:
        return False
~~~

分析：

- 外层要求 x < 1。
- 内层要求 x > -5。
- 两个条件必须同时满足。

化简：

~~~python
def in_window(x: int) -> bool:
    return -5 < x < 1
~~~

再看一个 or 的版本：

~~~python
def is_outside(x: int) -> bool:
    return x < 1 or x > 8
~~~

易错点：and 和 or 不只是英文翻译，要看条件是“同时成立”还是“满足任意一个”。
        `,
      },
      {
        title: '作用域：局部变量和全局变量',
        markdown: m`
在 function 外定义的变量是 global variable。函数可以读取全局变量，但通常不应该修改它。

在 function 内定义的变量是 local variable。它只在函数内部有效。

~~~python
a = 1

def add_one() -> int:
    a = 2
    a = a + 1
    return a

m = add_one()
print(m)
print(a)
~~~

输出：

~~~text
3
1
~~~

函数内部的 a 是局部变量，不会改掉外面的 a。

如果写 global a，函数会修改外部变量：

~~~python
a = 1

def add_one() -> int:
    global a
    a = 2
    a = a + 1
    return a

m = add_one()
print(m)
print(a)
~~~

输出：

~~~text
3
3
~~~

课程中通常建议少用 global。常量可以放在外面，普通计算结果应通过参数和 return 传递。
        `,
      },
      {
        title: '例题 3：作用域代码追踪',
        markdown: m`
题目：下面代码输出什么？

~~~python
a = 1

def foo() -> int:
    a = 2
    s = a * 3
    return s

m = foo()
print(m)
print(a)
~~~

步骤：

1. 全局 a = 1。
2. 调用 foo 时，函数内部创建局部 a = 2。
3. s = 2 * 3，所以 return 6。
4. print(m) 输出 6。
5. 全局 a 从未被修改，所以 print(a) 输出 1。

结果：

~~~text
6
1
~~~

检查点：看到同名变量时，先问“这行代码处在哪个作用域里？”
        `,
      },
    ],
  },
  {
    index: '03',
    sourceFile: '03_Loop.docx',
    notebookId: 'queue-csc108-03-loop',
    name: '03 - 循环：range、for、while 与嵌套循环',
    description:
      'CSC108 学生版 Markdown 笔记：range、for loop、break/continue、while、字符串循环、nested loop 和图形输出。',
    tags: ['CSC108', 'Python', 'Markdown', 'Loop'],
    sections: [
      {
        title: 'range 和 for loop',
        markdown: m`
range(start, end, step) 会生成从 start 开始、到 end 之前停止的一串整数。end 不包含在结果里。

~~~python
range(1, 5, 1)   # 1, 2, 3, 4
range(1, 5, 2)   # 1, 3
range(1, 5)      # step 默认是 1
range(5, 1, -1)  # 5, 4, 3, 2
range(1, 5, -1)  # 空序列
~~~

for loop 的形状：

~~~python
for i in range(a, b):
    # loop body
    ...
~~~

每一轮循环，i 会从 range 中取下一个值。循环变量通常不应该在 loop body 里手动改掉。
        `,
      },
      {
        title: '例题 1：break 和 continue 追踪',
        markdown: m`
题目：下面代码会输出什么？

~~~python
points = 0
for day in range(1, 10):
    if day == 3 or day == 6:
        continue
    points += day
    print("Day", day, "->", points)
    if points >= 15:
        break

print("final:", points)
~~~

步骤：

- day = 1，points = 1，输出 Day 1 -> 1。
- day = 2，points = 3，输出 Day 2 -> 3。
- day = 3，continue，跳过本轮。
- day = 4，points = 7。
- day = 5，points = 12。
- day = 6，continue。
- day = 7，points = 19，达到 15，break 结束整个循环。

结果：

~~~text
Day 1 -> 1
Day 2 -> 3
Day 4 -> 7
Day 5 -> 12
Day 7 -> 19
final: 19
~~~

continue 只跳过当前这一轮。break 直接离开整个循环。
        `,
      },
      {
        title: 'while loop 和停止条件',
        markdown: m`
while loop 会在条件为 True 时不断重复。

~~~python
while condition:
    ...
~~~

写 while 时要特别关注停止条件：

- 循环前要有初始值。
- loop body 里要更新某个变量。
- 更新后条件最终必须变成 False。

例子：倒数输出。

~~~python
i = 5
while i >= 1:
    print(i)
    i -= 1
~~~

如果忘记 i -= 1，i 会一直是 5，循环不会停止。
        `,
      },
      {
        title: '例题 2：数字反转',
        markdown: m`
题目：给定 num = 2034，用 while loop 得到反转后的数字 4302。

核心操作：

- num % 10 取出最后一位。
- num // 10 去掉最后一位。
- result = result * 10 + digit 把新数字接到右边。

代码：

~~~python
num = 2034
result = 0

while num > 0:
    digit = num % 10
    result = result * 10 + digit
    num = num // 10

print(result)
~~~

追踪：

| 轮次 | digit | result | num |
| --- | ---: | ---: | ---: |
| 初始 | - | 0 | 2034 |
| 1 | 4 | 4 | 203 |
| 2 | 3 | 43 | 20 |
| 3 | 0 | 430 | 2 |
| 4 | 2 | 4302 | 0 |

检查点：如果 num 最终没有变小，while loop 很可能停不下来。
        `,
      },
      {
        title: '字符串循环和累计器',
        markdown: m`
很多字符串题都可以套用“累计器”模式。

例子：计算字符串中数字字符的数量。

~~~python
def count_digits(text: str) -> int:
    """Return the number of digit characters in text."""
    count = 0
    for ch in text:
        if ch.isdigit():
            count += 1
    return count
~~~

同一套结构可以改成：

- 判断是否全部是元音。
- 判断是否全部由字母组成。
- 把只含数字的字符串转成 int。
- 判断奇数位是否存在至少一个元音。

做题顺序：

1. 明确每一轮看一个字符还是一个 index。
2. 设定累计器初始值。
3. 写出一轮如何更新累计器。
4. 循环结束后 return 累计结果。
        `,
      },
      {
        title: '例题 3：嵌套循环画图',
        markdown: m`
题目：下面代码输出什么？

~~~python
for k in range(1, 4):
    for i in range(1, 5):
        print("*", end="")
    print()
~~~

外层循环控制行数，k 取 1、2、3，所以一共 3 行。

内层循环控制每行的字符数，i 取 1、2、3、4，所以每行 4 个星号。

输出：

~~~text
****
****
****
~~~

如果题目要求 draw_diamond(radius, symbol)，可以把每一行拆成两部分：

- 先决定这一行有多少个 symbol。
- 再决定前面需要多少空格让图形居中。

嵌套循环题不要急着写完整代码，先用表格写出“第几行、几个空格、几个字符”。
        `,
      },
      {
        title: '例题 4：Icon Scaling',
        markdown: m`
题目：把 3 x 3 的字符图标放大 k 倍。每个字符要变成 k x k 的小方块。

原图：

~~~text
*x*
 xx
* *
~~~

如果 k = 3，思路是：

1. 原图的每一行要重复输出 3 次。
2. 行里的每个字符也要重复 3 次。
3. 所以需要外层处理原始行，中层处理重复行数，内层处理每个字符。

代码骨架：

~~~python
icon = ["*x*", " xx", "* *"]
k = 3

for row in icon:
    expanded = ""
    for ch in row:
        expanded += ch * k
    for _ in range(k):
        print(expanded)
~~~

检查点：缩放问题通常是“横向重复”和“纵向重复”两个循环，不是只把字符串乘 k。
        `,
      },
    ],
  },
  {
    index: '04',
    sourceFile: '04_List.docx',
    notebookId: 'queue-csc108-04-list',
    name: '04 - List：索引、别名、方法与可变对象',
    description:
      'CSC108 学生版 Markdown 笔记：list index、negative index、aliasing、mutation、list methods、tuple 和 sequence。',
    tags: ['CSC108', 'Python', 'Markdown', 'List'],
    sections: [
      {
        title: 'List 索引和边界',
        markdown: m`
Python list 是有顺序的元素序列。长度为 n 的 list，合法正向 index 是 0 到 n - 1。

~~~python
lst = [1, 2, 3, 4, 5]
lst[0]   # 1
lst[1]   # 2
lst[4]   # 5
lst[-1]  # 5
lst[-5]  # 1
~~~

越界会报 IndexError：

~~~python
lst[5]
lst[10]
lst[-8]
~~~

记忆方式：程序员从 0 开始数。最后一个元素既可以用 lst[len(lst) - 1]，也可以用 lst[-1]。
        `,
      },
      {
        title: '可变对象和别名',
        markdown: m`
list 是可变对象。变量里保存的不是整份 list 本身，而是指向 list 对象的引用。

~~~python
lst_a = [1, 2, 3]
lst_b = lst_a
lst_b[0] = 100
print(lst_a)
~~~

输出：

~~~text
[100, 2, 3]
~~~

lst_a 和 lst_b 是同一个 list 的两个名字，所以改其中一个会影响另一个。

如果要复制一份浅拷贝，可以用 slicing：

~~~python
copy = lst_a[:]
~~~

检查点：看到 a = s 时，问“这是创建新 list，还是让 a 指向同一个 list？”
        `,
      },
      {
        title: '例题 1：参数传递追踪',
        markdown: m`
题目：下面两段代码为什么结果不同？

~~~python
def increase_num(x: int) -> None:
    x = x + 1

a = 1
increase_num(a)
print(a)
~~~

输出是 1，因为函数内部的 x 被重新绑定，不会改掉外面的 a。

再看 list：

~~~python
def increase_first(lst: list[int]) -> None:
    lst[0] = lst[0] + 1

arr = [1, 2, 3, 4]
increase_first(arr)
print(arr)
~~~

输出：

~~~text
[2, 2, 3, 4]
~~~

函数参数 lst 和外面的 arr 指向同一个 list。lst[0] = ... 是修改 list 内部内容，所以外面能看到变化。
        `,
      },
      {
        title: 'List 方法：原地修改还是返回新对象',
        markdown: m`
常见 list 方法：

| 方法 | 返回值 | 是否改变原 list |
| --- | --- | --- |
| arr.append(item) | None | 是 |
| arr.extend(other) | None | 是 |
| arr.pop(index) | 被删除的元素 | 是 |
| arr.sort() | None | 是 |
| arr.reverse() | None | 是 |

常见错误：

~~~python
numbers = [3, 1, 2]
sorted_nums = numbers.sort()
print(sorted_nums)  # None
print(numbers)      # [1, 2, 3]
~~~

如果想得到一个新 list，可以用 sorted(numbers)：

~~~python
numbers = [3, 1, 2]
sorted_nums = sorted(numbers)
~~~

规律：append、extend、sort、pop、reverse 改本体；slicing、+、*、upper、lower、replace 通常创建新对象。
        `,
      },
      {
        title: '例题 2：append、+ 和 None',
        markdown: m`
题目：追踪下面代码。

~~~python
def mystery(nums, extra):
    print("start:", nums)
    nums.append(len(nums))
    nums = nums + extra
    extra_value = nums.append(42)
    extra.append(extra_value)
    print("inside:", nums)
    return nums

a = [1, 2]
b = [10, 20]
c = mystery(a, b)
print("after:", a)
print("result:", c)
print("extra:", b)
~~~

步骤：

1. nums 和 a 指向同一个 list，所以 nums.append(2) 会让 a 变成 [1, 2, 2]。
2. nums = nums + extra 创建新 list，nums 不再指向 a。
3. nums.append(42) 原地改新 list，并返回 None。
4. extra.append(extra_value) 会把 None 加到 b 里。

结果：

~~~text
start: [1, 2]
inside: [1, 2, 2, 10, 20, 42]
after: [1, 2, 2]
result: [1, 2, 2, 10, 20, 42]
extra: [10, 20, None]
~~~

易错点：append 的返回值是 None，不是修改后的 list。
        `,
      },
      {
        title: 'Tuple 和 Sequence',
        markdown: m`
tuple 是有顺序、不可变的序列。

~~~python
t1 = (1, 2, 3)
t2 = "apple", "banana", "cherry"
t3 = (1, "hello", 3.14, True)
t4 = (5,)
t5 = (5)
~~~

t4 是 tuple，t5 是 int。单元素 tuple 必须有逗号。

tuple 支持很多 sequence 操作：

~~~python
t = (10, 20, 30)
t[1]       # 20
t[0:2]     # (10, 20)
(1, 2) + (3, 4)
(1, 2) * 3
2 in (1, 2)
~~~

但 tuple 不能修改：

~~~python
a = (1, 2, 3)
a[0] = 2  # TypeError
~~~

当你希望一组数据保持固定时，tuple 比 list 更合适。
        `,
      },
      {
        title: '例题 3：切片复制和别名',
        markdown: m`
题目：两段代码分别输出什么？

~~~python
s = [1, 2, 3, 4]
a = s
a[0] = 99
print(s)
~~~

结果：

~~~text
[99, 2, 3, 4]
~~~

a = s 让两个变量指向同一个 list。

第二段：

~~~python
s = [1, 2, 3, 4]
a = s[:]
a[0] = 99
print(s)
~~~

结果：

~~~text
[1, 2, 3, 4]
~~~

s[:] 创建一份新 list。a 改的是新 list，不会影响 s。
        `,
      },
    ],
  },
  {
    index: '05',
    sourceFile: '05_Input_Output.docx',
    notebookId: 'queue-csc108-05-input-output',
    name: '05 - Input 和 Output：读入、类型转换与格式化输出',
    description:
      'CSC108 学生版 Markdown 笔记：input、print、end/sep、escape sequence、f-string 和 CCC 日期判断题。',
    tags: ['CSC108', 'Python', 'Markdown', 'Input Output'],
    sections: [
      {
        title: 'input 读进来的一定是字符串',
        markdown: m`
input() 会从用户那里读入一行文本，返回值类型永远是 str。

~~~python
n = input()
x = input("Where is your hometown? ")
~~~

如果需要数字，要显式转换：

~~~python
n = input()
n = int(n)
~~~

常见流程：

~~~python
n = int(input())

if n > 0:
    if n % 2 == 0:
        print(n)
else:
    print(n, "is not positive")
~~~

检查点：只要来自 input，就先把它当字符串。要做数学比较或取余时，先 int(...) 或 float(...)。
        `,
      },
      {
        title: 'print、end 和多个值',
        markdown: m`
print 会把内容显示到终端。默认每次 print 后都会换行。

~~~python
print("Hot", end="")
print("dog")
~~~

输出：

~~~text
Hotdog
~~~

如果不改 end：

~~~python
print("Hot")
print("dog")
~~~

输出：

~~~text
Hot
dog
~~~

print 可以接多个值，默认用空格分隔：

~~~python
a = 123
b = (1 == 2)
c = "Toy"
print(a, b, c)
~~~

也可以自己控制 end：

~~~python
split = ", "
print(a, end=split)
print(b, end=split)
print(c)
~~~
        `,
      },
      {
        title: '例题 1：日期判断 Before After Special',
        markdown: m`
题目：读入月份 month 和日期 day，判断日期在 2 月 18 日之前、之后，还是当天。

输出规则：

- 在 2 月 18 日之前：Before
- 在 2 月 18 日之后：After
- 正好 2 月 18 日：Special

代码：

~~~python
month = int(input())
day = int(input())

if month < 2:
    print("Before")
elif month > 2:
    print("After")
else:
    if day < 18:
        print("Before")
    elif day > 18:
        print("After")
    else:
        print("Special")
~~~

检查点：先比较 month，可以避免把 1 月 30 日误判成 after，也避免把 3 月 1 日误判成 before。
        `,
      },
      {
        title: '转义字符',
        markdown: m`
转义字符用反斜杠表示那些不好直接打出来的字符。

常见转义：

| 写法 | 含义 |
| --- | --- |
| \\n | 换行 |
| \\t | tab |
| \\\\ | 一个反斜杠 |
| \\" | 双引号 |
| \\' | 单引号 |

例子：

~~~python
print("Hello\nWorld")
print("Hello\tWorld")
~~~

字符串长度题要分清：

~~~python
len("hello\nworld")   # 11
len("hello\\nworld")  # 12
~~~

第一行里的 \n 是一个字符。第二行里的 \\n 是两个字符。
        `,
      },
      {
        title: '例题 2：格式化输出',
        markdown: m`
题目：输出价格，保留两位小数。

~~~python
name = "notebook"
price = 3.5
count = 4
total = price * count
currency = "$"

print(f"{name}: {count} x {currency}{price:.2f} = {currency}{total:.2f}")
~~~

输出：

~~~text
notebook: 4 x $3.50 = $14.00
~~~

f-string 常用格式：

- {value}：直接插入变量。
- {value:.2f}：float 保留两位小数。
- {value:>10}：右对齐，总宽度 10。
- {value:<10}：左对齐，总宽度 10。

考试中优先用 f-string。它比百分号格式和 str.format 更容易读。
        `,
      },
      {
        title: '例题 3：读入后再分支',
        markdown: m`
题目：读入一个整数 n。如果 n 是正偶数，输出 n；如果 n 是正奇数，输出 "odd"；如果 n 不是正数，输出 "not positive"。

代码：

~~~python
n = int(input())

if n > 0:
    if n % 2 == 0:
        print(n)
    else:
        print("odd")
else:
    print("not positive")
~~~

测试：

| 输入 | 输出 |
| --- | --- |
| 8 | 8 |
| 7 | odd |
| 0 | not positive |
| -3 | not positive |

易错点：n > 0 和 n % 2 == 0 是两个层次。先判断是否正数，再判断奇偶。
        `,
      },
    ],
  },
  {
    index: '06',
    sourceFile: '06_File_IO.docx',
    notebookId: 'queue-csc108-06-file-io',
    name: '06 - File IO：打开、读取、写入与逐行处理',
    description:
      'CSC108 学生版 Markdown 笔记：open modes、read/readline/readlines、write/writelines、with 和大文件读取策略。',
    tags: ['CSC108', 'Python', 'Markdown', 'File IO'],
    sections: [
      {
        title: '文件打开模式',
        markdown: m`
open(filename, mode) 用来打开文件。常见模式：

| 模式 | 含义 | 文件不存在时 |
| --- | --- | --- |
| r | 只读 | 报错 |
| w | 写入，先清空原文件 | 创建新文件 |
| a | 追加到文件末尾 | 创建新文件 |
| r+ | 读写，不清空 | 报错 |
| w+ | 读写，先清空 | 创建新文件 |
| a+ | 追加读写 | 创建新文件 |

例子：

~~~python
file = open("example.txt", "r", encoding="utf-8")
content = file.read()
file.close()
~~~

课程里建议优先使用 with，因为它会自动关闭文件。
        `,
      },
      {
        title: 'read、readline、readlines',
        markdown: m`
假设 example.txt 有多行文本。

read() 会一次性读完整个文件，返回一个字符串：

~~~python
with open("example.txt", "r", encoding="utf-8") as file:
    content = file.read()
~~~

readline() 一次读一行，读到文件末尾时返回空字符串：

~~~python
with open("example.txt", "r", encoding="utf-8") as file:
    line = file.readline()
    while line != "":
        print(line.strip())
        line = file.readline()
~~~

readlines() 一次读所有行，返回 list[str]：

~~~python
with open("example.txt", "r", encoding="utf-8") as file:
    lines = file.readlines()
~~~

大文件不要用 read() 或 readlines() 一次性读完。
        `,
      },
      {
        title: '例题 1：100GB 文件读第一行',
        markdown: m`
题目：book.txt 有 100GB，只想得到第一行。下面哪种策略合适？

假设已经执行：

~~~python
file = open("book.txt", "r", encoding="utf-8")
~~~

选项：

~~~text
A. file.read()[0]
B. file.read().split("\n")[0]
C. file.readline()
D. file.readlines()[0]
~~~

正确选择：C。

原因：

- read() 会把 100GB 全部读入内存，不适合。
- readlines() 也会把所有行读入内存，不适合。
- readline() 只读当前一行，最省内存。

检查点：文件很大时，优先逐行处理。
        `,
      },
      {
        title: '写入文件',
        markdown: m`
write() 写入一个字符串，不会自动加换行。

~~~python
with open("example.txt", "w", encoding="utf-8") as file:
    file.write("Hello, World!\n")
    file.write("This is a test file.\n")
    file.write("Goodbye!\n")
~~~

writelines() 写入字符串列表，也不会自动加换行，列表元素里要自己带 \n：

~~~python
lines = ["Line 1\n", "Line 2\n", "Line 3\n"]

with open("example.txt", "w", encoding="utf-8") as file:
    file.writelines(lines)
~~~

如果用 w 模式打开已有文件，原内容会被清空。想保留旧内容并往后加，用 a 模式。
        `,
      },
      {
        title: '例题 2：统计非空行',
        markdown: m`
题目：写一个函数，统计文件中非空行的数量。

代码：

~~~python
from typing import TextIO

def count_non_empty_lines(file: TextIO) -> int:
    """Return the number of non-empty lines in file."""
    count = 0
    for line in file:
        if line.strip() != "":
            count += 1
    return count
~~~

使用：

~~~python
with open("notes.txt", "r", encoding="utf-8") as f:
    print(count_non_empty_lines(f))
~~~

为什么用 line.strip()？

- line 末尾通常带 \n。
- 如果一行只有空格，也应该算空行。
        `,
      },
      {
        title: '例题 3：复制文件并加行号',
        markdown: m`
题目：把 input.txt 复制到 output.txt，每一行前面加行号。

代码：

~~~python
with open("input.txt", "r", encoding="utf-8") as source:
    with open("output.txt", "w", encoding="utf-8") as target:
        line_number = 1
        for line in source:
            target.write(f"{line_number}: {line}")
            line_number += 1
~~~

注意：

- for line in source 会逐行读取，适合大文件。
- line 自己通常已经包含末尾的 \n，所以 target.write 不需要额外加换行。
- 如果 line 没有换行，最后一行的格式可能不同，这是文件末尾常见边界情况。
        `,
      },
    ],
  },
  {
    index: '07',
    sourceFile: '07_Dictionary.docx',
    notebookId: 'queue-csc108-07-dictionary',
    name: '07 - Dictionary：键值对、遍历与计数模式',
    description:
      'CSC108 学生版 Markdown 笔记：tuple、dictionary、key lookup、get、update、pop、items、word frequency 和测试思路。',
    tags: ['CSC108', 'Python', 'Markdown', 'Dictionary'],
    sections: [
      {
        title: 'Tuple 快速复习',
        markdown: m`
tuple 是有顺序、不可变的序列，经常用来表示固定组合的数据。

~~~python
t1 = (1, 2, 3)
t2 = ("apple", "banana", "cherry")
t3 = (1, "hello", 3.14, True)
t4 = (5,)
t5 = (5)
~~~

t4 是 tuple，t5 是 int。

tuple 支持 unpacking：

~~~python
person = ("Alice", 25, "Toronto")
name, age, city = person
~~~

函数也可以返回多个值，本质上是返回 tuple：

~~~python
def divide(a: int, b: int) -> tuple[int, int]:
    return a // b, a % b

quotient, remainder = divide(10, 3)
~~~
        `,
      },
      {
        title: 'Dictionary 的核心模型',
        markdown: m`
dictionary 用键值对存数据。key 必须唯一，value 可以重复。

~~~python
d = {}
d = {"a": 5, "b": 4, "c": 3}
d = {2: 5, True: 4}
~~~

访问：

~~~python
my_dict = {"name": "Alice", "age": 25}
print(my_dict["name"])     # Alice
print(my_dict.get("age"))  # 25
print(my_dict.get("grade")) # None
~~~

如果用 [] 访问不存在的 key，会触发 KeyError。get 更安全。

添加或更新：

~~~python
my_dict["grade"] = 45
my_dict["name"] = "Nick"
~~~

删除：

~~~python
my_dict.pop("name")
~~~
        `,
      },
      {
        title: '例题 1：key 顺序和重复 key',
        markdown: m`
题目：下面代码输出什么？

~~~python
lst1 = [1, 2]
lst2 = [2, 1]
print(lst1 == lst2)

d1 = {"a": 1, "b": 2}
d2 = {"b": 2, "a": 1}
print(d1 == d2)
~~~

结果：

~~~text
False
True
~~~

list 比较时顺序重要。dictionary 比较时看键值对是否一致，不看写出来的顺序。

再看重复 key：

~~~python
my_dict = {"a": 1, "b": 2, "a": 3}
print(my_dict)
~~~

结果：

~~~text
{"a": 3, "b": 2}
~~~

同一个 key 后面的值会覆盖前面的值。
        `,
      },
      {
        title: '遍历 dictionary',
        markdown: m`
遍历 dictionary 时，默认遍历 key：

~~~python
my_dict = {"name": "Alice", "age": 25}

for key in my_dict:
    print(key)
    print(my_dict[key])
~~~

如果想同时得到 key 和 value，用 items()：

~~~python
for key, value in my_dict.items():
    print(key, value)
~~~

常用方法：

~~~python
list(my_dict.keys())
list(my_dict.values())
list(my_dict.items())
"name" in my_dict      # 检查 key
"Alice" in my_dict     # 不是检查 value
~~~

检查点：in dict 检查的是 key，不是 value。
        `,
      },
      {
        title: '例题 2：词频统计',
        markdown: m`
题目：写函数 words_frequency，输入字符串列表，返回小写单词到出现次数的 dictionary。

示例：

~~~python
words_frequency(["ab", "Ab", "bc", "cd", "bc"])
# {"ab": 2, "bc": 2, "cd": 1}
~~~

代码：

~~~python
def words_frequency(words: list[str]) -> dict[str, int]:
    """Return a frequency dictionary for lower-case versions of words."""
    counts = {}
    for word in words:
        key = word.lower()
        if key not in counts:
            counts[key] = 0
        counts[key] += 1
    return counts
~~~

核心模式：

1. 把原始元素转换成 key。
2. 如果 key 第一次出现，先初始化。
3. 更新累计值。

这个模式会在 CSV、文本分析、图结构里反复出现。
        `,
      },
      {
        title: '例题 3：dictionary of lists',
        markdown: m`
题目：已知图的邻接表：

~~~python
graph = {
    4: [2, 1, 3, 2, 5],
    5: [1, 3, 7],
    8: [2, 5, 1, 4],
}
~~~

问题 A：节点 4 连接到哪些节点？

~~~python
graph[4]
~~~

结果：

~~~text
[2, 1, 3, 2, 5]
~~~

问题 B：哪些节点连接到了 2？

~~~python
sources = []
for node, neighbours in graph.items():
    if 2 in neighbours:
        sources.append(node)
print(sources)
~~~

结果：

~~~text
[4, 8]
~~~

易错点：value 是 list 时，graph[node] 取出来以后还要用 list 的规则继续处理。
        `,
      },
      {
        title: '测试：黑盒和白盒的入口',
        markdown: m`
给函数写测试时，可以先做黑盒测试，再做白盒测试。

黑盒测试只看 docstring 和需求，不看实现：

- 空输入。
- 典型输入。
- 边界输入。
- 可能暴露错误的特殊输入。

白盒测试会看实现，专门覆盖代码里的分支和循环路径。

例子：closest(data, val) 如果 data 为空，代码是否会访问 data[loc]？如果 val 里有多个目标值，循环是否每个都处理？这些问题通常要结合实现代码检查。
        `,
      },
    ],
  },
  {
    index: '08',
    sourceFile: '08_csv.docx',
    notebookId: 'queue-csc108-08-csv',
    name: '08 - TextIO 和 CSV：表格文件读写',
    description:
      'CSC108 学生版 Markdown 笔记：TextIO 类型、CSV 格式、csv.reader、csv.writer、手动 split/join 和表格数据处理。',
    tags: ['CSC108', 'Python', 'Markdown', 'CSV'],
    sections: [
      {
        title: 'TextIO 是什么',
        markdown: m`
用 open 打开的文件对象可以标注为 TextIO。

~~~python
from typing import TextIO

file = open("example.txt", "r", encoding="utf-8")
~~~

把文件对象传给函数时，类型可以写成 TextIO：

~~~python
from typing import TextIO

def write_message(file: TextIO, message: str) -> None:
    file.write(message + "\n")
~~~

TextIO 的好处是让函数更清楚：这个参数不是文件名字符串，而是一个已经打开的文本文件对象。
        `,
      },
      {
        title: 'CSV 格式',
        markdown: m`
CSV 是 Comma-Separated Values，常用来存表格数据。

文件内容：

~~~text
Name,Subject,Score
Alice,Math,90
Bob,English,85
Charlie,Science,92
~~~

对应表格：

| Name | Subject | Score |
| --- | --- | --- |
| Alice | Math | 90 |
| Bob | English | 85 |
| Charlie | Science | 92 |

CSV 不一定永远用逗号。有些文件会用分号、tab 或空格作为分隔符，但课程里的基础题通常先从逗号开始。
        `,
      },
      {
        title: '例题 1：用 csv.reader 读取',
        markdown: m`
题目：逐行读取 students.csv。

~~~python
import csv

with open("students.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        print(row)
~~~

输出：

~~~text
['Name', 'Subject', 'Score']
['Alice', 'Math', '90']
['Bob', 'English', '85']
['Charlie', 'Science', '92']
~~~

注意：csv.reader 读出来的每个 row 是 list[str]，所以 Score 也是字符串 "90"。要做数学运算时需要 int(row[2])。
        `,
      },
      {
        title: '手动 split 读取',
        markdown: m`
不用 csv module，也可以用字符串方法处理简单 CSV：

~~~python
with open("data.csv", "r", encoding="utf-8") as csv_file:
    header = csv_file.readline()
    for line in csv_file:
        values = line.strip().split(",")
        print(values)
~~~

这种方法适合非常简单的数据，但有局限：

- 如果字段里本身有逗号，会解析错误。
- 如果有引号规则，会变复杂。
- 如果有空行，要额外处理。

真实 CSV 题优先使用 csv module。手动 split 更适合帮助理解“每行拆成多个字段”的基本思路。
        `,
      },
      {
        title: '例题 2：计算平均分',
        markdown: m`
题目：读取 students.csv，计算 Score 平均值。

~~~python
import csv

total = 0
count = 0

with open("students.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    next(reader)  # skip header
    for row in reader:
        total += int(row[2])
        count += 1

print(total / count)
~~~

步骤：

1. 用 next(reader) 跳过标题行。
2. row[2] 是分数字段。
3. int(row[2]) 把字符串转成整数。
4. 用 total 和 count 两个累计器算平均。

边界情况：如果文件只有 header，没有数据行，count 会是 0，不能直接除。
        `,
      },
      {
        title: '例题 3：写入 CSV',
        markdown: m`
题目：把二维列表写成 output.csv。

~~~python
import csv

data = [
    ["Name", "Subject", "Score"],
    ["Alice", "Math", 90],
    ["Bob", "English", 85],
]

with open("output.csv", "w", encoding="utf-8", newline="") as f:
    writer = csv.writer(f)
    writer.writerows(data)
~~~

也可以手动 join：

~~~python
data = [
    ["Name", "Subject", "Score"],
    ["Alice", "Math", "90"],
    ["Bob", "English", "85"],
]

with open("output.csv", "w", encoding="utf-8") as f:
    for row in data:
        line = ",".join(row)
        f.write(line + "\n")
~~~

检查点：join 只能连接字符串，所以数字要先转成 str，或者让 csv.writer 帮你处理。
        `,
      },
    ],
  },
  {
    index: '09',
    sourceFile: '09_Regex.docx',
    notebookId: 'queue-csc108-09-regex',
    name: '09 - DFA 和 Regex：模式、分组与 Python re',
    description:
      'CSC108 学生版 Markdown 笔记：DFA 基本概念、正则表达式、re.findall、re.match、re.search 和分组结果。',
    tags: ['CSC108', 'Python', 'Markdown', 'Regex'],
    sections: [
      {
        title: 'DFA 的基本概念',
        markdown: m`
DFA 是 deterministic finite automaton，用来描述一个字符串是否被某种规则接受。

一个 DFA 通常包含：

- 有限个状态。
- 一个输入字母表，例如 {0, 1}。
- 转移函数，也就是读到某个字符时从一个状态走到另一个状态。
- 初始状态。
- 接受状态集合。

读字符串时，从初始状态开始，一个字符一个字符走。读完后如果停在接受状态，就接受；否则拒绝。
        `,
      },
      {
        title: '例题 1：不包含 substring 011 的思路',
        markdown: m`
题目：设计一个接受“不包含 011”的二进制字符串的 DFA。

思路不要一开始画完整图，先记录“已经匹配到 011 的多少前缀”：

| 状态 | 含义 |
| --- | --- |
| q0 | 目前没有匹配到 011 的前缀 |
| q1 | 最近看到了 0 |
| q2 | 最近看到了 01 |
| q_bad | 已经看到了 011 |

转移要点：

- q0 读到 0 到 q1，读到 1 留在 q0。
- q1 读到 0 仍可看作最近看到 0，留在 q1；读到 1 到 q2。
- q2 读到 1 到 q_bad，因为出现 011；读到 0 回到 q1。
- q_bad 读任何字符都留在 q_bad。

接受状态是 q0、q1、q2。q_bad 不接受。

检查点：如果题目是“不包含某模式”，通常先画“包含该模式”的坏状态，再把坏状态设为不接受。
        `,
      },
      {
        title: 'Regex 基本符号',
        markdown: m`
正则表达式用模式匹配字符串。

常见符号：

| 写法 | 含义 |
| --- | --- |
| a | 字符 a |
| a|b | a 或 b |
| [abc] | a、b、c 之一 |
| [a-z] | a 到 z 的任意小写字母 |
| . | 任意一个字符 |
| * | 前一个模式重复 0 次或更多 |
| + | 前一个模式重复 1 次或更多 |
| ? | 前一个模式重复 0 次或 1 次 |
| ^ | 字符串开头 |
| $ | 字符串结尾 |

例子：

~~~text
dog(dog)*   可以匹配 dog, dogdog, dogdogdog
do*g        可以匹配 dg, dog, doog
dog+        可以匹配 dog, dogg, doggg
[abcdefg]og 可以匹配 aog, bog, cog, ... gog
~~~
        `,
      },
      {
        title: '例题 2：二进制字符串的正则表达式',
        markdown: m`
把语言描述翻译成 regex：

| 语言 | Regex |
| --- | --- |
| 只包含 0，可以为空 | 0* |
| 所有二进制字符串，可以为空 | (0|1)* |
| 所有非空二进制字符串 | (0|1)(0|1)* |
| 以 1 开头且以 1 结尾 | 1(0|1)*1 |
| 至少有三个 1 | (0|1)*1(0|1)*1(0|1)*1(0|1)* |
| 至少有三个连续的 1 | (0|1)*111(0|1)* |
| 长度至少 3，第三个字符是 0 | (0|1)(0|1)0(0|1)* |

检查点：* 表示可以出现 0 次，所以它经常允许空字符串。题目要求非空时，需要额外放一个必选字符。
        `,
      },
      {
        title: 'Python re.findall',
        markdown: m`
re.findall(pattern, string) 返回所有不重叠匹配。

~~~python
import re

re.findall(r"do*g", "dgdogdoogdooog")
# ['dg', 'dog', 'doog', 'dooog']

re.findall(r"do+g", "dgdogdoogdooog")
# ['dog', 'doog', 'dooog']

re.findall(r"^Hello", "Hello world")
# ['Hello']

re.findall(r"^Hello", "He said Hello world")
# []
~~~

r"..." 是 raw string，适合写正则，避免反斜杠被 Python 字符串先解释。
        `,
      },
      {
        title: '例题 3：字符类和数量',
        markdown: m`
题目：下面 findall 的结果是什么？

~~~python
import re

re.findall(r"\d+", "My phone is 123-456-7890 and my ID is 999888.")
re.findall(r"[^0-9]", "a1b2c3")
re.findall(r"[^aeiou]", "hello")
re.findall(r"\d+-\d+", "My phone is 123-456-7890 and my ID is 999888.")
~~~

结果：

~~~python
["123", "456", "7890", "999888"]
["a", "b", "c"]
["h", "l", "l"]
["123-456"]
~~~

解释：

- \d+ 找连续数字。
- [^0-9] 找不是数字的单个字符。
- [^aeiou] 找不是元音的字符。
- \d+-\d+ 需要数字、连字符、数字，所以在电话号码中匹配第一段 123-456。
        `,
      },
      {
        title: '例题 4：分组、match 和 search',
        markdown: m`
分组会改变 findall 的返回结构。

~~~python
import re

re.findall(r"(\d{4})年", "我出生于1997年，如今是2025年")
# ['1997', '2025']

re.findall(r"((\d{3})-(\d{4}))", "123-4567 888-9999")
# [('123-4567', '123', '4567'), ('888-9999', '888', '9999')]
~~~

match 和 search 的区别：

~~~python
res = re.match(r"Hello", "Hello world")
print(res.group())  # Hello

re.match(r"Hello", "He said Hello world")
# None

res = re.search(r"Hello", "He said Hello world")
print(res.group())  # Hello
~~~

match 只从开头尝试匹配。search 会在整个字符串里找第一个符合的位置。
        `,
      },
    ],
  },
  {
    index: '10',
    sourceFile: '10_Running_time.docx',
    notebookId: 'queue-csc108-10-running-time',
    name: '10 - Running Time：二分查找、排序与 Big-O',
    description:
      'CSC108 学生版 Markdown 笔记：binary search、insertion/selection/bubble/merge sort、Big-O 和 list operation 复杂度。',
    tags: ['CSC108', 'Python', 'Markdown', 'Running Time'],
    sections: [
      {
        title: '运行时间分析看什么',
        markdown: m`
运行时间分析关心输入变大时，程序需要多少步。

常见复杂度：

| 复杂度 | 直觉 |
| --- | --- |
| O(1) | 和输入大小无关 |
| O(log n) | 每次把范围缩小一大块 |
| O(n) | 每个元素看一次 |
| O(n log n) | 分治排序常见 |
| O(n^2) | 双层遍历或简单排序常见 |

Big-O 通常只保留增长最快的项，忽略常数和低阶项。例如 3n^2 + 20n + 5 是 O(n^2)。
        `,
      },
      {
        title: 'Binary Search',
        markdown: m`
二分查找适用于有序 list。每次检查中间元素，然后丢掉一半搜索范围。

步骤：

1. low 指向最左，high 指向最右。
2. mid = (low + high) // 2。
3. 如果 L[mid] 是目标，找到。
4. 如果目标更小，high = mid - 1。
5. 如果目标更大，low = mid + 1。

时间复杂度是 O(log n)。

前提很重要：list 必须已经按同一种顺序排好。对未排序数字 list 不能直接做 binary search。按字母顺序排好的字符串 list 可以做。
        `,
      },
      {
        title: '例题 1：Binary Search 追踪',
        markdown: m`
题目：在下面 list 中查找 8。

~~~python
values = [1, 3, 5, 6, 8, 9, 12]
~~~

追踪：

| low | high | mid | values[mid] | 下一步 |
| ---: | ---: | ---: | ---: | --- |
| 0 | 6 | 3 | 6 | 8 更大，low = 4 |
| 4 | 6 | 5 | 9 | 8 更小，high = 4 |
| 4 | 4 | 4 | 8 | 找到 |

检查点：每一步必须保证目标如果存在，还在 low 到 high 的范围里。
        `,
      },
      {
        title: '三种基础排序',
        markdown: m`
Insertion Sort：

- 左边维护一个已排序区域。
- 每次把下一个元素插入到左边正确位置。
- 对几乎排好序的 list 往往表现很好。

Selection Sort：

- 每一轮从未排序区域找最小值。
- 把它交换到当前最前面。
- 每一轮固定一个最终位置。

Bubble Sort：

- 相邻元素两两比较，顺序错了就交换。
- 一轮结束后，最大的元素会被“冒泡”到右边。

这三种基础排序最坏情况通常是 O(n^2)。它们适合学习算法过程，不适合大数据。
        `,
      },
      {
        title: '例题 2：Bubble Sort 一轮追踪',
        markdown: m`
题目：对 [1, 9, 3, 5, 6, 8, 2] 做一轮 bubble sort。

步骤：

~~~text
[1, 9, 3, 5, 6, 8, 2]
[1, 3, 9, 5, 6, 8, 2]
[1, 3, 5, 9, 6, 8, 2]
[1, 3, 5, 6, 9, 8, 2]
[1, 3, 5, 6, 8, 9, 2]
[1, 3, 5, 6, 8, 2, 9]
~~~

结果：最大值 9 到达最后一个位置。

检查点：bubble sort 的每一轮不一定让整个 list 排好，但会让一个大元素固定到右侧。
        `,
      },
      {
        title: 'Merge Sort 和分治',
        markdown: m`
Merge Sort 使用 divide and conquer：

1. 如果 list 长度大于 1，把它分成两半。
2. 对左半递归排序。
3. 对右半递归排序。
4. 把两个有序 list 合并成一个有序 list。

Merge Sort 的典型复杂度是 O(n log n)。

直觉：

- 每一层合并总共看 n 个元素。
- 一共有大约 log n 层。
- 所以总时间是 O(n log n)。

相比 insertion、selection、bubble sort，merge sort 更适合较大的 n。
        `,
      },
      {
        title: '例题 3：判断排序算法',
        markdown: m`
题目：list ['B', 'M', 'E', 'A', 'C', 'D'] 使用 selection sort 升序排序。

已知：

~~~text
After one pass:  ['A', 'M', 'E', 'B', 'C', 'D']
After two pass:  ['A', 'B', 'E', 'M', 'C', 'D']
~~~

继续：

- 第三轮在 E, M, C, D 中找最小值 C，和位置 2 的 E 交换。
- 第四轮在 M, E, D 中找最小值 D，和位置 3 的 M 交换。

结果：

~~~text
After three pass: ['A', 'B', 'C', 'M', 'E', 'D']
After four pass:  ['A', 'B', 'C', 'D', 'E', 'M']
~~~

检查点：selection sort 每一轮会把当前未排序区域的最小元素放到最左边。
        `,
      },
      {
        title: 'List 操作复杂度',
        markdown: m`
常见 list 操作复杂度：

| 操作 | 时间复杂度 |
| --- | --- |
| 按 index 访问 L[i] | O(1) |
| append 到末尾 | O(1) 平均 |
| insert 到任意位置 | O(n) |
| remove/pop 中间元素 | O(n) |
| slicing L[a:b] | O(k)，k 是切片长度 |
| 拼接 L1 + L2 | O(n + m) |
| extend | O(k)，k 是被加入元素数 |
| 在 list 中搜索元素 | O(n) |

典型陷阱：循环里反复删除第一个元素通常是 O(n^2)，因为每次删除都要移动后面的元素。
        `,
      },
    ],
  },
  {
    index: '11',
    sourceFile: '11_Class.docx',
    notebookId: 'queue-csc108-11-class',
    name: '11 - Class：对象、属性、方法与封装',
    description:
      'CSC108 学生版 Markdown 笔记：OOP、class、__init__、self、实例属性、方法、Person 和 BankAccount。',
    tags: ['CSC108', 'Python', 'Markdown', 'Class'],
    sections: [
      {
        title: 'OOP 的核心想法',
        markdown: m`
class 用来定义自己的数据类型。它把数据和行为放在一起：

- 数据叫 attribute。
- 行为叫 method。
- 根据 class 创建出来的具体东西叫 object 或 instance。

基本形状：

~~~python
class ClassName:
    def __init__(self, param1, param2):
        self.attr1 = param1
        self.attr2 = param2

    def method_name(self, param):
        return self.attr1 + param
~~~

self 代表当前这个对象。写方法时第一个参数通常是 self，调用时不需要手动传 self。
        `,
      },
      {
        title: '__init__ 和实例属性',
        markdown: m`
__init__ 是构造方法。创建对象时，Python 会自动调用它。

~~~python
class Person:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
~~~

创建对象：

~~~python
person = Person("Alice", 25)
~~~

执行后：

- person.name 是 "Alice"。
- person.age 是 25。

实例属性属于某个具体对象。两个 Person 对象可以有不同的 name 和 age。
        `,
      },
      {
        title: '例题 1：Person 方法',
        markdown: m`
题目：读懂下面 class。

~~~python
class Person:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age

    def greet(self) -> str:
        return f"Hello, my name is {self.name} and I'm {self.age} years old."

person = Person("Alice", 25)
print(person.greet())
~~~

步骤：

1. Person("Alice", 25) 创建一个对象。
2. __init__ 把 self.name 设为 "Alice"，self.age 设为 25。
3. person.greet() 调用对象方法，self 是 person。
4. 方法读取 person.name 和 person.age，返回字符串。

输出：

~~~text
Hello, my name is Alice and I'm 25 years old.
~~~
        `,
      },
      {
        title: '方法如何修改对象状态',
        markdown: m`
method 可以读取属性，也可以修改属性。

~~~python
class Counter:
    def __init__(self):
        self.value = 0

    def increase(self) -> None:
        self.value += 1

    def get_value(self) -> int:
        return self.value
~~~

使用：

~~~python
c = Counter()
c.increase()
c.increase()
print(c.get_value())  # 2
~~~

对象状态是随着方法调用变化的。追踪 class 代码时，要像追踪 list mutation 一样追踪每个属性当前的值。
        `,
      },
      {
        title: '例题 2：BankAccount 封装',
        markdown: m`
题目：读懂 BankAccount。

~~~python
class BankAccount:
    def __init__(self, balance: int):
        self.__balance = balance

    def deposit(self, amount: int) -> None:
        self.__balance += amount

    def get_balance(self) -> int:
        return self.__balance

account = BankAccount(100)
account.deposit(50)
print(account.get_balance())
~~~

输出：

~~~text
150
~~~

这里 __balance 表示内部属性，不希望外部直接随便改。外部应该通过 deposit 和 get_balance 这样的 method 与对象交互。

检查点：class 的公开方法就是对象给外界使用的接口。
        `,
      },
      {
        title: '例题 3：多个对象互不影响',
        markdown: m`
题目：下面代码输出什么？

~~~python
class BankAccount:
    def __init__(self, balance: int):
        self.balance = balance

    def deposit(self, amount: int) -> None:
        self.balance += amount

    def get_balance(self) -> int:
        return self.balance

a = BankAccount(100)
b = BankAccount(20)
a.deposit(50)
b.deposit(5)
print(a.get_balance())
print(b.get_balance())
~~~

结果：

~~~text
150
25
~~~

a 和 b 是两个不同对象，各自有自己的 balance。调用 a.deposit 不会修改 b.balance。
        `,
      },
      {
        title: '常见错误检查',
        markdown: m`
写 class 时常见错误：

- 忘记在 method 的参数里写 self。
- 在 __init__ 里写 name = name，而不是 self.name = name。
- 调用方法时忘记括号，例如 person.greet。
- 把 class attribute 和 instance attribute 混在一起。
- 直接从外部乱改属性，导致对象状态不一致。

自检问题：

1. 这个对象有哪些属性？
2. 每个属性在哪里初始化？
3. 哪些方法会改变属性？
4. 哪些方法只读取属性并返回结果？
5. 如果创建两个对象，它们的属性是否各自独立？
        `,
      },
    ],
  },
];

function parseArgs(argv) {
  const args = { write: false, only: null, help: false, courseId: COURSE_ID };
  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--only=')) {
      args.only = new Set(
        arg
          .slice('--only='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith('--course-id=')) {
      args.courseId = arg.slice('--course-id='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/maintenance/import-csc108-word-markdown-notebooks.mjs [--write] [--only=01,02] [--course-id=${DEFAULT_COURSE_ID}]

Default mode is dry-run. Add --write to mutate the configured database.`;
}

function loadEnvFiles() {
  for (const fileName of ['.env', '.env.local']) {
    const filePath = path.join(ROOT, fileName);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function summary(markdown) {
  return markdown
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[#*_`>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function validateNotebook(notebook) {
  const sourcePath = path.join(QUEUE_DIR, notebook.sourceFile);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source Word file: ${sourcePath}`);
  }
  if (notebook.sections.length < 6) {
    throw new Error(`${notebook.notebookId}: expected at least 6 sections`);
  }
  const exampleCount = notebook.sections.filter((section) =>
    /例题|追踪/.test(section.title),
  ).length;
  if (exampleCount < 3) {
    throw new Error(
      `${notebook.notebookId}: expected at least 3 worked examples, got ${exampleCount}`,
    );
  }
  for (const [index, section] of notebook.sections.entries()) {
    if (!section.title.trim()) {
      throw new Error(`${notebook.notebookId}: section ${index} has no title`);
    }
    if (/^\s*[-*]\s*$/m.test(section.markdown)) {
      throw new Error(`${notebook.notebookId}/${section.title}: orphan list marker`);
    }
    if (
      /Disclaimer|Speed Up Education|not for sale|Bochen|留学申请|脱裤|皇帝|老师教/i.test(
        section.markdown,
      )
    ) {
      throw new Error(`${notebook.notebookId}/${section.title}: leaked source boilerplate`);
    }
    const fenceCount = (section.markdown.match(/^~~~[A-Za-z0-9_-]*$/gm) || []).length;
    if (fenceCount % 2 !== 0) {
      throw new Error(`${notebook.notebookId}/${section.title}: unbalanced code fence`);
    }
  }
}

function selectedNotebooks(only) {
  const notebooks = only
    ? NOTEBOOKS.filter(
        (notebook) =>
          only.has(notebook.index) || only.has(notebook.notebookId) || only.has(notebook.name),
      )
    : NOTEBOOKS;
  if (only && notebooks.length === 0) {
    throw new Error(`No notebooks matched --only=${Array.from(only).join(',')}`);
  }
  for (const notebook of notebooks) validateNotebook(notebook);
  return notebooks;
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

function buildSections(notebook, courseId) {
  return notebook.sections.map((section, order) => ({
    id: `${notebook.notebookId}-s${String(order + 1).padStart(2, '0')}`,
    title: section.title,
    order,
    markdown: section.markdown,
    summary: summary(section.markdown),
    sourceMeta: {
      sourceKind: 'queue-docx',
      sourcePath: `queue/CSC108/${notebook.sourceFile}`,
      importVersion: IMPORT_VERSION,
      lectureLabel: notebook.name,
      courseId,
    },
  }));
}

async function upsertMarkdownNotebook(prisma, course, notebook) {
  const sections = buildSections(notebook, course.id);
  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: notebook.notebookId },
      create: {
        id: notebook.notebookId,
        ownerId: course.ownerId,
        courseId: course.id,
        name: notebook.name,
        description: notebook.description,
        tags: notebook.tags,
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
        name: notebook.name,
        description: notebook.description,
        tags: notebook.tags,
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
    await tx.scene.deleteMany({ where: { notebookId: notebook.notebookId } });
    await tx.markdownNotebookSection.deleteMany({ where: { notebookId: notebook.notebookId } });
    await tx.markdownNotebookSection.createMany({
      data: sections.map((section) => ({
        ...section,
        notebookId: notebook.notebookId,
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
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured. Add it to .env.local or the shell env.');
  }

  const notebooks = selectedNotebooks(args.only);
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({
      where: { id: args.courseId },
      select: { id: true, name: true, courseCode: true, ownerId: true },
    });
    if (!course) throw new Error(`Course not found: ${args.courseId}`);

    const existing = await prisma.notebook.findMany({
      where: { id: { in: notebooks.map((notebook) => notebook.notebookId) } },
      select: {
        id: true,
        notebookKind: true,
        sceneCount: true,
        sectionCount: true,
        _count: { select: { scenes: true, markdownSections: true } },
      },
    });
    const existingById = new Map(existing.map((item) => [item.id, item]));

    console.log(`Mode: ${args.write ? 'write' : 'dry-run'}`);
    console.log(`Course: ${course.name} (${course.id}) owner=${course.ownerId}`);
    console.log(`Import version: ${IMPORT_VERSION}`);

    for (const notebook of notebooks) {
      const before = existingById.get(notebook.notebookId);
      const beforeText = before
        ? `old kind=${before.notebookKind}, old sections=${before._count.markdownSections}, old scenes=${before._count.scenes}`
        : 'new notebook';
      console.log(
        `- ${args.write ? 'upsert' : 'would upsert'} ${notebook.index}: ${notebook.name} (${notebook.sections.length} sections; ${beforeText})`,
      );
      for (const section of notebook.sections) {
        console.log(`  - ${section.title}`);
      }
    }

    if (!args.write) {
      console.log('Dry-run complete. Re-run with --write to mutate the target DB.');
      return;
    }

    for (const notebook of notebooks) {
      await upsertMarkdownNotebook(prisma, course, notebook);
    }
    await refreshCourseSummaryFields(prisma, course.id);

    const created = await prisma.notebook.findMany({
      where: { id: { in: notebooks.map((notebook) => notebook.notebookId) } },
      select: {
        id: true,
        name: true,
        notebookKind: true,
        sceneCount: true,
        sectionCount: true,
        _count: { select: { scenes: true, markdownSections: true } },
      },
      orderBy: { id: 'asc' },
    });
    console.log('Write complete.');
    for (const notebook of created) {
      console.log(
        `- ${notebook.id}: kind=${notebook.notebookKind}, sectionCount=${notebook.sectionCount}, markdownSections=${notebook._count.markdownSections}, scenes=${notebook._count.scenes}`,
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
