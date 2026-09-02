import type { CheckerKind } from './modes.js';
export interface CheckerSignalsV1 {
    changedFiles?: string[];
    artifactText?: string;
    required?: string[];
    disabled?: string[];
}
export declare function routeSpecialistCheckers(signals: CheckerSignalsV1): CheckerKind[];
//# sourceMappingURL=checkers.d.ts.map