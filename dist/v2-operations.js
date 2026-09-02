import { promises as fs } from 'node:fs';
import path from 'node:path';
import { appendRelayEventV2, createRelayEventV2, readEventStoreV2, writeReplayedProjectionsV2, } from './events.js';
import { loadCanonicalRelayState } from './canonical-state.js';
import { debugSessionForRepairExhaustion, observeDebugExperiment, planDebugExperiment, recordDebugConclusion, recordDebugHypothesis, resolveDebugSession, startDebugSession, } from './debug-sessions.js';
import { discoverFinding, transitionFinding } from './findings.js';
import { assertDispatchedRoleResultV2, } from './execution-adapters.js';
import { recordUatDisposition, nextUatScenario, projectUatScenarios } from './uat.js';
import { resolveChangeDirectory } from './state.js';
import { atomicWriteText } from './state.js';
import { digestJson } from './state.js';
import { bindRepositoryEvidenceDigests, computeMaterialRevision } from './repository-context.js';
import { acceptRequiredGate, readRequiredGateRecord } from '@fission-ai/openspec/extensions';
import { RelayEventPayloadV1Schema, } from './schemas.js';
async function currentV2(options) {
    const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
    const canonical = await loadCanonicalRelayState(resolved.changeDir);
    return { resolved, ...canonical };
}
function sources(compiled) {
    return Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}
async function sourceRevision(current, evidence = []) {
    return computeMaterialRevision({
        projectRoot: current.resolved.projectRoot,
        compiled: current.compiled,
        context: current.projection.assurance.repositoryContext,
        evidence,
    });
}
export async function startOrResumeDebugV2(options) {
    const current = await currentV2(options);
    const finding = options.findingId
        ? current.projection.assurance.findings.find((item) => item.findingId === options.findingId)
        : current.projection.assurance.findings.find((item) => item.blocking &&
            ['open', 'repaired', 'stale', 'human_needed'].includes(item.state));
    if (!finding)
        throw new Error('Debug requires an unresolved finding; supply --finding for a specific one.');
    const failedEvidence = finding.evidence.length ? finding.evidence : [{
            referenceId: `finding:${finding.findingId}`,
            kind: 'generated', externalId: finding.findingId, available: true,
        }];
    const now = options.now ?? new Date().toISOString();
    const session = startDebugSession({
        logicalFailureId: finding.findingId, findingId: finding.findingId,
        references: [...finding.requirementIds, ...finding.taskIds], failedEvidence,
        existing: current.projection.assurance.debugSessions, now,
    });
    await appendRelayEventV2({
        changeDir: current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: `debug:${session.sessionId}`, runId: current.store.runId, changeName: current.store.changeName,
            occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'host' },
            provenance: { origin: 'relay-debug' }, payload: { type: 'debug.session_started', session },
        }),
    });
    const projection = await writeReplayedProjectionsV2({
        changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled: current.compiled,
    });
    return { session: projection.assurance.debugSessions.find((item) => item.sessionId === session.sessionId), run: projection.run };
}
function debugSession(current, sessionId) {
    const session = current.projection.assurance.debugSessions.find((item) => item.sessionId === sessionId);
    if (!session)
        throw new Error(`Unknown debug session '${sessionId}'. Start or resume it before recording observations.`);
    return session;
}
function findingAction(action, actorId) {
    if (action === 'repair')
        return { to: 'repaired', actor: { kind: 'executor', ...(actorId ? { id: actorId } : {}) } };
    if (action === 'accept-risk') {
        if (!actorId)
            throw new Error('Accepted risk requires explicit human attribution.');
        return { to: 'accepted_risk', actor: { kind: 'human', id: actorId } };
    }
    if (action === 'request-human')
        return { to: 'human_needed', actor: { kind: 'reviewer', ...(actorId ? { id: actorId } : {}) } };
    if (action === 'mark-stale')
        return { to: 'stale', actor: { kind: 'automation', ...(actorId ? { id: actorId } : {}) } };
    throw new Error(`Unsupported direct finding action '${String(action)}'; technical verification requires a dispatched verifier result.`);
}
export async function transitionFindingV2(options) {
    const current = await currentV2(options);
    const finding = current.projection.assurance.findings.find((item) => item.findingId === options.findingId);
    if (!finding)
        throw new Error(`Unknown finding '${options.findingId}'. Record or reconcile it before transitioning.`);
    const workflow = findingAction(options.action, options.actorId);
    const now = options.now ?? new Date().toISOString();
    const evidence = await bindRepositoryEvidenceDigests({
        projectRoot: current.resolved.projectRoot,
        evidence: options.evidence ?? [],
    });
    const updated = transitionFinding({
        finding,
        to: workflow.to,
        actor: workflow.actor,
        reason: options.reason,
        evidence,
        sourceRevision: await sourceRevision(current, [...finding.evidence, ...finding.transitions.flatMap((item) => item.evidence), ...evidence]),
        occurredAt: now,
        ...(options.expiry ? { expiry: options.expiry } : {}),
        ...(options.followUp ? { followUp: options.followUp } : {}),
    });
    const transition = updated.transitions.at(-1);
    await appendRelayEventV2({
        changeDir: current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: `finding-transition:${finding.findingId}:${transition.transitionId}`,
            runId: current.store.runId,
            changeName: current.store.changeName,
            occurredAt: now,
            sourceDigests: sources(current.compiled),
            actor: workflow.actor,
            provenance: { origin: `relay-finding-${options.action}` },
            payload: { type: 'finding.transitioned', findingId: finding.findingId, transition },
        }),
    });
    const projection = await writeReplayedProjectionsV2({
        changeDir: current.resolved.changeDir,
        store: await readEventStoreV2(current.resolved.changeDir),
        compiled: current.compiled,
    });
    return projection.assurance.findings.find((item) => item.findingId === finding.findingId);
}
async function appendUatRetestForVerifiedFinding(options) {
    if (options.finding.providerId !== 'uat' || options.finding.ruleId !== 'scenario-failed' ||
        options.finding.scope.kind !== 'scenario')
        return;
    const scenario = options.current.projection.assurance.uatScenarios.find((item) => item.scenarioId === options.finding.scope.identity);
    if (!scenario)
        throw new Error(`Failed UAT finding '${options.finding.findingId}' has no projected scenario to retest.`);
    await appendRelayEventV2({
        changeDir: options.current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: `uat-retest:${scenario.scenarioId}:${options.transition.transitionId}`,
            runId: options.current.store.runId,
            changeName: options.current.store.changeName,
            occurredAt: options.now,
            sourceDigests: sources(options.current.compiled),
            actor: options.transition.actor,
            provenance: { origin: 'relay-dispatched-verifier' },
            payload: {
                type: 'uat.scenario_retest',
                scenarioId: scenario.scenarioId,
                sourceRevision: options.transition.sourceRevision,
            },
        }),
    });
}
/** Persist evidence and stable findings only from an orchestrator-issued,
 * read-only reviewer or verifier dispatch receipt. */
export async function recordDispatchedRoleResultV2(options) {
    const role = options.receipt?.request.role;
    if (role !== 'reviewer' && role !== 'verifier') {
        throw new Error('Dispatched assurance recording requires a reviewer or verifier result.');
    }
    assertDispatchedRoleResultV2(options.receipt, role);
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const repositoryRevision = await sourceRevision(current);
    for (const [index, candidate] of (options.receipt.result.events ?? []).entries()) {
        const payload = RelayEventPayloadV1Schema.parse(candidate);
        if (payload.type !== 'evidence.recorded') {
            throw new Error('Dispatched reviewer/verifier results may persist evidence only; findings use structured reports.');
        }
        const expectedOrigin = role;
        const evidence = {
            ...payload.evidence,
            observedAt: now,
            sourceState: repositoryRevision,
            sourceDigests: sources(current.compiled),
            origin: expectedOrigin,
        };
        await appendRelayEventV2({
            changeDir: current.resolved.changeDir,
            event: createRelayEventV2({
                eventId: `${options.receipt.dispatchId}:evidence:${index}`,
                runId: current.store.runId,
                changeName: current.store.changeName,
                occurredAt: now,
                sourceDigests: sources(current.compiled),
                actor: { kind: role, id: options.receipt.dispatchId },
                provenance: { origin: 'relay-dispatched-role-result', adapter: role },
                payload: { type: 'evidence.recorded', evidence },
            }),
        });
    }
    for (const report of options.receipt.result.findings ?? []) {
        const evidence = await bindRepositoryEvidenceDigests({
            projectRoot: current.resolved.projectRoot,
            evidence: report.evidence ?? options.receipt.result.evidence ?? [],
        });
        const discovered = discoverFinding({
            ...report,
            requirementIds: report.requirementIds ?? [],
            taskIds: report.taskIds ?? [],
            evidence,
            occurredAt: now,
            sourceRevision: repositoryRevision,
            actor: { kind: role, id: options.receipt.dispatchId },
        });
        const existing = current.projection.assurance.findings.find((item) => item.findingId === discovered.findingId);
        if (!existing) {
            await appendRelayEventV2({
                changeDir: current.resolved.changeDir,
                event: createRelayEventV2({
                    eventId: `${options.receipt.dispatchId}:finding:${discovered.findingId}`,
                    runId: current.store.runId,
                    changeName: current.store.changeName,
                    occurredAt: now,
                    sourceDigests: sources(current.compiled),
                    actor: { kind: role, id: options.receipt.dispatchId },
                    provenance: { origin: 'relay-dispatched-role-result', adapter: role },
                    payload: { type: 'finding.discovered', finding: discovered },
                }),
            });
        }
        else if (['independently_verified', 'accepted_risk'].includes(existing.state)) {
            const stale = transitionFinding({
                finding: existing,
                to: 'stale',
                actor: { kind: role, id: options.receipt.dispatchId },
                reason: 'The assurance provider reported the same logical finding again.',
                evidence,
                sourceRevision: repositoryRevision,
                occurredAt: now,
            });
            const transition = stale.transitions.at(-1);
            await appendRelayEventV2({
                changeDir: current.resolved.changeDir,
                event: createRelayEventV2({
                    eventId: `${options.receipt.dispatchId}:finding-rerun:${discovered.findingId}`,
                    runId: current.store.runId,
                    changeName: current.store.changeName,
                    occurredAt: now,
                    sourceDigests: sources(current.compiled),
                    actor: { kind: role, id: options.receipt.dispatchId },
                    provenance: { origin: 'relay-dispatched-role-result', adapter: role },
                    payload: { type: 'finding.transitioned', findingId: existing.findingId, transition },
                }),
            });
        }
    }
    const refreshed = await currentV2(options);
    return writeReplayedProjectionsV2({
        changeDir: refreshed.resolved.changeDir,
        store: refreshed.store,
        compiled: refreshed.compiled,
    });
}
/** Independent technical closure is possible only through a verifier receipt
 * created by dispatchRoleV2; a caller-selected actor string is never enough. */
export async function verifyFindingFromDispatchedResultV2(options) {
    assertDispatchedRoleResultV2(options.receipt, 'verifier');
    if (options.receipt.result.status !== 'pass') {
        throw new Error('Independent verification closure requires a passing verifier result.');
    }
    const current = await currentV2(options);
    const finding = current.projection.assurance.findings.find((item) => item.findingId === options.findingId);
    if (!finding)
        throw new Error(`Unknown finding '${options.findingId}'.`);
    const evidence = await bindRepositoryEvidenceDigests({
        projectRoot: current.resolved.projectRoot,
        evidence: options.receipt.result.evidence ?? [],
    });
    if (evidence.length === 0)
        throw new Error('Independent verification requires structured observable evidence.');
    const now = options.now ?? new Date().toISOString();
    const updated = transitionFinding({
        finding,
        to: 'independently_verified',
        actor: { kind: 'verifier', id: options.receipt.dispatchId },
        reason: options.reason,
        evidence,
        sourceRevision: await sourceRevision(current, [
            ...finding.evidence,
            ...finding.transitions.flatMap((item) => item.evidence),
            ...evidence,
        ]),
        occurredAt: now,
    });
    const transition = updated.transitions.at(-1);
    await appendRelayEventV2({
        changeDir: current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: `${options.receipt.dispatchId}:verify:${finding.findingId}`,
            runId: current.store.runId,
            changeName: current.store.changeName,
            occurredAt: now,
            sourceDigests: sources(current.compiled),
            actor: transition.actor,
            provenance: { origin: 'relay-dispatched-verifier', adapter: 'verifier' },
            payload: { type: 'finding.transitioned', findingId: finding.findingId, transition },
        }),
    });
    await appendUatRetestForVerifiedFinding({ current, finding: updated, transition, now });
    const refreshed = await currentV2(options);
    const projection = await writeReplayedProjectionsV2({
        changeDir: refreshed.resolved.changeDir,
        store: refreshed.store,
        compiled: refreshed.compiled,
    });
    return projection.assurance.findings.find((item) => item.findingId === finding.findingId);
}
async function appendDebugEvent(options) {
    await appendRelayEventV2({
        changeDir: options.current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: options.eventId,
            runId: options.current.store.runId,
            changeName: options.current.store.changeName,
            occurredAt: options.now,
            sourceDigests: sources(options.current.compiled),
            actor: options.actor ?? { kind: 'executor' },
            provenance: { origin: 'relay-debug' },
            payload: options.payload,
        }),
    });
    const projection = await writeReplayedProjectionsV2({
        changeDir: options.current.resolved.changeDir,
        store: await readEventStoreV2(options.current.resolved.changeDir),
        compiled: options.current.compiled,
    });
    return projection.assurance.debugSessions;
}
export async function recordDebugReferenceChangeV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const [reference] = await bindRepositoryEvidenceDigests({
        projectRoot: current.resolved.projectRoot,
        evidence: [options.reference],
    });
    const sessions = await appendDebugEvent({
        current, now,
        eventId: `debug-reference:${options.sessionId}:${reference.referenceId}:${reference.digest ?? 'unavailable'}`,
        payload: { type: 'debug.reference_changed', sessionId: options.sessionId, reference },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function recordDebugQuestionV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const sessions = await appendDebugEvent({
        current, now,
        eventId: `debug-question:${options.sessionId}:${digestJson(options.question).slice(0, 16)}`,
        payload: { type: 'debug.question_recorded', sessionId: options.sessionId, question: options.question },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function recordDebugNextActionV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const sessions = await appendDebugEvent({
        current, now,
        eventId: `debug-next-action:${options.sessionId}:${digestJson(options.nextAction).slice(0, 16)}`,
        payload: { type: 'debug.next_action_recorded', sessionId: options.sessionId, nextAction: options.nextAction },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function recordDebugHypothesisV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const updated = recordDebugHypothesis({ session: debugSession(current, options.sessionId), statement: options.statement, now });
    const hypothesis = updated.hypotheses.at(-1);
    const sessions = await appendDebugEvent({ current, now,
        eventId: `debug-hypothesis:${options.sessionId}:${hypothesis.hypothesisId}`,
        payload: { type: 'debug.hypothesis_recorded', sessionId: options.sessionId, hypothesis },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function planDebugExperimentV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const updated = planDebugExperiment({
        session: debugSession(current, options.sessionId), hypothesisId: options.hypothesisId, action: options.action,
        targetedEvidence: options.evidence, sourceRevision: await sourceRevision(current, options.evidence), now,
        ...(options.humanRationale ? { humanRationale: options.humanRationale } : {}),
    });
    const experiment = updated.experiments.at(-1);
    const sessions = await appendDebugEvent({ current, now,
        eventId: `debug-experiment:${options.sessionId}:${experiment.experimentId}`,
        payload: { type: 'debug.experiment_recorded', sessionId: options.sessionId, experiment },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function observeDebugExperimentV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const updated = observeDebugExperiment({
        session: debugSession(current, options.sessionId), experimentId: options.experimentId,
        result: options.result, observation: options.observation, now,
    });
    const experiment = updated.experiments.find((item) => item.experimentId === options.experimentId);
    const sessions = await appendDebugEvent({ current, now,
        eventId: `debug-observation:${options.sessionId}:${options.experimentId}:${now}`,
        payload: { type: 'debug.experiment_recorded', sessionId: options.sessionId, experiment },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function recordDebugConclusionV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const evidence = options.evidence ? await bindRepositoryEvidenceDigests({
        projectRoot: current.resolved.projectRoot,
        evidence: options.evidence,
    }) : undefined;
    const updated = recordDebugConclusion({ session: debugSession(current, options.sessionId), kind: options.kind,
        statement: options.statement, experimentIds: options.experimentIds, evidence,
        sourceRevision: await sourceRevision(current, evidence), now });
    const conclusion = updated.conclusions.at(-1);
    const sessions = await appendDebugEvent({ current, now,
        eventId: `debug-conclusion:${options.sessionId}:${conclusion.conclusionId}`,
        payload: { type: 'debug.conclusion_recorded', sessionId: options.sessionId, conclusion },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function resolveDebugSessionV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const session = debugSession(current, options.sessionId);
    const finding = session.findingId
        ? current.projection.assurance.findings.find((item) => item.findingId === session.findingId)
        : undefined;
    const checkId = session.logicalFailureId.startsWith('check:')
        ? session.logicalFailureId.slice('check:'.length)
        : undefined;
    const currentSourceDigests = sources(current.compiled);
    const currentRepositoryRevision = await sourceRevision(current);
    if (!options.exemption) {
        assertDispatchedRoleResultV2(options.verificationResult, 'verifier');
        if (options.verificationResult.result.status !== 'pass') {
            throw new Error('Debug technical closure requires a passing dispatched verifier result.');
        }
    }
    const workflowActor = options.exemption
        ? { kind: 'human', id: options.exemption.acceptedBy }
        : { kind: 'verifier', id: options.verificationResult.dispatchId };
    const equivalentCheckEvent = !finding && checkId
        ? [...current.store.events].reverse().find((event) => event.payload.type === 'evidence.recorded' &&
            event.payload.evidence.checkId === checkId && event.payload.evidence.result === 'pass' &&
            event.payload.evidence.origin === 'verifier' && event.actor.kind === 'verifier' &&
            event.actor.id === workflowActor.id && Date.parse(event.occurredAt) >= Date.parse(session.startedAt) &&
            event.payload.evidence.sourceState === currentRepositoryRevision &&
            Boolean(event.payload.evidence.sourceDigests) && Object.entries(currentSourceDigests).every(([artifactPath, sourceDigest]) => event.payload.type === 'evidence.recorded' &&
            event.payload.evidence.sourceDigests?.[artifactPath] === sourceDigest))
        : undefined;
    const equivalentCheck = equivalentCheckEvent?.payload.type === 'evidence.recorded'
        ? equivalentCheckEvent.payload.evidence
        : undefined;
    if (finding && !options.exemption && finding.state !== 'independently_verified') {
        throw new Error('Debug resolution requires the linked finding to be independently verified first.');
    }
    if (!finding && !options.exemption && !equivalentCheck) {
        throw new Error('Debug resolution requires a current independently verified linked finding or equivalent check.');
    }
    if (finding && !options.exemption) {
        const repairingActors = new Set(finding.transitions.filter((item) => item.actor.kind === 'executor')
            .map((item) => item.actor.id).filter(Boolean));
        if (repairingActors.has(workflowActor.id)) {
            throw new Error('Debug resolution verifier must be distinct from the executor who repaired the finding.');
        }
        const verificationTransition = [...finding.transitions].reverse().find((item) => item.to === 'independently_verified');
        if (!options.exemption && (verificationTransition?.actor.kind !== 'verifier' ||
            verificationTransition.actor.id !== workflowActor.id)) {
            throw new Error('Debug resolution must use the distinct orchestrator verifier stage that verified the finding.');
        }
    }
    let regressionEvidence;
    if (options.exemption)
        regressionEvidence = [{
                referenceId: `debug-exemption:${digestJson(options.exemption).slice(0, 24)}`,
                kind: 'generated',
                externalId: options.exemption.acceptedBy,
                digest: digestJson(options.exemption),
                available: true,
            }];
    else {
        if (!options.redEvidenceId || !options.greenEvidenceId) {
            throw new Error('Debug resolution requires canonical RED and GREEN evidence IDs.');
        }
        const red = current.projection.assurance.evidence.find((item) => item.evidenceId === options.redEvidenceId);
        const green = current.projection.assurance.evidence.find((item) => item.evidenceId === options.greenEvidenceId);
        if (!red || !green)
            throw new Error('Debug resolution evidence IDs must reference existing canonical evidence records.');
        if (current.projection.assurance.staleEvidenceIds.includes(red.evidenceId) ||
            current.projection.assurance.staleEvidenceIds.includes(green.evidenceId)) {
            throw new Error('Debug resolution requires current canonical RED and GREEN evidence.');
        }
        if (red.phase !== 'red' || red.result !== 'fail' || red.exitCode === 0 || !red.relevantFailure ||
            red.preExistingFailure || green.phase !== 'green' || green.result !== 'pass') {
            throw new Error('Debug resolution requires a relevant fail-first RED record and a passing GREEN record.');
        }
        if (red.checkId !== green.checkId || red.taskId !== green.taskId ||
            (checkId && red.checkId !== checkId) ||
            (finding?.taskIds.length && (!red.taskId || !finding.taskIds.includes(red.taskId)))) {
            throw new Error('Debug RED and GREEN evidence must identify the same check and task or defect subject.');
        }
        if (red.sourceState === green.sourceState || green.sourceState !== currentRepositoryRevision ||
            red.outputDigest === green.outputDigest) {
            throw new Error('Debug RED evidence must precede GREEN evidence from the resulting implementation revision.');
        }
        if (Object.entries(currentSourceDigests).some(([artifactPath, sourceDigest]) => red.sourceDigests?.[artifactPath] !== sourceDigest || green.sourceDigests?.[artifactPath] !== sourceDigest)) {
            throw new Error('Debug resolution requires RED and GREEN evidence bound to current controlling OpenSpec revisions.');
        }
        const redIndex = current.store.events.findIndex((event) => event.payload.type === 'evidence.recorded' &&
            event.payload.evidence.evidenceId === red.evidenceId);
        const greenIndex = current.store.events.findIndex((event) => event.payload.type === 'evidence.recorded' &&
            event.payload.evidence.evidenceId === green.evidenceId);
        const reversedRepairIndex = [...current.store.events].reverse().findIndex((event) => finding
            ? event.payload.type === 'finding.transitioned' && event.payload.findingId === finding.findingId &&
                event.payload.transition.to === 'repaired'
            : event.payload.type === 'repair.recorded' && event.payload.repair.checkId === checkId &&
                event.payload.repair.result === 'pass');
        const repairIndex = reversedRepairIndex < 0 ? -1 : current.store.events.length - reversedRepairIndex - 1;
        if (redIndex < 0 || repairIndex < 0 || greenIndex < 0 || !(redIndex < repairIndex && repairIndex < greenIndex)) {
            throw new Error('Canonical event order must show RED before the repair boundary and GREEN after it.');
        }
        regressionEvidence = [red, green].map((item) => ({
            referenceId: `evidence:${item.evidenceId}`,
            kind: 'generated',
            externalId: item.evidenceId,
            digest: item.outputDigest,
            available: true,
        }));
    }
    const equivalentCheckReference = equivalentCheck ? {
        referenceId: `evidence:${equivalentCheck.evidenceId}`,
        kind: 'generated',
        externalId: equivalentCheck.evidenceId,
        digest: equivalentCheck.outputDigest,
        available: true,
    } : undefined;
    const verificationEvidence = equivalentCheckReference && !regressionEvidence.some((item) => item.referenceId === equivalentCheckReference.referenceId)
        ? [...regressionEvidence, equivalentCheckReference]
        : regressionEvidence;
    const revision = currentRepositoryRevision;
    if (finding) {
        const findingRevision = await sourceRevision(current, [
            ...finding.evidence,
            ...finding.transitions.flatMap((transition) => transition.evidence),
        ]);
        if (finding.transitions.at(-1)?.sourceRevision !== findingRevision) {
            throw new Error('Debug resolution requires a current independently verified linked finding.');
        }
    }
    const verifiedSubject = finding
        ? { findingId: finding.findingId }
        : { checkId: equivalentCheck?.checkId ?? checkId };
    const verification = {
        verificationId: `debug-verification:${digestJson({
            sessionId: session.sessionId, ...verifiedSubject, verifier: workflowActor, revision,
            evidence: verificationEvidence.map((item) => [item.referenceId, item.digest]),
        }).slice(0, 24)}`,
        ...verifiedSubject,
        verifier: workflowActor,
        evidence: verificationEvidence,
        ...(!options.exemption ? {
            failBeforeEvidence: regressionEvidence[0],
            passAfterEvidence: regressionEvidence[1],
        } : { exemption: options.exemption }),
        sourceRevision: revision,
        verifiedAt: now,
    };
    const updated = resolveDebugSession({
        session, regressionEvidence, verification, now,
        ...(options.exemption ? { exemption: options.exemption } : {}),
    });
    await appendDebugEvent({ current, now,
        eventId: `debug-verification:${options.sessionId}:${verification.verificationId}`,
        actor: workflowActor,
        payload: { type: 'debug.verification_recorded', sessionId: options.sessionId, verification },
    });
    const refreshed = await currentV2(options);
    const resolutionAt = new Date(Date.parse(now) + 1).toISOString();
    const sessions = await appendDebugEvent({ current: refreshed, now: resolutionAt,
        eventId: `debug-resolved:${options.sessionId}:${verification.verificationId}`,
        actor: workflowActor,
        payload: { type: 'debug.session_resolved', sessionId: options.sessionId,
            verificationId: verification.verificationId, nextAction: updated.nextAction },
    });
    return sessions.find((item) => item.sessionId === options.sessionId);
}
export async function presentUatV2(options) {
    const current = await currentV2(options);
    const now = options.now ?? new Date().toISOString();
    const existing = current.projection.assurance.uatScenarios;
    const scenarios = existing.length ? existing : projectUatScenarios({
        coverage: current.projection.assurance.scenarioCoverage,
        findings: current.projection.assurance.findings,
        taskIdsByScenario: Object.fromEntries(current.projection.run.tasks.flatMap((task) => task.scenarioRefs.map((scenarioId) => [scenarioId, [task.taskId]]))),
        sourceRevision: await sourceRevision(current),
    });
    if (!existing.length) {
        for (const scenario of scenarios)
            await appendRelayEventV2({
                changeDir: current.resolved.changeDir,
                event: createRelayEventV2({
                    eventId: `uat:${scenario.scenarioId}`, runId: current.store.runId, changeName: current.store.changeName,
                    occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'host' },
                    provenance: { origin: 'relay-uat' }, payload: { type: 'uat.scenario_recorded', scenario },
                }),
            });
    }
    const projection = await writeReplayedProjectionsV2({
        changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled: current.compiled,
    });
    return { next: nextUatScenario(projection.assurance.uatScenarios), scenarios: projection.assurance.uatScenarios };
}
export async function recordUatV2(options) {
    const current = await currentV2(options);
    const scenario = current.projection.assurance.uatScenarios.find((item) => item.scenarioId === options.scenarioId);
    if (!scenario)
        throw new Error(`Unknown UAT scenario '${options.scenarioId}'. Run uat first to project applicable scenarios.`);
    const now = options.now ?? new Date().toISOString();
    const evidence = await bindRepositoryEvidenceDigests({
        projectRoot: current.resolved.projectRoot,
        evidence: options.evidence ?? [],
    });
    const currentSourceRevision = await sourceRevision(current, [...(scenario.disposition?.evidence ?? []), ...evidence]);
    const currentScenario = { ...scenario, sourceRevision: currentSourceRevision };
    const result = recordUatDisposition({ ...options, scenario: currentScenario, evidence, now });
    await appendRelayEventV2({
        changeDir: current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: `uat-disposition:${options.scenarioId}:${now}`, runId: current.store.runId, changeName: current.store.changeName,
            occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
            provenance: { origin: 'relay-uat' }, payload: {
                type: 'uat.disposition_recorded', scenarioId: options.scenarioId, status: options.status,
                actor: options.actor, notes: options.notes, sourceRevision: currentSourceRevision, evidence,
            },
        }),
    });
    if (result.finding)
        await appendRelayEventV2({
            changeDir: current.resolved.changeDir,
            event: createRelayEventV2({
                eventId: `uat-finding:${result.finding.findingId}`, runId: current.store.runId, changeName: current.store.changeName,
                occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
                provenance: { origin: 'relay-uat' }, payload: { type: 'finding.discovered', finding: result.finding },
            }),
        });
    if (result.acceptedRisk) {
        const transition = result.acceptedRisk.transitions.at(-1);
        await appendRelayEventV2({
            changeDir: current.resolved.changeDir,
            event: createRelayEventV2({
                eventId: `uat-accepted-risk:${result.acceptedRisk.findingId}`, runId: current.store.runId, changeName: current.store.changeName,
                occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
                provenance: { origin: 'relay-uat' }, payload: { type: 'finding.discovered', finding: {
                        ...result.acceptedRisk, state: 'open', transitions: [result.acceptedRisk.transitions[0]],
                    } },
            }),
        });
        await appendRelayEventV2({
            changeDir: current.resolved.changeDir,
            event: createRelayEventV2({
                eventId: `uat-accepted-risk-transition:${result.acceptedRisk.findingId}`, runId: current.store.runId, changeName: current.store.changeName,
                occurredAt: now, sourceDigests: sources(current.compiled), actor: { kind: 'human', id: options.actor },
                provenance: { origin: 'relay-uat' }, payload: { type: 'finding.transitioned', findingId: result.acceptedRisk.findingId, transition },
            }),
        });
    }
    const projection = await writeReplayedProjectionsV2({
        changeDir: current.resolved.changeDir, store: await readEventStoreV2(current.resolved.changeDir), compiled: current.compiled,
    });
    return { scenario: projection.assurance.uatScenarios.find((item) => item.scenarioId === options.scenarioId), next: nextUatScenario(projection.assurance.uatScenarios) };
}
/** Record the durable core gate acceptance and mirror its audit binding in the
 * v2 event history. This intentionally does not close UAT or lifecycle
 * obligations: their individual dispositions remain independently blocking. */
export async function acceptRelayGateV2(options) {
    const current = await currentV2(options);
    const acceptedAt = options.occurredAt ?? new Date().toISOString();
    await acceptRequiredGate(current.resolved.changeDir, options.gateId, {
        actor: options.actor,
        acceptedAt,
    });
    const gateRecord = await readRequiredGateRecord(current.resolved.changeDir);
    const gate = gateRecord.gates.find((item) => item.gateId === options.gateId);
    if (!gate?.acceptance)
        throw new Error(`Gate '${options.gateId}' acceptance was not recorded.`);
    const event = createRelayEventV2({
        eventId: options.eventId ?? `gate-accept:${options.gateId}:${acceptedAt}`,
        runId: current.store.runId,
        changeName: current.store.changeName,
        occurredAt: acceptedAt,
        sourceDigests: sources(current.compiled),
        actor: { kind: 'human', id: options.actor },
        provenance: { origin: 'tier0-cli-accept' },
        payload: {
            type: 'human.decision',
            gateId: options.gateId,
            decision: 'accepted',
            resultDigest: gate.acceptance.resultDigest,
            evidenceDigest: gate.acceptance.evidenceDigest,
        },
    });
    const appended = await appendRelayEventV2({ changeDir: current.resolved.changeDir, event });
    const projection = await writeReplayedProjectionsV2({
        changeDir: current.resolved.changeDir,
        store: await readEventStoreV2(current.resolved.changeDir),
        compiled: current.compiled,
    });
    return {
        accepted: true,
        appended: appended.appended,
        eventId: event.eventId,
        eventType: event.payload.type,
        runId: event.runId,
        changeName: event.changeName,
        projectionRepaired: true,
        nextAction: nextAction(projection.run.tasks),
    };
}
function nextAction(tasks) {
    const complete = new Set(tasks.filter((task) => task.status === 'complete').map((task) => task.taskId));
    const blocked = new Set(tasks.filter((task) => task.status === 'blocked').map((task) => task.taskId));
    let changed = true;
    while (changed) {
        changed = false;
        for (const task of tasks)
            if (!blocked.has(task.taskId) && task.dependencies.some((dependency) => blocked.has(dependency))) {
                blocked.add(task.taskId);
                changed = true;
            }
    }
    const next = tasks.find((task) => task.status !== 'complete' && !blocked.has(task.taskId) &&
        task.dependencies.every((dependency) => complete.has(dependency)));
    return { ...(next ? { taskId: next.taskId } : {}), blockedTaskIds: [...blocked].sort(),
        complete: tasks.every((task) => task.status === 'complete') };
}
async function updateTaskCheckbox(changeDir, taskId, complete) {
    const filename = path.join(changeDir, 'tasks.md');
    const input = await fs.readFile(filename, 'utf8');
    const escaped = taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^(\\s*-\\s*\\[)[ xX](\\]\\s+${escaped}\\s+)`, 'm');
    if (!pattern.test(input))
        throw new Error(`Task '${taskId}' is not an explicitly identified checklist item.`);
    await atomicWriteText(filename, input.replace(pattern, `$1${complete ? 'x' : ' '}$2`));
}
function validateWorkflowResultProvenance(stage, payload) {
    if (payload.type === 'human.decision') {
        throw new Error('Human decisions require a dedicated human action.');
    }
    if (payload.type === 'evidence.recorded') {
        const expected = stage === 'automation' ? 'automated' : stage;
        if (!['automation', 'executor'].includes(stage) || payload.evidence.origin !== expected) {
            throw new Error(`Evidence origin '${payload.evidence.origin}' does not match orchestrated ${stage} stage.`);
        }
    }
    if (payload.type === 'finding.recorded') {
        throw new Error('Findings require a structured orchestrator-dispatched reviewer or verifier result.');
    }
    if (['deviation.recorded', 'repair.recorded'].includes(payload.type) && stage !== 'executor') {
        throw new Error(`${payload.type} requires executor-stage attribution.`);
    }
}
export async function recordWorkflowResultV2(options) {
    const current = await currentV2(options);
    const now = options.occurredAt ?? new Date().toISOString();
    let payload = RelayEventPayloadV1Schema.parse(options.payload);
    validateWorkflowResultProvenance(options.stage, payload);
    const referencedTaskId = payload.type === 'task.transition'
        ? payload.taskId
        : payload.type === 'evidence.recorded' ? payload.evidence.taskId : undefined;
    const task = referencedTaskId
        ? current.projection.run.tasks.find((item) => item.taskId === referencedTaskId)
        : undefined;
    if (payload.type === 'task.transition' && !task)
        throw new Error('Recording references an unknown current OpenSpec task.');
    if (payload.type === 'task.transition' && payload.status !== 'blocked' && task.dependencies.some((dependency) => current.projection.run.tasks.find((item) => item.taskId === dependency)?.status !== 'complete')) {
        throw new Error(`Task '${task.taskId}' has incomplete dependencies.`);
    }
    if (payload.type === 'evidence.recorded') {
        if (!payload.evidence.sourceDigests || Object.entries(payload.evidence.sourceDigests).some(([artifact, value]) => sources(current.compiled)[artifact] !== value)) {
            throw new Error('Evidence must bind current controlling OpenSpec source digests.');
        }
        payload = RelayEventPayloadV1Schema.parse({
            ...payload,
            evidence: {
                ...payload.evidence,
                observedAt: now,
                sourceState: await sourceRevision(current),
                sourceDigests: sources(current.compiled),
            },
        });
    }
    const appended = await appendRelayEventV2({
        changeDir: current.resolved.changeDir,
        event: createRelayEventV2({
            eventId: options.eventId, runId: current.store.runId, changeName: current.store.changeName, occurredAt: now,
            sourceDigests: sources(current.compiled),
            actor: { kind: options.stage, ...(options.actorId ? { id: options.actorId } : {}) },
            provenance: { origin: `relay-${options.stage}-result` },
            payload,
        }),
    });
    if (payload.type === 'task.transition' && ['complete', 'pending'].includes(payload.status)) {
        await updateTaskCheckbox(current.resolved.changeDir, payload.taskId, payload.status === 'complete');
    }
    if (payload.type === 'repair.recorded' && payload.repair.result === 'fail' &&
        payload.repair.attempt >= current.store.seed.config.repairLimit) {
        const now = options.occurredAt ?? new Date().toISOString();
        if (current.store.seed.config.features.debug.enabled && current.store.seed.config.features.debug.automaticTransition) {
            const session = debugSessionForRepairExhaustion({
                logicalFailureId: `check:${payload.repair.checkId}`,
                references: [payload.repair.checkId, ...payload.repair.changedReferences],
                failedEvidence: [{
                        referenceId: `repair:${payload.repair.repairId}`,
                        kind: 'generated', externalId: payload.repair.repairId, available: true,
                    }],
                repairAttempts: [...current.projection.assurance.repairs, payload.repair],
                limit: current.store.seed.config.repairLimit,
                existing: current.projection.assurance.debugSessions,
                now,
            });
            await appendRelayEventV2({
                changeDir: current.resolved.changeDir,
                event: createRelayEventV2({
                    eventId: `repair-exhausted-debug:${session.sessionId}`,
                    runId: current.store.runId, changeName: current.store.changeName, occurredAt: now,
                    sourceDigests: sources(current.compiled), actor: { kind: 'automation' },
                    provenance: { origin: 'bounded-repair' }, payload: { type: 'debug.session_started', session },
                }),
            });
        }
        else {
            await appendRelayEventV2({
                changeDir: current.resolved.changeDir,
                event: createRelayEventV2({
                    eventId: `repair-exhausted-human:${payload.repair.checkId}:${payload.repair.attempt}`,
                    runId: current.store.runId, changeName: current.store.changeName, occurredAt: now,
                    sourceDigests: sources(current.compiled), actor: { kind: 'host' },
                    provenance: { origin: 'bounded-repair' }, payload: {
                        type: 'human.disposition_recorded', subjectId: `check:${payload.repair.checkId}`,
                        disposition: 'human_needed', actor: 'relay',
                        reason: 'Repair is exhausted and no safe automatic debugging capability is enabled.',
                        scope: 'bounded repair',
                    },
                }),
            });
        }
    }
    const refreshed = await loadCanonicalRelayState(current.resolved.changeDir);
    const projection = await writeReplayedProjectionsV2({
        changeDir: current.resolved.changeDir, store: refreshed.store, compiled: refreshed.compiled,
    });
    return {
        accepted: true, appended: appended.appended, eventId: options.eventId, eventType: payload.type,
        runId: current.store.runId, changeName: current.store.changeName, projectionRepaired: true,
        nextAction: nextAction(projection.run.tasks),
    };
}
//# sourceMappingURL=v2-operations.js.map