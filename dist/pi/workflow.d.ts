import { qualifyPiHostAdapter, type PiHostProbeRuntimeV1 } from './host-adapter.js';
import { type PiRoleSessionFactoryV1 } from './role-dispatch.js';
export type PiWorkflowOperationV1 = 'plan' | 'do' | 'check' | 'status';
export interface PiWorkflowOperationResultV1 {
    operation: PiWorkflowOperationV1;
    adapter: Awaited<ReturnType<typeof qualifyPiHostAdapter>>;
    usedAdapter: boolean;
    fallbackCommand?: string;
    result?: unknown;
}
/** The sole in-process Pi integration point. It delegates lifecycle decisions
 * to existing OpenSpec Relay workflows and supplies only qualified read-only
 * assurance dispatch. Canonical implementation remains $openspec-apply-change
 * in the parent session. */
export declare function executePiWorkflowOperationV1(options: {
    operation: PiWorkflowOperationV1;
    change: string;
    projectRoot: string;
    runtime: PiHostProbeRuntimeV1;
    factory: PiRoleSessionFactoryV1;
    pathfinderQuestions?: string[];
    parentSignal?: AbortSignal;
}): Promise<PiWorkflowOperationResultV1>;
//# sourceMappingURL=workflow.d.ts.map