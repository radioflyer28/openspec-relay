import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { registerRequiredGate, type HostCapabilitiesV1 } from '@fission-ai/openspec/extensions';
import { compileOpenSpecChange } from './artifacts.js';
import { loadGuardrailsConfigV2 } from './config.js';
import {
  createGuardrailsEventV2,
  appendGuardrailsEventV2,
  readEventStoreV2,
  readOrMigrateEventStoreV2,
  replayGuardrailsEventsV2,
  eventStorePath,
  writeReplayedProjectionsV2,
} from './events.js';
import { selectAssurancePipeline } from './modes.js';
import { evaluateAssuranceV2 } from './assurance-v2.js';
import { compileRepositoryContext } from './repository-context.js';
import { evaluatePlanReadiness } from './readiness.js';
import { detectReleaseApplicability, executeReleaseCandidates } from './release-assurance.js';
import {
  AssuranceCheckV2Schema,
  GuardrailsConfigV1Schema,
  GuardrailsEventStoreV2Schema,
  type GuardrailsAssuranceV2,
  type GuardrailsConfigV2,
  type GuardrailsRunV2,
} from './schemas.js';
import { atomicWriteJson, resolveChangeDirectory, runStatePath } from './state.js';
import { negotiateExecutionTier } from './tiers.js';
import { GUARDRAILS_VERSION } from './version.js';
import { DEFAULT_HOST_CAPABILITIES } from './runner.js';

function legacyConfig(config: GuardrailsConfigV2) {
  const legacy = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'features'));
  return GuardrailsConfigV1Schema.parse({ ...legacy, version: 1 });
}

function initialChecks(options: {
  mode: GuardrailsConfigV2['mode'];
  repositoryStatus: 'pass' | 'error';
  readinessStatus: 'pass' | 'fail' | 'human_needed' | 'error' | 'stale';
  readinessRequired: boolean;
  releaseApplicable: boolean;
}) {
  const base = selectAssurancePipeline(options.mode).map((kind) => ({
    checkId: kind,
    kind,
    status: kind === 'artifact-validation' ? 'pass' as const : 'pending' as const,
    summary: kind === 'artifact-validation' ? 'Required OpenSpec artifacts were compiled.' : `${kind} has not been evaluated.`,
    evidenceIds: [],
    readOnly: kind === 'code-review' || kind === 'goal-verification',
    independent: kind === 'code-review' || kind === 'goal-verification',
    remediation: [],
  }));
  const readinessStatus = options.readinessStatus === 'pass'
    ? 'pass' as const
    : options.readinessRequired ? options.readinessStatus === 'stale' ? 'fail' as const : options.readinessStatus
      : 'warn' as const;
  return [
    ...base,
    {
      checkId: 'repository-context', kind: 'repository-context' as const,
      status: options.repositoryStatus,
      summary: options.repositoryStatus === 'pass' ? 'Repository context is current.' : 'Repository context is unavailable.',
      evidenceIds: [], readOnly: true, independent: true,
      remediation: options.repositoryStatus === 'pass' ? [] : ['Refresh repository context before execution.'],
    },
    {
      checkId: 'plan-readiness', kind: 'plan-readiness' as const,
      status: readinessStatus,
      summary: options.readinessStatus === 'pass' ? 'Independent plan readiness passed.'
        : 'Independent plan readiness reported unresolved issues.',
      evidenceIds: [], readOnly: true, independent: true,
      remediation: options.readinessStatus === 'pass' ? [] : ['Resolve readiness issues in the controlling OpenSpec artifacts.'],
    },
    {
      checkId: 'release-assurance', kind: 'release-assurance' as const,
      status: options.releaseApplicable ? 'pending' as const : 'skipped' as const,
      summary: options.releaseApplicable ? 'Applicable release assurance is pending.' : 'No release surface is applicable.',
      evidenceIds: [], readOnly: true, independent: true,
      remediation: [],
    },
  ].map((check) => AssuranceCheckV2Schema.parse(check));
}

export interface StartRunResultV2 {
  run: GuardrailsRunV2;
  assurance: GuardrailsAssuranceV2;
  blockedBeforeExecution: boolean;
}

export async function startGuardrailsRunV2(options: {
  change: string;
  projectRoot?: string;
  config?: Partial<GuardrailsConfigV2>;
  hostCapabilities?: HostCapabilitiesV1;
  changedFiles?: string[];
  now?: string;
}): Promise<StartRunResultV2> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  if (resolved.archived) throw new Error(`Cannot start a new run for archived change '${resolved.changeName}'.`);
  // A run is an auditable history, not a reset button. Preserve an active v1
  // run by migrating it before any v2 command can append a new event, and make
  // repeated `run` invocations deterministic projections of the same history.
  if (await fs.access(runStatePath(resolved.changeDir)).then(() => true).catch(() => false)) {
    const store = await readOrMigrateEventStoreV2(resolved.changeDir);
    const compiled = await compileOpenSpecChange({
      changeDir: resolved.changeDir,
      taskMetadata: store.seed.config.taskOverrides,
    });
    const projection = await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store, compiled });
    await registerRequiredGate(resolved.changeDir, {
      extensionId: 'guardrails', extensionVersion: GUARDRAILS_VERSION,
      gateId: 'guardrails.assurance', workflowId: 'run',
    });
    return {
      ...projection,
      blockedBeforeExecution: projection.run.status === 'blocked' ||
        (store.seed.config.features.readiness.rollout === 'required' && projection.assurance.readiness?.status !== 'pass'),
    };
  }
  const config = await loadGuardrailsConfigV2({
    projectRoot: resolved.projectRoot, changeDir: resolved.changeDir, overrides: options.config,
  });
  const compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: config.taskOverrides });
  const tier = negotiateExecutionTier(options.hostCapabilities ?? DEFAULT_HOST_CAPABILITIES, legacyConfig(config)).tier;
  const now = options.now ?? new Date().toISOString();
  const context = await compileRepositoryContext({
    projectRoot: resolved.projectRoot,
    changeDir: resolved.changeDir,
    changeName: resolved.changeName,
    compiled,
    changedFiles: options.changedFiles,
    boundaries: config.features.repositoryContext.boundaries,
    tier,
    now,
  });
  const readiness = evaluatePlanReadiness({
    changeName: resolved.changeName,
    compiled,
    repositoryContext: context,
    tier,
    now,
  });
  const releaseCandidates = await detectReleaseApplicability({
    projectRoot: resolved.projectRoot,
    changedFiles: options.changedFiles,
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
    createGuardrailsEventV2({
      eventId: `context:${context.contextId}`, runId, changeName: resolved.changeName, occurredAt: now,
      sourceDigests, actor: { kind: 'analyzer', id: 'repository-context' },
      provenance: { origin: 'guardrails-v2-run', adapter: tier }, payload: { type: 'context.compiled', context },
    }),
    createGuardrailsEventV2({
      eventId: `readiness:${readiness.resultId}`, runId, changeName: resolved.changeName, occurredAt: now,
      sourceDigests, actor: { kind: 'analyzer', id: 'plan-readiness' },
      provenance: { origin: 'guardrails-v2-run', adapter: tier }, payload: { type: 'readiness.evaluated', result: readiness },
    }),
    ...releaseCandidates.map((candidate) => createGuardrailsEventV2({
      eventId: `release:${candidate.candidateId}`, runId, changeName: resolved.changeName, occurredAt: now,
      sourceDigests, actor: { kind: 'release_driver', id: 'applicability' },
      provenance: { origin: 'guardrails-v2-run', adapter: tier }, payload: { type: 'release.evaluated', candidate },
    })),
  ].sort((left, right) => left.eventId.localeCompare(right.eventId));
  const store = GuardrailsEventStoreV2Schema.parse({
    version: 2,
    owner: 'openspec-guardrails',
    runId,
    changeName: resolved.changeName,
    createdAt: now,
    seed: {
      changeRef: resolved.changeRef,
      mode: config.mode,
      tier,
      status: blockedBeforeExecution ? 'blocked' : 'running',
      startedAt: now,
      gateIds: ['guardrails.assurance'],
      config,
      checks,
      scenarioCoverage: [],
    },
    events,
  });
  await atomicWriteJson(eventStorePath(resolved.changeDir), store);
  const projection = await writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store, compiled });
  await registerRequiredGate(resolved.changeDir, {
    extensionId: 'guardrails', extensionVersion: GUARDRAILS_VERSION,
    gateId: 'guardrails.assurance', workflowId: 'run',
  });
  return { ...projection, blockedBeforeExecution };
}

export async function currentRunV2(changeDir: string): Promise<ReturnType<typeof readEventStoreV2>> {
  return readEventStoreV2(changeDir);
}

export async function checkGuardrailsRunV2(options: {
  change: string;
  projectRoot?: string;
  changedFiles?: string[];
  now?: string;
}): Promise<{ run: GuardrailsRunV2; assurance: GuardrailsAssuranceV2 }> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const store = await readOrMigrateEventStoreV2(resolved.changeDir);
  const config = store.seed.config;
  const compiled = await compileOpenSpecChange({ changeDir: resolved.changeDir, taskMetadata: config.taskOverrides });
  const current = replayGuardrailsEventsV2({ store, compiled });
  const now = options.now ?? new Date().toISOString();
  const context = await compileRepositoryContext({
    projectRoot: resolved.projectRoot, changeDir: resolved.changeDir, changeName: resolved.changeName,
    compiled, changedFiles: options.changedFiles, boundaries: config.features.repositoryContext.boundaries,
    tier: store.seed.tier, now,
  });
  const readiness = evaluatePlanReadiness({
    changeName: resolved.changeName, compiled, repositoryContext: context, tier: store.seed.tier, now,
  });
  const sourceDigests = Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
  const releaseCandidates = await executeReleaseCandidates({
    packageRoot: resolved.projectRoot,
    candidates: current.assurance.releaseCandidates,
    mode: store.seed.mode,
    config: store.seed.config.features.releaseAssurance,
  });
  if (current.assurance.repositoryContext && current.assurance.repositoryContext.contextId !== context.contextId) {
    await appendGuardrailsEventV2({
      changeDir: resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `context-stale:${current.assurance.repositoryContext.contextId}:${context.inputRevision.slice(0, 12)}`,
        runId: store.runId, changeName: store.changeName, occurredAt: now, sourceDigests,
        actor: { kind: 'automation' }, provenance: { origin: 'guardrails-v2-check' },
        payload: { type: 'context.stale', contextId: current.assurance.repositoryContext.contextId,
          referenceIds: current.assurance.repositoryContext.claims.flatMap((claim) => claim.evidence.map((item) => item.referenceId)) },
      }),
    });
  }
  if (current.assurance.readiness && current.assurance.readiness.inputRevision !== readiness.inputRevision) {
    await appendGuardrailsEventV2({
      changeDir: resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `readiness-stale:${current.assurance.readiness.resultId}:${readiness.inputRevision.slice(0, 12)}`,
        runId: store.runId, changeName: store.changeName, occurredAt: now, sourceDigests,
        actor: { kind: 'automation' }, provenance: { origin: 'guardrails-v2-check' },
        payload: { type: 'readiness.stale', resultId: current.assurance.readiness.resultId, inputRevision: readiness.inputRevision },
      }),
    });
  }
  const refreshedStore = await readEventStoreV2(resolved.changeDir);
  await appendGuardrailsEventV2({
    changeDir: resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `context:${context.contextId}:${now}`, runId: refreshedStore.runId, changeName: refreshedStore.changeName,
      occurredAt: now, sourceDigests, actor: { kind: 'analyzer', id: 'repository-context' },
      provenance: { origin: 'guardrails-v2-check', adapter: refreshedStore.seed.tier },
      payload: { type: 'context.compiled', context },
    }),
  });
  const latestStore = await readEventStoreV2(resolved.changeDir);
  await appendGuardrailsEventV2({
    changeDir: resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `readiness:${readiness.resultId}:${now}`, runId: latestStore.runId, changeName: latestStore.changeName,
      occurredAt: now, sourceDigests, actor: { kind: 'analyzer', id: 'plan-readiness' },
      provenance: { origin: 'guardrails-v2-check', adapter: latestStore.seed.tier },
      payload: { type: 'readiness.evaluated', result: readiness },
    }),
  });
  let releaseStore = await readEventStoreV2(resolved.changeDir);
  for (const candidate of releaseCandidates) {
    await appendGuardrailsEventV2({
      changeDir: resolved.changeDir,
      event: createGuardrailsEventV2({
        eventId: `release:${candidate.candidateId}:${now}`,
        runId: releaseStore.runId,
        changeName: releaseStore.changeName,
        occurredAt: now,
        sourceDigests,
        actor: { kind: 'release_driver', id: 'local-private' },
        provenance: { origin: 'guardrails-v2-check', adapter: releaseStore.seed.tier },
        payload: { type: 'release.evaluated', candidate },
      }),
    });
    releaseStore = await readEventStoreV2(resolved.changeDir);
  }
  const beforeEvaluation = replayGuardrailsEventsV2({ store: releaseStore, compiled });
  const evaluated = evaluateAssuranceV2(beforeEvaluation.run, beforeEvaluation.assurance);
  await appendGuardrailsEventV2({
    changeDir: resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `checks:${beforeEvaluation.run.stateRevision.slice(0, 16)}:${now}`,
      runId: releaseStore.runId,
      changeName: releaseStore.changeName,
      occurredAt: now,
      sourceDigests,
      actor: { kind: 'automation' },
      provenance: { origin: 'guardrails-v2-check', adapter: releaseStore.seed.tier },
      payload: { type: 'checks.evaluated', checks: evaluated.checks },
    }),
  });
  releaseStore = await readEventStoreV2(resolved.changeDir);
  await appendGuardrailsEventV2({
    changeDir: resolved.changeDir,
    event: createGuardrailsEventV2({
      eventId: `run-status:${beforeEvaluation.run.stateRevision.slice(0, 16)}:${now}`,
      runId: releaseStore.runId,
      changeName: releaseStore.changeName,
      occurredAt: now,
      sourceDigests,
      actor: { kind: 'automation' },
      provenance: { origin: 'guardrails-v2-check', adapter: releaseStore.seed.tier },
      payload: { type: 'run.status_updated', status: ['pass', 'warn'].includes(evaluated.status) ? 'complete' : 'blocked' },
    }),
  });
  releaseStore = await readEventStoreV2(resolved.changeDir);
  return writeReplayedProjectionsV2({ changeDir: resolved.changeDir, store: releaseStore, compiled });
}
