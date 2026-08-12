import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  GuardrailsAssuranceV1Schema,
  GuardrailsAssuranceV2Schema,
  GuardrailsRunV1Schema,
  GuardrailsRunV2Schema,
  type GuardrailsAssuranceV1,
  type GuardrailsAssuranceV2,
  type GuardrailsRunV1,
  type GuardrailsRunV2,
} from './schemas.js';

export interface ResolvedChange {
  projectRoot: string;
  changeDir: string;
  changeName: string;
  archived: boolean;
  changeRef: string;
}

/**
 * Every generated path owned by Guardrails. Values are portable identities;
 * callers must use guardrailsGeneratedPath() at a filesystem boundary.
 */
export const GUARDRAILS_GENERATED_FILES = {
  run: 'run.json',
  assurance: 'assurance.json',
  events: 'events.json',
  eventsLock: 'events.lock',
  v1MigrationBackup: 'reports/v1-migration-backup.json',
  migrationPreview: 'reports/migration-preview.json',
  v1CompatibilityExport: 'reports/v1-compatibility-export.json',
  repositoryContext: 'reports/repository-context.json',
  readiness: 'reports/readiness.json',
  findings: 'reports/findings.json',
  debug: 'reports/debug.json',
  uat: 'reports/uat.json',
  release: 'reports/release.json',
} as const;

export type GuardrailsGeneratedFile = keyof typeof GUARDRAILS_GENERATED_FILES;

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

export function guardrailsGeneratedPath(
  changeDir: string,
  file: GuardrailsGeneratedFile,
  pathApi: path.PlatformPath = path,
): string {
  return pathApi.join(guardrailsDirectory(changeDir), ...GUARDRAILS_GENERATED_FILES[file].split('/'));
}

export function runStatePath(changeDir: string): string {
  return guardrailsGeneratedPath(changeDir, 'run');
}

export function assuranceStatePath(changeDir: string): string {
  return guardrailsGeneratedPath(changeDir, 'assurance');
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Validate a Guardrails-owned path without trusting symlinks or junctions in
 * the generated-state tree. Missing parent directories are created one level
 * at a time and revalidated before use.
 */
export async function assertGuardrailsGeneratedPath(options: {
  changeDir: string;
  filename: string;
  createParents?: boolean;
  allowMissingFile?: boolean;
}): Promise<string> {
  const logicalChangeRoot = path.resolve(options.changeDir);
  const logicalGuardrailsRoot = path.join(logicalChangeRoot, '.guardrails');
  const target = path.resolve(options.filename);
  if (!contained(logicalGuardrailsRoot, target)) {
    throw new Error(`Generated Guardrails path '${target}' escapes the active change workspace.`);
  }
  const realChangeRoot = await fs.realpath(logicalChangeRoot);
  const expectedRealRoot = path.join(realChangeRoot, '.guardrails');
  try {
    const rootStat = await fs.lstat(logicalGuardrailsRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error(`Generated Guardrails directory '${logicalGuardrailsRoot}' must be a real directory, not a symlink or junction.`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.createParents) throw error;
    await fs.mkdir(logicalGuardrailsRoot).catch((mkdirError) => {
      if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
    });
  }
  const realGuardrailsRoot = await fs.realpath(logicalGuardrailsRoot);
  if (path.normalize(realGuardrailsRoot) !== path.normalize(expectedRealRoot)) {
    throw new Error(`Generated Guardrails directory '${logicalGuardrailsRoot}' resolves outside the active change workspace.`);
  }

  const relative = path.relative(logicalGuardrailsRoot, target);
  const parentSegments = path.dirname(relative) === '.' ? [] : path.dirname(relative).split(path.sep);
  let current = logicalGuardrailsRoot;
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Generated Guardrails ancestor '${current}' must be a real directory.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.createParents) throw error;
      await fs.mkdir(current).catch((mkdirError) => {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      });
    }
    const realCurrent = await fs.realpath(current);
    if (!contained(realGuardrailsRoot, realCurrent)) {
      throw new Error(`Generated Guardrails ancestor '${current}' resolves outside the active change workspace.`);
    }
  }
  try {
    const targetStat = await fs.lstat(target);
    if (targetStat.isSymbolicLink()) throw new Error(`Generated Guardrails file '${target}' must not be a symlink.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.allowMissingFile) throw error;
  }
  return target;
}

export async function readGuardrailsText(changeDir: string, filename: string): Promise<string> {
  const safe = await assertGuardrailsGeneratedPath({ changeDir, filename });
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

export async function atomicWriteGuardrailsJson(
  changeDir: string,
  filename: string,
  value: unknown,
  operations: { beforeCommit?: () => Promise<void>; failBeforeCommit?: boolean } = {},
): Promise<void> {
  const safe = await assertGuardrailsGeneratedPath({
    changeDir, filename, createParents: true, allowMissingFile: true,
  });
  const parent = path.dirname(safe);
  const identity = await fs.stat(parent, { bigint: true });
  await operations.beforeCommit?.();
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const script = [
    "import { promises as fs } from 'node:fs';",
    "import { randomUUID } from 'node:crypto';",
    'const [filename, expectedDev, expectedIno, fail] = process.argv.slice(1);',
    "const actual = await fs.stat('.', { bigint: true });",
    "if (String(actual.dev) !== expectedDev || String(actual.ino) !== expectedIno) throw new Error('Guardrails generated-state ancestor changed before commit.');",
    "let content = ''; for await (const chunk of process.stdin) content += chunk;",
    "const temporary = `.${filename}.${process.pid}.${randomUUID()}.tmp`;",
    'try {',
    "  await fs.writeFile(temporary, content, { flag: 'wx' });",
    "  if (fail === 'true') throw new Error('interrupted');",
    '  await fs.rename(temporary, filename);',
    '} finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }',
  ].join('\n');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--input-type=module', '-e', script, path.basename(safe), String(identity.dev), String(identity.ino),
      String(Boolean(operations.failBeforeCommit)),
    ], { cwd: parent, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_096); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(
      stderr.match(/Error: ([^\n]+)/)?.[1] ?? `Guardrails state writer exited with code ${code}.`,
    )));
    child.stdin.end(content);
  });
  await assertGuardrailsGeneratedPath({ changeDir, filename: safe });
}

export async function removeGuardrailsGeneratedFile(
  changeDir: string,
  filename: string,
  operations: { beforeRemove?: () => Promise<void> } = {},
): Promise<void> {
  const safe = await assertGuardrailsGeneratedPath({ changeDir, filename, allowMissingFile: true });
  const parent = path.dirname(safe);
  const identity = await fs.stat(parent, { bigint: true });
  await operations.beforeRemove?.();
  const script = [
    "import { promises as fs } from 'node:fs';",
    'const [filename, expectedDev, expectedIno] = process.argv.slice(1);',
    "const actual = await fs.stat('.', { bigint: true });",
    "if (String(actual.dev) !== expectedDev || String(actual.ino) !== expectedIno) throw new Error('Guardrails generated-state ancestor changed before removal.');",
    'await fs.rm(filename, { force: true });',
  ].join('\n');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--input-type=module', '-e', script, path.basename(safe), String(identity.dev), String(identity.ino),
    ], { cwd: parent, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_096); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(
      stderr.match(/Error: ([^\n]+)/)?.[1] ?? `Guardrails state remover exited with code ${code}.`,
    )));
  });
}

export async function readRunState(changeDir: string): Promise<GuardrailsRunV1> {
  return GuardrailsRunV1Schema.parse(JSON.parse(await readGuardrailsText(changeDir, runStatePath(changeDir))));
}

export async function readAssuranceState(changeDir: string): Promise<GuardrailsAssuranceV1> {
  return GuardrailsAssuranceV1Schema.parse(
    JSON.parse(await readGuardrailsText(changeDir, assuranceStatePath(changeDir))),
  );
}

export async function readRunStateV2(changeDir: string): Promise<GuardrailsRunV2> {
  return GuardrailsRunV2Schema.parse(JSON.parse(await readGuardrailsText(changeDir, runStatePath(changeDir))));
}

export async function readAssuranceStateV2(changeDir: string): Promise<GuardrailsAssuranceV2> {
  return GuardrailsAssuranceV2Schema.parse(
    JSON.parse(await readGuardrailsText(changeDir, assuranceStatePath(changeDir))),
  );
}

export async function writeRunState(changeDir: string, run: GuardrailsRunV1): Promise<void> {
  await atomicWriteGuardrailsJson(changeDir, runStatePath(changeDir), GuardrailsRunV1Schema.parse(run));
}

export async function writeAssuranceState(
  changeDir: string,
  assurance: GuardrailsAssuranceV1,
  run?: GuardrailsRunV1,
): Promise<string> {
  const validated = GuardrailsAssuranceV1Schema.parse(assurance);
  const assuranceDigest = digestJson(validated);
  await atomicWriteGuardrailsJson(changeDir, assuranceStatePath(changeDir), validated);
  if (run) {
    await writeRunState(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
  }
  return assuranceDigest;
}

export async function writeRunStateV2(changeDir: string, run: GuardrailsRunV2): Promise<void> {
  await atomicWriteGuardrailsJson(changeDir, runStatePath(changeDir), GuardrailsRunV2Schema.parse(run));
}

export async function writeAssuranceStateV2(
  changeDir: string,
  assurance: GuardrailsAssuranceV2,
  run?: GuardrailsRunV2,
): Promise<string> {
  const validated = GuardrailsAssuranceV2Schema.parse(assurance);
  const assuranceDigest = digestJson(validated);
  await atomicWriteGuardrailsJson(changeDir, assuranceStatePath(changeDir), validated);
  if (run) {
    await writeRunStateV2(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
  }
  return assuranceDigest;
}
