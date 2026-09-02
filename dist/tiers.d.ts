import type { HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import type { ExecutionTier, RelayConfigV1 } from './schemas.js';
import type { RepositoryAnalysisAdapterV2 } from './repository-context.js';
import type { ReadinessEvaluatorV2 } from './readiness.js';
import type { HostReleaseRunnerV2 } from './release-assurance.js';
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
    releaseRunner: HostReleaseRunnerV2;
}
export declare function negotiateExecutionTier(capabilities: HostCapabilitiesV1, config: RelayConfigV1, adapters?: Partial<TierAdaptersV1>): TierDecisionV1;
//# sourceMappingURL=tiers.d.ts.map