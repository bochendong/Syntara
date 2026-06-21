export const CSC148_COURSE_ID = 'cmqjfarz800158oi68s595q9n';
export const CSC148_COURSE_MEMORY_ID = 'memory_csc148_course_public_20260618';
export const CSC148_COURSE_MEMORY_TITLE = 'CSC148 课程共有记忆';

function m(strings, ...values) {
  return String.raw({ raw: strings }, ...values).trim();
}

export const CSC148_NOTEBOOK_MEMORY_SPECS = [
  {
    notebookId: 'queue-csc148-01-python-memory-model',
    memoryId: 'memory_csc148_queue_01_python_memory_model_public_20260618',
    title: 'CSC148 Python 记忆模型公共记忆',
  },
  {
    notebookId: 'queue-csc148-02-functions-design-recipe',
    memoryId: 'memory_csc148_queue_02_function_design_recipe_public_20260618',
    title: 'CSC148 Function Design Recipe 公共记忆',
  },
  {
    notebookId: 'queue-csc148-03-testing',
    memoryId: 'memory_csc148_queue_03_testing_public_20260618',
    title: 'CSC148 Testing 公共记忆',
  },
  {
    notebookId: 'queue-csc148-04-oop-basics',
    memoryId: 'memory_csc148_queue_04_class_design_recipe_public_20260618',
    title: 'CSC148 Class Design Recipe 公共记忆',
  },
  {
    notebookId: 'queue-csc148-05-inheritance-polymorphism',
    memoryId: 'memory_csc148_queue_05_inheritance_public_20260618',
    title: 'CSC148 Inheritance/Polymorphism 公共记忆',
  },
  {
    notebookId: 'queue-csc148-06-adts-stacks-queues',
    memoryId: 'memory_csc148_queue_06_adt_public_20260618',
    title: 'CSC148 ADT/Stack/Queue 公共记忆',
  },
  {
    notebookId: 'queue-csc148-07-exceptions-runtime',
    memoryId: 'memory_csc148_queue_11_exceptions_public_20260618',
    title: 'CSC148 Exceptions 公共记忆',
  },
  {
    notebookId: 'queue-csc148-08-linked-lists',
    memoryId: 'memory_csc148_queue_07_linked_list_public_20260618',
    title: 'CSC148 Linked List Template 公共记忆',
  },
  {
    notebookId: 'queue-csc148-09-recursion-basics',
    memoryId: 'memory_csc148_queue_08_recursion_public_20260618',
    title: 'CSC148 Recursion Basics 公共记忆',
  },
  {
    notebookId: 'queue-csc148-10-recursion-tracing',
    memoryId: 'memory_csc148_queue_10_recursion_tracing_public_20260619',
    title: 'CSC148 Recursion Tracing 公共记忆',
  },
  {
    notebookId: 'queue-csc148-11-trees-bsts',
    memoryId: 'memory_csc148_queue_11_trees_bsts_public_20260619',
    title: 'CSC148 Tree/BST Template 公共记忆',
  },
  {
    notebookId: 'queue-csc148-12-recursive-sorting',
    memoryId: 'memory_csc148_queue_12_running_time_public_20260618',
    title: 'CSC148 Running Time 公共记忆',
  },
];

export const CSC148_OBSOLETE_MEMORY_IDS = [
  'memory_csc148_queue_09_bst_public_20260618',
  'memory_csc148_queue_10_tree_public_20260618',
];

export const CSC148_PUBLIC_MEMORY_TEXTS = {
  [CSC148_COURSE_MEMORY_ID]: m`
## 记忆角色
CSC148 的课程级公共记忆。它不是普通课程简介，而是后续答疑、题库讲解、批改提示、notebook 续写和模板库选择时使用的课程合约。CSC148 的答案优先按课程 recipe 和数据结构模板组织：Function Design Recipe、Class Design Recipe、ADT/Stack/Queue Template、Linked List Template、Tree Template、BST Template。

## 执行合约
1. 先判题型：function design、class design、testing、ADT/interface、linked list、tree、BST、exception、runtime，还是 recursive sorting。
2. 再选择主模板。函数题用 Function Design Recipe；类题用 Class Design Recipe；链式结构用 Linked List Template；一般树用 Tree Template；有序二叉树用 BST Template。
3. Python 记忆模型是底层规则：变量绑定、aliasing、mutation、object identity 会影响所有 class、list、linked list 和 tree trace，但它不是模板库主分类。
4. 答案要保留课程口径：type annotation、docstring、precondition、representation invariant、public interface、test boundary、runtime tradeoff。
5. 不要把通用 Python 技巧顶替课程模板。能用简单循环、递归、helper 和明确状态解释时，不要引入 dataclass、pandas、decorator-heavy 写法或未学库。
6. 模板库边界：不要把 CPSC107/HtDF 的数据定义模板迁移成 CSC148 模板；CSC148 的递归和引用结构应落到 Python function、class design、linked list、tree 或 BST 模板里。

## 模板：Function Design Recipe
### 使用条件
题目要求实现一个 standalone function，或要求解释函数契约、precondition、doctest、return value。

### 可套用模板
~~~python
def function_name(param1: Type1, param2: Type2) -> ReturnType:
    """Return/produce ...

    Preconditions:
        - ...

    >>> function_name(example1, example2)
    expected
    """
    # optional helper variables
    return result
~~~

### 检查清单
- header、参数名、type annotation 是否和题目一致。
- docstring 说明返回值，不复述每一行实现。
- precondition 写清调用者责任；不要又在 body 里无意义重复所有 precondition。
- examples 覆盖 normal case、boundary case 和课程材料强调的 tricky case。
- body 返回结果，不把调试 print 留在函数里。

## 模板：Class Design Recipe
### 使用条件
题目要求设计 class、补全 methods、维护 representation invariant，或解释 instance attributes / methods / special methods。

### 可套用模板
~~~python
class ClassName:
    """A short description of this kind of object.

    Instance Attributes:
        - attr: ...

    Representation Invariants:
        - ...
    """
    attr: Type

    def __init__(self, attr: Type) -> None:
        """Initialize this object."""
        self.attr = attr

    def method(self, x: Type) -> ReturnType:
        """Return/modify ..."""
        ...
~~~

### 检查清单
- annotation 只声明属性，不会自动创建 instance attribute；真正创建发生在 __init__ 或 method assignment。
- public method 要保护 representation invariant。
- client 只能依赖 public interface，不应该依赖 private attributes 或内部表示。
- mutation method 要说明改变了哪个 object 的状态，并返回题目要求的值，通常是 None。

## 模板：Linked List Template
### 使用条件
题目出现 _Node、LinkedList、head、next、empty list、traversal、insert/delete，或要求追踪节点引用变化。

### 可套用模板
~~~python
class _Node:
    item: Any
    next: _Node | None

class LinkedList:
    _first: _Node | None

    def method(self) -> ReturnType:
        curr = self._first
        while curr is not None:
            # use curr.item
            curr = curr.next
~~~

mutation 题检查三件事：是否处理 empty list；是否处理 head node；是否正确保存/更新 previous 和 curr.next。

### 检查清单
- 不要把 Python list 的 index 思维套到 linked list。
- 遍历靠 node references，不靠随机访问。
- 删除/插入时先画 before/after arrows，再写 assignment。
- recursive linked list 版本要先写 empty/head case，再递归到 rest。

## 模板：Tree Template
### 使用条件
题目出现 Tree、root、subtrees、leaf、height、traversal、expression tree，或需要对每棵 subtree 做同类递归。

### 可套用模板
~~~python
class Tree:
    _root: Any | None
    _subtrees: list[Tree]

    def method(self) -> ReturnType:
        if self.is_empty():
            return base_value

        subtree_results = []
        for subtree in self._subtrees:
            subtree_results.append(subtree.method())
        return combine(self._root, subtree_results)
~~~

### 检查清单
- 每棵 subtree 仍然是一棵 Tree，所以递归调用应发生在 subtree 上。
- empty tree 和 leaf tree 不是一回事。
- traversal 题要说明 preorder、postorder、level-order 或题目指定顺序。
- mutation tree 时要维护 root/subtrees 的结构含义。

## 模板：BST Template
### 使用条件
题目出现 BinarySearchTree、BST invariant、search、insert、delete、height、min/max、predecessor/successor。

### 可套用模板
~~~python
class BinarySearchTree:
    _root: Any | None
    _left: BinarySearchTree
    _right: BinarySearchTree

    def find(self, item: Any) -> bool:
        if self.is_empty():
            return False
        elif item == self._root:
            return True
        elif item < self._root:
            return self._left.find(item)
        else:
            return self._right.find(item)
~~~

### 检查清单
- BST 的控制流由 invariant 决定：小于 root 只去 left，大于 root 只去 right。
- search/insert 不是扫全树。
- delete 要分 empty、leaf、one child、two children；two children 通常用 predecessor 或 successor 替换。
- runtime 要区分 balanced height O(log n) 和 worst-case height O(n)。
`,

  memory_csc148_queue_01_python_memory_model_public_20260618: m`
## 记忆角色
Notebook 01 的操作记忆。它为 CSC148 后续所有 class、list、linked list、tree 和 recursion trace 提供底层 Python 记忆模型，但不替代正式的 design recipe/template。

## 核心概念
- 变量名绑定到对象，不是对象本身的盒子。
- Rebinding 改变 name 指向；mutation 改变 object 内部状态。
- Aliasing 表示多个 name 指向同一个 mutable object。
- Identity 和 equality 要分开：is 看同一个对象，== 看值相等规则。
- Shallow copy 复制外层容器；内部 mutable object 可能仍然共享。

## 追踪模板
1. 列出每个 name 当前指向哪个 object。
2. 标出 object 的类型和值，必要时给对象编号。
3. 遇到 assignment，判断是 rebinding 还是 mutating method。
4. 遇到 method call，判断 self 是哪个 object。
5. 输出前检查所有 alias 是否看到同一个 mutated object。

## 例子
~~~python
a = [1, 2]
b = a
a.append(3)
b = b + [4]
~~~

追踪时要说清：a 和 b 起初 alias 同一个 list；append 改变这个 list；最后 b = b + [4] 创建新 list 并让 b 重新绑定，a 仍指向 [1, 2, 3]。

## 常见误区
- 以为 assignment 会复制 list。
- 以为 method call 一定返回新对象。
- 分不清 list.append mutation 和 list + list rebinding。
- 只写最终值，不解释中间 alias 关系。

## 回答检查清单
解释 trace 题时必须同时给出 name binding、object state、mutation/rebinding 判断和最终输出。
`,

  memory_csc148_queue_02_function_design_recipe_public_20260618: m`
## 记忆角色
Notebook 02 的操作记忆。它是 CSC148 模板库的核心之一：Function Design Recipe。回答函数题时优先用它组织答案。

## 核心概念
- Function header 是契约的一部分：参数、类型、返回类型不能随意改。
- Docstring 说明函数承诺什么，不是逐行解释实现。
- Preconditions 描述调用者必须满足的条件；满足后函数才负责正确工作。
- Examples/doctests 是 specification evidence，也能暴露边界情况。
- Body 应该实现契约，返回 annotation 承诺的类型。

## 执行合约
回答 Function Design Recipe 题时必须按这个顺序输出：
1. **Contract**：先写一句话说明 function 消费什么、返回什么；如果题目给了 precondition，明确说这是调用者责任。
2. **Code**：给一个完整 python code block，必须包含原题 function header、type annotation、docstring、doctest examples 和 return。
3. **Checks**：说明 doctest 覆盖了哪些 normal/boundary cases，以及 body 为什么返回 annotation 承诺的类型。

核心代码骨架：
~~~python
def function_name(param: ParamType) -> ReturnType:
    """Return ...

    Preconditions:
        - ...

    >>> function_name(sample)
    expected
    """
    ...
~~~

不要只写“实现步骤”。不要把代码放在 text code block。不要把 precondition 变成多余的防御式 if，除非题目明确要求处理非法输入。

## 模板：Function Design Recipe
### 使用条件
实现 standalone function、解释 precondition/type annotation、补全 doctest 或判断函数契约是否完整。

### 可套用模板
~~~python
def function_name(x: XType, y: YType) -> ReturnType:
    """Return ...

    Preconditions:
        - ...

    >>> function_name(sample_x, sample_y)
    expected
    """
    ...
~~~

### 例子
~~~python
def has_uppercase(s: str) -> bool:
    """Return whether s contains at least one uppercase letter.

    >>> has_uppercase('CSC148')
    True
    >>> has_uppercase('python')
    False
    """
    for char in s:
        if char.isupper():
            return True
    return False
~~~

## 常见误区
- 把 precondition 当成必须在 body 里重复检查的 if。
- 忘记 return，导致函数返回 None。
- docstring 示例没有覆盖 empty、single item 或 boundary。
- 修改题目给定 header。

## 回答检查清单
函数题答案要检查 header、docstring、precondition、examples、return type、body 和测试边界。讲解时先讲契约，再讲实现。
`,

  memory_csc148_queue_03_testing_public_20260618: m`
## 记忆角色
Notebook 03 的操作记忆。它让后续 function/class/data-structure 题都有测试边界，不把“跑过一个例子”误当成正确。

## 核心概念
- Doctest 适合说明 specification 的小例子。
- Pytest 适合组织多组 unit tests 和 fixture。
- Boundary cases 比随便随机例子更能暴露错误。
- Coverage 只能说明代码被跑到，不能证明测试足够。
- Property-based testing 检查一类输入上的 invariant 或关系。

## 测试选择模板
1. 先列 normal cases。
2. 再列 boundary cases：empty、single、duplicate、already sorted、invalid/precondition edge。
3. 对 mutation method，检查返回值和 object state。
4. 对 class，检查 __init__ 后 attributes 和 representation invariant。
5. 对 recursive structure，检查 empty、leaf/single node、deep/nested、branching case。

## 例子
~~~python
def test_stack_push_pop() -> None:
    stack = Stack()
    stack.push(10)
    assert stack.pop() == 10
    assert stack.is_empty()
~~~

## 常见误区
- 只测一个 happy path。
- mutation method 只看返回值，不看 object state。
- 把 precondition violation 当成函数必须处理的普通 case。
- 用 coverage 数字替代边界设计。

## 回答检查清单
测试题回答要说明每个 test 为什么存在，覆盖了哪个 case 或 invariant。
`,

  memory_csc148_queue_04_class_design_recipe_public_20260618: m`
## 记忆角色
Notebook 04 的操作记忆。它是 CSC148 模板库的核心之一：Class Design Recipe。回答 class/OOP 题时优先用它组织答案。

## 核心概念
- Class 定义一种对象；instance 是具体对象。
- Instance attribute 必须在 __init__ 或 method 中通过 self.attr 赋值才真正存在。
- Type annotation 说明属性类型，但不会自动创建属性。
- Representation invariant 是所有合法对象状态必须满足的条件。
- Method call 会把 receiver object 绑定为 self。

## 执行合约
回答 Class Design Recipe 题时必须按这个顺序输出：
1. **Class purpose**：一句话说明这个 class 表示什么对象。
2. **Code**：给完整 python code block；class docstring 必须包含 Instance Attributes 和 Representation Invariants；class body 必须包含 attribute annotations、__init__ 和题目要求的 public methods。
3. **RI check**：逐条说明 __init__ 和每个 mutation method 为什么保持 representation invariant。
4. **Client boundary**：说明 client 应该依赖 public methods，而不是直接依赖 private representation。

核心代码骨架：
~~~python
class ClassName:
    """A short description.

    Instance Attributes:
        - attr: ...

    Representation Invariants:
        - ...
    """
    attr: Type

    def __init__(self, attr: Type) -> None:
        """Initialize this object."""
        self.attr = attr
~~~

如果 bad input 被写成 Preconditions，不要自动加 raise ValueError；如果题目要求 invalid input behavior，才把 exception 写进 interface。

## 模板：Class Design Recipe
### 使用条件
题目要求设计 class、实现 __init__/method、写 representation invariant、解释 self 或追踪对象状态。

### 可套用模板
~~~python
class Tweet:
    """A tweet with an author, content, and likes.

    Instance Attributes:
        - author: the username of this tweet's author
        - content: the text of this tweet
        - likes: the number of likes on this tweet

    Representation Invariants:
        - self.likes >= 0
    """
    author: str
    content: str
    likes: int

    def __init__(self, author: str, content: str) -> None:
        """Initialize this tweet."""
        self.author = author
        self.content = content
        self.likes = 0
~~~

### 检查清单
- class docstring 是否说明对象角色。
- Instance Attributes 是否和 __init__ 真正创建的属性一致。
- Representation invariant 是否能被所有 methods 保持。
- mutation method 是否清楚改变 self 的哪个 attribute。
- special methods 是否返回 Python 协议要求的类型。

## 常见误区
- 写了 attr: Type 就以为 self.attr 已经有值。
- 忘记 self，或把 local variable 和 instance attribute 混在一起。
- method 直接破坏 representation invariant。
- client 代码依赖 private attribute，而不是 public method。
`,

  memory_csc148_queue_05_inheritance_public_20260618: m`
## 记忆角色
Notebook 05 的操作记忆。它服务 inheritance、overriding、polymorphism 和 special methods；优先保持 class design recipe，再处理父子类关系。

## 核心概念
- Inheritance 表示 subclass 继承 superclass 的 public interface 和可复用实现。
- Overriding 是 subclass 提供同名 method 的新实现。
- Polymorphism 让 client 依赖共同 interface，而不是具体 subclass。
- super().__init__ 用来复用 parent 初始化，避免漏建 inherited attributes。
- 子类不能随意加强 precondition 或削弱父类承诺，否则 client reasoning 会坏掉。

## 操作模板
1. 先写清 superclass 的 public interface。
2. 再判断 subclass 是否只是添加属性/方法，还是 override method。
3. __init__ 中先用 super().__init__(...) 建立父类状态，再创建子类新增属性。
4. 对 overridden method，检查返回类型和行为是否仍符合父类承诺。
5. 用 polymorphic client test 检查同一段 client code 是否能处理多个 subclass。

## 例子
~~~python
class Animal:
    def speak(self) -> str:
        raise NotImplementedError

class Dog(Animal):
    def speak(self) -> str:
        return 'woof'
~~~

## 常见误区
- 复制父类代码，不用 super。
- Override 后返回类型或异常行为和父类接口不一致。
- 把 isinstance 分支写进 client，破坏 polymorphism 的意义。

## 回答检查清单
继承题要说明 interface、shared implementation、overridden behavior、super 调用和 client 能依赖的共同承诺。
`,

  memory_csc148_queue_06_adt_public_20260618: m`
## 记忆角色
Notebook 06 的操作记忆。它把 Stack、Queue 和 ADT 题从“怎么存”转成“client 能依赖什么行为”。

## 核心概念
- ADT 的重点是 interface，不是具体 implementation。
- Stack 是 LIFO；Queue 是 FIFO。
- Client 应该依赖 push/pop、enqueue/dequeue、is_empty 这类 public operations。
- Exception behavior 也是 interface 的一部分：empty pop/dequeue 应该如何失败要一致。
- 同一个 ADT 可以有多种实现，例如 Python list、linked nodes、two-stack queue。

## 执行合约
回答 ADT / Stack / Queue 题时必须按这个顺序输出：
1. **Interface contract**：列 public operations；Stack 用 push/pop/is_empty，Queue 用 enqueue/dequeue/is_empty，并写 empty failure behavior。
2. **Representation choice**：说明 chosen implementation，例如 Python list、linked nodes 或 two-stack queue。
3. **Representation Invariants**：必须写 RI，例如 Stack 的 self._items 只通过 public methods 修改；Queue 的 self._items[0] 是下一次 dequeue 的 front。
4. **Complete code**：给完整 python code block，必须包含 imports、custom exception class、class docstring、Instance Attributes、Representation Invariants、__init__、is_empty 和核心 methods。
5. **Complexity note**：复杂度针对 chosen representation，不针对 ADT 名字本身。

核心 Stack 骨架：
~~~python
from typing import Any

class EmptyStackError(Exception):
    """Raised when calling pop on an empty stack."""

class Stack:
    """A last-in-first-out stack.

    Instance Attributes:
        - _items: the items in this stack, with the top at the end

    Representation Invariants:
        - self._items stores only items added through push
    """
    _items: list[Any]
~~~

## 例子
~~~python
from typing import Any


class EmptyStackError(Exception):
    """Raised when calling pop on an empty stack."""


class Stack:
    """A last-in-first-out stack.

    Instance Attributes:
        - _items: the items in this stack, with the top at the end

    Representation Invariants:
        - self._items stores the stack items from bottom to top
    """
    _items: list[Any]

    def __init__(self) -> None:
        """Initialize an empty stack."""
        self._items = []

    def is_empty(self) -> bool:
        """Return whether this stack is empty."""
        return self._items == []

    def push(self, item: Any) -> None:
        """Add item to the top of this stack."""
        self._items.append(item)

    def pop(self) -> Any:
        """Remove and return the top item of this stack.

        Raise EmptyStackError if this stack is empty.
        """
        if self.is_empty():
            raise EmptyStackError()
        return self._items.pop()


class EmptyQueueError(Exception):
    """Raised when calling dequeue on an empty queue."""


class Queue:
    """A first-in-first-out queue.

    Instance Attributes:
        - _items: the items in this queue, with the front at index 0

    Representation Invariants:
        - self._items[0] is the next item returned by dequeue when non-empty
    """
    _items: list[Any]

    def __init__(self) -> None:
        """Initialize an empty queue."""
        self._items = []

    def is_empty(self) -> bool:
        """Return whether this queue is empty."""
        return self._items == []

    def enqueue(self, item: Any) -> None:
        """Add item to the back of this queue."""
        self._items.append(item)

    def dequeue(self) -> Any:
        """Remove and return the front item of this queue.

        Raise EmptyQueueError if this queue is empty.
        """
        if self.is_empty():
            raise EmptyQueueError()
        return self._items.pop(0)
~~~

## 常见误区
- 把 private representation 暴露给 client。
- 忘记 empty case 的异常行为。
- 说 Stack 一定 O(1)，但没有说明当前实现为什么。

## 回答检查清单
ADT 题要区分 interface、implementation、representation invariant、exception behavior 和 operation runtime。代码例子必须能独立解释 imports、exception、RI 和 public methods。
`,

  memory_csc148_queue_07_linked_list_public_20260618: m`
## 记忆角色
Notebook 07 的操作记忆。它是 CSC148 模板库的核心之一：Linked List Template。回答 linked list 题时优先画 node arrows，再写代码。

## 核心概念
- Linked list 由 nodes 组成；每个 node 保存 item 和到下一个 node 的 reference。
- LinkedList 通常只保存 first/head reference。
- Traversal 通过 curr = curr.next 前进，不能随机访问 index。
- Mutation 题的关键是更新 references，而不是移动节点本身。
- Head case 常常需要单独处理。

## 执行合约
回答 Linked List Template 题时必须按这个顺序输出：
1. **Cases**：先列 empty list、head node、middle/end node、target absent。
2. **Pointer plan**：说明使用 prev 和 curr 保存前驱与当前节点；删除节点靠改 self._first 或 prev.next。
3. **Representation Invariants**：必须写 _Node.next is None or another _Node；LinkedList._first is None or the first node in the list。
4. **Code**：给完整 python code block，必须包含 imports、_Node、LinkedList、Instance Attributes、Representation Invariants、__init__、目标 method。默认使用 self._first、_Node.item、_Node.next；除非 starter 明确用 head，否则不要改成 self.head。
5. **Link check**：说明不会断链、不会跳过节点、没找到时返回 failure value。

核心 mutation 骨架：
~~~python
from __future__ import annotations
from typing import Any

class _Node:
    """A node in a linked list.

    Instance Attributes:
        - item: the data stored in this node
        - next: the next node in the list, or None

    Representation Invariants:
        - self.next is None or isinstance(self.next, _Node)
    """
    item: Any
    next: _Node | None

class LinkedList:
    """A linked list.

    Instance Attributes:
        - _first: the first node in this list, or None if this list is empty

    Representation Invariants:
        - self._first is None or isinstance(self._first, _Node)
    """
    _first: _Node | None
~~~

## 模板：Linked List Template
### 使用条件
题目出现 _Node、LinkedList、_first/head、next、insert/delete、append、traversal 或 recursive linked list。

### 可套用模板
~~~python
def method(self) -> ReturnType:
    curr = self._first
    while curr is not None:
        # use or inspect curr.item
        curr = curr.next
~~~

带 previous 的 mutation 模板：
~~~python
prev = None
curr = self._first
while curr is not None and not target(curr.item):
    prev = curr
    curr = curr.next

if curr is None:
    ...
elif prev is None:
    self._first = curr.next
else:
    prev.next = curr.next
~~~

### 例子
~~~python
from __future__ import annotations
from typing import Any


class _Node:
    """A node in a linked list.

    Instance Attributes:
        - item: the data stored in this node
        - next: the next node in the list, or None

    Representation Invariants:
        - self.next is None or isinstance(self.next, _Node)
    """
    item: Any
    next: _Node | None

    def __init__(self, item: Any, next_: _Node | None = None) -> None:
        self.item = item
        self.next = next_


class LinkedList:
    """A linked list.

    Instance Attributes:
        - _first: the first node in this list, or None if this list is empty

    Representation Invariants:
        - self._first is None or isinstance(self._first, _Node)
    """
    _first: _Node | None

    def __init__(self) -> None:
        """Initialize an empty linked list."""
        self._first = None

    def remove_first(self, item: Any) -> bool:
        """Remove the first node containing item, and return whether one was removed."""
        prev = None
        curr = self._first

        while curr is not None and curr.item != item:
            prev = curr
            curr = curr.next

        if curr is None:
            return False
        elif prev is None:
            self._first = curr.next
        else:
            prev.next = curr.next

        return True
~~~

### 检查清单
- empty list。
- one-node list。
- target at head。
- target in middle/end。
- target absent。
- mutation 后有没有断链或跳过节点。

## 常见误区
- 写 curr = curr.item，丢掉 node reference。
- 删除 head 时还用 prev.next。
- 改 curr 变量，以为链表结构也被改了。
- 遍历时忘记 curr = curr.next。
`,

  memory_csc148_queue_08_recursion_public_20260618: m`
## 记忆角色
Notebook 09 的操作记忆。它给 nested list、recursive helper 和基础递归设计提供通用模板，并为后面的 tracing、Tree/BST 模板打底。

## 核心概念
- Recursive function 必须有 base case 和 recursive case。
- 每次 recursive call 应该处理更小或更简单的同类问题。
- Recursive result 回来后通常要 combine。
- Nested list 递归要区分 atomic item 和 nested list item。
- Call stack trace 要记录每层调用的参数和返回值。

## 通用递归模板
~~~python
def recursive(data: DataType) -> ReturnType:
    if is_base_case(data):
        return base_value
    else:
        smaller_result = recursive(smaller_part(data))
        return combine(current_part(data), smaller_result)
~~~

Nested list 模板：
~~~python
def total(obj: int | list) -> int:
    if isinstance(obj, int):
        return obj
    else:
        return sum(total(sub) for sub in obj)
~~~

## 常见误区
- base case 太窄，漏掉 empty 或 atomic value。
- recursive call 没有变小。
- 忘记使用 recursive result。
- 把 full tracing 和 partial tracing 混在一起。

## 回答检查清单
递归题要说明 base case、recursive case、输入如何变小、recursive result 如何组合，以及至少一个边界输入。
`,

  memory_csc148_queue_10_recursion_tracing_public_20260619: m`
## 记忆角色
Notebook 10 的操作记忆。它服务 recursive tracing、call stack、branching recursion、accumulator 和 debugging recursion。回答这类题时，目标不是只写代码，而是让学生看见每一层调用的参数、返回值和组合方式。

## 执行合约
回答 recursion tracing 题时必须按这个顺序输出：
1. **Base/smaller/combine**：先指出 base case、每次递归如何变小、recursive result 回来后如何组合。
2. **Trace shape**：linear recursion 用调用栈表；branching recursion 用树状 trace，不要挤成一条线。
3. **Frame table**：至少列出关键 frame 的 input、waiting expression、return value。
4. **Repeated work**：如果是 branching recursion，指出是否重复计算同一个子问题。
5. **Debugging check**：检查 recursive call 是否真的靠近 base case，是否忘记使用 recursive result。

## 常见误区
- 只写最终返回值，不解释中间 frame。
- branching recursion 画成一条链，漏掉多个 recursive calls。
- recursive call 参数没有变小，导致 infinite recursion。
- base case 太窄，漏掉 empty、atomic 或单元素输入。
- 忘记把 recursive result 合并回当前层。

## 回答检查清单
递归追踪题要包含：base case、recursive call 参数、每层等待什么、返回值如何传回、branching 是否有重复工作，以及最终结果。
`,

  memory_csc148_queue_11_trees_bsts_public_20260619: m`
## 记忆角色
Notebook 11 的操作记忆。它合并 Tree Template 和 BST Template：一般 Tree 题按 root/subtrees 递归；BST 题必须让 invariant 决定只走 left 或 right。

## Tree 执行合约
回答一般 Tree 题时必须按这个顺序输出：
1. **Cases**：empty tree、leaf tree、internal node。
2. **Representation Invariants**：如果 self._root is None，则 self._subtrees == []；每个 subtree 也是 Tree。
3. **Recursive reason**：每棵 subtree 仍然是 Tree，所以递归调用写在 subtree.method(...) 上。
4. **Combine**：说明 recursive results 如何相加、拼接、取 max/min 或 short-circuit。

## BST 执行合约
回答 BST 题时必须按这个顺序输出：
1. **Invariant first**：left subtree 所有值小于 root，right subtree 所有值大于 root，左右子树也都是 BST。
2. **Cases**：empty、equal root、less than root、greater than root。
3. **Why one side**：不是搜索左右两边；invariant 已经排除了另一边。
4. **Runtime note**：复杂度用 height 解释，balanced 是 O(log n)，skewed worst-case 是 O(n)。

## 常见误区
- 把一般 Tree 当成只有 left/right 的 binary tree。
- 忘记 empty tree 和 leaf tree 不是同一种 case。
- 对 subtree._root 直接操作，而不是递归调用 subtree method。
- 把 BST 当普通 binary tree 搜全树。
- 插入/删除破坏 BST invariant。
- 复杂度永远写 O(log n)，忘记 skewed tree。

## 回答检查清单
Tree/BST 题先判结构类型。一般 Tree 写 root/subtrees 和 combine；BST 写 invariant 和单边递归。mutation 题要说明 representation invariant 如何保持，runtime 题要说明 input size 和 height。
`,

  memory_csc148_queue_09_bst_public_20260618: m`
## 记忆角色
Notebook 09 的操作记忆。它是 CSC148 模板库的核心之一：BST Template。回答 BST 题时必须让 invariant 驱动控制流。

## 核心概念
- BST invariant：left subtree 中所有值小于 root，right subtree 中所有值大于 root，左右子树也都是 BST。
- Search/insert 每一步只走一边。
- Empty tree 是所有操作的 base case。
- Delete 是最容易错的 mutation：empty、leaf、one child、two children 要分开。
- Runtime 取决于 height；balanced 是 O(log n)，worst-case skewed 是 O(n)。

## 执行合约
回答 BST Template 题时必须按这个顺序输出：
1. **Invariant first**：先写出 BST invariant，并说明它如何决定控制流。
2. **Representation Invariants**：必须写 empty BST 的表示；非空 BST 的 _left 和 _right 必须是 BinarySearchTree，并满足 left < root < right。
3. **Cases**：empty tree、equal root、less than root、greater than root。
4. **Code**：给完整 python code block，必须包含 imports、class docstring、Instance Attributes、Representation Invariants、__init__、is_empty 和目标 method。
5. **Why one side**：明确说不是搜索左右两边；因为 invariant 已经排除了另一边。
6. **Runtime note**：如果问复杂度，必须用 height 说明 balanced/worst-case。

核心完整骨架：
~~~python
from __future__ import annotations
from typing import Any

class BinarySearchTree:
    """A binary search tree.

    Instance Attributes:
        - _root: the item stored at the root, or None if this tree is empty
        - _left: the left subtree, or None if this tree is empty
        - _right: the right subtree, or None if this tree is empty

    Representation Invariants:
        - If self._root is None, then self._left is None and self._right is None.
        - If self._root is not None, then self._left and self._right are BinarySearchTree objects.
        - Every item in self._left is < self._root, and every item in self._right is > self._root.
    """
~~~

## 模板：BST Template
### 使用条件
题目出现 BinarySearchTree、BST invariant、find/search、insert、delete、height、predecessor/successor。

### 可套用模板
~~~python
def find(self, item: Any) -> bool:
    if self.is_empty():
        return False
    elif item == self._root:
        return True
    elif item < self._root:
        return self._left.find(item)
    else:
        return self._right.find(item)
~~~

Insert 的判断顺序相同：empty 就放在 root；小于 root 去 left；大于 root 去 right；相等时按题目约定处理 duplicate。

Delete two-child case 通常选择 predecessor 或 successor 替换 root，再递归删除被提升的值。

### 例子
~~~python
from __future__ import annotations
from typing import Any


class BinarySearchTree:
    """A binary search tree.

    Instance Attributes:
        - _root: the item stored at the root, or None if this tree is empty
        - _left: the left subtree, or None if this tree is empty
        - _right: the right subtree, or None if this tree is empty

    Representation Invariants:
        - If self._root is None, then self._left is None and self._right is None.
        - If self._root is not None, then self._left and self._right are BinarySearchTree objects.
        - If self._root is not None, every item in self._left is < self._root.
        - If self._root is not None, every item in self._right is > self._root.
    """
    _root: Any | None
    _left: BinarySearchTree | None
    _right: BinarySearchTree | None

    def __init__(self, root: Any | None) -> None:
        """Initialize this BST with root, or as empty if root is None."""
        if root is None:
            self._root = None
            self._left = None
            self._right = None
        else:
            self._root = root
            self._left = BinarySearchTree(None)
            self._right = BinarySearchTree(None)

    def is_empty(self) -> bool:
        """Return whether this BST is empty."""
        return self._root is None

    def find(self, item: Any) -> bool:
        """Return whether item is in this BST."""
        if self.is_empty():
            return False
        elif item == self._root:
            return True
        elif item < self._root:
            return self._left.find(item)
        else:
            return self._right.find(item)
~~~

### 检查清单
- 是否每一步只保留一边。
- 是否维护左右子树也都是 BST。
- duplicate policy 是否明确。
- delete 是否覆盖四种结构 case。
- runtime 是否基于 height，而不是直接说一定 O(log n)。

## 常见误区
- 把 BST 当普通 binary tree 搜全树。
- 插入后破坏 invariant。
- 删除 root 时漏掉 one child case。
- 复杂度忘记 skewed tree。
`,

  memory_csc148_queue_10_tree_public_20260618: m`
## 记忆角色
Notebook 10 的操作记忆。它是 CSC148 模板库的核心之一：Tree Template。回答一般 tree 题时，不要套 BST 的左右大小关系。

## 核心概念
- Tree 是递归结构：root 加若干 subtrees。
- Empty tree、leaf tree、internal node 要区分。
- 每棵 subtree 仍然是 Tree，所以递归调用发生在 subtree.method(...) 上。
- Traversal 顺序是题目语义的一部分。
- Mutating tree 要维护 root/subtrees 的 representation invariant。

## 执行合约
回答 Tree Template 题时必须按这个顺序输出：
1. **Cases**：先列 empty tree、leaf tree、internal node。只要题目问 leaves，必须显式处理 leaf case：self._subtrees == [] 返回 1。
2. **Representation Invariants**：必须写 empty tree 的表示：如果 self._root is None，那么 self._subtrees == []；每个 subtree 也是 Tree。不要写成 iff，因为非空 leaf 也有 self._subtrees == []。
3. **Recursive reason**：说明每棵 subtree 仍然是 Tree，所以递归调用写在 subtree.method(...) 上。
4. **Code**：给完整 python code block，必须包含 imports、class docstring、Instance Attributes、Representation Invariants、__init__、is_empty 和目标 method。
5. **Combine**：说明 recursive results 如何相加、拼接、取 max/min 或 short-circuit。

核心完整骨架：
~~~python
from __future__ import annotations
from typing import Any

class Tree:
    """A recursive tree.

    Instance Attributes:
        - _root: the item stored at this tree's root, or None if empty
        - _subtrees: the subtrees of this tree

    Representation Invariants:
        - If self._root is None, then self._subtrees == []
        - all(isinstance(subtree, Tree) for subtree in self._subtrees)
    """
~~~

## 模板：Tree Template
### 使用条件
题目出现 Tree、root、subtrees、leaf、height、traversal、expression tree 或 recursive tree method。

### 可套用模板
~~~python
def method(self) -> ReturnType:
    if self.is_empty():
        return base_value

    results = []
    for subtree in self._subtrees:
        results.append(subtree.method())
    return combine(self._root, results)
~~~

Traversal 模板：
~~~python
def preorder(self) -> list:
    if self.is_empty():
        return []
    items = [self._root]
    for subtree in self._subtrees:
        items.extend(subtree.preorder())
    return items
~~~

### 例子
~~~python
from __future__ import annotations
from typing import Any


class Tree:
    """A recursive tree.

    Instance Attributes:
        - _root: the item stored at this tree's root, or None if empty
        - _subtrees: the subtrees of this tree

    Representation Invariants:
        - If self._root is None, then self._subtrees == []
        - all(isinstance(subtree, Tree) for subtree in self._subtrees)
    """
    _root: Any | None
    _subtrees: list[Tree]

    def __init__(self, root: Any | None, subtrees: list[Tree]) -> None:
        """Initialize this tree with root and subtrees.

        If root is None, this tree is empty and subtrees must be empty.
        """
        if root is None:
            self._root = None
            self._subtrees = []
        else:
            self._root = root
            self._subtrees = subtrees

    def is_empty(self) -> bool:
        """Return whether this tree is empty."""
        return self._root is None

    def num_leaves(self) -> int:
        """Return the number of leaves in this tree."""
        if self.is_empty():
            return 0
        elif self._subtrees == []:
            return 1
        else:
            total = 0
            for subtree in self._subtrees:
                total += subtree.num_leaves()
            return total
~~~

### 检查清单
- empty tree 返回什么。
- leaf tree 是否自然由 for loop over empty subtrees 处理。
- recursive result 是 list、number、bool 还是 object。
- 是否需要 short-circuit，例如 any/all search。
- mutation 时是否删掉 empty subtree 或保持课程约定的 empty 表示。

## 常见误区
- 把 Tree 当成只有 left/right 的 binary tree。
- 忘记 empty tree。
- 对 subtree._root 直接操作而不是递归调用。
- traversal 顺序和题目要求不一致。
`,

  memory_csc148_queue_11_exceptions_public_20260618: m`
## 记忆角色
Notebook 11 的操作记忆。它服务 raise、try/except、exception propagation 和异常设计；在 ADT 与 class method 中尤其重要。

## 核心概念
- raise 创建异常并中断当前 normal control flow。
- Exception 会沿调用栈向上传播，直到被 matching except 捕获。
- try block 只包可能失败且需要处理的代码。
- except 应该捕获具体异常，不要用裸 except 吞掉所有错误。
- Exception behavior 是函数/ADT interface 的一部分。

## 操作模板
~~~python
def pop(self) -> Any:
    if self.is_empty():
        raise EmptyStackError
    return self._items.pop()
~~~

处理异常：
~~~python
try:
    value = risky_operation()
except SpecificError:
    handle_failure()
else:
    handle_success(value)
finally:
    cleanup()
~~~

## 常见误区
- 用 exception 替代普通 if/else 控制流。
- except 太宽，隐藏真正 bug。
- raise 之后还以为后面的 normal code 会继续执行。
- 没有把异常写进 docstring/interface。

## 回答检查清单
异常题要说明异常在哪里 raise、传播路径、哪个 handler 捕获、正常路径和失败路径分别返回/改变什么。
`,

  memory_csc148_queue_12_running_time_public_20260618: m`
## 记忆角色
Notebook 12 的操作记忆。它服务 runtime analysis、Big-O/Omega/Theta 和 recursive sorting；回答复杂度题时要指出主导步骤。

## 核心概念
- Input size 必须先定义，例如 list length n、tree nodes n、height h。
- Big-O 是 upper bound；Omega 是 lower bound；Theta 是 tight bound。
- Sequential steps 取最大项；nested loops 通常相乘。
- Linked list、tree、BST 的 runtime 取决于 representation 和 height。
- Merge sort / quicksort 要看 divide、recursive calls、combine/partition 成本。

## 复杂度分析模板
1. 定义 input size。
2. 找主导操作。
3. 逐段估算循环、递归或 helper 成本。
4. 丢掉常数和低阶项。
5. 如果结构可能不平衡，要说明 best/worst 或 balanced/skewed。

## 排序模板
Merge sort：分成两半，递归排序，merge 线性合并，通常 O(n log n)。  
Quicksort：partition 后递归两边；平均 O(n log n)，worst-case O(n^2)。

## 常见误区
- 只看有几行代码，不看循环次数。
- 把 BST search 永远写成 O(log n)。
- 忘记 slicing/copying 可能有线性成本。
- 递归题没有说明每层成本和层数。

## 回答检查清单
复杂度题必须包含 input size、主导步骤、最终 bound 和一句为什么；如果有多种结构形状，要写清 best/worst。
`,
};
