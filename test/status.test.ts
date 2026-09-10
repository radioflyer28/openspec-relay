import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startRelayRunV2 } from '../src/runner-v2.js';
import { getRunStatusV2 } from '../src/status.js';
import { appendRelayEventV2, createRelayEventV2, readCanonicalEventStore, writeReplayedProjectionsV2 } from '../src/events.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';
import { pauseRelayChangeV1 } from '../src/pause-resume.js';

afterEach(cleanupTemporaryRoots);

describe('canonical run status', () => {
  it('reports a deliberate pause separately from reconstructed routing', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const before = await getRunStatusV2({ change: 'demo', projectRoot: root });
    expect(before.resume).toMatchObject({ restored: false, route: 'plan' });
    const store = await readCanonicalEventStore(changeDir);
    const checkpoint = {
      version: 1 as const, pauseId: 'pause-1', changeName: 'demo', runId: store.runId,
      createdAt: '2026-09-09T12:00:00.000Z', stage: 'planning' as const,
      activity: { kind: 'workflow' as const, id: 'plan', mutationCapable: false }, taskIds: [],
      workspace: [], dispatches: [{ dispatchId: 'review', state: 'interrupted' as const, readOnly: true }],
      findingIds: [], humanActionIds: [], resumeRoute: 'plan' as const,
      stateFingerprint: 'a'.repeat(64), quiescence: 'safe' as const,
    };
    const next = (await appendRelayEventV2({ changeDir, event: createRelayEventV2({
      eventId: 'pause-event', runId: store.runId, changeName: store.changeName,
      occurredAt: checkpoint.createdAt, sourceDigests: {}, actor: { kind: 'host' },
      provenance: { origin: 'status-test' }, payload: { type: 'workflow.paused', checkpoint },
    }) })).store;
    await writeReplayedProjectionsV2({ changeDir, store: next, compiled: await compileOpenSpecChange({ changeDir }) });
    await expect(getRunStatusV2({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      pause: { state: 'paused', stage: 'planning', interruptedDispatches: ['review'] },
      resume: { restored: true, route: 'plan' },
    });
  });
  it('reports projection tampering as the primary blocking status in JSON and human output', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const runPath = path.join(changeDir, '.openspec-relay', 'run.json');
    const run = JSON.parse(await fs.readFile(runPath, 'utf8')) as Record<string, unknown>;
    await fs.writeFile(runPath, JSON.stringify({ ...run, status: 'complete' }));

    await expect(getRunStatusV2({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      status: 'error',
      assuranceStatus: 'error',
      assuranceDigestMatches: false,
      integrity: { status: 'error' },
      nextActions: expect.arrayContaining([expect.stringMatching(/regenerate projections/i)]),
    });

    const cli = spawnSync(process.execPath, [path.resolve('dist', 'cli.js'), 'status', 'demo', '--project', root], {
      encoding: 'utf8',
    });
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toMatch(/execution-record integrity error/i);
    expect(cli.stdout).not.toMatch(/assurance=(?:pass|warn)/i);
  });

  it('makes current workspace and live dispatch authority part of resume status', async () => {
    const { root } = await createOpenSpecProject();
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'relay@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Relay'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: root });
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await pauseRelayChangeV1({
      change: 'demo', projectRoot: root, quiescenceObserved: true,
      dispatches: [{ dispatchId: 'reader', state: 'unknown', readOnly: true }],
    });
    const unobserved = await getRunStatusV2({ change: 'demo', projectRoot: root });
    expect(unobserved.resume).toMatchObject({ automatic: false,
      requiredAuthority: expect.arrayContaining([expect.stringMatching(/fresh host observation/i)]) });
    const observed = await getRunStatusV2({
      change: 'demo', projectRoot: root,
      dispatches: [{ dispatchId: 'reader', state: 'stopped', readOnly: true }],
    });
    expect(observed.resume.requiredAuthority).not.toEqual(expect.arrayContaining([expect.stringMatching(/dispatch/i)]));
    const newlyRunning = await getRunStatusV2({
      change: 'demo', projectRoot: root,
      dispatches: [
        { dispatchId: 'reader', state: 'stopped', readOnly: true },
        { dispatchId: 'new-writer', state: 'running', readOnly: false },
      ],
    });
    expect(newlyRunning.resume).toMatchObject({ automatic: false,
      requiredAuthority: expect.arrayContaining([expect.stringMatching(/new-writer/)]) });
    await fs.writeFile(path.join(root, 'new-work.txt'), 'changed while paused\n');
    const drifted = await getRunStatusV2({
      change: 'demo', projectRoot: root,
      dispatches: [{ dispatchId: 'reader', state: 'stopped', readOnly: true }],
    });
    expect(drifted.resume).toMatchObject({ automatic: false,
      requiredAuthority: expect.arrayContaining([expect.stringMatching(/workspace paths or digests changed/i)]) });
  });
});
