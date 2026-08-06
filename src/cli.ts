#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { GUARDRAILS_VERSION } from './version.js';
import { GuardrailsConfigV1Schema, RunModeSchema, ExecutionTierSchema } from './schemas.js';
import { checkGuardrailsRun, startGuardrailsRun } from './runner.js';
import { getRunStatus } from './status.js';
import {
  acceptGuardrailsGate,
  DeviationRecordingRequestV1Schema,
  EvidenceRecordingRequestV1Schema,
  FindingRecordingRequestV1Schema,
  recordGuardrailsPayload,
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
    const config = GuardrailsConfigV1Schema.partial().parse({
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
    const result = await startGuardrailsRun({ change, projectRoot: options.project, config });
    print(options.json ? result :
      `Guardrails ${result.run.mode} run ${result.run.runId} started at ${result.run.tier}; ` +
      `${result.run.tasks.length} task(s), ${result.run.executionWaves.length} wave(s), Git automation disabled unless listed in run.json.`,
    Boolean(options.json));
  });

program.command('check')
  .argument('<change>')
  .option('--project <path>')
  .option('--json')
  .action(async (change, options) => {
    const result = await checkGuardrailsRun({ change, projectRoot: options.project });
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
    const status = await getRunStatus({ change, projectRoot: options.project });
    print(options.json ? status :
      `${status.changeName}: ${status.status}; mode=${status.mode}; tier=${status.tier}; ` +
      `tasks=${status.tasks.complete}/${status.tasks.total}; assurance=${status.assuranceStatus}; ` +
      `repairs=${status.repairs.length}; human-actions=${status.unresolvedHumanActions.length}.`,
    Boolean(options.json));
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
    print(await recordGuardrailsPayload({
      change,
      projectRoot: options.project,
      eventId: options.eventId,
      actor: { kind: 'host', ...(options.actor ? { id: options.actor } : {}) },
      provenance: { origin: 'tier0-cli-task' },
      payload: { type: 'task.transition', taskId, status, ...(options.reason ? { reason: options.reason } : {}) },
    }), true);
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
      print(await recordGuardrailsPayload({
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
    print(await acceptGuardrailsGate({
      change,
      projectRoot: options.project,
      gateId,
      actor: options.actor,
      eventId: options.eventId,
    }), true);
  });

await program.parseAsync(process.argv);
