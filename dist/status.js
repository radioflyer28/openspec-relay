import { loadCanonicalRelayRecords } from './canonical-state.js';
import { resolveChangeDirectory } from './state.js';
export async function getRunStatusV2(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    const canonical = await loadCanonicalRelayRecords(resolved.changeDir);
    const { run, assurance } = canonical.projection;
    const integrityError = !canonical.projectionsMatch;
    const findings = {};
    for (const finding of assurance.findings)
        findings[finding.state] = (findings[finding.state] ?? 0) + 1;
    const pendingUat = assurance.uatScenarios.filter((scenario) => ['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale'].includes(scenario.status));
    const unresolvedRelease = assurance.releaseCandidates.filter((candidate) => ['pending', 'fail', 'human_needed', 'error'].includes(candidate.status));
    const nextActions = [
        ...(integrityError
            ? ['Regenerate projections from canonical OpenSpec Relay history with openspec-relay check.'] : []),
        ...(assurance.repositoryContext?.status === 'stale' ? ['Refresh stale repository context.'] : []),
        ...(assurance.readiness && assurance.readiness.status !== 'pass'
            ? assurance.readiness.issues.filter((issue) => issue.blocking).flatMap((issue) => issue.remediation) : []),
        ...(run.planApprovalStatus !== 'current' ? [`Run /opsx:plan ${run.changeName} before implementation.`] : []),
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
            ...(assurance.findingRoutes.at(-1)?.route ? { activeRoute: assurance.findingRoutes.at(-1).route } : {}),
            resume: run.planApprovalStatus !== 'current' ? 'plan'
                : run.status === 'complete' ? 'none' : 'do',
        },
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
//# sourceMappingURL=status.js.map