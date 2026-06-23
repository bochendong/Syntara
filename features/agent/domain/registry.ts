import {
  GENERATE_PPT_NOTEBOOK_SKILL,
  PPT_GENERATION_AGENT_TOOLS,
} from '@/features/ppt-generation/agent-capabilities';
import {
  IMPORT_PROBLEM_BANK_SKILL,
  PROBLEM_BANK_AGENT_TOOLS,
} from '@/features/problems/agent-capabilities';
import {
  CUSTOM_REVIEW_ROUTE_SKILL,
  REVIEW_AGENT_TOOLS,
} from '@/features/review/agent-capabilities';
import {
  INGEST_SOURCE_MEMORY_SKILL,
  MEMORY_AGENT_TOOLS,
  WRITE_FACT_MEMORY_SKILL,
  WRITE_STUDY_MEMORY_SKILL,
} from '@/features/memory/agent-capabilities';
import {
  TEACHING_ORCHESTRATOR_AGENT_TOOLS,
  TEACHING_ORCHESTRATOR_SKILL,
} from '@/features/teaching-orchestrator/agent-capabilities';
import { CORE_AGENT_TOOLS } from './core-capabilities';
import { AGENT_MCP_RESOURCES } from './mcp-resources';
import { AGENT_SKILL_DOCUMENTS } from './skill-documents';
import type {
  AgentMcpResourceDefinition,
  AgentSkillDefinition,
  AgentSkillDocumentDefinition,
  AgentToolDefinition,
} from './types';

export const AGENT_CAPABILITY_REGISTRY_VERSION = '2026-06-22';

export const AGENT_TOOLS = [
  ...CORE_AGENT_TOOLS,
  ...PPT_GENERATION_AGENT_TOOLS,
  ...PROBLEM_BANK_AGENT_TOOLS,
  ...REVIEW_AGENT_TOOLS,
  ...MEMORY_AGENT_TOOLS,
  ...TEACHING_ORCHESTRATOR_AGENT_TOOLS,
] satisfies readonly AgentToolDefinition[];

export const AGENT_SKILLS = [
  GENERATE_PPT_NOTEBOOK_SKILL,
  IMPORT_PROBLEM_BANK_SKILL,
  CUSTOM_REVIEW_ROUTE_SKILL,
  INGEST_SOURCE_MEMORY_SKILL,
  WRITE_FACT_MEMORY_SKILL,
  WRITE_STUDY_MEMORY_SKILL,
  TEACHING_ORCHESTRATOR_SKILL,
] satisfies readonly AgentSkillDefinition[];

function indexById<T extends { id: string }>(items: readonly T[]): Readonly<Record<string, T>> {
  return Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>;
}

function indexByNamespace<T extends { namespace: string }>(
  items: readonly T[],
): Readonly<Record<string, T>> {
  return Object.fromEntries(items.map((item) => [item.namespace, item])) as Record<string, T>;
}

export const AGENT_TOOL_BY_ID = indexById(AGENT_TOOLS);
export const AGENT_SKILL_BY_ID = indexById(AGENT_SKILLS);
export const AGENT_SKILL_DOCUMENT_BY_ID = indexById(AGENT_SKILL_DOCUMENTS);
export const AGENT_MCP_RESOURCE_BY_NAMESPACE = indexByNamespace(AGENT_MCP_RESOURCES);

export const AGENT_CAPABILITY_REGISTRY = {
  version: AGENT_CAPABILITY_REGISTRY_VERSION,
  skills: AGENT_SKILLS,
  skillDocuments: AGENT_SKILL_DOCUMENTS,
  mcpResources: AGENT_MCP_RESOURCES,
  tools: AGENT_TOOLS,
};

export function getAgentTool(id: string): AgentToolDefinition | null {
  return AGENT_TOOL_BY_ID[id] ?? null;
}

export function getAgentSkill(id: string): AgentSkillDefinition | null {
  return AGENT_SKILL_BY_ID[id] ?? null;
}

export function getAgentSkillDocument(id: string): AgentSkillDocumentDefinition | null {
  return AGENT_SKILL_DOCUMENT_BY_ID[id] ?? null;
}

export function getAgentMcpResource(namespace: string): AgentMcpResourceDefinition | null {
  return AGENT_MCP_RESOURCE_BY_NAMESPACE[namespace] ?? null;
}

export function listAgentToolsForNamespace(namespace: string): AgentToolDefinition[] {
  return AGENT_TOOLS.filter((tool) => tool.namespace === namespace);
}

export function validateAgentCapabilityRegistry(): string[] {
  const issues: string[] = [];
  const toolIds = new Set<string>();

  for (const tool of AGENT_TOOLS) {
    if (toolIds.has(tool.id)) issues.push(`Duplicate tool id: ${tool.id}`);
    toolIds.add(tool.id);
    if (!AGENT_MCP_RESOURCE_BY_NAMESPACE[tool.namespace]) {
      issues.push(`Tool ${tool.id} references missing MCP namespace: ${tool.namespace}`);
    }
  }

  const skillDocumentIds = new Set<string>();
  const skillDocumentUris = new Set<string>();
  const skillDocumentPaths = new Set<string>();
  for (const document of AGENT_SKILL_DOCUMENTS) {
    if (skillDocumentIds.has(document.id)) {
      issues.push(`Duplicate skill document id: ${document.id}`);
    }
    skillDocumentIds.add(document.id);

    if (skillDocumentUris.has(document.resourceUri)) {
      issues.push(`Duplicate skill document URI: ${document.resourceUri}`);
    }
    skillDocumentUris.add(document.resourceUri);

    if (skillDocumentPaths.has(document.path)) {
      issues.push(`Duplicate skill document path: ${document.path}`);
    }
    skillDocumentPaths.add(document.path);
  }

  const mcpNamespaces = new Set(AGENT_MCP_RESOURCES.map((resource) => resource.namespace));
  for (const resource of AGENT_MCP_RESOURCES) {
    for (const toolId of [...resource.readToolIds, ...resource.writeToolIds]) {
      if (!toolIds.has(toolId)) {
        issues.push(`MCP ${resource.namespace} references missing tool: ${toolId}`);
      }
    }
  }

  const skillIds = new Set<string>();
  for (const skill of AGENT_SKILLS) {
    if (skillIds.has(skill.id)) issues.push(`Duplicate skill id: ${skill.id}`);
    skillIds.add(skill.id);

    const document = AGENT_SKILL_DOCUMENT_BY_ID[skill.id];
    if (!document) {
      issues.push(`Skill ${skill.id} references missing primary skill document`);
    } else {
      if (document.kind !== 'primary') {
        issues.push(`Skill ${skill.id} primary document is not marked primary`);
      }
      if (skill.skillDocumentPath !== document.path) {
        issues.push(`Skill ${skill.id} document path mismatch: ${skill.skillDocumentPath}`);
      }
      if (skill.skillDocumentUri !== document.resourceUri) {
        issues.push(`Skill ${skill.id} document URI mismatch: ${skill.skillDocumentUri}`);
      }
    }

    for (const documentId of skill.supportingSkillDocumentIds) {
      const supportingDocument = AGENT_SKILL_DOCUMENT_BY_ID[documentId];
      if (!supportingDocument) {
        issues.push(`Skill ${skill.id} references missing supporting document: ${documentId}`);
      } else if (!(supportingDocument.parentSkillIds as readonly string[]).includes(skill.id)) {
        issues.push(`Supporting document ${documentId} does not list parent skill: ${skill.id}`);
      }
    }

    for (const namespace of skill.mcpNamespaces) {
      if (!mcpNamespaces.has(namespace)) {
        issues.push(`Skill ${skill.id} references missing MCP namespace: ${namespace}`);
      }
    }
    for (const toolId of skill.toolIds) {
      if (!toolIds.has(toolId)) issues.push(`Skill ${skill.id} references missing tool: ${toolId}`);
    }
    for (const stage of skill.stages) {
      for (const toolId of stage.toolIds) {
        if (!toolIds.has(toolId)) {
          issues.push(`Skill ${skill.id} stage ${stage.id} references missing tool: ${toolId}`);
        }
      }
    }
  }

  for (const document of AGENT_SKILL_DOCUMENTS) {
    for (const parentSkillId of document.parentSkillIds) {
      if (!skillIds.has(parentSkillId)) {
        issues.push(
          `Skill document ${document.id} references missing parent skill: ${parentSkillId}`,
        );
      }
    }
  }

  return issues;
}
