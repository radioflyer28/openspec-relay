import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendGuardrailsEvent,
  compileOpenSpecChange,
  createGuardrailsEvent,
  eventStorePath,
  migrateV1ProjectionsToEventStore,
  readEventStore,
  replayGuardrailsEvents,
  runStatePath,
  seedAssuranceState,
  startGuardrailsRun,
  writeReplayedProjections,
} from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject, evidence } from './helpers.js';

afterEach(cleanupTemporaryRoots);

async function fixture() {
  const { root, changeDir } = await createOpenSpecProject();
  const started = await startGuardrailsRun({ change: 'demo', projectRoot: root });
  const store = await migrateV1ProjectionsToEventStore(changeDir);
  const sourceDigests = Object.fromEntries(
    started.run.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]),
  );
  const event = (eventId: string, occurredAt: string, checkId = eventId) => createGuardrailsEvent({
    eventId,
    runId: store.runId,
    changeName: store.changeName,
    occurredAt,
    sourceDigests,
    actor: { kind: 'automation', id: 'test' },
    provenance: { origin: 'events-test', command: checkId },
    payload: {
      type: 'evidence.recorded',
      evidence: evidence({
        evidenceId: eventId,
        phase: 'check',
        checkId,
        result: 'pass',
        origin: 'automated',
        sourceDigests,
      }),
    },
  });
  return { root, changeDir, started, store, event };
}

describe('Tier 0 event store', () => {
  it('appends atomically, retries idempotently, rejects conflicts, and orders stably', async () => {
    const { changeDir, event } = await fixture();
    const later = event('event-b', '2026-08-04T12:10:00.000Z');
    const earlier = event('event-a', '2026-08-04T12:00:00.000Z');
    expect((await appendGuardrailsEvent({ changeDir, event: later })).appended).toBe(true);
    expect((await appendGuardrailsEvent({ changeDir, event: later })).appended).toBe(false);
    await appendGuardrailsEvent({ changeDir, event: earlier });
    expect((await readEventStore(changeDir)).events.map((item) => item.eventId))
      .toEqual(['event-a', 'event-b']);

    await expect(appendGuardrailsEvent({
      changeDir,
      event: { ...later, occurredAt: '2026-08-04T12:11:00.000Z' },
    })).rejects.toThrow(/conflicting content/i);

    const before = await fs.readFile(eventStorePath(changeDir), 'utf8');
    await expect(appendGuardrailsEvent({
      changeDir,
      event: event('event-c', '2026-08-04T12:20:00.000Z'),
      failBeforeCommit: true,
    })).rejects.toThrow('interrupted');
    expect(await fs.readFile(eventStorePath(changeDir), 'utf8')).toBe(before);
  });

  it('fails closed for corrupt stores, unknown versions, and payload tampering', async () => {
    const { changeDir } = await fixture();
    await fs.writeFile(eventStorePath(changeDir), '{broken');
    await expect(readEventStore(changeDir)).rejects.toThrow();
    await fs.writeFile(eventStorePath(changeDir), JSON.stringify({ version: 99 }));
    await expect(readEventStore(changeDir)).rejects.toThrow();

    const next = await fixture();
    const raw = JSON.parse(await fs.readFile(eventStorePath(next.changeDir), 'utf8'));
    const tampered = next.event('tampered', '2026-08-04T12:00:00.000Z');
    raw.events.push({
      ...tampered,
      payload: tampered.payload.type === 'evidence.recorded'
        ? { ...tampered.payload, evidence: { ...tampered.payload.evidence, checkId: 'changed' } }
        : tampered.payload,
    });
    await fs.writeFile(eventStorePath(next.changeDir), JSON.stringify(raw));
    await expect(readEventStore(next.changeDir)).rejects.toThrow(/payload digest/i);
  });

  it('replays byte-stable projections and detects or repairs direct edits', async () => {
    const { changeDir, event } = await fixture();
    const appended = await appendGuardrailsEvent({
      changeDir,
      event: event('repo-check', '2026-08-04T12:00:00.000Z', 'repository-checks'),
    });
    const compiled = await compileOpenSpecChange({ changeDir });
    const first = replayGuardrailsEvents({ store: appended.store, compiled });
    const second = replayGuardrailsEvents({ store: appended.store, compiled });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    await writeReplayedProjections({ changeDir, store: appended.store, compiled });
    const run = JSON.parse(await fs.readFile(runStatePath(changeDir), 'utf8'));
    await fs.writeFile(runStatePath(changeDir), JSON.stringify({ ...run, status: 'complete' }));
    await expect(writeReplayedProjections({
      changeDir, store: appended.store, compiled, repair: false,
    })).rejects.toThrow(/differ/i);
    expect((await writeReplayedProjections({
      changeDir, store: appended.store, compiled,
    })).repaired).toBe(true);

    await fs.appendFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), '\n<!-- revised -->\n');
    const revised = replayGuardrailsEvents({
      store: appended.store,
      compiled: await compileOpenSpecChange({ changeDir }),
    });
    expect(revised.assurance.staleEvidenceIds).toEqual(['repo-check']);
  });

  it('migrates existing evidence into events without losing its references', async () => {
    const { root, changeDir } = await createOpenSpecProject('migration');
    await startGuardrailsRun({ change: 'migration', projectRoot: root });
    await seedAssuranceState({
      change: 'migration',
      projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        evidence: [evidence({
          evidenceId: 'existing', phase: 'check', checkId: 'repository-checks',
          result: 'pass', origin: 'automated', reference: 'reports/existing.json',
        })],
      }),
    });
    await fs.rm(eventStorePath(changeDir));
    const store = await migrateV1ProjectionsToEventStore(changeDir);
    expect(store.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventId: 'migration:evidence:existing',
        payload: expect.objectContaining({ type: 'evidence.recorded' }),
      }),
    ]));
    expect(await migrateV1ProjectionsToEventStore(changeDir)).toEqual(store);
  });
});
