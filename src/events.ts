import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { materializeCompiledTasks } from './reconciliation.js';
import {
  GuardrailsAssuranceV1Schema,
  GuardrailsEventEnvelopeV1Schema,
  GuardrailsEventPayloadV1Schema,
  GuardrailsEventStoreV1Schema,
  GuardrailsRunV1Schema,
  type GuardrailsAssuranceV1,
  type GuardrailsEventEnvelopeV1,
  type GuardrailsEventPayloadV1,
  type GuardrailsEventStoreV1,
  type GuardrailsRunV1,
} from './schemas.js';
import {
  assuranceStatePath,
  atomicWriteJson,
  digestJson,
  guardrailsDirectory,
  readAssuranceState,
  readRunState,
  runStatePath,
} from './state.js';

export function eventStorePath(changeDir: string): string {
  return path.join(guardrailsDirectory(changeDir), 'events.json');
}

function artifactDigests(run: GuardrailsRunV1): Record<string, string> {
  return Object.fromEntries(run.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}

export function createGuardrailsEvent(options: {
  eventId: string;
  runId: string;
  changeName: string;
  occurredAt: string;
  sourceDigests: Record<string, string>;
  actor: GuardrailsEventEnvelopeV1['actor'];
  provenance: GuardrailsEventEnvelopeV1['provenance'];
  payload: GuardrailsEventPayloadV1;
}): GuardrailsEventEnvelopeV1 {
  const payload = GuardrailsEventPayloadV1Schema.parse(options.payload);
  return GuardrailsEventEnvelopeV1Schema.parse({
    version: 1,
    ...options,
    payload,
    payloadDigest: digestJson(payload),
  });
}

function validateStore(value: unknown): GuardrailsEventStoreV1 {
  const store = GuardrailsEventStoreV1Schema.parse(value);
  for (const event of store.events) {
    if (event.runId !== store.runId || event.changeName !== store.changeName) {
      throw new Error(`Event '${event.eventId}' does not belong to event store '${store.runId}'.`);
    }
    if (event.payloadDigest !== digestJson(event.payload)) {
      throw new Error(`Event '${event.eventId}' has a conflicting payload digest.`);
    }
  }
  return store;
}

export async function readEventStore(changeDir: string): Promise<GuardrailsEventStoreV1> {
  return validateStore(JSON.parse(await fs.readFile(eventStorePath(changeDir), 'utf8')));
}

export async function appendGuardrailsEvent(options: {
  changeDir: string;
  event: GuardrailsEventEnvelopeV1;
  rename?: typeof fs.rename;
}): Promise<{ store: GuardrailsEventStoreV1; appended: boolean }> {
  const store = await readEventStore(options.changeDir);
  const event = GuardrailsEventEnvelopeV1Schema.parse(options.event);
  if (event.payloadDigest !== digestJson(event.payload)) {
    throw new Error(`Event '${event.eventId}' payload digest does not match its payload.`);
  }
  const existing = store.events.find((candidate) => candidate.eventId === event.eventId);
  if (existing) {
    if (digestJson(existing) !== digestJson(event)) {
      throw new Error(`Event ID '${event.eventId}' already exists with conflicting content.`);
    }
    return { store, appended: false };
  }
  if (event.runId !== store.runId || event.changeName !== store.changeName) {
    throw new Error(`Event '${event.eventId}' targets a different run or change.`);
  }
  const next = validateStore({
    ...store,
    events: [...store.events, event].sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId)),
  });
  await atomicWriteJson(eventStorePath(options.changeDir), next,
    options.rename ? { rename: options.rename } : {});
  return { store: next, appended: true };
}

function migratedEvent(
  run: GuardrailsRunV1,
  eventId: string,
  occurredAt: string,
  payload: GuardrailsEventPayloadV1,
  actor: GuardrailsEventEnvelopeV1['actor'],
): GuardrailsEventEnvelopeV1 {
  return createGuardrailsEvent({
    eventId,
    runId: run.runId,
    changeName: run.changeName,
    occurredAt,
    sourceDigests: artifactDigests(run),
    actor,
    provenance: { origin: 'v1-projection-migration' },
    payload,
  });
}

export async function migrateV1ProjectionsToEventStore(
  changeDir: string,
): Promise<GuardrailsEventStoreV1> {
  try {
    return await readEventStore(changeDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const run = await readRunState(changeDir);
  const assurance = await readAssuranceState(changeDir);
  const events: GuardrailsEventEnvelopeV1[] = [];
  for (const task of run.tasks.filter((item) => item.status === 'in_progress' || item.status === 'blocked')) {
    events.push(migratedEvent(run, `migration:task:${task.taskId}`, run.updatedAt, {
      type: 'task.transition', taskId: task.taskId, status: task.status,
    }, { kind: 'host' }));
  }
  for (const item of assurance.evidence) {
    events.push(migratedEvent(run, `migration:evidence:${item.evidenceId}`, item.observedAt, {
      type: 'evidence.recorded', evidence: item,
    }, { kind: item.origin === 'automated' ? 'automation' : item.origin }));
  }
  for (const item of assurance.findings) {
    events.push(migratedEvent(run, `migration:finding:${item.findingId}`, assurance.updatedAt, {
      type: 'finding.recorded', finding: item,
    }, { kind: item.origin }));
  }
  for (const item of run.deviations) {
    events.push(migratedEvent(run, `migration:deviation:${item.deviationId}`, item.recordedAt, {
      type: 'deviation.recorded', deviation: item,
    }, { kind: 'host' }));
  }
  for (const item of assurance.repairs) {
    events.push(migratedEvent(run, `migration:repair:${item.repairId}`, item.startedAt, {
      type: 'repair.recorded', repair: item,
    }, { kind: 'host' }));
  }
  assurance.unresolvedHumanActions.forEach((reason, index) => {
    events.push(migratedEvent(run, `migration:human:${index + 1}`, assurance.updatedAt, {
      type: 'human.decision', gateId: run.gateIds[0] ?? 'guardrails.assurance',
      decision: 'requested', reason,
    }, { kind: 'human' }));
  });
  const store = validateStore({
    version: 1,
    owner: 'openspec-guardrails',
    runId: run.runId,
    changeName: run.changeName,
    createdAt: run.startedAt,
    seed: {
      changeRef: run.changeRef,
      mode: run.mode,
      tier: run.tier,
      status: run.status,
      startedAt: run.startedAt,
      gateIds: run.gateIds,
      config: run.config,
      checks: assurance.checks,
      scenarioCoverage: assurance.scenarioCoverage,
    },
    events: events.sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId)),
  });
  await atomicWriteJson(eventStorePath(changeDir), store);
  return store;
}

export function replayGuardrailsEvents(options: {
  store: GuardrailsEventStoreV1;
  compiled: CompiledOpenSpecChangeV1;
}): { run: GuardrailsRunV1; assurance: GuardrailsAssuranceV1 } {
  const store = validateStore(options.store);
  const tasks = materializeCompiledTasks(options.compiled, store.seed.config);
  const byTask = new Map(tasks.map((task) => [task.taskId, task]));
  const evidence: GuardrailsAssuranceV1['evidence'] = [];
  const findings: GuardrailsAssuranceV1['findings'] = [];
  const deviations: GuardrailsRunV1['deviations'] = [];
  const repairs: GuardrailsAssuranceV1['repairs'] = [];
  const unresolvedHumanActions: string[] = [];
  for (const event of store.events) {
    const payload = event.payload;
    if (payload.type === 'task.transition') {
      const current = byTask.get(payload.taskId);
      if (current && current.status !== 'complete' && payload.status !== 'complete') {
        byTask.set(payload.taskId, {
          ...current,
          status: payload.status,
          ...(payload.status === 'in_progress' && !current.implementationStartedAt
            ? { implementationStartedAt: event.occurredAt }
            : {}),
        });
      }
    } else if (payload.type === 'evidence.recorded') evidence.push(payload.evidence);
    else if (payload.type === 'finding.recorded') findings.push(payload.finding);
    else if (payload.type === 'deviation.recorded') deviations.push(payload.deviation);
    else if (payload.type === 'repair.recorded') repairs.push(payload.repair);
    else if (payload.type === 'human.decision') {
      const label = payload.reason ?? `${payload.gateId}: human ${payload.decision}`;
      if (payload.decision === 'requested') unresolvedHumanActions.push(label);
      if (payload.decision === 'accepted' || payload.decision === 'rejected') {
        const index = unresolvedHumanActions.findIndex((item) => item.includes(payload.gateId));
        if (index >= 0) unresolvedHumanActions.splice(index, 1);
      }
    }
  }
  const updatedAt = store.events.at(-1)?.occurredAt ?? store.createdAt;
  const currentDigests = new Map(options.compiled.artifacts
    .map((artifact) => [artifact.path, artifact.sourceDigest]));
  const staleEvidenceIds = evidence.filter((item) => {
    const task = item.taskId ? byTask.get(item.taskId) : undefined;
    if (item.taskId && (!task || task.idStability !== 'explicit')) return true;
    return Object.entries(item.sourceDigests ?? {}).some(
      ([artifactPath, digest]) => currentDigests.get(artifactPath) !== digest,
    );
  }).map((item) => item.evidenceId).sort();
  const run = GuardrailsRunV1Schema.parse({
    version: 1,
    runId: store.runId,
    changeName: store.changeName,
    changeRef: store.seed.changeRef,
    mode: store.seed.mode,
    tier: store.seed.tier,
    status: store.seed.status,
    startedAt: store.seed.startedAt,
    updatedAt,
    artifacts: options.compiled.artifacts,
    tasks: [...byTask.values()],
    executionWaves: options.compiled.graph.waves,
    gateIds: store.seed.gateIds,
    deviations,
    repairIds: repairs.map((repair) => repair.repairId),
    config: store.seed.config,
  });
  const assurance = GuardrailsAssuranceV1Schema.parse({
    version: 1,
    runId: store.runId,
    changeName: store.changeName,
    mode: store.seed.mode,
    status: 'pending',
    updatedAt,
    checks: store.seed.checks,
    evidence,
    scenarioCoverage: store.seed.scenarioCoverage,
    repairs,
    findings,
    staleEvidenceIds,
    unresolvedHumanActions,
  });
  return { run, assurance };
}

async function differs(filename: string, expected: unknown): Promise<boolean> {
  try {
    return digestJson(JSON.parse(await fs.readFile(filename, 'utf8'))) !== digestJson(expected);
  } catch {
    return true;
  }
}

export async function writeReplayedProjections(options: {
  changeDir: string;
  store: GuardrailsEventStoreV1;
  compiled: CompiledOpenSpecChangeV1;
  repair?: boolean;
}): Promise<{ run: GuardrailsRunV1; assurance: GuardrailsAssuranceV1; repaired: boolean }> {
  const replayed = replayGuardrailsEvents(options);
  const assuranceDigest = digestJson(replayed.assurance);
  const run = GuardrailsRunV1Schema.parse({ ...replayed.run, assuranceDigest });
  const repaired = await differs(runStatePath(options.changeDir), run) ||
    await differs(assuranceStatePath(options.changeDir), replayed.assurance);
  if (repaired && options.repair === false) {
    throw new Error('Generated Guardrails projections differ from deterministic event replay.');
  }
  if (repaired) {
    await atomicWriteJson(assuranceStatePath(options.changeDir), replayed.assurance);
    await atomicWriteJson(runStatePath(options.changeDir), run);
  }
  return { run, assurance: replayed.assurance, repaired };
}
