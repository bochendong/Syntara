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

const NOTEBOOK_ID = 'nb-mat136-inverse-substitution-week2-v2-20260519174000';
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

const INVERSE_SUBSTITUTION_NARRATION = {
  'MAT 136 · 逆换元法': [
    [
      '这一节课叫逆换元法，也常常叫三角代换。先不要被名字吓到，它解决的是一类很具体的问题：根号里出现平方差或平方和。',
      '请先看左边三种根号形状：a squared minus x squared，a squared plus x squared，x squared minus a squared。今天所有例题都围绕这三类。',
      '中间箭头表示我们的策略：不要硬找 u，而是选一个角 theta，让根号里的表达式碰上三角恒等式。',
      '右边的单位圆和三角形告诉我们，三角函数不是装饰。它们会帮我们把根号变成 sin、cos、tan、sec 这些更容易积分的函数。',
    ],
    [
      '所以今天的目标不是死背三行表，而是理解每一行表为什么这样选。',
      '当你看到根号形状时，先问：它像哪条三角恒等式？一减 sine squared，还是一加 tangent squared，还是 secant squared 减一？',
      '只要这个匹配做对，后面的代换、dx、三角形回代才会有方向。',
      '下一页我们先解释为什么普通换元在这些题上会卡住。',
    ],
  ],
  '为什么普通换元会卡住？': [
    [
      '先回忆普通换元法擅长什么。左边这个例子里，内层是 x squared plus one，旁边刚好有它的导数二 x。',
      '这时选 u 等于 x squared plus one，du 等于二 x dx，整个积分就能顺利变成 u 的积分。',
      '普通换元最舒服的场景，就是内层函数和内层导数一起出现。',
    ],
    [
      '但中间这些根号题不配合。比如根号 a squared minus x squared，旁边通常没有一个简单因子能直接把根号清掉。',
      '如果硬选 u 等于根号里面的表达式，du 会带出 x dx，但根号本身还会留下麻烦。',
      '所以普通换元不是完全不能试，而是它不能直接把根号形状变简单。',
    ],
    [
      '右边给出今天的新想法：不要继续硬找 u，而是把 x 换成关于 theta 的三角表达式。',
      '目的很明确：让根号里的平方和平方差，刚好变成三角恒等式可以处理的形状。',
      '比如一减 sine squared 会变成 cosine squared，根号就能被消掉。',
    ],
    [
      '底部问题是本节课主线：能不能选一个代换，让根号自己变成好算的三角函数？',
      '请带着这个问题进入下一页。我们先把根号形状分类，再决定该选 sin、tan 还是 sec。',
    ],
  ],
  '这类根号到底在问什么？': [
    [
      '先看左边三种根号。第一种是 a squared minus x squared，第二种是 a squared plus x squared，第三种是 x squared minus a squared。',
      '这三种不要混。谁在前面、谁被减掉，决定了后面选哪个三角函数。',
      '很多三角代换错误，不是算错，而是第一眼把形状认错了。',
    ],
    [
      '中间三条恒等式是工具箱。一减 sine squared 等于 cosine squared；一加 tangent squared 等于 secant squared；secant squared 减一等于 tangent squared。',
      '我们选择代换的目的，就是把根号里的式子变成这些恒等式的左边。',
      '这样开根号以后，就能得到比较简单的 cos、sec 或 tan。',
    ],
    [
      '右边的匹配任务才是真正的思考过程。看到 a squared minus x squared，要想办法制造一减某个平方。',
      '看到 a squared plus x squared，要制造一加某个平方。',
      '看到 x squared minus a squared，要制造某个平方减一。',
    ],
    [
      '所以策略可以讲成一句话：先识别根号形状，再选择能消掉根号的恒等式。',
      '下一页把这个匹配结果整理成三种根号、三种代换。',
    ],
  ],
  '三种根号，三种代换': [
    [
      '第一行是根号 a squared minus x squared。我们希望把 x squared 变成 a squared sine squared theta。',
      '所以选 x 等于 a sine theta。代入后根号里变成 a squared 乘一减 sine squared theta。',
      '一减 sine squared theta 等于 cosine squared theta，因此根号变成 a cosine theta。',
    ],
    [
      '第二行是根号 a squared plus x squared。这里要匹配一加 tangent squared 等于 secant squared。',
      '所以选 x 等于 a tangent theta。代入后根号里变成 a squared 乘一加 tangent squared theta。',
      '根号就变成 a secant theta。这就是加号形状看见 tan 的原因。',
    ],
    [
      '第三行是根号 x squared minus a squared。这里 x squared 在前面，适合匹配 secant squared minus one。',
      '所以选 x 等于 a secant theta。代入后根号里变成 a squared 乘 secant squared theta 减一。',
      '根号就变成 a tangent theta。这里最容易和上一行选反，要特别慢一点讲。',
    ],
    [
      '底部规则是本页 takeaway：先看根号形状，再选会消根号的代换。',
      '不要把表格当作随机记忆。每一行都来自一条三角恒等式。',
      '下一页我们专门解释第一种形状，为什么 a squared minus x squared 要选 sin。',
    ],
  ],
  '为什么 √(a² − x²) 要选 sin?': [
    [
      '这页用直角三角形解释第一种代换。斜边是 a，对边是 x，所以 sine theta 等于 x 除以 a。',
      '于是 x 等于 a sine theta。这不是凭空选的，而是由三角形比例自然得到的。',
      '三角形的第三边就是根号 a squared minus x squared，这正好是题目里的根号。',
    ],
    [
      '现在从代数角度再看一次。把 x 等于 a sine theta 代进根号，得到根号 a squared minus a squared sine squared theta。',
      '提出 a squared 后，里面剩下一减 sine squared theta。',
      '用恒等式变成 cosine squared theta，开根号得到 a cosine theta。',
    ],
    [
      '最后别忘了 dx。因为 x 等于 a sine theta，所以 dx 等于 a cosine theta d theta。',
      '这很重要：代换不只是根号变简单，dx 也常常会和根号里的 a cosine theta 配合。',
      '下一页进入例题。第一题会先配方，再把非标准二次式变成这种标准根号形状。',
    ],
  ],
  '例 1：先配方，再看形状': [
    [
      '第一题先读题：积分根号五加四 x 减 x squared。它不是一眼的 a squared minus x squared。',
      '这时不要急着套三角代换表。遇到二次式，第一反应应该是先配方。',
    ],
    [
      '配方以后，五加四 x 减 x squared 变成九减 x 减二的平方。',
      '现在形状才出来：九是三 squared，后面减去一个平方。',
      '所以它属于 a squared minus something squared 这一类。',
    ],
    [
      '为了让形状标准，我们先令 u 等于 x 减二。这个代换只是平移变量，把中心移动到零。',
      '因为 du 等于 dx，积分就变成根号九减 u squared du。',
      '现在它已经是标准的圆形根号。',
    ],
    [
      '标准公式处理的是根号 a squared minus u squared 的积分。这里 a 等于三。',
      '结果会包含一项 u 根号九减 u squared，以及一项 arcsine of u over three。',
      '这里不需要死背来源，但要知道这个公式对应半圆面积型积分。',
    ],
    [
      '最后把 u 换回 x 减二。注意答案必须回到原题变量 x。',
      '本题的迁移方法是：看到非标准二次根号，先配方；配成平方差以后，再看三角代换或标准公式。',
    ],
  ],
  '一般形状：∫√(α² − x²) dx 怎么变？': [
    [
      '这一页把前面的例子抽象成一般形状。只要看到根号 alpha squared minus x squared，就可以按同一条路线走。',
      '前提是 alpha 大于零，这样它可以作为三角形里的斜边长度。',
    ],
    [
      '四步变形从左到右看。第一步设 x 等于 alpha sine theta。',
      '第二步算 dx，得到 alpha cosine theta d theta。',
      '第三步把根号变成 alpha cosine theta。',
      '第四步整个积分变成 alpha squared cosine squared theta 的积分。',
    ],
    [
      '右边的三角形不是可有可无的图。它是回代工具。',
      '如果 sine theta 等于 x over alpha，那么邻边就是根号 alpha squared minus x squared。',
      '后面答案里出现 sin、cos、theta 时，就靠这个三角形换回 x。',
    ],
    [
      '最后剩下的是 cosine squared theta 的三角积分。',
      '通常要用降幂公式，把 cosine squared theta 改写成一加 cosine two theta 除以二。',
      '下一页我们看定积分版本。定积分里还要多处理一件事：上下限也要从 x 换成 theta。',
    ],
  ],
  '例 2：定积分也要换上下限': [
    [
      '这一题是定积分，根号是四减 x squared，所以 a 等于二。',
      '先看形状：a squared minus x squared，因此选 x 等于二 sine theta。',
      '定积分题一开始就要提醒自己：后面上下限也要换。',
    ],
    [
      '代换以后，dx 等于二 cosine theta d theta。',
      '根号四减 x squared 变成二 cosine theta。',
      '这样根号和 dx 都进入 theta 世界，题目不再含 x。',
    ],
    [
      '现在换上下限。x 等于零时，二 sine theta 等于零，所以 theta 等于零。',
      'x 等于一时，二 sine theta 等于一，所以 sine theta 等于二分之一，theta 等于 pi over six。',
      '这一步不能省，否则后面会混用 x 上下限和 theta 积分变量。',
    ],
    [
      '全换以后，积分变成从零到 pi over six 的四 sine squared theta。',
      '接下来使用降幂公式，把 sine squared theta 改成一减 cosine two theta 除以二。',
      '这是把根号问题转成三角积分后的常规计算。',
    ],
    [
      '最后答案是 pi over three 减根号三除以二。',
      '可以做一个合理性检查：原函数在区间上非负，积分结果应该是正数。这个检查能帮你发现符号错误。',
    ],
  ],
  '例 3：√(x² + 16) 看见 tan': [
    [
      '这一题根号是 x squared plus sixteen，也就是 x squared plus four squared。',
      '看到平方和，要想到一加 tangent squared 等于 secant squared，所以这里看见 tan。',
      '先判断形状，再选代换，不要直接背答案。',
    ],
    [
      '令 x 等于四 tangent theta。',
      '那么 dx 等于四 secant squared theta d theta。',
      '根号 x squared plus sixteen 会变成四 secant theta。',
    ],
    [
      '把 x squared、根号和 dx 全换掉以后，积分会化成包含 tangent squared theta 和 secant theta 的形式。',
      '再用 tangent squared theta 等于 secant squared theta 减一，把它拆成 secant cubed theta 减 secant theta。',
      '这个步骤说明，代换以后还需要三角恒等式继续整理。',
    ],
    [
      '页面右边使用 secant cubed theta 和 secant theta 的标准积分。',
      '这里要抓住：这题真正的新难点不是重新推导标准公式，而是前面选 tan 并化干净。',
      '标准积分可以作为工具使用。',
    ],
    [
      '最后必须反代回 x。用三角形把 tangent theta 和 secant theta 表示成 x 的式子。',
      '答案如果还停在 theta，就说明这道不定积分没有完成。',
    ],
  ],
  '例 4：√(9x² − 1) 看见 sec': [
    [
      '最后这题看起来复杂，因为有 x 的五次方和根号九 x squared 减一。',
      '先不要被 x 的五次方吓到。第一眼只看根号：九 x squared 减一，也就是三 x 的平方减一。',
      '这是 x squared minus a squared 型，应该看见 sec。',
    ],
    [
      '令三 x 等于 secant theta，也就是 x 等于三分之一 secant theta。',
      '这样根号九 x squared 减一会变成 tangent theta。',
      '这一步的目标仍然是消掉根号。',
    ],
    [
      '因为这是定积分，还要换上下限。',
      '当 x 等于根号二除以三时，secant theta 等于根号二，所以 theta 等于 pi over four。',
      '当 x 等于二除以三时，secant theta 等于二，所以 theta 等于 pi over three。',
    ],
    [
      '接着进入漂亮化简。x 的五次方、dx 里面的 secant tangent，以及根号变成的 tangent，会发生大量抵消。',
      '最后原来很复杂的表达式，变成常数乘 cosine fourth theta 的积分。',
      '这说明三角代换有时不只是消根号，还会让代数结构整体简化。',
    ],
    [
      '剩下用降幂公式计算 cosine fourth theta。',
      '这页的重点不是记住这个长答案，而是看到 sec 代换如何把根号和幂次一起整理成可算的三角积分。',
    ],
  ],
  逆换元法总结: [
    [
      '总结页先看五步流程。第一步识别根号形状，第二步选代换，第三步画三角形。',
      '第四步把 x、dx、根号全部换掉，第五步算完以后换回原变量。',
      '这五步中，形状识别和回代最容易被低估。',
    ],
    [
      '常见错误也很固定：漏 dx，忘换上下限，sec 和 tan 选反，最后答案还停在 theta。',
      '每做完一题，都可以按照这个错误表检查一遍。',
      '特别是定积分题，换成 theta 以后就应该用 theta 的上下限，不要混回 x 的上下限。',
    ],
    [
      '最后的下节课钩子告诉我们：三角代换能处理很多根号，但不是所有积分都靠它。',
      '遇到乘积型积分，下一步要进入分部积分。那会是另一种把复杂积分改写成简单积分的方法。',
    ],
  ],
};

function buildSpeechActions(scene, groups) {
  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines) => {
    lines.forEach((text) => {
      actions.push({
        id: `${scene.id}-speech-inverse-substitution-${String(speechIndex).padStart(2, '0')}`,
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
  const missingInDb = Object.keys(INVERSE_SUBSTITUTION_NARRATION).filter(
    (title) => !sceneTitles.has(title),
  );
  if (missingInDb.length > 0) {
    throw new Error(`Narration references missing scenes: ${missingInDb.join(', ')}`);
  }

  const missingNarration = scenes.filter((scene) => !INVERSE_SUBSTITUTION_NARRATION[scene.title]);
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
      const groups = INVERSE_SUBSTITUTION_NARRATION[scene.title];
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
      `${DRY_RUN ? 'Would update' : 'Updated'} 04 - 逆换元法: ${sceneTotal} scenes, ${speechTotal} speech segments`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
