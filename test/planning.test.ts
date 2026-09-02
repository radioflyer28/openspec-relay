import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dispatchRoleV2, type RoleDispatcherV1, type RoleRequestV1 } from '../src/execution-adapters.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { planGsdChangeV1 } from '../src/plan-workflow.js';
import { classifySemanticRequirements } from '../src/semantics.js';
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

const passingDispatcher = (requests: RoleRequestV1[]): RoleDispatcherV1 => ({ dispatch: async (request) => {
  requests.push(request);
  return { status: 'pass', summary: `${request.role} passed`, evidenceRefs: [`evidence:${request.role}`] };
} });

describe('reusable OpenSpec GSD planning', () => {
  it('accepts a read-only assurance dispatcher without granting writable planner authority', async () => {
    const { root } = await createOpenSpecProject();
    const requests: RoleRequestV1[] = [];
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [],
      assuranceDispatcher: passingDispatcher(requests),
    });
    expect(result.status).toBe('pass');
    expect(requests.map((item) => item.role)).toEqual(['plan_reviewer']);
  });

  it('dispatches a writable planner and fresh read-only reviewer, then approves the semantic revision', async () => {
    const { root } = await createOpenSpecProject();
    const requests: RoleRequestV1[] = [];
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [],
      dispatcher: passingDispatcher(requests),
    });
    expect(result).toMatchObject({
      status: 'pass', cycles: 1,
      run: { status: 'planned', planApprovalStatus: 'current' },
      review: { status: 'pass', independent: true },
      assurance: { planApproval: { independent: true } },
    });
    expect(requests.map((item) => item.role)).toEqual(['planner', 'plan_reviewer']);
    expect(requests[0]).toMatchObject({ readOnly: false, isolated: true });
    expect(requests[1]).toMatchObject({ readOnly: true, isolated: true });
    expect(requests[0].planning?.artifactRefs).toEqual(expect.arrayContaining([
      'openspec/changes/demo/proposal.md',
      'openspec/changes/demo/design.md',
      'openspec/changes/demo/tasks.md',
      'openspec/changes/demo/specs/demo/spec.md',
    ]));
    expect(requests[0].planning?.plannerInstructions.join('\n')).toMatch(/only planning truth/i);
  });

  it('discloses Tier 0 self-review and requires an explicit continue choice', async () => {
    const first = await createOpenSpecProject('needs-choice');
    const blocked = await planGsdChangeV1({
      change: 'needs-choice', projectRoot: first.root, config, changedFiles: [],
    });
    expect(blocked).toMatchObject({
      status: 'human_needed', review: { status: 'human_needed', independent: false },
      run: { planApprovalStatus: 'missing' },
    });
    expect(blocked.nextAction).toMatch(/self-review|feedback/i);

    const second = await createOpenSpecProject('continued');
    const continued = await planGsdChangeV1({
      change: 'continued', projectRoot: second.root, config, changedFiles: [], allowSelfReview: true,
    });
    expect(continued).toMatchObject({
      status: 'pass', review: { status: 'pass', independent: false },
      assurance: { planApproval: { independent: false } },
    });
  });

  it('keeps deterministic readiness blockers as an immutable approval lower bound', async () => {
    const { root } = await createOpenSpecProject();
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, changedFiles: [],
      dispatcher: passingDispatcher([]),
    });
    expect(result).toMatchObject({
      status: 'fail', review: { status: 'pass', independent: true },
      assurance: { readiness: { status: 'fail' } },
      run: { planApprovalStatus: 'missing' },
    });
    expect(result.summary).toMatch(/deterministic readiness blockers/i);
  });

  it('isolates planning-only pathfinders and routes technical conclusions through the planner', async () => {
    const { root } = await createOpenSpecProject();
    const requests: RoleRequestV1[] = [];
    const lifecycle: string[] = [];
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => {
      requests.push(request);
      if (request.role === 'pathfinder') return {
        status: 'pass', summary: 'experiment complete', evidenceRefs: ['evidence:pathfinder'],
        pathfinder: {
          assumptions: ['Existing adapter is representative.'],
          experiments: ['Exercise the adapter boundary.'],
          observations: ['The boundary preserved ordering.'],
          counterexamples: ['Cancellation can race with completion.'],
          conclusion: 'Planner should specify cancellation ordering.',
          confidence: 'high', routing: 'planner',
        },
      };
      return { status: 'pass', summary: 'pass', evidenceRefs: [] };
    } };
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [], dispatcher,
      pathfinderQuestions: ['Can cancellation race with completion?'],
      pathfinderWorkspaces: {
        create: async (id) => { lifecycle.push(`create:${id}`); return '/disposable/pathfinder'; },
        cleanup: async (id) => { lifecycle.push(`cleanup:${id}`); },
      },
    });
    expect(result.status).toBe('pass');
    expect(result.pathfinderResults[0]).toMatchObject({ routing: 'planner', confidence: 'high' });
    expect(requests.find((item) => item.role === 'pathfinder')).toMatchObject({
      readOnly: true, isolated: true, workspace: '/disposable/pathfinder',
      planning: { disposableExperimentWorkspace: true },
    });
    expect(lifecycle.map((item) => item.split(':')[0])).toEqual(['create', 'cleanup']);
  });

  it('bounds independent pathfinders without scheduling a writable planner', async () => {
    const { root } = await createOpenSpecProject();
    let active = 0;
    let maximum = 0;
    const roles: string[] = [];
    const assuranceDispatcher: RoleDispatcherV1 = { dispatch: async (request) => {
      roles.push(request.role);
      if (request.role !== 'pathfinder') return { status: 'pass', summary: 'review passed', evidenceRefs: ['review'] };
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: 'pass', summary: 'pathfinder passed', evidenceRefs: ['pathfinder'], pathfinder: {
        assumptions: [], experiments: [], observations: [], counterexamples: [],
        conclusion: 'Evidence is sufficient.', confidence: 'high', routing: 'planner',
      } };
    } };
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [], assuranceDispatcher,
      pathfinderQuestions: ['one', 'two', 'three'], readOnlyConcurrency: 2,
      pathfinderWorkspaces: { create: async (id) => `/tmp/${id}`, cleanup: async () => undefined },
    });
    expect(result.status).toBe('pass');
    expect(maximum).toBe(2);
    expect(roles).not.toContain('planner');
    expect(result.pathfinderResults.map((item) => item.question)).toEqual(['one', 'two', 'three']);
  });

  it('routes material pathfinder conclusions back to targeted discussion', async () => {
    const { root } = await createOpenSpecProject();
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => request.role === 'pathfinder' ? {
      status: 'pass', summary: 'material choice', evidenceRefs: [],
      pathfinder: { assumptions: [], experiments: ['compare behaviors'], observations: ['two product contracts'],
        counterexamples: [], conclusion: 'The human must choose destructive or reversible behavior.',
        confidence: 'high', routing: 'discussion' },
    } : { status: 'pass', summary: 'pass', evidenceRefs: [] } };
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [], dispatcher,
      pathfinderQuestions: ['Which deletion contract applies?'],
      pathfinderWorkspaces: { create: async () => '/tmp/disposable', cleanup: async () => undefined },
    });
    expect(result).toMatchObject({ status: 'human_needed', nextAction: '/opsx:discuss demo' });
    expect(result.assurance.findingRoutes.at(-1)).toMatchObject({ route: 'discussion' });
  });

  it('converges through at most two review cycles and reuses the same capability for do replanning', async () => {
    const { root } = await createOpenSpecProject();
    const requests: RoleRequestV1[] = [];
    let reviews = 0;
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => {
      requests.push(request);
      if (request.role === 'plan_reviewer' && ++reviews === 1) return {
        status: 'fail', summary: 'Missing verification evidence.', evidenceRefs: [],
        findings: [{ providerId: 'plan-reviewer', ruleId: 'verification-capability', category: 'plan',
          scope: { kind: 'task', identity: '1.1' }, severity: 'error', blocking: true,
          summary: 'Verification cannot establish the scenario.', taskIds: ['1.1'] }],
      };
      return { status: 'pass', summary: 'pass', evidenceRefs: [] };
    } };
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [], dispatcher,
      invocation: 'do_replan', findingIds: ['finding:original'],
    });
    expect(result).toMatchObject({ status: 'pass', cycles: 2 });
    expect(requests.filter((item) => item.role === 'planner')).toHaveLength(2);
    expect(requests.every((item) => item.planning?.invocation === 'do_replan')).toBe(true);
    expect(requests.at(-1)?.planning?.findingIds).toContain('finding:original');
    expect(requests.every((item) => item.planning?.artifactRefs.every((ref) =>
      ref.startsWith('openspec/changes/demo/')))).toBe(true);
  });

  it('stops after repeated unchanged blocking concerns', async () => {
    const { root } = await createOpenSpecProject();
    let reviews = 0;
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => {
      if (request.role === 'plan_reviewer') {
        reviews += 1;
        return { status: 'fail', summary: 'same blocker', evidenceRefs: [] };
      }
      return { status: 'pass', summary: 'planner', evidenceRefs: [] };
    } };
    const result = await planGsdChangeV1({ change: 'demo', projectRoot: root, config, changedFiles: [], dispatcher });
    expect(result).toMatchObject({ status: 'fail', cycles: 2 });
    expect(reviews).toBe(2);
  });

  it('preserves a terminal assurance-dispatch diagnostic for remediation', async () => {
    const { root } = await createOpenSpecProject();
    const result = await planGsdChangeV1({
      change: 'demo', projectRoot: root, config, changedFiles: [],
      assuranceDispatcher: { dispatch: async () => ({
        status: 'error', summary: 'Pi role result rejected: findings[0].scope is missing.', evidenceRefs: [],
      }) },
    });
    expect(result).toMatchObject({ status: 'error' });
    expect(result.summary).toContain('findings[0].scope is missing');
  });

  it('rejects writable plan-reviewer and pathfinder contracts before dispatch', async () => {
    const dispatcher = passingDispatcher([]);
    await expect(dispatchRoleV2({ dispatcher, request: {
      role: 'plan_reviewer', readOnly: false, isolated: true,
    } })).rejects.toThrow(/read-only contract/);
    await expect(dispatchRoleV2({ dispatcher, request: {
      role: 'pathfinder', readOnly: false, isolated: true,
    } })).rejects.toThrow(/read-only contract/);
  });

  it('classifies authorization state as modeling and refuses malformed controlled semantics', async () => {
    const authorization = await createOpenSpecProject('authorization-state');
    await fs.writeFile(path.join(authorization.changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '',
      '### Requirement: Demonstrate behavior',
      'The policy engine SHALL preserve role permissions after session refresh.', '',
      '#### Scenario: Works', '- **WHEN** the session refreshes', '- **THEN** role permissions are preserved', '',
    ].join('\n'));
    const modeled = await planGsdChangeV1({
      change: 'authorization-state', projectRoot: authorization.root, config, changedFiles: [],
      dispatcher: passingDispatcher([]),
    });
    expect(modeled.assurance.semanticClassifications[0]).toMatchObject({ level: 'modeling' });
    expect(modeled).toMatchObject({ status: 'fail', run: { planApprovalStatus: 'missing' } });

    const malformed = await createOpenSpecProject('malformed-semantics');
    await fs.writeFile(path.join(malformed.changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '',
      '### Requirement: Demonstrate behavior',
      'Cancellation requested before publication.', '',
      '#### Scenario: Works', '- **WHEN** cancellation is requested', '- **THEN** publication stops', '',
    ].join('\n'));
    const rejected = await planGsdChangeV1({
      change: 'malformed-semantics', projectRoot: malformed.root, config, changedFiles: [],
      dispatcher: passingDispatcher([]),
    });
    expect(rejected).toMatchObject({ status: 'fail', run: { planApprovalStatus: 'missing' } });
    expect(rejected.summary).toMatch(/semantic structure/i);
  });

  it('reconciles production planner classifications without allowing them to erase the deterministic minimum', async () => {
    const { root, changeDir } = await createOpenSpecProject('planner-lower-bound');
    const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: config.taskOverrides });
    const minimum = classifySemanticRequirements(compiled.requirements)[0];
    expect(minimum.level).toBe('behavioral');
    const dispatcher: RoleDispatcherV1 = { dispatch: async (request) => request.role === 'planner'
      ? { status: 'pass', summary: 'planner attempted a lower level', evidenceRefs: [], semanticClassifications: [{
        ...minimum, level: 'simple', rationale: 'The planner claimed this was ordinary.', provenance: 'planner',
      }] }
      : { status: 'pass', summary: 'review passed', evidenceRefs: [] } };
    await expect(planGsdChangeV1({
      change: 'planner-lower-bound', projectRoot: root, config, changedFiles: [], dispatcher,
    })).rejects.toThrow(/lower bound/i);
  });
});
