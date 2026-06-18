export type ReplyContextIntent =
  | 'problem_tutoring'
  | 'programming_help'
  | 'proof_help'
  | 'concept_help'
  | 'course_review';

export type ReplyContextTier = 0 | 1 | 2 | 3;

export type ReplyContextMemoryKind =
  | 'course_rule'
  | 'solution_template'
  | 'concept'
  | 'worked_example'
  | 'common_mistake'
  | 'student_state'
  | 'attempt_summary'
  | 'source_excerpt';

export type ReplyContextCapsule = {
  id: string;
  kind: ReplyContextMemoryKind;
  title: string;
  text: string;
  tags: string[];
  source: 'built_in_rule_pack' | 'memory' | 'notebook_source' | 'problem_attempt';
  priority: number;
  tokenEstimate: number;
};

export type ReplyContextPlan = {
  intent: ReplyContextIntent;
  tier: ReplyContextTier;
  maxContextTokens: number;
  maxCapsules: number;
  signals: string[];
  neededContext: ReplyContextMemoryKind[];
  reasons: string[];
};

export type ReplyContextBundle = {
  plan: ReplyContextPlan;
  capsules: ReplyContextCapsule[];
  prompt: string;
  audit: {
    capsuleCount: number;
    estimatedTokens: number;
    hasCourseRules: boolean;
    hasSolutionTemplate: boolean;
    hasCommonMistake: boolean;
    withinBudget: boolean;
  };
};

type BuildReplyContextArgs = {
  message: string;
  courseCode?: string | null;
  courseName?: string | null;
  notebookName?: string | null;
  isProgrammingQuestion?: boolean;
  memoryAvailable?: boolean;
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

function normalizedCourseKey(args: BuildReplyContextArgs): string {
  return [args.courseCode, args.courseName, args.notebookName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isCsc108Context(args: BuildReplyContextArgs): boolean {
  return /\bcsc\s*108\b|csc108|queue-csc108|introduction to computer programming/i.test(
    normalizedCourseKey(args),
  );
}

function isCpsc107Context(args: BuildReplyContextArgs): boolean {
  return /\bcpsc\s*107\b|cpsc107|queue-cpsc107|htdf|htdd|@template-origin|racket/i.test(
    `${normalizedCourseKey(args)}\n${args.message}`,
  );
}

function isCpsc107GraphWorklistTarget(args: BuildReplyContextArgs): boolean {
  const haystack = args.message.toLowerCase();
  return /route-duration-tr|@problem\s*4|problem\s*4|第四题|4\)|must\s+be\s+tail[-\s]*recursive|worklist|工作列表/.test(
    haystack,
  );
}

function detectSignals(args: BuildReplyContextArgs): string[] {
  const haystack = `${normalizedCourseKey(args)}\n${args.message}`.toLowerCase();
  const signals = new Set<string>();
  if (isCpsc107Context(args)) signals.add('cpsc107_course_context');
  if (args.isProgrammingQuestion) signals.add('programming');
  if (
    /racket|python|java(script)?|typescript|c\+\+|scheme|htdp|#reader|spd\/tags|\bdef\s+\w+\s*\(|\(@htdf|\(define\b|function signature|starter code|docstring|代码/.test(
      haystack,
    )
  ) {
    signals.add('language_or_code_context');
  }
  if (/@signature|check-expect|@template-origin|design recipe|设计/.test(haystack)) {
    signals.add('course_design_recipe');
  }
  if (
    /must\s+be\s+tail[-\s]*recursive|tail recursion and accumulator|route-duration-tr|worklist|accumulator|尾递归|尾递|工作列表/.test(
      haystack,
    )
  ) {
    signals.add('tail_recursion_or_worklist');
  }
  if (
    /must not be tail recursive|non[-\s]*tail[-\s]*recursive|not tail recursive|不能.*尾递归|不要.*尾递归/.test(
      haystack,
    )
  ) {
    signals.add('non_tail_recursion_required');
  }
  if (
    /generated graph|graph|generate-node|lookup-airport|airport|flight|route-duration|get-room|node-nexts|node-number|图搜索|有向图/.test(
      haystack,
    )
  ) {
    signals.add('generated_graph_traversal');
  }
  if (
    /return false|produces false|false if|false\?|到不了|失败|no way of reaching/.test(haystack)
  ) {
    signals.add('failure_result_search');
  }
  if (
    /2-one-of|two one-of|one-of|case split|simultaneous|同时|同步|table cells|表格|遍历|traverse/.test(
      haystack,
    )
  ) {
    signals.add('case_split_or_simultaneous_traversal');
  }
  if (/2htdp\/image|overlay|circle|image/.test(haystack)) {
    signals.add('image_composition');
  }
  if (/wrap around|环绕|绕回|回到开头|longest chain|连续链/.test(haystack)) {
    signals.add('cyclic_or_wraparound_sequence');
  }
  if (/regex|\bre\b|re\.search|regular expression|正则/.test(haystack)) {
    signals.add('pattern_matching');
  }
  if (/mat102|proof|证明|epsilon|ε|集合|逻辑|命题/.test(haystack)) {
    signals.add('formal_reasoning');
  }
  if (/mat136|integral|积分|series|级数|converge|diverge|收敛|发散/.test(haystack)) {
    signals.add('quantitative_methods');
  }
  return Array.from(signals);
}

function buildContextPlan(args: BuildReplyContextArgs, signals: string[]): ReplyContextPlan {
  const signalSet = new Set(signals);
  const neededContext = new Set<ReplyContextMemoryKind>();
  const reasons: string[] = [];
  let intent: ReplyContextIntent = args.isProgrammingQuestion ? 'programming_help' : 'concept_help';
  let tier: ReplyContextTier = args.isProgrammingQuestion ? 1 : 0;
  let maxContextTokens = args.isProgrammingQuestion ? 1600 : 900;
  let maxCapsules = args.isProgrammingQuestion ? 4 : 3;

  if (signalSet.has('language_or_code_context') || signalSet.has('course_design_recipe')) {
    intent = 'problem_tutoring';
    tier = 2;
    maxContextTokens = 2200;
    maxCapsules = 4;
    neededContext.add('course_rule');
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    reasons.push('Programming questions with course-format signals need retrieved course rules.');
  }
  if (signalSet.has('case_split_or_simultaneous_traversal')) {
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 2) as ReplyContextTier;
    reasons.push(
      'Case-split or simultaneous-traversal questions need a template-level explanation.',
    );
  }
  if (signalSet.has('image_composition')) {
    neededContext.add('worked_example');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push('Composition questions need ordering and visual-result checks.');
  }
  if (signalSet.has('cyclic_or_wraparound_sequence')) {
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push('Cyclic sequence questions need boundary and double-counting checks.');
  }
  if (
    signalSet.has('cpsc107_course_context') &&
    signalSet.has('generated_graph_traversal') &&
    signalSet.has('tail_recursion_or_worklist')
  ) {
    intent = 'problem_tutoring';
    neededContext.add('solution_template');
    neededContext.add('common_mistake');
    tier = 3;
    maxContextTokens = Math.max(maxContextTokens, 3200);
    maxCapsules = Math.max(maxCapsules, 5);
    reasons.push(
      'CPSC107 generated-graph tail-recursion questions need the graph worklist template before answer generation.',
    );
  }
  if (signalSet.has('pattern_matching')) {
    neededContext.add('solution_template');
    reasons.push('Pattern-matching questions benefit from a construction template.');
  }
  if (signalSet.has('formal_reasoning')) {
    intent = 'proof_help';
    neededContext.add('course_rule');
    neededContext.add('common_mistake');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push('Formal reasoning questions need rigor and existence checks.');
  }
  if (signalSet.has('quantitative_methods')) {
    neededContext.add('concept');
    neededContext.add('worked_example');
    tier = Math.max(tier, 1) as ReplyContextTier;
    reasons.push(
      'Quantitative questions usually need the relevant concept/theorem and a worked example.',
    );
  }
  void args.memoryAvailable;

  return {
    intent,
    tier,
    maxContextTokens,
    maxCapsules,
    signals,
    neededContext: Array.from(neededContext),
    reasons,
  };
}

function builtInCapsulesForSignals(
  signals: string[],
  args: BuildReplyContextArgs,
): ReplyContextCapsule[] {
  const signalSet = new Set(signals);
  const capsules: ReplyContextCapsule[] = [];
  if (
    isCsc108Context(args) &&
    (signalSet.has('programming') || signalSet.has('language_or_code_context'))
  ) {
    capsules.push({
      id: 'csc108-function-design-docstring-template',
      kind: 'solution_template',
      title: 'CSC108 function-design template: header, docstring, body, return',
      text: [
        'For CSC108 Python function questions, treat the starter function header and starter docstring as the solution template.',
        'The submitted code should keep the exact header, type annotations, parameter names, and starter docstring as the first statement inside the function body.',
        'Explain the docstring as the function contract: purpose, preconditions, examples/doctests, and expected return behavior.',
        'Write implementation statements below the docstring, return the requested value, and keep sample calls/tests outside the function body.',
      ].join(' '),
      tags: ['CSC108', 'python', 'function-design', 'docstring', 'solution-template'],
      source: 'built_in_rule_pack',
      priority: 95,
      tokenEstimate: 120,
    });
  }
  if (
    isCpsc107Context(args) &&
    signalSet.has('generated_graph_traversal') &&
    signalSet.has('tail_recursion_or_worklist') &&
    (!signalSet.has('non_tail_recursion_required') || isCpsc107GraphWorklistTarget(args))
  ) {
    capsules.push({
      id: 'cpsc107-generated-graph-worklist-template',
      kind: 'solution_template',
      title: 'CPSC107 Graph Worklist / Tail Recursion template',
      text: [
        'Use this template when a CPSC107 problem asks for a tail-recursive generated-graph traversal, such as Airport/Flight route-duration-tr or a provided fn-for-graph/tr template.',
        'Mandatory route-duration-tr output shape: signature must be (@signature Airport String -> Natural or false); template-origin must be (@template-origin genrec arb-tree accumulator use-abstract-fn) when the answer uses map to expand flights; final code must not define next-airports or next-durs helpers. Do not use anyof-style signatures for this course.',
        'Mandatory submitted-code metadata: include the line (@template-origin genrec arb-tree accumulator use-abstract-fn) immediately before the final route-duration-tr definition. Do not omit @template-origin from the code block.',
        'Mandatory local structure: the route-duration-tr definition must wrap its helper definitions in (local [...] ...). Do not place a bare internal helper define directly inside route-duration-tr.',
        `Canonical route-duration-tr skeleton:
(@template-origin genrec arb-tree accumulator use-abstract-fn)
(define (route-duration-tr airport0 dest)
  (local [(define (fn-for-airport-wl airport-wl dur-wl visited)
            (cond [(empty? airport-wl) false]
                  [else
                   (local [(define current-airport (first airport-wl))
                           (define current-dur (first dur-wl))
                           (define rest-airports (rest airport-wl))
                           (define rest-durs (rest dur-wl))]
                     (cond [(member? (airport-city current-airport) visited)
                            (fn-for-airport-wl rest-airports rest-durs visited)]
                           [(string=? (airport-city current-airport) dest)
                            current-dur]
                           [else
                            (local [(define flights (airport-lof current-airport))
                                    (define generated-airports
                                      (map (lambda (f)
                                             (lookup-airport (flight-dest f)))
                                           flights))
                                    (define generated-durs
                                      (map (lambda (f)
                                             (+ current-dur (flight-dur f)))
                                           flights))]
                              (fn-for-airport-wl
                               (append generated-airports rest-airports)
                               (append generated-durs rest-durs)
                               (cons (airport-city current-airport) visited)))]))]))]
    (fn-for-airport-wl (list airport0) (list 0) empty)))`,
        'In Racket local, the bracketed part after local contains definitions only; put if/cond expressions in the body after the definitions, not inside the definition list.',
        'Mandatory route-duration-tr worklist update: put generated next work before the remaining worklist to preserve Problem 3 first-success behavior: (append generated-airports (rest airport-wl)) and (append generated-durs (rest dur-wl)). Do not use (append (rest airport-wl) generated-airports).',
        'Mandatory route-duration-tr expansion: inside the tail helper, bind current-airport, current-dur, flights, generated-airports, and generated-durs with local, not let or let*. Use generated-airports = (map (lambda (f) (lookup-airport (flight-dest f))) flights) and generated-durs = (map (lambda (f) (+ current-dur (flight-dur f))) flights).',
        'Do not introduce any binding named next-airports or next-durs in the final code; those names look like ordinary recursive helper leftovers. Prefer generated-airports and generated-durs for the map results.',
        'First extract the template input: task type is code design; main template is generated graph search with accumulator/worklist; failure result is false; result is a real answer such as total duration.',
        'For route-duration-tr, the output is a duration or false, not a pure Boolean. Use the course wording (@signature Airport String -> Natural or false). Do not write Airport String -> Boolean, and do not use anyof-style signatures for this problem.',
        'Use @template-origin for the main strategy, not just the parameter types: usually (@template-origin genrec arb-tree accumulator). Add use-abstract-fn only when map/filter/fold is part of the main traversal step.',
        'Name accumulators with the course worklist convention: a-wl, flight-wl, nn-wl, state-wl, dur-wl, path-wl, etc. Avoid generic todo/durs naming in final answers.',
        'Use tandem worklists when each pending graph node/state needs parallel information. State the invariant: the first node/state in the primary -wl is paired with the first value in the tandem -wl, same length and same order.',
        'For route-duration-tr, public route-duration-tr initializes (list airport) and (list 0); local tail helper consumes airport-wl, dur-wl, visited. Empty worklist returns false. Visited airport skips to rest. Destination airport returns first duration. Otherwise extend the worklists with destinations of outgoing flights and their accumulated durations.',
        'Preserve the intended first-success route behavior from the non-tail-recursive version unless the problem asks for shortest route or BFS. If Problem 3 tries the first flight branch before the rest, put generated next work before the remaining worklist, not after it.',
        'Do not write a helper that is secretly ordinary recursion with cons after the recursive call if the whole solution must be tail recursive.',
        'For this course, explain the answer by naming the extracted template and the accumulator meanings before giving code.',
      ].join(' '),
      tags: [
        'CPSC107',
        'Racket',
        'generated-graph',
        'tail-recursion',
        'worklist',
        'accumulator',
        'template-origin',
      ],
      source: 'built_in_rule_pack',
      priority: 98,
      tokenEstimate: 520,
    });
  }
  return capsules;
}

function selectCapsules(plan: ReplyContextPlan, capsules: ReplyContextCapsule[]) {
  const selected: ReplyContextCapsule[] = [];
  let total = 0;
  for (const item of capsules.sort((a, b) => b.priority - a.priority)) {
    if (selected.length >= plan.maxCapsules) break;
    if (total + item.tokenEstimate > plan.maxContextTokens) continue;
    selected.push(item);
    total += item.tokenEstimate;
  }
  return selected;
}

function formatCapsules(capsules: ReplyContextCapsule[]): string {
  if (capsules.length === 0) return 'none';
  return capsules
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}: ${compact(
          item.kind === 'solution_template' ? item.text : item.text.replace(/\n/g, ' '),
          item.kind === 'solution_template' ? 5200 : 520,
        )}`,
    )
    .join('\n');
}

export function buildReplyContextBundle(args: BuildReplyContextArgs): ReplyContextBundle {
  const signals = detectSignals(args);
  const plan = buildContextPlan(args, signals);
  const capsules = selectCapsules(plan, builtInCapsulesForSignals(signals, args));
  const estimatedTokens = capsules.reduce((total, item) => total + item.tokenEstimate, 0);
  const prompt = formatCapsules(capsules);

  return {
    plan,
    capsules,
    prompt,
    audit: {
      capsuleCount: capsules.length,
      estimatedTokens,
      hasCourseRules: capsules.some((item) => item.kind === 'course_rule'),
      hasSolutionTemplate: capsules.some((item) => item.kind === 'solution_template'),
      hasCommonMistake: capsules.some((item) => item.kind === 'common_mistake'),
      withinBudget: estimatedTokens <= plan.maxContextTokens,
    },
  };
}
