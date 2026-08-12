import { createHash } from 'node:crypto';
import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { buildExecutionGraph, writeSetsOverlap } from './graph.js';
import { findRepositoryScopeGaps } from './repository-context.js';
import {
  ReadinessResultV2Schema,
  type ReadinessIssueV2,
  type ReadinessResultV2,
  type RepositoryContextV2,
} from './schemas.js';

export type ReadinessEvaluatorTierV2 = 'tier0' | 'tier1' | 'tier2';

export interface ReadinessEvaluatorContractV2 {
  readOnly: true;
  tier: ReadinessEvaluatorTierV2;
  independent: true;
}

export interface ReadinessEvaluatorV2 {
  evaluate(request: Readonly<{
    contract: ReadinessEvaluatorContractV2;
    deterministicResult: ReadinessResultV2;
  }>): Promise<ReadinessResultV2>;
}

export function createReadinessEvaluatorContract(options: {
  tier: ReadinessEvaluatorTierV2;
}): ReadinessEvaluatorContractV2 {
  return { readOnly: true, tier: options.tier, independent: true };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function readinessInputRevision(options: {
  compiled: CompiledOpenSpecChangeV1;
  repositoryContext: RepositoryContextV2;
  assumptions?: Array<{ id: string; summary: string; supported: boolean }>;
}): string {
  return digest({
    artifacts: options.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]),
    requirements: options.compiled.requirementIds,
    scenarios: options.compiled.scenarioIds,
    tasks: options.compiled.graph.nodes.map((task) => ({
      id: task.taskId, dependencies: task.dependencies, writeSet: task.writeSet,
      requirements: task.requirementRefs, scenarios: task.scenarioRefs,
      verification: task.expectedVerification,
    })),
    repositoryContext: [options.repositoryContext.contextId, options.repositoryContext.inputRevision,
      options.repositoryContext.status, options.repositoryContext.staleReferenceIds],
    assumptions: options.assumptions ?? [],
  });
}

function issue(options: Omit<ReadinessIssueV2, 'issueId' | 'inputRevision'> & {
  inputRevision: string;
}): ReadinessIssueV2 {
  return {
    ...options,
    issueId: `readiness:${digest({ kind: options.kind, references: options.references, summary: options.summary })
      .slice(0, 20)}`,
  };
}

function contractNeedsCompatibility(compiled: CompiledOpenSpecChangeV1): boolean {
  return /public\s+(?:api|contract|interface)|\bcli\b|\bschema\b|\bconfiguration\b|stored\s+format|\bmigration\b/i
    .test(compiled.routingText);
}

function hasCompatibilityEvidence(compiled: CompiledOpenSpecChangeV1): boolean {
  return compiled.graph.nodes.some((task) => task.expectedVerification.some((check) =>
    ['compatibility', 'documentation', 'migration', 'release-assurance'].includes(check)));
}

export function evaluatePlanReadiness(options: {
  changeName: string;
  compiled: CompiledOpenSpecChangeV1;
  repositoryContext: RepositoryContextV2;
  assumptions?: Array<{ id: string; summary: string; supported: boolean }>;
  proposedWaves?: string[][];
  tier?: ReadinessEvaluatorTierV2;
  adapter?: ReadinessEvaluatorV2;
  actorKind?: 'automation' | 'executor' | 'reviewer' | 'verifier' | 'host' | 'analyzer';
  now?: string;
}): ReadinessResultV2 {
  if (options.actorKind === 'executor') {
    throw new Error('An executor self-report cannot satisfy independent plan readiness.');
  }
  if (options.adapter) {
    throw new Error('Use evaluatePlanReadinessWithAdapter for an asynchronous independent evaluator.');
  }
  const inputRevision = readinessInputRevision(options);
  const issues: ReadinessIssueV2[] = [];
  const mappedRequirements = new Set(options.compiled.graph.nodes.flatMap((task) => task.requirementRefs));
  const mappedScenarios = new Set(options.compiled.graph.nodes.flatMap((task) => task.scenarioRefs));
  for (const requirementId of options.compiled.requirementIds) {
    if (!mappedRequirements.has(requirementId)) issues.push(issue({
      kind: 'uncovered_requirement', severity: 'error', blocking: true,
      summary: `Requirement '${requirementId}' has no implementing task.`, references: [requirementId],
      evidence: [], remediation: ['Add an explicit task-to-requirement mapping.'], inputRevision,
    }));
  }
  for (const scenarioId of options.compiled.scenarioIds) {
    if (!mappedScenarios.has(scenarioId)) issues.push(issue({
      kind: 'unmapped_scenario', severity: 'error', blocking: true,
      summary: `Scenario '${scenarioId}' has no task or observable evidence path.`, references: [scenarioId],
      evidence: [], remediation: ['Map the scenario to an implementing task and verification.'], inputRevision,
    }));
  }
  for (const task of options.compiled.graph.nodes) {
    if (task.expectedVerification.length === 0) issues.push(issue({
      kind: 'insufficient_evidence', severity: 'error', blocking: true,
      summary: `Task '${task.taskId}' has no planned observable verification.`, references: [task.taskId],
      evidence: [], remediation: ['Add deterministic or human-observable verification for the task.'], inputRevision,
    }));
  }
  try {
    buildExecutionGraph(options.compiled.graph.nodes);
  } catch (error) {
    issues.push(issue({
      kind: 'dependency_cycle', severity: 'critical', blocking: true,
      summary: (error as Error).message, references: options.compiled.graph.nodes.map((task) => task.taskId),
      evidence: [], remediation: ['Break the dependency cycle and update the task graph.'], inputRevision,
    }));
  }
  const byId = new Map(options.compiled.graph.nodes.map((task) => [task.taskId, task]));
  for (const wave of options.proposedWaves ?? options.compiled.graph.waves) {
    for (let left = 0; left < wave.length; left += 1) {
      const current = byId.get(wave[left]);
      if (!current) continue;
      if (current.dependencies.some((dependency) => wave.includes(dependency))) issues.push(issue({
        kind: 'missing_prerequisite', severity: 'error', blocking: true,
        summary: `Task '${current.taskId}' is scheduled before a required prerequisite completes.`,
        references: [current.taskId, ...current.dependencies], evidence: [],
        remediation: ['Schedule dependencies in an earlier execution wave.'], inputRevision,
      }));
      for (const otherId of wave.slice(left + 1)) {
        const other = byId.get(otherId);
        if (other && writeSetsOverlap(current.writeSet, other.writeSet)) issues.push(issue({
          kind: 'unsafe_write_overlap', severity: 'error', blocking: true,
          summary: `Tasks '${current.taskId}' and '${other.taskId}' overlap in the same execution wave.`,
          references: [current.taskId, other.taskId], evidence: [],
          remediation: ['Serialize these tasks or use isolated non-overlapping write sets.'], inputRevision,
        }));
      }
    }
  }
  for (const assumption of options.assumptions ?? []) {
    if (!assumption.supported) issues.push(issue({
      kind: 'risky_assumption', severity: 'error', blocking: true,
      summary: `Risky assumption '${assumption.summary}' lacks a validation path.`, references: [assumption.id],
      evidence: [], remediation: ['Add supporting evidence, a validation task, or a human disposition.'], inputRevision,
    }));
  }
  if (contractNeedsCompatibility(options.compiled) && !hasCompatibilityEvidence(options.compiled)) issues.push(issue({
    kind: 'compatibility_obligation', severity: 'error', blocking: true,
    summary: 'A public contract changes without compatibility, migration, documentation, or release verification work.',
    references: [], evidence: [],
    remediation: ['Add applicable compatibility, documentation, and consumer-verification tasks.'], inputRevision,
  }));
  for (const gap of findRepositoryScopeGaps({ compiled: options.compiled, context: options.repositoryContext })) {
    issues.push(issue({
      kind: gap.kind, severity: 'error', blocking: true,
      summary: 'Repository context identified an affected module outside the declared task write sets.',
      references: gap.referenceIds, evidence: [], remediation: [gap.remediation], inputRevision,
    }));
  }
  if (options.repositoryContext.status !== 'current') issues.push(issue({
    kind: 'independent_result_unavailable', severity: 'error', blocking: true,
    summary: 'Repository context is stale or unavailable for the current readiness evaluation.',
    references: [options.repositoryContext.contextId], evidence: [],
    remediation: ['Refresh repository context before beginning implementation.'], inputRevision,
  }));
  const result = ReadinessResultV2Schema.parse({
    resultId: `readiness:${inputRevision.slice(0, 20)}`,
    changeName: options.changeName,
    evaluatedAt: options.now ?? new Date().toISOString(),
    inputRevision,
    status: issues.some((item) => item.blocking) ? 'fail' : 'pass',
    independent: true,
    evaluator: options.tier === 'tier1' || options.tier === 'tier2' ? 'isolated-readiness-evaluator' : 'tier0-readiness-evaluator',
    issues: issues.sort((left, right) => left.issueId.localeCompare(right.issueId)),
  });
  return result;
}

export async function evaluatePlanReadinessWithAdapter(options: Omit<Parameters<typeof evaluatePlanReadiness>[0], 'adapter'> & {
  adapter: ReadinessEvaluatorV2;
}): Promise<ReadinessResultV2> {
  const { adapter, ...input } = options;
  const deterministicResult = evaluatePlanReadiness({ ...input, tier: input.tier ?? 'tier0' });
  const result = ReadinessResultV2Schema.parse(await adapter.evaluate({
    contract: createReadinessEvaluatorContract({ tier: options.tier ?? 'tier0' }),
    deterministicResult,
  }));
  if (result.changeName !== deterministicResult.changeName || result.inputRevision !== deterministicResult.inputRevision ||
      result.independent !== true) {
    throw new Error('Readiness evaluator returned a result for different controlling inputs.');
  }
  return result;
}

export function invalidateReadinessResult(options: {
  result: ReadinessResultV2;
  inputRevision: string;
}): ReadinessResultV2 {
  if (options.result.inputRevision === options.inputRevision) return options.result;
  return ReadinessResultV2Schema.parse({ ...options.result, inputRevision: options.inputRevision, status: 'stale' });
}
