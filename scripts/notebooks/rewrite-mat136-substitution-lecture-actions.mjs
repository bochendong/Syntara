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

const NOTEBOOK_ID = 'nb-mat136-substitution-week2-20260518183518';
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

const SUBSTITUTION_NARRATION = {
  'MAT 136 · 换元法': [
    [
      '这一节课的关键词是换元法，但不要先把它理解成“换一个字母”。它真正的作用，是把一个看起来复杂的积分，改写成一个我们已经会算的简单积分。',
      '先看左边的路线。第一步是看见复合函数，也就是函数里面还套着函数。换元法最喜欢处理这种结构。',
      '第二步是选 u。选 u 不是随便取名字，而是把最复杂、最内层、最能简化题目的部分先抓出来。',
      '第三步是把 dx 和旁边的因子一起处理成 du。很多错误都发生在这里：只换了函数，没有把微分一起换干净。',
    ],
    [
      '第四步是积分完成后换回 x。因为原题问的是 x 的积分，最后答案不能停在 u。',
      '右边的虚线框提醒我们，换元法来自反向链式法则。链式法则求导会带出内层导数；换元法就是看到这个结构以后，把它倒回去。',
      '今天的重点不是背步骤，而是培养一种检查习惯：换完以后，积分里是不是只剩 u 和 du。',
      '下一页我们先把这个反向链式法则讲清楚，再进入例题。',
    ],
  ],
  '换元法核心：反向链式法则': [
    [
      '先看左边公式。如果 u 等于 g(x)，那么 du 就等于 g prime x dx。',
      '这句话的意思是：当我们把 g(x) 叫做 u 的时候，不能只换函数本身，旁边的 dx 也要通过导数一起转换。',
      '中间的积分公式展示了换元法最理想的形状：f(g(x)) 旁边刚好有 g prime x dx。',
      '这时整个积分就能变成 f(u) du。复杂的复合函数，被改写成关于 u 的普通函数。',
    ],
    [
      '右边列出选 u 的三个信号。第一，看有没有复杂内层，比如括号、根号里面、指数里面、三角函数里面。',
      '第二，看旁边有没有这个内层的导数。哪怕差一个常数，也常常可以处理。',
      '第三，看换完以后能不能只剩 u 和 du。这是最重要的验收标准。',
      '如果只满足前两条，但最后还有 x 留在积分里，就说明换元还没有真正完成。',
    ],
    [
      '底部警告要讲慢一点：换元不是改名字。不是把三 x 平方加四叫做 u 就结束了。',
      '真正的换元要把原来的变量世界完整搬到新的变量世界。函数、因子、dx，甚至定积分的上下限，都要一起检查。',
      '这节课每个例题都围绕同一个问题：我选的 u，是否能把题目换干净？',
      '下一页先看最标准的情况，括号里面刚好就是 u，du 也完整出现在旁边。',
    ],
  ],
  '例 1：括号里面就是 u': [
    [
      '第一题先不要急着算。先读题：积分里有一个括号三 x squared 加四，外面整体四次方，旁边还有六 x dx。',
      '这道题的形状很标准，因为最复杂的对象很明显就是括号里面的三 x squared 加四。',
      '请先问：如果把这个括号叫做 u，它的导数是什么？',
    ],
    [
      '选 u 等于三 x squared 加四。接着算 du，得到六 x dx。',
      '这一步非常舒服，因为题目里正好有六 x dx。也就是说，du 完整地出现在原积分旁边。',
      '所以我们不需要补常数，也不需要处理负号，直接把六 x dx 整块换成 du。',
    ],
    [
      '全换以后，原积分变成 u 的四次方 du。现在题目已经从复合函数积分，变成最普通的幂函数积分。',
      '请注意这一步的成就：难点不是 u 的四次方怎么积，而是怎样把原题干净地变成 u 的四次方。',
    ],
    [
      '接下来积分得到 u 的五次方除以五，再把 u 换回三 x squared 加四。',
      '因为这是不定积分，最后要加 C。这里和上一节定积分不同，不能漏掉常数。',
      '本题的迁移方法是：先找最复杂的括号，再检查它的导数是否在旁边。完全匹配时，换元会非常直接。',
    ],
  ],
  '例 2：差一个常数也可以': [
    [
      '第二题看起来和第一题相似，但故意差一个常数。根号里面是 z squared minus five，外面只有 z dz。',
      '如果选 u 等于 z squared minus five，那么 du 等于二 z dz。题目里不是二 z dz，而是 z dz。',
      '这时不要放弃。差一个常数因子，通常可以补出来。',
    ],
    [
      '由 du 等于二 z dz，可以得到 z dz 等于二分之一 du。',
      '这一步要讲清楚：我们不是凭感觉把二分之一放外面，而是从 du 的等式严格解出来。',
      '所以原来的 z dz 整块可以换成二分之一 du。',
    ],
    [
      '换完以后，积分变成二分之一乘 u 的二分之一次方 du。',
      '接下来只是幂函数积分。u 的二分之一次方积分，会让指数加一，变成三分之二次方，并除以新的指数。',
      '页面最后化简成三分之一乘 u 的三分之二次方。',
    ],
    [
      '最后把 u 换回 z squared minus five，再加 C。',
      '这页的核心经验是：du 不需要和题目完全一模一样。只要差的是常数，就可以把常数补到积分外面。',
      '但补出来的常数必须全程跟着，不能在中间消失。下一题我们看另一个常见问题：负号。',
    ],
  ],
  '例 3：负号来自 du': [
    [
      '第三题是三角函数里的典型换元。先看题目：分子有 sine t，分母里有 cosine cubed t。',
      '看到 sine 和 cosine 混在一起，常见想法是选其中一个当 u，让另一个通过导数变成 du。',
      '这里选 u 等于 cosine t，因为 cosine 的导数会带出负 sine t。',
    ],
    [
      '算 du：du 等于负 sine t dt。',
      '题目里有 sine t dt，所以我们要把它改写成负 du。这个负号非常关键。',
      '请不要跳过这一步。很多答案错，不是因为不会积分，而是因为 du 里的负号被吞掉了。',
    ],
    [
      '现在把 cosine t 换成 u，把 sine t dt 换成负 du。',
      '分母 cosine cubed t 变成 u cubed，所以整体变成负的 u 的负三次方积分。',
      '这一步也提醒我们，分母里的 u cubed 可以移到上面写成 u 的负三次方，方便使用幂函数积分。',
    ],
    [
      '积分以后得到二 u squared 分之一，再把 u 换回 cosine t。',
      '这页的检查方法是：只要 du 里出现负号，答案里一定要有位置承接这个负号。',
      '下一题我们看更麻烦的情况：选了 u 以后，题目里还剩旧变量 x。',
    ],
  ],
  '例 4：换完还剩 x 怎么办？': [
    [
      '第四题故意设计成不能一眼全换完。根号里面是 x minus one，所以选 u 等于 x minus one 很自然。',
      '但是请看分子：还有一个 x。这个 x 不会自动消失。',
      '所以这道题真正要训练的是：换元后旧变量残留时，怎么继续处理。',
    ],
    [
      '既然 u 等于 x 减一，就可以反过来写 x 等于 u 加一。',
      '这样分子里剩下的 x，也能改写成 u 加一。',
      '这一步是本题的关键。只把根号 x 减一换成根号 u 还不够，分子也要进入 u 的世界。',
    ],
    [
      '现在整个积分都只剩 u：分子是 u 加一，分母是根号 u，du 也处理好了。',
      '接着把它拆成 u over 根号 u，加上一 over 根号 u，也就是 u 的二分之一次方加 u 的负二分之一次方。',
      '拆开以后，就是两个普通幂函数积分。',
    ],
    [
      '积分完成后，把 u 换回 x minus one。',
      '本页最重要的结论是：换元后不能剩旧变量。只要还剩 x，就要回到 u 和 x 的关系，把它继续改写。',
      '下一页进入定积分换元。那时不仅函数和 dx 要换，上下限也要一起换。',
    ],
  ],
  '定积分换元：上下限也要换': [
    [
      '这一页先用左右对比讲一个大坑。题目是定积分，所以除了表达式本身，还有上下限。',
      '如果我们把 x 换成 u，却把上下限仍然写成 x 世界里的零到六，就会混用两个变量系统。',
      '这不是小格式问题，而是数学意义已经变了。',
    ],
    [
      '左边的错误做法看起来好像只差一步，但它的问题很严重：积分变量变成了 u，上下限却还是 x 的值。',
      '可以把它理解成地图换了坐标系，但边界还在用旧坐标。这样当然会算错。',
      '所以定积分换元必须额外检查上下限。',
    ],
    [
      '右边是正确做法。若 u 等于二 x，就把原来的上下限代入这个关系。',
      'x 等于零时，u 等于零；x 等于六时，u 等于十二。',
      '因此新积分的上下限应该是零到十二，而不是零到六。',
    ],
    [
      '底部规则可以直接记成一句话：只要定积分换变量，上下限也要换到新变量。',
      '换变量、换 dx、换上下限，这三件事要一起完成。',
      '下一页我们用一个完整例题，把定积分换元的四步流程走一遍。',
    ],
  ],
  '例 5：定积分换元完整流程': [
    [
      '这一页是定积分换元的标准流程。先读题：从零到二，积分二 x e 的 x squared dx。',
      '我们先找复杂内层。e 的指数是 x squared，旁边正好有二 x dx。',
      '这就是典型的反向链式法则结构。',
    ],
    [
      '第一步选 u 等于 x squared，所以 du 等于二 x dx。',
      '第二步因为这是定积分，马上换上下限。x 等于零时 u 等于零；x 等于二时 u 等于四。',
      '请注意“马上”两个字。定积分换元最好不要等到最后才想上下限。',
    ],
    [
      '现在把积分全换成 u。原来的二 x dx 变成 du，e 的 x squared 变成 e to u。',
      '上下限也已经变成零到四，所以新积分是从零到四的 e to u du。',
      '这时计算就很简单了，反导函数仍然是 e to u。',
    ],
    [
      '代入上下限，得到 e 的四次方减一。',
      '底部 checklist 总结了定积分换元四步：选 u，算 du，换上下限，积分。',
      '下一页我们看一个更抽象的例子：没有 f 的公式，也照样可以换元。',
    ],
  ],
  '例 6：没有公式也能换元': [
    [
      '最后一个例题很适合训练理解。题目没有给 f 的具体表达式，只告诉我们从零到六的 f(x) dx 等于八。',
      '要计算的是从零到三的 f(2x) dx。这里不能先找 f 的反导，因为我们根本不知道 f 长什么样。',
      '但换元仍然可以做，因为我们只需要变量关系。',
    ],
    [
      '令 u 等于二 x，那么 du 等于二 dx，所以 dx 等于二分之一 du。',
      '接着换上下限。x 从零到三时，u 从零到六。',
      '这一步正好把题目中的新区间，变成已知积分的区间。',
    ],
    [
      '于是原积分变成二分之一乘从零到六的 f(u) du。',
      '题目已经告诉我们从零到六的 f 的积分等于八，所以结果就是二分之一乘八，也就是四。',
      '注意，我们从头到尾没有用到 f 的公式。',
    ],
    [
      '图上的区间伸长帮助理解：x 区间零到三，在 u 等于二 x 后变成 u 区间零到六。',
      '所以换元改变了三件事：变量、dx、上下限。只要这三件事都处理对，即使没有公式也能计算。',
      '下一页我们总结换元法的检查表。',
    ],
  ],
  '换元法总结：每题都问这四件事': [
    [
      '最后一页不要只念 checklist。我们要把换元法变成做题时可以反复使用的思考流程。',
      '第一步是选 u：先找最复杂的内层，或者最能让题目变简单的部分。',
      '第二步是算 du：不仅要求导，还要看原题里有没有对应的因子、常数或负号。',
    ],
    [
      '第三步是全换掉。函数、旁边因子、dx，都要进入 u 的世界。',
      '如果是定积分，第四件事是换上下限。上下限必须跟着新变量走。',
      '这几步里最容易被忽略的，往往不是积分计算，而是有没有换干净。',
    ],
    [
      '右边常见错误可以作为检查顺序：漏负号，漏常数因子，换完还剩 x，定积分忘记换上下限。',
      '每做完一道换元题，都可以按这四个错误扫一遍。这样比只看最后答案更可靠。',
      '请把“换完还剩 x 吗”当成最后检查问题。',
    ],
    [
      '底部下节课钩子说：当一个 u 不够直接时，我们会需要新的积分技巧。',
      '换元法解决的是反向链式法则型题目；下一步会遇到乘积型、根号型或需要更复杂整理的积分。',
      '所以这节课的收束句是：换元法不是换名字，而是把整道题换到一个更简单的变量世界。',
    ],
  ],
};

function buildSpeechActions(scene, groups) {
  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines) => {
    lines.forEach((text) => {
      actions.push({
        id: `${scene.id}-speech-substitution-${String(speechIndex).padStart(2, '0')}`,
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
  const missingInDb = Object.keys(SUBSTITUTION_NARRATION).filter(
    (title) => !sceneTitles.has(title),
  );
  if (missingInDb.length > 0) {
    throw new Error(`Narration references missing scenes: ${missingInDb.join(', ')}`);
  }

  const missingNarration = scenes.filter((scene) => !SUBSTITUTION_NARRATION[scene.title]);
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
      const groups = SUBSTITUTION_NARRATION[scene.title];
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
      `${DRY_RUN ? 'Would update' : 'Updated'} 03 - 换元法: ${sceneTotal} scenes, ${speechTotal} speech segments`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
