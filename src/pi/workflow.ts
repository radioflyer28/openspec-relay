import { compileOpenSpecChange } from '../artifacts.js';
import { loadRelayConfigV2 } from '../config.js';
import { doRelayChangeV1 } from '../do-workflow.js';
import { computeSemanticPlanRevision } from '../planning.js';
import { planRelayChangeV1 } from '../plan-workflow.js';
import { checkRelayRunV2 } from '../runner-v2.js';
import { getRunStatusV2 } from '../status.js';
import { resolveChangeDirectory } from '../state.js';
import { createPiExperimentWorkspace, type PiExperimentWorkspaceV1 } from './experiment-workspace.js';
import { qualifyPiHostAdapter, type PiHostProbeRuntimeV1 } from './host-adapter.js';
import { createPiRoleDispatcher, type PiRoleSessionFactoryV1 } from './role-dispatch.js';

export type PiWorkflowOperationV1 = 'plan' | 'do' | 'check' | 'status';

export interface PiWorkflowOperationResultV1 {
  operation: PiWorkflowOperationV1;
  adapter: Awaited<ReturnType<typeof qualifyPiHostAdapter>>;
  usedAdapter: boolean;
  fallbackCommand?: string;
  result?: unknown;
}

async function semanticRevision(projectRoot: string, change: string): Promise<string> {
  const resolved = await resolveChangeDirectory({ projectRoot, change });
  const config = await loadRelayConfigV2({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir });
  const compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: config.taskOverrides });
  return (await computeSemanticPlanRevision({ changeDir: resolved.changeDir, compiled })).revision;
}

function disposableWorkspaces() {
  const active = new Map<string, PiExperimentWorkspaceV1>();
  return {
    create: async (id: string) => {
      const workspace = await createPiExperimentWorkspace();
      active.set(id, workspace);
      return workspace.root;
    },
    cleanup: async (id: string) => {
      const workspace = active.get(id);
      active.delete(id);
      await workspace?.cleanup();
    },
  };
}

/** The sole in-process Pi integration point. It delegates lifecycle decisions
 * to existing OpenSpec Relay workflows and supplies only qualified read-only
 * assurance dispatch. Canonical implementation remains $openspec-apply-change
 * in the parent session. */
export async function executePiWorkflowOperationV1(options: {
  operation: PiWorkflowOperationV1;
  change: string;
  projectRoot: string;
  runtime: PiHostProbeRuntimeV1;
  factory: PiRoleSessionFactoryV1;
  pathfinderQuestions?: string[];
  parentSignal?: AbortSignal;
}): Promise<PiWorkflowOperationResultV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const config = await loadRelayConfigV2({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir });
  const adapter = await qualifyPiHostAdapter({
    enabled: config.piHostAdapter.enabled,
    forceTier0: config.piHostAdapter.forceTier0,
    runtime: options.runtime,
  });
  const fallbackCommand = `openspec-relay ${options.operation} ${resolved.changeName}${options.operation === 'status' ? ' --json' : ''}`;
  if (adapter.agentDispatch.state !== 'available') {
    return { operation: options.operation, adapter, usedAdapter: false, fallbackCommand };
  }
  const dispatcher = createPiRoleDispatcher({
    profile: adapter,
    factory: options.factory,
    currentRevision: (change) => semanticRevision(resolved.projectRoot, change),
    parentSignal: options.parentSignal,
  });
  const workflowConfig = {
    ...config,
    requestedTier: 'tier1' as const,
    allowAgentDispatch: true,
    allowParallel: adapter.parallelism.state === 'available',
  };
  if (options.operation === 'plan') {
    const qualifiedAt = new Date().toISOString();
    const result = await planRelayChangeV1({
      change: resolved.changeName,
      projectRoot: resolved.projectRoot,
      changedFiles: [],
      config: workflowConfig,
      hostCapabilities: adapter.hostCapabilities,
      assuranceDispatcher: dispatcher,
      pathfinderQuestions: options.pathfinderQuestions,
      pathfinderWorkspaces: disposableWorkspaces(),
      readOnlyConcurrency: adapter.parallelism.state === 'available'
        ? config.piHostAdapter.maxReadOnlyConcurrency : 1,
      ...(options.parentSignal ? { signal: options.parentSignal } : {}),
      hostAdapter: {
        adapterId: adapter.adapterId,
        adapterVersion: adapter.version,
        runtimeVersion: adapter.piVersion,
        ...(adapter.modelRef ? { modelRef: adapter.modelRef } : {}),
        agentDispatch: adapter.agentDispatch.state,
        parallelism: adapter.parallelism.state,
        qualifiedAt,
      },
    });
    return { operation: options.operation, adapter, usedAdapter: true, result };
  }
  if (options.operation === 'do') {
    const result = await doRelayChangeV1({
      change: resolved.changeName,
      projectRoot: resolved.projectRoot,
      dispatcher,
      allowWritablePlannerDispatch: false,
      applyCapability: { apply: async (request) => ({
        status: 'human_needed',
        summary: `Parent session must invoke ${request.capability} for task ${request.taskId}, then call this Pi workflow tool again.`,
      }) },
    });
    return { operation: options.operation, adapter, usedAdapter: true, result };
  }
  if (options.operation === 'check') {
    const result = await checkRelayRunV2({ change: resolved.changeName, projectRoot: resolved.projectRoot });
    return { operation: options.operation, adapter, usedAdapter: true, result };
  }
  const result = await getRunStatusV2({ change: resolved.changeName, projectRoot: resolved.projectRoot });
  return { operation: options.operation, adapter, usedAdapter: true, result };
}
