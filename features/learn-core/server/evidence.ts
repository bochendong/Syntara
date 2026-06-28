import type { LearnArtifact, LearnEvidenceLink, LearnTurnInput } from '../domain/types';
import { recordString } from './run-context';

export function createLearnEvidence(args: Omit<LearnEvidenceLink, 'id'>): LearnEvidenceLink {
  return {
    id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...args,
  };
}

export function questionEvidence(input: LearnTurnInput, supports: string): LearnEvidenceLink {
  return createLearnEvidence({
    sourceType: 'user_message',
    title: 'Latest learner message',
    quoteOrSummary: input.question,
    supports,
    confidence: 0.95,
  });
}

export function sourceEvidenceArtifact(input: LearnTurnInput): LearnArtifact {
  return {
    kind: 'answer_evidence',
    id: `source-evidence-${Date.now()}`,
    query: input.question,
    requiredLookup: 'uploaded_source',
    mustCite: true,
    sourceCandidates: input.sourceUploads.slice(0, 8).map((source) => ({
      id: recordString(source, 'id') || recordString(source, 'sourceHash'),
      title: recordString(source, 'title'),
      kind: recordString(source, 'kind'),
      ragEntryIds: Array.isArray(source.ragEntryIds) ? source.ragEntryIds : [],
    })),
  };
}
