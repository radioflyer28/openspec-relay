import { describe, expect, it } from 'vitest';
import {
  GuardrailsAssuranceV1Schema,
  GuardrailsConfigV1Schema,
  GuardrailsRunV1Schema,
} from '../src/index.js';

describe('versioned Guardrails records', () => {
  it('applies safe project defaults', () => {
    expect(GuardrailsConfigV1Schema.parse({})).toEqual({
      version: 1,
      mode: 'guarded',
      tdd: 'auto',
      repairLimit: 2,
      allowAgentDispatch: false,
      allowParallel: false,
      git: { commits: false, branches: false, worktrees: false },
      requiredCheckers: [],
      disabledCheckers: [],
      taskOverrides: {},
    });
  });

  it('rejects unversioned or structurally incomplete records', () => {
    expect(() => GuardrailsRunV1Schema.parse({ version: 2 })).toThrow();
    expect(() => GuardrailsAssuranceV1Schema.parse({ version: 1 })).toThrow();
  });
});
