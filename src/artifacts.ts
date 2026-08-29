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
  requirements: CompiledRequirementV1[];
  requirementIds: string[];
  scenarioIds: string[];
  routingText: string;
  taskAdapter: 'openspec-apply-json-v1' | 'markdown-v1';
  requirementAdapter: 'openspec-show-json-v1' | 'markdown-v1';
}

export interface CompiledScenarioV1 {
  id: string;
  title: string;
  body: string;
  sourcePath: string;
  sourceDigest: string;
}

export interface CompiledRequirementV1 {
  id: string;
  title: string;
  body: string;
  scenarios: CompiledScenarioV1[];
  sourcePath: string;
  sourceDigest: string;
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

function extractSpecStructure(specPath: string, content: string, changeDir: string): {
  requirements: CompiledRequirementV1[];
  fallbackId?: string;
} {
  const capability = slug(path.basename(path.dirname(specPath)));
  const sourcePath = portablePath(path.relative(changeDir, specPath));
  const digest = sourceDigest(content);
  const requirements: CompiledRequirementV1[] = [];
  let currentRequirement: CompiledRequirementV1 | undefined;
  let currentScenario: CompiledScenarioV1 | undefined;
  const requirementBody: string[] = [];
  const scenarioBody: string[] = [];
  const flushScenario = () => {
    if (!currentScenario) return;
    currentScenario.body = scenarioBody.join('\n').trim();
    scenarioBody.length = 0;
    currentScenario = undefined;
  };
  const flushRequirement = () => {
    flushScenario();
    if (!currentRequirement) return;
    currentRequirement.body = requirementBody.join('\n').trim();
    requirementBody.length = 0;
    currentRequirement = undefined;
  };
  for (const line of content.split(/\r?\n/)) {
    const requirement = /^### Requirement:\s+(.+)$/.exec(line);
    if (requirement) {
      flushRequirement();
      const title = requirement[1].trim();
      currentRequirement = {
        id: `spec:${capability}#requirement:${slug(title)}`,
        title,
        body: '',
        scenarios: [],
        sourcePath,
        sourceDigest: digest,
      };
      requirements.push(currentRequirement);
      continue;
    }
    const scenario = /^#### Scenario:\s+(.+)$/.exec(line);
    if (scenario && currentRequirement) {
      flushScenario();
      const title = scenario[1].trim();
      currentScenario = {
        id: `${currentRequirement.id}/scenario:${slug(title)}`,
        title,
        body: '',
        sourcePath,
        sourceDigest: digest,
      };
      currentRequirement.scenarios.push(currentScenario);
      continue;
    }
    if (currentScenario) scenarioBody.push(line);
    else if (currentRequirement) requirementBody.push(line);
  }
  flushRequirement();
  return requirements.length > 0
    ? { requirements }
    : { requirements, fallbackId: `spec:${sourcePath}` };
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
  const requirements: CompiledRequirementV1[] = [];
  for (const specPath of await walkMarkdown(path.join(options.changeDir, 'specs'))) {
    const content = await fs.readFile(specPath, 'utf8');
    routingParts.push(content);
    const structure = extractSpecStructure(specPath, content, options.changeDir);
    const capability = slug(path.basename(path.dirname(specPath)));
    const machineRequirements = options.machineReadable?.requirements
      ?.filter((requirement) => slug(requirement.spec) === capability)
      .map((requirement) => `spec:${capability}#requirement:${slug(requirement.text)}`);
    const parsedRequirementIds = structure.requirements.map((requirement) => requirement.id);
    const resolvedRequirements = machineRequirements?.length ? machineRequirements :
      parsedRequirementIds.length ? parsedRequirementIds : [structure.fallbackId!];
    for (const [index, requirement] of structure.requirements.entries()) {
      requirements.push({ ...requirement, id: resolvedRequirements[index] ?? requirement.id });
    }
    const resolvedScenarios = structure.requirements.flatMap((requirement) => requirement.scenarios.map((scenario) => scenario.id));
    requirementIds.push(...resolvedRequirements);
    scenarioIds.push(...resolvedScenarios);
    artifacts.push({
      kind: 'spec',
      path: portablePath(path.relative(options.changeDir, specPath)),
      sourceDigest: sourceDigest(content),
      ids: [...resolvedRequirements, ...resolvedScenarios],
    });
  }
  const tasks = parseTasks(tasksContent, options.taskMetadata ?? {}, options.machineReadable);
  const tasksArtifact = artifacts.find((artifact) => artifact.kind === 'tasks');
  if (tasksArtifact) tasksArtifact.ids = tasks.map((task) => task.taskId);
  return {
    artifacts,
    graph: buildExecutionGraph(tasks),
    requirements: requirements.sort((left, right) => left.id.localeCompare(right.id)),
    requirementIds: requirementIds.sort(),
    scenarioIds: scenarioIds.sort(),
    routingText: routingParts.join('\n'),
    taskAdapter: options.machineReadable?.adapterVersion ?? 'markdown-v1',
    requirementAdapter: options.machineReadable?.requirements?.length
      ? 'openspec-show-json-v1'
      : 'markdown-v1',
  };
}
