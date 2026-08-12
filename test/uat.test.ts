import { describe, expect, it } from 'vitest';
import { discoverFinding, evaluateFindingObligations, transitionFinding } from '../src/findings.js';
import * as uat from '../src/uat.js';

const digest = '0'.repeat(64);
const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;
const coverage = [{ requirementId, scenarioId, status: 'human_needed' as const, evidenceIds: [], acceptanceInstructions: 'Open the demo and verify the visible result.' }];

describe('conversational UAT', () => {
  it('projects human scenarios, presents one at a time, and resumes the next unresolved scenario', () => {
    const api = uat as Record<string, unknown>;
    const project = api.projectUatScenarios as (input: Record<string, unknown>) => Array<{ scenarioId: string; status: string }>;
    const next = api.nextUatScenario as (scenarios: unknown[]) => { scenarioId: string } | undefined;
    const record = api.recordUatDisposition as (input: Record<string, unknown>) => { scenario: { status: string } };
    const scenarios = project({ coverage, findings: [], taskIdsByScenario: { [scenarioId]: ['1.1'] }, sourceRevision: digest });
    expect(next(scenarios)).toMatchObject({ scenarioId });
    const passed = record({ scenario: scenarios[0], status: 'passed', actor: 'maintainer', notes: 'Observed expected result.',
      evidence: [], now: '2026-08-09T12:00:00.000Z' });
    expect(passed.scenario.status).toBe('passed');
    expect(next([passed.scenario])).toBeUndefined();
  });

  it('requires an explicit human identity, keeps blocked work unresolved, and turns failures into findings', () => {
    const api = uat as Record<string, unknown>;
    const project = api.projectUatScenarios as (input: Record<string, unknown>) => Array<unknown>;
    const record = api.recordUatDisposition as (input: Record<string, unknown>) => { scenario: { status: string }; finding?: { findingId: string } };
    const obligations = api.evaluateUatObligations as (input: Record<string, unknown>) => { blocking: string[] };
    const [scenario] = project({ coverage, findings: [], sourceRevision: digest });
    expect(() => record({ scenario, status: 'passed', notes: 'Looks good', evidence: [], now: '2026-08-09T12:00:00.000Z' }))
      .toThrow(/human actor/i);
    const blocked = record({ scenario, status: 'blocked', actor: 'maintainer', notes: 'No test account is available.', evidence: [], now: '2026-08-09T12:00:00.000Z' });
    expect(obligations({ scenarios: [blocked.scenario] })).toEqual({ blocking: [scenarioId], acceptedLimitations: [] });
    const failed = record({ scenario, status: 'failed', actor: 'maintainer', notes: 'The action shows an error.', evidence: [], now: '2026-08-09T12:01:00.000Z' });
    expect(failed).toMatchObject({ scenario: { status: 'failed' }, finding: { findingId: expect.any(String) } });
  });

  it('returns independently repaired failures to retest, keeps accepted limitations distinct, and invalidates stale evidence', () => {
    const api = uat as Record<string, unknown>;
    const project = api.projectUatScenarios as (input: Record<string, unknown>) => Array<unknown>;
    const record = api.recordUatDisposition as (input: Record<string, unknown>) => { scenario: unknown; acceptedRisk?: { state: string } };
    const retest = api.returnScenarioToRetest as (input: Record<string, unknown>) => { status: string };
    const invalidate = api.invalidateUatScenarios as (input: Record<string, unknown>) => Array<{ status: string }>;
    const [scenario] = project({ coverage, findings: [], sourceRevision: digest });
    const accepted = record({ scenario, status: 'accepted_limitation', actor: 'maintainer', notes: 'Accepted for this change only.',
      evidence: [], now: '2026-08-09T12:00:00.000Z' });
    expect(accepted).toMatchObject({ scenario: { status: 'accepted_limitation' }, acceptedRisk: { state: 'accepted_risk' } });
    expect(retest({ scenario, independentlyVerified: true })).toMatchObject({ status: 'awaiting_retest' });
    expect(invalidate({ scenarios: [accepted.scenario], sourceRevision: '1'.repeat(64) }))
      .toEqual([expect.objectContaining({ status: 'stale' })]);
  });

  it('treats a passed UAT scenario as the recorded human disposition for its originating human-needed finding', () => {
    const api = uat as Record<string, unknown>;
    const project = api.projectUatScenarios as (input: Record<string, unknown>) => Array<unknown>;
    const record = api.recordUatDisposition as (input: Record<string, unknown>) => { scenario: unknown };
    const discovered = discoverFinding({
      providerId: 'review', ruleId: 'human-observation', category: 'acceptance',
      scope: { kind: 'scenario', identity: scenarioId }, severity: 'error', blocking: true,
      summary: 'A maintainer must observe the behavior.', requirementIds: [requirementId], taskIds: ['1.1'],
      evidence: [], occurredAt: '2026-08-11T20:30:00.000Z', sourceRevision: digest,
      actor: { kind: 'reviewer', id: 'reviewer-1' },
    });
    const humanNeeded = transitionFinding({
      finding: discovered, to: 'human_needed', actor: { kind: 'reviewer', id: 'reviewer-1' },
      reason: 'Automated evidence cannot establish this behavior.', evidence: [], sourceRevision: digest,
      occurredAt: '2026-08-11T20:30:01.000Z',
    });
    const [scenario] = project({ coverage: [], findings: [humanNeeded], sourceRevision: digest });
    const passed = record({
      scenario, status: 'passed', actor: 'maintainer', notes: 'Observed the expected result.', evidence: [],
      now: '2026-08-11T20:30:02.000Z',
    });
    expect(evaluateFindingObligations({ findings: [humanNeeded], scenarios: [passed.scenario] }))
      .toEqual({ blocking: [], warnings: [] });
  });
});
