export const CSC108_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
export const CSC108_COURSE_MEMORY_ID = 'memory_csc108_course_public_20260615';
export const CSC108_COURSE_MEMORY_TITLE = 'CSC108 课程共有记忆';

function m(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

export const CSC108_NOTEBOOK_MEMORY_SPECS = [
  {
    notebookId: 'queue-csc108-01-basic-operations',
    memoryId: 'memory_csc108_queue_01_basic_operations_public_20260615',
    title: 'CSC108 Python 基础公共记忆',
  },
  {
    notebookId: 'queue-csc108-02-control',
    memoryId: 'memory_csc108_queue_02_control_public_20260615',
    title: 'CSC108 函数与条件控制公共记忆',
  },
  {
    notebookId: 'queue-csc108-03-loop',
    memoryId: 'memory_csc108_queue_03_loop_public_20260615',
    title: 'CSC108 循环公共记忆',
  },
  {
    notebookId: 'queue-csc108-04-list',
    memoryId: 'memory_csc108_queue_04_list_public_20260615',
    title: 'CSC108 List 公共记忆',
  },
  {
    notebookId: 'queue-csc108-05-input-output',
    memoryId: 'memory_csc108_queue_05_input_output_public_20260615',
    title: 'CSC108 Input/Output 公共记忆',
  },
  {
    notebookId: 'queue-csc108-06-file-io',
    memoryId: 'memory_csc108_queue_06_file_io_public_20260615',
    title: 'CSC108 File IO 公共记忆',
  },
  {
    notebookId: 'queue-csc108-07-dictionary',
    memoryId: 'memory_csc108_queue_07_dictionary_public_20260615',
    title: 'CSC108 Dictionary 公共记忆',
  },
  {
    notebookId: 'queue-csc108-08-csv',
    memoryId: 'memory_csc108_queue_08_csv_public_20260615',
    title: 'CSC108 TextIO/CSV 公共记忆',
  },
  {
    notebookId: 'queue-csc108-09-regex',
    memoryId: 'memory_csc108_queue_09_regex_public_20260615',
    title: 'CSC108 Regex/DFA 公共记忆',
  },
  {
    notebookId: 'queue-csc108-10-running-time',
    memoryId: 'memory_csc108_queue_10_running_time_public_20260615',
    title: 'CSC108 Running Time 公共记忆',
  },
  {
    notebookId: 'queue-csc108-11-class',
    memoryId: 'memory_csc108_queue_11_class_public_20260615',
    title: 'CSC108 Class/OOP 公共记忆',
  },
];

export const CSC108_PUBLIC_MEMORY_TEXTS = {
  [CSC108_COURSE_MEMORY_ID]: m`
## 记忆角色
CSC108 的课程级公共记忆。它控制整门课答题口径：先判断题型和当前 notebook 已学工具，再选择最朴素的 Python 解法。具体 API、模板和典型错误由 notebook 公共记忆补充。

## 总答题协议
1. 先判题型：表达式求值、输出追踪、错误原因、选择题、函数设计、文件/CSV 处理、复杂度分析，还是 class 设计。
2. 只使用当前 notebook 和之前 notebook 已经学过的工具。不要为早期章节引入 list comprehension、lambda、高阶函数、异常处理、dataclass、pathlib、pandas、numpy 等未学工具。
3. 代码题优先保留题目给的 function header、type annotation、docstring 和参数名；不要改函数名或额外 print。
4. 函数题通常返回结果，不在函数内部 print，除非题目明确要求输出。
5. 解释题要追踪 execution state：变量当前值、数据类型、对象是否被 mutation、文件指针位置、循环变量和 accumulator 当前状态。

## 通用函数设计模板
~~~python
def function_name(param: Type) -> ReturnType:
    """Return/produce ...

    >>> function_name(example)
    expected
    """
    # compute intermediate values if helpful
    return result
~~~

提交代码时检查：
- signature/header 是否和题目一致。
- docstring 示例是否覆盖普通情况和边界情况。
- 返回值类型是否和 annotation 一致。
- 没有把调试用 print 留在函数 body。
- 没有把测试代码写进函数内部。

## 常见边界测试
- 空字符串、空 list、空 dict、空文件。
- 单元素 list、只有一行的文件、没有匹配 regex 的文本。
- 大小写、空格、换行符、标点。
- 重复值、重复 key、aliasing/mutation。
- 循环边界：第一个元素、最后一个元素、range 是否少 1。

## 章节工具边界
- Notebook 01-02：表达式、变量、字符串、函数、return、if/elif/else。
- Notebook 03：for/while/range、nested loop、accumulator。
- Notebook 04：list、索引、切片、mutation、aliasing。
- Notebook 05：input、print、f-string、类型转换。
- Notebook 06：open/read/readline/readlines/write/writelines/with。
- Notebook 07：dict lookup、update、membership、frequency/counting pattern。
- Notebook 08：TextIO、csv.reader/csv.writer、row conversion。
- Notebook 09：DFA/regex/re module。
- Notebook 10：Big-O、linear/binary search、sorting。
- Notebook 11：class、self、attributes、methods、encapsulation。

## 回答风格
选择题先排除为什么错，再给正确选项。代码题先给可运行版本，再解释关键状态。错误题要说清楚错误类型和触发位置。复杂度题要指出主导循环或算法步骤，不只写一个 O(...)。
`,

  memory_csc108_queue_01_basic_operations_public_20260615: m`
## 记忆角色
Notebook 01 的操作记忆。回答 Python 基础题时，用它检查表达式求值、变量、字符串、切片和类型转换，不要引入后面章节的复杂控制结构。

## 核心工具
- arithmetic: '+', '-', '*', '/', '//', '%', '**'
- comparison: '==', '!=', '<', '<=', '>', '>='
- assignment: 右边先求值，再绑定给左边变量名。
- types: 'int', 'float', 'str', 'bool'
- conversion: 'int(...)', 'float(...)', 'str(...)'
- string operators: '+', '*', indexing, slicing
- string methods: 'lower', 'upper', 'strip', 'replace', 'find', 'count', 'startswith', 'endswith', 'isalpha', 'isdigit'

## 表达式求值模板
1. 先算括号。
2. 再算 '**'。
3. 再算 '*', '/', '//', '%'；同级从左到右。
4. 最后算 '+', '-'。
5. 判断结果类型：'/' 总产生 float；涉及 float 的算术通常产生 float。

例子：
~~~python
8 / 2 * (2 + 2)      # 16.0
7 // 3               # 2
7 % 3                # 1
2 ** 3 + 1           # 9
~~~

## 字符串索引与切片
Python index 从 0 开始；负数 index 从右边数。切片 's[start:end]' 包含 start，不包含 end。

~~~python
word = 'abcdef'
word[0]      # 'a'
word[-1]     # 'f'
word[1:4]    # 'bcd'
word[:3]     # 'abc'
word[3:]     # 'def'
word[::-1]   # 'fedcba'
~~~

字符串 immutable。方法通常返回新字符串，不会原地修改原字符串。

~~~python
name = '  Ada  '
name.strip()       # 'Ada'
name               # still '  Ada  '
name = name.strip()
~~~

## 变量追踪
赋值不是数学等式，而是更新 name 到 value 的绑定。

~~~python
x = 10
y = x + 2
x = 3
print(y)  # 12
~~~

解释这类题时要按执行顺序维护变量表，不要用最后的 x 回头改 y。

## 常见错误
- 把 '/' 当成整数除法。
- 把 '==' 写成 '='，或把赋值语句当成表达式比较。
- 忘记字符串用引号。
- 切片 end 算成包含位置。
- 用 string method 后忘记接住返回的新字符串。
- 把数字字符串和数字直接相加：'3' + 4 会 TypeError。

## 检查清单
表达式题给出最终 value 和 type。字符串题说明 index/slice 边界。变量题按每一行更新状态。报错题指出具体 operator 或 method 的参数类型不匹配。
`,

  memory_csc108_queue_02_control_public_20260615: m`
## 记忆角色
Notebook 02 的操作记忆。回答函数、docstring、return/print、Boolean 和 if/elif/else 题时，优先用这一章的函数设计模板，不要跳到循环或 list-heavy 解法，除非题目已进入后续章节。

## 函数设计骨架
~~~python
def is_passing(score: float) -> bool:
    """Return True iff score is at least 50.

    >>> is_passing(50)
    True
    >>> is_passing(49.9)
    False
    """
    return score >= 50
~~~

关键点：
- header 包含函数名、参数、type annotation、返回类型。
- docstring 用自然语言说明结果，不复述实现细节。
- examples/doctest 要覆盖边界。
- function body 用 return 交出结果。

## return vs print
'return' 是函数结果；'print' 只是把文本输出到屏幕。

~~~python
def f(x: int) -> int:
    print(x + 1)

result = f(3)
print(result)
~~~

这会先输出 4，再输出 None，因为 f 没有 return。

## 条件模板
~~~python
if condition_1:
    ...
elif condition_2:
    ...
else:
    ...
~~~

只执行第一个 condition 为 True 的 branch。后面的 elif/else 不再检查。

范围题要注意顺序：
~~~python
if grade >= 90:
    letter = 'A'
elif grade >= 80:
    letter = 'B'
else:
    letter = 'C'
~~~

如果先写 'grade >= 80'，90 分也会提前进入 B。

## Boolean 逻辑
- 'and'：两边都 True 才 True。
- 'or'：至少一边 True 就 True。
- 'not'：取反。
- Python 也会 short-circuit：'and' 左边 False 时不求右边；'or' 左边 True 时不求右边。

~~~python
x != 0 and 10 / x > 2
~~~

x 为 0 时右边不会执行，因此不会除以 0。

## 作用域
函数内部定义的变量是 local。函数外面不能直接使用函数内部的 local variable。

~~~python
def area(length: float, width: float) -> float:
    result = length * width
    return result

print(result)  # NameError
~~~

## 常见错误
- 漏写 return，导致函数返回 None。
- 把 print 当成 return。
- if/elif 顺序错误，导致更具体的 case 被前面的宽泛 case 吃掉。
- 用 '=' 做比较。
- Boolean expression 写得太复杂，忘记 short-circuit。
- 修改题目给定的函数名、参数名或返回类型。

## 检查清单
函数题先确认 header 不变；再写 docstring examples；再根据参数类型和返回类型决定表达式或条件。追踪题说明每个 branch 是否会执行。错误题检查 NameError、TypeError、SyntaxError、None 返回。
`,

  memory_csc108_queue_03_loop_public_20260615: m`
## 记忆角色
Notebook 03 的操作记忆。回答 range、for、while、nested loop 和 accumulator 题时，重点追踪循环变量、循环次数和 accumulator 更新。

## for/range 模板
~~~python
total = 0
for i in range(start, stop, step):
    total = total + i
~~~

range 的 stop 不包含。常见形式：
~~~python
range(5)        # 0, 1, 2, 3, 4
range(2, 6)     # 2, 3, 4, 5
range(10, 0, -2) # 10, 8, 6, 4, 2
~~~

## accumulator 模板
数值累计：
~~~python
count = 0
for ch in text:
    if ch.isdigit():
        count = count + 1
return count
~~~

字符串累计：
~~~python
result = ''
for ch in text:
    if ch.isalpha():
        result = result + ch
return result
~~~

list 累计通常到 Notebook 04 后使用。

## while 模板
~~~python
i = 0
while i < len(text):
    ...
    i = i + 1
~~~

while 题要检查三件事：初始值、继续条件、每轮是否更新。如果循环变量没有靠近停止条件，就是 infinite loop 风险。

## nested loop
外层每执行一次，内层通常完整执行一轮。

~~~python
for row in range(3):
    for col in range(2):
        print(row, col)
~~~

总次数是 3 * 2 = 6。输出顺序按 row 固定、col 变化来追踪。

## break/continue
如果课程题目使用：
- 'break' 直接结束最近一层循环。
- 'continue' 跳过本轮剩余 body，进入下一轮。

没有讲到时，优先用 flag 或条件结构解释。

## 常见错误
- range end 多算或少算 1。
- while 忘记更新 index。
- accumulator 初始值类型错，比如字符串累计却从 0 开始。
- 在循环里 return 太早，只处理第一个元素。
- nested loop 输出顺序反了。
- 修改正在遍历的序列，导致跳过元素。

## 检查清单
追踪题画表：iteration、loop variable、condition、accumulator。函数设计题先决定 accumulator 的含义和初始值。while 题必须说明停止条件为什么会到达。
`,

  memory_csc108_queue_04_list_public_20260615: m`
## 记忆角色
Notebook 04 的操作记忆。回答 list、索引、切片、mutation、aliasing 和 list-processing 函数时，必须区分“产生新 list”和“原地修改 list”。

## 基础操作
~~~python
values = [10, 20, 30]
values[0]      # 10
values[-1]     # 30
values[1:3]    # [20, 30]
len(values)    # 3
20 in values   # True
~~~

切片产生新 list；index 访问单个元素。

## mutation 方法
这些通常原地修改 list，并返回 None：
~~~python
values.append(40)
values.extend([50, 60])
values.insert(1, 15)
values.remove(20)
last = values.pop()
values.sort()
values.reverse()
~~~

特别注意：
~~~python
nums = [3, 1, 2]
result = nums.sort()
print(nums)    # [1, 2, 3]
print(result)  # None
~~~

## aliasing
两个变量可以指向同一个 list object。

~~~python
a = [1, 2]
b = a
b.append(3)
print(a)  # [1, 2, 3]
~~~

复制 list 的常见方式：
~~~python
b = a[:]
b = list(a)
~~~

## list processing 模板
累计新 list：
~~~python
result = []
for item in items:
    if condition:
        result.append(item)
return result
~~~

累计数值：
~~~python
total = 0
for item in items:
    total = total + item
return total
~~~

修改原 list：
~~~python
for i in range(len(items)):
    items[i] = transform(items[i])
~~~

## 常见错误
- 把 'append' 的返回值赋回变量，导致变量变成 None。
- 遍历 list 时同时 remove 元素，跳过后续元素。
- aliasing 题忘记两个变量指向同一对象。
- 用 '=' 复制 list，以为得到独立副本。
- index 越界：合法 index 是 0 到 len(list)-1。

## 检查清单
先问：题目要求 return 新 list，还是 mutate 原 list？如果是追踪题，画 object/alias 状态。若用 sort/reverse/append，说明方法返回 None 还是修改对象。
`,

  memory_csc108_queue_05_input_output_public_20260615: m`
## 记忆角色
Notebook 05 的操作记忆。回答 input、print、类型转换、格式化输出和交互流程题时，用它检查输入永远是字符串、输出只是显示文本。

## input
'input(prompt)' 会显示 prompt，然后读取用户输入，结果类型总是 str。

~~~python
age = input('Age: ')
print(age + 1)      # TypeError
print(int(age) + 1)
~~~

如果用户输入 '19'，变量 age 的值是字符串 '19'，不是整数 19。

## print
print 会把对象转成字符串显示，默认末尾加 newline。

~~~python
print('A', 'B')              # A B
print('A', 'B', sep='-')     # A-B
print('A', end='')
print('B')                   # AB
~~~

print 的返回值是 None，不应用它作为计算结果。

## f-string
~~~python
name = 'Ada'
score = 92.5
print(f'{name}: {score:.1f}')
~~~

常见格式：
- '{value:.2f}' 保留 2 位小数。
- '{value:>10}' 右对齐宽度 10。
- '{value:<10}' 左对齐宽度 10。

## 转义字符
- '\\n' newline
- '\\t' tab
- "\\'" 单引号
- '\\"' 双引号
- '\\\\' 反斜杠

## 交互程序模板
~~~python
raw = input('Enter a number: ')
number = int(raw)
answer = number * 2
print(f'Double: {answer}')
~~~

## 常见错误
- 忘记 input 返回 str。
- 把 print 当成 return。
- f-string 漏写前面的 f。
- 格式化时把数字先转成 str，导致不能用 numeric format。
- expected output 题漏掉空格或换行。

## 检查清单
输入题先标注每个 input 的返回字符串。输出题逐字符检查空格、sep、end、newline。函数题除非要求交互，否则不要在纯函数里调用 input 或 print。
`,

  memory_csc108_queue_06_file_io_public_20260615: m`
## 记忆角色
Notebook 06 的操作记忆。回答文件读写题时，重点检查 open mode、文件指针、换行符、每个读写函数的返回类型，以及写入内容必须是 str。

## open mode
- 'r'：只读；文件不存在会 FileNotFoundError。
- 'w'：写入；先清空原文件，不存在则创建。
- 'a'：追加；写到文件末尾，不存在则创建。
- 'r+' / 'w+' / 'a+'：读写模式，按课程讲义边界使用。

优先使用 with：
~~~python
with open('data.txt', 'r', encoding='utf-8') as file:
    text = file.read()
~~~

## read 系列
- 'read()'：读剩余全部内容，返回 str。
- 'readline()'：读一行，返回 str；到 EOF 返回 ''。
- 'readlines()'：读剩余所有行，返回 list[str]。
- 'for line in file'：逐行读取，适合大文件。

~~~python
with open('data.txt', 'r', encoding='utf-8') as file:
    for line in file:
        clean = line.strip()
~~~

大文件题优先逐行处理，不要 read/readlines 一次读完。

## write / writelines
'write(s)' 要求 s 是 str，返回写入字符数。不会自动加 newline。

~~~python
with open('out.txt', 'w', encoding='utf-8') as file:
    file.write('hello\n')
~~~

'writelines(lines)' 要求 iterable 里的每个元素都是 str，也不会自动加 newline。

~~~python
file.writelines(['a\n', 'b\n'])
file.writelines([1, 2, 3])  # TypeError
~~~

## 文件指针
读过内容后，文件指针会前进。第二次 read 只读剩下的内容。

~~~python
with open('data.txt', 'r') as file:
    first = file.readline()
    rest = file.read()
~~~

## 常见错误
- 用 'w' 打开后误以为还能保留原文件内容。
- write/writelines 写入 int/list object，而不是字符串。
- 忘记 '\n'，导致所有内容连成一行。
- readline 循环中忘记读取下一行，造成 infinite loop。
- readlines 适合小文件，不适合 100GB 文件。
- 文件没 close；课程答案可用 with 避免。

## 检查清单
文件题先说明 mode 的效果。读题说返回类型。写题确认写入的是 str 且是否需要 newline。逐行处理题用 for line in file 或 readline while 模板。
`,

  memory_csc108_queue_07_dictionary_public_20260615: m`
## 记忆角色
Notebook 07 的操作记忆。回答 dictionary、键值对、计数、分组和 lookup 错误题时，重点检查 key 是否存在、iteration 是按 key/value/item 哪一种。

## 基础操作
~~~python
counts = {'a': 2, 'b': 1}
counts['a']        # 2
counts['c']        # KeyError
counts.get('c', 0) # 0
'a' in counts      # True, checks keys
counts['c'] = 1
~~~

遍历：
~~~python
for key in counts:
    ...

for key, value in counts.items():
    ...

for value in counts.values():
    ...
~~~

## frequency/counting template
~~~python
counts = {}
for item in items:
    if item not in counts:
        counts[item] = 0
    counts[item] = counts[item] + 1
return counts
~~~

也可用 get：
~~~python
counts[item] = counts.get(item, 0) + 1
~~~

如果当前课程还没讲 get，优先用 if-not-in 模板。

## grouping template
把同一个 key 的多个 value 收到 list 里：
~~~python
groups = {}
for name, score in records:
    if name not in groups:
        groups[name] = []
    groups[name].append(score)
return groups
~~~

## mutation 与 aliasing
dictionary 是 mutable。把 dict 传进函数后，在函数里改 key/value 会影响外面的同一个 object。

## 常见错误
- 以为 'x in d' 检查 values；它检查 keys。
- 直接 'd[key] += 1'，但 key 第一次出现会 KeyError。
- 遍历 dict 时同时新增/删除 key，可能 RuntimeError。
- 忘记 values 可以是 list/dict 等 mutable object。
- 输出顺序题要按 Python 当前插入顺序，但课程选择题通常更看重映射关系。

## 检查清单
先判断 key 类型和 value 类型。lookup 前确认 key 是否存在。计数题写出初始化规则。分组题说明什么时候创建空 list，什么时候 append。
`,

  memory_csc108_queue_08_csv_public_20260615: m`
## 记忆角色
Notebook 08 的操作记忆。回答 TextIO、CSV、表格文件读写题时，重点区分普通文本行、CSV row list、类型转换和 header 处理。

## TextIO
函数如果消费打开的文件对象，type annotation 常写 TextIO。调用者负责 open/close，函数内部按文件对象读。

~~~python
from typing import TextIO

def count_lines(file: TextIO) -> int:
    count = 0
    for line in file:
        count = count + 1
    return count
~~~

## csv.reader
~~~python
import csv

with open('grades.csv', 'r', encoding='utf-8', newline='') as file:
    reader = csv.reader(file)
    for row in reader:
        name = row[0]
        score = float(row[1])
~~~

row 是 list[str]。即使文件中看起来是数字，reader 读出来仍然是字符串，需要 int/float 转换。

## header
如果第一行是表头，可以先跳过：
~~~python
header = next(reader)
for row in reader:
    ...
~~~

如果课程尚未讲 next，也可以用 flag 或先 readline。

## csv.writer
~~~python
import csv

with open('out.csv', 'w', encoding='utf-8', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['name', 'score'])
    writer.writerow(['Ada', 92])
~~~

'writerow' 接受一行数据；CSV 模块会处理逗号和引号。

## 手动 split 的边界
简单 CSV 可用 line.strip().split(',')，但字段中有逗号或引号时会错。题目明确要求 csv module 时，不要手写 split 代替。

## 常见错误
- 忘记 import csv。
- 忘记 row 元素都是 str。
- 把 reader 当成 list，重复遍历时发现已经被消耗。
- 写 CSV 时漏 newline=''，在某些系统出现空行。
- 手动 split 不能处理 quoted comma。

## 检查清单
先问输入是 filename、TextIO，还是已经读出的 rows。CSV row 处理题写清每列含义和类型转换。写文件题确认使用 writerow/writerows，并解释 header 是否写入。
`,

  memory_csc108_queue_09_regex_public_20260615: m`
## 记忆角色
Notebook 09 的操作记忆。回答 DFA、regex 和 Python re 题时，重点说明匹配对象、pattern 含义、是否匹配整个字符串，以及 group 的含义。

## DFA 题
DFA 通常包含：
- states
- start state
- accepting states
- transition function

追踪模板：从 start state 出发，逐字符读 input，每个字符根据 transition 进入下一个 state。读完后，如果当前 state 是 accepting state，则接受。

## regex 基础符号
- '.' 任意单个字符。
- '*' 前一项重复 0 次或多次。
- '+' 前一项重复 1 次或多次。
- '?' 前一项重复 0 次或 1 次。
- '[abc]' 匹配 a/b/c 之一。
- '[^abc]' 匹配不是 a/b/c 的字符。
- '\\d' digit，'\\w' word char，'\\s' whitespace。
- '^' 字符串开头，'$' 字符串结尾。
- '()' 捕获 group。

Python 中建议用 raw string：
~~~python
pattern = r'^[A-Z]\d{3}$'
~~~

## re 常用函数
~~~python
import re

re.search(pattern, text)   # anywhere
re.match(pattern, text)    # beginning
re.fullmatch(pattern, text) # whole string
re.findall(pattern, text)  # all matches
~~~

match object 为 truthy；没匹配返回 None。

~~~python
match = re.search(r'(\d+)-(\d+)', text)
if match is not None:
    first = match.group(1)
~~~

## 常见错误
- 用 re.match 以为能在任意位置找；match 只从开头开始。
- 忘记 fullmatch / anchors，导致只匹配一部分。
- 没有 raw string，反斜杠变难读。
- group 编号从 1 开始；group(0) 是整个匹配。
- findall 有 capturing group 时，返回 groups 而不是整个 match。

## 检查清单
先把 pattern 翻译成人话。再判断目标是 anywhere、beginning 还是 whole string。DFA 题画 state trace。Python re 题说明返回 None、match object、list[str] 或 list[tuple]。
`,

  memory_csc108_queue_10_running_time_public_20260615: m`
## 记忆角色
Notebook 10 的操作记忆。回答 running time、搜索、排序和 Big-O 题时，重点找主导操作和输入规模 n，不要只凭代码长度猜复杂度。

## Big-O 规则
- 常数操作：O(1)。
- 单层循环遍历 n 个元素：O(n)。
- 嵌套循环各跑 n 次：O(n^2)。
- 每轮把搜索范围减半：O(log n)。
- sort 通常按课程算法或 Python sort 说明；如果题目是内建 sort，通常记作 O(n log n)。
- 丢掉常数和低阶项：O(3n + 10) 是 O(n)，O(n^2 + n) 是 O(n^2)。

## linear search
~~~python
for item in items:
    if item == target:
        return True
return False
~~~

Worst-case O(n)，因为 target 可能在最后或不存在。

## binary search
前提：list 已经 sorted。每轮比较 middle，丢掉一半。

~~~python
low = 0
high = len(items) - 1
while low <= high:
    mid = (low + high) // 2
    if items[mid] == target:
        return True
    elif items[mid] < target:
        low = mid + 1
    else:
        high = mid - 1
return False
~~~

Worst-case O(log n)。如果题目还包括先排序，再 binary search，总体要加上排序成本。

## 常见排序题
按课程讲过的算法解释，不要只写结论：
- selection sort：反复找最小值，常见 O(n^2)。
- insertion sort：把元素插入已排序部分，worst-case O(n^2)。
- merge sort：分半并合并，O(n log n)。

## list operation 成本
常用近似：
- index access: O(1)
- append at end: amortized O(1)
- 'in' on list: O(n)
- slicing/copy: O(k)
- insert/remove near front: O(n)

## 常见错误
- 忽略内层循环。
- 把 binary search 用在 unsorted list。
- 只看 best-case，不看题目要求 worst-case。
- 忘记 slicing 本身要复制元素。
- 把 O(log n) 写成 O(n) 因为有 while，却没有看范围每轮减半。

## 检查清单
复杂度题先定义 n。标出循环次数和每轮成本。若调用 helper 或内建函数，要把 helper/内建成本算进去。搜索题明确 sorted 前提。
`,

  memory_csc108_queue_11_class_public_20260615: m`
## 记忆角色
Notebook 11 的操作记忆。回答 class、object、attribute、method、self、encapsulation 和对象 aliasing 题时，重点区分 class definition、instance state 和 method call 的绑定过程。

## class 基础模板
~~~python
class BankAccount:
    """A bank account with an owner and balance."""

    owner: str
    balance: float

    def __init__(self, owner: str, balance: float) -> None:
        self.owner = owner
        self.balance = balance

    def deposit(self, amount: float) -> None:
        self.balance = self.balance + amount

    def is_overdrawn(self) -> bool:
        return self.balance < 0
~~~

__init__ 初始化 attribute；实例方法第一个参数是 self，代表当前 object。

## method call
~~~python
acct = BankAccount('Ada', 10.0)
acct.deposit(5.0)
~~~

'acct.deposit(5.0)' 等价于把 acct 作为 self 传入 deposit。执行后 acct.balance 变成 15.0。

## __str__ / __eq__
如果题目要求可读输出：
~~~python
def __str__(self) -> str:
    return f'{self.owner}: {self.balance}'
~~~

如果题目要求对象内容相等：
~~~python
def __eq__(self, other: object) -> bool:
    return isinstance(other, BankAccount) and self.owner == other.owner and self.balance == other.balance
~~~

早期课程如果没有讲 isinstance，就按讲义提供的模式写。

## object aliasing
~~~python
a = BankAccount('Ada', 10)
b = a
b.deposit(5)
print(a.balance)  # 15
~~~

a 和 b 指向同一个 object。

## encapsulation
不要在 class 外随意依赖内部表示，除非题目允许。优先通过 method 表达行为，例如 deposit、withdraw、total、is_valid。

## 常见错误
- 忘记 method 的 self 参数。
- 在 __init__ 里写局部变量 owner，而不是 self.owner。
- __init__ 返回非 None。
- 把 class attribute 和 instance attribute 混淆。
- 对象 aliasing 题忘记 mutation 会被所有 alias 看见。
- print object 时没有 __str__，得到默认 object representation。

## 检查清单
class 设计题先列 attributes 和每个 method 的 contract。追踪题画 object state。method 题说明 self 绑定到哪个 object。mutation 题说明哪些 alias 指向同一个 object。
`,
};
