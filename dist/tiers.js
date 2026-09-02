export function negotiateExecutionTier(capabilities, config, adapters = {}) {
    const requested = config.requestedTier ?? 'tier0';
    const diagnostics = [];
    const tier1 = capabilities.agentDispatch && config.allowAgentDispatch && adapters.dispatcher === true;
    const tier2 = tier1 && capabilities.parallelism && capabilities.worktrees &&
        config.allowParallel && config.git.worktrees && adapters.worktrees === true;
    let tier = 'tier0';
    if (requested === 'tier2' && tier2)
        tier = 'tier2';
    else if ((requested === 'tier2' || requested === 'tier1') && tier1)
        tier = 'tier1';
    if (tier !== requested) {
        const missing = [];
        if ((requested === 'tier1' || requested === 'tier2') && !adapters.dispatcher) {
            missing.push('registered host dispatcher');
        }
        if (requested === 'tier2' && !adapters.worktrees)
            missing.push('registered worktree adapter');
        diagnostics.push(`Requested ${requested} is unavailable or not explicitly enabled` +
            `${missing.length ? ` (${missing.join(', ')})` : ''}; ` +
            `using ${tier} without changing assurance requirements.`);
    }
    return { tier, requested, downgraded: tier !== requested, diagnostics };
}
//# sourceMappingURL=tiers.js.map