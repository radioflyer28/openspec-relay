import { type DispatchedRoleResultV2 } from './execution-adapters.js';
import { type FindingRouteV1 } from './schemas.js';
/** Derive privileged finding provenance and routing only from an opaque
 * orchestrator receipt. Callers cannot self-select reviewer/verifier authority
 * or stable finding identity. */
export declare function routeDispatchedFindingsV1(options: {
    receipt: DispatchedRoleResultV2;
    planRevision: string;
    attempt: number;
}): FindingRouteV1[];
//# sourceMappingURL=finding-routing.d.ts.map