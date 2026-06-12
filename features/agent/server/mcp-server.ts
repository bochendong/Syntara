import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {
  AGENT_CAPABILITY_REGISTRY,
  AGENT_CAPABILITY_REGISTRY_VERSION,
  AGENT_SKILLS,
  AGENT_TOOLS,
  getAgentMcpResource,
  getAgentSkill,
  getAgentSkillDocument,
  getAgentTool,
  listAgentToolsForNamespace,
  validateAgentCapabilityRegistry,
} from '@/features/agent/domain/registry';
import { AGENT_MCP_RESOURCES } from '@/features/agent/domain/mcp-resources';
import { AGENT_SKILL_DOCUMENTS } from '@/features/agent/domain/skill-documents';
import type { AgentSkillDocumentDefinition } from '@/features/agent/domain/types';

const JSON_MIME_TYPE = 'application/json';
const MARKDOWN_MIME_TYPE = 'text/markdown';

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toolTextResult(value: unknown, isError = false) {
  return {
    isError,
    content: [
      {
        type: 'text' as const,
        text: stableJson(value),
      },
    ],
  };
}

function resourceJsonResult(uri: URL, value: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: JSON_MIME_TYPE,
        text: stableJson(value),
      },
    ],
  };
}

function resourceTextResult(uri: URL, text: string, mimeType: string) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType,
        text,
      },
    ],
  };
}

function registerJsonResource(
  server: McpServer,
  name: string,
  uri: string,
  title: string,
  description: string,
  read: () => unknown,
) {
  server.registerResource(
    name,
    uri,
    {
      title,
      description,
      mimeType: JSON_MIME_TYPE,
    },
    async (resourceUri) => resourceJsonResult(resourceUri, read()),
  );
}

function registerTextResource(
  server: McpServer,
  name: string,
  uri: string,
  title: string,
  description: string,
  mimeType: string,
  read: () => Promise<string> | string,
) {
  server.registerResource(
    name,
    uri,
    {
      title,
      description,
      mimeType,
    },
    async (resourceUri) => resourceTextResult(resourceUri, await read(), mimeType),
  );
}

function readSkillDocument(document: AgentSkillDocumentDefinition): Promise<string> {
  return readFile(resolve(process.cwd(), document.path), 'utf8');
}

export function createOpenMaicMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'openmaic-agent-capabilities',
      version: AGENT_CAPABILITY_REGISTRY_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  registerJsonResource(
    server,
    'openmaic-capability-registry',
    'openmaic://capabilities/registry',
    'OpenMAIC capability registry',
    'Complete skill, MCP resource, and tool registry for OpenMAIC agent workflows.',
    () => AGENT_CAPABILITY_REGISTRY,
  );
  registerJsonResource(
    server,
    'openmaic-skills',
    'openmaic://capabilities/skills',
    'OpenMAIC skills',
    'User-facing agent workflows: PPT generation, problem import, custom review, and memory writing.',
    () => AGENT_SKILLS,
  );
  registerJsonResource(
    server,
    'openmaic-skill-documents',
    'openmaic://capabilities/skill-documents',
    'OpenMAIC skill documents',
    'Project-local SKILL.md documents available to OpenMAIC agent workflows.',
    () => AGENT_SKILL_DOCUMENTS,
  );
  registerJsonResource(
    server,
    'openmaic-mcp-resources',
    'openmaic://capabilities/mcp-resources',
    'OpenMAIC MCP resources',
    'Protected OpenMAIC MCP namespaces and the tools they expose.',
    () => AGENT_MCP_RESOURCES,
  );
  registerJsonResource(
    server,
    'openmaic-tools',
    'openmaic://capabilities/tools',
    'OpenMAIC tools',
    'Route-, service-, and client-backed atomic operations available to agent skills.',
    () => AGENT_TOOLS,
  );
  registerJsonResource(
    server,
    'openmaic-registry-validation',
    'openmaic://capabilities/validation',
    'OpenMAIC registry validation',
    'Consistency report for skill, MCP namespace, and tool references.',
    () => {
      const issues = validateAgentCapabilityRegistry();
      return {
        ok: issues.length === 0,
        issues,
      };
    },
  );

  for (const resource of AGENT_MCP_RESOURCES) {
    registerJsonResource(
      server,
      `openmaic-mcp-${resource.namespace}`,
      `openmaic://mcp/${encodeURIComponent(resource.namespace)}`,
      resource.title,
      resource.description,
      () => resource,
    );
  }

  for (const document of AGENT_SKILL_DOCUMENTS) {
    registerTextResource(
      server,
      `openmaic-skill-${document.id}`,
      document.resourceUri,
      document.title,
      document.description,
      MARKDOWN_MIME_TYPE,
      () => readSkillDocument(document),
    );
  }

  server.registerTool(
    'openmaic_list_skills',
    {
      title: 'List OpenMAIC skills',
      description: 'List the four main OpenMAIC agent skills and their workflow stages.',
    },
    async () => toolTextResult({ skills: AGENT_SKILLS }),
  );

  server.registerTool(
    'openmaic_get_skill',
    {
      title: 'Get OpenMAIC skill',
      description: 'Get one OpenMAIC skill definition by id.',
      inputSchema: {
        id: z.string().describe('Skill id, for example generate_ppt_notebook.'),
      },
    },
    async ({ id }) => {
      const skill = getAgentSkill(id);
      return skill
        ? toolTextResult({ skill, skillDocument: getAgentSkillDocument(id) })
        : toolTextResult({ error: `Unknown skill id: ${id}` }, true);
    },
  );

  server.registerTool(
    'openmaic_list_skill_documents',
    {
      title: 'List OpenMAIC skill documents',
      description: 'List project-local SKILL.md documents and their MCP resource URIs.',
    },
    async () => toolTextResult({ skillDocuments: AGENT_SKILL_DOCUMENTS }),
  );

  server.registerTool(
    'openmaic_get_skill_document',
    {
      title: 'Get OpenMAIC skill document',
      description: 'Get project-local SKILL.md metadata and optionally its Markdown body.',
      inputSchema: {
        id: z.string().describe('Skill document id, for example generate_ppt_notebook.'),
        includeContent: z
          .boolean()
          .optional()
          .describe('When true, include the SKILL.md Markdown text in the tool response.'),
      },
    },
    async ({ id, includeContent }) => {
      const document = getAgentSkillDocument(id);
      if (!document) {
        return toolTextResult({ error: `Unknown skill document id: ${id}` }, true);
      }

      if (!includeContent) return toolTextResult({ skillDocument: document });

      try {
        return toolTextResult({
          skillDocument: document,
          content: await readSkillDocument(document),
        });
      } catch (error) {
        return toolTextResult(
          {
            error: `Failed to read skill document: ${id}`,
            details: error instanceof Error ? error.message : String(error),
          },
          true,
        );
      }
    },
  );

  server.registerTool(
    'openmaic_list_mcp_resources',
    {
      title: 'List OpenMAIC MCP resources',
      description: 'List protected OpenMAIC MCP namespaces and their owned data boundaries.',
    },
    async () => toolTextResult({ mcpResources: AGENT_MCP_RESOURCES }),
  );

  server.registerTool(
    'openmaic_get_mcp_resource',
    {
      title: 'Get OpenMAIC MCP resource',
      description: 'Get one OpenMAIC MCP resource namespace by name.',
      inputSchema: {
        namespace: z.string().describe('MCP namespace, for example openmaic.problem_bank.'),
      },
    },
    async ({ namespace }) => {
      const resource = getAgentMcpResource(namespace);
      return resource
        ? toolTextResult({ mcpResource: resource })
        : toolTextResult({ error: `Unknown MCP namespace: ${namespace}` }, true);
    },
  );

  server.registerTool(
    'openmaic_list_tools',
    {
      title: 'List OpenMAIC tools',
      description:
        'List OpenMAIC route-, service-, and client-backed tools, optionally filtered by MCP namespace.',
      inputSchema: {
        namespace: z.string().optional().describe('Optional MCP namespace filter.'),
      },
    },
    async ({ namespace }) =>
      toolTextResult({
        tools: namespace ? listAgentToolsForNamespace(namespace) : AGENT_TOOLS,
      }),
  );

  server.registerTool(
    'openmaic_get_tool',
    {
      title: 'Get OpenMAIC tool',
      description: 'Get one OpenMAIC tool definition by id.',
      inputSchema: {
        id: z.string().describe('Tool id, for example preview_problem_import.'),
      },
    },
    async ({ id }) => {
      const tool = getAgentTool(id);
      return tool
        ? toolTextResult({ tool })
        : toolTextResult({ error: `Unknown tool id: ${id}` }, true);
    },
  );

  server.registerTool(
    'openmaic_validate_registry',
    {
      title: 'Validate OpenMAIC registry',
      description:
        'Validate that skills, MCP namespaces, and tools reference each other correctly.',
    },
    async () => {
      const issues = validateAgentCapabilityRegistry();
      return toolTextResult({
        ok: issues.length === 0,
        issues,
      });
    },
  );

  return server;
}
