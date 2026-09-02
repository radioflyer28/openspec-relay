function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value))
        return value;
    Object.freeze(value);
    for (const child of Object.values(value))
        deepFreeze(child);
    return value;
}
export function createReadOnlyVerificationContract(options) {
    return deepFreeze({
        artifactRefs: structuredClone(options.artifactRefs),
        requirementIds: structuredClone(options.requirementIds),
        evidence: structuredClone(options.evidence),
        writeAccess: false,
    });
}
export function mapScenarioCoverage(options) {
    return options.scenarioIds.map((scenarioId) => {
        const matching = options.evidence.filter((item) => item.reference === scenarioId && item.result === 'pass');
        const acceptanceInstructions = options.humanNeeded?.[scenarioId];
        if (matching.length > 0) {
            return {
                requirementId: scenarioId.split('/scenario:')[0],
                scenarioId,
                status: 'covered',
                evidenceIds: matching.map((item) => item.evidenceId),
            };
        }
        if (acceptanceInstructions) {
            return {
                requirementId: scenarioId.split('/scenario:')[0],
                scenarioId,
                status: 'human_needed',
                evidenceIds: [],
                acceptanceInstructions,
            };
        }
        return {
            requirementId: scenarioId.split('/scenario:')[0],
            scenarioId,
            status: 'missing',
            evidenceIds: [],
        };
    });
}
export function validateIndependentVerification(options) {
    const evidence = new Map(options.evidence.map((item) => [item.evidenceId, item]));
    const diagnostics = [];
    const acceptedEvidence = new Set();
    for (const requirementId of options.requirementIds) {
        const finding = options.findings.find((item) => item.requirementId === requirementId &&
            item.origin === 'verifier');
        if (!finding || finding.status !== 'pass') {
            diagnostics.push(`Requirement '${requirementId}' lacks a passing independent verifier finding.`);
            continue;
        }
        const independent = finding.evidenceIds.filter((id) => {
            const item = evidence.get(id);
            return item && item.origin !== 'executor';
        });
        if (independent.length === 0) {
            diagnostics.push(`Requirement '${requirementId}' is supported only by executor self-report.`);
            continue;
        }
        independent.forEach((id) => acceptedEvidence.add(id));
    }
    return { valid: diagnostics.length === 0, diagnostics, evidenceIds: [...acceptedEvidence].sort() };
}
//# sourceMappingURL=verification.js.map