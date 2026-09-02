import { type ConfiguredReleaseCommandV2, type ReleaseCandidateV2, type RunMode } from './schemas.js';
export declare const SUPPORTED_RELEASE_MANIFESTS: {
    readonly node_package: {
        readonly filename: "package.json";
        readonly fields: readonly ["name", "version", "exports", "bin", "peerDependencies"];
    };
    readonly openspec_extension: {
        readonly filename: "openspec-extension.json";
        readonly fields: readonly ["id", "version", "contributes"];
    };
    readonly codex_plugin: {
        readonly filename: ".codex-plugin/plugin.json";
        readonly fields: readonly ["name", "version"];
    };
};
export interface ReleaseCommandV2 {
    command: string;
    args: string[];
    cwd?: string;
    timeoutMs?: number;
    expectedArtifacts?: string[];
    env?: Record<string, string>;
    allowedRoot?: string;
}
export interface HostReleaseRunnerV2 {
    run(request: Readonly<ReleaseCommandV2>): Promise<Readonly<{
        exitCode: number;
        outputDigest: string;
    }>>;
}
type ReleaseCheck = ReleaseCandidateV2['checks'][number];
export interface NodeReleaseVerificationV2 {
    status: ReleaseCandidateV2['status'];
    artifactDigest?: string;
    checks: ReleaseCheck[];
}
export declare function detectReleaseApplicability(options: {
    projectRoot: string;
    changedFiles?: string[];
    impactUnknown?: string;
    config?: Partial<{
        enabled: 'auto' | 'always' | 'off';
        disabledReason: string;
        surfaces: string[];
        configuredCommands: ConfiguredReleaseCommandV2[];
        requiredPlatforms: Array<'linux' | 'macos' | 'windows'>;
        buildCommand: ConfiguredReleaseCommandV2;
    }>;
}): Promise<ReleaseCandidateV2[]>;
export declare function assertReleaseCommandSafe(command: string, args: string[]): void;
export declare function createNodePackageReleasePlan(options: {
    packageRoot: string;
    mode: RunMode;
}): Promise<{
    artifactDirectory: string;
    sourceDirectory: string;
    installDirectory: string;
    commands: ReleaseCommandV2[];
}>;
export declare function runLocalReleaseCommand(options: ReleaseCommandV2): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
/**
 * Pack locally, install the exact artifact into a disposable project, and
 * smoke its declared public entries. Publishing and install lifecycle scripts
 * are deliberately excluded from this verifier.
 */
export declare function verifyNodePackageRelease(options: {
    packageRoot: string;
    mode: RunMode;
    manifestSurfaces?: Array<'extension' | 'plugin'>;
    buildCommand?: ConfiguredReleaseCommandV2;
    releaseRunner?: HostReleaseRunnerV2;
}): Promise<NodeReleaseVerificationV2>;
export declare function runConfiguredReleaseCommand(options: {
    projectRoot: string;
    configuredCommand: ConfiguredReleaseCommandV2;
    releaseRunner?: HostReleaseRunnerV2;
}): Promise<ReleaseCandidateV2>;
/** Execute all currently applicable release surfaces without publishing or
 * touching registries. Each returned candidate replaces only its own prior
 * event projection, so the v2 event history remains append-only. */
export declare function executeReleaseCandidates(options: {
    packageRoot: string;
    candidates: ReleaseCandidateV2[];
    mode: RunMode;
    config: {
        configuredCommands: ConfiguredReleaseCommandV2[];
        requiredPlatforms?: Array<'linux' | 'macos' | 'windows'>;
        buildCommand?: ConfiguredReleaseCommandV2;
    };
    releaseRunner?: HostReleaseRunnerV2;
}): Promise<ReleaseCandidateV2[]>;
export declare function hashReleaseArtifact(filename: string): Promise<string>;
export declare function inspectNodePackageMetadata(packageRoot: string): Promise<{
    packageName: string;
    version: string;
    exports: string[];
    bins: string[];
    peerDependencies: Record<string, string>;
    buildScript?: string;
}>;
export declare function createCleanInstallProject(options: {
    packageName: string;
    artifactPath: string;
}): Promise<string>;
export declare function createExtensionReleasePlan(options: {
    packageRoot: string;
    mode: RunMode;
}): Promise<{
    workspace: string;
    commands: ReleaseCommandV2[];
}>;
export declare function selectReleaseChecks(mode: RunMode): string[];
export declare function evaluateReleasePolicy(options: {
    packageManifest: {
        version?: string;
    };
    publicChange: boolean;
    changesetPresent: boolean;
    installDocumented: boolean;
    testedDependencyVersions?: Record<string, string>;
    compatibilityRanges?: Record<string, string>;
}): {
    status: 'pass' | 'fail';
    checks: Array<{
        checkId: string;
        status: 'pass' | 'fail';
        summary: string;
    }>;
};
export declare function createConfiguredCommandPlan(options: {
    command: string;
    args: string[];
    expectedArtifacts: string[];
    timeoutMs?: number;
}, authorization?: 'configured-distribution' | 'explicit-build'): ReleaseCommandV2;
export {};
//# sourceMappingURL=release-assurance.d.ts.map