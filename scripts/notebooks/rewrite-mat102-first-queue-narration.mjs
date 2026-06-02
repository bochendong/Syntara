#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const NOTEBOOK_ID = 'nb-mat102-zh-sets-propositional-logic-marker-20260529';
const QUEUE_ID = 'queue-mat102-02setsandpropositions-1';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT102', QUEUE_ID);
const NARRATION_DIR = path.join(QUEUE_DIR, 'narration');
const DRY_RUN = process.argv.includes('--dry-run');
const SEED_DB = process.argv.includes('--seed-db');

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

const NARRATION = {
  '集合与命题逻辑：证明课的第一套语言': [
    [
      '这本从集合与命题逻辑开始。第一件事不是让你背符号，而是建立证明课的第一套语言：对象、集合、成员关系和真假判断。',
      '先看这条主线。后面所有证明都会问同一个问题：我们讨论的对象是谁，它满足什么条件，最后要推出什么结论。',
    ],
    [
      '集合可以先理解成数学里的容器，但它不是随便装东西的袋子。原文强调三个词：无序、明确、互异。',
      '无序说明排列不重要，互异说明重复写很多次也只算一个元素，明确说明给定一个候选对象时，必须能判断它在不在集合里。',
    ],
    [
      '证明视角要从这里开始。只要题目出现“证明某个对象属于某集合”，你就要回到集合的条件，逐条检查这个对象是否满足。',
    ],
    [
      '本节路线其实很自然：先学集合和元素，再学集合运算，再把“属于”和“包含”变成证明模板，最后进入命题、谓词和真值表。',
    ],
    [
      '不要只看图。图像帮助定位，但 MAT102 最终要写成严谨句子：任取什么、假设什么、根据定义推出什么。',
    ],
    [
      '底部问题可以先带走：如果证明从“任取一个元素”开始，这个元素来自哪个集合？这个问题会贯穿整本笔记。',
    ],
  ],
  '集合定义：无序、明确、互异': [
    [
      '这一页先看集合的正式定义。集合是无序、明确、互异的对象集合；空集是没有元素的集合。',
      '讲这里时不要急着举例，先把“明确”说清楚：集合的边界必须清楚，不能靠个人感觉决定成员资格。',
    ],
    [
      '定义里的三个关键词要分开讲。无序意味着 A、B、C 换顺序还是同一个集合；互异意味着重复元素不会制造新元素。',
    ],
    [
      '属于关系就是元素判断。写“a 属于某集合”，是在说 a 是这个集合的一个成员；写“不属于”，是在说它没有通过成员检查。',
      '这个动作很小，但后面子集证明、集合相等证明都会从它开始。',
    ],
    [
      '例题里 A 写了重复的二和三，B 只是换了顺序，所以 A 和 B 代表同一个集合。C 的元素是两个集合，它不是把一、二、三直接放进去。',
    ],
    [
      '常见错误是把集合的大括号拆错层级。元素可以本身就是集合，所以“集合里的集合”和“集合里的数字”不是一回事。',
    ],
    ['本页底部要追问：判断两个集合是否相同，应该看写法，还是看真正包含的元素？答案是看元素。'],
  ],
  '集合描述法：用性质定义集合': [
    [
      '这一页进入集合描述法。它解决的问题是：集合太大或无限时，我们不能把每个元素都列出来。',
      '集合描述法可以读成一句话：所有满足某个性质的对象，组成一个集合。',
    ],
    [
      '核心格式里，冒号前面是变量，冒号后面是条件。讲的时候要让学生听见这个翻译：所有 a，使得 a 满足性质 P。',
    ],
    ['证明动作不是背格式，而是会做成员测试。给你一个候选元素，就把它放进条件里，检查条件真不真。'],
    [
      '例题 S 里有两个变量 x 和 y。不要直接猜答案，要先列 x 的可能值，再列 y 的可能值，最后把 x 加 y 的所有结果收集起来。',
      '如果不同组合给出同一个结果，集合里仍然只保留一次。这又回到“互异”的定义。',
    ],
    ['检查点是变量范围。只写一个性质但不说明变量来自哪里，往往会让集合变得不明确。'],
    [
      '底部问题可以这样问：我能不能用一句清楚的条件决定元素是否属于这个集合？如果可以，就能写成集合描述法。',
    ],
  ],
  常见数集与约定: [
    [
      '这一页列出常见数集。这里不是符号表，而是在给后面证明规定对象范围。',
      '证明时如果题目说 n 是整数、x 是实数、q 是有理数，允许使用的性质完全不同。',
    ],
    [
      '数集表要按包含关系讲。正整数在整数里，整数在有理数里，有理数在实数里；但每往外一层，允许的对象更多。',
    ],
    [
      '证明动作是先看对象属于哪个数集，再看能不能调用那个数集的定义。例如有理数要能写成两个整数的比，分母不能为零。',
    ],
    [
      '例子不要只报答案。负数可以是整数和有理数；二分之一是有理数但不是整数；根号二是实数但不是有理数。',
    ],
    [
      '约定提醒很重要。自然数是否包含零，不同教材可能不同，所以原文后面改用正整数和非负整数来避免歧义。',
    ],
    ['本页底部要带走：写证明前先看数集约定。对象范围没定清楚，后面的推理就容易越界。'],
  ],
  '集合运算：并、交、差': [
    [
      '这一页讲集合运算：并、交、差。三者本质上都是用成员条件筛选元素。',
      '这一页要让学生把图像语言翻译成“x 满足什么条件”。',
    ],
    [
      '并集是“在 S 中或者在 T 中”。数学里的或是包含式的或，也就是说两个集合里都在，当然也算在并集里。',
    ],
    ['交集是“同时在 S 和 T 中”。证明一个元素属于交集时，必须证明它两个集合都属于。'],
    ['差集是“在 S 中，但不在 T 中”。这里有方向，所以 S 减 T 和 T 减 S 一般不是同一个集合。'],
    [
      '例题给 S 等于 a、b、c、d，T 等于 a、b、一、二、三。逐个检查元素，就得到并集、交集和差集。',
      '讲这个例题时可以故意问：c 为什么不在交集里？因为它只在 S 里，不在 T 里。',
    ],
    ['逻辑提醒是：并对应或，交对应且，差对应“且不”。这会直接连接到后面的 AND、OR、NOT。'],
  ],
  '例题：从列举到集合描述': [
    [
      '这一页用一个完整例题，训练在列举式、文字描述和集合描述法之间来回翻译。',
      'T 是所有偶整数，S 是所有非负整数。先识别对象，再写条件。',
    ],
    [
      '对象识别时要慢一点。T 里有负的偶数、零、正的偶数，所以不能只说“自然数里的偶数”。它是整数中的偶数。',
    ],
    [
      '求并集时，规则是元素只要在 S 或 T 其中一个里就进入。于是所有非负整数都进来，负的偶整数也进来。',
    ],
    [
      '表达式可以写成：a 是偶整数，或者 a 是大于等于零的整数。这里的“或者”正是并集定义里的或。',
      '如果改成求交集，就要把“或者”换成“并且”，得到非负偶整数。',
    ],
    [
      '证明检查要问：这个描述有没有漏掉元素，有没有多收元素？集合描述法不是写得像就行，必须和原集合完全一致。',
    ],
    ['底部问题是为后面的练习准备的：同一对集合，求并、交、差时，逻辑连接词会怎样变化？'],
  ],
  '补集依赖全集 U': [
    [
      '这一页讲补集。补集最重要的不是公式，而是全集 U。',
      '没有全集，就不知道“不在 A 里”的候选对象到底从哪里选。',
    ],
    ['定义是：A 的补集包含所有在 U 里但不在 A 里的元素。所以补集其实是 U 减 A。'],
    [
      '证明动作仍然是成员测试。要证明 x 在 A 的补集中，就要证明两件事：x 在 U 里，并且 x 不在 A 里。',
    ],
    [
      '例题里如果 U 是实数，P 是正实数，那么 P 的补集是小于等于零的实数。',
      '同一个 P，如果换一个全集，补集会跟着变。这就是“补集依赖全集”的核心。',
    ],
    ['常见错误是把补集理解成“世界上所有不在 A 里的东西”。数学里必须先限定讨论范围。'],
    ['底部问题可以问：这道题的全集有没有明说？如果没有明说，能不能从上下文看出来？'],
  ],
  '笛卡尔积：有序对的集合': [
    [
      '这一页讲笛卡尔积。它和前面的集合定义形成一个对比：集合本身无序，但有序对的位置有意义。',
      'A 叉 B 收集所有第一项来自 A、第二项来自 B 的有序对。',
    ],
    ['定义里要听见两个条件：a 属于 A，b 属于 B。只有两个条件同时满足，二元组才在 A 叉 B 里。'],
    ['证明动作可以这样读：要证明一个有序对属于 A 叉 B，就分别证明第一坐标属于 A，第二坐标属于 B。'],
    [
      '例题 S 等于 a、b，T 等于一、二、三。列 S 叉 T 时，先固定 a 搭配 T 的三个元素，再固定 b 搭配三个元素。',
      '这样列能避免漏项，也能看出为什么大小通常是两个集合大小相乘。',
    ],
    [
      '陷阱是 A 叉 B 一般不等于 B 叉 A，因为有序对第一、第二位置交换后就不是同一个对象。',
      'A 叉空集也是空集，因为没有第二坐标可以选。',
    ],
    ['底部问题可以留给学生：有序对看顺序，普通集合不看顺序，这两个规则什么时候分别使用？'],
  ],
  '子集证明：任取一个元素': [
    [
      '这一页进入子集。子集是 MAT102 最重要的证明模板之一。',
      'S 包含于 T 的意思是：每个在 S 里的元素，也都在 T 里。',
    ],
    ['定义不要读成“S 比 T 小”。真正的定义是一个全称命题：对任意 x，如果 x 属于 S，那么 x 属于 T。'],
    [
      '证明模板固定是：任取 x 属于 S。接着利用 S 的定义，推出 x 属于 T。最后说因为 x 任意，所以 S 包含于 T。',
    ],
    [
      '例题 A 包含于 A 并 B 很适合练模板。任取 x 属于 A，根据并集定义，x 至少属于 A 或 B 中一个，所以 x 属于 A 并 B。',
    ],
    ['反例模板也要讲。要证明 S 不是 T 的子集，只要找一个元素在 S 里，但不在 T 里。'],
    ['底部问题是：证明子集时为什么不能只画图？因为图给直觉，证明必须覆盖任意元素。'],
  ],
  '集合相等：双向包含': [
    [
      '这一页把集合相等和子集联系起来。两个集合相等，意思是它们有完全相同的元素。',
      '证明方法就是两边包含：先证明 A 包含于 B，再证明 B 包含于 A。',
    ],
    [
      '核心定理不是新技巧，而是集合相等的定义展开。如果只证明一个方向，你只知道一个集合没有超出另一个，不能知道两者相等。',
    ],
    [
      '证明结构要成对出现。第一段任取 n 属于 A，推出 n 属于 B；第二段任取 n 属于 B，推出 n 属于 A。',
    ],
    [
      '例题里 A 是形如四 k 加一的非负整数，B 是形如四 k 减三的非负整数。两种写法看起来不同，其实描述同一类数。',
    ],
    [
      '代数改写是关键。四 k 加一可以写成四乘 k 加一再减三；反过来四 k 减三可以写成四乘 k 减一再加一。',
      '这里不是为了算数，而是为了找到另一个集合定义所需要的整数见证。',
    ],
    ['底部问题可以总结为：集合相等证明里，每个方向都要说明“见证”从哪里来。'],
  ],
  '命题：可以判定真假的句子': [
    [
      '这一页进入命题逻辑。命题就是能明确判断真假的陈述句。',
      '注意命题不一定是真的；它只需要有确定真值。',
    ],
    [
      '定义里的关键词是“要么真，要么假”。如果一句话没有真假，或者真假依赖没指定的变量，它就还不是完整命题。',
    ],
    ['证明动作是先分类。面对一个句子，先问它有没有明确真值；有真值，才谈接下来如何证明或反驳。'],
    [
      '例子 P1、P2、P3 都是命题。即使我们不知道 P2 最后是否为真，它仍然是一个会有确定结果的陈述。',
      'P3 是一个全称味道的数学陈述，但它仍然能被判断为真或假。',
    ],
    ['不是命题的句子包括命令、问题、或者变量没定的表达式。它们不能直接放进真值表。'],
    ['底部问题是：一句话能不能进入逻辑运算，先看它是不是已经有确定真值。'],
  ],
  '谓词：带变量的真值句子': [
    [
      '这一页引入谓词。谓词是带变量的真值句子；变量还没指定时，真假还没有定下来。',
      '比如“x 有绿头发”要先知道 x 是谁，才能判断真假。',
    ],
    ['定义可以这样讲：P 括号 x 是关于 x 的条件。它不是一个固定命题，而是一台等待输入的真假机器。'],
    [
      '证明动作是把谓词变成命题。方法有两种：给变量一个具体值，或者用量词绑定变量。',
      '这也是为什么下一节会自然进入“对所有”和“存在”。',
    ],
    [
      '分类练习里，“今天是星期五”是命题，“几点了”不是命题，“x 平方大于 π”是谓词。',
      '含有存在说法的句子，例如“存在整数解”，虽然看起来有变量，但整体已经是命题，因为它有确定真假。',
    ],
    ['检查点是：变量是否已经被指定或绑定？如果没有，就不要急着说真或假。'],
    ['底部问题可以问：如果我要把 P(x) 变成命题，是代入一个具体 x，还是加上一个量词？'],
  ],
  'AND、OR、NOT：复合命题': [
    [
      '这一页讲 AND、OR、NOT。它们的作用是把已经有真值的命题组合成更复杂的命题。',
      '这里要先确认 P 和 Q 本身已经是命题，而不是还没定变量的谓词。',
    ],
    [
      'AND，也就是“且”，只有两个部分都真时才真。只要其中一个假，整个且命题就是假。',
      '它和集合里的交集很像：必须同时满足两个条件。',
    ],
    [
      'OR，也就是“或”，在数学里通常是包含式的或。只要至少一个为真，整个或命题就为真；两个都真也算真。',
      '这和日常“二选一”的语气不同，要专门提醒。',
    ],
    ['NOT，也就是“非”，会翻转真假。P 真时，非 P 假；P 假时，非 P 真。'],
    [
      '真值表的作用是把所有可能输入列完。两个命题 P 和 Q 一共有四种真假组合，所以表格有四行。',
      '读表时不要跳行，要一行一行算复合命题的真值。',
    ],
    ['底部问题是：复杂表达式能不能按小块拆开，再用真值表逐列计算？'],
  ],
  '真值表证明：德摩根律': [
    [
      '这一页用真值表证明德摩根律。这里的目标是证明两个逻辑表达式等价。',
      '等价的意思是：不管 P 和 Q 的真假怎样变化，两边最终真值都一样。',
    ],
    ['目标左边是“不是 P 且 Q”。先算 P 且 Q，再取非。这样拆成中间列，就不容易错。'],
    ['表格步骤要按列推进。先列 P 和 Q 的四种可能，再列 P 且 Q，最后列非掉之后的结果。'],
    [
      '另一边是“非 P 或非 Q”。同样先列非 P、非 Q，再用或运算得到最后一列。',
      '这里的或仍然是包含式的或，所以只要非 P 或非 Q 有一个真，右边就真。',
    ],
    ['结论来自比较最后两列。四行结果完全一致，所以两个表达式逻辑等价。'],
    ['底部问题是为练习准备的：如果把非分配到 P 或 Q 上，会得到什么？这就是另一条德摩根律。'],
  ],
  '综合页：从集合语言走向量词': [
    [
      '最后一页做综合收束。它暴露了这本真正要训练的能力：把集合、证明和逻辑连接在一起。',
      '这页不是新定义，而是把工具箱整理好，准备进入量词。',
    ],
    [
      '集合工具箱包括列举、集合描述法、并交差补、笛卡尔积。每一个工具背后都是成员条件。',
      '做题时先翻译“x 属于哪个集合”，再决定要用哪个运算规则。',
    ],
    ['证明工具箱包括子集证明和集合相等证明。子集证明从任取元素开始，集合相等证明要做两个方向。'],
    [
      '逻辑工具箱包括命题、谓词、且、或、非、真值表。它们帮助我们判断一个数学句子的真假结构。',
      '特别要记住：谓词要变成命题，必须指定变量或加量词。',
    ],
    ['下一节钩子就是量词。前面反复出现“所有”“存在”“任取”，这些词会正式变成全称量词和存在量词。'],
    [
      '底部问题可以作为第一本的总检查：看到一句数学话，你能不能说出对象范围、成员条件、逻辑连接词和证明开头？',
    ],
  ],
};

function validateCoverage(files) {
  const titles = new Set(files.map((file) => file.sceneTitle));
  const missingFiles = Object.keys(NARRATION).filter((title) => !titles.has(title));
  const missingNarration = files.filter((file) => !NARRATION[file.sceneTitle]);
  if (missingFiles.length) {
    throw new Error(`Narration titles missing in queue files: ${missingFiles.join(', ')}`);
  }
  if (missingNarration.length) {
    throw new Error(
      `Queue files missing narration: ${missingNarration.map((file) => file.sceneTitle).join(', ')}`,
    );
  }
}

function buildActions(pageJson) {
  const focusRegions = pageJson.focusRegions || [];
  const groups = NARRATION[pageJson.sceneTitle];
  if (!Array.isArray(groups)) throw new Error(`No narration for ${pageJson.sceneTitle}`);
  if (focusRegions.length < groups.length) {
    throw new Error(
      `${pageJson.sceneTitle}: expected ${groups.length} focus regions, found ${focusRegions.length}`,
    );
  }

  const actions = [];
  let speechIndex = 1;
  for (const [regionIndex, lines] of groups.entries()) {
    const region = focusRegions[regionIndex];
    const actionBase = `${NOTEBOOK_ID}-p${String(pageJson.pageNumber).padStart(3, '0')}-r${String(regionIndex + 1).padStart(2, '0')}`;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `聚焦区域：${region.label}`,
      dimOpacity: 0.76,
    });

    for (const text of lines) {
      actions.push({
        id: `${actionBase}-speech-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解 ${speechIndex}`,
        text,
      });
      speechIndex += 1;
    }
  }

  return actions;
}

function validateActions(pageJson, actions) {
  const elementIds = new Set((pageJson.focusRegions || []).map((region) => region.id));
  const seen = new Set();
  for (const action of actions) {
    if (seen.has(action.id))
      throw new Error(`${pageJson.sceneTitle}: duplicate action ${action.id}`);
    seen.add(action.id);
    if (action.type === 'spotlight' && !elementIds.has(action.elementId)) {
      throw new Error(`${pageJson.sceneTitle}: invalid spotlight target ${action.elementId}`);
    }
    if (action.type === 'speech') {
      if (!action.text || /theta|pi|Week|Calculus II|Riemann|page\b|本页承接/i.test(action.text)) {
        throw new Error(`${pageJson.sceneTitle}: suspicious speech text "${action.text}"`);
      }
    }
  }
}

function loadPageFiles() {
  return fs
    .readdirSync(NARRATION_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const filePath = path.join(NARRATION_DIR, name);
      return { name, filePath, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    });
}

function writeQueueFiles(files) {
  let speechTotal = 0;
  let spotlightTotal = 0;
  const updated = [];

  for (const page of files) {
    const actions = buildActions(page);
    validateActions(page, actions);
    speechTotal += actions.filter((action) => action.type === 'speech').length;
    spotlightTotal += actions.filter((action) => action.type === 'spotlight').length;

    const nextPage = {
      ...page,
      notebookId: NOTEBOOK_ID,
      actions,
      qa: {
        ...(page.qa || {}),
        language: 'zh-CN',
        sourceBasis: 'queue source-pages/source-text extracted from original PDF',
        speechCount: actions.filter((action) => action.type === 'speech').length,
        focusCount: actions.filter((action) => action.type === 'spotlight').length,
        spotlightTargetsExist: actions
          .filter((action) => action.type === 'spotlight')
          .every((action) =>
            (page.focusRegions || []).some((region) => region.id === action.elementId),
          ),
      },
    };
    delete nextPage.name;
    delete nextPage.filePath;
    updated.push(nextPage);

    if (!DRY_RUN) {
      fs.writeFileSync(page.filePath, `${JSON.stringify(nextPage, null, 2)}\n`);
    }
  }

  return { updated, speechTotal, spotlightTotal };
}

async function seedDb(updatedPages) {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: NOTEBOOK_ID },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });
    if (!notebook) {
      console.warn(`[db] notebook not found: ${NOTEBOOK_ID}`);
      return;
    }
    if (notebook.scenes.length !== updatedPages.length) {
      throw new Error(
        `DB scene count ${notebook.scenes.length} != narration page count ${updatedPages.length}`,
      );
    }
    for (const [index, scene] of notebook.scenes.entries()) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { actions: updatedPages[index].actions },
      });
    }
    await prisma.notebook.update({
      where: { id: NOTEBOOK_ID },
      data: { updatedAt: new Date() },
    });
    console.log(`[db] updated ${NOTEBOOK_ID}; scenes=${updatedPages.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const files = loadPageFiles();
  validateCoverage(files);
  const { updated, speechTotal, spotlightTotal } = writeQueueFiles(files);
  console.log(
    `${DRY_RUN ? 'would rewrite' : 'rewrote'} ${QUEUE_ID}: pages=${updated.length}, speech=${speechTotal}, spotlight=${spotlightTotal}`,
  );
  if (SEED_DB && !DRY_RUN) await seedDb(updated);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
