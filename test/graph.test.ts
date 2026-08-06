import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildExecutionGraph, portableWriteSet, writeSetsOverlap, type TaskNodeV1 } from '../src/index.js';

const task = (taskId: string, options: Partial<TaskNodeV1> = {}): TaskNodeV1 => ({
  taskId,
  dependencies: [],
  risk: 'low',
  expectedVerification: ['targeted-tests'],
  writeSet: [],
  requirementRefs: [],
  scenarioRefs: [],
  status: 'pending',
  ...options,
});

describe('execution graph', () => {
  it('creates deterministic dependency waves and preserves task metadata', () => {
    const graph = buildExecutionGraph([
      task('2', { dependencies: ['1'], risk: 'high', expectedVerification: ['security'] }),
      task('1', { writeSet: ['src/a.ts'] }),
      task('3', { dependencies: ['1'] }),
    ]);
    expect(graph.waves).toEqual([['1'], ['2', '3']]);
    expect(graph.nodes.find((node) => node.taskId === '2')).toMatchObject({
      risk: 'high', expectedVerification: ['security'],
    });
  });

  it('rejects dependency cycles and unknown dependencies', () => {
    expect(() => buildExecutionGraph([
      task('1', { dependencies: ['2'] }), task('2', { dependencies: ['1'] }),
    ])).toThrow('dependency cycle');
    expect(() => buildExecutionGraph([task('1', { dependencies: ['missing'] })]))
      .toThrow("unknown task 'missing'");
  });

  it('serializes overlapping write sets while retaining safe parallel tasks', () => {
    const graph = buildExecutionGraph([
      task('1', { writeSet: ['src/auth'] }),
      task('2', { writeSet: ['src/auth/token.ts'] }),
      task('3', { writeSet: ['docs/readme.md'] }),
    ]);
    expect(graph.waves).toEqual([['1', '3'], ['2']]);
    expect(writeSetsOverlap(['src\\auth'], ['src/auth/token.ts'])).toBe(true);
    expect(portableWriteSet(['src\\auth\\token.ts'], path.win32)).toEqual(['src/auth/token.ts']);
  });
});
