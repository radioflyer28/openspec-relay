import { compileOpenSpecChange } from './artifacts.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  appendGuardrailsEventV2,
  createGuardrailsEventV2,
  readEventStoreV2,
  readOrMigrateEventStoreV2,
  replayGuardrailsEventsV2,
  writeReplayedProjectionsV2,
} from './events.js';
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
  const store = await readOrMigrateEventStoreV2(resolved.changeDir);
  const compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: store.seed.config.taskOverrides });
  return { resolved, store, compiled, projection: replayGuardrailsEventsV2({ store, compiled }) };
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
export async function transitionFindingV2(options: {
  change: string;
  projectRoot?: string;
  findingId: string;
  to: FindingStateV2;
  actor: FindingTransitionV2['actor'];
  reason: string;
  evidence?: PortableReferenceV2[];
  expiry?: string;
  followUp?: string;
  now?: string;
}) {
  const current = await currentV2(options);
  const finding = current.projection.assurance.findings.find((item) => item.findingId === options.findingId);
  if (!finding) throw new Error(`Unknown finding '${options.findingId}'. Record or reconcile it before transitioning.`);
  const now = options.now ?? new Date().toISOString();
  const evidence = await bindRepositoryEvidenceDigests({
    projectRoot: current.resolved.projectRoot,
    evidence: options.evidence ?? [],
  });
  const updated = transitionFinding({
    finding,
    to: options.to,
    actor: options.actor,
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
      actor: options.actor,
      provenance: { origin: 'tier0-finding-lifecycle' },
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
        actor: options.actor,
        provenance: { origin: 'tier0-finding-lifecycle' },
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
  change: string; projectRoot?: string; sessionId: string; regressionEvidence: PortableReferenceV2[];
  verifier: { kind: 'verifier' | 'human'; id: string };
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
  const equivalentCheckEvent = !finding && checkId
    ? [...current.store.events].reverse().find((event) => event.payload.type === 'evidence.recorded' &&
      event.payload.evidence.checkId === checkId && event.payload.evidence.result === 'pass' &&
      event.payload.evidence.origin === options.verifier.kind && event.actor.kind === options.verifier.kind &&
      event.actor.id === options.verifier.id && Date.parse(event.occurredAt) >= Date.parse(session.startedAt) &&
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
    if (repairingActors.has(options.verifier.id)) {
      throw new Error('Debug resolution verifier must be distinct from the executor who repaired the finding.');
    }
  }
  let regressionEvidence = await bindRepositoryEvidenceDigests({
    projectRoot: current.resolved.projectRoot,
    evidence: options.regressionEvidence,
  });
  if (options.exemption && regressionEvidence.length === 0) regressionEvidence = [{
    referenceId: `debug-exemption:${digestJson(options.exemption).slice(0, 24)}`,
    kind: 'generated',
    externalId: options.exemption.acceptedBy,
    digest: digestJson(options.exemption),
    available: true,
  }];
  if (!options.exemption && regressionEvidence.length < 2) {
    throw new Error('Debug resolution requires distinct fail-before and pass-after regression evidence.');
  }
  if (!options.exemption && regressionEvidence.some((item) => !item.available || !item.digest)) {
    throw new Error('Debug resolution requires current digest-bound regression evidence.');
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
      sessionId: session.sessionId, ...verifiedSubject, verifier: options.verifier, revision,
      evidence: verificationEvidence.map((item) => [item.referenceId, item.digest]),
    }).slice(0, 24)}`,
    ...verifiedSubject,
    verifier: options.verifier,
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
    actor: options.verifier,
    payload: { type: 'debug.verification_recorded', sessionId: options.sessionId, verification },
  });
  const refreshed = await currentV2(options);
  const resolutionAt = new Date(Date.parse(now) + 1).toISOString();
  const sessions = await appendDebugEvent({ current: refreshed, now: resolutionAt,
    eventId: `debug-resolved:${options.sessionId}:${verification.verificationId}`,
    actor: options.verifier,
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

export async function recordLegacyPayloadV2(options: {
  change: string;
  projectRoot?: string;
  eventId: string;
  occurredAt?: string;
  actor?: { kind: 'automation' | 'executor' | 'reviewer' | 'verifier' | 'human' | 'host'; id?: string };
  provenance?: { origin: string; adapter?: string; command?: string };
  payload: GuardrailsEventPayloadV1;
}) {
  const current = await currentV2(options);
  const payload = GuardrailsEventPayloadV1Schema.parse(options.payload);
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
      actor: options.actor ?? { kind: 'host' }, provenance: options.provenance ?? { origin: 'tier0-cli' },
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
  const compiled = await compileOpenSpecChange({
    changeDir: current.resolved.changeDir, taskMetadata: current.store.seed.config.taskOverrides,
  });
  const projection = await writeReplayedProjectionsV2({
    changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled,
  });
  return {
    accepted: true, appended: appended.appended, eventId: options.eventId, eventType: payload.type,
    runId: current.store.runId, changeName: current.store.changeName, projectionRepaired: true,
    nextAction: nextAction(projection.run.tasks),
  };
}
