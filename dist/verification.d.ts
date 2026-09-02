import type { EvidenceV1, ScenarioCoverageV1Schema, VerificationFindingV1 } from './schemas.js';
import type { z } from 'zod';
export type ScenarioCoverageV1 = z.infer<typeof ScenarioCoverageV1Schema>;
export interface ReadOnlyVerificationContractV1 {
    artifactRefs: readonly string[];
    requirementIds: readonly string[];
    evidence: readonly Readonly<EvidenceV1>[];
    writeAccess: false;
}
export declare function createReadOnlyVerificationContract(options: {
    artifactRefs: string[];
    requirementIds: string[];
    evidence: EvidenceV1[];
}): Readonly<ReadOnlyVerificationContractV1>;
export declare function mapScenarioCoverage(options: {
    scenarioIds: string[];
    evidence: EvidenceV1[];
    humanNeeded?: Record<string, string>;
}): ScenarioCoverageV1[];
export declare function validateIndependentVerification(options: {
    requirementIds: string[];
    findings: VerificationFindingV1[];
    evidence: EvidenceV1[];
}): {
    valid: boolean;
    diagnostics: string[];
    evidenceIds: string[];
};
//# sourceMappingURL=verification.d.ts.map