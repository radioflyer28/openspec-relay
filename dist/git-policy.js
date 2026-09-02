const CONFIG_KEY = {
    commit: 'commits',
    branch: 'branches',
    worktree: 'worktrees',
};
export function isGitOperationAllowed(config, operation, adapters = {}) {
    return config.git[CONFIG_KEY[operation]] && adapters[operation] === true;
}
export function assertGitOperationAllowed(config, operation, adapters = {}) {
    if (!isGitOperationAllowed(config, operation, adapters)) {
        throw new Error(`Git ${operation} automation requires both explicit permission and a registered host adapter.`);
    }
}
export function plannedGitOperations(config, adapters = {}) {
    return ['branch', 'worktree', 'commit']
        .filter((operation) => isGitOperationAllowed(config, operation, adapters));
}
//# sourceMappingURL=git-policy.js.map