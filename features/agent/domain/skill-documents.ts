import type { AgentSkillDocumentDefinition } from './types';

export const AGENT_SKILL_DOCUMENTS = [
  {
    id: 'generate_ppt_notebook',
    title: 'Generate PPT notebook skill',
    description:
      'Project-local workflow for generating a complete OpenMAIC notebook/PPT from source material.',
    kind: 'primary',
    path: 'features/agent/skills/generate-ppt/SKILL.md',
    resourceUri: 'openmaic://skills/generate_ppt_notebook',
    parentSkillIds: [],
  },
  {
    id: 'generate_ppt_page_content',
    title: 'Generate PPT page content skill',
    description:
      'Supporting workflow for converting one approved outline item into scoped page content.',
    kind: 'supporting',
    path: 'features/agent/skills/page-content/SKILL.md',
    resourceUri: 'openmaic://skills/generate_ppt_page_content',
    parentSkillIds: ['generate_ppt_notebook'],
  },
  {
    id: 'render_lecture_image',
    title: 'Render lecture image skill',
    description:
      'Supporting workflow for generating or repairing visual lecture pages and focus-region assets.',
    kind: 'supporting',
    path: 'features/agent/skills/render-lecture-image/SKILL.md',
    resourceUri: 'openmaic://skills/render_lecture_image',
    parentSkillIds: ['generate_ppt_notebook'],
  },
  {
    id: 'import_problem_bank',
    title: 'Import problem bank skill',
    description:
      'Project-local workflow for previewing, reviewing, and committing problem-bank imports.',
    kind: 'primary',
    path: 'features/agent/skills/import-problems/SKILL.md',
    resourceUri: 'openmaic://skills/import_problem_bank',
    parentSkillIds: [],
  },
  {
    id: 'custom_review_route',
    title: 'Custom review route skill',
    description: 'Project-local workflow for generating and running personalized review routes.',
    kind: 'primary',
    path: 'features/agent/skills/custom-review/SKILL.md',
    resourceUri: 'openmaic://skills/custom_review_route',
    parentSkillIds: [],
  },
  {
    id: 'ingest_source_memory',
    title: 'Ingest source memory skill',
    description:
      'Project-local workflow for turning uploaded files into long-term memory, knowledge-base RAG, or ignored generic source text.',
    kind: 'primary',
    path: 'features/agent/skills/ingest-source-memory/SKILL.md',
    resourceUri: 'openmaic://skills/ingest_source_memory',
    parentSkillIds: [],
  },
  {
    id: 'write_fact_memory',
    title: 'Write structured fact memory skill',
    description: 'Project-local workflow for writing exact, overwriteable memory facts.',
    kind: 'primary',
    path: 'features/agent/skills/write-fact-memory/SKILL.md',
    resourceUri: 'openmaic://skills/write_fact_memory',
    parentSkillIds: [],
  },
  {
    id: 'write_study_memory',
    title: 'Write study memory skill',
    description:
      'Project-local workflow for writing public course/notebook notes or private learner experiences.',
    kind: 'primary',
    path: 'features/agent/skills/write-memory/SKILL.md',
    resourceUri: 'openmaic://skills/write_study_memory',
    parentSkillIds: [],
  },
  {
    id: 'teaching_orchestrator',
    title: 'Teaching orchestrator skill',
    description:
      'Project-local workflow for routing learning requests through teaching tools with explicit evidence ledgers and rationale.',
    kind: 'primary',
    path: 'features/agent/skills/teaching-orchestrator/SKILL.md',
    resourceUri: 'openmaic://skills/teaching_orchestrator',
    parentSkillIds: [],
  },
] satisfies readonly AgentSkillDocumentDefinition[];
