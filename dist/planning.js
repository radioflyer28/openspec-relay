import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContainedArtifactPath } from './artifacts.js';
import { PlanApprovalV1Schema } from './schemas.js';
export const PLANNING_EVENT_TYPES = [
    'semantic.classified',
    'semantic.downgrade_recorded',
    'pathfinder.completed',
    'plan.reviewed',
    'finding.routed',
    'plan.approved',
    'plan.stale',
];
export function normalizeTaskCompletionMarkers(content) {
    return content.replace(/^(\s*-\s*)\[[ xX]\](\s+)/gm, '$1[ ]$2');
}
function digest(content) {
    return createHash('sha256').update(content).digest('hex');
}
export async function computeSemanticPlanRevision(options) {
    const entries = [];
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
export function createPlanApproval(options) {
    return PlanApprovalV1Schema.parse({
        ...options,
        semanticLevels: options.semanticLevels ?? [],
        openDispositionIds: options.openDispositionIds ?? [],
        evidenceRefs: options.evidenceRefs ?? [],
    });
}
export function isPlanApprovalCurrent(approval, revision) {
    return Boolean(approval && PlanApprovalV1Schema.parse(approval).revision === revision);
}
//# sourceMappingURL=planning.js.map