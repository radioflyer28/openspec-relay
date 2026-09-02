import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import type { RelayAssuranceV1, RelayConfigV1, RelayRunV1, TaskNodeV1 } from './schemas.js';
export interface SourceReconciliationV1 {
    addedTaskIds: string[];
    removedTaskIds: string[];
    taskStatusChangedIds: string[];
    changedArtifactPaths: string[];
    changedRequirementIds: string[];
    changedScenarioIds: string[];
    staleEvidenceIds: string[];
    unchanged: boolean;
}
export declare function materializeCompiledTasks(compiled: CompiledOpenSpecChangeV1, config: RelayConfigV1): TaskNodeV1[];
export declare function reconcileCompiledOpenSpec(options: {
    run: RelayRunV1;
    assurance: RelayAssuranceV1;
    compiled: CompiledOpenSpecChangeV1;
}): {
    run: RelayRunV1;
    assurance: RelayAssuranceV1;
    reconciliation: SourceReconciliationV1;
};
export declare function reconcileCurrentOpenSpec(options: {
    projectRoot: string;
    changeDir: string;
    changeName: string;
    run: RelayRunV1;
    assurance: RelayAssuranceV1;
}): Promise<ReturnType<typeof reconcileCompiledOpenSpec>>;
//# sourceMappingURL=reconciliation.d.ts.map