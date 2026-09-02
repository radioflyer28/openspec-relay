import { createHash, randomUUID } from 'node:crypto';
import { compileOpenSpecChange, type TaskMetadataV1 } from './artifacts.js';
import { loadCanonicalGsdState } from './canonical-state.js';
import { appendGsdEventV2, createGsdEventV2, readEventStoreV2 } from './events.js';
import { dispatchRoleV2, type RoleDispatcherV1, type RoleResultV1 } from './execution-adapters.js';
import { routeDispatchedFindingsV1 } from './finding-routing.js';
import { computeSemanticPlanRevision, isPlanApprovalCurrent } from './planning.js';
import { planGsdChangeV1 } from './plan-workflow.js';
import { checkGsdRunV2 } from './runner-v2.js';
import type { GsdAssuranceV2, GsdRunV2, PortableReferenceV2, SemanticClassificationV1 } from './schemas.js';
import { resolveChangeDirectory } from './state.js';
import {
  recordDispatchedRoleResultV2,
  transitionFindingV2,
  verifyFindingFromDispatchedResultV2,
} from './v2-operations.js';

export interface CanonicalApplyRequestV1 {
  changeName: string;
  taskId: string;
  action: 'implement' | 'repair';
  approvedRevision: string;
  plannerInstructions: string[];
  semanticObligations: SemanticClassificationV1[];
  scenarioIds: string[];
  risk: string;
  tdd: string;
  findingIds: string[];
  evidenceRequirements: string[];
  capability: '$openspec-apply-change';
}

export interface CanonicalApplyResultV1 {
  status: 'pass' | 'fail' | 'human_needed' | 'error';
  summary: string;
  evidence?: PortableReferenceV2[];
}

export interface CanonicalApplyCapabilityV1 {
  apply(request: Readonly<CanonicalApplyRequestV1>): Promise<CanonicalApplyResultV1>;
}

export interface DoGsdChangeResultV1 {
  status: 'pass' | 'fail' | 'human_needed' | 'error';
  summary: string;
  run: GsdRunV2;
  assurance: GsdAssuranceV2;
  applyCalls: number;
  convergenceCycles: number;
  nextAction?: string;
}

function stableFindingIds(result: RoleResultV1): string[] {
  return (result.findings ?? []).map((finding) => `finding:${createHash('sha256').update(JSON.stringify({
    providerId: finding.providerId, ruleId: finding.ruleId, category: finding.category, scope: finding.scope,
  })).digest('hex').slice(0, 24)}`).sort();
}

async function currentApproved(options: { change: string; projectRoot?: string }) {
  const resolved = await resolveChangeDirectory(options);
  const canonical = await loadCanonicalGsdState(resolved.changeDir);
  const revision = await computeSemanticPlanRevision({ changeDir: resolved.changeDir, compiled: canonical.compiled });
  if (!isPlanApprovalCurrent(canonical.projection.assurance.planApproval, revision.revision) ||
      canonical.projection.assurance.planStale) {
    throw new Error(`OpenSpec GSD refuses execution: plan approval is absent or stale for '${resolved.changeName}'. Run /opsx:plan ${resolved.changeName}.`);
  }
  return { resolved, canonical, revision };
}

export async function assertCurrentPlanApprovalV1(options: { change: string; projectRoot?: string }): Promise<{
  changeName: string; revision: string; independent: boolean;
}> {
  const current = await currentApproved(options);
  return {
    changeName: current.resolved.changeName,
    revision: current.revision.revision,
    independent: current.canonical.projection.assurance.planApproval!.independent,
  };
}

async function setRunStatus(changeDir: string, status: GsdRunV2['status'], origin: string): Promise<void> {
  const store = await readEventStoreV2(changeDir);
  const now = new Date().toISOString();
  await appendGsdEventV2({ changeDir, event: createGsdEventV2({
    eventId: `do-status:${status}:${randomUUID()}`,
    runId: store.runId, changeName: store.changeName, occurredAt: now, sourceDigests: {},
    actor: { kind: 'automation' }, provenance: { origin }, payload: { type: 'run.status_updated', status },
  }) });
}

function taskContext(options: {
  task: Awaited<ReturnType<typeof compileOpenSpecChange>>['graph']['nodes'][number];
  approvalRevision: string;
  classifications: SemanticClassificationV1[];
  findingIds: string[];
  action: 'implement' | 'repair';
}): CanonicalApplyRequestV1 {
  return Object.freeze({
    changeName: '',
    taskId: options.task.taskId,
    action: options.action,
    approvedRevision: options.approvalRevision,
    plannerInstructions: [
      'Follow the approved OpenSpec task and current planner disposition.',
      'Preserve observable intent and return ambiguity or scope expansion to planner triage.',
      'Use canonical OpenSpec artifact loading, implementation, and task-checkbox tracking.',
      'Do not maintain a second task queue or completion model.',
    ],
    semanticObligations: options.classifications.filter((item) => options.task.requirementRefs.includes(item.requirementId)),
    scenarioIds: options.task.scenarioRefs,
    risk: options.task.risk,
    tdd: options.task.tdd ?? 'auto',
    findingIds: options.findingIds,
    evidenceRequirements: options.task.expectedVerification,
    capability: '$openspec-apply-change',
  });
}

async function taskIsComplete(changeDir: string, taskId: string, taskMetadata: Record<string, TaskMetadataV1>): Promise<boolean> {
  const compiled = await compileOpenSpecChange({ changeDir, taskMetadata });
  return compiled.graph.nodes.find((task) => task.taskId === taskId)?.status === 'complete';
}

/** Closed execution convergence around canonical OpenSpec apply. This function
 * selects approved task context and assurance roles; the supplied canonical
 * apply capability owns implementation and checkbox updates. */
export async function doGsdChangeV1(options: {
  change: string;
  projectRoot?: string;
  applyCapability: CanonicalApplyCapabilityV1;
  dispatcher: RoleDispatcherV1;
  /** Defaults to true for legacy hosts. Pi sets this false because its child
   * dispatcher is deliberately assurance-only; the parent owns planning. */
  allowWritablePlannerDispatch?: boolean;
  changedFiles?: string[];
  now?: string;
}): Promise<DoGsdChangeResultV1> {
  let current: Awaited<ReturnType<typeof currentApproved>>;
  try {
    current = await currentApproved(options);
  } catch (error) {
    const resolved = await resolveChangeDirectory(options);
    const canonical = await loadCanonicalGsdState(resolved.changeDir);
    return { status: 'human_needed', summary: (error as Error).message,
      ...canonical.projection, applyCalls: 0, convergenceCycles: 0,
      nextAction: `/opsx:plan ${resolved.changeName}` };
  }
  await setRunStatus(current.resolved.changeDir, 'running', 'gsd-do');
  let applyCalls = 0;
  let convergenceCycles = 0;
  let repairTaskId: string | undefined;
  let findingIds: string[] = [];
  while (convergenceCycles < 2) {
    convergenceCycles += 1;
    current = await currentApproved(options);
    const cycleFindingIds = [...findingIds];
    const cycleRepairEvidence: PortableReferenceV2[] = [];
    const pending = current.canonical.compiled.graph.nodes.filter((task) => task.status !== 'complete');
    const selected = repairTaskId
      ? current.canonical.compiled.graph.nodes.filter((task) => task.taskId === repairTaskId)
      : pending;
    for (const task of selected) {
      const request = { ...taskContext({
        task, approvalRevision: current.revision.revision,
        classifications: current.canonical.projection.assurance.semanticClassifications,
        findingIds, action: repairTaskId ? 'repair' : 'implement',
      }), changeName: current.resolved.changeName };
      const result = await options.applyCapability.apply(Object.freeze(request));
      applyCalls += 1;
      if (request.action === 'repair') cycleRepairEvidence.push(...(result.evidence ?? []));
      if (result.status !== 'pass') {
        await setRunStatus(current.resolved.changeDir, 'blocked', 'gsd-do-apply');
        const projection = (await loadCanonicalGsdState(current.resolved.changeDir)).projection;
        return { status: result.status, summary: result.summary, ...projection, applyCalls, convergenceCycles,
          nextAction: 'Return the canonical apply ambiguity or failure to planner triage.' };
      }
      if (!(await taskIsComplete(current.resolved.changeDir, task.taskId,
        current.canonical.store.seed.config.taskOverrides))) {
        await setRunStatus(current.resolved.changeDir, 'blocked', 'gsd-do-apply-contract');
        const projection = (await loadCanonicalGsdState(current.resolved.changeDir)).projection;
        return { status: 'error', summary: `Canonical apply reported pass without completing task '${task.taskId}'.`,
          ...projection, applyCalls, convergenceCycles,
          nextAction: 'Use the canonical apply capability to update the authoritative task checkbox.' };
      }
    }
    if (cycleFindingIds.length > 0 && cycleRepairEvidence.length === 0) {
      await setRunStatus(current.resolved.changeDir, 'blocked', 'gsd-do-repair-evidence');
      const projection = (await loadCanonicalGsdState(current.resolved.changeDir)).projection;
      return { status: 'error',
        summary: 'Canonical apply reported a passing repair without linked repair evidence.',
        ...projection, applyCalls, convergenceCycles,
        nextAction: 'Rerun the planner-dispositioned canonical apply repair with observable implementation or check evidence.' };
    }
    for (const findingId of cycleFindingIds) await transitionFindingV2({
      change: options.change, projectRoot: current.resolved.projectRoot, findingId, action: 'repair',
      actorId: 'gsd-do-executor', reason: 'Canonical apply completed the planner-dispositioned repair.',
      evidence: cycleRepairEvidence,
      now: options.now,
    });
    repairTaskId = undefined;
    findingIds = [];
    current = await currentApproved(options);
    const revisedPlanFindingIds = current.canonical.projection.assurance.findingRoutes
      .filter((route) => route.planRevision !== current.revision.revision)
      .map((route) => route.findingId)
      .filter((findingId) => current.canonical.projection.assurance.findings.some((finding) =>
        finding.findingId === findingId && finding.state === 'open'));
    for (const findingId of revisedPlanFindingIds) await transitionFindingV2({
      change: options.change, projectRoot: current.resolved.projectRoot, findingId, action: 'repair',
      actorId: 'gsd-do-planner-disposition',
      reason: 'A newly approved semantic plan revision incorporates the routed finding disposition.',
      evidence: [{
        referenceId: `plan:${current.revision.revision}`, kind: 'artifact',
        path: `${current.resolved.changeRef}/design.md`, available: true,
      }],
      now: options.now,
    });
    const verificationFindingIds = [...new Set([...cycleFindingIds, ...revisedPlanFindingIds])];
    const roleContext = {
      changeName: current.resolved.changeName, planRevision: current.revision.revision,
      invocation: 'do_replan' as const,
      artifactRefs: current.canonical.compiled.artifacts.map((item) => item.path),
      plannerInstructions: ['Evaluate implementation against the approved planner instructions and authoritative OpenSpec artifacts.'],
      semanticObligations: current.canonical.projection.assurance.semanticClassifications
        .map((item) => `${item.requirementId}:${item.level}`),
      evidenceRequirements: ['independent observable evidence; executor self-report is insufficient'],
      ...(verificationFindingIds.length ? { findingIds: verificationFindingIds } : {}),
    };
    const reviewReceipt = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
      role: 'reviewer', readOnly: true, isolated: true, planning: roleContext,
    } });
    await recordDispatchedRoleResultV2({
      change: options.change, projectRoot: current.resolved.projectRoot, receipt: reviewReceipt, now: options.now,
    });
    let failedReceipt = reviewReceipt;
    let failed = reviewReceipt.result.status !== 'pass' || reviewReceipt.result.findings?.some((item) => item.blocking)
      ? reviewReceipt.result : undefined;
    if (!failed) {
      const verificationReceipt = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
        role: 'verifier', readOnly: true, isolated: true, planning: roleContext,
      } });
      await recordDispatchedRoleResultV2({
        change: options.change, projectRoot: current.resolved.projectRoot, receipt: verificationReceipt, now: options.now,
      });
      if (verificationReceipt.result.status === 'pass') for (const findingId of verificationFindingIds) {
        await verifyFindingFromDispatchedResultV2({
          change: options.change, projectRoot: current.resolved.projectRoot, findingId,
          receipt: verificationReceipt, reason: 'The independent verifier confirmed the planner disposition.',
          now: options.now,
        });
      }
      failedReceipt = verificationReceipt;
      failed = verificationReceipt.result.status !== 'pass' || verificationReceipt.result.findings?.some((item) => item.blocking)
        ? verificationReceipt.result : undefined;
    }
    if (!failed) {
      await setRunStatus(current.resolved.changeDir, 'checking', 'gsd-do');
      const checked = await checkGsdRunV2({ change: options.change, projectRoot: current.resolved.projectRoot,
        changedFiles: options.changedFiles, now: options.now });
      if (checked.assurance.status === 'pass' || checked.assurance.status === 'warn') return {
        status: 'pass', summary: 'Canonical apply, independent code review, goal verification, and aggregate assurance passed.',
        ...checked, applyCalls, convergenceCycles,
      };
      const status = checked.assurance.status === 'error' ? 'error'
        : checked.assurance.status === 'human_needed' || checked.assurance.status === 'pending' ? 'human_needed' : 'fail';
      return { status, summary: `Aggregate assurance is ${checked.assurance.status}; execution is not complete.`,
        ...checked, applyCalls, convergenceCycles,
        nextAction: checked.assurance.checks.flatMap((item) => item.remediation).at(0) ??
          checked.assurance.unresolvedHumanActions.at(0) ??
          'Resolve the failing assurance checks and resume /opsx:do.' };
    }
    const routes = routeDispatchedFindingsV1({
      receipt: failedReceipt,
      planRevision: current.revision.revision,
      attempt: convergenceCycles,
    });
    findingIds = routes.length ? routes.map((route) => route.findingId) : stableFindingIds(failed);
    repairTaskId = routes.find((route) => route.taskId)?.taskId ??
      current.canonical.compiled.graph.nodes[0]?.taskId;
    for (const route of routes) {
      const routeStore = await readEventStoreV2(current.resolved.changeDir);
      await appendGsdEventV2({ changeDir: current.resolved.changeDir, event: createGsdEventV2({
        eventId: `do-route:${route.findingId}:${convergenceCycles}:${randomUUID()}`,
        runId: routeStore.runId, changeName: routeStore.changeName,
        occurredAt: options.now ?? new Date().toISOString(), sourceDigests: {},
        actor: { kind: 'planner', id: 'gsd-do-triage' }, provenance: { origin: failedReceipt.dispatchId },
        payload: { type: 'finding.routed', route },
      }) });
    }
    const replanned = await planGsdChangeV1({
      change: options.change, projectRoot: current.resolved.projectRoot, invocation: 'do_replan',
      ...(options.allowWritablePlannerDispatch === false ? {} : { dispatcher: options.dispatcher }),
      assuranceDispatcher: options.dispatcher, findingIds,
      plannerInstructions: [
        `Associate the stable findings with original task '${repairTaskId ?? 'unknown'}'.`,
        ...routes.map((route) => `Disposition ${route.findingId} as ${route.route}: ${route.reason}`),
      ],
      changedFiles: options.changedFiles,
      now: options.now,
    });
    if (replanned.status !== 'pass') {
      return { status: replanned.status, summary: replanned.summary,
        run: replanned.run, assurance: replanned.assurance, applyCalls, convergenceCycles,
        nextAction: replanned.nextAction };
    }
    const discussion = routes.find((route) => route.route === 'discussion');
    if (discussion) return { status: 'human_needed', summary: discussion.reason,
      run: replanned.run, assurance: replanned.assurance, applyCalls, convergenceCycles,
      nextAction: `/opsx:discuss ${current.resolved.changeName}` };
    const pathfinder = routes.find((route) => route.route === 'pathfinder');
    if (pathfinder) return { status: 'human_needed', summary: pathfinder.reason,
      run: replanned.run, assurance: replanned.assurance, applyCalls, convergenceCycles,
      nextAction: `/opsx:plan ${current.resolved.changeName} with an isolated pathfinder` };
  }
  await setRunStatus(current.resolved.changeDir, 'blocked', 'gsd-do-exhausted');
  const projection = (await loadCanonicalGsdState(current.resolved.changeDir)).projection;
  return { status: 'human_needed', summary: 'Review or verification did not converge within two cycles.',
    ...projection, applyCalls, convergenceCycles,
    nextAction: 'Inspect the unchanged blocking findings and provide human direction.' };
}
