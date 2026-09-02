import { compileOpenSpecChange } from './artifacts.js';
import { classifyTddRequirement, resolveTddPolicy } from './tdd.js';
function symmetricDifference(left, right) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    return [...new Set([
            ...[...leftSet].filter((value) => !rightSet.has(value)),
            ...[...rightSet].filter((value) => !leftSet.has(value)),
        ])].sort();
}
function ids(artifacts, marker) {
    return artifacts.flatMap((artifact) => artifact.ids).filter((id) => marker === 'scenario'
        ? id.includes('/scenario:')
        : id.includes('#requirement:') && !id.includes('/scenario:'));
}
export function materializeCompiledTasks(compiled, config) {
    return compiled.graph.nodes.map((task) => {
        const policy = resolveTddPolicy({ change: config.tdd, task: task.tdd });
        const classification = classifyTddRequirement(task, policy);
        return {
            ...task,
            tddRequired: classification.required,
            ...(!classification.required && classification.exemptionReason
                ? { tddExemptionReason: classification.exemptionReason }
                : {}),
        };
    });
}
export function reconcileCompiledOpenSpec(options) {
    const oldTasks = new Map(options.run.tasks.map((task) => [task.taskId, task]));
    const tasks = materializeCompiledTasks(options.compiled, options.run.config).map((task) => {
        const previous = oldTasks.get(task.taskId);
        return previous?.implementationStartedAt
            ? { ...task, implementationStartedAt: previous.implementationStartedAt }
            : task;
    });
    const currentTasks = new Map(tasks.map((task) => [task.taskId, task]));
    const addedTaskIds = [...currentTasks.keys()].filter((id) => !oldTasks.has(id)).sort();
    const removedTaskIds = [...oldTasks.keys()].filter((id) => !currentTasks.has(id)).sort();
    const taskStatusChangedIds = [...currentTasks]
        .filter(([id, task]) => oldTasks.has(id) && oldTasks.get(id)?.status !== task.status)
        .map(([id]) => id)
        .sort();
    const oldDigests = new Map(options.run.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
    const currentDigests = new Map(options.compiled.artifacts
        .map((artifact) => [artifact.path, artifact.sourceDigest]));
    const changedArtifactPaths = [...new Set([...oldDigests.keys(), ...currentDigests.keys()])]
        .filter((artifactPath) => oldDigests.get(artifactPath) !== currentDigests.get(artifactPath))
        .sort();
    const changedRequirementIds = symmetricDifference(ids(options.run.artifacts, 'requirement'), options.compiled.requirementIds);
    const changedScenarioIds = symmetricDifference(ids(options.run.artifacts, 'scenario'), options.compiled.scenarioIds);
    const staleEvidence = new Set(options.assurance.staleEvidenceIds);
    for (const evidence of options.assurance.evidence) {
        if (evidence.taskId) {
            const task = currentTasks.get(evidence.taskId);
            if (!task) {
                staleEvidence.add(evidence.evidenceId);
            }
            else if (task.idStability !== 'explicit') {
                throw new Error(`Evidence '${evidence.evidenceId}' cannot bind to task '${task.taskId}' because it lacks ` +
                    'an explicit stable identifier.');
            }
        }
        if (Object.entries(evidence.sourceDigests ?? {}).some(([artifactPath, digest]) => currentDigests.get(artifactPath) !== digest)) {
            staleEvidence.add(evidence.evidenceId);
        }
    }
    const staleEvidenceIds = [...staleEvidence].sort();
    const reconciliation = {
        addedTaskIds,
        removedTaskIds,
        taskStatusChangedIds,
        changedArtifactPaths,
        changedRequirementIds,
        changedScenarioIds,
        staleEvidenceIds,
        unchanged: addedTaskIds.length === 0 && removedTaskIds.length === 0 &&
            taskStatusChangedIds.length === 0 && changedArtifactPaths.length === 0 &&
            changedRequirementIds.length === 0 && changedScenarioIds.length === 0 &&
            staleEvidenceIds.length === options.assurance.staleEvidenceIds.length,
    };
    return {
        run: {
            ...options.run,
            artifacts: options.compiled.artifacts,
            tasks,
            executionWaves: options.compiled.graph.waves,
        },
        assurance: { ...options.assurance, staleEvidenceIds },
        reconciliation,
    };
}
export async function reconcileCurrentOpenSpec(options) {
    const compiled = await compileOpenSpecChange({
        changeDir: options.changeDir,
        taskMetadata: options.run.config.taskOverrides,
    });
    return reconcileCompiledOpenSpec({ run: options.run, assurance: options.assurance, compiled });
}
//# sourceMappingURL=reconciliation.js.map