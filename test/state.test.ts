import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  atomicWriteJson,
  resolveChangeDirectory,
  resolveChangePathForPlatform,
} from '../src/index.js';

const roots: string[] = [];

async function project(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guardrails-state-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'demo'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('change resolution and atomic state', () => {
  it('resolves active names, aliases, and archived relocation', async () => {
    const root = await project();
    expect((await resolveChangeDirectory({ projectRoot: root, change: 'demo' })).archived).toBe(false);
    await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
    await fs.rename(
      path.join(root, 'openspec', 'changes', 'demo'),
      path.join(root, 'openspec', 'changes', 'archive', '2026-08-04-demo'),
    );
    const archived = await resolveChangeDirectory({ projectRoot: root, change: 'demo' });
    expect(archived).toMatchObject({ archived: true, changeName: 'demo' });
    expect(archived.changeRef).toBe('openspec/changes/archive/2026-08-04-demo');
  });

  it('uses Windows path semantics without hardcoded separators', () => {
    expect(resolveChangePathForPlatform('C:\\repo', 'demo', path.win32))
      .toBe(path.win32.join('C:\\repo', 'openspec', 'changes', 'demo'));
    expect(resolveChangePathForPlatform('C:\\repo', 'openspec\\changes\\demo', path.win32))
      .toBe(path.win32.resolve('C:\\repo', 'openspec\\changes\\demo'));
  });

  it('preserves the previous file when atomic replacement fails', async () => {
    const root = await project();
    const filename = path.join(root, 'state.json');
    await fs.writeFile(filename, '{"old":true}\n');
    await expect(atomicWriteJson(filename, { old: false }, {
      rename: async () => { throw new Error('interrupted'); },
    })).rejects.toThrow('interrupted');
    expect(await fs.readFile(filename, 'utf8')).toBe('{"old":true}\n');
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
