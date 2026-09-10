import type { DispatchPauseStateV1, PauseDispatchV1 } from './schemas.js';
export interface DispatchHandleV1 {
    settle(state: Extract<DispatchPauseStateV1, 'stopped' | 'interrupted'>): void;
}
/** Cooperative, in-memory control for host dispatches. It never claims that
 * an unobservable mutation stopped merely because a timeout elapsed. */
export declare class DispatchQuiescenceControllerV1 {
    private schedulingStopped;
    private readonly dispatches;
    begin(options: {
        dispatchId: string;
        readOnly: boolean;
        sessionId?: string;
        requestRevision?: string;
        abort?: () => Promise<void>;
    }): DispatchHandleV1 | undefined;
    pause(options: {
        timeoutMs: number;
    }): Promise<PauseDispatchV1[]>;
    snapshot(): PauseDispatchV1[];
    acceptsResult(dispatchId: string, requestRevision?: string): boolean;
    resumeScheduling(): void;
}
//# sourceMappingURL=dispatch-quiescence.d.ts.map