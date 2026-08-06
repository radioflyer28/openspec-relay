import { randomUUID } from 'node:crypto';
import { registerRequiredGate, type HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import { compileCurrentOpenSpecChange } from './openspec-adapter.js';
import { createInitialAssurance, evaluateAssuranceState } from './assurance.js';
import { routeSpecialistCheckers } from './checkers.js';
import { loadGuardrailsConfig } from './config.js';
import { selectAssurancePipeline } from './modes.js';
import {
  type GuardrailsAssuranceV1,
  type GuardrailsConfigV1,
  type GuardrailsRunV1,
} from './schemas.js';
import { materializeCompiledTasks, reconcileCurrentOpenSpec } from './reconciliation.js';
import {
  readAssuranceState,
  readRunState,
  resolveChangeDirectory,
  writeAssuranceState,
} from './state.js';
import { negotiateExecutionTier, type TierDecisionV1 } from './tiers.js';
import { GUARDRAILS_VERSION } from './version.js';

export const DEFAULT_HOST_CAPABILITIES: HostCapabilitiesV1 = {
  agentDispatch: false,
  parallelism: false,
  worktrees: false,
  git: false,
  structuredResults: true,
  humanInteraction: false,
};

async function optionalState<T>(reader: () => Promise<T>): Promise<T | undefined> {
  try {
    return await reader();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export interface StartRunResultV1 {
  run: GuardrailsRunV1;
  assurance: GuardrailsAssuranceV1;
  tierDecision: TierDecisionV1;
}

export async function startGuardrailsRun(options: {
  change: string;
  projectRoot?: string;
  config?: Partial<GuardrailsConfigV1>;
  hostCapabilities?: HostCapabilitiesV1;
  changedFiles?: string[];
}): Promise<StartRunResultV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  if (resolved.archived) throw new Error(`Cannot start a new run for archived change '${resolved.changeName}'.`);
  const config = await loadGuardrailsConfig({
    projectRoot: resolved.projectRoot,
    changeDir: resolved.changeDir,
    overrides: options.config,
  });
  const compiled = await compileCurrentOpenSpecChange({
    projectRoot: resolved.projectRoot,
    changeName: resolved.changeName,
    changeDir: resolved.changeDir,
    taskMetadata: config.taskOverrides,
  });
  const tasks = materializeCompiledTasks(compiled, config);
  const specialists = routeSpecialistCheckers({
    changedFiles: options.changedFiles,
    artifactText: compiled.routingText,
    required: config.requiredCheckers,
    disabled: config.disabledCheckers,
  });
  const pipeline = selectAssurancePipeline(config.mode, specialists);
  const tierDecision = negotiateExecutionTier(options.hostCapabilities ?? DEFAULT_HOST_CAPABILITIES, config);
  const previousRun = await optionalState(() => readRunState(resolved.changeDir));
  const previousAssurance = previousRun
    ? await optionalState(() => readAssuranceState(resolved.changeDir))
    : undefined;
  const now = new Date().toISOString();
  const run: GuardrailsRunV1 = {
    version: 1,
    runId: previousRun?.runId ?? randomUUID(),
    changeName: resolved.changeName,
    changeRef: resolved.changeRef,
    mode: config.mode,
    tier: tierDecision.tier,
    status: 'running',
    startedAt: previousRun?.startedAt ?? now,
    updatedAt: now,
    artifacts: compiled.artifacts,
    tasks,
    executionWaves: compiled.graph.waves,
    gateIds: ['guardrails.assurance'],
    deviations: previousRun?.deviations ?? [],
    repairIds: previousRun?.repairIds ?? [],
    config,
  };
  const assurance = createInitialAssurance(run, pipeline, previousAssurance);
  await writeAssuranceState(resolved.changeDir, assurance, run);
  const persistedRun = await readRunState(resolved.changeDir);
  await registerRequiredGate(resolved.changeDir, {
    extensionId: 'guardrails',
    extensionVersion: GUARDRAILS_VERSION,
    gateId: 'guardrails.assurance',
    workflowId: 'run',
  });
  return { run: persistedRun, assurance, tierDecision };
}

export async function checkGuardrailsRun(options: {
  change: string;
  projectRoot?: string;
}): Promise<{ run: GuardrailsRunV1; assurance: GuardrailsAssuranceV1 }> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const reconciled = await reconcileCurrentOpenSpec({
    projectRoot: resolved.projectRoot,
    changeDir: resolved.changeDir,
    changeName: resolved.changeName,
    run: await readRunState(resolved.changeDir),
    assurance: await readAssuranceState(resolved.changeDir),
  });
  const run = reconciled.run;
  const assurance = evaluateAssuranceState(run, reconciled.assurance);
  const nextRun = {
    ...run,
    status: assurance.status === 'pass' || assurance.status === 'warn' ? 'complete' as const : 'blocked' as const,
    updatedAt: new Date().toISOString(),
  };
  await writeAssuranceState(resolved.changeDir, assurance, nextRun);
  return { run: await readRunState(resolved.changeDir), assurance };
}

export async function seedAssuranceState(options: {
  change: string;
  projectRoot?: string;
  update: (assurance: GuardrailsAssuranceV1, run: GuardrailsRunV1) => GuardrailsAssuranceV1;
}): Promise<void> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const run = await readRunState(resolved.changeDir);
  const assurance = options.update(await readAssuranceState(resolved.changeDir), run);
  await writeAssuranceState(resolved.changeDir, assurance, run);
}
