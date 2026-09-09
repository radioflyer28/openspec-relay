import { afterEach, describe, expect, it } from 'vitest';
import {
  PauseCheckpointV1Schema,
  RelayEventPayloadV2Schema,
  WorkspaceEntryV1Schema,
} from '../src/schemas.js';
import { cleanupTemporaryRoots } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const digest = 'a'.repeat(64);
const checkpoint = {
  version: 1 as const,
  pauseId: 'pause-1',
  changeName: 'demo',
  runId: 'run-1',
  createdAt: '2026-09-09T12:00:00.000Z',
  planRevision: digest,
  stage: 'implementation' as const,
  activity: { kind: 'task' as const, id: '1.1', mutationCapable: true },
  taskIds: ['1.1'],
  repositoryRevision: 'abc123',
  workspace: [{ path: 'src/index.ts', status: 'modified' as const, digest }],
  dispatches: [{ dispatchId: 'review-1', state: 'stopped' as const, readOnly: true, sessionId: 'session-1' }],
  findingIds: ['finding-1'],
  humanActionIds: [],
  resumeRoute: 'do' as const,
  stateFingerprint: digest,
  quiescence: 'safe' as const,
};

describe('pause and resume schemas', () => {
  it('accepts bounded pointer-only checkpoint and event payloads', () => {
    expect(PauseCheckpointV1Schema.parse(checkpoint)).toEqual(checkpoint);
    expect(RelayEventPayloadV2Schema.parse({ type: 'workflow.paused', checkpoint })).toMatchObject({
      type: 'workflow.paused', checkpoint: { pauseId: 'pause-1' },
    });
    expect(RelayEventPayloadV2Schema.parse({
      type: 'workflow.resumed', pauseId: 'pause-1', checkpointFingerprint: digest,
      route: 'do', reconstructed: false,
    })).toMatchObject({ type: 'workflow.resumed', route: 'do' });
  });

  it('rejects unsafe paths, malformed identities, unsupported states, and prose copies', () => {
    for (const path of ['../secret', '/tmp/secret', 'C:\\secret', 'src\\index.ts']) {
      expect(() => WorkspaceEntryV1Schema.parse({ path, status: 'modified' })).toThrow();
    }
    expect(() => PauseCheckpointV1Schema.parse({ ...checkpoint, pauseId: '' })).toThrow();
    expect(() => PauseCheckpointV1Schema.parse({ ...checkpoint,
      dispatches: [{ dispatchId: 'd', state: 'completed', readOnly: true }] })).toThrow();
    expect(() => PauseCheckpointV1Schema.parse({ ...checkpoint, taskProse: 'Implement the feature' })).toThrow();
    expect(() => RelayEventPayloadV2Schema.parse({
      type: 'workflow.resumed', pauseId: 'pause-1', checkpointFingerprint: digest,
      route: 'invented-stage', reconstructed: false,
    })).toThrow();
  });
});
