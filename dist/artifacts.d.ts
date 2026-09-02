import path from 'node:path';
import { type ExecutionGraphV1 } from './graph.js';
import type { ArtifactReferenceV1Schema, TaskNodeV1, TddPolicy } from './schemas.js';
import type { z } from 'zod';
export type ArtifactReferenceV1 = z.infer<typeof ArtifactReferenceV1Schema>;
export interface TaskMetadataV1 {
    dependencies?: string[];
    risk?: TaskNodeV1['risk'];
    expectedVerification?: string[];
    writeSet?: string[];
    requirementRefs?: string[];
    scenarioRefs?: string[];
    tdd?: TddPolicy;
}
export interface CompiledOpenSpecChangeV1 {
    artifacts: ArtifactReferenceV1[];
    graph: ExecutionGraphV1;
    requirements: CompiledRequirementV1[];
    requirementIds: string[];
    scenarioIds: string[];
    routingText: string;
    taskAdapter: 'openspec-apply-json-v1' | 'markdown-v1';
    requirementAdapter: 'openspec-show-json-v1' | 'markdown-v1';
}
export interface CompiledScenarioV1 {
    id: string;
    title: string;
    body: string;
    sourcePath: string;
    sourceDigest: string;
}
export interface CompiledRequirementV1 {
    id: string;
    title: string;
    body: string;
    scenarios: CompiledScenarioV1[];
    sourcePath: string;
    sourceDigest: string;
}
export interface OpenSpecMachineReadableTaskV1 {
    id: string;
    description: string;
    done: boolean;
}
export interface OpenSpecMachineReadableSnapshotV1 {
    adapterVersion: 'openspec-apply-json-v1';
    tasks: OpenSpecMachineReadableTaskV1[];
    requirements?: Array<{
        spec: string;
        text: string;
    }>;
}
export declare function resolveContainedArtifactPath(changeDir: string, artifactPath: string, pathApi?: path.PlatformPath): string;
export declare function assertStableTaskBinding(task: TaskNodeV1): void;
export declare function compileOpenSpecChange(options: {
    changeDir: string;
    taskMetadata?: Record<string, TaskMetadataV1>;
    machineReadable?: OpenSpecMachineReadableSnapshotV1;
}): Promise<CompiledOpenSpecChangeV1>;
//# sourceMappingURL=artifacts.d.ts.map