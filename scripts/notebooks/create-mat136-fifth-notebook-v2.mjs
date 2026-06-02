#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-fifth-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-05-integration-by-parts';
const COURSE_ID = 'cmpanemia001v8ouzmhttvkrn';
const QUEUE_DIR = path.join('tmp', 'notebook-imagegen-queue', 'MAT136', NOTEBOOK_ID);
const PUBLIC_DIR = path.join('public', 'generated-notebooks', NOTEBOOK_ID);
const PUBLIC_PATH = `/generated-notebooks/${NOTEBOOK_ID}`;
const SOURCE_WIDTH = 1600;
const SOURCE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
const GENERATED_IMAGE_ROOT =
  process.env.GENERATED_IMAGE_ROOT ||
  path.join(process.env.HOME || '/Users/dongpochen', '.codex', 'generated_images');

const MARKERS = [
  { name: 'red', hex: '#ff0000', cn: '红色', match: (r, g, b) => r > 180 && g < 85 && b < 85 },
  { name: 'lime', hex: '#00ff00', cn: '绿色', match: (r, g, b) => g > 170 && r < 90 && b < 95 },
  { name: 'blue', hex: '#0048ff', cn: '蓝色', match: (r, g, b) => b > 145 && r < 90 && g < 140 },
  { name: 'cyan', hex: '#00ffff', cn: '青色', match: (r, g, b) => g > 165 && b > 165 && r < 95 },
  { name: 'magenta', hex: '#ff00ff', cn: '品红', match: (r, g, b) => r > 170 && b > 130 && g < 95 },
  { name: 'yellow', hex: '#ffff00', cn: '黄色', match: (r, g, b) => r > 170 && g > 170 && b < 110 },
];

const PAGES = [
  {
    title: '分部积分：把乘积反向拆开',
    sceneTitle: '分部积分入口',
    layout:
      '自然课堂笔记布局：上方标题，左侧放旧方法遇到的卡点，中央给新想法，右侧给本册路线，底部留一个引导问题。',
    components: [
      {
        label: '本册问题',
        role: 'opening',
        marker: 'red',
        content: '标题“分部积分：把乘积反向拆开”；写“乘积的积分，能不能从乘积求导倒推？”',
        speech:
          '这一页先建立本册的核心问题。前面我们会用换元处理“内层和导数”相配的积分，但乘积积分常常不是这种形状，所以要从乘积求导的反方向入手。',
      },
      {
        label: '旧方法卡点',
        role: 'motivation',
        marker: 'lime',
        content: '列出“∫x e^x dx、∫x cos x dx、∫ln x dx”；旁边写“没有明显内层”。',
        speech:
          '左侧这些题都在提示同一个困难：它们不是简单换元题。你很难只靠找内层函数和它的导数就完成。',
      },
      {
        label: '新想法',
        role: 'idea',
        marker: 'blue',
        content: '画“乘积求导 → 两项相加”的箭头，再画反向箭头写“分部积分”。',
        speech:
          '新想法是把乘积法则反过来看。乘积求导会产生两项，而分部积分就是把其中一个乘积积分换成另一个更容易的积分。',
      },
      {
        label: '学习路线',
        role: 'roadmap',
        marker: 'cyan',
        content: '写“公式来源 → 选u和dv → 基础例题 → 重复分部 → 混合方法”。',
        speech:
          '本册路线按课堂顺序来：先看公式从哪里来，再学怎么选 u 和 dv，然后进入基础例题、重复分部和混合题。',
      },
      {
        label: '引导问题',
        role: 'hook',
        marker: 'yellow',
        content: '底部问题：“怎样让剩下的积分比原题更简单？”',
        speech: '底部问题是分部积分的判断标准。不是套了公式就结束，而是要让剩下的积分真的更简单。',
      },
    ],
  },
  {
    title: '公式来源：乘积法则倒过来',
    sceneTitle: '公式来源',
    layout: '左上写乘积法则，中央改写成微分形式，右侧两边积分，下方移项得到公式，底部写一句理解。',
    components: [
      {
        label: '乘积法则',
        role: 'formula',
        marker: 'red',
        content: '写“(uv)′=u′v+uv′”。',
        speech:
          '分部积分的起点就是乘积法则。两个函数相乘再求导，会出现两项：一项来自 u 的变化，一项来自 v 的变化。',
      },
      {
        label: '微分形式',
        role: 'formula',
        marker: 'lime',
        content: '写“d(uv)=u dv+v du”；用小箭头标出 du 与 dv。',
        speech:
          '把乘积法则写成微分形式，就能看见分部积分里的角色。u dv 和 v du 是同一个乘积变化拆出的两块。',
      },
      {
        label: '两边积分',
        role: 'formula',
        marker: 'blue',
        content: '写“∫d(uv)=∫u dv+∫v du”。',
        speech:
          '接下来两边积分。左边直接回到 uv，右边保留两个积分。这个步骤只是把导数关系累加回来。',
      },
      {
        label: '移项公式',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫u dv=uv-∫v du”。',
        speech:
          '把其中一项移到右边，就得到分部积分公式。公式里的减号来自移项，所以之后每道题都要盯住这个符号。',
      },
      {
        label: '一句话理解',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“分部积分=反向使用乘积法则”。',
        speech:
          '这页的结论很简单：分部积分不是新魔法，而是反向使用乘积法则。理解来源以后，公式就不只是记忆。',
      },
    ],
  },
  {
    title: '使用模板：四个位置要对齐',
    sceneTitle: '公式模板',
    layout: '中央放公式，周围四个小区域分别标 u、dv、du、v，右下放检查清单。',
    components: [
      {
        label: '核心公式',
        role: 'formula',
        marker: 'red',
        content: '写大公式“∫u dv=uv-∫v du”。',
        speech:
          '这页只训练公式位置。左边的 u dv 是原来的积分，右边先写乘积 uv，再减掉新的积分 v du。',
      },
      {
        label: '选择u',
        role: 'step',
        marker: 'lime',
        content: '写“u：求导后要变简单”；例“u=x、u=ln x”。',
        speech: 'u 的任务是被求导。所以我们希望 u 求导后更简单，比如 x 变成一，ln x 变成一除以 x。',
      },
      {
        label: '选择dv',
        role: 'step',
        marker: 'blue',
        content: '写“dv：必须会积分”；例“dv=e^x dx、dv=cos x dx、dv=dx”。',
        speech:
          'dv 的任务是被积分。它必须是我们会直接积分的东西，否则 v 写不出来，公式就走不下去。',
      },
      {
        label: '生成du和v',
        role: 'step',
        marker: 'cyan',
        content: '写“du=u′dx；v=∫dv”。',
        speech:
          '选好 u 和 dv 后，立刻写 du 和 v。很多错误都是因为只写了 u 和 dv，却没有把这两个配套量写清楚。',
      },
      {
        label: '检查清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“新积分 ∫v du 是否更容易？符号是否保留？是否加 C？”',
        speech: '最后检查三件事：新的积分是不是更容易，减号有没有跟住，不定积分最后有没有加 C。',
      },
    ],
  },
  {
    title: '怎样选 u：让问题变轻',
    sceneTitle: '选u策略',
    layout: '左侧硬条件，中央优先级列表，右侧例题快速判断，底部对比好选择和坏选择。',
    components: [
      {
        label: '两个硬条件',
        role: 'strategy',
        marker: 'red',
        content: '写“u 求导变简单；dv 容易积分”。',
        speech:
          '选择不是凭感觉。最硬的两个条件是：u 求导后要变轻，dv 要能直接积分。缺一个都很危险。',
      },
      {
        label: '优先级提示',
        role: 'strategy',
        marker: 'lime',
        content: '写“反三角 → 对数 → 代数 → 三角 → 指数”；旁边写“只是提示”。',
        speech:
          '中间是选 u 的常用优先级：反三角、对数、代数、三角、指数。它是起步提示，不是绝对规则。',
      },
      {
        label: '快速判断',
        role: 'examples',
        marker: 'blue',
        content: '写“x e^x：u=x；ln x：u=ln x；x cos x：u=x”。',
        speech:
          '右侧三个判断都符合“求导变简单”。x 变成一，ln x 变成一除以 x，剩下的部分也容易积分。',
      },
      {
        label: '反例提醒',
        role: 'mistake',
        marker: 'cyan',
        content: '写“若选 dv=ln x dx，就等于把原题交给自己”。',
        speech:
          '如果把 dv 选成 ln x dx，就等于假设自己已经会积分 ln x，这会绕回原题。这样的选择没有推进问题。',
      },
      {
        label: '判断标准',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“每做一步都问：剩下的积分是否更简单？”',
        speech:
          '底部这句话是做题时真正的标准。每一步都问，剩下的积分有没有变简单；如果没有，就回头换选择。',
      },
    ],
  },
  {
    title: '例题一：∫x e^x dx',
    sceneTitle: '指数乘一次式',
    layout: '上方放题目，左侧选角色，中央套公式，右侧完成积分，底部给可因式分解的答案。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫x e^x dx”；标出“代数×指数”。',
        speech: '第一道基础例题是 x 乘 e 的 x 次方。它是代数函数乘指数函数，适合用分部积分。',
      },
      {
        label: '角色选择',
        role: 'formula',
        marker: 'lime',
        content: '写“u=x，du=dx；dv=e^x dx，v=e^x”。',
        speech:
          '让 u 等于 x，因为求导后变成一；让 dv 等于 e 的 x 次方 dx，因为它积分后还是 e 的 x 次方。',
      },
      {
        label: '套入公式',
        role: 'formula',
        marker: 'blue',
        content: '写“∫x e^x dx=x e^x-∫e^x dx”。',
        speech:
          '套公式以后，原积分变成 x e 的 x 次方，减去 e 的 x 次方的积分。注意这里没有额外系数。',
      },
      {
        label: '完成计算',
        role: 'formula',
        marker: 'cyan',
        content: '写“=x e^x-e^x+C”。',
        speech: '剩下的积分可以直接算，所以得到 x e 的 x 次方减 e 的 x 次方，再加常数 C。',
      },
      {
        label: '结果整理',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“答案=e^x(x-1)+C”。',
        speech:
          '最后可以把 e 的 x 次方提出来，写成 e 的 x 次方乘 x 减一。整理不是必须，但常常更清楚。',
      },
    ],
  },
  {
    title: '例题二：∫ln x dx',
    sceneTitle: '对数的隐藏乘积',
    layout: '左侧说明隐藏乘积，中央选 u 和 dv，右侧套公式，下方化简结果。',
    components: [
      {
        label: '隐藏乘积',
        role: 'opening',
        marker: 'red',
        content: '写“∫ln x dx=∫ln x·1 dx”。',
        speech: 'ln x 看起来不是乘积，但可以把它看成 ln x 乘一。这样就能放进分部积分公式。',
      },
      {
        label: '角色选择',
        role: 'formula',
        marker: 'lime',
        content: '写“u=ln x，du=1/x dx；dv=dx，v=x”。',
        speech: '选 u 等于 ln x，因为它求导后变成一除以 x。dv 就是 dx，所以 v 等于 x。',
      },
      {
        label: '套入公式',
        role: 'formula',
        marker: 'blue',
        content: '写“∫ln x dx=xln x-∫x·1/x dx”。',
        speech: '代入公式后，新的积分里 x 和一除以 x 相乘，会化成一。这就是选择有效的地方。',
      },
      {
        label: '化简积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“=xln x-∫1 dx=xln x-x+C”。',
        speech: '剩下的积分是一的积分，所以最终答案是 x ln x 减 x 加 C。',
      },
      {
        label: '方法记忆',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“只有一个对数时，常把 1 dx 作为 dv”。',
        speech: '底部这句话可以作为经验：单独一个对数函数，通常把一 dx 看成 dv，把对数本身作为 u。',
      },
    ],
  },
  {
    title: '例题三：∫x ln x dx',
    sceneTitle: '代数乘对数',
    layout: '上方题目，左侧比较选择，中间计算 v，右侧套公式，底部整理成最终答案。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫x ln x dx”；标“代数×对数”。',
        speech: '这一题是真正的乘积：x 乘 ln x。对数函数求导会变简单，所以通常把 ln x 选成 u。',
      },
      {
        label: '角色选择',
        role: 'formula',
        marker: 'lime',
        content: '写“u=ln x，du=1/x dx；dv=x dx，v=x²/2”。',
        speech: '让 u 等于 ln x，dv 等于 x dx。这样 v 是 x 平方除以二，而 du 是一除以 x dx。',
      },
      {
        label: '套入公式',
        role: 'formula',
        marker: 'blue',
        content: '写“∫xln x dx=(x²/2)ln x-∫(x²/2)(1/x)dx”。',
        speech: '套公式后，新积分里的 x 平方和一除以 x 会化成 x，难度明显下降。',
      },
      {
        label: '完成积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“=(x²/2)ln x-∫x/2 dx”。',
        speech: '现在只剩下 x 除以二的积分，这是基本幂函数积分，可以直接完成。',
      },
      {
        label: '最终答案',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“(x²/2)ln x-x²/4+C”。',
        speech: '最终答案是 x 平方除以二乘 ln x，减 x 平方除以四，再加 C。重点是新积分要降级。',
      },
    ],
  },
  {
    title: '例题四：∫x cos x dx',
    sceneTitle: '三角乘一次式',
    layout: '左侧角色选择，中央公式展开，右侧符号检查，底部突出常见符号错误。',
    components: [
      {
        label: '题目结构',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫x cos x dx”；旁边画一条小波形。',
        speech:
          '这题是一次式乘三角函数。一次式求导后会变成一，cos x 也容易积分，所以很适合分部积分。',
      },
      {
        label: '角色选择',
        role: 'formula',
        marker: 'lime',
        content: '写“u=x，du=dx；dv=cos x dx，v=sin x”。',
        speech: '选 u 等于 x，dv 等于 cos x dx。这样 v 是 sin x，du 是 dx。',
      },
      {
        label: '套入公式',
        role: 'formula',
        marker: 'blue',
        content: '写“∫x cos x dx=x sin x-∫sin x dx”。',
        speech: '套公式后，原积分等于 x sin x，减去 sin x 的积分。减号先不要急着算掉。',
      },
      {
        label: '符号检查',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫sin x dx=-cos x，所以 -∫sin x dx=+cos x”。',
        speech: '这里最容易错符号。sin x 的积分是负 cos x，前面还有一个负号，所以最后是加 cos x。',
      },
      {
        label: '最终答案',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“x sin x+cos x+C”。',
        speech: '最终答案是 x sin x 加 cos x 加 C。这个例子专门提醒你跟住两个负号。',
      },
    ],
  },
  {
    title: '重复分部：多项式次数一路下降',
    sceneTitle: '重复分部积分',
    layout: '左侧第一次分部，中间第二次分部，右侧次数下降示意，底部总结规律。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“计算 ∫x² e^x dx”；标“可能要分部两次”。',
        speech:
          '当多项式次数大于一时，分部一次可能还不够。这里 x 平方乘 e 的 x 次方通常要连续分部两次。',
      },
      {
        label: '第一次分部',
        role: 'formula',
        marker: 'lime',
        content: '写“u=x²，dv=e^x dx ⇒ x²e^x-∫2x e^x dx”。',
        speech:
          '第一次让 u 等于 x 平方，求导后变成二 x。原题变成 x 平方 e 的 x 次方，减去二 x e 的 x 次方的积分。',
      },
      {
        label: '第二次分部',
        role: 'formula',
        marker: 'blue',
        content: '写“∫2x e^x dx=2x e^x-∫2e^x dx”。',
        speech: '剩下的积分还是代数乘指数，所以再分部一次。二 x 求导后变成二，问题继续变轻。',
      },
      {
        label: '合并结果',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫x²e^x dx=e^x(x²-2x+2)+C”。',
        speech: '把第二次的结果代回第一次，并整理公共因子 e 的 x 次方，得到最终答案。',
      },
      {
        label: '次数规律',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“多项式每被求导一次，次数下降一”。',
        speech:
          '这页的规律是：多项式被选作 u 时，每分部一次，次数下降一。次数降到零，题目就收尾了。',
      },
    ],
  },
  {
    title: '先判断：换元有时更直接',
    sceneTitle: '换元优先判断',
    layout: '左侧放 sin x cos x，中央换元一步，右侧对比若硬分部会绕远，底部给决策句。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“∫sin x cos x dx”；标“内层和导数相配”。',
        speech:
          '不是所有乘积都要分部。sin x 乘 cos x 里面，sin x 的导数正好是 cos x，这时换元更直接。',
      },
      {
        label: '换元选择',
        role: 'formula',
        marker: 'lime',
        content: '写“令 u=sin x，du=cos x dx”。',
        speech: '令 u 等于 sin x，那么 du 就是 cos x dx，正好吃掉剩下的部分。',
      },
      {
        label: '直接积分',
        role: 'formula',
        marker: 'blue',
        content: '写“∫sin x cos x dx=∫u du=u²/2”。',
        speech: '积分立刻变成 u 的积分，答案是 u 平方除以二，再代回 sin x。',
      },
      {
        label: '代回结果',
        role: 'formula',
        marker: 'cyan',
        content: '写“=1/2 sin²x+C”。',
        speech: '代回原变量后，答案是二分之一 sin 平方 x 加 C。整个过程比硬分部短很多。',
      },
      {
        label: '决策句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“先看换元；不行再考虑分部”。',
        speech: '底部的决策句很实用：先看有没有明显换元结构；没有时，再考虑分部积分。',
      },
    ],
  },
  {
    title: '先换元再分部：∫x³ cos(x²) dx',
    sceneTitle: '换元后分部',
    layout: '左侧读结构，中间换元，右侧在新变量中分部，下方代回 x。',
    components: [
      {
        label: '读结构',
        role: 'opening',
        marker: 'red',
        content: '写“∫x³ cos(x²) dx”；标“x² 在 cos 里”。',
        speech: '这题不是直接分部最舒服。先读结构：cos 里面是 x 平方，外面有 x 的三次方。',
      },
      {
        label: '先换元',
        role: 'formula',
        marker: 'lime',
        content: '写“令 t=x²，dt=2x dx，x³dx=x²·x dx=(t/2)dt”。',
        speech:
          '先令 t 等于 x 平方。因为 x 三次方 dx 可以拆成 x 平方乘 x dx，所以它变成二分之一 t dt。',
      },
      {
        label: '变成标准题',
        role: 'formula',
        marker: 'blue',
        content: '写“∫x³cos(x²)dx=1/2∫t cos t dt”。',
        speech: '换元后，题目变成二分之一乘 t cos t 的积分，这就是标准的一次式乘三角函数。',
      },
      {
        label: '在t中分部',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫t cos t dt=t sin t+cos t”。',
        speech: '在 t 里分部，选 u 等于 t，dv 等于 cos t dt。最后得到 t sin t 加 cos t。',
      },
      {
        label: '代回结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“答案=1/2[x²sin(x²)+cos(x²)]+C”。',
        speech: '最后把 t 换回 x 平方，得到二分之一乘 x 平方 sin x 平方加 cos x 平方，再加 C。',
      },
    ],
  },
  {
    title: '反三角例题：∫arctan x dx',
    sceneTitle: '反三角隐藏乘积',
    layout: '左侧隐藏乘积，中央分部，右侧剩余积分换元，底部写最终答案并强调负号。',
    components: [
      {
        label: '隐藏乘积',
        role: 'opening',
        marker: 'red',
        content: '写“∫arctan x dx=∫arctan x·1 dx”。',
        speech: 'arctan x 和 ln x 类似，看起来不是乘积，但可以乘上一作为隐藏乘积。',
      },
      {
        label: '角色选择',
        role: 'formula',
        marker: 'lime',
        content: '写“u=arctan x，du=1/(1+x²) dx；dv=dx，v=x”。',
        speech: '选 u 等于 arctan x，因为它求导后变成一除以一加 x 平方。dv 仍然是 dx。',
      },
      {
        label: '套入公式',
        role: 'formula',
        marker: 'blue',
        content: '写“=x arctan x-∫x/(1+x²) dx”。',
        speech: '套公式后，剩下的积分是 x 除以一加 x 平方。这已经变成一个简单换元题。',
      },
      {
        label: '剩余积分',
        role: 'formula',
        marker: 'cyan',
        content: '写“令 w=1+x² ⇒ ∫x/(1+x²)dx=1/2 ln(1+x²)”。',
        speech: '处理剩余积分时，令 w 等于一加 x 平方，就得到二分之一 ln 一加 x 平方。',
      },
      {
        label: '最终答案',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“x arctan x-1/2 ln(1+x²)+C”。',
        speech: '最终答案要保留前面的减号，所以是 x arctan x 减二分之一 ln 一加 x 平方，加 C。',
      },
    ],
  },
  {
    title: '嵌套对数：先化简再换元',
    sceneTitle: '嵌套对数例题',
    layout: '左上化简对数，左下换元，中间变成 ln u，右侧分部计算，底部代回。',
    components: [
      {
        label: '题目化简',
        role: 'opening',
        marker: 'red',
        content: '写“∫ ln((ln x)³)/x dx”；旁边写“ln(a³)=3ln a”。',
        speech: '这题先不要急着分部。第一步用对数性质，把 ln((ln x) 的三次方) 化成三倍 ln(ln x)。',
      },
      {
        label: '换元入口',
        role: 'formula',
        marker: 'lime',
        content: '写“令 u=ln x，du=1/x dx”。',
        speech: '分母的 x 正好提示换元。令 u 等于 ln x，那么 du 就是一除以 x dx。',
      },
      {
        label: '化成已知题',
        role: 'formula',
        marker: 'blue',
        content: '写“原式=3∫ln u du”。',
        speech: '换元后，原题变成三倍 ln u 的积分，这就是前面已经会做的对数积分。',
      },
      {
        label: '分部计算',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫ln u du=u ln u-u+C”。',
        speech: '对 ln u 使用分部积分，结果是 u ln u 减 u。这里和 ln x 的积分完全同型。',
      },
      {
        label: '代回结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“答案=3[(ln x)ln(ln x)-ln x]+C”。',
        speech: '最后把 u 代回 ln x，得到三倍括号：ln x 乘 ln ln x，减 ln x，再加 C。',
      },
    ],
  },
  {
    title: '含 f 的表达式：让积分相互抵消',
    sceneTitle: '抽象函数分部',
    layout: '上方题目，左侧第一次分部，中间出现待抵消项，右侧第二次分部，底部写无积分结果。',
    components: [
      {
        label: '题目目标',
        role: 'opening',
        marker: 'red',
        content: '写“把 ∫f″(x)ln x dx + ∫f(x)/x² dx 化成无积分形式”。',
        speech:
          '这类题不要求把 f 具体算出来，而是要求通过分部积分让两个积分互相抵消，最后只留下 f 和 f 的导数。',
      },
      {
        label: '第一次分部',
        role: 'formula',
        marker: 'lime',
        content: '写“u=ln x，dv=f″(x)dx ⇒ f′(x)ln x-∫f′(x)/x dx”。',
        speech: '先处理含 f 双撇的积分。让 u 等于 ln x，dv 等于 f 双撇 dx，于是 v 是 f 撇。',
      },
      {
        label: '剩余积分',
        role: 'formula',
        marker: 'blue',
        content: '写“还剩 -∫f′(x)/x dx + ∫f(x)/x² dx”。',
        speech: '代回原式后，关键剩余部分是负的 f 撇除以 x 的积分，再加 f 除以 x 平方的积分。',
      },
      {
        label: '第二次分部',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫f′(x)/x dx=f(x)/x+∫f(x)/x² dx”。',
        speech:
          '对 f 撇除以 x 再分部一次。选 u 等于一除以 x，dv 等于 f 撇 dx，就会出现同样的 f 除以 x 平方积分。',
      },
      {
        label: '抵消结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“原式=f′(x)ln x-f(x)/x+C”。',
        speech:
          '把第二次分部结果代回，两个含 f 除以 x 平方的积分抵消，只剩 f 撇乘 ln x，减 f 除以 x，加 C。',
      },
    ],
  },
  {
    title: '定积分版本：边界项不能丢',
    sceneTitle: '定积分分部',
    layout: '中央写定积分公式，左侧解释边界项，右侧做小例子，底部给检查提醒。',
    components: [
      {
        label: '定积分公式',
        role: 'formula',
        marker: 'red',
        content: '写“∫_a^b u dv=[uv]_a^b-∫_a^b v du”。',
        speech:
          '分部积分也可以直接用于定积分。和不定积分相比，多出来最重要的是边界项从 a 到 b 的代入。',
      },
      {
        label: '边界项',
        role: 'concept',
        marker: 'lime',
        content: '写“[uv]_a^b=u(b)v(b)-u(a)v(a)”。',
        speech: '边界项不是 uv，而是 uv 在上限的值减去下限的值。这里最容易漏掉下限。',
      },
      {
        label: '小例子',
        role: 'formula',
        marker: 'blue',
        content: '写“∫_0^1 x e^x dx=[x e^x]_0^1-∫_0^1 e^x dx”。',
        speech: '对零到一的 x e 的 x 次方积分，先写边界项，再减去新的定积分。结构和不定积分一样。',
      },
      {
        label: '计算边界',
        role: 'formula',
        marker: 'cyan',
        content: '写“=e-(e-1)=1”。',
        speech: '边界项 x e 的 x 次方在一处是 e，在零处是零；剩余积分是 e 减一，所以结果是一。',
      },
      {
        label: '检查提醒',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“定积分不加 C，但要代上下限”。',
        speech: '底部提醒：定积分答案不加 C，但是每个边界项都必须代上下限。',
      },
    ],
  },
  {
    title: '反函数面积：也能用分部思想',
    sceneTitle: '反函数积分',
    layout: '左侧画单调函数和反函数面积，中央变量替换，右侧分部积分，底部给数值结果。',
    components: [
      {
        label: '题目入口',
        role: 'opening',
        marker: 'red',
        content: '写“f 连续递增，f(0)=0，f(1)=1，∫_0^1 f(x)dx=1/3；求 ∫_0^1 f^{-1}(x)dx”。',
        speech:
          '这页处理一个反函数积分。题目给了 f 的面积，要求反函数的面积，关键是把反函数积分换回原函数。',
      },
      {
        label: '换变量',
        role: 'formula',
        marker: 'lime',
        content: '写“令 x=f(t)，则 f^{-1}(x)=t，dx=f′(t)dt”。',
        speech: '令 x 等于 f(t)，那么反函数 f 负一次方的值就是 t，dx 变成 f 撇 t dt。',
      },
      {
        label: '转成新积分',
        role: 'formula',
        marker: 'blue',
        content: '写“∫_0^1 f^{-1}(x)dx=∫_0^1 t f′(t)dt”。',
        speech: '因为 f(0) 等于零，f(1) 等于一，上下限仍然从零到一。积分变成 t 乘 f 撇 t。',
      },
      {
        label: '分部处理',
        role: 'formula',
        marker: 'cyan',
        content: '写“∫_0^1 t f′(t)dt=[t f(t)]_0^1-∫_0^1 f(t)dt”。',
        speech: '现在对 t 乘 f 撇 t 分部。边界项是 t f(t)，剩下减去 f(t) 的积分。',
      },
      {
        label: '得到结果',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“=1-1/3=2/3”。',
        speech: '题目已经给出 f 的积分是三分之一，边界项是一，所以反函数积分就是三分之二。',
      },
    ],
  },
  {
    title: '常见错误：符号、角色、常数',
    sceneTitle: '常见错误检查',
    layout: '三块错误并排但不等宽：角色错误、符号错误、常数错误；底部放最终检查清单。',
    components: [
      {
        label: '角色错误',
        role: 'mistake',
        marker: 'red',
        content: '写“dv 必须带 dx；v 是 dv 的积分”。',
        speech:
          '第一个常见错误是角色写不完整。dv 必须包含 dx，而 v 是对 dv 的积分，不是随便抄一个函数。',
      },
      {
        label: '符号错误',
        role: 'mistake',
        marker: 'lime',
        content: '写“公式中间是减号：uv-∫vdu”。',
        speech:
          '第二个错误是丢掉公式里的减号。尤其遇到三角函数时，积分本身可能再产生负号，要分清两层符号。',
      },
      {
        label: '选择错误',
        role: 'mistake',
        marker: 'blue',
        content: '写“选 u 后，剩下积分不能更难”。',
        speech: '第三个错误是选完以后问题变复杂。每次选择后都要检查新的积分是否真的更容易。',
      },
      {
        label: '常数错误',
        role: 'mistake',
        marker: 'cyan',
        content: '写“不定积分最后加 C；定积分不加 C”。',
        speech: '第四个错误是常数处理。不定积分最后加 C，定积分代完上下限后不加 C。',
      },
      {
        label: '最终清单',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部 checklist：“u、dv、du、v；减号；新积分；边界或 C”。',
        speech:
          '最后做题前扫一遍清单：u、dv、du、v 是否齐全，减号是否保留，新积分是否变简单，最后是边界项还是加 C。',
      },
    ],
  },
  {
    title: '总结：分部积分怎么想',
    sceneTitle: '总结',
    layout:
      '中心放“反向乘积法则”，四周用箭头连接策略、例题类型、混合方法、检查清单，底部一句收束。',
    components: [
      {
        label: '核心思想',
        role: 'summary',
        marker: 'red',
        content: '中心写“分部积分=反向乘积法则”。',
        speech: '最后一页把本册收束起来。分部积分的核心思想，就是把乘积法则反过来使用。',
      },
      {
        label: '公式记忆',
        role: 'formula',
        marker: 'lime',
        content: '写“∫u dv=uv-∫v du”。',
        speech: '必须记牢公式结构：先写 uv，再减去 v du 的积分。所有题都在给这四个位置找对象。',
      },
      {
        label: '选择策略',
        role: 'strategy',
        marker: 'blue',
        content: '写“选 u：求导变简单；选 dv：能积分”。',
        speech: '选择策略也很简洁：u 要求导后变简单，dv 要能积分。最后检查新积分有没有降级。',
      },
      {
        label: '题型地图',
        role: 'examples',
        marker: 'cyan',
        content: '写“对数、反三角、代数×指数、代数×三角、重复分部、先换元再分部”。',
        speech:
          '本册见过的题型包括对数、反三角、代数乘指数、代数乘三角、重复分部，以及先换元再分部的混合题。',
      },
      {
        label: '最后一句',
        role: 'takeaway',
        marker: 'yellow',
        content: '底部写“目标不是套公式，而是把剩下的积分变简单”。',
        speech: '最后一句是最重要的解题观念：目标不是机械套公式，而是把剩下的积分变简单。',
      },
    ],
  },
];

function pageLabel(pageNumber) {
  return String(pageNumber).padStart(3, '0');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function markerFor(name) {
  const marker = MARKERS.find((item) => item.name === name);
  if (!marker) throw new Error(`Unknown marker: ${name}`);
  return marker;
}

function markerCoords(markerName) {
  const coords = {
    red: [
      [370, 25],
      [1230, 25],
      [370, 145],
      [1230, 145],
    ],
    lime: [
      [55, 185],
      [745, 185],
      [55, 660],
      [745, 660],
    ],
    blue: [
      [875, 170],
      [1530, 170],
      [875, 365],
      [1530, 365],
    ],
    cyan: [
      [820, 385],
      [1210, 385],
      [820, 670],
      [1210, 670],
    ],
    magenta: [
      [1240, 390],
      [1580, 390],
      [1240, 680],
      [1580, 680],
    ],
    yellow: [
      [330, 710],
      [1290, 710],
      [330, 860],
      [1290, 860],
    ],
  };
  return coords[markerName] || coords.yellow;
}

function compilePrompt(page, pageNumber) {
  const markerLines = page.components
    .map((component) => {
      const marker = markerFor(component.marker);
      const coords = markerCoords(component.marker)
        .map(([x, y]) => `(${x},${y})`)
        .join(', ');
      return [
        `${component.label}`,
        `Marker color: pure ${marker.hex} (${marker.cn}).`,
        `Approx marker corners: ${coords}.`,
        `Content: ${component.content}`,
        `Draw exactly four isolated ${marker.hex} corner squares around this whole semantic component.`,
      ].join('\n');
    })
    .join('\n\n');

  const validation = page.components
    .map((component) => {
      const marker = markerFor(component.marker);
      return `4 ${marker.name} ${marker.hex}`;
    })
    .join(', ');

  return `Use case: scientific-educational
Asset type: 16:9 hand-drawn Chinese calculus notebook slide with recoverable component corner markers

Generate page ${pageNumber} of a Chinese calculus integration-by-parts notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: x, u, v, t, w, y, du, dv, dx, dt, f(x), f'(x), f''(x), f^{-1}(x), ln, sin, cos, tan, arctan, e^x, ∫, C.

Slide title: “${page.title}”

Style:
- White graph-paper notebook background with faint light-gray grid.
- Common classroom hand-drawn marker style, neat and legible.
- Black marker text and formulas; deep teal graphs; pale teal fills; muted brown arrows.
- Normal content must not use pure red, pure lime, pure blue, pure cyan, pure magenta, or pure yellow.
- No photorealism, no UI chrome, no watermark.
- Do not draw component boxes, borders, frames, brackets, panels, or guide lines.

Flexible layout:
- Do not use a rigid equal-column layout.
- Use varied component sizes and staggered placement.
- Separate semantic components by whitespace only.
- Keep each component compact and self-contained; do not split one component into far-apart islands.
- Layout guidance: ${page.layout}

Marker rules, highest priority:
- Exactly ${page.components.length * 4} solid colored square markers total.
- For each semantic component, draw exactly four isolated colored square markers: top-left, top-right, bottom-left, bottom-right.
- Marker squares are about 18 px, solid filled, no outline, no shadow.
- Put markers just outside the semantic component boundary, not touching text, formulas, graph lines, arrows, or fills.
- Do not connect markers. Do not draw colored rectangles, colored outlines, or colored brackets.
- The only pure-color marks in the image are these marker squares.

Semantic components:

${markerLines}

Validation target:
The output is valid only if it contains exactly ${page.components.length * 4} isolated colored square markers: ${validation}. No course code, no page number, no week label, no component numbering.`;
}

function buildPromptPlan(page, pageNumber, compiledImagePrompt) {
  const promptHash = crypto.createHash('sha256').update(compiledImagePrompt).digest('hex');
  const markerCountsByColor = {};
  const componentPlans = page.components.map((component, index) => {
    const marker = markerFor(component.marker);
    markerCountsByColor[marker.hex] = 4;
    return {
      id: `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${marker.name}`,
      label: component.label,
      role: component.role,
      order: index + 1,
      markerColorName: marker.name,
      markerColorHex: marker.hex,
      visibleText: [component.content],
      formulas: [],
      diagramPrompt: component.content,
      participatesInMask: true,
    };
  });
  return {
    schemaVersion: 1,
    canvas: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, aspectRatio: '16:9' },
    componentPlans,
    markerProtocol: {
      type: 'corner-square-markers',
      markerSizePx: 18,
      markerCountPerComponent: 4,
      colorPool: MARKERS.map(({ name, hex }) => ({ name, hex })),
      ordinaryContentForbiddenColors: MARKERS.map((marker) => marker.hex),
    },
    compiledImagePrompt,
    promptHash,
    validationTarget: {
      maskableComponentCount: componentPlans.length,
      totalMarkerCount: componentPlans.length * 4,
      markerCountsByColor,
    },
    recoveryResult: { status: 'pending' },
  };
}

function preparePrompts() {
  const promptDir = path.join(QUEUE_DIR, 'v2-prompts');
  const planDir = path.join(QUEUE_DIR, 'v2-prompt-plans');
  ensureDir(promptDir);
  ensureDir(planDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const prompt = compilePrompt(page, pageNumber);
    fs.writeFileSync(path.join(promptDir, `page-${label}.prompt.md`), prompt);
    writeJson(
      path.join(planDir, `page-${label}.prompt-plan.json`),
      buildPromptPlan(page, pageNumber, prompt),
    );
  }
  writeJson(path.join(QUEUE_DIR, 'v2-outline.json'), {
    notebookId: NOTEBOOK_ID,
    title: '分部积分：从乘积法则到选 u',
    pageCount: PAGES.length,
    rules: {
      imageLanguage: 'Simplified Chinese only; formulas may use standard math notation',
      forbiddenImageLabels: ['course code', 'page number', 'week label'],
      workflow: 'marker source image -> marker recovery -> clean student image',
    },
    pages: PAGES.map((page, index) => ({
      pageNumber: index + 1,
      title: page.title,
      sceneTitle: page.sceneTitle,
      components: page.components.map(({ label, role, marker }) => ({ label, role, marker })),
    })),
  });
  console.log(`[prepare] wrote ${PAGES.length} prompts to ${promptDir}`);
}

function listGeneratedPngs(dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listGeneratedPngs(fullPath, depth + 1));
    if (entry.isFile() && entry.name.endsWith('.png')) files.push(fullPath);
  }
  return files;
}

function latestGeneratedImage() {
  const files = listGeneratedPngs(GENERATED_IMAGE_ROOT).sort(
    (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
  );
  if (!files.length) throw new Error(`No generated images found in ${GENERATED_IMAGE_ROOT}`);
  return files[0];
}

function adoptLatest(pageNumber) {
  const src = latestGeneratedImage();
  const label = pageLabel(pageNumber);
  const out = path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`);
  ensureDir(path.dirname(out));
  fs.copyFileSync(src, out);
  console.log(`[adopt] page-${label} <- ${src}`);
}

async function decodeRaw(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function componentsForColor(raw, marker) {
  const mask = new Uint8Array(raw.width * raw.height);
  for (let i = 0, p = 0; i < raw.data.length; i += 3, p += 1) {
    if (marker.match(raw.data[i] || 0, raw.data[i + 1] || 0, raw.data[i + 2] || 0)) mask[p] = 1;
  }
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      const start = y * raw.width + x;
      if (!mask[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cur = queue[head++] || 0;
        const cx = cur % raw.width;
        const cy = Math.floor(cur / raw.width);
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= raw.width || ny < 0 || ny >= raw.height) continue;
            const ni = ny * raw.width + nx;
            if (!mask[ni] || seen[ni]) continue;
            seen[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const aspect = width / Math.max(1, height);
      const fillRatio = area / Math.max(1, width * height);
      if (
        area >= 18 &&
        width >= 4 &&
        height >= 4 &&
        width <= 90 &&
        height <= 90 &&
        aspect >= 0.25 &&
        aspect <= 3.5 &&
        fillRatio >= 0.12
      ) {
        components.push({ minX, minY, maxX, maxY, width, height, area });
      }
    }
  }
  return components;
}

function componentCenter(component) {
  return {
    x: component.minX + component.width / 2,
    y: component.minY + component.height / 2,
  };
}

function cornerScore(corner, nx, ny) {
  if (corner === 'top-left') return nx + ny;
  if (corner === 'top-right') return 1 - nx + ny;
  if (corner === 'bottom-left') return nx + (1 - ny);
  return 1 - nx + (1 - ny);
}

function selectCornerHits(components) {
  if (components.length < 4) return [];
  const centers = components.map(componentCenter);
  const left = Math.min(...centers.map((center) => center.x));
  const top = Math.min(...centers.map((center) => center.y));
  const right = Math.max(...centers.map((center) => center.x));
  const bottom = Math.max(...centers.map((center) => center.y));
  const width = right - left;
  const height = bottom - top;
  if (width < 32 || height < 32) return [];
  const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const candidatesByCorner = corners.map((corner) =>
    components
      .map((component) => {
        const center = componentCenter(component);
        return {
          corner,
          component,
          score: cornerScore(corner, (center.x - left) / width, (center.y - top) / height),
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(8, components.length)),
  );
  let best = [];
  let bestScore = Infinity;
  const used = new Set();
  const current = [];
  const search = (index, score) => {
    if (score >= bestScore) return;
    if (index >= corners.length) {
      best = current.slice();
      bestScore = score;
      return;
    }
    for (const candidate of candidatesByCorner[index] || []) {
      if (used.has(candidate.component)) continue;
      used.add(candidate.component);
      current.push({ corner: candidate.corner, component: candidate.component });
      search(index + 1, score + candidate.score);
      current.pop();
      used.delete(candidate.component);
    }
  };
  search(0, 0);
  return best.length === 4 ? best : [];
}

function bboxFromComponents(components) {
  return [
    Math.min(...components.map((component) => component.minX)),
    Math.min(...components.map((component) => component.minY)),
    Math.max(...components.map((component) => component.maxX)),
    Math.max(...components.map((component) => component.maxY)),
  ];
}

function toCanvasBbox(sourceBbox, raw) {
  return [
    round1((sourceBbox[0] / raw.width) * CANVAS_WIDTH),
    round1((sourceBbox[1] / raw.height) * CANVAS_HEIGHT),
    round1((sourceBbox[2] / raw.width) * CANVAS_WIDTH),
    round1((sourceBbox[3] / raw.height) * CANVAS_HEIGHT),
  ];
}

function median(values, fallback = 248) {
  if (!values.length) return fallback;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? fallback;
}

function isMarkerPixel(r, g, b) {
  return MARKERS.some((marker) => marker.match(r, g, b));
}

async function writeCleanImage(raw, markerComponents, outPath) {
  const out = Buffer.from(raw.data);
  for (const component of markerComponents) {
    const pad = 7;
    const x1 = Math.max(0, Math.floor(component.minX - pad));
    const y1 = Math.max(0, Math.floor(component.minY - pad));
    const x2 = Math.min(raw.width - 1, Math.ceil(component.maxX + pad));
    const y2 = Math.min(raw.height - 1, Math.ceil(component.maxY + pad));
    const samplePad = 22;
    const rs = [];
    const gs = [];
    const bs = [];
    for (
      let y = Math.max(0, y1 - samplePad);
      y <= Math.min(raw.height - 1, y2 + samplePad);
      y += 1
    ) {
      for (
        let x = Math.max(0, x1 - samplePad);
        x <= Math.min(raw.width - 1, x2 + samplePad);
        x += 1
      ) {
        if (x >= x1 && x <= x2 && y >= y1 && y <= y2) continue;
        const i = (y * raw.width + x) * 3;
        const r = raw.data[i] || 0;
        const g = raw.data[i + 1] || 0;
        const b = raw.data[i + 2] || 0;
        if (isMarkerPixel(r, g, b)) continue;
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
    const r = median(rs);
    const g = median(gs);
    const b = median(bs);
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const i = (y * raw.width + x) * 3;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
      }
    }
  }
  ensureDir(path.dirname(outPath));
  await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .png()
    .toFile(outPath);
}

async function recoverPage(pageNumber) {
  const label = pageLabel(pageNumber);
  const markerInput = path.join(QUEUE_DIR, 'v2-marker-generated', `page-${label}.png`);
  const promptPlanPath = path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`);
  if (!fs.existsSync(markerInput)) throw new Error(`Missing marker image: ${markerInput}`);
  if (!fs.existsSync(promptPlanPath)) throw new Error(`Missing prompt plan: ${promptPlanPath}`);
  const promptPlan = readJson(promptPlanPath);
  ensureDir(PUBLIC_DIR);
  const markerPublic = path.join(PUBLIC_DIR, `v2-marker-slide-${label}.png`);
  const cleanPublic = path.join(PUBLIC_DIR, `v2-slide-${label}.png`);
  await sharp(markerInput)
    .resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' })
    .png()
    .toFile(markerPublic);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  const allMarkerComponents = [];
  for (const component of promptPlan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    allMarkerComponents.push(...components);
    const hits = selectCornerHits(components);
    const sourceBbox =
      hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    if (components.length !== 4) {
      findings.push(
        `${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`,
      );
    }
    if (!sourceBbox) {
      findings.push(`${component.label}: could not recover a four-corner bbox`);
    }
    recoveredComponents.push({
      componentId: component.id,
      markerColorHex: marker.hex,
      bbox: sourceBbox ? toCanvasBbox(sourceBbox, raw) : undefined,
      markerPoints: hits.map((hit) => {
        const center = componentCenter(hit.component);
        return {
          corner: hit.corner,
          x: round1((center.x / raw.width) * CANVAS_WIDTH),
          y: round1((center.y / raw.height) * CANVAS_HEIGHT),
        };
      }),
      markerCount: components.length,
    });
  }
  await writeCleanImage(raw, allMarkerComponents, cleanPublic);
  const recoveryResult = {
    status: findings.length ? 'failed' : 'passed',
    recoveredAt: Date.now(),
    originalMarkerImageUrl: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
    cleanImageUrl: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    originalMarkerImageDimensions: { width: raw.width, height: raw.height },
    findings,
    components: recoveredComponents,
  };
  const nextPlan = { ...promptPlan, recoveryResult };
  writeJson(promptPlanPath, nextPlan);
  return { pageNumber, recoveryResult };
}

async function recoverPages(pageNumbers) {
  const summary = [];
  for (const pageNumber of pageNumbers) {
    const result = await recoverPage(pageNumber);
    summary.push({
      pageNumber,
      status: result.recoveryResult.status,
      findings: result.recoveryResult.findings,
    });
    console.log(`[recover] page-${pageLabel(pageNumber)} ${result.recoveryResult.status}`);
  }
  writeJson(path.join(QUEUE_DIR, 'v2-marker-recovery-summary.json'), summary);
}

function focusRegionsFromPlan(promptPlan) {
  const recoveredById = new Map(
    (promptPlan.recoveryResult?.components || [])
      .filter((component) => component.bbox && (component.markerPoints?.length || 0) === 4)
      .map((component) => [component.componentId, component]),
  );
  return promptPlan.componentPlans
    .flatMap((component, index) => {
      const recovered = recoveredById.get(component.id);
      if (!recovered?.bbox) return [];
      const [left, top, right, bottom] = recovered.bbox;
      return {
        id: component.id,
        label: component.label,
        role: component.role,
        left,
        top,
        width: round1(Math.max(20, right - left)),
        height: round1(Math.max(20, bottom - top)),
        order: index + 1,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function imageElement(pageNumber) {
  const label = pageLabel(pageNumber);
  return {
    id: `${NOTEBOOK_ID}-v2-image-${label}`,
    type: 'image',
    left: 0,
    top: 0,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotate: 0,
    fixedRatio: false,
    src: `${PUBLIC_PATH}/v2-slide-${label}.png`,
    imageType: 'pageFigure',
    radius: 0,
  };
}

function hotspotElement(region) {
  return {
    id: region.id,
    name: `semantic-hit-map: ${region.label}`,
    type: 'shape',
    left: region.left,
    top: region.top,
    width: region.width,
    height: region.height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    outline: { color: '#ffffff', width: 0, style: 'solid' },
    opacity: 0,
  };
}

function narrationStep(marker, title, speech) {
  return { marker, title, speech };
}

function compactContent(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .replace(/[。；;]\s*$/, '');
}

function speechContent(content) {
  return compactContent(content)
    .replace(/(?:底部写|左侧写|右侧写|顶部写|旁边写|标题|写|列|标)[“"]([^”"]+)[”"]/g, '$1')
    .replace(/画断点/g, '标出断点')
    .replace(/画/g, '')
    .replace(/；/g, '，')
    .replace(/\s*，\s*/g, '，')
    .replace(/，{2,}/g, '，')
    .replace(/^[，：:\s]+|[，。；;\s]+$/g, '');
}

function detailTitleForComponent(component, index) {
  const role = component.role || '';
  if (index === 0) return '本页路线';
  if (role === 'formula' || role === 'definition' || role === 'rule')
    return `${component.label}对齐`;
  if (role === 'strategy' || role === 'roadmap' || role === 'step') return `${component.label}理由`;
  if (role === 'example' || role === 'examples' || role === 'derivation')
    return `${component.label}计算`;
  if (role === 'visual') return `${component.label}结构`;
  if (role === 'takeaway' || role === 'hook' || role === 'mistake') return `${component.label}检查`;
  return `${component.label}判断`;
}

function detailSpeechForComponent(_page, component, index) {
  const content = speechContent(component.content);
  const role = component.role || '';

  if (index === 0) {
    return `这页要解决的是乘积积分。分部积分不是新奇技巧，而是把乘积求导公式倒过来用。`;
  }

  if (role === 'visual') {
    return `${content}。读这种结构时，先找哪个因子适合微分变简单，哪个因子适合直接积分。`;
  }

  if (role === 'formula') {
    return `${content}。公式里四个位置要对齐：u、dv、du、v；最容易错的是负号和剩下的积分。`;
  }

  if (role === 'strategy' || role === 'roadmap' || role === 'step') {
    return `${content}。选择 u 的目标是让它微分后变简单，同时让 dv 能顺利积分成 v。`;
  }

  if (role === 'takeaway' || role === 'hook' || role === 'mistake') {
    return `${content}。做完后回头检查三件事：u 有没有变简单，dv 有没有积分对，边界项或常数有没有漏。`;
  }

  return `${content}。这里先判断题型：能换元就换元；没有明显内层时，再考虑用分部积分把乘积拆开。`;
}

function narrationForPage(page) {
  const steps = [];
  for (const [index, component] of page.components.entries()) {
    steps.push(narrationStep(component.marker, component.label, component.speech));
    if (index < 4) {
      steps.push(
        narrationStep(
          component.marker,
          detailTitleForComponent(component, index),
          detailSpeechForComponent(page, component, index),
        ),
      );
    }
  }
  return steps;
}

function actionsForPage(page, pageNumber, focusRegions) {
  const focusByMarker = new Map();
  for (const region of focusRegions) {
    const markerName = region.id.split('-').at(-1);
    focusByMarker.set(markerName, region);
  }
  const actions = [];
  const narration =
    Array.isArray(page.narration) && page.narration.length
      ? page.narration
      : narrationForPage(page);

  for (const [index, step] of narration.entries()) {
    const region = step.marker ? focusByMarker.get(step.marker) : null;
    if (!region) continue;
    const sequence = String(index + 1).padStart(2, '0');
    const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-n${sequence}-${step.marker}`;
    const title = step.title || region.label || page.sceneTitle;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title,
      description: `聚焦“${region.label}”区域。`,
      dimOpacity: 0.68,
    });
    if (typeof step.speech === 'string' && step.speech.trim()) {
      actions.push({
        id: `${actionBase}-speech`,
        type: 'speech',
        title,
        text: step.speech,
      });
    }
  }
  return actions;
}

function canvasFor(pageNumber, focusRegions) {
  return {
    id: `${NOTEBOOK_ID}-v2-canvas-${pageLabel(pageNumber)}`,
    viewportSize: CANVAS_WIDTH,
    viewportRatio: 16 / 9,
    theme: {
      backgroundColor: '#ffffff',
      themeColors: ['#0f766e', '#334155', '#a16207', '#0f172a'],
      fontColor: '#0f172a',
      fontName: 'Inter',
      outline: { color: '#0f766e', width: 2, style: 'solid' },
      shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
    },
    elements: [imageElement(pageNumber), ...focusRegions.map(hotspotElement)],
    background: { type: 'solid', color: '#ffffff' },
    type: 'content',
  };
}

function writeNarrationFiles() {
  const narrationDir = path.join(QUEUE_DIR, 'v2-narration');
  ensureDir(narrationDir);
  for (const [index, page] of PAGES.entries()) {
    const pageNumber = index + 1;
    const label = pageLabel(pageNumber);
    const promptPlan = readJson(
      path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`),
    );
    const focusRegions = focusRegionsFromPlan(promptPlan);
    const actions = actionsForPage(page, pageNumber, focusRegions);
    writeJson(path.join(narrationDir, `page-${label}.actions.json`), {
      schemaVersion: 1,
      notebookId: NOTEBOOK_ID,
      pageNumber,
      sceneTitle: page.sceneTitle,
      imagePath: `${PUBLIC_PATH}/v2-slide-${label}.png`,
      markerSourceImagePath: `${PUBLIC_PATH}/v2-marker-slide-${label}.png`,
      focusRegions,
      actions,
      qa: {
        language: 'zh-CN',
        noCourseCodePageNumberOrWeekInPrompt: true,
        spotlightTargetsExist: actions
          .filter((action) => action.type === 'spotlight')
          .every((action) => focusRegions.some((region) => region.id === action.elementId)),
        speechCount: actions.filter((action) => action.type === 'speech').length,
        focusCount: focusRegions.length,
      },
    });
  }
  console.log(`[narration] wrote ${PAGES.length} files`);
}

async function renderContactSheet() {
  const columns = 3;
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 30;
  const composites = [];
  for (let pageNumber = 1; pageNumber <= PAGES.length; pageNumber += 1) {
    const label = pageLabel(pageNumber);
    const file = path.join(PUBLIC_DIR, `v2-slide-${label}.png`);
    const labelSvg = `<svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${thumbWidth}" height="${labelHeight}" fill="#0f172a"/><text x="12" y="21" fill="#ffffff" font-size="15" font-family="Arial">${pageNumber}. ${PAGES[pageNumber - 1].sceneTitle}</text></svg>`;
    const thumb = await sharp(file)
      .resize(thumbWidth, thumbHeight)
      .extend({ bottom: labelHeight, background: '#ffffff' })
      .composite([{ input: Buffer.from(labelSvg), top: thumbHeight, left: 0 }])
      .png()
      .toBuffer();
    composites.push({
      input: thumb,
      left: ((pageNumber - 1) % columns) * thumbWidth,
      top: Math.floor((pageNumber - 1) / columns) * (thumbHeight + labelHeight),
    });
  }
  await sharp({
    create: {
      width: columns * thumbWidth,
      height: Math.ceil(PAGES.length / columns) * (thumbHeight + labelHeight),
      channels: 4,
      background: '#e5e7eb',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(PUBLIC_DIR, 'v2-contact-sheet.png'));
  console.log(`[contact-sheet] ${path.join(PUBLIC_DIR, 'v2-contact-sheet.png')}`);
}

function loadEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

async function seedDb() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (!course) throw new Error(`Course not found: ${COURSE_ID}`);
    const now = new Date();
    const scenes = [];
    for (const [index, page] of PAGES.entries()) {
      const pageNumber = index + 1;
      const label = pageLabel(pageNumber);
      const promptPlan = readJson(
        path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`),
      );
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') {
        throw new Error(`Page ${pageNumber} recovery is not passed`);
      }
      if (focusRegions.length !== page.components.length) {
        throw new Error(
          `Page ${pageNumber} focus count mismatch: ${focusRegions.length}/${page.components.length}`,
        );
      }
      scenes.push({
        id: `${NOTEBOOK_ID}-v2-p${label}`,
        notebookId: NOTEBOOK_ID,
        title: page.sceneTitle,
        type: 'slide',
        order: index,
        content: {
          type: 'slide',
          canvas: canvasFor(pageNumber, focusRegions),
          webRenderMode: 'slide',
          semanticHitMap: {
            version: 1,
            source: 'imagegen-corner-marker-recovery-v2',
            sourceSize: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT },
            canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
            regions: focusRegions.map((region) => ({
              id: region.id,
              semanticId: region.id,
              label: region.label,
              canvasRect: {
                left: region.left,
                top: region.top,
                width: region.width,
                height: region.height,
              },
            })),
          },
          imageNotebookPromptPlan: promptPlan,
        },
        actions: actionsForPage(page, pageNumber, focusRegions),
        whiteboard: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await prisma.$transaction([
      prisma.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } }),
      prisma.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: course.ownerId,
          courseId: course.id,
          name: '分部积分：从乘积法则到选 u',
          description:
            '第五本中文手绘图片笔记本：分部积分公式、选 u、重复分部、换元结合与典型例题。',
          tags: ['MAT136', '分部积分', '乘积法则', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '分部积分：从乘积法则到选 u',
          description:
            '第五本中文手绘图片笔记本：分部积分公式、选 u、重复分部、换元结合与典型例题。',
          tags: ['MAT136', '分部积分', '乘积法则', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.scene.createMany({ data: scenes }),
    ]);
    console.log(`[db] replaced ${NOTEBOOK_ID}; scenes=${scenes.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

function pageNumbersFromArgs() {
  const pageIndex = process.argv.indexOf('--page');
  if (pageIndex >= 0) return [Number(process.argv[pageIndex + 1])];
  return PAGES.map((_, index) => index + 1);
}

function usage() {
  console.log(`Usage:
  node scripts/notebooks/${SCRIPT_NAME} --prepare-prompts
  node scripts/notebooks/${SCRIPT_NAME} --adopt-latest --page <n>
  node scripts/notebooks/${SCRIPT_NAME} --recover [--page <n>]
  node scripts/notebooks/${SCRIPT_NAME} --write-narration
  node scripts/notebooks/${SCRIPT_NAME} --contact-sheet
  node scripts/notebooks/${SCRIPT_NAME} --seed-db`);
}

async function main() {
  if (process.argv.includes('--prepare-prompts')) return preparePrompts();
  if (process.argv.includes('--adopt-latest')) return adoptLatest(pageNumbersFromArgs()[0]);
  if (process.argv.includes('--recover')) return recoverPages(pageNumbersFromArgs());
  if (process.argv.includes('--write-narration')) return writeNarrationFiles();
  if (process.argv.includes('--contact-sheet')) return renderContactSheet();
  if (process.argv.includes('--seed-db')) return seedDb();
  usage();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
