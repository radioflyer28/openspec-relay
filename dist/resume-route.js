/** Pure, priority-ordered lifecycle decision shared by status and resume. */
export function evaluateResumeRouteV1(input) {
    let route;
    let reason;
    if (input.integrity === 'error')
        [route, reason] = ['check', 'Canonical history or generated projections require repair.'];
    else if (input.candidateIds.length !== 1)
        [route, reason] = ['select', 'The intended change or discussion is ambiguous.'];
    else if (input.discussionOpen)
        [route, reason] = ['discuss', 'Material product questions remain open.'];
    else if (input.artifactState === 'missing')
        [route, reason] = ['propose', 'Required OpenSpec proposal artifacts are missing.'];
    else if (input.artifactState === 'incoherent')
        [route, reason] = ['update', 'Current OpenSpec proposal artifacts require reconciliation.'];
    else if (input.artifactsChanged || input.planApproval !== 'current')
        [route, reason] = ['plan', 'The semantic plan is missing or stale.'];
    else if (input.activeDebug)
        [route, reason] = ['debug', 'A verified debugging session remains active.'];
    else if (input.pendingWork)
        [route, reason] = ['do', 'Implementation, review, repair, or verification remains pending.'];
    else if (input.pendingUat)
        [route, reason] = ['uat', 'Human acceptance remains pending.'];
    else
        [route, reason] = ['archive', input.archiveReady
                ? 'Implementation and assurance are complete.'
                : 'No executable work remains; archive readiness must be confirmed.'];
    const requiredAuthority = [...new Set(input.requiredAuthority)].sort();
    return {
        route,
        reasons: [reason],
        requiredAuthority,
        automatic: route !== 'select' && requiredAuthority.length === 0,
        restored: input.hasCheckpoint,
    };
}
//# sourceMappingURL=resume-route.js.map