import type { EvidenceV1, TaskNodeV1, TddPolicy } from './schemas.js';
export interface ResolvedTddRequirementV1 {
    policy: TddPolicy;
    required: boolean;
    exemptionReason?: string;
}
export declare function resolveTddPolicy(options: {
    project?: TddPolicy;
    change?: TddPolicy;
    task?: TddPolicy;
}): TddPolicy;
export declare function classifyTddRequirement(task: TaskNodeV1, policy: TddPolicy): ResolvedTddRequirementV1;
export interface TddEvidenceResultV1 {
    valid: boolean;
    diagnostics: string[];
    evidenceIds: string[];
}
export declare function validateTddEvidence(task: TaskNodeV1, evidence: EvidenceV1[]): TddEvidenceResultV1;
//# sourceMappingURL=tdd.d.ts.map