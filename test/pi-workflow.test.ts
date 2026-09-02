import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PiHostProbeRuntimeV1 } from '../src/pi/host-adapter.js';
import type { PiRoleSessionFactoryV1 } from '../src/pi/role-dispatch.js';
import { executePiWorkflowOperationV1 } from '../src/pi/workflow.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;

function runtime(parallel = false): PiHostProbeRuntimeV1 {
  return {
    piVersion: '0.84.4', sessionId: 'parent-session', modelRef: 'provider/model',
    modelAvailable: true, authenticationAvailable: true,
    createReadOnlyProbe: async () => ({
      toolNames: ['find', 'grep', 'ls', 'read'], supportsCancellation: true,
      supportsTimeout: true, supportsStructuredResults: true, dispose: async () => undefined,
    }),
    probeParallelism: async () => parallel,
  };
}

describe('in-process Pi workflow adapter', () => {
  it('reports the CLI/Tier 0 fallback without creating a second workflow', async () => {
    const project = await createOpenSpecProject();
    const result = await executePiWorkflowOperationV1({
      operation: 'status', change: 'demo', projectRoot: project.root, runtime: runtime(),
      factory: { create: async () => { throw new Error('disabled adapter must not create a role session'); } },
    });
    expect(result).toMatchObject({ usedAdapter: false, fallbackCommand: 'openspec-gsd status demo --json' });
    expect(result.adapter.agentDispatch.state).toBe('disabled');
  });

  it('passes qualified read-only assurance dispatch into existing planning', async () => {
    const project = await createOpenSpecProject();
    await fs.writeFile(path.join(project.root, 'openspec', 'gsd.json'), JSON.stringify({
      piHostAdapter: { enabled: true, maxReadOnlyConcurrency: 2 },
      taskOverrides: {
        '1.1': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
        '1.2': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
      },
    }));
    const roles: string[] = [];
    const childSessionIds: string[] = [];
    const factory: PiRoleSessionFactoryV1 = { create: async ({ envelope, toolNames }) => {
      roles.push(envelope.role);
      const childSessionId = `child-${roles.length}`;
      childSessionIds.push(childSessionId);
      return {
        sessionId: childSessionId, toolNames: [...toolNames],
        run: async () => `<openspec-gsd-result>${JSON.stringify({
          dispatchId: envelope.dispatchId, parentSessionId: envelope.parentSessionId,
          childSessionId, role: envelope.role, changeName: envelope.changeName,
          planRevision: envelope.planRevision,
          result: {
            status: 'pass', summary: `${envelope.role} passed`, evidenceRefs: [`evidence:${envelope.role}`],
            ...(envelope.role === 'pathfinder' ? { pathfinder: {
              assumptions: ['The existing task mapping is authoritative.'],
              experiments: ['Inspected the referenced OpenSpec artifacts.'],
              observations: ['The planned files match the focused uncertainty.'],
              counterexamples: [],
              conclusion: 'The focused uncertainty is resolved within the existing plan.',
              confidence: 'high',
              routing: 'planner',
            } } : {}),
          },
        })}</openspec-gsd-result>`,
        abort: async () => undefined, dispose: async () => undefined,
      };
    } };
    const result = await executePiWorkflowOperationV1({
      operation: 'plan', change: 'demo', projectRoot: project.root,
      runtime: runtime(true), factory, pathfinderQuestions: ['Which existing module should own the behavior?'],
    });
    expect(result).toMatchObject({
      usedAdapter: true,
      adapter: { adapterId: 'openspec-gsd/pi', piVersion: '0.84.4', modelRef: 'provider/model' },
      result: { status: 'pass', review: { independent: true } },
    });
    expect((result.result as { assurance: { hostAdapter?: unknown } }).assurance.hostAdapter).toMatchObject({
      adapterId: 'openspec-gsd/pi', runtimeVersion: '0.84.4', modelRef: 'provider/model',
      agentDispatch: 'available', parallelism: 'available',
    });
    expect(JSON.stringify((result.result as { assurance: unknown }).assurance)).not.toContain('parent-session');
    const status = await executePiWorkflowOperationV1({
      operation: 'status', change: 'demo', projectRoot: project.root,
      runtime: runtime(true), factory,
    });
    expect(status.result).toMatchObject({
      hostAdapter: { adapterId: 'openspec-gsd/pi', runtimeVersion: '0.84.4' },
    });
    const tasksPath = path.join(project.changeDir, 'tasks.md');
    await fs.writeFile(tasksPath, (await fs.readFile(tasksPath, 'utf8')).replaceAll('- [ ]', '- [x]'));
    await executePiWorkflowOperationV1({
      operation: 'do', change: 'demo', projectRoot: project.root,
      runtime: runtime(true), factory,
    });
    expect(roles).toEqual(['pathfinder', 'plan_reviewer', 'reviewer', 'verifier']);
    expect(new Set(childSessionIds).size).toBe(childSessionIds.length);
    expect(roles).not.toEqual(expect.arrayContaining(['planner', 'executor']));
  });
});
