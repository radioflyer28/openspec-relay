import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { confirmDiscussionHandoff } from '../src/discussion.js';
import { doRelayChangeV1, type CanonicalApplyRequestV1 } from '../src/do-workflow.js';
import type { RoleDispatcherV1, RoleRequestV1 } from '../src/execution-adapters.js';
import { planRelayChangeV1 } from '../src/plan-workflow.js';
import { recordSemanticDowngrade } from '../src/semantics.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const defaultRequirementId = 'spec:demo#requirement:demonstrate-behavior';
const defaultScenarioId = `${defaultRequirementId}/scenario:works`;
const defaultConfig = {
  mode: 'quick' as const,
  taskOverrides: {
    '1.1': { requirementRefs: [defaultRequirementId], scenarioRefs: [defaultScenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
    '1.2': { requirementRefs: [defaultRequirementId], scenarioRefs: [defaultScenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
  },
};

async function completeTask(changeDir: string, taskId: string): Promise<void> {
  const filename = path.join(changeDir, 'tasks.md');
  const content = await fs.readFile(filename, 'utf8');
  await fs.writeFile(filename, content.replace(new RegExp(`- \\[ \\] ${taskId.replace('.', '\\.')}`), `- [x] ${taskId}`));
}

let evidenceSequence = 0;
function qualifiedRoleResult(role: string, scenarioId: string) {
  const event = (checkId: string, origin: 'reviewer' | 'verifier', reference?: string) => {
    evidenceSequence += 1;
    const evidenceId = `macos:${role}:${checkId}:${evidenceSequence}`;
    return { type: 'evidence.recorded' as const, evidence: {
      evidenceId, phase: origin === 'reviewer' ? 'review' as const : 'verify' as const,
      checkId, observedAt: '2026-08-29T12:00:00.000Z', sourceState: 'macos-qualification',
      result: 'pass' as const, outputDigest: createHash('sha256').update(evidenceId).digest('hex'),
      preExistingFailure: false, origin, ...(reference ? { reference } : {}),
    } };
  };
  return { status: 'pass' as const, summary: `${role} passed`, evidenceRefs: [`evidence:${role}`],
    evidence: role === 'verifier' ? [{ referenceId: `macos-verifier:${evidenceSequence + 1}`,
      kind: 'generated' as const, externalId: 'macos-qualification', available: true }] : [],
    events: role === 'reviewer' ? [event('repository-checks', 'reviewer'), event('targeted-tests', 'reviewer')]
      : role === 'verifier' ? [event('scenario-coverage', 'verifier', scenarioId), event('goal-verification', 'verifier')]
        : [] };
}

function passingRoles(requests: RoleRequestV1[] = [], scenarioId = defaultScenarioId): RoleDispatcherV1 {
  return { dispatch: async (request) => {
    requests.push(request);
    return qualifiedRoleResult(request.role, scenarioId);
  } };
}

describe.runIf(process.platform === 'darwin')('macOS/Pi bounded qualification', () => {
  it('completes an ordinary Level 1 change without discussion or formal-method sections', async () => {
    const { root, changeDir } = await createOpenSpecProject('level-one');
    await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '',
      '### Requirement: Show account label',
      'The page SHALL show the account label.', '',
      '#### Scenario: Label is visible',
      '- **WHEN** the page is displayed',
      '- **THEN** the account label is visible', '',
    ].join('\n'));
    await fs.writeFile(path.join(changeDir, 'design.md'), '## Decisions\n\nUse the existing label-rendering convention.\n');
    const requirementId = 'spec:demo#requirement:show-account-label';
    const scenarioId = `${requirementId}/scenario:label-is-visible`;
    const config = { mode: 'quick' as const, taskOverrides: {
      '1.1': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests'] },
      '1.2': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests'] },
    } };
    const requests: RoleRequestV1[] = [];
    const planned = await planRelayChangeV1({
      change: 'level-one', projectRoot: root, config, changedFiles: [], dispatcher: passingRoles(requests, scenarioId),
    });
    expect(planned, JSON.stringify(planned.assurance.readiness, null, 2))
      .toMatchObject({ status: 'pass', review: { independent: true } });
    expect(planned.assurance.semanticClassifications).toEqual([
      expect.objectContaining({ requirementId, level: 'simple' }),
    ]);
    expect(requests.map((request) => request.role)).toEqual(['planner', 'plan_reviewer']);
    const design = await fs.readFile(path.join(changeDir, 'design.md'), 'utf8');
    expect(design).not.toMatch(/proof obligation|state model|formal|FRET|PVS/i);

    const completed = await doRelayChangeV1({
      change: 'level-one', projectRoot: root, changedFiles: [], dispatcher: passingRoles([], scenarioId),
      applyCapability: { apply: async (request) => {
        await completeTask(changeDir, request.taskId);
        return { status: 'pass', summary: 'canonical apply completed the task' };
      } },
    });
    expect(completed).toMatchObject({ status: 'pass', applyCalls: 2, run: { status: 'complete' } });
  });

  it('carries discussion intent through independent planning and automatic review repair', async () => {
    const { root, changeDir } = await createOpenSpecProject('behavioral');
    const handoff = confirmDiscussionHandoff({
      handoff: { goal: 'Make cancellation observable and safe.', decisions: [
        { decisionId: 'D1', summary: 'Cancellation stops publication before another result.' },
      ] },
      mappings: [{ decisionId: 'D1', artifact: 'spec', reference: 'specs/demo/spec.md#demonstrate-behavior', status: 'consistent' }],
    });
    expect(handoff.status).toBe('pass');

    await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '',
      '### Requirement: Demonstrate behavior',
      'The worker SHALL stop before publishing another result when cancellation is requested.', '',
      '#### Scenario: Works',
      '- **WHEN** cancellation is requested',
      '- **THEN** the worker stops before another result is published', '',
    ].join('\n'));
    const roleRequests: RoleRequestV1[] = [];
    const plannerRoles = passingRoles(roleRequests);
    const planned = await planRelayChangeV1({
      change: 'behavioral', projectRoot: root, config: defaultConfig, changedFiles: [], dispatcher: plannerRoles,
    });
    expect(planned, JSON.stringify(planned.assurance.readiness, null, 2))
      .toMatchObject({ status: 'pass', review: { independent: true } });
    expect(planned.assurance.semanticClassifications[0]).toMatchObject({ level: 'behavioral' });

    let reviews = 0;
    const executionRoles: RoleDispatcherV1 = { dispatch: async (request) => {
      roleRequests.push(request);
      if (request.role === 'reviewer' && ++reviews === 1) return {
        status: 'fail', summary: 'Cancellation still publishes one result.', evidenceRefs: [], findings: [{
          providerId: 'macos-reviewer', ruleId: 'cancellation-order', category: 'code',
          scope: { kind: 'task', identity: '1.1' }, severity: 'error', blocking: true,
          summary: 'Cancellation ordering is incomplete.', taskIds: ['1.1'], requirementIds: [defaultRequirementId],
        }],
      };
      return qualifiedRoleResult(request.role, defaultScenarioId);
    } };
    const applyRequests: CanonicalApplyRequestV1[] = [];
    const completed = await doRelayChangeV1({
      change: 'behavioral', projectRoot: root, changedFiles: [], dispatcher: executionRoles,
      applyCapability: { apply: async (request) => {
        applyRequests.push(request);
        await completeTask(changeDir, request.taskId);
        return { status: 'pass', summary: 'canonical apply completed the task',
          evidence: request.action === 'repair' ? [{ referenceId: `macos-repair:${request.taskId}`,
            kind: 'generated', externalId: 'macos-behavioral-repair', available: true }] : undefined };
      } },
    });
    expect(completed).toMatchObject({ status: 'pass', convergenceCycles: 2, applyCalls: 3 });
    expect(applyRequests.at(-1)).toMatchObject({ taskId: '1.1', action: 'repair', capability: '$openspec-apply-change' });
    expect(applyRequests.at(-1)?.plannerInstructions.join('\n')).toMatch(/approved OpenSpec task|canonical OpenSpec/i);
    expect(roleRequests.map((request) => request.role)).toEqual(expect.arrayContaining([
      'planner', 'plan_reviewer', 'reviewer', 'verifier',
    ]));
    const packageJson = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    expect(Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).join(' ')).not.toMatch(/\b(?:FRET|PVS)\b/i);
  });

  it('isolates modeling pathfinder analysis and requires disposition for lower achieved assurance', async () => {
    const { root, changeDir } = await createOpenSpecProject('modeling');
    await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '',
      '### Requirement: Demonstrate behavior',
      'Across concurrent authorization state transitions, an unauthenticated actor SHALL never become an owner.', '',
      '#### Scenario: Works',
      '- **WHEN** authorization changes race',
      '- **THEN** an unauthenticated actor never becomes an owner', '',
    ].join('\n'));
    await fs.writeFile(path.join(changeDir, 'design.md'), [
      '## State model', 'Ownership states and transitions are enumerated.', '',
      '## Assumptions', 'State updates are atomic.', '',
      '## Proof obligations', 'Search for a transition counterexample; this is not a proof claim.', '',
    ].join('\n'));
    await fs.writeFile(path.join(changeDir, 'tasks.md'), [
      '## 1. Work', '',
      '- [ ] 1.1 Implement the guarded ownership transition.',
      '- [ ] 1.2 Verify the ownership invariant under competing authorization changes.', '',
    ].join('\n'));
    const lifecycle: string[] = [];
    const pathfinderRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-relay-pathfinder-'));
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => request.role === 'pathfinder'
      ? { status: 'pass', summary: 'Counterexample analysis completed.', evidenceRefs: ['evidence:pathfinder'], pathfinder: {
        assumptions: ['State updates are atomic.'], experiments: ['Enumerate competing transition orders.'],
        observations: ['Authorized ownership remains stable.'],
        counterexamples: ['A stale authorization read can race with ownership assignment.'],
        conclusion: 'Add a compare-and-set precondition to the planned transition.', confidence: 'high', routing: 'planner',
      } }
      : qualifiedRoleResult(request.role, defaultScenarioId) };
    const planned = await planRelayChangeV1({
      change: 'modeling', projectRoot: root, config: defaultConfig, changedFiles: [], dispatcher,
      pathfinderQuestions: ['Can authorization race with ownership assignment?'],
      pathfinderWorkspaces: {
        create: async () => { lifecycle.push('create'); return pathfinderRoot; },
        cleanup: async (_id, workspace) => { lifecycle.push('cleanup'); await fs.rm(workspace, { recursive: true, force: true }); },
      },
    });
    expect(planned).toMatchObject({ status: 'pass', review: { independent: true } });
    expect(planned.pathfinderResults[0]).toMatchObject({ confidence: 'high', routing: 'planner' });
    expect(planned.pathfinderResults[0].counterexamples).toHaveLength(1);
    expect(lifecycle).toEqual(['create', 'cleanup']);
    const classification = planned.assurance.semanticClassifications[0];
    expect(classification.level).toBe('modeling');
    expect(recordSemanticDowngrade({ classification, achievedLevel: 'behavioral' }))
      .toMatchObject({ status: 'human_needed' });
    expect(recordSemanticDowngrade({
      classification, achievedLevel: 'behavioral', reason: 'Residual race risk accepted for the private trial.', actor: 'maintainer',
    })).toMatchObject({ status: 'accepted', actor: 'maintainer' });
  });

  it('stales approval after targeted intent changes, replans, and resumes do automatically', async () => {
    const { root, changeDir } = await createOpenSpecProject('intent-update');
    let intentResolved = false;
    const roles: RoleDispatcherV1 = { dispatch: async (request) => request.role === 'verifier' && !intentResolved
      ? { status: 'fail', summary: 'A material reversibility decision is missing.', evidenceRefs: [], findings: [{
        providerId: 'goal-verifier', ruleId: 'reversibility-intent', category: 'product-intent',
        scope: { kind: 'requirement', identity: defaultRequirementId }, severity: 'error', blocking: true,
        summary: 'The proposal does not say whether the action is reversible.',
        requirementIds: [defaultRequirementId], taskIds: ['1.1'],
      }] }
      : qualifiedRoleResult(request.role, defaultScenarioId) };
    const initialPlan = await planRelayChangeV1({
      change: 'intent-update', projectRoot: root, config: defaultConfig, changedFiles: [], dispatcher: roles,
    });
    expect(initialPlan, JSON.stringify(initialPlan.assurance.readiness, null, 2)).toMatchObject({ status: 'pass' });
    const paused = await doRelayChangeV1({
      change: 'intent-update', projectRoot: root, changedFiles: [], dispatcher: roles,
      applyCapability: { apply: async (request) => {
        await completeTask(changeDir, request.taskId);
        return { status: 'pass', summary: 'canonical apply completed the task' };
      } },
    });
    expect(paused).toMatchObject({ status: 'human_needed', nextAction: '/opsx:discuss intent-update' });

    expect(confirmDiscussionHandoff({
      handoff: { goal: 'Resolve reversibility.', decisions: [{ decisionId: 'D1', summary: 'The action is reversible.' }] },
      mappings: [{ decisionId: 'D1', artifact: 'design', reference: 'design.md#confirmed-intent', status: 'consistent' }],
    }).status).toBe('pass');
    await fs.appendFile(path.join(changeDir, 'design.md'), '\n## Confirmed intent\n\nThe action is reversible.\n');
    const stale = await doRelayChangeV1({
      change: 'intent-update', projectRoot: root, changedFiles: [], dispatcher: roles,
      applyCapability: { apply: async () => ({ status: 'pass', summary: 'unexpected' }) },
    });
    expect(stale).toMatchObject({ status: 'human_needed', applyCalls: 0, nextAction: '/opsx:plan intent-update' });
    intentResolved = true;
    expect((await planRelayChangeV1({
      change: 'intent-update', projectRoot: root, config: defaultConfig, changedFiles: [], dispatcher: roles,
    })).status).toBe('pass');
    const resumed = await doRelayChangeV1({
      change: 'intent-update', projectRoot: root, changedFiles: [], dispatcher: roles,
      applyCapability: { apply: async () => ({ status: 'pass', summary: 'no pending task' }) },
    });
    expect(resumed).toMatchObject({ status: 'pass', applyCalls: 0, run: { status: 'complete' } });
  });
});
