import type { GuardrailsConfigV1 } from './schemas.js';

export type GitOperation = 'commit' | 'branch' | 'worktree';

const CONFIG_KEY: Record<GitOperation, keyof GuardrailsConfigV1['git']> = {
  commit: 'commits',
  branch: 'branches',
  worktree: 'worktrees',
};

export function isGitOperationAllowed(config: GuardrailsConfigV1, operation: GitOperation): boolean {
  return config.git[CONFIG_KEY[operation]];
}

export function assertGitOperationAllowed(
  config: GuardrailsConfigV1,
  operation: GitOperation,
): void {
  if (!isGitOperationAllowed(config, operation)) {
    throw new Error(`Git ${operation} automation is disabled; enable it explicitly before use.`);
  }
}

export function plannedGitOperations(config: GuardrailsConfigV1): GitOperation[] {
  return (['branch', 'worktree', 'commit'] as const)
    .filter((operation) => isGitOperationAllowed(config, operation));
}
