import { describe, expect, it } from 'vitest';
import {
  createReadOnlyVerificationContract,
  mapScenarioCoverage,
  validateIndependentVerification,
} from '../src/verification.js';
import { evidence } from './helpers.js';

const requirementId = 'spec:demo#requirement:behavior';
const scenarioId = `${requirementId}/scenario:works`;

describe('scenario coverage and independent verification', () => {
  it('maps automated and human-needed coverage by identifiers', () => {
    const covered = evidence({ evidenceId: 'scenario', phase: 'check', checkId: 'targeted-tests',
      result: 'pass', origin: 'automated', reference: scenarioId });
    expect(mapScenarioCoverage({ scenarioIds: [scenarioId], evidence: [covered] })[0])
      .toMatchObject({ status: 'covered', evidenceIds: ['scenario'] });
    expect(mapScenarioCoverage({
      scenarioIds: [scenarioId], evidence: [], humanNeeded: { [scenarioId]: 'Confirm visually.' },
    })[0]).toMatchObject({ status: 'human_needed', acceptanceInstructions: 'Confirm visually.' });
  });

  it('creates a deeply read-only verifier contract', () => {
    const contract = createReadOnlyVerificationContract({
      artifactRefs: ['tasks.md'], requirementIds: [requirementId], evidence: [],
    });
    expect(contract.writeAccess).toBe(false);
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.requirementIds)).toBe(true);
  });

  it('rejects executor self-report as the only goal evidence', () => {
    const executor = evidence({ evidenceId: 'claim', phase: 'verify', checkId: 'goal-verification',
      result: 'pass', origin: 'executor' });
    const finding = {
      findingId: 'finding', requirementId, status: 'pass' as const,
      summary: 'Claimed complete.', evidenceIds: ['claim'], origin: 'verifier' as const,
    };
    expect(validateIndependentVerification({
      requirementIds: [requirementId], findings: [finding], evidence: [executor],
    })).toMatchObject({ valid: false, diagnostics: [expect.stringContaining('self-report')] });
    const observed = { ...executor, origin: 'automated' as const };
    expect(validateIndependentVerification({
      requirementIds: [requirementId], findings: [finding], evidence: [observed],
    }).valid).toBe(true);
  });
});
