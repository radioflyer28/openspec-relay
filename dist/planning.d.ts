import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { type PlanApprovalV1, type SemanticLevel } from './schemas.js';
export interface SemanticPlanRevisionV1 {
    revision: string;
    artifactDigests: Record<string, string>;
}
export declare const PLANNING_EVENT_TYPES: readonly ["semantic.classified", "semantic.downgrade_recorded", "pathfinder.completed", "plan.reviewed", "finding.routed", "plan.approved", "plan.stale"];
export declare function normalizeTaskCompletionMarkers(content: string): string;
export declare function computeSemanticPlanRevision(options: {
    changeDir: string;
    compiled: CompiledOpenSpecChangeV1;
}): Promise<SemanticPlanRevisionV1>;
export declare function createPlanApproval(options: {
    revision: string;
    approvedAt: string;
    independent: boolean;
    reviewerId?: string;
    semanticLevels?: Array<{
        requirementId: string;
        level: SemanticLevel;
    }>;
    openDispositionIds?: string[];
    evidenceRefs?: string[];
}): PlanApprovalV1;
export declare function isPlanApprovalCurrent(approval: PlanApprovalV1 | undefined, revision: string): boolean;
//# sourceMappingURL=planning.d.ts.map