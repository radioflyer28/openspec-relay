import type { ResumeRouteV1 } from './schemas.js';
export interface ResumeRouteEvidenceV1 {
    integrity: 'pass' | 'error';
    candidateIds: string[];
    artifactState: 'complete' | 'missing' | 'incoherent';
    artifactsChanged: boolean;
    discussionOpen: boolean;
    planApproval: 'missing' | 'current' | 'stale';
    activeDebug: boolean;
    pendingWork: boolean;
    pendingUat: boolean;
    archiveReady: boolean;
    requiredAuthority: string[];
    hasCheckpoint: boolean;
}
export interface ResumeRouteDecisionV1 {
    route: ResumeRouteV1;
    reasons: string[];
    requiredAuthority: string[];
    automatic: boolean;
    restored: boolean;
}
/** Pure, priority-ordered lifecycle decision shared by status and resume. */
export declare function evaluateResumeRouteV1(input: ResumeRouteEvidenceV1): ResumeRouteDecisionV1;
//# sourceMappingURL=resume-route.d.ts.map