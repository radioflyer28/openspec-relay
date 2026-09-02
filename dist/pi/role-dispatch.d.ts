import type { RoleDispatcherV1 } from '../execution-adapters.js';
import { type PiHostCapabilityProfileV1 } from './host-adapter.js';
export interface PiDispatchEnvelopeV1 {
    readonly version: 1;
    readonly dispatchId: string;
    readonly parentSessionId: string;
    readonly role: 'plan_reviewer' | 'pathfinder' | 'reviewer' | 'verifier';
    readonly changeName: string;
    readonly planRevision: string;
    readonly authority: 'read_only' | 'experiment_confined';
    readonly evidenceRequirements: readonly string[];
    readonly deadline: string;
    readonly cancellationId: string;
}
export interface PiRoleSessionV1 {
    sessionId: string;
    toolNames: string[];
    run(prompt: string, signal: AbortSignal): Promise<string>;
    abort(): Promise<void>;
    dispose(): Promise<void>;
}
export interface PiRoleSessionFactoryV1 {
    create(options: Readonly<{
        envelope: PiDispatchEnvelopeV1;
        systemPrompt: string;
        toolNames: readonly string[];
        workspace?: string;
    }>): Promise<PiRoleSessionV1>;
}
export declare function createPiRoleDispatcher(options: {
    profile: PiHostCapabilityProfileV1;
    factory: PiRoleSessionFactoryV1;
    currentRevision(changeName: string): Promise<string>;
    timeoutMs?: number;
    parentSignal?: AbortSignal;
    now?: () => Date;
}): RoleDispatcherV1;
//# sourceMappingURL=role-dispatch.d.ts.map