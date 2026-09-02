import { describe, expect, it } from 'vitest';
import { runReadonlyAnalysisSchedule } from '../src/analysis-scheduler.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('bounded read-only Pi analysis scheduler', () => {
  it('honors prerequisites and returns results in stable request order', async () => {
    const order: string[] = [];
    const results = await runReadonlyAnalysisSchedule({ requests: [
      { id: 'first', prerequisites: [], run: async () => { order.push('first'); return 'one'; } },
      { id: 'third', prerequisites: ['first', 'second'], run: async () => { order.push('third'); return 'three'; } },
      { id: 'second', prerequisites: [], run: async () => { order.push('second'); return 'two'; } },
    ] });
    expect(order.at(-1)).toBe('third');
    expect(results.map((item) => item.id)).toEqual(['first', 'third', 'second']);
    expect(results.map((item) => item.value)).toEqual(['one', 'three', 'two']);
  });

  it('caps concurrency, tolerates out-of-order completion, and retains sibling failures', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let active = 0;
    let maximum = 0;
    const scheduled = runReadonlyAnalysisSchedule({ concurrency: 2, requests: gates.map((gate, index) => ({
      id: `r${index}`,
      prerequisites: [],
      run: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        try {
          const value = await gate.promise;
          if (index === 1) throw new Error(value);
          return value;
        } finally { active -= 1; }
      },
    })) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    gates[1].resolve('failed independently');
    gates[0].resolve('slow');
    gates[2].resolve('last');
    const results = await scheduled;
    expect(maximum).toBe(2);
    expect(results.map((item) => item.status)).toEqual(['pass', 'error', 'pass']);
    expect(results[1]?.summary).toContain('failed independently');
  });

  it('supports sequential fallback and validates the dependency graph', async () => {
    let active = 0;
    let maximum = 0;
    const results = await runReadonlyAnalysisSchedule({ parallel: false, concurrency: 4, requests: [0, 1, 2].map((index) => ({
      id: `r${index}`, prerequisites: [], run: async () => {
        active += 1; maximum = Math.max(maximum, active);
        await Promise.resolve(); active -= 1; return index;
      },
    })) });
    expect(maximum).toBe(1);
    expect(results.every((item) => item.status === 'pass')).toBe(true);
    await expect(runReadonlyAnalysisSchedule({ requests: [
      { id: 'a', prerequisites: ['b'], run: async () => 'a' },
      { id: 'b', prerequisites: ['a'], run: async () => 'b' },
    ] })).rejects.toThrow(/cycle/i);
  });

  it('reports cancellation independently and never starts dependants after cancellation', async () => {
    const controller = new AbortController();
    let dependantRan = false;
    const results = await runReadonlyAnalysisSchedule({ signal: controller.signal, requests: [
      { id: 'root', prerequisites: [], run: async () => { controller.abort(); return 'root'; } },
      { id: 'dependant', prerequisites: ['root'], run: async () => { dependantRan = true; return 'bad'; } },
    ] });
    expect(dependantRan).toBe(false);
    expect(results[1]?.status).toBe('cancelled');
  });
});
