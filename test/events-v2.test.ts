import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendRelayEventV2,
  createRelayEventV2,
  readCanonicalEventStore,
} from '../src/events.js';
import { startRelayRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('canonical OpenSpec Relay event history', () => {
  it('preserves orchestrator acceptance order, rejects conflicting duplicates, and preserves atomic files', async () => {
    const { root, changeDir } = await createOpenSpecProject('baseline');
    await startRelayRunV2({ change: 'baseline', projectRoot: root });
    const store = await readCanonicalEventStore(changeDir);
    const event = (eventId: string, occurredAt: string) => createRelayEventV2({
      eventId,
      runId: store.runId,
      changeName: store.changeName,
      occurredAt,
      sourceDigests: {},
      actor: { kind: 'host' },
      provenance: { origin: 'events-test' },
      payload: { type: 'human.decision', gateId: 'relay.assurance', decision: 'requested', reason: eventId },
    });

    expect((await appendRelayEventV2({ changeDir, event: event('event-b', '2026-08-09T12:01:00.000Z') })).appended)
      .toBe(true);
    const ordered = await appendRelayEventV2({ changeDir, event: event('event-a', '2026-08-09T12:00:00.000Z') });
    expect(ordered.store.events.slice(-2).map((item) => item.eventId)).toEqual(['event-b', 'event-a']);
    expect((await appendRelayEventV2({ changeDir, event: event('event-a', '2026-08-09T12:00:00.000Z') })).appended)
      .toBe(false);
    await expect(appendRelayEventV2({ changeDir, event: event('event-a', '2026-08-09T12:02:00.000Z') }))
      .rejects.toThrow(/conflicting content/i);

    const filename = path.join(changeDir, '.openspec-relay', 'events.json');
    const before = await fs.readFile(filename, 'utf8');
    await expect(appendRelayEventV2({
      changeDir,
      event: event('event-c', '2026-08-09T12:03:00.000Z'),
      failBeforeCommit: true,
    })).rejects.toThrow('interrupted');
    expect(await fs.readFile(filename, 'utf8')).toBe(before);
  });

  it('fails with regeneration guidance for unsupported pre-release execution records', async () => {
    const { root, changeDir } = await createOpenSpecProject('baseline');
    await fs.mkdir(path.join(changeDir, '.openspec-relay'), { recursive: true });
    await fs.writeFile(path.join(changeDir, '.openspec-relay', 'run.json'), '{"version":1}\n');

    await expect(startRelayRunV2({ change: 'baseline', projectRoot: root }))
      .rejects.toThrow(/remove.*\.openspec-relay.*start a new run.*regenerate/i);
  });
});
