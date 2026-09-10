import { loadCanonicalRelayRecords } from './canonical-state.js';
import { appendRelayEventV2, createRelayEventV2, writeReplayedProjectionsV2 } from './events.js';
import { evaluateResumeRouteV1, type ResumeRouteDecisionV1 } from './resume-route.js';
import {
  PauseCheckpointV1Schema,
  type LifecycleStageV1,
  type PauseCheckpointV1,
  type PauseDispatchV1,
  type RelayAssuranceV2,
  type RelayRunV2,
  type ResumeRouteV1,
} from './schemas.js';
import { digestJson, resolveChangeDirectory } from './state.js';
import { snapshotWorkspaceV1, validateWorkspaceSnapshotV1 } from './workspace.js';

function sourceDigests(canonical: Awaited<ReturnType<typeof loadCanonicalRelayRecords>>): Record<string, string> {
  return Object.fromEntries(canonical.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}

function artifactRevision(canonical: Awaited<ReturnType<typeof loadCanonicalRelayRecords>>): string {
  return digestJson(sourceDigests(canonical));
}

function routeDecision(
  canonical: Awaited<ReturnType<typeof loadCanonicalRelayRecords>>,
  options: { hasCheckpoint: boolean; artifactsChanged?: boolean; requiredAuthority?: string[] } = { hasCheckpoint: false },
): ResumeRouteDecisionV1 {
  const { run, assurance } = canonical.projection;
  const activeDebug = assurance.debugSessions.some((session) => session.status === 'active');
  const pendingWork = run.tasks.some((task) => task.status !== 'complete') || assurance.findings.some((finding) =>
    finding.blocking && !['independently_verified', 'accepted_risk'].includes(finding.state));
  const pendingUat = assurance.uatScenarios.some((scenario) =>
    ['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale'].includes(scenario.status));
  return evaluateResumeRouteV1({
    integrity: canonical.projectionsMatch ? 'pass' : 'error',
    candidateIds: [run.changeName],
    artifactState: canonical.compiled.artifacts.length > 0 ? 'complete' : 'missing',
    artifactsChanged: options.artifactsChanged ?? false,
    discussionOpen: false,
    planApproval: run.planApprovalStatus,
    activeDebug,
    pendingWork,
    pendingUat,
    archiveReady: run.status === 'complete' && ['pass', 'warn'].includes(assurance.status),
    requiredAuthority: options.requiredAuthority ?? [],
    hasCheckpoint: options.hasCheckpoint,
  });
}

export interface PauseRelayResultV1 {
  checkpoint: PauseCheckpointV1;
  appended: boolean;
  safe: boolean;
  run: RelayRunV2;
  assurance: RelayAssuranceV2;
}

export async function pauseRelayChangeV1(options: {
  change: string;
  projectRoot?: string;
  stage?: LifecycleStageV1;
  activity?: PauseCheckpointV1['activity'];
  taskIds?: string[];
  dispatches?: PauseDispatchV1[];
  now?: string;
}): Promise<PauseRelayResultV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const canonical = await loadCanonicalRelayRecords(resolved.changeDir);
  if (!canonical.projectionsMatch) throw new Error('Cannot pause while canonical history and generated projections disagree.');
  const workspace = await snapshotWorkspaceV1({ projectRoot: resolved.projectRoot });
  const dispatches = options.dispatches ?? [];
  const unsafeDispatches = dispatches.filter((dispatch) => !dispatch.readOnly &&
    (dispatch.state === 'running' || dispatch.state === 'unknown'));
  const decision = routeDecision(canonical, {
    hasCheckpoint: true,
    requiredAuthority: unsafeDispatches.map((dispatch) => `dispatch:${dispatch.dispatchId}`),
  });
  const stable = {
    version: 1 as const,
    changeName: canonical.projection.run.changeName,
    runId: canonical.projection.run.runId,
    planRevision: artifactRevision(canonical),
    stage: options.stage ?? 'implementation',
    activity: options.activity ?? { kind: 'workflow' as const, id: decision.route, mutationCapable: true },
    taskIds: options.taskIds ?? canonical.projection.run.tasks
      .filter((task) => task.status === 'in_progress' || task.status === 'blocked').map((task) => task.taskId),
    ...(workspace.repositoryRevision ? { repositoryRevision: workspace.repositoryRevision } : {}),
    workspace: workspace.entries,
    dispatches,
    findingIds: canonical.projection.assurance.findings.filter((finding) => finding.blocking &&
      !['independently_verified', 'accepted_risk'].includes(finding.state)).map((finding) => finding.findingId),
    humanActionIds: canonical.projection.assurance.unresolvedHumanActions,
    resumeRoute: decision.route,
    quiescence: unsafeDispatches.length === 0 ? 'safe' as const : 'incomplete' as const,
  };
  const stateFingerprint = digestJson(stable);
  const existing = canonical.projection.run.effectivePause;
  if (existing?.stateFingerprint === stateFingerprint) return {
    checkpoint: existing, appended: false, safe: existing.quiescence === 'safe',
    run: canonical.projection.run, assurance: canonical.projection.assurance,
  };
  const checkpoint = PauseCheckpointV1Schema.parse({
    ...stable,
    pauseId: `pause-${stateFingerprint.slice(0, 16)}`,
    createdAt: options.now ?? new Date().toISOString(),
    stateFingerprint,
  });
  const result = await appendRelayEventV2({
    changeDir: resolved.changeDir,
    event: createRelayEventV2({
      eventId: `workflow-paused:${checkpoint.pauseId}:${canonical.store.events.length}`,
      runId: canonical.store.runId,
      changeName: canonical.store.changeName,
      occurredAt: checkpoint.createdAt,
      sourceDigests: sourceDigests(canonical),
      actor: { kind: 'host', id: 'openspec-relay' },
      provenance: { origin: 'relay-pause' },
      payload: { type: 'workflow.paused', checkpoint },
    }),
  });
  const projection = await writeReplayedProjectionsV2({
    changeDir: resolved.changeDir, store: result.store, compiled: canonical.compiled,
  });
  return { checkpoint, appended: result.appended, safe: checkpoint.quiescence === 'safe', ...projection };
}

export interface ResumeRelayResultV1 {
  resumed: boolean;
  reconstructed: boolean;
  decision: ResumeRouteDecisionV1;
  drift: string[];
  invocation?: unknown;
}

export async function resumeRelayChangeV1(options: {
  change: string;
  projectRoot?: string;
  invoke?: (route: ResumeRouteV1) => Promise<unknown>;
  now?: string;
}): Promise<ResumeRelayResultV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const canonical = await loadCanonicalRelayRecords(resolved.changeDir);
  const checkpoint = canonical.projection.run.effectivePause;
  if (!checkpoint) {
    const decision = routeDecision(canonical);
    const invocation = decision.automatic && options.invoke ? await options.invoke(decision.route) : undefined;
    return { resumed: false, reconstructed: true, decision, drift: [], ...(invocation !== undefined ? { invocation } : {}) };
  }
  const drift: string[] = [];
  if (checkpoint.planRevision !== artifactRevision(canonical)) drift.push('OpenSpec artifact revision changed.');
  const workspace = await validateWorkspaceSnapshotV1({
    projectRoot: resolved.projectRoot,
    expected: {
      revisionAvailable: Boolean(checkpoint.repositoryRevision),
      ...(checkpoint.repositoryRevision ? { repositoryRevision: checkpoint.repositoryRevision } : {}),
      entries: checkpoint.workspace,
    },
  });
  drift.push(...workspace.reasons);
  if (!canonical.projectionsMatch) drift.push('Canonical history and generated projections disagree.');
  if (checkpoint.quiescence === 'incomplete') drift.push('Mutation-capable dispatch quiescence is incomplete.');
  const decision = routeDecision(canonical, {
    hasCheckpoint: true,
    artifactsChanged: drift.some((reason) => /artifact/i.test(reason)),
    requiredAuthority: drift,
  });
  if (drift.length > 0) return { resumed: false, reconstructed: false, decision, drift: [...new Set(drift)] };
  const occurredAt = options.now ?? new Date().toISOString();
  const result = await appendRelayEventV2({
    changeDir: resolved.changeDir,
    event: createRelayEventV2({
      eventId: `workflow-resumed:${checkpoint.pauseId}:${canonical.store.events.length}`,
      runId: canonical.store.runId,
      changeName: canonical.store.changeName,
      occurredAt,
      sourceDigests: sourceDigests(canonical),
      actor: { kind: 'host', id: 'openspec-relay' },
      provenance: { origin: 'relay-resume' },
      payload: {
        type: 'workflow.resumed', pauseId: checkpoint.pauseId,
        checkpointFingerprint: checkpoint.stateFingerprint, route: decision.route, reconstructed: false,
      },
    }),
  });
  await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store: result.store, compiled: canonical.compiled });
  const invocation = options.invoke ? await options.invoke(decision.route) : undefined;
  return { resumed: true, reconstructed: false, decision, drift: [], ...(invocation !== undefined ? { invocation } : {}) };
}
