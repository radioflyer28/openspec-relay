#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { GUARDRAILS_VERSION } from './version.js';
import {
  ExecutionTierSchema,
  GuardrailsConfigV2Schema,
  PortableReferenceV2Schema,
  RunModeSchema,
  type FindingStateV2,
  type FindingTransitionV2,
} from './schemas.js';
import { checkGuardrailsRunV2, startGuardrailsRunV2 } from './runner-v2.js';
import { getRunStatusV2 } from './status.js';
import {
  acceptGuardrailsGateV2,
  observeDebugExperimentV2,
  planDebugExperimentV2,
  recordDebugConclusionV2,
  recordDebugNextActionV2,
  recordDebugQuestionV2,
  recordDebugReferenceChangeV2,
  presentUatV2,
  recordDebugHypothesisV2,
  recordLegacyPayloadV2,
  recordUatV2,
  resolveDebugSessionV2,
  startOrResumeDebugV2,
  transitionFindingV2,
} from './v2-operations.js';
import {
  DeviationRecordingRequestV1Schema,
  EvidenceRecordingRequestV1Schema,
  FindingRecordingRequestV1Schema,
  RepairRecordingRequestV1Schema,
} from './recording.js';

function print(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

async function readInput(filename: string): Promise<unknown> {
  let content: string;
  if (filename === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    content = Buffer.concat(chunks).toString('utf8');
  } else {
    content = await fs.readFile(filename, 'utf8');
  }
  return JSON.parse(content);
}

const program = new Command()
  .name('openspec-guardrails')
  .description('Risk-aware execution and assurance for OpenSpec changes')
  .version(GUARDRAILS_VERSION);

program.command('run')
  .argument('<change>')
  .option('--project <path>')
  .option('--mode <mode>', 'quick, guarded, or full', 'guarded')
  .option('--tier <tier>', 'tier0, tier1, or tier2', 'tier0')
  .option('--enable-agent-dispatch')
  .option('--enable-parallel')
  .option('--enable-commits')
  .option('--enable-branches')
  .option('--enable-worktrees')
  .option('--json')
  .action(async (change, options) => {
    const mode = RunModeSchema.parse(options.mode);
    const requestedTier = ExecutionTierSchema.parse(options.tier);
    const config = GuardrailsConfigV2Schema.partial().parse({
      mode,
      requestedTier,
      allowAgentDispatch: Boolean(options.enableAgentDispatch),
      allowParallel: Boolean(options.enableParallel),
      git: {
        commits: Boolean(options.enableCommits),
        branches: Boolean(options.enableBranches),
        worktrees: Boolean(options.enableWorktrees),
      },
    });
    const result = await startGuardrailsRunV2({ change, projectRoot: options.project, config });
    print(options.json ? result :
      `Guardrails ${result.run.mode} run ${result.run.runId} started at ${result.run.tier}; ` +
      `${result.run.tasks.length} task(s), ${result.run.executionWaves.length} wave(s); ` +
      `${result.blockedBeforeExecution ? 'readiness blocks implementation.' : 'readiness is recorded before implementation.'}`,
    Boolean(options.json));
  });

program.command('check')
  .argument('<change>')
  .option('--project <path>')
  .option('--json')
  .action(async (change, options) => {
    const result = await checkGuardrailsRunV2({ change, projectRoot: options.project });
    print(options.json ? result :
      `Guardrails assurance: ${result.assurance.status}; ` +
      `${result.assurance.checks.filter((check) => check.status === 'fail' || check.status === 'error').length} blocking check(s).`,
    Boolean(options.json));
  });

program.command('run-status')
  .argument('<change>')
  .option('--project <path>')
  .option('--json')
  .action(async (change, options) => {
    const status = await getRunStatusV2({ change, projectRoot: options.project });
    print(options.json ? status :
      `${status.changeName}: ${status.status}; mode=${status.mode}; tier=${status.tier}; ` +
      `tasks=${status.tasks.complete}/${status.tasks.total}; assurance=${status.assuranceStatus}; ` +
      `readiness=${status.readiness.status}; findings=${Object.values(status.findings).reduce((sum, count) => sum + count, 0)}; ` +
      `human-actions=${status.unresolvedHumanActions.length}.`,
    Boolean(options.json));
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
  .option('--verifier <id>')
  .option('--verifier-kind <kind>', 'verifier or human', 'verifier')
  .option('--exemption-reason <text>')
  .option('--accepted-by <human>')
  .option('--project <path>')
  .option('--json')
  .action(async (change, options) => {
    const evidence = options.evidence
      ? PortableReferenceV2Schema.array().parse(await readInput(options.evidence))
      : [];
    if (options.hypothesis) {
      if (!options.session) throw new Error('Debug hypothesis recording requires --session.');
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
      print(options.json ? { session } : `Recorded ${options.rootCause ? 'root cause' : 'conclusion'} for ${session.sessionId}.`,
        Boolean(options.json));
      return;
    }
    if (options.changedReference) {
      if (!options.session || evidence.length === 0) {
        throw new Error('Recording changed references requires --session and --evidence.');
      }
      let session;
      for (const reference of evidence) session = await recordDebugReferenceChangeV2({
        change, projectRoot: options.project, sessionId: options.session, reference,
      });
      print(options.json ? { session } : `Recorded changed references for ${options.session}.`, Boolean(options.json));
      return;
    }
    if (options.question) {
      if (!options.session) throw new Error('Recording an unresolved question requires --session.');
      const session = await recordDebugQuestionV2({
        change, projectRoot: options.project, sessionId: options.session, question: options.question,
      });
      print(options.json ? { session } : `Recorded unresolved question for ${session.sessionId}.`, Boolean(options.json));
      return;
    }
    if (options.nextAction) {
      if (!options.session) throw new Error('Recording a next action requires --session.');
      const session = await recordDebugNextActionV2({
        change, projectRoot: options.project, sessionId: options.session, nextAction: options.nextAction,
      });
      print(options.json ? { session } : `Recorded next action for ${session.sessionId}.`, Boolean(options.json));
      return;
    }
    if (options.resolve) {
      if (!options.session || !options.verifier || !['verifier', 'human'].includes(options.verifierKind) ||
          (options.exemptionReason && !options.acceptedBy)) {
        throw new Error('Debug resolution requires --session, --verifier, a valid --verifier-kind, and an --accepted-by actor for any exemption.');
      }
      const session = await resolveDebugSessionV2({
        change, projectRoot: options.project, sessionId: options.session, regressionEvidence: evidence,
        verifier: { kind: options.verifierKind, id: options.verifier },
        ...(options.exemptionReason ? { exemption: { reason: options.exemptionReason, acceptedBy: options.acceptedBy } } : {}),
      });
      print(options.json ? { session } : `Resolved debug session ${session.sessionId}.`, Boolean(options.json));
      return;
    }
    const result = await startOrResumeDebugV2({
      change, projectRoot: options.project, ...(options.finding ? { findingId: options.finding } : {}),
    });
    print(options.json ? result : `Debug session ${result.session.sessionId}: ${result.session.nextAction ?? result.session.status}.`,
      Boolean(options.json));
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
  .description('Record validated Tier 0 execution and assurance events');

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
      ? options.status as 'pending' | 'in_progress' | 'complete' | 'blocked'
      : (() => { throw new Error(`Invalid task status '${options.status}'.`); })();
    print(await recordLegacyPayloadV2({
      change,
      projectRoot: options.project,
      eventId: options.eventId,
      actor: { kind: 'host', ...(options.actor ? { id: options.actor } : {}) },
      provenance: { origin: 'tier0-cli-task' },
      payload: { type: 'task.transition', taskId, status, ...(options.reason ? { reason: options.reason } : {}) },
    }), true);
  });

record.command('finding-transition')
  .argument('<change>')
  .argument('<finding-id>')
  .requiredOption('--to <state>', 'repaired, independently_verified, accepted_risk, human_needed, or stale')
  .requiredOption('--actor-kind <kind>', 'executor, verifier, reviewer, human, automation, or host')
  .requiredOption('--actor <id>')
  .requiredOption('--reason <text>')
  .option('--evidence <json-file|->')
  .option('--expiry <ISO timestamp>')
  .option('--follow-up <text>')
  .option('--project <path>')
  .option('--json')
  .action(async (change, findingId, options) => {
    const states = ['repaired', 'independently_verified', 'accepted_risk', 'human_needed', 'stale'];
    const kinds = ['executor', 'verifier', 'reviewer', 'human', 'automation', 'host'];
    if (!states.includes(options.to)) throw new Error(`Invalid finding state '${options.to}'.`);
    if (!kinds.includes(options.actorKind)) throw new Error(`Invalid finding actor '${options.actorKind}'.`);
    const evidence = options.evidence
      ? PortableReferenceV2Schema.array().parse(await readInput(options.evidence))
      : [];
    const finding = await transitionFindingV2({
      change,
      projectRoot: options.project,
      findingId,
      to: options.to as FindingStateV2,
      actor: { kind: options.actorKind as FindingTransitionV2['actor']['kind'], id: options.actor },
      reason: options.reason,
      evidence,
      ...(options.expiry ? { expiry: options.expiry } : {}),
      ...(options.followUp ? { followUp: options.followUp } : {}),
    });
    print(options.json ? { finding } : `Recorded ${finding.state} for ${finding.findingId}.`, Boolean(options.json));
  });

for (const contribution of [
  { name: 'evidence', schema: EvidenceRecordingRequestV1Schema, field: 'evidence', type: 'evidence.recorded' },
  { name: 'finding', schema: FindingRecordingRequestV1Schema, field: 'finding', type: 'finding.recorded' },
  { name: 'deviation', schema: DeviationRecordingRequestV1Schema, field: 'deviation', type: 'deviation.recorded' },
  { name: 'repair', schema: RepairRecordingRequestV1Schema, field: 'repair', type: 'repair.recorded' },
] as const) {
  record.command(contribution.name)
    .argument('<change>')
    .requiredOption('--input <json-file|->')
    .option('--project <path>')
    .action(async (change, options) => {
      const request = contribution.schema.parse(await readInput(options.input));
      const value = (request as unknown as Record<string, unknown>)[contribution.field];
      print(await recordLegacyPayloadV2({
        change,
        projectRoot: options.project,
        eventId: request.eventId,
        occurredAt: request.occurredAt,
        actor: request.actor,
        provenance: request.provenance,
        payload: { type: contribution.type, [contribution.field]: value } as never,
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
    print(await acceptGuardrailsGateV2({
      change,
      projectRoot: options.project,
      gateId,
      actor: options.actor,
      eventId: options.eventId,
    }), true);
  });

await program.parseAsync(process.argv);
