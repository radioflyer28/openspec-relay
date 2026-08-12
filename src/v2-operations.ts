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
  recordDebugHypothesis,
  resolveDebugSession,
  startDebugSession,
} from './debug-sessions.js';
import { transitionFinding } from './findings.js';
import { recordUatDisposition, nextUatScenario, projectUatScenarios } from './uat.js';
import { resolveChangeDirectory } from './state.js';
import { atomicWriteText } from './state.js';
import { acceptRequiredGate, readRequiredGateRecord } from '@fission-ai/openspec/extensions';
import {
  GuardrailsEventPayloadV1Schema,
  type FindingStateV2,
  type FindingTransitionV2,
  type GuardrailsEventPayloadV1,
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
  const updated = transitionFinding({
    finding,
    to: options.to,
    actor: options.actor,
    reason: options.reason,
    evidence: options.evidence ?? [],
    sourceRevision: current.projection.run.stateRevision,
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
}) {
  await appendGuardrailsEventV2({
    changeDir: options.current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: options.eventId,
      runId: options.current.store.runId,
      changeName: options.current.store.changeName,
      occurredAt: options.now,
      sourceDigests: sources(options.current.compiled),
      actor: { kind: 'executor' },
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
    targetedEvidence: options.evidence, sourceRevision: current.projection.run.stateRevision, now,
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

export async function resolveDebugSessionV2(options: {
  change: string; projectRoot?: string; sessionId: string; regressionEvidence: PortableReferenceV2[];
  exemption?: { reason: string; acceptedBy: string }; now?: string;
}) {
  const current = await currentV2(options);
  const now = options.now ?? new Date().toISOString();
  const updated = resolveDebugSession({
    session: debugSession(current, options.sessionId), regressionEvidence: options.regressionEvidence, now,
    ...(options.exemption ? { exemption: options.exemption } : {}),
  });
  const sessions = await appendDebugEvent({ current, now,
    eventId: `debug-resolved:${options.sessionId}:${now}`,
    payload: { type: 'debug.session_updated', sessionId: options.sessionId, status: updated.status, nextAction: updated.nextAction },
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
    sourceRevision: current.projection.run.stateRevision,
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
  const result = recordUatDisposition({ ...options, scenario, evidence: options.evidence ?? [], now });
  await appendGuardrailsEventV2({
    changeDir: current.resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `uat-disposition:${options.scenarioId}:${now}`, runId: current.store.runId, changeName: current.store.changeName,
      occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
      provenance: { origin: 'guardrails-uat' }, payload: {
        type: 'uat.disposition_recorded', scenarioId: options.scenarioId, status: options.status,
        actor: options.actor, notes: options.notes, evidence: options.evidence ?? [],
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
