#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';
import { generatedNotebookDir } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat102-zh-induction-i-20260519';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const SCENES_PATH = path.join(OUTPUT_DIR, 'notebook-scenes.json');
const ACTIONS_PATH = path.join(OUTPUT_DIR, 'scene-actions.json');
const DRY_RUN = process.argv.includes('--dry-run');

const COURSE_SPINE = {
  logline: '用有限的起点检查和推进规则，证明无限多个命题都被同一条链条覆盖。',
  centralQuestion: '怎样用有限的证明工作，覆盖无限多个编号命题？',
  closingCallback: '每一种归纳都要说清起点、允许使用的已知范围，以及从旧情况走到新情况的规则。',
};

const PAGE_PLANS = {
  '封面：像多米诺骨牌一样证明': {
    fromPrevious: '这本从一个很大的证明问题开始：无限多个命题不可能一个一个检查完。',
    pageMove: '先用多米诺骨牌建立直觉：只要第一块倒下，并且每一块都会推倒下一块，整排都会倒。',
    main: '归纳法的重点不是“看起来都对”，而是把无限检查压缩成两个任务：起点成立，推进规则成立。',
    board:
      '看右侧图像时，把每一块骨牌想成一个编号命题。第一个编号对应起点，后一块被前一块推出，对应归纳步骤。',
    check: '如果只看前几块倒下，那只是实验；如果能证明任意一块会推倒下一块，才是在证明整条链。',
    transfer: '带走两个词：起点和推进。后面每个例题都要先找这两个位置。',
    toNext: '下一页把这个直觉放进一个具体不等式里，看为什么检查几个例子还不算证明。',
  },
  '引入：一个证明如何覆盖所有 n？': {
    fromPrevious: '上一页用骨牌说明了链条感，现在我们把链条换成关于 n 的命题。',
    pageMove: '这一页用“二 n 加二小于等于四 n”来问：怎么从有限检查走到所有 n 都成立。',
    main: '只代入 n 等于一、二、三，只能增加信心，不能覆盖无限多个 n。真正需要的是“如果某一步成立，下一步也成立”。',
    board: '看右侧例题时，先不要急着算答案。先问：当前命题是什么，下一编号的命题又多了什么。',
    check: '这里的判断点是：例子只能告诉你已经看过的编号，归纳步骤才负责没看过的编号。',
    transfer: '从这一页开始，每道归纳题都要分成两问：起点在哪里，旧一步怎样推出新一步。',
    toNext: '下一页把这两问整理成正式的归纳法原理。',
  },
  归纳法原理: {
    fromPrevious: '上一页发现检查例子不够，所以现在需要一条正式规则来保证整条链不断。',
    pageMove: '这一页把归纳法写成三个位置：起始情形、归纳假设、目标命题。',
    main: '起始情形通常是 P 括号一括号。归纳步骤不是直接证明所有 P，而是假设 P 括号 k 括号成立，再推出 P 括号 k 加一括号。',
    board: '看右侧结构时，把 P 括号 k 括号当成已经倒下的那块骨牌，把 P 括号 k 加一括号当成下一块。',
    check:
      '最容易混的是归纳假设和目标命题。你只能暂时使用 P 括号 k 括号，不能提前使用 P 括号 k 加一括号。',
    transfer:
      '以后写归纳证明时，先写清“假设什么”，再写清“要推出什么”。这一步不清楚，后面很容易偷用结论。',
    toNext: '下一页用不等式例题完整走一遍这套结构。',
  },
  '例题：不等式归纳证明': {
    fromPrevious: '上一页给了归纳法模板，现在我们用它处理一个不等式命题。',
    pageMove: '这一页的动作是把“二 n 加二小于等于四 n”拆成起点、假设和目标。',
    main: '先检查起点，比如 n 等于一时，左边是四，右边也是四，所以起点站住了。',
    board:
      '进入归纳步骤时，假设二 k 加二小于等于四 k。目标不是重复这一句，而是证明二乘 k 加一再加二，小于等于四乘 k 加一。',
    check:
      '关键是让旧不等式帮你控制新不等式。每一次变形都要能说出：我用了归纳假设，还是用了普通代数。',
    transfer: '不等式归纳题的稳定流程是：写目标，找旧式子，再把新目标改写到能调用旧式子的形状。',
    toNext: '下一页换成整除命题，看看归纳假设会怎样变成一个整数方程。',
  },
  '例题：整除命题归纳证明': {
    fromPrevious: '上一页的不等式靠大小关系推进，现在整除题要靠“能写成倍数”推进。',
    pageMove: '这一页证明五整除六的 k 次方减一，核心是把归纳假设翻译成整数方程。',
    main: '如果五整除六的 k 次方减一，就可以写成：六的 k 次方减一等于五 d。这个等号是后面能代入的证据。',
    board:
      '看右侧推理时，目标是六的 k 加一次方减一。把它改写成六乘六的 k 次方减一，再拆出六乘括号六的 k 次方减一括号，加五。',
    check:
      '这样一来，第一部分因为归纳假设是五的倍数，后面的五本来也是五的倍数，所以整体仍然被五整除。',
    transfer: '整除归纳题要先把“整除”变成“等于某个整数倍”。不做这一步，归纳假设就很难真正用上。',
    toNext: '下一页我们离开纯代数，看看归纳也可以证明一种几何构造一直做得下去。',
  },
  '几何例子：L 形铺砖': {
    fromPrevious: '前两页都在代数式里推进，现在这一页让你看到归纳也能处理构造问题。',
    pageMove: '题目看的是缺一格的二的 n 次方乘二的 n 次方棋盘，问能不能用 L 形砖铺满。',
    main: '起点通常是一块很小的棋盘，先确认缺一格后确实可以铺。归纳步骤要说明：如果小棋盘能铺，大棋盘也能铺。',
    board:
      '看右侧图像时，关键动作是把大棋盘切成四个小棋盘。原本缺口在其中一块，中心再放一块 L 形砖，让另外三块也各自像“缺一格”。',
    check:
      '这一步漂亮的地方是：我们不是硬铺整块大棋盘，而是把大问题改造成四个已经允许使用归纳假设的小问题。',
    transfer: '几何归纳题要找“如何把大图切回同一种小图”。只要形状回到同类问题，归纳假设才有用。',
    toNext: '下一页转到求和记号。那里也会出现同样思想：旧的一段，加上新的一项。',
  },
  'Sigma 记号像 for-loop': {
    fromPrevious: '上一页把大棋盘拆成小棋盘；求和里也会把长和式拆成旧和加新项。',
    pageMove: '这一页先把 Sigma 记号读成一个循环：从哪里开始，在哪里结束，每次加什么。',
    main: 'Sigma 不是装饰符号。它包含三个信息：下标从哪里跑，跑到哪里停，以及每一步累加的表达式是什么。',
    board:
      '看右侧例子时，把 index 想成循环变量。每换一个 index，就把 summand 里的变量替换一次，然后把结果加起来。',
    check: '最容易错的是上下限和变量名。变量名只是占位符，真正决定项数的是起点和终点。',
    transfer:
      '求和题进入归纳时，通常要把第 k 加一项单独拆出来：旧和负责前 k 项，新项负责最后一项。',
    toNext: '下一页就用这个拆法证明一个求和公式。',
  },
  用归纳证明求和公式: {
    fromPrevious: '上一页把 Sigma 看成循环，现在要证明这个循环产生的和式有一个闭合公式。',
    pageMove: '这一页的核心动作是：先用归纳假设处理旧和，再把第 k 加一项接上去。',
    main: '目标不是重新从第一项加到最后一项，而是承认前 k 项已经由归纳假设处理好了。',
    board:
      '看右侧推导时，旧和给出 k 除以 k 加一。然后再加上第 k 加一项对应的新分式。接下来只是通分和化简。',
    check:
      '这里一定要盯住目标形状。证明第 k 加一层时，最后应该得到 k 加一除以 k 加二，而不是停在没有整理完的式子。',
    transfer: '求和归纳题的检查问题是：我有没有把旧和替换成归纳假设？我有没有把新项准确加进去？',
    toNext: '下一页专门整理归纳证明里的常见错误，帮你检查自己有没有偷偷跳步。',
  },
  归纳证明常见错误: {
    fromPrevious: '前面几个例题已经展示了正确流程，现在要反过来检查哪些地方最容易破坏归纳链。',
    pageMove: '这一页不是新技巧，而是一张错误雷达：起点、假设、目标、变量，每一处都可能出问题。',
    main: '漏掉起点，就像多米诺第一块没有倒；假设结论，就像还没证明下一块会倒，已经把它当成倒下了。',
    board:
      '看右侧错误例子时，不要只说“这里不严谨”。要指出它到底错在没有写起点、没有声明归纳假设，还是把 k 和 n 混在一起。',
    check:
      '检查一篇归纳证明，可以按四句问：起点写了吗？假设写清了吗？目标写清了吗？推进中真的用了假设吗？',
    transfer: '这页的迁移规则是：归纳证明不是一段自然语言，而是一套可审计的结构。',
    toNext: '下一页放宽起点和步长，说明归纳链不一定非要从一开始。',
  },
  '不止从 1 开始的归纳': {
    fromPrevious: '上一页检查了标准归纳的错误，现在我们看标准模板可以怎样调整。',
    pageMove: '这一页说明归纳的起点可以不是一，步长也可以根据命题改变。',
    main: '如果命题只从某个整数以后才成立，起点就应该放在那里。不是所有归纳都必须从 n 等于一开始。',
    board:
      '看右侧例子时，先判断它覆盖的是哪些编号：所有整数、从某个起点以后的整数，还是只覆盖同一奇偶性的编号。',
    check: '如果步长是二，那么链条只会在同一类编号里移动。要覆盖两类编号，通常就需要两个起点。',
    transfer: '归纳结构要匹配命题范围。先看命题想覆盖哪些 n，再决定起点和推进步长。',
    toNext: '下一页进入强归纳。那里不只是改变起点，而是改变允许使用的旧情况范围。',
  },
  '强归纳与多个 base cases': {
    fromPrevious: '上一页改变了起点和步长，这一页改变归纳假设的力量。',
    pageMove: '强归纳允许你在证明第 k 加一步时，使用前面所有已经证明过的情况，而不只是第 k 情况。',
    main: '三分钱和五分钱邮资例子里，当前金额可能要退回三或退回五，所以只知道上一项不够，有时需要一整段旧情况。',
    board:
      '看右侧例子时，多个起点不是形式要求，而是为了保证后面的每一次退回，都能落在已经覆盖的范围里。',
    check:
      '强归纳的危险是旧情况范围说不清。你要明确：我现在证明哪个 k，我允许使用哪些小于等于 k 的情况。',
    transfer: '当新情况可能依赖不止一个旧情况，或者要往前退好几步时，就考虑强归纳和多个起点。',
    toNext: '最后一页把归纳连接到递归和结构归纳：对象不是按数字长大，而是按构造规则长大。',
  },
  '递归、结构归纳与下节钩子': {
    fromPrevious: '上一页的强归纳已经扩大了“旧情况”的范围，现在我们把归纳从数字编号推到递归对象。',
    pageMove:
      '递归定义先给 basis elements，也就是最基本对象；再给 constructors，也就是生成新对象的规则。',
    main: '结构归纳的想法和多米诺仍然一样：先证明基本对象成立，再证明每一种构造规则都会保留性质。',
    board:
      '看右侧结构时，把每个 constructor 当成一种推进方式。只要所有推进方式都能保留目标性质，所有递归生成的对象都会满足它。',
    check: '这里的重点不是背新名词，而是看见同一条主线：对象怎么生成，证明就沿着生成方式走。',
    transfer: '到这里，本节主线可以收束为一句话：归纳就是沿着对象的生成路径证明。',
    toNext: `下一节继续看递归对象时，仍然带着这个问题：${COURSE_SPINE.closingCallback}`,
  },
};

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

function cleanSpeech(text) {
  return sanitizeMathForSpeech(String(text ?? ''))
    .replace(/\bSigma\b/g, '求和')
    .replace(/\bindex\b/g, '下标')
    .replace(/\bsummand\b/g, '被加项')
    .replace(/\s+/g, ' ')
    .replace(/([。！？；：])\s+/g, '$1')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .trim();
}

function groupsFor(sceneTitle) {
  const plan = PAGE_PLANS[sceneTitle];
  if (!plan) throw new Error(`Missing continuity plan for scene: ${sceneTitle}`);

  return [
    [`${plan.fromPrevious} 整节课的主问题是：${COURSE_SPINE.centralQuestion}`, plan.pageMove],
    [plan.main, `这一步回到本节主线：${COURSE_SPINE.logline}`],
    [plan.board, plan.check],
    [plan.transfer, plan.toNext],
  ];
}

function buildActions(scene) {
  const spotlights = (scene.actions || []).filter((action) => action?.type === 'spotlight');
  if (spotlights.length < 4) {
    throw new Error(`${scene.title}: expected at least 4 spotlights, found ${spotlights.length}`);
  }

  const groups = groupsFor(scene.title);
  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines, groupIndex) => {
    const spotlight = spotlights[groupIndex];
    actions.push({
      ...spotlight,
      id:
        spotlight.id ||
        `${scene.id}-spotlight-induction-continuity-${String(groupIndex + 1).padStart(2, '0')}`,
    });
    for (const line of lines) {
      actions.push({
        id: `${scene.id}-speech-induction-continuity-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${scene.title} ${speechIndex}`,
        text: cleanSpeech(line),
      });
      speechIndex += 1;
    }
  });

  return actions;
}

function validateActions(scene) {
  const elementIds = new Set(
    (scene.content?.canvas?.elements || []).map((element) => element?.id).filter(Boolean),
  );
  const seen = new Set();
  const distantStyle =
    /学生|讲的时候|让学生|学习者|听众|用户|课堂停顿|帮学生|学生应该|学生会|可以让学生/;
  const ttsBadSymbols = /[{}_^√∫θΔπαβγλμσΣΩ∞≈≤≥≠±×÷]|=>|<=|>=|[<>]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/;
  const templateSmell = /不是孤立概念|右侧例题或图像|这一页解决什么问题/;

  for (const action of scene.actions || []) {
    if (action.id) {
      if (seen.has(action.id)) throw new Error(`${scene.title}: duplicate action id ${action.id}`);
      seen.add(action.id);
    }
    if (action.type === 'spotlight' && !elementIds.has(action.elementId)) {
      throw new Error(`${scene.title}: invalid spotlight target ${action.elementId}`);
    }
    if (action.type !== 'speech') continue;
    const text = action.text || '';
    if (distantStyle.test(text)) throw new Error(`${scene.title}: distant style in "${text}"`);
    if (ttsBadSymbols.test(text))
      throw new Error(`${scene.title}: TTS-unfriendly math in "${text}"`);
    if (templateSmell.test(text)) throw new Error(`${scene.title}: template smell in "${text}"`);
  }
}

function writeArtifacts(scenes) {
  if (!fs.existsSync(SCENES_PATH)) return false;

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
  return true;
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

    const updatedScenes = notebook.scenes.map((scene) => {
      const nextScene = { ...scene, actions: buildActions(scene) };
      validateActions(nextScene);
      return nextScene;
    });

    const speechTotal = updatedScenes.reduce(
      (sum, scene) => sum + scene.actions.filter((action) => action.type === 'speech').length,
      0,
    );
    const spotlightTotal = updatedScenes.reduce(
      (sum, scene) => sum + scene.actions.filter((action) => action.type === 'spotlight').length,
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
      `${DRY_RUN ? 'Would update' : 'Updated'} MAT102 induction continuity script: ${updatedScenes.length} scenes, ${speechTotal} speech segments, ${spotlightTotal} spotlights`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
