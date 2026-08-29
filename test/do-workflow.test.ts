import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { doGsdChangeV1, type CanonicalApplyRequestV1 } from '../src/do-workflow.js';
import type { RoleDispatcherV1 } from '../src/execution-adapters.js';
import { planGsdChangeV1 } from '../src/plan-workflow.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;
const config = {
  taskOverrides: {
    '1.1': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
    '1.2': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
  },
};

async function approve(root: string, change = 'demo') {
  const result = await planGsdChangeV1({
    change, projectRoot: root, config, changedFiles: [], allowSelfReview: true,
  });
  expect(result.status).toBe('pass');
}

async function completeTask(changeDir: string, taskId: string) {
  const filename = `${changeDir}/tasks.md`;
  const content = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, content.replace(new RegExp(`- \\[ \\] ${taskId.replace('.', '\\.')}`), `- [x] ${taskId}`));
}

const passingRoles: RoleDispatcherV1 = { dispatch: async (request) => ({
  status: 'pass', summary: `${request.role} passed`, evidenceRefs: [`evidence:${request.role}`],
}) };

describe('approved do convergence', () => {
  it('refuses absent approval before invoking canonical apply', async () => {
    const { root } = await createOpenSpecProject();
    let calls = 0;
    const result = await doGsdChangeV1({
      change: 'demo', projectRoot: root, changedFiles: [], dispatcher: passingRoles,
      applyCapability: { apply: async () => { calls += 1; return { status: 'pass', summary: 'unexpected' }; } },
    }).catch((error) => error as Error);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/records are missing|approval/i);
    expect(calls).toBe(0);
  });

  it('wraps canonical apply with approved planner, semantic, risk, TDD, finding, and evidence context', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await approve(root);
    const requests: CanonicalApplyRequestV1[] = [];
    const result = await doGsdChangeV1({
      change: 'demo', projectRoot: root, changedFiles: [], dispatcher: passingRoles,
      applyCapability: { apply: async (request) => {
        requests.push(request);
        await completeTask(changeDir, request.taskId);
        return { status: 'pass', summary: 'canonical apply complete' };
      } },
    });
    expect(result).toMatchObject({ status: 'pass', applyCalls: 2, run: { status: 'complete' } });
    expect(requests[0]).toMatchObject({
      changeName: 'demo', taskId: '1.1', action: 'implement', risk: 'medium', tdd: 'auto',
      capability: '$openspec-apply-change',
      scenarioIds: [scenarioId],
    });
    expect(requests[0].plannerInstructions.join('\n')).toMatch(/canonical OpenSpec artifact loading/i);
    expect(requests[0].semanticObligations[0]).toMatchObject({ requirementId });
    expect(requests[0]).not.toHaveProperty('taskQueue');
    expect(requests[0]).not.toHaveProperty('completionStatus');
  });

  it('refuses semantic artifact changes that stale approval before an apply write', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await approve(root);
    await fs.appendFile(`${changeDir}/design.md`, '\nMaterial semantic task design change.\n');
    let calls = 0;
    const result = await doGsdChangeV1({
      change: 'demo', projectRoot: root, changedFiles: [], dispatcher: passingRoles,
      applyCapability: { apply: async () => { calls += 1; return { status: 'pass', summary: 'unexpected' }; } },
    });
    expect(result).toMatchObject({ status: 'human_needed', applyCalls: 0, nextAction: '/opsx:plan demo' });
    expect(calls).toBe(0);
  });

  it('routes a blocking review finding through the shared planner and repairs the original task via canonical apply', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await approve(root);
    let codeReviews = 0;
    const roles: RoleDispatcherV1 = { dispatch: async (request) => {
      if (request.role === 'reviewer' && ++codeReviews === 1) return {
        status: 'fail', summary: 'implementation defect', evidenceRefs: [],
        findings: [{ providerId: 'reviewer', ruleId: 'behavior', category: 'code',
          scope: { kind: 'task', identity: '1.1' }, severity: 'error', blocking: true,
          summary: 'Task behavior is incomplete.', taskIds: ['1.1'] }],
      };
      return { status: 'pass', summary: `${request.role} pass`, evidenceRefs: [] };
    } };
    const requests: CanonicalApplyRequestV1[] = [];
    const result = await doGsdChangeV1({
      change: 'demo', projectRoot: root, changedFiles: [], dispatcher: roles,
      applyCapability: { apply: async (request) => {
        requests.push(request);
        await completeTask(changeDir, request.taskId);
        return { status: 'pass', summary: 'applied' };
      } },
    });
    expect(result).toMatchObject({ status: 'pass', convergenceCycles: 2, applyCalls: 3 });
    expect(requests.at(-1)).toMatchObject({ taskId: '1.1', action: 'repair' });
    expect(requests.at(-1)?.findingIds).toHaveLength(1);
  });

  it('bounds unchanged verification failures and stops for human direction', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await approve(root);
    const roles: RoleDispatcherV1 = { dispatch: async (request) => request.role === 'verifier'
      ? { status: 'fail', summary: 'same goal gap', evidenceRefs: [] }
      : { status: 'pass', summary: 'pass', evidenceRefs: [] } };
    const result = await doGsdChangeV1({
      change: 'demo', projectRoot: root, changedFiles: [], dispatcher: roles,
      applyCapability: { apply: async (request) => {
        await completeTask(changeDir, request.taskId);
        return { status: 'pass', summary: 'applied' };
      } },
    });
    expect(result).toMatchObject({ status: 'human_needed', convergenceCycles: 2 });
    expect(result.summary).toMatch(/did not converge within two cycles/i);
  });
});
