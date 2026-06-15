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
      name: 'backtracking search',
      origins: ['(@template-origin try-catch ...)', '(@template-origin genrec ... try-catch)'],
      contract: [
        'Identify state, start, goal test, successor generation, failure result, and solution result.',
        'Use a solve/solve-list shape where a local try result returns immediately unless it is false, then continues with the remaining candidates.',
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
      origins: [
        '(@template-origin encapsulated Node (listof Edge) Edge genrec accumulator try-catch)',
      ],
      contract: [
        'Use local helpers for node/list-of-edge/edge templates; use genrec because generate-node/get-room creates the next node from the graph map.',
        'Use accumulator when carrying path/visited information to prevent cycles; use try-catch when failed branches should fall through to remaining edges.',
      ],
    },
    {
      name: 'graph worklist tail recursion',
      origins: [
        '(@template-origin encapsulated Node (listof NodeName) genrec accumulator)',
        '(@template-origin genrec Node (listof Node) Info (listof Info) accumulator)',
      ],
      contract: [
        'Use a primary worklist for remaining node names/nodes and visited to prevent repeated traversal.',
        'For paths or parallel facts, use tandem worklists and state the same-length/same-order invariant.',
      ],
    },
    {
      name: 'graph with abstract map expansion',
      origins: [
        '(@template-origin encapsulated Node (listof NodeName) genrec accumulator use-abstract-fn)',
      ],
      contract: [
        'Add use-abstract-fn when map/filter/fold is part of the main graph traversal step, such as generating next nodes or tandem path entries.',
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
      'For backtracking search questions, identify state, start, goal test, successor generation, failure result, and solution result.',
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

const COURSE_PACKS: CoursePack[] = [CPSC107_PACK];

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
