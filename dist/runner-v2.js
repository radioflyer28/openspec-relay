import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { registerRequiredGate } from '@fission-ai/openspec/extensions';
import { compileOpenSpecChange } from './artifacts.js';
import { loadRelayConfigV2 } from './config.js';
import { createRelayEventV2, appendRelayEventV2, readEventStoreV2, replayRelayEventsV2, eventStorePath, writeReplayedProjectionsV2, } from './events.js';
import { loadCanonicalRelayState } from './canonical-state.js';
import { selectAssurancePipeline } from './modes.js';
import { evaluateAssuranceV2 } from './assurance-v2.js';
import { compileRepositoryContext, computeMaterialRevision, discoverRepositoryChangedFiles } from './repository-context.js';
import { evaluatePlanReadiness, evaluatePlanReadinessWithAdapter } from './readiness.js';
import { detectReleaseApplicability, executeReleaseCandidates } from './release-assurance.js';
import { projectUatScenarios, requiredUatProjectionError } from './uat.js';
import { AssuranceCheckV2Schema, RelayConfigV1Schema, RelayEventStoreV2Schema, } from './schemas.js';
import { assertRelayGeneratedPath, atomicWriteRelayJson, digestJson, resolveChangeDirectory, runStatePath, } from './state.js';
import { negotiateExecutionTier } from './tiers.js';
import { RELAY_VERSION } from './version.js';
import { mapScenarioCoverage } from './verification.js';
import { computeSemanticPlanRevision } from './planning.js';
import { classifySemanticRequirements } from './semantics.js';
export const DEFAULT_HOST_CAPABILITIES = {
    agentDispatch: false,
    parallelism: false,
    worktrees: false,
    git: false,
    structuredResults: true,
    humanInteraction: false,
};
function legacyConfig(config) {
    const legacy = Object.fromEntries(Object.entries(config)
        .filter(([key]) => key !== 'features' && key !== 'piHostAdapter'));
    return RelayConfigV1Schema.parse({ ...legacy, version: 1 });
}
function initialChecks(options) {
    const base = selectAssurancePipeline(options.mode).map((kind) => ({
        checkId: kind,
        kind,
        status: kind === 'artifact-validation' ? 'pass' : 'pending',
        summary: kind === 'artifact-validation' ? 'Required OpenSpec artifacts were compiled.' : `${kind} has not been evaluated.`,
        evidenceIds: [],
        readOnly: kind === 'code-review' || kind === 'goal-verification',
        independent: kind === 'code-review' || kind === 'goal-verification',
        remediation: [],
    }));
    const readinessStatus = options.readinessStatus === 'pass'
        ? 'pass'
        : options.readinessRequired ? options.readinessStatus === 'stale' ? 'fail' : options.readinessStatus
            : 'warn';
    return [
        ...base,
        {
            checkId: 'repository-context', kind: 'repository-context',
            status: options.repositoryStatus,
            summary: options.repositoryStatus === 'pass' ? 'Repository context is current.' : 'Repository context is unavailable.',
            evidenceIds: [], readOnly: true, independent: true,
            remediation: options.repositoryStatus === 'pass' ? [] : ['Refresh repository context before execution.'],
        },
        {
            checkId: 'plan-readiness', kind: 'plan-readiness',
            status: readinessStatus,
            summary: options.readinessStatus === 'pass' ? 'Independent plan readiness passed.'
                : 'Independent plan readiness reported unresolved issues.',
            evidenceIds: [], readOnly: true, independent: true,
            remediation: options.readinessStatus === 'pass' ? [] : ['Resolve readiness issues in the controlling OpenSpec artifacts.'],
        },
        {
            checkId: 'release-assurance', kind: 'release-assurance',
            status: options.releaseApplicable ? 'pending' : 'skipped',
            summary: options.releaseApplicable ? 'Applicable release assurance is pending.' : 'No release surface is applicable.',
            evidenceIds: [], readOnly: true, independent: true,
            remediation: [],
        },
        {
            checkId: 'planning-assurance', kind: 'planning-assurance',
            status: 'pending',
            summary: 'Semantic plan approval has not been evaluated.',
            evidenceIds: [], readOnly: true, independent: false,
            remediation: ['Run /opsx:plan for the current OpenSpec artifact revision.'],
        },
    ].map((check) => AssuranceCheckV2Schema.parse(check));
}
function controllingRevision(compiled) {
    return digestJson(Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest])));
}
async function planningInputs(options) {
    const planningAdapters = options.tier !== 'tier0' && options.adapters?.dispatcher === true
        ? options.adapters
        : undefined;
    const discovery = options.changedFiles === undefined
        ? await discoverRepositoryChangedFiles(options.projectRoot, options.config.features.repositoryContext.comparisonBase)
        : { files: options.changedFiles, source: 'git' };
    const changedFiles = discovery.files;
    const context = await compileRepositoryContext({
        projectRoot: options.projectRoot, changeDir: options.changeDir, changeName: options.changeName,
        compiled: options.compiled, changedFiles, boundaries: options.config.features.repositoryContext.boundaries,
        comparisonBase: options.config.features.repositoryContext.comparisonBase,
        impactUnknown: discovery.unresolved,
        tier: options.tier, adapter: planningAdapters?.repositoryAnalyzer, now: options.now,
    });
    const readinessOptions = {
        changeName: options.changeName, compiled: options.compiled, repositoryContext: context,
        tier: options.tier, now: options.now,
    };
    const readiness = planningAdapters?.readinessEvaluator
        ? await evaluatePlanReadinessWithAdapter({ ...readinessOptions, adapter: planningAdapters.readinessEvaluator })
        : evaluatePlanReadiness(readinessOptions);
    const humanNeeded = options.config.features.uat.required
        ? Object.fromEntries(options.compiled.scenarioIds.map((scenarioId) => [scenarioId, `Validate OpenSpec scenario '${scenarioId}' and record the observed result.`]))
        : {};
    const scenarioCoverage = mapScenarioCoverage({
        scenarioIds: options.compiled.scenarioIds, evidence: [], humanNeeded,
    });
    const revision = await computeMaterialRevision({ projectRoot: options.projectRoot, compiled: options.compiled, context });
    const semanticPlanRevision = await computeSemanticPlanRevision({
        changeDir: options.changeDir,
        compiled: options.compiled,
    });
    const uatScenarios = projectUatScenarios({
        coverage: scenarioCoverage,
        findings: [],
        taskIdsByScenario: Object.fromEntries(options.compiled.graph.nodes.flatMap((task) => task.scenarioRefs.map((scenarioId) => [scenarioId, [task.taskId]]))),
        sourceRevision: revision,
    });
    if (options.config.features.uat.required && uatScenarios.length === 0) {
        uatScenarios.push(requiredUatProjectionError(revision));
    }
    return {
        changedFiles,
        impactUnknown: discovery.unresolved,
        context,
        readiness,
        scenarioCoverage,
        uatScenarios,
        semanticPlanRevision,
    };
}
async function refreshPlanningEvents(options) {
    const sourceDigests = Object.fromEntries(options.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
    const append = async (eventId, actor, payload) => appendRelayEventV2({
        changeDir: options.changeDir,
        event: createRelayEventV2({ eventId, runId: options.store.runId, changeName: options.store.changeName,
            occurredAt: options.now, sourceDigests, actor,
            provenance: { origin: options.origin, adapter: options.store.seed.tier }, payload }),
    });
    if (options.current.assurance.repositoryContext &&
        options.current.assurance.repositoryContext.contextId !== options.context.contextId) {
        const referenceIds = options.current.assurance.repositoryContext.claims
            .flatMap((claim) => claim.evidence.map((item) => item.referenceId));
        if (referenceIds.length)
            await append(`context-stale:${options.current.assurance.repositoryContext.contextId}:${options.context.inputRevision.slice(0, 12)}`, { kind: 'automation' }, { type: 'context.stale', contextId: options.current.assurance.repositoryContext.contextId,
                referenceIds });
    }
    if (options.current.assurance.readiness &&
        options.current.assurance.readiness.inputRevision !== options.readiness.inputRevision)
        await append(`readiness-stale:${options.current.assurance.readiness.resultId}:${options.readiness.inputRevision.slice(0, 12)}`, { kind: 'automation' }, { type: 'readiness.stale', resultId: options.current.assurance.readiness.resultId,
            inputRevision: options.readiness.inputRevision });
    if (options.current.assurance.planApproval &&
        options.current.assurance.planApproval.revision !== options.semanticPlanRevision.revision &&
        !options.current.assurance.planStale)
        await append(`plan-stale:${options.current.assurance.planApproval.revision.slice(0, 12)}:${options.semanticPlanRevision.revision.slice(0, 12)}`, { kind: 'automation' }, {
            type: 'plan.stale',
            approvedRevision: options.current.assurance.planApproval.revision,
            currentRevision: options.semanticPlanRevision.revision,
        });
    await append(`context:${options.context.contextId}:${options.now}`, { kind: 'analyzer', id: 'repository-context' }, { type: 'context.compiled', context: options.context });
    await append(`readiness:${options.readiness.resultId}:${options.now}`, { kind: 'analyzer', id: 'plan-readiness' }, { type: 'readiness.evaluated', result: options.readiness });
    await append(`scenario-coverage:${controllingRevision(options.compiled)}:${options.now}`, { kind: 'automation' }, { type: 'scenario.coverage_reconciled', coverage: options.scenarioCoverage });
    const existingScenarioIds = new Set(options.current.assurance.uatScenarios.map((scenario) => scenario.scenarioId));
    for (const scenario of options.uatScenarios.filter((item) => !existingScenarioIds.has(item.scenarioId)))
        await append(`uat:${scenario.scenarioId}:${scenario.sourceRevision.slice(0, 12)}`, { kind: 'automation' }, { type: 'uat.scenario_recorded', scenario });
    for (const finding of options.current.assurance.findings.filter((item) => ['repaired', 'independently_verified', 'accepted_risk'].includes(item.state))) {
        const sourceRevision = await computeMaterialRevision({
            projectRoot: options.projectRoot,
            compiled: options.compiled,
            context: options.context,
            evidence: [...finding.evidence, ...finding.transitions.flatMap((transition) => transition.evidence)],
        });
        if (finding.transitions.at(-1)?.sourceRevision !== sourceRevision)
            await append(`finding-stale:${finding.findingId}:${sourceRevision.slice(0, 12)}`, { kind: 'automation' }, { type: 'finding.stale', findingId: finding.findingId, sourceRevision });
    }
    for (const scenario of options.current.assurance.uatScenarios.filter((item) => ['passed', 'accepted_limitation'].includes(item.status))) {
        const sourceRevision = await computeMaterialRevision({
            projectRoot: options.projectRoot,
            compiled: options.compiled,
            context: options.context,
            evidence: scenario.disposition?.evidence,
        });
        if (scenario.sourceRevision !== sourceRevision)
            await append(`uat-stale:${scenario.scenarioId}:${sourceRevision.slice(0, 12)}`, { kind: 'automation' }, { type: 'uat.scenario_stale', scenarioId: scenario.scenarioId, sourceRevision });
    }
    for (const session of options.current.assurance.debugSessions.filter((item) => item.status === 'resolved' && item.verification)) {
        const sourceRevision = await computeMaterialRevision({
            projectRoot: options.projectRoot,
            compiled: options.compiled,
            context: options.context,
        });
        if (session.verification.sourceRevision !== sourceRevision)
            await append(`debug-verification-stale:${session.sessionId}:${sourceRevision.slice(0, 12)}`, { kind: 'automation' }, {
                type: 'debug.verification_stale',
                sessionId: session.sessionId,
                verificationId: session.verification.verificationId,
                sourceRevision,
            });
    }
}
export async function startRelayRunV2(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    if (resolved.archived)
        throw new Error(`Cannot start a new run for archived change '${resolved.changeName}'.`);
    const safeRunPath = await assertRelayGeneratedPath({
        changeDir: resolved.changeDir,
        filename: runStatePath(resolved.changeDir),
        createParents: true,
        allowMissingFile: true,
    });
    // A run is an auditable history, not a reset button. Repeated invocations
    // deterministically project the same canonical history.
    if (await fs.access(safeRunPath).then(() => true).catch(() => false)) {
        const { store, compiled, projection: current } = await loadCanonicalRelayState(resolved.changeDir);
        const now = options.now ?? new Date().toISOString();
        const planning = await planningInputs({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir,
            changeName: resolved.changeName, compiled, config: store.seed.config, tier: store.seed.tier,
            adapters: options.adapters, changedFiles: options.changedFiles, now });
        await refreshPlanningEvents({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir, store, compiled, current,
            context: planning.context, readiness: planning.readiness, scenarioCoverage: planning.scenarioCoverage,
            uatScenarios: planning.uatScenarios,
            semanticPlanRevision: planning.semanticPlanRevision,
            now, origin: 'relay-v2-resume' });
        const refreshedStore = await readEventStoreV2(resolved.changeDir);
        const projection = await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store: refreshedStore, compiled });
        await registerRequiredGate(resolved.changeDir, {
            extensionId: 'relay', extensionVersion: RELAY_VERSION,
            gateId: 'relay.assurance', workflowId: 'do',
        });
        return {
            ...projection,
            blockedBeforeExecution: projection.run.status === 'blocked' ||
                (store.seed.config.features.readiness.rollout === 'required' && projection.assurance.readiness?.status !== 'pass'),
        };
    }
    const config = await loadRelayConfigV2({
        projectRoot: resolved.projectRoot, changeDir: resolved.changeDir, overrides: options.config,
    });
    const compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: config.taskOverrides });
    const tier = negotiateExecutionTier(options.hostCapabilities ?? DEFAULT_HOST_CAPABILITIES, legacyConfig(config), options.adapters).tier;
    const now = options.now ?? new Date().toISOString();
    const planning = await planningInputs({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir,
        changeName: resolved.changeName, compiled, config, tier, adapters: options.adapters,
        changedFiles: options.changedFiles, now });
    const { context, readiness, scenarioCoverage } = planning;
    const releaseCandidates = await detectReleaseApplicability({
        projectRoot: resolved.projectRoot,
        changedFiles: planning.changedFiles,
        impactUnknown: planning.impactUnknown,
        config: config.features.releaseAssurance,
    });
    const blockedBeforeExecution = config.features.readiness.rollout === 'required' && readiness.status !== 'pass';
    const runId = randomUUID();
    const sourceDigests = Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
    const checks = initialChecks({
        mode: config.mode,
        repositoryStatus: context.status === 'current' ? 'pass' : 'error',
        readinessStatus: readiness.status,
        readinessRequired: config.features.readiness.rollout === 'required',
        releaseApplicable: releaseCandidates.some((candidate) => candidate.applicable),
    });
    const events = [
        createRelayEventV2({
            eventId: `context:${context.contextId}`, runId, changeName: resolved.changeName, occurredAt: now,
            sourceDigests, actor: { kind: 'analyzer', id: 'repository-context' },
            provenance: { origin: 'relay-v2-run', adapter: tier }, payload: { type: 'context.compiled', context },
        }),
        createRelayEventV2({
            eventId: `readiness:${readiness.resultId}`, runId, changeName: resolved.changeName, occurredAt: now,
            sourceDigests, actor: { kind: 'analyzer', id: 'plan-readiness' },
            provenance: { origin: 'relay-v2-run', adapter: tier }, payload: { type: 'readiness.evaluated', result: readiness },
        }),
        createRelayEventV2({
            eventId: `scenario-coverage:${controllingRevision(compiled)}`, runId, changeName: resolved.changeName, occurredAt: now,
            sourceDigests, actor: { kind: 'automation' }, provenance: { origin: 'relay-v2-run', adapter: tier },
            payload: { type: 'scenario.coverage_reconciled', coverage: scenarioCoverage },
        }),
        ...planning.uatScenarios.map((scenario) => createRelayEventV2({
            eventId: `uat:${scenario.scenarioId}:${scenario.sourceRevision.slice(0, 12)}`,
            runId,
            changeName: resolved.changeName,
            occurredAt: now,
            sourceDigests,
            actor: { kind: 'automation' },
            provenance: { origin: 'relay-v2-run', adapter: tier },
            payload: { type: 'uat.scenario_recorded', scenario },
        })),
        ...releaseCandidates.map((candidate) => createRelayEventV2({
            eventId: `release:${candidate.candidateId}`, runId, changeName: resolved.changeName, occurredAt: now,
            sourceDigests, actor: { kind: 'release_driver', id: 'applicability' },
            provenance: { origin: 'relay-v2-run', adapter: tier }, payload: { type: 'release.evaluated', candidate },
        })),
    ].sort((left, right) => left.eventId.localeCompare(right.eventId));
    const store = RelayEventStoreV2Schema.parse({
        version: 2,
        owner: 'openspec-relay',
        runId,
        changeName: resolved.changeName,
        createdAt: now,
        seed: {
            changeRef: resolved.changeRef,
            mode: config.mode,
            tier,
            status: blockedBeforeExecution ? 'blocked' : 'running',
            startedAt: now,
            gateIds: ['relay.assurance'],
            config,
            checks,
            scenarioCoverage: [],
        },
        events,
    });
    await atomicWriteRelayJson(resolved.changeDir, eventStorePath(resolved.changeDir), store);
    const projection = await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store, compiled });
    await registerRequiredGate(resolved.changeDir, {
        extensionId: 'relay', extensionVersion: RELAY_VERSION,
        gateId: 'relay.assurance', workflowId: 'do',
    });
    return { ...projection, blockedBeforeExecution };
}
export async function currentRunV2(changeDir) {
    return readEventStoreV2(changeDir);
}
export async function checkRelayRunV2(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    const { store, compiled, projection: current } = await loadCanonicalRelayState(resolved.changeDir);
    const config = store.seed.config;
    const now = options.now ?? new Date().toISOString();
    const planning = await planningInputs({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir,
        changeName: resolved.changeName, compiled, config, tier: store.seed.tier, adapters: options.adapters,
        changedFiles: options.changedFiles, now });
    const sourceDigests = Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
    const detectedReleaseCandidates = await detectReleaseApplicability({
        projectRoot: resolved.projectRoot,
        changedFiles: planning.changedFiles,
        impactUnknown: planning.impactUnknown,
        config: config.features.releaseAssurance,
    });
    const releaseCandidates = await executeReleaseCandidates({
        packageRoot: resolved.projectRoot,
        candidates: detectedReleaseCandidates,
        mode: store.seed.mode,
        config: store.seed.config.features.releaseAssurance,
        releaseRunner: options.adapters?.releaseRunner,
    });
    await refreshPlanningEvents({ projectRoot: resolved.projectRoot, changeDir: resolved.changeDir, store, compiled, current,
        context: planning.context, readiness: planning.readiness, scenarioCoverage: planning.scenarioCoverage,
        uatScenarios: planning.uatScenarios,
        semanticPlanRevision: planning.semanticPlanRevision,
        now, origin: 'relay-v2-check' });
    for (const classification of classifySemanticRequirements(compiled.requirements)) {
        const classificationStore = await readEventStoreV2(resolved.changeDir);
        await appendRelayEventV2({
            changeDir: resolved.changeDir,
            event: createRelayEventV2({
                eventId: `semantic-check:${classification.requirementId}:${classification.sourceRevision.slice(0, 12)}:${now}`,
                runId: classificationStore.runId,
                changeName: classificationStore.changeName,
                occurredAt: now,
                sourceDigests,
                actor: { kind: 'analyzer', id: 'semantic-lower-bound' },
                provenance: { origin: 'relay-v2-check', adapter: classificationStore.seed.tier },
                payload: { type: 'semantic.classified', classification },
            }),
        });
    }
    let releaseStore = await readEventStoreV2(resolved.changeDir);
    for (const candidate of releaseCandidates) {
        await appendRelayEventV2({
            changeDir: resolved.changeDir,
            event: createRelayEventV2({
                eventId: `release:${candidate.candidateId}:${now}`,
                runId: releaseStore.runId,
                changeName: releaseStore.changeName,
                occurredAt: now,
                sourceDigests,
                actor: { kind: 'release_driver', id: 'local-private' },
                provenance: { origin: 'relay-v2-check', adapter: releaseStore.seed.tier },
                payload: { type: 'release.evaluated', candidate },
            }),
        });
        releaseStore = await readEventStoreV2(resolved.changeDir);
    }
    const beforeEvaluation = replayRelayEventsV2({ store: releaseStore, compiled });
    const evaluated = evaluateAssuranceV2(beforeEvaluation.run, beforeEvaluation.assurance);
    await appendRelayEventV2({
        changeDir: resolved.changeDir,
        event: createRelayEventV2({
            eventId: `checks:${beforeEvaluation.run.stateRevision.slice(0, 16)}:${now}`,
            runId: releaseStore.runId,
            changeName: releaseStore.changeName,
            occurredAt: now,
            sourceDigests,
            actor: { kind: 'automation' },
            provenance: { origin: 'relay-v2-check', adapter: releaseStore.seed.tier },
            payload: { type: 'checks.evaluated', checks: evaluated.checks },
        }),
    });
    releaseStore = await readEventStoreV2(resolved.changeDir);
    await appendRelayEventV2({
        changeDir: resolved.changeDir,
        event: createRelayEventV2({
            eventId: `run-status:${beforeEvaluation.run.stateRevision.slice(0, 16)}:${now}`,
            runId: releaseStore.runId,
            changeName: releaseStore.changeName,
            occurredAt: now,
            sourceDigests,
            actor: { kind: 'automation' },
            provenance: { origin: 'relay-v2-check', adapter: releaseStore.seed.tier },
            payload: { type: 'run.status_updated', status: ['pass', 'warn'].includes(evaluated.status) ? 'complete' : 'blocked' },
        }),
    });
    releaseStore = await readEventStoreV2(resolved.changeDir);
    return writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store: releaseStore, compiled });
}
//# sourceMappingURL=runner-v2.js.map