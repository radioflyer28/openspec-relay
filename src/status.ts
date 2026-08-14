import { loadCanonicalGsdRecords } from './canonical-state.js';
import type { GsdAssuranceV2, GsdRunV2 } from './schemas.js';
import { resolveChangeDirectory } from './state.js';

export interface RunStatusV2 {
  changeName: string;
  mode: GsdRunV2['mode'];
  tier: GsdRunV2['tier'];
  status: GsdRunV2['status'];
  tasks: { total: number; complete: number; blocked: number };
  checks: GsdAssuranceV2['checks'];
  assuranceStatus: GsdAssuranceV2['status'];
  repositoryContext: { status: 'current' | 'stale' | 'unavailable' | 'missing' };
  readiness: { status: NonNullable<GsdAssuranceV2['readiness']>['status'] | 'missing'; issueCount: number };
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
  const canonical = await loadCanonicalGsdRecords(resolved.changeDir);
  const { run, assurance } = canonical.projection;
  const integrityError = !canonical.projectionsMatch;
  const findings: Record<string, number> = {};
  for (const finding of assurance.findings) findings[finding.state] = (findings[finding.state] ?? 0) + 1;
  const pendingUat = assurance.uatScenarios.filter((scenario) =>
    ['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale'].includes(scenario.status));
  const unresolvedRelease = assurance.releaseCandidates.filter((candidate) =>
    ['pending', 'fail', 'human_needed', 'error'].includes(candidate.status));
  const nextActions = [
    ...(integrityError
      ? ['Regenerate projections from canonical OpenSpec GSD history with openspec-gsd check.'] : []),
    ...(assurance.repositoryContext?.status === 'stale' ? ['Refresh stale repository context.'] : []),
    ...(assurance.readiness && assurance.readiness.status !== 'pass'
      ? assurance.readiness.issues.filter((issue) => issue.blocking).flatMap((issue) => issue.remediation) : []),
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
    repositoryContext: { status: assurance.repositoryContext?.status ?? 'missing' },
    readiness: { status: assurance.readiness?.status ?? 'missing', issueCount: assurance.readiness?.issues.length ?? 0 },
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
      ? { status: 'error', summary: 'Generated projections do not match canonical OpenSpec GSD history.' }
      : { status: 'pass', summary: 'Generated projections match canonical OpenSpec GSD history.' },
  };
}
