import { describe, expect, it } from 'vitest';
import {
  RelayAssuranceV1Schema,
  RelayConfigV1Schema,
  RelayRunV1Schema,
} from '../src/schemas.js';

describe('versioned OpenSpec Relay records', () => {
  it('applies safe project defaults', () => {
    expect(RelayConfigV1Schema.parse({})).toEqual({
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
    expect(() => RelayRunV1Schema.parse({ version: 2 })).toThrow();
    expect(() => RelayAssuranceV1Schema.parse({ version: 1 })).toThrow();
  });
});
