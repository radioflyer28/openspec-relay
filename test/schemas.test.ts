import { describe, expect, it } from 'vitest';
import {
  GsdAssuranceV1Schema,
  GsdConfigV1Schema,
  GsdRunV1Schema,
} from '../src/schemas.js';

describe('versioned OpenSpec GSD records', () => {
  it('applies safe project defaults', () => {
    expect(GsdConfigV1Schema.parse({})).toEqual({
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
    expect(() => GsdRunV1Schema.parse({ version: 2 })).toThrow();
    expect(() => GsdAssuranceV1Schema.parse({ version: 1 })).toThrow();
  });
});
