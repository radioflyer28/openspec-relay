import { describe, expect, it } from 'vitest';
import {
  buildExecutionGraph,
  executeWithTier,
  type RoleDispatcherV1,
  type TaskNodeV1,
} from '../src/index.js';

const node = (taskId: string, dependencies: string[] = [], writeSet: string[] = []): TaskNodeV1 => ({
  taskId, dependencies, writeSet, risk: 'low', expectedVerification: [],
  requirementRefs: [], scenarioRefs: [], status: 'pending',
});

describe('portable execution adapters', () => {
  it('runs Tier 0 sequentially and Tier 1 in isolated role contexts', async () => {
    const requests: any[] = [];
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => {
      requests.push(request);
      return { status: 'pass', summary: request.role, evidenceRefs: [] };
    } };
    const graph = buildExecutionGraph([node('1'), node('2', ['1'])]);
    await executeWithTier({ tier: 'tier0', graph, dispatcher });
    expect(requests.filter((item) => item.role === 'executor').map((item) => item.taskId)).toEqual(['1', '2']);
    expect(requests.filter((item) => item.role !== 'executor').every((item) => item.readOnly)).toBe(true);
    requests.length = 0;
    await executeWithTier({ tier: 'tier1', graph, dispatcher });
    expect(requests.every((item) => item.isolated)).toBe(true);
  });

  it('isolates Tier 2 waves, serializes merges, and reports deterministically', async () => {
    const events: string[] = [];
    const graph = buildExecutionGraph([
      node('2', [], ['src/b.ts']), node('1', [], ['src/a.ts']), node('3', ['1', '2']),
    ]);
    const result = await executeWithTier({
      tier: 'tier2',
      graph,
      dispatcher: { dispatch: async (request) => ({
        status: 'pass', summary: request.workspace ?? request.role, evidenceRefs: [],
      }) },
      worktrees: {
        create: async (taskId) => { events.push(`create:${taskId}`); return `/isolated/${taskId}`; },
        merge: async (taskId) => { events.push(`merge:${taskId}`); },
        cleanup: async (taskId) => { events.push(`cleanup:${taskId}`); },
      },
    });
    expect(result.tasks.map((task) => task.taskId)).toEqual(['1', '2', '3']);
    expect(events.filter((event) => event.startsWith('merge'))).toEqual(['merge:1', 'merge:2', 'merge:3']);
    expect(result.stoppedAfterFailure).toBe(false);
  });

  it('stops dependent work after a partial failure', async () => {
    const graph = buildExecutionGraph([node('1'), node('2', ['1'])]);
    const result = await executeWithTier({
      tier: 'tier1', graph,
      dispatcher: { dispatch: async (request) => ({
        status: request.taskId === '1' ? 'fail' : 'pass', summary: 'result', evidenceRefs: [],
      }) },
    });
    expect(result.tasks.map((task) => task.taskId)).toEqual(['1']);
    expect(result.stoppedAfterFailure).toBe(true);
    expect(result.review).toBeUndefined();
  });
});
