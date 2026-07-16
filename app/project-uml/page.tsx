import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ProjectUmlClient } from './project-uml-client';

export default async function ProjectUmlPage() {
  const markdownPath = path.join(process.cwd(), 'docs', 'project-uml.md');
  const markdown = await readFile(markdownPath, 'utf8');

  return <ProjectUmlClient markdown={markdown} />;
}
