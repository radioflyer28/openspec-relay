import type { HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import type { ExecutionTier, GuardrailsConfigV1 } from './schemas.js';

export interface TierDecisionV1 {
  tier: ExecutionTier;
  requested: ExecutionTier;
  downgraded: boolean;
  diagnostics: string[];
}

export function negotiateExecutionTier(
  capabilities: HostCapabilitiesV1,
  config: GuardrailsConfigV1,
): TierDecisionV1 {
  const requested = config.requestedTier ?? 'tier0';
  const diagnostics: string[] = [];
  const tier1 = capabilities.agentDispatch && config.allowAgentDispatch;
  const tier2 = tier1 && capabilities.parallelism && capabilities.worktrees &&
    config.allowParallel && config.git.worktrees;
  let tier: ExecutionTier = 'tier0';
  if (requested === 'tier2' && tier2) tier = 'tier2';
  else if ((requested === 'tier2' || requested === 'tier1') && tier1) tier = 'tier1';
  if (tier !== requested) {
    diagnostics.push(
      `Requested ${requested} is unavailable or not explicitly enabled; using ${tier} without changing assurance requirements.`,
    );
  }
  return { tier, requested, downgraded: tier !== requested, diagnostics };
}
