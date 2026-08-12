import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as runner from '../src/runner-v2.js';
import * as status from '../src/status.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { evaluateAssuranceV2 } from '../src/assurance-v2.js';
import { executeWithTier } from '../src/execution-adapters.js';
import { appendGuardrailsEventV2, createGuardrailsEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import { discoverFinding } from '../src/findings.js';
import { transitionFindingV2 } from '../src/v2-operations.js';
import { presentUatV2 } from '../src/v2-operations.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;
const readinessTask = {
  requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'],
};

const higherTierHost = {
  agentDispatch: true, parallelism: true, worktrees: true, git: true,
  structuredResults: true, humanInteraction: false,
};

const evidence = [{ referenceId: 'test:tier-contract', kind: 'generated' as const, externalId: 'tier-contract', available: true }];

describe('Guardrails v2 run pipeline', () => {
  it('records context and independent readiness before offering execution work', async () => {
    const { root } = await createOpenSpecProject();
    const start = (runner as Record<string, unknown>).startGuardrailsRunV2 as (input: Record<string, unknown>) => Promise<{
      run: { version: number }; assurance: { readiness?: { status: string }; repositoryContext?: { status: string } }; blockedBeforeExecution: boolean;
    }>;
    const result = await start({ change: 'demo', projectRoot: root, config: {
      taskOverrides: { '1.1': readinessTask, '1.2': readinessTask },
      features: { readiness: { rollout: 'required' } },
    } });
    expect(result).toMatchObject({ run: { version: 2 }, assurance: { readiness: { status: 'pass' }, repositoryContext: { status: 'current' } },
      blockedBeforeExecution: false });
    const runStatus = await (status as Record<string, unknown>).getRunStatusV2({ change: 'demo', projectRoot: root }) as {
      repositoryContext: { status: string }; readiness: { status: string }; nextActions: string[];
    };
    expect(runStatus).toMatchObject({ repositoryContext: { status: 'current' }, readiness: { status: 'pass' } });
    expect(runStatus.nextActions).toEqual(expect.any(Array));
  }, 30_000);

  it('stops required-rollout unready changes before task writes but supports report-only migration', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const start = (runner as Record<string, unknown>).startGuardrailsRunV2 as (input: Record<string, unknown>) => Promise<{
      assurance: { readiness?: { status: string } }; blockedBeforeExecution: boolean;
    }>;
    const required = await start({ change: 'demo', projectRoot: root, config: { features: { readiness: { rollout: 'required' } } } });
    expect(required).toMatchObject({ assurance: { readiness: { status: 'fail' } }, blockedBeforeExecution: true });
    expect(await fs.readFile(`${changeDir}/tasks.md`, 'utf8')).toContain('- [ ] 1.1');

    const { root: reportRoot } = await createOpenSpecProject('report-only');
    const reportOnly = await start({ change: 'report-only', projectRoot: reportRoot, config: {
      features: { readiness: { rollout: 'report_only' } },
    } });
    expect(reportOnly).toMatchObject({ assurance: { readiness: { status: 'fail' } }, blockedBeforeExecution: false });
  }, 30_000);

  it('recomputes required readiness before resuming an existing run', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const first = await runner.startGuardrailsRunV2({
      change: 'demo', projectRoot: root,
      config: { taskOverrides: { '1.1': readinessTask, '1.2': readinessTask } },
      now: '2026-08-12T12:00:00.000Z',
    });
    expect(first).toMatchObject({ assurance: { readiness: { status: 'pass' } }, blockedBeforeExecution: false });
    await fs.appendFile(`${changeDir}/specs/demo/spec.md`, [
      '', '### Requirement: Newly declared behavior', 'The system SHALL expose new behavior.', '',
      '#### Scenario: New behavior works', '- **WHEN** invoked', '- **THEN** the new behavior works', '',
    ].join('\n'));
    const resumed = await runner.startGuardrailsRunV2({
      change: 'demo', projectRoot: root, now: '2026-08-12T12:01:00.000Z',
    });
    expect(resumed).toMatchObject({ assurance: { readiness: { status: 'fail' } }, blockedBeforeExecution: true });
    expect(resumed.assurance.readiness?.resultId).not.toBe(first.assurance.readiness?.resultId);
  });

  it('persists current OpenSpec scenarios for required UAT instead of producing an empty queue', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await runner.startGuardrailsRunV2({
      change: 'demo', projectRoot: root,
      config: {
        taskOverrides: { '1.1': readinessTask, '1.2': readinessTask },
        features: { uat: { enabled: true, required: true } },
      },
    });
    const presented = await presentUatV2({ change: 'demo', projectRoot: root });
    expect(presented.next).toMatchObject({ scenarioId });
    const store = await readEventStoreV2(changeDir);
    const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: store.seed.config.taskOverrides });
    const projection = await writeReplayedProjectionsV2({ changeDir, store, compiled });
    expect(projection.assurance.scenarioCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({ scenarioId, status: 'human_needed' }),
    ]));
  });

  it('passes negotiated repository and readiness analyzers through the runner', async () => {
    const { root } = await createOpenSpecProject();
    let repositoryCalls = 0;
    let readinessCalls = 0;
    const result = await runner.startGuardrailsRunV2({
      change: 'demo', projectRoot: root, hostCapabilities: higherTierHost,
      adapters: {
        dispatcher: true,
        repositoryAnalyzer: { analyze: async ({ deterministicContext }) => {
          repositoryCalls += 1;
          return deterministicContext;
        } },
        readinessEvaluator: { evaluate: async ({ deterministicResult }) => {
          readinessCalls += 1;
          return deterministicResult;
        } },
      },
      config: {
        requestedTier: 'tier1', allowAgentDispatch: true,
        taskOverrides: { '1.1': readinessTask, '1.2': readinessTask },
      },
    });
    expect(result.run.tier).toBe('tier1');
    expect({ repositoryCalls, readinessCalls }).toEqual({ repositoryCalls: 1, readinessCalls: 1 });
  });

  it('keeps v2 readiness, finding authorization, evidence requirements, and assurance outcomes stable across Tier 1 and Tier 2 adapters', async () => {
    const outcomes: Array<{ tier: string; assurance: string; finding: string; isolated: boolean; usedWorktrees: boolean }> = [];
    for (const tier of ['tier1', 'tier2'] as const) {
      const { root, changeDir } = await createOpenSpecProject(tier);
      const start = (runner as Record<string, unknown>).startGuardrailsRunV2 as (input: Record<string, unknown>) => Promise<{
        run: { tier: string; stateRevision: string }; assurance: { readiness?: { status: string } };
      }>;
      const result = await start({
        change: tier,
        projectRoot: root,
        hostCapabilities: higherTierHost,
        adapters: tier === 'tier1' ? { dispatcher: true } : { dispatcher: true, worktrees: true },
        config: {
          requestedTier: tier,
          allowAgentDispatch: true,
          allowParallel: tier === 'tier2',
          git: { worktrees: tier === 'tier2' },
          taskOverrides: { '1.1': readinessTask, '1.2': readinessTask },
          features: { readiness: { rollout: 'required' } },
        },
      });
      expect(result).toMatchObject({ run: { tier }, assurance: { readiness: { status: 'pass' } } });

      const store = await readEventStoreV2(changeDir);
      const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: store.seed.config.taskOverrides });
      const finding = discoverFinding({
        providerId: 'review', ruleId: 'tier-contract', category: 'review',
        scope: { kind: 'requirement', identity: requirementId }, severity: 'error', blocking: true,
        summary: 'The reviewer found a concrete defect.', requirementIds: [requirementId], taskIds: ['1.1'],
        evidence, occurredAt: '2026-08-11T20:30:00.000Z', sourceRevision: result.run.stateRevision,
        actor: { kind: 'reviewer', id: 'reviewer-1' },
      });
      await appendGuardrailsEventV2({
        changeDir,
        event: createGuardrailsEventV2({
          eventId: `review:${tier}`, runId: store.runId, changeName: store.changeName,
          occurredAt: '2026-08-11T20:30:00.000Z',
          sourceDigests: Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest])),
          actor: { kind: 'reviewer', id: 'reviewer-1' }, provenance: { origin: 'tier-contract-test', adapter: tier },
          payload: { type: 'finding.discovered', finding },
        }),
      });
      await writeReplayedProjectionsV2({ changeDir, store: await readEventStoreV2(changeDir), compiled });
      await expect(transitionFindingV2({
        change: tier, projectRoot: root, findingId: finding.findingId, to: 'repaired',
        actor: { kind: 'executor', id: 'executor-1' }, reason: 'Missing evidence must fail.', evidence: [],
      })).rejects.toThrow(/require linked implementation/i);
      await transitionFindingV2({
        change: tier, projectRoot: root, findingId: finding.findingId, to: 'repaired',
        actor: { kind: 'executor', id: 'executor-1' }, reason: 'Repair evidence is recorded.', evidence,
      });
      await expect(transitionFindingV2({
        change: tier, projectRoot: root, findingId: finding.findingId, to: 'independently_verified',
        actor: { kind: 'executor', id: 'executor-1' }, reason: 'Executor self-report must not close the finding.', evidence,
      })).rejects.toThrow(/read-only verifier/i);
      const verified = await transitionFindingV2({
        change: tier, projectRoot: root, findingId: finding.findingId, to: 'independently_verified',
        actor: { kind: 'verifier', id: 'verifier-1' }, reason: 'Independent verification confirmed the repair.', evidence,
      });

      const requests: Array<{ isolated: boolean; workspace?: string }> = [];
      let usedWorktrees = false;
      await executeWithTier({
        tier,
        graph: { nodes: [
          { taskId: '1', dependencies: [], writeSet: ['src/one.ts'], risk: 'low', expectedVerification: [], requirementRefs: [], scenarioRefs: [], status: 'pending' },
          { taskId: '2', dependencies: [], writeSet: ['src/two.ts'], risk: 'low', expectedVerification: [], requirementRefs: [], scenarioRefs: [], status: 'pending' },
        ], waves: [['1', '2']] },
        dispatcher: { dispatch: async (request) => {
          requests.push({ isolated: request.isolated, workspace: request.workspace });
          return { status: 'pass', summary: 'complete', evidenceRefs: [] };
        } },
        ...(tier === 'tier2' ? { worktrees: {
          create: async (taskId: string) => { usedWorktrees = true; return `/worktree/${taskId}`; },
          merge: async () => undefined,
          cleanup: async () => undefined,
        } } : {}),
      });
      const projection = await writeReplayedProjectionsV2({
        changeDir, store: await readEventStoreV2(changeDir), compiled,
      });
      outcomes.push({
        tier,
        assurance: evaluateAssuranceV2(projection.run, projection.assurance).status,
        finding: verified.state,
        isolated: requests.every((request) => request.isolated),
        usedWorktrees,
      });
    }
    expect(outcomes).toEqual([
      { tier: 'tier1', assurance: 'fail', finding: 'independently_verified', isolated: true, usedWorktrees: false },
      { tier: 'tier2', assurance: 'fail', finding: 'independently_verified', isolated: true, usedWorktrees: true },
    ]);
  }, 30_000);
});
