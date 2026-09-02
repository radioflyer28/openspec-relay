import type { ExecutionGraphV1 } from './graph.js';
import { type ExecutionTier, type FindingLifecycleRecordV2, type RelayEventPayloadV1, type PortableReferenceV2, type SemanticClassificationV1 } from './schemas.js';
export type ExecutionRole = 'planner' | 'plan_reviewer' | 'pathfinder' | 'executor' | 'reviewer' | 'verifier';
export interface PlanningRoleContextV1 {
    changeName: string;
    planRevision: string;
    invocation: 'initial_plan' | 'do_replan';
    artifactRefs: string[];
    plannerInstructions: string[];
    semanticObligations: string[];
    evidenceRequirements: string[];
    findingIds?: string[];
    pathfinderQuestion?: string;
    disposableExperimentWorkspace?: boolean;
}
export interface RoleRequestV1 {
    role: ExecutionRole;
    taskId?: string;
    readOnly: boolean;
    isolated: boolean;
    workspace?: string;
    planning?: PlanningRoleContextV1;
}
export interface RoleResultV1 {
    status: 'pass' | 'fail' | 'error';
    summary: string;
    evidenceRefs: string[];
    evidence?: PortableReferenceV2[];
    findings?: ReportedFindingV2[];
    events?: RelayEventPayloadV1[];
    semanticClassifications?: SemanticClassificationV1[];
    pathfinder?: {
        assumptions: string[];
        experiments: string[];
        observations: string[];
        counterexamples: string[];
        conclusion: string;
        confidence: 'high' | 'medium' | 'low';
        routing: 'planner' | 'discussion' | 'human_needed';
    };
    scopeExpansion?: boolean;
}
/** A reviewer/verifier report deliberately omits findingId. OpenSpec Relay derives
 * stable identities from provider, rule, category, and scope. */
export interface ReportedFindingV2 {
    providerId: string;
    ruleId: string;
    category: string;
    scope: FindingLifecycleRecordV2['scope'];
    severity: FindingLifecycleRecordV2['severity'];
    blocking: boolean;
    summary: string;
    requirementIds?: string[];
    taskIds?: string[];
    evidence?: PortableReferenceV2[];
}
export interface RoleDispatcherV1 {
    dispatch(request: Readonly<RoleRequestV1>): Promise<RoleResultV1>;
}
export interface DispatchedRoleResultV2 {
    readonly dispatchId: string;
    readonly request: Readonly<RoleRequestV1>;
    readonly result: Readonly<RoleResultV1>;
}
/** Dispatch through the orchestrator and return a process-local opaque receipt.
 * Ordinary callers cannot synthesize a receipt by choosing a role label. */
export declare function dispatchRoleV2(options: {
    dispatcher: RoleDispatcherV1;
    request: RoleRequestV1;
}): Promise<DispatchedRoleResultV2>;
export declare function assertDispatchedRoleResultV2(receipt: DispatchedRoleResultV2, expectedRole?: ExecutionRole): void;
export interface WorktreeAdapterV1 {
    create(taskId: string): Promise<string>;
    merge(taskId: string, workspace: string): Promise<void>;
    cleanup(taskId: string, workspace: string): Promise<void>;
}
export interface ExecutionOutcomeV1 {
    tier: ExecutionTier;
    tasks: Array<{
        taskId: string;
        status: RoleResultV1['status'];
        summary: string;
        evidenceRefs: string[];
        events?: RelayEventPayloadV1[];
    }>;
    review?: RoleResultV1;
    reviewReceipt?: DispatchedRoleResultV2;
    verification?: RoleResultV1;
    verificationReceipt?: DispatchedRoleResultV2;
    stoppedAfterFailure: boolean;
}
export declare function executeWithTier(options: {
    tier: ExecutionTier;
    graph: ExecutionGraphV1;
    dispatcher: RoleDispatcherV1;
    worktrees?: WorktreeAdapterV1;
}): Promise<ExecutionOutcomeV1>;
//# sourceMappingURL=execution-adapters.d.ts.map