import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGsdConfigV2 } from '../src/config.js';
import { gsdDirectory } from '../src/state.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('OpenSpec GSD product identity', () => {
  it('exposes only the confirmed package, CLI, extension, and gate identities', async () => {
    const pkg = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8')) as {
      name: string;
      bin: Record<string, string>;
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const manifest = JSON.parse(await fs.readFile(path.resolve('openspec-extension.json'), 'utf8')) as {
      id: string;
      contributes: {
        workflows: Array<{ name: string; gateDependencies: string[] }>;
        gates: Array<{ id: string; export: string }>;
      };
    };

    expect(pkg.name).toBe('openspec-gsd');
    expect(pkg.bin).toEqual({ 'openspec-gsd': './dist/cli.js' });
    expect(Object.keys(pkg.scripts)).not.toContain('publish');
    expect(pkg.dependencies).not.toHaveProperty('gsd-core');
    expect(manifest.id).toBe('gsd');
    expect(manifest.contributes.workflows).toHaveLength(7);
    expect(manifest.contributes.workflows.every(({ name }) => name.startsWith('OpenSpec GSD '))).toBe(true);
    expect(new Set(manifest.contributes.workflows.flatMap(({ gateDependencies }) => gateDependencies)))
      .toEqual(new Set(['gsd.assurance']));
    expect(manifest.contributes.gates).toEqual([
      expect.objectContaining({ id: 'gsd.assurance', export: 'gsdAssuranceGate' }),
    ]);
  });

  it('uses only OpenSpec GSD configuration and execution-record paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-gsd-identity-'));
    roots.push(root);
    const changeDir = path.join(root, 'openspec', 'changes', 'demo');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(root, 'openspec', 'gsd.json'), JSON.stringify({ mode: 'quick' }));

    expect(gsdDirectory(changeDir)).toBe(path.join(changeDir, '.openspec-gsd'));
    expect((await loadGsdConfigV2({ projectRoot: root, changeDir })).mode).toBe('quick');
  });

  it('does not create a complete GSD runtime or planning hierarchy', async () => {
    for (const forbidden of ['.planning', 'PROJECT.md', 'ROADMAP.md', 'PLAN.md', 'STATE.md']) {
      await expect(fs.access(path.resolve(forbidden))).rejects.toThrow();
    }
  });
});
