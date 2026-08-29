import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import { resolveContainedArtifactPath } from './artifacts.js';
import { PlanApprovalV1Schema, type PlanApprovalV1, type SemanticLevel } from './schemas.js';

export interface SemanticPlanRevisionV1 {
  revision: string;
  artifactDigests: Record<string, string>;
}

export const PLANNING_EVENT_TYPES = [
  'semantic.classified',
  'semantic.downgrade_recorded',
  'pathfinder.completed',
  'plan.reviewed',
  'finding.routed',
  'plan.approved',
  'plan.stale',
] as const;

export function normalizeTaskCompletionMarkers(content: string): string {
  return content.replace(/^(\s*-\s*)\[[ xX]\](\s+)/gm, '$1[ ]$2');
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function computeSemanticPlanRevision(options: {
  changeDir: string;
  compiled: CompiledOpenSpecChangeV1;
}): Promise<SemanticPlanRevisionV1> {
  const entries: Array<[string, string]> = [];
  for (const artifact of [...options.compiled.artifacts].sort((left, right) => left.path.localeCompare(right.path))) {
    const filename = resolveContainedArtifactPath(options.changeDir, artifact.path, path);
    const content = await fs.readFile(filename, 'utf8');
    entries.push([artifact.path, digest(artifact.kind === 'tasks' ? normalizeTaskCompletionMarkers(content) : content)]);
  }
  const artifactDigests = Object.fromEntries(entries);
  return {
    revision: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    artifactDigests,
  };
}

export function createPlanApproval(options: {
  revision: string;
  approvedAt: string;
  independent: boolean;
  reviewerId?: string;
  semanticLevels?: Array<{ requirementId: string; level: SemanticLevel }>;
  openDispositionIds?: string[];
  evidenceRefs?: string[];
}): PlanApprovalV1 {
  return PlanApprovalV1Schema.parse({
    ...options,
    semanticLevels: options.semanticLevels ?? [],
    openDispositionIds: options.openDispositionIds ?? [],
    evidenceRefs: options.evidenceRefs ?? [],
  });
}

export function isPlanApprovalCurrent(approval: PlanApprovalV1 | undefined, revision: string): boolean {
  return Boolean(approval && PlanApprovalV1Schema.parse(approval).revision === revision);
}
