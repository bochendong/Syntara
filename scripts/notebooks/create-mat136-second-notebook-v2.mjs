#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-second-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-02-substitution';
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
  '/Users/dongpochen/.codex/generated_images/019e768b-9ea6-7031-a350-1a380fe54bd7';

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
    "title": "换元法：把复杂部分叫作 u",
    "sceneTitle": "换元法入口",
    "layout": "自然课堂笔记布局：上方是标题和核心问题，左侧画复合函数结构，中右解释 du，底部给出本节路线。",
    "components": [
      {
        "label": "本节问题",
        "role": "opening",
        "marker": "red",
        "content": "标题“换元法：把复杂部分叫作 u”；写“复杂积分能不能变简单？”",
        "speech": "先看这一页的核心问题。换元法不是为了换一个字母，而是把积分里最复杂、最重复的部分暂时叫作 u，让结构变得清楚。"
      },
      {
        "label": "复合函数结构",
        "role": "visual",
        "marker": "lime",
        "content": "画外层 f(□) 包住内层 g(x)，写“f(g(x))”。",
        "speech": "左侧先看复合函数结构。很多积分真正难的地方，是外层函数套着一个内层表达式，直接积分会显得很乱。"
      },
      {
        "label": "内层导数线索",
        "role": "formula",
        "marker": "blue",
        "content": "写“u=g(x)”和“du=g′(x)dx”；旁边画箭头指向原积分中的因子。",
        "speech": "右上角是关键线索。如果选 u 等于内层 g of x，那么 du 就等于 g prime of x dx。原积分里若正好出现这个导数因子，换元就很顺。"
      },
      {
        "label": "变量世界切换",
        "role": "strategy",
        "marker": "cyan",
        "content": "写“x 世界 → u 世界”；提醒“换完后不要剩 x”。",
        "speech": "中间这句要记住：换元是在切换变量世界。进入 u 世界以后，积分里最好只剩 u 和 du；如果还剩 x，就没有换干净。"
      },
      {
        "label": "学习路线",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部路线：“选 u → 算 du → 全部改写 → 积分 → 换回”。",
        "speech": "底部是本节课路线。每道题都按五步走：选 u，算 du，全部改写，完成积分，最后换回原变量。"
      }
    ]
  },
  {
    "title": "核心公式：反向链式法则",
    "sceneTitle": "反向链式法则",
    "layout": "左侧从链式法则出发，右侧写换元积分公式；底部用一条短流程把 dx 变成 du。",
    "components": [
      {
        "label": "公式入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“反向链式法则”；写“换元法来自链式法则倒过来”。",
        "speech": "这一页把换元法的来源讲清楚。它不是孤立技巧，而是把链式法则倒过来看。"
      },
      {
        "label": "链式法则",
        "role": "formula",
        "marker": "lime",
        "content": "写“若 H(x)=F(g(x))，则 H′(x)=f(g(x))g′(x)”。",
        "speech": "左侧是链式法则。如果 F 的导数是 f，那么 F(g(x)) 的导数就是 f(g(x)) 乘以 g prime x。"
      },
      {
        "label": "换元公式",
        "role": "formula",
        "marker": "blue",
        "content": "写“∫ f(g(x))g′(x)dx = ∫ f(u)du = F(u)+C”。",
        "speech": "右上把它倒过来。只要积分中出现 f(g(x)) 乘 g prime x，就可以令 u 等于 g(x)，把它改写成 f(u) 的积分。"
      },
      {
        "label": "du 的含义",
        "role": "formula",
        "marker": "cyan",
        "content": "写“du=g′(x)dx”；强调“导数因子和 dx 一起换”。",
        "speech": "这里要注意 du 不是单独的导数，它包含 g prime x 和 dx。换元时常常是把一个因子连同 dx 一起换掉。"
      },
      {
        "label": "判断句",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“看见内层 + 内层导数，就想到换元”。",
        "speech": "底部这句话就是第一反应：看到内层表达式，又看到它的导数在旁边，就先尝试换元法。"
      }
    ]
  },
  {
    "title": "怎样选择 u",
    "sceneTitle": "选择 u 的信号",
    "layout": "不是表格，像三块散开的课堂笔记：复杂括号、根号/指数/三角、导数匹配；底部放一个失败检查。",
    "components": [
      {
        "label": "选择目标",
        "role": "opening",
        "marker": "red",
        "content": "标题“怎样选择 u”；写“让积分整体变简单”。",
        "speech": "这一页讲选 u。选 u 的目标不是把最漂亮的东西圈出来，而是让整个积分真的变简单。"
      },
      {
        "label": "复杂内层",
        "role": "strategy",
        "marker": "lime",
        "content": "写“括号、根号、指数、三角里面的表达式，常常是 u”。",
        "speech": "第一类信号是复杂内层。括号、根号、指数、三角函数里面的表达式，经常是候选的 u。"
      },
      {
        "label": "导数匹配",
        "role": "formula",
        "marker": "blue",
        "content": "写“选 u 后检查 du 是否在旁边”；举“u=3x^2+4, du=6x dx”。",
        "speech": "第二步一定要检查导数。比如 u 等于三 x 平方加四，du 正好是六 x dx，如果原式里有六 x dx，换元就非常自然。"
      },
      {
        "label": "差常数可以补",
        "role": "formula",
        "marker": "cyan",
        "content": "写“若 du=2z dz，而原式只有 z dz，则 z dz=du/2”。",
        "speech": "有时候导数只差一个常数，这完全可以处理。差常数时把常数补到积分外面，不要因此放弃换元。"
      },
      {
        "label": "失败检查",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“换完还剩 x？说明还没换干净”。",
        "speech": "最后的失败检查很重要。换元之后如果还剩原变量，说明还要继续改写，或者一开始选 u 就不合适。"
      }
    ]
  },
  {
    "title": "括号整体换元",
    "sceneTitle": "括号整体换元",
    "layout": "中间放完整计算链，左侧圈出内层，右侧写换回答案；底部强调幂函数积分。",
    "components": [
      {
        "label": "题目识别",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫ 6x(3x^2+4)^4 dx”；圈出“3x^2+4”。",
        "speech": "先看这道标准题。括号里的三 x 平方加四很复杂，外面又有六 x，这正好像它的导数。"
      },
      {
        "label": "选择 u",
        "role": "formula",
        "marker": "lime",
        "content": "写“令 u=3x^2+4”；“du=6x dx”。",
        "speech": "所以我们令 u 等于三 x 平方加四。求微分后得到 du 等于六 x dx，刚好能替换掉外面的因子。"
      },
      {
        "label": "完全改写",
        "role": "formula",
        "marker": "blue",
        "content": "写“∫ 6x(3x^2+4)^4 dx = ∫ u^4 du”。",
        "speech": "换元的关键是完全改写。括号变成 u，六 x dx 变成 du，原积分就变成 u 的四次方积分。"
      },
      {
        "label": "积分并换回",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫u^4du=u^5/5+C=(3x^2+4)^5/5+C”。",
        "speech": "现在只是幂函数积分，得到 u 的五次方除以五。最后把 u 换回三 x 平方加四，再加常数 C。"
      },
      {
        "label": "方法记忆",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“复杂括号 + 外面导数 = 直接换元”。",
        "speech": "这页留下的模式是：复杂括号加上外面的导数，通常就是最直接的换元法。"
      }
    ]
  },
  {
    "title": "差一个常数也能换",
    "sceneTitle": "差常数处理",
    "layout": "左侧题目和 u，右侧处理常数因子，底部用醒目但非纯色的提醒。",
    "components": [
      {
        "label": "题目结构",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫ z√(z^2-5) dz”；圈出根号内“z^2-5”。",
        "speech": "这题看根号里面。z 平方减五是明显内层，外面有 z dz，和它的导数只差一个常数。"
      },
      {
        "label": "设定 u",
        "role": "formula",
        "marker": "lime",
        "content": "写“u=z^2-5”；“du=2z dz”。",
        "speech": "令 u 等于 z 平方减五，du 就是二 z dz。原式只有 z dz，所以还差一个二。"
      },
      {
        "label": "补出常数",
        "role": "formula",
        "marker": "blue",
        "content": "写“z dz = du/2”；“∫ z√(z^2-5)dz = 1/2∫u^{1/2}du”。",
        "speech": "差一个常数没有关系，把 z dz 写成二分之一 du。这个二分之一要放在积分外面一直保留。"
      },
      {
        "label": "计算答案",
        "role": "formula",
        "marker": "cyan",
        "content": "写“1/2·(2/3)u^{3/2}=1/3(z^2-5)^{3/2}+C”。",
        "speech": "接下来积分 u 的二分之一次方，得到三分之一 u 的三分之二次方，最后换回 z 平方减五。"
      },
      {
        "label": "常数提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“差常数可以补；差变量不可以硬补”。",
        "speech": "底部这句话很实用：只差常数时可以补；如果差的是变量结构，就不能随便硬补。"
      }
    ]
  },
  {
    "title": "负号来自 du",
    "sceneTitle": "三角换元中的负号",
    "layout": "左侧写三角题，右上写 u=cos t，右中追踪负号，底部放符号检查。",
    "components": [
      {
        "label": "三角题入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫ sin t / cos^3 t dt”；圈出“cos t”。",
        "speech": "这道三角题先看分母。cos t 在分母里反复出现，而它的导数会给出负的 sin t。"
      },
      {
        "label": "选择 u",
        "role": "formula",
        "marker": "lime",
        "content": "写“令 u=cos t”；“du=-sin t dt”。",
        "speech": "令 u 等于 cos t，那么 du 等于负 sin t dt。这个负号是整页最容易丢的地方。"
      },
      {
        "label": "替换分子",
        "role": "formula",
        "marker": "blue",
        "content": "写“sin t dt = -du”；“cos^3 t = u^3”。",
        "speech": "因为 du 等于负 sin t dt，所以 sin t dt 要替换成负 du。分母 cos 的三次方则变成 u 的三次方。"
      },
      {
        "label": "积分链条",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫ sin t/cos^3t dt = -∫u^{-3}du = 1/(2u^2)+C”。",
        "speech": "换完以后得到负的 u 的负三次方积分。计算后是二 u 平方分之一，再把 u 换回 cos t。"
      },
      {
        "label": "符号检查",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“du 里有负号，答案里必须承接”。",
        "speech": "最后检查符号：du 里出现的负号，不能凭感觉消失。它必须在改写和积分过程中被承接。"
      }
    ]
  },
  {
    "title": "换完还剩变量怎么办",
    "sceneTitle": "剩余变量处理",
    "layout": "上方写题目，左侧显示错误停在半路，右侧显示 x=u+1 的完整改写，底部一句规则。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫ x/√(x-1) dx”；圈出“x-1”。",
        "speech": "这题故意展示一个常见问题。根号里面是 x 减一，所以选 u 很自然；但分子还有一个 x。"
      },
      {
        "label": "初步换元",
        "role": "formula",
        "marker": "lime",
        "content": "写“u=x-1”；“du=dx”；“√(x-1)=√u”。",
        "speech": "先令 u 等于 x 减一，那么 du 等于 dx，根号部分也能直接变成根号 u。"
      },
      {
        "label": "剩下的 x",
        "role": "mistake",
        "marker": "blue",
        "content": "写“还剩 x/√u”；旁边写“不能停在这里”。",
        "speech": "如果只换到这里，分子还剩 x，就说明变量世界混在一起了。不能写成 x 除以根号 u 继续积分。"
      },
      {
        "label": "把 x 也改写",
        "role": "formula",
        "marker": "cyan",
        "content": "写“x=u+1”；“∫(u+1)/√u du = ∫(u^{1/2}+u^{-1/2})du”。",
        "speech": "因为 u 等于 x 减一，所以 x 等于 u 加一。把分子也换掉后，整个积分才完全进入 u 世界。"
      },
      {
        "label": "核心规则",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“换元后不能同时出现 x 和 u”。",
        "speech": "这页的核心规则很短：换元后不要同时出现 x 和 u。只要混用变量，就回头继续改写。"
      }
    ]
  },
  {
    "title": "定积分换元：上下限也要换",
    "sceneTitle": "上下限一起换",
    "layout": "左边错误做法，右边正确做法，中间用变量世界箭头连接；底部规则用一句话收束。",
    "components": [
      {
        "label": "定积分入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫_0^6 2x dx”；旁边写“令 u=2x”。",
        "speech": "现在进入定积分。定积分换元最大的变化是：不只函数要换，上下限也要跟着变量一起换。"
      },
      {
        "label": "错误混用",
        "role": "mistake",
        "marker": "lime",
        "content": "写“1/2∫_0^6 u du = 9”；旁边标“上下限没换”。",
        "speech": "左侧是错误做法。被积函数已经换成 u，却仍然使用 x 的上下限零到六，这就是混用了两个变量世界。"
      },
      {
        "label": "换上下限",
        "role": "formula",
        "marker": "blue",
        "content": "写“x=0→u=0”；“x=6→u=12”。",
        "speech": "正确做法先把上下限代入 u 等于二 x。x 等于零时 u 等于零，x 等于六时 u 等于十二。"
      },
      {
        "label": "正确计算",
        "role": "formula",
        "marker": "cyan",
        "content": "写“1/2∫_0^{12}u du = 36”；和原式“∫_0^6 2x dx=36”对齐。",
        "speech": "把新上下限换好以后，积分从零到十二，结果就是三十六，和原来直接计算一致。"
      },
      {
        "label": "定积分规则",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“换变量，就换边界；换回 x，则保留原边界”。",
        "speech": "底部规则要分清：如果留在 u 世界，就换上下限；如果最后换回 x 再代入，就用原来的 x 上下限。"
      }
    ]
  },
  {
    "title": "指数定积分换元",
    "sceneTitle": "指数定积分",
    "layout": "上方写题目，左下写 u 和上下限，右侧写积分结果，底部检查答案量级。",
    "components": [
      {
        "label": "题目结构",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫_0^2 e^{x^2}·2x dx”；圈出“x^2”。",
        "speech": "这道题把不定积分和定积分的换元放在一起。指数里的 x 平方是内层，外面的二 x 正好是它的导数。"
      },
      {
        "label": "设定 u 和 du",
        "role": "formula",
        "marker": "lime",
        "content": "写“u=x^2”；“du=2x dx”。",
        "speech": "令 u 等于 x 平方，du 就等于二 x dx，所以被积函数能够完整改写成 e 的 u 次方。"
      },
      {
        "label": "更换上下限",
        "role": "formula",
        "marker": "blue",
        "content": "写“x=0→u=0”；“x=2→u=4”。",
        "speech": "因为这是定积分，我们马上更换上下限。下限零变成 u 等于零，上限二变成 u 等于四。"
      },
      {
        "label": "完成计算",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫_0^4 e^u du = e^4-1”。",
        "speech": "现在积分很直接，从零到四积分 e 的 u 次方，得到 e 的四次方减一。"
      },
      {
        "label": "检查点",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“定积分换元后，答案中不需要再换回 x”。",
        "speech": "最后检查一点：如果上下限已经换成 u 的上下限，算完就是数值，不需要再把 u 换回 x。"
      }
    ]
  },
  {
    "title": "指数里有系数的换元",
    "sceneTitle": "系数与上下限",
    "layout": "左侧题目，中央处理 du 的系数，右侧换上下限和结果，底部提醒常数因子。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫_0^1 x e^{4x^2+3} dx”；圈出“4x^2+3”。",
        "speech": "这题和上一题相似，但导数系数不完全一样。内层是四 x 平方加三，外面只有 x dx。"
      },
      {
        "label": "du 与常数",
        "role": "formula",
        "marker": "lime",
        "content": "写“u=4x^2+3”；“du=8x dx”；“x dx=du/8”。",
        "speech": "令 u 等于四 x 平方加三，那么 du 等于八 x dx。所以 x dx 只等于八分之一 du。"
      },
      {
        "label": "上下限变换",
        "role": "formula",
        "marker": "blue",
        "content": "写“x=0→u=3”；“x=1→u=7”。",
        "speech": "定积分还要换上下限。x 从零到一，对应 u 从三到七。"
      },
      {
        "label": "积分结果",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫_0^1 x e^{4x^2+3}dx = 1/8∫_3^7 e^u du = (e^7-e^3)/8”。",
        "speech": "完整改写后，常数八分之一留在外面，积分 e 的 u 次方，结果是八分之一乘 e 的七次方减 e 的三次方。"
      },
      {
        "label": "常数因子提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“du 的系数越早处理，后面越不乱”。",
        "speech": "这页提醒我们：du 的常数系数要一开始就处理清楚，否则后面很容易少乘或多乘。"
      }
    ]
  },
  {
    "title": "三角平方：先变形再换元",
    "sceneTitle": "三角平方积分",
    "layout": "左侧写 cos^2 恒等式，右侧处理 cos(2θ) 的换元，底部给最终值。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫_0^{π/2} cos^2θ dθ”；旁边写“先降幂”。",
        "speech": "这题不能直接用最基本的换元就结束，因为 cos 平方需要先用三角恒等式降幂。"
      },
      {
        "label": "降幂公式",
        "role": "formula",
        "marker": "lime",
        "content": "写“cos^2θ=(1+cos2θ)/2”。",
        "speech": "左侧是关键恒等式。把 cos 平方写成二分之一乘一加 cos 二 theta，积分就被拆开了。"
      },
      {
        "label": "常数部分",
        "role": "formula",
        "marker": "blue",
        "content": "写“1/2∫_0^{π/2}1 dθ = π/4”。",
        "speech": "第一部分是常数积分，二分之一乘区间长度 π/2，得到 π/4。"
      },
      {
        "label": "震荡部分",
        "role": "formula",
        "marker": "cyan",
        "content": "写“1/2∫_0^{π/2}cos2θ dθ”；令“u=2θ”，结果为 0。",
        "speech": "第二部分可以令 u 等于二 theta，也可以直接积分。由于 sine 在上下限对应值相同，这一部分结果为零。"
      },
      {
        "label": "最终结果",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“∫_0^{π/2}cos^2θ dθ = π/4”。",
        "speech": "所以最终结果是 π/4。这页也提醒我们：有些换元题要先做代数或三角变形。"
      }
    ]
  },
  {
    "title": "函数缩放中的换元",
    "sceneTitle": "函数缩放换元",
    "layout": "左侧画 f(x) 的面积，右侧画 f(2x) 被压缩，中间写 u=2x；底部给结论。",
    "components": [
      {
        "label": "已知面积",
        "role": "opening",
        "marker": "red",
        "content": "写“若 ∫_0^6 f(x)dx=8，求 ∫_0^3 f(2x)dx”。",
        "speech": "这页处理抽象函数。题目不给 f 的公式，只告诉我们零到六的面积是八，要计算 f(2x) 在零到三上的积分。"
      },
      {
        "label": "图像压缩直觉",
        "role": "visual",
        "marker": "lime",
        "content": "画 f(x) 与 f(2x) 的横向压缩示意，写“横向压缩一半”。",
        "speech": "从图像上看，f(2x) 把横向尺度压缩了一半。所以在 x 从零到三时，内层二 x 正好扫过零到六。"
      },
      {
        "label": "换元关系",
        "role": "formula",
        "marker": "blue",
        "content": "写“u=2x”；“du=2dx”；“dx=du/2”。",
        "speech": "令 u 等于二 x，那么 dx 等于二分之一 du。这个二分之一会让面积也缩成一半。"
      },
      {
        "label": "上下限对应",
        "role": "formula",
        "marker": "cyan",
        "content": "写“x=0→u=0”；“x=3→u=6”；“∫_0^3 f(2x)dx=1/2∫_0^6 f(u)du”。",
        "speech": "上下限换成 u 后正好是零到六。因此原积分等于二分之一乘已知的那个面积。"
      },
      {
        "label": "结论",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“答案 = 1/2·8 = 4”。",
        "speech": "最后答案是四。这个例子说明，换元也能处理没有具体公式的函数积分。"
      }
    ]
  },
  {
    "title": "sin 与 cos 的对称积分",
    "sceneTitle": "对称换元",
    "layout": "上方写等式目标，中间画四分之一圆或区间反射，右侧写 u=π/2-x，底部收束。",
    "components": [
      {
        "label": "目标等式",
        "role": "opening",
        "marker": "red",
        "content": "写“证明 ∫_0^{π/2} f(cos x)dx = ∫_0^{π/2} f(sin x)dx”。",
        "speech": "这一页是一个漂亮的对称结论。虽然 f 是任意连续函数，但 sin 和 cos 在零到 π/2 上可以互相转换。"
      },
      {
        "label": "区间反射",
        "role": "visual",
        "marker": "lime",
        "content": "画区间 [0,π/2] 反射示意，写“x ↔ π/2-x”。",
        "speech": "左侧先看几何直觉。在这个区间里，把 x 换成 π/2 减 x，就会把靠近左端和右端的位置互相交换。"
      },
      {
        "label": "代换选择",
        "role": "formula",
        "marker": "blue",
        "content": "写“u=π/2-x”；“dx=-du”。",
        "speech": "代数上令 u 等于 π/2 减 x。于是 dx 等于负 du，上下限也会反向。"
      },
      {
        "label": "函数转换",
        "role": "formula",
        "marker": "cyan",
        "content": "写“cos x = sin(π/2-x)=sin u”；并把上下限反转回来。",
        "speech": "关键一步是 cos x 等于 sin u。虽然 dx 带负号，但上下限反过来以后，负号会被抵消。"
      },
      {
        "label": "对称结论",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“同一段区间上，cos 的扫描和 sin 的扫描等价”。",
        "speech": "所以两个积分相等。这个例子展示换元不仅能算数值，也能证明结构性的积分恒等式。"
      }
    ]
  },
  {
    "title": "幂次混合：剩余变量也能改写",
    "sceneTitle": "混合幂次练习",
    "layout": "左侧题目，中间把 x^3 拆成 x^2·x，右侧用 u-1 改写，底部做方法归纳。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫ x^3√(x^2+1) dx”；圈出“x^2+1”。",
        "speech": "这道练习看上去外面有 x 的三次方，但内层 x 平方加一仍然很明显。关键是把 x 的三次方拆开。"
      },
      {
        "label": "拆开因子",
        "role": "strategy",
        "marker": "lime",
        "content": "写“x^3 dx = x^2·x dx”；准备让“x dx”进入 du。",
        "speech": "先把 x 三次方写成 x 平方乘 x。这样 x dx 可以和 du 对上，剩下的 x 平方再用 u 表示。"
      },
      {
        "label": "设定 u",
        "role": "formula",
        "marker": "blue",
        "content": "写“u=x^2+1”；“du=2x dx”；“x dx=du/2”。",
        "speech": "令 u 等于 x 平方加一，du 等于二 x dx，所以 x dx 等于二分之一 du。"
      },
      {
        "label": "改写剩余 x^2",
        "role": "formula",
        "marker": "cyan",
        "content": "写“x^2=u-1”；“1/2∫(u-1)u^{1/2}du”。",
        "speech": "剩下的 x 平方不能留着。由 u 等于 x 平方加一可知 x 平方等于 u 减一，原积分就完全改成 u 的式子。"
      },
      {
        "label": "方法归纳",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“拆因子 → 配 du → 剩余变量用 u 改写”。",
        "speech": "这页的方法是通用的：先拆因子配出 du，再把剩余变量用 u 的关系改写。"
      }
    ]
  },
  {
    "title": "做题流程：先判断再计算",
    "sceneTitle": "换元流程",
    "layout": "中心放流程图，四周放典型判断：内层、导数、上下限、换回；底部放错误排查。",
    "components": [
      {
        "label": "流程入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“换元流程”；中心写“不是每题都先算，先判断结构”。",
        "speech": "这一页把前面的例题整理成流程。换元法做得稳，靠的不是盲算，而是先判断结构。"
      },
      {
        "label": "第一步识别内层",
        "role": "strategy",
        "marker": "lime",
        "content": "写“找复杂内层：括号、根号、指数、三角里面”。",
        "speech": "第一步找复杂内层。只要看到括号、根号、指数或三角函数里面有较复杂表达式，就把它当候选。"
      },
      {
        "label": "第二步检查 du",
        "role": "formula",
        "marker": "blue",
        "content": "写“算 du；检查是否只差常数”。",
        "speech": "第二步算 du。要看原积分里有没有对应因子；如果只差常数，可以把常数补出来。"
      },
      {
        "label": "第三步处理边界",
        "role": "formula",
        "marker": "cyan",
        "content": "写“不定积分：最后换回；定积分：上下限一起换”。",
        "speech": "第三步区分不定积分和定积分。不定积分通常最后换回；定积分如果换上下限，算完就直接得到数值。"
      },
      {
        "label": "错误排查",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部 checklist：“还剩 x？漏常数？上下限混用？负号丢了？”",
        "speech": "最后用底部清单排错：是否还剩原变量，是否漏了常数，是否上下限混用，负号有没有丢。"
      }
    ]
  },
  {
    "title": "综合练习：选择合适的 u",
    "sceneTitle": "综合练习",
    "layout": "三道小题错落摆放，不做成僵硬表格；中间写选择理由，底部写练习顺序。",
    "components": [
      {
        "label": "练习入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“综合练习”；写“每题先说为什么选 u”。",
        "speech": "综合练习的重点不是答案，而是每题先说清楚为什么这样选 u。"
      },
      {
        "label": "练习一",
        "role": "formula",
        "marker": "lime",
        "content": "写“∫ 3x^2(x^3-3)^5 dx”；提示“u=x^3-3”。",
        "speech": "第一题是标准括号型。内层 x 三次方减三的导数是三 x 平方，正好在外面。"
      },
      {
        "label": "练习二",
        "role": "formula",
        "marker": "blue",
        "content": "写“∫ sec^2x · e^{tan x} dx”；提示“u=tan x”。",
        "speech": "第二题利用三角导数。tan x 的导数是 sec 平方 x，所以指数里的 tan x 是自然的选择。"
      },
      {
        "label": "练习三",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫_1^3 x/(x^2+1) dx”；提示“u=x^2+1，换上下限”。",
        "speech": "第三题是定积分。选 u 等于 x 平方加一后，还要把 x 的上下限一和三变成 u 的上下限二和十。"
      },
      {
        "label": "练习顺序",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“先选 u；再写 du；最后才算积分”。",
        "speech": "底部顺序请固定下来：先选 u，再写 du，确认换干净以后，最后才开始积分计算。"
      }
    ]
  },
  {
    "title": "总结：换元法的三句话",
    "sceneTitle": "总结",
    "layout": "中心写“换元法”，周围三句话：结构、计算、边界；底部 checklist。",
    "components": [
      {
        "label": "总结入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“换元法的三句话”；中心写“换元法”。",
        "speech": "最后一页把这本笔记收束成三句话。只要这三句话清楚，换元法的大多数题就不会乱。"
      },
      {
        "label": "结构一句话",
        "role": "strategy",
        "marker": "lime",
        "content": "写“看见复合函数，就找内层和内层导数”。",
        "speech": "第一句话是结构判断：看到复合函数，就找内层和内层导数。它决定这题是否适合换元。"
      },
      {
        "label": "计算一句话",
        "role": "formula",
        "marker": "blue",
        "content": "写“u=g(x)，du=g′(x)dx，换到只剩 u 和 du”。",
        "speech": "第二句话是计算动作：写出 u 和 du，然后把积分改到只剩 u 和 du。"
      },
      {
        "label": "边界一句话",
        "role": "formula",
        "marker": "cyan",
        "content": "写“定积分换元时，上下限也要进入 u 世界”。",
        "speech": "第三句话是定积分边界：如果变量换成 u，上下限也要进入 u 世界，不能和 x 的边界混用。"
      },
      {
        "label": "最终清单",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部 checklist：“选得合理；换得干净；常数符号；边界一致”。",
        "speech": "最后用这四项检查答案：u 选得是否合理，变量是否换干净，常数和符号有没有丢，上下限是否一致。"
      }
    ]
  }
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

Generate page ${pageNumber} of a Chinese calculus substitution-method notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: f(x), g(x), u, du, dx, e^u, sin, cos, tan, sec, θ, π, √, F(x), Σ, ∫, lim.

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
    writeJson(path.join(planDir, `page-${label}.prompt-plan.json`), buildPromptPlan(page, pageNumber, prompt));
  }
  writeJson(path.join(QUEUE_DIR, 'v2-outline.json'), {
    notebookId: NOTEBOOK_ID,
    title: '换元法：从反向链式法则到定积分换元',
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

function latestGeneratedImage() {
  const files = fs
    .readdirSync(GENERATED_IMAGE_ROOT)
    .filter((file) => file.endsWith('.png'))
    .map((file) => path.join(GENERATED_IMAGE_ROOT, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
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
    for (let y = Math.max(0, y1 - samplePad); y <= Math.min(raw.height - 1, y2 + samplePad); y += 1) {
      for (let x = Math.max(0, x1 - samplePad); x <= Math.min(raw.width - 1, x2 + samplePad); x += 1) {
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
  await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 3 } }).png().toFile(outPath);
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
  await sharp(markerInput).resize(SOURCE_WIDTH, SOURCE_HEIGHT, { fit: 'fill' }).png().toFile(markerPublic);
  const raw = await decodeRaw(markerPublic);
  const findings = [];
  const recoveredComponents = [];
  const allMarkerComponents = [];
  for (const component of promptPlan.componentPlans) {
    const marker = markerFor(component.markerColorName);
    const components = componentsForColor(raw, marker);
    allMarkerComponents.push(...components);
    const hits = selectCornerHits(components);
    const sourceBbox = hits.length === 4 ? bboxFromComponents(hits.map((hit) => hit.component)) : undefined;
    if (components.length !== 4) {
      findings.push(`${component.label}: expected 4 ${marker.name} markers, recovered ${components.length}`);
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

function actionsForPage(page, pageNumber, focusRegions) {
  const focusByMarker = new Map();
  for (const region of focusRegions) {
    const markerName = region.id.split('-').at(-1);
    focusByMarker.set(markerName, region);
  }
  const actions = [];
  for (const component of page.components) {
    const region = focusByMarker.get(component.marker);
    if (!region) continue;
    const actionBase = `${NOTEBOOK_ID}-p${pageLabel(pageNumber)}-${component.marker}`;
    actions.push({
      id: `${actionBase}-spotlight`,
      type: 'spotlight',
      elementId: region.id,
      title: component.label,
      description: `聚焦“${component.label}”区域。`,
      dimOpacity: 0.68,
    });
    actions.push({
      id: `${actionBase}-speech`,
      type: 'speech',
      title: component.label,
      text: component.speech,
    });
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
    const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
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
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
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
      const promptPlan = readJson(path.join(QUEUE_DIR, 'v2-prompt-plans', `page-${label}.prompt-plan.json`));
      const focusRegions = focusRegionsFromPlan(promptPlan);
      if (promptPlan.recoveryResult?.status !== 'passed') {
        throw new Error(`Page ${pageNumber} recovery is not passed`);
      }
      if (focusRegions.length !== page.components.length) {
        throw new Error(`Page ${pageNumber} focus count mismatch: ${focusRegions.length}/${page.components.length}`);
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
          name: '换元法：从反向链式法则到定积分换元',
          description: '第二本中文手绘图片笔记本：换元法、反向链式法则、不定积分与定积分换元。',
          tags: ['MAT136', '换元法', '反向链式法则', '定积分换元', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '换元法：从反向链式法则到定积分换元',
          description: '第二本中文手绘图片笔记本：换元法、反向链式法则、不定积分与定积分换元。',
          tags: ['MAT136', '换元法', '反向链式法则', '定积分换元', '中文笔记', '四角marker'],
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
