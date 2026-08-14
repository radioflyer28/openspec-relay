import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  appendGuardrailsEventV2,
  createGuardrailsEventV2,
  readEventStoreV2,
  writeReplayedProjectionsV2,
} from './events.js';
import { loadCanonicalGuardrailsState } from './canonical-state.js';
import {
  debugSessionForRepairExhaustion,
  observeDebugExperiment,
  planDebugExperiment,
  recordDebugConclusion,
  recordDebugHypothesis,
  resolveDebugSession,
  startDebugSession,
} from './debug-sessions.js';
import { transitionFinding } from './findings.js';
import { recordUatDisposition, nextUatScenario, projectUatScenarios } from './uat.js';
import { resolveChangeDirectory } from './state.js';
import { atomicWriteText } from './state.js';
import { digestJson } from './state.js';
import { bindRepositoryEvidenceDigests, computeMaterialRevision } from './repository-context.js';
import { acceptRequiredGate, readRequiredGateRecord } from '@fission-ai/openspec/extensions';
import {
  GuardrailsEventPayloadV1Schema,
  type FindingStateV2,
  type FindingTransitionV2,
  type GuardrailsEventPayloadV1,
  type GuardrailsEventActorV2,
  type PortableReferenceV2,
} from './schemas.js';

async function currentV2(options: { change: string; projectRoot?: string }) {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const canonical = await loadCanonicalGuardrailsState(resolved.changeDir);
  return { resolved, ...canonical };
}

function sources(compiled: Awaited<ReturnType<typeof currentV2>>['compiled']): Record<string, string> {
  return Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}

async function sourceRevision(
  current: Awaited<ReturnType<typeof currentV2>>,
  evidence: PortableReferenceV2[] = [],
): Promise<string> {
  return computeMaterialRevision({
    projectRoot: current.resolved.projectRoot,
    compiled: current.compiled,
    context: current.projection.assurance.repositoryContext,
    evidence,
  });
}

export async function startOrResumeDebugV2(options: {
  change: string;
  projectRoot?: string;
  findingId?: string;
  now?: string;
}) {
  const current = await currentV2(options);
  const finding = options.findingId
    ? current.projection.assurance.findings.find((item) => item.findingId === options.findingId)
    : current.projection.assurance.findings.find((item) => item.blocking &&
      ['open', 'repaired', 'stale', 'human_needed'].includes(item.state));
  if (!finding) throw new Error('Debug requires an unresolved finding; supply --finding for a specific one.');
  const failedEvidence: PortableReferenceV2[] = finding.evidence.length ? finding.evidence : [{
    referenceId: `finding:${finding.findingId}`,
    kind: 'generated', externalId: finding.findingId, available: true,
  }];
  const now = options.now ?? new Date().toISOString();
  const session = startDebugSession({
    logicalFailureId: finding.findingId, findingId: finding.findingId,
    references: [...finding.requirementIds, ...finding.taskIds], failedEvidence,
    existing: current.projection.assurance.debugSessions, now,
  });
  await appendGuardrailsEventV2({
    changeDir: current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `debug:${session.sessionId}`, runId: current.store.runId, changeName: current.store.changeName,
      occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'host' },
      provenance: { origin: 'guardrails-debug' }, payload: { type: 'debug.session_started', session },
    }),
  });
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled: current.compiled,
  });
  return { session: projection.assurance.debugSessions.find((item) => item.sessionId === session.sessionId)!, run: projection.run };
}

function debugSession(current: Awaited<ReturnType<typeof currentV2>>, sessionId: string) {
  const session = current.projection.assurance.debugSessions.find((item) => item.sessionId === sessionId);
  if (!session) throw new Error(`Unknown debug session '${sessionId}'. Start or resume it before recording observations.`);
  return session;
}

/**
 * Persist an authorized lifecycle transition as a v2 event. Tier 0 hosts use
 * this structured entry point instead of inferring closure from an executor's
 * claim or from a later checker omitting the finding.
 */
export type FindingWorkflowActionV2 = 'repair' | 'verify' | 'accept-risk' | 'request-human' | 'mark-stale';

function findingAction(action: FindingWorkflowActionV2, actorId?: string): {
  to: FindingStateV2;
  actor: FindingTransitionV2['actor'];
} {
  if (action === 'repair') return { to: 'repaired', actor: { kind: 'executor', ...(actorId ? { id: actorId } : {}) } };
  if (action === 'verify') return { to: 'independently_verified', actor: { kind: 'verifier', ...(actorId ? { id: actorId } : {}) } };
  if (action === 'accept-risk') {
    if (!actorId) throw new Error('Accepted risk requires explicit human attribution.');
    return { to: 'accepted_risk', actor: { kind: 'human', id: actorId } };
  }
  if (action === 'request-human') return { to: 'human_needed', actor: { kind: 'reviewer', ...(actorId ? { id: actorId } : {}) } };
  return { to: 'stale', actor: { kind: 'automation', ...(actorId ? { id: actorId } : {}) } };
}

export async function transitionFindingV2(options: {
  change: string;
  projectRoot?: string;
  findingId: string;
  action: FindingWorkflowActionV2;
  actorId?: string;
  reason: string;
  evidence?: PortableReferenceV2[];
  expiry?: string;
  followUp?: string;
  now?: string;
}) {
  const current = await currentV2(options);
  const finding = current.projection.assurance.findings.find((item) => item.findingId === options.findingId);
  if (!finding) throw new Error(`Unknown finding '${options.findingId}'. Record or reconcile it before transitioning.`);
  const workflow = findingAction(options.action, options.actorId);
  if (options.action === 'verify' && finding.transitions.some((transition) =>
    transition.actor.kind === 'executor' && transition.actor.id && transition.actor.id === options.actorId)) {
    throw new Error('Independent verification must come from a verifier stage distinct from the repair executor.');
  }
  const now = options.now ?? new Date().toISOString();
  const evidence = await bindRepositoryEvidenceDigests({
    projectRoot: current.resolved.projectRoot,
    evidence: options.evidence ?? [],
  });
  const updated = transitionFinding({
    finding,
    to: workflow.to,
    actor: workflow.actor,
    reason: options.reason,
    evidence,
    sourceRevision: await sourceRevision(current, [...finding.evidence, ...finding.transitions.flatMap((item) => item.evidence), ...evidence]),
    occurredAt: now,
    ...(options.expiry ? { expiry: options.expiry } : {}),
    ...(options.followUp ? { followUp: options.followUp } : {}),
  });
  const transition = updated.transitions.at(-1)!;
  await appendGuardrailsEventV2({
    changeDir: current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `finding-transition:${finding.findingId}:${transition.transitionId}`,
      runId: current.store.runId,
      changeName: current.store.changeName,
      occurredAt: now,
      sourceDigests: sources(current.compiled),
      actor: workflow.actor,
      provenance: { origin: `guardrails-finding-${options.action}` },
      payload: { type: 'finding.transitioned', findingId: finding.findingId, transition },
    }),
  });
  if (transition.to === 'independently_verified' && finding.providerId === 'uat' &&
      finding.ruleId === 'scenario-failed' && finding.scope.kind === 'scenario') {
    const scenario = current.projection.assurance.uatScenarios.find((item) => item.scenarioId === finding.scope.identity);
    if (!scenario) throw new Error(`Failed UAT finding '${finding.findingId}' has no projected scenario to retest.`);
    await appendGuardrailsEventV2({
      changeDir: current.resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `uat-retest:${scenario.scenarioId}:${transition.transitionId}`,
        runId: current.store.runId,
        changeName: current.store.changeName,
        occurredAt: now,
        sourceDigests: sources(current.compiled),
        actor: workflow.actor,
        provenance: { origin: `guardrails-finding-${options.action}` },
        payload: { type: 'uat.scenario_retest', scenarioId: scenario.scenarioId, sourceRevision: transition.sourceRevision },
      }),
    });
  }
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir,
    store: await readEventStoreV2(current.resolved.changeDir),
    compiled: current.compiled,
  });
  return projection.assurance.findings.find((item) => item.findingId === finding.findingId)!;
}

async function appendDebugEvent(options: {
  current: Awaited<ReturnType<typeof currentV2>>;
  eventId: string;
  now: string;
  payload: Extract<Parameters<typeof createGuardrailsEventV2>[0]['payload'], { type: `debug.${string}` }>;
  actor?: GuardrailsEventActorV2;
}) {
  await appendGuardrailsEventV2({
    changeDir: options.current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: options.eventId,
      runId: options.current.store.runId,
      changeName: options.current.store.changeName,
      occurredAt: options.now,
      sourceDigests: sources(options.current.compiled),
      actor: options.actor ?? { kind: 'executor' },
      provenance: { origin: 'guardrails-debug' },
      payload: options.payload,
    }),
  });
  const projection = await writeReplayedProjectionsV2({
    changeDir: options.current.resolved.changeDir,
    store: await readEventStoreV2(options.current.resolved.changeDir),
    compiled: options.current.compiled,
  });
  return projection.assurance.debugSessions;
}

export async function recordDebugReferenceChangeV2(options: {
  change: string; projectRoot?: string; sessionId: string; reference: PortableReferenceV2; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const [reference] = await bindRepositoryEvidenceDigests({
    projectRoot: current.resolved.projectRoot,
    evidence: [options.reference],
  });
  const sessions = await appendDebugEvent({
    current, now,
    eventId: `debug-reference:${options.sessionId}:${reference.referenceId}:${reference.digest ?? 'unavailable'}`,
    payload: { type: 'debug.reference_changed', sessionId: options.sessionId, reference },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function recordDebugQuestionV2(options: {
  change: string; projectRoot?: string; sessionId: string; question: string; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const sessions = await appendDebugEvent({
    current, now,
    eventId: `debug-question:${options.sessionId}:${digestJson(options.question).slice(0, 16)}`,
    payload: { type: 'debug.question_recorded', sessionId: options.sessionId, question: options.question },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function recordDebugNextActionV2(options: {
  change: string; projectRoot?: string; sessionId: string; nextAction: string; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const sessions = await appendDebugEvent({
    current, now,
    eventId: `debug-next-action:${options.sessionId}:${digestJson(options.nextAction).slice(0, 16)}`,
    payload: { type: 'debug.next_action_recorded', sessionId: options.sessionId, nextAction: options.nextAction },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function recordDebugHypothesisV2(options: {
  change: string; projectRoot?: string; sessionId: string; statement: string; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const updated = recordDebugHypothesis({ session: debugSession(current, options.sessionId), statement: options.statement, now });
  const hypothesis = updated.hypotheses.at(-1)!;
  const sessions = await appendDebugEvent({ current, now,
    eventId: `debug-hypothesis:${options.sessionId}:${hypothesis.hypothesisId}`,
    payload: { type: 'debug.hypothesis_recorded', sessionId: options.sessionId, hypothesis },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function planDebugExperimentV2(options: {
  change: string; projectRoot?: string; sessionId: string; hypothesisId: string; action: string;
  evidence: PortableReferenceV2[]; humanRationale?: string; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const updated = planDebugExperiment({
    session: debugSession(current, options.sessionId), hypothesisId: options.hypothesisId, action: options.action,
    targetedEvidence: options.evidence, sourceRevision: await sourceRevision(current, options.evidence), now,
    ...(options.humanRationale ? { humanRationale: options.humanRationale } : {}),
  });
  const experiment = updated.experiments.at(-1)!;
  const sessions = await appendDebugEvent({ current, now,
    eventId: `debug-experiment:${options.sessionId}:${experiment.experimentId}`,
    payload: { type: 'debug.experiment_recorded', sessionId: options.sessionId, experiment },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function observeDebugExperimentV2(options: {
  change: string; projectRoot?: string; sessionId: string; experimentId: string;
  result: 'passed' | 'failed' | 'inconclusive'; observation: string; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const updated = observeDebugExperiment({
    session: debugSession(current, options.sessionId), experimentId: options.experimentId,
    result: options.result, observation: options.observation, now,
  });
  const experiment = updated.experiments.find((item) => item.experimentId === options.experimentId)!;
  const sessions = await appendDebugEvent({ current, now,
    eventId: `debug-observation:${options.sessionId}:${options.experimentId}:${now}`,
    payload: { type: 'debug.experiment_recorded', sessionId: options.sessionId, experiment },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function recordDebugConclusionV2(options: {
  change: string; projectRoot?: string; sessionId: string; kind: 'conclusion' | 'root_cause';
  statement: string; experimentIds: string[]; evidence?: PortableReferenceV2[]; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const evidence = options.evidence ? await bindRepositoryEvidenceDigests({
    projectRoot: current.resolved.projectRoot,
    evidence: options.evidence,
  }) : undefined;
  const updated = recordDebugConclusion({ session: debugSession(current, options.sessionId), kind: options.kind,
    statement: options.statement, experimentIds: options.experimentIds, evidence,
    sourceRevision: await sourceRevision(current, evidence), now });
  const conclusion = updated.conclusions.at(-1)!;
  const sessions = await appendDebugEvent({ current, now,
    eventId: `debug-conclusion:${options.sessionId}:${conclusion.conclusionId}`,
    payload: { type: 'debug.conclusion_recorded', sessionId: options.sessionId, conclusion },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function resolveDebugSessionV2(options: {
  change: string; projectRoot?: string; sessionId: string;
  redEvidenceId?: string; greenEvidenceId?: string; verifierId?: string;
  exemption?: { reason: string; acceptedBy: string }; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const session = debugSession(current, options.sessionId);
  const finding = session.findingId
    ? current.projection.assurance.findings.find((item) => item.findingId === session.findingId)
    : undefined;
  const checkId = session.logicalFailureId.startsWith('check:')
    ? session.logicalFailureId.slice('check:'.length)
    : undefined;
  const currentSourceDigests = sources(current.compiled);
  if (!options.exemption && !options.verifierId) {
    throw new Error('Debug resolution requires verifier-stage attribution.');
  }
  const workflowActor: { kind: 'verifier' | 'human'; id: string } = options.exemption
    ? { kind: 'human', id: options.exemption.acceptedBy }
    : { kind: 'verifier', id: options.verifierId! };
  const equivalentCheckEvent = !finding && checkId
    ? [...current.store.events].reverse().find((event) => event.payload.type === 'evidence.recorded' &&
      event.payload.evidence.checkId === checkId && event.payload.evidence.result === 'pass' &&
      event.payload.evidence.origin === 'verifier' && event.actor.kind === 'verifier' &&
      event.actor.id === workflowActor.id && Date.parse(event.occurredAt) >= Date.parse(session.startedAt) &&
      Date.parse(event.payload.evidence.observedAt) >= Date.parse(session.startedAt) &&
      Boolean(event.payload.evidence.sourceDigests) && Object.entries(currentSourceDigests).every(
        ([artifactPath, sourceDigest]) => event.payload.type === 'evidence.recorded' &&
          event.payload.evidence.sourceDigests?.[artifactPath] === sourceDigest,
      ))
    : undefined;
  const equivalentCheck = equivalentCheckEvent?.payload.type === 'evidence.recorded'
    ? equivalentCheckEvent.payload.evidence
    : undefined;
  if (finding && finding.state !== 'independently_verified') {
    throw new Error('Debug resolution requires the linked finding to be independently verified first.');
  }
  if (!finding && !equivalentCheck) {
    throw new Error('Debug resolution requires a current independently verified linked finding or equivalent check.');
  }
  if (finding) {
    const repairingActors = new Set(finding.transitions.filter((item) => item.actor.kind === 'executor')
      .map((item) => item.actor.id).filter(Boolean));
    if (repairingActors.has(workflowActor.id)) {
      throw new Error('Debug resolution verifier must be distinct from the executor who repaired the finding.');
    }
    const verificationTransition = [...finding.transitions].reverse().find((item) => item.to === 'independently_verified');
    if (!options.exemption && (verificationTransition?.actor.kind !== 'verifier' ||
        verificationTransition.actor.id !== workflowActor.id)) {
      throw new Error('Debug resolution must use the distinct orchestrator verifier stage that verified the finding.');
    }
  }
  let regressionEvidence: PortableReferenceV2[];
  if (options.exemption) regressionEvidence = [{
    referenceId: `debug-exemption:${digestJson(options.exemption).slice(0, 24)}`,
    kind: 'generated',
    externalId: options.exemption.acceptedBy,
    digest: digestJson(options.exemption),
    available: true,
  }];
  else {
    if (!options.redEvidenceId || !options.greenEvidenceId) {
      throw new Error('Debug resolution requires canonical RED and GREEN evidence IDs.');
    }
    const red = current.projection.assurance.evidence.find((item) => item.evidenceId === options.redEvidenceId);
    const green = current.projection.assurance.evidence.find((item) => item.evidenceId === options.greenEvidenceId);
    if (!red || !green) throw new Error('Debug resolution evidence IDs must reference existing canonical evidence records.');
    if (current.projection.assurance.staleEvidenceIds.includes(red.evidenceId) ||
        current.projection.assurance.staleEvidenceIds.includes(green.evidenceId)) {
      throw new Error('Debug resolution requires current canonical RED and GREEN evidence.');
    }
    if (red.phase !== 'red' || red.result !== 'fail' || red.exitCode === 0 || !red.relevantFailure ||
        red.preExistingFailure || green.phase !== 'green' || green.result !== 'pass') {
      throw new Error('Debug resolution requires a relevant fail-first RED record and a passing GREEN record.');
    }
    if (red.checkId !== green.checkId || red.taskId !== green.taskId ||
        (checkId && red.checkId !== checkId) ||
        (finding?.taskIds.length && (!red.taskId || !finding.taskIds.includes(red.taskId)))) {
      throw new Error('Debug RED and GREEN evidence must identify the same check and task or defect subject.');
    }
    if (Date.parse(red.observedAt) >= Date.parse(green.observedAt) || red.sourceState === green.sourceState ||
        red.outputDigest === green.outputDigest) {
      throw new Error('Debug RED evidence must precede GREEN evidence from the resulting implementation revision.');
    }
    if (Object.entries(currentSourceDigests).some(([artifactPath, sourceDigest]) =>
      red.sourceDigests?.[artifactPath] !== sourceDigest || green.sourceDigests?.[artifactPath] !== sourceDigest)) {
      throw new Error('Debug resolution requires RED and GREEN evidence bound to current controlling OpenSpec revisions.');
    }
    const repairTransition = finding?.transitions.find((item) => item.to === 'repaired');
    if (repairTransition && (Date.parse(red.observedAt) >= Date.parse(repairTransition.occurredAt) ||
        Date.parse(green.observedAt) < Date.parse(repairTransition.occurredAt))) {
      throw new Error('Debug RED must precede the repair and GREEN must verify the resulting revision.');
    }
    regressionEvidence = [red, green].map((item) => ({
      referenceId: `evidence:${item.evidenceId}`,
      kind: 'generated' as const,
      externalId: item.evidenceId,
      digest: item.outputDigest,
      available: true,
    }));
  }
  const equivalentCheckReference = equivalentCheck ? {
    referenceId: `evidence:${equivalentCheck.evidenceId}`,
    kind: 'generated' as const,
    externalId: equivalentCheck.evidenceId,
    digest: equivalentCheck.outputDigest,
    available: true,
  } : undefined;
  const verificationEvidence = equivalentCheckReference
    ? [equivalentCheckReference, ...regressionEvidence]
    : regressionEvidence;
  const revision = await sourceRevision(current, verificationEvidence);
  if (finding) {
    const findingRevision = await sourceRevision(current, [
      ...finding.evidence,
      ...finding.transitions.flatMap((transition) => transition.evidence),
    ]);
    if (finding.transitions.at(-1)?.sourceRevision !== findingRevision) {
      throw new Error('Debug resolution requires a current independently verified linked finding.');
    }
  }
  const verifiedSubject = finding
    ? { findingId: finding.findingId }
    : { checkId: equivalentCheck!.checkId };
  const verification = {
    verificationId: `debug-verification:${digestJson({
      sessionId: session.sessionId, ...verifiedSubject, verifier: workflowActor, revision,
      evidence: verificationEvidence.map((item) => [item.referenceId, item.digest]),
    }).slice(0, 24)}`,
    ...verifiedSubject,
    verifier: workflowActor,
    evidence: verificationEvidence,
    ...(!options.exemption ? {
      failBeforeEvidence: regressionEvidence[0],
      passAfterEvidence: regressionEvidence[1],
    } : { exemption: options.exemption }),
    sourceRevision: revision,
    verifiedAt: now,
  };
  const updated = resolveDebugSession({
    session, regressionEvidence, verification, now,
    ...(options.exemption ? { exemption: options.exemption } : {}),
  });
  await appendDebugEvent({ current, now,
    eventId: `debug-verification:${options.sessionId}:${verification.verificationId}`,
    actor: workflowActor,
    payload: { type: 'debug.verification_recorded', sessionId: options.sessionId, verification },
  });
  const refreshed = await currentV2(options);
  const resolutionAt = new Date(Date.parse(now) + 1).toISOString();
  const sessions = await appendDebugEvent({ current: refreshed, now: resolutionAt,
    eventId: `debug-resolved:${options.sessionId}:${verification.verificationId}`,
    actor: workflowActor,
    payload: { type: 'debug.session_resolved', sessionId: options.sessionId,
      verificationId: verification.verificationId, nextAction: updated.nextAction! },
  });
  return sessions.find((item) => item.sessionId === options.sessionId)!;
}

export async function presentUatV2(options: { change: string; projectRoot?: string; now?: string }) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const existing = current.projection.assurance.uatScenarios;
  const scenarios = existing.length ? existing : projectUatScenarios({
    coverage: current.projection.assurance.scenarioCoverage,
    findings: current.projection.assurance.findings,
    taskIdsByScenario: Object.fromEntries(current.projection.run.tasks.flatMap((task) =>
      task.scenarioRefs.map((scenarioId) => [scenarioId, [task.taskId]]))),
    sourceRevision: await sourceRevision(current),
  });
  if (!existing.length) {
    for (const scenario of scenarios) await appendGuardrailsEventV2({
      changeDir: current.resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `uat:${scenario.scenarioId}`, runId: current.store.runId, changeName: current.store.changeName,
        occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'host' },
        provenance: { origin: 'guardrails-uat' }, payload: { type: 'uat.scenario_recorded', scenario },
      }),
    });
  }
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled: current.compiled,
  });
  return { next: nextUatScenario(projection.assurance.uatScenarios), scenarios: projection.assurance.uatScenarios };
}

export async function recordUatV2(options: {
  change: string;
  projectRoot?: string;
  scenarioId: string;
  status: 'passed' | 'failed' | 'blocked' | 'accepted_limitation';
  actor: string;
  notes: string;
  evidence?: PortableReferenceV2[];
  now?: string;
}) {
  const current = await currentV2(options);
  const scenario = current.projection.assurance.uatScenarios.find((item) => item.scenarioId === options.scenarioId);
  if (!scenario) throw new Error(`Unknown UAT scenario '${options.scenarioId}'. Run uat first to project applicable scenarios.`);
  const now = options.now ?? new Date().toISOString();
  const evidence = await bindRepositoryEvidenceDigests({
    projectRoot: current.resolved.projectRoot,
    evidence: options.evidence ?? [],
  });
  const currentSourceRevision = await sourceRevision(current, [...(scenario.disposition?.evidence ?? []), ...evidence]);
  const currentScenario = { ...scenario, sourceRevision: currentSourceRevision };
  const result = recordUatDisposition({ ...options, scenario: currentScenario, evidence, now });
  await appendGuardrailsEventV2({
    changeDir: current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `uat-disposition:${options.scenarioId}:${now}`, runId: current.store.runId, changeName: current.store.changeName,
      occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
      provenance: { origin: 'guardrails-uat' }, payload: {
        type: 'uat.disposition_recorded', scenarioId: options.scenarioId, status: options.status,
        actor: options.actor, notes: options.notes, sourceRevision: currentSourceRevision, evidence,
      },
    }),
  });
  if (result.finding) await appendGuardrailsEventV2({
    changeDir: current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `uat-finding:${result.finding.findingId}`, runId: current.store.runId, changeName: current.store.changeName,
      occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
      provenance: { origin: 'guardrails-uat' }, payload: { type: 'finding.discovered', finding: result.finding },
    }),
  });
  if (result.acceptedRisk) {
    const transition = result.acceptedRisk.transitions.at(-1)!;
    await appendGuardrailsEventV2({
      changeDir: current.resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `uat-accepted-risk:${result.acceptedRisk.findingId}`, runId: current.store.runId, changeName: current.store.changeName,
        occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
        provenance: { origin: 'guardrails-uat' }, payload: { type: 'finding.discovered', finding: {
          ...result.acceptedRisk, state: 'open', transitions: [result.acceptedRisk.transitions[0]],
        } },
      }),
    });
    await appendGuardrailsEventV2({
      changeDir: current.resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `uat-accepted-risk-transition:${result.acceptedRisk.findingId}`, runId: current.store.runId, changeName: current.store.changeName,
        occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
        provenance: { origin: 'guardrails-uat' }, payload: { type: 'finding.transitioned', findingId: result.acceptedRisk.findingId, transition },
      }),
    });
  }
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled: current.compiled,
  });
  return { scenario: projection.assurance.uatScenarios.find((item) => item.scenarioId === options.scenarioId)!, next: nextUatScenario(projection.assurance.uatScenarios) };
}

/** Record the durable core gate acceptance and mirror its audit binding in the
 * v2 event history. This intentionally does not close UAT or lifecycle
 * obligations: their individual dispositions remain independently blocking. */
export async function acceptGuardrailsGateV2(options: {
  change: string;
  projectRoot?: string;
  gateId: string;
  actor: string;
  eventId?: string;
  occurredAt?: string;
}) {
  const current = await currentV2(options);
  const acceptedAt = options.occurredAt ?? new Date().toISOString();
  await acceptRequiredGate(current.resolved.changeDir, options.gateId, {
    actor: options.actor,
    acceptedAt,
  });
  const gateRecord = await readRequiredGateRecord(current.resolved.changeDir);
  const gate = gateRecord.gates.find((item) => item.gateId === options.gateId);
  if (!gate?.acceptance) throw new Error(`Gate '${options.gateId}' acceptance was not recorded.`);
  const event = createGuardrailsEventV2({
    eventId: options.eventId ?? `gate-accept:${options.gateId}:${acceptedAt}`,
    runId: current.store.runId,
    changeName: current.store.changeName,
    occurredAt: acceptedAt,
    sourceDigests: sources(current.compiled),
    actor: { kind: 'human', id: options.actor },
    provenance: { origin: 'tier0-cli-accept' },
    payload: {
      type: 'human.decision',
      gateId: options.gateId,
      decision: 'accepted',
      resultDigest: gate.acceptance.resultDigest,
      evidenceDigest: gate.acceptance.evidenceDigest,
    },
  });
  const appended = await appendGuardrailsEventV2({ changeDir: current.resolved.changeDir, event });
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir,
    store: await readEventStoreV2(current.resolved.changeDir),
    compiled: current.compiled,
  });
  return {
    accepted: true,
    appended: appended.appended,
    eventId: event.eventId,
    eventType: event.payload.type,
    runId: event.runId,
    changeName: event.changeName,
    projectionRepaired: true,
    nextAction: nextAction(projection.run.tasks),
  };
}

function nextAction(tasks: Awaited<ReturnType<typeof currentV2>>['projection']['run']['tasks']) {
  const complete = new Set(tasks.filter((task) => task.status === 'complete').map((task) => task.taskId));
  const blocked = new Set(tasks.filter((task) => task.status === 'blocked').map((task) => task.taskId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) if (!blocked.has(task.taskId) && task.dependencies.some((dependency) => blocked.has(dependency))) {
      blocked.add(task.taskId);
      changed = true;
    }
  }
  const next = tasks.find((task) => task.status !== 'complete' && !blocked.has(task.taskId) &&
    task.dependencies.every((dependency) => complete.has(dependency)));
  return { ...(next ? { taskId: next.taskId } : {}), blockedTaskIds: [...blocked].sort(),
    complete: tasks.every((task) => task.status === 'complete') };
}

async function updateTaskCheckbox(changeDir: string, taskId: string, complete: boolean): Promise<void> {
  const filename = path.join(changeDir, 'tasks.md');
  const input = await fs.readFile(filename, 'utf8');
  const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(\\s*-\\s*\\[)[ xX](\\]\\s+${escaped}\\s+)`, 'm');
  if (!pattern.test(input)) throw new Error(`Task '${taskId}' is not an explicitly identified checklist item.`);
  await atomicWriteText(filename, input.replace(pattern, `$1${complete ? 'x' : ' '}$2`));
}

export type WorkflowStageV2 = 'automation' | 'executor' | 'reviewer' | 'verifier' | 'host';

function validateWorkflowResultProvenance(stage: WorkflowStageV2, payload: GuardrailsEventPayloadV1): void {
  if (payload.type === 'human.decision') {
    throw new Error('Human decisions require a dedicated human action.');
  }
  if (payload.type === 'evidence.recorded') {
    const expected = stage === 'automation' ? 'automated' : stage;
    if (!['automation', 'executor', 'reviewer', 'verifier'].includes(stage) || payload.evidence.origin !== expected) {
      throw new Error(`Evidence origin '${payload.evidence.origin}' does not match orchestrated ${stage} stage.`);
    }
  }
  if (payload.type === 'finding.recorded' &&
      (!['reviewer', 'verifier'].includes(stage) || payload.finding.origin !== stage)) {
    throw new Error(`Finding origin '${payload.finding.origin}' does not match orchestrated ${stage} stage.`);
  }
}

export async function recordWorkflowResultV2(options: {
  change: string;
  projectRoot?: string;
  eventId: string;
  occurredAt?: string;
  stage: WorkflowStageV2;
  actorId?: string;
  payload: GuardrailsEventPayloadV1;
}) {
  const current = await currentV2(options);
  const payload = GuardrailsEventPayloadV1Schema.parse(options.payload);
  validateWorkflowResultProvenance(options.stage, payload);
  const task = payload.type === 'task.transition' ? current.projection.run.tasks.find((item) => item.taskId === payload.taskId)
    : payload.type === 'evidence.recorded' && payload.evidence.taskId
      ? current.projection.run.tasks.find((item) => item.taskId === payload.evidence.taskId)
      : undefined;
  if (payload.type === 'task.transition' && !task) throw new Error('Recording references an unknown current OpenSpec task.');
  if (payload.type === 'task.transition' && payload.status !== 'blocked' && task!.dependencies.some((dependency) =>
    current.projection.run.tasks.find((item) => item.taskId === dependency)?.status !== 'complete')) {
    throw new Error(`Task '${task!.taskId}' has incomplete dependencies.`);
  }
  if (payload.type === 'evidence.recorded') {
    if (!payload.evidence.sourceDigests || Object.entries(payload.evidence.sourceDigests).some(
      ([artifact, value]) => sources(current.compiled)[artifact] !== value)) {
      throw new Error('Evidence must bind current controlling OpenSpec source digests.');
    }
  }
  const now = options.occurredAt ?? new Date().toISOString();
  const appended = await appendGuardrailsEventV2({
    changeDir: current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: options.eventId, runId: current.store.runId, changeName: current.store.changeName, occurredAt: now,
      sourceDigests: sources(current.compiled),
      actor: { kind: options.stage, ...(options.actorId ? { id: options.actorId } : {}) },
      provenance: { origin: `guardrails-${options.stage}-result` },
      payload,
    }),
  });
  if (payload.type === 'task.transition' && ['complete', 'pending'].includes(payload.status)) {
    await updateTaskCheckbox(current.resolved.changeDir, payload.taskId, payload.status === 'complete');
  }
  if (payload.type === 'repair.recorded' && payload.repair.result === 'fail' &&
      payload.repair.attempt >= current.store.seed.config.repairLimit) {
    const now = options.occurredAt ?? new Date().toISOString();
    if (current.store.seed.config.features.debug.enabled && current.store.seed.config.features.debug.automaticTransition) {
      const session = debugSessionForRepairExhaustion({
        logicalFailureId: `check:${payload.repair.checkId}`,
        references: [payload.repair.checkId, ...payload.repair.changedReferences],
        failedEvidence: [{
          referenceId: `repair:${payload.repair.repairId}`,
          kind: 'generated', externalId: payload.repair.repairId, available: true,
        }],
        repairAttempts: [...current.projection.assurance.repairs, payload.repair],
        limit: current.store.seed.config.repairLimit,
        existing: current.projection.assurance.debugSessions,
        now,
      });
      await appendGuardrailsEventV2({
        changeDir: current.resolved.changeDir,
        event: createGuardrailsEventV2({
          eventId: `repair-exhausted-debug:${session.sessionId}`,
          runId: current.store.runId, changeName: current.store.changeName, occurredAt: now,
          sourceDigests: sources(current.compiled), actor: { kind: 'automation' },
          provenance: { origin: 'bounded-repair' }, payload: { type: 'debug.session_started', session },
        }),
      });
    } else {
      await appendGuardrailsEventV2({
        changeDir: current.resolved.changeDir,
        event: createGuardrailsEventV2({
          eventId: `repair-exhausted-human:${payload.repair.checkId}:${payload.repair.attempt}`,
          runId: current.store.runId, changeName: current.store.changeName, occurredAt: now,
          sourceDigests: sources(current.compiled), actor: { kind: 'host' },
          provenance: { origin: 'bounded-repair' }, payload: {
            type: 'human.disposition_recorded', subjectId: `check:${payload.repair.checkId}`,
            disposition: 'human_needed', actor: 'guardrails',
            reason: 'Repair is exhausted and no safe automatic debugging capability is enabled.',
            scope: 'bounded repair',
          },
        }),
      });
    }
  }
  const refreshed = await loadCanonicalGuardrailsState(current.resolved.changeDir);
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir, store: refreshed.store, compiled: refreshed.compiled,
  });
  return {
    accepted: true, appended: appended.appended, eventId: options.eventId, eventType: payload.type,
    runId: current.store.runId, changeName: current.store.changeName, projectionRepaired: true,
    nextAction: nextAction(projection.run.tasks),
  };
}
