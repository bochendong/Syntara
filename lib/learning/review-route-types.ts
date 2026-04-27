import { z } from 'zod';

export const reviewRouteNodeSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  kind: z.enum(['normal', 'elite', 'boss', 'camp', 'treasure', 'event', 'shop']),
  knowledgePoints: z.array(z.string().trim().min(1)).min(1).max(6),
  questionStyle: z.string().trim().min(1),
  checkGoal: z.string().trim().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  personalReason: z.string().trim().min(1).optional(),
  passCriteria: z.string().trim().min(1).optional(),
  questionCount: z.number().int().min(0).max(12).default(1),
  sourceSignals: z.array(z.string().trim().min(1)).max(6).default([]),
  requiresQuestion: z.boolean().default(true),
  rewardKind: z
    .enum([
      'none',
      'run_card',
      'reward_coin',
      'card_back_shard',
      'relic_shard',
      'forgiveness',
      'card_upgrade',
      'hint_card',
      'mentor_cosmetic_shard',
      'multiplier',
    ])
    .default('none'),
  rewardPoints: z.number().int().min(0).max(999).default(0),
  rewardPreview: z.string().trim().min(1).optional(),
  eventOptions: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        effect: z.string().trim().min(1),
        tradeoff: z.string().trim().min(1).optional(),
        rewardPreview: z.string().trim().min(1).optional(),
      }),
    )
    .max(3)
    .default([]),
});

export const reviewRouteLayerSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  nodes: z.array(reviewRouteNodeSchema).min(1).max(4),
});

export const reviewRouteSchema = z.object({
  title: z.string().trim().min(1),
  teacherLine: z.string().trim().min(1),
  coverageContract: z.string().trim().min(1),
  knowledgePoints: z.array(z.string().trim().min(1)).min(1).max(24),
  layers: z.array(reviewRouteLayerSchema).min(3).max(8),
});

export type ReviewRouteNode = z.infer<typeof reviewRouteNodeSchema>;
export type ReviewRouteLayer = z.infer<typeof reviewRouteLayerSchema>;
export type ReviewRoute = z.infer<typeof reviewRouteSchema>;
