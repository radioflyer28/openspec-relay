#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { RELAY_VERSION } from './version.js';
import { PortableReferenceV2Schema, DeviationV1Schema, EvidenceV1Schema, RepairAttemptV1Schema, } from './schemas.js';
import { checkRelayRunV2 } from './runner-v2.js';
import { getRunStatusV2 } from './status.js';
import { planRelayChangeV1 } from './plan-workflow.js';
import { assertCurrentPlanApprovalV1 } from './do-workflow.js';
import { pauseRelayChangeV1, resumeRelayChangeV1 } from './pause-resume.js';
import { DiscussionCheckpointInputV1Schema, replaceDiscussionCheckpointV1, resumeDiscussionCheckpointV1, } from './discussion-registry.js';
import { resolveProjectRoot } from './state.js';
import { acceptRelayGateV2, observeDebugExperimentV2, planDebugExperimentV2, recordDebugConclusionV2, recordDebugNextActionV2, recordDebugQuestionV2, recordDebugReferenceChangeV2, presentUatV2, recordDebugHypothesisV2, recordWorkflowResultV2, recordUatV2, resolveDebugSessionV2, startOrResumeDebugV2, transitionFindingV2, } from './v2-operations.js';
const RecordingMetadataSchema = z.object({
    eventId: z.string().min(1),
    occurredAt: z.string().datetime().optional(),
}).strict();
const EvidenceRecordingRequestV1Schema = RecordingMetadataSchema.extend({ evidence: EvidenceV1Schema }).strict();
const DeviationRecordingRequestV1Schema = RecordingMetadataSchema.extend({ deviation: DeviationV1Schema }).strict();
const RepairRecordingRequestV1Schema = RecordingMetadataSchema.extend({ repair: RepairAttemptV1Schema }).strict();
function print(value, json) {
    if (json)
        console.log(JSON.stringify(value, null, 2));
    else
        console.log(value);
}
async function readInput(filename) {
    let content;
    if (filename === '-') {
        const chunks = [];
        for await (const chunk of process.stdin)
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        content = Buffer.concat(chunks).toString('utf8');
    }
    else {
        content = await fs.readFile(filename, 'utf8');
    }
    return JSON.parse(content);
}
async function selectChange(change, projectRoot) {
    const root = await resolveProjectRoot(projectRoot ?? process.cwd());
    if (change)
        return { projectRoot: root, change };
    const changesRoot = path.join(root, 'openspec', 'changes');
    const candidates = (await fs.readdir(changesRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.'))
        .map((entry) => entry.name).sort();
    if (candidates.length === 0)
        throw new Error('No active OpenSpec change exists; select a discussion explicitly when resuming pre-proposal work.');
    if (candidates.length > 1)
        throw new Error(`Multiple active OpenSpec changes exist; select one explicitly: ${candidates.join(', ')}.`);
    return { projectRoot: root, change: candidates[0] };
}
const program = new Command()
    .name('openspec-relay')
    .description('Risk-aware execution and assurance for OpenSpec changes')
    .version(RELAY_VERSION);
program.command('plan')
    .argument('<change>')
    .option('--project <path>')
    .option('--allow-self-review', 'Explicitly accept disclosed Tier 0 self-review for this invocation')
    .option('--json')
    .action(async (change, options) => {
    const result = await planRelayChangeV1({
        change,
        projectRoot: options.project,
        allowSelfReview: Boolean(options.allowSelfReview),
    });
    print(options.json ? result :
        `OpenSpec Relay plan: ${result.status}; revision=${result.run.planRevision ?? 'unapproved'}; ` +
            `review=${result.review.independent ? 'independent' : 'tier0-self-review'}. ${result.summary}`, Boolean(options.json));
});
program.command('do')
    .argument('<change>')
    .option('--project <path>')
    .option('--json')
    .action(async (change, options) => {
    const approval = await assertCurrentPlanApprovalV1({ change, projectRoot: options.project });
    print(options.json ? { status: 'ready', approval } :
        `OpenSpec Relay do is ready for '${approval.changeName}' at approved revision ${approval.revision}. ` +
            `The host executor wrapper must delegate implementation to $openspec-apply-change.`, Boolean(options.json));
});
program.command('pause')
    .argument('[change]')
    .option('--discussion <id>', 'Pause a pre-proposal discussion using --input')
    .option('--input <json-file|->', 'Bounded discussion checkpoint JSON')
    .option('--project <path>')
    .option('--json')
    .action(async (change, options) => {
    if (options.discussion) {
        if (change || !options.input)
            throw new Error('Discussion pause requires --discussion and --input, without a change argument.');
        const root = await resolveProjectRoot(options.project ?? process.cwd());
        const checkpoint = DiscussionCheckpointInputV1Schema.parse(await readInput(options.input));
        if (checkpoint.workingId !== options.discussion)
            throw new Error('Discussion input workingId must match --discussion.');
        const result = await replaceDiscussionCheckpointV1({ projectRoot: root, checkpoint });
        print(options.json ? result : `OpenSpec Relay discussion '${result.checkpoint.workingId}' paused.`, Boolean(options.json));
        return;
    }
    const selected = await selectChange(change, options.project);
    const result = await pauseRelayChangeV1(selected);
    print(options.json ? result : result.appended
        ? `OpenSpec Relay '${result.checkpoint.changeName}' ${result.safe ? 'paused' : 'could not reach safe quiescence'}; resume=${result.checkpoint.resumeRoute}.`
        : `OpenSpec Relay '${result.checkpoint.changeName}' is already paused; resume=${result.checkpoint.resumeRoute}.`, Boolean(options.json));
    if (!result.safe)
        process.exitCode = 2;
});
program.command('resume')
    .argument('[change]')
    .option('--discussion <id>', 'Resume a pre-proposal discussion checkpoint')
    .option('--project <path>')
    .option('--json')
    .action(async (change, options) => {
    if (options.discussion) {
        if (change)
            throw new Error('Select either a change argument or --discussion, not both.');
        const root = await resolveProjectRoot(options.project ?? process.cwd());
        const result = await resumeDiscussionCheckpointV1({ projectRoot: root, workingId: options.discussion });
        print(options.json ? result : `Resume discussion '${result.workingId}': ${result.nextQuestion?.summary ?? 'proposal handoff is ready'}.`, Boolean(options.json));
        return;
    }
    const selected = await selectChange(change, options.project);
    const result = await resumeRelayChangeV1(selected);
    print(options.json ? result : `OpenSpec Relay resume route for '${selected.change}': ${result.decision.route} (${result.reconstructed ? 'reconstructed' : 'checkpoint restored'}).`, Boolean(options.json));
});
program.command('check')
    .argument('<change>')
    .option('--project <path>')
    .option('--json')
    .action(async (change, options) => {
    const result = await checkRelayRunV2({ change, projectRoot: options.project });
    print(options.json ? result :
        `OpenSpec Relay assurance: ${result.assurance.status}; ` +
            `${result.assurance.checks.filter((check) => check.status === 'fail' || check.status === 'error').length} blocking check(s).`, Boolean(options.json));
});
program.command('status')
    .argument('<change>')
    .option('--project <path>')
    .option('--json')
    .action(async (change, options) => {
    const status = await getRunStatusV2({ change, projectRoot: options.project });
    const human = status.integrity.status === 'error'
        ? `${status.changeName}: error; OpenSpec Relay execution-record integrity error: ${status.integrity.summary} ` +
            `${status.nextActions[0] ?? 'Regenerate projections before relying on status.'}`
        : `${status.changeName}: ${status.status}; mode=${status.mode}; tier=${status.tier}; ` +
            `tasks=${status.tasks.complete}/${status.tasks.total}; assurance=${status.assuranceStatus}; ` +
            `readiness=${status.readiness.status}; findings=${Object.values(status.findings).reduce((sum, count) => sum + count, 0)}; ` +
            `human-actions=${status.unresolvedHumanActions.length}.`;
    print(options.json ? status : human, Boolean(options.json));
});
program.command('debug')
    .argument('<change>')
    .option('--finding <id>')
    .option('--session <id>')
    .option('--hypothesis <text>')
    .option('--hypothesis-id <id>')
    .option('--experiment <action>')
    .option('--experiment-id <id>')
    .option('--result <result>', 'passed, failed, or inconclusive')
    .option('--observation <text>')
    .option('--conclusion <text>')
    .option('--root-cause <text>')
    .option('--changed-reference', 'Record each --evidence reference as changed')
    .option('--question <text>')
    .option('--next-action <text>')
    .option('--evidence <json-file|->')
    .option('--resolve')
    .option('--exemption-reason <text>')
    .option('--accepted-by <human>')
    .option('--project <path>')
    .option('--json')
    .action(async (change, options) => {
    const evidence = options.evidence
        ? PortableReferenceV2Schema.array().parse(await readInput(options.evidence))
        : [];
    if (options.hypothesis) {
        if (!options.session)
            throw new Error('Debug hypothesis recording requires --session.');
        const session = await recordDebugHypothesisV2({ change, projectRoot: options.project, sessionId: options.session, statement: options.hypothesis });
        print(options.json ? { session } : `Recorded hypothesis for ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    if (options.experiment) {
        if (!options.session || !options.hypothesisId || evidence.length === 0) {
            throw new Error('Debug experiment recording requires --session, --hypothesis-id, and --evidence.');
        }
        const session = await planDebugExperimentV2({
            change, projectRoot: options.project, sessionId: options.session, hypothesisId: options.hypothesisId,
            action: options.experiment, evidence,
        });
        print(options.json ? { session } : `Recorded experiment for ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    if (options.result) {
        if (!options.session || !options.experimentId || !options.observation ||
            !['passed', 'failed', 'inconclusive'].includes(options.result)) {
            throw new Error('Debug result recording requires --session, --experiment-id, --result passed|failed|inconclusive, and --observation.');
        }
        const session = await observeDebugExperimentV2({
            change, projectRoot: options.project, sessionId: options.session, experimentId: options.experimentId,
            result: options.result, observation: options.observation,
        });
        print(options.json ? { session } : `Recorded experiment result for ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    if (options.conclusion || options.rootCause) {
        if (!options.session || !options.experimentId) {
            throw new Error('Debug conclusion recording requires --session and --experiment-id.');
        }
        const session = await recordDebugConclusionV2({
            change, projectRoot: options.project, sessionId: options.session,
            kind: options.rootCause ? 'root_cause' : 'conclusion',
            statement: options.rootCause ?? options.conclusion, experimentIds: [options.experimentId],
            ...(evidence.length ? { evidence } : {}),
        });
        print(options.json ? { session } : `Recorded ${options.rootCause ? 'root cause' : 'conclusion'} for ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    if (options.changedReference) {
        if (!options.session || evidence.length === 0) {
            throw new Error('Recording changed references requires --session and --evidence.');
        }
        let session;
        for (const reference of evidence)
            session = await recordDebugReferenceChangeV2({
                change, projectRoot: options.project, sessionId: options.session, reference,
            });
        print(options.json ? { session } : `Recorded changed references for ${options.session}.`, Boolean(options.json));
        return;
    }
    if (options.question) {
        if (!options.session)
            throw new Error('Recording an unresolved question requires --session.');
        const session = await recordDebugQuestionV2({
            change, projectRoot: options.project, sessionId: options.session, question: options.question,
        });
        print(options.json ? { session } : `Recorded unresolved question for ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    if (options.nextAction) {
        if (!options.session)
            throw new Error('Recording a next action requires --session.');
        const session = await recordDebugNextActionV2({
            change, projectRoot: options.project, sessionId: options.session, nextAction: options.nextAction,
        });
        print(options.json ? { session } : `Recorded next action for ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    if (options.resolve) {
        if (!options.session || !options.exemptionReason || !options.acceptedBy) {
            throw new Error('CLI debug resolution is limited to an explicit human exemption and requires --session, --exemption-reason, and --accepted-by; technical closure must come from an orchestrator-dispatched verifier.');
        }
        const session = await resolveDebugSessionV2({
            change, projectRoot: options.project, sessionId: options.session,
            exemption: { reason: options.exemptionReason, acceptedBy: options.acceptedBy },
        });
        print(options.json ? { session } : `Resolved debug session ${session.sessionId}.`, Boolean(options.json));
        return;
    }
    const result = await startOrResumeDebugV2({
        change, projectRoot: options.project, ...(options.finding ? { findingId: options.finding } : {}),
    });
    print(options.json ? result : `Debug session ${result.session.sessionId}: ${result.session.nextAction ?? result.session.status}.`, Boolean(options.json));
});
program.command('uat')
    .argument('<change>')
    .option('--project <path>')
    .option('--scenario <id>')
    .option('--status <status>', 'passed, failed, blocked, or accepted_limitation')
    .option('--actor <human>')
    .option('--notes <text>')
    .option('--evidence <json-file|->')
    .option('--json')
    .action(async (change, options) => {
    const recording = options.scenario || options.status || options.actor || options.notes || options.evidence;
    if (!recording) {
        const result = await presentUatV2({ change, projectRoot: options.project });
        print(options.json ? result : result.next
            ? `Next UAT scenario: ${result.next.scenarioId}\n${result.next.action}\nExpected: ${result.next.expectedResult}`
            : 'No unresolved UAT scenarios.', Boolean(options.json));
        return;
    }
    if (!options.scenario || !options.status || !options.actor || !options.notes) {
        throw new Error('UAT recording requires --scenario, --status, --actor, and --notes.');
    }
    if (!['passed', 'failed', 'blocked', 'accepted_limitation'].includes(options.status)) {
        throw new Error(`Invalid UAT status '${options.status}'.`);
    }
    const evidence = options.evidence
        ? PortableReferenceV2Schema.array().parse(await readInput(options.evidence))
        : [];
    const result = await recordUatV2({
        change, projectRoot: options.project, scenarioId: options.scenario, status: options.status,
        actor: options.actor, notes: options.notes, evidence,
    });
    print(options.json ? result : `Recorded ${result.scenario.status} for ${result.scenario.scenarioId}.`, Boolean(options.json));
});
const record = program.command('record')
    .description('Submit validated workflow results to the OpenSpec Relay orchestrator');
record.command('task')
    .argument('<change>')
    .argument('<task-id>')
    .requiredOption('--status <status>', 'pending, in_progress, complete, or blocked')
    .requiredOption('--event-id <id>')
    .option('--reason <text>')
    .option('--actor <text>')
    .option('--project <path>')
    .action(async (change, taskId, options) => {
    const status = ['pending', 'in_progress', 'complete', 'blocked'].includes(options.status)
        ? options.status
        : (() => { throw new Error(`Invalid task status '${options.status}'.`); })();
    print(await recordWorkflowResultV2({
        change,
        projectRoot: options.project,
        eventId: options.eventId,
        stage: 'host',
        ...(options.actor ? { actorId: options.actor } : {}),
        payload: { type: 'task.transition', taskId, status, ...(options.reason ? { reason: options.reason } : {}) },
    }), true);
});
record.command('finding-transition')
    .argument('<change>')
    .argument('<finding-id>')
    .requiredOption('--to <state>', 'repaired, accepted_risk, human_needed, or stale')
    .requiredOption('--actor <id>')
    .requiredOption('--reason <text>')
    .option('--evidence <json-file|->')
    .option('--expiry <ISO timestamp>')
    .option('--follow-up <text>')
    .option('--project <path>')
    .option('--json')
    .action(async (change, findingId, options) => {
    const states = ['repaired', 'accepted_risk', 'human_needed', 'stale'];
    if (!states.includes(options.to))
        throw new Error(`Invalid finding state '${options.to}'.`);
    const actionByState = {
        repaired: 'repair', accepted_risk: 'accept-risk',
        human_needed: 'request-human', stale: 'mark-stale',
    };
    const action = actionByState[options.to];
    const evidence = options.evidence
        ? PortableReferenceV2Schema.array().parse(await readInput(options.evidence))
        : [];
    const finding = await transitionFindingV2({
        change,
        projectRoot: options.project,
        findingId,
        action,
        actorId: options.actor,
        reason: options.reason,
        evidence,
        ...(options.expiry ? { expiry: options.expiry } : {}),
        ...(options.followUp ? { followUp: options.followUp } : {}),
    });
    print(options.json ? { finding } : `Recorded ${finding.state} for ${finding.findingId}.`, Boolean(options.json));
});
for (const contribution of [
    { name: 'evidence', schema: EvidenceRecordingRequestV1Schema, field: 'evidence', type: 'evidence.recorded' },
    { name: 'deviation', schema: DeviationRecordingRequestV1Schema, field: 'deviation', type: 'deviation.recorded' },
    { name: 'repair', schema: RepairRecordingRequestV1Schema, field: 'repair', type: 'repair.recorded' },
]) {
    record.command(contribution.name)
        .argument('<change>')
        .requiredOption('--input <json-file|->')
        .option('--stage <stage>', 'automation or executor')
        .option('--actor <id>', 'Optional stage actor attribution')
        .option('--project <path>')
        .action(async (change, options) => {
        const request = contribution.schema.parse(await readInput(options.input));
        const value = request[contribution.field];
        const stage = contribution.name === 'deviation' || contribution.name === 'repair'
            ? 'executor'
            : options.stage;
        if (!['automation', 'executor'].includes(stage)) {
            throw new Error(`Recording ${contribution.name} requires an orchestrated --stage.`);
        }
        print(await recordWorkflowResultV2({
            change,
            projectRoot: options.project,
            eventId: request.eventId,
            occurredAt: request.occurredAt,
            stage,
            ...(options.actor ? { actorId: options.actor } : {}),
            payload: { type: contribution.type, [contribution.field]: value },
        }), true);
    });
}
program.command('accept')
    .argument('<change>')
    .argument('<gate-or-check-id>')
    .requiredOption('--actor <text>')
    .option('--event-id <id>')
    .option('--project <path>')
    .action(async (change, gateId, options) => {
    print(await acceptRelayGateV2({
        change,
        projectRoot: options.project,
        gateId,
        actor: options.actor,
        eventId: options.eventId,
    }), true);
});
await program.parseAsync(process.argv);
//# sourceMappingURL=cli.js.map