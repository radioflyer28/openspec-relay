import { createHash, randomUUID } from 'node:crypto';
import { compileOpenSpecChange, type TaskMetadataV1 } from './artifacts.js';
import { loadCanonicalGsdState } from './canonical-state.js';
import { appendGsdEventV2, createGsdEventV2, readEventStoreV2 } from './events.js';
import { dispatchRoleV2, type RoleDispatcherV1, type RoleResultV1 } from './execution-adapters.js';
import { computeSemanticPlanRevision, isPlanApprovalCurrent } from './planning.js';
import { planGsdChangeV1 } from './plan-workflow.js';
import { checkGsdRunV2 } from './runner-v2.js';
import type { GsdAssuranceV2, GsdRunV2, PortableReferenceV2, SemanticClassificationV1 } from './schemas.js';
import { resolveChangeDirectory } from './state.js';

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
  changedFiles?: string[];
  now?: string;
}): Promise<DoGsdChangeResultV1> {
  let current;
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
    repairTaskId = undefined;
    findingIds = [];
    current = await currentApproved(options);
    const roleContext = {
      changeName: current.resolved.changeName, planRevision: current.revision.revision,
      invocation: 'do_replan' as const,
      artifactRefs: current.canonical.compiled.artifacts.map((item) => item.path),
      plannerInstructions: ['Evaluate implementation against the approved planner instructions and authoritative OpenSpec artifacts.'],
      semanticObligations: current.canonical.projection.assurance.semanticClassifications
        .map((item) => `${item.requirementId}:${item.level}`),
      evidenceRequirements: ['independent observable evidence; executor self-report is insufficient'],
    };
    const reviewReceipt = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
      role: 'reviewer', readOnly: true, isolated: true, planning: roleContext,
    } });
    let failed = reviewReceipt.result.status === 'pass' ? undefined : reviewReceipt.result;
    if (!failed) {
      const verificationReceipt = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
        role: 'verifier', readOnly: true, isolated: true, planning: roleContext,
      } });
      failed = verificationReceipt.result.status === 'pass' ? undefined : verificationReceipt.result;
    }
    if (!failed) {
      await setRunStatus(current.resolved.changeDir, 'checking', 'gsd-do');
      const checked = await checkGsdRunV2({ change: options.change, projectRoot: current.resolved.projectRoot,
        changedFiles: options.changedFiles, now: options.now });
      await setRunStatus(current.resolved.changeDir, 'complete', 'gsd-do');
      const projection = (await loadCanonicalGsdState(current.resolved.changeDir)).projection;
      return { status: checked.assurance.status === 'error' ? 'error' : 'pass',
        summary: 'Canonical apply, independent code review, and goal verification passed.',
        ...projection, applyCalls, convergenceCycles };
    }
    findingIds = stableFindingIds(failed);
    repairTaskId = failed.findings?.flatMap((finding) => finding.taskIds ?? [])[0] ??
      current.canonical.compiled.graph.nodes[0]?.taskId;
    const replanned = await planGsdChangeV1({
      change: options.change, projectRoot: current.resolved.projectRoot, invocation: 'do_replan',
      dispatcher: options.dispatcher, findingIds,
      plannerInstructions: [`Associate the stable findings with original task '${repairTaskId ?? 'unknown'}'.`],
      changedFiles: options.changedFiles,
      now: options.now,
    });
    if (replanned.status !== 'pass') {
      return { status: replanned.status, summary: replanned.summary,
        run: replanned.run, assurance: replanned.assurance, applyCalls, convergenceCycles,
        nextAction: replanned.nextAction };
    }
  }
  await setRunStatus(current.resolved.changeDir, 'blocked', 'gsd-do-exhausted');
  const projection = (await loadCanonicalGsdState(current.resolved.changeDir)).projection;
  return { status: 'human_needed', summary: 'Review or verification did not converge within two cycles.',
    ...projection, applyCalls, convergenceCycles,
    nextAction: 'Inspect the unchanged blocking findings and provide human direction.' };
}
