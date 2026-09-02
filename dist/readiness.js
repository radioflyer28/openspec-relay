import { createHash } from 'node:crypto';
import { buildExecutionGraph, writeSetsOverlap } from './graph.js';
import { findRepositoryScopeGaps } from './repository-context.js';
import { ReadinessResultV2Schema, } from './schemas.js';
export function createReadinessEvaluatorContract(options) {
    return { readOnly: true, tier: options.tier, independent: true };
}
function digest(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function deriveArtifactAssumptions(compiled) {
    const assumptions = [];
    let inAssumptions = false;
    for (const line of compiled.routingText.split(/\r?\n/)) {
        const heading = /^#{2,6}\s+(.+?)\s*$/.exec(line);
        if (heading) {
            inAssumptions = /^assumptions(?:\s+and\s+defaults)?$/i.test(heading[1].replaceAll('*', '').trim());
            continue;
        }
        if (!inAssumptions)
            continue;
        const bullet = /^\s*[-*+]\s+(.+?)\s*$/.exec(line);
        if (!bullet)
            continue;
        const summary = bullet[1].trim();
        const supported = /\b(?:supported\s+by|validated?\s+by|evidence\s*:|validation\s+(?:task|check)\s*:|verification\s+(?:task|check)\s*:|human\s+(?:disposition|acceptance)\s*:|accepted\s+by)/i
            .test(summary);
        assumptions.push({
            id: `assumption:${digest(summary).slice(0, 20)}`,
            summary,
            supported,
        });
    }
    return assumptions;
}
function resolveAssumptions(options) {
    const resolved = new Map();
    for (const assumption of [...deriveArtifactAssumptions(options.compiled), ...(options.assumptions ?? [])]) {
        const existing = resolved.get(assumption.id);
        resolved.set(assumption.id, existing
            ? { ...existing, supported: existing.supported && assumption.supported }
            : assumption);
    }
    return [...resolved.values()].sort((left, right) => left.id.localeCompare(right.id));
}
export function readinessInputRevision(options) {
    return digest({
        artifacts: options.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]),
        requirements: options.compiled.requirementIds,
        scenarios: options.compiled.scenarioIds,
        tasks: options.compiled.graph.nodes.map((task) => ({
            id: task.taskId, dependencies: task.dependencies, writeSet: task.writeSet,
            requirements: task.requirementRefs, scenarios: task.scenarioRefs,
            verification: task.expectedVerification,
        })),
        repositoryContext: [options.repositoryContext.contextId, options.repositoryContext.inputRevision,
            options.repositoryContext.status, options.repositoryContext.staleReferenceIds],
        assumptions: options.assumptions ?? [],
    });
}
function issue(options) {
    return {
        ...options,
        issueId: `readiness:${digest({ kind: options.kind, references: options.references, summary: options.summary })
            .slice(0, 20)}`,
    };
}
function contractNeedsCompatibility(compiled) {
    return /public\s+(?:api|contract|interface)|\bcli\b|\bschema\b|\bconfiguration\b|stored\s+format|\bmigration\b/i
        .test(compiled.routingText);
}
function hasCompatibilityEvidence(compiled) {
    return compiled.graph.nodes.some((task) => task.expectedVerification.some((check) => ['compatibility', 'documentation', 'migration', 'release-assurance'].includes(check)));
}
export function evaluatePlanReadiness(options) {
    if (options.actorKind === 'executor') {
        throw new Error('An executor self-report cannot satisfy independent plan readiness.');
    }
    if (options.adapter) {
        throw new Error('Use evaluatePlanReadinessWithAdapter for an asynchronous independent evaluator.');
    }
    const assumptions = resolveAssumptions(options);
    const inputRevision = readinessInputRevision({ ...options, assumptions });
    const issues = [];
    const mappedRequirements = new Set(options.compiled.graph.nodes.flatMap((task) => task.requirementRefs));
    const mappedScenarios = new Set(options.compiled.graph.nodes.flatMap((task) => task.scenarioRefs));
    for (const requirementId of options.compiled.requirementIds) {
        if (!mappedRequirements.has(requirementId))
            issues.push(issue({
                kind: 'uncovered_requirement', severity: 'error', blocking: true,
                summary: `Requirement '${requirementId}' has no implementing task.`, references: [requirementId],
                evidence: [], remediation: ['Add an explicit task-to-requirement mapping.'], inputRevision,
            }));
    }
    for (const scenarioId of options.compiled.scenarioIds) {
        if (!mappedScenarios.has(scenarioId))
            issues.push(issue({
                kind: 'unmapped_scenario', severity: 'error', blocking: true,
                summary: `Scenario '${scenarioId}' has no task or observable evidence path.`, references: [scenarioId],
                evidence: [], remediation: ['Map the scenario to an implementing task and verification.'], inputRevision,
            }));
    }
    for (const task of options.compiled.graph.nodes) {
        if (task.expectedVerification.length === 0)
            issues.push(issue({
                kind: 'insufficient_evidence', severity: 'error', blocking: true,
                summary: `Task '${task.taskId}' has no planned observable verification.`, references: [task.taskId],
                evidence: [], remediation: ['Add deterministic or human-observable verification for the task.'], inputRevision,
            }));
    }
    try {
        buildExecutionGraph(options.compiled.graph.nodes);
    }
    catch (error) {
        issues.push(issue({
            kind: 'dependency_cycle', severity: 'critical', blocking: true,
            summary: error.message, references: options.compiled.graph.nodes.map((task) => task.taskId),
            evidence: [], remediation: ['Break the dependency cycle and update the task graph.'], inputRevision,
        }));
    }
    const byId = new Map(options.compiled.graph.nodes.map((task) => [task.taskId, task]));
    for (const wave of options.proposedWaves ?? options.compiled.graph.waves) {
        for (let left = 0; left < wave.length; left += 1) {
            const current = byId.get(wave[left]);
            if (!current)
                continue;
            if (current.dependencies.some((dependency) => wave.includes(dependency)))
                issues.push(issue({
                    kind: 'missing_prerequisite', severity: 'error', blocking: true,
                    summary: `Task '${current.taskId}' is scheduled before a required prerequisite completes.`,
                    references: [current.taskId, ...current.dependencies], evidence: [],
                    remediation: ['Schedule dependencies in an earlier execution wave.'], inputRevision,
                }));
            for (const otherId of wave.slice(left + 1)) {
                const other = byId.get(otherId);
                if (other && writeSetsOverlap(current.writeSet, other.writeSet))
                    issues.push(issue({
                        kind: 'unsafe_write_overlap', severity: 'error', blocking: true,
                        summary: `Tasks '${current.taskId}' and '${other.taskId}' overlap in the same execution wave.`,
                        references: [current.taskId, other.taskId], evidence: [],
                        remediation: ['Serialize these tasks or use isolated non-overlapping write sets.'], inputRevision,
                    }));
            }
        }
    }
    for (const assumption of assumptions) {
        if (!assumption.supported)
            issues.push(issue({
                kind: 'risky_assumption', severity: 'error', blocking: true,
                summary: `Risky assumption '${assumption.summary}' lacks a validation path.`, references: [assumption.id],
                evidence: [], remediation: ['Add supporting evidence, a validation task, or a human disposition.'], inputRevision,
            }));
    }
    if (contractNeedsCompatibility(options.compiled) && !hasCompatibilityEvidence(options.compiled))
        issues.push(issue({
            kind: 'compatibility_obligation', severity: 'error', blocking: true,
            summary: 'A public contract changes without compatibility, migration, documentation, or release verification work.',
            references: [], evidence: [],
            remediation: ['Add applicable compatibility, documentation, and consumer-verification tasks.'], inputRevision,
        }));
    for (const gap of findRepositoryScopeGaps({ compiled: options.compiled, context: options.repositoryContext })) {
        issues.push(issue({
            kind: gap.kind, severity: 'error', blocking: true,
            summary: 'Repository context identified an affected module outside the declared task write sets.',
            references: gap.referenceIds, evidence: [], remediation: [gap.remediation], inputRevision,
        }));
    }
    if (options.repositoryContext.status !== 'current')
        issues.push(issue({
            kind: 'independent_result_unavailable', severity: 'error', blocking: true,
            summary: 'Repository context is stale or unavailable for the current readiness evaluation.',
            references: [options.repositoryContext.contextId], evidence: [],
            remediation: ['Refresh repository context before beginning implementation.'], inputRevision,
        }));
    const result = ReadinessResultV2Schema.parse({
        resultId: `readiness:${inputRevision.slice(0, 20)}`,
        changeName: options.changeName,
        evaluatedAt: options.now ?? new Date().toISOString(),
        inputRevision,
        status: issues.some((item) => item.blocking) ? 'fail' : 'pass',
        independent: true,
        evaluator: options.tier === 'tier1' || options.tier === 'tier2' ? 'isolated-readiness-evaluator' : 'tier0-readiness-evaluator',
        issues: issues.sort((left, right) => left.issueId.localeCompare(right.issueId)),
    });
    return result;
}
export async function evaluatePlanReadinessWithAdapter(options) {
    const { adapter, ...input } = options;
    if (options.tier !== 'tier1' && options.tier !== 'tier2') {
        throw new Error('Readiness adapters require a negotiated Tier 1 or Tier 2 evaluator dispatch.');
    }
    const deterministicResult = evaluatePlanReadiness({ ...input, tier: input.tier ?? 'tier0' });
    const result = ReadinessResultV2Schema.parse(await adapter.evaluate({
        contract: createReadinessEvaluatorContract({ tier: options.tier ?? 'tier0' }),
        deterministicResult,
    }));
    if (result.changeName !== deterministicResult.changeName || result.inputRevision !== deterministicResult.inputRevision ||
        result.independent !== true) {
        throw new Error('Readiness evaluator returned a result for different controlling inputs.');
    }
    const issues = new Map(result.issues.map((item) => [item.issueId, item]));
    for (const item of deterministicResult.issues)
        issues.set(item.issueId, item);
    const statusRank = {
        pass: 0, fail: 1, human_needed: 2, stale: 3, error: 4,
    };
    const status = statusRank[deterministicResult.status] > statusRank[result.status]
        ? deterministicResult.status
        : result.status;
    return ReadinessResultV2Schema.parse({
        ...result,
        resultId: deterministicResult.resultId,
        evaluatedAt: deterministicResult.evaluatedAt,
        status,
        issues: [...issues.values()].sort((left, right) => left.issueId.localeCompare(right.issueId)),
    });
}
export function invalidateReadinessResult(options) {
    if (options.result.inputRevision === options.inputRevision)
        return options.result;
    return ReadinessResultV2Schema.parse({ ...options.result, inputRevision: options.inputRevision, status: 'stale' });
}
//# sourceMappingURL=readiness.js.map