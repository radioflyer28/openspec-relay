import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { appendRelayEventV2, createRelayEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import { dispatchRoleV2 } from '../src/execution-adapters.js';
import { routeDispatchedFindingsV1 } from '../src/finding-routing.js';
import { planRelayChangeV1 } from '../src/plan-workflow.js';
import { checkRelayRunV2 } from '../src/runner-v2.js';
import { recordSemanticDowngrade } from '../src/semantics.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;
const config = { taskOverrides: {
  '1.1': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
  '1.2': { requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'] },
} };

const dispatcher = { dispatch: async (request: { role: string }) => ({
  status: 'pass' as const, summary: `${request.role} pass`, evidenceRefs: [`evidence:${request.role}`],
}) };

describe('planning assurance and privileged finding routes', () => {
  it('preserves the same semantic minimum and planning-assurance gate in every execution mode', async () => {
    const observed: Array<{ mode: string; level?: string; check?: string }> = [];
    for (const mode of ['quick', 'guarded', 'full'] as const) {
      const project = await createOpenSpecProject(`mode-${mode}`);
      await planRelayChangeV1({ change: `mode-${mode}`, projectRoot: project.root,
        config: { ...config, mode }, changedFiles: [], allowSelfReview: true });
      const checked = await checkRelayRunV2({ change: `mode-${mode}`, projectRoot: project.root, changedFiles: [] });
      observed.push({ mode, level: checked.assurance.semanticClassifications[0]?.level,
        check: checked.assurance.checks.find((item) => item.kind === 'planning-assurance')?.status });
    }
    expect(observed.map((item) => item.level)).toEqual(['behavioral', 'behavioral', 'behavioral']);
    expect(observed.map((item) => item.check)).toEqual(['warn', 'warn', 'warn']);
  });

  it('reports independent and disclosed self-review provenance distinctly', async () => {
    const independentProject = await createOpenSpecProject('independent');
    await planRelayChangeV1({ change: 'independent', projectRoot: independentProject.root,
      config, changedFiles: [], dispatcher });
    const independent = await checkRelayRunV2({ change: 'independent', projectRoot: independentProject.root, changedFiles: [] });
    expect(independent.assurance.checks.find((item) => item.kind === 'planning-assurance'))
      .toMatchObject({ status: 'pass', independent: true });

    const selfProject = await createOpenSpecProject('self');
    await planRelayChangeV1({ change: 'self', projectRoot: selfProject.root,
      config, changedFiles: [], allowSelfReview: true });
    const self = await checkRelayRunV2({ change: 'self', projectRoot: selfProject.root, changedFiles: [] });
    expect(self.assurance.checks.find((item) => item.kind === 'planning-assurance'))
      .toMatchObject({ status: 'warn', independent: false, summary: expect.stringMatching(/self-review/i) });
  });

  it('fails planning assurance when authoritative meaning changes after approval', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await planRelayChangeV1({ change: 'demo', projectRoot: root, config, changedFiles: [], dispatcher });
    await fs.appendFile(`${changeDir}/design.md`, '\nA new semantic obligation.\n');
    const checked = await checkRelayRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    expect(checked.run.planApprovalStatus).toBe('stale');
    expect(checked.assurance.checks.find((item) => item.kind === 'planning-assurance'))
      .toMatchObject({ status: 'fail', summary: expect.stringMatching(/stale/i) });
  });

  it('requires human action for an unresolved semantic downgrade and warns after audited acceptance', async () => {
    for (const accepted of [false, true]) {
      const { root, changeDir } = await createOpenSpecProject(`downgrade-${accepted}`);
      const planned = await planRelayChangeV1({ change: `downgrade-${accepted}`, projectRoot: root,
        config, changedFiles: [], dispatcher });
      const classification = planned.assurance.semanticClassifications[0];
      const downgrade = recordSemanticDowngrade({
        classification,
        achievedLevel: 'simple',
        ...(accepted ? { reason: 'Risk accepted for this private evaluation.', actor: 'maintainer' } : {}),
      });
      const store = await readEventStoreV2(changeDir);
      await appendRelayEventV2({ changeDir, event: createRelayEventV2({
        eventId: `downgrade:${accepted}`, runId: store.runId, changeName: store.changeName,
        occurredAt: '2026-08-29T12:00:00.000Z', sourceDigests: {}, actor: accepted
          ? { kind: 'human', id: 'maintainer' } : { kind: 'planner' },
        provenance: { origin: 'planning-assurance-test' },
        payload: { type: 'semantic.downgrade_recorded', downgrade },
      }) });
      const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: store.seed.config.taskOverrides });
      await writeReplayedProjectionsV2({ changeDir, store: await readEventStoreV2(changeDir), compiled });
      const checked = await checkRelayRunV2({ change: `downgrade-${accepted}`, projectRoot: root, changedFiles: [] });
      expect(checked.assurance.checks.find((item) => item.kind === 'planning-assurance')?.status)
        .toBe(accepted ? 'warn' : 'human_needed');
    }
  });

  it('derives stable intent routing only from an opaque verifier receipt', async () => {
    const receipt = await dispatchRoleV2({
      request: { role: 'verifier', readOnly: true, isolated: true, planning: {
        changeName: 'demo', planRevision: 'a'.repeat(64), invocation: 'do_replan',
        artifactRefs: ['proposal.md'], plannerInstructions: [], semanticObligations: [], evidenceRequirements: [],
      } },
      dispatcher: { dispatch: async () => ({
        status: 'fail', summary: 'Intent omission', evidenceRefs: [],
        findings: [{ providerId: 'goal-verifier', ruleId: 'requirement-omission', category: 'product-intent',
          scope: { kind: 'requirement', identity: requirementId }, severity: 'error', blocking: true,
          summary: 'The implementation exposes behavior contradicted by the requirement.', requirementIds: [requirementId] }],
      }) },
    });
    expect(routeDispatchedFindingsV1({ receipt, planRevision: 'a'.repeat(64), attempt: 1 }))
      .toEqual([expect.objectContaining({ source: 'verifier', route: 'discussion', findingId: expect.stringMatching(/^finding:/) })]);
    expect(() => routeDispatchedFindingsV1({
      receipt: { ...receipt, dispatchId: 'forged' }, planRevision: 'a'.repeat(64), attempt: 1,
    })).toThrow(/orchestrator-issued/i);
  });

  it('triages implementation, plan, modeling, and evidence gaps without caller-selected provenance', async () => {
    const receipt = await dispatchRoleV2({
      request: { role: 'reviewer', readOnly: true, isolated: true, planning: {
        changeName: 'demo', planRevision: 'b'.repeat(64), invocation: 'do_replan',
        artifactRefs: ['tasks.md'], plannerInstructions: [], semanticObligations: [], evidenceRequirements: [],
      } },
      dispatcher: { dispatch: async () => ({ status: 'fail', summary: 'four gaps', evidenceRefs: [], findings: [
        { providerId: 'review', ruleId: 'defect', category: 'correctness', scope: { kind: 'task', identity: '1.1' },
          severity: 'error', blocking: true, summary: 'Implementation defect.', taskIds: ['1.1'] },
        { providerId: 'review', ruleId: 'coverage', category: 'plan', scope: { kind: 'task', identity: '1.2' },
          severity: 'error', blocking: true, summary: 'Task coverage is incomplete.' },
        { providerId: 'review', ruleId: 'state', category: 'modeling', scope: { kind: 'requirement', identity: requirementId },
          severity: 'error', blocking: true, summary: 'Unknown technical feasibility needs a counterexample.' },
        { providerId: 'review', ruleId: 'proof', category: 'assurance', scope: { kind: 'requirement', identity: requirementId },
          severity: 'error', blocking: true, summary: 'Verification evidence is insufficient.' },
      ] }) },
    });
    expect(routeDispatchedFindingsV1({ receipt, planRevision: 'b'.repeat(64), attempt: 1 }).map((item) => item.route))
      .toEqual(['executor', 'planner', 'pathfinder', 'planner']);
  });
});
