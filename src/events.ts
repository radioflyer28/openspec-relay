import { promises as fs } from 'node:fs';
import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { evaluateFindingObligations } from './findings.js';
import { materializeCompiledTasks } from './reconciliation.js';
import {
  AssuranceCheckV2Schema,
  GuardrailsAssuranceV2Schema,
  GuardrailsAssuranceV1Schema,
  GuardrailsConfigV1Schema,
  GuardrailsConfigV2Schema,
  GuardrailsEventEnvelopeV2Schema,
  GuardrailsEventEnvelopeV1Schema,
  GuardrailsEventPayloadV2Schema,
  GuardrailsEventPayloadV1Schema,
  GuardrailsEventStoreV2Schema,
  GuardrailsEventStoreV1Schema,
  GuardrailsRunV2Schema,
  GuardrailsRunV1Schema,
  type DebugSessionV2,
  type FindingLifecycleRecordV2,
  type GuardrailsAssuranceV2,
  type GuardrailsEventEnvelopeV2,
  type GuardrailsEventPayloadV2,
  type GuardrailsEventStoreV2,
  type GuardrailsRunV2,
  type ReleaseCandidateV2,
  type RepositoryContextV2,
  type ReadinessResultV2,
  type UatScenarioV2,
  type GuardrailsAssuranceV1,
  type GuardrailsEventEnvelopeV1,
  type GuardrailsEventPayloadV1,
  type GuardrailsEventStoreV1,
  type GuardrailsRunV1,
} from './schemas.js';
import {
  assuranceStatePath,
  assertGuardrailsGeneratedPath,
  atomicWriteGuardrailsJson,
  digestJson,
  guardrailsGeneratedPath,
  readGuardrailsText,
  readAssuranceState,
  readRunState,
  runStatePath,
} from './state.js';

export function eventStorePath(changeDir: string): string {
  return guardrailsGeneratedPath(changeDir, 'events');
}

const EVENT_LOCK_TIMEOUT_MS = 10_000;
const EVENT_LOCK_LEASE_MS = 30_000;

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function withEventStoreLock<T>(changeDir: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = guardrailsGeneratedPath(changeDir, 'eventsLock');
  await assertGuardrailsGeneratedPath({ changeDir, filename: lockPath, createParents: true, allowMissingFile: true });
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const started = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify({ token, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`);
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let stale = false;
      try {
        await assertGuardrailsGeneratedPath({ changeDir, filename: lockPath });
        const owner = JSON.parse(await readGuardrailsText(changeDir, lockPath)) as {
          pid?: number; acquiredAt?: string;
        };
        const age = owner.acquiredAt ? Date.now() - Date.parse(owner.acquiredAt) : EVENT_LOCK_LEASE_MS + 1;
        stale = age > EVENT_LOCK_LEASE_MS ||
          (typeof owner.pid === 'number' && !processIsAlive(owner.pid) && age > 1_000);
      } catch {
        const stat = await fs.lstat(lockPath).catch(() => undefined);
        stale = Boolean(stat && Date.now() - stat.mtimeMs > EVENT_LOCK_LEASE_MS);
      }
      if (stale) {
        const quarantine = `${lockPath}.stale.${process.pid}.${Date.now()}`;
        try {
          await fs.rename(lockPath, quarantine);
          await assertGuardrailsGeneratedPath({ changeDir, filename: quarantine });
          await fs.rm(quarantine, { force: true });
        } catch (staleError) {
          if (!['ENOENT', 'EEXIST'].includes((staleError as NodeJS.ErrnoException).code ?? '')) throw staleError;
        }
        continue;
      }
      if (Date.now() - started >= EVENT_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for the canonical Guardrails event-store lock '${lockPath}'.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.floor(Math.random() * 20)));
    }
  }
  try {
    return await operation();
  } finally {
    try {
      const owner = JSON.parse(await readGuardrailsText(changeDir, lockPath)) as { token?: string };
      if (owner.token === token) {
        const quarantine = `${lockPath}.release.${process.pid}.${Date.now()}`;
        await fs.rename(lockPath, quarantine);
        await assertGuardrailsGeneratedPath({ changeDir, filename: quarantine });
        await fs.rm(quarantine, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
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
  return validateStore(JSON.parse(await readGuardrailsText(changeDir, eventStorePath(changeDir))));
}

export async function appendGuardrailsEvent(options: {
  changeDir: string;
  event: GuardrailsEventEnvelopeV1;
  rename?: typeof fs.rename;
}): Promise<{ store: GuardrailsEventStoreV1; appended: boolean }> {
  const event = GuardrailsEventEnvelopeV1Schema.parse(options.event);
  if (event.payloadDigest !== digestJson(event.payload)) {
    throw new Error(`Event '${event.eventId}' payload digest does not match its payload.`);
  }
  return withEventStoreLock(options.changeDir, async () => {
    const store = await readEventStore(options.changeDir);
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
    await atomicWriteGuardrailsJson(options.changeDir, eventStorePath(options.changeDir), next,
      options.rename ? { rename: options.rename } : {});
    const committed = await readEventStore(options.changeDir);
    if (!committed.events.some((candidate) => candidate.eventId === event.eventId && digestJson(candidate) === digestJson(event))) {
      throw new Error(`Canonical event '${event.eventId}' was not present after commit.`);
    }
    return { store: committed, appended: true };
  });
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
  await atomicWriteGuardrailsJson(changeDir, eventStorePath(changeDir), store);
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

async function differs(changeDir: string, filename: string, expected: unknown): Promise<boolean> {
  try {
    return digestJson(JSON.parse(await readGuardrailsText(changeDir, filename))) !== digestJson(expected);
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
  const repaired = await differs(options.changeDir, runStatePath(options.changeDir), run) ||
    await differs(options.changeDir, assuranceStatePath(options.changeDir), replayed.assurance);
  if (repaired && options.repair === false) {
    throw new Error('Generated Guardrails projections differ from deterministic event replay.');
  }
  if (repaired) {
    await atomicWriteGuardrailsJson(options.changeDir, assuranceStatePath(options.changeDir), replayed.assurance);
    await atomicWriteGuardrailsJson(options.changeDir, runStatePath(options.changeDir), run);
  }
  return { run, assurance: replayed.assurance, repaired };
}

export interface MigrationPreviewV2 {
  status: 'ready' | 'not_needed' | 'blocked';
  needsMigration: boolean;
  diagnostics: string[];
  sourceDigest?: string;
  recoveryPath?: string;
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

/**
 * Read the current v2 history, migrating a valid v1 generated state only when a
 * caller needs to mutate or project v2 state. A corrupt v2 store is never
 * treated as v1: that would risk replacing the only recovery evidence.
 */
export async function readOrMigrateEventStoreV2(changeDir: string): Promise<GuardrailsEventStoreV2> {
  try {
    return await readEventStoreV2(changeDir);
  } catch (error) {
    const raw = await rawEventStore(changeDir);
    if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === 2) throw error;
    return migrateV1ToV2EventStore(changeDir);
  }
}

export async function appendGuardrailsEventV2(options: {
  changeDir: string;
  event: GuardrailsEventEnvelopeV2;
  rename?: typeof fs.rename;
}): Promise<{ store: GuardrailsEventStoreV2; appended: boolean }> {
  const event = GuardrailsEventEnvelopeV2Schema.parse(options.event);
  if (event.payloadDigest !== digestJson(event.payload)) {
    throw new Error(`Event '${event.eventId}' payload digest does not match its payload.`);
  }
  return withEventStoreLock(options.changeDir, async () => {
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
    const next = eventStoreV2({
      ...store,
      events: [...store.events, event].sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId)),
    });
    await atomicWriteGuardrailsJson(options.changeDir, eventStorePath(options.changeDir), next,
      options.rename ? { rename: options.rename } : {});
    const committed = await readEventStoreV2(options.changeDir);
    if (!committed.events.some((candidate) => candidate.eventId === event.eventId && digestJson(candidate) === digestJson(event))) {
      throw new Error(`Canonical event '${event.eventId}' was not present after commit.`);
    }
    return { store: committed, appended: true };
  });
}

async function rawEventStore(changeDir: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readGuardrailsText(changeDir, eventStorePath(changeDir)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function previewV1ToV2Migration(changeDir: string): Promise<MigrationPreviewV2> {
  try {
    const raw = await rawEventStore(changeDir);
    if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === 2) {
      eventStoreV2(raw);
      return { status: 'not_needed', needsMigration: false, diagnostics: [] };
    }
    if (raw) validateStore(raw);
    const run = await readRunState(changeDir);
    const assurance = await readAssuranceState(changeDir);
    const sourceDigest = digestJson({ raw: raw ?? null, run, assurance });
    return {
      status: 'ready',
      needsMigration: true,
      diagnostics: [],
      sourceDigest,
      recoveryPath: guardrailsGeneratedPath(changeDir, 'v1MigrationBackup'),
    };
  } catch (error) {
    return {
      status: 'blocked',
      needsMigration: false,
      diagnostics: [`Cannot safely migrate version 1 Guardrails state: ${(error as Error).message}`],
    };
  }
}

function v2Config(run: GuardrailsRunV1) {
  return GuardrailsConfigV2Schema.parse({ ...GuardrailsConfigV1Schema.parse(run.config), version: 2 });
}

function v1EventAsV2(event: GuardrailsEventEnvelopeV1): GuardrailsEventEnvelopeV2 {
  return createGuardrailsEventV2({
    eventId: `v1:${event.eventId}`,
    runId: event.runId,
    changeName: event.changeName,
    occurredAt: event.occurredAt,
    sourceDigests: event.sourceDigests,
    actor: event.actor,
    provenance: { ...event.provenance, origin: `v1-migration:${event.provenance.origin}` },
    payload: GuardrailsEventPayloadV2Schema.parse(event.payload),
  });
}

function v1ProjectionEvents(options: {
  run: GuardrailsRunV1;
  assurance: GuardrailsAssuranceV1;
  store: GuardrailsEventStoreV1;
}): GuardrailsEventEnvelopeV2[] {
  const sourceDigests = artifactDigests(options.run);
  const events = options.store.events.map(v1EventAsV2);
  const seenEvidence = new Set(options.store.events.flatMap((event) =>
    event.payload.type === 'evidence.recorded' ? [event.payload.evidence.evidenceId] : []));
  const seenFindings = new Set(options.store.events.flatMap((event) =>
    event.payload.type === 'finding.recorded' ? [event.payload.finding.findingId] : []));
  const seenRepairs = new Set(options.store.events.flatMap((event) =>
    event.payload.type === 'repair.recorded' ? [event.payload.repair.repairId] : []));
  const seenDeviations = new Set(options.store.events.flatMap((event) =>
    event.payload.type === 'deviation.recorded' ? [event.payload.deviation.deviationId] : []));
  const supplement = (eventId: string, occurredAt: string, payload: GuardrailsEventPayloadV2) =>
    events.push(createGuardrailsEventV2({
      eventId,
      runId: options.run.runId,
      changeName: options.run.changeName,
      occurredAt,
      sourceDigests,
      actor: { kind: 'host' },
      provenance: { origin: 'v1-projection-supplement' },
      payload,
    }));

  for (const item of options.assurance.evidence) {
    if (!seenEvidence.has(item.evidenceId)) supplement(
      `v1:projection:evidence:${item.evidenceId}`, item.observedAt,
      { type: 'evidence.recorded', evidence: item },
    );
  }
  for (const item of options.assurance.findings) {
    if (!seenFindings.has(item.findingId)) supplement(
      `v1:projection:finding:${item.findingId}`, options.assurance.updatedAt,
      { type: 'finding.recorded', finding: item },
    );
  }
  for (const item of options.assurance.repairs) {
    if (!seenRepairs.has(item.repairId)) supplement(
      `v1:projection:repair:${item.repairId}`, item.startedAt,
      { type: 'repair.recorded', repair: item },
    );
  }
  for (const item of options.run.deviations) {
    if (!seenDeviations.has(item.deviationId)) supplement(
      `v1:projection:deviation:${item.deviationId}`, item.recordedAt,
      { type: 'deviation.recorded', deviation: item },
    );
  }
  for (const item of options.assurance.scenarioCoverage.filter((coverage) =>
    coverage.status === 'human_needed' && coverage.acceptanceInstructions)) {
    supplement(`v1:projection:uat:${item.scenarioId}`, options.assurance.updatedAt, {
      type: 'uat.scenario_recorded',
      scenario: {
        scenarioId: item.scenarioId,
        requirementId: item.requirementId,
        taskIds: [],
        prerequisites: [],
        action: item.acceptanceInstructions!,
        expectedResult: 'Confirm the declared OpenSpec scenario outcome.',
        status: 'awaiting_human',
        sourceRevision: digestJson(sourceDigests),
      },
    });
  }
  return events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) ||
    left.eventId.localeCompare(right.eventId));
}

function findingFromV1(
  finding: GuardrailsAssuranceV1['findings'][number],
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

function v1RecordFromMigration(payload: GuardrailsEventPayloadV2): GuardrailsEventPayloadV1 | undefined {
  if (payload.type !== 'v1.migrated') return undefined;
  const record = payload.record;
  if (payload.sourceKind === 'evidence') {
    const parsed = GuardrailsEventPayloadV1Schema.safeParse({ type: 'evidence.recorded', evidence: record });
    return parsed.success ? parsed.data : undefined;
  }
  if (payload.sourceKind === 'finding') {
    const parsed = GuardrailsEventPayloadV1Schema.safeParse({ type: 'finding.recorded', finding: record });
    return parsed.success ? parsed.data : undefined;
  }
  if (payload.sourceKind === 'repair') {
    const parsed = GuardrailsEventPayloadV1Schema.safeParse({ type: 'repair.recorded', repair: record });
    return parsed.success ? parsed.data : undefined;
  }
  if (payload.sourceKind === 'deviation') {
    const parsed = GuardrailsEventPayloadV1Schema.safeParse({ type: 'deviation.recorded', deviation: record });
    return parsed.success ? parsed.data : undefined;
  }
  return undefined;
}

function assuranceStatusV2(options: {
  checks: GuardrailsAssuranceV2['checks'];
  findings: FindingLifecycleRecordV2[];
  uatScenarios: UatScenarioV2[];
  releaseCandidates: ReleaseCandidateV2[];
}): GuardrailsAssuranceV2['status'] {
  if (options.checks.some((check) => check.status === 'error') ||
      options.releaseCandidates.some((candidate) => candidate.status === 'error')) return 'error';
  if (options.checks.some((check) => check.status === 'fail') ||
      options.releaseCandidates.some((candidate) => candidate.status === 'fail') ||
      evaluateFindingObligations({ findings: options.findings, scenarios: options.uatScenarios }).blocking.length > 0) return 'fail';
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
      const label = payload.reason ?? `${payload.gateId}: human ${payload.decision}`;
      if (payload.decision === 'requested') humanActions.push(label);
      else {
        const index = humanActions.findIndex((item) => item.includes(payload.gateId));
        if (index >= 0) humanActions.splice(index, 1);
      }
    }
  };

  for (const event of store.events) {
    const payload = event.payload;
    if (payload.type === 'v1.migrated') {
      const legacy = v1RecordFromMigration(payload);
      if (legacy) applyV1Payload(legacy, event);
    } else if (['task.transition', 'evidence.recorded', 'finding.recorded', 'deviation.recorded',
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
    } else if (payload.type === 'debug.session_updated') {
      const session = debugSessions.get(payload.sessionId);
      if (session) debugSessions.set(payload.sessionId, { ...session, status: payload.status,
        ...(payload.nextAction ? { nextAction: payload.nextAction } : {}), updatedAt: event.occurredAt });
    } else if (payload.type === 'uat.scenario_recorded') uatScenarios.set(payload.scenario.scenarioId, payload.scenario);
    else if (payload.type === 'uat.disposition_recorded') {
      const scenario = uatScenarios.get(payload.scenarioId);
      if (scenario) uatScenarios.set(payload.scenarioId, { ...scenario, status: payload.status,
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
  const assurance = GuardrailsAssuranceV2Schema.parse({
    version: 2,
    runId: store.runId,
    changeName: store.changeName,
    mode: store.seed.mode,
    status: assuranceStatusV2({ checks, findings: findingValues, uatScenarios: uatValues, releaseCandidates: releaseValues }),
    updatedAt,
    checks,
    evidence,
    scenarioCoverage: store.seed.scenarioCoverage,
    repairs,
    findings: findingValues,
    staleEvidenceIds,
    unresolvedHumanActions: [...new Set(humanActions)].sort(),
    ...(repositoryContext ? { repositoryContext } : {}),
    ...(readiness ? { readiness } : {}),
    debugSessions: [...debugSessions.values()].sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
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

async function writeV2Reports(changeDir: string, projection: { run: GuardrailsRunV2; assurance: GuardrailsAssuranceV2 }): Promise<void> {
  const report = (kind: string, data: unknown) => ({
    version: 2,
    kind,
    runId: projection.run.runId,
    generatedAt: projection.assurance.updatedAt,
    data,
  });
  await Promise.all([
    atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'repositoryContext'), report('repository-context', projection.assurance.repositoryContext ?? null)),
    atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'readiness'), report('readiness', projection.assurance.readiness ?? null)),
    atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'findings'), report('findings', projection.assurance.findings)),
    atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'debug'), report('debug', projection.assurance.debugSessions)),
    atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'uat'), report('uat', projection.assurance.uatScenarios)),
    atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'release'), report('release', projection.assurance.releaseCandidates)),
  ]);
}

export async function writeReplayedProjectionsV2(options: {
  changeDir: string;
  store: GuardrailsEventStoreV2;
  compiled: CompiledOpenSpecChangeV1;
}): Promise<{ run: GuardrailsRunV2; assurance: GuardrailsAssuranceV2 }> {
  const projection = replayGuardrailsEventsV2(options);
  await atomicWriteGuardrailsJson(options.changeDir, assuranceStatePath(options.changeDir), projection.assurance);
  await atomicWriteGuardrailsJson(options.changeDir, runStatePath(options.changeDir), projection.run);
  await writeV2Reports(options.changeDir, projection);
  return projection;
}

export async function migrateV1ToV2EventStore(changeDir: string): Promise<GuardrailsEventStoreV2> {
  const preview = await previewV1ToV2Migration(changeDir);
  if (preview.status === 'not_needed') return readEventStoreV2(changeDir);
  if (preview.status !== 'ready' || !preview.sourceDigest) {
    throw new Error(preview.diagnostics.join(' ') || 'Version 1 Guardrails state is not safe to migrate.');
  }
  const raw = await rawEventStore(changeDir);
  const legacyStore = raw ? validateStore(raw) : await migrateV1ProjectionsToEventStore(changeDir);
  const run = await readRunState(changeDir);
  const assurance = await readAssuranceState(changeDir);
  const store = eventStoreV2({
    version: 2,
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
      config: v2Config(run),
      checks: assurance.checks.map((check) => AssuranceCheckV2Schema.parse(check)),
      scenarioCoverage: assurance.scenarioCoverage,
      migratedFrom: { version: 1, digest: preview.sourceDigest },
    },
    events: v1ProjectionEvents({ run, assurance, store: legacyStore }),
  });
  const compiled = await import('./artifacts.js').then(({ compileOpenSpecChange }) => compileOpenSpecChange({ changeDir }));
  const projection = replayGuardrailsEventsV2({ store, compiled });
  // Validate every projection before replacing any valid v1 file. The backup is
  // written before the v2 event store so interruption always has a recovery source.
  await atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'v1MigrationBackup'), {
    version: 1,
    sourceDigest: preview.sourceDigest,
    events: raw ?? legacyStore,
    run,
    assurance,
  });
  await atomicWriteGuardrailsJson(changeDir, eventStorePath(changeDir), store);
  await atomicWriteGuardrailsJson(changeDir, assuranceStatePath(changeDir), projection.assurance);
  await atomicWriteGuardrailsJson(changeDir, runStatePath(changeDir), projection.run);
  await writeV2Reports(changeDir, projection);
  await atomicWriteGuardrailsJson(changeDir, guardrailsGeneratedPath(changeDir, 'migrationPreview'), {
    ...preview,
    status: 'not_needed',
    needsMigration: false,
    completedAt: projection.assurance.updatedAt,
  });
  return store;
}

/**
 * Restore the exact v1 records retained before migration. This is deliberately
 * explicit: it is a local downgrade aid for a prior companion version, not a
 * best-effort translation of v2 history back to a state model that cannot
 * represent it. Projections are written before the event-store cutover, so a
 * successful final rename makes the three v1 inputs coherent for the older
 * reader. The recovery backup itself is retained for audit and retry.
 */
export async function restoreV1FromMigrationBackup(changeDir: string): Promise<{
  restored: true;
  runId: string;
  changeName: string;
}> {
  const filename = guardrailsGeneratedPath(changeDir, 'v1MigrationBackup');
  let raw: unknown;
  try {
    raw = JSON.parse(await readGuardrailsText(changeDir, filename));
  } catch (error) {
    throw new Error(`Cannot restore version 1 Guardrails state: ${(error as Error).message}`);
  }
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) {
    throw new Error('Cannot restore version 1 Guardrails state: recovery backup has an invalid version.');
  }
  const backup = raw as { events?: unknown; run?: unknown; assurance?: unknown };
  const events = validateStore(backup.events);
  const assurance = GuardrailsAssuranceV1Schema.parse(backup.assurance);
  const run = GuardrailsRunV1Schema.parse(backup.run);
  if (events.runId !== run.runId || events.changeName !== run.changeName ||
      assurance.runId !== run.runId || assurance.changeName !== run.changeName) {
    throw new Error('Cannot restore version 1 Guardrails state: recovery records belong to different runs or changes.');
  }
  // Write non-authoritative projections first. The v1 event store is the final
  // cutover because it is what both v1 replay and subsequent v1 mutations read.
  await atomicWriteGuardrailsJson(changeDir, assuranceStatePath(changeDir), assurance);
  await atomicWriteGuardrailsJson(changeDir, runStatePath(changeDir), run);
  await atomicWriteGuardrailsJson(changeDir, eventStorePath(changeDir), events);
  return { restored: true, runId: run.runId, changeName: run.changeName };
}
