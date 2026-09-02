import type { HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import semver from 'semver';
import { z } from 'zod';

export const PI_HOST_ADAPTER_VERSION = 1 as const;
export const SUPPORTED_PI_RANGE = '>=0.84.0 <0.85.0';
export const PI_READ_ONLY_TOOLS = Object.freeze(['find', 'grep', 'ls', 'read'] as const);

export const PiCapabilityStateV1Schema = z.object({
  state: z.enum(['available', 'disabled', 'probe_failed', 'unsupported_version']),
  reason: z.string().min(1),
  remediation: z.array(z.string().min(1)).default([]),
}).strict();

export type PiCapabilityStateV1 = z.infer<typeof PiCapabilityStateV1Schema>;

export const PiHostCapabilityProfileV1Schema = z.object({
  version: z.literal(PI_HOST_ADAPTER_VERSION),
  adapterId: z.literal('openspec-gsd/pi'),
  piVersion: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  modelRef: z.string().min(1).optional(),
  agentDispatch: PiCapabilityStateV1Schema,
  parallelism: PiCapabilityStateV1Schema,
  hostCapabilities: z.object({
    agentDispatch: z.boolean(),
    parallelism: z.boolean(),
    worktrees: z.literal(false),
    git: z.literal(false),
    structuredResults: z.boolean(),
    humanInteraction: z.boolean(),
  }).strict(),
}).strict();

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

const unavailableCapabilities: HostCapabilitiesV1 = Object.freeze({
  agentDispatch: false,
  parallelism: false,
  worktrees: false,
  git: false,
  structuredResults: true,
  humanInteraction: true,
});

function state(
  value: PiCapabilityStateV1['state'],
  reason: string,
  remediation: string[] = [],
): PiCapabilityStateV1 {
  return PiCapabilityStateV1Schema.parse({ state: value, reason, remediation });
}

function profile(options: {
  runtime: PiHostProbeRuntimeV1;
  agentDispatch: PiCapabilityStateV1;
  parallelism: PiCapabilityStateV1;
}): PiHostCapabilityProfileV1 {
  const dispatchAvailable = options.agentDispatch.state === 'available';
  const parallelAvailable = dispatchAvailable && options.parallelism.state === 'available';
  return PiHostCapabilityProfileV1Schema.parse({
    version: PI_HOST_ADAPTER_VERSION,
    adapterId: 'openspec-gsd/pi',
    piVersion: options.runtime.piVersion,
    ...(options.runtime.sessionId ? { sessionId: options.runtime.sessionId } : {}),
    ...(options.runtime.modelRef ? { modelRef: options.runtime.modelRef } : {}),
    agentDispatch: options.agentDispatch,
    parallelism: options.parallelism,
    hostCapabilities: {
      ...unavailableCapabilities,
      agentDispatch: dispatchAvailable,
      parallelism: parallelAvailable,
    },
  });
}

export async function qualifyPiHostAdapter(options: {
  enabled: boolean;
  forceTier0?: boolean;
  runtime: PiHostProbeRuntimeV1;
  supportedRange?: string;
}): Promise<PiHostCapabilityProfileV1> {
  const supportedRange = options.supportedRange ?? SUPPORTED_PI_RANGE;
  if (!options.enabled || options.forceTier0) {
    const reason = options.forceTier0
      ? 'Pi host adapter is disabled by the force-Tier-0 setting.'
      : 'Pi host adapter is not enabled.';
    return profile({
      runtime: options.runtime,
      agentDispatch: state('disabled', reason, ['Enable the Pi adapter to qualify isolated dispatch.']),
      parallelism: state('disabled', reason, ['Enable and qualify isolated dispatch before parallel analysis.']),
    });
  }
  if (!semver.valid(options.runtime.piVersion) || !semver.satisfies(options.runtime.piVersion, supportedRange)) {
    const reason = `Pi ${options.runtime.piVersion} is outside the supported range ${supportedRange}.`;
    return profile({
      runtime: options.runtime,
      agentDispatch: state('unsupported_version', reason, ['Install a supported Pi version or use Tier 0.']),
      parallelism: state('unsupported_version', reason, ['Parallel analysis requires a supported Pi adapter.']),
    });
  }
  if (!options.runtime.modelAvailable || !options.runtime.authenticationAvailable) {
    const missing = [
      ...(!options.runtime.modelAvailable ? ['active model'] : []),
      ...(!options.runtime.authenticationAvailable ? ['model authentication'] : []),
    ];
    const reason = `Pi runtime probe is missing ${missing.join(' and ')}.`;
    return profile({
      runtime: options.runtime,
      agentDispatch: state('probe_failed', reason, ['Configure the active Pi model and authentication, or use Tier 0.']),
      parallelism: state('probe_failed', 'Parallel analysis requires qualified isolated dispatch.'),
    });
  }

  let probe: PiReadOnlyProbeV1 | undefined;
  try {
    probe = await options.runtime.createReadOnlyProbe();
    const actualTools = [...new Set(probe.toolNames)].sort();
    if (JSON.stringify(actualTools) !== JSON.stringify(PI_READ_ONLY_TOOLS)) {
      throw new Error(`Read-only tool inventory mismatch: received ${actualTools.join(', ') || 'none'}.`);
    }
    const observed = await probe.exercise();
    const missingContracts = [
      ...(!observed.cancellation ? ['cancellation'] : []),
      ...(!observed.timeout ? ['timeout'] : []),
      ...(!observed.structuredResults ? ['structured results'] : []),
    ];
    if (missingContracts.length) throw new Error(`Read-only probe lacks ${missingContracts.join(', ')}.`);
  } catch (error) {
    const reason = `Pi isolated-dispatch probe failed: ${(error as Error).message}`;
    return profile({
      runtime: options.runtime,
      agentDispatch: state('probe_failed', reason, ['Repair the Pi adapter probe or use Tier 0.']),
      parallelism: state('probe_failed', 'Parallel analysis requires qualified isolated dispatch.'),
    });
  } finally {
    await probe?.dispose().catch(() => undefined);
  }

  const agentDispatch = state('available', 'Pi isolated structured dispatch passed the live runtime probe.');
  try {
    const concurrent = await options.runtime.probeParallelism?.();
    const parallelism = concurrent === true
      ? state('available', 'Pi bounded read-only concurrency passed the live runtime probe.')
      : state('probe_failed', 'Pi concurrency probe did not establish safe parallel read-only dispatch.',
        ['Use qualified sequential dispatch or repair the concurrency adapter.']);
    return profile({ runtime: options.runtime, agentDispatch, parallelism });
  } catch (error) {
    return profile({
      runtime: options.runtime,
      agentDispatch,
      parallelism: state('probe_failed', `Pi concurrency probe failed: ${(error as Error).message}`,
        ['Use qualified sequential dispatch or repair the concurrency adapter.']),
    });
  }
}
