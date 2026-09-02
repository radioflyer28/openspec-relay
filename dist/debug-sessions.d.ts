import { type DebugConclusionV2, type DebugExperimentV2, type DebugSessionV2, type DebugVerificationV2, type PortableReferenceV2 } from './schemas.js';
export interface DebugMutationContractV2 {
    role: 'executor' | 'reviewer' | 'verifier' | 'analyzer';
    readOnly: boolean;
    mayMutateWorkspace: boolean;
    requiresGitOptIn: boolean;
}
export declare function createDebugMutationContract(options: {
    role: DebugMutationContractV2['role'];
    gitEnabled?: boolean;
}): DebugMutationContractV2;
export declare function debugSessionId(logicalFailureId: string): string;
export declare function startDebugSession(options: {
    logicalFailureId: string;
    findingId?: string;
    references: string[];
    failedEvidence: PortableReferenceV2[];
    existing: DebugSessionV2[];
    now?: string;
}): DebugSessionV2;
export declare function recordDebugConclusion(options: {
    session: DebugSessionV2;
    kind: DebugConclusionV2['kind'];
    statement: string;
    experimentIds: string[];
    evidence?: PortableReferenceV2[];
    sourceRevision?: string;
    now?: string;
}): DebugSessionV2;
export declare function recordDebugHypothesis(options: {
    session: DebugSessionV2;
    statement: string;
    now?: string;
}): DebugSessionV2;
export declare function experimentFingerprint(options: {
    hypothesisId: string;
    action: string;
    targetedEvidence: PortableReferenceV2[];
    sourceRevision: string;
}): string;
export declare function planDebugExperiment(options: {
    session: DebugSessionV2;
    hypothesisId: string;
    action: string;
    targetedEvidence: PortableReferenceV2[];
    sourceRevision: string;
    now?: string;
    humanRationale?: string;
}): DebugSessionV2;
export declare function observeDebugExperiment(options: {
    session: DebugSessionV2;
    experimentId: string;
    result: Exclude<DebugExperimentV2['result'], 'planned' | 'rejected_duplicate'>;
    observation: string;
    now?: string;
}): DebugSessionV2;
export declare function debugSessionForRepairExhaustion(options: {
    logicalFailureId: string;
    findingId?: string;
    references: string[];
    failedEvidence: PortableReferenceV2[];
    repairAttempts: Array<{
        result: string;
    }>;
    limit: number;
    existing: DebugSessionV2[];
    now?: string;
}): DebugSessionV2;
export declare function resolveDebugSession(options: {
    session: DebugSessionV2;
    regressionEvidence: PortableReferenceV2[];
    verification: DebugVerificationV2;
    now?: string;
    exemption?: {
        reason: string;
        acceptedBy: string;
    };
}): DebugSessionV2;
//# sourceMappingURL=debug-sessions.d.ts.map