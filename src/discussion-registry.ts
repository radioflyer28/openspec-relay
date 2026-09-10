import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { confirmDiscussionHandoff, type DiscussionArtifactMappingV1 } from './discussion.js';
import { atomicWriteJson, digestJson } from './state.js';

const WorkingIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const DecisionSchema = z.object({
  decisionId: z.string().min(1).max(128),
  summary: z.string().min(1).max(1000),
  dependsOn: z.array(z.string().min(1).max(128)).max(50).optional(),
}).strict();
const RejectedAlternativeSchema = z.object({
  alternativeId: z.string().min(1).max(128),
  summary: z.string().min(1).max(1000),
  reason: z.string().min(1).max(1000),
}).strict();
const OpenQuestionSchema = z.object({
  questionId: z.string().min(1).max(128),
  summary: z.string().min(1).max(1000),
  dependsOn: z.array(z.string().min(1).max(128)).max(50).optional(),
}).strict();

export const DiscussionCheckpointV1Schema = z.object({
  version: z.literal(1),
  workingId: WorkingIdSchema,
  status: z.enum(['active', 'consumed']),
  goal: z.string().min(1).max(2000),
  confirmedDecisions: z.array(DecisionSchema).max(100),
  rejectedAlternatives: z.array(RejectedAlternativeSchema).max(100),
  openQuestions: z.array(OpenQuestionSchema).max(100),
  frontierIds: z.array(z.string().min(1).max(128)).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  consumedBy: z.object({
    changeName: z.string().min(1).max(256),
    mappedDecisionIds: z.array(z.string().min(1).max(128)),
    consumedAt: z.string().datetime(),
  }).strict().optional(),
}).strict();

export const DiscussionRegistryV1Schema = z.object({
  version: z.literal(1),
  discussions: z.array(DiscussionCheckpointV1Schema).max(100),
}).strict();

export type DiscussionCheckpointV1 = z.infer<typeof DiscussionCheckpointV1Schema>;
export type DiscussionRegistryV1 = z.infer<typeof DiscussionRegistryV1Schema>;

export function discussionRegistryPath(projectRoot: string, pathApi: path.PlatformPath = path): string {
  return pathApi.join(projectRoot, 'openspec', '.openspec-relay', 'discussions.json');
}

async function safeRegistryPath(projectRoot: string, create: boolean): Promise<string> {
  const root = await fs.realpath(path.resolve(projectRoot));
  const openspec = path.join(root, 'openspec');
  const openspecReal = await fs.realpath(openspec);
  if (path.normalize(openspec) !== path.normalize(openspecReal)) {
    throw new Error('The owned OpenSpec directory must not be a symlink.');
  }
  const relay = path.join(openspec, '.openspec-relay');
  try {
    const stat = await fs.lstat(relay);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('The owned discussion registry root must be a real directory, not a symlink.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
    await fs.mkdir(relay);
  }
  const target = discussionRegistryPath(root);
  try {
    if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('The discussion registry must not be a symlink.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return target;
}

async function readAt(filename: string): Promise<DiscussionRegistryV1> {
  try {
    return DiscussionRegistryV1Schema.parse(JSON.parse(await fs.readFile(filename, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, discussions: [] };
    throw error;
  }
}

export async function readDiscussionRegistryV1(projectRoot: string): Promise<DiscussionRegistryV1> {
  const filename = await safeRegistryPath(projectRoot, false).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return discussionRegistryPath(path.resolve(projectRoot));
    throw error;
  });
  return readAt(filename);
}

async function lockedUpdate<T>(projectRoot: string, update: (registry: DiscussionRegistryV1) => Promise<{
  registry: DiscussionRegistryV1;
  result: T;
}>): Promise<T> {
  const filename = await safeRegistryPath(projectRoot, true);
  const lock = `${filename}.lock`;
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(lock, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Concurrent discussion checkpoint replacement is in progress.');
    throw error;
  }
  try {
    const next = await update(await readAt(filename));
    await atomicWriteJson(filename, DiscussionRegistryV1Schema.parse(next.registry));
    return next.result;
  } finally {
    await handle.close();
    await fs.unlink(lock).catch(() => undefined);
  }
}

export async function replaceDiscussionCheckpointV1(options: {
  projectRoot: string;
  checkpoint: {
    workingId: string;
    goal: string;
    confirmedDecisions: Array<z.input<typeof DecisionSchema>>;
    rejectedAlternatives: Array<z.input<typeof RejectedAlternativeSchema>>;
    openQuestions: Array<z.input<typeof OpenQuestionSchema>>;
    frontierIds: string[];
  };
  expectedFingerprint?: string;
  now?: string;
}): Promise<{ checkpoint: DiscussionCheckpointV1 }> {
  WorkingIdSchema.parse(options.checkpoint.workingId);
  return lockedUpdate(options.projectRoot, async (registry) => {
    const existing = registry.discussions.find((item) => item.workingId === options.checkpoint.workingId);
    if (options.expectedFingerprint !== undefined && existing?.fingerprint !== options.expectedFingerprint) {
      throw new Error('Discussion checkpoint fingerprint changed during concurrent replacement.');
    }
    const now = options.now ?? new Date().toISOString();
    const bounded = {
      version: 1 as const,
      workingId: options.checkpoint.workingId,
      status: 'active' as const,
      goal: options.checkpoint.goal,
      confirmedDecisions: options.checkpoint.confirmedDecisions,
      rejectedAlternatives: options.checkpoint.rejectedAlternatives,
      openQuestions: options.checkpoint.openQuestions,
      frontierIds: options.checkpoint.frontierIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const checkpoint = DiscussionCheckpointV1Schema.parse({ ...bounded, fingerprint: digestJson(bounded) });
    const discussions = registry.discussions.filter((item) => item.workingId !== checkpoint.workingId);
    discussions.push(checkpoint);
    discussions.sort((left, right) => left.workingId.localeCompare(right.workingId));
    return { registry: { version: 1, discussions }, result: { checkpoint } };
  });
}

export async function selectDiscussionCheckpointV1(options: {
  projectRoot: string;
  workingId?: string;
}): Promise<DiscussionCheckpointV1> {
  const active = (await readDiscussionRegistryV1(options.projectRoot)).discussions.filter((item) => item.status === 'active');
  if (options.workingId) {
    WorkingIdSchema.parse(options.workingId);
    const match = active.find((item) => item.workingId === options.workingId);
    if (!match) throw new Error(`No active discussion '${options.workingId}' exists.`);
    return match;
  }
  if (active.length === 0) throw new Error('No active discussion checkpoint exists.');
  if (active.length > 1) throw new Error(`Multiple active discussions exist; select one explicitly: ${active.map((item) => item.workingId).join(', ')}.`);
  return active[0]!;
}

export async function resumeDiscussionCheckpointV1(options: {
  projectRoot: string;
  workingId?: string;
}): Promise<{
  restored: true;
  workingId: string;
  goal: string;
  confirmedDecisions: DiscussionCheckpointV1['confirmedDecisions'];
  rejectedAlternatives: DiscussionCheckpointV1['rejectedAlternatives'];
  unresolvedQuestions: DiscussionCheckpointV1['openQuestions'];
  nextQuestion?: DiscussionCheckpointV1['openQuestions'][number];
}> {
  const checkpoint = await selectDiscussionCheckpointV1(options);
  const nextQuestion = checkpoint.frontierIds
    .map((id) => checkpoint.openQuestions.find((question) => question.questionId === id))
    .find((question) => question !== undefined) ?? checkpoint.openQuestions[0];
  return {
    restored: true,
    workingId: checkpoint.workingId,
    goal: checkpoint.goal,
    confirmedDecisions: checkpoint.confirmedDecisions,
    rejectedAlternatives: checkpoint.rejectedAlternatives,
    unresolvedQuestions: checkpoint.openQuestions,
    ...(nextQuestion ? { nextQuestion } : {}),
  };
}

export async function removeDiscussionCheckpointV1(options: {
  projectRoot: string;
  workingId: string;
}): Promise<boolean> {
  WorkingIdSchema.parse(options.workingId);
  return lockedUpdate(options.projectRoot, async (registry) => {
    const discussions = registry.discussions.filter((item) => item.workingId !== options.workingId);
    return {
      registry: { version: 1, discussions },
      result: discussions.length !== registry.discussions.length,
    };
  });
}

export async function consumeDiscussionCheckpointV1(options: {
  projectRoot: string;
  workingId: string;
  changeName: string;
  mappings: DiscussionArtifactMappingV1[];
  now?: string;
}): Promise<ReturnType<typeof confirmDiscussionHandoff>> {
  const checkpoint = await selectDiscussionCheckpointV1({ projectRoot: options.projectRoot, workingId: options.workingId });
  if (checkpoint.openQuestions.length > 0) return {
    status: 'return_to_discussion',
    mappedDecisionIds: [],
    affectedDecisionIds: checkpoint.openQuestions.map((question) => question.questionId),
    summary: `${checkpoint.openQuestions.length} material discussion question(s) remain unresolved.`,
  };
  const confirmation = confirmDiscussionHandoff({
    handoff: { goal: checkpoint.goal, decisions: checkpoint.confirmedDecisions }, mappings: options.mappings,
  });
  if (confirmation.status !== 'pass') return confirmation;
  await lockedUpdate(options.projectRoot, async (registry) => {
    const current = registry.discussions.find((item) => item.workingId === checkpoint.workingId);
    if (!current || current.fingerprint !== checkpoint.fingerprint) throw new Error('Discussion checkpoint changed during consumption.');
    const consumedAt = options.now ?? new Date().toISOString();
    const consumed = DiscussionCheckpointV1Schema.parse({
      ...current, status: 'consumed', updatedAt: consumedAt,
      consumedBy: { changeName: options.changeName, mappedDecisionIds: confirmation.mappedDecisionIds, consumedAt },
    });
    return {
      registry: { version: 1, discussions: registry.discussions.map((item) =>
        item.workingId === consumed.workingId ? consumed : item) },
      result: undefined,
    };
  });
  return confirmation;
}
