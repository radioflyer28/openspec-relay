import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  GsdAssuranceV1Schema,
  GsdAssuranceV2Schema,
  GsdRunV1Schema,
  GsdRunV2Schema,
  type GsdAssuranceV1,
  type GsdAssuranceV2,
  type GsdRunV1,
  type GsdRunV2,
} from './schemas.js';

export interface ResolvedChange {
  projectRoot: string;
  changeDir: string;
  changeName: string;
  archived: boolean;
  changeRef: string;
}

/**
 * Every generated path owned by OpenSpec GSD. Values are portable identities;
 * callers must use gsdGeneratedPath() at a filesystem boundary.
 */
export const GSD_GENERATED_FILES = {
  run: 'run.json',
  assurance: 'assurance.json',
  events: 'events.json',
} as const;

export type GsdGeneratedFile = keyof typeof GSD_GENERATED_FILES;

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

export async function resolveProjectRoot(start = process.cwd()): Promise<string> {
  let current = path.resolve(start);
  while (true) {
    if (await isDirectory(path.join(current, 'openspec'))) return fs.realpath(current);
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`No OpenSpec project found from '${start}'.`);
    current = parent;
  }
}

export function resolveChangePathForPlatform(
  projectRoot: string,
  change: string,
  pathApi: path.PlatformPath = path,
): string {
  if (pathApi.isAbsolute(change)) return pathApi.normalize(change);
  const hasSeparator = change.includes(pathApi.sep) || change.includes('/') || change.includes('\\');
  return hasSeparator
    ? pathApi.resolve(projectRoot, change)
    : pathApi.join(projectRoot, 'openspec', 'changes', change);
}

function portableRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

export async function resolveChangeDirectory(options: {
  projectRoot?: string;
  change: string;
}): Promise<ResolvedChange> {
  const projectRoot = await resolveProjectRoot(options.projectRoot ?? process.cwd());
  const changesRoot = await fs.realpath(path.join(projectRoot, 'openspec', 'changes'));
  let candidate = resolveChangePathForPlatform(projectRoot, options.change);
  let archived = candidate.split(path.sep).includes('archive');

  if (!(await isDirectory(candidate)) && !path.isAbsolute(options.change) &&
      !options.change.includes('/') && !options.change.includes('\\')) {
    const archiveRoot = path.join(changesRoot, 'archive');
    const matches = (await fs.readdir(archiveRoot, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory() &&
        (entry.name === options.change || entry.name.endsWith(`-${options.change}`)))
      .map((entry) => path.join(archiveRoot, entry.name))
      .sort();
    if (matches.length > 1) {
      throw new Error(`Archived change '${options.change}' is ambiguous: ${matches.join(', ')}.`);
    }
    if (matches.length === 1) {
      candidate = matches[0];
      archived = true;
    }
  }
  if (!(await isDirectory(candidate))) throw new Error(`OpenSpec change '${options.change}' not found.`);
  const changeDir = await fs.realpath(candidate);
  const relative = path.relative(changesRoot, changeDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Change path '${changeDir}' escapes '${changesRoot}'.`);
  }
  const basename = path.basename(changeDir);
  const changeName = archived ? basename.replace(/^\d{4}-\d{2}-\d{2}-/, '') : basename;
  return {
    projectRoot,
    changeDir,
    changeName,
    archived,
    changeRef: portableRelative(projectRoot, changeDir),
  };
}

export function gsdDirectory(changeDir: string): string {
  return path.join(changeDir, '.openspec-gsd');
}

export function gsdGeneratedPath(
  changeDir: string,
  file: GsdGeneratedFile,
  pathApi: path.PlatformPath = path,
): string {
  return pathApi.join(gsdDirectory(changeDir), ...GSD_GENERATED_FILES[file].split('/'));
}

export function runStatePath(changeDir: string): string {
  return gsdGeneratedPath(changeDir, 'run');
}

export function assuranceStatePath(changeDir: string): string {
  return gsdGeneratedPath(changeDir, 'assurance');
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Validate that a registered OpenSpec GSD path is contained by the active change
 * and that its existing ancestors are ordinary directories rather than links.
 */
export async function assertGsdGeneratedPath(options: {
  changeDir: string;
  filename: string;
  createParents?: boolean;
  allowMissingFile?: boolean;
}): Promise<string> {
  const logicalChangeRoot = path.resolve(options.changeDir);
  const logicalGsdRoot = path.join(logicalChangeRoot, '.openspec-gsd');
  const target = path.resolve(options.filename);
  if (!contained(logicalGsdRoot, target)) {
    throw new Error(`Generated OpenSpec GSD path '${target}' escapes the active change workspace.`);
  }
  const realChangeRoot = await fs.realpath(logicalChangeRoot);
  const expectedRealRoot = path.join(realChangeRoot, '.openspec-gsd');
  try {
    const rootStat = await fs.lstat(logicalGsdRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error(`Generated OpenSpec GSD directory '${logicalGsdRoot}' must be a real directory, not a symlink or junction.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.createParents) throw error;
    await fs.mkdir(logicalGsdRoot).catch((mkdirError) => {
      if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
    });
  }
  const realGsdRoot = await fs.realpath(logicalGsdRoot);
  if (path.normalize(realGsdRoot) !== path.normalize(expectedRealRoot)) {
    throw new Error(`Generated OpenSpec GSD directory '${logicalGsdRoot}' resolves outside the active change workspace.`);
  }

  const relative = path.relative(logicalGsdRoot, target);
  const parentSegments = path.dirname(relative) === '.' ? [] : path.dirname(relative).split(path.sep);
  let current = logicalGsdRoot;
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Generated OpenSpec GSD ancestor '${current}' must be a real directory.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.createParents) throw error;
      await fs.mkdir(current).catch((mkdirError) => {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      });
    }
    const realCurrent = await fs.realpath(current);
    if (!contained(realGsdRoot, realCurrent)) {
      throw new Error(`Generated OpenSpec GSD ancestor '${current}' resolves outside the active change workspace.`);
    }
  }
  try {
    const targetStat = await fs.lstat(target);
    if (targetStat.isSymbolicLink()) throw new Error(`Generated OpenSpec GSD file '${target}' must not be a symlink.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.allowMissingFile) throw error;
  }
  return target;
}

export async function readGsdText(changeDir: string, filename: string): Promise<string> {
  const safe = await assertGsdGeneratedPath({ changeDir, filename });
  return fs.readFile(safe, 'utf8');
}

export function digestJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function atomicWriteJson(
  filename: string,
  value: unknown,
  operations: { rename?: typeof fs.rename } = {},
): Promise<void> {
  const rename = operations.rename ?? fs.rename;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function atomicWriteText(
  filename: string,
  content: string,
  operations: { rename?: typeof fs.rename } = {},
): Promise<void> {
  const rename = operations.rename ?? fs.rename;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function atomicWriteGsdJson(
  changeDir: string,
  filename: string,
  value: unknown,
  operations: { beforeCommit?: () => Promise<void>; failBeforeCommit?: boolean } = {},
): Promise<void> {
  const safe = await assertGsdGeneratedPath({
    changeDir, filename, createParents: true, allowMissingFile: true,
  });
  await operations.beforeCommit?.();
  await atomicWriteJson(safe, value, {
    ...(operations.failBeforeCommit
      ? { rename: async () => { throw new Error('interrupted'); } }
      : {}),
  });
  await assertGsdGeneratedPath({ changeDir, filename: safe });
}

export async function removeGsdGeneratedFile(
  changeDir: string,
  filename: string,
  operations: { beforeRemove?: () => Promise<void> } = {},
): Promise<void> {
  const safe = await assertGsdGeneratedPath({ changeDir, filename, allowMissingFile: true });
  await operations.beforeRemove?.();
  await assertGsdGeneratedPath({ changeDir, filename: safe, allowMissingFile: true });
  await fs.rm(safe, { force: true });
}

export async function readRunState(changeDir: string): Promise<GsdRunV1> {
  return GsdRunV1Schema.parse(JSON.parse(await readGsdText(changeDir, runStatePath(changeDir))));
}

export async function readAssuranceState(changeDir: string): Promise<GsdAssuranceV1> {
  return GsdAssuranceV1Schema.parse(
    JSON.parse(await readGsdText(changeDir, assuranceStatePath(changeDir))),
  );
}

export async function readRunStateV2(changeDir: string): Promise<GsdRunV2> {
  return GsdRunV2Schema.parse(JSON.parse(await readGsdText(changeDir, runStatePath(changeDir))));
}

export async function readAssuranceStateV2(changeDir: string): Promise<GsdAssuranceV2> {
  return GsdAssuranceV2Schema.parse(
    JSON.parse(await readGsdText(changeDir, assuranceStatePath(changeDir))),
  );
}

export async function writeRunState(changeDir: string, run: GsdRunV1): Promise<void> {
  await atomicWriteGsdJson(changeDir, runStatePath(changeDir), GsdRunV1Schema.parse(run));
}

export async function writeAssuranceState(
  changeDir: string,
  assurance: GsdAssuranceV1,
  run?: GsdRunV1,
): Promise<string> {
  const validated = GsdAssuranceV1Schema.parse(assurance);
  const assuranceDigest = digestJson(validated);
  await atomicWriteGsdJson(changeDir, assuranceStatePath(changeDir), validated);
  if (run) {
    await writeRunState(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
  }
  return assuranceDigest;
}

export async function writeRunStateV2(changeDir: string, run: GsdRunV2): Promise<void> {
  await atomicWriteGsdJson(changeDir, runStatePath(changeDir), GsdRunV2Schema.parse(run));
}

export async function writeAssuranceStateV2(
  changeDir: string,
  assurance: GsdAssuranceV2,
  run?: GsdRunV2,
): Promise<string> {
  const validated = GsdAssuranceV2Schema.parse(assurance);
  const assuranceDigest = digestJson(validated);
  await atomicWriteGsdJson(changeDir, assuranceStatePath(changeDir), validated);
  if (run) {
    await writeRunStateV2(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
  }
  return assuranceDigest;
}
