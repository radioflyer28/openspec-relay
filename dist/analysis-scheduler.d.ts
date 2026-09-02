export declare const DEFAULT_READONLY_ANALYSIS_CONCURRENCY = 2;
export declare const MAX_READONLY_ANALYSIS_CONCURRENCY = 4;
export interface ReadonlyAnalysisRequestV1<T> {
    id: string;
    prerequisites: string[];
    run(signal?: AbortSignal): Promise<T>;
}
export interface ReadonlyAnalysisResultV1<T> {
    id: string;
    index: number;
    status: 'pass' | 'error' | 'cancelled';
    value?: T;
    summary: string;
}
export declare function runReadonlyAnalysisSchedule<T>(options: {
    requests: ReadonlyAnalysisRequestV1<T>[];
    concurrency?: number;
    parallel?: boolean;
    signal?: AbortSignal;
}): Promise<ReadonlyAnalysisResultV1<T>[]>;
//# sourceMappingURL=analysis-scheduler.d.ts.map