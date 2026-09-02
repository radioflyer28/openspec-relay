import { type FindingLifecycleRecordV2, type FindingStateV2, type FindingTransitionV2, type PortableReferenceV2, type UatScenarioV2 } from './schemas.js';
export interface FindingDiscoveryInputV2 {
    providerId: string;
    ruleId: string;
    category: string;
    scope: FindingLifecycleRecordV2['scope'];
    severity: FindingLifecycleRecordV2['severity'];
    blocking: boolean;
    summary: string;
    requirementIds: string[];
    taskIds: string[];
    evidence: PortableReferenceV2[];
    occurredAt: string;
    sourceRevision: string;
    actor?: FindingTransitionV2['actor'];
}
export declare function createFindingId(input: Pick<FindingDiscoveryInputV2, 'providerId' | 'ruleId' | 'category' | 'scope'>): string;
export declare function discoverFinding(input: FindingDiscoveryInputV2): FindingLifecycleRecordV2;
export declare function transitionFinding(options: {
    finding: FindingLifecycleRecordV2;
    to: FindingStateV2;
    actor: FindingTransitionV2['actor'];
    reason: string;
    evidence: PortableReferenceV2[];
    sourceRevision: string;
    occurredAt: string;
    expiry?: string;
    followUp?: string;
}): FindingLifecycleRecordV2;
export declare function reconcileFindings(options: {
    existing: FindingLifecycleRecordV2[];
    reports: FindingDiscoveryInputV2[];
}): FindingLifecycleRecordV2[];
export declare function markFindingsStale(options: {
    findings: FindingLifecycleRecordV2[];
    changedScopes: string[];
    sourceRevision: string;
    occurredAt: string;
}): FindingLifecycleRecordV2[];
export declare function evaluateFindingObligations(options: {
    findings: FindingLifecycleRecordV2[];
    scenarios?: UatScenarioV2[];
    elevateWarnings?: boolean;
}): {
    blocking: string[];
    warnings: string[];
};
//# sourceMappingURL=findings.d.ts.map