import type { RelayConfigV1 } from './schemas.js';
export type GitOperation = 'commit' | 'branch' | 'worktree';
export type GitAdapterCapabilitiesV1 = Record<GitOperation, boolean>;
export declare function isGitOperationAllowed(config: RelayConfigV1, operation: GitOperation, adapters?: Partial<GitAdapterCapabilitiesV1>): boolean;
export declare function assertGitOperationAllowed(config: RelayConfigV1, operation: GitOperation, adapters?: Partial<GitAdapterCapabilitiesV1>): void;
export declare function plannedGitOperations(config: RelayConfigV1, adapters?: Partial<GitAdapterCapabilitiesV1>): GitOperation[];
//# sourceMappingURL=git-policy.d.ts.map