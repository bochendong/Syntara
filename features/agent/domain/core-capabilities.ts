import type { AgentToolDefinition } from './types';

export const CORE_CONTENT_AGENT_TOOLS = [
  {
    id: 'read_course_context',
    namespace: 'openmaic.content',
    feature: 'content',
    title: 'Read course context',
    description:
      'Load the course metadata and summary fields needed by generation and review flows.',
    status: 'route-backed',
    inputContract: 'courseId',
    outputContract:
      'Course metadata, summary counters, language, purpose, tags, and ownership role.',
    entrypoints: [{ kind: 'route', method: 'GET', ref: '/api/courses/[id]' }],
    sideEffects: ['database-read'],
    requiresAuth: true,
    requiresDatabase: true,
  },
  {
    id: 'read_notebook_context',
    namespace: 'openmaic.content',
    feature: 'content',
    title: 'Read notebook context',
    description:
      'Load notebook metadata, scenes or page references, course linkage, and ownership role.',
    status: 'route-backed',
    inputContract: 'notebookId',
    outputContract:
      'Notebook metadata, kind, courseId, scene/page summary, and access information.',
    entrypoints: [{ kind: 'route', method: 'GET', ref: '/api/notebooks/[id]' }],
    sideEffects: ['database-read'],
    requiresAuth: true,
    requiresDatabase: true,
  },
  {
    id: 'write_notebook_scenes',
    namespace: 'openmaic.content',
    feature: 'content',
    title: 'Write notebook scenes',
    description: 'Persist generated scene content and actions for a notebook.',
    status: 'route-backed',
    inputContract: 'notebookId, ordered scenes, actions, and optional whiteboard state.',
    outputContract: 'Persisted scene list and refreshed notebook summary.',
    entrypoints: [{ kind: 'route', method: 'PUT', ref: '/api/notebooks/[id]/scenes' }],
    sideEffects: ['database-write'],
    requiresAuth: true,
    requiresDatabase: true,
  },
  {
    id: 'sync_notebook_generation',
    namespace: 'openmaic.content',
    feature: 'content',
    title: 'Sync notebook generation',
    description:
      'Refresh notebook summary/page records after generated content changes, preserving user-owned data boundaries.',
    status: 'route-backed',
    inputContract: 'notebookId',
    outputContract: 'Notebook summary counters and content version.',
    entrypoints: [{ kind: 'route', method: 'POST', ref: '/api/notebooks/[id]/sync' }],
    sideEffects: ['database-write'],
    requiresAuth: true,
    requiresDatabase: true,
  },
] satisfies readonly AgentToolDefinition[];

export const CORE_GENERATION_JOB_AGENT_TOOLS = [
  {
    id: 'create_generation_job',
    namespace: 'openmaic.generation_jobs',
    feature: 'agent',
    title: 'Create generation job',
    description: 'Create a durable agent task for long-running generation or import work.',
    status: 'route-backed',
    inputContract:
      'Task kind, target identifiers, request payload, and optional envelope metadata.',
    outputContract: 'Agent task id, status, and initial request snapshot.',
    entrypoints: [{ kind: 'route', method: 'POST', ref: '/api/agent-tasks' }],
    sideEffects: ['database-write', 'long-running-job'],
    requiresAuth: true,
    requiresDatabase: true,
  },
  {
    id: 'read_generation_job',
    namespace: 'openmaic.generation_jobs',
    feature: 'agent',
    title: 'Read generation job',
    description: 'Read generated task progress and envelopes for resumable agent work.',
    status: 'route-backed',
    inputContract: 'Optional task filters or task id.',
    outputContract: 'Agent task records and progress envelopes.',
    entrypoints: [
      { kind: 'route', method: 'GET', ref: '/api/agent-tasks' },
      { kind: 'route', method: 'GET', ref: '/api/agent-tasks/[id]/envelopes' },
    ],
    sideEffects: ['database-read'],
    requiresAuth: true,
    requiresDatabase: true,
  },
] satisfies readonly AgentToolDefinition[];

export const CORE_AGENT_TOOLS = [
  ...CORE_CONTENT_AGENT_TOOLS,
  ...CORE_GENERATION_JOB_AGENT_TOOLS,
] satisfies readonly AgentToolDefinition[];
