import { normalizeSceneOutlineContentProfile } from '@/lib/generation/content-profile';
import { createLineElement, createTextElement } from '@/lib/notebook-content/slide-element-factory';
import { escapeHtml } from '@/lib/notebook-content/inline-html';
import { nanoid } from 'nanoid';
import type { Action } from '@/lib/types/action';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { PPTElement, SlideTheme } from '@/lib/types/slides';

export const TITLE_COVER_OUTLINE_ID = 'scene_title_cover';

const TITLE_COVER_MARKER = 'syntara:title-only-cover';
const TITLE_COVER_VERSION_MARKER = 'syntara-cover-v14';
const LEGACY_TITLE_COVER_VERSION_RE = /syntara-cover-v(?:[2-9]|10|11|12|13)/;
const TITLE_COVER_OPENING_ACTION_MARKER = 'syntara-title-cover-opening-v3';
const COVER_TITLE_ELEMENT_NAME = 'syntara-cover-title';

type CoverVisualStyle = 'cinematic' | 'network' | 'archive';

function normalizeGeneratedCourseTitle(title: string): string {
  return title
    .replace(/面向对象程序设计\s*转\s*PPT/gi, '面向对象程序设计')
    .replace(/\s*转\s*PPT\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCoverTitleLines(title: string, language: 'zh-CN' | 'en-US'): string[] {
  const normalized = normalizeGeneratedCourseTitle(title);
  const colonMatch = normalized.match(/^(.{2,18}[：:])\s*(.{2,})$/);
  if (colonMatch) return [colonMatch[1], colonMatch[2]];

  const compactLength = normalized.replace(/\s+/g, '').length;
  const targetLength = language === 'en-US' ? 26 : 14;
  if (compactLength <= targetLength) return [normalized];

  const punctuation = language === 'en-US' ? /[,;/-]/g : /[，、；：:]/g;
  const candidates = [...normalized.matchAll(punctuation)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= Math.floor(normalized.length * 0.35))
    .filter((index) => index <= Math.ceil(normalized.length * 0.68));
  const spaceIndex = normalized.lastIndexOf(' ', Math.ceil(normalized.length * 0.62));
  const splitIndex =
    candidates[0] ?? (spaceIndex > 3 ? spaceIndex : Math.ceil(normalized.length * 0.55));

  if (splitIndex > 3 && splitIndex < normalized.length - 3) {
    return [
      normalized.slice(0, splitIndex + 1).trim(),
      normalized.slice(splitIndex + 1).trim(),
    ].filter(Boolean);
  }

  return [normalized];
}

function getTitleSize(lines: string[]): number {
  const maxLineLength = Math.max(...lines.map((line) => line.replace(/\s+/g, '').length));
  const totalLength = lines.join('').replace(/\s+/g, '').length;
  if (lines.length > 2 || totalLength > 44 || maxLineLength > 28) return 34;
  if (totalLength > 34 || maxLineLength > 22) return 38;
  if (totalLength > 26 || maxLineLength > 16) return 44;
  if (totalLength > 18 || maxLineLength > 11) return 50;
  return 56;
}

function escapeSyntaraOption(value: string): string {
  return value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function resolveCoverTitle(args: {
  title?: string;
  firstOutline?: SceneOutline;
  language: 'zh-CN' | 'en-US';
}): string {
  const fromStage = args.title?.trim();
  if (fromStage) return normalizeGeneratedCourseTitle(fromStage);

  const fromOutline = args.firstOutline?.title?.trim();
  if (fromOutline) return normalizeGeneratedCourseTitle(fromOutline);

  return args.language === 'en-US' ? 'Untitled Lesson' : '未命名课程';
}

function truncateCoverText(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function getPositiveTopicSignals(value: string): string {
  return value
    .replace(/不包含[:：][\s\S]*/g, ' ')
    .replace(/不包括[:：][\s\S]*/g, ' ')
    .replace(/\b(excluding|does not include|not included|do not include)\b[\s\S]*/gi, ' ')
    .trim();
}

function hasCongruenceTopic(value: string): boolean {
  return /同余|模运算|模\s*\d+|模数|余数|congruence|modular|modulo|mod\s+\d+/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasProofMathTopic(value: string): boolean {
  return /mat|proof|证明|函数|映射|linear|algebra|calculus|math|同余|模运算|整除|线性|丢番图|素数|整数|数论|最大公约数|gcd|方程/.test(
    getPositiveTopicSignals(value),
  );
}

function hasGroupTheoryTopic(value: string): boolean {
  return /群论|群的|群公理|阿贝尔|对称群|二面体|子群|循环群|group theory|abelian|symmetric group|dihedral|subgroup|cyclic group/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasCodeTopic(value: string): boolean {
  return /ai|llm|api|model|claude|openai|subscription|pricing|code|program|代码|程序|编程|python|javascript|typescript|数据结构|人工智能|大模型|模型|订阅|定价|oop|object[-\s]*oriented|class|instance|attribute|method|constructor|initializer|__init__|self|tweet|twitter|userid|created_at|likes|面向对象|类|实例|对象|属性|方法|构造器|初始化器|推文|点赞|作者|日期/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasCultureTopic(value: string): boolean {
  return /mv|music video|film|movie|cinema|art|visual|song|lyrics|novel|poem|literature|音乐|影像|电影|影片|艺术|视觉|文学|小说|诗歌|歌词|太阳之子|短片/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasOopTopic(value: string): boolean {
  return /oop|object[-\s]*oriented|class|instance|attribute|method|constructor|initializer|__init__|self|面向对象|类|实例|对象|属性|方法|构造器|初始化器/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasTweetTopic(value: string): boolean {
  return /tweet|twitter|推文|发帖|作者|日期|点赞|likes|userid|created_at/i.test(
    getPositiveTopicSignals(value),
  );
}

function hasPhilosophyTopic(value: string): boolean {
  return /哲学|思想|存在主义|荒诞|反抗|辩证|精神现象学|承认|自由|加缪|黑格尔|苏格拉底|柏拉图|亚里士多德|康德|尼采|philosophy|camus|hegel|absurd|existential|dialectic/i.test(
    getPositiveTopicSignals(value),
  );
}

function inferTitleCoverContentProfile(value: string): NonNullable<SceneOutline['contentProfile']> {
  if (hasCodeTopic(value)) return 'code';
  if (hasCongruenceTopic(value) || hasProofMathTopic(value)) return 'math';
  return 'general';
}

function inferCoverSubtitle(args: {
  outline: SceneOutline;
  title: string;
  language: 'zh-CN' | 'en-US';
}): string {
  const topicText = `${args.title} ${args.outline.description || ''} ${
    args.outline.keyPoints?.join(' ') || ''
  }`;
  if (hasCongruenceTopic(topicText)) {
    return args.language === 'en-US'
      ? 'How can a remainder become a reliable structure for reasoning?'
      : '一个余数，怎样变成可以推理的结构？';
  }
  if (hasGroupTheoryTopic(topicText)) {
    return args.language === 'en-US'
      ? 'Start with one operation, then watch a whole abstract language appear'
      : '从一个运算开始，看抽象结构怎样被定义出来。';
  }
  if (hasPhilosophyTopic(topicText)) {
    if (/萨特|存在主义|存在先于本质|自由|自欺|sartre|existential/i.test(topicText)) {
      return args.language === 'en-US'
        ? 'When you say “I had no choice,” Sartre asks whether that is a fact or a decision'
        : '当你说“我没办法”时，萨特会追问：这真的是事实，还是一次选择？';
    }
    if (/加缪|荒诞|camus|absurd/i.test(topicText)) {
      return args.language === 'en-US'
        ? 'If the world stays silent, what kind of lucidity is still possible?'
        : '当世界保持沉默，人还能怎样清醒地生活？';
    }
    if (/黑格尔|辩证|精神现象学|承认|hegel|dialectic/i.test(topicText)) {
      return args.language === 'en-US'
        ? 'Contradiction is not where thinking fails; it is where thinking begins to move'
        : '矛盾不是思想失败的地方，而是思想开始运动的地方。';
    }
    return args.language === 'en-US'
      ? 'Let one lived tension open the door before the concepts arrive'
      : '先让一个真实困惑站到面前，再让概念慢慢照亮它。';
  }

  if (hasTweetTopic(topicText)) {
    return args.language === 'en-US'
      ? 'Before memorizing classes, ask why one Tweet needs its author, date, content, and likes to stay together.'
      : '先别急着背 class：一条 Tweet 为什么要把作者、日期、内容、点赞数稳定地绑在一起？';
  }
  if (hasOopTopic(topicText)) {
    return args.language === 'en-US'
      ? 'Before the vocabulary arrives, find the state that must move together and the rules that must not break.'
      : '先不急着上术语：先找出哪些状态必须一起移动，哪些规则不能被随手改坏。';
  }

  const description = args.outline.description?.trim();
  const isListLikeDescription =
    /^(包含|包括|课程目标|学习目标|本节包括|This covers|Includes?)[:：]/i.test(description || '') ||
    ((description || '').match(/、/g) || []).length >= 2;
  if (description && !isListLikeDescription)
    return truncateCoverText(description, args.language === 'en-US' ? 78 : 42);

  const title = args.title.toLowerCase();
  if (hasProofMathTopic(title)) {
    return args.language === 'en-US'
      ? 'Find the structure first; the formal steps will become less mysterious'
      : '先看见结构，再让后面的推导变得可验证、可复述。';
  }
  if (/code|program|代码|程序|编程|python|javascript|数据结构/.test(title)) {
    return args.language === 'en-US'
      ? 'Before the implementation, notice the hidden state change'
      : '先看见那个隐藏的状态变化，再进入实现细节。';
  }
  return args.language === 'en-US'
    ? 'Start with the one doorway that makes the whole notebook worth opening'
    : '先抓住那个让整本笔记值得打开的入口。';
}

function resolveCoverHeroPhrase(
  outline: SceneOutline,
  title: string,
  language: 'zh-CN' | 'en-US',
): string {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (/萨特|存在主义|存在先于本质|自由|自欺|sartre|existential/i.test(topicText)) {
    return language === 'en-US' ? 'EXISTENCE BEFORE ESSENCE' : '存在先于本质';
  }
  if (/加缪|荒诞|camus|absurd/i.test(topicText)) {
    return language === 'en-US' ? 'LIVE AFTER THE ABSURD' : '荒诞之后，仍然生活';
  }
  if (/黑格尔|辩证|精神现象学|承认|hegel|dialectic/i.test(topicText)) {
    return language === 'en-US' ? 'THINKING MOVES' : '矛盾使思想前进';
  }
  if (hasPhilosophyTopic(topicText)) {
    return language === 'en-US' ? 'BRING IDEAS BACK TO LIFE' : '把思想带回生活';
  }
  if (hasTweetTopic(topicText)) {
    return language === 'en-US' ? 'MEET ONE TWEET' : '先看一条 Tweet';
  }
  if (hasOopTopic(topicText)) {
    return language === 'en-US' ? 'STATE NEEDS A HOME' : '状态要有家';
  }
  if (hasCodeTopic(topicText)) {
    return language === 'en-US' ? 'MAKE IDEAS RUN' : '让想法运行';
  }
  if (hasCongruenceTopic(topicText) || hasProofMathTopic(topicText)) {
    return language === 'en-US' ? 'SEE THE STRUCTURE' : '看见结构';
  }
  return language === 'en-US' ? 'BEGIN HERE' : '从这里开始';
}

function splitCoverHeroPhraseLines(phrase: string, language: 'zh-CN' | 'en-US'): string {
  const normalized = phrase.replace(/\s+/g, ' ').trim();
  if (language === 'en-US') {
    const words = normalized.split(' ');
    if (words.length <= 2) return escapeHtml(normalized);
    const splitAt = Math.ceil(words.length / 2);
    return `${escapeHtml(words.slice(0, splitAt).join(' '))}<br/>${escapeHtml(
      words.slice(splitAt).join(' '),
    )}`;
  }

  const punctuationSplit = normalized.split(/[，,；;]/).filter(Boolean);
  if (punctuationSplit.length >= 2) {
    return punctuationSplit.slice(0, 2).map(escapeHtml).join('<br/>');
  }
  if (normalized.length > 8) {
    const splitAt = Math.ceil(normalized.length / 2);
    return `${escapeHtml(normalized.slice(0, splitAt))}<br/>${escapeHtml(
      normalized.slice(splitAt),
    )}`;
  }
  return escapeHtml(normalized);
}

function fallbackCoverRouteItems(args: { title: string; language: 'zh-CN' | 'en-US' }): string[] {
  const title = args.title.toLowerCase();
  if (hasTweetTopic(args.title)) {
    return args.language === 'en-US'
      ? ['One Tweet', 'list/dict failures', 'Why Tweet()']
      : ['一条 Tweet', 'list/dict 的漏洞', '为什么要 Tweet()'];
  }
  if (hasOopTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Object state', 'Broken representations', 'Class boundary']
      : ['对象状态', '旧表示失守', '类的边界'];
  }
  if (hasCongruenceTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Congruence Definition', 'Modular Rules', 'Proof Examples']
      : ['同余定义', '模运算规则', '证明与例题'];
  }
  if (hasGroupTheoryTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Group Axioms', 'Core Examples', 'Subgroups & Order']
      : ['群的定义', '典型例子', '子群与阶'];
  }
  if (/加缪|荒诞|camus|absurd/i.test(args.title)) {
    return args.language === 'en-US'
      ? ['Absurdity', 'Lucid Attention', 'Revolt']
      : ['荒诞处境', '清醒选择', '反抗实践'];
  }
  if (/黑格尔|辩证|精神现象学|承认|hegel|dialectic/i.test(args.title)) {
    return args.language === 'en-US'
      ? ['Contradiction', 'Negation', 'Recognition']
      : ['矛盾运动', '否定路径', '承认与自由'];
  }
  if (hasPhilosophyTopic(args.title)) {
    return args.language === 'en-US'
      ? ['Core Tension', 'Concept Entry', 'Lived Judgment']
      : ['核心张力', '概念入口', '生活判断'];
  }
  if (hasProofMathTopic(title)) {
    return args.language === 'en-US'
      ? ['Concept Map', 'Worked Reasoning', 'Proof Language']
      : ['概念框架', '例题推导', '证明语言'];
  }
  if (/code|program|代码|程序|编程|python|javascript|数据结构/.test(title)) {
    return args.language === 'en-US'
      ? ['Core Idea', 'Trace the Logic', 'Implementation Notes']
      : ['核心概念', '逻辑追踪', '实现要点'];
  }
  return args.language === 'en-US'
    ? ['Core Concepts', 'Method Walkthrough', 'Key Takeaways']
    : ['核心概念', '方法走读', '关键总结'];
}

function routeItemFromText(value: string, language: 'zh-CN' | 'en-US'): string {
  const normalized = value
    .replace(/^[\d一二三四五六七八九十]+[.)、．]\s*/, '')
    .replace(
      /^(掌握|理解|明确|进入|学会|能够|学习主线|课程目标|学习目标|强调|重点|learn|understand|master|identify)\s*[：:，,、-]?\s*/i,
      '',
    )
    .trim();
  const clipped = normalized.split(/[。.!！?？；;]/)[0] || normalized;
  return truncateCoverText(clipped, language === 'en-US' ? 24 : 10);
}

function resolveCoverPalette(outline: SceneOutline, title: string) {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (hasCodeTopic(topicText)) {
    return {
      accent: '#38bdf8',
      accentDark: '#0369a1',
      route: ['#38bdf8', '#a78bfa', '#34d399'],
    };
  }
  if (hasCongruenceTopic(topicText) || hasProofMathTopic(topicText)) {
    return {
      accent: '#2563eb',
      accentDark: '#1d4ed8',
      route: ['#60a5fa', '#a78bfa', '#34d399'],
    };
  }
  if (hasPhilosophyTopic(topicText)) {
    return {
      accent: '#d6a84f',
      accentDark: '#9a6a16',
      route: ['#d6a84f', '#60a5fa', '#2f8065'],
    };
  }
  return {
    accent: '#d6a84f',
    accentDark: '#9a6a16',
    route: ['#d6a84f', '#60a5fa', '#2f8065'],
  };
}

function resolveCoverProfileLabel(
  outline: SceneOutline,
  title: string,
  language: 'zh-CN' | 'en-US',
): string {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  const suffix = language === 'en-US' ? 'NOTEBOOK' : '自学笔记';
  if (hasCodeTopic(topicText)) return `COMPUTING / ${suffix}`;
  if (hasCongruenceTopic(topicText) || hasProofMathTopic(topicText))
    return `MATHEMATICS / ${suffix}`;
  if (hasPhilosophyTopic(topicText)) return `PHILOSOPHY / ${suffix}`;
  if (hasCultureTopic(topicText))
    return language === 'en-US' ? `ARTS / ${suffix}` : `艺术解析 / ${suffix}`;
  return language === 'en-US' ? 'SELF-STUDY NOTEBOOK' : '自学课程 / 笔记';
}

function resolveOpeningRouteItems(args: {
  title: string;
  keyPoints?: string[];
  language: 'zh-CN' | 'en-US';
}): string[] {
  const fromKeyPoints = (args.keyPoints || [])
    .map((item) => routeItemFromText(item, args.language))
    .filter(Boolean)
    .slice(0, 3);
  const fallback = fallbackCoverRouteItems({ title: args.title, language: args.language });
  return [...fromKeyPoints, ...fallback].slice(0, 3);
}

function joinRouteItems(items: string[], language: 'zh-CN' | 'en-US'): string {
  if (items.length === 0) return language === 'en-US' ? 'the main route' : '主线';
  if (language === 'en-US') {
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }
  return items.join('、');
}

function buildTitleCoverOpeningSpeech(args: {
  title: string;
  description?: string;
  keyPoints?: string[];
  language: 'zh-CN' | 'en-US';
}): string {
  const routeItems = resolveOpeningRouteItems(args);
  const routeText = joinRouteItems(routeItems, args.language);
  const topicText = `${args.title} ${args.description || ''} ${(args.keyPoints || []).join(' ')}`;

  if (args.language === 'en-US') {
    if (hasTweetTopic(topicText)) {
      return `Before we memorize words like class or instance, start with one concrete Tweet. It has an author, a date, content, and a like count, and those pieces need to stay together. If we scatter them across a list position or a dictionary that anyone can edit, the program may still accept a broken state. The next pages will make that failure visible, then show why a Tweet() object gives this state a safer home.`;
    }
    if (hasOopTopic(topicText)) {
      return `Before the OOP vocabulary arrives, start with the state. Which pieces of information belong together, and which rules must stay true after client code touches them? We will first watch an old representation fail, then use the class boundary to give that state a reliable home.`;
    }
    if (hasPhilosophyTopic(topicText)) {
      return `This opening page is here to create an entrance, not to summarize everything. We will later move through ${routeText}. For now, hold onto the tension: why does this idea feel like it is already touching ordinary life?`;
    }
    if (hasProofMathTopic(topicText) || hasCodeTopic(topicText)) {
      return `This opening page is here to create an entrance. We will later move through ${routeText}. First notice the central structure, then let the following pages make each step precise and usable.`;
    }
    return `This opening page is here to create an entrance for ${args.title}. We will later move through ${routeText}. Start with the reason the topic matters, then let the following pages unfold the details.`;
  }

  if (hasTweetTopic(topicText)) {
    return `先不用背 class、instance 这些词。我们先想一条推文：谁发的、什么时候发、内容是什么、点赞数是多少。这四件事如果散在 list 的位置里，或者随手放进 dict，程序都可能接受错误状态。后面我们会先看 list 和 dict 怎样失守，再把答案收束到 Tweet()：让这组状态和规则有一个自己的家。`;
  }
  if (hasOopTopic(topicText)) {
    return `先不急着看面向对象的术语。我们先问一个更朴素的问题：程序里哪一组状态必须放在一起，哪些规则不能被客户端随手改坏？后面会先看旧表示怎么失守，再看 class 怎样给状态、规则和操作划出边界。`;
  }
  if (hasPhilosophyTopic(topicText)) {
    return `这一页不再做路线图，只负责把入口打开。后面会逐步展开${routeText}，但现在先抓住那个刺人的张力：这个思想为什么会碰到我们的日常生活。`;
  }
  if (hasProofMathTopic(topicText) || hasCodeTopic(topicText)) {
    return `这一页不急着铺开路线，只负责把入口打开。后面会逐步展开${routeText}，但现在先看见核心结构，再到后面的页面里把每一步变成可验证、可复述的方法。`;
  }
  return `这一页先为《${args.title}》打开入口。后面会逐步展开${routeText}，但现在先抓住它为什么值得学，细节会在后面的页面慢慢展开。`;
}

export function hasTitleCoverVersionMarker(
  elements: Array<{ type?: string; content?: string }>,
): boolean {
  return elements.some(
    (element) => element.type === 'text' && /syntara-cover-v\d+/.test(element.content || ''),
  );
}

export function hasTitleCoverOpeningAction(
  actions: Array<{ type?: string; description?: string }> | undefined,
): boolean {
  return Boolean(
    actions?.some(
      (action) =>
        action.type === 'speech' && action.description === TITLE_COVER_OPENING_ACTION_MARKER,
    ),
  );
}

export function buildTitleCoverOpeningActions(args: {
  title: string;
  description?: string;
  keyPoints?: string[];
  language?: 'zh-CN' | 'en-US';
  elements?: PPTElement[];
}): Action[] {
  const language = args.language || 'zh-CN';
  const titleTarget =
    args.elements?.find((element) => element.name === COVER_TITLE_ELEMENT_NAME)?.id ||
    args.elements?.find((element) => element.type === 'text' && element.textType === 'title')?.id ||
    args.elements?.find(
      (element) =>
        element.type === 'text' && !new RegExp(TITLE_COVER_VERSION_MARKER).test(element.content),
    )?.id;
  const actions: Action[] = [];

  if (titleTarget) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: language === 'zh-CN' ? '聚焦标题页入口' : 'Focus title entrance',
      elementId: titleTarget,
      dimOpacity: 0.42,
    });
  }

  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: language === 'zh-CN' ? '标题页开场' : 'Title page opening',
    description: TITLE_COVER_OPENING_ACTION_MARKER,
    text: buildTitleCoverOpeningSpeech({
      title: args.title,
      description: args.description,
      keyPoints: args.keyPoints,
      language,
    }),
  });

  return actions;
}

function resolveCoverVisualStyle(outline: SceneOutline, title: string): CoverVisualStyle {
  const topicText = `${title} ${outline.description || ''} ${(outline.keyPoints || []).join(' ')}`;
  if (hasPhilosophyTopic(topicText) || hasCultureTopic(topicText)) return 'archive';
  if (hasCodeTopic(topicText) || hasCongruenceTopic(topicText) || hasProofMathTopic(topicText)) {
    return 'network';
  }
  return 'cinematic';
}

function buildNetworkPosterLayer(palette: ReturnType<typeof resolveCoverPalette>): string {
  return `<g opacity=".82"><path d="M-30 188C122 86 240 92 354 174C484 268 596 270 725 172C834 90 940 88 1040 138" fill="none" stroke="${palette.accent}" stroke-width="2.2" opacity=".72"/><path d="M-20 256C120 156 270 150 416 244C538 322 662 318 790 224C902 142 970 164 1030 218" fill="none" stroke="#f4b76e" stroke-width="1.6" opacity=".55"/><path d="M-10 334C118 260 246 258 392 328C538 398 660 392 806 306C912 244 984 254 1038 288" fill="none" stroke="#9cc8ff" stroke-width="1.2" opacity=".32"/></g><g fill="#f8c989" opacity=".8"><circle cx="130" cy="138" r="3"/><circle cx="218" cy="118" r="2.5"/><circle cx="344" cy="172" r="3.2"/><circle cx="486" cy="250" r="2.4"/><circle cx="642" cy="254" r="3"/><circle cx="760" cy="174" r="2.6"/><circle cx="882" cy="112" r="3"/><circle cx="930" cy="214" r="2.6"/><circle cx="184" cy="308" r="2.6"/><circle cx="318" cy="292" r="2.2"/><circle cx="734" cy="330" r="2.8"/></g><g opacity=".18" stroke="#ffffff"><path d="M130 138L218 118L344 172L486 250L642 254L760 174L882 112"/><path d="M184 308L318 292L486 250L734 330L930 214"/></g>`;
}

function buildArchivePosterLayer(palette: ReturnType<typeof resolveCoverPalette>): string {
  return `<g opacity=".72"><path d="M90 560V140C180 54 316 54 406 140V560Z" fill="#341b2e" stroke="${palette.accent}" stroke-width="2" opacity=".58"/><path d="M594 560V140C684 54 820 54 910 140V560Z" fill="#19344b" stroke="${palette.accent}" stroke-width="2" opacity=".52"/><path d="M255 560V100C380 -8 620 -8 745 100V560Z" fill="#171827" stroke="#8e6a2e" stroke-width="2.4" opacity=".74"/><circle cx="500" cy="246" r="154" fill="#7b5322" opacity=".46" stroke="${palette.accent}" stroke-width="2"/><circle cx="500" cy="246" r="104" fill="#120f18" opacity=".4"/><path d="M500 38L534 146L646 146L556 212L590 320L500 254L410 320L444 212L354 146L466 146Z" fill="none" stroke="${palette.accent}" stroke-width="2" opacity=".52"/></g><g opacity=".26"><rect x="120" y="80" width="58" height="430" fill="#9f273e"/><rect x="198" y="96" width="54" height="410" fill="#2d7e83"/><rect x="750" y="96" width="54" height="410" fill="#954b2b"/><rect x="828" y="80" width="58" height="430" fill="#7f2546"/></g>`;
}

function buildCinematicPosterLayer(palette: ReturnType<typeof resolveCoverPalette>): string {
  return `<g opacity=".5"><rect x="0" y="0" width="1000" height="562" fill="#0d261d"/><path d="M0 390C96 328 168 324 250 360C338 398 446 378 548 326C668 266 786 274 1000 356V562H0Z" fill="#183b2d"/><path d="M0 210C116 130 278 120 426 178C584 240 740 218 1000 126V0H0Z" fill="#30281f" opacity=".66"/><rect x="660" y="0" width="340" height="178" fill="#2f271f" opacity=".7"/><rect x="706" y="36" width="92" height="118" fill="#5f3d28" opacity=".52"/><rect x="814" y="42" width="96" height="110" fill="#20372d" opacity=".48"/><circle cx="508" cy="334" r="34" fill="#c6a274" opacity=".2"/><circle cx="432" cy="356" r="26" fill="#e0c69b" opacity=".16"/><circle cx="578" cy="360" r="28" fill="#e0c69b" opacity=".14"/><circle cx="680" cy="318" r="24" fill="#e0c69b" opacity=".12"/><path d="M120 410C240 374 356 380 456 430C542 472 690 468 822 414" fill="none" stroke="${palette.accent}" stroke-width="1.4" opacity=".26"/></g>`;
}

function buildCoverBackgroundDataUri(
  outline: SceneOutline,
  title: string,
  visualStyle: CoverVisualStyle,
): string {
  const palette = resolveCoverPalette(outline, title);
  const sceneLayer =
    visualStyle === 'archive'
      ? buildArchivePosterLayer(palette)
      : visualStyle === 'network'
        ? buildNetworkPosterLayer(palette)
        : buildCinematicPosterLayer(palette);
  const base =
    visualStyle === 'archive' ? '#100d16' : visualStyle === 'network' ? '#080d22' : '#071911';
  const glow = visualStyle === 'network' ? '#f4b76e' : palette.accent;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 562"><defs><radialGradient id="centerGlow" cx="50%" cy="46%" r="54%"><stop offset="0" stop-color="${glow}" stop-opacity=".2"/><stop offset=".58" stop-color="${glow}" stop-opacity=".06"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#020617" stop-opacity=".64"/><stop offset=".48" stop-color="#020617" stop-opacity=".34"/><stop offset="1" stop-color="#020617" stop-opacity=".58"/></linearGradient><radialGradient id="vignette" cx="50%" cy="50%" r="70%"><stop offset=".42" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".7"/></radialGradient><filter id="softBlur"><feGaussianBlur stdDeviation="12"/></filter><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .095"/></feComponentTransfer></filter></defs><rect width="1000" height="562" fill="${base}"/><rect x="-40" y="-40" width="1080" height="642" fill="url(#centerGlow)" filter="url(#softBlur)"/>${sceneLayer}<rect width="1000" height="562" fill="url(#shade)"/><rect width="1000" height="562" fill="url(#vignette)"/><rect width="1000" height="562" filter="url(#grain)" opacity=".7"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildTitleCoverSlideContentFromParts(args: {
  title: string;
  description?: string;
  keyPoints?: string[];
  language?: 'zh-CN' | 'en-US';
  contentProfile?: SceneOutline['contentProfile'];
}): GeneratedSlideContent {
  const language = args.language || 'zh-CN';
  const topicText = `${args.title} ${args.description || ''} ${(args.keyPoints || []).join(' ')}`;
  return buildTitleCoverSlideContent({
    id: TITLE_COVER_OUTLINE_ID,
    type: 'slide',
    contentProfile: args.contentProfile || inferTitleCoverContentProfile(topicText),
    archetype: 'intro',
    layoutIntent: {
      layoutFamily: 'cover',
      layoutTemplate: 'cover_hero',
      disciplineStyle: 'general',
      teachingFlow: 'standalone',
      density: 'light',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    },
    title: args.title,
    description: args.description || '',
    keyPoints: [],
    teachingObjective: TITLE_COVER_MARKER,
    estimatedDuration: 20,
    order: 1,
    language,
  });
}

export function shouldUpgradeLegacyTitleCoverContent(args: {
  title: string;
  elements: Array<{ type?: string; content?: string }>;
}): boolean {
  const hasShapeElements = args.elements.some((element) => element.type === 'shape');
  const text = args.elements
    .filter((element) => element.type === 'text')
    .map((element) => element.content || '')
    .join(' ');
  const hasCurrentMarker = new RegExp(TITLE_COVER_VERSION_MARKER).test(text);
  const hasModularLabel = /MODULAR ARITHMETIC/.test(text);
  const hasComputingLabel = /COMPUTING/.test(text);
  const hasGenericLabel = /学习笔记|LEARNING NOTEBOOK/.test(text);
  const hasMissingCoverShapes = LEGACY_TITLE_COVER_VERSION_RE.test(text) && !hasShapeElements;
  const hasMisclassifiedModularCover = hasModularLabel && !hasCongruenceTopic(args.title);
  const hasMisclassifiedCodeCover = hasComputingLabel && !hasCodeTopic(args.title);
  const hasMisclassifiedGenericCover = hasGenericLabel && hasProofMathTopic(args.title);
  if (
    hasCurrentMarker &&
    !hasMissingCoverShapes &&
    !hasMisclassifiedModularCover &&
    !hasMisclassifiedCodeCover &&
    !hasMisclassifiedGenericCover
  ) {
    return false;
  }

  const hasLegacyProfileLabel = /MATHEMATICS|CODE NOTEBOOK|LEARNING NOTEBOOK/.test(text);
  const hasLegacyMathWatermark = /f:\s*A|Im\(f\)|&forall;|&sube;|a\s*&equiv;\s*b/.test(text);
  const hasLegacyCodeWatermark = /input\s*&rarr;\s*state|if\s*\/\s*then|output\(\)/.test(text);
  const hasLegacyGenericWatermark = />\s*(concept|method|takeaway)\s*</i.test(text);
  const hasLegacyCoverCopy =
    /学习主线：|课程目标包括|包含：同余定义|阅读路线|自学地图|READING ROUTE|Self-study map/.test(
      text,
    );

  return (
    hasMissingCoverShapes ||
    LEGACY_TITLE_COVER_VERSION_RE.test(text) ||
    hasLegacyProfileLabel ||
    hasLegacyMathWatermark ||
    hasLegacyCodeWatermark ||
    hasLegacyGenericWatermark ||
    hasLegacyCoverCopy
  );
}

function shouldSkipCoverInsert(outlines: SceneOutline[]): boolean {
  const first = outlines[0];
  if (!first) return false;
  return isTitleCoverOutline(first);
}

function demoteOldCoverIntent(outline: SceneOutline): SceneOutline {
  const intent = outline.layoutIntent;
  const isOldCover =
    intent?.layoutFamily === 'cover' ||
    intent?.layoutTemplate === 'cover_hero' ||
    outline.archetype === 'intro';

  if (!isOldCover) return outline;

  const template = (outline.keyPoints?.length || 0) >= 3 ? 'three_cards' : 'title_content';
  return {
    ...outline,
    layoutIntent: {
      ...(intent || {}),
      layoutFamily: 'concept_cards',
      layoutTemplate: template,
      density: intent?.density === 'light' ? 'standard' : intent?.density,
    },
  };
}

export function isTitleCoverOutline(outline: SceneOutline | undefined | null): boolean {
  if (!outline) return false;
  return (
    outline.id === TITLE_COVER_OUTLINE_ID ||
    outline.teachingObjective === TITLE_COVER_MARKER ||
    (outline.layoutIntent?.layoutFamily === 'cover' &&
      outline.layoutIntent?.layoutTemplate === 'cover_hero' &&
      outline.keyPoints.length === 0 &&
      outline.description.trim() === '')
  );
}

export function ensureTitleCoverOutline(
  outlines: SceneOutline[],
  args: {
    title?: string;
    language?: 'zh-CN' | 'en-US';
    insertMissing?: boolean;
  } = {},
): SceneOutline[] {
  if (!outlines.length) return outlines;
  if (args.insertMissing === false) {
    return outlines
      .filter((outline) => !isTitleCoverOutline(outline) || outlines.length === 1)
      .map((outline, index) =>
        normalizeSceneOutlineContentProfile({
          ...demoteOldCoverIntent(outline),
          id: isTitleCoverOutline(outline) ? `scene_${nanoid(8)}` : outline.id,
          teachingObjective: isTitleCoverOutline(outline) ? undefined : outline.teachingObjective,
          order: index + 1,
          language: outline.language || args.language || 'zh-CN',
        }),
      );
  }
  if (shouldSkipCoverInsert(outlines)) {
    return outlines.map((outline, index) =>
      normalizeSceneOutlineContentProfile({
        ...outline,
        order: index + 1,
      }),
    );
  }

  const firstOutline = outlines[0];
  const language = args.language || firstOutline?.language || 'zh-CN';
  const coverTitle = resolveCoverTitle({
    title: args.title,
    firstOutline,
    language,
  });

  const cover = normalizeSceneOutlineContentProfile({
    id: TITLE_COVER_OUTLINE_ID,
    type: 'slide',
    contentProfile: outlines[0]?.contentProfile || 'general',
    archetype: 'intro',
    layoutIntent: {
      layoutFamily: 'cover',
      layoutTemplate: 'cover_hero',
      disciplineStyle: outlines[0]?.layoutIntent?.disciplineStyle || 'general',
      teachingFlow: 'standalone',
      density: 'light',
      visualRole: 'none',
      overflowPolicy: 'compress_first',
      preserveFullProblemStatement: false,
    },
    title: coverTitle,
    description: firstOutline?.description
      ? truncateCoverText(firstOutline.description, language === 'en-US' ? 78 : 42)
      : '',
    keyPoints: [],
    teachingObjective: TITLE_COVER_MARKER,
    estimatedDuration: 20,
    order: 1,
    language,
  });

  const shifted = outlines.map((outline, index) =>
    normalizeSceneOutlineContentProfile({
      ...demoteOldCoverIntent(outline),
      order: index + 2,
      language: outline.language || language,
    }),
  );

  return [cover, ...shifted];
}

export function buildTitleCoverSlideContent(outline: SceneOutline): GeneratedSlideContent {
  const language = outline.language || 'zh-CN';
  const title =
    normalizeGeneratedCourseTitle(outline.title) ||
    (language === 'en-US' ? 'Untitled Lesson' : '未命名课程');
  const titleLines = splitCoverTitleLines(title, language);
  const titleSize = getTitleSize(titleLines);
  const titleHtml = titleLines.map((line) => escapeHtml(line)).join('<br/>');
  const subtitle = inferCoverSubtitle({ outline, title, language });
  const palette = resolveCoverPalette(outline, title);
  const visualStyle = resolveCoverVisualStyle(outline, title);
  const profileLabel = resolveCoverProfileLabel(outline, title, language);
  const heroPhrase = splitCoverHeroPhraseLines(
    resolveCoverHeroPhrase(outline, title, language),
    language,
  );
  const posterTitleSize =
    visualStyle === 'network'
      ? Math.min(60, titleSize + 4)
      : visualStyle === 'archive'
        ? Math.min(58, titleSize + 2)
        : titleSize;
  const posterTitleLineHeight = Math.round(posterTitleSize * 1.12);
  const titleColor = visualStyle === 'archive' ? palette.accent : '#f8fafc';
  const subtitleColor = visualStyle === 'archive' ? '#f6efe0' : '#dbe7ef';
  const titleShadow = {
    h: 0,
    v: 5,
    blur: 18,
    color: 'rgba(0,0,0,0.55)',
  };
  const theme: SlideTheme = {
    backgroundColor: '#07111a',
    themeColors: ['#f8fafc', palette.accent, '#60a5fa', '#2f8065', '#111827'],
    fontColor: '#f8fafc',
    fontName: 'Microsoft YaHei',
  };
  const markerElement = {
    ...createTextElement({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      html: `<p>${TITLE_COVER_VERSION_MARKER}</p>`,
      color: '#ffffff',
      textType: 'footer',
    }),
    opacity: 0,
  };
  const cornerLines: GeneratedSlideContent['elements'] = [
    createLineElement({ start: [34, 34], end: [84, 34], color: palette.accent, width: 2 }),
    createLineElement({ start: [34, 34], end: [34, 84], color: palette.accent, width: 2 }),
    createLineElement({ start: [916, 34], end: [966, 34], color: palette.accent, width: 2 }),
    createLineElement({ start: [966, 34], end: [966, 84], color: palette.accent, width: 2 }),
    createLineElement({ start: [34, 478], end: [34, 528], color: palette.accent, width: 2 }),
    createLineElement({ start: [34, 528], end: [84, 528], color: palette.accent, width: 2 }),
    createLineElement({ start: [916, 528], end: [966, 528], color: palette.accent, width: 2 }),
    createLineElement({ start: [966, 478], end: [966, 528], color: palette.accent, width: 2 }),
  ];
  const footerElements: GeneratedSlideContent['elements'] = [
    {
      ...createTextElement({
        left: 56,
        top: 512,
        width: 260,
        height: 24,
        html: `<p style="margin:0;font-size:10px;line-height:16px;color:rgba(248,250,252,.68);font-weight:650;letter-spacing:0;">${escapeHtml(
          profileLabel,
        )}</p>`,
        color: '#f8fafc',
        textType: 'footer',
      }),
    },
    createTextElement({
      left: 780,
      top: 512,
      width: 168,
      height: 24,
      html: `<p style="margin:0;text-align:right;font-size:10px;line-height:16px;color:rgba(248,250,252,.56);font-weight:650;letter-spacing:0;">cover_hero</p>`,
      color: '#f8fafc',
      textType: 'footer',
    }),
  ];
  const titleElement = {
    ...createTextElement({
      left: visualStyle === 'cinematic' ? 88 : 140,
      top: visualStyle === 'cinematic' ? 162 : visualStyle === 'archive' ? 266 : 196,
      width: visualStyle === 'cinematic' ? 590 : 720,
      height: visualStyle === 'cinematic' ? 178 : 126,
      html: `<p style="margin:0;text-align:${
        visualStyle === 'cinematic' ? 'left' : 'center'
      };font-size:${posterTitleSize}px;line-height:${posterTitleLineHeight}px;color:${titleColor};font-weight:900;letter-spacing:0;text-shadow:0 5px 18px rgba(0,0,0,.55);">${titleHtml}</p>`,
      color: titleColor,
      textType: 'itemTitle',
      shadow: titleShadow,
    }),
    name: COVER_TITLE_ELEMENT_NAME,
  };
  const subtitleElement = createTextElement({
    left: visualStyle === 'cinematic' ? 90 : 198,
    top: visualStyle === 'cinematic' ? 338 : visualStyle === 'archive' ? 354 : 322,
    width: visualStyle === 'cinematic' ? 560 : 604,
    height: visualStyle === 'cinematic' ? 82 : 58,
    html: `<p style="margin:0;text-align:${
      visualStyle === 'cinematic' ? 'left' : 'center'
    };font-size:${visualStyle === 'cinematic' ? 20 : 17}px;line-height:${
      visualStyle === 'cinematic' ? 31 : 25
    }px;color:${subtitleColor};font-weight:640;letter-spacing:0;text-shadow:0 3px 12px rgba(0,0,0,.45);">${escapeHtml(
      subtitle,
    )}</p>`,
    color: subtitleColor,
    textType: 'subtitle',
    shadow: {
      h: 0,
      v: 3,
      blur: 12,
      color: 'rgba(0,0,0,0.45)',
    },
  });
  const eyebrowElement = createTextElement({
    left: visualStyle === 'cinematic' ? 90 : 340,
    top: visualStyle === 'cinematic' ? 114 : visualStyle === 'archive' ? 174 : 388,
    width: visualStyle === 'cinematic' ? 320 : 320,
    height: 34,
    html: `<p style="margin:0;text-align:${
      visualStyle === 'cinematic' ? 'left' : 'center'
    };font-size:${visualStyle === 'network' ? 12 : 14}px;line-height:22px;color:${
      visualStyle === 'archive' ? palette.accent : '#f4b76e'
    };font-weight:800;letter-spacing:0;">${heroPhrase}</p>`,
    color: visualStyle === 'archive' ? palette.accent : '#f4b76e',
    textType: 'header',
  });
  const tagElement = createTextElement({
    left: 748,
    top: 46,
    width: 174,
    height: 36,
    html: `<p style="margin:0;text-align:center;font-size:11px;line-height:18px;color:#fff7ed;font-weight:800;letter-spacing:0;">${escapeHtml(
      'Syntara Edition',
    )}</p>`,
    color: '#fff7ed',
    fill:
      visualStyle === 'cinematic'
        ? '#d55239'
        : visualStyle === 'archive'
          ? 'rgba(154,106,22,.86)'
          : 'rgba(244,183,110,.72)',
    outlineColor: 'rgba(255,255,255,.18)',
    textType: 'header',
  });
  const accentLines: GeneratedSlideContent['elements'] =
    visualStyle === 'cinematic'
      ? [
          createLineElement({ start: [72, 118], end: [72, 300], color: palette.accent, width: 4 }),
          createLineElement({ start: [90, 426], end: [216, 426], color: palette.accent, width: 4 }),
        ]
      : [
          createLineElement({
            start: [410, visualStyle === 'archive' ? 414 : 374],
            end: [590, visualStyle === 'archive' ? 414 : 374],
            color: 'rgba(248,250,252,.32)',
            width: 2,
          }),
          createLineElement({
            start: [456, visualStyle === 'archive' ? 428 : 388],
            end: [544, visualStyle === 'archive' ? 428 : 388],
            color: palette.accent,
            width: 4,
          }),
        ];
  const elements: GeneratedSlideContent['elements'] = [
    markerElement,
    ...cornerLines,
    tagElement,
    eyebrowElement,
    titleElement,
    subtitleElement,
    ...accentLines,
    ...footerElements,
  ];

  return {
    elements,
    background: {
      type: 'image',
      image: {
        src: buildCoverBackgroundDataUri(outline, title, visualStyle),
        size: 'cover',
      },
    },
    theme,
    remark: title,
    syntaraMarkup: `\\begin{slide}[title={${escapeSyntaraOption(
      title,
    )}},template=cover_hero,density=light,profile=${outline.contentProfile || 'general'},language=${
      outline.language || 'zh-CN'
    }]\n\\end{slide}`,
  };
}
