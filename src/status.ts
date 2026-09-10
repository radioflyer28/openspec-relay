import { loadCanonicalRelayRecords } from './canonical-state.js';
import type { RelayAssuranceV2, RelayRunV2 } from './schemas.js';
import { digestJson, resolveChangeDirectory } from './state.js';
import { evaluateResumeRouteV1, type ResumeRouteDecisionV1 } from './resume-route.js';

export interface RunStatusV2 {
  changeName: string;
  mode: RelayRunV2['mode'];
  tier: RelayRunV2['tier'];
  status: RelayRunV2['status'];
  tasks: { total: number; complete: number; blocked: number };
  checks: RelayAssuranceV2['checks'];
  assuranceStatus: RelayAssuranceV2['status'];
  hostAdapter?: RelayAssuranceV2['hostAdapter'];
  repositoryContext: { status: 'current' | 'stale' | 'unavailable' | 'missing' };
  readiness: { status: NonNullable<RelayAssuranceV2['readiness']>['status'] | 'missing'; issueCount: number };
  planning: {
    revision?: string;
    approval: RelayRunV2['planApprovalStatus'];
    review: 'independent' | 'self_review' | 'missing';
    pathfinderCount: number;
    activeRoute?: string;
    resume: 'plan' | 'do' | 'none';
  };
  pause?: {
    state: 'paused' | 'incomplete_quiescence';
    pauseId: string;
    stage: NonNullable<RelayRunV2['effectivePause']>['stage'];
    activityId: string;
    interruptedDispatches: string[];
    runningDispatches: string[];
    unknownDispatches: string[];
  };
  resume: ResumeRouteDecisionV1;
  findings: Record<string, number>;
  debugSessions: { active: string[]; humanNeeded: string[] };
  uat: { pending: string[]; acceptedLimitations: string[] };
  release: { applicable: string[]; unresolved: string[] };
  unresolvedHumanActions: string[];
  nextActions: string[];
  staleEvidenceCount: number;
  assuranceDigestMatches: boolean;
  integrity: { status: 'pass' | 'error'; summary: string };
}

export async function getRunStatusV2(options: {
  change: string;
  projectRoot?: string;
}): Promise<RunStatusV2> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const canonical = await loadCanonicalRelayRecords(resolved.changeDir);
  const { run, assurance } = canonical.projection;
  const integrityError = !canonical.projectionsMatch;
  const findings: Record<string, number> = {};
  for (const finding of assurance.findings) findings[finding.state] = (findings[finding.state] ?? 0) + 1;
  const pendingUat = assurance.uatScenarios.filter((scenario) =>
    ['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale'].includes(scenario.status));
  const unresolvedRelease = assurance.releaseCandidates.filter((candidate) =>
    ['pending', 'fail', 'human_needed', 'error'].includes(candidate.status));
  const pause = run.effectivePause;
  const currentArtifactRevision = digestJson(Object.fromEntries(
    canonical.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]),
  ));
  const activeDebug = assurance.debugSessions.some((session) => session.status === 'active');
  const pendingWork = run.tasks.some((task) => task.status !== 'complete') ||
    assurance.findings.some((finding) => finding.blocking &&
      !['independently_verified', 'accepted_risk'].includes(finding.state));
  const resume = evaluateResumeRouteV1({
    integrity: integrityError ? 'error' : 'pass',
    candidateIds: [run.changeName],
    artifactState: 'complete',
    artifactsChanged: Boolean(pause?.planRevision && pause.planRevision !== currentArtifactRevision),
    discussionOpen: false,
    planApproval: run.planApprovalStatus,
    activeDebug,
    pendingWork,
    pendingUat: pendingUat.length > 0,
    archiveReady: run.status === 'complete' && ['pass', 'warn'].includes(assurance.status),
    requiredAuthority: [],
    hasCheckpoint: Boolean(pause),
  });
  const nextActions = [
    ...(integrityError
      ? ['Regenerate projections from canonical OpenSpec Relay history with openspec-relay check.'] : []),
    ...(assurance.repositoryContext?.status === 'stale' ? ['Refresh stale repository context.'] : []),
    ...(assurance.readiness && assurance.readiness.status !== 'pass'
      ? assurance.readiness.issues.filter((issue) => issue.blocking).flatMap((issue) => issue.remediation) : []),
    ...(run.planApprovalStatus !== 'current' ? [`Run /opsx:plan ${run.changeName} before implementation.`] : []),
    ...(pause && pause.quiescence === 'incomplete'
      ? [`Stop or reconcile ${pause.dispatches.filter((item) => item.state === 'running' || item.state === 'unknown')
        .map((item) => item.dispatchId).join(', ')} before mutation resumes.`] : []),
    ...assurance.findings.filter((finding) => finding.blocking &&
      !['independently_verified', 'accepted_risk'].includes(finding.state))
      .map((finding) => `Resolve finding ${finding.findingId}.`),
    ...pendingUat.map((scenario) => `Record UAT disposition for ${scenario.scenarioId}.`),
    ...unresolvedRelease.map((candidate) => `Complete release assurance for ${candidate.candidateId}.`),
    ...assurance.unresolvedHumanActions,
  ];
  return {
    changeName: run.changeName,
    mode: run.mode,
    tier: run.tier,
    status: integrityError ? 'error' : run.status,
    tasks: {
      total: run.tasks.length,
      complete: run.tasks.filter((task) => task.status === 'complete').length,
      blocked: run.tasks.filter((task) => task.status === 'blocked').length,
    },
    checks: assurance.checks,
    assuranceStatus: integrityError ? 'error' : assurance.status,
    ...(assurance.hostAdapter ? { hostAdapter: assurance.hostAdapter } : {}),
    repositoryContext: { status: assurance.repositoryContext?.status ?? 'missing' },
    readiness: { status: assurance.readiness?.status ?? 'missing', issueCount: assurance.readiness?.issues.length ?? 0 },
    planning: {
      ...(run.planRevision ? { revision: run.planRevision } : {}),
      approval: run.planApprovalStatus,
      review: assurance.planReviews.at(-1)?.independent === true ? 'independent'
        : assurance.planReviews.at(-1) ? 'self_review' : 'missing',
      pathfinderCount: assurance.pathfinderResults.length,
      ...(assurance.findingRoutes.at(-1)?.route ? { activeRoute: assurance.findingRoutes.at(-1)!.route } : {}),
      resume: run.planApprovalStatus !== 'current' ? 'plan'
        : run.status === 'complete' ? 'none' : 'do',
    },
    ...(pause ? { pause: {
      state: pause.quiescence === 'safe' ? 'paused' : 'incomplete_quiescence',
      pauseId: pause.pauseId,
      stage: pause.stage,
      activityId: pause.activity.id,
      interruptedDispatches: pause.dispatches.filter((item) => item.state === 'interrupted').map((item) => item.dispatchId),
      runningDispatches: pause.dispatches.filter((item) => item.state === 'running').map((item) => item.dispatchId),
      unknownDispatches: pause.dispatches.filter((item) => item.state === 'unknown').map((item) => item.dispatchId),
    } } : {}),
    resume,
    findings,
    debugSessions: {
      active: assurance.debugSessions.filter((session) => session.status === 'active').map((session) => session.sessionId),
      humanNeeded: assurance.debugSessions.filter((session) => session.status === 'human_needed' ||
        (session.status === 'resolved' && !session.verification)).map((session) => session.sessionId),
    },
    uat: {
      pending: pendingUat.map((scenario) => scenario.scenarioId),
      acceptedLimitations: assurance.uatScenarios.filter((scenario) => scenario.status === 'accepted_limitation')
        .map((scenario) => scenario.scenarioId),
    },
    release: {
      applicable: assurance.releaseCandidates.filter((candidate) => candidate.applicable).map((candidate) => candidate.candidateId),
      unresolved: unresolvedRelease.map((candidate) => candidate.candidateId),
    },
    unresolvedHumanActions: assurance.unresolvedHumanActions,
    nextActions: [...new Set(nextActions)],
    staleEvidenceCount: assurance.staleEvidenceIds.length,
    assuranceDigestMatches: canonical.projectionsMatch,
    integrity: integrityError
      ? { status: 'error', summary: 'Generated projections do not match canonical OpenSpec Relay history.' }
      : { status: 'pass', summary: 'Generated projections match canonical OpenSpec Relay history.' },
  };
}
