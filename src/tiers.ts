import type { HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import type { ExecutionTier, GuardrailsConfigV1 } from './schemas.js';
import type { RepositoryAnalysisAdapterV2 } from './repository-context.js';
import type { ReadinessEvaluatorV2 } from './readiness.js';

export interface TierDecisionV1 {
  tier: ExecutionTier;
  requested: ExecutionTier;
  downgraded: boolean;
  diagnostics: string[];
}

export interface TierAdaptersV1 {
  dispatcher: boolean;
  worktrees: boolean;
  repositoryAnalyzer: RepositoryAnalysisAdapterV2;
  readinessEvaluator: ReadinessEvaluatorV2;
}

export function negotiateExecutionTier(
  capabilities: HostCapabilitiesV1,
  config: GuardrailsConfigV1,
  adapters: Partial<TierAdaptersV1> = {},
): TierDecisionV1 {
  const requested = config.requestedTier ?? 'tier0';
  const diagnostics: string[] = [];
  const tier1 = capabilities.agentDispatch && config.allowAgentDispatch && adapters.dispatcher === true;
  const tier2 = tier1 && capabilities.parallelism && capabilities.worktrees &&
    config.allowParallel && config.git.worktrees && adapters.worktrees === true;
  let tier: ExecutionTier = 'tier0';
  if (requested === 'tier2' && tier2) tier = 'tier2';
  else if ((requested === 'tier2' || requested === 'tier1') && tier1) tier = 'tier1';
  if (tier !== requested) {
    const missing: string[] = [];
    if ((requested === 'tier1' || requested === 'tier2') && !adapters.dispatcher) {
      missing.push('registered host dispatcher');
    }
    if (requested === 'tier2' && !adapters.worktrees) missing.push('registered worktree adapter');
    diagnostics.push(
      `Requested ${requested} is unavailable or not explicitly enabled` +
      `${missing.length ? ` (${missing.join(', ')})` : ''}; ` +
      `using ${tier} without changing assurance requirements.`,
    );
  }
  return { tier, requested, downgraded: tier !== requested, diagnostics };
}
