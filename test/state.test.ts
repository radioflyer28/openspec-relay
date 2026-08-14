import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  atomicWriteJson,
  readRunStateV2,
  resolveChangeDirectory,
  resolveChangePathForPlatform,
} from '../src/state.js';
import { startGsdRunV2 } from '../src/runner-v2.js';

const roots: string[] = [];

async function project(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-state-'));
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

  it('rejects a generated-state symlink without writing outside the change', async () => {
    const root = await project();
    const changeDir = path.join(root, 'openspec', 'changes', 'demo');
    await fs.mkdir(path.join(changeDir, 'specs', 'demo'), { recursive: true });
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '## Why\n\nDemo.\n');
    await fs.writeFile(path.join(changeDir, 'design.md'), '## Decisions\n\nDemo.\n');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '## 1. Work\n\n- [ ] 1.1 Implement behavior\n');
    await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '', '### Requirement: Demo', 'The system SHALL work.', '',
      '#### Scenario: Works', '- **WHEN** invoked', '- **THEN** it works', '',
    ].join('\n'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-outside-'));
    roots.push(outside);
    await fs.symlink(outside, path.join(changeDir, '.openspec-gsd'), 'dir');

    await expect(startGsdRunV2({ change: 'demo', projectRoot: root })).rejects.toThrow(/symlink|outside|contain/i);
    await expect(readRunStateV2(changeDir)).rejects.toThrow(/symlink|outside|contain/i);
    expect(await fs.readdir(outside)).toEqual([]);
  });
});
