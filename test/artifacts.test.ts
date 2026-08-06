import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/index.js';
import {
  assertStableTaskBinding,
  resolveContainedArtifactPath,
} from '../src/artifacts.js';
import { compileCurrentOpenSpecChange } from '../src/openspec-adapter.js';
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

  it('distinguishes explicit stable task IDs from positional compatibility IDs', async () => {
    const { changeDir } = await createOpenSpecProject();
    const explicit = await compileOpenSpecChange({ changeDir });
    expect(explicit.graph.nodes.map((task) => [task.taskId, task.idStability]))
      .toEqual([['1.1', 'explicit'], ['1.2', 'explicit']]);
    expect(() => assertStableTaskBinding(explicit.graph.nodes[0])).not.toThrow();

    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] Implement behavior\n');
    const positional = await compileOpenSpecChange({ changeDir });
    expect(positional.graph.nodes[0]).toMatchObject({
      taskId: 'position:1',
      idStability: 'positional',
    });
    expect(() => assertStableTaskBinding(positional.graph.nodes[0]))
      .toThrow(/explicit stable identifier/i);
  });

  it('prefers versioned machine-readable task output when it is available', async () => {
    const { changeDir } = await createOpenSpecProject();
    const compiled = await compileOpenSpecChange({
      changeDir,
      machineReadable: {
        adapterVersion: 'openspec-apply-json-v1',
        tasks: [
          { id: '1', description: '9.4 Verify published packages', done: true },
          { id: '2', description: '10.1 Release independently', done: false },
        ],
      },
    });
    expect(compiled.taskAdapter).toBe('openspec-apply-json-v1');
    expect(compiled.graph.nodes.map((task) => [task.taskId, task.status]))
      .toEqual([['9.4', 'complete'], ['10.1', 'pending']]);
  });

  it('loads public OpenSpec apply/show JSON before using the Markdown compatibility adapter', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const calls: string[][] = [];
    const compiled = await compileCurrentOpenSpecChange({
      projectRoot: root,
      changeName: 'demo',
      changeDir,
      execute: async (args) => {
        calls.push(args);
        if (args[0] === 'instructions') {
          return { tasks: [{ id: '1', description: '7.2 Machine task', done: true }] };
        }
        return {
          deltas: [{ spec: 'demo', requirements: [{ text: 'Demonstrate behavior' }] }],
        };
      },
    });
    expect(calls.map((args) => args[0])).toEqual(['instructions', 'show']);
    expect(compiled).toMatchObject({
      taskAdapter: 'openspec-apply-json-v1',
      requirementAdapter: 'openspec-show-json-v1',
    });
    expect(compiled.graph.nodes[0]).toMatchObject({ taskId: '7.2', status: 'complete' });

    const fallback = await compileCurrentOpenSpecChange({
      projectRoot: root,
      changeName: 'demo',
      changeDir,
      execute: async () => { throw new Error('unsupported'); },
    });
    expect(fallback).toMatchObject({ taskAdapter: 'markdown-v1', requirementAdapter: 'markdown-v1' });
  });

  it('records contained portable artifact paths and source digests', async () => {
    const { changeDir } = await createOpenSpecProject();
    const compiled = await compileOpenSpecChange({ changeDir });
    expect(compiled.artifacts.length).toBeGreaterThan(3);
    for (const artifact of compiled.artifacts) {
      expect(artifact.path).not.toMatch(/^(?:[A-Za-z]:|\/)/);
      expect(artifact.path).not.toContain('\\');
      expect(artifact.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(compiled.graph.nodes.every((task) =>
      task.sourcePath === 'tasks.md' && /^[a-f0-9]{64}$/.test(task.sourceDigest))).toBe(true);
  });

  it('resolves cross-platform artifact paths without permitting aliases to escape the change', () => {
    expect(resolveContainedArtifactPath(
      'C:\\Repo\\openspec\\changes\\Demo Change',
      'specs\\UI Design\\spec.md',
      path.win32,
    )).toBe('C:\\Repo\\openspec\\changes\\Demo Change\\specs\\UI Design\\spec.md');
    expect(() => resolveContainedArtifactPath(
      'C:\\Repo\\openspec\\changes\\Demo',
      '..\\Other\\tasks.md',
      path.win32,
    )).toThrow(/escapes/i);
    expect(() => resolveContainedArtifactPath('/repo/openspec/changes/demo', '/tmp/tasks.md', path.posix))
      .toThrow(/change-relative/i);
  });
});
