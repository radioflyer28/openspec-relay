import { describe, expect, it, vi } from 'vitest';
import type { RoleRequestV1 } from '../src/execution-adapters.js';
import {
  createPiRoleDispatcher,
  type PiRoleSessionFactoryV1,
  type PiRoleSessionV1,
} from '../src/pi/role-dispatch.js';
import type { PiHostCapabilityProfileV1 } from '../src/pi/host-adapter.js';

const revision = 'a'.repeat(64);
const profile: PiHostCapabilityProfileV1 = {
  version: 1,
  adapterId: 'openspec-gsd/pi',
  piVersion: '0.84.4',
  sessionId: 'parent-session',
  modelRef: 'provider/model',
  agentDispatch: { state: 'available', reason: 'qualified', remediation: [] },
  parallelism: { state: 'available', reason: 'qualified', remediation: [] },
  hostCapabilities: {
    agentDispatch: true, parallelism: true, worktrees: false, git: false,
    structuredResults: true, humanInteraction: true,
  },
};

function request(role: RoleRequestV1['role'] = 'plan_reviewer'): RoleRequestV1 {
  return {
    role,
    readOnly: true,
    isolated: true,
    planning: {
      changeName: 'demo',
      planRevision: revision,
      invocation: 'initial_plan',
      artifactRefs: ['proposal.md', 'specs/demo/spec.md', 'design.md', 'tasks.md'],
      plannerInstructions: [],
      semanticObligations: ['REQ-1:behavioral'],
      evidenceRequirements: ['artifact coverage'],
    },
  };
}

function factory(output: (sessionId: string, envelope: Record<string, unknown>) => string, options: {
  tools?: string[];
  delayMs?: number;
  onAbort?: () => void;
  onPrompt?: (prompt: string) => void;
} = {}): PiRoleSessionFactoryV1 {
  return {
    create: async (input) => {
      const session: PiRoleSessionV1 = {
        sessionId: 'child-session',
        toolNames: options.tools ?? ['find', 'grep', 'ls', 'read'],
        run: async (prompt, signal) => {
          options.onPrompt?.(prompt);
          if (options.delayMs) await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, options.delayMs);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(signal.reason);
            }, { once: true });
          });
          return output(session.sessionId, input.envelope);
        },
        abort: async () => options.onAbort?.(),
        dispose: async () => undefined,
      };
      return session;
    },
  };
}

function validOutput(sessionId: string, envelope: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
  return `diagnostic text\n<openspec-gsd-result>${JSON.stringify({
    dispatchId: envelope.dispatchId,
    parentSessionId: envelope.parentSessionId,
    childSessionId: sessionId,
    role: envelope.role,
    changeName: envelope.changeName,
    planRevision: envelope.planRevision,
    result: {
      status: 'pass',
      summary: 'Independent review passed.',
      evidenceRefs: ['proposal.md'],
      ...overrides,
    },
  })}</openspec-gsd-result>`;
}

describe('Pi role dispatcher', () => {
  it('returns a validated result from a fresh read-only child session', async () => {
    let prompt = '';
    const dispatcher = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope), {
        onPrompt: (value) => { prompt = value; },
      }),
      currentRevision: async () => revision,
    });
    await expect(dispatcher.dispatch(request())).resolves.toMatchObject({
      status: 'pass', summary: 'Independent review passed.', evidenceRefs: ['proposal.md'],
    });
    expect(prompt).toContain('childSessionId=child-session');
  });

  it.each([
    ['role', 'verifier'],
    ['changeName', 'another-change'],
    ['planRevision', 'b'.repeat(64)],
    ['parentSessionId', 'another-session'],
  ])('rejects a child result with forged %s identity', async (field, value) => {
    const dispatcher = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => {
        const parsed = JSON.parse(validOutput(sessionId, envelope).match(/<openspec-gsd-result>(.*)<\/openspec-gsd-result>/s)![1]);
        parsed[field] = value;
        return `<openspec-gsd-result>${JSON.stringify(parsed)}</openspec-gsd-result>`;
      }),
      currentRevision: async () => revision,
    });
    await expect(dispatcher.dispatch(request())).resolves.toMatchObject({ status: 'error' });
  });

  it('rejects missing evidence, multiple result envelopes, and mutation-capable tools', async () => {
    const missingEvidence = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope, { evidenceRefs: [] })),
      currentRevision: async () => revision,
    });
    expect(await missingEvidence.dispatch(request())).toMatchObject({ status: 'error' });

    const multiple = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => {
        const value = validOutput(sessionId, envelope).replace('diagnostic text\n', '');
        return `${value}\n${value}`;
      }),
      currentRevision: async () => revision,
    });
    expect(await multiple.dispatch(request())).toMatchObject({ status: 'error' });

    const writable = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope), { tools: ['bash', 'read'] }),
      currentRevision: async () => revision,
    });
    expect(await writable.dispatch(request())).toMatchObject({ status: 'error', summary: expect.stringMatching(/authority|tools/i) });
  });

  it('makes stale, timed-out, and parent-cancelled results non-authoritative', async () => {
    const stale = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope)),
      currentRevision: async () => 'b'.repeat(64),
    });
    expect(await stale.dispatch(request())).toMatchObject({ status: 'error', summary: expect.stringMatching(/stale/i) });

    const onAbort = vi.fn();
    const timedOut = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope), { delayMs: 50, onAbort }),
      currentRevision: async () => revision,
      timeoutMs: 5,
    });
    expect(await timedOut.dispatch(request())).toMatchObject({ status: 'error', summary: expect.stringMatching(/timed out/i) });
    expect(onAbort).toHaveBeenCalled();

    const parent = new AbortController();
    const cancelled = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope), { delayMs: 50 }),
      currentRevision: async () => revision,
      parentSignal: parent.signal,
    });
    const pending = cancelled.dispatch(request());
    parent.abort(new Error('parent stopped'));
    expect(await pending).toMatchObject({ status: 'error', summary: expect.stringMatching(/cancelled/i) });
  });

  it('does not dispatch writable planner or executor roles through the assurance adapter', async () => {
    const dispatcher = createPiRoleDispatcher({
      profile,
      factory: factory((sessionId, envelope) => validOutput(sessionId, envelope)),
      currentRevision: async () => revision,
    });
    for (const role of ['planner', 'executor'] as const) {
      await expect(dispatcher.dispatch({ ...request(role), readOnly: false })).resolves.toMatchObject({ status: 'error' });
    }
  });

  it('grants a pathfinder only the two confined experiment tools when explicitly requested', async () => {
    let observedTools: readonly string[] = [];
    const sessionFactory: PiRoleSessionFactoryV1 = {
      create: async (input) => {
        observedTools = input.toolNames;
        return factory((sessionId, envelope) => validOutput(sessionId, envelope), {
          tools: [...input.toolNames],
        }).create(input);
      },
    };
    const dispatcher = createPiRoleDispatcher({
      profile,
      factory: sessionFactory,
      currentRevision: async () => revision,
    });
    const pathfinder = request('pathfinder');
    pathfinder.workspace = '/tmp/disposable-pathfinder';
    pathfinder.planning!.disposableExperimentWorkspace = true;
    expect(await dispatcher.dispatch(pathfinder)).toMatchObject({ status: 'pass' });
    expect(observedTools).toEqual([
      'find', 'grep', 'ls', 'read', 'experiment_read', 'experiment_write',
    ]);
  });
});
