import { type RelayAssuranceV2, type RelayRunV2 } from './schemas.js';
/** Evaluate deterministic evidence and preserve the lifecycle, UAT, readiness,
 * and release obligations that are already projected from the event history. */
export declare function evaluateAssuranceV2(run: RelayRunV2, input: RelayAssuranceV2): {
    checks: RelayAssuranceV2['checks'];
    scenarioCoverage: RelayAssuranceV2['scenarioCoverage'];
    status: RelayAssuranceV2['status'];
    unresolvedHumanActions: string[];
};
//# sourceMappingURL=assurance-v2.d.ts.map