import type { DispatchPauseStateV1, PauseDispatchV1 } from './schemas.js';

interface TrackedDispatchV1 extends PauseDispatchV1 {
  abort?: () => Promise<void>;
  resolve: () => void;
  settled: Promise<void>;
}

export interface DispatchHandleV1 {
  settle(state: Extract<DispatchPauseStateV1, 'stopped' | 'interrupted'>): void;
}

/** Cooperative, in-memory control for host dispatches. It never claims that
 * an unobservable mutation stopped merely because a timeout elapsed. */
export class DispatchQuiescenceControllerV1 {
  private schedulingStopped = false;
  private readonly dispatches = new Map<string, TrackedDispatchV1>();

  begin(options: {
    dispatchId: string;
    readOnly: boolean;
    sessionId?: string;
    requestRevision?: string;
    abort?: () => Promise<void>;
  }): DispatchHandleV1 | undefined {
    if (this.schedulingStopped) return undefined;
    if (this.dispatches.has(options.dispatchId)) throw new Error(`Dispatch '${options.dispatchId}' is already registered.`);
    let resolve!: () => void;
    const settled = new Promise<void>((done) => { resolve = done; });
    const tracked: TrackedDispatchV1 = {
      dispatchId: options.dispatchId,
      state: 'running',
      readOnly: options.readOnly,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.requestRevision ? { requestRevision: options.requestRevision } : {}),
      ...(options.abort ? { abort: options.abort } : {}),
      resolve,
      settled,
    };
    this.dispatches.set(options.dispatchId, tracked);
    return {
      settle: (state) => {
        if (tracked.state !== 'running') return;
        tracked.state = state;
        tracked.resolve();
      },
    };
  }

  async pause(options: { timeoutMs: number }): Promise<PauseDispatchV1[]> {
    this.schedulingStopped = true;
    const mutations = [...this.dispatches.values()].filter((dispatch) =>
      !dispatch.readOnly && dispatch.state === 'running');
    await Promise.all(mutations.map(async (dispatch) => {
      await dispatch.abort?.().catch(() => undefined);
      if (dispatch.state !== 'running') return;
      await Promise.race([
        dispatch.settled,
        new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, options.timeoutMs))),
      ]);
      if (dispatch.state === 'running') dispatch.state = 'unknown';
    }));
    return this.snapshot();
  }

  snapshot(): PauseDispatchV1[] {
    return [...this.dispatches.values()].map((dispatch) => ({
      dispatchId: dispatch.dispatchId,
      state: dispatch.state,
      readOnly: dispatch.readOnly,
      ...(dispatch.sessionId ? { sessionId: dispatch.sessionId } : {}),
      ...(dispatch.requestRevision ? { requestRevision: dispatch.requestRevision } : {}),
    }))
      .sort((left, right) => left.dispatchId.localeCompare(right.dispatchId));
  }

  acceptsResult(dispatchId: string, requestRevision?: string): boolean {
    const dispatch = this.dispatches.get(dispatchId);
    return dispatch?.state === 'running' && (!dispatch.requestRevision || dispatch.requestRevision === requestRevision);
  }

  resumeScheduling(): void {
    this.schedulingStopped = false;
    for (const [id, dispatch] of this.dispatches) {
      if (dispatch.state !== 'running') this.dispatches.delete(id);
    }
  }
}
