export const DEFAULT_READONLY_ANALYSIS_CONCURRENCY = 2;
export const MAX_READONLY_ANALYSIS_CONCURRENCY = 4;

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

function validateGraph<T>(requests: ReadonlyAnalysisRequestV1<T>[]): void {
  const byId = new Map<string, ReadonlyAnalysisRequestV1<T>>();
  for (const request of requests) {
    if (byId.has(request.id)) throw new Error(`Duplicate analysis request '${request.id}'.`);
    byId.set(request.id, request);
  }
  for (const request of requests) for (const prerequisite of request.prerequisites) {
    if (!byId.has(prerequisite)) throw new Error(`Unknown prerequisite '${prerequisite}' for '${request.id}'.`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Read-only analysis dependency cycle includes '${id}'.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id)!.prerequisites) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const request of requests) visit(request.id);
}

export async function runReadonlyAnalysisSchedule<T>(options: {
  requests: ReadonlyAnalysisRequestV1<T>[];
  concurrency?: number;
  parallel?: boolean;
  signal?: AbortSignal;
}): Promise<ReadonlyAnalysisResultV1<T>[]> {
  validateGraph(options.requests);
  const requestedConcurrency = options.parallel === false ? 1
    : options.concurrency ?? DEFAULT_READONLY_ANALYSIS_CONCURRENCY;
  const concurrency = Math.max(1, Math.min(MAX_READONLY_ANALYSIS_CONCURRENCY, requestedConcurrency));
  const indices = new Map(options.requests.map((request, index) => [request.id, index]));
  const pending = new Set(options.requests.map((request) => request.id));
  const complete = new Set<string>();
  const results = new Map<string, ReadonlyAnalysisResultV1<T>>();
  const active = new Map<string, Promise<void>>();

  const start = (request: ReadonlyAnalysisRequestV1<T>) => {
    pending.delete(request.id);
    const operation = (async () => {
      if (options.signal?.aborted) {
        results.set(request.id, { id: request.id, index: indices.get(request.id)!, status: 'cancelled', summary: 'Cancelled before dispatch.' });
        return;
      }
      try {
        const value = await request.run(options.signal);
        results.set(request.id, { id: request.id, index: indices.get(request.id)!, status: 'pass', value, summary: 'Read-only analysis passed.' });
      } catch (error) {
        const cancelled = options.signal?.aborted || (error as Error).name === 'AbortError';
        results.set(request.id, {
          id: request.id, index: indices.get(request.id)!, status: cancelled ? 'cancelled' : 'error',
          summary: cancelled ? 'Read-only analysis was cancelled.' : (error as Error).message,
        });
      } finally {
        complete.add(request.id);
        active.delete(request.id);
      }
    })();
    active.set(request.id, operation);
  };

  while (pending.size > 0 || active.size > 0) {
    if (options.signal?.aborted) {
      for (const id of pending) {
        results.set(id, { id, index: indices.get(id)!, status: 'cancelled', summary: 'Cancelled before dispatch.' });
        complete.add(id);
      }
      pending.clear();
    }
    for (const request of options.requests) {
      if (active.size >= concurrency) break;
      if (!pending.has(request.id)) continue;
      if (request.prerequisites.every((id) => complete.has(id))) start(request);
    }
    if (active.size > 0) await Promise.race(active.values());
  }
  return [...results.values()].sort((left, right) => left.index - right.index);
}
