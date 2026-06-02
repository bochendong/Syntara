#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const QUEUE_ID = 'queue-mat102-04relations';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT102', QUEUE_ID);
const NOTEBOOK_PATH = path.join(QUEUE_DIR, 'notebook.json');
const DRY_RUN = process.argv.includes('--dry-run');

const SOURCE_SCALE = 1.6;

const REGION_LAYOUT = [
  { role: 'header', canvasRect: { left: 70, top: 34, width: 860, height: 72 } },
  { role: 'definition', canvasRect: { left: 70, top: 126, width: 395, height: 150 } },
  { role: 'example', canvasRect: { left: 535, top: 126, width: 395, height: 150 } },
  { role: 'proof', canvasRect: { left: 70, top: 304, width: 395, height: 150 } },
  { role: 'pitfall', canvasRect: { left: 535, top: 304, width: 395, height: 150 } },
  { role: 'takeaway', canvasRect: { left: 100, top: 480, width: 800, height: 54 } },
];

const PAGES = [
  {
    pageNumber: 1,
    title: '反证法与关系：比较对象的语言',
    sections: [
      {
        label: '本节主线',
        lines: [
          '这本从反证法开始，再进入关系。关系的作用是描述两个对象之间的比较：相等、小于、整除、属于同一类，都是关系的例子。',
          '所以这本不是只学新定义，而是在训练两件事：怎样反证，怎样检查一个比较规则有什么性质。',
        ],
      },
      {
        label: '反证法想法',
        lines: ['反证法的开头是：为了证明命题 T 为真，先假设 T 为假。然后从这个假设推出矛盾。'],
      },
      {
        label: '矛盾形式',
        lines: [
          '矛盾通常写成 R 且非 R。一个句子不能同时为真又为假，所以一旦推出这种情况，原先的反面假设就站不住。',
        ],
      },
      {
        label: '真值表意义',
        lines: [
          '真值表不是装饰，它说明“证明 T”和“证明非 T 会导致矛盾”在逻辑上等价。',
          '也就是说，反证法不是拍脑袋的技巧，而是有真值表支撑的证明方法。',
        ],
      },
      {
        label: '写作模板',
        lines: ['写反证法时要清楚标记三步：假设相反结论，沿着假设推理，指出具体矛盾在哪里。'],
      },
      {
        label: '带走问题',
        lines: ['读这一页时先问：我要证明的 T 是什么？它的否定是什么？最后要撞出的矛盾又是什么？'],
      },
    ],
  },
  {
    pageNumber: 2,
    title: '反证例题：无穷出现与根号二无理',
    sections: [
      {
        label: '数字出现',
        lines: [
          '第一个命题说，π 的十进制展开里，至少有一个数字会出现无限多次。证明时假设每个数字都只出现有限次。',
        ],
      },
      {
        label: '有限总和',
        lines: [
          '如果十个数字各自只出现有限次，那么总位数也是有限的。这样 π 就会有有限小数展开，从而是有理数。',
          '但我们知道 π 不是有理数，所以假设矛盾。注意这个证明不告诉你是哪一个数字无限出现，只证明一定有一个。',
        ],
      },
      {
        label: '根号二策略',
        lines: ['根号二无理的证明是经典反证。先假设根号二等于 p/q，并且 p、q 已经约到最简。'],
      },
      {
        label: '奇偶矛盾',
        lines: [
          '由 2q²=p² 可知 p² 是偶数，因此 p 是偶数。把 p=2k 代回去，又得到 q² 是偶数，所以 q 也是偶数。',
          '这说明 p 和 q 同时有因子二，和“最简分数”矛盾。',
        ],
      },
      {
        label: '证明习惯',
        lines: ['这一页要强调，反证法里的矛盾必须指向某个已知事实或先前假设，不能只写“显然矛盾”。'],
      },
      {
        label: '练习连接',
        lines: [
          '后面的练习“没有最小正实数”和“A 交 B\\A 为空”都适合用同一个模式：假设相反结论，再推出不可能。',
        ],
      },
    ],
  },
  {
    pageNumber: 3,
    title: '二元关系：子集视角',
    sections: [
      {
        label: '方程反证',
        lines: [
          '这页先完成一个反证例题：假设自然数解存在，把 x²-4y² 分解成 (x-2y)(x+2y)。',
          '因为右边等于七，两个因子只能对应一和七。两种情况都会让 y 变成半整数，所以没有自然数解。',
        ],
      },
      {
        label: '关系入口',
        lines: ['接着进入关系。关系就是在两个对象之间指定某种联系，比如 a=b、a<b、a 整除 b。'],
      },
      {
        label: '正式定义',
        lines: [
          '二元关系 R 从集合 A 到集合 B，本质上是 A×B 的一个子集。只有当有序对 (a,b) 被选进这个子集时，才说 aRb。',
        ],
      },
      {
        label: '例子读法',
        lines: [
          '如果 A={2,4,6}，B 是两个符号，关系可以只选出三个有序对。写 2R♡，其实就是在说 (2,♡) 属于那个关系子集。',
        ],
      },
      {
        label: '同一集合上',
        lines: [
          '很多关系是在同一个集合上比较元素，也就是 R 是 A×A 的子集。等号、小于号、小于等于号都可以这样理解。',
        ],
      },
      {
        label: '带走规则',
        lines: [
          '这一页最重要的转换是：关系不是神秘符号，而是一批被选中的有序对。检查 aRb，就是检查 (a,b) 在不在这批有序对里。',
        ],
      },
    ],
  },
  {
    pageNumber: 4,
    title: '关系性质：自反、对称、传递和总性',
    sections: [
      {
        label: '无限集合关系',
        lines: [
          '在大集合上，我们不会把关系子集全部列出来，但它仍然存在。例如整数上的小于关系，就是所有满足 a<b 的整数对。',
        ],
      },
      {
        label: '函数前置',
        lines: [
          '定义九先给出“左全”和“函数性”两个性质。它们为下一册函数做准备：每个输入至少有输出，并且每个输入最多对应一个输出。',
        ],
      },
      {
        label: '基本性质',
        lines: [
          '同一集合上的关系要检查自反、非自反、对称、反对称、传递和总性。',
          '非自反的意思是没有元素和自己相关；自反则是每个元素都和自己相关。',
        ],
      },
      {
        label: '等号与小于等于',
        lines: [
          '等号是自反、对称、传递的。小于等于是自反、反对称、传递、总的。',
          '这里要分清对称和反对称：对称允许双向关系，反对称说如果双向都成立，那两者只能相等。',
        ],
      },
      {
        label: '正实数例题',
        lines: [
          '例题定义 a∼b 当且仅当 ab>1。它是对称的，因为 ab=ba；但不是自反、不是传递、也不是总的。',
        ],
      },
      {
        label: '反例方法',
        lines: [
          '证明某性质成立要任取元素证明；证明某性质失败，只要给一个反例。关系题里这两种动作要切得很清楚。',
        ],
      },
    ],
  },
  {
    pageNumber: 5,
    title: '等价关系：像相等但不必真的相等',
    sections: [
      {
        label: '补完例题',
        lines: [
          '上一页的例题最后用反例否定传递性：a 和 b 相关，b 和 c 相关，但 a 和 c 不相关。这样一个三元组就足够推翻传递性。',
        ],
      },
      {
        label: '整除关系',
        lines: [
          '整除关系是后面偏序的准备。aRb 表示 a 整除 b，要分别检查自反、反对称、传递和总性。',
        ],
      },
      {
        label: '等价关系定义',
        lines: [
          '等价关系要求三件事：自反、对称、传递。它抽象的是“看作同一类”的想法。',
          '等号本身是等价关系，但等价关系可以比真正相等更宽松。',
        ],
      },
      {
        label: '模 2π 例子',
        lines: [
          '例题定义 a∼b 当且仅当 b-a=2πk。直觉上，这是说两个实数相差整圈，所以在圆周意义下等价。',
        ],
      },
      {
        label: '三性质证明',
        lines: [
          '自反用 k=0；对称把 k 换成 -k；传递把两个整数见证 k₁、k₂ 相加。',
          '这就是等价关系证明的常见节奏：每个性质都要找到合适的见证。',
        ],
      },
      {
        label: '带走问题',
        lines: ['看到“证明这是等价关系”，不要泛泛而谈，按自反、对称、传递三段写，每段都回到定义。'],
      },
    ],
  },
  {
    pageNumber: 6,
    title: '等价类与划分',
    sections: [
      {
        label: '等价类定义',
        lines: [
          '等价类 [a] 是所有与 a 等价的元素组成的集合。它把“和 a 属于同一类”的对象全部收在一起。',
        ],
      },
      {
        label: '商集合',
        lines: [
          '所有等价类组成的集合叫商集合。现在不必纠结名字，先把它理解成“把原集合按等价关系打包后的集合”。',
        ],
      },
      {
        label: '零的等价类',
        lines: ['在模 2π 的例子里，[0] 包含所有 2π 的整数倍。它们在这条关系下都被看作和 0 同类。'],
      },
      {
        label: '平移后的类',
        lines: ['[1.5] 则是所有形如 1.5+2πk 的数。它看起来像 [0] 整体向右平移 1.5。'],
      },
      {
        label: '划分定理',
        lines: [
          '等价类最重要的性质是划分：每个元素属于某一个等价类，而且不同等价类要么完全一样，要么完全不相交。',
          '练习十八正是在证明这三件事：自己属于自己的类，相关元素给出同一个类，不相关的类没有交集。',
        ],
      },
      {
        label: '直觉总结',
        lines: [
          '等价关系的作用是把集合切成互不重叠的盒子。每个元素只落在一个盒子里，同盒子的元素彼此等价。',
        ],
      },
    ],
  },
  {
    pageNumber: 7,
    title: '偏序：不一定每两个对象都能比较',
    sections: [
      {
        label: '从相等到大小',
        lines: ['前面用等价关系推广“相等”，这一页开始用序关系推广“大小比较”。'],
      },
      {
        label: '弱序与强序',
        lines: [
          '弱序关系要求传递、反对称、自反，像小于等于。强序关系要求传递、反对称、非自反，像小于。',
        ],
      },
      {
        label: '全序与偏序',
        lines: [
          '如果任意两个元素都能比较，就是全序；如果有些元素无法比较，就是偏序。',
          '偏序不是“不够好”，而是很多自然结构本来就不是一条直线。',
        ],
      },
      {
        label: '子集包含',
        lines: [
          '幂集上的包含关系是弱偏序。它自反，因为 A⊆A；反对称，因为 A⊆B 且 B⊆A 推出 A=B；传递也直接成立。',
        ],
      },
      {
        label: '为什么不是全序',
        lines: ['它不是全序，因为两个子集可能互不包含。比如 {1,2} 和 {2,3}，谁也不是谁的子集。'],
      },
      {
        label: '极大极小',
        lines: [
          '页面最后引入极大和极小。极大元素的意思是：没有比它更大的可比元素；这不等于它比所有元素都大。',
        ],
      },
    ],
  },
  {
    pageNumber: 8,
    title: '极大、最大与上下界',
    sections: [
      {
        label: '整除偏序',
        lines: ['这一页用整除关系看偏序。集合 A={1,2,3,5,6,10,15}，a⪯b 表示 a 整除 b。'],
      },
      {
        label: '极大元素',
        lines: [
          '极大元素是没有更大对象压在它上面。6、10、15 都是极大元素，因为在 A 里没有别的不同元素是它们的倍数。',
          '证明 6 极大时，假设 6⪯x，也就是 x=6n。A 里唯一符合的元素就是 6，所以 x=6。',
        ],
      },
      {
        label: '最大元素',
        lines: [
          '最大元素更强：它必须在所有元素之上，也就是每个 x 都满足 x⪯M。',
          '这组 A 没有最大元素，因为没有一个元素能同时被 6、10、15 这些极大元素整除到。',
        ],
      },
      {
        label: '最小元素',
        lines: ['最小元素要求它在所有元素之下。这里 1 是最小元素，因为 1 整除每个正整数。'],
      },
      {
        label: '上界下界',
        lines: [
          '对一个子集 S，上界不一定在 S 里，但要在整个偏序集合 A 里，并且每个 x∈S 都满足 x⪯M。',
          '下界相反，是 m⪯x 对每个 x∈S 都成立。',
        ],
      },
      {
        label: '关键区别',
        lines: [
          '极大只管没有人严格压过它；最大要压过所有人。上界和下界则是对子集说的，不一定是整个集合的最大或最小。',
        ],
      },
    ],
  },
  {
    pageNumber: 9,
    title: '最小上界与最大下界',
    sections: [
      {
        label: '正整数整除',
        lines: [
          '这一页把整除偏序放到所有正整数上。对 S={8,12,36}，下界就是能同时整除三个数的正整数。',
        ],
      },
      {
        label: '下界例子',
        lines: ['1、2、4 都是下界，而且 4 是最大的下界，因为它是这三个数的最大公因数。'],
      },
      {
        label: '上界例子',
        lines: [
          '上界是能同时被 8、12、36 整除到的数，也就是共同倍数。72 是最小的上界，144、216 也是上界。',
        ],
      },
      {
        label: 'sup 与 inf',
        lines: [
          'sup(S) 是最小上界，也就是所有上界里最小的那个。inf(S) 是最大下界，也就是所有下界里最大的那个。',
          '在这个例子里，sup(S)=72，inf(S)=4。',
        ],
      },
      {
        label: '和微积分连接',
        lines: [
          '教材特别说这些定义以后在微积分会很重要。现在先在偏序里理解：上确界和下确界是关于“界”的最优版本。',
        ],
      },
      {
        label: '练习总览',
        lines: [
          '后面的练习混合了反证、关系性质、等价关系和序关系。做题时先判断问题类型，再调用对应模板。',
        ],
      },
    ],
  },
  {
    pageNumber: 10,
    title: '综合练习：关系性质、等价类与偏序',
    sections: [
      {
        label: '关系性质题',
        lines: [
          '这一页继续综合练习。第二题给出多种关系，要逐项检查自反、非自反、对称、反对称、传递、总性。',
        ],
      },
      {
        label: '等价关系题',
        lines: ['判断等价关系时，只盯三件事：自反、对称、传递。只要缺一个，就不是等价关系。'],
      },
      {
        label: '符号函数例子',
        lines: [
          '符号函数关系把实数按正、零、负分成三类。它适合练等价类，因为同号的数彼此等价，不同号的数分到不同类。',
        ],
      },
      {
        label: '有理数构造',
        lines: [
          'Z×Z+ 上的关系 ad=bc 是构造有理数的经典方式。[(1,2)] 表示所有和二分之一等价的整数对。',
          '证明加法和乘法定义良好，就是证明换代表元不会改变最终等价类。',
        ],
      },
      {
        label: '偏序练习',
        lines: [
          '最后的除数封闭子集练习把偏序、极大极小、上确界和下确界放在一起。先列出所有对象，再用包含关系比较。',
        ],
      },
      {
        label: '收束',
        lines: [
          '这本结束时，学生应该能把“关系”翻译成有序对子集，并且会按模板检查性质、证明等价关系、分析偏序里的界。',
        ],
      },
    ],
  },
];

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function sourceRectFromCanvas(rect) {
  return [
    Math.round(rect.left * SOURCE_SCALE),
    Math.round(rect.top * SOURCE_SCALE),
    Math.round(rect.width * SOURCE_SCALE),
    Math.round(rect.height * SOURCE_SCALE),
  ];
}

function buildFocusRegions(page) {
  return page.sections.map((section, index) => {
    const layout = REGION_LAYOUT[index];
    return {
      id: `${QUEUE_ID}-p${pageLabel(page.pageNumber)}-r${String(index + 1).padStart(2, '0')}`,
      label: section.label,
      role: layout.role,
      sourceRect: sourceRectFromCanvas(layout.canvasRect),
      canvasRect: layout.canvasRect,
    };
  });
}

function buildActions(page, focusRegions) {
  const actions = [];
  let speechIndex = 1;
  for (const [index, section] of page.sections.entries()) {
    const region = focusRegions[index];
    const actionBase = `${QUEUE_ID}-p${pageLabel(page.pageNumber)}-r${String(index + 1).padStart(2, '0')}`;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: region.label,
      description: `聚焦区域：${region.label}`,
      dimOpacity: 0.76,
    });
    for (const text of section.lines) {
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

function validatePage(page, focusRegions, actions) {
  if (page.sections.length !== REGION_LAYOUT.length) {
    throw new Error(`${page.title}: expected ${REGION_LAYOUT.length} sections`);
  }
  const speechCount = actions.filter((action) => action.type === 'speech').length;
  const spotlightCount = actions.filter((action) => action.type === 'spotlight').length;
  if (speechCount < 7 || speechCount > 10) {
    throw new Error(`${page.title}: speech count ${speechCount} outside expected range`);
  }
  if (spotlightCount !== REGION_LAYOUT.length) {
    throw new Error(`${page.title}: spotlight count ${spotlightCount} outside expected range`);
  }

  const ids = new Set(focusRegions.map((region) => region.id));
  const seen = new Set();
  const forbidden =
    /原 PDF|PDF|source-pages|source-text|queue|Week|Calculus II|Riemann|theta|pi|page\b|本页承接|if-then|iff|\bOR\b|\bNOT\b|可以积分的量|放进积分/i;
  for (const action of actions) {
    if (seen.has(action.id)) throw new Error(`${page.title}: duplicate action ${action.id}`);
    seen.add(action.id);
    if (action.type === 'spotlight' && !ids.has(action.elementId)) {
      throw new Error(`${page.title}: invalid spotlight target ${action.elementId}`);
    }
    if (action.type === 'speech') {
      if (!action.text || forbidden.test(action.title) || forbidden.test(action.text)) {
        throw new Error(`${page.title}: suspicious speech "${action.title}: ${action.text}"`);
      }
    }
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildNarrationFile(page, notebookPage) {
  const focusRegions = buildFocusRegions(page);
  const actions = buildActions(page, focusRegions);
  validatePage(page, focusRegions, actions);
  return {
    schemaVersion: 1,
    notebookId: QUEUE_ID,
    sceneTitle: page.title,
    pageNumber: page.pageNumber,
    sourceTextPath: notebookPage.sourceTextPath,
    focusRegions,
    actions,
    qa: {
      language: 'zh-CN',
      sourceBasis: 'queue original PDF and extracted source text',
      speechCount: actions.filter((action) => action.type === 'speech').length,
      focusCount: actions.filter((action) => action.type === 'spotlight').length,
      spotlightTargetsExist: actions
        .filter((action) => action.type === 'spotlight')
        .every((action) => focusRegions.some((region) => region.id === action.elementId)),
    },
  };
}

function main() {
  const notebook = JSON.parse(fs.readFileSync(NOTEBOOK_PATH, 'utf8'));
  if (notebook.pageCount !== PAGES.length) {
    throw new Error(
      `Notebook page count ${notebook.pageCount} != narration page count ${PAGES.length}`,
    );
  }

  let totalSpeech = 0;
  let totalSpotlight = 0;
  const titleByPage = new Map(PAGES.map((page) => [page.pageNumber, page.title]));

  for (const page of PAGES) {
    const notebookPage = notebook.pages.find((item) => item.pageNumber === page.pageNumber);
    if (!notebookPage) throw new Error(`Missing notebook page ${page.pageNumber}`);
    const narration = buildNarrationFile(page, notebookPage);
    totalSpeech += narration.qa.speechCount;
    totalSpotlight += narration.qa.focusCount;
    if (!DRY_RUN) writeJson(notebookPage.narrationPath, narration);
  }

  const nextNotebook = {
    ...notebook,
    pages: notebook.pages.map((page) => ({
      ...page,
      title: titleByPage.get(page.pageNumber) || page.title,
      status: {
        ...(page.status || {}),
        narration: 'ready',
      },
    })),
    status: {
      ...(notebook.status || {}),
      narration: 'ready',
    },
  };
  if (!DRY_RUN) writeJson(NOTEBOOK_PATH, nextNotebook);

  console.log(
    `${DRY_RUN ? 'would rewrite' : 'rewrote'} ${QUEUE_ID}: pages=${PAGES.length}, speech=${totalSpeech}, spotlight=${totalSpotlight}`,
  );
}

main();
