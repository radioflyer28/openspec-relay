import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  replaceDiscussionCheckpointV1,
  resumeDiscussionCheckpointV1,
} from '../src/discussion-registry.js';
import { pauseRelayChangeV1, resumeRelayChangeV1 } from '../src/pause-resume.js';
import type { LifecycleStageV1 } from '../src/schemas.js';
import { startRelayRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('Tier 0 pause/resume lifecycle', () => {
  it('restores each change-scoped lifecycle stage without creating GSD administration', async () => {
    const stages: LifecycleStageV1[] = [
      'planning', 'implementation', 'review', 'repair', 'verification', 'debug', 'uat', 'archive',
    ];
    for (const stage of stages) {
      const { root } = await createOpenSpecProject();
      await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
      const paused = await pauseRelayChangeV1({ change: 'demo', projectRoot: root, stage, quiescenceObserved: true });
      expect(paused.checkpoint.stage).toBe(stage);
      expect((await resumeRelayChangeV1({
        change: 'demo', projectRoot: root, enterRoute: paused.checkpoint.resumeRoute,
      })).resumed).toBe(true);
      for (const excluded of ['PROJECT.md', 'ROADMAP.md', 'PLAN.md', 'STATE.md']) {
        await expect(fs.access(path.join(root, excluded))).rejects.toMatchObject({ code: 'ENOENT' });
      }
    }
  });

  it('restores pre-proposal discussion without creating a change or duplicating prose', async () => {
    const { root } = await createOpenSpecProject();
    await fs.rm(path.join(root, 'openspec', 'changes', 'demo'), { recursive: true });
    await replaceDiscussionCheckpointV1({ projectRoot: root, checkpoint: {
      workingId: 'new-capability', goal: 'Clarify the product.',
      confirmedDecisions: [{ decisionId: 'D1', summary: 'Use one bounded checkpoint.' }],
      rejectedAlternatives: [],
      openQuestions: [{ questionId: 'Q1', summary: 'Which observable outcome matters?' }],
      frontierIds: ['Q1'],
    } });
    const resumed = await resumeDiscussionCheckpointV1({ projectRoot: root });
    expect(resumed).toMatchObject({ restored: true, nextQuestion: { questionId: 'Q1' } });
    expect(await fs.readdir(path.join(root, 'openspec', 'changes'))).toEqual([]);
  });

  it('makes corrupt checkpoints and projection mismatch visible without changing workspace files', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const source = path.join(root, 'keep.txt');
    await fs.writeFile(source, 'keep me\n');
    await startRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    await pauseRelayChangeV1({ change: 'demo', projectRoot: root, quiescenceObserved: true });
    const runPath = path.join(changeDir, '.openspec-relay', 'run.json');
    const run = JSON.parse(await fs.readFile(runPath, 'utf8'));
    await fs.writeFile(runPath, JSON.stringify({ ...run, status: 'complete' }));
    const mismatch = await resumeRelayChangeV1({ change: 'demo', projectRoot: root });
    expect(mismatch).toMatchObject({ resumed: false, drift: expect.arrayContaining([expect.stringMatching(/projection/i)]) });
    expect(await fs.readFile(source, 'utf8')).toBe('keep me\n');

    const eventsPath = path.join(changeDir, '.openspec-relay', 'events.json');
    const events = JSON.parse(await fs.readFile(eventsPath, 'utf8'));
    events.events.at(-1).payload.checkpoint.workspace = [{ path: '../escape', status: 'unknown' }];
    await fs.writeFile(eventsPath, JSON.stringify(events));
    await expect(resumeRelayChangeV1({ change: 'demo', projectRoot: root })).rejects.toThrow();
    expect(await fs.readFile(source, 'utf8')).toBe('keep me\n');
  });
});
