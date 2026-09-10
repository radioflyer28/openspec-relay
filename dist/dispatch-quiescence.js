/** Cooperative, in-memory control for host dispatches. It never claims that
 * an unobservable mutation stopped merely because a timeout elapsed. */
export class DispatchQuiescenceControllerV1 {
    schedulingStopped = false;
    dispatches = new Map();
    begin(options) {
        if (this.schedulingStopped)
            return undefined;
        if (this.dispatches.has(options.dispatchId))
            throw new Error(`Dispatch '${options.dispatchId}' is already registered.`);
        let resolve;
        const settled = new Promise((done) => { resolve = done; });
        const tracked = {
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
                if (tracked.state !== 'running')
                    return;
                tracked.state = state;
                tracked.resolve();
            },
        };
    }
    async pause(options) {
        this.schedulingStopped = true;
        const mutations = [...this.dispatches.values()].filter((dispatch) => !dispatch.readOnly && dispatch.state === 'running');
        await Promise.all(mutations.map(async (dispatch) => {
            await dispatch.abort?.().catch(() => undefined);
            if (dispatch.state !== 'running')
                return;
            await Promise.race([
                dispatch.settled,
                new Promise((resolve) => setTimeout(resolve, Math.max(0, options.timeoutMs))),
            ]);
            if (dispatch.state === 'running')
                dispatch.state = 'unknown';
        }));
        return this.snapshot();
    }
    snapshot() {
        return [...this.dispatches.values()].map(({ abort: _abort, resolve: _resolve, settled: _settled, ...dispatch }) => dispatch)
            .sort((left, right) => left.dispatchId.localeCompare(right.dispatchId));
    }
    acceptsResult(dispatchId, requestRevision) {
        const dispatch = this.dispatches.get(dispatchId);
        return dispatch?.state === 'running' && (!dispatch.requestRevision || dispatch.requestRevision === requestRevision);
    }
    resumeScheduling() {
        this.schedulingStopped = false;
        for (const [id, dispatch] of this.dispatches) {
            if (dispatch.state !== 'running')
                this.dispatches.delete(id);
        }
    }
}
//# sourceMappingURL=dispatch-quiescence.js.map