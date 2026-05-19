import type { SceneOutline } from '@/lib/types/generation';

export function formatLayoutIntentForPrompt(
  outline: SceneOutline,
  language: 'zh-CN' | 'en-US',
): string {
  const intent = outline.layoutIntent;
  if (!intent) return '';
  const templateContract = intent.layoutTemplate
    ? formatClassicTemplateContractForPrompt(intent.layoutTemplate, language)
    : '';
  const mathComparisonContract =
    intent.layoutTemplate === 'comparison_matrix' &&
    (outline.contentProfile === 'math' || intent.disciplineStyle === 'math')
      ? language === 'zh-CN'
        ? [
            '数学 comparison_matrix 额外硬约束：',
            '- 必须用 table 生成 4 列：`要判断的句子|定义展开|要找什么|证明动作`。',
            '- 不要使用通用方案表列头，例如“方案/速度/一致性/适用场景”，也不要改成“定义/含义/应用场景”。',
            '- 每行要把一个数学对象或语句转成可证明条件；至少一行必须包含 PagePlan 的具体入口公式或等价完整定义。',
            '- 不要生成输入没有给出的恒等式、定理或额外结论。',
            '- 推荐骨架（替换内容，不要照抄占位词）：',
            '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=math,language=zh-CN]',
            '    \\table[headers={要判断的句子|定义展开|要找什么|证明动作}]{数学语句 A|定义展开 A|需要找到的对象|对应证明动作 \\\\ 数学语句 B|定义展开 B|需要检查的条件|对应证明动作 \\\\ 关键区别|定义边界|要避免的误解|对应检查动作}',
            '    \\summary{阅读规则}{一句话说明学生如何按表格使用这些定义。}',
            '  \\end{slide}',
          ].join('\n')
        : [
            'Extra hard constraint for math comparison_matrix:',
            '- The table must use exactly 4 columns: `Statement|Definition expanded|What to find|Proof action`.',
            '- Do not use generic option-table headers such as "Option/Speed/Consistency/Use case", and do not switch to static columns such as "Definition/Meaning/Application".',
            '- Each row must turn one mathematical object or statement into a provable condition; at least one row must include the PagePlan concrete anchor formula or an equivalent complete definition.',
            '- Do not invent identities, theorems, or extra conclusions that the input did not provide.',
            '- Suggested skeleton (replace content; do not copy placeholders):',
            '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=math,language=en-US]',
            '    \\table[headers={Statement|Definition expanded|What to find|Proof action}]{Statement A|Definition expansion A|Object to find|Proof action \\\\ Statement B|Definition expansion B|Condition to check|Proof action \\\\ Key distinction|Boundary from the definition|Misconception to avoid|Check to apply}',
            '    \\summary{Reading rule}{One sentence explaining how students should use these definitions.}',
            '  \\end{slide}',
          ].join('\n')
      : '';
  if (language === 'zh-CN') {
    return [
      '版式意图（硬约束）：',
      `- layoutFamily: ${intent.layoutFamily}`,
      `- layoutTemplate: ${intent.layoutTemplate || 'auto'}`,
      `- disciplineStyle: ${intent.disciplineStyle || 'general'}`,
      `- teachingFlow: ${intent.teachingFlow || 'standalone'}`,
      `- density: ${intent.density || 'standard'}`,
      `- deckStyle: ${intent.deckStyle || 'classic_business'}`,
      `- visualRole: ${intent.visualRole || 'none'}`,
      `- backgroundStyleId: ${intent.backgroundStyleId || 'auto'}`,
      `- overflowPolicy: ${intent.overflowPolicy || 'compress_first'}`,
      `- preserveFullProblemStatement: ${intent.preserveFullProblemStatement ? 'true' : 'false'}`,
      '- 默认生成一张固定 16:9 的可编辑 PPT 页面：一个主结构、短文本、无隐藏溢出；表格/流程/卡片/公式都要在 renderer 画布内可读。',
      '- 封面页是例外：只输出主视觉、标题和一句短副标题/元信息，不承载正文教学结构。',
      '- code_split 是例外：优先保留关键代码和 trace/state 结构；必要时可以按 overflowPolicy 分页，但不能退成普通 bullet_list。',
      '- 只输出结构化内容和这些版式意图；不要输出坐标。renderer 会决定布局。',
      '- 如果 preserveFullProblemStatement=true，题干完整性优先于压缩。',
      templateContract,
      mathComparisonContract,
    ].join('\n');
  }
  return [
    'Layout intent (hard constraint):',
    `- layoutFamily: ${intent.layoutFamily}`,
    `- layoutTemplate: ${intent.layoutTemplate || 'auto'}`,
    `- disciplineStyle: ${intent.disciplineStyle || 'general'}`,
    `- teachingFlow: ${intent.teachingFlow || 'standalone'}`,
    `- density: ${intent.density || 'standard'}`,
    `- deckStyle: ${intent.deckStyle || 'classic_business'}`,
    `- visualRole: ${intent.visualRole || 'none'}`,
    `- backgroundStyleId: ${intent.backgroundStyleId || 'auto'}`,
    `- overflowPolicy: ${intent.overflowPolicy || 'compress_first'}`,
    `- preserveFullProblemStatement: ${intent.preserveFullProblemStatement ? 'true' : 'false'}`,
    '- Default target is one fixed 16:9 editable PPT slide: one primary structure, compact text, no hidden overflow; tables, processes, cards, and formulas must remain readable inside the renderer canvas.',
    '- Cover pages are the exception: output only the main visual, title, and one short subtitle/meta line, not body teaching structures.',
    '- code_split is the exception: preserve the key code and trace/state structure first; paginate according to overflowPolicy if needed, but do not degrade into an ordinary bullet_list.',
    '- Output structured content and these layout fields only; do not output coordinates.',
    '- If preserveFullProblemStatement=true, preserve the readable problem statement before compressing.',
    templateContract,
    mathComparisonContract,
  ].join('\n');
}

function formatClassicTemplateContractForPrompt(
  template: string,
  language: 'zh-CN' | 'en-US',
): string {
  if (language === 'zh-CN') {
    if (template === 'image_title_overlay') {
      return [
        '- image_title_overlay 的 renderer 输入结构：一张 visual + 1 个短副标题/说明；只有输入中真的有课程名、来源、日期或场景标签时，才加 1 个短标签。',
        '- 这是图片优先的封面/章节页：图片铺满 16:9，renderer 会加深色遮罩，并把标题压在左侧。',
        '- visual 只负责指定背景来源，不承载正文；不要把“封面主视觉/图片/背景图/路线图/阶段”这类占位说明写成 text 或 callout。',
        '- 不要输出 cards、table、process、长讲稿；本页只建立情绪、主题和入口。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=image_title_overlay,density=light,profile=general,language=zh-CN]',
        '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
        '    \\text{一句短副标题，说明这页要把学生带入什么主题。}',
        '    % 可选：只有真实章节/时间/来源标签时才加 \\callout{真实标签}{很短的信息}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'cinematic_title_frame') {
      return [
        '- cinematic_title_frame 的 renderer 输入结构：一张 visual + 1 个短副标题/说明；只有输入中真的有来源、日期或上下文时才加短元信息。',
        '- 这是电影感标题页：图片铺满 16:9，标题居中，renderer 会加深色遮罩和装饰角标。',
        '- visual 只负责指定背景来源，不承载正文；不要把“电影感主视觉/封面图片/背景图”等占位说明写成 text 或 callout。',
        '- 适合影片/MV/文学艺术/暗色主题的章节封面；不要输出正文卡片、表格或流程。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=cinematic_title_frame,density=light,profile=general,language=zh-CN]',
        '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
        '    \\text{一句短副标题，点出本页的解析角度。}',
        '    % 可选：只有真实来源/日期/章节信息时才加 \\callout{真实标签}{很短的信息}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'tech_hero_title') {
      return [
        '- tech_hero_title 的 renderer 输入结构：一张 visual + 1 个短副标题/说明；只有输入明确提供 edition/date 时才加版本/日期信息。',
        '- 这是科技/SaaS/产品发布感标题页：图片铺满 16:9，标题居中，renderer 会做暗色叠加和橙色小信息。',
        '- visual 只负责指定背景来源，不承载正文；不要把“科技感主视觉/封面图片/背景图”等占位说明写成 text 或 callout。',
        '- 不要输出 cards、table、process 或长段落；用标题和一句副标题完成开场。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=tech_hero_title,density=light,profile=general,language=zh-CN]',
        '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
        '    \\text{一句短副标题，说明产品/主题/价值判断。}',
        '    % 可选：只有真实 edition/date 时才加 \\callout{真实版本或日期}{很短的信息}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'pipeline_table') {
      return [
        '- pipeline_table 的 renderer 输入结构：一个短引入 + 2-4 步 process + 3-6 行 table；默认写 3 步 process 和 3 行 table。',
        '- 这类页面要同时给出“判断/流程”和“对照/证据表”，否则不是完整 pipeline_table 页面。',
        '- 表格行必须复用 PagePlan / source facts 里的具体样本、代码 literal、数据点或对象名；不要只写“对象 A / 问题 B”这类泛称。',
        '- table 必须使用 `\\table[headers={...}]{...}` 语义命令输出，不要写成普通正文。',
        '- 推荐骨架（替换占位内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=pipeline_table,density=standard,profile=general,language=zh-CN]',
        '    \\text{用一句话说明本页要判断的对象、旧表示或流程。}',
        '    \\begin{process}[title={判断路径},orientation=horizontal]',
        '      \\step{先看对象}{这个对象需要一起维护哪些状态或阶段}',
        '      \\step{再看旧表示}{旧表示会接受哪些不该接受的状态}',
        '      \\step{最后定边界}{新表示要把哪些规则集中起来}',
        '    \\end{process}',
        '    \\table[headers={对象/表示|会被接受的问题|暴露的边界}]{对象 A|具体错误状态|为什么守不住规则 \\\\ 对象 B|具体错误状态|为什么守不住规则 \\\\ 新表示|集中什么规则|学生应带走的结论}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'comparison_matrix') {
      return [
        '- comparison_matrix 的 renderer 输入结构：一个对照矩阵 table 为主体，可选 1 个短 takeaway/callout。',
        '- 适合方案比较、维度比较、优缺点、证据矩阵；不要把表格改写成 bullet_list 或多张普通卡片。',
        '- 表格必须有 3-5 个清晰列头，3-6 行；每一行都使用输入中的具体方案、指标、样本或数据点。',
        '- table 必须使用 `\\table[headers={...}]{...}` 语义命令输出，并且每一行单元格数量必须等于 headers 数量。',
        '- 推荐骨架（替换占位内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=general,language=zh-CN]',
        '    \\table[headers={方案|速度|一致性|适用场景}]{具体方案 A|具体判断|具体判断|具体场景 \\\\ 具体方案 B|具体判断|具体判断|具体场景 \\\\ 具体方案 C|具体判断|具体判断|具体场景}',
        '    \\summary{选择规则}{一句话说明学生应如何根据表格做判断。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'process_steps') {
      return [
        '- process_steps 的 renderer 输入结构：一个短上下文 + 3-5 步 process_flow + 可选 1 个短总结。',
        '- 适合流程图、阶段路径、决策链或工作流；不要用表格或四张卡代替流程主体。',
        '- 每个 step 标题用动作短语，正文说明进入下一步的条件或产出；步骤之间必须按时间、依赖或判断顺序排列。',
        '- process 必须使用 `\\begin{process} ... \\step{...}{...} ... \\end{process}` 语义结构输出。',
        '- 推荐骨架（替换占位内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=process_steps,density=standard,profile=general,language=zh-CN]',
        '    \\text{一句话说明这条流程解决什么具体问题。}',
        '    \\begin{process}[title={流程图},orientation=horizontal]',
        '      \\step{第一步动作}{具体输入、动作或进入条件。}',
        '      \\step{第二步动作}{具体输入、动作或进入条件。}',
        '      \\step{第三步动作}{具体输入、动作或进入条件。}',
        '      % 如输入明确有第四/第五步，可继续加 step；不要超过 5 步',
        '    \\end{process}',
        '    \\summary{下一步}{一句话说明走完流程后如何行动。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'visual_three_steps') {
      return [
        '- visual_three_steps 的 renderer 输入结构：短解释 + visual + 正好 3 个 step/card。',
        '- 短解释或第一张卡必须直接使用 PagePlan 的具体入口；每张卡正文只写 1-2 个短句，不要把任何结构命令写进卡片正文。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=visual_three_steps,density=standard,profile=general,language=zh-CN]',
        '    \\text{一句话说明为什么要按这三步看。}',
        '    \\visual[source=gen_img_1]{说明这个图和三步判断的关系}',
        '    \\begin{cards}[columns=3]',
        '      \\card{第一步}{一个具体判断句，带必要代码 literal。}',
        '      \\card{第二步}{一个具体判断句，带必要代码 literal。}',
        '      \\card{第三步}{一个具体判断句，带必要代码 literal。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'two_by_one_summary') {
      return [
        '- two_by_one_summary 的 renderer 输入结构：上方两组简洁要点 + 底部 summary/callout。',
        '- 输出 3 个顶层文本块：左栏 point group、右栏 point group、底部总结；不要只写一个 bullet_list。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=two_by_one_summary,density=standard,profile=general,language=zh-CN]',
        '    \\callout{第一组要点}{2-3 个短句，说明一侧结论或问题。}',
        '    \\callout{第二组要点}{2-3 个短句，说明另一侧结论或职责。}',
        '    \\summary{可迁移结论}{一句话收束学生下次可以照做的判断顺序。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'definition_board') {
      return [
        '- definition_board 的 renderer 输入结构：1 个短 definition/callout + 2 个短判断/例子卡 + 可选 1 句 takeaway。',
        '- 这类页面用于“先把定义边界讲清楚”，不是逐步推导页；不要输出 derivation_steps、长 proof、长 bullet_list。',
        '- definition/callout 必须包含本页具体入口里的一个符号、公式或例子；卡片只写短判断，不写完整讲稿。',
        '- 如果 PagePlan 具体入口是 `{(2, ♡), ...}` 这样的样本，必须把它原样放进 callout 或其中一张卡；不能替换成“某个关系/一个样本”。',
        '- 严禁使用 bullet_list，也不要在正文里写 `•`、编号列表或多行清单；每个文本块只写 1 个完整短句。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=definition_board,density=standard,profile=math,language=zh-CN]',
        '    \\callout{定义边界}{一句话给出定义，并包含一个来自输入的具体符号或例子。}',
        '    \\begin{cards}[columns=2]',
        '      \\card{要检查什么}{一句话说明定义要求。}',
        '      \\card{哪里会出错}{一句话说明常见误读或反例。}',
        '    \\end{cards}',
        '    \\summary{带走的判断}{一句话说明学生下一页要如何使用这个定义。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'formula_focus') {
      return [
        '- formula_focus 的 renderer 输入结构：1 个主 `\\formula{...}` + 2-3 个短解释块。',
        '- 主公式必须直接使用 PagePlan 的具体入口或等价完整公式；不要用泛泛的 `f:A\\to B` 替代本页真正要讲的公式。',
        '- `\\formula{...}` 里面只能放纯 LaTeX 数学表达式，不要写“已知/目标/因此/where/given”这类自然语言；这些说明放进 callout 或 summary。',
        '- 解释块用中文短句说明符号含义、判定条件和常见误读；不要写长 bullet_list。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=formula_focus,density=standard,profile=math,language=zh-CN]',
        '    \\formula{\\frac{dy}{dx}=f^{\\prime}(g(x))\\cdot g^{\\prime}(x)}',
        '    \\callout{怎么读}{一句话解释公式左边和右边分别是什么。}',
        '    \\callout{判定条件}{一句话说明学生要检查哪个条件。}',
        '    \\summary{别误读}{一句话点出最容易混淆的边界。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'derivation_ladder') {
      return [
        '- derivation_ladder 的 renderer 输入结构：1 个“已知/目标”短 setup + 1 个 derivation + 1 个“下一步检查”短结论。',
        '- 数学证明/例题页必须有 3-5 个连续 proof step；每个 step 只写一个公式或判断，并写清这一步凭什么合法。',
        '- 不要只给两个大卡片或结论卡；不要把定义、例题和总结压成空泛短句。',
        '- 推荐骨架（替换内容，不要照抄占位词）：',
        '  \\begin{slide}[title={...},template=derivation_ladder,density=standard,profile=math,language=zh-CN]',
        '    \\callout{已知 / 目标}{已知写对象范围；目标写要证明或要判定的语句。}',
        '    \\begin{derivation}[title={证明链}]',
        '      \\step{认定义入口}{写出来自输入的定义或目标公式}',
        '      \\step{改写成可检查条件}{把“属于/相等/存在”改写成一个可证明条件}',
        '      \\step{推出目标或下一步}{写出因此要检查的下一件事}',
        '    \\end{derivation}',
        '    \\summary{下一步检查}{一句话说明学生接下来应该验证哪个条件，避免哪个误读。}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'three_cards') {
      return [
        '- three_cards 的 renderer 输入结构：正好 3 个并列概念/判断卡片；每张卡只讲一个概念，标题短，正文短。',
        '- 使用 cards 环境输出 3 张卡，不要用普通 paragraph/bullet/process 代替。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=three_cards,density=standard,profile=general,language=zh-CN]',
        '    \\begin{cards}[columns=3]',
        '      \\card{概念一}{一句定义 + 一个来自输入的具体例子。}',
        '      \\card{概念二}{一句定义 + 一个来自输入的具体例子。}',
        '      \\card{概念三}{一句定义 + 一个来自输入的具体例子。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'text_image_split') {
      return [
        '- text_image_split 的 renderer 输入结构：左侧一块短文本，右侧一张 visual。',
        '- 文本只承载本页主判断，并且必须直接使用 PagePlan 的具体入口；图片承载示意图、截图、流程图或对象图。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=text_image_split,density=standard,profile=general,language=zh-CN]',
        '    \\callout{核心判断}{2-3 个短句，说明学生看图前要抓住什么。}',
        '    \\visual[source=gen_img_1]{说明图片如何支撑这个判断}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'four_columns') {
      return [
        '- four_columns 的 renderer 输入结构：正好 4 个并列短卡片，适合四类/四步/四个误区。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=four_columns,density=standard,profile=general,language=zh-CN]',
        '    \\begin{cards}[columns=4]',
        '      \\card{第一类}{一句话说明，带本页具体例子。}',
        '      \\card{第二类}{一句话说明，带本页具体例子。}',
        '      \\card{第三类}{一句话说明，带本页具体例子。}',
        '      \\card{第四类}{一句话说明，带本页具体例子。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'grid_2x2') {
      return [
        '- grid_2x2 的 renderer 输入结构：正好 4 张卡，columns=2，适合四象限、2x2 对比或四个概念分组。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=grid_2x2,density=standard,profile=general,language=zh-CN]',
        '    \\begin{cards}[columns=2]',
        '      \\card{左上}{一个具体点。}',
        '      \\card{右上}{一个具体点。}',
        '      \\card{左下}{一个具体点。}',
        '      \\card{右下}{一个具体点。}',
        '    \\end{cards}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'two_text_image') {
      return [
        '- two_text_image 的 renderer 输入结构：左侧两块短文本，右侧一张 visual。',
        '- 第一块文本必须直接使用 PagePlan 的具体入口；两块文本分别承担“先看什么 / 再看什么”或“问题 / 规则”的关系。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=two_text_image,density=standard,profile=general,language=zh-CN]',
        '    \\callout{先看什么}{1-2 个短句，说明第一块判断。}',
        '    \\callout{再看什么}{1-2 个短句，说明第二块判断。}',
        '    \\visual[source=gen_img_1]{说明图片如何连接两块文本}',
        '  \\end{slide}',
      ].join('\n');
    }
    if (template === 'code_split') {
      return [
        '- code_split 的 renderer 输入结构：一个完整 trace/code_walkthrough block；必须同时有代码和执行/状态变化，不要把代码改写成 bullet_list。',
        '- 如果 PagePlan 要求 trace，就优先使用 trace 环境，并在每个 step 里写当前行读了什么、改了什么、状态变成什么。',
        '- 推荐骨架：',
        '  \\begin{slide}[title={...},template=code_split,density=standard,profile=code,language=zh-CN]',
        '    \\begin{trace}[title={执行追踪},lang=python,activeLines={2|3|4}]',
        '      \\code[lang=python]{把输入中的关键代码原样放在这里}',
        '      \\step[line=2,state={self=新 Tweet 对象}]{创建对象入口，并把新对象交给 `self`。}',
        '      \\step[line=3,state={self.userid=who}]{读取参数并写入实例属性。}',
        '      \\step[line=6,state={self.likes=0}]{初始化对象自己的默认状态。}',
        '    \\end{trace}',
        '  \\end{slide}',
      ].join('\n');
    }
  }

  if (template === 'image_title_overlay') {
    return [
      '- image_title_overlay renderer input: one visual + one short subtitle/description; add a short label only when the input includes a real course/source/date/context label.',
      '- This is an image-first cover/section page: the image fills 16:9, and the renderer places a dark overlay with left-aligned title text.',
      '- The visual command only specifies the background source; do not repeat placeholder words like cover image, main image, background image, roadmap, stage, or QA placeholder in text/callout blocks.',
      '- Do not output cards, tables, processes, or narration; the page establishes mood, topic, and entry point.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=image_title_overlay,density=light,profile=general,language=en-US]',
      '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
      '    \\text{One short subtitle stating the topic or promise.}',
      '    % Optional only for a real chapter/time/source label: \\callout{Real label}{Very short info}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'cinematic_title_frame') {
    return [
      '- cinematic_title_frame renderer input: one visual + one short subtitle/description; add a short meta line only when the input includes a real source/date/context.',
      '- This is a cinematic title page: the image fills 16:9, with centered title text, dark overlay, and decorative corner brackets.',
      '- The visual command only specifies the background source; do not repeat placeholder words like cinematic cover image, background image, roadmap, stage, or QA placeholder in text/callout blocks.',
      '- Use for film/MV/literature/art/dark editorial section covers; do not output body cards, tables, or workflows.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=cinematic_title_frame,density=light,profile=general,language=en-US]',
      '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
      '    \\text{One short subtitle naming the analysis angle.}',
      '    % Optional only for a real source/date/section label: \\callout{Real label}{Very short info}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'tech_hero_title') {
    return [
      '- tech_hero_title renderer input: one visual + one short subtitle/description; add edition/date meta only when the input explicitly includes it.',
      '- This is a tech/SaaS/product-launch title page: the image fills 16:9, title is centered, and the renderer adds a dark overlay plus small accent meta.',
      '- The visual command only specifies the background source; do not repeat placeholder words like tech cover image, background image, roadmap, stage, or QA placeholder in text/callout blocks.',
      '- Do not output cards, tables, processes, or long prose; title and one subtitle should carry the opening.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=tech_hero_title,density=light,profile=general,language=en-US]',
      '    \\visual[source=built_in_hero_background,role=source_image,fit=cover]',
      '    \\text{One short subtitle stating the product, topic, or value judgment.}',
      '    % Optional only for a real edition/date: \\callout{Real edition or date}{Very short info}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'pipeline_table') {
    return [
      '- pipeline_table renderer input: one short lead + a 2-4 step process + a 3-6 row table; default to 3 process steps and 3 table rows.',
      '- The page needs both a judgment/process path and a comparison/evidence table to be a complete pipeline_table page.',
      '- Table rows must reuse concrete examples, code literals, data points, or object names from the PagePlan / source facts; do not use generic placeholders only.',
      '- The table must use the `\\table[headers={...}]{...}` semantic command; do not write it as prose.',
      '- Recommended skeleton (replace placeholders; do not copy placeholder words):',
      '  \\begin{slide}[title={...},template=pipeline_table,density=standard,profile=general,language=en-US]',
      '    \\text{One sentence stating the object, old representation, or workflow being judged.}',
      '    \\begin{process}[title={Judgment path},orientation=horizontal]',
      '      \\step{Read the object}{Which state or stages must stay together}',
      '      \\step{Test the old form}{Which invalid states the old form still accepts}',
      '      \\step{Set the boundary}{Which rules the new representation centralizes}',
      '    \\end{process}',
      '    \\table[headers={Object / form|Accepted problem|Boundary exposed}]{Object A|Concrete invalid state|Why the rule is not protected \\\\ Object B|Concrete invalid state|Why the rule is not protected \\\\ New form|Centralized rule|Student takeaway}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'comparison_matrix') {
    return [
      '- comparison_matrix renderer input: a comparison table/matrix as the main block, with an optional short takeaway/callout.',
      '- Use it for comparing options, dimensions, tradeoffs, evidence, or pros/cons; do not rewrite the matrix as a bullet list or generic cards.',
      '- The table needs 3-5 clear headers and 3-6 rows; each row must use concrete options, metrics, samples, or data points from the input.',
      '- The table must use the `\\table[headers={...}]{...}` semantic command, and every row must match the number of headers.',
      '- Recommended skeleton (replace placeholders; do not copy placeholder words):',
      '  \\begin{slide}[title={...},template=comparison_matrix,density=standard,profile=general,language=en-US]',
      '    \\table[headers={Option|Speed|Consistency|Best use}]{Concrete option A|Concrete judgment|Concrete judgment|Concrete context \\\\ Concrete option B|Concrete judgment|Concrete judgment|Concrete context \\\\ Concrete option C|Concrete judgment|Concrete judgment|Concrete context}',
      '    \\summary{Decision rule}{One sentence explaining how students should decide from the matrix.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'process_steps') {
    return [
      '- process_steps renderer input: one short context lead + a 3-5 step process_flow + an optional short summary.',
      '- Use it for flowcharts, stage paths, decision chains, or workflows; do not replace the process with a table or four generic cards.',
      '- Each step title should be an action phrase, and each body should state the input, action, output, or condition for entering the next step.',
      '- The process must use `\\begin{process} ... \\step{...}{...} ... \\end{process}` as a semantic structure.',
      '- Recommended skeleton (replace placeholders; do not copy placeholder words):',
      '  \\begin{slide}[title={...},template=process_steps,density=standard,profile=general,language=en-US]',
      '    \\text{One sentence naming the concrete problem this flow solves.}',
      '    \\begin{process}[title={Flow},orientation=horizontal]',
      '      \\step{First action}{Concrete input, action, output, or entry condition.}',
      '      \\step{Second action}{Concrete input, action, output, or entry condition.}',
      '      \\step{Third action}{Concrete input, action, output, or entry condition.}',
      '      % Add a fourth/fifth step only when the input clearly requires it; do not exceed 5 steps',
      '    \\end{process}',
      '    \\summary{Next move}{One sentence explaining what to do after the flow.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'visual_three_steps') {
    return [
      '- visual_three_steps renderer input: short explanation + visual + exactly 3 steps/cards.',
      '- The short explanation or first card must directly use the PagePlan concrete anchor; each card body is only 1-2 short sentences and must not contain structural commands.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=visual_three_steps,density=standard,profile=general,language=en-US]',
      '    \\text{One sentence explaining why these three steps matter.}',
      '    \\visual[source=gen_img_1]{How the visual supports the three-step decision}',
      '    \\begin{cards}[columns=3]',
      '      \\card{Step one}{One concrete judgment sentence with needed code literals.}',
      '      \\card{Step two}{One concrete judgment sentence with needed code literals.}',
      '      \\card{Step three}{One concrete judgment sentence with needed code literals.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'two_by_one_summary') {
    return [
      '- two_by_one_summary renderer input: two concise point groups plus one bottom summary/callout.',
      '- Output 3 top-level text blocks: left point group, right point group, bottom takeaway; do not output only one bullet list.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=two_by_one_summary,density=standard,profile=general,language=en-US]',
      '    \\callout{First point group}{2-3 short sentences about one side of the conclusion.}',
      '    \\callout{Second point group}{2-3 short sentences about the other side.}',
      '    \\summary{Transfer rule}{One sentence students can reuse next time.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'definition_board') {
    return [
      '- definition_board renderer input: 1 short definition/callout + 2 compact judgment/example cards + optional 1-sentence takeaway.',
      '- This page clarifies the boundary of a definition; it is not a step-by-step derivation page. Do not output derivation_steps, long proofs, or long bullet lists.',
      '- The definition/callout must include one concrete symbol, formula, or example from the PagePlan; cards should be short judgments, not narration.',
      '- If the PagePlan concrete anchor is a sample like `{(2, ♡), ...}`, copy it exactly into the callout or one card; do not replace it with "a relation" or "an example".',
      '- Do not use bullet_list and do not place bullets, numbered lists, or multi-line lists inside visible text; each text block should be one complete short sentence.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=definition_board,density=standard,profile=math,language=en-US]',
      '    \\callout{Definition boundary}{One sentence defining the object, including one concrete symbol or example from the input.}',
      '    \\begin{cards}[columns=2]',
      '      \\card{What must hold}{One sentence stating the definition requirement.}',
      '      \\card{What can fail}{One sentence naming the common misread or counterexample.}',
      '    \\end{cards}',
      '    \\summary{Use next}{One sentence saying how students should use this definition on the next page.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'formula_focus') {
    return [
      '- formula_focus renderer input: one primary `\\formula{...}` plus 2-3 compact explanation blocks.',
      '- The primary formula must directly use the PagePlan concrete anchor or an equivalent complete formula; do not replace the real formula with a generic `f:A\\to B` label.',
      '- `\\formula{...}` must contain only pure LaTeX math, not prose such as "given", "where", "therefore", or "target"; put those explanations in callout or summary blocks.',
      '- Explanation blocks should be short student-facing sentences about symbol meaning, the condition to check, and the common misread; do not output a long bullet_list.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=formula_focus,density=standard,profile=math,language=en-US]',
      '    \\formula{\\frac{dy}{dx}=f^{\\prime}(g(x))\\cdot g^{\\prime}(x)}',
      '    \\callout{How to read it}{One sentence explaining the two sides of the formula.}',
      '    \\callout{Condition to check}{One sentence naming the condition students must verify.}',
      '    \\summary{Do not misread}{One sentence naming the most common boundary error.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'derivation_ladder') {
    return [
      '- derivation_ladder renderer input: 1 short given/goal setup + 1 derivation block + 1 short next-check conclusion.',
      '- Math proof/worked-example pages need 3-5 connected proof steps; each step contains one formula or judgment and names why the move is legal.',
      '- Do not output only two broad cards or conclusion cards; do not compress the definition, example, and summary into vague short notes.',
      '- Recommended skeleton (replace the content; do not copy placeholders):',
      '  \\begin{slide}[title={...},template=derivation_ladder,density=standard,profile=math,language=en-US]',
      '    \\callout{Given / Goal}{State the object range as the given, then state the exact statement to prove or test.}',
      '    \\begin{derivation}[title={Proof chain}]',
      '      \\step{Enter the definition}{Write the definition or target formula from the input}',
      '      \\step{Rewrite as a checkable condition}{Turn membership/equality/existence into one provable condition}',
      '      \\step{Return to the goal}{State what this proves or what must be checked next}',
      '    \\end{derivation}',
      '    \\summary{Next check}{One sentence naming the next condition students should verify and the misread to avoid.}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'three_cards') {
    return [
      '- three_cards renderer input: exactly 3 parallel concept/judgment cards; each card needs a short title and compact body.',
      '- Use the cards environment for 3 cards; do not replace it with paragraphs, bullets, or a process.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=three_cards,density=standard,profile=general,language=en-US]',
      '    \\begin{cards}[columns=3]',
      '      \\card{Concept one}{One definition sentence plus one concrete example from the input.}',
      '      \\card{Concept two}{One definition sentence plus one concrete example from the input.}',
      '      \\card{Concept three}{One definition sentence plus one concrete example from the input.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'text_image_split') {
    return [
      '- text_image_split renderer input: one compact text block on the left plus one visual on the right.',
      '- The text carries the main judgment and must directly use the PagePlan concrete anchor; the visual carries the diagram, screenshot, workflow, or object model.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=text_image_split,density=standard,profile=general,language=en-US]',
      '    \\callout{Core judgment}{2-3 short sentences telling students what to notice before reading the visual.}',
      '    \\visual[source=gen_img_1]{How the visual supports this judgment}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'four_columns') {
    return [
      '- four_columns renderer input: exactly 4 parallel compact cards for four categories, steps, principles, or pitfalls.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=four_columns,density=standard,profile=general,language=en-US]',
      '    \\begin{cards}[columns=4]',
      '      \\card{First}{One sentence with a concrete example from the input.}',
      '      \\card{Second}{One sentence with a concrete example from the input.}',
      '      \\card{Third}{One sentence with a concrete example from the input.}',
      '      \\card{Fourth}{One sentence with a concrete example from the input.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'grid_2x2') {
    return [
      '- grid_2x2 renderer input: exactly 4 cards with columns=2 for a quadrant, 2x2 comparison, or four grouped concepts.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=grid_2x2,density=standard,profile=general,language=en-US]',
      '    \\begin{cards}[columns=2]',
      '      \\card{Top left}{One concrete point.}',
      '      \\card{Top right}{One concrete point.}',
      '      \\card{Bottom left}{One concrete point.}',
      '      \\card{Bottom right}{One concrete point.}',
      '    \\end{cards}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'two_text_image') {
    return [
      '- two_text_image renderer input: two compact text blocks on the left plus one visual on the right.',
      '- The first text block must directly use the PagePlan concrete anchor; the two blocks should form a clear pair such as "first look / then look" or "problem / rule".',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=two_text_image,density=standard,profile=general,language=en-US]',
      '    \\callout{First look}{1-2 short sentences for the first judgment.}',
      '    \\callout{Then look}{1-2 short sentences for the second judgment.}',
      '    \\visual[source=gen_img_1]{How the visual connects the two text blocks}',
      '  \\end{slide}',
    ].join('\n');
  }
  if (template === 'code_split') {
    return [
      '- code_split renderer input: one complete trace/code_walkthrough block; it must include both code and execution/state changes, not prose bullets.',
      '- If the PagePlan requires trace, prefer a trace environment and explain what the current line reads, what changes, and what the state becomes.',
      '- Recommended skeleton:',
      '  \\begin{slide}[title={...},template=code_split,density=standard,profile=code,language=en-US]',
      '    \\begin{trace}[title={Execution trace},lang=python,activeLines={2|3|4}]',
      '      \\code[lang=python]{paste the key code from the input here}',
      '      \\step[line=2,state={self=new Tweet object}]{Create the object entrance and bind the new object to `self`.}',
      '      \\step[line=3,state={self.userid=who}]{Read the parameter and write the instance attribute.}',
      '      \\step[line=6,state={self.likes=0}]{Initialize the object-owned default state.}',
      '    \\end{trace}',
      '  \\end{slide}',
    ].join('\n');
  }
  return '';
}
