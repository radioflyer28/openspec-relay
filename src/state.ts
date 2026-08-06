import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  GuardrailsAssuranceV1Schema,
  GuardrailsRunV1Schema,
  type GuardrailsAssuranceV1,
  type GuardrailsRunV1,
} from './schemas.js';

export interface ResolvedChange {
  projectRoot: string;
  changeDir: string;
  changeName: string;
  archived: boolean;
  changeRef: string;
}

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

export function guardrailsDirectory(changeDir: string): string {
  return path.join(changeDir, '.guardrails');
}

export function runStatePath(changeDir: string): string {
  return path.join(guardrailsDirectory(changeDir), 'run.json');
}

export function assuranceStatePath(changeDir: string): string {
  return path.join(guardrailsDirectory(changeDir), 'assurance.json');
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

export async function readRunState(changeDir: string): Promise<GuardrailsRunV1> {
  return GuardrailsRunV1Schema.parse(JSON.parse(await fs.readFile(runStatePath(changeDir), 'utf8')));
}

export async function readAssuranceState(changeDir: string): Promise<GuardrailsAssuranceV1> {
  return GuardrailsAssuranceV1Schema.parse(
    JSON.parse(await fs.readFile(assuranceStatePath(changeDir), 'utf8')),
  );
}

export async function writeRunState(changeDir: string, run: GuardrailsRunV1): Promise<void> {
  await atomicWriteJson(runStatePath(changeDir), GuardrailsRunV1Schema.parse(run));
}

export async function writeAssuranceState(
  changeDir: string,
  assurance: GuardrailsAssuranceV1,
  run?: GuardrailsRunV1,
): Promise<string> {
  const validated = GuardrailsAssuranceV1Schema.parse(assurance);
  const assuranceDigest = digestJson(validated);
  await atomicWriteJson(assuranceStatePath(changeDir), validated);
  if (run) {
    await writeRunState(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
  }
  return assuranceDigest;
}
