import { randomUUID } from 'node:crypto';
const dispatchedRoleResults = new WeakSet();
function validateRoleResult(result) {
    if (!result || !['pass', 'fail', 'error'].includes(result.status) ||
        typeof result.summary !== 'string' || !Array.isArray(result.evidenceRefs)) {
        throw new Error('Role dispatcher returned an invalid structured result.');
    }
    return result;
}
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const item of Object.values(value))
            deepFreeze(item);
        Object.freeze(value);
    }
    return value;
}
/** Dispatch through the orchestrator and return a process-local opaque receipt.
 * Ordinary callers cannot synthesize a receipt by choosing a role label. */
export async function dispatchRoleV2(options) {
    if (['plan_reviewer', 'pathfinder', 'reviewer', 'verifier'].includes(options.request.role) && !options.request.readOnly) {
        throw new Error(`${options.request.role} dispatch requires a read-only contract.`);
    }
    const request = deepFreeze(structuredClone(options.request));
    const result = deepFreeze(structuredClone(validateRoleResult(await options.dispatcher.dispatch(request))));
    const receipt = Object.freeze({ dispatchId: `dispatch:${randomUUID()}`, request, result });
    dispatchedRoleResults.add(receipt);
    return receipt;
}
export function assertDispatchedRoleResultV2(receipt, expectedRole) {
    if (!receipt || !dispatchedRoleResults.has(receipt)) {
        throw new Error('Reviewer and verifier results require an orchestrator-issued dispatch receipt.');
    }
    if (expectedRole && receipt.request.role !== expectedRole) {
        throw new Error(`Expected a dispatched ${expectedRole} result, received ${receipt.request.role}.`);
    }
    if (['plan_reviewer', 'pathfinder', 'reviewer', 'verifier'].includes(receipt.request.role) && !receipt.request.readOnly) {
        throw new Error('Independent assurance receipts must come from a read-only dispatch contract.');
    }
}
export async function executeWithTier(options) {
    if (options.tier === 'tier2' && !options.worktrees) {
        throw new Error('Tier 2 requires an explicitly configured worktree adapter.');
    }
    const tasks = [];
    let stoppedAfterFailure = false;
    for (const wave of options.graph.waves) {
        if (stoppedAfterFailure)
            break;
        if (options.tier === 'tier2') {
            const worktrees = options.worktrees;
            const results = await Promise.all(wave.map(async (taskId) => {
                const workspace = await worktrees.create(taskId);
                try {
                    const dispatched = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
                            role: 'executor', taskId, readOnly: false, isolated: true, workspace,
                        } });
                    const value = dispatched.result;
                    return { taskId, workspace, value };
                }
                catch (error) {
                    return {
                        taskId,
                        workspace,
                        value: { status: 'error', summary: error.message, evidenceRefs: [] },
                    };
                }
            }));
            for (const item of results.sort((left, right) => left.taskId.localeCompare(right.taskId, undefined, { numeric: true }))) {
                try {
                    if (item.value.status === 'pass')
                        await worktrees.merge(item.taskId, item.workspace);
                    tasks.push({ taskId: item.taskId, ...item.value });
                }
                finally {
                    await worktrees.cleanup(item.taskId, item.workspace);
                }
            }
        }
        else {
            for (const taskId of wave) {
                try {
                    const dispatched = await dispatchRoleV2({ dispatcher: options.dispatcher, request: {
                            role: 'executor', taskId, readOnly: false, isolated: options.tier === 'tier1',
                        } });
                    const value = dispatched.result;
                    tasks.push({ taskId, ...value });
                    if (value.status !== 'pass')
                        break;
                }
                catch (error) {
                    tasks.push({ taskId, status: 'error', summary: error.message, evidenceRefs: [] });
                    break;
                }
            }
        }
        stoppedAfterFailure = tasks.some((task) => task.status !== 'pass');
    }
    if (stoppedAfterFailure)
        return { tier: options.tier, tasks, stoppedAfterFailure };
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
//# sourceMappingURL=execution-adapters.js.map