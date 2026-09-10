import { compileOpenSpecChange } from '../artifacts.js';
import { loadRelayConfigV2 } from '../config.js';
import { doRelayChangeV1 } from '../do-workflow.js';
import { computeSemanticPlanRevision } from '../planning.js';
import { planRelayChangeV1 } from '../plan-workflow.js';
import { checkRelayRunV2 } from '../runner-v2.js';
import { getRunStatusV2 } from '../status.js';
import { pauseRelayChangeV1, resumeRelayChangeV1 } from '../pause-resume.js';
import { DispatchQuiescenceControllerV1 } from '../dispatch-quiescence.js';
import { resolveChangeDirectory } from '../state.js';
import { createPiExperimentWorkspace } from './experiment-workspace.js';
import { qualifyPiHostAdapter } from './host-adapter.js';
import { createPiRoleDispatcher } from './role-dispatch.js';
async function semanticRevision(projectRoot, change) {
    const resolved = await resolveChangeDirectory({ projectRoot, change });
    const config = await loadRelayConfigV2({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir });
    const compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: config.taskOverrides });
    return (await computeSemanticPlanRevision({ changeDir: resolved.changeDir, compiled })).revision;
}
function disposableWorkspaces() {
    const active = new Map();
    return {
        create: async (id) => {
            const workspace = await createPiExperimentWorkspace();
            active.set(id, workspace);
            return workspace.root;
        },
        cleanup: async (id) => {
            const workspace = active.get(id);
            active.delete(id);
            await workspace?.cleanup();
        },
    };
}
const dispatchControls = new Map();
function dispatchControl(sessionId, changeName) {
    const key = `${sessionId}:${changeName}`;
    let control = dispatchControls.get(key);
    if (!control) {
        control = new DispatchQuiescenceControllerV1();
        dispatchControls.set(key, control);
    }
    return control;
}
/** The sole in-process Pi integration point. It delegates lifecycle decisions
 * to existing OpenSpec Relay workflows and supplies only qualified read-only
 * assurance dispatch. Canonical implementation remains $openspec-apply-change
 * in the parent session. */
export async function executePiWorkflowOperationV1(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    const config = await loadRelayConfigV2({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir });
    const adapter = await qualifyPiHostAdapter({
        enabled: config.piHostAdapter.enabled,
        forceTier0: config.piHostAdapter.forceTier0,
        runtime: options.runtime,
    });
    const fallbackCommand = `openspec-relay ${options.operation} ${resolved.changeName}${options.operation === 'status' ? ' --json' : ''}`;
    const control = adapter.sessionId ? dispatchControl(adapter.sessionId, resolved.changeName) : undefined;
    if (options.operation === 'pause') {
        const dispatches = adapter.agentDispatch.state === 'available' && control
            ? await control.pause({ timeoutMs: 2_000 }) : [];
        const result = await pauseRelayChangeV1({
            change: resolved.changeName, projectRoot: resolved.projectRoot,
            stage: 'implementation', dispatches,
        });
        return { operation: options.operation, adapter, usedAdapter: adapter.agentDispatch.state === 'available', result };
    }
    if (options.operation === 'resume') {
        const result = await resumeRelayChangeV1({ change: resolved.changeName, projectRoot: resolved.projectRoot });
        if (result.resumed)
            control?.resumeScheduling();
        return { operation: options.operation, adapter, usedAdapter: adapter.agentDispatch.state === 'available', result };
    }
    if (adapter.agentDispatch.state !== 'available') {
        return { operation: options.operation, adapter, usedAdapter: false, fallbackCommand };
    }
    const dispatcher = createPiRoleDispatcher({
        profile: adapter,
        factory: options.factory,
        currentRevision: (change) => semanticRevision(resolved.projectRoot, change),
        parentSignal: options.parentSignal,
        ...(control ? { quiescence: control } : {}),
    });
    const workflowConfig = {
        ...config,
        requestedTier: 'tier1',
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
//# sourceMappingURL=workflow.js.map