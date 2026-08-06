import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildExecutionGraph, type ExecutionGraphV1 } from './graph.js';
import type { ArtifactReferenceV1Schema, TaskNodeV1, TddPolicy } from './schemas.js';
import type { z } from 'zod';

export type ArtifactReferenceV1 = z.infer<typeof ArtifactReferenceV1Schema>;

export interface TaskMetadataV1 {
  dependencies?: string[];
  risk?: TaskNodeV1['risk'];
  expectedVerification?: string[];
  writeSet?: string[];
  requirementRefs?: string[];
  scenarioRefs?: string[];
  tdd?: TddPolicy;
}

export interface CompiledOpenSpecChangeV1 {
  artifacts: ArtifactReferenceV1[];
  graph: ExecutionGraphV1;
  requirementIds: string[];
  scenarioIds: string[];
  routingText: string;
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function walkMarkdown(directory: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walkMarkdown(candidate));
    else if (entry.isFile() && entry.name.endsWith('.md')) results.push(candidate);
  }
  return results.sort();
}

function extractSpecIds(specPath: string, content: string, changeDir: string): {
  requirements: string[];
  scenarios: string[];
} {
  const capability = slug(path.basename(path.dirname(specPath)));
  const requirements: string[] = [];
  const scenarios: string[] = [];
  let currentRequirement: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    const requirement = /^### Requirement:\s+(.+)$/.exec(line);
    if (requirement) {
      currentRequirement = `spec:${capability}#requirement:${slug(requirement[1])}`;
      requirements.push(currentRequirement);
      continue;
    }
    const scenario = /^#### Scenario:\s+(.+)$/.exec(line);
    if (scenario && currentRequirement) scenarios.push(`${currentRequirement}/scenario:${slug(scenario[1])}`);
  }
  if (requirements.length === 0) {
    requirements.push(`spec:${path.relative(changeDir, specPath).split(path.sep).join('/')}`);
  }
  return { requirements, scenarios };
}

function inferRisk(description: string): TaskNodeV1['risk'] {
  const text = description.toLowerCase();
  if (/cryptograph|authorization|authentication|secret|trust boundar/.test(text)) return 'critical';
  if (/security|migration|public api|schema|archive gate|shell|untrusted/.test(text)) return 'high';
  if (/implement|behavior|fix|workflow|integration|cli/.test(text)) return 'medium';
  return 'low';
}

function inferVerification(description: string, risk: TaskNodeV1['risk']): string[] {
  const checks = ['targeted-tests'];
  if (/documentation|readme|docs/.test(description.toLowerCase())) checks.push('documentation');
  if (risk === 'high' || risk === 'critical') checks.push('risk-review');
  return checks;
}

function parseTasks(content: string, metadata: Record<string, TaskMetadataV1>): TaskNodeV1[] {
  const nodes: TaskNodeV1[] = [];
  let fallback = 0;
  for (const line of content.split(/\r?\n/)) {
    const task = /^\s*-\s*\[([ xX])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.+)$/.exec(line);
    if (!task) continue;
    fallback += 1;
    const taskId = task[2] ?? String(fallback);
    const description = task[3];
    const details = metadata[taskId] ?? {};
    const risk = details.risk ?? inferRisk(description);
    nodes.push({
      taskId,
      dependencies: details.dependencies ?? [],
      risk,
      expectedVerification: details.expectedVerification ?? inferVerification(description, risk),
      writeSet: details.writeSet ?? [],
      requirementRefs: details.requirementRefs ?? [],
      scenarioRefs: details.scenarioRefs ?? [],
      status: task[1].trim() ? 'complete' : 'pending',
      ...(details.tdd ? { tdd: details.tdd } : {}),
    });
  }
  if (nodes.length === 0) throw new Error('OpenSpec tasks.md contains no checklist task identifiers.');
  return nodes;
}

export async function compileOpenSpecChange(options: {
  changeDir: string;
  taskMetadata?: Record<string, TaskMetadataV1>;
}): Promise<CompiledOpenSpecChangeV1> {
  const artifacts: ArtifactReferenceV1[] = [];
  const routingParts: string[] = [];
  for (const [kind, filename] of [
    ['proposal', 'proposal.md'], ['design', 'design.md'], ['tasks', 'tasks.md'],
  ] as const) {
    const fullPath = path.join(options.changeDir, filename);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      routingParts.push(content);
      artifacts.push({ kind, path: filename, ids: [] });
    } catch {
      if (kind === 'tasks') throw new Error(`Required OpenSpec artifact is missing: ${filename}.`);
    }
  }
  const requirementIds: string[] = [];
  const scenarioIds: string[] = [];
  for (const specPath of await walkMarkdown(path.join(options.changeDir, 'specs'))) {
    const content = await fs.readFile(specPath, 'utf8');
    routingParts.push(content);
    const ids = extractSpecIds(specPath, content, options.changeDir);
    requirementIds.push(...ids.requirements);
    scenarioIds.push(...ids.scenarios);
    artifacts.push({
      kind: 'spec',
      path: path.relative(options.changeDir, specPath).split(path.sep).join('/'),
      ids: [...ids.requirements, ...ids.scenarios],
    });
  }
  const tasks = parseTasks(
    await fs.readFile(path.join(options.changeDir, 'tasks.md'), 'utf8'),
    options.taskMetadata ?? {},
  );
  return {
    artifacts,
    graph: buildExecutionGraph(tasks),
    requirementIds: requirementIds.sort(),
    scenarioIds: scenarioIds.sort(),
    routingText: routingParts.join('\n'),
  };
}
