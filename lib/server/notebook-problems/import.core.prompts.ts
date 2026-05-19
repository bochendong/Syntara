import { compactSourcePackageForPrompt } from './import.structure-utils';
import type { ProblemSourcePackage } from './import.core.types';

export function directLlmProblemImportPrompt(args: {
  sourcePackage: ProblemSourcePackage;
  language: 'zh-CN' | 'en-US';
}) {
  const compactSource = compactSourcePackageForPrompt(args.sourcePackage);
  const formattingContract = problemStemFormattingContract(args.language);
  return args.language === 'zh-CN'
    ? `请直接读取附加 PDF，完成整本题库导入。只返回严格 JSON 对象，不要 markdown，不要解释。

目标：由大模型直接完成题目边界识别、非题目页排除、题面整理、LaTeX 转写和 draft 生成。本地不会先拆题；你要以 PDF 视觉内容为准，下面的文本层 Source Package 只作为辅助 OCR/页码提示。

返回格式：
{
  "structurePlan": {
    "sourceSummary": "简短说明",
    "nonProblemRegions": [{"kind":"cover|instructions|additional_work|blank|header_footer|other","pageNumbers":[1],"reason":"..."}],
    "sharedContexts": [{"id":"ctx_1","title":"...","pageNumbers":[2],"summary":"..."}],
    "topLevelProblems": [
      {
        "index": 1,
        "topLevelLabel": "1",
        "title": "概念导向标题",
        "problemTypeHint": "choice|proof|calculation|short_answer|code|fill_blank|unknown",
        "pageStart": 2,
        "pageEnd": 2,
        "sourceAnchors": [{"pageNumber":2,"sourcePageId":"page_2","textQuote":"题目开头短引文","role":"problem"}],
        "subparts": [{"label":"a","prompt":"子问原意","points":3}],
        "contextBlocks": [{"kind":"definition|conditions|table|diagram|code|data|hint|other","title":"...","summary":"..."}],
        "visualRefs": [],
        "confidence": 0.0 到 1.0
      }
    ],
    "warnings": [],
    "generatedBy": "llm"
  },
  "drafts": [
    {
      "title": "简短题名",
      "type": "short_answer|choice|proof|calculation|code|fill_blank",
      "points": 1,
      "difficulty": "easy|medium|hard",
      "tags": [],
      "publicContent": {"type":"short_answer","stem":"学生可见题面，Markdown + LaTeX"},
      "grading": {"type":"short_answer"},
      "sourceMeta": {"scaffoldIndex":1,"structure":{"topLevelLabel":"1"},"anchors":[{"pageNumber":2}]},
      "validationErrors": []
    }
  ]
}

硬性要求：
- 由你直接决定题目边界；不要照抄 Source Package 里的 roleHint 或本地 heuristic 结论。
- 必须保留 PDF 原文语言：英文题继续输出英文，中文题继续输出中文；不要翻译、改写成另一种语言或把示例里的中文套进题面。
- publicContent.stem 是忠实整理后的题面，只允许清理版式、恢复数学和补齐同题上下文；不要摘要化、讲解化或本地化。
- 顶层题号是一道 draft；(a)/(b)/(i)/(ii) 等子问保留在同一 stem 中。
- 不要输出封面、考试说明、空白页、additional work。
- drafts 数量必须等于 structurePlan.topLevelProblems 数量，顺序一致。
- 每个 draft.sourceMeta.scaffoldIndex 必须等于对应 topLevelProblems.index。
- 每个 draft.sourceMeta.anchors 必须带页码；sourceMeta.structure 可以是对应 topLevelProblems 的简短副本。
- 非选择题不要生成答案；只保留最小 grading。
- 选择题若没有答案表，可以根据题干和选项解题并设置 correctOptionIds，同时在 sourceMeta.answerSource 写 "llm-solved"。
- 数学题面必须整理成可读 Markdown + LaTeX；不要输出 OCR 垃圾文本、Unicode 数学符号、裸数学、或被压扁的一整行公式。
- 分段函数、矩阵、长积分、长极限等使用独立 $$...$$；行内短公式使用 $...$。
- 不要把一条公式拆成多个相邻的 $...$ 片段；分段函数必须写成一个完整块，例如 $$f(x)=\\begin{cases} ... \\end{cases}$$。
- 不要把普通文字放进数学 delimiter；只包数学表达式本身。
- 如果图形/图表题的视觉信息无法完整转写，可以保留可读文本并在 visualRefs / validationErrors 标注，但不要因为图形存在就放弃整题。
- 图像题不要伪造图片 URL；只在 sourceMeta.structure.visualRefs 写清依赖的 Figure/Graph/Diagram 和页码，系统会把对应页面图像挂到 publicContent.assets.images。

${formattingContract}

辅助 Source Package（仅作页码/OCR 提示，不是权威题面）：
${compactSource}`
    : `Read the attached PDF directly and perform the full problem-bank import. Return strict JSON object only, no markdown and no explanation.

Goal: the model directly identifies problem boundaries, excludes non-problem pages, rewrites student-facing stems, transcribes LaTeX, and generates drafts. Local code does not pre-split problems. Treat the visible PDF as authoritative; the source package text below is only auxiliary OCR/page-number context.

Return shape:
{
  "structurePlan": {
    "sourceSummary": "short summary",
    "nonProblemRegions": [{"kind":"cover|instructions|additional_work|blank|header_footer|other","pageNumbers":[1],"reason":"..."}],
    "sharedContexts": [{"id":"ctx_1","title":"...","pageNumbers":[2],"summary":"..."}],
    "topLevelProblems": [
      {
        "index": 1,
        "topLevelLabel": "1",
        "title": "concept-focused title",
        "problemTypeHint": "choice|proof|calculation|short_answer|code|fill_blank|unknown",
        "pageStart": 2,
        "pageEnd": 2,
        "sourceAnchors": [{"pageNumber":2,"sourcePageId":"page_2","textQuote":"short opening quote","role":"problem"}],
        "subparts": [{"label":"a","prompt":"subpart intent","points":3}],
        "contextBlocks": [{"kind":"definition|conditions|table|diagram|code|data|hint|other","title":"...","summary":"..."}],
        "visualRefs": [],
        "confidence": 0.0
      }
    ],
    "warnings": [],
    "generatedBy": "llm"
  },
  "drafts": []
}

Hard requirements:
- You decide the problem boundaries directly; do not copy local roleHint or heuristic conclusions.
- Preserve the PDF's original language: English questions must remain English and Chinese questions must remain Chinese. Do not translate or localize stems, titles, options, or subparts.
- publicContent.stem is a faithful cleaned statement. Only clean layout, recover math, and include same-problem context; do not summarize, explain, or rewrite in another language.
- One top-level question number is one draft; keep subparts inside that stem.
- Do not output covers, instructions, blank pages, or additional-work pages.
- drafts count must equal structurePlan.topLevelProblems count, in the same order.
- Every draft.sourceMeta.scaffoldIndex must match its topLevelProblems.index.
- Every draft.sourceMeta.anchors must include page numbers.
- Do not generate answers for non-choice problems; keep minimal grading.
- For choice problems without an answer key, solve from stem/options and set sourceMeta.answerSource to "llm-solved".
- Math stems must be readable Markdown + LaTeX; do not emit OCR garbage, Unicode math symbols, bare math, or flattened formulas.
- Use $$...$$ for cases, matrices, long integrals, and long limits; use $...$ for short inline formulas.
- Do not split one formula into many adjacent $...$ fragments. A piecewise function must be one complete display block, e.g. $$f(x)=\\begin{cases} ... \\end{cases}$$.
- Do not put ordinary prose inside math delimiters; wrap only mathematical expressions.
- For image/graph/diagram questions, do not invent image URLs. Record the needed Figure/Graph/Diagram in sourceMeta.structure.visualRefs with page anchors; the system will attach source page images to publicContent.assets.images.

${formattingContract}

Auxiliary Source Package:
${compactSource}`;
}

export function problemStemFormattingContract(language: 'zh-CN' | 'en-US'): string {
  return language === 'zh-CN'
    ? String.raw`题库抽取任务模型（科目无关）：
- 你的任务不是“复制 PDF 文本”，而是把原始材料转换成可进入题库的 problem draft。题库题面必须让学生脱离原 PDF 也能直接作答。
- 在输出 JSON 前，先在内部完成这三步，不要把分析过程输出出来：
  1. 识别材料角色：封面、考试说明、页眉页脚、空白页、题目、共享材料、表格、图、代码块、数据、提示、评分说明。
  2. 建立题目层级：顶层题号是一道题；题内的子问、条件、案例、数据、图表、提示都是同一道题的内部结构。
  3. 重写成题库题面：保留所有作答所需信息，删掉版式噪音，把视觉层级转换成 markdown 段落、列表、表格或代码块。
- publicContent.stem / stemTemplate 是“整理后的学生可见题面”，不是 OCR dump，不是摘要，也不是 prompt 解释。
- JSON 必须是严格 JSON；stem 字符串中的换行用 \n 或 \n\n 编码，但渲染后必须有真实分段。
- 拆题原则：只按顶层题号拆 draft。子问编号、实验步骤、阅读材料问题、证明小问、案例小问都留在同一个 stem 里，并以清晰分段呈现。
- 结构原则：任何枚举型材料都不能压成一段。条件、性质、假设、要求、步骤、案例事实、数据说明、可选项、提示、注释、定义块必须按原本语义整理成 markdown 列表、表格、代码块或独立段落。
- 科目适配：数学保留定义、符号和证明目标；计算机保留代码、输入输出、约束和测试语义；理科保留单位、实验条件、图表数据；人文社科保留材料、引文、案例事实和具体问法。不要用某一科目的模板强套所有题。
- 如果题目依赖图片/图形/表格/代码/共享材料，必须把可读出的关系、数据、节点、边、列、行、代码或上下文写入同一道 stem。不能只写“见图”“如上”“front page”“Table I”。
- sourceMeta.structure 应简短记录你识别到的结构，例如 topLevelLabel、subparts、contextBlocks、visualRefs；这用于调试，不要替代 stem。`
    : String.raw`Subject-agnostic problem extraction model:
- Your job is not to copy PDF text. Convert source material into problem-bank drafts. A student must be able to answer each imported problem without opening the original PDF.
- Before returning JSON, perform these internal steps. Do not output the analysis:
  1. Identify material roles: cover, exam instructions, headers/footers, blank pages, problems, shared context, tables, diagrams, code blocks, datasets, hints, and grading notes.
  2. Build the problem hierarchy: a top-level question number is one problem; subparts, conditions, cases, datasets, figures, tables, hints, and code belong inside that problem.
  3. Rewrite into a problem-bank stem: preserve all information needed to answer, remove layout noise, and convert visual hierarchy into markdown paragraphs, lists, tables, or code blocks.
- publicContent.stem / stemTemplate is the cleaned student-facing statement. It is not an OCR dump, not a summary, and not an explanation of your prompt.
- The response must be strict JSON; encode line breaks inside stem strings as \n or \n\n, but the rendered stem must have real sections.
- Splitting rule: split only by top-level question number. Subquestion labels, lab steps, reading-material questions, proof subparts, and case-study subparts stay inside one stem with clear sections.
- Structure rule: enumerated material must not be flattened into one paragraph. Conditions, properties, assumptions, requirements, steps, case facts, data notes, options, hints, notes, definitions, and setup blocks must be represented as markdown lists, tables, code blocks, or separate paragraphs according to their meaning.
- Subject adaptation: for math, preserve definitions, symbols, and proof goals; for computer science, preserve code, I/O, constraints, and test semantics; for science, preserve units, experimental conditions, and graph/table data; for humanities/social science, preserve source material, quotations, case facts, and exact prompts. Do not force every subject into a math-specific template.
- If a problem depends on an image, diagram, table, code, or shared context, transcribe the readable relationships, data, nodes, edges, columns, rows, code, or context into the same stem. Never leave only "see figure", "above", "front page", or "Table I".
- sourceMeta.structure should briefly record the structure you recognized, such as topLevelLabel, subparts, contextBlocks, and visualRefs; this is for debugging and must not replace the stem.`;
}

export function buildProblemImportSystemPrompt(language: 'zh-CN' | 'en-US'): string {
  return language === 'zh-CN'
    ? `你是大学课程题库抽取助手。请把输入材料拆成一组题目草稿，并返回严格 JSON 数组，不要返回 markdown。
每个数组元素都必须尽量贴近以下结构：
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "sourceMeta": {...optional...},
  "validationErrors": string[]
}
${problemStemFormattingContract(language)}
要求：
- 按顶层题号拆题：一道顶层编号题目输出一个对象
- 不要把同一道证明题 / 同一道复合题硬拆成多条草稿；(i)/(ii)/(a)/(b) 必须留在同一道题的 stem 里
- title 必须是简洁、稳定、概念导向的题目名，优先概括知识点与任务，不要直接复制整句题面，不要把公式原样塞进 title
- 每道题的 publicContent 必须能独立作答；不要只写“见上表 / 见图 / front page / Table I / Diagram II”
- 按材料语义选择 stem 表达方式：枚举/步骤/条件用列表；数据矩阵/表格/真值表用 markdown 表格；代码用 fenced code block；图形/流程/关系图用可读的节点、边、状态、箭头或邻接关系列表
- 共享上下文必须复制进依赖它的题目，或整理成该题开头的“背景/材料/数据/定义”块
- choice 题必须拆出 publicContent.options 与 grading.correctOptionIds
- publicContent.options 必须是数组，形如 [{"id":"A","label":"完整选项文本"}, ...]；label 必须是完整可作答的选项内容，绝不能只写 "A" / "B" / "C" 这样的字母
- 只有 choice 题需要生成答案：如果来源没有答案表，请你根据题干和选项自行解题，把推断出的正确答案写入 correctOptionIds，并在 sourceMeta.answerSource 写 "llm-solved"
- 非 choice 题不要生成答案：proof / short_answer / calculation / code 等文字作答题不要输出 referenceProof、referenceAnswer、analysis、非空 acceptedForms 或模型自写解答
- 非 choice 题的 grading 保持最小结构；proof/short_answer 用 {"type": "..."}，calculation 用 {"type":"calculation","acceptedForms":[]}，code 只保留必要的测试/发布字段
- 只有在题干缺少图表/前文等关键上下文、无法可靠解答时，才使用第一个选项 id 作为 schema 占位，并在 validationErrors 加入“未识别到正确答案”
- code 题默认 language=python
- 如果 code 题缺少 function signature / public tests / secret tests，也要保留，但写入 validationErrors
- 直接输出 LaTeX 数学源码：行内数学使用 $...$，较长或独立公式使用 $$...$$
- publicContent / grading / choice option label 里的所有数学都必须包在 LaTeX delimiter 中
- 不要输出裸数学、Unicode 数学符号或纯文本数学命令；例如不要写 "A ⊆ X"、"leq"、"subseteq"、"f: X → Y"，要写 "$A \\subseteq X$"、"$\\leq$"、"$\\subseteq$"、"$f: X \\to Y$"
- 不要把已经是 LaTeX 的数学再额外用普通括号包起来
- 不要为非 choice 题臆造答案；只有选择题在题干和选项足以解题时才给出模型推断答案`
    : `You are a university problem-bank extraction assistant. Convert the source material into an array of problem drafts and return strict JSON only.
Each item should follow this shape as closely as possible:
{
  "title": string,
  "type": "short_answer" | "choice" | "proof" | "calculation" | "code" | "fill_blank",
  "points": number,
  "difficulty": "easy" | "medium" | "hard",
  "tags": string[],
  "publicContent": {...},
  "grading": {...},
  "secretJudge": {...optional...},
  "sourceMeta": {...optional...},
  "validationErrors": string[]
}
${problemStemFormattingContract(language)}
Requirements:
- split by top-level question number: one top-level numbered question becomes one draft object
- do not split one proof / one compound problem into multiple drafts; (i)/(ii)/(a)/(b) must stay inside that problem's stem
- title must be concise, concept-focused, and stable; summarize the topic/task instead of copying the whole stem, and avoid dumping raw formulas into the title
- every publicContent item must be independently answerable; do not leave references like "see above", "front page", "Table I", or "Diagram II" without the referenced content
- choose the stem representation by material semantics: enumerations, steps, and conditions become lists; data matrices, tables, and truth tables become markdown tables; code becomes fenced code blocks; diagrams, flows, and relationship graphs become readable node/edge/state/arrow/adjacency lists
- shared context must be copied into every problem that depends on it, or rewritten as a Background / Material / Data / Definitions block at the start of that stem
- choice problems must include publicContent.options and grading.correctOptionIds
- publicContent.options must be an array like [{"id":"A","label":"full option text"}, ...]; label must be the complete answer choice text and must never be only "A" / "B" / "C" / the option id
- only choice problems need generated answers: if the source has no answer key, solve the problem from the stem/options, write the inferred answer to correctOptionIds, and set sourceMeta.answerSource to "llm-solved"
- do not generate answers for non-choice problems: proof / short_answer / calculation / code and other written-response problems must not include referenceProof, referenceAnswer, analysis, non-empty acceptedForms, or model-written solutions
- keep non-choice grading minimal; use {"type":"proof"} / {"type":"short_answer"} for proof and short answer, {"type":"calculation","acceptedForms":[]} for calculation, and only necessary test/publish fields for code
- only if critical context is missing and the answer cannot be solved reliably, use the first option id as a schema placeholder and add "未识别到正确答案" to validationErrors
- code problems default to python
- if code problems miss function signature / public tests / secret tests, keep them as drafts and add validationErrors
- Output LaTeX math source directly: use $...$ for inline math and $$...$$ for long or standalone formulas
- every mathematical expression in publicContent / grading text / choice option labels must be wrapped in LaTeX delimiters
- do not emit bare math, Unicode math symbols, or plain-text math commands; for example, never write "A ⊆ X", "leq", "subseteq", or "f: X → Y"; write "$A \\subseteq X$", "$\\leq$", "$\\subseteq$", and "$f: X \\to Y$"
- do not wrap LaTeX math in additional ordinary prose parentheses
- do not invent answers for non-choice problems; only provide model-inferred answers for choice questions when the stem/options are sufficient`;
}
