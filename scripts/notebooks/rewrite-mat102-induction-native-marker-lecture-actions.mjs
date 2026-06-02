#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { sanitizeMathForSpeech } from './mat136-tts-speech.mjs';
import { generatedNotebookDir } from '../shared/paths.mjs';

const NOTEBOOK_ID = 'nb-mat102-zh-induction-i-skill-v2-20260601';
const OUTPUT_DIR = generatedNotebookDir(NOTEBOOK_ID);
const SCENES_PATH = path.join(OUTPUT_DIR, 'notebook-scenes.json');
const ACTIONS_PATH = path.join(OUTPUT_DIR, 'scene-actions.json');
const DRY_RUN = process.argv.includes('--dry-run');

const COURSE_SPINE = {
  centralQuestion: '怎样用有限的证明动作，覆盖无限多个对象？',
  closingLine: '归纳不是猜规律，而是沿着对象的生成路径证明。',
};

const SCRIPT_GROUPS = {
  '数学归纳法：从起点和递推推出全体': [
    [
      '同学们，我们先想一个问题：如果一个数学规律声称对所有正整数都成立，我们到底怎么证明？',
      '最直接的办法当然是检查：一、二、三、四，一个一个看下去。',
      '但是正整数没有尽头，这种检查永远做不完；所以真正的问题是，怎样用有限的证明动作覆盖无限多个对象？',
      '数学归纳法就是为这个问题准备的。',
    ],
    [
      '现在看中间这排多米诺骨牌。它把无限证明变成了一个可以想象的过程：第一块倒下，后面一块接一块跟上。',
      '这里不是在数骨牌，而是在看链条有没有断：只要每一块倒下时都能推倒下一块，倒下这件事就会一直传下去。',
      '所以多米诺图要帮助我们记住，归纳法证明的是传递机制，不是很多零散例子。',
    ],
    [
      '翻回数学语言，我们只需要证明两件事。第一，起点真的成立；也就是第一块骨牌确实倒了。',
      '第二，从任意一层到下一层的传递一定成立；也就是任何一块倒下时，都能推倒下一块。',
      '如果起点和传递都成立，后面的每个正整数都会被这条链覆盖到。',
    ],
    [
      '所以归纳法不是“试很多个 n”，而是证明一条不会断的证明链。',
      '它把无限多个对象，压缩成起点和递推这两个有限动作。',
      '这页先记住这个核心思想；下一页我们再看标准三步里，每一步具体应该怎么写。',
    ],
  ],
  '普通归纳例题：不等式与整除': [
    [
      '上一页讲的是归纳法为什么能覆盖无限多个对象；这一页开始看它真正落到证明里，会长什么样。',
      '左边这个不等式例题，重点不是多试几个 n，而是把下一层目标改写到能接上旧命题的位置。',
    ],
    [
      '中间这句老师步骤很关键：先验起点，再把 k 加一层的目标式，改写成含有 k 层旧式子的形状。',
      '当旧式子出现以后，归纳假设才有地方进入；后面的不等号比较，是在确认新目标确实被旧目标托住了。',
    ],
    [
      '右边整除题换了一种语言。说能被五整除，不能只凭感觉，要先改写成五乘某个整数。',
      '所以老师把旧情形写成五的倍数，再把下一层拆成旧的那一块加上新的五倍数；这样新式子也落回五的倍数。',
    ],
    [
      '这两个例题的共同点是：归纳步里必须让旧命题明确出现，不能用一句“这一步成立”带过去。',
      '不等式找可比较的旧式子，整除先改写成整数倍；下一页我们把同一条链条用到构造问题上。',
    ],
  ],
  '棋盘铺砖：归纳构造的例子': [
    [
      '前一页的归纳步都在代数式里找旧命题；这一页换成棋盘，是为了说明归纳也能证明一种构造一定做得出来。',
      '目标说的是：边长不断翻倍的棋盘，任意去掉一格以后，都可以用 L 形三格砖铺满。',
    ],
    [
      '起点从最小棋盘开始。二乘二的棋盘少一格，剩下三格刚好就是一块 L 形砖，所以链条第一环是真的。',
      '这里不要跳过小图，因为构造型证明的 base case 不是代入数字，而是要真的展示最小对象怎么构造。',
    ],
    [
      '归纳步的妙处在大棋盘。先切成四块，原本缺口在其中一块；中心再放一块 L 形砖，让另外三块也各自像是少了一格。',
      '这样四个子棋盘都变回同一种小问题，归纳假设就可以分别使用；证明不是硬铺大棋盘，而是把大对象拆回同类小对象。',
    ],
    [
      '这一页真正要带走的是拆分方法：大对象如果能改成几个同类小对象，归纳假设就有了入口。',
      '下一页转到求和记号，看起来是符号问题，其实还是同一个动作：把一长串东西拆成旧的一段加新的一项。',
    ],
  ],
  '求和记号：把 Sigma 读成循环': [
    [
      '上一页把大棋盘拆成小棋盘；现在进入求和记号，是为了给后面的求和归纳准备语言。',
      '求和符号不要先当成一个神秘公式。它只是在说：从下界出发，让指标一步步走到上界，每一步加一个对应项。',
    ],
    [
      '右边的老师算法可以直接读成循环：设好起点，写当前项，指标加一，再写下一项，到上界就停。',
      '一旦这样读，求和记号就不再是要硬背的符号，而是一串有限加法的压缩写法。',
    ],
    [
      '看展开式时，不要把每个符号都念出来；要看模式：第一项、下一项、中间省略、最后一项。',
      '这个模式会直接服务归纳证明，因为做下一层时，我们最常拆的是前面旧的一段，再接上最后新出现的一项。',
    ],
    [
      '所以这一页的收束很简单：先会展开，才知道归纳步里到底多出了哪一项。',
      '下一页我们就用这个读法证明一个求和公式，重点看旧和怎样交给归纳假设，新项又怎样接上来。',
    ],
  ],
  '求和公式：旧和加新项': [
    [
      '上一页刚把求和读成循环；这一页把循环变成归纳证明。命题左边是一串分式相加，右边是只看终点的结果。',
      '先别急着读完整公式。我们只要抓住结构：证明到下一层时，左边会比旧和多出最后一项。',
    ],
    [
      'base case 是检查第一项，确认链条起点成立。这里的计算短，但它保证后面的递推不是悬空开始。',
      '归纳步从左边开始，因为左边最有弹性。先把前 k 加一项拆成前 k 项的旧和，再加上新出现的最后一项。',
    ],
    [
      '归纳假设只能替换整个前 k 项的和，不能随便替换某一项；这正是很多求和归纳容易错的位置。',
      '后面的通分整理，是为了让下一层的目标形状重新出现。算式不是为计算而计算，而是在检查新项接上以后链条没有断。',
    ],
    [
      '以后做求和归纳，就问两句话：旧和有没有整体交给归纳假设？最后一项有没有准确拆出来？',
      '下一页进入强归纳。变化不是结论更强，而是归纳步里允许使用的旧情况更多。',
    ],
  ],
  '强归纳：可以使用所有更小情形': [
    [
      '普通归纳通常只抓最近一层。现在问一个新的问题：如果下一层要回头看好几个旧情形，最近一层还够不够？',
      '强归纳的回答是：证明下一层时，可以使用从起点到当前为止所有已经证明过的情形。',
    ],
    [
      '右上角的对比要讲清楚：强归纳不是更神秘的定理，它和普通归纳逻辑上等价，只是归纳假设更方便使用。',
      '写强归纳时，最重要的是说清可用范围：哪些比目标小的情形，已经可以被当作工具。',
    ],
    [
      '邮票例题正好说明为什么要多个起点。八分、九分、十分先能做出来，后面目标金额才有地方往前退。',
      '证明一个更大的金额时，可以先拿掉一张八分、九分或十分邮票；剩下的是更小金额，就交给强归纳假设。',
    ],
    [
      '所以判断是否需要强归纳，就看新情况会不会依赖多个旧情况，或者必须往前退几步才接得上。',
      '下一页进入递归定义。那里的对象不是按数字排队出现，而是由起点对象和构造规则一步步生成。',
    ],
  ],
  '递归定义：由 basis 和 constructor 生成': [
    [
      '强归纳改变的是可用旧情况的范围；递归定义改变的是对象出现的方式。对象不是一次列完，而是按规则造出来。',
      '左边的定义可以分成两部分：basis 是一开始就放进去的起点对象，constructor 是从已有对象制造新对象的规则。',
    ],
    [
      '中间的例子从零开始。只要某个元素已经在集合里，就可以造出它的相反数，也可以造出它加二以后的新元素。',
      '这里最容易漏掉的是“已经在集合里”这件事。构造规则必须从旧元素出发，不能凭空声明一个新元素属于集合。',
    ],
    [
      '下面的构造树说明规则怎么反复使用：从零得到二，也能得到负二；再继续应用规则，就会长出更多元素。',
      '但看到很多例子不等于已经证明完整结论。要证明某个元素属于递归集合，必须能追溯到起点，或追溯到某条构造规则。',
    ],
    [
      '所以递归定义的收束是：元素的来源只能有两类，要么来自起点，要么由构造规则从旧元素生成。',
      '下一页看递归序列。递推规则如果回看两项，归纳证明也必须准备足够的起点和足够宽的旧情况。',
    ],
  ],
  '递归序列：为什么要强归纳': [
    [
      '上一页讲递归集合，元素按构造规则长出来；这一页看递归序列，新项按前面的项算出来。',
      '左边递推规则告诉我们：新一项需要前两项一起参与。所以证明目标公式时，只准备一个起点是不够的。',
    ],
    [
      '两个 base cases 在这里不是形式主义。第一项和第二项都要检查，因为递推一开始就需要两项作为燃料。',
      '如果只验第一项，到了第三项时，第二项的目标公式还没有被证明，归纳步就少了一个能用的旧情形。',
    ],
    [
      '右边目标公式看起来是显式表达式，但归纳步的核心仍然是替换：把前两项都换成已经证明过的目标形式。',
      '后面的整理不是为了展示计算技巧，而是为了让下一项的目标形状重新出现，说明递推没有把我们带出这条公式。',
    ],
    [
      '这页给出的判断规则很实用：递推规则回看几项，证明时通常就要准备几组起点。',
      '下一页进入结构归纳。那里的对象未必有第一、第二、第三，而是按构造规则长出来。',
    ],
  ],
  '结构归纳：按构造规则证明': [
    [
      '递归序列还有线性顺序；结构归纳处理的是更一般的递归对象。对象怎么被构造，证明就沿着构造规则走。',
      '左边原则只有两步：先证明所有 basis 有性质，再证明每个 constructor 都会保留这个性质。',
    ],
    [
      '中间例子里，集合从三开始；构造规则说，如果两个旧元素已经在集合里，它们的和也会进入集合。',
      '所以目标不是检查树上几个样本，而是证明所有按这条加法规则生成出来的元素，都能被三整除。',
    ],
    [
      'basis 检查很短：三本身能被三整除。真正不能漏的是 constructor 检查。',
      '假设两个旧元素都能被三整除，就把它们分别看成三的整数倍；两个三的整数倍相加，仍然是三的整数倍。',
    ],
    [
      '结构归纳最常见的漏洞，是只验了基本对象，却没有证明构造规则会保留性质。',
      '最后一页把普通归纳、强归纳和结构归纳放在一起，练习先判断对象到底是怎样生成的。',
    ],
  ],
  '归纳综合练习：选择正确链条': [
    [
      '最后一页不是再加一个新定理，而是把整节课变成一个选择问题：题目里的对象到底是怎样生成的？',
      '左边这类按数字一步步前进的命题，通常先尝试普通归纳，因为下一层往往只需要上一层来推进。',
    ],
    [
      '右边这类对象不是简单编号推进。字符串反转、括号数量、递归构造集合，都在提醒我们：对象可能是按构造规则长出来的。',
      '遇到这类题，别急着写 k 到 k 加一；先找 basis，再找 constructor，看每一种构造规则是否保留目标性质。',
    ],
    [
      '中间的选择方法可以当成检查清单：如果只用上一层，普通归纳通常够用；如果要用多个更小情形，就考虑强归纳。',
      '如果对象来自构造规则，就用结构归纳。此时你证明的不是下一个编号，而是每一种构造方式都会保留性质。',
    ],
    [
      `整节课可以收束成一句话：${COURSE_SPINE.closingLine}`,
      '以后看到归纳题，先问对象如何生成，再选证明链条；起点、推进规则、可用旧情况，这三件事要同时对上。',
    ],
  ],
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
    .replace(/\bbasis\b/g, 'basis')
    .replace(/\bconstructor\b/g, 'constructor')
    .replace(/\bconstructors\b/g, 'constructors')
    .replace(/\bbase cases\b/g, 'base cases')
    .replace(/\s+/g, ' ')
    .replace(/([。！？；：])\s+/g, '$1')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .trim();
}

function groupsFor(sceneTitle) {
  const groups = SCRIPT_GROUPS[sceneTitle];
  if (!groups) throw new Error(`Missing lecture script groups for scene: ${sceneTitle}`);
  return groups;
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
      id: spotlight.id || `${scene.id}-spotlight-lecture-script-${groupIndex + 1}`,
    });
    for (const line of lines) {
      actions.push({
        id: `${scene.id}-speech-lecture-script-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${spotlight.title || scene.title} ${speechIndex}`,
        text: cleanSpeech(line),
      });
      speechIndex += 1;
    }
  });

  return actions;
}

function validateActions(scene) {
  const isOpeningScene = scene.order === 0 || scene.title === '数学归纳法：从起点和递推推出全体';
  const elementIds = new Set(
    (scene.content?.canvas?.elements || []).map((element) => element?.id).filter(Boolean),
  );
  const seen = new Set();
  const ttsBadSymbols = /[{}_^√∫θΔπαβγλμσΣΩ∞≈≤≥≠±×÷]|=>|<=|>=|[<>]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/;
  const metaStyle = /学生应该|讲的时候|这一段讲解|让学生|学习者|听众|用户|课堂停顿|帮学生/;
  const captionSmell = /^这(一|页)[^。！？；]{0,18}[。！？；]$/;
  const genericSummary = /只是通分、合并|只是整理|然后化简|显然|看起来都对/;
  const openingSlideTour =
    /^(先)?(从|看)(左上角|左侧|右侧|中间|这个框|这个区域|这张图)|^这(一)?页|^这里真正问的是|^本页要讲|^这一页要讲/;
  const speeches = [];

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
    const speechIndex = speeches.length;
    speeches.push(text);
    if (isOpeningScene && speechIndex === 0 && openingSlideTour.test(text)) {
      throw new Error(`${scene.title}: opening starts as slide tour "${text}"`);
    }
    if (!isOpeningScene && text.length < 32) {
      throw new Error(`${scene.title}: speech too short "${text}"`);
    }
    if (isOpeningScene && text.length < 2) {
      throw new Error(`${scene.title}: opening beat too short "${text}"`);
    }
    if (text.length > 130) throw new Error(`${scene.title}: speech too long "${text}"`);
    if (ttsBadSymbols.test(text)) throw new Error(`${scene.title}: TTS-unfriendly math "${text}"`);
    if (metaStyle.test(text)) throw new Error(`${scene.title}: meta style "${text}"`);
    if (captionSmell.test(text)) throw new Error(`${scene.title}: caption smell "${text}"`);
    if (genericSummary.test(text)) throw new Error(`${scene.title}: generic summary "${text}"`);
  }

  if (speeches.length > 15) {
    throw new Error(`${scene.title}: too many speech segments, found ${speeches.length}`);
  }

  if (isOpeningScene && speeches.length < 8) {
    throw new Error(
      `${scene.title}: expected at least 8 opening speech segments, found ${speeches.length}`,
    );
  }

  if (!isOpeningScene && speeches.length < 8) {
    throw new Error(
      `${scene.title}: expected at least 8 speech segments, found ${speeches.length}`,
    );
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

  fs.writeFileSync(SCENES_PATH, `${JSON.stringify(nextFileScenes, null, 2)}\n`);
  fs.writeFileSync(
    ACTIONS_PATH,
    `${JSON.stringify(
      nextFileScenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        order: scene.order,
        actions: scene.actions,
      })),
      null,
      2,
    )}\n`,
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
      `${DRY_RUN ? 'Would update' : 'Updated'} MAT102 induction native-marker lecture script: ${updatedScenes.length} scenes, ${speechTotal} speech segments, ${spotlightTotal} spotlights`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
