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

const NOTEBOOK_ID = 'nb-mat136-definite-integral-week1-20260518150500';
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

const DEFINITE_NARRATION = {
  'MAT 136 · 定积分': [
    [
      '这一节课承接上一节的黎曼积分。上一节我们一直追的那个稳定面积数 A，今天要获得一个正式名字：定积分。',
      '先看中间这条路线。左边是 Riemann sums，也就是越来越细的矩形和；中间是积分符号；右边是 F(b) 减 F(a)。这节课就是把这三件事接起来。',
      '你先不要把积分符号当作一个新公式。它背后仍然是上一节的老问题：曲线下面积如何由矩形极限稳定出来。',
      '再看右边的小图。曲线下方的阴影表示面积极限变成了可计算规则。我们今天要做的，就是从“它是什么”走到“怎么算”。',
      '底部这条主线很重要：定义、性质、FTC II、Riemann sum 转换、FTC I。它不是随便排序，而是从意义到计算，再回到变化率。',
      '所以这节课的学习目标可以说成三句话：知道定积分从哪里来，知道它能表示什么，知道什么时候可以用反导函数快速算。',
      '今天先把视角放慢。每出现一个公式，都问两个问题：这个公式来自哪张图？它帮助我们避免什么计算麻烦？',
      '下一页我们从最根本的地方开始：定积分到底怎样从黎曼和的极限变出来。',
    ],
  ],
  '定积分：黎曼和的极限': [
    [
      '这一页先回到上一节最熟悉的画面：把区间 [a,b] 切成很多小段，再用矩形近似曲线下面积。',
      '左边图里每段宽度相同，叫 delta x。因为从 a 到 b 总长度是 b 减 a，分成 n 段，所以 delta x 等于 b 减 a 除以 n。',
      '这里先盯住宽度。宽度不是凭空出现的，它来自区间长度除以段数；没有宽度，后面的每个矩形面积都不完整。',
      '右端点采样时，第 i 个采样点是 a 加 i delta x。也就是说，我们从左端点 a 出发，向右走 i 个小宽度。',
    ],
    [
      '现在看右上角的公式。求和号里面的 f(a+i delta x) 是第 i 个矩形的高度，后面的 delta x 是宽度。',
      '把高度乘宽度，从 i 等于一加到 n，就是 n 个右端点矩形的总面积。',
      '再看最外面的 limit。n 趋向无穷大，意思是矩形越来越多，每一段越来越窄。这个过程对应上一节的 mesh 趋近零。',
      '如果这个和稳定到一个数，我们就把这个数记作从 a 到 b 的 f(x) dx 的定积分。',
    ],
    [
      '右下角的橙色框说的是定义含义。定积分不是一个静态符号，而是“矩形越来越细以后稳定下来的面积和”。',
      '如果函数足够好，比如连续函数，那么左端点、右端点、中点这些不同采样方式，最后都会逼近同一个数。',
      '所以这页的重点不是背公式长相，而是把公式还原成三步：宽度、采样点、矩形和的极限。',
      '下一页我们马上补一个容易混的点：定积分算的是有方向的面积，不一定等于普通几何面积。',
    ],
  ],
  '有向面积：正负号很重要': [
    [
      '这一页要处理最容易误会的地方：定积分里面的“面积”，不是永远取正的几何面积。',
      '先看左边。曲线在 x 轴上方，所以函数值是正的。每个小矩形的高度是正数，累加出来的定积分也会贡献正值。',
      '这里可以把这句话说出来：如果 f(x) 大于零，那么这一段对定积分的贡献是正的。',
      '左边图像和我们平常说的面积直觉一致，所以这部分一般不难。',
    ],
    [
      '现在看右边。曲线在 x 轴下方，函数值是负的。矩形高度在符号上是负数，所以这部分贡献是负的。',
      '这就是有向面积的意思。上方区域记正，下方区域记负；定积分会把它们按符号相加。',
      '这里先停一下想：如果一段曲线有一部分在上面，一部分在下面，定积分会不会互相抵消？答案是会。',
      '所以定积分更准确地说是净面积，而不是把所有区域都涂成正数相加。',
    ],
    [
      '底部公式提醒两个基本事实。第一，从 a 到 a 的积分是零，因为区间没有宽度。',
      '第二，如果题目真的问普通面积，而曲线有在 x 轴下方的部分，我们可能要分段取绝对值。',
      '这页的迁移方法是：做定积分前，先判断函数在 x 轴上方还是下方，别把净面积和几何面积混成一件事。',
      '下一页我们看定积分的基本性质，它们会让很多复杂积分先被拆开。',
    ],
  ],
  定积分的基本性质: [
    [
      '这一页公式比较多，所以不要一条一条硬背。先把它们分成两类：上面主要处理被积函数，下面主要处理区间和变量。',
      '第一条说，从 a 到 a 的积分为零。直观上区间宽度为零，没有可以累积的面积。',
      '第二条是常数倍可以提出去。如果每个矩形高度都被乘上同一个常数 c，那么总面积也会整体乘以 c。',
      '第三条是加减可以拆。两个函数的高度相加，矩形面积也逐段相加，所以总积分可以拆成两个积分。',
    ],
    [
      '第四条是区间可加。你从 a 到 b 的净面积，可以先算 a 到 c，再算 c 到 b，最后相加。',
      '这个性质在做分段函数、函数跨过 x 轴、或者想拆区间时非常有用。',
      '第五条说积分变量名字不重要。dx 里的 x 只是临时变量，换成 dt，积分表示的数不变。',
      '这件事对后面换元和 FTC I 很重要，因为我们会频繁区分外面的 x 和积分里面的临时变量。',
    ],
    [
      '底部总结说，这些性质本质上都是面积和极限的翻译。你不用把它们看成孤立规定。',
      '做题时可以先问两个问题：能不能拆函数？能不能拆区间？很多题在找反导之前，先拆结构会简单很多。',
      '请注意，性质不是为了让公式表变长，而是为了减少计算负担。',
      '下一页进入这节课最强的计算工具：FTC II，也就是用反导函数算定积分。',
    ],
  ],
  'FTC II：用反导函数算定积分': [
    [
      '现在进入核心计算定理。先看左边条件：如果 F prime 等于 f，那么 F 是 f 的一个反导函数。',
      '这里要强调顺序。不是看到积分就直接代端点，而是先找到一个函数 F，它求导以后刚好回到 f。',
      '如果反导函数找错，后面的 F(b) 减 F(a) 就没有意义。所以第一步永远是确认 F prime 等于 f。',
      '可以把这句话说出口：先找反导，再代端点。',
    ],
    [
      '中间的公式很短：从 a 到 b 的 f(x) dx，等于 F(b) 减 F(a)。',
      '它厉害的地方在于，把无限多个矩形的极限，变成两个端点的代入。',
      '这就是 FTC II 的价值：我们不用真的切无限多段，只要找到反导函数，就能计算稳定面积数。',
      '这里也可以停一下：上一节的极限过程还在，只是定理告诉我们有一条快捷计算通道。',
    ],
    [
      '右边图像帮助理解 F(b) 减 F(a)。它不是在算 F 图像下面的面积，而是在算 F 从 a 到 b 的高度变化。',
      '这正好和“净变化”联系起来：如果 f 是 F 的变化率，那么 f 的定积分就是 F 的总变化。',
      '所以 FTC II 把面积问题和变化量问题连到一起。后面导数面积那一页会专门展开这一点。',
      '下一页先做三个基础计算例题，练习怎样把这个公式落到数值答案上。',
    ],
  ],
  'FTC II 计算例题': [
    [
      '这一页有三个小例题，我们不要把它们当成三道互不相关的题。它们都按同一个流程：找反导，代上端点，减下端点。',
      '第一题是 x squared。从零到二积分时，反导函数是 x cubed over three。先写 F，再代二和零。',
      '代入以后得到八除以三。这里要看见，计算不是在画矩形，而是在用反导函数的端点差。',
      '第二题是 e to x。它的反导还是 e to x，所以从零到一就是 e minus one。',
    ],
    [
      '第三题是根号 x。先不要直接套，先把根号 x 写成 x 的二分之一次方。',
      '这样反导函数是 x 的三分之二次方乘三分之二，或者写成二分之三的倒数形式。页面里已经给出化简结果。',
      '三个例题共同提醒我们：FTC II 的难点往往不在端点差，而在快速识别正确反导函数。',
      '如果这里跟不上，可以先只练流程，不急着追求心算速度。',
    ],
    [
      '底部提醒非常重要：定积分结果是一个数，不要写加 C。',
      '为什么不加 C？因为如果反导函数是 F 加 C，那么代端点时变成 F(b)+C 减 F(a)-C，常数会抵消。',
      '所以不定积分需要加 C，定积分不需要。把这条规则在这里固定下来，后面可以少很多错误。',
      '下一页我们换一个方向：不是从积分算数，而是从极限求和式翻译回定积分。',
    ],
  ],
  '黎曼和 ⇄ 定积分': [
    [
      '这一页训练翻译能力。看到极限求和式容易慌，是因为它看起来不像熟悉的积分。',
      '先看左边模板。求和式一定要拆成两部分：一个宽度 delta x，一个高度 f(x_i)。',
      '宽度通常是乘在求和项外面或每一项里的小系数；高度通常是包含采样点的函数值。',
      '如果你能认出“宽度乘高度”，求和式就重新变回上一节的矩形和。',
    ],
    [
      '右边三步翻译法很实用。第一步先找 delta x，并由它判断区间长度。',
      '第二步找采样点 x_i。标准形式通常是 a 加 i delta x。这个步骤决定区间起点和取样位置。',
      '第三步把求和项里的 i 改写成 x_i，再把 x_i 换成 x。这样才能看出函数 f(x) 是什么。',
      '请注意顺序：不要还没确定 x_i，就直接把 i 的表达式硬换成 x。',
    ],
    [
      '底部总结说，核心不是背模板，而是还原。还原什么？还原成宽度、采样点、函数、区间。',
      '这页其实是在把第一本笔记本的内容倒着用：从 sigma 形式倒推出积分形式。',
      '做题时可以在草稿纸上列四行：delta x 是什么，x_i 是什么，区间是什么，f(x) 是什么。',
      '下一页我们用一个完整例题，把这四行一步一步填出来。',
    ],
  ],
  'Riemann Sum 转换例题': [
    [
      '先看题目原式。不要一上来化简整个括号，先找最容易识别的部分：前面的六除以 n。',
      '六除以 n 很像 delta x。如果起点是零，那么整个区间长度就是六，所以区间可能是 [0,6]。',
      '这一步先建立宽度和区间。很多错误都是因为先处理函数，结果把区间搞错。',
      '所以第一句先记住：先找 delta x，再谈函数。',
    ],
    [
      '第二步找采样点。因为 delta x 是六除以 n，而题目里反复出现六 i 除以 n，所以 x_i 就是六 i 除以 n。',
      '这时十二 i 除以 n 可以改写成二乘六 i 除以 n，也就是二 x_i。',
      '括号里另一个部分，六 i 除以 n 的平方，就是 x_i squared。',
      '现在求和项的高度就清楚了：它是二 x_i 减 x_i squared。',
    ],
    [
      '最后把 x_i 换成连续变量 x，函数就是二 x 减 x squared。',
      '结合前面得到的区间 [0,6]，最终定积分是从零到六的二 x 减 x squared dx。',
      '这页的关键不是最后答案，而是转换步骤：宽度、采样点、改写函数、确定区间。',
      '下一页我们把定积分和导数联系起来，看它为什么还能表示净变化。',
    ],
  ],
  '导数和面积：定积分是净变化': [
    [
      '这一页要把定积分从“面积”推进到“变化”。先看左边公式：如果被积函数是 f prime，那么积分等于 f(b) 减 f(a)。',
      '这其实就是 FTC II 的一个特别重要的解释。f prime 是原函数 f 的变化率，所以积分变化率，就得到总变化。',
      '换句话说，定积分不是只在算导数图像下面的面积，它同时在告诉我们原函数总共上升或下降了多少。',
      '这个视角在应用题里很关键，比如速度积分得到位移，增长率积分得到总增长。',
    ],
    [
      '现在看中间导数图像。绿色区域在 x 轴上方，表示 f prime 大于零，所以原函数 f 在增加。',
      '橙色区域在 x 轴下方，表示 f prime 小于零，所以原函数 f 在减少。',
      '正面积让原函数往上走，负面积让原函数往下走。最后的净变化，就是这两部分按符号相加。',
      '这里可以停一下：只看导数图像，你能判断原函数在哪些区间上升、哪些区间下降吗？',
    ],
    [
      '右下角讲最大最小线索。原函数的极值，常常出现在导数符号改变的位置。',
      '如果 f prime 从正变负，原函数先增加后减少，所以可能出现局部最大。',
      '如果 f prime 从负变正，原函数先减少后增加，所以可能出现局部最小。',
      '下一页进入 FTC I：如果积分的上限会动，面积本身也会变成一个函数。',
    ],
  ],
  'FTC I：面积函数的导数': [
    [
      'FTC I 的视角和 FTC II 不一样。这里我们不是固定上限 b，而是让上限变成 x。',
      '左上角定义 A(x) 等于从 a 到 x 的 f(t) dt。注意里面用的是 t，不是 x，这是为了区分积分变量和外面的上限变量。',
      '当 x 改变时，累积的面积也改变，所以 A(x) 是一个真正的函数。',
      '定理说，A prime x 等于 f(x)。也就是面积函数的导数，回到当前高度。',
    ],
    [
      '右边解释为什么。假设 x 往右移动一点点 h，面积函数只多出一条很窄的区域。',
      '这条新增区域的宽度约等于 h，高度约等于 f(x)。所以新增面积大约是 f(x) 乘 h。',
      '当我们算导数时，要用新增面积除以 h。f(x) 乘 h 再除以 h，就剩下 f(x)。',
      '当 h 趋近零，这个近似变成精确的导数结论。',
    ],
    [
      '图上的橙色小条就是新增面积。它让 FTC I 不再只是公式，而是“多走一点，多出来多少面积”的问题。',
      '可以把 FTC I 记成一句话：累积函数的瞬时变化率，等于当前被积函数的高度。',
      '这一页也提醒我们，积分和导数不是互相孤立的操作，它们通过面积函数互相连接。',
      '下一页把这个思想和链式法则结合起来，处理上限不是 x 的情况。',
    ],
  ],
  变上限积分与链式法则: [
    [
      '变上限积分第一眼先看谁在动。左上角公式里，上限不是 x，而是 g(x)。',
      '如果 G(x) 等于从 a 到 g(x) 的 f(t) dt，那么求导时先把 g(x) 代进 f，再乘 g prime x。',
      '为什么要乘 g prime x？因为上限移动的速度不一定是 1。面积增长速度等于当前高度，乘以上限自己的移动速度。',
      '所以这不是新定理，而是 FTC I 加链式法则。',
    ],
    [
      '右上角处理上下限都变的情况。上限移动会增加面积，所以是正号；下限移动会减少从下限开始的面积，所以是负号。',
      '公式看起来长，但逻辑简单：上限那项减下限那项，每一项都代入对应的限，再乘这个限的导数。',
      '做题时不要急着背整条公式，先拆成“上限贡献”和“下限贡献”。',
      '这样符号会更稳，尤其是下限也含 x 的时候。',
    ],
    [
      '例题里，上限是 x squared，被积函数是 cos of t squared。',
      '第一步把 t 换成上限 x squared，于是 t squared 变成 x to the fourth。',
      '第二步乘以上限 x squared 的导数，也就是二 x。最后得到二 x cos(x to the fourth)。',
      '这里最容易漏的是最后的二 x。漏掉它，本质上就是忘了链式法则。',
    ],
    [
      '底部记忆方式很适合做检查：上限动就加，下限动就减；每项都代入 f，再乘自己的导数。',
      '请把“自己的导数”四个字圈出来。谁在动，就乘谁的导数。',
      '这一页做完以后，FTC I 的题就有了固定流程。',
      '下一页回到计算工具箱，把常用反导函数整理一下。',
    ],
  ],
  '计算工具箱：常用反导函数': [
    [
      '这一页是工具箱，不是新概念。它的作用是让 FTC II 计算更快。',
      '先看表格左边的类别：幂函数、指数函数、一除以 x、三角函数、arctan 型。每一类都对应一条常用反导规则。',
      '这里不需要在这一页重新证明每条公式，但要知道做定积分时，第一步就是认函数类型。',
      '比如 x 的 n 次方用幂函数规则，e to x 还是 e to x，一除以 x 对应 ln absolute x。',
    ],
    [
      '右边公式提醒我们，反导函数表本身通常写的是不定积分，所以会带加 C。',
      '但定积分计算时，用这些反导函数代端点，最后常数会抵消，所以最终答案不要加 C。',
      '底部流程可以作为做题模板：先找反导函数，再代端点，最后检查结果是不是一个数。',
      '下一页总结整节课，把定义、净面积和端点差三种理解放在一起。',
    ],
  ],
  '本节课总结：定积分的三种面孔': [
    [
      '最后一页先看顶部流程。今天从定义开始，经过性质和 FTC II，再练习 Riemann sum 转换，最后到 FTC I。',
      '这条线索很完整：先知道定积分是什么，再知道它怎么拆，怎么计算，怎么和导数互相转换。',
      '如果觉得内容多，可以先抓三个关键词：定义、计算、变化。',
      '定义对应黎曼和极限，计算对应 FTC II，变化对应 FTC I 和净变化。',
    ],
    [
      '左下角能力清单可以作为自测。学完这一节，应该能解释定积分的意义，能用性质拆积分，能用 FTC II 算数值。',
      '还应该能把极限求和式翻译成定积分，并能处理变上限积分的导数。',
      '如果其中某一项还不稳，回去找对应页面练，而不是整节课重看。',
      '这就是总结页的作用：帮你定位自己掌握了哪一层。',
    ],
    [
      '右侧下节课钩子说明，接下来会进入计算技巧。也就是说，定积分不只是定义和性质，还会变成解决面积、净变化和应用题的工具。',
      '本节课先把地基打好：知道符号背后的面积极限，知道它带正负，知道它能用反导函数计算。',
      '这能避免后面做技巧题时只机械套公式，而不知道自己到底在算什么。',
      '下一节的计算技巧，会建立在这节课的三个理解之上。',
    ],
    [
      '最后看底部公式：定积分等于面积极限，等于净面积，也等于 F(b) 减 F(a)。',
      '这不是三条互不相关的公式，而是同一个对象的三种面孔。',
      '最后要带走的句子是：定积分既来自矩形极限，也记录有向面积，还可以通过原函数端点差来计算。',
      '到这里，定积分这一节就收束完成。下一本我们再进入更具体的计算技巧。',
    ],
  ],
};

function buildSpeechActions(scene, groups) {
  const actions = [];
  let speechIndex = 1;

  groups.forEach((lines) => {
    lines.forEach((text) => {
      actions.push({
        id: `${scene.id}-speech-definite-${String(speechIndex).padStart(2, '0')}`,
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
  const missingInDb = Object.keys(DEFINITE_NARRATION).filter((title) => !sceneTitles.has(title));
  if (missingInDb.length > 0) {
    throw new Error(`Narration references missing scenes: ${missingInDb.join(', ')}`);
  }

  const missingNarration = scenes.filter((scene) => !DEFINITE_NARRATION[scene.title]);
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
      const groups = DEFINITE_NARRATION[scene.title];
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
      `${DRY_RUN ? 'Would update' : 'Updated'} 02 - 定积分: ${sceneTotal} scenes, ${speechTotal} speech segments`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
