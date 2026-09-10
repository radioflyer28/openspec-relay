import { type WorkspaceEntryV1 } from './schemas.js';
export interface WorkspaceSnapshotV1 {
    revisionAvailable: boolean;
    repositoryRevision?: string;
    entries: WorkspaceEntryV1[];
}
export declare function snapshotWorkspaceV1(options: {
    projectRoot: string;
    relevantPaths?: string[];
}): Promise<WorkspaceSnapshotV1>;
export declare function validateWorkspaceSnapshotV1(options: {
    projectRoot: string;
    expected: WorkspaceSnapshotV1;
}): Promise<{
    matches: boolean;
    reasons: string[];
    current: WorkspaceSnapshotV1;
}>;
//# sourceMappingURL=workspace.d.ts.map