import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { evaluateFindingObligations } from './findings.js';
import { materializeCompiledTasks } from './reconciliation.js';
import {
  AssuranceCheckV2Schema,
  GsdAssuranceV2Schema,
  GsdConfigV1Schema,
  GsdEventEnvelopeV2Schema,
  GsdEventPayloadV2Schema,
  GsdEventStoreV2Schema,
  GsdRunV2Schema,
  type DebugSessionV2,
  type FindingLifecycleRecordV2,
  type GsdAssuranceV2,
  type GsdEventEnvelopeV2,
  type GsdEventPayloadV2,
  type GsdEventStoreV2,
  type GsdEventPayloadV1,
  type GsdRunV2,
  type FindingRouteV1,
  type PathfinderResultV1,
  type PlanApprovalV1,
  type PlanReviewResultV1,
  type ReleaseCandidateV2,
  type RepositoryContextV2,
  type ReadinessResultV2,
  type UatScenarioV2,
  type VerificationFindingV1,
  type SemanticClassificationV1,
  type SemanticDowngradeV1,
} from './schemas.js';
import {
  assuranceStatePath,
  atomicWriteGsdJson,
  digestJson,
  gsdGeneratedPath,
  readGsdText,
  runStatePath,
} from './state.js';

export function eventStorePath(changeDir: string): string {
  return gsdGeneratedPath(changeDir, 'events');
}

function eventStoreV2(value: unknown): GsdEventStoreV2 {
  const store = GsdEventStoreV2Schema.parse(value);
  const ids = new Set<string>();
  for (const event of store.events) {
    if (event.runId !== store.runId || event.changeName !== store.changeName) {
      throw new Error(`Event '${event.eventId}' does not belong to event store '${store.runId}'.`);
    }
    if (event.payloadDigest !== digestJson(event.payload)) {
      throw new Error(`Event '${event.eventId}' has a conflicting payload digest.`);
    }
    if (ids.has(event.eventId)) throw new Error(`Event store contains duplicate event ID '${event.eventId}'.`);
    ids.add(event.eventId);
  }
  return store;
}

export function createGsdEventV2(options: {
  eventId: string;
  runId: string;
  changeName: string;
  occurredAt: string;
  sourceDigests: Record<string, string>;
  actor: GsdEventEnvelopeV2['actor'];
  provenance: GsdEventEnvelopeV2['provenance'];
  payload: GsdEventPayloadV2;
}): GsdEventEnvelopeV2 {
  const payload = GsdEventPayloadV2Schema.parse(options.payload);
  return GsdEventEnvelopeV2Schema.parse({
    version: 2,
    ...options,
    payload,
    payloadDigest: digestJson(payload),
  });
}

export async function readEventStoreV2(changeDir: string): Promise<GsdEventStoreV2> {
  return eventStoreV2(JSON.parse(await readGsdText(changeDir, eventStorePath(changeDir))));
}

/** Read the only supported generated history format. Pre-release state may be
 * deleted and regenerated from the controlling OpenSpec change. */
export async function readCanonicalEventStore(changeDir: string): Promise<GsdEventStoreV2> {
  try {
    return await readEventStoreV2(changeDir);
  } catch (error) {
    throw new Error(
      `OpenSpec GSD execution records are missing or unsupported. Remove the change's .openspec-gsd directory ` +
      `and start a new run to regenerate it: ${(error as Error).message}`,
    );
  }
}

export async function appendGsdEventV2(options: {
  changeDir: string;
  event: GsdEventEnvelopeV2;
  beforeCommit?: () => Promise<void>;
  failBeforeCommit?: boolean;
}): Promise<{ store: GsdEventStoreV2; appended: boolean }> {
  const event = GsdEventEnvelopeV2Schema.parse(options.event);
  if (event.payloadDigest !== digestJson(event.payload)) {
    throw new Error(`Event '${event.eventId}' payload digest does not match its payload.`);
  }
  const store = await readEventStoreV2(options.changeDir);
  if (event.runId !== store.runId || event.changeName !== store.changeName) {
    throw new Error(`Event '${event.eventId}' targets a different run or change.`);
  }
  const existing = store.events.find((candidate) => candidate.eventId === event.eventId);
  if (existing) {
    if (digestJson(existing) !== digestJson(event)) {
      throw new Error(`Event ID '${event.eventId}' already exists with conflicting content.`);
    }
    return { store, appended: false };
  }
  const next = eventStoreV2({ ...store, events: [...store.events, event] });
  await atomicWriteGsdJson(options.changeDir, eventStorePath(options.changeDir), next, {
    ...(options.beforeCommit ? { beforeCommit: options.beforeCommit } : {}),
    ...(options.failBeforeCommit ? { failBeforeCommit: true } : {}),
  });
  return { store: next, appended: true };
}

function findingFromV1(
  finding: VerificationFindingV1,
  event: GsdEventEnvelopeV2,
): FindingLifecycleRecordV2 {
  const state = finding.status === 'human_needed' ? 'human_needed' : 'open';
  return {
    findingId: finding.findingId,
    providerId: `v1:${finding.origin}`,
    ruleId: 'v1-observation',
    category: 'migrated-v1-finding',
    scope: { kind: 'requirement', identity: finding.requirementId },
    severity: finding.status === 'warn' || finding.status === 'pass' ? 'warning' : 'error',
    blocking: finding.status === 'fail' || finding.status === 'human_needed',
    summary: finding.summary,
    requirementIds: [finding.requirementId],
    taskIds: [],
    evidence: finding.evidenceIds.map((evidenceId) => ({
      referenceId: `evidence:${evidenceId}`,
      kind: 'generated' as const,
      externalId: evidenceId,
      available: true,
    })),
    state,
    transitions: [{
      transitionId: `migration:${finding.findingId}`,
      to: state,
      occurredAt: event.occurredAt,
      actor: { kind: finding.origin },
      reason: 'Migrated from a version 1 finding without inferring technical closure.',
      evidence: [],
      sourceRevision: digestJson(event.sourceDigests),
    }],
  };
}

function assuranceStatusV2(options: {
  checks: GsdAssuranceV2['checks'];
  findings: FindingLifecycleRecordV2[];
  debugSessions: DebugSessionV2[];
  uatScenarios: UatScenarioV2[];
  releaseCandidates: ReleaseCandidateV2[];
  planStale: boolean;
  semanticDowngrades: SemanticDowngradeV1[];
}): GsdAssuranceV2['status'] {
  if (options.checks.some((check) => check.status === 'error') ||
      options.releaseCandidates.some((candidate) => candidate.status === 'error')) return 'error';
  if (options.checks.some((check) => check.status === 'fail') ||
      options.releaseCandidates.some((candidate) => candidate.status === 'fail') ||
      evaluateFindingObligations({ findings: options.findings, scenarios: options.uatScenarios }).blocking.length > 0) return 'fail';
  if (options.planStale) return 'fail';
  if (options.semanticDowngrades.some((downgrade) => downgrade.status === 'human_needed')) return 'human_needed';
  if (options.debugSessions.some((session) => session.status !== 'resolved' || !session.verification)) return 'human_needed';
  if (options.uatScenarios.some((scenario) =>
    ['awaiting_human', 'blocked', 'stale'].includes(scenario.status)) ||
      options.releaseCandidates.some((candidate) => candidate.status === 'human_needed')) return 'human_needed';
  if (options.checks.some((check) => check.status === 'pending')) return 'pending';
  if (options.checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

export function replayGsdEventsV2(options: {
  store: GsdEventStoreV2;
  compiled: CompiledOpenSpecChangeV1;
}): { run: GsdRunV2; assurance: GsdAssuranceV2 } {
  const store = eventStoreV2(options.store);
  const legacyConfigInput = Object.fromEntries(
    Object.entries(store.seed.config).filter(([key]) => key !== 'features'),
  );
  const legacyConfig = GsdConfigV1Schema.parse({ ...legacyConfigInput, version: 1 });
  const tasks = materializeCompiledTasks(options.compiled, legacyConfig);
  const byTask = new Map(tasks.map((task) => [task.taskId, task]));
  const evidence: GsdAssuranceV2['evidence'] = [];
  const repairs: GsdAssuranceV2['repairs'] = [];
  const deviations: GsdRunV2['deviations'] = [];
  const findings = new Map<string, FindingLifecycleRecordV2>();
  const debugSessions = new Map<string, DebugSessionV2>();
  const uatScenarios = new Map<string, UatScenarioV2>();
  const releaseCandidates = new Map<string, ReleaseCandidateV2>();
  const semanticClassifications = new Map<string, SemanticClassificationV1>();
  const semanticDowngrades = new Map<string, SemanticDowngradeV1>();
  const pathfinderResults = new Map<string, PathfinderResultV1>();
  const planReviews = new Map<string, PlanReviewResultV1>();
  const findingRoutes: FindingRouteV1[] = [];
  let planApproval: PlanApprovalV1 | undefined;
  let planStale = false;
  let repositoryContext: RepositoryContextV2 | undefined;
  let readiness: ReadinessResultV2 | undefined;
  let scenarioCoverage = store.seed.scenarioCoverage;
  let runStatus = store.seed.status;
  let checks = store.seed.checks.map((check) => AssuranceCheckV2Schema.parse(check));
  const humanActions: string[] = [];

  const applyV1Payload = (payload: GsdEventPayloadV1, event: GsdEventEnvelopeV2) => {
    if (payload.type === 'task.transition') {
      const task = byTask.get(payload.taskId);
      if (task && task.status !== 'complete') {
        byTask.set(payload.taskId, {
          ...task,
          status: payload.status,
          ...(payload.status === 'in_progress' && !task.implementationStartedAt
            ? { implementationStartedAt: event.occurredAt } : {}),
        });
      }
    } else if (payload.type === 'evidence.recorded') evidence.push(payload.evidence);
    else if (payload.type === 'finding.recorded') findings.set(
      payload.finding.findingId, findingFromV1(payload.finding, event),
    );
    else if (payload.type === 'repair.recorded') repairs.push(payload.repair);
    else if (payload.type === 'deviation.recorded') deviations.push(payload.deviation);
    else if (payload.type === 'human.decision') {
      const label = `${payload.gateId}: ${payload.reason ?? `human ${payload.decision}`}`;
      if (payload.decision === 'requested') humanActions.push(label);
      else {
        const index = humanActions.findIndex((item) => item.includes(payload.gateId));
        if (index >= 0) humanActions.splice(index, 1);
      }
    }
  };

  for (const event of store.events) {
    const payload = event.payload;
    if (['task.transition', 'evidence.recorded', 'finding.recorded', 'deviation.recorded',
      'repair.recorded', 'human.decision'].includes(payload.type)) {
      applyV1Payload(payload as GsdEventPayloadV1, event);
    } else if (payload.type === 'context.compiled') repositoryContext = payload.context;
    else if (payload.type === 'context.stale' && repositoryContext?.contextId === payload.contextId) {
      repositoryContext = {
        ...repositoryContext,
        status: 'stale',
        staleReferenceIds: [...new Set([...repositoryContext.staleReferenceIds, ...payload.referenceIds])].sort(),
      };
    } else if (payload.type === 'readiness.evaluated') readiness = payload.result;
    else if (payload.type === 'readiness.stale' && readiness?.resultId === payload.resultId) {
      readiness = { ...readiness, status: 'stale', inputRevision: payload.inputRevision };
    } else if (payload.type === 'semantic.classified') {
      semanticClassifications.set(payload.classification.requirementId, payload.classification);
    } else if (payload.type === 'semantic.downgrade_recorded') {
      semanticDowngrades.set(payload.downgrade.requirementId, payload.downgrade);
    } else if (payload.type === 'pathfinder.completed') {
      pathfinderResults.set(payload.result.pathfinderId, payload.result);
    } else if (payload.type === 'plan.reviewed') {
      planReviews.set(payload.review.reviewId, payload.review);
    } else if (payload.type === 'finding.routed') {
      findingRoutes.push(payload.route);
    } else if (payload.type === 'plan.approved') {
      planApproval = payload.approval;
      planStale = false;
    } else if (payload.type === 'plan.stale' && planApproval?.revision === payload.approvedRevision) {
      planStale = true;
    } else if (payload.type === 'finding.discovered') findings.set(payload.finding.findingId, payload.finding);
    else if (payload.type === 'finding.transitioned') {
      const existing = findings.get(payload.findingId);
      if (existing && existing.state === (payload.transition.from ?? existing.state)) {
        findings.set(payload.findingId, {
          ...existing,
          state: payload.transition.to,
          transitions: [...existing.transitions, payload.transition],
        });
      }
    } else if (payload.type === 'finding.stale') {
      const existing = findings.get(payload.findingId);
      if (existing) findings.set(payload.findingId, {
        ...existing,
        state: 'stale',
        transitions: [...existing.transitions, {
          transitionId: `stale:${event.eventId}`,
          from: existing.state,
          to: 'stale',
          occurredAt: event.occurredAt,
          actor: event.actor,
          reason: 'Relevant source or OpenSpec evidence changed.',
          evidence: [],
          sourceRevision: payload.sourceRevision,
        }],
      });
    } else if (payload.type === 'debug.session_started') debugSessions.set(payload.session.sessionId, payload.session);
    else if (payload.type === 'debug.hypothesis_recorded') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        hypotheses: [...session.hypotheses, payload.hypothesis], updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.experiment_recorded') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        experiments: session.experiments.some((item) => item.experimentId === payload.experiment.experimentId)
          ? session.experiments.map((item) => item.experimentId === payload.experiment.experimentId ? payload.experiment : item)
          : [...session.experiments, payload.experiment],
        updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.conclusion_recorded') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        conclusions: session.conclusions.some((item) => item.conclusionId === payload.conclusion.conclusionId)
          ? session.conclusions : [...session.conclusions, payload.conclusion], updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.reference_changed') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        changedReferences: session.changedReferences.some((item) => item.referenceId === payload.reference.referenceId &&
          item.digest === payload.reference.digest) ? session.changedReferences : [...session.changedReferences, payload.reference],
        nextAction: 'Reevaluate affected hypotheses, conclusions, and planned actions against the changed reference.',
        updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.question_recorded') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        unresolvedQuestions: [...new Set([...session.unresolvedQuestions, payload.question])], updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.next_action_recorded') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        nextAction: payload.nextAction, updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.verification_recorded') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        verification: payload.verification,
        regressionEvidence: payload.verification.evidence,
        updatedAt: event.occurredAt });
    } else if (payload.type === 'debug.verification_stale') {
      const session = debugSessions.get(payload.sessionId);
      if (session?.verification?.verificationId === payload.verificationId) {
        const withoutVerification = { ...session };
        delete withoutVerification.verification;
        debugSessions.set(payload.sessionId, {
          ...withoutVerification,
          status: 'active',
          nextAction: 'Repository inputs changed after verification. Re-run the regression check and obtain fresh verification.',
          updatedAt: event.occurredAt,
        });
      }
    } else if (payload.type === 'debug.session_resolved') {
      const session = debugSessions.get(payload.sessionId);
      if (session?.verification?.verificationId === payload.verificationId) debugSessions.set(payload.sessionId, {
        ...session,
        status: 'resolved',
        nextAction: payload.nextAction,
        updatedAt: event.occurredAt,
      });
    } else if (payload.type === 'debug.session_updated') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session,
        status: payload.status === 'resolved' && !session.verification ? 'human_needed' : payload.status,
        ...(payload.nextAction ? { nextAction: payload.nextAction } : {}),
        ...(payload.regressionEvidence ? { regressionEvidence: payload.regressionEvidence } : {}),
        updatedAt: event.occurredAt });
    } else if (payload.type === 'uat.scenario_recorded') uatScenarios.set(payload.scenario.scenarioId, payload.scenario);
    else if (payload.type === 'uat.scenario_retest') {
      const scenario = uatScenarios.get(payload.scenarioId);
      if (scenario) {
        const updated = { ...scenario, status: 'awaiting_retest' as const, sourceRevision: payload.sourceRevision };
        delete updated.disposition;
        uatScenarios.set(payload.scenarioId, updated);
      }
    }
    else if (payload.type === 'uat.scenario_stale') {
      const scenario = uatScenarios.get(payload.scenarioId);
      if (scenario) uatScenarios.set(payload.scenarioId, { ...scenario, status: 'stale', sourceRevision: payload.sourceRevision });
    } else if (payload.type === 'scenario.coverage_reconciled') scenarioCoverage = payload.coverage;
    else if (payload.type === 'uat.disposition_recorded') {
      const scenario = uatScenarios.get(payload.scenarioId);
      if (scenario) uatScenarios.set(payload.scenarioId, { ...scenario, status: payload.status,
        sourceRevision: payload.sourceRevision,
        disposition: { actor: payload.actor, recordedAt: event.occurredAt, notes: payload.notes, evidence: payload.evidence } });
    } else if (payload.type === 'release.evaluated') releaseCandidates.set(payload.candidate.candidateId, payload.candidate);
    else if (payload.type === 'checks.evaluated') checks = payload.checks.map((check) => AssuranceCheckV2Schema.parse(check));
    else if (payload.type === 'run.status_updated') runStatus = payload.status;
    else if (payload.type === 'human.disposition_recorded' && payload.disposition === 'human_needed') {
      humanActions.push(`${payload.subjectId}: ${payload.reason}`);
    }
  }

  const updatedAt = store.events.at(-1)?.occurredAt ?? store.createdAt;
  const currentDigests = new Map(options.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
  const staleEvidenceIds = evidence.filter((item) => Object.entries(item.sourceDigests ?? {}).some(
    ([artifactPath, digest]) => currentDigests.get(artifactPath) !== digest,
  )).map((item) => item.evidenceId).sort();
  const findingValues = [...findings.values()].sort((left, right) => left.findingId.localeCompare(right.findingId));
  const uatValues = [...uatScenarios.values()].sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
  const releaseValues = [...releaseCandidates.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const debugValues = [...debugSessions.values()].sort((left, right) => left.sessionId.localeCompare(right.sessionId));
  const semanticValues = [...semanticClassifications.values()]
    .sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  const downgradeValues = [...semanticDowngrades.values()]
    .sort((left, right) => left.requirementId.localeCompare(right.requirementId));
  const pathfinderValues = [...pathfinderResults.values()]
    .sort((left, right) => left.pathfinderId.localeCompare(right.pathfinderId));
  const reviewValues = [...planReviews.values()].sort((left, right) => left.reviewId.localeCompare(right.reviewId));
  const assurance = GsdAssuranceV2Schema.parse({
    version: 2,
    runId: store.runId,
    changeName: store.changeName,
    mode: store.seed.mode,
    status: assuranceStatusV2({ checks, findings: findingValues, debugSessions: debugValues,
      uatScenarios: uatValues, releaseCandidates: releaseValues, planStale,
      semanticDowngrades: downgradeValues }),
    updatedAt,
    checks,
    evidence,
    scenarioCoverage,
    repairs,
    findings: findingValues,
    staleEvidenceIds,
    unresolvedHumanActions: [...new Set(humanActions)].sort(),
    ...(repositoryContext ? { repositoryContext } : {}),
    ...(readiness ? { readiness } : {}),
    debugSessions: debugValues,
    uatScenarios: uatValues,
    releaseCandidates: releaseValues,
    semanticClassifications: semanticValues,
    semanticDowngrades: downgradeValues,
    pathfinderResults: pathfinderValues,
    planReviews: reviewValues,
    findingRoutes,
    ...(planApproval ? { planApproval } : {}),
    planStale,
  });
  const run = GsdRunV2Schema.parse({
    version: 2,
    runId: store.runId,
    changeName: store.changeName,
    changeRef: store.seed.changeRef,
    mode: store.seed.mode,
    tier: store.seed.tier,
    status: runStatus,
    startedAt: store.seed.startedAt,
    updatedAt,
    artifacts: options.compiled.artifacts,
    tasks: [...byTask.values()],
    executionWaves: options.compiled.graph.waves,
    gateIds: store.seed.gateIds,
    deviations,
    repairIds: repairs.map((repair) => repair.repairId),
    config: store.seed.config,
    assuranceDigest: digestJson(assurance),
    stateRevision: digestJson(store),
    ...(repositoryContext ? { repositoryContextId: repositoryContext.contextId } : {}),
    ...(readiness ? { readinessResultId: readiness.resultId } : {}),
    ...(planApproval ? { planRevision: planApproval.revision } : {}),
    planApprovalStatus: !planApproval ? 'missing' : planStale ? 'stale' : 'current',
  });
  return { run, assurance };
}

export async function writeReplayedProjectionsV2(options: {
  changeDir: string;
  store: GsdEventStoreV2;
  compiled: CompiledOpenSpecChangeV1;
}): Promise<{ run: GsdRunV2; assurance: GsdAssuranceV2 }> {
  const projection = replayGsdEventsV2(options);
  await atomicWriteGsdJson(options.changeDir, assuranceStatePath(options.changeDir), projection.assurance);
  await atomicWriteGsdJson(options.changeDir, runStatePath(options.changeDir), projection.run);
  return projection;
}
