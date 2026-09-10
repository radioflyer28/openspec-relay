import { type ResumeRouteDecisionV1 } from './resume-route.js';
import { type LifecycleStageV1, type PauseCheckpointV1, type PauseDispatchV1, type RelayAssuranceV2, type RelayRunV2, type ResumeRouteV1 } from './schemas.js';
export interface PauseRelayResultV1 {
    checkpoint: PauseCheckpointV1;
    appended: boolean;
    safe: boolean;
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
}
export declare function pauseRelayChangeV1(options: {
    change: string;
    projectRoot?: string;
    stage?: LifecycleStageV1;
    activity?: PauseCheckpointV1['activity'];
    taskIds?: string[];
    dispatches?: PauseDispatchV1[];
    now?: string;
}): Promise<PauseRelayResultV1>;
export interface ResumeRelayResultV1 {
    resumed: boolean;
    reconstructed: boolean;
    decision: ResumeRouteDecisionV1;
    drift: string[];
    invocation?: unknown;
}
export declare function resumeRelayChangeV1(options: {
    change: string;
    projectRoot?: string;
    invoke?: (route: ResumeRouteV1) => Promise<unknown>;
    now?: string;
}): Promise<ResumeRelayResultV1>;
//# sourceMappingURL=pause-resume.d.ts.map