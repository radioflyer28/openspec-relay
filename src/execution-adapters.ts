import type { ExecutionGraphV1 } from './graph.js';
import { GuardrailsEventPayloadV1Schema, type ExecutionTier, type GuardrailsEventPayloadV1 } from './schemas.js';
import { recordGuardrailsPayload, type RecordingResultV1 } from './recording.js';

export type ExecutionRole = 'executor' | 'reviewer' | 'verifier';

export interface RoleRequestV1 {
  role: ExecutionRole;
  taskId?: string;
  readOnly: boolean;
  isolated: boolean;
  workspace?: string;
}

export interface RoleResultV1 {
  status: 'pass' | 'fail' | 'error';
  summary: string;
  evidenceRefs: string[];
  events?: GuardrailsEventPayloadV1[];
}

export interface RoleDispatcherV1 {
  dispatch(request: Readonly<RoleRequestV1>): Promise<RoleResultV1>;
}

export interface WorktreeAdapterV1 {
  create(taskId: string): Promise<string>;
  merge(taskId: string, workspace: string): Promise<void>;
  cleanup(taskId: string, workspace: string): Promise<void>;
}

export interface ExecutionOutcomeV1 {
  tier: ExecutionTier;
  tasks: Array<{
    taskId: string;
    status: RoleResultV1['status'];
    summary: string;
    evidenceRefs: string[];
    events?: GuardrailsEventPayloadV1[];
  }>;
  review?: RoleResultV1;
  verification?: RoleResultV1;
  stoppedAfterFailure: boolean;
}

export async function persistExecutionOutcome(options: {
  change: string;
  projectRoot?: string;
  outcome: ExecutionOutcomeV1;
  eventPrefix: string;
  occurredAt: string;
}): Promise<RecordingResultV1[]> {
  const results: RecordingResultV1[] = [];
  const record = async (eventId: string, payload: GuardrailsEventPayloadV1) => {
    results.push(await recordGuardrailsPayload({
      change: options.change,
      projectRoot: options.projectRoot,
      eventId,
      occurredAt: options.occurredAt,
      provenance: { origin: `tier-adapter:${options.outcome.tier}` },
      payload: GuardrailsEventPayloadV1Schema.parse(payload),
    }));
  };
  for (const task of options.outcome.tasks) {
    await record(`${options.eventPrefix}:task:${task.taskId}:transition`, {
      type: 'task.transition',
      taskId: task.taskId,
      status: task.status === 'pass' ? 'complete' : 'blocked',
      ...(task.status === 'pass' ? {} : { reason: task.summary }),
    });
    for (const [index, payload] of (task.events ?? []).entries()) {
      await record(`${options.eventPrefix}:task:${task.taskId}:event:${index + 1}`, payload);
    }
  }
  for (const [role, value] of [['review', options.outcome.review], ['verification', options.outcome.verification]] as const) {
    for (const [index, payload] of (value?.events ?? []).entries()) {
      await record(`${options.eventPrefix}:${role}:event:${index + 1}`, payload);
    }
  }
  return results;
}

export async function executeWithTier(options: {
  tier: ExecutionTier;
  graph: ExecutionGraphV1;
  dispatcher: RoleDispatcherV1;
  worktrees?: WorktreeAdapterV1;
}): Promise<ExecutionOutcomeV1> {
  if (options.tier === 'tier2' && !options.worktrees) {
    throw new Error('Tier 2 requires an explicitly configured worktree adapter.');
  }
  const tasks: ExecutionOutcomeV1['tasks'] = [];
  let stoppedAfterFailure = false;
  for (const wave of options.graph.waves) {
    if (stoppedAfterFailure) break;
    if (options.tier === 'tier2') {
      const worktrees = options.worktrees!;
      const results = await Promise.all(wave.map(async (taskId) => {
        const workspace = await worktrees.create(taskId);
        try {
          const value = await options.dispatcher.dispatch({
            role: 'executor', taskId, readOnly: false, isolated: true, workspace,
          });
          return { taskId, workspace, value };
        } catch (error) {
          return {
            taskId,
            workspace,
            value: { status: 'error' as const, summary: (error as Error).message, evidenceRefs: [] },
          };
        }
      }));
      for (const item of results.sort((left, right) => left.taskId.localeCompare(right.taskId, undefined, { numeric: true }))) {
        try {
          if (item.value.status === 'pass') await worktrees.merge(item.taskId, item.workspace);
          tasks.push({ taskId: item.taskId, ...item.value });
        } finally {
          await worktrees.cleanup(item.taskId, item.workspace);
        }
      }
    } else {
      for (const taskId of wave) {
        try {
          const value = await options.dispatcher.dispatch({
            role: 'executor', taskId, readOnly: false, isolated: options.tier === 'tier1',
          });
          tasks.push({ taskId, ...value });
          if (value.status !== 'pass') break;
        } catch (error) {
          tasks.push({ taskId, status: 'error', summary: (error as Error).message, evidenceRefs: [] });
          break;
        }
      }
    }
    stoppedAfterFailure = tasks.some((task) => task.status !== 'pass');
  }
  if (stoppedAfterFailure) return { tier: options.tier, tasks, stoppedAfterFailure };
  const review = await options.dispatcher.dispatch({
    role: 'reviewer', readOnly: true, isolated: options.tier !== 'tier0',
  });
  if (review.status !== 'pass') {
    return { tier: options.tier, tasks, review, stoppedAfterFailure: true };
  }
  const verification = await options.dispatcher.dispatch({
    role: 'verifier', readOnly: true, isolated: options.tier !== 'tier0',
  });
  return {
    tier: options.tier,
    tasks,
    review,
    verification,
    stoppedAfterFailure: verification.status !== 'pass',
  };
}
