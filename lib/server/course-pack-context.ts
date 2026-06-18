export type CoursePackCapabilityLevel =
  | 'level_0_source_rag'
  | 'level_1_concept_memory'
  | 'level_2_prior_contract'
  | 'level_3_artifact_specs'
  | 'level_4_derivation_rules';

type NotebookIdentity = {
  id: string;
  name: string;
};

type CourseIdentity = {
  id?: string;
  name?: string;
  courseCode?: string;
  tags?: string[];
};

type CoursePackUnit = {
  order: number;
  title: string;
  learned: string[];
  tools: string[];
};

type CoursePackArtifactSpec = {
  name: string;
  contract: string[];
};

type CoursePackTemplateContract = {
  name: string;
  origins: string[];
  contract: string[];
};

type CoursePack = {
  id: string;
  courseCode: string;
  title: string;
  capabilityLevel: CoursePackCapabilityLevel;
  matcher: (args: { course?: CourseIdentity; notebook: NotebookIdentity }) => boolean;
  units: CoursePackUnit[];
  globalContract: string[];
  highLevelToolBoundary: string[];
  notAllowedUnlessExplicit: string[];
  artifactSpecs: CoursePackArtifactSpec[];
  templateContracts: CoursePackTemplateContract[];
  derivationRules: string[];
  unitContracts?: Record<number, string[]>;
};

export type CoursePackPromptContext = {
  prompt: string;
  metadata: {
    matched: boolean;
    packId?: string;
    courseCode?: string;
    capabilityLevel?: CoursePackCapabilityLevel;
    currentUnitOrder?: number;
    priorUnitOrders?: number[];
    learnedToolCount?: number;
    futureToolCount?: number;
  };
};

function compactLines(lines: string[], maxLines: number): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

function inferNotebookOrder(notebook: NotebookIdentity): number | null {
  const source = `${notebook.id} ${notebook.name}`;
  const explicit = source.match(/(?:^|[^0-9])0?([1-9]|1[0-9])\s*[-_:]/);
  if (explicit) return Number(explicit[1]);
  const queue = source.match(/queue-[a-z0-9]+-0?([1-9]|1[0-9])(?:-|$)/i);
  if (queue) return Number(queue[1]);
  return null;
}

function identityText(course: CourseIdentity | undefined, notebook: NotebookIdentity): string {
  return [course?.courseCode, course?.name, notebook.id, notebook.name, ...(course?.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const CPSC107_PACK: CoursePack = {
  id: 'cpsc107-course-pack-v1',
  courseCode: 'CPSC107',
  title: 'CPSC107 course semantics pack',
  capabilityLevel: 'level_4_derivation_rules',
  matcher: ({ course, notebook }) =>
    /\bcpsc\s*107\b|cpsc107|queue-cpsc107/i.test(identityText(course, notebook)),
  units: [
    {
      order: 1,
      title: 'Racket basics',
      learned: ['DrRacket prefix syntax', 'primitive expressions', 'evaluation order', 'if'],
      tools: [
        'prefix expressions',
        'primitive operators shown in source',
        'Boolean/String/Image primitives shown in source',
        'if',
        'cond basics',
      ],
    },
    {
      order: 2,
      title: 'HTDF/HTDD',
      learned: ['HtDF recipe', 'HtDD recipe', 'one-of data', 'template rules'],
      tools: [
        '@htdf',
        '@signature',
        'purpose comment',
        'check-expect',
        'commented-out stub',
        '@template-origin',
        'HTDD template rules',
        'one-of cond template',
      ],
    },
    {
      order: 3,
      title: 'Reference and self-reference',
      learned: ['reference fields', 'self-reference', 'list templates'],
      tools: [
        'define-struct data selectors/constructors from source',
        'empty?',
        'first',
        'rest',
        'cons',
        'ListOf structural template',
        'helper calls from reference fields',
      ],
    },
    {
      order: 4,
      title: 'Recursive structures and BST',
      learned: ['structural recursion', 'binary search tree templates'],
      tools: [
        'structural recursion over lists and trees',
        'BST invariant case split',
        'recursive result combination',
      ],
    },
    {
      order: 5,
      title: 'Trees and mutual reference',
      learned: ['tree/list helper pairs', 'mutual-reference templates'],
      tools: [
        'mutual-reference helper pairs',
        'node/list template pairing',
        'append when combining child results if source/template supports it',
      ],
    },
    {
      order: 6,
      title: 'Two one-of and local',
      learned: ['two one-of table', 'local scope', 'encapsulated helpers'],
      tools: [
        '2-one-of cross-product table',
        'local',
        'closure/lifting reasoning',
        'encapsulated template-origin',
        'try-catch local result pattern',
      ],
    },
    {
      order: 7,
      title: 'Abstract functions',
      learned: ['filter', 'map', 'build-list', 'foldr', 'foldl', 'lambda/named helper'],
      tools: ['filter', 'map', 'build-list', 'foldr', 'foldl', 'lambda', 'named helper'],
    },
    {
      order: 8,
      title: 'Search',
      learned: ['generative recursion', 'state/goal/successor', 'backtracking'],
      tools: [
        'generative recursion',
        'search state',
        'goal test',
        'successor function',
        'backtracking',
        'visited set/list when source introduces it',
      ],
    },
    {
      order: 9,
      title: 'Tail recursion and accumulator',
      learned: ['accumulator meaning', 'initial accumulator value', 'worklist traversal'],
      tools: [
        'accumulator parameter',
        'tail position recursion',
        'worklist',
        'visited accumulator',
      ],
    },
  ],
  globalContract: [
    'Treat the visible problem statement, starter code, and course pack as acceptance criteria.',
    'Do not give only a generally correct Racket solution; give a solution that follows this course recipe and current unit boundary.',
    'Function bodies should be justified by data definition, signature, purpose, examples/check-expect, and template.',
    'If required input such as a data definition is missing, ask for it instead of inventing a template-origin.',
  ],
  highLevelToolBoundary: [
    'Core recipe tools: define, cond, check-expect, local, list recursion, struct selectors/constructors when introduced by the data definition.',
    'High-level abstract functions are only the ones introduced by this course pack or explicitly present in the problem/source.',
    'By unit 7+, the learned high-level abstractions are filter, map, build-list, foldr, and foldl.',
  ],
  notAllowedUnlessExplicit: [
    'apply',
    'match',
    'for/list',
    'for/fold',
    'mutation/set!',
    'hash tables',
    'arbitrary library functions not present in the source/problem',
  ],
  artifactSpecs: [
    {
      name: 'HtDF design',
      contract: [
        'Use real metadata forms such as (@htdf name), (@signature ...), and (@template-origin ...).',
        'Purpose is a normal comment, not an invented metadata tag.',
        'check-expect is a real expression, not an invented @check-expect tag.',
        'The usual order is htdf, signature, purpose, tests, commented-out stub, template-origin, function definition.',
      ],
    },
    {
      name: 'HtDD/template',
      contract: [
        'A data definition should include type comment, interpretation, examples, template, and template rules when asked.',
        'A function template comes from the data definition rules, not from the problem topic alone.',
        'Do not guess @template-origin without seeing or deriving the data-definition rule.',
      ],
    },
    {
      name: 'local helper boundary',
      contract: [
        'When local is used only to hide short helper definitions, public HtDF artifacts stay with the public top-level function.',
        'Do not automatically add encapsulated just because a local helper/lambda appears inside an abstract function solution.',
        'Use encapsulated when the problem/source says to use an encapsulated template, or when mutually recursive data templates are intentionally refactored into one public function.',
        'Inside local, use local define forms and brief accumulator/scope comments.',
        'If the problem explicitly requires a helper to have a complete HtDF design, make that helper a separate top-level function.',
      ],
    },
  ],
  templateContracts: [
    {
      name: 'atomic non-distinct',
      origins: [
        '(@template-origin Number)',
        '(@template-origin String)',
        '(@template-origin Boolean)',
      ],
      contract: [
        'Use the parameter directly; there are no selectors, alternatives, or recursive calls.',
        'Choose the actual consumed type from the signature/data definition, not the problem topic.',
      ],
    },
    {
      name: 'one-of enumeration',
      origins: ['(@template-origin one-of)'],
      contract: [
        'Enumeration cases are all atomic-distinct values such as "A", "B", "C" or 0, 1, 2.',
        'Use one cond question per listed value; normal enumerations should not hide cases behind else.',
      ],
    },
    {
      name: 'one-of itemization',
      origins: ['(@template-origin one-of)'],
      contract: [
        'Itemization cases may mix atomic-distinct, atomic-non-distinct ranges, and compound alternatives.',
        'Each cond question must identify the alternative shape, such as false?, range checks, or a structure predicate.',
      ],
    },
    {
      name: 'compound/reference',
      origins: ['(@template-origin Gift)', '(@template-origin Package)'],
      contract: [
        'Use selectors for every field in the compound value.',
        'If a field type is another user-defined data definition, call the corresponding helper/template on that field.',
      ],
    },
    {
      name: 'self-reference/list',
      origins: ['(@template-origin ListOfX)', '(@template-origin (listof X))'],
      contract: [
        'Use empty and cons cases; the rest field gives the recursive call.',
        'The recursive result must be combined according to the output type and purpose.',
      ],
    },
    {
      name: 'mutual-reference helper pair',
      origins: ['(@template-origin Node ListOfNode)', '(@template-origin Course ListOfCourse)'],
      contract: [
        'Use paired helpers for the single item and the list-of items.',
        'In template examples, prefer course naming such as fn-for--node and fn-for--lon; in concrete designs, helper names often use public-name--data suffixes.',
      ],
    },
    {
      name: 'encapsulated mutual template',
      origins: [
        '(@template-origin Course ListOfCourse encapsulated)',
        '(@template-origin encapsulated Playlist ListOfSong Song)',
      ],
      contract: [
        'A single public function exposes the task; local helpers handle the component templates.',
        'Local helper names should show the hidden data boundary, such as fn-for--course/fn-for--loc or public-name--course/public-name--loc.',
        'Do not treat every local helper as encapsulated; abstract-function local predicates still use use-abstract-fn origins.',
      ],
    },
    {
      name: 'structural try-catch encapsulated template',
      origins: ['(@template-origin Person ListOfPerson try-catch encapsulated)'],
      contract: [
        'Use this when a structural mutual-reference search returns either a real answer or false, and the list helper must try one child before falling through to the rest.',
        'This is not exception handling; try is a local binding that stores the first recursive attempt result.',
        'The single-item helper searches the item first, then delegates to the list-of helper; the list-of helper returns false on empty and otherwise uses local try / false? to decide whether to continue.',
        'Use encapsulated because the public function hides the Person/ListOfPerson helper pair inside local.',
      ],
    },
    {
      name: 'two one-of',
      origins: ['(@template-origin 2-one-of)'],
      contract: [
        'Build the cross-product table from both one-of type comments before writing cond.',
        'Merged branches must be justified by cells with the same result/logic.',
      ],
    },
    {
      name: 'abstract function',
      origins: [
        '(@template-origin use-abstract-fn)',
        '(@template-origin use-abstract-fn fn-composition)',
      ],
      contract: [
        'Use filter/map/build-list/foldr/foldl as the main template instead of hand-written recursion when the unit/problem requires abstract functions.',
        'If multiple abstract functions are composed, use fn-composition; helper templates such as Natural belong to the helper, not the main abstract-function design.',
      ],
    },
    {
      name: 'generative recursion',
      origins: ['(@template-origin genrec)'],
      contract: [
        'Recursive calls are on generated next states/problems, not direct structural subparts.',
        'Always include a termination argument with Base Case, reduction step, and argument explaining why repeated reduction reaches the base case.',
      ],
    },
    {
      name: 'try-catch local result pattern',
      origins: ['(@template-origin ... try-catch)', '(@template-origin genrec ... try-catch)'],
      contract: [
        'Use this only when a candidate branch can fail with false and the list helper should continue with the remaining candidates.',
        'Do not default to a generic state-search skeleton; follow the local helper names provided by the source template, such as fn-for-node and fn-for-lonn.',
        'Use local try to store one recursive attempt result; return try when it is not false, otherwise recur on the rest of the list.',
      ],
    },
    {
      name: 'accumulator/worklist',
      origins: [
        '(@template-origin (listof X) accumulator)',
        '(@template-origin genrec Node (listof Node) accumulator)',
      ],
      contract: [
        'State each accumulator meaning, initial value, and update rule.',
        'Worklist accumulators represent remaining work; tandem worklists must be named and kept aligned.',
      ],
    },
    {
      name: 'graph search no tail recursion',
      origins: ['(@template-origin genrec arb-tree accumulator)'],
      contract: [
        'Use the source normal-recursion template fn-for-graph/nr with local fn-for-node and fn-for-lonn.',
        'Use generate-node to turn a node number into a Node; stop cycles with visited/path accumulator when needed.',
        'Do not rename local functions or existing parameters when the problem says the template is provided.',
      ],
    },
    {
      name: 'graph worklist tail recursion',
      origins: ['(@template-origin genrec arb-tree accumulator)'],
      contract: [
        'Use the source tail-recursion template fn-for-graph/tr with nn-wl as the primary node-number worklist.',
        'Name worklists with the -wl suffix, such as nn-wl, state-wl, or path-wl.',
        'For paths or parallel facts, use tandem worklists and state the same-length/same-order invariant.',
        'Do not rename local functions or existing parameters when the problem says the template is provided; add parameters only as allowed.',
      ],
    },
    {
      name: 'graph with abstract map expansion',
      origins: ['(@template-origin genrec arb-tree accumulator use-abstract-fn)'],
      contract: [
        'Add use-abstract-fn when map/filter/fold is part of the main graph traversal step, such as generating tandem path-wl entries.',
        'Keep worklist naming aligned with the source template, such as nn-wl, state-wl, and path-wl.',
        'Do not add use-abstract-fn merely because a provided primitive like get-room internally uses map.',
      ],
    },
  ],
  derivationRules: [
    '@template-origin should name the main template strategy actually used, not merely the input type.',
    'one-of data splits into enumeration and itemization: enumerations are all atomic-distinct cases; itemizations may mix distinct values, ranges, and compound alternatives.',
    'one-of data -> cond with one question per alternative; template-origin includes one-of.',
    'compound data -> selectors for fields; if a field refers to another data definition, call the corresponding helper/template.',
    'self-reference -> recursive call on the self-referential field; template-origin includes self-ref.',
    'mutual-reference -> paired helpers for mutually referring data definitions; use course-style hidden helper naming such as fn-for--node/fn-for--lon or public-name--node/public-name--lon when helpers are local/private.',
    'encapsulated -> use only when the problem/source provides or requests an encapsulated template, especially mutual-reference helpers hidden behind one public entry.',
    'accumulator design -> state accumulator meaning, initial value, and update rule; wrapper initializes the accumulator.',
    'graph traversal -> include genrec when the next node is generated by a map/get-room/generate-node function; add visited/path/worklist accumulators to prevent cycles.',
  ],
  unitContracts: {
    1: [
      'Explain Racket syntax and evaluation order rather than jumping to advanced program design.',
      'Use DrRacket prefix syntax; do not rewrite answers in Python/JavaScript notation.',
      'When evaluating expressions, simplify one needed subexpression at a time and respect branch selection.',
    ],
    2: [
      'For HtDF/HtDD, preserve recipe order and distinguish real metadata forms from comments.',
      'Template-origin must come from the data definition rule; do not guess it from the topic alone.',
      'Before unit 6, do not introduce local or encapsulated helper patterns unless the problem/source explicitly gives them.',
    ],
    3: [
      'Derive helper calls from reference fields and recursive calls from self-reference/list rest.',
      'For ListOf data, include the empty case and the cons case; do not use length/list-ref as a structural recursion substitute unless source/problem explicitly allows it.',
    ],
    4: [
      'For BST questions, use the BST invariant to choose left/right branches rather than searching both sides.',
      'For structural recursion, explain what the current element/node contributes and what the recursive result represents.',
    ],
    5: [
      'For tree and mutual-reference questions, use paired helpers when the data definitions require them.',
      'Do not flatten mutual-reference designs into one opaque function when the course template expects helper pairing.',
    ],
    6: [
      'For local questions, distinguish scope, closure, lifting, and encapsulation.',
      'Do not place public HtDF tags/tests inside local helper definitions.',
      'Use encapsulated in @template-origin only for the course encapsulated-template pattern, not for every local helper.',
    ],
    7: [
      'Default abstract-function boundary is filter, map, build-list, foldr, foldl, named helper, and lambda.',
      'In unit 7, when a problem offers a built-in-functions solution or an ordinary recursive template solution, prefer the learned abstract-functions solution if it can be written with filter/map/build-list/foldr/foldl/lambda/named helper.',
      'If the abstract version would require a not-yet-allowed tool, say so and use the ordinary template fallback.',
      'For abstract-function solutions, @template-origin is use-abstract-fn or use-abstract-fn fn-composition; do not write Natural/ListOf just because a helper or input uses that data template.',
      'Do not use apply as a learned abstraction unless the problem/source explicitly introduces it.',
    ],
    8: [
      'For try-catch search questions, identify state, start, goal test, successor generation, failure result, and solution result.',
      'Do not collapse search into generic generative recursion: search needs the try-catch/backtracking step when failed branches should fall through to remaining candidates.',
      'Generative recursion is still separate: recursive calls are on generated next problems, not direct structural subparts.',
    ],
    9: [
      'For accumulator answers, explain what the accumulator represents, its initial value, and how each recursive call updates it.',
      'A local accumulator helper may be appropriate, but HtDF artifacts for the public function remain outside local.',
      'Use accumulator in @template-origin for the main accumulator/worklist strategy; add encapsulated only when the source/problem is using an encapsulated template as well.',
      'For tail-recursive graph traversal, name the primary worklist and any tandem worklists, and state their alignment invariant.',
    ],
  },
};

const CSC108_PACK: CoursePack = {
  id: 'csc108-python-course-pack-v1',
  courseCode: 'CSC108',
  title: 'CSC108 Python function-design course pack',
  capabilityLevel: 'level_3_artifact_specs',
  matcher: ({ course, notebook }) =>
    /\bcsc\s*108\b|csc108|queue-csc108|introduction to computer programming/i.test(
      identityText(course, notebook),
    ),
  units: [
    {
      order: 1,
      title: 'Python basics',
      learned: ['expressions', 'variables', 'strings', 'basic operators'],
      tools: ['arithmetic operators', 'string operations', 'variables', 'type conversion basics'],
    },
    {
      order: 2,
      title: 'Functions, docstrings, and control flow',
      learned: [
        'function header',
        'type annotations',
        'docstring contract',
        'return',
        'if/elif/else',
      ],
      tools: ['def', 'type annotations', 'triple-quoted docstring', 'doctest examples', 'return'],
    },
    {
      order: 3,
      title: 'Loops',
      learned: ['range', 'for loops', 'while loops', 'nested loops', 'accumulators'],
      tools: ['range', 'for', 'while', 'accumulator variables', 'nested loop tracing'],
    },
    {
      order: 4,
      title: 'Lists',
      learned: ['indexing', 'slicing', 'mutation', 'aliasing', 'list methods'],
      tools: ['list indexing', 'list slicing', 'append', 'mutation checks', 'aliasing reasoning'],
    },
    {
      order: 5,
      title: 'Input and output',
      learned: ['input', 'print', 'formatted strings', 'type conversion'],
      tools: ['input', 'print', 'f-strings', 'int/float/str conversion'],
    },
    {
      order: 6,
      title: 'File IO',
      learned: ['TextIO', 'open', 'read', 'readline', 'readlines', 'write', 'with'],
      tools: ['open', 'with', 'read', 'readline', 'readlines', 'for line in file', 'write'],
    },
    {
      order: 7,
      title: 'Dictionaries',
      learned: ['keys', 'values', 'items', 'dictionary traversal', 'counting patterns'],
      tools: [
        'dict lookup',
        'dict assignment',
        'in',
        'for key in dict',
        'items',
        'accumulator dict',
      ],
    },
    {
      order: 8,
      title: 'CSV and table files',
      learned: ['TextIO tables', 'CSV rows', 'headers', 'nested list/dict records'],
      tools: ['csv reader/writer when source allows it', 'split lines', 'row accumulation'],
    },
    {
      order: 9,
      title: 'Regex',
      learned: ['DFA intuition', 'regular expressions', 'groups', 'Python re'],
      tools: [
        're.search',
        're.fullmatch when whole-string match is required',
        'groups',
        'raw strings',
      ],
    },
    {
      order: 10,
      title: 'Running time',
      learned: ['binary search', 'sorting', 'Big-O', 'nested-loop counting'],
      tools: [
        'step counting',
        'loop nesting analysis',
        'binary search reasoning',
        'Big-O comparison',
      ],
    },
    {
      order: 11,
      title: 'Classes',
      learned: ['objects', 'attributes', 'methods', 'encapsulation'],
      tools: ['class', '__init__', 'self', 'instance attributes', 'method calls'],
    },
  ],
  globalContract: [
    'Treat the visible problem statement, starter code, sample I/O, public tests, and course pack as acceptance criteria.',
    'For function-design questions, preserve the provided function header, type annotations, parameter names, and starter docstring before writing the implementation.',
    'Use only tools introduced by the current or prior unit unless the visible problem explicitly requires more.',
    'Functions normally return results; do not print inside a function unless the problem asks for printed output.',
  ],
  highLevelToolBoundary: [
    'Core Python tools are def, annotations, docstrings, conditionals, loops, lists, dictionaries, files, regex, and classes as introduced by unit order.',
    'Prefer plain loops and accumulators in early units; only use higher-level helpers when they are already introduced or visible in the starter/source.',
    'Use the starter imports exactly when a problem provides them, especially re for regex and csv/TextIO for file questions.',
  ],
  notAllowedUnlessExplicit: [
    'pandas',
    'numpy',
    'dataclasses',
    'pathlib',
    'lambda',
    'list/dict comprehensions in early units',
    'try/except for ordinary control flow',
    'printing debug output in submitted functions',
  ],
  artifactSpecs: [
    {
      name: 'CSC108 Python function answer',
      contract: [
        'Start the code block with the exact provided function header when one is given.',
        'Keep the starter docstring as the first statement inside the function body; do not replace it with a short summary.',
        'Put implementation statements after the docstring and return the requested value.',
        'Do not place tests, sample calls, or print debugging inside the function body.',
      ],
    },
  ],
  templateContracts: [
    {
      name: 'function design with docstring contract',
      origins: ['Python def starter', 'CSC108 function design', 'starter docstring'],
      contract: [
        'Solution shape is exact header, exact starter docstring, implementation, then return result.',
        'The docstring is part of the contract: it states purpose, preconditions, and examples; explain it before changing code.',
        'When a starter docstring exists, preserve its wording and examples unless the visible problem explicitly asks to write a new docstring.',
      ],
    },
    {
      name: 'example-driven dry run',
      origins: ['sampleIO', 'public tests', 'doctest examples'],
      contract: [
        'Use visible examples to verify behavior, but keep tests outside the submitted function body.',
        'Cover at least one ordinary case and one boundary case when explaining the docstring or examples.',
      ],
    },
    {
      name: 'dictionary update/counting',
      origins: ['dict traversal', 'merge dictionaries', 'count keys'],
      contract: [
        'Create a fresh dictionary when the problem says not to mutate inputs.',
        'Explain whether assignment adds a new key or overwrites an existing key.',
      ],
    },
    {
      name: 'regex extraction',
      origins: ['re.search', 'regular expression', 'pattern matching'],
      contract: [
        'Translate each rule into one regex segment before presenting the full pattern.',
        'State whether the task needs substring search, full-string match, or boundary checks.',
        'Use raw string patterns and preserve starter imports such as import re.',
      ],
    },
  ],
  derivationRules: [
    'Choose the function-design template first for code problems, then specialize with the chapter tool such as loop, list, dict, file, regex, or class.',
    'If starter code provides a docstring, treat it as source-of-truth specification before public tests and before generic model style.',
    'If the student has a failed attempt, compare their code against the template order: header, docstring, implementation, return.',
    'When using regex, derive the pattern from named pieces such as name, domain, and suffix instead of giving a pattern without explanation.',
  ],
  unitContracts: {
    2: [
      'Function design answers must discuss header, type annotations, docstring contract/examples, body, and return.',
      'Do not use loops or list-heavy solutions unless the problem or prior unit has introduced them.',
    ],
    7: [
      'Dictionary answers should identify key cases: only in first dict, only in second dict, in both dicts, and no input mutation when required.',
    ],
    9: [
      'Regex answers should explain search vs fullmatch, raw string escaping, grouping, and boundary/longest-match consequences when relevant.',
    ],
  },
};

const COURSE_PACKS: CoursePack[] = [CSC108_PACK, CPSC107_PACK];

function formatList(title: string, lines: string[], maxLines: number): string[] {
  const compact = compactLines(lines, maxLines);
  if (compact.length === 0) return [];
  return [title, ...compact.map((line) => `- ${line}`)];
}

function formatArtifactSpecs(specs: CoursePackArtifactSpec[]): string[] {
  if (specs.length === 0) return [];
  const lines = ['artifact_specs:'];
  for (const spec of specs.slice(0, 4)) {
    lines.push(`- ${spec.name}: ${spec.contract.join(' ')}`);
  }
  return lines;
}

function formatTemplateContracts(contracts: CoursePackTemplateContract[]): string[] {
  if (contracts.length === 0) return [];
  const lines = ['template_contracts:'];
  for (const contract of contracts.slice(0, 12)) {
    lines.push(
      `- ${contract.name}: origins ${contract.origins.join(' | ')}. ${contract.contract.join(' ')}`,
    );
  }
  return lines;
}

function formatPriorUnits(
  pack: CoursePack,
  currentOrder: number | null,
): {
  currentUnit: CoursePackUnit | null;
  priorUnits: CoursePackUnit[];
  learnedUnits: CoursePackUnit[];
  futureUnits: CoursePackUnit[];
} {
  if (!currentOrder) {
    return {
      currentUnit: null,
      priorUnits: pack.units,
      learnedUnits: pack.units,
      futureUnits: [],
    };
  }
  return {
    currentUnit: pack.units.find((unit) => unit.order === currentOrder) || null,
    priorUnits: pack.units.filter((unit) => unit.order < currentOrder),
    learnedUnits: pack.units.filter((unit) => unit.order <= currentOrder),
    futureUnits: pack.units.filter((unit) => unit.order > currentOrder),
  };
}

function uniqueTools(units: CoursePackUnit[]): string[] {
  const seen = new Set<string>();
  const tools: string[] = [];
  for (const unit of units) {
    for (const tool of unit.tools) {
      if (seen.has(tool)) continue;
      seen.add(tool);
      tools.push(tool);
    }
  }
  return tools;
}

export function buildCoursePackPromptContext(args: {
  course?: CourseIdentity;
  notebook: NotebookIdentity;
}): CoursePackPromptContext {
  const pack = COURSE_PACKS.find((candidate) => candidate.matcher(args));
  if (!pack) {
    return {
      prompt: 'N/A',
      metadata: { matched: false },
    };
  }

  const currentUnitOrder = inferNotebookOrder(args.notebook);
  const { currentUnit, priorUnits, learnedUnits, futureUnits } = formatPriorUnits(
    pack,
    currentUnitOrder,
  );
  const currentUnitContracts = currentUnitOrder ? pack.unitContracts?.[currentUnitOrder] || [] : [];
  const priorUnitSummary = priorUnits.map(
    (unit) => `unit ${unit.order} ${unit.title}: ${unit.learned.join(', ')}`,
  );
  const learnedTools = uniqueTools(learnedUnits);
  const futureTools = uniqueTools(futureUnits);
  const futureToolBoundary = currentUnitOrder
    ? formatList('future_course_tools_not_yet_allowed_unless_explicit:', futureTools, 20)
    : [];

  const lines = [
    '<course_pack>',
    `status: matched`,
    `pack: ${pack.id}`,
    `course: ${pack.courseCode}`,
    `capability_level: ${pack.capabilityLevel}`,
    'usage:',
    '- Treat this block as exact course contract, not semantic search evidence.',
    '- Obey it before generic model knowledge or weak RAG matches.',
    '- If the problem/source explicitly gives a different rule, follow the visible problem/source.',
    '',
    currentUnit
      ? `current_unit: unit ${currentUnit.order} ${currentUnit.title} (${currentUnit.learned.join(', ')})`
      : 'current_unit: unknown; use full course pack conservatively',
    priorUnitSummary.length > 0 ? 'prior_knowledge_summary:' : '',
    ...priorUnitSummary.map((line) => `- ${line}`),
    '',
    ...formatList('learned_tools_by_current_unit:', learnedTools, 32),
    '',
    ...futureToolBoundary,
    futureToolBoundary.length > 0 ? '' : '',
    ...formatList('global_contract:', pack.globalContract, 6),
    '',
    ...formatList('allowed_tool_boundary:', pack.highLevelToolBoundary, 6),
    '',
    ...formatList('not_allowed_unless_explicit:', pack.notAllowedUnlessExplicit, 10),
    '',
    ...formatArtifactSpecs(pack.artifactSpecs),
    '',
    ...formatTemplateContracts(pack.templateContracts),
    '',
    ...formatList('derivation_rules:', pack.derivationRules, 8),
    '',
    ...formatList('current_unit_contract:', currentUnitContracts, 5),
    '</course_pack>',
  ].filter((line) => line !== '');

  return {
    prompt: lines.join('\n'),
    metadata: {
      matched: true,
      packId: pack.id,
      courseCode: pack.courseCode,
      capabilityLevel: pack.capabilityLevel,
      currentUnitOrder: currentUnitOrder || undefined,
      priorUnitOrders: priorUnits.map((unit) => unit.order),
      learnedToolCount: learnedTools.length,
      futureToolCount: futureTools.length,
    },
  };
}
