import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeDiscussionCheckpointV1,
  discussionRegistryPath,
  readDiscussionRegistryV1,
  removeDiscussionCheckpointV1,
  replaceDiscussionCheckpointV1,
  resumeDiscussionCheckpointV1,
  selectDiscussionCheckpointV1,
} from '../src/discussion-registry.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const checkpoint = {
  workingId: 'cancellation-design',
  goal: 'Make cancellation predictable.',
  confirmedDecisions: [{ decisionId: 'D1', summary: 'Cancellation retains completed evidence.' }],
  rejectedAlternatives: [{ alternativeId: 'A1', summary: 'Discard all state.', reason: 'Loses trusted evidence.' }],
  openQuestions: [{ questionId: 'Q1', summary: 'Should read-only review continue?' }],
  frontierIds: ['Q1'],
};

describe('ephemeral discussion checkpoint registry', () => {
  it('writes bounded state atomically and rejects stale replacement', async () => {
    const { root } = await createOpenSpecProject();
    const first = await replaceDiscussionCheckpointV1({ projectRoot: root, checkpoint });
    expect(first.checkpoint.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(/transcript|privateReasoning/);
    await expect(replaceDiscussionCheckpointV1({
      projectRoot: root, expectedFingerprint: '0'.repeat(64), checkpoint: { ...checkpoint, frontierIds: [] },
    })).rejects.toThrow(/concurrent|fingerprint/i);
    const registry = await readDiscussionRegistryV1(root);
    expect(registry.discussions).toHaveLength(1);
  });

  it('requires explicit valid identities and rejects unsafe registry roots', async () => {
    const { root } = await createOpenSpecProject();
    await expect(replaceDiscussionCheckpointV1({
      projectRoot: root, checkpoint: { ...checkpoint, workingId: '../escape' },
    })).rejects.toThrow();
    const relayRoot = path.join(root, 'openspec', '.openspec-relay');
    await fs.symlink(path.join(root, 'outside'), relayRoot);
    await expect(readDiscussionRegistryV1(root)).rejects.toThrow(/symlink|owned/i);
    expect(discussionRegistryPath('C:\\repo', path.win32)).toBe('C:\\repo\\openspec\\.openspec-relay\\discussions.json');
  });

  it('selects exactly one active checkpoint without recency inference', async () => {
    const { root } = await createOpenSpecProject();
    await replaceDiscussionCheckpointV1({ projectRoot: root, checkpoint });
    expect((await selectDiscussionCheckpointV1({ projectRoot: root })).workingId).toBe(checkpoint.workingId);
    await replaceDiscussionCheckpointV1({ projectRoot: root, checkpoint: { ...checkpoint, workingId: 'second' } });
    await expect(selectDiscussionCheckpointV1({ projectRoot: root })).rejects.toThrow(/multiple|select/i);
    expect((await selectDiscussionCheckpointV1({ projectRoot: root, workingId: 'second' })).workingId).toBe('second');
    const resumed = await resumeDiscussionCheckpointV1({ projectRoot: root, workingId: checkpoint.workingId });
    expect(resumed).toMatchObject({
      restored: true,
      confirmedDecisions: [{ decisionId: 'D1' }],
      nextQuestion: { questionId: 'Q1' },
    });
    expect(resumed.unresolvedQuestions).toHaveLength(1);
    expect(await removeDiscussionCheckpointV1({ projectRoot: root, workingId: 'second' })).toBe(true);
    expect((await selectDiscussionCheckpointV1({ projectRoot: root })).workingId).toBe(checkpoint.workingId);
  });

  it('consumes only a fully confirmed OpenSpec mapping and preserves unresolved branches', async () => {
    const { root } = await createOpenSpecProject();
    await replaceDiscussionCheckpointV1({ projectRoot: root, checkpoint });
    await expect(consumeDiscussionCheckpointV1({
      projectRoot: root, workingId: checkpoint.workingId, changeName: 'demo', mappings: [],
    })).resolves.toMatchObject({ status: 'return_to_discussion' });
    const unresolved = await selectDiscussionCheckpointV1({ projectRoot: root });
    expect(unresolved.openQuestions).toHaveLength(1);
    await replaceDiscussionCheckpointV1({
      projectRoot: root,
      expectedFingerprint: unresolved.fingerprint,
      checkpoint: { ...checkpoint, openQuestions: [], frontierIds: [] },
    });
    await expect(consumeDiscussionCheckpointV1({
      projectRoot: root, workingId: checkpoint.workingId, changeName: 'demo',
      mappings: [{ decisionId: 'D1', artifact: 'spec', reference: 'REQ-1', status: 'consistent' }],
    })).resolves.toMatchObject({ status: 'pass' });
    await expect(selectDiscussionCheckpointV1({ projectRoot: root })).rejects.toThrow(/no active/i);
  });
});
