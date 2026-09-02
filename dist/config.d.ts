import { type RelayConfigV1, type RelayConfigV2 } from './schemas.js';
export declare function loadRelayConfig(options: {
    projectRoot: string;
    changeDir: string;
    overrides?: Partial<RelayConfigV1>;
}): Promise<RelayConfigV1>;
export declare function loadRelayConfigV2(options: {
    projectRoot: string;
    changeDir: string;
    overrides?: Partial<RelayConfigV2>;
}): Promise<RelayConfigV2>;
//# sourceMappingURL=config.d.ts.map