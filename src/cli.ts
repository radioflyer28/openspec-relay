#!/usr/bin/env node
import { Command } from 'commander';
import { GUARDRAILS_VERSION } from './version.js';
import { GuardrailsConfigV1Schema, RunModeSchema, ExecutionTierSchema } from './schemas.js';
import { checkGuardrailsRun, startGuardrailsRun } from './runner.js';
import { getRunStatus } from './status.js';

function print(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else console.log(value);
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

await program.parseAsync(process.argv);
