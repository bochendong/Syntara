import { TEACHING_TOOL_CONTRACTS } from './tool-contracts';
import type { TeachingToolContract } from './types';

type JsonSchema = Record<string, unknown>;

export type TeachingFunctionToolSpec = {
  type: 'function';
  name: string;
  description: string;
  parameters: JsonSchema;
  metadata: {
    contractId: TeachingToolContract['id'];
    readsFrom: string[];
    writesTo: string[];
    requiredEvidenceSources: string[];
    outputEvidenceSources: string[];
  };
};

const teachingToolParameters: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: {
      type: 'object',
      additionalProperties: false,
      properties: {
        targetType: { type: 'string', enum: ['user', 'course', 'notebook', 'conversation'] },
        targetId: { type: 'string' },
        courseId: { type: 'string' },
        notebookId: { type: 'string' },
      },
      required: ['targetType', 'targetId'],
    },
    query: {
      type: 'string',
      description: 'The learner request or rewritten teaching query.',
    },
    locale: {
      type: 'string',
      enum: ['zh-CN', 'en-US'],
    },
    intent: {
      type: 'string',
      description: 'Known teaching intent when already classified.',
    },
    evidence: {
      type: 'array',
      description: 'Evidence items already collected by prior tools.',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
    constraints: {
      type: 'object',
      description: 'Mode-specific limits such as duration, question count, or difficulty.',
      additionalProperties: true,
    },
  },
  required: ['target', 'query'],
};

export function teachingContractToFunctionTool(
  contract: TeachingToolContract,
): TeachingFunctionToolSpec {
  return {
    type: 'function',
    name: contract.id,
    description: contract.description,
    parameters: teachingToolParameters,
    metadata: {
      contractId: contract.id,
      readsFrom: contract.readsFrom,
      writesTo: contract.writesTo,
      requiredEvidenceSources: contract.requiredEvidenceSources,
      outputEvidenceSources: contract.outputEvidenceSources,
    },
  };
}

export function listTeachingFunctionTools(): TeachingFunctionToolSpec[] {
  return TEACHING_TOOL_CONTRACTS.map(teachingContractToFunctionTool);
}
