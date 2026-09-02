import type { RelayAssuranceV2, RelayRunV2 } from './schemas.js';
export interface RunStatusV2 {
    changeName: string;
    mode: RelayRunV2['mode'];
    tier: RelayRunV2['tier'];
    status: RelayRunV2['status'];
    tasks: {
        total: number;
        complete: number;
        blocked: number;
    };
    checks: RelayAssuranceV2['checks'];
    assuranceStatus: RelayAssuranceV2['status'];
    hostAdapter?: RelayAssuranceV2['hostAdapter'];
    repositoryContext: {
        status: 'current' | 'stale' | 'unavailable' | 'missing';
    };
    readiness: {
        status: NonNullable<RelayAssuranceV2['readiness']>['status'] | 'missing';
        issueCount: number;
    };
    planning: {
        revision?: string;
        approval: RelayRunV2['planApprovalStatus'];
        review: 'independent' | 'self_review' | 'missing';
        pathfinderCount: number;
        activeRoute?: string;
        resume: 'plan' | 'do' | 'none';
    };
    findings: Record<string, number>;
    debugSessions: {
        active: string[];
        humanNeeded: string[];
    };
    uat: {
        pending: string[];
        acceptedLimitations: string[];
    };
    release: {
        applicable: string[];
        unresolved: string[];
    };
    unresolvedHumanActions: string[];
    nextActions: string[];
    staleEvidenceCount: number;
    assuranceDigestMatches: boolean;
    integrity: {
        status: 'pass' | 'error';
        summary: string;
    };
}
export declare function getRunStatusV2(options: {
    change: string;
    projectRoot?: string;
}): Promise<RunStatusV2>;
//# sourceMappingURL=status.d.ts.map