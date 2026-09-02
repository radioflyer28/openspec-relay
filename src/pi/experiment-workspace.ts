import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PiExperimentWorkspaceV1 {
  readonly root: string;
  read(relativePath: string): Promise<string>;
  write(relativePath: string, content: string): Promise<void>;
  trackedPaths(): string[];
  cleanup(): Promise<void>;
}

export function resolveContainedPath(
  root: string,
  relativePath: string,
  pathApi: path.PlatformPath = path,
): string {
  if (!relativePath || pathApi.isAbsolute(relativePath)) {
    throw new Error('Experiment paths must be non-empty relative paths.');
  }
  const normalizedRoot = pathApi.resolve(root);
  const target = pathApi.resolve(normalizedRoot, relativePath);
  const relative = pathApi.relative(normalizedRoot, target);
  if (!relative || relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
    throw new Error('Experiment path must remain contained in the disposable workspace.');
  }
  return target;
}

async function assertNoSymlink(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error(`Experiment path crosses symbolic link '${segment}'.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
}

export async function createPiExperimentWorkspace(options: {
  temporaryRoot?: string;
} = {}): Promise<PiExperimentWorkspaceV1> {
  const temporaryRoot = path.resolve(options.temporaryRoot ?? os.tmpdir());
  await fs.mkdir(temporaryRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'openspec-gsd-pathfinder-'));
  return workspaceForRoot(root, true);
}

export async function openPiExperimentWorkspace(root: string): Promise<PiExperimentWorkspaceV1> {
  const resolved = path.resolve(root);
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Experiment workspace root must be a real directory.');
  }
  return workspaceForRoot(resolved, false);
}

function workspaceForRoot(root: string, ownsRoot: boolean): PiExperimentWorkspaceV1 {
  const tracked = new Set<string>();
  let cleaned = false;
  const resolve = async (relativePath: string): Promise<string> => {
    if (cleaned) throw new Error('Experiment workspace has already been cleaned up.');
    const target = resolveContainedPath(root, relativePath);
    await assertNoSymlink(root, target);
    return target;
  };
  return Object.freeze({
    root,
    read: async (relativePath: string) => fs.readFile(await resolve(relativePath), 'utf8'),
    write: async (relativePath: string, content: string) => {
      const target = await resolve(relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await assertNoSymlink(root, target);
      await fs.writeFile(target, content, 'utf8');
      tracked.add(path.relative(root, target).split(path.sep).join('/'));
    },
    trackedPaths: () => [...tracked].sort(),
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      if (ownsRoot) await fs.rm(root, { recursive: true, force: true });
    },
  });
}
