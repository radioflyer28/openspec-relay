import { randomUUID } from 'node:crypto';
function relevantChange(changed, relevant) {
    const normalize = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');
    return changed.some((changedRef) => relevant.some((relevantRef) => {
        const left = normalize(changedRef);
        const right = normalize(relevantRef);
        return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
    }));
}
export function beginRepairAttempt(options) {
    const limit = options.limit ?? 2;
    const attempts = options.previous.filter((item) => item.checkId === options.checkId).length;
    if (attempts >= limit) {
        throw new Error(`Repair limit of ${limit} exhausted for '${options.checkId}'; user direction is required.`);
    }
    if (!relevantChange(options.changedReferences, options.relevantReferences)) {
        throw new Error(`Repair for '${options.checkId}' did not change relevant source or evidence.`);
    }
    return {
        repairId: randomUUID(),
        checkId: options.checkId,
        attempt: attempts + 1,
        startedAt: options.now ?? new Date().toISOString(),
        changedReferences: options.changedReferences,
        result: 'pending',
    };
}
export function completeRepairAttempt(attempt, passed, now = new Date().toISOString()) {
    return { ...attempt, completedAt: now, result: passed ? 'pass' : 'fail' };
}
export async function runBoundedRepair(options) {
    const attempts = [...(options.previous ?? [])];
    const limit = options.limit ?? 2;
    while (attempts.filter((item) => item.checkId === options.checkId).length < limit) {
        const changedReferences = await options.repair(attempts.filter((item) => item.checkId === options.checkId).length + 1);
        const attempt = beginRepairAttempt({
            checkId: options.checkId,
            previous: attempts,
            changedReferences,
            relevantReferences: options.relevantReferences,
            limit,
        });
        const completed = completeRepairAttempt(attempt, await options.rerun());
        attempts.push(completed);
        if (completed.result === 'pass') {
            return { passed: true, exhausted: false, attempts, userDirectionRequired: false };
        }
    }
    return { passed: false, exhausted: true, attempts, userDirectionRequired: true };
}
//# sourceMappingURL=repairs.js.map