import { describe, expect, it } from 'vitest';
import {
  assertGitOperationAllowed,
  plannedGitOperations,
} from '../src/git-policy.js';
import { selectAssurancePipeline } from '../src/modes.js';
import { GsdConfigV1Schema } from '../src/schemas.js';
import { negotiateExecutionTier } from '../src/tiers.js';

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
    const defaults = GsdConfigV1Schema.parse({});
    expect(negotiateExecutionTier(capabilities, defaults).tier).toBe('tier0');
    const requested = GsdConfigV1Schema.parse({
      requestedTier: 'tier2', allowAgentDispatch: true, allowParallel: true,
      git: { commits: false, branches: false, worktrees: false },
    });
    expect(negotiateExecutionTier(capabilities, requested)).toMatchObject({
      tier: 'tier0', requested: 'tier2', downgraded: true,
    });
    expect(negotiateExecutionTier(capabilities, requested).diagnostics.join(' '))
      .toContain('registered host dispatcher');
  });

  it('distinguishes permission flags, probed capabilities, and registered adapters', () => {
    const config = GsdConfigV1Schema.parse({
      requestedTier: 'tier2', allowAgentDispatch: true, allowParallel: true,
      git: { commits: false, branches: false, worktrees: true },
    });
    expect(negotiateExecutionTier(capabilities, config).tier).toBe('tier0');
    expect(negotiateExecutionTier(capabilities, config, { dispatcher: true }).tier).toBe('tier1');
    expect(negotiateExecutionTier(capabilities, config, {
      dispatcher: true, worktrees: true,
    }).tier).toBe('tier2');
    expect(plannedGitOperations(config, { worktree: true })).toEqual(['worktree']);
    expect(() => assertGitOperationAllowed(config, 'commit', { commit: true })).toThrow(/permission/i);
    expect(() => assertGitOperationAllowed(config, 'branch', { branch: true })).toThrow(/permission/i);
    expect(() => assertGitOperationAllowed(config, 'worktree')).toThrow(/registered host adapter/i);
    expect(() => assertGitOperationAllowed(config, 'worktree', { worktree: true })).not.toThrow();
  });

  it.each(['linux', 'darwin', 'win32'])('keeps Git mutations independently disabled on %s', () => {
    const config = GsdConfigV1Schema.parse({
      git: { commits: true, branches: false, worktrees: false },
    });
    expect(plannedGitOperations(config, { commit: true, branch: true, worktree: true }))
      .toEqual(['commit']);
  });
});
