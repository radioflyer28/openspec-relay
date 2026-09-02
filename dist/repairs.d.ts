import type { RepairAttemptV1 } from './schemas.js';
export declare function beginRepairAttempt(options: {
    checkId: string;
    previous: RepairAttemptV1[];
    changedReferences: string[];
    relevantReferences: string[];
    limit?: number;
    now?: string;
}): RepairAttemptV1;
export declare function completeRepairAttempt(attempt: RepairAttemptV1, passed: boolean, now?: string): RepairAttemptV1;
export declare function runBoundedRepair(options: {
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
}>;
//# sourceMappingURL=repairs.d.ts.map