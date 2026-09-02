import path from 'node:path';
export interface PiExperimentWorkspaceV1 {
    readonly root: string;
    read(relativePath: string): Promise<string>;
    write(relativePath: string, content: string): Promise<void>;
    trackedPaths(): string[];
    cleanup(): Promise<void>;
}
export declare function resolveContainedPath(root: string, relativePath: string, pathApi?: path.PlatformPath): string;
export declare function createPiExperimentWorkspace(options?: {
    temporaryRoot?: string;
}): Promise<PiExperimentWorkspaceV1>;
export declare function openPiExperimentWorkspace(root: string): Promise<PiExperimentWorkspaceV1>;
//# sourceMappingURL=experiment-workspace.d.ts.map