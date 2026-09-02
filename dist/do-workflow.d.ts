import { type RoleDispatcherV1 } from './execution-adapters.js';
import type { RelayAssuranceV2, RelayRunV2, PortableReferenceV2, SemanticClassificationV1 } from './schemas.js';
export interface CanonicalApplyRequestV1 {
    changeName: string;
    taskId: string;
    action: 'implement' | 'repair';
    approvedRevision: string;
    plannerInstructions: string[];
    semanticObligations: SemanticClassificationV1[];
    scenarioIds: string[];
    risk: string;
    tdd: string;
    findingIds: string[];
    evidenceRequirements: string[];
    capability: '$openspec-apply-change';
}
export interface CanonicalApplyResultV1 {
    status: 'pass' | 'fail' | 'human_needed' | 'error';
    summary: string;
    evidence?: PortableReferenceV2[];
}
export interface CanonicalApplyCapabilityV1 {
    apply(request: Readonly<CanonicalApplyRequestV1>): Promise<CanonicalApplyResultV1>;
}
export interface DoRelayChangeResultV1 {
    status: 'pass' | 'fail' | 'human_needed' | 'error';
    summary: string;
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
    applyCalls: number;
    convergenceCycles: number;
    nextAction?: string;
}
export declare function assertCurrentPlanApprovalV1(options: {
    change: string;
    projectRoot?: string;
}): Promise<{
    changeName: string;
    revision: string;
    independent: boolean;
}>;
/** Closed execution convergence around canonical OpenSpec apply. This function
 * selects approved task context and assurance roles; the supplied canonical
 * apply capability owns implementation and checkbox updates. */
export declare function doRelayChangeV1(options: {
    change: string;
    projectRoot?: string;
    applyCapability: CanonicalApplyCapabilityV1;
    dispatcher: RoleDispatcherV1;
    /** Defaults to true for legacy hosts. Pi sets this false because its child
     * dispatcher is deliberately assurance-only; the parent owns planning. */
    allowWritablePlannerDispatch?: boolean;
    changedFiles?: string[];
    now?: string;
}): Promise<DoRelayChangeResultV1>;
//# sourceMappingURL=do-workflow.d.ts.map