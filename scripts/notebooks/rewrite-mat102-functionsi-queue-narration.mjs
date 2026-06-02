#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const QUEUE_ID = 'queue-mat102-05functionsi';
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
    title: '函数的真正定义：左全且函数性的关系',
    sections: [
      {
        label: '本节主线',
        lines: [
          '这本进入函数。函数的直觉是把一个集合里的信息运输到另一个集合里，但 MAT102 要先把直觉翻成严格定义。',
          '这页的重点不是背 f(x) 记号，而是看清函数需要哪些数据：定义域、陪域、以及每个输入对应的输出。',
        ],
      },
      {
        label: '回到关系',
        lines: ['上一册说过，A 到 B 的二元关系是 A×B 的一个子集。函数就是一种特别受限制的关系。'],
      },
      {
        label: '左全',
        lines: [
          '左全的意思是：定义域 A 里的每一个 a，都至少能找到一个 b 使 aRb。换成函数语言，就是每个输入都必须有输出。',
        ],
      },
      {
        label: '函数性',
        lines: [
          '函数性的意思是：同一个输入不能对应两个不同输出。如果 aRb₁ 且 aRb₂，那么必须有 b₁=b₂。',
          '所以函数不是“随便画箭头”，而是每个输入恰好有一个输出。',
        ],
      },
      {
        label: '例子记号',
        lines: [
          '例子里原本可以写 2R♡，但函数记号更熟悉：写成 f(2)=♡。这个记号只是把关系读成“输入二，输出这个符号”。',
        ],
      },
      {
        label: '带走问题',
        lines: [
          '检查一个关系是不是函数时，先问两个问题：每个定义域元素有没有输出？有没有某个输入被送到两个不同输出？',
        ],
      },
    ],
  },
  {
    pageNumber: 2,
    title: '函数数据：定义域、陪域、值域和图像',
    sections: [
      {
        label: '定义展开',
        lines: [
          '这一页把左全和函数性翻成函数语言。左全保证每个输入被定义，函数性保证同一个输入只有一个输出。',
        ],
      },
      {
        label: '函数记号',
        lines: ['写 f:A→B 时，A 是定义域，B 是陪域，f 是函数名，箭头表示信息从 A 送到 B。'],
      },
      {
        label: '陪域和值域',
        lines: [
          '陪域不是值域。陪域只是声明输出生活在哪个集合里；值域是函数实际打到的输出集合。',
          '很多单射、满射问题都会卡在这里：到底是“可能的输出范围”，还是“真的被打到的元素”。',
        ],
      },
      {
        label: '图像集合',
        lines: [
          '函数的图像 Γ(f) 是所有有序对 (a,f(a)) 的集合。它其实就是作为关系时选出来的那批有序对。',
        ],
      },
      {
        label: '机器直觉',
        lines: [
          '教材也提醒，形式定义很重要，但平常可以把函数想成机器：吃进 A 的元素，吐出 B 的元素。',
        ],
      },
      {
        label: '练习提醒',
        lines: [
          '空集相关练习很适合检查定义：空定义域时没有输入需要处理；空陪域时，如果定义域非空，就没有输出可选。',
        ],
      },
    ],
  },
  {
    pageNumber: 3,
    title: '像集与原像：集合被函数怎样搬运',
    sections: [
      {
        label: '图示直觉',
        lines: [
          '这一页从单个点的输出扩展到集合的输出。给定 U⊆A，f(U) 是 U 里的所有点经过 f 后得到的输出集合。',
        ],
      },
      {
        label: '像集定义',
        lines: [
          'f(U) 可以读成：所有 y∈B，使得存在 x∈U 满足 f(x)=y。这里的关键词是“存在一个原来的点”。',
        ],
      },
      {
        label: '原像定义',
        lines: [
          '给定 V⊆B，原像 f⁻¹(V) 是所有被 f 送进 V 的输入 x。它是定义域 A 的子集。',
          '这里的 f⁻¹(V) 不代表逆函数存在。原像永远可以谈，逆函数不一定存在。',
        ],
      },
      {
        label: '平方函数像集',
        lines: [
          '例题 f(x)=x²，要求 f([-1,2])。因为区间里包含零，平方的最小值是零；端点二给出最大值四，所以答案是 [0,4]。',
        ],
      },
      {
        label: '双向包含',
        lines: [
          '严谨证明仍然用集合相等的双向包含：先证明每个 [0,4] 的 y 都能由某个 x 平方得到，再证明任何 x∈[-1,2] 的平方都落在 [0,4]。',
        ],
      },
      {
        label: '投影预告',
        lines: [
          '页面最后的投影例子要训练原像。投影把三维点压到 xy 平面，原像则是所有会被压进目标区域的三维点。',
        ],
      },
    ],
  },
  {
    pageNumber: 4,
    title: '原像证明与单射定义',
    sections: [
      {
        label: '柱体原像',
        lines: [
          '这一页先完成投影例题。D 是 xy 平面里的单位圆盘，p⁻¹(D) 是所有投影落在 D 里的三维点。',
          '所以得到的是实心圆柱：x²+y²≤1，z 可以任意。',
        ],
      },
      {
        label: '原像双包含',
        lines: [
          '证明还是双向包含。若点在圆柱里，投影后满足圆盘条件；若点的投影在圆盘里，原三维点就满足圆柱条件。',
        ],
      },
      {
        label: '练习连接',
        lines: [
          '平方函数的原像练习和球面投影练习都在问同一件事：哪些输入会被函数送到指定目标集合里？',
        ],
      },
      {
        label: '单射定义',
        lines: [
          '接着进入单射。f:S→T 是单射，意思是如果 f(s₁)=f(s₂)，那么 s₁=s₂。',
          '也就是说，一个输出不能来自两个不同输入。',
        ],
      },
      {
        label: '箭头图像',
        lines: [
          '用箭头图看，单射要求陪域里的每个元素至多有一个箭头指向它。可以没人指向，但不能有两个输入撞到同一个输出。',
        ],
      },
      {
        label: '证明模板',
        lines: [
          '证明单射的标准开头是：假设 f(s₁)=f(s₂)，然后推出 s₁=s₂。反驳单射则找两个不同输入有同一个输出。',
        ],
      },
    ],
  },
  {
    pageNumber: 5,
    title: '判断单射与单射复合',
    sections: [
      {
        label: '图像提醒',
        lines: [
          '这页的箭头图展示单射：每个陪域元素最多被一个箭头击中。图里可以有没被击中的元素，这不影响单射。',
        ],
      },
      {
        label: '有限集合例子',
        lines: [
          '第一个函数把 n 送到 n³ 除以五的余数。因为五个输入给出五个不同输出，所以它是单射。',
        ],
      },
      {
        label: '反例例子',
        lines: [
          '第二个函数把非空正整数子集送到最小元素。{1} 和 {1,2} 是不同输入，但输出都等于一，所以不是单射。',
        ],
      },
      {
        label: '正数平方',
        lines: [
          '第三个函数 h:(0,∞)→R, h(x)=x² 是单射。若 x₁²=x₂²，则 x₁=±x₂；但两个数都为正，所以只能 x₁=x₂。',
        ],
      },
      {
        label: '复合命题',
        lines: [
          '命题十三说：两个单射复合仍是单射。证明时从 h(x)=h(y) 开始，也就是 f(g(x))=f(g(y))。',
        ],
      },
      {
        label: '逐层剥开',
        lines: [
          '先用 f 的单射性推出 g(x)=g(y)，再用 g 的单射性推出 x=y。复合证明的感觉就是从外层函数一层一层剥回来。',
          '如果要反驳单射，方向正好相反：找两个不同输入，追踪它们经过函数后是否撞到同一个输出。',
        ],
      },
    ],
  },
  {
    pageNumber: 6,
    title: '满射：每个目标都要被打到',
    sections: [
      {
        label: '单射复合回顾',
        lines: ['这一页先补完单射复合证明：如果 h(x)=h(y)，就借 f 和 g 的单射性连续推出 x=y。'],
      },
      {
        label: '反向问题',
        lines: [
          '练习十四问：如果 f∘g 是单射，那么一定能推出 g 是单射，但不一定能推出 f 是单射。',
          '直觉是复合只测试 f 在 g 的输出范围上的行为，可能看不到 f 在别处的碰撞。',
        ],
      },
      {
        label: '满射定义',
        lines: [
          '满射的定义是：对每个 t∈T，都存在 s∈S 使 f(s)=t。也就是说，陪域里的每个目标都真的被打到。',
        ],
      },
      {
        label: '箭头图像',
        lines: [
          '用箭头图看，满射要求陪域里的每个元素至少有一个箭头指向它。可以有多个箭头指向同一个目标，但不能漏掉目标。',
        ],
      },
      {
        label: '和单射对比',
        lines: [
          '单射管“最多一个箭头”，满射管“至少一个箭头”。这两个条件关注的是陪域里每个元素被箭头击中的次数。',
        ],
      },
      {
        label: '证明模板',
        lines: ['证明满射的标准开头是：任取 t∈T。然后构造一个 s∈S，使得 f(s)=t。'],
      },
    ],
  },
  {
    pageNumber: 7,
    title: '满射例子、满射复合与双射',
    sections: [
      {
        label: '满射例子',
        lines: [
          '第一个例子已经算出五个输出刚好覆盖 {0,1,2,3,4}，所以是满射。',
          '第二个函数 g 也满射：给任意正整数 n，取集合 {n}，它的最小元素就是 n。',
        ],
      },
      {
        label: '非满射例子',
        lines: ['h:(0,∞)→R, h(x)=x² 不是满射，因为负数永远打不到。比如 -1 没有正数平方能得到。'],
      },
      {
        label: '满射复合',
        lines: [
          '命题十七说两个满射复合仍是满射。证明从任取 c∈C 开始，先用 f 的满射性找 b，再用 g 的满射性找 a。',
          '最后 f(g(a))=f(b)=c，就说明 c 被复合函数打到了。',
        ],
      },
      {
        label: '练习分类',
        lines: [
          '练习十八要求判断单射、满射、两者都是或都不是。做这种题时分别检查“碰撞”和“漏目标”。',
        ],
      },
      {
        label: '双射定义',
        lines: ['双射就是既单射又满射。箭头图上，它表示陪域里的每个元素恰好有一个箭头指向它。'],
      },
      {
        label: '带走总结',
        lines: [
          '单射是唯一来源，满射是覆盖全部目标，双射是两者同时成立。复合函数会保留这些性质，只要组成的函数本身都有对应性质。',
        ],
      },
    ],
  },
  {
    pageNumber: 8,
    title: '综合练习：像、原像、单射、满射、双射',
    sections: [
      {
        label: '双射判断',
        lines: [
          '最后一页先让学生回头判断前面例子哪些是双射。方法很直接：既要没有碰撞，也要没有漏掉陪域元素。',
        ],
      },
      {
        label: '像和原像',
        lines: [
          '前几题继续练像集和原像。遇到 f(U) 时，从输入集合往外推；遇到 f⁻¹(V) 时，从目标条件倒回输入条件。',
        ],
      },
      {
        label: '集合恒等式',
        lines: [
          '第四、五题比较 f(U₁∩U₂) 和 f(U₁)∩f(U₂)，以及 f(U₁∪U₂) 和 f(U₁)∪f(U₂)。',
          '交集那题一般只能得到包含，因为不同输入可能被同一个函数值撞在一起；并集则能得到相等。',
        ],
      },
      {
        label: '分类题',
        lines: [
          '第六题给多个函数分类。每一个都按同一张检查表走：是否有两个输入同输出？是否每个陪域元素都被打到？',
        ],
      },
      {
        label: '证明题',
        lines: [
          '后面几题把函数性质放进证明。严格递增函数必单射，因为 x<y 会推出 f(x)<f(y)，所以不同输入不可能同输出。',
        ],
      },
      {
        label: '下节钩子',
        lines: [
          '无限二进制串和从正整数到 {0,1} 的函数之间有双射，这会自然通向下一本的逆函数、基数和可数性。',
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
    /原 PDF|PDF|source-pages|source-text|queue|Week|Calculus II|Riemann|theta|pi|page\b|本页承接|if-then|iff|\bOR\b|\bNOT\b|left-total|functional|well-defined|divisor-closed|least upper bound|greatest lower bound|可以积分的量|放进积分/i;
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
