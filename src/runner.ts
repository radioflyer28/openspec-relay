import { randomUUID } from 'node:crypto';
import { registerRequiredGate, type HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import { compileOpenSpecChange } from './artifacts.js';
import { createInitialAssurance, evaluateAssuranceState } from './assurance.js';
import { routeSpecialistCheckers } from './checkers.js';
import { loadGuardrailsConfig } from './config.js';
import { selectAssurancePipeline } from './modes.js';
import {
  type GuardrailsAssuranceV1,
  type GuardrailsConfigV1,
  type GuardrailsRunV1,
} from './schemas.js';
import {
  readAssuranceState,
  readRunState,
  resolveChangeDirectory,
  writeAssuranceState,
} from './state.js';
import { classifyTddRequirement, resolveTddPolicy } from './tdd.js';
import { negotiateExecutionTier, type TierDecisionV1 } from './tiers.js';

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
  const compiled = await compileOpenSpecChange({
    changeDir: resolved.changeDir,
    taskMetadata: config.taskOverrides,
  });
  const tasks = compiled.graph.nodes.map((task) => {
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
    extensionVersion: '0.1.0',
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
  const run = await readRunState(resolved.changeDir);
  const assurance = evaluateAssuranceState(run, await readAssuranceState(resolved.changeDir));
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
