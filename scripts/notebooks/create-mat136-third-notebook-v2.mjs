#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'create-mat136-third-notebook-v2.mjs';
const NOTEBOOK_ID = 'queue-mat136-03-inverse-substitution';
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
    "title": "逆换元法：让根号变简单",
    "sceneTitle": "逆换元法入口",
    "layout": "自然课堂笔记布局：上方标题和核心问题，左侧对比普通换元，右侧画根号形状，底部给本节路线。",
    "components": [
      {
        "label": "本节问题",
        "role": "opening",
        "marker": "red",
        "content": "标题“逆换元法：让根号变简单”；写“普通换元卡住时怎么办？”",
        "speech": "先看这一页的核心问题。普通换元通常找内层和内层导数，但遇到根号里有平方差、平方和时，直接找内层往往会卡住。"
      },
      {
        "label": "普通换元会卡住",
        "role": "setup",
        "marker": "lime",
        "content": "画“u=根号里面”后外面没有合适 du 的示意，写“导数不配套”。",
        "speech": "左侧说明为什么会卡住。如果令 u 等于根号里面，du 通常会带出 x dx，但原式不一定有这个因子，于是换不干净。"
      },
      {
        "label": "根号形状",
        "role": "visual",
        "marker": "blue",
        "content": "写“√(a^2-x^2)、√(a^2+x^2)、√(x^2-a^2)”三种形状。",
        "speech": "右上先把三种常见根号形状放出来。逆换元法的第一步，就是认清根号里到底是哪一种平方关系。"
      },
      {
        "label": "三角恒等式救场",
        "role": "strategy",
        "marker": "cyan",
        "content": "写“1-sin^2θ=cos^2θ；1+tan^2θ=sec^2θ；sec^2θ-1=tan^2θ”。",
        "speech": "中间这三条恒等式就是工具箱。选对三角函数以后，根号里面会变成一个平方，从而把根号拿掉。"
      },
      {
        "label": "学习路线",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部路线：“认形状 → 选代换 → 改 dx → 积分 → 用三角形换回”。",
        "speech": "底部是整本笔记路线：先认形状，再选代换，接着改写 dx，积分完成后用三角形把答案换回 x。"
      }
    ]
  },
  {
    "title": "三角工具箱：平方恒等式",
    "sceneTitle": "三角恒等式工具箱",
    "layout": "三条恒等式像工具卡片一样错落摆放，每条都配一个根号形状；底部提示不是背公式而是配形状。",
    "components": [
      {
        "label": "工具箱入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“三角工具箱”；写“目标：把根号里的平方变成完全平方”。",
        "speech": "这一页先准备工具。逆换元法不是凭空选 sin 或 tan，而是让根号里的表达式借助恒等式变成完全平方。"
      },
      {
        "label": "sin 与 cos",
        "role": "formula",
        "marker": "lime",
        "content": "写“sin^2θ+cos^2θ=1”；推出“1-sin^2θ=cos^2θ”。",
        "speech": "第一条来自基本平方关系。它能处理一减某个平方的形状，所以会对应 a 平方减 x 平方。"
      },
      {
        "label": "tan 与 sec",
        "role": "formula",
        "marker": "blue",
        "content": "写“1+tan^2θ=sec^2θ”；旁边放“a^2+x^2”。",
        "speech": "第二条是一加 tan 平方等于 sec 平方。它天然适合处理平方和，也就是 a 平方加 x 平方。"
      },
      {
        "label": "sec 与 tan",
        "role": "formula",
        "marker": "cyan",
        "content": "写“sec^2θ-1=tan^2θ”；旁边放“x^2-a^2”。",
        "speech": "第三条把 sec 平方减一变成 tan 平方，所以适合处理 x 平方减 a 平方。"
      },
      {
        "label": "配形状提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“先配根号形状，再选三角代换”。",
        "speech": "底部这句话是方法核心。不要先背表，先看根号形状，再让它配到对应的三角恒等式。"
      }
    ]
  },
  {
    "title": "三种根号对应三种代换",
    "sceneTitle": "代换字典",
    "layout": "中心写三种根号形状，周围用箭头连到 x=a sinθ、x=a tanθ、x=a secθ；底部写选择理由。",
    "components": [
      {
        "label": "字典入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“三种根号对应三种代换”；写“根号形状决定代换”。",
        "speech": "这一页把上一页的恒等式变成代换字典。根号形状一旦识别出来，代换基本也就确定了。"
      },
      {
        "label": "平方差一",
        "role": "formula",
        "marker": "lime",
        "content": "写“√(a^2-x^2) → x=a sinθ”；旁边写“a^2(1-sin^2θ)”。",
        "speech": "第一种是 a 平方减 x 平方。令 x 等于 a sin theta 后，根号里会出现一减 sin 平方，也就是 cos 平方。"
      },
      {
        "label": "平方和",
        "role": "formula",
        "marker": "blue",
        "content": "写“√(a^2+x^2) → x=a tanθ”；旁边写“a^2(1+tan^2θ)”。",
        "speech": "第二种是平方和。令 x 等于 a tan theta 后，根号里变成一加 tan 平方，也就是 sec 平方。"
      },
      {
        "label": "平方差二",
        "role": "formula",
        "marker": "cyan",
        "content": "写“√(x^2-a^2) → x=a secθ”；旁边写“a^2(sec^2θ-1)”。",
        "speech": "第三种是 x 平方减 a 平方。令 x 等于 a sec theta，根号里就变成 sec 平方减一，也就是 tan 平方。"
      },
      {
        "label": "选择理由",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“选代换的目的：让根号变成 a·三角函数”。",
        "speech": "底部总结目的：我们不是为了让式子变复杂，而是为了把根号化成 a 乘一个普通三角函数。"
      }
    ]
  },
  {
    "title": "代换后 dx 也要改",
    "sceneTitle": "dx 的改写",
    "layout": "左侧写三种 x 的代换，右侧对应 dx，底部提醒不要只换根号。",
    "components": [
      {
        "label": "dx 入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“代换后 dx 也要改”；写“x 变成 θ，dx 也要变成 dθ”。",
        "speech": "这一页强调一个容易漏掉的步骤。只把 x 代进根号还不够，dx 也必须跟着改成关于 theta 的微分。"
      },
      {
        "label": "sin 代换",
        "role": "formula",
        "marker": "lime",
        "content": "写“x=a sinθ”；“dx=a cosθ dθ”。",
        "speech": "如果 x 等于 a sin theta，那么 dx 就是 a cos theta d theta。这个 cos 往往会和根号化简后的 cos 配合。"
      },
      {
        "label": "tan 代换",
        "role": "formula",
        "marker": "blue",
        "content": "写“x=a tanθ”；“dx=a sec^2θ dθ”。",
        "speech": "如果 x 等于 a tan theta，那么 dx 是 a sec 平方 theta d theta。这里的 sec 平方来自 tan 的导数。"
      },
      {
        "label": "sec 代换",
        "role": "formula",
        "marker": "cyan",
        "content": "写“x=a secθ”；“dx=a secθ tanθ dθ”。",
        "speech": "如果 x 等于 a sec theta，那么 dx 是 a sec theta tan theta d theta。这个形式在 x 平方减 a 平方的题里很常见。"
      },
      {
        "label": "完整替换提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“根号、x、dx 都要进入 θ 世界”。",
        "speech": "底部提醒很直接：根号、原来的 x、还有 dx，都要进入 theta 世界，不能只替换其中一部分。"
      }
    ]
  },
  {
    "title": "用三角形把 θ 换回 x",
    "sceneTitle": "三角形换回",
    "layout": "左侧画直角三角形，右侧写 sin/cos/tan/sec 对应边，底部强调最终答案通常要回到 x。",
    "components": [
      {
        "label": "换回入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“用三角形把 θ 换回 x”；写“答案不能停在 θ”。",
        "speech": "逆换元法最后还要换回 x。最稳定的方法是根据代换画一个直角三角形，再从边长读出三角函数。"
      },
      {
        "label": "sin 三角形",
        "role": "visual",
        "marker": "lime",
        "content": "画三角形：sinθ=x/a；边标“对边 x，斜边 a，邻边 √(a^2-x^2)”。",
        "speech": "如果 x 等于 a sin theta，那么 sin theta 是 x 除以 a。三角形里对边是 x，斜边是 a，邻边就是根号 a 平方减 x 平方。"
      },
      {
        "label": "tan 三角形",
        "role": "visual",
        "marker": "blue",
        "content": "画三角形：tanθ=x/a；边标“对边 x，邻边 a，斜边 √(a^2+x^2)”。",
        "speech": "如果 x 等于 a tan theta，那么 tan theta 是 x 除以 a。对边是 x，邻边是 a，斜边就是根号 a 平方加 x 平方。"
      },
      {
        "label": "sec 三角形",
        "role": "visual",
        "marker": "cyan",
        "content": "画三角形：secθ=x/a；边标“斜边 x，邻边 a，对边 √(x^2-a^2)”。",
        "speech": "如果 x 等于 a sec theta，那么 sec theta 是 x 除以 a。斜边是 x，邻边是 a，对边就是根号 x 平方减 a 平方。"
      },
      {
        "label": "换回检查",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“最终答案：θ 用反三角或三角形换回 x”。",
        "speech": "底部是最终检查。答案里如果还有 theta，就要用反三角函数或者三角形关系把它换回 x。"
      }
    ]
  },
  {
    "title": "基础例题：√(a²-x²)",
    "sceneTitle": "半圆面积型例题",
    "layout": "上方写题目，左侧代换，右侧根号化简，底部进入 cos² 积分。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫√(a^2-x^2) dx”；旁边画半圆面积阴影。",
        "speech": "这道基础例题对应半圆面积型根号。根号是 a 平方减 x 平方，所以第一反应是用 sin 代换。"
      },
      {
        "label": "选择代换",
        "role": "formula",
        "marker": "lime",
        "content": "写“x=a sinθ”；“dx=a cosθ dθ”。",
        "speech": "令 x 等于 a sin theta，dx 就等于 a cos theta d theta。这样根号里面会出现一减 sin 平方。"
      },
      {
        "label": "根号化简",
        "role": "formula",
        "marker": "blue",
        "content": "写“√(a^2-a^2sin^2θ)=a cosθ”。",
        "speech": "根号化简是关键：a 平方提出来以后，剩下的是一减 sin 平方，也就是 cos 平方，所以根号变成 a cos theta。"
      },
      {
        "label": "积分变形",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫√(a^2-x^2)dx = a^2∫cos^2θ dθ”。",
        "speech": "根号给出一个 a cos theta，dx 又给出一个 a cos theta，所以整个积分变成 a 平方乘 cos 平方 theta 的积分。"
      },
      {
        "label": "下一步提示",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“接下来用半角公式处理 cos²θ”。",
        "speech": "底部提示下一步：cos 平方不能直接当作普通 cos 积分，要用半角公式继续处理。"
      }
    ]
  },
  {
    "title": "cos² 的半角积分",
    "sceneTitle": "半角公式收尾",
    "layout": "左侧写半角公式，中间积分，右侧换回 θ 与 x，底部给结果结构。",
    "components": [
      {
        "label": "半角入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“cos² 的半角积分”；写“从 a²∫cos²θ dθ 接着算”。",
        "speech": "这一页接上一页，把 a 平方乘 cos 平方 theta 的积分继续算完。核心工具是半角公式。"
      },
      {
        "label": "半角公式",
        "role": "formula",
        "marker": "lime",
        "content": "写“cos²θ=(1+cos2θ)/2”。",
        "speech": "左侧半角公式把 cos 平方变成一加 cos 二 theta 的一半，这样就能直接积分。"
      },
      {
        "label": "积分结果",
        "role": "formula",
        "marker": "blue",
        "content": "写“∫cos²θdθ = θ/2 + sin2θ/4 + C”。",
        "speech": "积分以后得到 theta 的二分之一，加上 sin 二 theta 的四分之一，再加常数。也可以写成二分之一乘 theta 加 sin theta cos theta。"
      },
      {
        "label": "换回 x",
        "role": "formula",
        "marker": "cyan",
        "content": "写“θ=arcsin(x/a)”；“sinθ=x/a，cosθ=√(a^2-x^2)/a”。",
        "speech": "现在把 theta 换回 x。theta 是 arcsin x 除以 a，sin theta 和 cos theta 可以从三角形里读出来。"
      },
      {
        "label": "结果结构",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“答案含：根号项 + 反三角项”。",
        "speech": "这类题的结果常常有两部分：一个根号代数项，加上一个反三角函数项。"
      }
    ]
  },
  {
    "title": "例题：分母是 √(4-x²)",
    "sceneTitle": "sin 代换例题",
    "layout": "上方写题目，左侧选择 x=2sinθ，中间化简，右侧上下限，底部结果。",
    "components": [
      {
        "label": "题目识别",
        "role": "opening",
        "marker": "red",
        "content": "写“计算 ∫ x^2/√(4-x^2) dx”；圈出“4-x^2”。",
        "speech": "这题分母是根号四减 x 平方，也就是 a 平方减 x 平方的形状，其中 a 等于二。"
      },
      {
        "label": "选择代换",
        "role": "formula",
        "marker": "lime",
        "content": "写“x=2sinθ”；“dx=2cosθ dθ”。",
        "speech": "所以令 x 等于二 sin theta。对应的 dx 是二 cos theta d theta。"
      },
      {
        "label": "根号消掉",
        "role": "formula",
        "marker": "blue",
        "content": "写“√(4-4sin²θ)=2cosθ”；原式变成“4∫sin²θ dθ”。",
        "speech": "根号变成二 cos theta，正好和 dx 中的二 cos theta 抵消分母，于是积分变成四倍 sin 平方 theta 的积分。"
      },
      {
        "label": "上下限转换",
        "role": "formula",
        "marker": "cyan",
        "content": "写“若 x=0→θ=0；x=1→θ=π/6”；提醒按题目边界转换。",
        "speech": "如果题目带上下限，就要把 x 的边界换成 theta 的边界。例如 x 从零到一时，theta 从零到 π/6。"
      },
      {
        "label": "计算提示",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“sin²θ 用半角公式继续积分”。",
        "speech": "最后的计算交给半角公式。sin 平方 theta 要写成一减 cos 二 theta 的一半。"
      }
    ]
  },
  {
    "title": "定积分中的 θ 上下限",
    "sceneTitle": "三角代换上下限",
    "layout": "左侧 x 轴区间，右侧 θ 区间，中间写 arcsin/arctan/arcsec 的对应；底部规则。",
    "components": [
      {
        "label": "边界入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“定积分中的 θ 上下限”；写“变量变了，边界也变”。",
        "speech": "逆换元如果出现在定积分里，也要处理上下限。只不过这次新变量通常是 theta。"
      },
      {
        "label": "sin 边界",
        "role": "formula",
        "marker": "lime",
        "content": "写“x=a sinθ ⇒ θ=arcsin(x/a)”。",
        "speech": "sin 代换时，边界要通过 theta 等于 arcsin x 除以 a 来换。这样积分可以直接在 theta 世界完成。"
      },
      {
        "label": "tan 边界",
        "role": "formula",
        "marker": "blue",
        "content": "写“x=a tanθ ⇒ θ=arctan(x/a)”。",
        "speech": "tan 代换时，theta 等于 arctan x 除以 a。这个对应关系来自代换本身。"
      },
      {
        "label": "sec 边界",
        "role": "formula",
        "marker": "cyan",
        "content": "写“x=a secθ ⇒ secθ=x/a”；用三角形或反 sec 读 θ。",
        "speech": "sec 代换的边界有时用反 sec，有时直接用三角形读角度。关键是保持同一个 theta 区间。"
      },
      {
        "label": "边界规则",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“若保留 θ 积分，就把上下限换成 θ”。",
        "speech": "底部规则是：如果你不换回 x，而是直接在 theta 上积分，那么上下限必须也换成 theta。"
      }
    ]
  },
  {
    "title": "平方和：x=a tanθ",
    "sceneTitle": "tan 代换",
    "layout": "左侧根号形状，中央代换，右侧化简到 sec，底部提醒 sec³ 可先停在三角积分。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“化简 ∫ x^2/√(x^2+16) dx”；圈出“x^2+16”。",
        "speech": "这题根号里是 x 平方加十六，也就是 x 平方加 a 平方，其中 a 等于四。"
      },
      {
        "label": "选择 tan",
        "role": "formula",
        "marker": "lime",
        "content": "写“x=4tanθ”；“dx=4sec²θ dθ”。",
        "speech": "平方和对应 tan 代换。令 x 等于四 tan theta，dx 就是四 sec 平方 theta d theta。"
      },
      {
        "label": "根号化简",
        "role": "formula",
        "marker": "blue",
        "content": "写“√(16tan²θ+16)=4secθ”。",
        "speech": "根号里提出十六，剩下 tan 平方加一，也就是 sec 平方，所以根号化成四 sec theta。"
      },
      {
        "label": "三角积分",
        "role": "formula",
        "marker": "cyan",
        "content": "写“原式 =16∫(sec³θ-secθ)dθ”。",
        "speech": "代入并整理以后，会出现 sec 三次方减 sec 的积分。这说明代换已经完成，后面是三角积分技巧。"
      },
      {
        "label": "范围提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“本页重点是化简到 θ 积分，不急着算 sec³”。",
        "speech": "这页重点是把根号化掉并化简到 theta 积分。sec 三次方的完整积分可以作为后续技巧处理。"
      }
    ]
  },
  {
    "title": "平方差：x=a secθ",
    "sceneTitle": "sec 代换",
    "layout": "左侧写根号 x²-a²，中央代换和 dx，右侧三角形，底部选择条件。",
    "components": [
      {
        "label": "形状入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“平方差：x=a secθ”；写“处理 √(x^2-a^2)”。",
        "speech": "这一页处理第三种根号形状：x 平方减 a 平方。因为 x 在前面，所以通常用 sec 代换。"
      },
      {
        "label": "选择 sec",
        "role": "formula",
        "marker": "lime",
        "content": "写“x=a secθ”；“dx=a secθ tanθ dθ”。",
        "speech": "令 x 等于 a sec theta，dx 就带出 a sec theta tan theta d theta。"
      },
      {
        "label": "根号变 tan",
        "role": "formula",
        "marker": "blue",
        "content": "写“√(a²sec²θ-a²)=a tanθ”。",
        "speech": "根号里提出 a 平方后，剩下 sec 平方 theta 减一，也就是 tan 平方 theta，所以根号变成 a tan theta。"
      },
      {
        "label": "回代三角形",
        "role": "visual",
        "marker": "cyan",
        "content": "画三角形：邻边 a，斜边 x，对边 √(x²-a²)。",
        "speech": "回代时用三角形最清楚。邻边是 a，斜边是 x，对边就是根号 x 平方减 a 平方。"
      },
      {
        "label": "适用提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“x²-a² 且 |x|≥a 时，sec 代换最自然”。",
        "speech": "底部提醒适用条件：这类根号通常要求 x 的绝对值至少是 a，sec 代换才和三角形关系自然对上。"
      }
    ]
  },
  {
    "title": "sec 代换例题：识别 9x²-1",
    "sceneTitle": "sec 代换例题",
    "layout": "上方写题目结构，左侧设 3x=secθ，中间化简根号和 dx，右侧整理成三角积分。",
    "components": [
      {
        "label": "题目结构",
        "role": "opening",
        "marker": "red",
        "content": "写“根号 √(9x^2-1)”；提示“把 9x² 看成 (3x)²”。",
        "speech": "这道题的关键是识别九 x 平方减一。它其实是三 x 的平方减一，所以可以把三 x 当作 sec theta。"
      },
      {
        "label": "设定代换",
        "role": "formula",
        "marker": "lime",
        "content": "写“3x=secθ”；“x=secθ/3”。",
        "speech": "令三 x 等于 sec theta，也就是 x 等于三分之一 sec theta。这样根号的结构会变成 sec 平方减一。"
      },
      {
        "label": "dx 改写",
        "role": "formula",
        "marker": "blue",
        "content": "写“dx=(1/3)secθtanθ dθ”。",
        "speech": "求微分时要记住三分之一常数。dx 等于三分之一 sec theta tan theta d theta。"
      },
      {
        "label": "根号化简",
        "role": "formula",
        "marker": "cyan",
        "content": "写“√(9x²-1)=√(sec²θ-1)=tanθ”。",
        "speech": "根号化简以后就是 tan theta。这样原来复杂的根号结构就变成普通三角函数。"
      },
      {
        "label": "整理提示",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“代入后先约分，再决定是否用降幂公式”。",
        "speech": "最后的整理要慢一点：先把 sec 和 tan 的幂次约分清楚，再判断是否需要降幂公式继续算。"
      }
    ]
  },
  {
    "title": "先配方再逆换元",
    "sceneTitle": "配方后再代换",
    "layout": "左侧写 √(5+4x-x²)，中间完成平方，右侧识别 a²-(x-h)²，底部给代换选择。",
    "components": [
      {
        "label": "题目入口",
        "role": "opening",
        "marker": "red",
        "content": "写“处理 √(5+4x-x^2)”；提醒“先看能否配方”。",
        "speech": "有些根号不是一眼就是 a 平方减 x 平方。遇到二次式时，先考虑配方，把它整理成标准形状。"
      },
      {
        "label": "完成平方",
        "role": "formula",
        "marker": "lime",
        "content": "写“5+4x-x² = 9-(x-2)²”。",
        "speech": "把五加四 x 减 x 平方完成平方，可以写成九减 x 减二的平方。这样形状就清楚了。"
      },
      {
        "label": "识别形状",
        "role": "formula",
        "marker": "blue",
        "content": "写“√(9-(x-2)²)”；标出“a=3，内层=x-2”。",
        "speech": "现在它是 a 平方减某个平方的形状，其中 a 等于三，平方项是 x 减二。"
      },
      {
        "label": "选择代换",
        "role": "formula",
        "marker": "cyan",
        "content": "写“x-2=3sinθ”；“dx=3cosθ dθ”。",
        "speech": "所以不是令 x 等于三 sin theta，而是令 x 减二等于三 sin theta。dx 仍然是三 cos theta d theta。"
      },
      {
        "label": "配方提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“二次式先配方，再套三种根号字典”。",
        "speech": "底部这句话很关键：二次式先配方，再回到三种根号字典里选择代换。"
      }
    ]
  },
  {
    "title": "常见结果结构速记",
    "sceneTitle": "结果结构",
    "layout": "不是公式表，像三条结果结构笔记：平方差、平方和、反平方差；底部说明考试时先会推。",
    "components": [
      {
        "label": "结构入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“常见结果结构速记”；写“先理解结构，再记公式”。",
        "speech": "这一页不是让你死背一整张表，而是看三类结果通常长什么样。会推比硬背更稳。"
      },
      {
        "label": "a²-x² 结果",
        "role": "formula",
        "marker": "lime",
        "content": "写“∫√(a²-x²)dx”；旁边写“根号项 + arcsin(x/a)”。",
        "speech": "第一类 a 平方减 x 平方，结果通常包含一个根号项，再加一个 arcsin x 除以 a 的项。"
      },
      {
        "label": "a²+x² 结果",
        "role": "formula",
        "marker": "blue",
        "content": "写“∫√(a²+x²)dx”；旁边写“根号项 + ln|x+√(a²+x²)|”。",
        "speech": "第二类平方和，结果里常出现对数项。这和 tan 代换后 sec 的积分有关。"
      },
      {
        "label": "x²-a² 结果",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫√(x²-a²)dx”；旁边写“根号项 + ln|x+√(x²-a²)|”。",
        "speech": "第三类 x 平方减 a 平方，也常带对数项，但根号结构和适用区间不同。"
      },
      {
        "label": "速记提醒",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“能从代换推出，就不怕公式忘掉”。",
        "speech": "底部提醒：公式可以速记，但更重要的是知道它们从哪种代换推出来。这样忘了也能重新推。"
      }
    ]
  },
  {
    "title": "选择代换的流程图",
    "sceneTitle": "选择流程",
    "layout": "中心放简洁流程：先配方，再看三种根号形状，再选 sin/tan/sec；底部错误排查。",
    "components": [
      {
        "label": "流程入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“选择代换的流程图”；中心写“先认形状”。",
        "speech": "这一页把所有选择动作整理成流程。逆换元法最怕一上来乱背，最稳的是先认形状。"
      },
      {
        "label": "先配方",
        "role": "strategy",
        "marker": "lime",
        "content": "写“若根号内是二次式：先配方”。",
        "speech": "第一步看根号内是不是二次式。如果不是标准形状，就先配方，把它整理成平方差或平方和。"
      },
      {
        "label": "看三形",
        "role": "formula",
        "marker": "blue",
        "content": "写“a²-x²；a²+x²；x²-a²”。",
        "speech": "第二步看三种形状：a 平方减 x 平方、a 平方加 x 平方、x 平方减 a 平方。"
      },
      {
        "label": "选代换",
        "role": "formula",
        "marker": "cyan",
        "content": "写“sin；tan；sec”分别对应三种形状。",
        "speech": "第三步选择代换：平方差选 sin，平方和选 tan，x 平方减 a 平方选 sec。"
      },
      {
        "label": "错误排查",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部 checklist：“dx 改了吗？根号消了吗？θ 换回了吗？”",
        "speech": "最后用底部清单排查：dx 有没有改，根号有没有真的消掉，最后 theta 有没有换回 x。"
      }
    ]
  },
  {
    "title": "综合练习：先选再算",
    "sceneTitle": "综合练习",
    "layout": "三道小题错落摆放，中间写选择理由；底部写做题顺序。",
    "components": [
      {
        "label": "练习入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“综合练习”；写“每题先选代换，再动笔计算”。",
        "speech": "综合练习的目标是先训练判断。每题先说出根号形状和代换，再开始计算。"
      },
      {
        "label": "练习一",
        "role": "formula",
        "marker": "lime",
        "content": "写“∫√(9-x²) dx”；提示“x=3sinθ”。",
        "speech": "第一题是九减 x 平方，对应 a 平方减 x 平方，所以选 x 等于三 sin theta。"
      },
      {
        "label": "练习二",
        "role": "formula",
        "marker": "blue",
        "content": "写“∫ dx/√(x²+25)”；提示“x=5tanθ”。",
        "speech": "第二题是 x 平方加二十五，对应平方和，所以选 x 等于五 tan theta。"
      },
      {
        "label": "练习三",
        "role": "formula",
        "marker": "cyan",
        "content": "写“∫√(x²-16)/x dx”；提示“x=4secθ”。",
        "speech": "第三题是 x 平方减十六，对应 x 平方减 a 平方，所以选 x 等于四 sec theta。"
      },
      {
        "label": "做题顺序",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部写“认形状 → 写代换 → 改 dx → 化简 → 回代”。",
        "speech": "底部顺序就是完整流程：认形状，写代换，改 dx，化简积分，最后回代。"
      }
    ]
  },
  {
    "title": "总结：逆换元法的三件事",
    "sceneTitle": "总结",
    "layout": "中心写“逆换元法”，周围三件事：认形状、消根号、换回 x；底部最终清单。",
    "components": [
      {
        "label": "总结入口",
        "role": "opening",
        "marker": "red",
        "content": "标题“逆换元法的三件事”；中心写“逆换元法”。",
        "speech": "最后一页把这本笔记收束成三件事。只要这三件事清楚，逆换元法就不会像一张难背的公式表。"
      },
      {
        "label": "第一件事",
        "role": "strategy",
        "marker": "lime",
        "content": "写“认根号形状：a²-x²，a²+x²，x²-a²”。",
        "speech": "第一件事是认形状。三种根号形状决定了后面该用 sin、tan 还是 sec。"
      },
      {
        "label": "第二件事",
        "role": "formula",
        "marker": "blue",
        "content": "写“选 sin/tan/sec，让根号变成普通三角函数”。",
        "speech": "第二件事是消根号。选择合适代换后，根号会变成普通三角函数，这是整套方法的目的。"
      },
      {
        "label": "第三件事",
        "role": "formula",
        "marker": "cyan",
        "content": "写“积分后用三角形或反三角函数换回 x”。",
        "speech": "第三件事是换回 x。积分结束后，答案不能停在 theta，要用三角形或者反三角函数回到原变量。"
      },
      {
        "label": "最终清单",
        "role": "takeaway",
        "marker": "yellow",
        "content": "底部 checklist：“形状对；dx 对；范围对；回代对”。",
        "speech": "最后用四个词检查：形状对不对，dx 改得对不对，范围或上下限对不对，最后回代对不对。"
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

Generate page ${pageNumber} of a Chinese calculus inverse-substitution notebook as a marker source image. The image itself must contain the colored corner markers; later software will recover the regions and remove the markers.

Hard visible-text rules:
- All visible prose, headings, labels, and question text must be Simplified Chinese.
- Do not write any course code, course name, teacher name, date, page number, or week label.
- Do not write MAT136, Calculus II, Week, 第1周, 页码, Page, or any English prose.
- Do not write component numbers or circled numbers before headings.
- Standard math notation is allowed: x, a, θ, α, sin, cos, tan, sec, arcsin, arctan, arcsec, dx, dθ, √, ∫, C, π.

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
    title: '逆换元法：从根号形状到三角代换',
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
          name: '逆换元法：从根号形状到三角代换',
          description: '第三本中文手绘图片笔记本：逆换元法、三角代换、根号化简与回代。',
          tags: ['MAT136', '逆换元法', '三角代换', '根号化简', '中文笔记', '四角marker'],
          avatarUrl: '/avatars/notebook-agents/avatar8.avif',
          language: 'zh-CN',
          style: 'imagegen-marker-recovered-v2',
          updatedAt: now,
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: course.ownerId,
          courseId: course.id,
          name: '逆换元法：从根号形状到三角代换',
          description: '第三本中文手绘图片笔记本：逆换元法、三角代换、根号化简与回代。',
          tags: ['MAT136', '逆换元法', '三角代换', '根号化简', '中文笔记', '四角marker'],
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
