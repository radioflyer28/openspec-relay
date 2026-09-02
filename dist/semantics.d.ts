import { type SemanticClassificationV1, type SemanticDowngradeV1, type SemanticLevel } from './schemas.js';
export interface SemanticRequirementInputV1 {
    id: string;
    title: string;
    body: string;
    scenarios: Array<{
        id?: string;
        title?: string;
        body: string;
    }>;
    sourceDigest?: string;
}
export declare function classifySemanticRequirements(requirements: SemanticRequirementInputV1[]): SemanticClassificationV1[];
export declare function reconcileSemanticClassification(planner: SemanticClassificationV1, reviewer: SemanticClassificationV1): SemanticClassificationV1;
export declare function resolveSemanticClassification(options: {
    requirement: SemanticRequirementInputV1;
    planner?: SemanticClassificationV1;
    reviewer?: SemanticClassificationV1;
    independentReview: boolean;
}): SemanticClassificationV1;
export declare function recordSemanticDowngrade(options: {
    classification: SemanticClassificationV1;
    achievedLevel: SemanticLevel;
    reason?: string;
    actor?: string;
}): SemanticDowngradeV1;
export declare function validateSemanticStructure(options: {
    requirementId: string;
    level: SemanticLevel;
    body: string;
    design: string;
    tasks: string;
}): {
    valid: boolean;
    diagnostics: string[];
};
export declare function validateAchievedAssuranceClaim(options: {
    claim: string;
    officialToolEvidence: string[];
}): string;
//# sourceMappingURL=semantics.d.ts.map