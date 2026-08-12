import { describe, expect, it } from 'vitest';
import * as findings from '../src/findings.js';

const digest = '0'.repeat(64);
const input = {
  providerId: 'reviewer', ruleId: 'missing-auth', category: 'security',
  scope: { kind: 'symbol' as const, identity: 'src/auth.ts#login' },
  severity: 'error' as const, blocking: true, summary: 'Authentication check is missing.',
  requirementIds: ['spec:demo#requirement:auth'], taskIds: ['1.1'], evidence: [],
  occurredAt: '2026-08-09T12:00:00.000Z', sourceRevision: digest,
};

describe('stable finding lifecycle', () => {
  it('uses provider, rule, and logical scope—not summary wording—for stable identities', () => {
    const api = findings as Record<string, unknown>;
    const createId = api.createFindingId as (input: Record<string, unknown>) => string;
    expect(createId(input)).toBe(createId({ ...input, summary: 'Different text after a rerun.' }));
    expect(createId(input)).not.toBe(createId({ ...input, scope: { kind: 'symbol', identity: 'src/auth.ts#logout' } }));
  });

  it('allows repair evidence without treating it as independent verification', () => {
    const api = findings as Record<string, unknown>;
    const discover = api.discoverFinding as (input: Record<string, unknown>) => { state: string; findingId: string };
    const transition = api.transitionFinding as (input: Record<string, unknown>) => { state: string; transitions: unknown[] };
    const discovered = discover(input);
    const repaired = transition({ finding: discovered, to: 'repaired', actor: { kind: 'executor', id: 'executor-1' },
      reason: 'Added the missing authorization check.', evidence: [{ referenceId: 'evidence:repair', kind: 'generated', externalId: 'repair', available: true }], sourceRevision: digest,
      occurredAt: '2026-08-09T12:01:00.000Z' });
    expect(repaired.state).toBe('repaired');
    expect(() => transition({ finding: repaired, to: 'independently_verified', actor: { kind: 'executor', id: 'executor-1' },
      reason: 'Looks fixed', evidence: [], sourceRevision: digest, occurredAt: '2026-08-09T12:02:00.000Z' })).toThrow(/verifier/i);
    expect(transition({ finding: repaired, to: 'independently_verified', actor: { kind: 'verifier', id: 'verifier-1' },
      reason: 'Reproduced the original concern and observed the correction.', evidence: [{ referenceId: 'evidence:verify', kind: 'generated', externalId: 'verify', available: true }], sourceRevision: digest,
      occurredAt: '2026-08-09T12:02:00.000Z' }).state).toBe('independently_verified');
  });

  it('requires explicit human acceptance and keeps omitted reports unresolved', () => {
    const api = findings as Record<string, unknown>;
    const discover = api.discoverFinding as (input: Record<string, unknown>) => unknown;
    const transition = api.transitionFinding as (input: Record<string, unknown>) => { state: string };
    const reconcile = api.reconcileFindings as (input: Record<string, unknown>) => Array<{ state: string }>;
    const finding = discover(input);
    expect(() => transition({ finding, to: 'accepted_risk', actor: { kind: 'automation' }, reason: 'ignore it',
      evidence: [], sourceRevision: digest, occurredAt: '2026-08-09T12:02:00.000Z' })).toThrow(/human/i);
    const accepted = transition({ finding, to: 'accepted_risk', actor: { kind: 'human', id: 'maintainer' },
      reason: 'Accepted only for the current compatibility window.', evidence: [], sourceRevision: digest,
      occurredAt: '2026-08-09T12:02:00.000Z', followUp: 'Revisit before the next minor release.' });
    expect(accepted.state).toBe('accepted_risk');
    expect(reconcile({ existing: [discover(input)], reports: [] })).toEqual([
      expect.objectContaining({ state: 'open' }),
    ]);
  });

  it('marks repair and verification stale after relevant changes and reports archive blockers', () => {
    const api = findings as Record<string, unknown>;
    const discover = api.discoverFinding as (input: Record<string, unknown>) => unknown;
    const transition = api.transitionFinding as (input: Record<string, unknown>) => unknown;
    const markStale = api.markFindingsStale as (input: Record<string, unknown>) => Array<{ state: string }>;
    const obligation = api.evaluateFindingObligations as (input: Record<string, unknown>) => { blocking: string[] };
    const repaired = transition({ finding: discover(input), to: 'repaired', actor: { kind: 'executor', id: 'executor-1' },
      reason: 'Repaired', evidence: [{ referenceId: 'evidence:repair', kind: 'generated', externalId: 'repair', available: true }], sourceRevision: digest,
      occurredAt: '2026-08-09T12:01:00.000Z' });
    const stale = markStale({ findings: [repaired], changedScopes: ['src/auth.ts#login'], sourceRevision: '1'.repeat(64),
      occurredAt: '2026-08-09T12:02:00.000Z' });
    expect(stale).toEqual([expect.objectContaining({ state: 'stale' })]);
    expect(obligation({ findings: stale })).toEqual({ blocking: [stale[0].findingId], warnings: [] });
  });
});
