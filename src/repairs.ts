import { randomUUID } from 'node:crypto';
import type { RepairAttemptV1 } from './schemas.js';

function relevantChange(changed: string[], relevant: string[]): boolean {
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '');
  return changed.some((changedRef) => relevant.some((relevantRef) => {
    const left = normalize(changedRef);
    const right = normalize(relevantRef);
    return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
  }));
}

export function beginRepairAttempt(options: {
  checkId: string;
  previous: RepairAttemptV1[];
  changedReferences: string[];
  relevantReferences: string[];
  limit?: number;
  now?: string;
}): RepairAttemptV1 {
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

export function completeRepairAttempt(
  attempt: RepairAttemptV1,
  passed: boolean,
  now = new Date().toISOString(),
): RepairAttemptV1 {
  return { ...attempt, completedAt: now, result: passed ? 'pass' : 'fail' };
}

export async function runBoundedRepair(options: {
  checkId: string;
  relevantReferences: string[];
  previous?: RepairAttemptV1[];
  limit?: number;
  repair: (attempt: number) => Promise<string[]>;
  rerun: () => Promise<boolean>;
}): Promise<{
  passed: boolean;
  exhausted: boolean;
  attempts: RepairAttemptV1[];
  userDirectionRequired: boolean;
}> {
  const attempts = [...(options.previous ?? [])];
  const limit = options.limit ?? 2;
  while (attempts.filter((item) => item.checkId === options.checkId).length < limit) {
    const changedReferences = await options.repair(
      attempts.filter((item) => item.checkId === options.checkId).length + 1,
    );
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
