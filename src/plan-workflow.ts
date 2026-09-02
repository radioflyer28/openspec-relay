import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import { runReadonlyAnalysisSchedule } from './analysis-scheduler.js';
import { compileOpenSpecChange } from './artifacts.js';
import { loadGsdConfigV2 } from './config.js';
import {
  appendGsdEventV2,
  createGsdEventV2,
  readEventStoreV2,
  writeReplayedProjectionsV2,
} from './events.js';
import {
  dispatchRoleV2,
  type PlanningRoleContextV1,
  type RoleDispatcherV1,
  type RoleResultV1,
} from './execution-adapters.js';
import { computeSemanticPlanRevision, createPlanApproval } from './planning.js';
import { startGsdRunV2, DEFAULT_HOST_CAPABILITIES } from './runner-v2.js';
import {
  PathfinderResultV1Schema,
  PlanReviewResultV1Schema,
  type GsdAssuranceV2,
  type GsdConfigV2,
  type GsdRunV2,
  type HostAdapterProvenanceV1,
  type PathfinderResultV1,
  type PlanReviewResultV1,
} from './schemas.js';
import {
  classifySemanticRequirements,
  reconcileSemanticClassification,
  resolveSemanticClassification,
  validateSemanticStructure,
} from './semantics.js';
import { resolveChangeDirectory } from './state.js';

export interface DisposablePathfinderWorkspaceV1 {
  create(pathfinderId: string): Promise<string>;
  cleanup(pathfinderId: string, workspace: string): Promise<void>;
}

export interface PlanGsdChangeOptionsV1 {
  change: string;
  projectRoot?: string;
  invocation?: 'initial_plan' | 'do_replan';
  config?: Partial<GsdConfigV2>;
  hostCapabilities?: HostCapabilitiesV1;
  /** Read-only assurance authority supplied by hosts that intentionally do not
   * grant this workflow a writable planner child. */
  assuranceDispatcher?: RoleDispatcherV1;
  dispatcher?: RoleDispatcherV1;
  pathfinderQuestions?: string[];
  pathfinderWorkspaces?: DisposablePathfinderWorkspaceV1;
  plannerInstructions?: string[];
  findingIds?: string[];
  allowSelfReview?: boolean;
  changedFiles?: string[];
  readOnlyConcurrency?: number;
  signal?: AbortSignal;
  hostAdapter?: HostAdapterProvenanceV1;
  now?: string;
}

export interface PlanGsdChangeResultV1 {
  status: 'pass' | 'fail' | 'human_needed' | 'error';
  summary: string;
  run: GsdRunV2;
  assurance: GsdAssuranceV2;
  review: PlanReviewResultV1;
  pathfinderResults: PathfinderResultV1[];
  cycles: number;
  nextAction?: string;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24)}`;
}

function reviewFindingIds(result: RoleResultV1): string[] {
  return (result.findings ?? []).map((finding) => stableId('plan-finding', {
    providerId: finding.providerId,
    ruleId: finding.ruleId,
    category: finding.category,
    scope: finding.scope,
  })).sort();
}

function planningContext(options: {
  changeName: string;
  revision: string;
  invocation: 'initial_plan' | 'do_replan';
  artifactRefs: string[];
  plannerInstructions: string[];
  classifications: ReturnType<typeof classifySemanticRequirements>;
  findingIds?: string[];
  pathfinderQuestion?: string;
  disposableExperimentWorkspace?: boolean;
}): PlanningRoleContextV1 {
  return {
    changeName: options.changeName,
    planRevision: options.revision,
    invocation: options.invocation,
    artifactRefs: options.artifactRefs,
    plannerInstructions: options.plannerInstructions,
    semanticObligations: options.classifications.map((item) => `${item.requirementId}:${item.level}`),
    evidenceRequirements: [
      'requirement-to-scenario-to-task coverage',
      'repository-grounded feasibility',
      'dependency and write-set safety',
      'compatibility obligations',
      'verification capable of proving completion',
    ],
    ...(options.findingIds?.length ? { findingIds: options.findingIds } : {}),
    ...(options.pathfinderQuestion ? { pathfinderQuestion: options.pathfinderQuestion } : {}),
    ...(options.disposableExperimentWorkspace ? { disposableExperimentWorkspace: true } : {}),
  };
}

function mergePlannerClassifications(options: {
  requirements: Awaited<ReturnType<typeof compileOpenSpecChange>>['requirements'];
  deterministic: ReturnType<typeof classifySemanticRequirements>;
  supplemental?: ReturnType<typeof classifySemanticRequirements>;
}) {
  if (!options.supplemental?.length) return options.deterministic;
  const byId = new Map(options.supplemental.map((item) => [item.requirementId, item]));
  return options.requirements.map((requirement) => resolveSemanticClassification({
    requirement,
    planner: byId.get(requirement.id),
    independentReview: true,
  }));
}

function mergeReviewerClassifications(options: {
  current: ReturnType<typeof classifySemanticRequirements>;
  supplemental?: ReturnType<typeof classifySemanticRequirements>;
}) {
  if (!options.supplemental?.length) return options.current;
  const byId = new Map(options.supplemental.map((item) => [item.requirementId, item]));
  return options.current.map((classification) => {
    const reviewer = byId.get(classification.requirementId);
    return reviewer ? reconcileSemanticClassification(classification, {
      ...reviewer, provenance: 'plan_reviewer',
    }) : classification;
  });
}

async function appendPlanningEvent(options: {
  changeDir: string;
  now: string;
  actor: Parameters<typeof createGsdEventV2>[0]['actor'];
  payload: Parameters<typeof createGsdEventV2>[0]['payload'];
  origin: string;
}): Promise<void> {
  const store = await readEventStoreV2(options.changeDir);
  const event = createGsdEventV2({
    eventId: `${options.payload.type}:${randomUUID()}`,
    runId: store.runId,
    changeName: store.changeName,
    occurredAt: options.now,
    sourceDigests: {},
    actor: options.actor,
    provenance: { origin: options.origin, adapter: store.seed.tier },
    payload: options.payload,
  });
  await appendGsdEventV2({ changeDir: options.changeDir, event });
}

function selfReview(options: { revision: string; now: string; allowed: boolean }): PlanReviewResultV1 {
  return PlanReviewResultV1Schema.parse({
    reviewId: stableId('plan-review', { revision: options.revision, kind: 'tier0-self-review' }),
    revision: options.revision,
    status: options.allowed ? 'pass' : 'human_needed',
    independent: false,
    reviewerId: 'tier0-self-review',
    findingIds: [],
    evidenceRefs: [],
    reviewedAt: options.now,
  });
}

/** Reusable initial-plan and do-replan orchestration. The only writable planning
 * authority is the planner, and it may edit only the standard OpenSpec
 * proposal/spec/design/tasks artifacts named in the request. */
export async function planGsdChangeV1(options: PlanGsdChangeOptionsV1): Promise<PlanGsdChangeResultV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  if (resolved.archived) throw new Error(`Cannot plan archived change '${resolved.changeName}'.`);
  const invocation = options.invocation ?? 'initial_plan';
  const now = options.now ?? new Date().toISOString();
  const loadedConfig = await loadGsdConfigV2({
    projectRoot: resolved.projectRoot,
    changeDir: resolved.changeDir,
    overrides: options.config,
  });
  let compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: loadedConfig.taskOverrides });
  let semanticRevision = await computeSemanticPlanRevision({ changeDir: resolved.changeDir, compiled });
  let classifications = classifySemanticRequirements(compiled.requirements);
  const baseInstructions = [
    'Maintain proposal.md, design.md, tasks.md, and delta specs as the only planning truth.',
    'Do not create PLAN.md, a repair plan, a second task queue, or another completion model.',
    'Do not silently change observable product intent; route material ambiguity to discussion.',
    ...(options.plannerInstructions ?? []),
  ];
  const assuranceDispatcher = options.assuranceDispatcher ?? options.dispatcher;

  if (options.dispatcher) {
    const planner = await dispatchRoleV2({
      dispatcher: options.dispatcher,
      request: {
        role: 'planner', readOnly: false, isolated: true,
        planning: planningContext({
          changeName: resolved.changeName, revision: semanticRevision.revision, invocation,
          artifactRefs: compiled.artifacts.map((item) => item.path), plannerInstructions: baseInstructions,
          classifications, findingIds: options.findingIds,
        }),
      },
    });
    if (planner.result.status !== 'pass') {
      const started = await startGsdRunV2({
        change: options.change, projectRoot: resolved.projectRoot, config: options.config,
        changedFiles: options.changedFiles, now,
      });
      const review = selfReview({ revision: semanticRevision.revision, now, allowed: false });
      return { status: planner.result.status === 'error' ? 'error' : 'human_needed',
        summary: planner.result.summary, ...started, review, pathfinderResults: [], cycles: 0,
        nextAction: 'Resolve the planner failure without changing product intent, then rerun plan.' };
    }
    compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: loadedConfig.taskOverrides });
    semanticRevision = await computeSemanticPlanRevision({ changeDir: resolved.changeDir, compiled });
    classifications = mergePlannerClassifications({
      requirements: compiled.requirements,
      deterministic: classifySemanticRequirements(compiled.requirements),
      supplemental: planner.result.semanticClassifications,
    });
  }

  const hostCapabilities = options.hostCapabilities ?? (assuranceDispatcher ? {
    ...DEFAULT_HOST_CAPABILITIES, agentDispatch: true,
  } : DEFAULT_HOST_CAPABILITIES);
  let started = await startGsdRunV2({
    change: options.change,
    projectRoot: resolved.projectRoot,
    config: assuranceDispatcher ? {
      ...options.config,
      requestedTier: options.config?.requestedTier ?? 'tier1',
      allowAgentDispatch: true,
    } : options.config,
    hostCapabilities,
    adapters: assuranceDispatcher ? { dispatcher: true } : undefined,
    changedFiles: options.changedFiles,
    now,
  });
  if (options.hostAdapter) await appendPlanningEvent({
    changeDir: resolved.changeDir,
    now,
    actor: { kind: 'host', id: options.hostAdapter.adapterId },
    origin: options.hostAdapter.adapterId,
    payload: { type: 'host.adapter_qualified', adapter: options.hostAdapter },
  });

  const pathfinderResults: PathfinderResultV1[] = [];
  const pathfinderQuestions = [...new Set(options.pathfinderQuestions ?? [])];
  if (pathfinderQuestions.length > 0 && (!assuranceDispatcher || !options.pathfinderWorkspaces)) {
      const review = selfReview({ revision: semanticRevision.revision, now, allowed: false });
      return { status: 'human_needed', summary: 'A planning pathfinder requires fresh-context dispatch and a disposable experiment workspace.',
        ...started, review, pathfinderResults, cycles: 0,
        nextAction: 'Enable a pathfinder-capable host or resolve the planning uncertainty with human input.' };
  }
  const scheduledPathfinders = await runReadonlyAnalysisSchedule({
    concurrency: options.readOnlyConcurrency ?? 1,
    parallel: (options.readOnlyConcurrency ?? 1) > 1,
    signal: options.signal,
    requests: pathfinderQuestions.map((question) => {
      const pathfinderId = stableId('pathfinder', { question, revision: semanticRevision.revision });
      return { id: pathfinderId, prerequisites: [], run: async () => {
        const workspace = await options.pathfinderWorkspaces!.create(pathfinderId);
        try {
          const receipt = await dispatchRoleV2({ dispatcher: assuranceDispatcher!, request: {
            role: 'pathfinder', readOnly: true, isolated: true, workspace,
            planning: planningContext({
              changeName: resolved.changeName, revision: semanticRevision.revision, invocation,
              artifactRefs: compiled.artifacts.map((item) => item.path), plannerInstructions: baseInstructions,
              classifications, pathfinderQuestion: question, disposableExperimentWorkspace: true,
            }),
          } });
          if (!receipt.result.pathfinder) throw new Error('Pathfinder dispatch omitted its structured planning result.');
          return { origin: receipt.dispatchId, result: PathfinderResultV1Schema.parse({
            pathfinderId, question, ...receipt.result.pathfinder,
            evidenceRefs: receipt.result.evidenceRefs,
            sourceRevision: semanticRevision.revision,
          }) };
        } finally {
          await options.pathfinderWorkspaces!.cleanup(pathfinderId, workspace);
        }
      } };
    }),
  });
  for (const scheduled of scheduledPathfinders) {
    if (scheduled.status !== 'pass' || !scheduled.value) {
      const review = selfReview({ revision: semanticRevision.revision, now, allowed: false });
      return { status: scheduled.status === 'cancelled' ? 'human_needed' : 'error',
        summary: `Pathfinder ${scheduled.status}: ${scheduled.summary}`,
        ...started, review, pathfinderResults, cycles: 0,
        nextAction: 'Resolve the isolated analysis failure or use Tier 0 with explicit human direction.' };
    }
    const { result, origin } = scheduled.value;
    pathfinderResults.push(result);
      await appendPlanningEvent({ changeDir: resolved.changeDir, now, actor: { kind: 'pathfinder' },
        origin, payload: { type: 'pathfinder.completed', result } });
      if (result.routing !== 'planner') {
        await appendPlanningEvent({ changeDir: resolved.changeDir, now, actor: { kind: 'planner' }, origin: 'gsd-plan',
          payload: { type: 'finding.routed', route: {
            findingId: stableId('pathfinder-route', { pathfinderId: result.pathfinderId, routing: result.routing }),
            route: result.routing, planRevision: semanticRevision.revision,
            reason: result.conclusion, attempt: 0,
          } } });
        const store = await readEventStoreV2(resolved.changeDir);
        const projection = await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store, compiled });
        const review = selfReview({ revision: semanticRevision.revision, now, allowed: false });
        return { status: 'human_needed', summary: `Pathfinder routed a material result to ${result.routing}.`,
          ...projection, review, pathfinderResults, cycles: 0,
          nextAction: result.routing === 'discussion' ? `/opsx:discuss ${resolved.changeName}` : 'Provide human direction.' };
      }
  }

  let review = selfReview({ revision: semanticRevision.revision, now, allowed: Boolean(options.allowSelfReview) });
  let lastReviewSummary = '';
  let priorBlocking = '';
  let cycles = 0;
  while (assuranceDispatcher && cycles < 2) {
    cycles += 1;
    const receipt = await dispatchRoleV2({ dispatcher: assuranceDispatcher, request: {
      role: 'plan_reviewer', readOnly: true, isolated: true,
      planning: planningContext({
        changeName: resolved.changeName, revision: semanticRevision.revision, invocation,
        artifactRefs: compiled.artifacts.map((item) => item.path), plannerInstructions: baseInstructions,
        classifications, findingIds: options.findingIds,
      }),
    } });
    const findingIds = reviewFindingIds(receipt.result);
    lastReviewSummary = receipt.result.summary;
    classifications = mergeReviewerClassifications({
      current: classifications,
      supplemental: receipt.result.semanticClassifications,
    });
    review = PlanReviewResultV1Schema.parse({
      reviewId: stableId('plan-review', { revision: semanticRevision.revision, cycle: cycles, receipt: receipt.dispatchId }),
      revision: semanticRevision.revision,
      status: receipt.result.scopeExpansion ? 'human_needed' : receipt.result.status,
      independent: true,
      reviewerId: receipt.dispatchId,
      findingIds,
      evidenceRefs: receipt.result.evidenceRefs,
      reviewedAt: now,
    });
    await appendPlanningEvent({ changeDir: resolved.changeDir, now, actor: { kind: 'plan_reviewer', id: receipt.dispatchId },
      origin: receipt.dispatchId, payload: { type: 'plan.reviewed', review } });
    if (review.status === 'pass' || review.status === 'human_needed' || review.status === 'error') break;
    const signature = findingIds.join('|') || receipt.result.summary;
    if (signature === priorBlocking || cycles === 2) break;
    priorBlocking = signature;
    if (!options.dispatcher) break;
    const repair = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
      role: 'planner', readOnly: false, isolated: true,
      planning: planningContext({
        changeName: resolved.changeName, revision: semanticRevision.revision, invocation: 'do_replan',
        artifactRefs: compiled.artifacts.map((item) => item.path),
        plannerInstructions: [...baseInstructions, `Repair only these stable planning findings: ${findingIds.join(', ') || signature}`],
        classifications, findingIds,
      }),
    } });
    if (repair.result.status !== 'pass') break;
    compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: loadedConfig.taskOverrides });
    semanticRevision = await computeSemanticPlanRevision({ changeDir: resolved.changeDir, compiled });
    classifications = mergePlannerClassifications({
      requirements: compiled.requirements,
      deterministic: classifySemanticRequirements(compiled.requirements),
      supplemental: repair.result.semanticClassifications,
    });
    started = await startGsdRunV2({ change: options.change, projectRoot: resolved.projectRoot,
      changedFiles: options.changedFiles, now });
  }

  if (!assuranceDispatcher) await appendPlanningEvent({
    changeDir: resolved.changeDir, now, actor: { kind: 'plan_reviewer', id: 'tier0-self-review' },
    origin: 'tier0-self-review', payload: { type: 'plan.reviewed', review },
  });

  for (const classification of classifications) await appendPlanningEvent({
    changeDir: resolved.changeDir, now, actor: { kind: 'planner' }, origin: 'gsd-plan',
    payload: { type: 'semantic.classified', classification },
  });

  const [design, tasks] = await Promise.all([
    fs.readFile(path.join(resolved.changeDir, 'design.md'), 'utf8').catch(() => ''),
    fs.readFile(path.join(resolved.changeDir, 'tasks.md'), 'utf8').catch(() => ''),
  ]);
  const semanticDiagnostics = classifications.flatMap((classification) => {
    const requirement = compiled.requirements.find((item) => item.id === classification.requirementId);
    if (!requirement) return [`${classification.requirementId} is missing from the compiled OpenSpec requirements.`];
    return validateSemanticStructure({
      requirementId: classification.requirementId,
      level: classification.level,
      body: requirement.body,
      design,
      tasks,
    }).diagnostics;
  });
  const readinessPass = started.assurance.readiness?.status === 'pass';
  const canApprove = readinessPass && review.status === 'pass' && semanticDiagnostics.length === 0;
  if (canApprove) {
    const approval = createPlanApproval({
      revision: semanticRevision.revision,
      approvedAt: now,
      independent: review.independent,
      reviewerId: review.reviewerId,
      semanticLevels: classifications.map(({ requirementId, level }) => ({ requirementId, level })),
      evidenceRefs: review.evidenceRefs,
    });
    await appendPlanningEvent({ changeDir: resolved.changeDir, now, actor: { kind: 'planner' }, origin: 'gsd-plan',
      payload: { type: 'plan.approved', approval } });
    await appendPlanningEvent({ changeDir: resolved.changeDir, now, actor: { kind: 'automation' }, origin: 'gsd-plan',
      payload: { type: 'run.status_updated', status: 'planned' } });
  } else {
    await appendPlanningEvent({ changeDir: resolved.changeDir, now, actor: { kind: 'automation' }, origin: 'gsd-plan',
      payload: { type: 'run.status_updated', status: 'blocked' } });
  }
  const store = await readEventStoreV2(resolved.changeDir);
  const projection = await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store, compiled });
  const status = canApprove ? 'pass' : review.status === 'error' ? 'error'
    : review.status === 'human_needed' || (!assuranceDispatcher && !options.allowSelfReview) ? 'human_needed' : 'fail';
  return {
    status,
    summary: canApprove
      ? `${review.independent ? 'Independent' : 'Tier 0 self-'} review approved the current semantic plan revision.`
      : !readinessPass ? 'Deterministic readiness blockers must be resolved before plan approval.'
        : semanticDiagnostics.length > 0 ? `Semantic structure must be repaired before plan approval: ${semanticDiagnostics.join(' ')}`
        : review.status === 'error' ? `Plan review failed: ${lastReviewSummary}`
          : `Plan review did not converge within two cycles${lastReviewSummary ? `: ${lastReviewSummary}` : '.'}`,
    ...projection,
    review,
    pathfinderResults,
    cycles,
    ...(canApprove ? {} : { nextAction: status === 'human_needed'
      ? 'Continue with the explicitly disclosed Tier 0 self-review or provide feedback.'
      : 'Revise the standard OpenSpec artifacts and rerun plan.' }),
  };
}
