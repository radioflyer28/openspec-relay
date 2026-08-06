import { describe, expect, it } from 'vitest';
import {
  assertGitOperationAllowed,
  GuardrailsConfigV1Schema,
  negotiateExecutionTier,
  plannedGitOperations,
  selectAssurancePipeline,
} from '../src/index.js';

const capabilities = {
  agentDispatch: true,
  parallelism: true,
  worktrees: true,
  git: true,
  structuredResults: true,
  humanInteraction: true,
};

describe('modes, tiers, and Git opt-ins', () => {
  it('selects the documented assurance pipeline for each mode', () => {
    expect(selectAssurancePipeline('quick')).toEqual([
      'artifact-validation', 'repository-checks', 'targeted-tests',
      'scenario-coverage', 'goal-verification',
    ]);
    expect(selectAssurancePipeline('guarded', ['security'])).toContain('code-review');
    expect(selectAssurancePipeline('guarded', ['security'])).toContain('security');
    expect(selectAssurancePipeline('full', ['ui', 'compatibility'])).toEqual(
      expect.arrayContaining(['tdd', 'ui', 'compatibility', 'goal-verification']),
    );
  });

  it('defaults to Tier 0 and reports capability-safe downgrade', () => {
    const defaults = GuardrailsConfigV1Schema.parse({});
    expect(negotiateExecutionTier(capabilities, defaults).tier).toBe('tier0');
    const requested = GuardrailsConfigV1Schema.parse({
      requestedTier: 'tier2', allowAgentDispatch: true, allowParallel: true,
      git: { commits: false, branches: false, worktrees: false },
    });
    expect(negotiateExecutionTier(capabilities, requested)).toMatchObject({
      tier: 'tier1', requested: 'tier2', downgraded: true,
    });
  });

  it('permits Tier 2 and each Git mutation only through independent opt-ins', () => {
    const config = GuardrailsConfigV1Schema.parse({
      requestedTier: 'tier2', allowAgentDispatch: true, allowParallel: true,
      git: { commits: false, branches: false, worktrees: true },
    });
    expect(negotiateExecutionTier(capabilities, config).tier).toBe('tier2');
    expect(plannedGitOperations(config)).toEqual(['worktree']);
    expect(() => assertGitOperationAllowed(config, 'commit')).toThrow('disabled');
    expect(() => assertGitOperationAllowed(config, 'branch')).toThrow('disabled');
    expect(() => assertGitOperationAllowed(config, 'worktree')).not.toThrow();
  });
});
