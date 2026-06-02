#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/generated-notebooks/mat102-number-theory-iii-v4');
const SOURCE_DIR = path.join(OUT_DIR, 'source');
const RECOVERED_DIR = path.join(OUT_DIR, 'recovered');
const META_DIR = path.join(OUT_DIR, 'metadata');

const COURSE_ID = 'cmpd5bird007v8ogmjuuiio03';
const OWNER_ID = 'user-dongbochen1218-icloud-com';
const NOTEBOOK_ID = 'mat102-number-theory-iii-modular-proof-v2';
const NOTEBOOK_NAME = '数论 III：同余、模运算与费马小定理（proof-first PPT 版）';

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
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d15dbe7c4819a8c71a5bbefbfd1ea.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0a30b7fc819ab3e31fdac72ec961.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0aa1db68819aa42c9e42f3d8c47c.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0afc82d0819a8df5875889557bbc.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d16403940819aa85af7c9b4036324.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d13e6874c819abec525ffb27297a3.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0c8d5c38819aaa00113ed4238e71.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0cf4c04c819a92122cf97f10a453.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0d6724f4819a9cbd417cdd72a5c3.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d143ce214819aab76632b29a19e29.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d1480aaa8819a9d7f9492cee34b35.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0e724bcc819ab43ad3a59acf6de4.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0ebf183c819a830d320b738e02c5.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d16b55f64819abfc13ee873f945d7.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d0fc4b82c819a81937dbcb315bd20.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d10353a20819abf8f8ab8d809fb37.png",
  "/Users/dongpochen/.codex/generated_images/019e75d6-cfb6-79e3-b03f-a5b299e1302f/ig_08b100bd7bdbc374016a1d10c27a5c819a952327783717d51d.png"
];

function region(label, script) {
  return { label, script };
}

const pages = [
  {
    title: "模运算：把等价关系用起来",
    role: "介绍页",
    regions: [
      {
        label: "目标",
        script: "这一页先建立主线：同余 mod n 是一种等价关系，它把无限多个整数按余数分成有限多组。"
      },
      {
        label: "旧知识",
        script: "等价关系的三个条件仍然是自反、对称、传递；同余的证明会完全回到整除语言。"
      },
      {
        label: "路线",
        script: "本节路线是整除到同余，再到同余类、模运算，最后进入费马小定理。"
      },
      {
        label: "定义",
        script: "核心定义是 a≡b mod n 当且仅当 n 整除 b−a，也就是二者相差 n 的整数倍。"
      },
      {
        label: "运算",
        script: "本节的关键难点是证明加法和乘法在同余类上良定义：换代表元不会改变结果类。"
      },
      {
        label: "问题",
        script: "带着这个问题看全节：为什么把整数按余数分组后，还能继续做代数？"
      }
    ]
  },
  {
    title: "同余的定义与例子",
    role: "定义页",
    regions: [
      {
        label: "定义",
        script: "我们定义 a≡b (mod n) 当且仅当 n|(b−a)。这个定义把同余完全翻译成整除。"
      },
      {
        label: "读法",
        script: "a 与 b 模 n 同余，意思是它们的差是 n 的倍数，而不是说它们大小接近。"
      },
      {
        label: "数轴直觉",
        script: "在数轴上，同一个同余类里的数彼此相隔 n，所以沿着 n 的步长反复出现。"
      },
      {
        label: "例子",
        script: "例如 1≡29 (mod 4)，因为 29−1=28=4·7。"
      },
      {
        label: "同余看余数",
        script: "等价地，两个数除以 n 的余数相同；但证明时常用差被 n 整除。"
      },
      {
        label: "底部问题",
        script: "同余比较的是差，而不是大小；这是后面证明等价关系和良定义的基础。"
      }
    ]
  },
  {
    title: "同余 mod n 是等价关系",
    role: "证明页",
    regions: [
      {
        label: "目标",
        script: "目标是证明模 n 同余满足自反、对称和传递。"
      },
      {
        label: "自反",
        script: "对任意 a，有 a−a=0，而 n|0，所以 a≡a。"
      },
      {
        label: "对称",
        script: "若 a≡b，则 n|(b−a)。由于 a−b=−(b−a)，所以 n|(a−b)，得到 b≡a。"
      },
      {
        label: "传递",
        script: "若 a≡b 且 b≡c，则 n|(b−a) 且 n|(c−b)。"
      },
      {
        label: "得到",
        script: "把两个差相加：c−a=(c−b)+(b−a)，所以 n|(c−a)，因此 a≡c。"
      },
      {
        label: "底部问题",
        script: "这个证明全程只在操作整除关系；同余的外衣下面其实是整除。"
      }
    ]
  },
  {
    title: "同余可以相加",
    role: "证明页",
    regions: [
      {
        label: "命题",
        script: "若 a≡r 且 b≡s mod n，则 a+b≡r+s mod n。"
      },
      {
        label: "翻译假设",
        script: "把同余翻译成整除：r−a=nk，s−b=nℓ，其中 k,ℓ 是整数。"
      },
      {
        label: "相加",
        script: "比较两个和的差：(r+s)−(a+b)=(r−a)+(s−b)。"
      },
      {
        label: "代入",
        script: "代入上面的表达式，得到 nk+nℓ=n(k+ℓ)，所以差被 n 整除。"
      },
      {
        label: "结论",
        script: "因此 n|[(r+s)−(a+b)]，也就是 a+b≡r+s。"
      },
      {
        label: "底部问题",
        script: "良定义证明的核心是：换代表元后，算出的结果仍落在同一个同余类。"
      }
    ]
  },
  {
    title: "同余可以相乘",
    role: "证明页",
    regions: [
      {
        label: "命题",
        script: "若 a≡r 且 b≡s mod n，则 ab≡rs mod n。"
      },
      {
        label: "假设",
        script: "设 r−a=nk，s−b=nℓ。目标是证明 rs−ab 被 n 整除。"
      },
      {
        label: "拆项",
        script: "关键技巧是加减同一项 rb：rs−ab=rs−rb+rb−ab。"
      },
      {
        label: "整理",
        script: "整理为 r(s−b)+b(r−a)，这样每一块都能用上假设。"
      },
      {
        label: "代入",
        script: "代入 s−b=nℓ 与 r−a=nk，得到 n(rℓ+bk)，所以 n|(rs−ab)。"
      },
      {
        label: "问题",
        script: "乘法证明加减 rb，是为了把一个乘积差拆成两个已知能被 n 整除的差。"
      }
    ]
  },
  {
    title: "同余类与 Z_n",
    role: "定义页",
    regions: [
      {
        label: "同余类",
        script: "同余类 [a] 是所有与 a 模 n 同余的整数集合。"
      },
      {
        label: "分组直觉",
        script: "把所有整数按余数分组，同一个组里的数相差 n 的倍数。"
      },
      {
        label: "恰好 n 类",
        script: "模 n 时只有 [0],[1],…,[n−1] 这 n 个不同的同余类。"
      },
      {
        label: "定义 Z_n",
        script: "Z_n=Z/nZ 表示这 n 个同余类组成的集合。"
      },
      {
        label: "代表元",
        script: "同一个同余类可以有不同代表元，例如 [5]_4=[1]_4。"
      },
      {
        label: "底部问题",
        script: "Z_n 只有 n 个元素，因为所有整数最终都被压缩到 n 个余数类里。"
      }
    ]
  },
  {
    title: "Z_4 里的加法和乘法",
    role: "例题页",
    regions: [
      {
        label: "运算规则",
        script: "在 Z_n 中定义 [a]+[b]=[a+b]，并且 [a]·[b]=[ab]。"
      },
      {
        label: "先算再约",
        script: "做法是先在整数里计算，再把结果约回模 n 的同余类。"
      },
      {
        label: "例子",
        script: "例如 [3]_4+[2]_4=[5]_4=[1]_4。"
      },
      {
        label: "乘法例子",
        script: "再如 [3]_4·[2]_4=[6]_4=[2]_4。"
      },
      {
        label: "小表观察",
        script: "小表格帮助我们看到模 4 运算会循环回前面的类。"
      },
      {
        label: "底部问题",
        script: "这些运算不依赖代表元，是因为上一页证明了同余可相加、可相乘。"
      }
    ]
  },
  {
    title: "例题：求 4^441 的最后一位",
    role: "例题页",
    regions: [
      {
        label: "问题",
        script: "要求 4^441 的最后一位，本质上是求它模 10 的余数。"
      },
      {
        label: "转化",
        script: "最后一位数字 d 满足 d≡4^441 (mod 10)。"
      },
      {
        label: "周期观察",
        script: "4 的幂模 10 在 4 和 6 之间循环：奇数次是 4，偶数次是 6。"
      },
      {
        label: "看指数奇偶",
        script: "由于 441 是奇数，所以应落在周期中的 4。"
      },
      {
        label: "结论",
        script: "因此 4^441≡4 (mod 10)，最后一位是 4。"
      },
      {
        label: "底部问题",
        script: "找周期能避开巨大幂的直接计算，是模运算最实用的技巧之一。"
      }
    ]
  },
  {
    title: "模 p 消去律",
    role: "证明页",
    regions: [
      {
        label: "消去律",
        script: "若 gcd(p,x)=1 且 mx≡nx (mod p)，则可以推出 m≡n (mod p)。"
      },
      {
        label: "翻译",
        script: "由 mx≡nx 得到 p|(mx−nx)。"
      },
      {
        label: "提出 x",
        script: "把差写成 mx−nx=(m−n)x。"
      },
      {
        label: "互素引理",
        script: "因为 p 与 x 互素，且 p|(m−n)x，所以 p|(m−n)。"
      },
      {
        label: "结论",
        script: "p|(m−n) 正是 m≡n (mod p)。"
      },
      {
        label: "底部问题",
        script: "能不能消去 x，关键不在 x 是否非零，而在它是否与模数互素。"
      }
    ]
  },
  {
    title: "消去律为什么需要条件",
    role: "反例页",
    regions: [
      {
        label: "错误想法",
        script: "不能看到 mx≡nx 就自动把 x 消掉。"
      },
      {
        label: "反例",
        script: "在模 4 下，3·2≡1·2。"
      },
      {
        label: "为什么成立",
        script: "因为 6≡2 (mod 4)，所以两边乘积确实同余。"
      },
      {
        label: "消去后错了",
        script: "但 3 不同余于 1 mod 4。"
      },
      {
        label: "失败原因",
        script: "原因是 gcd(4,2)=2，不是 1；2 在模 4 下不可消去。"
      },
      {
        label: "底部问题",
        script: "这就是零因子带来的失败：乘了同一个数后，信息可能被压扁。"
      }
    ]
  },
  {
    title: "费马小定理：排列思想",
    role: "证明页",
    regions: [
      {
        label: "定理目标",
        script: "若 p 是素数且 p 不整除 a，则要证明 a^{p−1}≡1 mod p。"
      },
      {
        label: "看非零类",
        script: "先看模 p 的非零类：1,2,…,p−1。"
      },
      {
        label: "乘 a",
        script: "把每个数乘以 a，得到 a,2a,…,(p−1)a。"
      },
      {
        label: "无重复",
        script: "如果 ma≡na，因为 a 可消去，就得到 m≡n，因此这些结果没有重复。"
      },
      {
        label: "重排",
        script: "没有重复且数量相同，所以乘 a 后只是把非零类重新排列了一遍。"
      },
      {
        label: "底部问题",
        script: "这一页的核心是“乘 a”不会让两个不同的非零类撞在一起。"
      }
    ]
  },
  {
    title: "费马小定理：乘积证明收束",
    role: "证明页",
    regions: [
      {
        label: "重排结论",
        script: "由上一页，a,2a,…,(p−1)a 是 1,2,…,p−1 的重排。"
      },
      {
        label: "乘起来",
        script: "把这些非零类全部相乘，左右乘积仍同余。"
      },
      {
        label: "提出 a",
        script: "左边可写成 (p−1)!·a^{p−1}，右边是 (p−1)!。"
      },
      {
        label: "可消去",
        script: "因为 p 是素数，p 不整除 1 到 p−1 的任何数，所以 gcd(p,(p−1)!)=1。"
      },
      {
        label: "定理",
        script: "消去 (p−1)! 后得到 a^{p−1}≡1 (mod p)。"
      },
      {
        label: "底部问题",
        script: "(p−1)! 可以消去，是因为它和素数 p 互素。"
      }
    ]
  },
  {
    title: "费马小定理推论：a^p≡a",
    role: "推论页",
    regions: [
      {
        label: "推论",
        script: "对任意整数 a 和素数 p，都有 a^p≡a (mod p)。"
      },
      {
        label: "情况一",
        script: "若 p|a，则 a≡0，因此 a^p≡0≡a。"
      },
      {
        label: "情况二",
        script: "若 p 不整除 a，则由费马小定理 a^{p−1}≡1。"
      },
      {
        label: "乘回 a",
        script: "两边乘以 a，得到 a^p=a·a^{p−1}≡a。"
      },
      {
        label: "结论",
        script: "两种情况覆盖所有整数 a，所以推论成立。"
      },
      {
        label: "底部问题",
        script: "推论没有 p∤a 的限制，是因为 p|a 的情况可以单独直接处理。"
      }
    ]
  },
  {
    title: "Z_p 中非零元素都有逆元",
    role: "定理页",
    regions: [
      {
        label: "定理",
        script: "若 p 是素数，则 Z_p 中每个非零同余类都有乘法逆元。"
      },
      {
        label: "非零",
        script: "[a] 非零意味着 p 不整除 a。"
      },
      {
        label: "费马",
        script: "由费马小定理，a^{p−1}≡1 (mod p)。"
      },
      {
        label: "构造",
        script: "把左边写成 a·a^{p−2}，就得到一个乘法逆元。"
      },
      {
        label: "逆元",
        script: "因此 [a]^{-1}=[a^{p−2}]。"
      },
      {
        label: "底部问题",
        script: "素数模数下非零类都可逆，因为它们都与 p 互素，不会成为零因子。"
      }
    ]
  },
  {
    title: "例题：求 [22] 在 Z_41 中的逆元",
    role: "例题页",
    regions: [
      {
        label: "题目",
        script: "目标是在 Z_41 中找到 [22] 的乘法逆元。"
      },
      {
        label: "目标",
        script: "也就是找 x，使 22x≡1 (mod 41)。"
      },
      {
        label: "欧几里得",
        script: "用欧几里得算法：41=22+19，22=19+3，19=6·3+1。"
      },
      {
        label: "回代",
        script: "从 1=19−6·3 开始，把 3 和 19 逐步换回 22 与 41。"
      },
      {
        label: "继续",
        script: "整理得到 1=7·41−13·22。"
      },
      {
        label: "答案",
        script: "所以 22(−13)≡1，逆元是 [−13]=[28]。"
      }
    ]
  },
  {
    title: "练习地图：幂、数字根与平方剩余",
    role: "应用总结页",
    regions: [
      {
        label: "幂的最后一位",
        script: "求幂的最后一位时，先在模 10 下找周期，再看指数。"
      },
      {
        label: "例题方向",
        script: "题目如 7^100, 3^1111, 4^223, 8^400 都用周期处理。"
      },
      {
        label: "数字根",
        script: "数字根可由 r(n)=1+[(n−1) mod 9] 描述。"
      },
      {
        label: "9 的技巧",
        script: "因为 10≡1 (mod 9)，所以 10^n−1 总能被 9 整除。"
      },
      {
        label: "平方 mod 4",
        script: "任意整数平方模 4 只可能是 0 或 1。"
      },
      {
        label: "底部问题",
        script: "做模运算练习时，先判断结构：周期、代表元、可消去性，还是平方剩余。"
      }
    ]
  },
  {
    title: "总结：模运算证明地图",
    role: "总结页",
    regions: [
      {
        label: "同余定义",
        script: "a≡b (mod n) 的本质是 n 整除 b−a。"
      },
      {
        label: "等价关系",
        script: "自反、对称、传递都来自整除的基本性质。"
      },
      {
        label: "证明地图",
        script: "本节主线是同余、同余类、良定义运算、消去律、费马小定理。"
      },
      {
        label: "良定义",
        script: "加法与乘法能在同余类上定义，是因为同余关系能和加乘兼容。"
      },
      {
        label: "素数模数",
        script: "在 Z_p 中，非零元素可消去且有逆元，这是素数模数的特殊性。"
      },
      {
        label: "带走问题",
        script: "模运算把无限整数压缩成有限余数世界，但证明仍然靠整除。"
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
      id: 'hand-drawn-chinese-number-theory-iii-modular-proof-ppt-native-markers-v4',
      label: '中文手写 proof-first 模运算 PPT 笔记，原生四角 marker',
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

  const sourceUrl = `/generated-notebooks/mat102-number-theory-iii-v4/source/page-${pageNo}-source.png`;
  const cleanUrl = `/generated-notebooks/mat102-number-theory-iii-v4/recovered/page-${pageNo}-clean.png`;
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
            'MAT102 proof-first 中文手写笔记本：同余、同余类、模运算、消去律、费马小定理与乘法逆元。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '数论', '同余', '模运算', '同余类', '费马小定理', '乘法逆元', '证明', '中文', 'proof-first', 'PPT感', '原生角标恢复'],
          language: 'zh-CN',
          style: 'hand-drawn-proof-notebook-native-marker-recovery-v4',
        },
        create: {
          id: NOTEBOOK_ID,
          ownerId: OWNER_ID,
          courseId: COURSE_ID,
          name: NOTEBOOK_NAME,
          description:
            'MAT102 proof-first 中文手写笔记本：同余、同余类、模运算、消去律、费马小定理与乘法逆元。source 图含原生可恢复四角 marker，clean 图为去角标课堂版本。',
          tags: ['MAT102', '数论', '同余', '模运算', '同余类', '费马小定理', '乘法逆元', '证明', '中文', 'proof-first', 'PPT感', '原生角标恢复'],
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
  console.log(`Built ${pages.length} MAT102 Number Theory III scenes for ${NOTEBOOK_ID}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
