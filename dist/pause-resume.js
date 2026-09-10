import { loadCanonicalRelayRecords } from './canonical-state.js';
import { appendRelayEventV2, createRelayEventV2, writeReplayedProjectionsV2 } from './events.js';
import { evaluateResumeRouteV1 } from './resume-route.js';
import { PauseCheckpointV1Schema, } from './schemas.js';
import { digestJson, resolveChangeDirectory } from './state.js';
import { snapshotWorkspaceV1, validateWorkspaceSnapshotV1 } from './workspace.js';
function sourceDigests(canonical) {
    return Object.fromEntries(canonical.compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}
function artifactRevision(canonical) {
    return digestJson(sourceDigests(canonical));
}
function routeDecision(canonical, options = { hasCheckpoint: false }) {
    const { run, assurance } = canonical.projection;
    const activeDebug = assurance.debugSessions.some((session) => session.status === 'active');
    const pendingWork = run.tasks.some((task) => task.status !== 'complete') || assurance.findings.some((finding) => finding.blocking && !['independently_verified', 'accepted_risk'].includes(finding.state));
    const pendingUat = assurance.uatScenarios.some((scenario) => ['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale'].includes(scenario.status));
    return evaluateResumeRouteV1({
        integrity: canonical.projectionsMatch ? 'pass' : 'error',
        candidateIds: [run.changeName],
        artifactState: canonical.compiled.artifacts.length > 0 ? 'complete' : 'missing',
        artifactsChanged: options.artifactsChanged ?? false,
        discussionOpen: false,
        planApproval: run.planApprovalStatus,
        activeDebug,
        pendingWork,
        pendingUat,
        archiveReady: run.status === 'complete' && ['pass', 'warn'].includes(assurance.status),
        requiredAuthority: options.requiredAuthority ?? [],
        hasCheckpoint: options.hasCheckpoint,
    });
}
export async function pauseRelayChangeV1(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    const canonical = await loadCanonicalRelayRecords(resolved.changeDir);
    if (!canonical.projectionsMatch)
        throw new Error('Cannot pause while canonical history and generated projections disagree.');
    const activeCheckpoint = canonical.projection.run.effectivePause;
    const workspace = await snapshotWorkspaceV1({ projectRoot: resolved.projectRoot });
    const dispatches = options.dispatches ?? activeCheckpoint?.dispatches ?? [];
    const activity = options.activity ?? activeCheckpoint?.activity ?? {
        kind: 'workflow', id: 'pause-boundary', mutationCapable: false,
    };
    const unsafeDispatches = dispatches.filter((dispatch) => !dispatch.readOnly &&
        (dispatch.state === 'running' || dispatch.state === 'unknown'));
    const quiescenceObserved = options.quiescenceObserved ?? false;
    const quiescenceIncomplete = !quiescenceObserved || activity.mutationCapable || unsafeDispatches.length > 0;
    const decision = routeDecision(canonical, {
        hasCheckpoint: true,
        requiredAuthority: [
            ...(!quiescenceObserved ? ['quiescence:unobserved'] : []),
            ...(activity.mutationCapable ? [`activity:${activity.id}`] : []),
            ...unsafeDispatches.map((dispatch) => `dispatch:${dispatch.dispatchId}`),
        ],
    });
    const stable = {
        version: 1,
        changeName: canonical.projection.run.changeName,
        runId: canonical.projection.run.runId,
        planRevision: artifactRevision(canonical),
        stage: options.stage ?? activeCheckpoint?.stage ?? 'implementation',
        activity,
        taskIds: options.taskIds ?? canonical.projection.run.tasks
            .filter((task) => task.status === 'in_progress' || task.status === 'blocked').map((task) => task.taskId),
        ...(workspace.repositoryRevision ? { repositoryRevision: workspace.repositoryRevision } : {}),
        workspace: workspace.entries,
        dispatches,
        findingIds: canonical.projection.assurance.findings.filter((finding) => finding.blocking &&
            !['independently_verified', 'accepted_risk'].includes(finding.state)).map((finding) => finding.findingId),
        humanActionIds: canonical.projection.assurance.unresolvedHumanActions,
        resumeRoute: decision.route,
        quiescence: quiescenceIncomplete ? 'incomplete' : 'safe',
    };
    const stateFingerprint = digestJson(stable);
    const repeatedFingerprint = activeCheckpoint
        ? digestJson({ ...stable, quiescence: activeCheckpoint.quiescence })
        : undefined;
    if (activeCheckpoint && options.quiescenceObserved === undefined &&
        activeCheckpoint.stateFingerprint === repeatedFingerprint)
        return {
            checkpoint: activeCheckpoint, appended: false, safe: activeCheckpoint.quiescence === 'safe',
            run: canonical.projection.run, assurance: canonical.projection.assurance,
        };
    if (activeCheckpoint?.stateFingerprint === stateFingerprint)
        return {
            checkpoint: activeCheckpoint, appended: false, safe: activeCheckpoint.quiescence === 'safe',
            run: canonical.projection.run, assurance: canonical.projection.assurance,
        };
    const checkpoint = PauseCheckpointV1Schema.parse({
        ...stable,
        pauseId: `pause-${stateFingerprint.slice(0, 16)}`,
        createdAt: options.now ?? new Date().toISOString(),
        stateFingerprint,
    });
    const result = await appendRelayEventV2({
        changeDir: resolved.changeDir,
        event: createRelayEventV2({
            eventId: `workflow-paused:${checkpoint.pauseId}:${canonical.store.events.length}`,
            runId: canonical.store.runId,
            changeName: canonical.store.changeName,
            occurredAt: checkpoint.createdAt,
            sourceDigests: sourceDigests(canonical),
            actor: { kind: 'host', id: 'openspec-relay' },
            provenance: { origin: 'relay-pause' },
            payload: { type: 'workflow.paused', checkpoint },
        }),
    });
    const projection = await writeReplayedProjectionsV2({
        changeDir: resolved.changeDir, store: result.store, compiled: canonical.compiled,
    });
    return { checkpoint, appended: result.appended, safe: checkpoint.quiescence === 'safe', ...projection };
}
export async function resumeRelayChangeV1(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    const canonical = await loadCanonicalRelayRecords(resolved.changeDir);
    const checkpoint = canonical.projection.run.effectivePause;
    if (!checkpoint) {
        const decision = routeDecision(canonical);
        if (options.enterRoute && options.enterRoute !== decision.route) {
            throw new Error(`Resume route changed: expected '${options.enterRoute}', current route is '${decision.route}'.`);
        }
        const released = Boolean((options.enterRoute || options.invoke) && decision.automatic);
        const invocation = released && options.invoke ? await options.invoke(decision.route) : undefined;
        return {
            resumed: false, released, continued: released && Boolean(options.invoke), reconstructed: true, decision, drift: [],
            ...(invocation !== undefined ? { invocation } : {}),
        };
    }
    const drift = [];
    if (checkpoint.planRevision !== artifactRevision(canonical))
        drift.push('OpenSpec artifact revision changed.');
    const workspace = await validateWorkspaceSnapshotV1({
        projectRoot: resolved.projectRoot,
        expected: {
            revisionAvailable: Boolean(checkpoint.repositoryRevision),
            ...(checkpoint.repositoryRevision ? { repositoryRevision: checkpoint.repositoryRevision } : {}),
            entries: checkpoint.workspace,
        },
    });
    drift.push(...workspace.reasons);
    if (!canonical.projectionsMatch)
        drift.push('Canonical history and generated projections disagree.');
    if (checkpoint.quiescence === 'incomplete')
        drift.push('Mutation-capable dispatch quiescence is incomplete.');
    if (JSON.stringify([...checkpoint.humanActionIds].sort()) !==
        JSON.stringify([...canonical.projection.assurance.unresolvedHumanActions].sort())) {
        drift.push('Unresolved human actions changed while paused.');
    }
    const observedDispatches = new Map((options.dispatches ?? []).map((dispatch) => [dispatch.dispatchId, dispatch]));
    for (const dispatch of checkpoint.dispatches) {
        if (dispatch.state !== 'running' && dispatch.state !== 'unknown')
            continue;
        const observed = observedDispatches.get(dispatch.dispatchId);
        if (!observed)
            drift.push(`Dispatch '${dispatch.dispatchId}' requires fresh host observation.`);
        else if (observed.state === 'running' || observed.state === 'unknown') {
            drift.push(`Dispatch '${dispatch.dispatchId}' has not reached a resumable boundary.`);
        }
        else if (dispatch.requestRevision && observed.requestRevision !== dispatch.requestRevision) {
            drift.push(`Dispatch '${dispatch.dispatchId}' revision identity changed.`);
        }
    }
    for (const dispatch of options.dispatches ?? []) {
        if (!dispatch.readOnly && (dispatch.state === 'running' || dispatch.state === 'unknown')) {
            drift.push(`Current mutation-capable dispatch '${dispatch.dispatchId}' has not reached a resumable boundary.`);
        }
    }
    const decision = routeDecision(canonical, {
        hasCheckpoint: true,
        artifactsChanged: drift.some((reason) => /artifact/i.test(reason)),
        requiredAuthority: drift,
    });
    if (drift.length > 0)
        return {
            resumed: false, released: false, continued: false, reconstructed: false, decision, drift: [...new Set(drift)],
        };
    if (options.enterRoute && options.enterRoute !== decision.route) {
        throw new Error(`Resume route changed: expected '${options.enterRoute}', current route is '${decision.route}'.`);
    }
    if (!options.enterRoute && !options.invoke) {
        return { resumed: false, released: false, continued: false, reconstructed: false, decision, drift: [] };
    }
    const occurredAt = options.now ?? new Date().toISOString();
    const result = await appendRelayEventV2({
        changeDir: resolved.changeDir,
        event: createRelayEventV2({
            eventId: `workflow-resumed:${checkpoint.pauseId}:${canonical.store.events.length}`,
            runId: canonical.store.runId,
            changeName: canonical.store.changeName,
            occurredAt,
            sourceDigests: sourceDigests(canonical),
            actor: { kind: 'host', id: 'openspec-relay' },
            provenance: { origin: 'relay-resume' },
            payload: {
                type: 'workflow.resumed', pauseId: checkpoint.pauseId,
                checkpointFingerprint: checkpoint.stateFingerprint, route: decision.route, reconstructed: false,
            },
        }),
    });
    await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store: result.store, compiled: canonical.compiled });
    const invocation = options.invoke ? await options.invoke(decision.route) : undefined;
    return {
        resumed: true, released: true, continued: Boolean(options.invoke), reconstructed: false, decision, drift: [],
        ...(invocation !== undefined ? { invocation } : {}),
    };
}
//# sourceMappingURL=pause-resume.js.map