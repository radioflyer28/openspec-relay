import { describe, expect, it } from 'vitest';
import {
  qualifyPiHostAdapter,
  type PiHostProbeRuntimeV1,
} from '../src/pi/host-adapter.js';

function runtime(overrides: Partial<PiHostProbeRuntimeV1> = {}): PiHostProbeRuntimeV1 {
  return {
    piVersion: '0.84.4',
    sessionId: 'pi-session-1',
    modelRef: 'provider/model',
    modelAvailable: true,
    authenticationAvailable: true,
    createReadOnlyProbe: async () => ({
      toolNames: ['find', 'grep', 'ls', 'read'],
      exercise: async () => ({ cancellation: true, timeout: true, structuredResults: true }),
      dispose: async () => undefined,
    }),
    probeParallelism: async () => true,
    ...overrides,
  };
}

describe('Pi host capability qualification', () => {
  it('advertises isolated dispatch and parallelism only after live probes pass', async () => {
    let exercised = 0;
    let parallelProbes = 0;
    const profile = await qualifyPiHostAdapter({ enabled: true, runtime: runtime({
      createReadOnlyProbe: async () => ({
        toolNames: ['find', 'grep', 'ls', 'read'],
        exercise: async () => {
          exercised += 1;
          return { cancellation: true, timeout: true, structuredResults: true };
        },
        dispose: async () => undefined,
      }),
      probeParallelism: async () => { parallelProbes += 1; return true; },
    }) });
    expect(profile).toMatchObject({
      version: 1,
      adapterId: 'openspec-gsd/pi',
      piVersion: '0.84.4',
      sessionId: 'pi-session-1',
      modelRef: 'provider/model',
      agentDispatch: { state: 'available' },
      parallelism: { state: 'available' },
      hostCapabilities: {
        agentDispatch: true,
        parallelism: true,
        worktrees: false,
        git: false,
        structuredResults: true,
        humanInteraction: true,
      },
    });
    expect(exercised).toBe(1);
    expect(parallelProbes).toBe(1);
  });

  it('qualifies dispatch independently when the concurrency probe fails', async () => {
    const profile = await qualifyPiHostAdapter({
      enabled: true,
      runtime: runtime({ probeParallelism: async () => false }),
    });
    expect(profile.agentDispatch.state).toBe('available');
    expect(profile.parallelism).toMatchObject({ state: 'probe_failed' });
    expect(profile.hostCapabilities.parallelism).toBe(false);
  });

  it('keeps Tier 0 for disabled, forced, unsupported, or incomplete runtime evidence', async () => {
    const disabled = await qualifyPiHostAdapter({ enabled: false, runtime: runtime() });
    const forced = await qualifyPiHostAdapter({ enabled: true, forceTier0: true, runtime: runtime() });
    const unsupported = await qualifyPiHostAdapter({
      enabled: true, runtime: runtime({ piVersion: '0.85.0' }),
    });
    const incomplete = await qualifyPiHostAdapter({
      enabled: true, runtime: runtime({ modelAvailable: false }),
    });
    expect(disabled.agentDispatch.state).toBe('disabled');
    expect(forced.agentDispatch.state).toBe('disabled');
    expect(unsupported.agentDispatch.state).toBe('unsupported_version');
    expect(incomplete.agentDispatch.state).toBe('probe_failed');
    for (const profile of [disabled, forced, unsupported, incomplete]) {
      expect(profile.hostCapabilities.agentDispatch).toBe(false);
      expect(profile.hostCapabilities.parallelism).toBe(false);
    }
  });

  it('rejects a read-only probe whose actual tool inventory drifts', async () => {
    const profile = await qualifyPiHostAdapter({ enabled: true, runtime: runtime({
      createReadOnlyProbe: async () => ({
        toolNames: ['bash', 'find', 'grep', 'ls', 'read'],
        exercise: async () => ({ cancellation: true, timeout: true, structuredResults: true }),
        dispose: async () => undefined,
      }),
    }) });
    expect(profile.agentDispatch).toMatchObject({ state: 'probe_failed' });
    expect(profile.agentDispatch.reason).toMatch(/tool inventory/i);
  });

  it('rejects asserted tool inventory when the live behavior probe does not pass', async () => {
    const profile = await qualifyPiHostAdapter({ enabled: true, runtime: runtime({
      createReadOnlyProbe: async () => ({
        toolNames: ['find', 'grep', 'ls', 'read'],
        exercise: async () => ({ cancellation: true, timeout: false, structuredResults: true }),
        dispose: async () => undefined,
      }),
    }) });
    expect(profile.agentDispatch).toMatchObject({ state: 'probe_failed' });
    expect(profile.hostCapabilities.agentDispatch).toBe(false);
  });

  it('does not infer capabilities from installed-tool or environment hints', async () => {
    const profile = await qualifyPiHostAdapter({ enabled: true, runtime: runtime({
      modelAvailable: false,
      installedToolHints: ['pi-subagents', 'git', 'worktree'],
    }) });
    expect(profile.hostCapabilities).toMatchObject({
      agentDispatch: false, parallelism: false, worktrees: false, git: false,
    });
  });
});
