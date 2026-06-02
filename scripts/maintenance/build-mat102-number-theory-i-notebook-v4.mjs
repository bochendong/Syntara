#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-number-theory-i-v4');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-number-theory-i-euclidean-proof-v2';
const NOTEBOOK_NAME = '数论 I：整除、最大公因数与欧几里得算法（proof-first 版）';

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
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cdc662fa4819abd3d8129f19b4cae.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cdccb1a70819a9b3ce16263d80476.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cdd2e4cdc819a91bc9a5d182062df.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cdd94cee0819ab4a956e4330cbb62.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cddfe9a9c819ab0c02fc861a4da09.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cde6ca760819a9a294bf895e18755.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cded635f0819a9b93d2d7ff22ab1f.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cdf3de060819a8d8fba8a27fba482.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1cdfd982a4819ab7a8c5dc1fee8fbc.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1ce02de53c819aaa23f39980bcb3cb.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1ce089f58c819aaf54389bf3076d70.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1ce0e6ff30819aa00bbcbc4d7a2ec5.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1ce14954bc819aaafdcb46b7ba6809.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_0f1ac837f9558cd5016a1ce1ab68b0819aa73c72af570eb78d.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ce48e7798819a9c47fe6b1e9b9ce9.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1ce51e4b44819a9d65e158415c34da.png"
];

function region(label, script) {
  return { label, script };
}

const pages = [
  {
    title: "数论证明从整除开始",
    role: "介绍页",
    regions: [
      {
        label: "本页目标",
        script: "这一页先把数论证明的主线搭起来：整除不是口头说能除尽，而是存在整数倍；最大公因数也不是只靠计算，而是靠公共因子的结构。"
      },
      {
        label: "本节路线",
        script: "我们会从整除定义开始，经过带余除法，证明欧几里得算法为什么保持最大公因数，最后回代得到贝祖等式。"
      },
      {
        label: "算法视角",
        script: "欧几里得算法看起来像一串除法，但每一步背后都有一个命题：把一对整数换成另一对整数时，公共因子集合不变。"
      },
      {
        label: "证明视角",
        script: "证明课里要问的是：余数为什么越来越小？为什么 gcd 不变？为什么最后非零余数就是最大公因数？"
      },
      {
        label: "本页核心",
        script: "整节课的核心句是：若 a=bq+r，则 gcd(a,b)=gcd(b,r)。后面所有计算都围绕这句话。"
      },
      {
        label: "带走问题",
        script: "为什么一个看似机械的算法，最后能给出一个严格的存在性定理？"
      }
    ]
  },
  {
    title: "整除定义：把符号翻译成整数倍",
    role: "定义页",
    regions: [
      {
        label: "定义",
        script: "若 a,b∈Z 且 b≠0，记 b|a，意思是存在 k∈Z 使 a=bk。这个 k 必须是整数。"
      },
      {
        label: "正例",
        script: "12=4·3，所以 4|12。这里见证整数是 k=3。写整除证明时，找到这个 k 就是关键。"
      },
      {
        label: "反例",
        script: "5∤12，因为不存在整数 k 使 12=5k。虽然 12/5 是数，但不是整数见证。"
      },
      {
        label: "抽象例子",
        script: "若 k∈Z，则 k|(k^2+k)，因为 k^2+k=k(k+1)，而 k+1∈Z。"
      },
      {
        label: "证明模板",
        script: "要证明 b|a，就把 a 改写成 b·整数。要否定整除，则说明这样的整数不存在。"
      },
      {
        label: "底部问题",
        script: "看到 b|a 时，第一反应应该是“我需要写出哪个整数倍”？"
      }
    ]
  },
  {
    title: "整除性质：传递性与线性组合",
    role: "证明页",
    regions: [
      {
        label: "命题列表",
        script: "若 a,b,c∈Z，常用性质有：a|b 且 b|c ⇒ a|c；a|b 且 a|c ⇒ a|(mb+nc)。"
      },
      {
        label: "传递性结论",
        script: "由 b=ak，c=bm，得到 c=(ak)m=a(km)。因为 km∈Z，所以 a|c。"
      },
      {
        label: "线性组合结论",
        script: "若 b=ak, c=aℓ，则 mb+nc=m(ak)+n(aℓ)=a(mk+nℓ)。"
      },
      {
        label: "证明意义",
        script: "这些性质让我们能从已知整除关系制造新的整除关系，后面 gcd 不变证明全靠它。"
      },
      {
        label: "展开计算",
        script: "重点不是背公式，而是每次把被整除对象写成除数乘以一个整数。"
      },
      {
        label: "底部提醒",
        script: "线性组合是数论证明的发动机：公共因子会整除所有整数线性组合。"
      }
    ]
  },
  {
    title: "良序原理：最小元素作为证明起点",
    role: "概念页",
    regions: [
      {
        label: "良序原理",
        script: "非空的正整数集合一定有最小元素。这句话常用来把“存在”证明变成“取最小的那个”。"
      },
      {
        label: "集合直觉",
        script: "如果 S⊆Z⁺ 且 S 非空，就可以写 m=min S，并且对所有 n∈S 都有 m≤n。"
      },
      {
        label: "证明用途",
        script: "当我们能构造一个非空正整数集合时，良序原理允许我们选择最小元素，再利用最小性推出矛盾或结构。"
      },
      {
        label: "带余除法预告",
        script: "带余除法的存在性证明会考虑集合 S={a-bq: q∈Z 且 a-bq≥0}，然后取它的最小元素。"
      },
      {
        label: "注意边界",
        script: "良序原理用于正整数或非负整数集合；它不是说任意实数集合都有最小值。"
      },
      {
        label: "底部问题",
        script: "为什么“取最小反例”经常能把无限情况压缩成一个可处理的对象？"
      }
    ]
  },
  {
    title: "带余除法：存在性证明",
    role: "完整证明页",
    regions: [
      {
        label: "定理目标",
        script: "对 a,b∈Z 且 b>0，要证明存在 q,r∈Z，使 a=bq+r 且 0≤r<b。"
      },
      {
        label: "构造集合",
        script: "令 S={a-bq: q∈Z 且 a-bq≥0}。取 q 足够小，可使 a-bq≥0，所以 S 非空。"
      },
      {
        label: "取最小余数",
        script: "由良序原理，S 有最小元素 r。于是存在 q∈Z，使 r=a-bq，且 r≥0。"
      },
      {
        label: "证明 r<b",
        script: "若 r≥b，则 r-b=a-b(q+1) 仍非负，所以 r-b∈S，但 r-b<r，矛盾于 r 最小。"
      },
      {
        label: "得到存在性",
        script: "因此 0≤r<b，且 a=bq+r。我们已经构造出满足条件的 q,r。"
      },
      {
        label: "底部问题",
        script: "存在性证明里，为什么要先构造所有可能的非负余数，再取最小的一个？"
      }
    ]
  },
  {
    title: "带余除法：唯一性证明",
    role: "完整证明页",
    regions: [
      {
        label: "唯一性目标",
        script: "若 a=bq+r=bq′+r′，且 0≤r,r′<b，要证明 q=q′ 且 r=r′。"
      },
      {
        label: "作差",
        script: "由两个表达式相减得 b(q′-q)=r-r′，因此 b | (r-r′)。"
      },
      {
        label: "余数差范围",
        script: "因为 0≤r,r′<b，所以 -b<r-r′<b。能被 b 整除且绝对值小于 b 的整数只能是 0。"
      },
      {
        label: "得到 r 相等",
        script: "于是 r-r′=0，即 r=r′。"
      },
      {
        label: "得到 q 相等",
        script: "代回 b(q′-q)=0。因为 b>0，所以 q′-q=0，即 q=q′。"
      },
      {
        label: "底部总结",
        script: "存在性靠良序原理；唯一性靠余数范围 0≤r<b 把差值锁死。"
      }
    ]
  },
  {
    title: "例题：证明 3 整除 n³−n",
    role: "例题页",
    regions: [
      {
        label: "目标",
        script: "对任意 n∈Z，证明 3 | (n³-n)。也就是要把 n³-n 写成 3 的整数倍。"
      },
      {
        label: "余数分类",
        script: "由带余除法，n 除以 3 的余数只能是 0,1,2。分别讨论 n=3q, 3q+1, 3q+2。"
      },
      {
        label: "第一类",
        script: "若 n=3q，则 n³-n=27q³-3q=3(9q³-q)，所以 3 整除。"
      },
      {
        label: "第二类",
        script: "若 n=3q+1，代入后 n³-n=(3q+1)³-(3q+1)，每一项整理后都有因子 3。"
      },
      {
        label: "第三类",
        script: "若 n=3q+2，也可直接展开；或注意 3q+2≡-1 (mod 3)，所以 n³-n≡(-1)³-(-1)=0。"
      },
      {
        label: "底部问题",
        script: "为什么分类讨论余数时，证明只需要检查 0,1,2 三种情况？"
      }
    ]
  },
  {
    title: "最大公因数：定义与边界",
    role: "定义页",
    regions: [
      {
        label: "定义",
        script: "gcd(a,b) 是同时整除 a 和 b 的最大正整数。记作 D(a,b)={d∈Z⁺: d|a 且 d|b} 的最大元素。"
      },
      {
        label: "例子",
        script: "gcd(4,6)=2；gcd(15,25)=5；gcd(17,4)=1。"
      },
      {
        label: "互素",
        script: "若 gcd(a,b)=1，则称 a,b 互素。互素不表示没有公共因子，而是只有公共正因子 1。"
      },
      {
        label: "零的情形",
        script: "gcd(a,0)=|a|；特别地 gcd(0,0) 通常不定义。"
      },
      {
        label: "与集合联系",
        script: "gcd 是公共因子集合的最大元素。后面证明 gcd 相等，常常证明两个公共因子集合相同。"
      },
      {
        label: "底部提醒",
        script: "证明 gcd 相等时，不只是在算数字，而是在比较“谁能同时整除这两个数”。"
      }
    ]
  },
  {
    title: "gcd(a,b)=gcd(b,r) 的证明",
    role: "完整证明页",
    regions: [
      {
        label: "命题",
        script: "若 a=bq+r，其中 q,r∈Z，则 gcd(a,b)=gcd(b,r)。这是欧几里得算法的核心命题。"
      },
      {
        label: "方向一",
        script: "若 d|a 且 d|b，因为 r=a-bq，所以 d|r。因此 a,b 的公共因子也是 b,r 的公共因子。"
      },
      {
        label: "方向二",
        script: "若 d|b 且 d|r，因为 a=bq+r，所以 d|a。因此 b,r 的公共因子也是 a,b 的公共因子。"
      },
      {
        label: "公共因子集合相同",
        script: "两边互推说明：a,b 的公共因子集合和 b,r 的公共因子集合完全相同。"
      },
      {
        label: "最大性结论",
        script: "既然公共因子集合相同，它们的最大正元素也相同，所以 gcd(a,b)=gcd(b,r)。"
      },
      {
        label: "底部问题",
        script: "为什么证明两个 gcd 相等时，“公共因子集合相同”比直接计算更根本？"
      }
    ]
  },
  {
    title: "例题：用欧几里得算法求 gcd(616,427)",
    role: "计算证明页",
    regions: [
      {
        label: "题目",
        script: "求 gcd(616,427)。目标不是只给答案，而是展示每一步 gcd 为什么不变。"
      },
      {
        label: "第一步",
        script: "616=427·1+189，所以 gcd(616,427)=gcd(427,189)。"
      },
      {
        label: "第二步",
        script: "427=189·2+49，所以 gcd(427,189)=gcd(189,49)。"
      },
      {
        label: "第三步",
        script: "189=49·3+42，所以 gcd(189,49)=gcd(49,42)。"
      },
      {
        label: "继续到停止",
        script: "49=42·1+7，42=7·6+0。最后非零余数是 7。"
      },
      {
        label: "结论",
        script: "因此 gcd(616,427)=7。每次替换都由 gcd(a,b)=gcd(b,r) 保证。"
      }
    ]
  },
  {
    title: "欧几里得算法为什么会终止",
    role: "证明页",
    regions: [
      {
        label: "算法形状",
        script: "重复写 a=bq+r，然后把 (a,b) 换成 (b,r)。余数序列满足 r₀>r₁>r₂>⋯≥0。"
      },
      {
        label: "余数条件",
        script: "带余除法保证每个余数非负，并且新余数严格小于前一个正除数。"
      },
      {
        label: "递降链",
        script: "如果算法永远不停，就会得到一个无限严格下降的非负整数序列。"
      },
      {
        label: "良序原理",
        script: "非负整数不能无限严格下降；否则这些余数形成的非空集合没有最小元素。"
      },
      {
        label: "停止位置",
        script: "所以某一步余数必须为 0。此时最后一个非零余数就是 gcd(a,b)。"
      },
      {
        label: "底部总结",
        script: "欧几里得算法终止，不是因为例子里碰巧停，而是因为非负整数的良序性。"
      }
    ]
  },
  {
    title: "贝祖等式：存在整数线性组合",
    role: "定理页",
    regions: [
      {
        label: "目标",
        script: "贝祖等式说：若 d=gcd(a,b)，则存在 s,t∈Z，使 d=sa+tb。"
      },
      {
        label: "算法记录",
        script: "欧几里得算法每一步都有 r_{i-1}=q_i r_i+r_{i+1}，所以 r_{i+1}=r_{i-1}-q_i r_i。"
      },
      {
        label: "从最后开始",
        script: "最后非零余数 d 可以写成前两个余数的整数线性组合。"
      },
      {
        label: "逐步回代",
        script: "再把更早的余数表达式代回去，每一步仍保持“整数线性组合”的形式。"
      },
      {
        label: "归纳理解",
        script: "所有余数都是 a,b 的整数线性组合；因此最后非零余数 d 也是。"
      },
      {
        label: "底部问题",
        script: "为什么“反向回代”能把算法的计算结果变成一个存在性证明？"
      }
    ]
  },
  {
    title: "回代求贝祖系数：616x+427y=7",
    role: "完整例题页",
    regions: [
      {
        label: "目标",
        script: "已知 gcd(616,427)=7，求整数 x,y，使 616x+427y=7。"
      },
      {
        label: "欧几里得步骤",
        script: "616=427+189；427=2·189+49；189=3·49+42；49=42+7。"
      },
      {
        label: "从最后开始",
        script: "7=49-42。"
      },
      {
        label: "继续替换",
        script: "42=189-3·49，所以 7=49-(189-3·49)=4·49-189。"
      },
      {
        label: "最终结果",
        script: "49=427-2·189，189=616-427，代回得 7=13·427-9·616。"
      },
      {
        label: "结论",
        script: "所以 x=-9, y=13。回代的目的，是把 gcd 写成原来两个数的线性组合。"
      }
    ]
  },
  {
    title: "贝祖等式的两个推论",
    role: "推论页",
    regions: [
      {
        label: "推论一",
        script: "若 c 是 a,b 的公因数，则 c|gcd(a,b)。证明：由贝祖等式 d=sa+tb，c|a 且 c|b 推出 c|d。"
      },
      {
        label: "推论二",
        script: "若 d>0 是 a,b 的公因数，并且任意公因数 c 都满足 c|d，则 d=gcd(a,b)。"
      },
      {
        label: "互素化",
        script: "令 d=gcd(a,b)。则 gcd(a/d,b/d)=1。否则更大的公共因子会乘回去，矛盾于 d 最大。"
      },
      {
        label: "使用提醒",
        script: "看到线性组合等于 1，常可推出互素；看到互素，常寻找 sa+tb=1。"
      },
      {
        label: "证明地图",
        script: "贝祖等式把“最大公因数”转化为“所有公因数都必须整除它”。"
      },
      {
        label: "底部问题",
        script: "为什么 d=sa+tb 能立刻控制所有同时整除 a,b 的整数？"
      }
    ]
  },
  {
    title: "练习：gcd(3a+2b, a+b)=gcd(a,b)",
    role: "完整练习页",
    regions: [
      {
        label: "题目",
        script: "设 a,b∈Z。证明 gcd(3a+2b, a+b)=gcd(a,b)。提醒：比较最大公因数，可证明两组公共因子相同。"
      },
      {
        label: "设 d",
        script: "令 d=gcd(a,b)。则 d|a 且 d|b。于是 d|(3a+2b)，d|(a+b)，所以 d 是新两数的公共因子。"
      },
      {
        label: "关键目标",
        script: "还需证明：若 c 是 3a+2b 与 a+b 的公共因子，则 c|d。等价地，先推出 c|a 且 c|b。"
      },
      {
        label: "反向消元证明",
        script: "假设 c|(3a+2b) 且 c|(a+b)。则 c|[(3a+2b)-2(a+b)]=a。又 c|(a+b) 且 c|a，所以 c|[(a+b)-a]=b。"
      },
      {
        label: "最大性收束",
        script: "因此任意公共因子 c 都同时整除 a,b，所以 c|gcd(a,b)=d。另一方面 d 已经是新两数公共因子，故新两数的最大公因数正是 d。"
      },
      {
        label: "底部问题",
        script: "这里为什么不是在“计算 gcd”，而是在证明两组公共因子完全相同？"
      }
    ]
  },
  {
    title: "总结：欧几里得算法的证明地图",
    role: "总结页",
    regions: [
      {
        label: "整除翻译",
        script: "整除符号要翻译成整数倍：b|a 等价于存在 k∈Z 使 a=bk。线性组合工具贯穿全节。"
      },
      {
        label: "带余除法",
        script: "带余除法提供 a=bq+r 且 0≤r<b。存在性靠良序原理，唯一性靠余数范围。"
      },
      {
        label: "gcd 不变",
        script: "若 a=bq+r，则 a,b 的公共因子与 b,r 的公共因子完全相同，所以 gcd(a,b)=gcd(b,r)。"
      },
      {
        label: "算法终止",
        script: "余数严格下降且非负，由良序原理不能无限下降，所以算法最终出现余数 0。"
      },
      {
        label: "贝祖回代",
        script: "最后非零余数是 gcd；从最后一步向前回代，可写成 d=sa+tb，其中 s,t∈Z。"
      },
      {
        label: "总结问题",
        script: "欧几里得算法为什么既能算出 gcd，又能证明这个 gcd 可以写成 ax+by 的形式？"
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
      id: 'hand-drawn-chinese-number-theory-proof-notebook-native-markers-v4',
      label: '中文手写 proof-first 数论课笔记，原生四角 marker',
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

  const sourceUrl = `/generated-notebooks/mat102-number-theory-i-v4/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-number-theory-i-v4/recovered/page-${pageNo}-clean.png`;
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
            'MAT102 proof-first 中文手写笔记本：整除、良序原理、带余除法、最大公因数、欧几里得算法与贝祖等式。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '数论', '整除', '良序原理', '带余除法', '最大公因数', '欧几里得算法', '贝祖等式', '证明', '中文', 'proof-first', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：整除、良序原理、带余除法、最大公因数、欧几里得算法与贝祖等式。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '数论', '整除', '良序原理', '带余除法', '最大公因数', '欧几里得算法', '贝祖等式', '证明', '中文', 'proof-first', '原生角标恢复'],
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
  console.log(`Built ${pages.length} MAT102 Number Theory I scenes for ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
