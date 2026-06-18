export const CSC148_TREE_BST_TEMPLATE_REPAIR_VERSION = 'csc148-tree-bst-template-v1';

const TREE_LONGEST_ASCENDING_SEQUENCE_ID = 'notebook_2141';
const TREE_COUNT_UPPER_ODD_ID = 'notebook_2142';
const BST_TRAVERSAL_ID = 'notebook_2135';
const BST_INSERT_ID = 'notebook_2131';
const BST_FIND_ID = 'notebook_2132';
const BST_DELETE_ID = 'notebook_2134';
const BST_PREORDER_ID = 'notebook_2136';

const TREE_SOURCE_IDS = new Set([TREE_LONGEST_ASCENDING_SEQUENCE_ID, TREE_COUNT_UPPER_ODD_ID]);
const BST_SOURCE_IDS = new Set([
  BST_TRAVERSAL_ID,
  BST_INSERT_ID,
  BST_FIND_ID,
  BST_DELETE_ID,
  BST_PREORDER_ID,
]);

export const CSC148_TREE_BST_SOURCE_IDS = new Set([...TREE_SOURCE_IDS, ...BST_SOURCE_IDS]);

const TREE_TEMPLATE_HEADER = `from __future__ import annotations
from typing import Any

class Tree:
    """A recursive tree data structure.

    Private Instance Attributes:
    - _root: The item stored at this tree's root, or None if this tree is empty.
    - _subtrees: The list of all subtrees of this tree.

    Representation Invariants:
    - If self._root is None then self._subtrees is an empty list.
      This setting of attributes represents an empty tree.

      Note: self._subtrees may be empty when self._root is not None.
      This setting of attributes represents a tree consisting of just one
      node.
    """
    _root: Any | None
    _subtrees: list[Tree]

    def __init__(self, root: Any | None, subtrees: list[Tree]) -> None:
        """Initialize a new tree with the given root value and subtrees.

        If <root> is None, this tree is empty.
        Precondition: if <root> is None, then <subtrees> is empty.
        """
        self._root = root
        self._subtrees = subtrees

    def is_empty(self) -> bool:
        """Return whether this tree is empty."""
        return self._root is None`;

const BST_TEMPLATE_HEADER = `from __future__ import annotations
from typing import Any

class BinarySearchTree:
    """Binary Search Tree class.

    This class represents a binary tree satisfying the Binary Search Tree
    property: for every node, its value is >= all items stored in its left
    subtree, and <= all items stored in its right subtree.

    Private Instance Attributes:
    - _root: The item stored at the root of the tree, or None if
             the tree is empty.
    - _left: The left subtree, or None if the tree is empty.
    - _right: The right subtree, or None if the tree is empty.
    """
    _root: Any | None
    _left: BinarySearchTree | None
    _right: BinarySearchTree | None

    def __init__(self, root: Any | None) -> None:
        """Initialize a new BST containing only the given root value.

        If <root> is None, initialize an empty BST.
        """
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
        return self._root is None`;

const STARTERS_BY_SOURCE_ID = {
  [TREE_LONGEST_ASCENDING_SEQUENCE_ID]: `${TREE_TEMPLATE_HEADER}

    def longest_ascending_sequence(self) -> int:
        """Return the length of the longest ascending sequence of values
        in this Tree starting from the root.
        """
        raise NotImplementedError`,

  [TREE_COUNT_UPPER_ODD_ID]: `${TREE_TEMPLATE_HEADER}

    def count_upper_odd(self, n: int) -> int:
        """Return the number of nodes in this tree whose depth is less than
        <n> and whose values are odd integers.
        """
        raise NotImplementedError`,

  [BST_TRAVERSAL_ID]: `${BST_TEMPLATE_HEADER}

    def inorder(self) -> str:
        """Return inorder traversal as a space-separated string."""
        raise NotImplementedError

    def preorder(self) -> str:
        """Return preorder traversal as a space-separated string."""
        raise NotImplementedError

    def postorder(self) -> str:
        """Return postorder traversal as a space-separated string."""
        raise NotImplementedError`,

  [BST_INSERT_ID]: `${BST_TEMPLATE_HEADER}

    def insert(self, item: Any) -> None:
        """Insert <item> into this BST."""
        pass

    def inorder(self) -> list[Any]:
        """Return the items in this BST in sorted order."""
        if self.is_empty():
            return []

        result = []
        if self._left is not None:
            result.extend(self._left.inorder())
        result.append(self._root)
        if self._right is not None:
            result.extend(self._right.inorder())
        return result`,

  [BST_FIND_ID]: `${BST_TEMPLATE_HEADER}

    def insert(self, item: Any) -> None:
        """Insert <item> into this BST."""
        if self.is_empty():
            self._root = item
            self._left = BinarySearchTree(None)
            self._right = BinarySearchTree(None)
        elif item <= self._root:
            self._left.insert(item)
        else:
            self._right.insert(item)

    def find(self, item: Any) -> bool:
        """Return whether <item> is in this BST."""
        raise NotImplementedError

    def inorder(self) -> list[Any]:
        """Return the items in this BST in sorted order."""
        if self.is_empty():
            return []

        result = []
        if self._left is not None:
            result.extend(self._left.inorder())
        result.append(self._root)
        if self._right is not None:
            result.extend(self._right.inorder())
        return result`,

  [BST_DELETE_ID]: `${BST_TEMPLATE_HEADER}

    def insert(self, item: Any) -> None:
        """Insert <item> into this BST."""
        if self.is_empty():
            self._root = item
            self._left = BinarySearchTree(None)
            self._right = BinarySearchTree(None)
        elif item <= self._root:
            self._left.insert(item)
        else:
            self._right.insert(item)

    def find(self, item: Any) -> bool:
        """Return whether <item> is in this BST."""
        if self.is_empty():
            return False
        if item == self._root:
            return True
        if item < self._root:
            return self._left.find(item)
        return self._right.find(item)

    def delete(self, item: Any) -> bool:
        """Remove <item> from this BST if it is present.

        Return whether <item> was removed.
        """
        raise NotImplementedError

    def update(self, old: Any, new: Any) -> bool:
        """Replace <old> with <new> if <old> is present."""
        if self.delete(old):
            self.insert(new)
            return True
        return False

    def inorder(self) -> list[Any]:
        """Return the items in this BST in sorted order."""
        if self.is_empty():
            return []

        result = []
        if self._left is not None:
            result.extend(self._left.inorder())
        result.append(self._root)
        if self._right is not None:
            result.extend(self._right.inorder())
        return result`,

  [BST_PREORDER_ID]: `${BST_TEMPLATE_HEADER}


def preorder_to_BST(prelist: list[int]) -> BinarySearchTree:
    """Create a BinarySearchTree whose preorder traversal equals <prelist>.

    Precondition: prelist is a preorder traversal of some BST.
    """
    raise NotImplementedError`,
};

function sourceIdForDraft(draft) {
  return String(draft?.sourceMeta?.sourceQuestionId ?? '');
}

function normalizeTreeConstructorCalls(text) {
  return text
    .replace(/\bTree\s*\(\s*\)/g, 'Tree(None, [])')
    .replace(/\bTree\(\s*([^(),[\]\n]+?)\s*\)/g, 'Tree($1, [])');
}

function normalizeBstTemplateFragments(text) {
  return text
    .replace(/\bOptional\[Any\]/g, 'Any | None')
    .replace(/\bOptional\["BinarySearchTree"\]/g, 'BinarySearchTree | None')
    .replace(/\bOptional\[BinarySearchTree\]/g, 'BinarySearchTree | None')
    .replace(
      /else:\n([ \t]*)self\._left\s*=\s*None\n\1self\._right\s*=\s*None/g,
      'else:\n$1self._left = BinarySearchTree(None)\n$1self._right = BinarySearchTree(None)',
    )
    .replace(
      /self\._root\s*=\s*item\n([ \t]*)self\._left\s*=\s*None\n\1self\._right\s*=\s*None/g,
      'self._root = item\n$1self._left = BinarySearchTree(None)\n$1self._right = BinarySearchTree(None)',
    );
}

export function normalizeCsc148TreeBstString(value, sourceQuestionId) {
  let text = String(value);
  if (TREE_SOURCE_IDS.has(sourceQuestionId)) {
    text = normalizeTreeConstructorCalls(text);
  }
  if (BST_SOURCE_IDS.has(sourceQuestionId)) {
    text = normalizeBstTemplateFragments(text);
  }
  return text;
}

export function normalizeCsc148TreeBstJson(value, sourceQuestionId) {
  if (typeof value === 'string') {
    return normalizeCsc148TreeBstString(value, sourceQuestionId);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCsc148TreeBstJson(item, sourceQuestionId));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeCsc148TreeBstJson(item, sourceQuestionId),
      ]),
    );
  }
  return value;
}

export function normalizeCsc148TreeBstPublicContent(publicContent, sourceQuestionId) {
  const normalized = normalizeCsc148TreeBstJson(publicContent, sourceQuestionId);
  const starterCode = STARTERS_BY_SOURCE_ID[sourceQuestionId];
  return starterCode
    ? {
        ...normalized,
        starterCode,
        functionSignature: starterCode.includes('class Tree:')
          ? 'class Tree:'
          : 'class BinarySearchTree:',
      }
    : normalized;
}

export function normalizeCsc148TreeBstDraft(draft) {
  const sourceQuestionId = sourceIdForDraft(draft);
  if (!CSC148_TREE_BST_SOURCE_IDS.has(sourceQuestionId)) return draft;

  return {
    ...draft,
    publicContent: normalizeCsc148TreeBstPublicContent(draft.publicContent, sourceQuestionId),
    grading: normalizeCsc148TreeBstJson(draft.grading, sourceQuestionId),
    ...(draft.secretJudge
      ? { secretJudge: normalizeCsc148TreeBstJson(draft.secretJudge, sourceQuestionId) }
      : {}),
    sourceMeta: {
      ...draft.sourceMeta,
      treeBstTemplateRepair: CSC148_TREE_BST_TEMPLATE_REPAIR_VERSION,
    },
  };
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

export function collectCsc148TreeBstTemplateIssues(...values) {
  const text = values.flatMap((value) => collectStrings(value)).join('\n---\n');
  const issues = [];

  if (/class\s+BinarySearchTree\b/.test(text)) {
    if (/else:\s*\n\s*self\._left\s*=\s*None\s*\n\s*self\._right\s*=\s*None/.test(text)) {
      issues.push('bst_nonempty_children_none');
    }
    if (
      /self\._root\s*=\s*root\s*\n\s*self\._left:\s*Optional\[BinarySearchTree\]\s*=\s*None\s*\n\s*self\._right:\s*Optional\[BinarySearchTree\]\s*=\s*None/.test(
        text,
      )
    ) {
      issues.push('bst_init_children_none');
    }
    if (
      /self\._root\s*=\s*item\s*\n\s*self\._left\s*=\s*None\s*\n\s*self\._right\s*=\s*None/.test(
        text,
      )
    ) {
      issues.push('bst_insert_children_none');
    }
    if (
      /_left:\s*Optional\["?BinarySearchTree"?\]|_right:\s*Optional\["?BinarySearchTree"?\]/.test(
        text,
      )
    ) {
      issues.push('bst_optional_child_annotation');
    }
  }

  if (/class\s+Tree\b/.test(text)) {
    if (
      /\bself\.(?:value|children|label|branches)\b/.test(text) &&
      !/\bself\._subtrees\b/.test(text)
    ) {
      issues.push('tree_not_subtrees_template');
    }
  }

  return Array.from(new Set(issues));
}
