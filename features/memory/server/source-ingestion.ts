import type { MemoryWriteCandidate } from '@/lib/server/memory-write-router';
import type { MemoryLayerId, MemorySignalKind } from '@/features/memory/domain/layered-memory';

export type SourceIngestionAudience = 'creator' | 'learner';

export type SourceIngestionTargetType = 'course' | 'notebook';

export type SourceIngestionInput = {
  targetType?: SourceIngestionTargetType;
  targetId?: string;
  courseCode?: string;
  sourceTitle: string;
  sourceKind?: 'pdf' | 'markdown' | 'plain_text' | 'problem_bank' | 'other';
  sourceHash?: string;
  text: string;
  audience?: SourceIngestionAudience;
};

export type SourceMemoryArtifactKind =
  | 'knowledge_source'
  | 'course_template_memory'
  | 'notebook_template_memory'
  | 'learner_long_term_memory'
  | 'discarded_generic_concept';

export type SourceMemoryArtifact = {
  id: string;
  layer: MemoryLayerId;
  artifactKind: SourceMemoryArtifactKind;
  title: string;
  text: string;
  signalKinds: MemorySignalKind[];
  tags: string[];
  reasons: string[];
  staticInjectionCandidate: boolean;
  dynamicDiscoveryCandidate: boolean;
  writeCandidate?: MemoryWriteCandidate;
};

export type SourceMemoryIngestionPlan = {
  sourceTitle: string;
  sourceKind: NonNullable<SourceIngestionInput['sourceKind']>;
  targetType: SourceIngestionTargetType | null;
  targetId: string | null;
  audience: SourceIngestionAudience;
  courseCode: string | null;
  artifacts: SourceMemoryArtifact[];
  writeCandidates: MemoryWriteCandidate[];
  tokenPolicy: string[];
};

function compact(input: string, maxChars: number): string {
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function detectCourseCode(input: SourceIngestionInput): string | null {
  const explicit = input.courseCode?.trim();
  if (explicit) return explicit.toUpperCase().replace(/\s+/g, '');
  const haystack = `${input.sourceTitle}\n${input.text.slice(0, 4000)}`.toLowerCase();
  if (/\bcpsc\s*107\b|cpsc107|htdf|htdd|@signature|@template-origin/.test(haystack)) {
    return 'CPSC107';
  }
  if (/\bcsc\s*108\b|csc108|docstring|doctest|starter code/.test(haystack)) {
    return 'CSC108';
  }
  if (
    /\bcsc\s*148\b|csc148|representation invariant|representation invariants|\bri\b/.test(haystack)
  ) {
    return 'CSC148';
  }
  if (/\bmat\s*102\b|mat102/i.test(haystack)) {
    return 'MAT102';
  }
  if (/\bmat\s*136\b|mat136/i.test(haystack)) {
    return 'MAT136';
  }
  return null;
}

function shouldExtractTemplateForCourse(input: SourceIngestionInput, courseCode: string): boolean {
  return detectCourseCode(input) === courseCode;
}

function targetContentType(
  targetType: SourceIngestionTargetType | null,
): MemoryWriteCandidate['contentType'] {
  return targetType === 'notebook' ? 'notebook_requirement' : 'course_requirement';
}

function buildStudyMemoryCandidate(args: {
  input: SourceIngestionInput;
  title: string;
  text: string;
  kind: string;
  reason: string;
}): MemoryWriteCandidate | undefined {
  const targetType = args.input.targetType || null;
  const targetId = args.input.targetId?.trim() || null;
  if (!targetType || !targetId) return undefined;
  const isCreator = (args.input.audience || 'creator') === 'creator';
  return {
    trigger: 'source_import',
    contentType: isCreator ? targetContentType(targetType) : 'learning_pattern',
    targetType,
    targetId,
    privacy: isCreator ? 'public' : 'private',
    source: 'source-ingestion-plan',
    sourceRef: {
      sourceTitle: args.input.sourceTitle,
      sourceKind: args.input.sourceKind || 'plain_text',
      sourceHash: args.input.sourceHash || null,
      courseCode: detectCourseCode(args.input),
    },
    studyMemory: {
      targetType,
      targetId,
      scope: isCreator ? 'public' : 'private',
      kind: args.kind,
      title: args.title,
      text: args.text,
      reason: args.reason,
      sourceReferences: [
        {
          order: 1,
          title: args.input.sourceTitle,
          why: `Imported ${args.input.sourceKind || 'plain_text'} source for memory ingestion.`,
          sourceKind: args.input.sourceKind || 'plain_text',
          sourceHash: args.input.sourceHash || null,
          courseCode: detectCourseCode(args.input),
        },
      ],
    },
  };
}

function buildKnowledgeCandidate(input: SourceIngestionInput): MemoryWriteCandidate | undefined {
  if (!input.targetType || !input.targetId?.trim()) return undefined;
  return {
    trigger: 'source_import',
    contentType: input.sourceKind === 'problem_bank' ? 'problem_original' : 'source_original',
    targetType: input.targetType,
    targetId: input.targetId.trim(),
    title: input.sourceTitle,
    text: compact(input.text, 12000),
    source: 'source-ingestion-plan',
    sourceRef: {
      sourceTitle: input.sourceTitle,
      sourceKind: input.sourceKind || 'plain_text',
      sourceHash: input.sourceHash || null,
      courseCode: detectCourseCode(input),
    },
  };
}

function addTemplateArtifact(args: {
  artifacts: SourceMemoryArtifact[];
  input: SourceIngestionInput;
  id: string;
  title: string;
  text: string;
  tags: string[];
  reasons: string[];
  signalKinds: MemorySignalKind[];
  kind?: string;
}) {
  const targetType = args.input.targetType || null;
  const writeCandidate = buildStudyMemoryCandidate({
    input: args.input,
    title: args.title,
    text: args.text,
    kind: args.kind || 'course_template',
    reason: args.reasons.join(' '),
  });
  args.artifacts.push({
    id: args.id,
    layer: 'long_term',
    artifactKind: targetType === 'notebook' ? 'notebook_template_memory' : 'course_template_memory',
    title: args.title,
    text: args.text,
    signalKinds: args.signalKinds,
    tags: args.tags,
    reasons: args.reasons,
    staticInjectionCandidate: true,
    dynamicDiscoveryCandidate: true,
    writeCandidate,
  });
}

function extractCpsc107Template(input: SourceIngestionInput, artifacts: SourceMemoryArtifact[]) {
  if (!shouldExtractTemplateForCourse(input, 'CPSC107')) return;
  const text = input.text;
  if (!/@htdf|@signature|@template-origin|check-expect|htdf|htdd/i.test(text)) return;
  addTemplateArtifact({
    artifacts,
    input,
    id: 'template-cpsc107-htdf',
    title: 'CPSC107 HtDF/HtDD answer contract',
    text: [
      'Use this as long-term course memory, not as source RAG:',
      '- Answers should follow the course design recipe instead of jumping straight to a generic runnable body.',
      '- Preserve real HtDF/HtDD artifacts when they are part of the problem: @htdf, @signature, purpose, check-expect, commented stub, @template-origin, then definition.',
      '- Template-origin must be derived from the visible data definition or course-provided template; do not invent it from the topic name alone.',
      '- If local helpers are used only as implementation details, keep public HtDF artifacts on the public top-level function unless the prompt asks for a full helper design.',
    ].join('\n'),
    tags: ['CPSC107', 'HtDF', 'HtDD', 'Racket', 'template'],
    reasons: [
      'The source contains HtDF/HtDD markers that change the required answer shape.',
      'This is a course-local template contract, not a generic programming concept.',
    ],
    signalKinds: ['course_answer_contract', 'local_template'],
  });
}

function extractCsc108Template(input: SourceIngestionInput, artifacts: SourceMemoryArtifact[]) {
  if (!shouldExtractTemplateForCourse(input, 'CSC108')) return;
  const text = input.text;
  if (!/docstring|doctest|starter code|def\s+[A-Za-z_]\w*\s*\(/i.test(text)) return;
  addTemplateArtifact({
    artifacts,
    input,
    id: 'template-csc108-docstring',
    title: 'CSC108 function-design docstring contract',
    text: [
      'Use this as long-term course memory for Python function-design answers:',
      '- Preserve the provided function header, type annotations, parameter names, and starter docstring.',
      '- Treat the docstring as the contract: purpose, preconditions, examples/doctests, and return behavior.',
      '- Put implementation statements below the docstring and return the requested value.',
      '- Do not replace a starter docstring with a shorter generic summary unless the visible problem asks for a new docstring.',
    ].join('\n'),
    tags: ['CSC108', 'Python', 'docstring', 'function-design'],
    reasons: [
      'The source includes Python starter-code/docstring signals.',
      'The durable part is the answer contract; full examples remain in the knowledge index.',
    ],
    signalKinds: ['course_answer_contract', 'local_template'],
  });
}

function extractRepresentationInvariants(text: string): string[] {
  const lines = text.split('\n');
  const invariants: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (/representation invariants?/i.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    const bullet = line.match(/^\s*[-*]\s*(.+?)\s*$/);
    if (bullet?.[1]) {
      invariants.push(bullet[1].trim());
      continue;
    }
    if (line.trim() && !/^\s/.test(line)) break;
  }
  return invariants.slice(0, 8);
}

function extractClassAttributes(text: string): Array<{ name: string; type: string }> {
  const attributeTypeBlock = text.match(/#\s*Attribute types\s*\n([\s\S]*)/i)?.[1];
  const candidateText =
    attributeTypeBlock || text.replace(/("""|''')[\s\S]*?\1/g, '').replace(/#.*$/gm, '');
  const matches = Array.from(
    candidateText.matchAll(/^[ \t]{2,}([A-Za-z_]\w*)[ \t]*:[ \t]*([A-Za-z_][\w.[\], ]*)[ \t]*$/gm),
  );
  return matches
    .map((match) => ({ name: match[1], type: match[2].trim() }))
    .filter((item) => item.name !== 'self')
    .slice(0, 12);
}

function extractCsc148Template(input: SourceIngestionInput, artifacts: SourceMemoryArtifact[]) {
  if (!shouldExtractTemplateForCourse(input, 'CSC148')) return;
  const text = input.text;
  const classMatch = text.match(/\bclass\s+([A-Za-z_]\w*)\s*[:(]/);
  const invariants = extractRepresentationInvariants(text);
  const attributes = extractClassAttributes(text);
  const hasCsc148Signals =
    /representation invariants?|attributes?:|__init__|self\b|function design recipe/i.test(text) ||
    invariants.length > 0 ||
    attributes.length > 0;
  if (!hasCsc148Signals) return;

  const className = classMatch?.[1] || 'course class';
  const attributeText = attributes.length
    ? attributes.map((item) => `- ${item.name}: ${item.type}`).join('\n')
    : '- Preserve the attribute names and meanings from the source.';
  const invariantText = invariants.length
    ? invariants.map((item) => `- ${item}`).join('\n')
    : '- Preserve any Representation Invariants stated in the source.';
  addTemplateArtifact({
    artifacts,
    input,
    id: `template-csc148-${slug(className) || 'class-contract'}`,
    title: `CSC148 class contract: ${className}`,
    text: [
      'Use this as long-term course/notebook memory for CSC148 OOP answers:',
      `- The local course convention is about the class contract for ${className}, not the generic definition of a class.`,
      '- The class docstring explains the data type, public attributes, and representation invariants.',
      '- Attribute annotations document expected types; instance attributes still need to be initialized by the constructor or established by the course-provided design.',
      '- When explaining or grading code, check the local attributes and invariants before generic OOP style advice.',
      '',
      'Attributes to preserve:',
      attributeText,
      '',
      'Representation invariants to preserve:',
      invariantText,
    ].join('\n'),
    tags: ['CSC148', 'Python', 'OOP', 'Representation Invariants', className],
    reasons: [
      'The source contains CSC148-specific class contract signals such as attributes or representation invariants.',
      'Only the local class contract is promoted to long-term memory; generic class concepts stay out of memory.',
    ],
    signalKinds: ['course_answer_contract', 'notebook_teaching_constraint', 'local_template'],
  });
}

function extractMat102Template(input: SourceIngestionInput, artifacts: SourceMemoryArtifact[]) {
  if (!shouldExtractTemplateForCourse(input, 'MAT102')) return;
  const text = input.text;
  if (
    !/proof|prove|subset|bijection|injective|surjective|induction|homomorphism|kernel|subgroup|quantifier|contrapositive|contradiction/i.test(
      text,
    )
  ) {
    return;
  }
  addTemplateArtifact({
    artifacts,
    input,
    id: 'template-mat102-proof-control',
    title: 'MAT102 proof-first answer contract',
    text: [
      'Use this as long-term course memory for MAT102 proof answers:',
      '- Classify the proposition first: subset/equality, forall/exists, implication/iff, induction, function property, number theory, relation, or group structure.',
      '- Choose the proof mode before algebra: direct proof, contrapositive, contradiction, case split, element-chasing, induction, Bezout/modular arithmetic, or subgroup/homomorphism/kernel proof.',
      '- Require the correct proof opening: arbitrary object, witness, induction hypothesis, domain/codomain setup, or operation/universe declaration.',
      '- Every step should name the definition or theorem used; examples are evidence only when disproving with a counterexample.',
      '- Long theorem statements and full proofs stay in RAG; static memory stores proof-control rules and error taxonomy.',
    ].join('\n'),
    tags: ['MAT102', 'proof', 'teaching-control'],
    reasons: [
      'The source contains proof-template signals that change answer structure.',
      'The durable part is proof control, not generic mathematical definitions.',
    ],
    signalKinds: ['course_answer_contract', 'local_template'],
  });
}

function extractMat136Template(input: SourceIngestionInput, artifacts: SourceMemoryArtifact[]) {
  if (!shouldExtractTemplateForCourse(input, 'MAT136')) return;
  const text = input.text;
  if (
    !/integral|series|sequence|taylor|convergence|improper|ratio test|comparison test|differential equation|area|volume/i.test(
      text,
    )
  ) {
    return;
  }
  addTemplateArtifact({
    artifacts,
    input,
    id: 'template-mat136-method-control',
    title: 'MAT136 method-selection answer contract',
    text: [
      'Use this as long-term course memory for MAT136 answers:',
      '- Classify the task first: compute, model, justify/prove, convergence test, power series interval, or Taylor approximation.',
      '- Before computing, record the method conditions: interval, endpoint, danger point, sign, monotonicity, center, initial condition, or convergence-test prerequisite.',
      '- For modeling, define variables and region/slices before the integral. For series, distinguish sequence a_n from series sum a_n.',
      '- Diagnosis should locate the first invalid condition or method choice before redoing algebra.',
      '- Full worked examples and formula catalogs stay in RAG; static memory stores method selection and error taxonomy.',
    ].join('\n'),
    tags: ['MAT136', 'calculus', 'teaching-control'],
    reasons: [
      'The source contains calculus method-selection signals that change answer structure.',
      'The durable part is classification and condition checking, not generic formula lists.',
    ],
    signalKinds: ['course_answer_contract', 'local_template'],
  });
}

export function planSourceMemoryIngestion(input: SourceIngestionInput): SourceMemoryIngestionPlan {
  const sourceKind = input.sourceKind || 'plain_text';
  const audience = input.audience || 'creator';
  const courseCode = detectCourseCode(input);
  const targetType = input.targetType || null;
  const targetId = input.targetId?.trim() || null;
  const artifacts: SourceMemoryArtifact[] = [];

  const knowledgeCandidate = buildKnowledgeCandidate(input);
  artifacts.push({
    id: 'knowledge-source-full-text',
    layer: 'knowledge_base',
    artifactKind: 'knowledge_source',
    title: `${input.sourceTitle} full source index`,
    text: compact(input.text, 12000),
    signalKinds: ['source_evidence'],
    tags: [courseCode, sourceKind, input.sourceTitle].filter((item): item is string =>
      Boolean(item),
    ),
    reasons: [
      'The complete source belongs in the RAG layer so large files and problem sets can be searched on demand.',
    ],
    staticInjectionCandidate: false,
    dynamicDiscoveryCandidate: true,
    writeCandidate: knowledgeCandidate,
  });

  extractCpsc107Template(input, artifacts);
  extractCsc108Template(input, artifacts);
  extractCsc148Template(input, artifacts);
  extractMat102Template(input, artifacts);
  extractMat136Template(input, artifacts);

  if (
    artifacts.length === 1 &&
    /\b(class|function|loop|recursion|list|dictionary)\b/i.test(input.text)
  ) {
    artifacts.push({
      id: 'discard-generic-concepts',
      layer: 'long_term',
      artifactKind: 'discarded_generic_concept',
      title: 'Generic concept text not promoted to memory',
      text: 'The source appears to contain generic programming concepts but no local answer contract, template, invariant, or teacher-specific constraint was detected.',
      signalKinds: ['generic_concept'],
      tags: ['discarded', 'generic-concept'],
      reasons: [
        'Generic concepts are available from source RAG when needed and should not spend static memory budget.',
      ],
      staticInjectionCandidate: false,
      dynamicDiscoveryCandidate: false,
    });
  }

  const writeCandidates = artifacts
    .map((artifact) => artifact.writeCandidate)
    .filter((candidate): candidate is MemoryWriteCandidate => Boolean(candidate));

  return {
    sourceTitle: input.sourceTitle,
    sourceKind,
    targetType,
    targetId,
    audience,
    courseCode,
    artifacts,
    writeCandidates,
    tokenPolicy: [
      'Static memory stores only rules that change future answers: templates, invariants, tool boundaries, learner state, and next teaching move.',
      'Full source text, large problem banks, and ordinary definitions go to RAG.',
      'For OOP sources, store local class contracts such as attributes and representation invariants, not the generic idea of class.',
      'Creator uploads can create public long-term memory and knowledge sources; learner activity creates private short/long-term learner memory.',
    ],
  };
}
