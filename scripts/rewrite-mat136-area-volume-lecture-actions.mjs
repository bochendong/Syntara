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

const NOTEBOOK_ID = 'nb-mat136-area-volume-imagegen-20260521';
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

const AREA_VOLUME_NARRATION = {
  '封面：Area & Volume': [
    [
      '这一节进入定积分的应用：面积和体积。先不要把它看成一堆新公式，而是看成同一个核心动作的延伸。',
      '左边的面积图告诉我们：如果每一小段的高度是 f(x)，小宽度是 dx，那么小面积就是 f(x) dx。把它们累加，就得到总面积。',
      '这里的关键词仍然是“切片”。面积问题是把平面区域切成细条，再把细条面积加起来。',
    ],
    [
      '中间和右边进入体积。体积不是直接凭空算出来的，而是把立体切成很多薄片。',
      '每一片有一个截面积 A(x) 或 A(y)，再乘上很小的厚度 dx 或 dy。总体积就是这些薄片体积的累加。',
      '所以从面积到体积，真正变化的是：从“高度函数”变成“截面积函数”。',
    ],
    [
      '右侧列出常见方法：曲线间面积、水平切片、圆盘法、非圆截面。',
      '本章 take-away 是底部这条线：先理解几何图形，再选切片方向，再写小量，最后积分累加。',
      '下一页先从最基本的曲线间面积开始：什么时候用上函数减下函数。',
    ],
  ],
  '曲线间面积：核心方法': [
    [
      '曲线间面积的第一步不是积分，而是找边界。先看图上两条曲线在 a 和 b 之间围成的区域。',
      '积分上下限来自交点或题目给定区间。如果边界找错，后面上减下即使做对，答案也会错。',
      '所以每道曲线间面积题，先问：区域从哪里开始，到哪里结束？',
    ],
    [
      '第二步是判断上下。对于竖直小条，面积小片的高度是 top(x) minus bottom(x)。',
      '这不是死公式，而是几何长度：上边界的 y 值减下边界的 y 值，才是这一条的实际高度。',
      '如果上下关系在区间中间发生变化，就必须分段。',
    ],
    [
      '右侧方法清单可以作为做题流程：先找交点，再判断上下，再建立积分，最后必要时分段相加。',
      '这页要带走的句子是：曲线间面积等于宽度 dx 上的一条条高度差之和。',
      '下一页用 y=x squared 和 y=square root x 的例子，把这套流程完整走一遍。',
    ],
  ],
  '例题：y=x^2 与 y=sqrt(x)': [
    [
      '先读题：两条曲线是 y equals x squared 和 y equals square root x，区域限制在 [0,1]。',
      '第一步仍然是找交点。令 x squared 等于 square root x，可以得到 x 等于零和 x 等于一。',
      '这说明区域正好从零到一闭合，积分上下限就是零和一。',
    ],
    [
      '接下来判断上下。在零到一之间，square root x 在上面，x squared 在下面。',
      '可以试一个点，比如 x 等于四分之一，根号 x 是二分之一，而 x squared 是十六分之一。',
      '所以每条竖直小片的高度是 square root x minus x squared。',
    ],
    [
      '建立积分后，从零到一积分 square root x minus x squared。',
      '计算时把 square root x 写成 x 的二分之一次方，再分别积分。',
      '最终得到三分之一。这里答案不是重点，重点是交点、上下关系、上减下这三步。',
    ],
  ],
  '分段面积 I：绝对值函数先找交点': [
    [
      '这道题开始变复杂，因为出现了绝对值函数。第一步不是马上积分，而是把绝对值拆开。',
      'f(x)=|2x| 在 x 小于零时等于负二 x，在 x 大于零时等于二 x。这个折点会影响上下关系。',
      '所以绝对值题通常先画图或分段，再找交点。',
    ],
    [
      '第二步找两个交点。图中 f(x)=|2x| 和 g(x)=x+2 相交于 A 和 B。',
      '左边交点来自负二 x 等于 x 加二，右边交点来自二 x 等于 x 加二。',
      '得到两个交点以后，区域就被自然切成不同区间。',
    ],
    [
      '第三步确定分段区间。因为绝对值函数在零点左右表达式不同，上下关系也要分段处理。',
      '这一页先把几何结构找清楚：哪里交、哪里折、哪里需要分段。',
      '下一页再真正建立积分并计算面积。',
    ],
  ],
  '分段面积 II：建立并计算积分': [
    [
      '现在接着上一页，把区域拆成两个积分。第一段在左侧区间，使用绝对值拆开后的左侧表达式。',
      '这一段的面积仍然是上函数减下函数，只是下函数或上函数要用对应分段公式。',
      '请注意：分段不是为了形式复杂，而是因为同一个公式不能覆盖整个区域。',
    ],
    [
      '第二段换到右侧区间。这里绝对值函数已经变成另一个表达式，所以 integrand 也要跟着改变。',
      '如果继续用左段公式算右段，几何意义就不对了。',
      '这一步训练的是：每个区间都要重新确认上下关系。',
    ],
    [
      '最后把两段面积相加。面积题的结果应该是正数，如果算出负数，通常说明上下函数顺序写反了。',
      '本题的迁移方法是：遇到绝对值或曲线交叉，先找分段点，再在每段内部做上减下。',
      '下一页我们看三角函数曲线之间的面积，那里上下关系也会随区间变化。',
    ],
  ],
  三角函数曲线之间的面积: [
    [
      '三角函数面积题的第一步仍然是找交点。这里两条曲线是 sin(2x) 和 cos(2x)。',
      '令 sin(2x) 等于 cos(2x)，可以找到它们在区间内的交点。',
      '交点的作用是把区域分成不同部分，因为交点两侧谁在上面可能会改变。',
    ],
    [
      '接下来判断上下关系。页面用图像展示，某些区间 sin(2x) 在上，另一些区间 cos(2x) 在上。',
      '这时不能用一个简单的 top minus bottom 覆盖整个区间。',
      '如果上下关系变化，就要在交点处分段。',
    ],
    [
      '右侧两段积分就是把面积拆开。每一段都写成本段的上函数减下函数。',
      '三角函数题的难点常常不是积分技巧，而是先判断哪段谁在上。',
      '下一页从曲线间面积转到水平切片：当竖直切不方便时，我们可以改用 y 方向切片。',
    ],
  ],
  '水平切片：三角形面积': [
    [
      '这一页开始讲水平切片。先看左边图形：不是用竖直条，而是沿着高度方向切成一条条水平薄片。',
      '水平切片的变量通常是 y 或 h。每一片的面积等于这一层的长度乘以厚度 dh。',
      '所以第一步要确定：在高度 h 处，这条水平片有多长。',
    ],
    [
      '中间用相似三角形建立宽度函数。三角形顶部窄、底部宽，宽度会随着高度变化。',
      '通过相似比例，可以得到 w(h) 这样的宽度函数。',
      '这一步非常关键：没有宽度函数，就没有每一片的小面积。',
    ],
    [
      '右边把小面积写成 w(h) dh，然后从底部高度积分到顶部高度。',
      '所以水平切片面积题的流程是：选高度变量，找宽度函数，写小面积，积分。',
      '下一页用半圆面积继续练水平切片，不过宽度函数来自圆方程。',
    ],
  ],
  '水平切片：半圆面积': [
    [
      '半圆这页先从圆方程开始。图中半圆来自 x squared plus h squared equals forty-nine。',
      '如果用水平切片，高度变量是 h，我们需要在每个 h 上找到左右边界。',
      '圆方程可以解出 x 等于正负 square root of forty-nine minus h squared。',
    ],
    [
      '水平片的宽度是右边界减左边界，所以是 two square root of forty-nine minus h squared。',
      '这一步要慢讲：不是只取右半边长度，而是整条水平弦长。',
      '宽度函数一旦写出，小面积就是这个宽度乘 dh。',
    ],
    [
      '面积积分是从 h 等于零到七，积分 two square root of forty-nine minus h squared dh。',
      '这个积分结果等于半个半径为七的圆面积，也就是 forty-nine pi over two。',
      '这页的重点是：水平切片时，宽度函数常常来自“右边界减左边界”。',
    ],
  ],
  '体积方法：圆盘与截面切片': [
    [
      '现在从面积进入体积。体积题的核心是把立体切成很多薄片。',
      '每一片的体积约等于截面积 A(x) 乘以厚度 dx，或者 A(h) 乘以 dh。',
      '所以体积题第一问不是马上积分，而是：这一片的截面积是什么？',
    ],
    [
      '圆盘法是最常见的体积切片。如果旋转后每一片是圆盘，那么截面积就是 pi r squared。',
      '这里的半径 r 通常来自曲线到旋转轴的距离。',
      '所以圆盘法的关键是找半径函数。',
    ],
    [
      '非圆截面题也一样，只是截面积不再是 pi r squared。',
      '比如截面可能是正方形、三角形或半圆，那就先写出对应的 A(x)。',
      '方法没有变：先找每片截面积，再积分累加。',
    ],
    [
      '总公式可以记成 V equals integral A(x) dx 或 integral A(h) dh。',
      '这一页的迁移句是：体积积分不是背形状，而是先问每一片长什么样。',
      '下一页用圆锥和球体说明，同一种切片结构可以推出熟悉的体积公式。',
    ],
  ],
  圆锥与球体体积: [
    [
      '先看圆锥。圆锥横切以后，每一片是圆盘，但半径随着高度变化。',
      '通过相似三角形，可以把半径 r 写成高度 h 的函数。',
      '于是每片面积是 pi r(h) squared，体积就是把这些圆盘面积沿高度积分。',
    ],
    [
      '再看球体。球体横切以后，每一片也是圆盘，但半径来自圆方程。',
      '如果球半径是 R，高度为 h 的截面半径满足 r squared equals R squared minus h squared。',
      '所以截面积是 pi times R squared minus h squared。',
    ],
    [
      '右边总结同一种结构：不管是圆锥还是球体，都先找半径函数，再写 A(h)，最后积分。',
      '熟悉的体积公式并不是凭空背出来的，而是无数薄圆盘累加的结果。',
      '下一页看非圆截面的例子：金字塔体积。',
    ],
  ],
  '金字塔体积：非圆截面': [
    [
      '金字塔不是旋转体，所以横切片不是圆盘。先看截面形状：每一片是一个正方形。',
      '这意味着截面积不是 pi r squared，而是边长 squared。',
      '所以第一步要找高度 h 处的正方形边长。',
    ],
    [
      '边长函数来自相似三角形。越接近顶点，截面越小；越接近底部，截面越大。',
      '页面中把边长写成 s(h)。一旦有了 s(h)，截面积就是 s(h) squared。',
      '这一步和圆盘法完全平行，只是截面积公式换了。',
    ],
    [
      '体积积分就是从底到顶积分 s(h) squared dh。',
      '本页的重点是：非圆截面题也不难，只要先写出截面积 A(h)。',
      '下一页进入旋转体，学习绕 x 轴旋转时如何用圆盘法建立体积。',
    ],
  ],
  '旋转体：绕 x 轴的圆盘法': [
    [
      '这一页是旋转体。先看左边区域：曲线下方的区域绕 x 轴旋转，会形成一个立体。',
      '如果用垂直于 x 轴的切片，每一片旋转后是一个圆盘。',
      '所以这里自然使用圆盘法。',
    ],
    [
      '圆盘半径来自曲线到 x 轴的距离。若曲线是 y=f(x)，那么半径就是 f(x)。',
      '每片截面积是 pi [f(x)] squared。',
      '注意是半径平方，不是函数本身直接积分。',
    ],
    [
      '体积公式就是从 a 到 b 积分 pi [f(x)] squared dx。',
      '这页最容易错的是把面积公式和体积公式混掉：面积是高度乘 dx，体积是截面积乘 dx。',
      '下一页看变量半径应用，用同样思想计算桌腿体积。',
    ],
  ],
  '变量半径应用：桌腿体积': [
    [
      '最后一个应用题是桌腿体积。先看左边模型：桌腿可以看成绕中心轴旋转出来的立体。',
      '不同高度处的半径不一样，所以不能用一个固定圆柱公式直接算。',
      '这正是变量半径圆盘法要解决的问题。',
    ],
    [
      '题目给了半径函数 r(y)。在高度 y 处，截面是半径 r(y) 的圆。',
      '所以截面积 A(y) 等于 pi [r(y)] squared。',
      '总体积就是沿着高度方向积分 A(y) dy。',
    ],
    [
      '计算时先把 r(y) 代入，再展开或使用合适的三角恒等式处理平方。',
      '这里的重点不是桌腿本身，而是建模流程：识别旋转体，找变量半径，写截面积，积分。',
      '到这里，本章面积与体积的主线就收束了：所有问题都回到“切片的小量如何累加”。',
    ],
  ],
};

function buildSpeechActions(scene, groups) {
  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines) => {
    lines.forEach((text) => {
      actions.push({
        id: `${scene.id}-speech-area-volume-${String(speechIndex).padStart(2, '0')}`,
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
  const missingInDb = Object.keys(AREA_VOLUME_NARRATION).filter((title) => !sceneTitles.has(title));
  if (missingInDb.length > 0) {
    throw new Error(`Narration references missing scenes: ${missingInDb.join(', ')}`);
  }

  const missingNarration = scenes.filter((scene) => !AREA_VOLUME_NARRATION[scene.title]);
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
      const groups = AREA_VOLUME_NARRATION[scene.title];
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
      `${DRY_RUN ? 'Would update' : 'Updated'} 06 - Area & Volume: ${sceneTotal} scenes, ${speechTotal} speech segments`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
