import type { AssuranceCheckV1, RunMode } from './schemas.js';
export type CheckerKind = AssuranceCheckV1['kind'];
export declare function selectAssurancePipeline(mode: RunMode, specialistCheckers?: CheckerKind[]): CheckerKind[];
//# sourceMappingURL=modes.d.ts.map