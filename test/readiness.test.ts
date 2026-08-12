import { describe, expect, it } from 'vitest';
import type { CompiledOpenSpecChangeV1 } from '../src/artifacts.js';
import type { RepositoryContextV2 } from '../src/schemas.js';
import * as readiness from '../src/readiness.js';

const digest = '0'.repeat(64);
const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;

function context(): RepositoryContextV2 {
  return {
    contextId: 'context-1', changeName: 'demo', inputRevision: digest,
    compiledAt: '2026-08-09T12:00:00.000Z', status: 'current', claims: [], staleReferenceIds: [],
  };
}

function compiled(overrides: Record<string, unknown> = {}): CompiledOpenSpecChangeV1 {
  const task = {
    taskId: '1.1', idStability: 'explicit', sourcePath: 'tasks.md', sourceDigest: digest, sourceLine: 1,
    dependencies: [], risk: 'medium', expectedVerification: ['targeted-tests'], writeSet: ['src/demo.ts'],
    requirementRefs: [requirementId], scenarioRefs: [scenarioId], status: 'pending', tddRequired: true,
  };
  return {
    artifacts: [{ kind: 'tasks', path: 'tasks.md', sourceDigest: digest, ids: ['1.1'] }],
    graph: { nodes: [task], waves: [['1.1']] },
    requirementIds: [requirementId], scenarioIds: [scenarioId], routingText: 'Implementation behavior.',
    taskAdapter: 'markdown-v1', requirementAdapter: 'markdown-v1',
    ...overrides,
  } as CompiledOpenSpecChangeV1;
}

describe('independent plan readiness', () => {
  it('passes a goal-to-requirement-to-scenario-to-task-to-evidence chain', () => {
    const evaluate = (readiness as Record<string, unknown>).evaluatePlanReadiness as
      (input: Record<string, unknown>) => { status: string; independent: boolean; issues: unknown[] };
    expect(evaluate({ changeName: 'demo', compiled: compiled(), repositoryContext: context(),
      now: '2026-08-09T12:00:00.000Z' })).toMatchObject({ status: 'pass', independent: true, issues: [] });
  });

  it('reports uncovered requirements, unmapped scenarios, and unverifiable work', () => {
    const evaluate = (readiness as Record<string, unknown>).evaluatePlanReadiness as
      (input: Record<string, unknown>) => { status: string; issues: Array<{ kind: string; blocking: boolean }> };
    const incomplete = compiled({ graph: { nodes: [{ ...compiled().graph.nodes[0], requirementRefs: [], scenarioRefs: [], expectedVerification: [] }], waves: [['1.1']] } });
    const result = evaluate({ changeName: 'demo', compiled: incomplete, repositoryContext: context(),
      now: '2026-08-09T12:00:00.000Z' });
    expect(result.status).toBe('fail');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'uncovered_requirement', blocking: true }),
      expect.objectContaining({ kind: 'unmapped_scenario', blocking: true }),
      expect.objectContaining({ kind: 'insufficient_evidence', blocking: true }),
    ]));
  });

  it('detects cycles, overlapping parallel writes, missing prerequisites, and unsupported assumptions', () => {
    const evaluate = (readiness as Record<string, unknown>).evaluatePlanReadiness as
      (input: Record<string, unknown>) => { issues: Array<{ kind: string }> };
    const first = compiled().graph.nodes[0];
    const cycle = compiled({ graph: { nodes: [
      { ...first, taskId: '1.1', dependencies: ['1.2'] },
      { ...first, taskId: '1.2', dependencies: ['1.1'] },
    ], waves: [['1.1', '1.2']] } });
    const result = evaluate({
      changeName: 'demo', compiled: cycle, repositoryContext: context(),
      proposedWaves: [['1.1', '1.2']], assumptions: [{ id: 'assumption-1', summary: 'Remote API is stable', supported: false }],
      now: '2026-08-09T12:00:00.000Z',
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'dependency_cycle' }),
      expect.objectContaining({ kind: 'unsafe_write_overlap' }),
      expect.objectContaining({ kind: 'missing_prerequisite' }),
      expect.objectContaining({ kind: 'risky_assumption' }),
    ]));
  });

  it('requires compatibility work for public contracts and surfaces repository scope gaps', () => {
    const evaluate = (readiness as Record<string, unknown>).evaluatePlanReadiness as
      (input: Record<string, unknown>) => { issues: Array<{ kind: string }> };
    const result = evaluate({
      changeName: 'demo', compiled: compiled({ routingText: 'Change a public API and CLI contract.' }),
      repositoryContext: {
        ...context(),
        claims: [{
          claimId: 'affected', category: 'affected_module', classification: 'observed', summary: 'src/other.ts',
          confidence: 'high', evidence: [{ referenceId: 'repository:src/other.ts', kind: 'repository', path: 'src/other.ts', digest, available: true }], relatedOpenSpecIds: [],
        }],
      }, now: '2026-08-09T12:00:00.000Z',
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'compatibility_obligation' }),
      expect.objectContaining({ kind: 'repository_scope_gap' }),
    ]));
  });

  it('rejects executor self-certification and invalidates results after controlling input changes', () => {
    const api = readiness as Record<string, unknown>;
    const evaluate = api.evaluatePlanReadiness as (input: Record<string, unknown>) => { status: string; inputRevision: string };
    expect(() => evaluate({ changeName: 'demo', compiled: compiled(), repositoryContext: context(), actorKind: 'executor' }))
      .toThrow(/independent/i);
    const result = evaluate({ changeName: 'demo', compiled: compiled(), repositoryContext: context(),
      now: '2026-08-09T12:00:00.000Z' });
    const invalidate = api.invalidateReadinessResult as (input: Record<string, unknown>) => { status: string; inputRevision: string };
    expect(invalidate({ result, inputRevision: '1'.repeat(64) }))
      .toMatchObject({ status: 'stale', inputRevision: '1'.repeat(64) });
  });

  it('uses the same independent result contract for Tier 0 and isolated evaluators', async () => {
    const api = readiness as Record<string, unknown>;
    const evaluate = api.evaluatePlanReadiness as (input: Record<string, unknown>) => { inputRevision: string; independent: boolean };
    const expected = evaluate({ changeName: 'demo', compiled: compiled(), repositoryContext: context(),
      now: '2026-08-09T12:00:00.000Z' });
    const adapted = await (api.evaluatePlanReadinessWithAdapter as (input: Record<string, unknown>) => Promise<{
      inputRevision: string; independent: boolean;
    }>)({
      changeName: 'demo', compiled: compiled(), repositoryContext: context(), tier: 'tier1',
      now: '2026-08-09T12:00:00.000Z',
      adapter: { evaluate: async ({ contract, deterministicResult }: { contract: unknown; deterministicResult: unknown }) => {
        expect(contract).toEqual({ readOnly: true, tier: 'tier1', independent: true });
        return deterministicResult;
      } },
    });
    expect(adapted).toMatchObject({ inputRevision: expected.inputRevision, independent: true });
  });
});
