import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { type ReadinessResultV2, type RepositoryContextV2 } from './schemas.js';
export type ReadinessEvaluatorTierV2 = 'tier0' | 'tier1' | 'tier2';
export interface ReadinessEvaluatorContractV2 {
    readOnly: true;
    tier: ReadinessEvaluatorTierV2;
    independent: true;
}
export interface ReadinessEvaluatorV2 {
    evaluate(request: Readonly<{
        contract: ReadinessEvaluatorContractV2;
        deterministicResult: ReadinessResultV2;
    }>): Promise<ReadinessResultV2>;
}
export interface PlanAssumptionV2 {
    id: string;
    summary: string;
    supported: boolean;
}
export declare function createReadinessEvaluatorContract(options: {
    tier: ReadinessEvaluatorTierV2;
}): ReadinessEvaluatorContractV2;
export declare function deriveArtifactAssumptions(compiled: CompiledOpenSpecChangeV1): PlanAssumptionV2[];
export declare function readinessInputRevision(options: {
    compiled: CompiledOpenSpecChangeV1;
    repositoryContext: RepositoryContextV2;
    assumptions?: Array<{
        id: string;
        summary: string;
        supported: boolean;
    }>;
}): string;
export declare function evaluatePlanReadiness(options: {
    changeName: string;
    compiled: CompiledOpenSpecChangeV1;
    repositoryContext: RepositoryContextV2;
    assumptions?: Array<{
        id: string;
        summary: string;
        supported: boolean;
    }>;
    proposedWaves?: string[][];
    tier?: ReadinessEvaluatorTierV2;
    adapter?: ReadinessEvaluatorV2;
    actorKind?: 'automation' | 'executor' | 'reviewer' | 'verifier' | 'host' | 'analyzer';
    now?: string;
}): ReadinessResultV2;
export declare function evaluatePlanReadinessWithAdapter(options: Omit<Parameters<typeof evaluatePlanReadiness>[0], 'adapter'> & {
    adapter: ReadinessEvaluatorV2;
}): Promise<ReadinessResultV2>;
export declare function invalidateReadinessResult(options: {
    result: ReadinessResultV2;
    inputRevision: string;
}): ReadinessResultV2;
//# sourceMappingURL=readiness.d.ts.map