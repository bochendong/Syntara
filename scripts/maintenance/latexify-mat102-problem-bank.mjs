#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;

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

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const UPDATES = new Map([
  [
    1,
    {
      stem: 'Suppose that $A$, $B$, and $C$ are sets. Identify the hypothesis of the following theorem: “If $A \\setminus B \\subseteq C$, then $A \\setminus C \\subseteq B$.”',
      options: {
        A: '$A \\subseteq C$.',
        B: '$A \\setminus C \\subseteq B$.',
        C: 'If $A \\setminus B \\subseteq C$, then $A \\setminus C \\subseteq B$.',
        D: '$A \\setminus B \\subseteq C$.',
      },
    },
  ],
  [
    2,
    {
      stem: 'Which of the following describes the set of positive integers that are a power of two? [For this question, you may assume that $0 \\in \\mathbb{N}$.]',
      options: {
        A: '$\\{n \\in \\mathbb{R}: \\exists k \\in \\mathbb{Z},\\ n = 2^k\\}$',
        B: '$\\{n \\in \\mathbb{N}: \\exists k \\in \\mathbb{N},\\ n = 2^k\\}$',
        C: '$\\{n \\in \\mathbb{Z}: \\exists k \\in \\mathbb{N},\\ n = k^2\\}$',
        D: '$\\{n \\in \\mathbb{Z}: \\forall k \\in \\mathbb{Z},\\ n = 2^k\\}$',
      },
    },
  ],
  [
    3,
    {
      stem: 'Suppose that $A = \\{x \\in \\mathbb{Z}: \\exists y \\in \\mathbb{Z},\\ x = y^2\\}$ and $B = \\{x \\in \\mathbb{R}: 0 < x^2 < 100\\}$. Which of the following is not an element of $A \\times B$?',
      options: {
        A: '$(9, 1)$',
        B: '$(25, 9)$',
        C: '$(4, 21)$',
        D: '$(25, 0)$',
      },
    },
  ],
  [
    4,
    {
      stem: 'Suppose that $A$ and $B$ are subsets of $\\mathbb{R}$. Which of the following is a correct negation of the sentence: “$\\forall x \\in A,\\ \\forall y \\in B,\\ \\exists z \\in A \\cap B,\\ |x-y| < 1 \\implies |x-z| < \\frac{1}{2}$”',
      options: {
        A: '$\\exists x \\in A,\\ \\exists y \\in B,\\ \\forall z \\in A \\cap B,\\ |x-z| \\ge \\frac{1}{2} \\implies |x-y| \\ge 1$',
        B: '$\\forall x \\in A,\\ \\forall y \\in B,\\ \\exists z \\in A \\cap B,\\ |x-y| < 1 \\wedge |x-z| \\ge \\frac{1}{2}$',
        C: '$\\exists x \\in A,\\ \\exists y \\in B,\\ \\forall z \\in A \\cap B,\\ |x-y| < 1 \\wedge |x-z| \\ge \\frac{1}{2}$',
        D: '$\\exists x \\in A,\\ \\exists y \\in B,\\ \\forall z \\in A \\cap B,\\ |x-y| < 1 \\vee |x-z| \\ge \\frac{1}{2}$',
      },
    },
  ],
  [
    5,
    {
      stem: 'Consider the statement “If $m+n$ is odd, then either $m$ or $n$ is odd.” A student gives the following proof: (L1) If $m$ is odd then we’re done, so assume that $m$ is even. (L2) Since $m$ is even, there is an integer $k$ such that $m = 2k$. (L3) Now also assume that $n$ is odd, so that $n = 2\\ell + 1$ for some integer $\\ell$. (L4) Then $m+n = (2k) + (2\\ell + 1) = 2(k + \\ell) + 1 = 2n + 1$, where $n = k + \\ell$. (L5) And this shows that $m+n$ is odd, since we’ve written it as $2n+1$. Which line introduces an error into the proof?',
    },
  ],
  [
    7,
    {
      stem: 'Which of the following is a plain English description of the following sentence? “$\\forall x \\in \\mathbb{R},\\ \\forall r > 0,\\ \\exists q \\in \\mathbb{Q},\\ q \\in (x-r, x+r)$.”',
    },
  ],
  [
    8,
    {
      stem: 'For which of the following values of $P$, $Q$, and $R$ is the statement $(P \\wedge Q) \\Longleftrightarrow (R \\wedge \\neg R)$ false?',
      options: {
        A: '$P$ is true, $Q$ is true, and $R$ is true.',
        B: '$P$ is false, $Q$ is true, and $R$ is false.',
        C: '$P$ is true, $Q$ is false, and $R$ is true.',
        D: '$P$ is false, $Q$ is false, and $R$ is false.',
      },
    },
  ],
  [
    9,
    {
      stem: 'What is the contrapositive of the following statement: “Let $n$ be an integer. For every $k \\in \\mathbb{N}$, if $nk$ is odd then $n$ is odd.”',
      options: {
        A: 'For every $k \\in \\mathbb{N}$, if $n$ is odd then $nk$ is odd.',
        B: 'For every $k \\in \\mathbb{N}$, if $n$ is even then $nk$ is odd.',
        C: 'For every $k \\in \\mathbb{N}$, if $nk$ is even then $n$ is even.',
        D: 'For every $k \\in \\mathbb{N}$, if $n$ is even then $nk$ is even.',
      },
    },
  ],
  [
    10,
    {
      stem: 'What is the contrapositive of the following statement: “Let $x$ and $y$ be real numbers. If $x < y + \\epsilon$ for all $\\epsilon > 0$, then $x \\le y$.”',
      options: {
        A: 'If $x > y$ then for all $\\epsilon > 0$ we have $x < y + \\epsilon$.',
        B: 'If $x > y$, then there is an $\\epsilon > 0$ such that $x \\ge y + \\epsilon$.',
        C: 'If $x \\ge y + \\epsilon$ for some $\\epsilon > 0$, then $x > y$.',
        D: 'If $x \\le y$, then $x < y + \\epsilon$ for all $\\epsilon > 0$.',
      },
    },
  ],
  [
    12,
    {
      stem: 'For a set $A \\subset \\mathbb{R}$ which is bounded above, we say that $y \\in \\mathbb{R}$ is an upper bound for $A$ if for all $x \\in A$, $x \\le y$. Are there any sets $A \\subset \\mathbb{R}$ with a unique upper bound? Either give an example of such a set $A$ or show that there are no sets with a unique upper bound.',
    },
  ],
  [
    13,
    {
      stem: 'Using the definition of bounded above as a guide, define what it means for a set $A \\subset \\mathbb{R}$ to be bounded below.',
    },
  ],
  [
    14,
    {
      stem: 'Define the sets $A = (0, 6) \\cap \\mathbb{N}$, $B = \\{x \\in \\mathbb{Z}: x \\text{ is even}\\}$, and $C = \\{x \\in \\mathbb{Z}: x^2 \\le 4\\}$. Compute $A \\cap B$, $A \\cap C$, and $B \\cup C$, and very clearly show that $A \\cap (B \\cup C) = (A \\cap B) \\cup (A \\cap C)$.',
    },
  ],
  [
    15,
    {
      stem: 'Show in general that if $A$, $B$, and $C$ are general sets, then $A \\cap (B \\cup C) = (A \\cap B) \\cup (A \\cap C)$.',
    },
  ],
  [
    16,
    {
      stem: 'For each of the below statements: (1) convert the statement to an English sentence, (2) say whether the statement is true or false, and (3) prove your answer. (i) $\\forall m \\in \\mathbb{Z},\\ \\exists n \\in \\mathbb{Z},\\ m+n$ is even.',
    },
  ],
  [
    17,
    {
      stem: 'For each of the below statements: (1) convert the statement to an English sentence, (2) say whether the statement is true or false, and (3) prove your answer. (ii) $\\exists m \\in \\mathbb{Z},\\ \\forall n \\in \\mathbb{Z},\\ m+n$ is even.',
    },
  ],
  [
    23,
    {
      stem: 'Define the sets $A = \\{n \\in \\mathbb{Z}: n = k^2 \\text{ for some } k \\in \\mathbb{Z}\\}$ and $B = \\{n \\in \\mathbb{Z}: n = k^4 \\text{ for some } k \\in \\mathbb{Z}\\}$. Which of the following statements is correct?',
      options: {
        A: '$A \\subsetneq B$',
        B: '$B \\subsetneq A$',
        C: '$A = B$',
        D: '$A \\cap B = \\varnothing$',
      },
    },
  ],
  [
    24,
    {
      stem: 'We say that $g \\in \\mathbb{Z}$ is grand if $\\forall a \\in \\mathbb{Z},\\ \\forall b \\in \\mathbb{Z},\\ [g = a \\cdot b \\implies (a = 1 \\vee b = 1)]$. Which of the following defines what it means for $g$ to not be grand?',
      options: {
        A: '$\\exists a \\in \\mathbb{Z},\\ \\exists b \\in \\mathbb{Z},\\ (g = a \\cdot b) \\wedge (a \\ne 1) \\wedge (b \\ne 1)$.',
        B: '$\\exists a \\in \\mathbb{Z},\\ \\exists b \\in \\mathbb{Z},\\ [g \\ne a \\cdot b \\implies (a = 1 \\vee b = 1)]$.',
        C: '$\\exists a \\in \\mathbb{Z},\\ \\exists b \\in \\mathbb{Z},\\ [g = a \\cdot b \\implies (a \\ne 1 \\vee b \\ne 1)]$.',
        D: '$\\exists a \\in \\mathbb{Z},\\ \\exists b \\in \\mathbb{Z},\\ [g \\ne a \\cdot b \\vee (a = 1 \\vee b = 1)]$.',
      },
    },
  ],
  [
    25,
    {
      stem: 'Which of the following statements is/are true?\n(I) $\\forall a \\in \\mathbb{Z},\\ \\forall b \\in \\mathbb{Z},\\ a = b^2$\n(II) $\\forall a \\in \\mathbb{Z},\\ \\exists b \\in \\mathbb{Z},\\ a = b^2$\n(III) $\\exists a \\in \\mathbb{Z},\\ \\forall b \\in \\mathbb{Z},\\ a = b^2$\n(IV) $\\exists a \\in \\mathbb{Z},\\ \\exists b \\in \\mathbb{Z},\\ a = b^2$.',
    },
  ],
  [
    26,
    {
      stem: 'Define a relation $\\sim$ on $\\mathbb{Z}^+$ by saying that $a \\sim b$ if they share at least one digit in common. Which of the following statements is correct?',
      options: {
        A: '$\\sim$ is reflexive, symmetric, and transitive.',
        B: '$\\sim$ is reflexive and symmetric, but not transitive.',
        C: '$\\sim$ is symmetric and transitive, but not reflexive.',
        D: '$\\sim$ is reflexive and transitive, but not symmetric.',
      },
    },
  ],
  [
    27,
    {
      stem: 'Recall the following weak partial order on $\\mathbb{Z} \\times \\mathbb{Z}$, defined in Assignment 1: We say that $(a,b) \\preceq (c,d)$ if $a \\le c$ and $b \\le d$. Define $S = \\{(m,n) \\in \\mathbb{Z} \\times \\mathbb{Z}: n \\ge 0 \\text{ and } -2 \\le m \\le -1\\}$ and $T = \\{(m,n) \\in \\mathbb{Z} \\times \\mathbb{Z}: n \\ge 0 \\text{ and } 1 \\le m \\le 2\\}$. What is/are the minimal element(s) of $S \\cup T$?',
      options: {
        A: 'Both $(-2,0)$ and $(1,0)$ are minimal.',
        B: '$(-2,0)$ is the only minimal point.',
        C: '$(1,0)$ is the only minimal point.',
        D: '$(0,0)$ is the only minimal point.',
      },
    },
  ],
  [
    28,
    {
      stem: 'Define an order relation on $\\mathbb{Z}$ by saying that $a \\preceq b$ if $a \\mid b$. If $S = \\{8, 12, 36\\}$, what is $\\inf(S)$? (Recall that $a \\mid b$ if there is an $n \\in \\mathbb{Z}$ such that $an = b$.)',
      options: {
        A: '$\\inf(S)=1$',
        B: '$\\inf(S)=8$',
        C: '$\\inf(S)=72$',
        D: '$\\inf(S)$ does not exist.',
      },
    },
  ],
  [
    29,
    {
      stem: 'Define a relation $\\sim$ on $\\mathbb{Z}^* \\times \\mathbb{Z}^*$ by saying that $(a,b) \\sim (m,n)$ if $a + m = b + n$. Giovanni wants to prove that $\\sim$ is transitive. His proof is given below. On what line, if any, is the first error in his proof?',
      options: {
        A: 'We want to show that if $(a,b) \\sim (b,c)$ and $(b,c) \\sim (a,c)$ then $(a,b) \\sim (a,c)$.',
        B: 'By definition, we know that since $(a,b) \\sim (b,c)$ then $a+b=b+c$.',
        C: 'Similarly, since $(b,c) \\sim (a,c)$ then $b+c=a+c$.',
        D: 'Combining the previous two facts, we get that $a+b=b+c=a+c$, which in turn implies $(a,b) \\sim (a,c)$, as required.',
      },
    },
  ],
  [
    30,
    {
      stem: 'Suppose that $f: A \\to B$ is a function and $U \\subseteq B$. Which of the following statements is correct?',
      options: {
        A: '$U = f(f^{-1}(U))$',
        B: '$U \\subseteq f(f^{-1}(U))$',
        C: '$U \\supseteq f(f^{-1}(U))$',
        D: '$U \\cap f(f^{-1}(U)) = \\varnothing$.',
      },
    },
  ],
  [
    31,
    {
      stem: 'Show that $A \\subseteq B$ where $A = \\{f: \\mathbb{N} \\to \\mathbb{N}: \\exists N \\in \\mathbb{N},\\ \\forall n \\ge N,\\ f(n)=0\\}$ and $B = \\{f: \\mathbb{N} \\to \\mathbb{N}: \\forall N \\in \\mathbb{N},\\ \\exists n \\ge N,\\ f(n)=0\\}$.',
    },
  ],
  [
    35,
    {
      stem: 'Write out six (6) elements of the set $S$ defined recursively by: $0 \\in S$ and if $n \\in S$ then $2n + 1 \\in S$.',
    },
  ],
  [
    39,
    {
      stem: 'Show that for any set $A$, the relation $\\sim$ defined by $a \\sim b$ if and only if $a \\mid b$ or $b \\mid a$ is symmetric and reflexive.',
    },
  ],
  [
    47,
    {
      stem: 'Define a function $f: \\mathbb{Z}_{2025} \\to \\mathbb{Z}_{2025}$ by $f([x]_{2025}) = [2x]_{2025}$. You may assume, without proof, that this function is well-defined. Determine whether $f$ is injective, surjective, both, or neither.',
    },
  ],
  [
    48,
    {
      stem: 'Show that for all odd positive integers $n$, $8 \\mid (n^2 - 1)$.',
    },
  ],
  [
    49,
    {
      stem: 'For each $n \\in \\mathbb{Z}^*$, define the set $A_n$ to be the set of all subsets of $\\mathbb{Z}^+$ whose elements sum up to $n$. Argue that $A_n$ is finite. Hint: Show that $A_n \\subseteq \\mathcal{P}(\\{1, 2, \\ldots, n\\})$.',
    },
  ],
  [
    56,
    {
      stem: 'Suppose that $f: X \\to Y$ is an injective function. If $A, B \\subseteq X$ and $f(A) = f(B)$, show that $A = B$.',
    },
  ],
  [
    57,
    {
      stem: 'Suppose that $A$, $B$, and $C$ are sets such that $|A| = |B|$ and $|B| \\le |C|$. Prove that $|A| \\le |C|$.',
    },
  ],
  [
    59,
    {
      stem: 'Let $p$ and $q$ be distinct prime numbers, and set $d = pq$. Find the smallest $n$ such that $d \\mid n!$.',
    },
  ],
  [
    60,
    {
      stem: 'Determine the remainder when $15!$ is divided by $17$.',
    },
  ],
  [
    63,
    {
      stem: 'Suppose that $G$ is a group in which $(ab)^2 = a^2b^2$ for all $a, b \\in G$. Show that $G$ is abelian.',
    },
  ],
  [
    66,
    {
      stem: 'For any two subsets $A$ and $B$ of $\\mathbb{Z}$, we define their symmetric difference as $A \\triangle B = (A \\setminus B) \\cup (B \\setminus A)$. Show that if $A$, $B$, and $C$ are sets, then $A \\triangle C \\subseteq (A \\triangle B) \\cup (B \\triangle C)$.',
    },
  ],
  [
    67,
    {
      stem: 'Define a relation on $\\mathcal{P}(\\mathbb{Z})$ by saying that $A \\sim B$ if and only if $|A \\triangle B|$ is finite. Show that $\\sim$ is an equivalence relation.',
    },
  ],
  [
    68,
    {
      stem: 'Recall that $B^A = \\{f: A \\to B\\}$. If $A$, $B$, and $C$ are non-empty sets, define the map $E: B^A \\times A \\to B$ by $E(f,x) = f(x)$. Show that $E$ is always surjective.',
    },
  ],
  [
    71,
    {
      stem: 'Let $p_n$ denote the $n$th prime, in the usual order. Argue that $p_{n+1} \\le p_1 \\cdots p_n + 1$ for all $n \\in \\mathbb{Z}^+$.',
    },
  ],
  [
    72,
    {
      stem: 'If $r \\ne 0, 1$ is a real number, show that $\\sum_{k=0}^{n} r^k = \\frac{1 - r^{n+1}}{1 - r}$ for all $n \\in \\mathbb{Z}^+$.',
    },
  ],
  [
    75,
    {
      stem: 'Define a relation $\\sim$ on $\\mathbb{R}$ as $x \\sim y$ if $|x-y|=1$. For each property below, check the given box to indicate whether $\\sim$ possesses that property or not. Justify your answer by giving a brief proof or a counter-example. (i) Left-Total (ii) Symmetric (iii) Reflexive (iv) Transitive',
    },
  ],
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyUpdate(content, update) {
  const next = cloneJson(content);
  if (update.stem) {
    if (typeof next.stem === 'string') {
      next.stem = update.stem;
    } else if (typeof next.stemTemplate === 'string') {
      next.stemTemplate = update.stem;
    } else {
      throw new Error('Problem content has no stem or stemTemplate.');
    }
  }

  if (update.options) {
    if (!Array.isArray(next.options)) {
      throw new Error('Problem update includes options but content has no options array.');
    }
    const optionIds = new Set(next.options.map((option) => option.id));
    for (const id of Object.keys(update.options)) {
      if (!optionIds.has(id)) throw new Error(`Missing option ${id}.`);
    }
    next.options = next.options.map((option) => ({
      ...option,
      label: update.options[option.id] ?? option.label,
    }));
  }

  return next;
}

function normalizeJson(value) {
  return JSON.stringify(value);
}

function previewChange(before, after) {
  const beforeStem = before.stem ?? before.stemTemplate ?? '';
  const afterStem = after.stem ?? after.stemTemplate ?? '';
  const lines = [];
  if (beforeStem !== afterStem) {
    lines.push(`  stem: ${beforeStem}`);
    lines.push(`     -> ${afterStem}`);
  }

  const beforeOptions = new Map((before.options ?? []).map((option) => [option.id, option.label]));
  for (const option of after.options ?? []) {
    const previous = beforeOptions.get(option.id);
    if (previous !== option.label) {
      lines.push(`  ${option.id}: ${previous}`);
      lines.push(`     -> ${option.label}`);
    }
  }
  return lines.join('\n');
}

function stripMathSpans(text) {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$[^$\n]*?\$/g, '')
    .replace(/\\\([\s\S]*?\\\)/g, '')
    .replace(/\\\[[\s\S]*?\\\]/g, '');
}

function hasNakedUnicodeMath(text) {
  const proseOnly = stripMathSpans(text);
  return /[∀∃∈⊆⊂⊇∪∩∅∧∨¬⇒⇐↔⇔≤≥≠ℓℕℤℚℝ×∆⪯]|(?<!\\)\bZ(?:\+|\*)\b|(?<!\\)\bN\b|(?<!\\)\bR\b|(?<!\\)\bQ\b/.test(
    proseOnly,
  );
}

function collectPublicText(content) {
  const texts = [];
  for (const key of ['stem', 'stemTemplate', 'explanation']) {
    if (typeof content?.[key] === 'string') texts.push(content[key]);
  }
  if (Array.isArray(content?.options)) {
    texts.push(...content.options.map((option) => option.label).filter(Boolean));
  }
  for (const translation of Object.values(content?.translations ?? {})) {
    for (const key of ['stem', 'stemTemplate', 'explanation']) {
      if (typeof translation?.[key] === 'string') texts.push(translation[key]);
    }
    if (Array.isArray(translation?.options)) {
      texts.push(...translation.options.map((option) => option.label).filter(Boolean));
    }
  }
  return texts;
}

async function main() {
  loadEnvLocal();
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const write = hasFlag('write');
  const prisma = new PrismaClient();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, name: true, courseCode: true },
  });
  if (!course) throw new Error(`Course not found: ${courseId}`);

  const problems = await prisma.notebookProblem.findMany({
    where: { courseId },
    select: {
      id: true,
      problemNumber: true,
      title: true,
      type: true,
      publicContentJson: true,
    },
    orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }],
  });

  const changed = [];
  const skipped = [];

  for (const problem of problems) {
    const update = UPDATES.get(problem.problemNumber);
    if (!update) {
      skipped.push(problem.problemNumber);
      continue;
    }

    const before = problem.publicContentJson;
    const after = applyUpdate(before, update);
    if (normalizeJson(before) === normalizeJson(after)) continue;

    changed.push({ problem, before, after });
  }

  console.log(
    `${write ? 'Writing' : 'Dry run for'} ${course.courseCode || ''} ${course.name} (${course.id})`,
  );
  console.log(`Problems: ${problems.length}; mapped: ${UPDATES.size}; changed: ${changed.length}`);

  for (const item of changed) {
    console.log(`\n#${item.problem.problemNumber} ${item.problem.title} [${item.problem.type}]`);
    console.log(previewChange(item.before, item.after));
  }

  if (write && changed.length > 0) {
    await prisma.$transaction(
      changed.map((item) =>
        prisma.notebookProblem.update({
          where: { id: item.problem.id },
          data: { publicContentJson: item.after },
        }),
      ),
    );
  }

  const afterProblems = write
    ? await prisma.notebookProblem.findMany({
        where: { courseId },
        select: { problemNumber: true, title: true, publicContentJson: true },
        orderBy: [{ problemNumber: 'asc' }, { order: 'asc' }],
      })
    : problems.map((problem) => {
        const update = UPDATES.get(problem.problemNumber);
        return {
          ...problem,
          publicContentJson: update
            ? applyUpdate(problem.publicContentJson, update)
            : problem.publicContentJson,
        };
      });

  const remaining = afterProblems
    .map((problem) => ({
      problemNumber: problem.problemNumber,
      title: problem.title,
      nakedMath: collectPublicText(problem.publicContentJson).some(hasNakedUnicodeMath),
    }))
    .filter((item) => item.nakedMath);

  if (remaining.length > 0) {
    console.log('\nRemaining possible naked math strings:');
    for (const item of remaining) console.log(`- #${item.problemNumber} ${item.title}`);
  } else {
    console.log('\nNo remaining obvious naked Unicode math in public problem text.');
  }

  if (!write) {
    console.log('\nRun with --write to update the database.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
