import { describe, expect, it, vi } from 'vitest';
import { DispatchQuiescenceControllerV1 } from '../src/dispatch-quiescence.js';

describe('dispatch quiescence', () => {
  it('stops scheduling and records acknowledged mutation cancellation', async () => {
    const control = new DispatchQuiescenceControllerV1();
    const abort = vi.fn(async () => undefined);
    const dispatch = control.begin({ dispatchId: 'writer', readOnly: false, abort });
    expect(dispatch).toBeDefined();
    const pending = control.pause({ timeoutMs: 50 });
    dispatch!.settle('stopped');
    expect(await pending).toEqual([expect.objectContaining({ dispatchId: 'writer', state: 'stopped', readOnly: false })]);
    expect(abort).toHaveBeenCalledOnce();
    expect(control.begin({ dispatchId: 'late', readOnly: true })).toBeUndefined();
  });

  it('allows read-only work to continue and reports bounded unknown mutation state', async () => {
    const control = new DispatchQuiescenceControllerV1();
    control.begin({ dispatchId: 'reader', readOnly: true });
    control.begin({ dispatchId: 'opaque-writer', readOnly: false });
    const snapshot = await control.pause({ timeoutMs: 1 });
    expect(snapshot).toEqual(expect.arrayContaining([
      expect.objectContaining({ dispatchId: 'reader', state: 'running', readOnly: true }),
      expect.objectContaining({ dispatchId: 'opaque-writer', state: 'unknown', readOnly: false }),
    ]));
  });

  it('records interrupted sessions and ignores stale late settlement', async () => {
    const control = new DispatchQuiescenceControllerV1();
    const dispatch = control.begin({ dispatchId: 'review', readOnly: true, requestRevision: 'a'.repeat(64) })!;
    dispatch.settle('interrupted');
    dispatch.settle('stopped');
    expect(control.snapshot()).toEqual([expect.objectContaining({ dispatchId: 'review', state: 'interrupted' })]);
    expect(control.acceptsResult('review', 'a'.repeat(64))).toBe(false);
  });
});
