import { randomUUID } from 'node:crypto';
import type { ExecutionGraphV1 } from './graph.js';
import {
  type ExecutionTier,
  type FindingLifecycleRecordV2,
  type GsdEventPayloadV1,
  type PortableReferenceV2,
  type SemanticClassificationV1,
} from './schemas.js';

export type ExecutionRole = 'planner' | 'plan_reviewer' | 'pathfinder' | 'executor' | 'reviewer' | 'verifier';

export interface PlanningRoleContextV1 {
  changeName: string;
  planRevision: string;
  invocation: 'initial_plan' | 'do_replan';
  artifactRefs: string[];
  plannerInstructions: string[];
  semanticObligations: string[];
  evidenceRequirements: string[];
  findingIds?: string[];
  pathfinderQuestion?: string;
  disposableExperimentWorkspace?: boolean;
}

export interface RoleRequestV1 {
  role: ExecutionRole;
  taskId?: string;
  readOnly: boolean;
  isolated: boolean;
  workspace?: string;
  planning?: PlanningRoleContextV1;
}

export interface RoleResultV1 {
  status: 'pass' | 'fail' | 'error';
  summary: string;
  evidenceRefs: string[];
  evidence?: PortableReferenceV2[];
  findings?: ReportedFindingV2[];
  events?: GsdEventPayloadV1[];
  semanticClassifications?: SemanticClassificationV1[];
  pathfinder?: {
    assumptions: string[];
    experiments: string[];
    observations: string[];
    counterexamples: string[];
    conclusion: string;
    confidence: 'high' | 'medium' | 'low';
    routing: 'planner' | 'discussion' | 'human_needed';
  };
  scopeExpansion?: boolean;
}

/** A reviewer/verifier report deliberately omits findingId. OpenSpec GSD derives
 * stable identities from provider, rule, category, and scope. */
export interface ReportedFindingV2 {
  providerId: string;
  ruleId: string;
  category: string;
  scope: FindingLifecycleRecordV2['scope'];
  severity: FindingLifecycleRecordV2['severity'];
  blocking: boolean;
  summary: string;
  requirementIds?: string[];
  taskIds?: string[];
  evidence?: PortableReferenceV2[];
}

export interface RoleDispatcherV1 {
  dispatch(request: Readonly<RoleRequestV1>): Promise<RoleResultV1>;
}

export interface DispatchedRoleResultV2 {
  readonly dispatchId: string;
  readonly request: Readonly<RoleRequestV1>;
  readonly result: Readonly<RoleResultV1>;
}

const dispatchedRoleResults = new WeakSet<object>();

function validateRoleResult(result: RoleResultV1): RoleResultV1 {
  if (!result || !['pass', 'fail', 'error'].includes(result.status) ||
      typeof result.summary !== 'string' || !Array.isArray(result.evidenceRefs)) {
    throw new Error('Role dispatcher returned an invalid structured result.');
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Dispatch through the orchestrator and return a process-local opaque receipt.
 * Ordinary callers cannot synthesize a receipt by choosing a role label. */
export async function dispatchRoleV2(options: {
  dispatcher: RoleDispatcherV1;
  request: RoleRequestV1;
}): Promise<DispatchedRoleResultV2> {
  if (['plan_reviewer', 'pathfinder', 'reviewer', 'verifier'].includes(options.request.role) && !options.request.readOnly) {
    throw new Error(`${options.request.role} dispatch requires a read-only contract.`);
  }
  const request = deepFreeze(structuredClone(options.request));
  const result = deepFreeze(structuredClone(validateRoleResult(await options.dispatcher.dispatch(request))));
  const receipt = Object.freeze({ dispatchId: `dispatch:${randomUUID()}`, request, result });
  dispatchedRoleResults.add(receipt);
  return receipt;
}

export function assertDispatchedRoleResultV2(
  receipt: DispatchedRoleResultV2,
  expectedRole?: ExecutionRole,
): void {
  if (!receipt || !dispatchedRoleResults.has(receipt as object)) {
    throw new Error('Reviewer and verifier results require an orchestrator-issued dispatch receipt.');
  }
  if (expectedRole && receipt.request.role !== expectedRole) {
    throw new Error(`Expected a dispatched ${expectedRole} result, received ${receipt.request.role}.`);
  }
  if (['plan_reviewer', 'pathfinder', 'reviewer', 'verifier'].includes(receipt.request.role) && !receipt.request.readOnly) {
    throw new Error('Independent assurance receipts must come from a read-only dispatch contract.');
  }
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
    events?: GsdEventPayloadV1[];
  }>;
  review?: RoleResultV1;
  reviewReceipt?: DispatchedRoleResultV2;
  verification?: RoleResultV1;
  verificationReceipt?: DispatchedRoleResultV2;
  stoppedAfterFailure: boolean;
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
          const dispatched = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
            role: 'executor', taskId, readOnly: false, isolated: true, workspace,
          } });
          const value = dispatched.result;
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
          const dispatched = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
            role: 'executor', taskId, readOnly: false, isolated: options.tier === 'tier1',
          } });
          const value = dispatched.result;
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
  const reviewReceipt = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
    role: 'reviewer', readOnly: true, isolated: options.tier !== 'tier0',
  } });
  const review = reviewReceipt.result;
  if (review.status !== 'pass') {
    return { tier: options.tier, tasks, review, reviewReceipt, stoppedAfterFailure: true };
  }
  const verificationReceipt = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
    role: 'verifier', readOnly: true, isolated: options.tier !== 'tier0',
  } });
  const verification = verificationReceipt.result;
  return {
    tier: options.tier,
    tasks,
    review,
    reviewReceipt,
    verification,
    verificationReceipt,
    stoppedAfterFailure: verification.status !== 'pass',
  };
}
