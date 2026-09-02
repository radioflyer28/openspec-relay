import { createHash } from 'node:crypto';
import { FindingLifecycleRecordV2Schema, FindingTransitionV2Schema, } from './schemas.js';
function digest(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function createFindingId(input) {
    const identity = digest({
        providerId: input.providerId,
        ruleId: input.ruleId,
        category: input.category,
        scope: input.scope,
    }).slice(0, 24);
    return `finding:${input.providerId}:${input.ruleId}:${identity}`;
}
export function discoverFinding(input) {
    const findingId = createFindingId(input);
    return FindingLifecycleRecordV2Schema.parse({
        findingId,
        providerId: input.providerId,
        ruleId: input.ruleId,
        category: input.category,
        scope: input.scope,
        severity: input.severity,
        blocking: input.blocking,
        summary: input.summary,
        requirementIds: input.requirementIds,
        taskIds: input.taskIds,
        evidence: input.evidence,
        state: 'open',
        transitions: [{
                transitionId: `discovery:${findingId}`,
                to: 'open',
                occurredAt: input.occurredAt,
                actor: input.actor ?? { kind: 'reviewer' },
                reason: 'Finding was recorded by its producing assurance provider.',
                evidence: input.evidence,
                sourceRevision: input.sourceRevision,
            }],
    });
}
function assertAuthorizedTransition(options) {
    if (options.to === 'repaired') {
        if (options.actor.kind !== 'executor')
            throw new Error('Only an executor can record repair evidence.');
        if (!['open', 'stale', 'human_needed'].includes(options.finding.state)) {
            throw new Error(`Finding '${options.finding.findingId}' cannot move from ${options.finding.state} to repaired.`);
        }
        if (options.evidence.length === 0)
            throw new Error('Repair transitions require linked implementation or check evidence.');
    }
    if (options.to === 'independently_verified') {
        if (options.actor.kind !== 'verifier')
            throw new Error('Only a read-only verifier can independently verify a finding.');
        if (options.finding.state !== 'repaired')
            throw new Error('Independent verification requires a repaired finding.');
        if (options.evidence.length === 0)
            throw new Error('Independent verification requires observable evidence.');
    }
    if (options.to === 'accepted_risk') {
        if (options.actor.kind !== 'human' || !options.actor.id) {
            throw new Error('Accepted risk requires an explicit human actor identity.');
        }
        if (options.finding.state === 'independently_verified') {
            throw new Error('An independently verified finding cannot be converted to accepted risk.');
        }
    }
    if (options.to === 'stale' && options.actor.kind === 'executor') {
        throw new Error('Executors cannot mark their own verification stale.');
    }
}
export function transitionFinding(options) {
    const finding = FindingLifecycleRecordV2Schema.parse(options.finding);
    assertAuthorizedTransition(options);
    const transition = FindingTransitionV2Schema.parse({
        transitionId: `transition:${digest({ findingId: finding.findingId, to: options.to, occurredAt: options.occurredAt,
            sourceRevision: options.sourceRevision, reason: options.reason }).slice(0, 24)}`,
        from: finding.state,
        to: options.to,
        occurredAt: options.occurredAt,
        actor: options.actor,
        reason: options.reason,
        evidence: options.evidence,
        sourceRevision: options.sourceRevision,
        ...(options.expiry ? { expiry: options.expiry } : {}),
        ...(options.followUp ? { followUp: options.followUp } : {}),
    });
    return FindingLifecycleRecordV2Schema.parse({
        ...finding,
        state: options.to,
        transitions: [...finding.transitions, transition],
    });
}
export function reconcileFindings(options) {
    const reconciled = new Map(options.existing.map((finding) => [finding.findingId, FindingLifecycleRecordV2Schema.parse(finding)]));
    for (const report of options.reports) {
        const discovered = discoverFinding(report);
        const existing = reconciled.get(discovered.findingId);
        if (!existing) {
            reconciled.set(discovered.findingId, discovered);
            continue;
        }
        if (existing.state === 'independently_verified' || existing.state === 'accepted_risk') {
            reconciled.set(discovered.findingId, transitionFinding({
                finding: existing,
                to: 'stale',
                actor: report.actor ?? { kind: 'reviewer' },
                reason: 'The assurance provider reported the same logical finding again.',
                evidence: report.evidence,
                sourceRevision: report.sourceRevision,
                occurredAt: report.occurredAt,
            }));
        }
    }
    return [...reconciled.values()].sort((left, right) => left.findingId.localeCompare(right.findingId));
}
export function markFindingsStale(options) {
    const changed = new Set(options.changedScopes);
    return options.findings.map((finding) => {
        if (!changed.has(finding.scope.identity) && ![...changed].some((scope) => finding.scope.identity.startsWith(`${scope}:`) || scope.startsWith(`${finding.scope.identity}:`))) {
            return finding;
        }
        if (finding.state === 'open' || finding.state === 'human_needed' || finding.state === 'stale')
            return finding;
        return transitionFinding({
            finding,
            to: 'stale',
            actor: { kind: 'automation' },
            reason: 'Relevant source or OpenSpec input changed after repair or verification.',
            evidence: [],
            sourceRevision: options.sourceRevision,
            occurredAt: options.occurredAt,
        });
    });
}
export function evaluateFindingObligations(options) {
    const unresolved = new Set(['open', 'repaired', 'human_needed', 'stale']);
    const humanDispositions = new Set((options.scenarios ?? [])
        .filter((scenario) => ['passed', 'accepted_limitation'].includes(scenario.status))
        .map((scenario) => scenario.scenarioId));
    const requiresMoreThanRecordedUat = (finding) => finding.state !== 'human_needed' || finding.scope.kind !== 'scenario' ||
        !humanDispositions.has(finding.scope.identity);
    const blocking = options.findings.filter((finding) => finding.blocking && unresolved.has(finding.state) &&
        requiresMoreThanRecordedUat(finding))
        .map((finding) => finding.findingId).sort();
    const warnings = options.findings.filter((finding) => !finding.blocking && unresolved.has(finding.state) &&
        requiresMoreThanRecordedUat(finding))
        .map((finding) => finding.findingId).sort();
    return {
        blocking: options.elevateWarnings ? [...new Set([...blocking, ...warnings])].sort() : blocking,
        warnings: options.elevateWarnings ? [] : warnings,
    };
}
//# sourceMappingURL=findings.js.map