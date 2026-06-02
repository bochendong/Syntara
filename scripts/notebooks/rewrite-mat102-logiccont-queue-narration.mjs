#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const QUEUE_ID = 'queue-mat102-03logiccont';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT102', QUEUE_ID);
const NOTEBOOK_PATH = path.join(QUEUE_DIR, 'notebook.json');
const NARRATION_DIR = path.join(QUEUE_DIR, 'narration');
const DRY_RUN = process.argv.includes('--dry-run');

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
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
    title: '量词与蕴含：让谓词变成完整句子',
    sections: [
      {
        label: '本节主线',
        lines: [
          '这本继续上一册的命题和谓词。上一册已经会判断一句话是不是命题，这一册要学怎样把带变量的谓词变成完整数学句子。',
          '主线有两条：量词说明“有多少对象满足条件”，蕴含说明“如果假设成立，会推出什么结论”。',
        ],
      },
      {
        label: '全称量词',
        lines: [
          '全称量词 ∀ 读作“对所有”。它说的是讨论范围里的每一个对象都要满足谓词 P。',
          '所以 ∀x 属于 S, P(x) 为真，要求 S 里的任何一个 x 都不能出错。',
        ],
      },
      {
        label: '存在量词',
        lines: [
          '存在量词 ∃ 读作“存在”。它的要求弱很多，只要能找到至少一个对象让 P(x) 为真，整个句子就为真。',
        ],
      },
      {
        label: '谓词变命题',
        lines: [
          '量词的作用是绑定变量。P(x) 本来像一台等待输入的真假机器，加上 ∀ 或 ∃ 之后，就变成有确定真值的命题。',
        ],
      },
      {
        label: '多重量词预告',
        lines: [
          '例子里“每门运动都有犯规的人”和“有一本书被每门课使用”都藏着多个量词。关键不是符号多，而是谁先选、谁后选。',
        ],
      },
      {
        label: '带走问题',
        lines: [
          '听这一页时先带走一个检查问题：这句话是在说所有对象，还是只要找到一个对象？这个问题会决定证明方法。',
        ],
      },
    ],
  },
  {
    pageNumber: 2,
    title: '证明量词语句：任取与见证',
    sections: [
      {
        label: '练习承接',
        lines: [
          '这一页先让学生把自然语言翻译成谓词和量词。翻译时先找讨论范围，再找谓词，最后决定是 ∀、∃，还是两个都要用。',
        ],
      },
      {
        label: '真假判断',
        lines: [
          '例题三训练四种判断。非零整数平方非负是真命题；实数里没有平方等于负一的数，所以那个存在命题是假。',
        ],
      },
      {
        label: '全称证明',
        lines: [
          '证明全称命题时，不是把每个元素列出来。标准动作是：任取一个对象，假设它来自给定范围，然后用定义推出目标性质。',
          '有理数加法封闭的证明就是这样。任取两个有理数，写成分数，再把和改写成整数除以正整数。',
        ],
      },
      {
        label: '存在证明',
        lines: [
          '证明存在命题时，最直接的方法是给出一个见证。比如 x 等于四、y 等于二，就证明存在正整数 x、y 使 x/y 仍是正整数。',
        ],
      },
      {
        label: '相同量词可交换',
        lines: ['同类型的相邻量词可以换顺序。两个 ∀ 换顺序，或者两个 ∃ 换顺序，逻辑含义不变。'],
      },
      {
        label: '关键提醒',
        lines: [
          '但不同类型的量词不能随便换。下一页要看到，∀ 后接 ∃ 和 ∃ 后接 ∀ 往往是完全不同的句子。',
        ],
      },
    ],
  },
  {
    pageNumber: 3,
    title: '量词顺序：能依赖和必须统一',
    sections: [
      {
        label: '两个句子',
        lines: [
          '这一页比较两个看起来很像的句子：对每个实数 x，存在实数 y 使 x+y=0；以及存在一个实数 x，对所有 y 都有 x+y=0。',
          '符号差别只在量词顺序，但意思差很多。',
        ],
      },
      {
        label: '先全称后存在',
        lines: [
          '第一句的意思是：每个实数都有自己的相反数。这里 y 可以随着 x 改变，给定 x 后选 y=-x 就行。',
        ],
      },
      {
        label: '先存在后全称',
        lines: [
          '第二句要求先找到一个固定数，然后它要能和每个实数相加都得到零。这个要求太强，所以是假命题。',
        ],
      },
      {
        label: '依赖关系',
        lines: [
          '核心差别是依赖关系。∀x, ∃y 允许 y 依赖 x；∃y, ∀x 要求同一个 y 对所有 x 都工作。',
          '讲多重量词时，一定要问：后面选择的对象能不能看见前面已经选了什么？',
        ],
      },
      {
        label: '反证味道',
        lines: [
          '如果假设有一个数能抵消所有实数，那么它既要抵消 a，又要抵消 b，最后会逼出 a=b。这等于说所有实数都相等，当然不可能。',
        ],
      },
      {
        label: '翻译原则',
        lines: ['这一页的结论是：多重量词先翻译成白话，再判断真假。不要只靠符号外形猜意思。'],
      },
    ],
  },
  {
    pageNumber: 4,
    title: '否定量词：怎样反驳所有和存在',
    sections: [
      {
        label: '顺序总结',
        lines: [
          '这一页先总结上一页：改变量词顺序会改变逻辑陈述，因为存在对象是否能依赖前面的全称对象，决定了句子的强弱。',
        ],
      },
      {
        label: '生日练习',
        lines: [
          '生日练习适合用来练四种结构。所有人和所有人同生日、每个人至少有一个同生日的人、存在一个人与所有人同生日、存在一对同生日的人，强弱完全不同。',
        ],
      },
      {
        label: '普通语言',
        lines: [
          '教材提醒正常写数学时不一定总用符号，但必须知道句子背后的量词结构。符号是训练工具，白话是理解工具。',
        ],
      },
      {
        label: '否定全称',
        lines: [
          '否定“所有 x 都满足 P”时，不是说所有 x 都不满足 P，而是说至少有一个 x 不满足 P。',
          '所以 ¬∀x P(x) 等价于 ∃x ¬P(x)。反驳全称命题，就是找反例。',
        ],
      },
      {
        label: '否定存在',
        lines: [
          '否定“存在 x 满足 P”时，要证明没有任何 x 满足 P，也就是每个 x 都不满足 P。',
          '所以 ¬∃x P(x) 等价于 ∀x ¬P(x)。',
        ],
      },
      {
        label: '证明习惯',
        lines: [
          '遇到否定量词，动作是把否定号往里推，同时把 ∀ 和 ∃ 对换。这是后面否定复杂数学句子的基本操作。',
        ],
      },
    ],
  },
  {
    pageNumber: 5,
    title: '蕴含真值表与空真',
    sections: [
      {
        label: '否定练习',
        lines: [
          '这一页先用例题练否定全称命题。∀x 属于 R, x<x² 是假的，因为 x=1/2 时，x²=1/4，反而 x 大于 x²。',
          '它的否定是存在一个实数 x，使 x 大于等于 x²。反例正好满足这个否定句。',
        ],
      },
      {
        label: '进入蕴含',
        lines: [
          '接着进入蕴含。数学里的定理经常是“如果……那么……”：如果假设 P 成立，那么结论 Q 成立。',
        ],
      },
      {
        label: '真值表',
        lines: [
          'P => Q 只有一种失败情况：P 真而 Q 假。只要假设真的时候结论也真，蕴含就没有被破坏。',
        ],
      },
      {
        label: '空真',
        lines: [
          '真值表底下两行最容易不适应：当前提 P 假时，P => Q 被规定为真。这叫空真。',
          '直觉是：假设从来不会发生，就没有机会检验结论是否失败。',
        ],
      },
      {
        label: '数学意义',
        lines: [
          '空真不是语言游戏。证明“所有满足 P 的对象都满足 Q”时，如果根本没有对象满足 P，这个全称蕴含就自动没有反例。',
        ],
      },
      {
        label: '带走问题',
        lines: ['判断蕴含时只盯一件事：有没有对象让假设成立、结论失败？有，就是假；没有，就是真。'],
      },
    ],
  },
  {
    pageNumber: 6,
    title: '逆命题与逆否命题',
    sections: [
      {
        label: '狗与动物',
        lines: [
          '这一页用“狗”和“动物”区分三个句子。若 x 是狗，则 x 是动物，这是真命题。',
          '反过来若 x 是动物，则 x 是狗，就是逆命题，猫就是反例。',
        ],
      },
      {
        label: '逆否方向',
        lines: ['若 x 不是动物，则 x 不是狗，这是原命题的逆否命题。它和原命题同真同假。'],
      },
      {
        label: '定义十',
        lines: [
          '对 P => Q，逆命题是 Q => P，逆否命题是 ¬Q => ¬P。',
          '名字要和方向配对：逆命题交换前后，逆否命题既交换前后又加否定。',
        ],
      },
      {
        label: '逻辑等价',
        lines: [
          '命题十一说 P => Q 与 ¬Q => ¬P 逻辑等价。也就是说，证明原命题可以改成证明逆否命题。',
        ],
      },
      {
        label: '常见误区',
        lines: ['原命题为真时，逆命题不一定为真。不要把“如果 P 那么 Q”自动读成“如果 Q 那么 P”。'],
      },
      {
        label: '下一页连接',
        lines: [
          '下一页会把这个策略用在整数奇偶性上：不直接证明 n² 偶推出 n 偶，而是证明 n 奇推出 n² 奇。',
        ],
      },
    ],
  },
  {
    pageNumber: 7,
    title: '用逆否证明与当且仅当',
    sections: [
      {
        label: '目标命题',
        lines: [
          '这一页证明：如果整数 n 的平方是偶数，那么 n 是偶数。直接证明不太顺，所以换成逆否命题。',
        ],
      },
      {
        label: '逆否改写',
        lines: [
          '原命题是 P(n)=>Q(n)：n² 偶推出 n 偶。逆否命题是 ¬Q(n)=>¬P(n)：n 不是偶数推出 n² 不是偶数。',
          '对整数来说，不是偶数就是奇数，所以目标变成：若 n 奇，则 n² 奇。',
        ],
      },
      {
        label: '代数证明',
        lines: [
          '设 n=2k+1，其中 k 是整数。展开平方得到 n²=4k²+4k+1=2(2k²+2k)+1。',
          '括号里的 2k²+2k 仍是整数，所以 n² 是奇数。逆否命题成立，原命题也成立。',
        ],
      },
      {
        label: '双条件',
        lines: [
          '如果 P=>Q 和 Q=>P 两个方向都真，就写 P⇔Q，也就是“当且仅当”。',
          '证明当且仅当通常要做两个方向，不要只证明一个方向就停。',
        ],
      },
      {
        label: '必要充分',
        lines: [
          '必要条件和充分条件也在讲方向。P 是 Q 的必要条件表示 Q=>P；P 是 Q 的充分条件表示 P=>Q。',
        ],
      },
      {
        label: '练习提示',
        lines: ['练习十四要证明 n 偶当且仅当 n² 偶。一个方向直接，另一个方向正是本页的逆否证明。'],
      },
    ],
  },
  {
    pageNumber: 8,
    title: '否定蕴含：反例就是 P 且非 Q',
    sections: [
      {
        label: '反例定义',
        lines: [
          '这一页讲怎样否定蕴含。要让 P=>Q 失败，必须找到一个对象让 P 为真，同时让 Q 为假。',
          '所以反例不是随便找一个奇怪对象，而是必须满足假设、破坏结论。',
        ],
      },
      {
        label: '命题十五',
        lines: [
          '命题十五把这件事写成公式：¬(P=>Q) 等价于 P 且 ¬Q。',
          '这和真值表完全一致，因为 P=>Q 只在 P 真 Q 假那一行失败。',
        ],
      },
      {
        label: '鸭子例子',
        lines: [
          '例题说“如果 x 是鸭子，那么 x 喜欢花生酱”。否定不是“x 不是鸭子”，而是“x 是鸭子并且不喜欢花生酱”。',
        ],
      },
      {
        label: '复杂否定',
        lines: [
          '连续性的例子很长，但动作还是同一个：否定号往里推，量词全部对换，最后把蕴含改成假设成立且结论失败。',
        ],
      },
      {
        label: '操作顺序',
        lines: [
          '否定复杂句子时建议从外到内处理：先换最外层量词，再处理下一个量词，碰到蕴含时改成 P 且非 Q。',
        ],
      },
      {
        label: '带走规则',
        lines: [
          '以后看到“证明这个如果……那么……是假的”，脑子里要立刻翻译成：找一个满足假设但不满足结论的反例。',
        ],
      },
    ],
  },
  {
    pageNumber: 9,
    title: '数学语言和日常语言不总一致',
    sections: [
      {
        label: '语言提醒',
        lines: ['这一页不是新公式，而是在提醒：数学语言比日常语言更精确，所以翻译时不能只靠语感。'],
      },
      {
        label: '或的陷阱',
        lines: [
          '数学里的“或”是包含式的或。P 或 Q 为真，包含 P、Q 都真的情况。',
          '日常说“披萨或泰餐”通常暗含只选一个，但数学不会自动加入这个限制。',
        ],
      },
      {
        label: '否定位置',
        lines: [
          '“非”的位置非常重要。“不是所有东西都好”和“所有东西都不好”在数学上完全不同。',
          '前者是 ∃x ¬A(x)，后者是 ∀x ¬A(x)。一个说至少有问题，一个说全都有问题。',
        ],
      },
      {
        label: '英文名句',
        lines: [
          '莎士比亚那句“闪光的不全是金子”用来说明自然语言可能把否定词放在数学上危险的位置。',
          '数学写作里要避免这种模糊，直接写清楚量词和否定号的作用范围。',
        ],
      },
      {
        label: '蕴含陷阱',
        lines: [
          '日常“如果……那么……”往往带有额外暗示。例如“做完盘子就能出去”常被理解成当且仅当，但数学里的 P=>Q 不自动包含逆命题。',
        ],
      },
      {
        label: '回到定义',
        lines: [
          '这一页的最终建议很实用：当自然语言和数学直觉打架时，回到定义，回到真值表，回到量词顺序。',
        ],
      },
    ],
  },
  {
    pageNumber: 10,
    title: '综合练习：翻译、否定和逆否',
    sections: [
      {
        label: '练习定位',
        lines: [
          '最后一页把整本的技能混在一起：翻译量词、判断真假、做真值表、否定复杂语句、写逆命题和逆否命题。',
        ],
      },
      {
        label: '翻译题',
        lines: [
          '第一类题要把符号翻成白话。做法是先说讨论范围，再说量词顺序，最后把谓词翻成普通条件。',
        ],
      },
      {
        label: '真假题',
        lines: [
          '多项式那组题特别适合练量词顺序。∀x∃p 和 ∃p∀x 是两种完全不同的要求：前者可以为每个 x 选不同多项式，后者要一个多项式统一处理所有 x。',
        ],
      },
      {
        label: '真值表题',
        lines: [
          '真值表题要按列拆，不要凭直觉跳结论。尤其是带有两个蕴含或当且仅当的表达式，要先算内层再算外层。',
        ],
      },
      {
        label: '否定题',
        lines: [
          '否定题按三条规则推进：量词对换、否定往里推、蕴含变成假设且非结论。',
          '如果遇到当且仅当，可以先把它理解为两个方向的蕴含，再分别处理。',
        ],
      },
      {
        label: '收束',
        lines: [
          '这本结束时，学生应该能回答三个问题：量词顺序是什么，蕴含失败的条件是什么，否定句子时每个否定号管到哪里。',
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
    const regionId = `${QUEUE_ID}-p${pageLabel(page.pageNumber)}-r${String(index + 1).padStart(2, '0')}`;
    return {
      id: regionId,
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
    /原 PDF|PDF|source-pages|source-text|queue|Week|Calculus II|Riemann|theta|pi|page\b|本页承接|if-then|iff|OR|NOT|可以积分的量|放进积分/i;
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
