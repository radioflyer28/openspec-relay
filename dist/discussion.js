export function confirmDiscussionHandoff(options) {
    const decisions = new Map(options.handoff.decisions.map((decision) => [decision.decisionId, decision]));
    if (decisions.size !== options.handoff.decisions.length)
        throw new Error('Discussion decision IDs must be unique.');
    const mapped = new Set();
    const affected = new Set();
    for (const mapping of options.mappings) {
        if (!decisions.has(mapping.decisionId))
            throw new Error(`Unknown discussion decision '${mapping.decisionId}'.`);
        if (!mapping.reference.trim())
            throw new Error(`Discussion decision '${mapping.decisionId}' requires an artifact reference.`);
        mapped.add(mapping.decisionId);
        if (mapping.status === 'contradicted')
            affected.add(mapping.decisionId);
    }
    for (const decisionId of decisions.keys())
        if (!mapped.has(decisionId))
            affected.add(decisionId);
    return affected.size > 0
        ? {
            status: 'return_to_discussion',
            mappedDecisionIds: [...mapped].sort(),
            affectedDecisionIds: [...affected].sort(),
            summary: `Return ${affected.size} missing or contradicted material decision(s) to discussion.`,
        }
        : {
            status: 'pass',
            mappedDecisionIds: [...mapped].sort(),
            affectedDecisionIds: [],
            summary: 'Every material discussion decision has a consistent OpenSpec artifact destination.',
        };
}
//# sourceMappingURL=discussion.js.map