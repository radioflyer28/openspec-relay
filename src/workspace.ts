import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { WorkspaceEntryV1Schema, type WorkspaceEntryV1 } from './schemas.js';

const execFileAsync = promisify(execFile);

export interface WorkspaceSnapshotV1 {
  revisionAvailable: boolean;
  repositoryRevision?: string;
  entries: WorkspaceEntryV1[];
}

function portableRelative(value: string): string {
  if (!value || /^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) || value.includes('\\')) {
    throw new Error(`Workspace path '${value}' must be a contained portable relative path.`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Workspace path '${value}' must be a contained portable relative path.`);
  }
  return value;
}

function containedPath(root: string, portable: string): string {
  const candidate = path.resolve(root, ...portableRelative(portable).split('/'));
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Workspace path '${portable}' is not contained by the project.`);
  }
  return candidate;
}

async function digestFile(root: string, portable: string): Promise<string | undefined> {
  try {
    const target = containedPath(root, portable);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return createHash('sha256').update(await fs.readFile(target)).digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function statusName(code: string): WorkspaceEntryV1['status'] {
  if (code === '??') return 'untracked';
  if (code.includes('R')) return 'renamed';
  if (code.includes('D')) return 'deleted';
  if (code.includes('A')) return 'added';
  if (code.includes('M')) return 'modified';
  return 'unknown';
}

async function gitSnapshot(projectRoot: string): Promise<WorkspaceSnapshotV1> {
  const [{ stdout: revision }, { stdout: porcelain }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }),
    execFileAsync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      { cwd: projectRoot, encoding: 'utf8' }),
  ]);
  const records = porcelain.split('\0').filter(Boolean);
  const entries: WorkspaceEntryV1[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const code = record.slice(0, 2);
    let portable = record.slice(3);
    if (code.includes('R') || code.includes('C')) index += 1; // -z emits destination first, then source.
    portable = portable.split(path.sep).join('/');
    if (portable.split('/').includes('.openspec-relay')) continue;
    const status = statusName(code);
    const digest = status === 'deleted' ? undefined : await digestFile(projectRoot, portable);
    entries.push(WorkspaceEntryV1Schema.parse({ path: portableRelative(portable), status, ...(digest ? { digest } : {}) }));
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { revisionAvailable: true, repositoryRevision: revision.trim(), entries };
}

export async function snapshotWorkspaceV1(options: {
  projectRoot: string;
  relevantPaths?: string[];
}): Promise<WorkspaceSnapshotV1> {
  const root = await fs.realpath(path.resolve(options.projectRoot));
  const relevant = options.relevantPaths?.map(portableRelative);
  try {
    const snapshot = await gitSnapshot(root);
    return relevant ? { ...snapshot, entries: snapshot.entries.filter((entry) => relevant.includes(entry.path)) } : snapshot;
  } catch (error) {
    const message = String((error as Error).message);
    if (!/not a git repository|ambiguous argument 'HEAD'|unknown revision/i.test(message)) throw error;
    const entries: WorkspaceEntryV1[] = [];
    for (const portable of relevant ?? []) {
      const digest = await digestFile(root, portable);
      if (digest) entries.push({ path: portable, status: 'modified', digest });
    }
    return { revisionAvailable: false, entries };
  }
}

export async function validateWorkspaceSnapshotV1(options: {
  projectRoot: string;
  expected: WorkspaceSnapshotV1;
}): Promise<{ matches: boolean; reasons: string[]; current: WorkspaceSnapshotV1 }> {
  const current = await snapshotWorkspaceV1({ projectRoot: options.projectRoot });
  const reasons: string[] = [];
  if (options.expected.revisionAvailable !== current.revisionAvailable ||
      options.expected.repositoryRevision !== current.repositoryRevision) reasons.push('Repository revision changed.');
  if (JSON.stringify(options.expected.entries) !== JSON.stringify(current.entries)) reasons.push('Workspace paths or digests changed.');
  return { matches: reasons.length === 0, reasons, current };
}
