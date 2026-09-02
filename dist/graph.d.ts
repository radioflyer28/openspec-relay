import path from 'node:path';
import { type TaskNodeV1 } from './schemas.js';
export interface ExecutionGraphV1 {
    nodes: TaskNodeV1[];
    waves: string[][];
}
export declare function writeSetsOverlap(left: string[], right: string[]): boolean;
export declare function buildExecutionGraph(input: TaskNodeV1[]): ExecutionGraphV1;
export declare function portableWriteSet(values: string[], pathApi?: path.PlatformPath): string[];
//# sourceMappingURL=graph.d.ts.map