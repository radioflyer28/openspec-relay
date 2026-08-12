import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import * as events from '../src/events.js';
import { startGuardrailsRunV2 } from '../src/runner-v2.js';
import * as state from '../src/state.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const fixture = (name: string) => new URL(`./fixtures/v1/${name}`, import.meta.url);
const execFileAsync = promisify(execFile);

async function seedV1State() {
  const project = await createOpenSpecProject('baseline');
  const directory = path.join(project.changeDir, '.guardrails');
  await fs.mkdir(directory, { recursive: true });
  await Promise.all(['events.json', 'run.json', 'assurance.json'].map(async (name) =>
    fs.copyFile(fixture(name), path.join(directory, name))));
  return project;
}

describe('Guardrails v1-to-v2 event migration', () => {
  it('previews, migrates, replays, and repeats v1 state without fabricating acceptance', async () => {
    const { changeDir } = await seedV1State();
    const api = events as Record<string, unknown>;
    const preview = await (api.previewV1ToV2Migration as (directory: string) => Promise<{
      status: string; needsMigration: boolean; diagnostics: string[];
    }>)(changeDir);
    expect(preview).toMatchObject({ status: 'ready', needsMigration: true, diagnostics: [] });

    const migrate = api.migrateV1ToV2EventStore as (directory: string) => Promise<{ version: number }>;
    const first = await migrate(changeDir);
    const second = await migrate(changeDir);
    expect(first).toEqual(second);
    expect(first.version).toBe(2);

    const readRun = state as Record<string, unknown>;
    const run = await (readRun.readRunStateV2 as (directory: string) => Promise<{ version: number }>)(changeDir);
    const assurance = await (readRun.readAssuranceStateV2 as (directory: string) => Promise<{
      version: number; uatScenarios: unknown[];
    }>)(changeDir);
    expect(run.version).toBe(2);
    expect(assurance).toMatchObject({ version: 2, uatScenarios: [] });
    await expect(fs.access((state as Record<string, (directory: string, key: string) => string>)
      .guardrailsGeneratedPath(changeDir, 'v1MigrationBackup'))).resolves.toBeUndefined();
  });

  it('fails closed before changing valid v1 files when a projection is corrupt', async () => {
    const { changeDir } = await seedV1State();
    const run = (state as Record<string, (directory: string) => string>).runStatePath(changeDir);
    const before = await fs.readFile(run, 'utf8');
    await fs.writeFile(run, '{not-json');
    const migrate = (events as Record<string, unknown>).migrateV1ToV2EventStore as
      (directory: string) => Promise<unknown>;
    await expect(migrate(changeDir)).rejects.toThrow();
    expect(await fs.readFile(run, 'utf8')).toBe('{not-json');
    expect(before).not.toBe('{not-json');
  });

  it('orders v2 events deterministically, rejects conflicting duplicates, and preserves atomic files', async () => {
    const { changeDir } = await seedV1State();
    const api = events as Record<string, unknown>;
    const store = await (api.migrateV1ToV2EventStore as (directory: string) => Promise<{
      runId: string; changeName: string;
    }>)(changeDir);
    const create = api.createGuardrailsEventV2 as (input: Record<string, unknown>) => unknown;
    const append = api.appendGuardrailsEventV2 as (input: Record<string, unknown>) => Promise<{
      store: { events: Array<{ eventId: string }> }; appended: boolean;
    }>;
    const event = (eventId: string, occurredAt: string) => create({
      eventId,
      runId: store.runId,
      changeName: store.changeName,
      occurredAt,
      sourceDigests: { 'tasks.md': '0000000000000000000000000000000000000000000000000000000000000000' },
      actor: { kind: 'host' },
      provenance: { origin: 'events-v2-test' },
      payload: {
        type: 'v1.migrated', sourceVersion: 1, sourceKind: 'human_action', sourceId: eventId,
        sourceDigest: '0000000000000000000000000000000000000000000000000000000000000000', record: {},
      },
    });

    expect((await append({ changeDir, event: event('event-b', '2026-08-09T12:01:00.000Z') })).appended).toBe(true);
    const ordered = await append({ changeDir, event: event('event-a', '2026-08-09T12:00:00.000Z') });
    expect(ordered.store.events.map((item) => item.eventId)).toEqual(['event-a', 'event-b']);
    expect((await append({ changeDir, event: event('event-a', '2026-08-09T12:00:00.000Z') })).appended).toBe(false);
    await expect(append({ changeDir, event: event('event-a', '2026-08-09T12:02:00.000Z') }))
      .rejects.toThrow(/conflicting content/i);

    const filename = (state as Record<string, (directory: string) => string>).runStatePath(changeDir)
      .replace('run.json', 'events.json');
    const before = await fs.readFile(filename, 'utf8');
    await expect(append({
      changeDir,
      event: event('event-c', '2026-08-09T12:03:00.000Z'),
      rename: async () => { throw new Error('interrupted'); },
    })).rejects.toThrow('interrupted');
    expect(await fs.readFile(filename, 'utf8')).toBe(before);
  });

  it('preserves every successful event appended by concurrent processes', async () => {
    const { changeDir } = await seedV1State();
    const api = events as Record<string, unknown>;
    const store = await (api.migrateV1ToV2EventStore as (directory: string) => Promise<{
      runId: string; changeName: string; events: Array<{ eventId: string }>;
    }>)(changeDir);
    const baseline = store.events.length;
    const moduleUrl = new URL('../dist/index.js', import.meta.url).href;
    const sourceDigest = '0'.repeat(64);
    const script = [
      `import { appendGuardrailsEventV2, createGuardrailsEventV2 } from ${JSON.stringify(moduleUrl)};`,
      'const [changeDir, runId, changeName, eventId, sourceDigest] = process.argv.slice(1);',
      'const event = createGuardrailsEventV2({ eventId, runId, changeName, occurredAt: new Date().toISOString(),',
      "sourceDigests: { 'tasks.md': sourceDigest }, actor: { kind: 'host' }, provenance: { origin: 'contention-test' },",
      "payload: { type: 'v1.migrated', sourceVersion: 1, sourceKind: 'human_action', sourceId: eventId, sourceDigest, record: {} } });",
      'const result = await appendGuardrailsEventV2({ changeDir, event });',
      'process.stdout.write(JSON.stringify({ eventId, appended: result.appended }));',
    ].join('\n');
    const eventIds = Array.from({ length: 12 }, (_, index) => `parallel:${index}`);
    const results = await Promise.all(eventIds.map((eventId) => execFileAsync(process.execPath, [
      '--input-type=module', '-e', script, changeDir, store.runId, store.changeName, eventId, sourceDigest,
    ])));
    expect(results.map(({ stdout }) => JSON.parse(stdout) as { appended: boolean })
      .every((result) => result.appended)).toBe(true);
    const finalStore = await (api.readEventStoreV2 as (directory: string) => Promise<{
      events: Array<{ eventId: string }>;
    }>)(changeDir);
    const present = finalStore.events.filter((event) => eventIds.includes(event.eventId));
    expect(finalStore.events).toHaveLength(baseline + eventIds.length);
    expect(present.map((event) => event.eventId).sort()).toEqual(eventIds.sort());
  }, 30_000);

  it('migrates an active v1 run before v2 commands mutate it and retains the v1 recovery record', async () => {
    const { root, changeDir } = await seedV1State();
    const resumed = await startGuardrailsRunV2({ change: 'baseline', projectRoot: root });
    expect(resumed.run).toMatchObject({ version: 2, runId: 'v1-fixture-run', changeName: 'baseline' });
    const backup = JSON.parse(await fs.readFile((state as Record<string, (directory: string, key: string) => string>)
      .guardrailsGeneratedPath(changeDir, 'v1MigrationBackup'), 'utf8'));
    expect(backup).toMatchObject({ version: 1, run: { version: 1 }, assurance: { version: 1 } });
  });

  it('exports a validated v1 compatibility bundle without replacing canonical v2 history', async () => {
    const { changeDir } = await seedV1State();
    const api = events as Record<string, unknown>;
    await (api.migrateV1ToV2EventStore as (directory: string) => Promise<unknown>)(changeDir);

    const exported = await (api.exportV1CompatibilityBundle as (directory: string) => Promise<{
      exported: boolean; runId: string; filename: string;
    }>)(changeDir);
    expect(exported).toMatchObject({ exported: true, runId: 'v1-fixture-run' });
    expect(JSON.parse(await fs.readFile(exported.filename, 'utf8'))).toMatchObject({
      version: 1, events: { version: 1 }, run: { version: 1 }, assurance: { version: 1 },
      exportedFromCanonicalV2: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(await (api.readEventStoreV2 as (directory: string) => Promise<{ version: number }>)(changeDir))
      .toMatchObject({ version: 2 });
    expect(await (state as Record<string, (directory: string) => Promise<{ version: number }>>)
      .readRunStateV2(changeDir)).toMatchObject({ version: 2 });
    expect(await (state as Record<string, (directory: string) => Promise<{ version: number }>>)
      .readAssuranceStateV2(changeDir)).toMatchObject({ version: 2 });
  });
});
