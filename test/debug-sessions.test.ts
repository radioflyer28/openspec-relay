import { describe, expect, it } from 'vitest';
import * as debug from '../src/debug-sessions.js';

const digest = '0'.repeat(64);
const evidence = [{ referenceId: 'evidence:failure', kind: 'generated' as const, externalId: 'failure', available: true }];

describe('persistent scientific debugging', () => {
  it('starts one active session per logical failure and resumes it after interruption', () => {
    const api = debug as Record<string, unknown>;
    const start = api.startDebugSession as (input: Record<string, unknown>) => { sessionId: string; status: string; hypotheses: unknown[] };
    const first = start({ logicalFailureId: 'finding:auth', findingId: 'finding:auth', references: ['1.1', 'spec:demo#requirement:auth'],
      failedEvidence: evidence, now: '2026-08-09T12:00:00.000Z', existing: [] });
    const resumed = start({ logicalFailureId: 'finding:auth', references: ['1.1'], failedEvidence: evidence,
      now: '2026-08-09T12:01:00.000Z', existing: [first] });
    expect(first).toMatchObject({ status: 'active', hypotheses: [] });
    expect(resumed.sessionId).toBe(first.sessionId);
  });

  it('records hypotheses and rejects materially repeated unsuccessful experiments', () => {
    const api = debug as Record<string, unknown>;
    const start = api.startDebugSession as (input: Record<string, unknown>) => unknown;
    const addHypothesis = api.recordDebugHypothesis as (input: Record<string, unknown>) => unknown;
    const plan = api.planDebugExperiment as (input: Record<string, unknown>) => { experiments: Array<{ experimentId: string }> };
    const observe = api.observeDebugExperiment as (input: Record<string, unknown>) => unknown;
    const session = start({ logicalFailureId: 'finding:auth', references: ['1.1'], failedEvidence: evidence,
      now: '2026-08-09T12:00:00.000Z', existing: [] });
    const hypothesized = addHypothesis({ session, statement: 'Token parsing drops the authorization scope.',
      now: '2026-08-09T12:01:00.000Z' });
    const planned = plan({ session: hypothesized, hypothesisId: (hypothesized as { hypotheses: Array<{ hypothesisId: string }> }).hypotheses[0].hypothesisId,
      action: 'Run the focused token parser test.', targetedEvidence: evidence, sourceRevision: digest,
      now: '2026-08-09T12:02:00.000Z' });
    const failed = observe({ session: planned, experimentId: planned.experiments[0].experimentId, result: 'failed',
      observation: 'The parser accepts the token; the hypothesis is rejected.', now: '2026-08-09T12:03:00.000Z' });
    expect(() => plan({ session: failed, hypothesisId: (hypothesized as { hypotheses: Array<{ hypothesisId: string }> }).hypotheses[0].hypothesisId,
      action: 'Run the focused token parser test.', targetedEvidence: evidence, sourceRevision: digest,
      now: '2026-08-09T12:04:00.000Z' })).toThrow(/repeated unsuccessful/i);
  });

  it('creates sessions on repair exhaustion and requires regression proof before resolution', () => {
    const api = debug as Record<string, unknown>;
    const exhausted = api.debugSessionForRepairExhaustion as (input: Record<string, unknown>) => { status: string };
    const resolve = api.resolveDebugSession as (input: Record<string, unknown>) => { status: string };
    const session = exhausted({ logicalFailureId: 'check:security', references: ['1.1'], failedEvidence: evidence,
      repairAttempts: [{ result: 'fail' }, { result: 'fail' }], limit: 2, now: '2026-08-09T12:00:00.000Z', existing: [] });
    expect(session.status).toBe('active');
    expect(() => resolve({ session, regressionEvidence: [], now: '2026-08-09T12:05:00.000Z' }))
      .toThrow(/regression/i);
    expect(resolve({ session, regressionEvidence: [{ referenceId: 'evidence:red-green', kind: 'generated', externalId: 'red-green', available: true }],
      now: '2026-08-09T12:05:00.000Z' })).toMatchObject({ status: 'resolved' });
  });

  it('keeps debug analysis read-only and routes mutations through executor and Git opt-in contracts', () => {
    const contract = (debug as Record<string, unknown>).createDebugMutationContract as
      (input: Record<string, unknown>) => { readOnly: boolean; mayMutateWorkspace: boolean; requiresGitOptIn: boolean };
    expect(contract({ role: 'reviewer' })).toEqual({ readOnly: true, mayMutateWorkspace: false, requiresGitOptIn: false, role: 'reviewer' });
    expect(contract({ role: 'executor' })).toEqual({ readOnly: false, mayMutateWorkspace: true, requiresGitOptIn: true, role: 'executor' });
  });
});
