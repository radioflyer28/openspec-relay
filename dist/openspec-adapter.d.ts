import type { TaskMetadataV1 } from './artifacts.js';
import { type CompiledOpenSpecChangeV1, type OpenSpecMachineReadableSnapshotV1 } from './artifacts.js';
export type OpenSpecJsonExecutorV1 = (args: string[], cwd: string) => Promise<unknown>;
export declare function loadOpenSpecMachineReadableSnapshot(options: {
    projectRoot: string;
    changeName: string;
    execute?: OpenSpecJsonExecutorV1;
}): Promise<OpenSpecMachineReadableSnapshotV1 | undefined>;
export declare function compileCurrentOpenSpecChange(options: {
    projectRoot: string;
    changeName: string;
    changeDir: string;
    taskMetadata?: Record<string, TaskMetadataV1>;
    execute?: OpenSpecJsonExecutorV1;
}): Promise<CompiledOpenSpecChangeV1>;
//# sourceMappingURL=openspec-adapter.d.ts.map