import { describe, expect, it } from 'vitest';
import { beginRepairAttempt, runBoundedRepair } from '../src/index.js';

describe('bounded repair', () => {
  it('records a relevant repair and successful rerun', async () => {
    const result = await runBoundedRepair({
      checkId: 'security',
      relevantReferences: ['src/auth.ts'],
      repair: async () => ['src/auth.ts'],
      rerun: async () => true,
    });
    expect(result).toMatchObject({ passed: true, exhausted: false, userDirectionRequired: false });
    expect(result.attempts).toHaveLength(1);
  });

  it('rejects unchanged or irrelevant repairs', () => {
    expect(() => beginRepairAttempt({
      checkId: 'security', previous: [], changedReferences: ['README.md'],
      relevantReferences: ['src/auth.ts'],
    })).toThrow('did not change relevant');
  });

  it('stops after the default two failed attempts and requests user direction', async () => {
    const result = await runBoundedRepair({
      checkId: 'security',
      relevantReferences: ['src/auth.ts'],
      repair: async () => ['src/auth.ts'],
      rerun: async () => false,
    });
    expect(result).toMatchObject({ passed: false, exhausted: true, userDirectionRequired: true });
    expect(result.attempts).toHaveLength(2);
  });
});
