import { createHash } from 'node:crypto';
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
  taskAdapter: 'openspec-apply-json-v1' | 'markdown-v1';
  requirementAdapter: 'openspec-show-json-v1' | 'markdown-v1';
}

export interface OpenSpecMachineReadableTaskV1 {
  id: string;
  description: string;
  done: boolean;
}

export interface OpenSpecMachineReadableSnapshotV1 {
  adapterVersion: 'openspec-apply-json-v1';
  tasks: OpenSpecMachineReadableTaskV1[];
  requirements?: Array<{ spec: string; text: string }>;
}

function sourceDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function portablePath(value: string, pathApi: path.PlatformPath = path): string {
  return value.split(pathApi.sep).join('/');
}

export function resolveContainedArtifactPath(
  changeDir: string,
  artifactPath: string,
  pathApi: path.PlatformPath = path,
): string {
  if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(artifactPath) || pathApi.isAbsolute(artifactPath)) {
    throw new Error(`Artifact path '${artifactPath}' must be change-relative.`);
  }
  const normalizedInput = artifactPath.replace(/[\\/]+/g, pathApi.sep);
  const candidate = pathApi.resolve(changeDir, normalizedInput);
  const relative = pathApi.relative(pathApi.resolve(changeDir), candidate);
  if (relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
    throw new Error(`Artifact path '${artifactPath}' escapes the OpenSpec change directory.`);
  }
  return candidate;
}

export function assertStableTaskBinding(task: TaskNodeV1): void {
  if (task.idStability !== 'explicit') {
    throw new Error(
      `Task '${task.taskId}' cannot receive durable evidence without an explicit stable identifier. ` +
      'Prefix the checklist item with a numeric ID such as 1.1 or a bracketed ID such as [TASK-1].',
    );
  }
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

function taskIdentity(value: string, position: number): {
  taskId: string;
  idStability: 'explicit' | 'positional';
  description: string;
} {
  const numeric = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(value);
  if (numeric) return { taskId: numeric[1], idStability: 'explicit', description: numeric[2] };
  const bracketed = /^\[([A-Za-z0-9][A-Za-z0-9._-]*)\]\s+(.+)$/.exec(value);
  if (bracketed) return { taskId: bracketed[1], idStability: 'explicit', description: bracketed[2] };
  return { taskId: `position:${position}`, idStability: 'positional', description: value };
}

function taskNode(options: {
  identity: ReturnType<typeof taskIdentity>;
  complete: boolean;
  position: number;
  tasksDigest: string;
  metadata: Record<string, TaskMetadataV1>;
}): TaskNodeV1 {
  const { taskId, idStability, description } = options.identity;
  const details = options.metadata[taskId] ?? {};
  const risk = details.risk ?? inferRisk(description);
  return {
    taskId,
    idStability,
    sourcePath: 'tasks.md',
    sourceDigest: options.tasksDigest,
    sourceLine: options.position,
    dependencies: details.dependencies ?? [],
    risk,
    expectedVerification: details.expectedVerification ?? inferVerification(description, risk),
    writeSet: details.writeSet ?? [],
    requirementRefs: details.requirementRefs ?? [],
    scenarioRefs: details.scenarioRefs ?? [],
    status: options.complete ? 'complete' : 'pending',
    ...(details.tdd ? { tdd: details.tdd } : {}),
  };
}

function parseTasks(
  content: string,
  metadata: Record<string, TaskMetadataV1>,
  machineReadable?: OpenSpecMachineReadableSnapshotV1,
): TaskNodeV1[] {
  const nodes: TaskNodeV1[] = [];
  const tasksDigest = sourceDigest(content);
  if (machineReadable) {
    for (const [index, item] of machineReadable.tasks.entries()) {
      nodes.push(taskNode({
        identity: taskIdentity(item.description.trim(), index + 1),
        complete: item.done,
        position: index + 1,
        tasksDigest,
        metadata,
      }));
    }
    if (nodes.length === 0) throw new Error('OpenSpec machine-readable task output contains no tasks.');
    return nodes;
  }
  let fallback = 0;
  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    const task = /^\s*-\s*\[([ xX])\]\s+(.+)$/.exec(line);
    if (!task) continue;
    fallback += 1;
    nodes.push(taskNode({
      identity: taskIdentity(task[2].trim(), fallback),
      complete: Boolean(task[1].trim()),
      position: lineIndex + 1,
      tasksDigest,
      metadata,
    }));
  }
  if (nodes.length === 0) throw new Error('OpenSpec tasks.md contains no checklist task identifiers.');
  return nodes;
}

export async function compileOpenSpecChange(options: {
  changeDir: string;
  taskMetadata?: Record<string, TaskMetadataV1>;
  machineReadable?: OpenSpecMachineReadableSnapshotV1;
}): Promise<CompiledOpenSpecChangeV1> {
  const artifacts: ArtifactReferenceV1[] = [];
  const routingParts: string[] = [];
  let tasksContent = '';
  for (const [kind, filename] of [
    ['proposal', 'proposal.md'], ['design', 'design.md'], ['tasks', 'tasks.md'],
  ] as const) {
    const fullPath = resolveContainedArtifactPath(options.changeDir, filename);
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      if (kind === 'tasks') tasksContent = content;
      routingParts.push(content);
      artifacts.push({ kind, path: filename, sourceDigest: sourceDigest(content), ids: [] });
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
    const capability = slug(path.basename(path.dirname(specPath)));
    const machineRequirements = options.machineReadable?.requirements
      ?.filter((requirement) => slug(requirement.spec) === capability)
      .map((requirement) => `spec:${capability}#requirement:${slug(requirement.text)}`);
    const resolvedRequirements = machineRequirements?.length ? machineRequirements : ids.requirements;
    requirementIds.push(...resolvedRequirements);
    scenarioIds.push(...ids.scenarios);
    artifacts.push({
      kind: 'spec',
      path: portablePath(path.relative(options.changeDir, specPath)),
      sourceDigest: sourceDigest(content),
      ids: [...resolvedRequirements, ...ids.scenarios],
    });
  }
  const tasks = parseTasks(tasksContent, options.taskMetadata ?? {}, options.machineReadable);
  const tasksArtifact = artifacts.find((artifact) => artifact.kind === 'tasks');
  if (tasksArtifact) tasksArtifact.ids = tasks.map((task) => task.taskId);
  return {
    artifacts,
    graph: buildExecutionGraph(tasks),
    requirementIds: requirementIds.sort(),
    scenarioIds: scenarioIds.sort(),
    routingText: routingParts.join('\n'),
    taskAdapter: options.machineReadable?.adapterVersion ?? 'markdown-v1',
    requirementAdapter: options.machineReadable?.requirements?.length
      ? 'openspec-show-json-v1'
      : 'markdown-v1',
  };
}
