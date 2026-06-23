export type AgentFeatureDomain =
  | 'agent'
  | 'content'
  | 'ppt-generation'
  | 'problems'
  | 'review'
  | 'memory'
  | 'practice'
  | 'teaching';

export type AgentCapabilityStatus = 'route-backed' | 'service-backed' | 'client-backed' | 'planned';

export type AgentEntrypointKind = 'route' | 'service' | 'client' | 'domain';

export type AgentEntrypoint = {
  kind: AgentEntrypointKind;
  ref: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
};

export type AgentToolSideEffect =
  | 'none'
  | 'llm'
  | 'database-read'
  | 'database-write'
  | 'asset-write'
  | 'local-storage'
  | 'long-running-job';

export type AgentToolDefinition = {
  id: string;
  namespace: string;
  feature: AgentFeatureDomain;
  title: string;
  description: string;
  status: AgentCapabilityStatus;
  inputContract: string;
  outputContract: string;
  entrypoints: readonly AgentEntrypoint[];
  sideEffects: readonly AgentToolSideEffect[];
  requiresAuth: boolean;
  requiresDatabase: boolean;
};

export type AgentMcpResourceDefinition = {
  namespace: string;
  title: string;
  description: string;
  owns: readonly string[];
  readToolIds: readonly string[];
  writeToolIds: readonly string[];
  featureDomains: readonly AgentFeatureDomain[];
};

export type AgentSkillStageDefinition = {
  id: string;
  title: string;
  description: string;
  toolIds: readonly string[];
  required: boolean;
};

export type AgentSkillDefinition = {
  id: string;
  title: string;
  primaryUserFunction: string;
  description: string;
  skillDocumentPath: string;
  skillDocumentUri: string;
  supportingSkillDocumentIds: readonly string[];
  mcpNamespaces: readonly string[];
  toolIds: readonly string[];
  stages: readonly AgentSkillStageDefinition[];
  qualityGates: readonly string[];
  outputs: readonly string[];
};

export type AgentSkillDocumentKind = 'primary' | 'supporting';

export type AgentSkillDocumentDefinition = {
  id: string;
  title: string;
  description: string;
  kind: AgentSkillDocumentKind;
  path: string;
  resourceUri: string;
  parentSkillIds: readonly string[];
};
