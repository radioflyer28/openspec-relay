import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  acceptRequiredGate,
  readRequiredGateRecord,
} from '@fission-ai/openspec/extensions';
import { z } from 'zod';
import { assertStableTaskBinding } from './artifacts.js';
import {
  appendGuardrailsEvent,
  createGuardrailsEvent,
  migrateV1ProjectionsToEventStore,
  writeReplayedProjections,
} from './events.js';
import { compileCurrentOpenSpecChange } from './openspec-adapter.js';
import {
  DeviationV1Schema,
  EvidenceV1Schema,
  RepairAttemptV1Schema,
  VerificationFindingV1Schema,
  type GuardrailsEventActorV1Schema,
  type GuardrailsEventPayloadV1,
  type GuardrailsRunV1,
} from './schemas.js';
import { atomicWriteText, resolveChangeDirectory } from './state.js';
import type { z as Zod } from 'zod';

type EventActorV1 = Zod.infer<typeof GuardrailsEventActorV1Schema>;

const MetadataSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  actor: z.object({
    kind: z.enum(['automation', 'executor', 'reviewer', 'verifier', 'human', 'host']),
    id: z.string().min(1).optional(),
  }).strict().optional(),
  provenance: z.object({
    origin: z.string().min(1),
    adapter: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
  }).strict().optional(),
}).strict();

export const EvidenceRecordingRequestV1Schema = MetadataSchema.extend({
  evidence: EvidenceV1Schema,
}).strict();
export const FindingRecordingRequestV1Schema = MetadataSchema.extend({
  finding: VerificationFindingV1Schema,
}).strict();
export const DeviationRecordingRequestV1Schema = MetadataSchema.extend({
  deviation: DeviationV1Schema,
}).strict();
export const RepairRecordingRequestV1Schema = MetadataSchema.extend({
  repair: RepairAttemptV1Schema,
}).strict();

export interface RecordingResultV1 {
  accepted: true;
  appended: boolean;
  eventId: string;
  eventType: GuardrailsEventPayloadV1['type'];
  runId: string;
  changeName: string;
  projectionRepaired: boolean;
  nextAction: { taskId?: string; blockedTaskIds: string[]; complete: boolean };
}

function sourceDigests(run: GuardrailsRunV1): Record<string, string> {
  return Object.fromEntries(run.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}

function actorFor(payload: GuardrailsEventPayloadV1): EventActorV1 {
  if (payload.type === 'evidence.recorded') {
    return { kind: payload.evidence.origin === 'automated' ? 'automation' : payload.evidence.origin };
  }
  if (payload.type === 'finding.recorded') return { kind: payload.finding.origin };
  if (payload.type === 'human.decision') return { kind: 'human' };
  return { kind: 'host' };
}

function nextAction(run: GuardrailsRunV1): RecordingResultV1['nextAction'] {
  const complete = new Set(run.tasks.filter((task) => task.status === 'complete').map((task) => task.taskId));
  const blocked = new Set(run.tasks.filter((task) => task.status === 'blocked').map((task) => task.taskId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of run.tasks) {
      if (!blocked.has(task.taskId) && task.dependencies.some((dependency) => blocked.has(dependency))) {
        blocked.add(task.taskId);
        changed = true;
      }
    }
  }
  const next = run.tasks.find((task) => task.status !== 'complete' && !blocked.has(task.taskId) &&
    task.dependencies.every((dependency) => complete.has(dependency)));
  return {
    ...(next ? { taskId: next.taskId } : {}),
    blockedTaskIds: [...blocked].sort(),
    complete: run.tasks.every((task) => task.status === 'complete'),
  };
}

async function current(options: { change: string; projectRoot?: string }) {
  const resolved = await resolveChangeDirectory(options);
  const store = await migrateV1ProjectionsToEventStore(resolved.changeDir);
  const compiled = await compileCurrentOpenSpecChange({
    projectRoot: resolved.projectRoot,
    changeName: resolved.changeName,
    changeDir: resolved.changeDir,
    taskMetadata: store.seed.config.taskOverrides,
  });
  const projection = await writeReplayedProjections({
    changeDir: resolved.changeDir,
    store,
    compiled,
  });
  return { resolved, store, compiled, projection };
}

function validatePayload(payload: GuardrailsEventPayloadV1, run: GuardrailsRunV1): void {
  const task = payload.type === 'task.transition'
    ? run.tasks.find((item) => item.taskId === payload.taskId)
    : payload.type === 'evidence.recorded' && payload.evidence.taskId
      ? run.tasks.find((item) => item.taskId === payload.evidence.taskId)
      : payload.type === 'deviation.recorded'
        ? run.tasks.find((item) => item.taskId === payload.deviation.taskId)
        : undefined;
  if ((payload.type === 'task.transition' || payload.type === 'deviation.recorded' ||
      (payload.type === 'evidence.recorded' && payload.evidence.taskId)) && !task) {
    throw new Error('Recording references an unknown current OpenSpec task.');
  }
  if (task) assertStableTaskBinding(task);

  const requirements = new Set(run.artifacts.flatMap((artifact) => artifact.ids)
    .filter((id) => id.includes('#requirement:') && !id.includes('/scenario:')));
  if (payload.type === 'finding.recorded' && !requirements.has(payload.finding.requirementId)) {
    throw new Error(`Finding references unknown requirement '${payload.finding.requirementId}'.`);
  }
  if (payload.type === 'deviation.recorded' && payload.deviation.requirementRefs.some(
    (reference) => !requirements.has(reference),
  )) throw new Error('Deviation references an unknown current requirement.');

  if (payload.type === 'task.transition' && payload.status !== 'blocked') {
    const incomplete = task!.dependencies.filter((dependency) =>
      run.tasks.find((item) => item.taskId === dependency)?.status !== 'complete');
    if (incomplete.length) {
      throw new Error(`Task '${task!.taskId}' has incomplete dependencies: ${incomplete.join(', ')}.`);
    }
  }
  if (payload.type === 'evidence.recorded') {
    const item = payload.evidence;
    if (!item.sourceDigests || Object.keys(item.sourceDigests).length === 0) {
      throw new Error('Evidence must bind at least one controlling OpenSpec source digest.');
    }
    for (const [artifactPath, digest] of Object.entries(item.sourceDigests)) {
      if (sourceDigests(run)[artifactPath] !== digest) {
        throw new Error(`Evidence source digest for '${artifactPath}' is not current.`);
      }
    }
    if (item.phase === 'red' && (!item.reference || item.result !== 'fail' || item.exitCode === 0 ||
        !item.relevantFailure || item.preExistingFailure)) {
      throw new Error('RED evidence requires observable output, a relevant new failure, and a non-zero result.');
    }
    if (item.phase === 'red' && task?.implementationStartedAt &&
        Date.parse(item.observedAt) >= Date.parse(task.implementationStartedAt)) {
      throw new Error(`RED evidence for task '${task.taskId}' was observed after implementation began.`);
    }
  }
  if (payload.type === 'repair.recorded') {
    const previous = run.repairIds.length;
    if (payload.repair.attempt > run.config.repairLimit || previous >= run.config.repairLimit) {
      throw new Error(`Repair limit of ${run.config.repairLimit} exhausted; user direction is required.`);
    }
    if (payload.repair.changedReferences.length === 0) {
      throw new Error('Repair must identify relevant changed source or evidence references.');
    }
    if (payload.repair.attempt !== previous + 1) {
      throw new Error(`Repair attempt must be ${previous + 1} for this run.`);
    }
    const relevant = [
      ...run.artifacts.map((artifact) => artifact.path),
      ...run.tasks.flatMap((item) => item.writeSet),
    ].map((value) => value.replaceAll('\\', '/').replace(/^\.\//, ''));
    const changed = payload.repair.changedReferences
      .map((value) => value.replaceAll('\\', '/').replace(/^\.\//, ''));
    if (!changed.some((left) => relevant.some((right) =>
      left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)))) {
      throw new Error('Repair did not change source or evidence relevant to the current OpenSpec run.');
    }
  }
}

async function setTaskCheckbox(changeDir: string, taskId: string, complete: boolean): Promise<void> {
  const filename = path.join(changeDir, 'tasks.md');
  const input = await fs.readFile(filename, 'utf8');
  const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(\\s*-\\s*\\[)[ xX](\\]\\s+${escaped}\\s+)`, 'm');
  if (!pattern.test(input)) throw new Error(`Task '${taskId}' is not an explicitly identified checklist item.`);
  const output = input.replace(pattern, `$1${complete ? 'x' : ' '}$2`);
  if (output !== input) await atomicWriteText(filename, output);
}

export async function recordGuardrailsPayload(options: {
  change: string;
  projectRoot?: string;
  eventId: string;
  occurredAt?: string;
  actor?: EventActorV1;
  provenance?: { origin: string; adapter?: string; command?: string };
  payload: GuardrailsEventPayloadV1;
}): Promise<RecordingResultV1> {
  const state = await current(options);
  validatePayload(options.payload, state.projection.run);
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const existing = state.store.events.find((item) => item.eventId === options.eventId);
  const event = createGuardrailsEvent({
    eventId: options.eventId,
    runId: state.store.runId,
    changeName: state.store.changeName,
    occurredAt,
    sourceDigests: existing?.sourceDigests ?? sourceDigests(state.projection.run),
    actor: options.actor ?? actorFor(options.payload),
    provenance: options.provenance ?? { origin: 'tier0-cli' },
    payload: options.payload,
  });
  const appended = await appendGuardrailsEvent({ changeDir: state.resolved.changeDir, event });
  if (options.payload.type === 'task.transition' &&
      (options.payload.status === 'complete' || options.payload.status === 'pending')) {
    await setTaskCheckbox(
      state.resolved.changeDir,
      options.payload.taskId,
      options.payload.status === 'complete',
    );
  }
  const compiled = await compileCurrentOpenSpecChange({
    projectRoot: state.resolved.projectRoot,
    changeName: state.resolved.changeName,
    changeDir: state.resolved.changeDir,
    taskMetadata: appended.store.seed.config.taskOverrides,
  });
  const projection = await writeReplayedProjections({
    changeDir: state.resolved.changeDir,
    store: appended.store,
    compiled,
  });
  return {
    accepted: true,
    appended: appended.appended,
    eventId: event.eventId,
    eventType: event.payload.type,
    runId: event.runId,
    changeName: event.changeName,
    projectionRepaired: projection.repaired,
    nextAction: nextAction(projection.run),
  };
}

export async function acceptGuardrailsGate(options: {
  change: string;
  projectRoot?: string;
  gateId: string;
  actor: string;
  eventId?: string;
  occurredAt?: string;
}): Promise<RecordingResultV1> {
  const resolved = await resolveChangeDirectory(options);
  const acceptedAt = options.occurredAt ?? new Date().toISOString();
  await acceptRequiredGate(resolved.changeDir, options.gateId, { actor: options.actor, acceptedAt });
  const record = await readRequiredGateRecord(resolved.changeDir);
  const gate = record.gates.find((item) => item.gateId === options.gateId)!;
  return recordGuardrailsPayload({
    change: options.change,
    projectRoot: resolved.projectRoot,
    eventId: options.eventId ?? randomUUID(),
    occurredAt: acceptedAt,
    actor: { kind: 'human', id: options.actor },
    provenance: { origin: 'tier0-cli-accept' },
    payload: {
      type: 'human.decision',
      gateId: options.gateId,
      decision: 'accepted',
      resultDigest: gate.acceptance!.resultDigest,
      evidenceDigest: gate.acceptance!.evidenceDigest,
    },
  });
}
