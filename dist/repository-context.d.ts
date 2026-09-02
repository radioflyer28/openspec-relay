import path from 'node:path';
import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import type { PortableReferenceV2, RepositoryContextV2 } from './schemas.js';
export type RepositoryAnalysisTierV2 = 'tier0' | 'tier1' | 'tier2';
export interface RepositoryAnalysisContractV2 {
    readOnly: true;
    tier: RepositoryAnalysisTierV2;
}
export interface RepositoryAnalysisAdapterV2 {
    analyze(request: Readonly<{
        contract: RepositoryAnalysisContractV2;
        deterministicContext: RepositoryContextV2;
    }>): Promise<RepositoryContextV2>;
}
export interface RepositoryChangedFilesV2 {
    files: string[];
    source: 'git' | 'unknown';
    comparisonBase?: string;
    unresolved?: string;
}
export declare function createRepositoryAnalysisContract(options: {
    tier: RepositoryAnalysisTierV2;
}): RepositoryAnalysisContractV2;
export declare function portableRepositoryPath(root: string, filename: string, pathApi?: path.PlatformPath): string;
export declare function discoverRepositoryChangedFiles(projectRoot: string, comparisonBase?: string): Promise<RepositoryChangedFilesV2>;
export declare function compileRepositoryContext(options: {
    projectRoot: string;
    changeDir: string;
    changeName: string;
    compiled: CompiledOpenSpecChangeV1;
    changedFiles?: string[];
    comparisonBase?: string;
    impactUnknown?: string;
    boundaries?: string[];
    tier?: RepositoryAnalysisTierV2;
    adapter?: RepositoryAnalysisAdapterV2;
    now?: string;
}): Promise<RepositoryContextV2>;
export declare function bindRepositoryEvidenceDigests(options: {
    projectRoot: string;
    evidence: PortableReferenceV2[];
}): Promise<PortableReferenceV2[]>;
export declare function computeMaterialRevision(options: {
    projectRoot: string;
    compiled: CompiledOpenSpecChangeV1;
    context?: RepositoryContextV2;
    evidence?: PortableReferenceV2[];
}): Promise<string>;
export declare function invalidateRepositoryContext(options: {
    context: RepositoryContextV2;
    changedReferenceIds: string[];
}): RepositoryContextV2;
export declare function findRepositoryScopeGaps(options: {
    compiled: CompiledOpenSpecChangeV1;
    context: RepositoryContextV2;
}): Array<{
    kind: 'repository_scope_gap';
    referenceIds: string[];
    remediation: string;
}>;
//# sourceMappingURL=repository-context.d.ts.map