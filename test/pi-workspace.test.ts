import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPiExperimentWorkspace,
  resolveContainedPath,
} from '../src/pi/experiment-workspace.js';
import { resolvePiRoleSessionRoots } from '../src/pi/sdk-runtime.js';

describe('Pi pathfinder experiment workspace', () => {
  it('keeps repository reads at the project root while confining experiment writes separately', () => {
    expect(resolvePiRoleSessionRoots('/project', '/private/tmp/pathfinder')).toEqual({
      cwd: '/project',
      experimentRoot: '/private/tmp/pathfinder',
    });
  });

  it('reads and writes only tracked relative paths inside its disposable root', async () => {
    const workspace = await createPiExperimentWorkspace();
    try {
      await workspace.write('models/state.json', '{"state":"ready"}');
      expect(await workspace.read('models/state.json')).toBe('{"state":"ready"}');
      expect(workspace.trackedPaths()).toEqual(['models/state.json']);
      await expect(workspace.write('../escape.txt', 'no')).rejects.toThrow(/contained|relative/i);
      await expect(workspace.write(path.resolve(os.tmpdir(), 'escape.txt'), 'no')).rejects.toThrow(/contained|relative/i);
    } finally {
      const root = workspace.root;
      await workspace.cleanup();
      await expect(fs.access(root)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('rejects symlink escape through an existing workspace entry', async () => {
    const workspace = await createPiExperimentWorkspace();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-relay-outside-'));
    try {
      await fs.symlink(outside, path.join(workspace.root, 'linked'));
      await expect(workspace.write('linked/escape.txt', 'no')).rejects.toThrow(/symbolic link|contained/i);
    } finally {
      await workspace.cleanup();
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('normalizes containment with platform path APIs', () => {
    expect(resolveContainedPath('C:\\work\\probe', 'models\\state.json', path.win32))
      .toBe('C:\\work\\probe\\models\\state.json');
    expect(() => resolveContainedPath('C:\\work\\probe', '..\\escape.txt', path.win32)).toThrow(/contained/i);
    expect(() => resolveContainedPath('/work/probe', '/tmp/escape.txt', path.posix)).toThrow(/relative/i);
  });
});
