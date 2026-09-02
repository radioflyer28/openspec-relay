import { type FindingLifecycleRecordV2, type PortableReferenceV2, type UatScenarioV2 } from './schemas.js';
import type { ScenarioCoverageV1 } from './verification.js';
export declare const REQUIRED_UAT_PROJECTION_ERROR_ID = "relay:required-uat-projection-error";
export declare function requiredUatProjectionError(sourceRevision: string): UatScenarioV2;
export declare function projectUatScenarios(options: {
    coverage: ScenarioCoverageV1[];
    findings: FindingLifecycleRecordV2[];
    taskIdsByScenario?: Record<string, string[]>;
    sourceRevision: string;
}): UatScenarioV2[];
export declare function nextUatScenario(scenarios: UatScenarioV2[]): UatScenarioV2 | undefined;
export declare function recordUatDisposition(options: {
    scenario: UatScenarioV2;
    status: 'passed' | 'failed' | 'blocked' | 'accepted_limitation';
    actor?: string;
    notes: string;
    evidence: PortableReferenceV2[];
    now?: string;
}): {
    scenario: UatScenarioV2;
    finding?: FindingLifecycleRecordV2;
    acceptedRisk?: FindingLifecycleRecordV2;
};
export declare function returnScenarioToRetest(options: {
    scenario: UatScenarioV2;
    independentlyVerified: boolean;
}): UatScenarioV2;
export declare function invalidateUatScenarios(options: {
    scenarios: UatScenarioV2[];
    sourceRevision: string;
}): UatScenarioV2[];
export declare function evaluateUatObligations(options: {
    scenarios: UatScenarioV2[];
}): {
    blocking: string[];
    acceptedLimitations: string[];
};
export declare function uatDispositionId(options: {
    scenario: UatScenarioV2;
    status: 'passed' | 'failed' | 'blocked' | 'accepted_limitation';
    actor: string;
    recordedAt: string;
}): string;
//# sourceMappingURL=uat.d.ts.map