#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PUBLIC_GENERATED_NOTEBOOKS_ROOT } from '../shared/paths.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const OUTPUT_ROOT = PUBLIC_GENERATED_NOTEBOOKS_ROOT;
const HOTSPOT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';

const NOTEBOOK_SPECS = {
  'nb-cpsc107-racket-basics-week1-20260519024537': {
    title: 'Racket 基础',
    logline: '把 Racket 程序读成表达式、求值规则、数据类型和函数调用的组合。',
    centralQuestion: '看到一段 Racket 代码时，怎样判断它会先算哪里、得到什么值？',
    closingCallback: '读代码先找最外层 operator，再看 operand、类型、分支和函数调用顺序。',
  },
  'nb-cpsc107-htdf-htdd-week2-20260519043417': {
    title: 'HTDF + HTDD',
    logline: '用设计配方把题目、数据定义、模板和函数体连成可检查的过程。',
    centralQuestion: '从题目到代码，中间每一步为什么必须先设计出来？',
    closingCallback: '先写清函数承诺，再让数据形状推出模板，最后才填函数体。',
  },
  'nb-cpsc107-ref-self-ref-week4-20260519140849': {
    title: 'Reference + Self-Reference',
    logline: '从字段类型读出 helper call、base case 和 recursive call。',
    centralQuestion: '字段指向别的 HTDD，还是回到同一个 HTDD？代码模板应该怎样跟着变？',
    closingCallback: '先标出字段类型，再决定直接使用、调用 helper，还是递归处理 rest。',
  },
  'nb-cpsc107-recursion-bst-imagegen-20260522': {
    title: '递归、Helper 与 BST',
    logline: '用 base case、更小问题、helper 边界和 BST invariant 组织递归代码。',
    centralQuestion: '每一次递归调用为什么会停，又为什么只需要处理这个更小的问题？',
    closingCallback: '递归题先找停止情形，再找变小的位置，最后看当前层怎样组合返回值。',
    generatedCodeFocus: true,
  },
  'nb-cpsc107-trees-mutual-recursion-imagegen-20260522': {
    title: 'Trees 与 Mutual Recursion',
    logline: '把互相引用的数据定义翻译成一组互相调用的函数模板。',
    centralQuestion: '当数据定义互相指向时，函数调用图应该怎样跟着数据箭头走？',
    closingCallback: '互相递归题先画数据箭头，再让每个数据定义拥有自己的函数职责。',
    generatedCodeFocus: true,
  },
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

function labelFor(element) {
  const raw = element.label || element.title || element.name || element.text || element.id || '';
  return String(raw)
    .replace(/^semantic-hit-map:\s*/, '')
    .trim();
}

function generatedShape(id, label, left, top, width, height) {
  return {
    id,
    name: `lecture-focus-generated: ${label}`,
    label,
    type: 'shape',
    left,
    top,
    width,
    height,
    rotate: 0,
    lock: true,
    viewBox: [200, 200],
    path: HOTSPOT_PATH,
    fixedRatio: false,
    fill: '#ffffff',
    opacity: 0,
    outline: { color: '#ffffff', width: 0, style: 'solid' },
  };
}

function stripGenerated(elements) {
  return elements.filter(
    (element) => !String(element?.id || '').includes('lecture-focus-generated'),
  );
}

function pageLabel(order) {
  return String(order + 1).padStart(2, '0');
}

function coverFocuses(notebookId, order) {
  const prefix = `${notebookId}-s${pageLabel(order)}-lecture-focus-generated`;
  return [
    generatedShape(`${prefix}-cover-title`, '封面标题', 40, 34, 920, 120),
    generatedShape(`${prefix}-cover-route`, '本节路线', 70, 170, 860, 245),
    generatedShape(`${prefix}-cover-takeaway`, '进入下一页', 70, 455, 860, 78),
  ];
}

function codeFocuses(notebookId, scene, rightBoard) {
  const page = pageLabel(scene.order);
  const left = rightBoard.left + 12;
  const top = rightBoard.top + 14;
  const width = Math.max(120, rightBoard.width - 24);
  const gap = 10;
  const rowHeight = Math.max(42, (rightBoard.height - 28 - gap * 2) / 3);
  const prefix = `${notebookId}-s${page}-lecture-focus-generated`;
  return [
    generatedShape(`${prefix}-code-entry`, '代码入口与函数职责', left, top, width, rowHeight),
    generatedShape(
      `${prefix}-code-branch`,
      '分支、字段或当前 case',
      left,
      top + rowHeight + gap,
      width,
      rowHeight,
    ),
    generatedShape(
      `${prefix}-code-recursive`,
      '递归调用、helper call 或返回值',
      left,
      top + (rowHeight + gap) * 2,
      width,
      rowHeight,
    ),
  ];
}

function focusElementsForScene(spec, notebookId, scene) {
  const canvas = scene.content?.canvas || {};
  const original = stripGenerated(canvas.elements || []);
  const shapeElements = original.filter((element) => element.type === 'shape');

  if (!shapeElements.length) {
    const generated = coverFocuses(notebookId, scene.order);
    return {
      elements: [...original, ...generated],
      focuses: generated,
      generatedCount: generated.length,
    };
  }

  if (!spec.generatedCodeFocus) {
    return { elements: original, focuses: shapeElements, generatedCount: 0 };
  }

  const title = shapeElements.find((element) => /title/.test(element.id));
  const leftBoard = shapeElements.find((element) => /left-board/.test(element.id));
  const rightBoard = shapeElements.find((element) => /right-board/.test(element.id));
  const takeaway = shapeElements.find((element) => /takeaway/.test(element.id));

  if (!rightBoard) {
    return { elements: original, focuses: shapeElements, generatedCount: 0 };
  }

  const generated = codeFocuses(notebookId, scene, rightBoard);
  const focuses = [title, leftBoard, ...generated, takeaway].filter(Boolean);
  return { elements: [...original, ...generated], focuses, generatedCount: generated.length };
}

function directTitle(text) {
  return String(text)
    .replace(/\bbase case\b/gi, '停止情形')
    .replace(/\bbase cases\b/gi, '停止情形')
    .replace(/\brecursive call\b/gi, '递归调用')
    .replace(/\bhelper call\b/gi, '辅助函数调用')
    .replace(/\bhelper template\b/gi, '辅助模板')
    .replace(/\bself-reference\b/gi, '自引用')
    .replace(/\bmutual-reference\b/gi, '互相引用')
    .replace(/\breference\b/gi, '引用')
    .replace(/\bbody\b/gi, '函数体')
    .replace(/\btemplate\b/gi, '模板')
    .replace(/\bstub\b/gi, '空壳')
    .replace(/\bsignature\b/gi, '签名')
    .replace(/\bpurpose\b/gi, '目的说明')
    .replace(/\bexamples\b/gi, '例子')
    .replace(/\bcheck-expect\b/gi, 'check expect')
    .replace(/\bdefine-struct\b/gi, 'define struct')
    .replace(/\bsum--node\b/g, 'sum node')
    .replace(/\bsum--lon\b/g, 'sum list of node')
    .replace(/\bgreater-than--node\b/g, 'greater than node')
    .replace(/\bgreater-than--lon\b/g, 'greater than list of node')
    .replace(/\ball-course-numbers\b/g, 'all course numbers')
    .replace(/\blookup-key\b/g, 'lookup key')
    .replace(/\bListOfInteger\b/g, '整数列表')
    .replace(/\bListOfString\b/g, '字符串列表')
    .replace(/\bListOfBook\b/g, '书本列表')
    .replace(/\bListOfDot\b/g, '点列表')
    .replace(/\bListOfCourse\b/g, '课程列表')
    .replace(/\bListOfNode\b/g, '节点列表')
    .replace(/\bHTDF\b/g, 'HTDF')
    .replace(/\bHTDD\b/g, 'HTDD')
    .replace(/模板\s+模板/g, '模板')
    .replace(/空壳\s+空壳/g, '空壳')
    .replace(/函数体\s+函数体/g, '函数体')
    .replace(/例子\s+例子/g, '例子');
}

function cleanSpeech(text) {
  return directTitle(String(text ?? ''))
    .replaceAll('让学生看到', '你先看见')
    .replaceAll('让学生知道', '你先知道')
    .replaceAll('让学生把', '我们先把')
    .replaceAll('让学生', '我们先')
    .replaceAll('学生', '你')
    .replaceAll('讲的时候', '这里')
    .replace(/[{}_^√∫θΔπαβγλμσΣΩ∞≈≤≥≠±×÷<>]/g, ' ')
    .replace(/=>/g, '推出')
    .replace(/->/g, '到')
    .replace(/\s+([。！？；：，])/g, '$1')
    .replace(/([。！？；：，])\s+/g, '$1')
    .replace(/模板模板/g, '模板')
    .replace(/空壳空壳/g, '空壳')
    .replace(/函数体函数体/g, '函数体')
    .replace(/例子例子/g, '例子')
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .trim();
}

function focusKind(scene, focus) {
  const label = labelFor(focus);
  const shortId = String(focus.id || '').replace(/^.*-s\d{2}-/, '');
  const focusText = `${label} ${shortId}`.toLowerCase();
  const sceneText = String(scene.title || '').toLowerCase();
  const haystack = `${sceneText} ${focusText}`;

  if (/code-entry/.test(focusText)) return 'codeEntry';
  if (/code-branch/.test(focusText)) return 'codeBranch';
  if (/code-recursive/.test(focusText)) return 'codeRecursive';
  if (/cover|封面/.test(focusText)) return 'cover';
  if (/title|标题/.test(focusText)) return 'title';
  if (/purpose|目的/.test(focusText)) return 'purpose';
  if (/signature|签名/.test(focusText)) return 'signature';
  if (/example|check|例子|测试/.test(focusText)) return 'examples';
  if (/stub|空壳/.test(focusText)) return 'stub';
  if (/template|模板/.test(focusText)) return 'template';
  if (/body|函数体|final/.test(focusText)) return 'body';
  if (/cond|case|branch|分支|guard|predicate|if|判断/.test(focusText)) return 'branch';
  if (/selector|字段|拆字段/.test(focusText)) return 'selector';
  if (/helper|ref|reference|辅助|引用/.test(focusText)) return 'helper';
  if (/trace|evaluation|ladder|求值|化简|调用/.test(focusText)) return 'trace';
  if (/takeaway|summary|总结|钩子|insight|note|rule|底部/.test(focusText)) return 'takeaway';

  if (/htdd|atomic|interval|one-of|enumeration|itemization|compound|data-definition/.test(haystack))
    return 'data';
  if (/data-definition|definition|数据定义|define-struct|struct|字段|field|compound/.test(haystack))
    return 'data';
  if (/cond|case|branch|分支|guard|predicate|if|判断/.test(haystack)) return 'branch';
  if (/selector|字段|拆字段/.test(haystack)) return 'selector';
  if (/recursive|recursion|self-ref|rest|base case|empty|false|递归|自引用|停止/.test(haystack))
    return 'recursive';
  if (/helper|ref|reference|辅助|引用/.test(haystack)) return 'helper';
  if (/trace|evaluation|ladder|求值|化简|调用/.test(haystack)) return 'trace';
  if (/bst|lookup|invariant/.test(haystack)) return 'bst';
  if (/tree|node|left|right|树/.test(haystack)) return 'tree';
  if (/operator|operand|primitive|boolean|string|image|type|value|表达式|类型/.test(haystack))
    return 'racket';
  return 'generic';
}

function fromPrevious(spec, scenes, order) {
  if (order === 0) {
    return `这本《${spec.title}》先抓住一个主问题：${spec.centralQuestion}`;
  }
  return `上一页《${directTitle(scenes[order - 1].title)}》先铺好一个动作，现在这一页继续推进到《${directTitle(scenes[order].title)}》。`;
}

function nextLine(spec, scenes, order) {
  if (order === scenes.length - 1) {
    return `最后把这本课收束成一句话：${spec.closingCallback}`;
  }
  return `下一页进入《${directTitle(scenes[order + 1].title)}》，刚才这个判断会变成下一步写代码或追踪代码的依据。`;
}

function mainMoveForScene(scene) {
  const title = scene.title;
  if (/HTDD|Atomic|Interval|One-of|Enumeration|Itemization|Compound|Template Rules/.test(title)) {
    return '这一页要把数据形状和函数形状接起来：数据怎么长，模板就怎么长。';
  }
  if (/HTDF|Purpose|Signature|Examples|Stub|Template|Body|函数设计/.test(title)) {
    return '这一页的重点不是背格式，而是看见函数设计为什么必须按顺序展开。';
  }
  if (/Reference|ref|self-ref|List|Waldo|Peat|Dot|Book/.test(title)) {
    return '这一页要靠字段类型做判断：直接使用、调用 helper，还是递归处理。';
  }
  if (/递归|Fibonacci|factorial|List|Helper|BST|lookup|Tree|sum|greater|Course/.test(title)) {
    return '这一页要沿着递归三问走：哪里停，哪里变小，返回以后怎么组合。';
  }
  if (/Racket|Operator|Boolean|String|Image|Function|if|cond|求值|调用/.test(title)) {
    return '这一页要训练读代码顺序：先找 operator，再看 operand、类型和求值顺序。';
  }
  return '这一页继续把概念落实成可执行的判断动作。';
}

function explanationForKind(kind, scene, focus, spec, isLastFocus) {
  const label = directTitle(labelFor(focus));
  const title = directTitle(scene.title);
  const lines = [];

  switch (kind) {
    case 'cover':
      lines.push(`先看封面，这里不是开场装饰，而是在告诉你《${spec.title}》要训练哪一种编程动作。`);
      lines.push(`带着这个问题往后看：${spec.centralQuestion}`);
      break;
    case 'title':
      lines.push(
        `先看标题区。这一页叫《${title}》，它在本节主线里的任务是：${mainMoveForScene(scene)}`,
      );
      lines.push(`本节主线先放在心里：${spec.logline}`);
      break;
    case 'purpose':
      lines.push(
        '先看 purpose。它不是一句注释装饰，而是在 body 出现之前，先承诺这个函数到底要做什么。',
      );
      lines.push('如果 purpose 说不清，后面的例子和函数体很容易各写各的。');
      break;
    case 'signature':
      lines.push('现在看 signature。这里先限定输入和输出类型，等于给函数画出边界。');
      lines.push('写函数体之前先看签名，可以避免把数字、字符串、真假值或图片混在一起。');
      break;
    case 'examples':
      lines.push('现在看 examples 或 check expect。这里先把“什么算对”固定下来。');
      lines.push('函数体还没写完时，例子已经在提醒你：最后代码必须回到这些具体行为上。');
      break;
    case 'stub':
      lines.push('现在看 stub。空壳的作用不是解决问题，而是先返回一个类型正确的占位值。');
      lines.push('有了空壳，就可以尽早运行检查，确认函数接口和例子已经连得上。');
      break;
    case 'template':
      lines.push('现在看 template。模板不是凭感觉写出来的，它是由数据定义逼出来的代码骨架。');
      lines.push('看到模板里的分支、selector 或递归调用，要回头问：它对应数据定义里的哪一块？');
      break;
    case 'body':
      lines.push('现在才看 body。函数体是在模板已经摆好之后，填入真正计算或判断逻辑。');
      lines.push('这里最容易错的是太早写 body；正确顺序是先有承诺、例子和模板，再填实现。');
      break;
    case 'data':
      lines.push(
        `现在看 ${label || '数据定义'}。先别写函数，先读这个数据有哪些可能形状、哪些字段。`,
      );
      lines.push(
        '字段类型决定后面的模板动作：原子值直接用，compound 要 selector，别的 HTDD 要 helper。',
      );
      break;
    case 'branch':
      lines.push('现在看分支或 case。每个分支都应该对应一个清楚的问题，而不是随便排几行条件。');
      lines.push('读 cond 时按顺序检查：这一行的问题是什么，满足后返回什么，没满足才进入下一行。');
      break;
    case 'selector':
      lines.push(
        '现在看 selector。compound data 不能凭感觉取字段，必须用对应 selector 把字段拆出来。',
      );
      lines.push('selector 这一行通常就是数据定义和函数体真正接上的位置。');
      break;
    case 'recursive':
      lines.push('现在看递归位置。先找停止情形，再找哪一部分变成了更小的问题。');
      lines.push('递归调用不是重复自己这么简单，它必须朝着停止情形靠近。');
      break;
    case 'helper':
      lines.push(
        '现在看 helper 或引用位置。字段如果是另一个 HTDD，就不要在这里硬展开，交给对应 helper。',
      );
      lines.push('这样做的好处是每个函数只负责自己的数据形状，代码不会混成一团。');
      break;
    case 'trace':
      lines.push('现在按 trace 的顺序读。先确认当前 frame 正在处理什么输入，再看下一步调用哪里。');
      lines.push('trace 不是为了报答案，而是为了看见每一层调用怎样进入、返回和组合。');
      break;
    case 'tree':
      lines.push('现在看树结构。先分清当前 node、它的 value，以及它下面还有哪些 children。');
      lines.push('树递归的重点是：当前节点做一件事，子节点列表交给另一个函数或递归过程继续处理。');
      break;
    case 'bst':
      lines.push('现在看 BST 结构。先分清当前节点、左边子树、右边子树，以及空树的停止情形。');
      lines.push('BST 页还要多问一句：这一步有没有利用左小右大的 invariant 排除不可能的方向？');
      break;
    case 'racket':
      lines.push('现在按 Racket 的读法来：先找这一块里的 operator，再看它后面的 operands。');
      lines.push('不要被括号数量吓到。每一层 list 都先问第一个位置是谁，它决定这一层怎么求值。');
      break;
    case 'codeEntry':
      lines.push('这一小块先看代码入口：函数名、输入变量或当前数据定义先告诉你这段代码负责什么。');
      lines.push('在写下一行之前，先确认它处理的是哪一种数据形状。');
      break;
    case 'codeBranch':
      lines.push('这一小块看中间分支。先判断当前 case 是停止情形、字段拆分，还是某个条件判断。');
      lines.push('如果这里是 cond，每一行都要能说出它在问什么问题。');
      break;
    case 'codeRecursive':
      lines.push(
        '这一小块看递归调用、helper call 或返回值。这里决定当前层怎样把子问题答案接回来。',
      );
      lines.push('读到这一行时，先问它有没有变小，再问返回结果会怎样被当前层组合。');
      break;
    case 'takeaway':
      lines.push(`最后看 ${label || '总结'}。这里把本页收成一个可复用动作，而不是再背一个术语。`);
      break;
    default:
      lines.push(`现在看 ${label || '这个区域'}。先确定这里是在给定义、例子、代码，还是执行过程。`);
      lines.push('把这块读成一个动作：它让后面的函数设计或代码追踪多了一步可检查依据。');
      break;
  }

  if (isLastFocus) {
    lines.push(nextLine(spec, spec.currentScenes, scene.order));
  }

  return lines;
}

function buildActions(spec, notebookId, scenes, scene, focuses) {
  const actions = [];
  let speechIndex = 1;

  focuses.forEach((focus, focusIndex) => {
    const kind = focusKind(scene, focus);
    const label = directTitle(labelFor(focus));
    const isLastFocus = focusIndex === focuses.length - 1;
    actions.push({
      id: `${scene.id}-spotlight-cpsc107-${String(focusIndex + 1).padStart(2, '0')}`,
      type: 'spotlight',
      title: `聚焦：${label || '当前区域'}`,
      elementId: focus.id,
      padding: 12,
    });

    const lines =
      focusIndex === 0
        ? [
            `${fromPrevious(spec, scenes, scene.order)} ${mainMoveForScene(scene)}`,
            `先看这个区域，整页都围绕这个主问题展开：${spec.centralQuestion}`,
            ...(['title', 'cover'].includes(kind)
              ? []
              : explanationForKind(kind, scene, focus, spec, false).slice(0, 1)),
          ]
        : explanationForKind(kind, scene, focus, spec, isLastFocus);

    for (const line of lines) {
      actions.push({
        id: `${scene.id}-speech-cpsc107-${String(speechIndex).padStart(2, '0')}`,
        type: 'speech',
        title: `讲解：${directTitle(scene.title)} ${speechIndex}`,
        text: cleanSpeech(line),
      });
      speechIndex += 1;
    }
  });

  return actions;
}

function validateScene(scene) {
  const elementIds = new Set(
    (scene.content?.canvas?.elements || []).map((element) => element?.id).filter(Boolean),
  );
  const ids = new Set();
  const distant =
    /学生|讲的时候|让学生|学习者|听众|用户|课堂停顿|帮学生|学生应该|学生会|可以让学生/;
  const badSymbols = /[{}_^√∫θΔπαβγλμσΣΩ∞≈≤≥≠±×÷]|=>|<=|>=|[<>]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/;
  const templateSmell = /这一页解决什么问题|右侧例题或图像|不是孤立概念/;

  for (const action of scene.actions || []) {
    if (action.id) {
      if (ids.has(action.id)) throw new Error(`${scene.title}: duplicate action id ${action.id}`);
      ids.add(action.id);
    }
    if (action.type === 'spotlight' && !elementIds.has(action.elementId)) {
      throw new Error(`${scene.title}: invalid spotlight target ${action.elementId}`);
    }
    if (action.type !== 'speech') continue;
    const text = action.text || '';
    if (distant.test(text)) throw new Error(`${scene.title}: distant style in "${text}"`);
    if (badSymbols.test(text))
      throw new Error(`${scene.title}: TTS-unfriendly symbol in "${text}"`);
    if (templateSmell.test(text)) throw new Error(`${scene.title}: template smell in "${text}"`);
  }
}

function writeArtifacts(notebookId, scenes) {
  const outputDir = path.join(OUTPUT_ROOT, notebookId);
  if (!fs.existsSync(outputDir)) return false;

  const scenesPath = path.join(outputDir, 'notebook-scenes.json');
  if (fs.existsSync(scenesPath)) {
    const fileScenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));
    const nextFileScenes = fileScenes.map((scene) => {
      const updated = byId.get(scene.id);
      if (!updated) return scene;
      return { ...scene, content: updated.content, actions: updated.actions };
    });
    fs.writeFileSync(scenesPath, JSON.stringify(nextFileScenes, null, 2));
  }

  fs.writeFileSync(
    path.join(outputDir, 'scene-actions.json'),
    JSON.stringify(
      scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        order: scene.order,
        actions: scene.actions,
      })),
      null,
      2,
    ),
  );
  return true;
}

async function main() {
  loadEnvLocal();
  const prisma = new PrismaClient();

  try {
    let totalScenes = 0;
    let totalSpeech = 0;
    let totalSpotlights = 0;
    let totalGeneratedFocuses = 0;
    let artifactCount = 0;

    for (const [notebookId, spec] of Object.entries(NOTEBOOK_SPECS)) {
      const notebook = await prisma.notebook.findUnique({
        where: { id: notebookId },
        include: { scenes: { orderBy: { order: 'asc' } } },
      });
      if (!notebook) throw new Error(`Notebook not found: ${notebookId}`);
      spec.currentScenes = notebook.scenes;

      const updatedScenes = notebook.scenes.map((scene) => {
        const { elements, focuses, generatedCount } = focusElementsForScene(
          spec,
          notebookId,
          scene,
        );
        totalGeneratedFocuses += generatedCount;
        const nextScene = {
          ...scene,
          content: {
            ...scene.content,
            canvas: {
              ...(scene.content?.canvas || {}),
              elements,
            },
          },
        };
        nextScene.actions = buildActions(spec, notebookId, notebook.scenes, nextScene, focuses);
        validateScene(nextScene);
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
            data: { content: scene.content, actions: scene.actions },
          });
        }
        await prisma.notebook.update({
          where: { id: notebookId },
          data: { updatedAt: new Date() },
        });
        if (writeArtifacts(notebookId, updatedScenes)) artifactCount += 1;
      }

      totalScenes += updatedScenes.length;
      totalSpeech += speechTotal;
      totalSpotlights += spotlightTotal;
      console.log(
        `${DRY_RUN ? 'Would update' : 'Updated'} ${notebook.name}: ${updatedScenes.length} scenes, ${speechTotal} speech, ${spotlightTotal} spotlights`,
      );
    }

    console.log(
      `${DRY_RUN ? 'Would update' : 'Updated'} CPSC107 total: ${totalScenes} scenes, ${totalSpeech} speech, ${totalSpotlights} spotlights, ${totalGeneratedFocuses} generated focus boxes, ${artifactCount} artifact dirs`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
