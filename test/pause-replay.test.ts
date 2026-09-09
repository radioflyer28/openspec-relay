import { afterEach, describe, expect, it } from 'vitest';
import { appendRelayEventV2, createRelayEventV2, readCanonicalEventStore } from '../src/events.js';
import { loadCanonicalRelayState } from '../src/canonical-state.js';
import { startRelayRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);
const digest = 'a'.repeat(64);

describe('pause event replay', () => {
  it('projects the latest unmatched pause and clears only a matching resume', async () => {
    const { root, changeDir } = await createOpenSpecProject('demo');
    await startRelayRunV2({ change: 'demo', projectRoot: root });
    const store = await readCanonicalEventStore(changeDir);
    const append = async (eventId: string, payload: Parameters<typeof createRelayEventV2>[0]['payload']) => {
      await appendRelayEventV2({ changeDir, event: createRelayEventV2({
        eventId, runId: store.runId, changeName: store.changeName,
        occurredAt: `2026-09-09T12:0${store.events.length}:00.000Z`, sourceDigests: {},
        actor: { kind: 'host' }, provenance: { origin: 'pause-test' }, payload,
      }) });
    };
    const makeCheckpoint = (pauseId: string, stateFingerprint: string) => ({
      version: 1 as const, pauseId, changeName: 'demo', runId: store.runId,
      createdAt: '2026-09-09T12:00:00.000Z', stage: 'planning' as const,
      activity: { kind: 'workflow' as const, id: 'plan', mutationCapable: false }, taskIds: [],
      workspace: [], dispatches: [], findingIds: [], humanActionIds: [],
      resumeRoute: 'plan' as const, stateFingerprint, quiescence: 'safe' as const,
    });

    await append('pause-1-event', { type: 'workflow.paused', checkpoint: makeCheckpoint('pause-1', digest) });
    expect((await loadCanonicalRelayState(changeDir)).projection.run.effectivePause?.pauseId).toBe('pause-1');
    await append('wrong-resume', { type: 'workflow.resumed', pauseId: 'other', checkpointFingerprint: digest,
      route: 'plan', reconstructed: false });
    expect((await loadCanonicalRelayState(changeDir)).projection.run.effectivePause?.pauseId).toBe('pause-1');
    await append('resume-1', { type: 'workflow.resumed', pauseId: 'pause-1', checkpointFingerprint: digest,
      route: 'plan', reconstructed: false });
    expect((await loadCanonicalRelayState(changeDir)).projection.run.effectivePause).toBeUndefined();
    await append('pause-2-event', { type: 'workflow.paused', checkpoint: makeCheckpoint('pause-2', 'b'.repeat(64)) });
    expect((await loadCanonicalRelayState(changeDir)).projection.run.effectivePause?.pauseId).toBe('pause-2');
  });

  it('keeps old histories readable and rejects unsupported event kinds', async () => {
    const { root, changeDir } = await createOpenSpecProject('demo');
    await startRelayRunV2({ change: 'demo', projectRoot: root });
    expect((await loadCanonicalRelayState(changeDir)).projection.run.effectivePause).toBeUndefined();
    const store = await readCanonicalEventStore(changeDir);
    expect(() => createRelayEventV2({
      eventId: 'future', runId: store.runId, changeName: store.changeName,
      occurredAt: '2026-09-09T12:00:00.000Z', sourceDigests: {}, actor: { kind: 'host' },
      provenance: { origin: 'pause-test' }, payload: { type: 'workflow.teleported' } as never,
    })).toThrow();
  });
});
