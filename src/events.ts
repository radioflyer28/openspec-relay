import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { evaluateFindingObligations } from './findings.js';
import { materializeCompiledTasks } from './reconciliation.js';
import {
  AssuranceCheckV2Schema,
  GuardrailsAssuranceV2Schema,
  GuardrailsConfigV1Schema,
  GuardrailsEventEnvelopeV2Schema,
  GuardrailsEventPayloadV2Schema,
  GuardrailsEventStoreV2Schema,
  GuardrailsRunV2Schema,
  type DebugSessionV2,
  type FindingLifecycleRecordV2,
  type GuardrailsAssuranceV2,
  type GuardrailsEventEnvelopeV2,
  type GuardrailsEventPayloadV2,
  type GuardrailsEventStoreV2,
  type GuardrailsEventPayloadV1,
  type GuardrailsRunV2,
  type ReleaseCandidateV2,
  type RepositoryContextV2,
  type ReadinessResultV2,
  type UatScenarioV2,
  type VerificationFindingV1,
} from './schemas.js';
import {
  assuranceStatePath,
  atomicWriteGuardrailsJson,
  digestJson,
  guardrailsGeneratedPath,
  readGuardrailsText,
  runStatePath,
} from './state.js';

export function eventStorePath(changeDir: string): string {
  return guardrailsGeneratedPath(changeDir, 'events');
}

function eventStoreV2(value: unknown): GuardrailsEventStoreV2 {
  const store = GuardrailsEventStoreV2Schema.parse(value);
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

export function createGuardrailsEventV2(options: {
  eventId: string;
  runId: string;
  changeName: string;
  occurredAt: string;
  sourceDigests: Record<string, string>;
  actor: GuardrailsEventEnvelopeV2['actor'];
  provenance: GuardrailsEventEnvelopeV2['provenance'];
  payload: GuardrailsEventPayloadV2;
}): GuardrailsEventEnvelopeV2 {
  const payload = GuardrailsEventPayloadV2Schema.parse(options.payload);
  return GuardrailsEventEnvelopeV2Schema.parse({
    version: 2,
    ...options,
    payload,
    payloadDigest: digestJson(payload),
  });
}

export async function readEventStoreV2(changeDir: string): Promise<GuardrailsEventStoreV2> {
  return eventStoreV2(JSON.parse(await readGuardrailsText(changeDir, eventStorePath(changeDir))));
}

/** Read the only supported generated history format. Pre-release state may be
 * deleted and regenerated from the controlling OpenSpec change. */
export async function readCanonicalEventStore(changeDir: string): Promise<GuardrailsEventStoreV2> {
  try {
    return await readEventStoreV2(changeDir);
  } catch (error) {
    throw new Error(
      `Guardrails generated state is missing or unsupported. Remove the change's .guardrails directory ` +
      `and start a new run to regenerate it: ${(error as Error).message}`,
    );
  }
}

export async function appendGuardrailsEventV2(options: {
  changeDir: string;
  event: GuardrailsEventEnvelopeV2;
  beforeCommit?: () => Promise<void>;
  failBeforeCommit?: boolean;
}): Promise<{ store: GuardrailsEventStoreV2; appended: boolean }> {
  const event = GuardrailsEventEnvelopeV2Schema.parse(options.event);
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
  await atomicWriteGuardrailsJson(options.changeDir, eventStorePath(options.changeDir), next, {
    ...(options.beforeCommit ? { beforeCommit: options.beforeCommit } : {}),
    ...(options.failBeforeCommit ? { failBeforeCommit: true } : {}),
  });
  return { store: next, appended: true };
}

function findingFromV1(
  finding: VerificationFindingV1,
  event: GuardrailsEventEnvelopeV2,
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
  checks: GuardrailsAssuranceV2['checks'];
  findings: FindingLifecycleRecordV2[];
  debugSessions: DebugSessionV2[];
  uatScenarios: UatScenarioV2[];
  releaseCandidates: ReleaseCandidateV2[];
}): GuardrailsAssuranceV2['status'] {
  if (options.checks.some((check) => check.status === 'error') ||
      options.releaseCandidates.some((candidate) => candidate.status === 'error')) return 'error';
  if (options.checks.some((check) => check.status === 'fail') ||
      options.releaseCandidates.some((candidate) => candidate.status === 'fail') ||
      evaluateFindingObligations({ findings: options.findings, scenarios: options.uatScenarios }).blocking.length > 0) return 'fail';
  if (options.debugSessions.some((session) => session.status !== 'resolved' || !session.verification)) return 'human_needed';
  if (options.uatScenarios.some((scenario) =>
    ['awaiting_human', 'blocked', 'stale'].includes(scenario.status)) ||
      options.releaseCandidates.some((candidate) => candidate.status === 'human_needed')) return 'human_needed';
  if (options.checks.some((check) => check.status === 'pending')) return 'pending';
  if (options.checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

export function replayGuardrailsEventsV2(options: {
  store: GuardrailsEventStoreV2;
  compiled: CompiledOpenSpecChangeV1;
}): { run: GuardrailsRunV2; assurance: GuardrailsAssuranceV2 } {
  const store = eventStoreV2(options.store);
  const legacyConfigInput = Object.fromEntries(
    Object.entries(store.seed.config).filter(([key]) => key !== 'features'),
  );
  const legacyConfig = GuardrailsConfigV1Schema.parse({ ...legacyConfigInput, version: 1 });
  const tasks = materializeCompiledTasks(options.compiled, legacyConfig);
  const byTask = new Map(tasks.map((task) => [task.taskId, task]));
  const evidence: GuardrailsAssuranceV2['evidence'] = [];
  const repairs: GuardrailsAssuranceV2['repairs'] = [];
  const deviations: GuardrailsRunV2['deviations'] = [];
  const findings = new Map<string, FindingLifecycleRecordV2>();
  const debugSessions = new Map<string, DebugSessionV2>();
  const uatScenarios = new Map<string, UatScenarioV2>();
  const releaseCandidates = new Map<string, ReleaseCandidateV2>();
  let repositoryContext: RepositoryContextV2 | undefined;
  let readiness: ReadinessResultV2 | undefined;
  let scenarioCoverage = store.seed.scenarioCoverage;
  let runStatus = store.seed.status;
  let checks = store.seed.checks.map((check) => AssuranceCheckV2Schema.parse(check));
  const humanActions: string[] = [];

  const applyV1Payload = (payload: GuardrailsEventPayloadV1, event: GuardrailsEventEnvelopeV2) => {
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
      applyV1Payload(payload as GuardrailsEventPayloadV1, event);
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
  const assurance = GuardrailsAssuranceV2Schema.parse({
    version: 2,
    runId: store.runId,
    changeName: store.changeName,
    mode: store.seed.mode,
    status: assuranceStatusV2({ checks, findings: findingValues, debugSessions: debugValues,
      uatScenarios: uatValues, releaseCandidates: releaseValues }),
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
  });
  const run = GuardrailsRunV2Schema.parse({
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
  });
  return { run, assurance };
}

export async function writeReplayedProjectionsV2(options: {
  changeDir: string;
  store: GuardrailsEventStoreV2;
  compiled: CompiledOpenSpecChangeV1;
}): Promise<{ run: GuardrailsRunV2; assurance: GuardrailsAssuranceV2 }> {
  const projection = replayGuardrailsEventsV2(options);
  await atomicWriteGuardrailsJson(options.changeDir, assuranceStatePath(options.changeDir), projection.assurance);
  await atomicWriteGuardrailsJson(options.changeDir, runStatePath(options.changeDir), projection.run);
  return projection;
}
