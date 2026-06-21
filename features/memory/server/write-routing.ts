import {
  routeMemoryWriteCandidates,
  type MemoryWriteCandidate,
  type MemoryWriteDecision,
  type MemoryWriteResult,
} from '@/lib/server/memory-write-router';
import type { PrismaClient } from '@/lib/server/generated-prisma';
import type { MemoryLayerId, MemoryReadMode } from '@/features/memory/domain/layered-memory';

export type LayeredMemoryWriteLayer = MemoryLayerId | 'control_facts' | 'business_record' | 'none';

export type LayeredMemoryWritePolicy = {
  layer: LayeredMemoryWriteLayer;
  readModes: MemoryReadMode[];
  mutationPolicy: 'overwrite' | 'append_curate' | 'index' | 'business_source_of_truth' | 'ignore';
  retention: 'hot' | 'durable' | 'full_source' | 'external_record' | 'none';
  staticInjectionCandidate: boolean;
  dynamicDiscoveryCandidate: boolean;
  reason: string;
};

export type LayeredMemoryWriteResult = MemoryWriteResult & {
  memorySystem: LayeredMemoryWritePolicy;
};

function isPrivateLearnerMemory(candidate: MemoryWriteCandidate): boolean {
  return candidate.privacy === 'private' || candidate.studyMemory?.scope === 'private';
}

export function describeLayeredMemoryWritePolicy(
  candidate: MemoryWriteCandidate,
  decision: MemoryWriteDecision,
): LayeredMemoryWritePolicy {
  if (decision.layer === 'structured_fact') {
    return {
      layer: 'control_facts',
      readModes: ['static_injection'],
      mutationPolicy: 'overwrite',
      retention: 'durable',
      staticInjectionCandidate: true,
      dynamicDiscoveryCandidate: false,
      reason:
        'Exact current values live in the control plane so they can overwrite older values and override fuzzy memory.',
    };
  }

  if (decision.layer === 'knowledge_index') {
    return {
      layer: 'knowledge_base',
      readModes: ['dynamic_discovery'],
      mutationPolicy: 'index',
      retention: 'full_source',
      staticInjectionCandidate: false,
      dynamicDiscoveryCandidate: true,
      reason:
        'Original source/problem content is too large and too literal for text memory; keep it retrievable through RAG.',
    };
  }

  if (decision.layer === 'business_record') {
    return {
      layer: 'business_record',
      readModes: ['dynamic_discovery'],
      mutationPolicy: 'business_source_of_truth',
      retention: 'external_record',
      staticInjectionCandidate: false,
      dynamicDiscoveryCandidate: true,
      reason:
        'Problem attempts are primary progress records; derived mastery/gap summaries can become learner memory later.',
    };
  }

  if (decision.layer === 'study_memory') {
    const isShortTerm =
      candidate.trigger === 'chat_turn_end' &&
      (candidate.contentType === 'conversation_summary' ||
        candidate.contentType === 'weakness' ||
        candidate.contentType === 'learning_pattern');
    return {
      layer: isShortTerm ? 'short_term' : 'long_term',
      readModes: isShortTerm ? ['static_injection'] : ['static_injection', 'dynamic_discovery'],
      mutationPolicy: isShortTerm ? 'overwrite' : 'append_curate',
      retention: isShortTerm ? 'hot' : 'durable',
      staticInjectionCandidate: true,
      dynamicDiscoveryCandidate: !isShortTerm,
      reason: isShortTerm
        ? 'This is current learner state and should stay small, overwriteable, and immediately injectable.'
        : isPrivateLearnerMemory(candidate)
          ? 'This is durable learner memory: mastery, weakness, or recurring error pattern.'
          : 'This is durable course/notebook memory: answer contracts, local templates, or teaching constraints.',
    };
  }

  return {
    layer: 'none',
    readModes: [],
    mutationPolicy: 'ignore',
    retention: 'none',
    staticInjectionCandidate: false,
    dynamicDiscoveryCandidate: false,
    reason: decision.reason,
  };
}

export async function routeLayeredMemoryWriteCandidates(args: {
  prisma: PrismaClient;
  userId: string;
  candidates: MemoryWriteCandidate[];
  dryRun?: boolean;
}): Promise<LayeredMemoryWriteResult[]> {
  const results = await routeMemoryWriteCandidates(args);
  return results.map((result, index) => ({
    ...result,
    memorySystem: describeLayeredMemoryWritePolicy(args.candidates[index], result),
  }));
}
