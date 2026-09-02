import { type HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import { readEventStoreV2 } from './events.js';
import { type RelayAssuranceV2, type RelayConfigV2, type RelayRunV2 } from './schemas.js';
import { type TierAdaptersV1 } from './tiers.js';
export declare const DEFAULT_HOST_CAPABILITIES: HostCapabilitiesV1;
export interface StartRunResultV2 {
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
    blockedBeforeExecution: boolean;
}
export declare function startRelayRunV2(options: {
    change: string;
    projectRoot?: string;
    config?: Partial<RelayConfigV2>;
    hostCapabilities?: HostCapabilitiesV1;
    adapters?: Partial<TierAdaptersV1>;
    changedFiles?: string[];
    now?: string;
}): Promise<StartRunResultV2>;
export declare function currentRunV2(changeDir: string): Promise<ReturnType<typeof readEventStoreV2>>;
export declare function checkRelayRunV2(options: {
    change: string;
    projectRoot?: string;
    changedFiles?: string[];
    adapters?: Partial<TierAdaptersV1>;
    now?: string;
}): Promise<{
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
}>;
//# sourceMappingURL=runner-v2.d.ts.map