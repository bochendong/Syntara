#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';
import { generatedNotebookDir } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat102-zh-sets-and-propositional-logic-20260519';
const DRY_RUN = process.argv.includes('--dry-run');
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const SCENES_PATH = path.join(OUTPUT_DIR, 'notebook-scenes.json');
const ACTIONS_PATH = path.join(OUTPUT_DIR, 'scene-actions.json');

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
  '封面：集合是数学里的容器': [
    [
      '这一本从集合开始，不是因为集合难，而是因为后面所有证明都会反复用这套语言。今天先把“一个对象在不在一个集合里”这件事讲清楚。',
    ],
    [
      '先看左侧的核心定义。集合是一组对象，但不是随便堆在一起。它要求对象明确，也就是说，给你一个候选对象，你应该能判断它在不在里面。',
      '这里要特别注意：集合不关心排列顺序，也不把重复写出来的元素算成新元素。这个习惯一开始不纠正，后面做集合相等会很容易错。',
    ],
    [
      '右侧的例子可以一个一个慢慢看。花色、数字、对象分类这些例子不是为了算答案，而是为了训练判断标准：元素是否明确，重复是否被忽略，顺序是否重要。',
      '先自己判断：这个东西能不能算一个集合？然后再回到定义，用“明确、互异、无序”三个词逐条检查。',
    ],
    [
      '这一页的结论是：集合不是一串漂亮符号，而是一组边界清楚的对象。',
      '下一页我们就用“属于”这个关系，练习怎样判断一个对象是否真的落在集合里。',
    ],
  ],
  '引入：什么才算“属于”？': [
    [
      '这一页聚焦一个最基本的问题：什么叫一个元素属于一个集合。不要急着记符号，先把判断动作建立起来。',
    ],
    [
      '左侧三个小框给的是三种情况。第一种是清楚的集合，看到候选元素时可以判断 yes 或 no。第二种是模糊的集合，比如“好看”这种标准，边界不够稳定。',
      '第三种强调重复不算多。集合里写了一、二、三，哪怕三被写了两次，集合本身仍然只包含这些不同元素。',
    ],
    [
      '右侧这里先停一下：这个候选对象到底在不在集合里？如果能判断，就说明这个集合的成员关系是清楚的。',
      '如果你发现答案有分歧，就追问分歧来自哪里。多数时候不是计算问题，而是集合本身的描述不够明确。',
    ],
    [
      '底部 takeaway 要读慢一点：集合要明确，元素不重复，顺序不重要。',
      '下一页我们学习集合描述法，也就是当元素太多、不能一个个列出来时，怎样用条件来定义集合。',
    ],
  ],
  集合描述法: [
    ['现在进入集合描述法。它解决的问题是：有些集合太大，甚至无限大，我们不可能把元素全部列出来。'],
    [
      '左侧的结构可以读成一句话：所有满足某个条件的 x 组成的集合。重点不是冒号长什么样，而是冒号前面是变量，冒号后面是筛选条件。',
      '这里要练两种翻译：看到符号时能说成人话，看到中文描述时也能写成变量加条件的形式。',
    ],
    [
      '右侧例题一先看自然数中小于五的数。做法不是猜，而是先确定全集或变量范围，再逐个筛选满足条件的元素。',
      '例题二稍微复杂一点，里面有两个变量和一个等式条件。这里不要直接列答案：先看变量来自哪里，再看条件限制了哪些组合。',
    ],
    [
      '这一页的核心方法是：先找变量，再读条件，最后列元素。',
      '下一页我们复习常见数集，因为集合描述法经常要先说明变量来自自然数、整数、有理数还是实数。',
    ],
  ],
  常见数集: [
    [
      '这一页看似是符号复习，其实是在建立证明课的共同词汇。以后题目说“令 x 为整数”或“对任意实数”，你必须立刻知道对象范围变了。',
    ],
    [
      '左侧的包含关系从小到大组织常见数集。自然数、整数、有理数、实数、复数，它们不是孤立记号，而是一层一层扩大的对象世界。',
      '这里尤其要说清楚零的问题。有些教材把零放进自然数，有些不放。做证明时不要靠猜，题目或课程约定必须写明。',
    ],
    [
      '右侧例子用具体数字帮助分类。负二是整数，也是有理数和实数；二分之一不是整数，但它是有理数；根号二不是有理数，但它是实数。',
      '讲这个例子时不要只报答案，要追问理由：为什么一个数能写成两个整数的比值，为什么另一个不能。',
    ],
    [
      '本页最后记住：写清楚全集和数集约定，是严谨证明的第一步。',
      '下一页开始做集合运算，先学习并、交、差这三个最常用的动作。',
    ],
  ],
  '集合运算：并、交、差': [
    ['这一页开始把集合当作可以操作的对象。并、交、差不是三个孤立定义，而是三种筛选元素的规则。'],
    [
      '先看左侧维恩图。并集的意思是，只要在 A 或 B 其中一个里面，就收进来。数学里的“或”通常是包含式的或，两个都在也算。',
      '交集更严格，要求同时在 A 和 B 里面。差集则是不对称的：A 减 B 是在 A 里但不在 B 里的元素。',
    ],
    [
      '右侧计算题要按元素逐个检查。先列 A 和 B，再问每个候选元素满足哪条规则。',
      '特别提醒差集：A 减 B 和 B 减 A 通常不同。很多人会把“不同的部分”想成对称的，但差集有方向。',
    ],
    [
      '底部总结可以压成一句：并是至少在一个里，交是共同在两个里，差是在前者但不在后者。',
      '下一页讲补集。补集看起来像差集，但它必须先知道全集是什么。',
    ],
  ],
  补集与全集: [
    [
      '这一页的重点是：补集不能脱离全集来讲。最常见的错是只盯着 A，却忘了 A 是在哪个大集合里面被讨论。',
    ],
    [
      '先看左边图。全集 U 是整个讨论范围，A 只是其中一块。A 的补集，就是在 U 里但不在 A 里的部分。',
      '所以补集不是“世界上所有不在 A 里的东西”，而是“当前全集里不在 A 里的东西”。这句话要反复强调。',
    ],
    [
      '右侧例题展示同一个 A，在不同全集下会有不同补集。全集如果是整数，补集就只从整数里找；全集如果是实数，补集范围就大得多。',
      '讲题时先问：全集是谁？再问：A 是谁？最后才问：剩下的是谁？顺序不能乱。',
    ],
    [
      '本页结论是：读补集之前，先说清楚全集 U。',
      '下一页进入笛卡尔积。那里顺序会变得重要，正好和集合本身“顺序不重要”形成对比。',
    ],
  ],
  笛卡尔积: [
    ['这一页要区分两个层次：集合里的元素没有顺序，但有序对里的两个位置有顺序。'],
    [
      '左侧定义说的是 A 和 B 的笛卡尔积。它收集所有有序对，第一项来自 A，第二项来自 B。',
      '这里要把“第一项”和“第二项”讲出来。因为一旦变成有序对，括号里的位置就有意义。',
    ],
    [
      '右侧例子可以逐行生成。先固定 A 里的第一个元素，让它分别搭配 B 里的每个元素；再换 A 里的下一个元素，重复同样动作。',
      '这样列可以避免漏项，也能看出为什么元素个数通常是 A 的大小乘以 B 的大小。',
    ],
    [
      '右下角的不等号是本页最容易出错的地方。A 叉 B 通常不等于 B 叉 A，因为有序对的一、二位置交换了。',
      '下一页我们用子集和集合相等，把前面这些成员判断变成证明模板。',
    ],
  ],
  子集与集合相等: [
    ['这一页开始从“会算集合”走向“会证明集合关系”。MAT102 真正要训练的是这种证明动作。'],
    [
      '先看子集定义。说 S 是 T 的子集，意思不是 S 看起来小，而是每一个在 S 里的元素，也必须在 T 里。',
      '所以证明子集时，标准开头是：任取一个元素 x，假设 x 属于 S，然后推出 x 属于 T。',
    ],
    [
      '右侧讲集合相等。两个集合相等不能只证明一个方向，因为一个方向只能说明一边包含在另一边。',
      '完整证明要做两次包含：先证明 A 包含于 B，再证明 B 包含于 A。两个方向合起来，才得到集合相等。',
    ],
    [
      '底部 takeaway 要明确：证明集合相等，就是证明两个包含。',
      '下一页我们切到逻辑语言，区分命题和谓词，因为刚才的“任取 x”其实已经开始接近量词了。',
    ],
  ],
  '命题 vs 谓词': [
    [
      '这一页把集合语言接到逻辑语言。先问自己：一句话什么时候可以判断真假？能判断真假，它才是命题。',
    ],
    [
      '左侧命题框给的是已经有确定真值的句子。比如一个具体等式，或者一个明确的集合成员判断。',
      '命题的关键不是它一定为真，而是它有一个确定真值：要么真，要么假。',
    ],
    [
      '中间谓词框含有变量。变量没指定时，句子还没有确定真假，因为不同输入可能给出不同结果。',
      '比如“x 是偶数”不是完整命题。只有当 x 被指定，或者被量词绑定以后，它才变成可以判断真假的语句。',
      '右侧强调固定变量后才有真值。这里可以把 P 括号 x 读成“关于 x 的一个条件”。',
      '这一步非常关键，因为下一节的全称和存在，就是把谓词变成命题的工具。',
    ],
    [
      '本页收束：变量没定时是谓词，变量定了或被量词绑定后才有真值。',
      '下一页先学习最基本的逻辑连接词：且、或、非。',
    ],
  ],
  'AND、OR、NOT 真值表': [
    [
      '这一页的目标不是背表，而是理解三个逻辑连接词怎样改变真值。先把 AND、OR、NOT 分别读成“且、或、非”。',
    ],
    [
      '左侧维恩图给直觉。且对应共同部分，或对应至少落在一个集合里，非对应当前范围里不在这个集合里的部分。',
      '这和前面的交集、并集、补集是同一套思想，只是现在换成命题真假。',
    ],
    [
      '中间真值表要按行读。P 且 Q 只有在两个都真时才真；只要有一个假，整个“且”就失败。',
      'P 或 Q 至少一个真就真。这里特别强调，数学里的“或”包含两个都真的情况，不是日常语言里的二选一。',
      '非 P 最简单，但也最容易在复杂句子里漏掉。它把真变假，把假变真。',
      '右侧提醒的 exclusive or 可以简单带过：那是“恰好一个真”，不是我们默认的数学或。',
    ],
    [
      '本页 takeaway 是：且要都真，或要至少一个真，非会翻转真假。',
      '下一页我们回头整理常见错误，避免这些基础概念在后面证明里反复绊脚。',
    ],
  ],
  '常见错误：重复、顺序、模糊说法': [
    ['这一页是纠错页。前面学了很多定义，现在要把最常见的误解集中清掉。'],
    [
      '第一个错误是把重复元素算多次。集合只看不同元素，所以写两次同一个对象，不会让集合变大。',
      '第二个错误是把顺序看得太重。普通集合不看顺序，但有序对和笛卡尔积看顺序。这两个规则要分场景使用。',
    ],
    [
      '右侧的模糊说法提醒我们：如果标准不清楚，就很难形成集合或命题。',
      '比如“比较大的数”“好看的图形”这类说法，在没有额外标准时，不适合作为严谨集合的定义。',
      '再看谓词和命题的区别。含变量的句子不能急着说真或假，必须先指定变量，或者加上量词。',
      '这个错误如果不改，下一节讲全称命题和存在命题时会非常混乱。',
    ],
    [
      '本页结论是：集合不计重复，有序对看顺序，谓词要先决定变量。',
      '下一页做总收束，把集合和逻辑放到一条学习路线里。',
    ],
  ],
  '总结与下节钩子：走向量词': [
    [
      '最后一页不要快速念完。这里要把第一讲打包成一套工具箱：集合语言、集合运算、子集证明、基础逻辑。',
    ],
    [
      '左侧总结先回顾集合。元素是否属于集合，要靠明确标准判断；并、交、差、补集和笛卡尔积，都是在这个基础上做操作。',
      '然后回顾证明动作。证明子集要任取元素，证明集合相等要做两个方向的包含。这已经是正式证明的雏形。',
    ],
    [
      '右侧把逻辑接上来。命题有确定真假，谓词含变量；且、或、非帮助我们组合或否定简单句子。',
      '这些内容不是分散知识点，它们共同服务于后面一句完整数学断言：对哪些对象，满足什么条件，推出什么结论。',
    ],
    [
      '底部的下节问题是关键：怎样把谓词变成完整命题？答案就是量词。',
      '下一节会出现“对所有”和“存在某个”。今天学的集合范围、变量、真假判断，都会在量词里一起用上。',
    ],
  ],
};

function buildActions(scene, groups) {
  const previousActions = Array.isArray(scene.actions) ? scene.actions : [];
  const spotlights = previousActions.filter((action) => action?.type === 'spotlight');
  if (spotlights.length < groups.length) {
    throw new Error(
      `${scene.title}: expected at least ${groups.length} spotlights, found ${spotlights.length}`,
    );
  }

  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines, groupIndex) => {
    const spotlight = spotlights[groupIndex];
    actions.push({
      ...spotlight,
      id: spotlight.id || `${scene.id}-spotlight-${String(groupIndex + 1).padStart(2, '0')}`,
    });

    lines.forEach((text) => {
      actions.push({
        id: `${scene.id}-speech-mat102-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${scene.title} ${speechIndex}`,
        text: sanitizeMathForSpeech(text),
      });
      speechIndex += 1;
    });
  });

  return actions;
}

function validateCoverage(scenes) {
  const sceneTitles = new Set(scenes.map((scene) => scene.title));
  const missingInNotebook = Object.keys(NARRATION).filter((title) => !sceneTitles.has(title));
  if (missingInNotebook.length > 0) {
    throw new Error(`Narration references missing scenes: ${missingInNotebook.join(', ')}`);
  }

  const missingNarration = scenes.filter((scene) => !NARRATION[scene.title]);
  if (missingNarration.length > 0) {
    throw new Error(
      `Scenes without narration: ${missingNarration.map((scene) => scene.title).join(', ')}`,
    );
  }
}

function validateActions(scene) {
  const elementIds = new Set(
    (scene.content?.canvas?.elements || []).map((element) => element?.id).filter(Boolean),
  );
  const seen = new Set();
  for (const action of scene.actions || []) {
    if (action.id) {
      if (seen.has(action.id)) throw new Error(`${scene.title}: duplicate action id ${action.id}`);
      seen.add(action.id);
    }
    if (action.type === 'spotlight' && !elementIds.has(action.elementId)) {
      throw new Error(`${scene.title}: invalid spotlight target ${action.elementId}`);
    }
    if (action.type === 'speech') {
      const text = action.text || '';
      if (/[{}_^√∫]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(text)) {
        throw new Error(`${scene.title}: TTS-unfriendly math symbols in "${text}"`);
      }
    }
  }
}

function writeArtifacts(scenes) {
  if (!fs.existsSync(SCENES_PATH)) return;

  const fileScenes = JSON.parse(fs.readFileSync(SCENES_PATH, 'utf8'));
  const actionBySceneId = new Map(scenes.map((scene) => [scene.id, scene.actions]));
  const nextFileScenes = fileScenes.map((scene) => ({
    ...scene,
    actions: actionBySceneId.get(scene.id) || scene.actions,
  }));

  fs.writeFileSync(SCENES_PATH, JSON.stringify(nextFileScenes, null, 2));
  fs.writeFileSync(
    ACTIONS_PATH,
    JSON.stringify(
      nextFileScenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        order: scene.order,
        actions: scene.actions,
      })),
      null,
      2,
    ),
  );
}

async function main() {
  loadEnvLocal();
  const prisma = new PrismaClient();

  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: NOTEBOOK_ID },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });
    if (!notebook) throw new Error(`Notebook not found: ${NOTEBOOK_ID}`);

    validateCoverage(notebook.scenes);

    const updatedScenes = notebook.scenes.map((scene) => {
      const actions = buildActions(scene, NARRATION[scene.title]);
      const nextScene = { ...scene, actions };
      validateActions(nextScene);
      return nextScene;
    });

    const speechTotal = updatedScenes.reduce(
      (total, scene) => total + scene.actions.filter((action) => action.type === 'speech').length,
      0,
    );
    const spotlightTotal = updatedScenes.reduce(
      (total, scene) =>
        total + scene.actions.filter((action) => action.type === 'spotlight').length,
      0,
    );

    if (!DRY_RUN) {
      for (const scene of updatedScenes) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { actions: scene.actions },
        });
      }
      await prisma.notebook.update({
        where: { id: NOTEBOOK_ID },
        data: { updatedAt: new Date() },
      });
      writeArtifacts(updatedScenes);
    }

    console.log(
      `${DRY_RUN ? 'Would update' : 'Updated'} 01 - 集合与命题逻辑: ${updatedScenes.length} scenes, ${speechTotal} speech segments, ${spotlightTotal} spotlights`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
