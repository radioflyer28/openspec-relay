import type { GsdConfigV1 } from './schemas.js';

export type GitOperation = 'commit' | 'branch' | 'worktree';
export type GitAdapterCapabilitiesV1 = Record<GitOperation, boolean>;

const CONFIG_KEY: Record<GitOperation, keyof GsdConfigV1['git']> = {
  commit: 'commits',
  branch: 'branches',
  worktree: 'worktrees',
};

export function isGitOperationAllowed(
  config: GsdConfigV1,
  operation: GitOperation,
  adapters: Partial<GitAdapterCapabilitiesV1> = {},
): boolean {
  return config.git[CONFIG_KEY[operation]] && adapters[operation] === true;
}

export function assertGitOperationAllowed(
  config: GsdConfigV1,
  operation: GitOperation,
  adapters: Partial<GitAdapterCapabilitiesV1> = {},
): void {
  if (!isGitOperationAllowed(config, operation, adapters)) {
    throw new Error(
      `Git ${operation} automation requires both explicit permission and a registered host adapter.`,
    );
  }
}

export function plannedGitOperations(
  config: GsdConfigV1,
  adapters: Partial<GitAdapterCapabilitiesV1> = {},
): GitOperation[] {
  return (['branch', 'worktree', 'commit'] as const)
    .filter((operation) => isGitOperationAllowed(config, operation, adapters));
}
