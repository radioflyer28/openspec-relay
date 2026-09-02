import { z } from 'zod';
export declare const PI_HOST_ADAPTER_VERSION: 1;
export declare const SUPPORTED_PI_RANGE = ">=0.84.0 <0.85.0";
export declare const PI_READ_ONLY_TOOLS: readonly ["find", "grep", "ls", "read"];
export declare const PiCapabilityStateV1Schema: z.ZodObject<{
    state: z.ZodEnum<{
        available: "available";
        disabled: "disabled";
        probe_failed: "probe_failed";
        unsupported_version: "unsupported_version";
    }>;
    reason: z.ZodString;
    remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type PiCapabilityStateV1 = z.infer<typeof PiCapabilityStateV1Schema>;
export declare const PiHostCapabilityProfileV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    adapterId: z.ZodLiteral<"openspec-relay/pi">;
    piVersion: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
    modelRef: z.ZodOptional<z.ZodString>;
    agentDispatch: z.ZodObject<{
        state: z.ZodEnum<{
            available: "available";
            disabled: "disabled";
            probe_failed: "probe_failed";
            unsupported_version: "unsupported_version";
        }>;
        reason: z.ZodString;
        remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    parallelism: z.ZodObject<{
        state: z.ZodEnum<{
            available: "available";
            disabled: "disabled";
            probe_failed: "probe_failed";
            unsupported_version: "unsupported_version";
        }>;
        reason: z.ZodString;
        remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    hostCapabilities: z.ZodObject<{
        agentDispatch: z.ZodBoolean;
        parallelism: z.ZodBoolean;
        worktrees: z.ZodLiteral<false>;
        git: z.ZodLiteral<false>;
        structuredResults: z.ZodBoolean;
        humanInteraction: z.ZodBoolean;
    }, z.core.$strict>;
}, z.core.$strict>;
export type PiHostCapabilityProfileV1 = z.infer<typeof PiHostCapabilityProfileV1Schema>;
export interface PiReadOnlyProbeV1 {
    toolNames: string[];
    exercise(): Promise<{
        cancellation: boolean;
        timeout: boolean;
        structuredResults: boolean;
    }>;
    dispose(): Promise<void>;
}
export interface PiHostProbeRuntimeV1 {
    piVersion: string;
    sessionId?: string;
    modelRef?: string;
    modelAvailable: boolean;
    authenticationAvailable: boolean;
    installedToolHints?: string[];
    createReadOnlyProbe(): Promise<PiReadOnlyProbeV1>;
    probeParallelism?(): Promise<boolean>;
}
export declare function qualifyPiHostAdapter(options: {
    enabled: boolean;
    forceTier0?: boolean;
    runtime: PiHostProbeRuntimeV1;
    supportedRange?: string;
}): Promise<PiHostCapabilityProfileV1>;
//# sourceMappingURL=host-adapter.d.ts.map