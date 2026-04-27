import type { AppNotification } from '@/lib/notifications/types';

type CompanionCopy = { eyebrow: string; line: string };

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function pickBySeed(values: readonly string[], seed: string): string {
  if (values.length === 0) return '';
  const index = hashString(seed) % values.length;
  return values[index] ?? values[0] ?? '';
}

const NOTEBOOK_GROUP_LINES = [
  '这次笔记本生成我帮你合并成一条账单了，信息更干净。',
  '我把本轮生成开销打包记账了，不会一条条刷屏。',
  '这一轮笔记本生成费用已经归并完成，账目更清晰。',
  '生成阶段的多次调用已汇总成一条，方便你快速确认。',
  '本次生成消耗已整合记账，你只需要看这一条就好。',
  '我把分散的生成扣费整理成单条通知了，阅读更省心。',
  '这次笔记本生成的费用我做了合并展示，避免信息噪音。',
  '本轮生成账单已经集中归档，不再重复打扰你。',
  '生成相关的扣费记录已汇总完毕，查看起来更直观。',
  '我已把本次生成开销压缩成一条通知，节奏更顺。',
] as const;

const NEGATIVE_GENERIC_LINES = [
  '这次积分变化已经替你记好啦，继续专心学习就行。',
  '有一笔积分变动我已经登记完成，你可以继续当前节奏。',
  '积分变更已同步到账本，状态我会继续帮你盯着。',
  '这笔积分调整已经记录好了，不会影响你的学习流。',
  '我把这次积分扣变动整理好了，你安心推进就好。',
  '本次积分变化我已经确认入账，后续我会继续提醒你。',
  '这条积分变动已经记下来了，信息都在这张卡里。',
  '积分流水更新完成，你现在可以无缝继续下一步。',
  '刚才那笔变动我已经归档，后面我会继续帮你追踪。',
  '这次积分调整已落账，学习节奏保持住就很棒。',
] as const;

const LESSON_REWARD_LINES = [
  '这节课学得很稳，奖励已经到账啦。',
  '课堂进度推进得很好，这笔奖励我已经替你收下。',
  '你刚才的学习节奏很漂亮，奖励已同步到账。',
  '看课里程碑达成，这次奖励已经记入你的账户。',
  '本节学习完成得很扎实，奖励我这边确认到了。',
  '课程阶段目标已完成，奖励已经第一时间到账。',
  '你这轮看课推进很顺，奖励我帮你记好了。',
  '看课收益已经发放完成，继续保持这个状态。',
  '这节内容吸收得不错，奖励到账提醒已送达。',
  '课程进度奖励已落账，今天状态很好。',
] as const;

const QUIZ_COMPLETION_LINES = [
  '这一组题完成啦，状态已经续上了。',
  '做题任务收官，这笔奖励我已经替你拿下。',
  '测验完成得很利落，奖励已同步进账。',
  '这轮题目结算完成，奖励到账我已确认。',
  '你刚完成一组测验，奖励已经稳定入账。',
  '做题进度推进顺利，奖励我这边已记录。',
  '测验结果已结算，这笔奖励已经到位。',
  '这组题刷得很干净，奖励发放完成。',
  '测验完成奖励已经到账，继续保持手感。',
  '本轮做题任务已闭环，奖励同步成功。',
] as const;

const QUIZ_ACCURACY_LINES = [
  '这次答得很漂亮，额外奖励也一起掉落。',
  '正确率表现很稳，额外加成已经到账。',
  '你的准确率很高，这笔加成奖励已确认发放。',
  '这轮答题质量很好，额外奖励我帮你收下了。',
  '高正确率触发成功，加成已经记入账户。',
  '这次命中率很不错，额外收益到账完成。',
  '正确率达标，额外奖励已经同步到位。',
  '答题精度在线，这笔加成已经发放。',
  '本次准确率奖励已到账，表现很亮眼。',
  '你这轮答题很准，加成奖励已经落账。',
] as const;

const PRACTICE_SUBMISSION_PERFECT_LINES = [
  '这题答得非常稳，我先替你鼓掌一下。',
  '这一题发挥很亮眼，状态拉满了。',
  '这道题你拿得很漂亮，继续这个手感。',
  '这一题完成得特别扎实，节奏很顺。',
  '刚这题的表现很强，我已经记住了。',
  '这道题你处理得很成熟，继续冲。',
] as const;

const PRACTICE_SUBMISSION_GOOD_LINES = [
  '这题做得不错，离满分已经很近了。',
  '这道题思路是对的，再打磨一下会更稳。',
  '这一题完成得挺好，继续保持。',
  '这次提交很有感觉，已经在进步线上了。',
  '这题答得挺顺，继续往前推就对了。',
  '这道题的状态不错，已经很接近标准答案。',
] as const;

const PRACTICE_SUBMISSION_RETRY_LINES = [
  '这题先别急，我陪你再拆一遍。',
  '这次没关系，已经比空着强很多了。',
  '题目就是拿来练的，我们再来一轮。',
  '这道题先收下反馈，下一次会更稳。',
  '别被这一题影响节奏，你已经在推进了。',
  '这题先记成一次有效尝试，继续做就会更顺。',
] as const;

const QUIZ_MERGED_LINES = [
  '测验奖励和正确率加成我已经合并记账了，一眼就能看懂。',
  '这次测验收益我帮你打包成一条，查看更清爽。',
  '完成奖励与加成已合并到账，不会重复打扰你。',
  '测验两段收益已归并展示，信息更集中。',
  '本轮测验奖励我做了合并处理，读起来更顺。',
  '测验主奖励和加成我已整合成单条通知。',
  '这次测验收益已合并记录，避免连续弹两次。',
  '两笔测验相关奖励已打包成一条提醒。',
  '测验到账信息已聚合，方便你快速确认收益。',
  '本轮测验奖励与加成已合并落账，继续冲。',
] as const;

const REVIEW_LINES = [
  '错题回来看过了，进步我都帮你记着。',
  '复盘动作非常关键，这笔奖励已经到账。',
  '你把薄弱点补上了，奖励已同步发放。',
  '这次回顾做得很到位，收益我帮你收下了。',
  '错题复盘完成，奖励到账确认完毕。',
  '你刚完成一次高质量复盘，奖励已落账。',
  '回顾环节推进得很好，这笔奖励已经在账户里。',
  '本次错题回炉已完成，奖励到账提醒送达。',
  '复习闭环做得漂亮，奖励我已经替你记账。',
  '回顾奖励已发放成功，继续保持这个节奏。',
] as const;

const DAILY_TASK_LINES = [
  '今天的小目标清空啦，辛苦有回音。',
  '日常任务全清，这笔奖励已经发放到位。',
  '你把今天的任务线跑完了，奖励到账成功。',
  '当日任务进度已闭环，奖励我帮你收到了。',
  '今日任务完成得很稳，奖励已经同步。',
  '你今天的执行力很强，这笔奖励已入账。',
  '任务清单完成确认，奖励到账无延迟。',
  '日常目标达成，奖励已记录到你的账户。',
  '今天的任务表现很棒，奖励我已经归档。',
  '当日任务奖励已到账，状态继续保持。',
] as const;

const STREAK_LINES = [
  '坚持的奖励来啦，今天也在稳稳变强。',
  '连续学习的价值体现出来了，奖励已到账。',
  '连胜节奏保持住了，这笔奖励我帮你拿下。',
  '你把学习连续性守住了，奖励已同步发放。',
  '连续学习加成触发成功，奖励到账确认。',
  '这段连续学习很漂亮，奖励已经进账。',
  '连学里程碑达成，奖励我已替你记录。',
  '持续投入正在兑现，这笔奖励已落账。',
  '连续学习奖励已到位，节奏相当不错。',
  '你把状态稳住了，连学奖励已经到账。',
] as const;

const DEFAULT_POSITIVE_LINES = [
  '你的努力已经变成积分了，我看到啦。',
  '这笔正向收益已经到账，继续保持当前节奏。',
  '收益通知已确认，我会继续帮你盯住进度。',
  '这次奖励已落账，你可以直接进入下一步。',
  '到账信息已同步完成，状态保持得很好。',
  '我已确认这笔收益入账，继续专注当前任务。',
  '这条收益记录已经整理好，节奏很稳。',
  '正向积分变动已到位，你的推进很扎实。',
  '刚刚这笔收益我已经收录，继续前进。',
  '奖励到账完成，今天的学习势头很棒。',
] as const;

const STUDY_NUDGE_LINES = [
  '我把你的学习节奏记着呢，今天先陪你打一小关。',
  '这里不用硬撑，我已经帮你把卡点收好了。',
  '你负责往前走一点点，剩下的复习路线我来盯。',
  '刚才的努力我看见啦，这个小进度会算数的。',
  '别急着重来整节课，我们先把最小的一块补稳。',
] as const;

const MISTAKE_REVIEW_LINES = [
  '这题不是失败，是我帮你抓到的复习线索。',
  '错题我已经收进小本本了，下次回来会更稳。',
  '这个小卡点我替你圈住啦，不会让它白白溜走。',
  '先别泄气，我会把它放进后面的复习路线里。',
  '这次反馈很有用，我们把它变成下一次的加分点。',
] as const;

const ROUTE_UNLOCK_LINES = [
  '这本笔记的路线图已经铺好啦，今天从哪一关开始呢？',
  '我把学习地图整理好了，先挑一条轻一点的路走。',
  '路线图已生成，后面的关卡我会陪你一格一格推。',
  '这本笔记的副本入口开啦，先打一小关热热手。',
] as const;

export function buildNotificationCompanionCopy(item: AppNotification): CompanionCopy {
  const seed = `${item.id}|${item.sourceKind}|${item.createdAt}`;

  if (item.sourceKind === 'NOTEBOOK_GENERATION_GROUP') {
    return {
      eyebrow: '生成总账单',
      line: pickBySeed(NOTEBOOK_GROUP_LINES, seed),
    };
  }

  if (item.tone !== 'positive') {
    return {
      eyebrow: '积分变动',
      line: pickBySeed(NEGATIVE_GENERIC_LINES, seed),
    };
  }

  switch (item.sourceKind) {
    case 'study_nudge':
    case 'question_memory':
      return { eyebrow: '老师的小本本', line: pickBySeed(STUDY_NUDGE_LINES, seed) };
    case 'mistake_review':
      return { eyebrow: '错题记忆', line: pickBySeed(MISTAKE_REVIEW_LINES, seed) };
    case 'route_unlock':
      return { eyebrow: '学习路线图', line: pickBySeed(ROUTE_UNLOCK_LINES, seed) };
    case 'PRACTICE_SUBMISSION': {
      const tier = item.details.find((detail) => detail.key === 'resultTier')?.value || 'retry';
      const lines =
        tier === 'perfect'
          ? PRACTICE_SUBMISSION_PERFECT_LINES
          : tier === 'good'
            ? PRACTICE_SUBMISSION_GOOD_LINES
            : PRACTICE_SUBMISSION_RETRY_LINES;
      return {
        eyebrow: '做题反馈',
        line: pickBySeed(lines, seed),
      };
    }
    case 'LESSON_REWARD':
      return { eyebrow: '看课奖励', line: pickBySeed(LESSON_REWARD_LINES, seed) };
    case 'QUIZ_COMPLETION_REWARD':
      return { eyebrow: '做题奖励', line: pickBySeed(QUIZ_COMPLETION_LINES, seed) };
    case 'QUIZ_ACCURACY_BONUS':
      return { eyebrow: '正确率加成', line: pickBySeed(QUIZ_ACCURACY_LINES, seed) };
    case 'QUIZ_REWARD_GROUP':
      return { eyebrow: '测验奖励', line: pickBySeed(QUIZ_MERGED_LINES, seed) };
    case 'REVIEW_REWARD':
      return { eyebrow: '回炉奖励', line: pickBySeed(REVIEW_LINES, seed) };
    case 'DAILY_TASK_REWARD':
      return { eyebrow: '今日任务', line: pickBySeed(DAILY_TASK_LINES, seed) };
    case 'STREAK_BONUS':
      return { eyebrow: '连续学习', line: pickBySeed(STREAK_LINES, seed) };
    default:
      return { eyebrow: '积分到账', line: pickBySeed(DEFAULT_POSITIVE_LINES, seed) };
  }
}
