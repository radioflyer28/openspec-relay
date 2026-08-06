import { afterEach, describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('OpenSpec plan compilation', () => {
  it('references source identifiers without copying task or requirement prose into nodes', async () => {
    const { changeDir } = await createOpenSpecProject();
    const compiled = await compileOpenSpecChange({
      changeDir,
      taskMetadata: {
        '1.1': {
          dependencies: [],
          writeSet: ['src/behavior.ts'],
          requirementRefs: ['spec:demo#requirement:demonstrate-behavior'],
          scenarioRefs: ['spec:demo#requirement:demonstrate-behavior/scenario:works'],
        },
        '1.2': { dependencies: ['1.1'], writeSet: ['README.md'] },
      },
    });
    expect(compiled.graph.waves).toEqual([['1.1'], ['1.2']]);
    expect(compiled.requirementIds).toContain('spec:demo#requirement:demonstrate-behavior');
    expect(compiled.scenarioIds).toContain('spec:demo#requirement:demonstrate-behavior/scenario:works');
    const records = JSON.stringify({ artifacts: compiled.artifacts, graph: compiled.graph });
    expect(records).not.toContain('Implement behavior');
    expect(records).not.toContain('The system SHALL');
  });
});
