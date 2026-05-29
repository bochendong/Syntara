#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { generatedNotebookDir, generatedNotebookPublicPath } from '../shared/paths.mjs';

const RUN_STAMP = '20260519';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const DEFAULT_PROVIDER = 'openai-image';
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_CONCURRENCY = 2;

const themeColors = {
  ink: '#0f172a',
  teal: '#0f766e',
  blue: '#2563eb',
  orange: '#f97316',
};

const notebooks = [
  {
    sourcePdf: '02SetsAndPropositions (1).pdf',
    slug: 'mat102-sets-and-propositional-logic',
    title: 'Sets and Propositional Logic',
    description:
      'MAT102 notebook on sets, set-builder notation, set operations, Cartesian products, propositions, predicates, and basic truth tables.',
    slides: [
      [
        'Cover: Sets as Mathematical Containers',
        'Introduce sets as unordered collections of well-defined, distinct objects. Establish that sets are the basic containers used throughout proof-based mathematics.',
      ],
      [
        'Hook: What Counts as Belonging?',
        'Use examples like card suits, animals, and repeated numbers to ask when membership is clear. Emphasize well-defined and distinct as the key rules.',
      ],
      [
        'Set-Builder Notation',
        'Show how large or infinite sets are described using properties instead of full lists. Connect notation like {x : property} to natural-language descriptions.',
      ],
      [
        'Special Number Sets',
        'Review N, Z, Q, R, Z+, and non-negative integers. Highlight the ambiguity around whether 0 belongs to the natural numbers.',
      ],
      [
        'Set Operations: Union, Intersection, Difference',
        'Define union, intersection, and set difference with Venn-style intuition. Use small finite examples to compute each operation.',
      ],
      [
        'Complements and the Universe of Discourse',
        'Explain why complements depend on the ambient universe U. Contrast complements inside R, Z, and other possible universes.',
      ],
      [
        'Cartesian Products',
        'Introduce ordered pairs and A x B. Stress that order matters, so A x B is generally different from B x A.',
      ],
      [
        'Subsets and Set Equality',
        'Define S subset T and explain equality as two inclusions. Frame subset proofs as take an arbitrary element and show it belongs.',
      ],
      [
        'Propositions vs Predicates',
        'Distinguish statements with truth values from statements with variables. Show how predicates become propositions once variables are fixed.',
      ],
      [
        'AND, OR, NOT Truth Tables',
        'Build truth tables for conjunction, disjunction, and negation. Emphasize that mathematical OR is inclusive.',
      ],
      [
        'Common Mistakes: Duplicates, Order, Ambiguity',
        'Address repeated elements in sets, confusing ordered pairs with sets, and treating predicates as propositions too early. Include quick correction examples.',
      ],
      [
        'Summary and Next Hook: Toward Quantifiers',
        'Recap set notation, operations, subset proofs, and basic logic. Preview that predicates become full mathematical claims using for all and there exists.',
      ],
    ],
  },
  {
    sourcePdf: '03LogicCont.pdf',
    slug: 'mat102-logic-quantifiers-implications',
    title: 'Quantifiers, Implications, and Negation',
    description:
      'MAT102 notebook on universal and existential quantifiers, multiple quantifiers, implications, contrapositives, and negating mathematical statements.',
    slides: [
      [
        'Cover: Logic Continued',
        'Frame the notebook as the move from simple propositions to full mathematical statements. Preview quantifiers, implications, converses, contrapositives, and negations.',
      ],
      [
        'Hook: Everyone vs Someone',
        'Use everyday claims like every class uses one textbook and there is a black horse to reveal hidden quantifiers. Show that wording controls truth.',
      ],
      [
        'Universal and Existential Quantifiers',
        'Define forall and exists and explain how each turns a predicate into a proposition. Contrast proving all cases with finding one example.',
      ],
      [
        'How to Prove Quantified Statements',
        'For existential statements, give a witness. For universal statements, choose an arbitrary element and prove the claim for it.',
      ],
      [
        'Multiple Quantifiers and Order Matters',
        'Compare forall x exists y with exists y forall x using a real-number example. Emphasize dependency when later choices depend on earlier variables.',
      ],
      [
        'Plain-English Translation Practice',
        'Teach students to rewrite symbolic statements without variable names. Use classroom and polynomial examples to make quantifier structure visible.',
      ],
      [
        'Negating Quantifiers',
        'Show that negating forall creates exists not, and negating exists creates forall not. Connect counterexamples to negated universal claims.',
      ],
      [
        'Implications and Vacuous Truth',
        'Define P => Q using the truth table. Explain why false hypotheses make implications true, using a memorable everyday example.',
      ],
      [
        'Converse vs Contrapositive',
        'Define converse Q => P and contrapositive not Q => not P. Stress that the contrapositive is equivalent to the original but the converse is not.',
      ],
      [
        'Proof by Contrapositive',
        'Walk through if n^2 is even, then n is even. Show how proving if n is odd, then n^2 is odd proves the original.',
      ],
      [
        'Negating Implications and Counterexamples',
        'Teach that the negation of P => Q is P and not Q. Frame counterexamples as objects where the hypothesis is true and conclusion is false.',
      ],
      [
        'Common Language Traps and Next Hook',
        'Summarize inclusive OR, careful placement of NOT, and the difference between English if-then and mathematical implication. Preview contradiction and relations.',
      ],
    ],
  },
  {
    sourcePdf: '04Relations.pdf',
    slug: 'mat102-relations-equivalence-orders',
    title: 'Relations, Equivalence, and Order',
    description:
      'MAT102 notebook on contradiction, binary relations, relation properties, equivalence classes, partial orders, maximal/minimal elements, and bounds.',
    slides: [
      [
        'Cover: Relations as Mathematical Comparison',
        'Introduce relations as ways to compare objects. Preview contradiction proofs, relation properties, equivalence classes, and partial orders.',
      ],
      [
        'Hook: What Does It Mean To Be Related?',
        'Start from familiar comparisons like equality, less-than, and divisibility. Invite students to see relations as selected pairs from a Cartesian product.',
      ],
      [
        'Proof by Contradiction',
        'Explain the structure: assume the desired statement is false, then derive an impossibility. Use the contradiction pattern R and not R.',
      ],
      [
        'Classic Contradiction Examples',
        'Outline examples such as irrationality of sqrt(2), no smallest positive real number, and no natural solutions to an equation. Emphasize the assumption that triggers the contradiction.',
      ],
      [
        'Binary Relations as Subsets of Products',
        'Define a relation from A to B as a subset of A x B. Use a finite example to show how listed pairs become statements like aRb.',
      ],
      [
        'Relation Properties Checklist',
        'Define reflexive, irreflexive, symmetric, anti-symmetric, transitive, total, left-total, and functional. Present each as a question students can ask.',
      ],
      [
        'Testing Relation Properties with Examples',
        'Work through a sample relation on positive real numbers. Show how proofs establish properties and counterexamples disprove them.',
      ],
      [
        'Equivalence Relations',
        'Define equivalence relations as reflexive, symmetric, and transitive. Motivate them as morally equal relationships, not necessarily literal equality.',
      ],
      [
        'Equivalence Classes and Partitions',
        'Define [a] = {x : x ~ a} and explain how equivalence classes group related objects. Use a modulo-style visual to show shifted classes.',
      ],
      [
        'Order Relations and Posets',
        'Define weak and strong order relations, partial orders, and total orders. Use subset inclusion as a partial order where not every pair is comparable.',
      ],
      [
        'Maximal, Minimal, Maximum, Minimum',
        'Distinguish maximal from maximum and minimal from minimum. Use divisibility on a small set to show why several maximal elements may exist.',
      ],
      [
        'Bounds, Supremum, Infimum, Next Hook',
        'Define upper/lower bounds, supremum, and infimum in ordered sets. Summarize how relations organize mathematical structure and preview later proof topics.',
      ],
    ],
  },
  {
    sourcePdf: '05FunctionsI.pdf',
    slug: 'mat102-functions-i',
    title: 'Functions I: Images, Preimages, and Mapping Behavior',
    description:
      'MAT102 notebook on the formal definition of functions, images, preimages, injective/surjective/bijective behavior, and common notation mistakes.',
    slides: [
      [
        'Cover: Functions as Mathematical Machines',
        'Introduce functions as structured ways to transport information from one set to another, not just formulas.',
      ],
      [
        'Overview: What Data Defines a Function?',
        'Emphasize domain, codomain, rule or relation, and graph as the core data of a function.',
      ],
      [
        'Hook: Every Input Gets Exactly One Output',
        'Use arrow diagrams to make left-total and functional relations intuitive.',
      ],
      [
        'Problem Framing: Codomain Is Not Range',
        'Clarify why where outputs are allowed to live differs from what outputs actually occur.',
      ],
      [
        'Images of Sets',
        'Teach f(U) as the set of outputs produced from inputs in U, using interval examples.',
      ],
      [
        'Preimages of Sets',
        'Teach f^{-1}(V) as all inputs landing in V, stressing that no inverse function is required.',
      ],
      [
        'Worked Example: Squaring an Interval',
        'Show why f([-1,2]) = [0,4] requires both containment directions.',
      ],
      [
        'Worked Example: Projection and Cylinders',
        'Use p: R^3 -> R^2 to visualize preimages as higher-dimensional shapes.',
      ],
      [
        'Injective Functions: At Most One Arrow In',
        'Define one-to-one behavior and connect algebraic proofs to arrow diagrams.',
      ],
      [
        'Surjective Functions: At Least One Arrow In',
        'Define onto behavior and show how failure depends on the codomain.',
      ],
      [
        'Common Mistakes: Domains, Codomains, f^{-1}',
        'Contrast equal formulas with equal functions, codomain with range, and preimage notation with inverse functions.',
      ],
      [
        'Summary and Next Hook: Bijective Means Exactly One',
        'Close by combining injective and surjective into bijective functions, setting up inverses and cardinality.',
      ],
    ],
  },
  {
    sourcePdf: '06FunctionsII.pdf',
    slug: 'mat102-functions-ii-cardinality',
    title: 'Functions II: Inverses, Bijections, and Sizes of Infinity',
    description:
      'MAT102 notebook on inverse functions, bijections, cardinality, countability, Cantor-Schroder-Bernstein, and Cantor diagonalization.',
    slides: [
      [
        'Cover: Measuring Size with Functions',
        'Frame injective, surjective, and bijective maps as tools for comparing sets, especially infinite ones.',
      ],
      [
        'Overview: From Inverses to Cardinality',
        'Preview inverses, bijections, countability, diagonalization, and Cantor theorem.',
      ],
      [
        'Hook: What Does Inverse Mean?',
        'Start from additive and multiplicative inverses to motivate identity elements and undoing operations.',
      ],
      [
        'Function Composition and Identity Maps',
        'Build the definition of inverse functions using f o g = id and g o f = id.',
      ],
      [
        'Problem Framing: Why Inverses Can Fail',
        'Show that non-surjective maps miss outputs and non-injective maps collapse inputs, blocking invertibility.',
      ],
      [
        'The Big Bridge: Invertible iff Bijective',
        'Teach the proposition that bijections are exactly the functions with true two-sided inverses.',
      ],
      [
        'Cardinality: Defining |S| <= |T|',
        'Introduce injections as the formal meaning of no larger than, including finite-set sanity checks.',
      ],
      [
        'Examples: Infinite Sets Can Match Subsets',
        'Use N and even natural numbers to show that infinite cardinality violates finite intuition.',
      ],
      [
        'Cantor-Schroder-Bernstein',
        'Present the theorem as the rule that mutual injections imply equal cardinality.',
      ],
      [
        'Countable Sets: N, Z, and Q',
        'Explain countable and countably infinite sets, then outline why integers and rationals can be listed.',
      ],
      [
        'Common Mistakes: Bigger Looking Is Not Bigger',
        'Address traps: subset does not imply smaller for infinite sets, and dense rationals are still countable.',
      ],
      [
        'Summary and Next Hook: Diagonalization',
        'Close with R being uncountable and Cantor theorem showing every set has a strictly larger power set.',
      ],
    ],
  },
  {
    sourcePdf: '07NumberTheoryI.pdf',
    slug: 'mat102-number-theory-i-euclidean-algorithm',
    title: 'Number Theory I: Divisibility, GCDs, and the Euclidean Algorithm',
    description:
      'MAT102 notebook on divisibility, the well-ordering principle, the division algorithm, gcds, the Euclidean algorithm, and Bezout identity.',
    slides: [
      [
        'Cover: Logic Meets Number Theory',
        'Introduce number theory as a place where proof techniques become concrete and computational.',
      ],
      [
        'Overview: Divisibility to Bezout',
        'Preview divisibility, well-ordering, division algorithm, gcds, Euclidean algorithm, and Bezout identity.',
      ],
      [
        'Hook: Why Remainders Matter',
        'Use familiar division with remainders to motivate deeper structure behind algorithms.',
      ],
      [
        'Divisibility: The Language b | a',
        'Define divisibility through a = bk and practice translating symbolic claims into integer equations.',
      ],
      [
        'Problem Framing: Proving Divisibility Rules',
        'Show how statements like transitivity and linear combinations follow from substitutions.',
      ],
      [
        'Well-Ordering Principle',
        'Present least positive elements as the engine behind existence proofs in number theory.',
      ],
      ['Division Algorithm', 'Teach existence and uniqueness of a = qb + r with 0 <= r < b.'],
      [
        'Example: Proving 3 Divides n^3 - n',
        'Use residue cases modulo 3, then hint at the cleaner factoring argument.',
      ],
      [
        'Greatest Common Divisors',
        'Define gcd(a,b), coprime integers, and special cases involving zero and primes.',
      ],
      [
        'Euclidean Algorithm in Action',
        'Show how repeated remainders compute gcd(616,427)=7 efficiently.',
      ],
      [
        'Bezout Identity and Back-Substitution',
        'Teach how reversing the Euclidean algorithm finds integers m,n with am + bn = gcd(a,b).',
      ],
      [
        'Common Mistakes and Next Hook',
        'Warn about sign errors, confusing quotient/remainder conditions, and stopping before back-substitution; preview modular inverses.',
      ],
    ],
  },
  {
    sourcePdf: '08NumberTheoryII.pdf',
    slug: 'mat102-number-theory-ii-primes',
    title: 'Linear Diophantine Equations and Primes',
    description:
      'MAT102 notebook on coprime divisibility, linear Diophantine equations, general integer solutions, primes, FTA, and Euclid proof of infinite primes.',
    slides: [
      [
        'Cover: From GCDs to Primes',
        'Set up the lesson as a bridge from the Euclidean algorithm to prime factorization. Preview integer equations and primes controlling divisibility.',
      ],
      [
        'Hook: When Do Integer Solutions Exist?',
        'Start with 504x + 1155y = 42 and ask why rational solutions are easy but integer solutions are special.',
      ],
      [
        'Key Tool: Coprime Divisibility',
        'Introduce if a | bc and gcd(a,b)=1, then a | c. Emphasize this as the cancellation principle behind prime arguments.',
      ],
      [
        'Problem Frame: Linear Diophantine Equations',
        'Define equations of the form ax + by = d. Teach the central question: when do integers work?',
      ],
      [
        'Existence Theorem: The GCD Test',
        'Present ax + by = c has an integer solution iff gcd(a,b) divides c. Connect directly to Bezout identity.',
      ],
      [
        'Worked Example: Finding One Solution',
        'Walk through 504x + 1155y = 42 using Euclidean back-substitution: gcd, divisibility check, reverse substitution, scale.',
      ],
      [
        'All Solutions, Not Just One',
        'Show the general solution formula from a particular solution (x0,y0). Explain why a parameter slides along infinitely many integer solutions.',
      ],
      [
        'Constraint Example: Non-Negative Solutions',
        'Use inequalities on x = -32 + 55n and y = 14 - 24n to test for non-negative solutions.',
      ],
      [
        'Redefining Prime Numbers',
        'Compare no smaller factorization with if p | ab, then p | a or p | b. Show why the divisibility version is useful.',
      ],
      [
        'Prime Consequences and Irrationality',
        'Use p | n iff p | n^2 and sqrt(p) irrational to show primes as proof engines.',
      ],
      [
        'Fundamental Theorem of Arithmetic',
        'State existence and uniqueness of prime factorization. Teach the proof idea: well-ordering gives existence, prime divisibility gives uniqueness.',
      ],
      [
        'Summary and Next Hook: Infinite Primes',
        'Close with Euclid proof that there are infinitely many primes. Preview modular arithmetic and prime moduli.',
      ],
    ],
  },
  {
    sourcePdf: '09NumberTheoryIII.pdf',
    slug: 'mat102-number-theory-iii-modular-arithmetic',
    title: 'Modular Arithmetic and Fermat’s Little Theorem',
    description:
      'MAT102 notebook on congruence modulo n, modular arithmetic, cancellation, prime moduli, Fermat little theorem, and inverses in Zp.',
    slides: [
      [
        'Cover: Arithmetic on a Clock',
        'Introduce modular arithmetic as arithmetic where numbers loop around. Frame the lesson as turning equivalence relations into a working number system.',
      ],
      [
        'Hook: Why Does Only the Last Digit Matter?',
        'Ask how to find the last digit of a huge power like 4^441. Use this to motivate reducing numbers modulo 10.',
      ],
      [
        'Recall: Equivalence Relations',
        'Review reflexive, symmetric, and transitive relations. Prepare students to see congruence modulo n as familiar structure.',
      ],
      [
        'Definition: Congruence Modulo n',
        'Define a == b (mod n) as n | (b-a). Use 1 == 29 (mod 4) to anchor the notation.',
      ],
      [
        'Why Congruence Is an Equivalence Relation',
        'Prove reflexive, symmetric, and transitive step by step. Emphasize grouping integers by same remainder.',
      ],
      [
        'Well-Defined Addition and Multiplication',
        'Show that if a == r and b == s mod n, then sums and products stay congruent. This permits arithmetic with remainders.',
      ],
      [
        'The World of Zn',
        'Define classes [0], [1], ..., [n-1] and the set Zn. Use Z4 tables to show addition and multiplication in a finite system.',
      ],
      [
        'Example: Last Digit of a Large Power',
        'Work through the last-digit strategy for 4^441. Focus on reducing powers and spotting cycles rather than brute force.',
      ],
      [
        'Common Mistake: Cancelling When You Cannot',
        'Contrast valid cancellation under a coprime condition with failure modulo 4. Make the coprime condition impossible to miss.',
      ],
      [
        'Prime Moduli: Cancellation Works Better',
        'Explain why in Zp, with p prime, every nonzero class is coprime to p. Set up the special behavior of prime modulus arithmetic.',
      ],
      [
        'Fermat Little Theorem',
        'State and prove a^(p-1) == 1 (mod p) when p is prime and p does not divide a. Teach via rearranging nonzero residue classes.',
      ],
      [
        'Summary and Next Hook: Inverses in Zp',
        'Conclude that every nonzero element of Zp has a multiplicative inverse. Preview algebraic structures with division-like behavior.',
      ],
    ],
  },
  {
    sourcePdf: '10InductionI-1.pdf',
    slug: 'mat102-induction-i',
    title: 'Mathematical Induction, Strong Induction, and Recursion',
    description:
      'MAT102 notebook on ordinary induction, induction examples, sigma notation, strong induction, recursive definitions, and structural induction.',
    slides: [
      [
        'Cover: Proof by Dominoes',
        'Introduce induction as a method for proving infinitely many statements with finite work. Use the domino metaphor for base case and induction step.',
      ],
      [
        'Hook: How Can One Proof Cover Every n?',
        'Pose 2n + 2 <= 4n for all positive integers. Frame the mystery: checking examples is not proof, but a chain reaction can be.',
      ],
      [
        'The Induction Principle',
        'State the principle: prove P(1) and prove P(k) => P(k+1). Emphasize base case, induction hypothesis, and target statement.',
      ],
      [
        'Worked Example: An Inequality Proof',
        'Prove 2n + 2 <= 4n by induction. Teach how the induction hypothesis is inserted into an inequality chain.',
      ],
      [
        'Worked Example: Divisibility by Induction',
        'Prove 5 | (6^k - 1) for positive k. Show how divisibility proofs translate the hypothesis into an equation.',
      ],
      [
        'Visual Example: L-Tiling a Board',
        'Use the 2^n by 2^n chessboard with one missing square. Show induction as a constructive geometric strategy.',
      ],
      [
        'Sigma Notation as a For-Loop',
        'Introduce summation notation, bounds, index, and summand. Connect sigma notation to iteration.',
      ],
      [
        'Induction on a Sum Formula',
        'Prove a telescoping-style formula such as sum 1/[n(n+1)] = k/(k+1). Show old sum plus new term.',
      ],
      [
        'Common Mistakes in Induction Proofs',
        'Address missing base cases, assuming the conclusion, changing variables carelessly, and failing to state the induction hypothesis.',
      ],
      [
        'Beyond Standard Induction',
        'Explain that induction can start at other values or move in different step sizes. Match the induction structure to the statement.',
      ],
      [
        'Strong Induction and Multiple Base Cases',
        'Introduce strong induction with the postage example using 3-cent and 5-cent stamps. Explain why several base cases may be needed.',
      ],
      [
        'Recursion, Structural Induction, Next Hook',
        'Define recursive construction through basis elements and constructors, then connect it to structural induction. Preview recursive objects.',
      ],
    ],
  },
  {
    sourcePdf: '11GroupTheory-2.pdf',
    slug: 'mat102-group-theory-foundations',
    title: 'Group Theory: From Symmetry to Cyclic Groups',
    description:
      'MAT102 notebook on group axioms, examples and non-examples, abelian and non-abelian groups, dihedral groups, subgroup test, and cyclic groups.',
    slides: [
      [
        'Cover: What Is a Group?',
        'Introduce groups as algebraic systems for describing structure and symmetry across math, science, and computing.',
      ],
      [
        'Hook: Same Moves, Different Worlds',
        'Use rotations, modular arithmetic, and familiar number systems to show that different objects can obey the same rules.',
      ],
      [
        'Problem Framing: What Must a Group Do?',
        'Present the three group axioms: associativity, identity, and inverses, emphasizing that closure is built into the operation.',
      ],
      [
        'First Example: Modular Addition in Zn',
        'Walk through why Zn under addition satisfies the group axioms, using [0]n and additive inverses as anchors.',
      ],
      [
        'Non-Examples: Where the Axioms Break',
        'Compare positive integers under addition and rationals including zero under multiplication to show missing inverses or identity failures.',
      ],
      [
        'Abelian vs Non-Abelian Groups',
        'Introduce commutativity as an extra property, then contrast number groups with the symmetric group where composition order matters.',
      ],
      [
        'Symmetry Example: The Dihedral Group D3',
        'Use triangle symmetries e, r, r^2, s, sr, sr^2 to make rotations and reflections concrete and show sr != rs.',
      ],
      [
        'Core Group Facts: Identity, Cancellation, Inverses',
        'Package basic consequences of the axioms: uniqueness of identity/inverses and (ab)^-1 = b^-1 a^-1.',
      ],
      [
        'Order: Groups and Elements',
        'Explain the difference between the size of a group and the order of an element, using Z8*, D3, and Z as examples.',
      ],
      [
        'Subgroups: Groups Inside Groups',
        'Define subgroups and stress that the operation must be the same; use Z <= Q <= R and modular examples.',
      ],
      [
        'The Subgroup Test in Action',
        'Teach the efficient test ab^-1 in H, then apply it to a stabilizer-like set {h in G : hgh^-1 = g}.',
      ],
      [
        'Cyclic Groups and Next Hook',
        'Show how one element can generate a whole group or subgroup, ending with the idea that cyclic groups lead naturally to same-structure questions.',
      ],
    ],
  },
  {
    sourcePdf: '12GroupTheoryII.pdf',
    slug: 'mat102-group-morphisms-isomorphisms',
    title: 'Morphisms: When Groups Are the Same in Disguise',
    description:
      'MAT102 notebook on group homomorphisms, well-defined maps on modular classes, kernel, image, injectivity, isomorphism, invariants, and cyclic group classification.',
    slides: [
      [
        'Cover: Morphisms and Structure',
        'Frame the notebook around functions that preserve group operations and reveal when two groups are structurally identical.',
      ],
      [
        'Hook: Three Tables, One Group',
        'Compare Z2, {[1]6,[5]6}, and <[2]4> to show that changing element names can leave the group structure unchanged.',
      ],
      [
        'Problem Framing: Ordinary Functions Are Not Enough',
        'Explain why maps between groups must respect both elements and operations, not just send inputs to outputs.',
      ],
      [
        'Homomorphisms: Preserving the Operation',
        'Define a group homomorphism phi(xy)=phi(x)phi(y) and emphasize that domain and codomain may use different operations.',
      ],
      [
        'Well-Defined Maps on Modular Classes',
        'Use phi: Z6 -> Z12, phi([x]6)=[2x]12, to show why equivalence classes require a well-definedness check first.',
      ],
      [
        'Common Mistake: Formula Looks Good, Map Fails',
        'Contrast maps like [x]6 -> [3x]12 or [x]6 -> [x]12 to separate not well-defined from well-defined but not homomorphic.',
      ],
      [
        'Kernel and Image: What Collapses, What Appears',
        'Define ker(phi) and im(phi) using an example Z12 -> Z6. Show how kernels record elements sent to identity.',
      ],
      [
        'Properties of Homomorphisms',
        'Summarize consequences: identities map to identities, inverses map to inverses, finite orders can shrink, and kernels/images are subgroups.',
      ],
      [
        'Injectivity Through the Kernel',
        'Teach the powerful test: a homomorphism is injective exactly when its kernel is only the identity.',
      ],
      [
        'Isomorphisms: Perfect Translation Between Groups',
        'Define isomorphism as a bijective homomorphism and connect it back to same group in disguise.',
      ],
      [
        'Examples and Invariants',
        'Show Z2, U, and <[2]4> as isomorphic groups, then use preserved properties like order, cyclicity, and abelianness as evidence tools.',
      ],
      [
        'Summary and Final Hook: Classifying Cyclic Groups',
        'End with the theorem that every infinite cyclic group is isomorphic to Z and every finite cyclic group of order n is isomorphic to Zn.',
      ],
    ],
  },
].map((notebook) => ({
  ...notebook,
  id: `nb-${notebook.slug}-${RUN_STAMP}`,
  tags: ['MAT102', 'imagegen-full-slide', 'semantic-hit-map', notebook.sourcePdf],
}));

function parseArgs(argv) {
  const options = {
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    concurrency: DEFAULT_CONCURRENCY,
    generateImages: false,
    seedDb: false,
    skipDb: false,
    forceImages: false,
    keepRaw: false,
    only: null,
    courseId: process.env.MAT102_COURSE_ID || null,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--generate-images') options.generateImages = true;
    else if (arg === '--seed-db') options.seedDb = true;
    else if (arg === '--skip-db') options.skipDb = true;
    else if (arg === '--force-images') options.forceImages = true;
    else if (arg === '--keep-raw') options.keepRaw = true;
    else if (arg.startsWith('--provider=')) options.provider = arg.slice('--provider='.length);
    else if (arg.startsWith('--model=')) options.model = arg.slice('--model='.length);
    else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Math.max(1, Number(arg.slice('--concurrency='.length)) || 1);
    } else if (arg.startsWith('--only=')) {
      options.only = new Set(
        arg
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim()),
      );
    } else if (arg.startsWith('--course-id=')) {
      options.courseId = arg.slice('--course-id='.length).trim();
    }
  }
  return options;
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function outputDirFor(notebook) {
  return generatedNotebookDir(notebook.id);
}

function publicDirFor(notebook) {
  return generatedNotebookPublicPath(notebook.id);
}

function slidePath(notebook, order) {
  return path.join(outputDirFor(notebook), `slide-${pageLabel(order)}.png`);
}

function rawSlidePath(notebook, order) {
  return path.join(outputDirFor(notebook), `raw-slide-${pageLabel(order)}.png`);
}

function getApiConfig(options) {
  if (options.provider !== 'openai-image') {
    throw new Error(
      `This batch script currently supports openai-image only; got ${options.provider}`,
    );
  }
  const apiKey = process.env.IMAGE_OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing IMAGE_OPENAI_IMAGE_API_KEY or OPENAI_API_KEY');
  return {
    apiKey,
    baseUrl: (process.env.IMAGE_OPENAI_IMAGE_BASE_URL || 'https://api.openai.com/v1').replace(
      /\/$/,
      '',
    ),
    model: options.model,
  };
}

function buildImagePrompt(notebook, slide, order) {
  const [title, intent] = slide;
  const isCover = order === 0;
  const isSummary = /summary|next hook/i.test(title);
  const isMistake = /mistake|trap|cannot|fail/i.test(title);
  const layout = isCover
    ? 'roadmap strip across the middle, three simple visual anchors, and one bottom takeaway'
    : isSummary
      ? 'three-column summary board, common pitfalls box, and next question callout'
      : isMistake
        ? 'left side wrong path, middle correction, right side checklist'
        : 'left concept diagram, right worked board, bottom takeaway banner';

  return [
    'Create one complete educational classroom-board slide for a MAT102 proof-based mathematics notebook.',
    'The output should look like a careful teacher drew the whole slide as one coherent image, not like a software template.',
    'Style: clean grid paper, hand-drawn marker notes, readable math handwriting, teal/blue/orange accents, clear parent-level regions, generous whitespace.',
    'Important crop safety: keep every word, formula, and important drawing inside the central safe area; leave the outer 12 percent of the top and bottom mostly empty.',
    'Use sparse, large, legible English text. Do not add dense paragraphs.',
    'Do not include UI chrome, screenshots, SVG-looking icons, watermarks, or tiny unreadable text.',
    `Notebook title: "${notebook.title}".`,
    `Slide ${order + 1} of ${notebook.slides.length}.`,
    `Slide title text must be: "${title}".`,
    `Teaching intent: ${intent}`,
    `Suggested layout: ${layout}.`,
    'Include one small "MAT102" label in a corner.',
    'If formulas appear, keep them simple and exact. Prefer ASCII-style math where possible.',
  ].join('\n');
}

async function generateOpenAiImage(api, prompt) {
  const response = await fetch(`${api.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${api.apiKey}`,
    },
    body: JSON.stringify({
      model: api.model,
      prompt,
      n: 1,
      size: '1536x1024',
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI image generation failed (${response.status}): ${text.slice(0, 1000)}`);
  }
  const data = JSON.parse(text);
  const image = data.data?.[0];
  if (!image?.b64_json && !image?.url) {
    throw new Error(`OpenAI image response missing image data: ${text.slice(0, 1000)}`);
  }
  if (image.b64_json) return Buffer.from(image.b64_json, 'base64');
  const imageResponse = await fetch(image.url);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image URL (${imageResponse.status})`);
  }
  return Buffer.from(await imageResponse.arrayBuffer());
}

async function withRetry(task, label, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.warn(`[retry] ${label} attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
  throw lastError;
}

async function runLimited(items, concurrency, worker) {
  const queue = [...items];
  let completed = 0;
  async function runWorker(workerIndex) {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item, workerIndex);
      completed += 1;
      console.log(`[progress] ${completed}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, index) => runWorker(index)));
}

async function generateImages(selectedNotebooks, options) {
  const api = getApiConfig(options);
  const jobs = [];
  for (const notebook of selectedNotebooks) {
    fs.mkdirSync(outputDirFor(notebook), { recursive: true });
    for (const [order, slide] of notebook.slides.entries()) {
      const out = slidePath(notebook, order);
      if (!options.forceImages && fs.existsSync(out)) continue;
      jobs.push({ notebook, slide, order });
    }
  }
  console.log(
    `[images] jobs=${jobs.length}, concurrency=${options.concurrency}, model=${api.model}`,
  );
  await runLimited(jobs, options.concurrency, async ({ notebook, slide, order }) => {
    const label = `${notebook.slug} slide-${pageLabel(order)}`;
    console.log(`[image] ${label}`);
    const prompt = buildImagePrompt(notebook, slide, order);
    const rawBuffer = await withRetry(() => generateOpenAiImage(api, prompt), label);
    if (options.keepRaw) {
      const rawPath = rawSlidePath(notebook, order);
      fs.writeFileSync(rawPath, rawBuffer);
    }
    await sharp(rawBuffer)
      .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'cover', position: 'center' })
      .png()
      .toFile(slidePath(notebook, order));
  });
}

function toCanvasRect([x, y, width, height]) {
  return {
    left: (x / SOURCE_WIDTH) * CANVAS_WIDTH,
    top: (y / SOURCE_HEIGHT) * CANVAS_HEIGHT,
    width: (width / SOURCE_WIDTH) * CANVAS_WIDTH,
    height: (height / SOURCE_HEIGHT) * CANVAS_HEIGHT,
  };
}

function regionsFor(notebook, order) {
  const page = pageLabel(order);
  const specs = [
    ['title', 'Title and lesson position', [45, 80, 1510, 130]],
    ['main-idea', 'Main concept region', [55, 220, 690, 470]],
    ['worked-board', 'Worked board or visual example', [815, 220, 690, 470]],
    ['takeaway', 'Bottom takeaway and next step', [70, 735, 1460, 105]],
  ];
  return specs.map(([semanticId, label, sourceRect]) => ({
    id: `${notebook.id}-s${page}-${semanticId}`,
    semanticId,
    label,
    sourceRect,
    canvasRect: toCanvasRect(sourceRect),
  }));
}

function imageElement(notebook, order) {
  const page = pageLabel(order);
  return {
    id: `${notebook.id}-image-${page}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${publicDirFor(notebook)}/slide-${page}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.canvasRect.left,
    top: region.canvasRect.top,
    width: region.canvasRect.width,
    height: region.canvasRect.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    outline: { color: '#ffffff', width: 0, style: 'solid' },
    opacity: 0,
  };
}

function semanticHitMapFor(notebook, order) {
  return {
    version: 1,
    sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    regions: regionsFor(notebook, order),
  };
}

function actionsFor(notebook, order) {
  const [title, intent] = notebook.slides[order];
  const regions = regionsFor(notebook, order);
  const speeches = [
    `This slide is "${title}". First, locate where it sits in the lesson arc for ${notebook.title}.`,
    intent,
    `Use the worked board or visual example to connect the definition to a student-facing reasoning step. Do not jump straight to the conclusion.`,
    order === notebook.slides.length - 1
      ? 'Close the notebook by naming the main method, the common mistakes to avoid, and the question that naturally leads to the next lesson.'
      : 'Use the bottom takeaway to state what students should carry into the next slide.',
  ];
  return regions.flatMap((region, index) => [
    {
      id: `${notebook.id}-spotlight-s${pageLabel(order)}-${String(index + 1).padStart(2, '0')}`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `Focus broad parent region: ${region.label}`,
      dimOpacity: 0.76,
    },
    {
      id: `${notebook.id}-speech-s${pageLabel(order)}-${String(index + 1).padStart(2, '0')}`,
      type: 'speech',
      title: `Narration: ${region.label}`,
      text: speeches[index],
    },
  ]);
}

function canvasFor(notebook, order) {
  const hitMap = semanticHitMapFor(notebook, order);
  return {
    id: `${notebook.id}-canvas-${pageLabel(order)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: [themeColors.teal, themeColors.blue, themeColors.orange, themeColors.ink],
      fontColor: themeColors.ink,
      fontName: 'Inter',
      outline: { color: themeColors.teal, width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [
      imageElement(notebook, order),
      ...hitMap.regions.map((region) => hotspotElement(region)),
    ],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

async function renderMetadataAssets(selectedNotebooks) {
  for (const notebook of selectedNotebooks) {
    const dir = outputDirFor(notebook);
    fs.mkdirSync(dir, { recursive: true });
    const missing = notebook.slides
      .map((_, order) => slidePath(notebook, order))
      .filter((file) => !fs.existsSync(file));
    if (missing.length > 0) {
      console.warn(
        `[metadata] ${notebook.slug}: ${missing.length} slides missing; metadata still written`,
      );
    }

    const hitMap = {
      notebookId: notebook.id,
      source: 'mat102-queue-full-slide-imagegen',
      sourcePdf: notebook.sourcePdf,
      slides: notebook.slides.map((slide, order) => ({
        order,
        title: slide[0],
        teachingIntent: slide[1],
        image: `${publicDirFor(notebook)}/slide-${pageLabel(order)}.png`,
        hitMap: semanticHitMapFor(notebook, order),
      })),
    };
    fs.writeFileSync(path.join(dir, 'semantic-hit-map.json'), JSON.stringify(hitMap, null, 2));
    fs.writeFileSync(
      path.join(dir, 'notebook-outline.json'),
      JSON.stringify({ ...notebook, outputDir: dir, publicDir: publicDirFor(notebook) }, null, 2),
    );

    if (missing.length === 0) {
      await renderContactSheet(notebook);
    }
  }
}

async function renderContactSheet(notebook) {
  const dir = outputDirFor(notebook);
  const columns = 3;
  const thumbWidth = 400;
  const thumbHeight = 225;
  const labelHeight = 42;
  const cellHeight = thumbHeight + labelHeight;
  const composites = [];
  for (const [index, slide] of notebook.slides.entries()) {
    const file = slidePath(notebook, index);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="16" y="27" fill="#ffffff" font-size="17" font-family="Arial">${index + 1}. ${esc(slide[0])}</text></svg>`;
    const thumb = await sharp(file)
      .resize(thumbWidth, thumbHeight)
      .extend({ top: 0, bottom: labelHeight, left: 0, right: 0, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: (index % columns) * thumbWidth,
      top: Math.floor(index / columns) * cellHeight,
    });
  }
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(notebook.slides.length / columns) * cellHeight,
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(dir, 'contact-sheet.png'));
}

async function findMat102Course(prisma, explicitCourseId) {
  if (explicitCourseId) {
    const course = await prisma.course.findUnique({ where: { id: explicitCourseId } });
    if (!course) throw new Error(`Course not found: ${explicitCourseId}`);
    return course;
  }
  const courses = await prisma.course.findMany({
    where: {
      OR: [
        { name: { contains: 'MAT102', mode: 'insensitive' } },
        { courseCode: { contains: 'MAT102', mode: 'insensitive' } },
        { courseCode: { contains: 'MAT 102', mode: 'insensitive' } },
        { description: { contains: 'MAT102', mode: 'insensitive' } },
        { tags: { has: 'MAT102' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
  if (courses.length === 0) {
    throw new Error('No MAT102 course found. Re-run with --course-id=<id>.');
  }
  const exact =
    courses.find((course) => /^MAT\s*102$/i.test(course.courseCode || '')) ||
    courses.find((course) => /MAT102/i.test(course.name || '')) ||
    courses[0];
  console.log(`[db] Using course ${exact.id}: ${exact.name}`);
  return exact;
}

async function seedDb(selectedNotebooks, options) {
  if (options.skipDb || !options.seedDb) return;
  const prisma = new PrismaClient();
  try {
    const course = await findMat102Course(prisma, options.courseId);
    const now = new Date();
    for (const notebook of selectedNotebooks) {
      await prisma.notebook.upsert({
        where: { id: notebook.id },
        update: {
          ownerId: course.ownerId,
          courseId: course.id,
          name: notebook.title,
          description: notebook.description,
          tags: notebook.tags,
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'en-US',
          style: 'imagegen-full-slide-semantic-hit-map',
          updatedAt: now,
        },
        create: {
          id: notebook.id,
          ownerId: course.ownerId,
          courseId: course.id,
          name: notebook.title,
          description: notebook.description,
          tags: notebook.tags,
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'en-US',
          style: 'imagegen-full-slide-semantic-hit-map',
          createdAt: now,
          updatedAt: now,
        },
      });

      const scenes = notebook.slides.map((slide, order) => {
        const content = {
          type: 'slide',
          canvas: canvasFor(notebook, order),
          webRenderMode: 'slide',
          semanticHitMap: semanticHitMapFor(notebook, order),
        };
        return {
          id: `${notebook.id}-p${pageLabel(order)}`,
          notebookId: notebook.id,
          title: slide[0],
          type: 'slide',
          order,
          content,
          actions: actionsFor(notebook, order),
          whiteboard: null,
          createdAt: now,
          updatedAt: now,
        };
      });
      await prisma.$transaction([
        prisma.scene.deleteMany({ where: { notebookId: notebook.id } }),
        prisma.scene.createMany({ data: scenes }),
      ]);
      console.log(`[db] seeded ${notebook.id} scenes=${scenes.length}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function selectNotebooks(options) {
  if (!options.only) return notebooks;
  return notebooks.filter(
    (notebook) => options.only.has(notebook.slug) || options.only.has(notebook.id),
  );
}

async function main() {
  loadEnvLocal();
  const options = parseArgs(process.argv);
  const selectedNotebooks = selectNotebooks(options);
  if (selectedNotebooks.length === 0) throw new Error('No notebooks selected');
  console.log(`[notebooks] selected=${selectedNotebooks.length}`);
  if (options.generateImages) await generateImages(selectedNotebooks, options);
  await renderMetadataAssets(selectedNotebooks);
  await seedDb(selectedNotebooks, options);
  console.log('[done]');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
