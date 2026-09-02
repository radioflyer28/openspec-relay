import type { HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import { type RoleDispatcherV1 } from './execution-adapters.js';
import { type RelayAssuranceV2, type RelayConfigV2, type RelayRunV2, type HostAdapterProvenanceV1, type PathfinderResultV1, type PlanReviewResultV1 } from './schemas.js';
export interface DisposablePathfinderWorkspaceV1 {
    create(pathfinderId: string): Promise<string>;
    cleanup(pathfinderId: string, workspace: string): Promise<void>;
}
export interface PlanRelayChangeOptionsV1 {
    change: string;
    projectRoot?: string;
    invocation?: 'initial_plan' | 'do_replan';
    config?: Partial<RelayConfigV2>;
    hostCapabilities?: HostCapabilitiesV1;
    /** Read-only assurance authority supplied by hosts that intentionally do not
     * grant this workflow a writable planner child. */
    assuranceDispatcher?: RoleDispatcherV1;
    dispatcher?: RoleDispatcherV1;
    pathfinderQuestions?: string[];
    pathfinderWorkspaces?: DisposablePathfinderWorkspaceV1;
    plannerInstructions?: string[];
    findingIds?: string[];
    allowSelfReview?: boolean;
    changedFiles?: string[];
    readOnlyConcurrency?: number;
    signal?: AbortSignal;
    hostAdapter?: HostAdapterProvenanceV1;
    now?: string;
}
export interface PlanRelayChangeResultV1 {
    status: 'pass' | 'fail' | 'human_needed' | 'error';
    summary: string;
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
    review: PlanReviewResultV1;
    pathfinderResults: PathfinderResultV1[];
    cycles: number;
    nextAction?: string;
}
/** Reusable initial-plan and do-replan orchestration. The only writable planning
 * authority is the planner, and it may edit only the standard OpenSpec
 * proposal/spec/design/tasks artifacts named in the request. */
export declare function planRelayChangeV1(options: PlanRelayChangeOptionsV1): Promise<PlanRelayChangeResultV1>;
//# sourceMappingURL=plan-workflow.d.ts.map