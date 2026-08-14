import { describe, expect, it } from 'vitest';
import {
  classifyTddRequirement,
  resolveTddPolicy,
  validateTddEvidence,
} from '../src/tdd.js';
import type { TaskNodeV1 } from '../src/schemas.js';
import { evidence } from './helpers.js';

const executable: TaskNodeV1 = {
  taskId: '1.1',
  dependencies: [],
  risk: 'high',
  expectedVerification: ['targeted-tests'],
  writeSet: ['src/auth.ts'],
  requirementRefs: [],
  scenarioRefs: [],
  status: 'in_progress',
  tddRequired: true,
  implementationStartedAt: '2026-08-04T12:05:00.000Z',
};

describe('risk-aware TDD', () => {
  it('uses task, then change, then project precedence', () => {
    expect(resolveTddPolicy({ project: 'always', change: 'off', task: 'auto' })).toBe('auto');
    expect(resolveTddPolicy({ project: 'always', change: 'off' })).toBe('off');
    expect(resolveTddPolicy({ project: 'always' })).toBe('always');
    expect(resolveTddPolicy({})).toBe('auto');
  });

  it('requires behavior and security work but records non-executable exemptions', () => {
    expect(classifyTddRequirement(executable, 'auto').required).toBe(true);
    const docs = { ...executable, risk: 'low' as const, writeSet: ['docs/guide.md'] };
    expect(classifyTddRequirement(docs, 'always')).toMatchObject({
      required: false,
      exemptionReason: expect.stringContaining('documentation'),
    });
    expect(classifyTddRequirement(executable, 'off').required).toBe(false);
  });

  it('accepts source-bound relevant RED, GREEN, and REFACTOR evidence', () => {
    const result = validateTddEvidence(executable, [
      evidence({ evidenceId: 'red', taskId: '1.1', phase: 'red', checkId: 'auth-test',
        result: 'fail', exitCode: 1, relevantFailure: true, origin: 'automated',
        observedAt: '2026-08-04T12:00:00.000Z', sourceState: 'before' }),
      evidence({ evidenceId: 'green', taskId: '1.1', phase: 'green', checkId: 'auth-test',
        result: 'pass', exitCode: 0, origin: 'automated',
        observedAt: '2026-08-04T12:10:00.000Z', sourceState: 'implemented' }),
      evidence({ evidenceId: 'refactor', taskId: '1.1', phase: 'refactor', checkId: 'auth-test',
        result: 'pass', exitCode: 0, origin: 'automated',
        observedAt: '2026-08-04T12:15:00.000Z', sourceState: 'refactored' }),
    ]);
    expect(result).toMatchObject({ valid: true, evidenceIds: ['red', 'green', 'refactor'] });
  });

  it('rejects missing RED, post-implementation RED, irrelevant failures, and pre-existing failures', () => {
    const greenOnly = [evidence({ evidenceId: 'green', taskId: '1.1', phase: 'green',
      checkId: 'auth-test', result: 'pass', origin: 'automated' })];
    expect(validateTddEvidence(executable, greenOnly).valid).toBe(false);
    for (const red of [
      evidence({ evidenceId: 'late', taskId: '1.1', phase: 'red', checkId: 'auth-test',
        result: 'fail', origin: 'automated', relevantFailure: true,
        observedAt: '2026-08-04T12:06:00.000Z' }),
      evidence({ evidenceId: 'irrelevant', taskId: '1.1', phase: 'red', checkId: 'auth-test',
        result: 'fail', origin: 'automated', relevantFailure: false }),
      evidence({ evidenceId: 'existing', taskId: '1.1', phase: 'red', checkId: 'auth-test',
        result: 'fail', origin: 'automated', relevantFailure: true, preExistingFailure: true }),
    ]) {
      expect(validateTddEvidence(executable, [red, ...greenOnly]).valid).toBe(false);
    }
  });
});
