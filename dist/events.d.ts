import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { type RelayAssuranceV2, type RelayEventEnvelopeV2, type RelayEventPayloadV2, type RelayEventStoreV2, type RelayRunV2 } from './schemas.js';
export declare function eventStorePath(changeDir: string): string;
export declare function createRelayEventV2(options: {
    eventId: string;
    runId: string;
    changeName: string;
    occurredAt: string;
    sourceDigests: Record<string, string>;
    actor: RelayEventEnvelopeV2['actor'];
    provenance: RelayEventEnvelopeV2['provenance'];
    payload: RelayEventPayloadV2;
}): RelayEventEnvelopeV2;
export declare function readEventStoreV2(changeDir: string): Promise<RelayEventStoreV2>;
/** Read the only supported generated history format. Pre-release state may be
 * deleted and regenerated from the controlling OpenSpec change. */
export declare function readCanonicalEventStore(changeDir: string): Promise<RelayEventStoreV2>;
export declare function appendRelayEventV2(options: {
    changeDir: string;
    event: RelayEventEnvelopeV2;
    beforeCommit?: () => Promise<void>;
    failBeforeCommit?: boolean;
}): Promise<{
    store: RelayEventStoreV2;
    appended: boolean;
}>;
export declare function replayRelayEventsV2(options: {
    store: RelayEventStoreV2;
    compiled: CompiledOpenSpecChangeV1;
}): {
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
};
export declare function writeReplayedProjectionsV2(options: {
    changeDir: string;
    store: RelayEventStoreV2;
    compiled: CompiledOpenSpecChangeV1;
}): Promise<{
    run: RelayRunV2;
    assurance: RelayAssuranceV2;
}>;
//# sourceMappingURL=events.d.ts.map