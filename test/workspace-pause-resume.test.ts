import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appendRelayEventV2, createRelayEventV2, readCanonicalEventStore, writeReplayedProjectionsV2 } from '../src/events.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { pauseRelayChangeV1, resumeRelayChangeV1 } from '../src/pause-resume.js';
import { snapshotWorkspaceV1, validateWorkspaceSnapshotV1 } from '../src/workspace.js';
import { startRelayRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

describe('bounded workspace evidence', () => {
  it('captures paths and digests without contents and never mutates Git state', async () => {
    const { root } = await createOpenSpecProject();
    git(root, 'init'); git(root, 'config', 'user.email', 'relay@example.invalid'); git(root, 'config', 'user.name', 'Relay');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
    const file = path.join(root, 'src file.ts');
    await fs.writeFile(file, 'const secret = "not checkpoint prose";\n');
    const before = git(root, 'status', '--porcelain=v1', '--untracked-files=all');
    const snapshot = await snapshotWorkspaceV1({ projectRoot: root });
    expect(snapshot.repositoryRevision).toMatch(/^[a-f0-9]{40,64}$/);
    expect(snapshot.entries).toEqual([expect.objectContaining({ path: 'src file.ts', status: 'untracked' })]);
    expect(JSON.stringify(snapshot)).not.toContain('not checkpoint prose');
    expect(git(root, 'status', '--porcelain=v1', '--untracked-files=all')).toBe(before);
    await fs.writeFile(file, 'changed\n');
    await expect(validateWorkspaceSnapshotV1({ projectRoot: root, expected: snapshot })).resolves.toMatchObject({ matches: false });
  });

  it('records a renamed file by its current destination path', async () => {
    const { root } = await createOpenSpecProject();
    git(root, 'init'); git(root, 'config', 'user.email', 'relay@example.invalid'); git(root, 'config', 'user.name', 'Relay');
    await fs.writeFile(path.join(root, 'old name.ts'), 'export const value = 1;\n');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
    await fs.rename(path.join(root, 'old name.ts'), path.join(root, 'new name.ts'));
    git(root, 'add', '-A');
    const snapshot = await snapshotWorkspaceV1({ projectRoot: root });
    expect(snapshot.entries).toEqual([
      expect.objectContaining({ path: 'new name.ts', status: 'renamed', digest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
  });

  it('supports non-Git evidence and rejects traversal aliases', async () => {
    const { root } = await createOpenSpecProject();
    await expect(snapshotWorkspaceV1({ projectRoot: root, relevantPaths: ['../outside'] })).rejects.toThrow(/contained|relative/i);
    await expect(snapshotWorkspaceV1({ projectRoot: root, relevantPaths: ['proposal.md'] })).resolves.toMatchObject({
      revisionAvailable: false,
    });
  });
});

describe('change pause and resume', () => {
  it('preserves task and assurance state and makes repeated pause idempotent', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    git(root, 'init'); git(root, 'config', 'user.email', 'relay@example.invalid'); git(root, 'config', 'user.name', 'Relay');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const first = await pauseRelayChangeV1({ change: 'demo', projectRoot: root, stage: 'planning', quiescenceObserved: true });
    const eventCount = (await readCanonicalEventStore(changeDir)).events.length;
    const second = await pauseRelayChangeV1({ change: 'demo', projectRoot: root, stage: 'planning', quiescenceObserved: true });
    expect(first.checkpoint.pauseId).toBe(second.checkpoint.pauseId);
    expect(second.appended).toBe(false);
    expect((await readCanonicalEventStore(changeDir)).events).toHaveLength(eventCount);
    expect(first.run.tasks.every((task) => task.status !== 'complete')).toBe(true);
    expect(first.assurance.status).not.toBe('pass');
    await fs.writeFile(path.join(root, 'progress.txt'), 'changed while paused\n');
    const progressed = await pauseRelayChangeV1({ change: 'demo', projectRoot: root, stage: 'planning' });
    expect(progressed).toMatchObject({ appended: true, safe: false });
    expect(progressed.checkpoint.pauseId).not.toBe(first.checkpoint.pauseId);
  });

  it('reports incomplete quiescence for mutation-capable unknown work', async () => {
    const { root } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const result = await pauseRelayChangeV1({ change: 'demo', projectRoot: root,
      dispatches: [{ dispatchId: 'executor-1', state: 'unknown', readOnly: false }] });
    expect(result.safe).toBe(false);
    expect(result.checkpoint.quiescence).toBe('incomplete');
  });

  it('does not claim safe quiescence while the current activity can mutate', async () => {
    const { root } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const result = await pauseRelayChangeV1({
      change: 'demo', projectRoot: root, quiescenceObserved: true,
      activity: { kind: 'workflow', id: 'executor', mutationCapable: true },
    });
    expect(result).toMatchObject({ safe: false, checkpoint: { quiescence: 'incomplete' } });
  });

  it('binds resume to matching state and refuses workspace or artifact drift', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const paused = await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true });
    const routed: string[] = [];
    const resumed = await resumeRelayChangeV1({ change: 'demo', projectRoot: root,
      invoke: async (route) => { routed.push(route); return 'ok'; } });
    expect(resumed.resumed).toBe(true);
    expect(routed).toEqual([paused.checkpoint.resumeRoute]);

    await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true });
    await fs.appendFile(path.join(changeDir, 'design.md'), '\nChanged intent.\n');
    await expect(resumeRelayChangeV1({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      resumed: false, drift: expect.arrayContaining([expect.stringMatching(/artifact/i)]),
    });
  });

  it('keeps the resume event visible when the routed workflow fails', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true });
    await expect(resumeRelayChangeV1({
      change: 'demo', projectRoot: root,
      invoke: async () => { throw new Error('routed workflow failed'); },
    })).rejects.toThrow('routed workflow failed');
    const events = (await readCanonicalEventStore(changeDir)).events;
    expect(events.at(-1)?.payload.type).toBe('workflow.resumed');
  });

  it('refuses resume after the Git repository revision moves', async () => {
    const { root } = await createOpenSpecProject();
    git(root, 'init'); git(root, 'config', 'user.email', 'relay@example.invalid'); git(root, 'config', 'user.name', 'Relay');
    git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true });
    await fs.writeFile(path.join(root, 'after-pause.txt'), 'movement\n');
    git(root, 'add', 'after-pause.txt'); git(root, 'commit', '-m', 'move revision');
    await expect(resumeRelayChangeV1({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      resumed: false, drift: expect.arrayContaining([expect.stringMatching(/revision/i)]),
    });
  });

  it('requires disposition when unresolved human actions change during pause', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true });
    const store = await readCanonicalEventStore(changeDir);
    const compiled = await compileOpenSpecChange({ changeDir });
    const appended = await appendRelayEventV2({ changeDir, event: createRelayEventV2({
      eventId: 'human-action-after-pause', runId: store.runId, changeName: store.changeName,
      occurredAt: '2026-09-09T12:00:00.000Z',
      sourceDigests: Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest])),
      actor: { kind: 'human' }, provenance: { origin: 'pause-resume-test' },
      payload: { type: 'human.decision', gateId: 'new-acceptance', decision: 'requested', reason: 'New material decision.' },
    }) });
    await writeReplayedProjectionsV2({ changeDir, store: appended.store, compiled });
    await expect(resumeRelayChangeV1({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      resumed: false, continued: false,
      drift: expect.arrayContaining([expect.stringMatching(/human actions changed/i)]),
    });
  });

  it('blocks a newly observed mutation-capable dispatch that was absent at pause', async () => {
    const { root } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true, dispatches: [] });
    await expect(resumeRelayChangeV1({
      change: 'demo', projectRoot: root,
      dispatches: [{ dispatchId: 'new-writer', state: 'running', readOnly: false }],
    })).resolves.toMatchObject({
      resumed: false, released: false,
      drift: expect.arrayContaining([expect.stringMatching(/new-writer/)]),
    });
  });

  it('reconstructs a safe route when no checkpoint exists', async () => {
    const { root } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await expect(resumeRelayChangeV1({
      change: 'demo', projectRoot: root, enterRoute: 'plan',
      dispatches: [{ dispatchId: 'new-writer', state: 'running', readOnly: false }],
    })).resolves.toMatchObject({
      resumed: false, released: false, reconstructed: true,
      drift: expect.arrayContaining([expect.stringMatching(/new-writer/)]),
      decision: { automatic: false },
    });
    await expect(resumeRelayChangeV1({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      resumed: false, decision: { restored: false, route: 'plan' },
    });
  });
});
