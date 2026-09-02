import { promises as fs } from 'node:fs';
import path from 'node:path';
import { type RelayAssuranceV1, type RelayAssuranceV2, type RelayRunV1, type RelayRunV2 } from './schemas.js';
export interface ResolvedChange {
    projectRoot: string;
    changeDir: string;
    changeName: string;
    archived: boolean;
    changeRef: string;
}
/**
 * Every generated path owned by OpenSpec Relay. Values are portable identities;
 * callers must use relayGeneratedPath() at a filesystem boundary.
 */
export declare const RELAY_GENERATED_FILES: {
    readonly run: "run.json";
    readonly assurance: "assurance.json";
    readonly events: "events.json";
};
export type RelayGeneratedFile = keyof typeof RELAY_GENERATED_FILES;
export declare function resolveProjectRoot(start?: string): Promise<string>;
export declare function resolveChangePathForPlatform(projectRoot: string, change: string, pathApi?: path.PlatformPath): string;
export declare function resolveChangeDirectory(options: {
    projectRoot?: string;
    change: string;
}): Promise<ResolvedChange>;
export declare function relayDirectory(changeDir: string, pathApi?: path.PlatformPath): string;
export declare function relayGeneratedPath(changeDir: string, file: RelayGeneratedFile, pathApi?: path.PlatformPath): string;
export declare function runStatePath(changeDir: string): string;
export declare function assuranceStatePath(changeDir: string): string;
/**
 * Validate that a registered OpenSpec Relay path is contained by the active change
 * and that its existing ancestors are ordinary directories rather than links.
 */
export declare function assertRelayGeneratedPath(options: {
    changeDir: string;
    filename: string;
    createParents?: boolean;
    allowMissingFile?: boolean;
}): Promise<string>;
export declare function readRelayText(changeDir: string, filename: string): Promise<string>;
export declare function digestJson(value: unknown): string;
export declare function atomicWriteJson(filename: string, value: unknown, operations?: {
    rename?: typeof fs.rename;
}): Promise<void>;
export declare function atomicWriteText(filename: string, content: string, operations?: {
    rename?: typeof fs.rename;
}): Promise<void>;
export declare function atomicWriteRelayJson(changeDir: string, filename: string, value: unknown, operations?: {
    beforeCommit?: () => Promise<void>;
    failBeforeCommit?: boolean;
}): Promise<void>;
export declare function removeRelayGeneratedFile(changeDir: string, filename: string, operations?: {
    beforeRemove?: () => Promise<void>;
}): Promise<void>;
export declare function readRunState(changeDir: string): Promise<RelayRunV1>;
export declare function readAssuranceState(changeDir: string): Promise<RelayAssuranceV1>;
export declare function readRunStateV2(changeDir: string): Promise<RelayRunV2>;
export declare function readAssuranceStateV2(changeDir: string): Promise<RelayAssuranceV2>;
export declare function writeRunState(changeDir: string, run: RelayRunV1): Promise<void>;
export declare function writeAssuranceState(changeDir: string, assurance: RelayAssuranceV1, run?: RelayRunV1): Promise<string>;
export declare function writeRunStateV2(changeDir: string, run: RelayRunV2): Promise<void>;
export declare function writeAssuranceStateV2(changeDir: string, assurance: RelayAssuranceV2, run?: RelayRunV2): Promise<string>;
//# sourceMappingURL=state.d.ts.map