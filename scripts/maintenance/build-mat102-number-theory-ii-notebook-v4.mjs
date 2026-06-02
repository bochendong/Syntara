#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-number-theory-ii-v4');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-number-theory-ii-primes-proof-v2';
const NOTEBOOK_NAME = '数论 II：线性丢番图方程、素数与唯一分解（proof-first PPT 版）';

const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 900;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const MARKER_SIZE = 16;

const COLORS = [
  { name: 'red', hex: '#ff0000', test: (p) => p.r > 190 && p.g < 120 && p.b < 120 },
  { name: 'lime', hex: '#00ff00', test: (p) => p.g > 190 && p.r < 120 && p.b < 120 },
  { name: 'blue', hex: '#0048ff', test: (p) => p.b > 175 && p.r < 120 && p.g < 150 },
  { name: 'cyan', hex: '#00ffff', test: (p) => p.g > 175 && p.b > 175 && p.r < 135 },
  { name: 'magenta', hex: '#ff00ff', test: (p) => p.r > 175 && p.b > 175 && p.g < 135 },
  { name: 'yellow', hex: '#ffff00', test: (p) => p.r > 185 && p.g > 185 && p.b < 145 },
];

const COLOR_BY_NAME = new Map(COLORS.map((color) => [color.name, color]));
const COLOR_ORDER = COLORS.map((color) => color.name);

const selectedSources = [
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cef658960819aa3447b67e30ad54c.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ce838645c819a9139595eb2de9a58.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ce886edb8819a8c019abdbb926992.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ce8dd15cc819a889530744afe3dfd.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cf2e34aa0819a94ed716da1d20a08.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ce98c0bf4819aacdcb30762748fe5.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cea00efa8819a9f0afdec2bea99ec.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cea5c5748819a9108d850cb903041.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ceaae7c70819a80b79560f7f3ffc7.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cf345cf68819aa9d3f02759d1922c.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cebb8a7c0819aa6a4c5a2b4c5b51f.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cec8398a4819aa17c8d204c934cd3.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cf0da72d4819aa442d5597e4e2db5.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ced50cc28819a9bc63e2787d61b3a.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ceda2a080819a9edbf966ca2fd813.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cedf842e4819aa467fda18253e29e.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1cee4d3b74819abf7602ecad5d69a4.png"
];

function region(label, script) {
  return { label, script };
}

const pages = [
  {
    title: "数论 II：从方程到素数",
    role: "介绍页",
    regions: [
      {
        label: "本页目标",
        script: "这一页把本讲的主问题放出来：先问什么时候 ax+by=c 有整数解，再问素数为什么能控制乘积里的因子。"
      },
      {
        label: "承接",
        script: "上一节的贝祖等式告诉我们 d=gcd(a,b) 可以写成 d=sa+tb，这正是解线性丢番图方程的钥匙。"
      },
      {
        label: "路线图",
        script: "本节路线是从贝祖等式出发，得到线性丢番图方程的可解条件，再进入素数引理和唯一分解。"
      },
      {
        label: "核心定理 A",
        script: "第一个核心定理是 ax+by=c 有整数解当且仅当 gcd(a,b) 整除 c。"
      },
      {
        label: "核心定理 B",
        script: "第二个核心定理是素数可以用整除乘积性质刻画：p|ab 时，p 必须整除其中一个因子。"
      },
      {
        label: "底部问题",
        script: "带着这个问题进入本节：为什么同一个 gcd 既能解方程，又能进入素数证明？"
      }
    ]
  },
  {
    title: "互素引理：从贝祖到整除",
    role: "证明页",
    regions: [
      {
        label: "命题",
        script: "这一页证明关键引理：若 a|bc 且 gcd(a,b)=1，则 a|c。它会直接支撑后面的素数性质。"
      },
      {
        label: "贝祖入口",
        script: "因为 gcd(a,b)=1，由贝祖等式可取 s,t∈Z，使 sa+tb=1。"
      },
      {
        label: "乘上 c",
        script: "把等式两边乘以 c，得到 c(sa+tb)=c，也就是 sac+tbc=c。"
      },
      {
        label: "整除检查",
        script: "a 显然整除 sac；又因为 a|bc，所以 a 也整除 tbc。"
      },
      {
        label: "收束",
        script: "既然 a 同时整除 sac 和 tbc，它整除二者之和 c，所以 a|c。"
      },
      {
        label: "底部问题",
        script: "这个引理的作用是：当 a 与 b 互素时，a 若整除 bc，就只能去整除 c。"
      }
    ]
  },
  {
    title: "线性丢番图方程的可解条件",
    role: "定理页",
    regions: [
      {
        label: "定理",
        script: "设 d=gcd(a,b)。方程 ax+by=c 有整数解，当且仅当 d|c。"
      },
      {
        label: "必要性",
        script: "如果已经有整数解 ax+by=c，因为 d|a 且 d|b，所以 d 整除 ax+by，也就整除 c。"
      },
      {
        label: "充分性",
        script: "如果 d|c，写 c=kd。又由贝祖等式，有 d=sa+tb。"
      },
      {
        label: "构造解",
        script: "把 d=sa+tb 乘以 k，得到 c=a(ks)+b(kt)，所以 x=ks, y=kt 是一组整数解。"
      },
      {
        label: "证明结构",
        script: "这一页的逻辑是：有解会强迫 d|c；反过来 d|c 又让贝祖等式直接构造出解。"
      },
      {
        label: "底部问题",
        script: "d|c 是唯一障碍，因为 d 是所有 ax+by 线性组合共同带着的最大公因数。"
      }
    ]
  },
  {
    title: "例题：求一组整数解",
    role: "计算证明页",
    regions: [
      {
        label: "题目",
        script: "目标是找一组整数 x,y，使 504x+1155y=42。先不要猜解，而是先检查 gcd。"
      },
      {
        label: "先查可解",
        script: "用欧几里得算法得 gcd(504,1155)=21，并且 21|42，因此定理保证有整数解。"
      },
      {
        label: "欧几里得算法",
        script: "这一列除法记录了余数变化：1155 到 504，再到 147、63、21、0。最后非零余数是 21。"
      },
      {
        label: "回代得到 21",
        script: "从 21=147−2·63 开始，把 63 和 147 依次换回 504 与 1155 的组合。"
      },
      {
        label: "整理",
        script: "回代整理得到 21=7·1155−16·504。现在还差目标右边的 42。"
      },
      {
        label: "答案",
        script: "两边乘以 2，得到 42=14·1155−32·504，所以 x=−32, y=14。"
      }
    ]
  },
  {
    title: "线性丢番图方程的通解",
    role: "定理页",
    regions: [
      {
        label: "通解结论",
        script: "若 (x0,y0) 是一组解，d=gcd(a,b)，那么所有解由 x=x0+n·b/d, y=y0−n·a/d 给出。"
      },
      {
        label: "相减",
        script: "把任意解和已知解相减，得到 a(x−x0)+b(y−y0)=0。这一步把问题从解方程变成看差值。"
      },
      {
        label: "互素化",
        script: "除以 d 后，a/d 与 b/d 互素，这是能推出整除关系的关键。"
      },
      {
        label: "参数 n",
        script: "由互素引理可推出 b/d 整除 x−x0，于是存在 n∈Z，使 x−x0=n·b/d。"
      },
      {
        label: "得到 y",
        script: "把 x 的形式代回相减等式，得到 y−y0=−n·a/d，因此 y=y0−n·a/d。"
      },
      {
        label: "底部问题",
        script: "一个整数 n 能扫过所有解，是因为任意两个解之间的差只能沿这个固定方向移动。"
      }
    ]
  },
  {
    title: "例题：所有整数解与非负解",
    role: "例题页",
    regions: [
      {
        label: "已知一组解",
        script: "上一页例题中已经找到 504(−32)+1155(14)=42，且 d=21。"
      },
      {
        label: "通解代入",
        script: "把 a=504,b=1155,d=21 代入通解公式，得到 x 和 y 关于 n 的表达式。"
      },
      {
        label: "化简",
        script: "化简后得到 x=−32+55n, y=14−24n，其中 n 可以取任意整数。"
      },
      {
        label: "非负条件",
        script: "若要非负解，则需要 x≥0 与 y≥0，即 n≥32/55 且 n≤14/24。"
      },
      {
        label: "数轴判断",
        script: "两个不等式给出的区间中没有整数 n，因此无法同时让 x,y 非负。"
      },
      {
        label: "结论",
        script: "所有整数解由通解公式给出；但非负整数解不存在。"
      }
    ]
  },
  {
    title: "素数的两个定义",
    role: "概念页",
    regions: [
      {
        label: "传统定义",
        script: "传统定义说，p>1 且不能写成两个更小自然数的乘积时，p 是素数。"
      },
      {
        label: "例子",
        script: "2,3,5,7 是素数；6=2·3，因此 6 不是素数。"
      },
      {
        label: "等价桥",
        script: "本节要建立传统因子定义与整除乘积性质之间的等价。"
      },
      {
        label: "整除定义",
        script: "更强的形式是：p 为素数当且仅当 p|ab 会迫使 p|a 或 p|b。"
      },
      {
        label: "为什么重要",
        script: "这个性质说明素数不会“分散地”整除一个乘积，它必须落在某个因子上。"
      },
      {
        label: "底部问题",
        script: "高等数学偏爱整除性质，因为它能直接用于证明唯一分解。"
      }
    ]
  },
  {
    title: "素数推出整除乘积性质",
    role: "证明页",
    regions: [
      {
        label: "目标",
        script: "已知 p 是素数且 p|ab，要证明 p|a 或 p|b。"
      },
      {
        label: "分情况",
        script: "如果 p|a，证明已经结束；所以只需处理 p∤a 的情况。"
      },
      {
        label: "互素转折",
        script: "因为 p 是素数且 p 不整除 a，所以 p 与 a 的最大公因数只能是 1。"
      },
      {
        label: "调用引理",
        script: "现在 p|ab 且 gcd(p,a)=1，由互素引理得到 p|b。"
      },
      {
        label: "结论",
        script: "两种情况合起来，p|ab 时一定有 p|a 或 p|b。"
      },
      {
        label: "底部问题",
        script: "这里真正使用素数的地方，是从 p∤a 推出 gcd(p,a)=1。"
      }
    ]
  },
  {
    title: "整除乘积性质推出素数",
    role: "证明页",
    regions: [
      {
        label: "要证反向",
        script: "现在证明反向：若 p 满足 p|ab ⇒ p|a 或 p|b，则 p 必须是素数。"
      },
      {
        label: "用逆否命题",
        script: "反过来假设 p 不是素数，也就是 p 是合数。"
      },
      {
        label: "合数拆分",
        script: "合数可写成 p=rs，其中 1<r≤s<p。"
      },
      {
        label: "乘积被整除",
        script: "因为 rs=p，所以 p|rs。"
      },
      {
        label: "但因子不被整除",
        script: "由于 r,s 都严格小于 p，p 不可能整除 r 或 s，这违反整除乘积性质。"
      },
      {
        label: "结论",
        script: "所以满足整除乘积性质的 p 不能是合数，只能是素数。"
      }
    ]
  },
  {
    title: "素数性质的三个快速应用",
    role: "应用页",
    regions: [
      {
        label: "核心工具",
        script: "这一页把 p|ab ⇒ p|a 或 p|b 当成工具来使用。"
      },
      {
        label: "合数反例",
        script: "合数不满足这个工具：6|2·3，但 6 不整除 2，也不整除 3。"
      },
      {
        label: "平方检验",
        script: "若 p|n²，因为 n²=n·n，由素数性质得到 p|n。反向 p|n 则显然 p|n²。"
      },
      {
        label: "长乘积",
        script: "若 p 整除 a₁a₂…aₙ，就可以反复拆乘积，直到发现某个 aᵢ 被 p 整除。"
      },
      {
        label: "反复剥开",
        script: "方法是先看 a₁；若 p 不整除 a₁，就把 p 推到剩余乘积上继续。"
      },
      {
        label: "底部问题",
        script: "素数像不可分裂的检测器，因为它整除乘积时不能平均分散到多个因子里。"
      }
    ]
  },
  {
    title: "唯一分解定理：存在性证明",
    role: "证明页",
    regions: [
      {
        label: "目标",
        script: "唯一分解定理的第一半是存在性：每个 n>1 都能写成素数乘积。"
      },
      {
        label: "反设集合",
        script: "假设存在不能写成素数乘积的数，把所有这样的数放进集合 S。"
      },
      {
        label: "取最小反例",
        script: "由良序原理，非空的 S 有最小元素 k。"
      },
      {
        label: "k 不是素数",
        script: "如果 k 是素数，那它本身就是一个素数乘积，所以 k 不能是素数。"
      },
      {
        label: "拆开并矛盾",
        script: "于是 k=rs 且 1<r,s<k。由最小性，r 和 s 都可分解成素数乘积，故 k 也可分解，矛盾。"
      },
      {
        label: "结论",
        script: "最小反例不存在，所以每个大于 1 的正整数都能分解成素数乘积。"
      }
    ]
  },
  {
    title: "唯一分解定理：唯一性证明",
    role: "证明页",
    regions: [
      {
        label: "反设两种分解",
        script: "假设同一个 n 有两种素数分解：n=p₁p₂…p_r=q₁q₂…q_s。"
      },
      {
        label: "抓第一个素数",
        script: "因为 p₁ 整除 n，所以 p₁ 整除右边的乘积 q₁q₂…q_s。"
      },
      {
        label: "用素数性质",
        script: "由素数整除乘积性质，p₁ 必须整除某个 qⱼ。重新排列后可设它整除 q₁。"
      },
      {
        label: "素数只能相等",
        script: "q₁ 也是素数，而 p₁|q₁，所以只能有 p₁=q₁。"
      },
      {
        label: "消去并重复",
        script: "把相同的 p₁ 和 q₁ 消去，对剩余乘积重复同样论证。"
      },
      {
        label: "结论",
        script: "最终两边素因子完全相同，只可能差排列顺序，这就是唯一性。"
      }
    ]
  },
  {
    title: "唯一分解定理如何使用",
    role: "应用页",
    regions: [
      {
        label: "唯一分解",
        script: "把 n 写成 n=p₁^{e₁}p₂^{e₂}…p_k^{e_k}，指数记录每个素数出现几次。"
      },
      {
        label: "整除判断",
        script: "b|a 等价于 b 中每个素数的指数都不超过 a 中对应指数。"
      },
      {
        label: "指数表",
        script: "指数表的作用是把两个数放到同一组素数下比较。"
      },
      {
        label: "最大公因数",
        script: "gcd(a,b) 取每个公共素数指数的较小值：min(αᵢ,βᵢ)。"
      },
      {
        label: "对比想法",
        script: "公共部分取较小指数；若以后谈最小公倍数，则会取较大指数。"
      },
      {
        label: "底部问题",
        script: "唯一分解让 gcd 从找因子变成比指数，这是它最实用的地方。"
      }
    ]
  },
  {
    title: "例题：log₃₆(105) 是无理数",
    role: "完整例题页",
    regions: [
      {
        label: "反设",
        script: "假设 log₃₆(105)=p/q，其中 p,q 是整数，q>0，且分数已约到最简。"
      },
      {
        label: "转成指数式",
        script: "由对数定义得到 36^{p/q}=105，因此 36^p=105^q。"
      },
      {
        label: "素因子分解",
        script: "分解底数：36=2²·3²，105=3·5·7。"
      },
      {
        label: "比较指数",
        script: "等式左边含 2 的指数是 2p，右边含 2 的指数是 0。唯一分解迫使 2p=0。"
      },
      {
        label: "矛盾",
        script: "同时比较 3 的指数会得到 2p=q，于是 q=0，和 q>0 矛盾。"
      },
      {
        label: "结论",
        script: "所以 log₃₆(105) 不是有理数；证明核心是唯一分解下指数必须一致。"
      }
    ]
  },
  {
    title: "欧几里得证明：素数无穷多",
    role: "证明页",
    regions: [
      {
        label: "反设",
        script: "假设素数只有有限多个，全部列成 p₁,p₂,…,p_n。"
      },
      {
        label: "构造新数",
        script: "令 N=p₁p₂…p_n+1。这个新数大于 1。"
      },
      {
        label: "除以任一 pᵢ",
        script: "对列表中任意 pᵢ，N 除以 pᵢ 的余数都是 1，所以 pᵢ 不整除 N。"
      },
      {
        label: "用唯一分解",
        script: "因为 N>1，它至少有一个素因子 q。"
      },
      {
        label: "矛盾",
        script: "这个 q 不可能在原列表里，否则它既整除 N 又使 N 余 1，矛盾。"
      },
      {
        label: "结论",
        script: "有限列表无法包含所有素数，因此素数有无穷多个。"
      }
    ]
  },
  {
    title: "练习地图：阶乘末尾零与因子计数",
    role: "应用总结页",
    regions: [
      {
        label: "问题 A",
        script: "100! 末尾有多少个 0？末尾 0 的本质是因子 10。"
      },
      {
        label: "转化",
        script: "10=2·5，而 100! 中因子 2 远多于因子 5，所以关键是数因子 5。"
      },
      {
        label: "计数式",
        script: "5 的个数为 ⌊100/5⌋+⌊100/25⌋=20+4=24。"
      },
      {
        label: "问题 B",
        script: "若 n=p₁^{e₁}…p_k^{e_k}，问 n 有多少个正因子。"
      },
      {
        label: "选择指数",
        script: "每个因子的 pᵢ 指数可以选 0,1,…,eᵢ，一共有 eᵢ+1 种选择。"
      },
      {
        label: "结论",
        script: "总因子个数是 (e₁+1)(e₂+1)…(e_k+1)，唯一分解把计数变成选择。"
      }
    ]
  },
  {
    title: "总结：丢番图方程、素数与唯一分解",
    role: "总结页",
    regions: [
      {
        label: "丢番图方程",
        script: "线性丢番图方程 ax+by=c 有整数解，当且仅当 gcd(a,b) 整除 c。"
      },
      {
        label: "通解形状",
        script: "一旦有一组解，所有解沿固定方向移动：x=x0+n·b/d，y=y0−n·a/d。"
      },
      {
        label: "证明地图",
        script: "本节主线是贝祖等式进入方程，再由互素引理进入素数，再通向唯一分解。"
      },
      {
        label: "素数性质",
        script: "素数的关键性质是 p|ab 会迫使 p|a 或 p|b。"
      },
      {
        label: "唯一分解",
        script: "唯一分解把整数变成素数指数表，从而处理整除、gcd 和计数。"
      },
      {
        label: "带走问题",
        script: "本节真正的主线是：把整数问题翻译成 gcd、素数和指数。"
      }
    ]
  }
];

function markerColorForPixel(data, offset) {
  const p = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
  for (const color of COLORS) {
    if (color.test(p)) return color.name;
  }
  return null;
}

function detectMarkerComponents(data, info) {
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const components = [];
  const rawOffset = (x, y) => (y * width + x) * channels;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const visitIndex = y * width + x;
      if (visited[visitIndex]) continue;
      const color = markerColorForPixel(data, rawOffset(x, y));
      if (!color) {
        visited[visitIndex] = 1;
        continue;
      }

      const queue = [[x, y]];
      let head = 0;
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      visited[visitIndex] = 1;

      while (head < queue.length) {
        const [cx, cy] = queue[head++];
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nextVisitIndex = ny * width + nx;
          if (visited[nextVisitIndex]) continue;
          if (markerColorForPixel(data, rawOffset(nx, ny)) === color) {
            visited[nextVisitIndex] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fillRatio = count / (boxWidth * boxHeight);
      if (count >= 20 && boxWidth >= 5 && boxWidth <= 64 && boxHeight >= 5 && boxHeight <= 64 && fillRatio >= 0.2) {
        components.push({ color, count, minX, minY, maxX, maxY, boxWidth, boxHeight, fillRatio });
      }
    }
  }
  return components;
}

function median(values) {
  if (!values.length) return 248;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function localBackground(data, info, x0, y0, x1, y1) {
  const { width, height, channels } = info;
  const rawOffset = (x, y) => (y * width + x) * channels;
  const samples = [[], [], []];
  for (let y = Math.max(0, y0 - 22); y <= Math.min(height - 1, y1 + 22); y += 1) {
    for (let x = Math.max(0, x0 - 22); x <= Math.min(width - 1, x1 + 22); x += 1) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      const offset = rawOffset(x, y);
      if (markerColorForPixel(data, offset)) continue;
      if (data[offset] > 170 && data[offset + 1] > 170 && data[offset + 2] > 170) {
        samples[0].push(data[offset]);
        samples[1].push(data[offset + 1]);
        samples[2].push(data[offset + 2]);
      }
    }
  }
  return [median(samples[0]), median(samples[1]), median(samples[2])];
}

function cleanMarkerComponents(data, info, components) {
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const rawOffset = (x, y) => (y * width + x) * channels;

  for (const component of components) {
    const pad = 7;
    const x0 = Math.max(0, component.minX - pad);
    const y0 = Math.max(0, component.minY - pad);
    const x1 = Math.min(width - 1, component.maxX + pad);
    const y1 = Math.min(height - 1, component.maxY + pad);
    const fill = localBackground(out, info, x0, y0, x1, y1);
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const offset = rawOffset(px, py);
        out[offset] = fill[0];
        out[offset + 1] = fill[1];
        out[offset + 2] = fill[2];
        if (channels > 3) out[offset + 3] = 255;
      }
    }
  }
  return out;
}

function countsByColor(components) {
  return Object.fromEntries(COLOR_ORDER.map((color) => [color, components.filter((component) => component.color === color).length]));
}

function bboxForMarkers(markers) {
  return [
    Math.min(...markers.map((marker) => marker.minX)),
    Math.min(...markers.map((marker) => marker.minY)),
    Math.max(...markers.map((marker) => marker.maxX)),
    Math.max(...markers.map((marker) => marker.maxY)),
  ];
}

function recoveryComponentsForPage(page, markerComponents) {
  return COLOR_ORDER.map((colorName, index) => {
    const markers = markerComponents.filter((marker) => marker.color === colorName);
    const [x0, y0, x1, y1] = bboxForMarkers(markers);
    const color = COLOR_BY_NAME.get(colorName);
    return {
      componentId: `p${String(pages.indexOf(page) + 1).padStart(2, '0')}-r${index + 1}`,
      label: page.regions[index].label,
      markerColorHex: color.hex,
      markerCount: markers.length,
      bbox: [x0, y0, x1, y1],
      markerPoints: markers.map((marker) => ({
        x: (marker.minX + marker.maxX) / 2,
        y: (marker.minY + marker.maxY) / 2,
      })),
    };
  });
}

function focusShape(component) {
  const [x0, y0, x1, y1] = component.bbox;
  const scaleX = CANVAS_WIDTH / IMAGE_WIDTH;
  const scaleY = CANVAS_HEIGHT / IMAGE_HEIGHT;
  return {
    id: component.componentId,
    name: `lecture-focus-generated: ${component.label}`,
    type: 'shape',
    left: Math.round(x0 * scaleX * 10) / 10,
    top: Math.round(y0 * scaleY * 10) / 10,
    width: Math.round((x1 - x0) * scaleX * 10) / 10,
    height: Math.round((y1 - y0) * scaleY * 10) / 10,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function buildActions(page, recoveryComponents) {
  return recoveryComponents.flatMap((component, index) => [
    {
      id: `${component.componentId}-spotlight`,
      type: 'spotlight',
      title: `聚焦：${component.label}`,
      elementId: component.componentId,
      dimOpacity: 0.62,
    },
    {
      id: `${component.componentId}-speech`,
      type: 'speech',
      title: component.label,
      text: page.regions[index].script,
    },
  ]);
}

function promptPlanForPage(page, recoveryComponents, sourceUrl, rawSourcePath) {
  return {
    schemaVersion: 4,
    canvas: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, aspectRatio: '16:9' },
    styleProfile: {
      id: 'hand-drawn-chinese-number-theory-ii-proof-ppt-native-markers-v4',
      label: '中文手写 proof-first 数论 PPT 笔记，原生四角 marker',
      styleBrief: {
        preset: 'hand-drawn-course-notebook',
        background: 'white graph-paper notebook background with faint light-gray grid',
        colorMood: 'black marker text, deep teal formulas and diagrams, pale teal fills, muted brown arrows',
      },
    },
    pageRole: page.role,
    componentPlans: recoveryComponents.map((component, index) => ({
      id: component.componentId,
      label: component.label,
      order: index + 1,
      markerColorHex: component.markerColorHex,
      participatesInMask: true,
      recoveredBbox: component.bbox,
    })),
    markerProtocol: {
      type: 'native-imagegen-corner-square-markers-clean-is-recovered',
      componentCount: 6,
      markerCountPerComponent: 4,
      totalMarkerCount: 24,
      markerSizePx: MARKER_SIZE,
      note: 'Source image already contains markers. Clean image is recovered by removing marker components.',
    },
    compiledImagePrompt: page.title,
    promptHash: crypto.createHash('sha1').update(page.title + page.role).digest('hex'),
    recoveryResult: {
      status: 'passed',
      recoveredAt: Date.now(),
      rawImageGenSourcePath: rawSourcePath,
      originalMarkerImageUrl: sourceUrl,
      originalMarkerImageDimensions: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT },
      components: recoveryComponents,
    },
  };
}

function sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents, rawSourcePath) {
  const pageNo = String(index + 1).padStart(2, '0');
  return {
    id: `${NOTEBOOK_ID}-scene-${pageNo}`,
    title: page.title,
    type: 'slide',
    order: index,
    content: {
      type: 'slide',
      canvas: {
        id: `${NOTEBOOK_ID}-canvas-${pageNo}`,
        viewportSize: CANVAS_WIDTH,
        viewportRatio: 0.5625,
        background: { type: 'solid', color: '#ffffff', respectProfileStyle: false },
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#111827', '#0f766e', '#8b5e34', '#f8fafc'],
          fontColor: '#111827',
          fontName: 'Microsoft YaHei',
        },
        remark: `${page.role}：${page.title}`,
        elements: [
          {
            id: `p${pageNo}-full-page-bitmap`,
            type: 'image',
            name: 'full_page_bitmap',
            left: 0,
            top: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            rotate: 0,
            fixedRatio: false,
            src: cleanUrl,
            imageType: 'background',
            lock: true,
          },
          ...recoveryComponents.map(focusShape),
        ],
      },
      imageNotebookPromptPlan: promptPlanForPage(page, recoveryComponents, sourceUrl, rawSourcePath),
    },
    actions: buildActions(page, recoveryComponents),
    whiteboard: [],
  };
}

async function processPage(page, index, sourcePath) {
  const pageNo = String(index + 1).padStart(3, '0');
  const sourceOut = path.join(SOURCE_DIR, `page-${pageNo}-source.png`);
  const cleanOut = path.join(RECOVERED_DIR, `page-${pageNo}-clean.png`);

  const { data, info } = await sharp(sourcePath)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourceComponents = detectMarkerComponents(data, info);
  const sourceCounts = countsByColor(sourceComponents);
  await sharp(data, { raw: info }).png().toFile(sourceOut);

  const cleanData = cleanMarkerComponents(data, info, sourceComponents);
  await sharp(cleanData, { raw: info }).png().toFile(cleanOut);
  const { data: cleanRaw, info: cleanInfo } = await sharp(cleanOut)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleanComponents = detectMarkerComponents(cleanRaw, cleanInfo);
  const cleanCounts = countsByColor(cleanComponents);

  const status =
    Object.values(sourceCounts).every((count) => count === 4) && Object.values(cleanCounts).every((count) => count === 0)
      ? 'passed'
      : 'needs-review';

  const sourceUrl = `/generated-notebooks/mat102-number-theory-ii-v4/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-number-theory-ii-v4/recovered/page-${pageNo}-clean.png`;
  const recoveryComponents = status === 'passed' ? recoveryComponentsForPage(page, sourceComponents) : [];

  return {
    scene: status === 'passed' ? sceneForPage(page, index, cleanUrl, sourceUrl, recoveryComponents, sourcePath) : null,
    validation: {
      page: index + 1,
      title: page.title,
      sourcePath,
      sourceUrl,
      cleanUrl,
      markerCountsByColor: sourceCounts,
      cleanMarkerCountsByColor: cleanCounts,
      sourceTotal: sourceComponents.length,
      cleanTotal: cleanComponents.length,
      status,
      markerComponents: sourceComponents,
    },
  };
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function buildContactSheet(dir, filename, label) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => path.join(dir, name));
  const thumbW = 400;
  const thumbH = 225;
  const labelH = 34;
  const gap = 12;
  const cols = 4;
  const rows = Math.ceil(files.length / cols);
  const composites = [];
  for (let i = 0; i < files.length; i += 1) {
    const x = (i % cols) * (thumbW + gap);
    const y = Math.floor(i / cols) * (thumbH + labelH + gap);
    composites.push({ input: await sharp(files[i]).resize(thumbW, thumbH, { fit: 'fill' }).png().toBuffer(), left: x, top: y });
    composites.push({
      input: Buffer.from(
        `<svg width="${thumbW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="10" y="23" font-family="Arial" font-size="18" font-weight="700" fill="white">${escapeXml(
          label,
        )} ${String(i + 1).padStart(2, '0')}</text></svg>`,
      ),
      left: x,
      top: y + thumbH,
    });
  }

  await sharp({
    create: {
      width: cols * thumbW + (cols - 1) * gap,
      height: rows * (thumbH + labelH) + (rows - 1) * gap,
      channels: 4,
      background: '#f8fafc',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

async function importToDatabase(scenes) {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const course = await tx.course.findFirst({ where: { id: COURSE_ID, ownerId: OWNER_ID }, select: { id: true } });
      if (!course) throw new Error(`Target MAT102 course not found: ${COURSE_ID}`);
      await tx.notebook.upsert({
        where: { id: NOTEBOOK_ID },
        update: {
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：线性丢番图方程、素数、唯一分解、无穷素数与指数应用。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '数论', '线性丢番图方程', '素数', '唯一分解', '无穷素数', '证明', '中文', 'proof-first', 'PPT感', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：线性丢番图方程、素数、唯一分解、无穷素数与指数应用。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '数论', '线性丢番图方程', '素数', '唯一分解', '无穷素数', '证明', '中文', 'proof-first', 'PPT感', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
        },
      });
      await tx.scene.deleteMany({ where: { notebookId: NOTEBOOK_ID } });
      await tx.scene.createMany({
        data: scenes.map((scene) => ({
          id: scene.id,
          notebookId: NOTEBOOK_ID,
          title: scene.title,
          type: scene.type,
          order: scene.order,
          content: scene.content,
          actions: scene.actions,
          whiteboard: scene.whiteboard,
        })),
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (selectedSources.length !== pages.length) {
    throw new Error(`Selected source count ${selectedSources.length} does not match page count ${pages.length}`);
  }
  for (const sourcePath of selectedSources) {
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing generated image: ${sourcePath}`);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  for (const dir of [OUT_DIR, SOURCE_DIR, RECOVERED_DIR, META_DIR]) fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (let index = 0; index < pages.length; index += 1) {
    results.push(await processPage(pages[index], index, selectedSources[index]));
    console.log(`processed ${index + 1}/${pages.length}: ${pages[index].title}`);
  }
  const validations = results.map((result) => result.validation);
  fs.writeFileSync(path.join(META_DIR, 'validations.json'), JSON.stringify(validations, null, 2));
  if (!validations.every((validation) => validation.status === 'passed')) {
    throw new Error(`Marker validation failed: ${JSON.stringify(validations.filter((validation) => validation.status !== 'passed'), null, 2)}`);
  }
  const scenes = results.map((result) => result.scene);
  fs.writeFileSync(path.join(META_DIR, 'scenes.json'), JSON.stringify(scenes, null, 2));
  fs.writeFileSync(
    path.join(META_DIR, 'selected-sources.json'),
    JSON.stringify(selectedSources.map((sourcePath, index) => ({ page: index + 1, title: pages[index].title, sourcePath })), null, 2),
  );
  fs.writeFileSync(
    path.join(META_DIR, 'lecture-script.json'),
    JSON.stringify(
      pages.map((page, index) => ({
        page: index + 1,
        title: page.title,
        role: page.role,
        regions: page.regions.map((regionItem, regionIndex) => ({
          id: `p${String(index + 1).padStart(2, '0')}-r${regionIndex + 1}`,
          label: regionItem.label,
          markerColor: COLOR_BY_NAME.get(COLOR_ORDER[regionIndex]).hex,
          script: regionItem.script,
        })),
      })),
      null,
      2,
    ),
  );
  await buildContactSheet(SOURCE_DIR, 'contact-sheet-source.png', 'source');
  await buildContactSheet(RECOVERED_DIR, 'contact-sheet-clean.png', 'clean');
  await importToDatabase(scenes);
  console.log(`Built ${pages.length} MAT102 Number Theory II scenes for ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
