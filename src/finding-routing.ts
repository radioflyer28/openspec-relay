import {
  assertDispatchedRoleResultV2,
  type DispatchedRoleResultV2,
  type ReportedFindingV2,
} from './execution-adapters.js';
import { createFindingId } from './findings.js';
import { FindingRouteV1Schema, type FindingRouteV1 } from './schemas.js';

function identity(finding: ReportedFindingV2): string {
  return createFindingId(finding);
}

function target(finding: ReportedFindingV2): FindingRouteV1['route'] {
  const text = `${finding.category} ${finding.ruleId} ${finding.summary}`.toLowerCase();
  if (/intent|product meaning|requirement omission|contradict/.test(text)) return 'discussion';
  if (/model|feasib|counterexample|unknown technical/.test(text)) return 'pathfinder';
  if (/plan|task coverage|assumption|compatib|verification strategy|evidence insufficient|cannot verify|verification evidence/.test(text)) return 'planner';
  if (/re-?verify|fresh verification/.test(text)) return 'verifier';
  return 'executor';
}

/** Derive privileged finding provenance and routing only from an opaque
 * orchestrator receipt. Callers cannot self-select reviewer/verifier authority
 * or stable finding identity. */
export function routeDispatchedFindingsV1(options: {
  receipt: DispatchedRoleResultV2;
  planRevision: string;
  attempt: number;
}): FindingRouteV1[] {
  const source = options.receipt.request.role;
  if (source !== 'reviewer' && source !== 'verifier') {
    throw new Error('Finding triage requires an orchestrator-dispatched reviewer or verifier receipt.');
  }
  assertDispatchedRoleResultV2(options.receipt, source);
  if (options.receipt.request.planning?.planRevision !== options.planRevision) {
    throw new Error('Finding triage receipt is not bound to the current approved plan revision.');
  }
  return (options.receipt.result.findings ?? []).map((finding) => FindingRouteV1Schema.parse({
    findingId: identity(finding),
    source,
    route: target(finding),
    ...(finding.taskIds?.[0] ? { taskId: finding.taskIds[0] } : {}),
    planRevision: options.planRevision,
    reason: finding.summary,
    attempt: options.attempt,
  }));
}
