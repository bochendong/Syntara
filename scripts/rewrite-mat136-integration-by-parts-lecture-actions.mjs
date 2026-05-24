#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  rebuildActions,
  rebuildSceneContent,
  targetsForScene,
  validateScene,
} from './enhance-mat136-spotlight-focus.mjs';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';

const NOTEBOOK_ID = 'nb-mat136-integration-by-parts-week2-v2-20260519151624';
const DRY_RUN = process.argv.includes('--dry-run');

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

const PARTS_NARRATION = {
  'MAT 136 · 分部积分': [
    [
      '这一节课的主题是分部积分。先不要急着背公式，先看整节课路线：为什么需要它，公式怎么用，公式从哪里来，怎么选 u，最后用多个例题巩固。',
      '这条路线很重要，因为分部积分最难的地方不是代公式，而是知道什么时候该用、怎么分配角色。',
      '左边的编号像课堂地图。我们会先从问题出发，再到公式，再到来源，最后回到做题策略。',
    ],
    [
      '底部主线说得很清楚：把难的乘积积分，变成一个乘积结果减去一个更简单的积分。',
      '也就是说，分部积分不是把题目一键算完，而是把原来的难积分改造成一个更好处理的新积分。',
      '今天的目标是：看见乘积时能判断，能选择 u 和 dv，能完整跟住符号。',
    ],
  ],
  '为什么需要分部积分？': [
    [
      '先从换元法说起。左边这种积分，二 x 乘 cosine x squared，里面有清楚的内层 x squared，旁边有它的导数二 x。',
      '这种题用换元法很自然，因为它符合反向链式法则。',
    ],
    [
      '中间这些题就不一样了。x e to x、x cosine x、ln x，看起来没有一个明确的内层和内层导数配对。',
      '它们更像是乘积，或者能看成乘以一的函数。普通换元法在这里不再是第一选择。',
    ],
    [
      '右边给出新的想法：把乘积求导倒过来。',
      '乘积求导会产生两项；分部积分就是利用这个结构，把一个乘积积分转移成另一个积分。',
    ],
    [
      '底部问题是本节课的入口：怎样把一个乘积积分拆成更容易处理的东西？',
      '下一页我们先不证明，先用一个例子看公式里的四个位置分别怎么放。',
    ],
  ],
  '公式怎么用：先看一个例子': [
    [
      '先看顶部核心公式：u dv 的积分等于 u v 减 v du 的积分。',
      '这行公式最重要的是四个角色：u、dv、du、v。如果只背整行，很容易不知道题目里的东西该放哪里。',
    ],
    [
      '例题是 x e to x。我们先分配角色：选 u 等于 x，因为 x 求导会变成一；选 dv 等于 e to x dx，因为它容易积分。',
      '接着得到 du 等于 dx，v 等于 e to x。',
    ],
    [
      '现在套公式。原来的 x e to x dx 被看成 u dv，于是变成 x e to x 减去 e to x dx 的积分。',
      '请特别注意减号。它来自公式，不是算到一半临时出现的。',
    ],
    [
      '剩下的积分是 e to x dx，这个可以直接算。',
      '所以答案是 x e to x 减 e to x，加 C，也可以写成 e to x 乘 x 减一，加 C。',
    ],
    [
      '最后的位置检查很重要。u 是被求导的那一边，dv 是被积分的那一边。',
      '每次分部积分，都要先把 u、dv、du、v 这四个位置填清楚，再套公式。',
    ],
  ],
  '公式从哪来？乘积法则': [
    [
      '现在回头看公式来源。起点是乘积法则：uv 的导数等于 u prime v 加 u v prime。',
      '这条规则大家已经熟悉，所以分部积分不是新魔法，它只是把乘积法则反向使用。',
    ],
    [
      '把乘积法则写成微分形式，就是 d(uv) 等于 u dv 加 v du。',
      '这个写法把后面公式里的 u dv 和 v du 直接摆出来了。',
    ],
    [
      '两边积分以后，左边积分 d(uv) 回到 uv。',
      '右边则出现两个积分：u dv 的积分，加上 v du 的积分。',
    ],
    [
      '我们想解出 u dv 的积分，所以把 v du 的积分移到另一边。',
      '移项以后就得到 u dv 的积分等于 uv 减 v du 的积分。',
    ],
    [
      '这页的核心结论是：分部积分公式里的减号来自移项。',
      '理解这个来源以后，后面做题时更容易跟住符号，而不是机械背公式。',
    ],
  ],
  '怎么选 u 和 dv？': [
    [
      '这页解决分部积分最实际的问题：怎么选 u 和 dv。',
      '第一个硬条件是 u 求导以后要变简单。第二个硬条件是 dv 必须真的会积分。',
      '如果 dv 选成一个你不会积分的部分，题目会卡住。',
    ],
    [
      '中间的 LIATE 是选 u 的优先级提醒：Log、Inverse trig、Algebraic、Trig、Exponential。',
      '它不是绝对法律，但很适合帮你起步，尤其是不知道谁当 u 的时候。',
    ],
    [
      '右边快速判断给例子。x e to x 通常选 x 当 u，因为 x 求导变简单。',
      'ln x 看起来不是乘积，但可以看成 ln x 乘一；ln x 求导会变成一除以 x，所以也适合当 u。',
    ],
    [
      '底部天平提醒我们：好的选择会让新的积分变简单，坏的选择会让题目更复杂。',
      '每次分配完角色，都问一句：剩下的 v du 积分有没有变容易？',
    ],
  ],
  '例题 1：∫ x cos x dx': [
    [
      '第一题是 x cosine x。它是多项式乘三角函数，适合分部积分。',
      '选择 u 等于 x，因为 x 求导后变成一；选择 dv 等于 cosine x dx，因为 cosine 容易积分成 sine。',
    ],
    [
      '套公式后，原积分等于 x sine x 减去 sine x 的积分。',
      '这里先把公式里的减号标出来。这个减号会影响最后答案的正负。',
    ],
    [
      '现在算剩下的积分。sine x 的积分是负 cosine x。',
      '前面已经有一个减号，所以减去负 cosine x，最后变成加 cosine x。',
    ],
    [
      '常见错误就是把最后写成减 cosine x。',
      '检查方法是分两步跟符号：公式自带一个减号，sine 的反导又带一个负号。两个负号合在一起变正。',
    ],
  ],
  '例题 2：∫ ln x dx': [
    [
      '第二题看起来不是乘积，但我们可以把 ln x 看成 ln x 乘一。',
      '这是分部积分非常重要的技巧：有些函数单独不好积，但乘以一以后可以进入 u dv 框架。',
    ],
    [
      '选 u 等于 ln x，因为它求导会变成一除以 x。',
      '选 dv 等于 dx，所以 v 等于 x。这样两个角色都很自然。',
    ],
    [
      '套公式以后，得到 x ln x 减去 x 乘一除以 x 的积分。',
      'x 乘一除以 x 化成一，剩下的积分就是一的积分。',
    ],
    [
      '所以答案是 x ln x 减 x 加 C。',
      '这页要记住：ln x 的积分不是把 ln x 简单变形，而是靠分部积分把它转成一的积分。',
    ],
    [
      '错误选择是把 dv 选成 ln x dx。这样你一开始就需要知道 ln x 怎么积，等于把原题又放回自己身上。',
      '所以选 dv 的基本原则是：它必须是你已经会积分的部分。',
    ],
  ],
  '例题 3：分部一次还不够': [
    [
      '第三题是 x squared e to x。第一次分部积分时，还是让多项式部分当 u，让指数部分当 dv。',
      '选 u 等于 x squared，dv 等于 e to x dx。',
      '第一次分部以后，多项式次数会从二降到一，但题目还没有结束。',
    ],
    [
      '剩下的积分里还有二 x e to x。它仍然是多项式乘指数，所以需要再分部一次。',
      '第二次让二 x 当 u，e to x dx 继续当 dv。',
    ],
    [
      '第二次算完后，把结果代回第一次。',
      '整理时可以把 e to x 提出来，得到 e to x 乘 x squared 减二 x 加二，再加 C。',
    ],
    [
      '这页的规律非常重要：多项式乘指数时，每分部一次，多项式次数通常下降一。',
      '次数降到零，剩下的积分就容易结束。这个规律也为后面的表格法做铺垫。',
    ],
  ],
  '挑战例题 4：先换元再分部': [
    [
      '挑战题先不要急着选 u 和 dv。先读结构：题目里既有复合函数的影子，也有乘积积分的影子。',
      '这类题要先判断第一步用什么方法。如果直接分部很乱，可能要先换元整理形状。',
    ],
    [
      '页面提示先做换元。换元的目的，是把复杂内层先变成一个新变量 t。',
      '这样原积分会变成一个更标准的 t 变量下的乘积积分。',
    ],
    [
      '进入 t 世界以后，再使用分部积分。',
      '这时选 u 和 dv 会比在原来的 x 表达式里清楚很多。',
      '所以这个例子训练的是方法顺序：先把结构整理出来，再套分部积分。',
    ],
    [
      '算完以后，还要代回 x。',
      '因为中间用了换元，答案不能停在 t；因为用了分部积分，也要检查加 C 和符号。',
    ],
    [
      '方法提醒是本页重点：复杂积分不一定只用一种技巧。',
      '先换元再分部，或者先代数整理再分部，都是为了让剩下的积分变得更简单。',
    ],
  ],
  '挑战例题 5：∫ arctan x dx': [
    [
      '这题和 ln x 很像：arctan x 看起来不是乘积，但可以把它看成 arctan x 乘一。',
      '只要函数本身求导会变简单，乘以一就是进入分部积分的入口。',
    ],
    [
      '选 u 等于 arctan x，因为它的导数是 one over one plus x squared。',
      '选 dv 等于 dx，所以 v 等于 x。',
    ],
    [
      '套公式以后，得到 x arctan x 减去 x over one plus x squared 的积分。',
      '现在剩余积分比原来的 arctan x 更可处理。',
    ],
    [
      '处理剩余积分时，看分母 one plus x squared 的导数是二 x。',
      '所以 x over one plus x squared 的积分会产生二分之一 ln one plus x squared。',
    ],
    [
      '最后答案是 x arctan x 减二分之一 ln one plus x squared，加 C。',
      '这页的迁移方法是：反三角函数常常适合当 u，因为求导后会变成代数分式。',
    ],
  ],
  '本节总结：分部积分怎么想': [
    [
      '总结页先看一条主线：看见乘积积分，选择 u 和 dv，套公式，再检查剩下的积分。',
      '分部积分的目标不是让公式变漂亮，而是让新的积分比原来的更简单。',
    ],
    [
      '做题四步可以固定下来。第一，判断是否是乘积，或者能不能看成乘以一。',
      '第二，选 u，让它求导后变简单。第三，选 dv，让它能被顺利积分。第四，套公式并继续处理剩下的积分。',
    ],
    [
      '核心公式还是 u dv 的积分，等于 uv 减去 v du 的积分。',
      '每次写公式时都要明确：谁是 u，谁是 dv，du 是什么，v 是什么。',
    ],
    [
      '今天见过的题型包括多项式乘指数、多项式乘三角、对数函数、反三角函数，以及需要先换元再分部的复合题。',
      '这些例子共同训练的不是同一套外形，而是同一个判断：怎样让剩下的积分变简单。',
    ],
    [
      '常见错误集中在选错 u、dv 不会积分、漏掉 dx、漏掉负号、忘记加 C。',
      '其中负号最容易在 uv 减 v du 这一步丢失，所以每一步都要保留完整结构。',
    ],
    [
      '最后的下节课钩子是表格法，以及定积分里的分部积分。',
      '也就是说，今天先建立基本思想；下一步会把重复分部和上下限处理讲得更系统。',
    ],
  ],
};

function buildSpeechActions(scene, groups) {
  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines) => {
    lines.forEach((text) => {
      actions.push({
        id: `${scene.id}-speech-parts-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${scene.title} ${speechIndex}`,
        text: sanitizeMathForSpeech(text),
      });
      speechIndex += 1;
    });
  });

  return actions;
}

function validateSceneCoverage(scenes) {
  const sceneTitles = new Set(scenes.map((scene) => scene.title));
  const missingInDb = Object.keys(PARTS_NARRATION).filter((title) => !sceneTitles.has(title));
  if (missingInDb.length > 0) {
    throw new Error(`Narration references missing scenes: ${missingInDb.join(', ')}`);
  }

  const missingNarration = scenes.filter((scene) => !PARTS_NARRATION[scene.title]);
  if (missingNarration.length > 0) {
    throw new Error(
      `Scenes without narration: ${missingNarration.map((scene) => scene.title).join(', ')}`,
    );
  }
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

    validateSceneCoverage(notebook.scenes);

    let speechTotal = 0;
    let sceneTotal = 0;

    for (const scene of notebook.scenes) {
      const groups = PARTS_NARRATION[scene.title];
      const speechActions = buildSpeechActions(scene, groups);
      const sceneForAlignment = { ...scene, actions: speechActions };
      const targets = targetsForScene(NOTEBOOK_ID, sceneForAlignment);
      const content = rebuildSceneContent(sceneForAlignment, targets);
      const actions = rebuildActions(sceneForAlignment, targets);
      validateScene(sceneForAlignment, content, actions);

      speechTotal += actions.filter((action) => action.type === 'speech').length;
      sceneTotal += 1;

      if (!DRY_RUN) {
        await prisma.scene.update({
          where: { id: scene.id },
          data: { content, actions },
        });
      }
    }

    if (!DRY_RUN) {
      await prisma.notebook.update({
        where: { id: NOTEBOOK_ID },
        data: { updatedAt: new Date() },
      });
    }

    console.log(
      `${DRY_RUN ? 'Would update' : 'Updated'} 05 - 分部积分: ${sceneTotal} scenes, ${speechTotal} speech segments`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
