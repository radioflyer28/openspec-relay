import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { appendGsdEventV2, createGsdEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import { discoverFinding, transitionFinding } from '../src/findings.js';
import { dispatchRoleV2, type DispatchedRoleResultV2 } from '../src/execution-adapters.js';
import { checkGsdRunV2, startGsdRunV2 } from '../src/runner-v2.js';
import {
  observeDebugExperimentV2,
  planDebugExperimentV2,
  presentUatV2,
  recordDebugHypothesisV2,
  recordDispatchedRoleResultV2,
  recordWorkflowResultV2,
  recordUatV2,
  resolveDebugSessionV2,
  recordDebugConclusionV2,
  transitionFindingV2,
  verifyFindingFromDispatchedResultV2,
} from '../src/v2-operations.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';
import { readAssuranceStateV2 } from '../src/state.js';
import { runLocalReleaseCommand, type HostReleaseRunnerV2 } from '../src/release-assurance.js';

afterEach(cleanupTemporaryRoots);

const coreCli = path.resolve(process.env.OPENSPEC_CORE_ROOT ?? path.join('..', 'OpenSpec'), 'bin', 'openspec.js');

function openspec(root: string, args: string[]) {
  return spawnSync(process.execPath, [coreCli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      CI: 'true',
      OPENSPEC_NO_UPDATE_CHECK: '1',
      OPENSPEC_TELEMETRY: '0',
      DO_NOT_TRACK: '1',
    },
  });
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;
const portableEvidence = [{
  referenceId: 'test:tier0-e2e', kind: 'generated' as const, externalId: 'tier0-e2e', available: true,
}];
const trustedTestRunner: HostReleaseRunnerV2 = {
  async run(request) {
    const result = await runLocalReleaseCommand(request);
    return {
      exitCode: result.exitCode,
      outputDigest: digest(`${result.stdout}\0${result.stderr}`),
    };
  },
};

async function recordFinding(options: {
  changeDir: string;
  finding: ReturnType<typeof discoverFinding>;
  occurredAt: string;
}) {
  const store = await readEventStoreV2(options.changeDir);
  const compiled = await compileOpenSpecChange({ changeDir: options.changeDir, taskMetadata: store.seed.config.taskOverrides });
  await appendGsdEventV2({
    changeDir: options.changeDir,
    event: createGsdEventV2({
      eventId: `e2e:${options.finding.findingId}`,
      runId: store.runId,
      changeName: store.changeName,
      occurredAt: options.occurredAt,
      sourceDigests: Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest])),
      actor: { kind: 'reviewer', id: 'e2e-reviewer' },
      provenance: { origin: 'tier0-e2e' },
      payload: { type: 'finding.discovered', finding: options.finding },
    }),
  });
  await writeReplayedProjectionsV2({
    changeDir: options.changeDir,
    store: await readEventStoreV2(options.changeDir),
    compiled,
  });
}

describe('Tier 0 OpenSpec GSD end-to-end assurance', () => {
  it('remediates readiness, converges review and debugging, records UAT and release evidence, then archives', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.writeFile(path.join(changeDir, 'tasks.md'), [
      '## 1. Work',
      '',
      '- [ ] 1.1 Implement public API behavior',
      '',
    ].join('\n'));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: 'gsd-tier0-e2e', version: '1.0.0', type: 'module', exports: './index.js',
    }));
    await fs.writeFile(path.join(root, 'index.js'), 'export const works = false;\n');
    await fs.writeFile(path.join(root, 'README.md'), '# Tier 0\n\nInstall with `npm install gsd-tier0-e2e`.\n');

    const configuration = {
      mode: 'quick' as const,
      repairLimit: 1,
      taskOverrides: {
        '1.1': {
          requirementRefs: [requirementId], scenarioRefs: [scenarioId], writeSet: ['index.js', 'package.json'],
        },
      },
      features: { readiness: { rollout: 'required' as const } },
    };
    const unready = await startGsdRunV2({
      change: 'demo', projectRoot: root, config: configuration, changedFiles: ['package.json', 'index.js'],
      now: '2026-08-11T20:40:00.000Z',
    });
    expect(unready).toMatchObject({ blockedBeforeExecution: true, assurance: { readiness: { status: 'fail' } } });

    await fs.writeFile(path.join(changeDir, 'tasks.md'), [
      '## 1. Work',
      '',
      '- [ ] 1.1 Implement public API behavior',
      '- [ ] 1.2 Update documentation',
      '',
    ].join('\n'));
    const remediated = await checkGsdRunV2({
      change: 'demo', projectRoot: root, changedFiles: ['package.json', 'index.js'], now: '2026-08-11T20:41:00.000Z',
    });
    expect(remediated.assurance.readiness).toMatchObject({ status: 'pass' });

    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'e2e:task:1.1:start', occurredAt: '2026-08-11T20:42:00.000Z',
      stage: 'host',
      payload: { type: 'task.transition', taskId: '1.1', status: 'in_progress' },
    });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'e2e:task:1.1:complete', occurredAt: '2026-08-11T20:42:01.000Z',
      stage: 'host',
      payload: { type: 'task.transition', taskId: '1.1', status: 'complete' },
    });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'e2e:task:1.2:complete', occurredAt: '2026-08-11T20:42:02.000Z',
      stage: 'host',
      payload: { type: 'task.transition', taskId: '1.2', status: 'complete' },
    });

    const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: configuration.taskOverrides });
    const sourceDigests = Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
    const evidence = async (evidenceId: string, checkId: string, reference: string, observedAt: string,
      actor: { kind: 'executor' | 'verifier'; id: string } = { kind: 'verifier', id: 'e2e-verifier' },
      details: Partial<{ phase: 'red' | 'green' | 'verify'; sourceState: string; exitCode: number;
        result: 'pass' | 'fail'; relevantFailure: boolean }> = {}): Promise<DispatchedRoleResultV2 | undefined> => {
      const payload = {
        type: 'evidence.recorded',
        evidence: {
          evidenceId, taskId: '1.1', phase: details.phase ?? 'verify', checkId, observedAt,
          sourceState: details.sourceState ?? 'tier0-e2e', sourceDigests,
          exitCode: details.exitCode ?? 0, result: details.result ?? 'pass',
          outputDigest: digest(evidenceId), relevantFailure: details.relevantFailure,
          preExistingFailure: false,
          origin: actor.kind, reference,
        },
      } as const;
      if (actor.kind === 'executor') {
        await recordWorkflowResultV2({
          change: 'demo', projectRoot: root, eventId: `e2e:evidence:${evidenceId}`, occurredAt: observedAt,
          stage: 'executor', actorId: actor.id, payload,
        });
        return undefined;
      }
      const receipt = await dispatchRoleV2({
        request: { role: 'verifier', readOnly: true, isolated: true },
        dispatcher: { dispatch: async () => ({
          status: 'pass', summary: `${checkId} passed.`, evidenceRefs: [reference],
          evidence: portableEvidence, events: [payload],
        }) },
      });
      await recordDispatchedRoleResultV2({ change: 'demo', projectRoot: root, receipt, now: observedAt });
      return receipt;
    };
    await evidence('repository', 'repository-checks', 'reports/repository.txt', '2026-08-11T20:43:00.000Z');
    await evidence('targeted', 'targeted-tests', 'reports/targeted.txt', '2026-08-11T20:43:01.000Z');
    await evidence('scenario', 'scenario-coverage', scenarioId, '2026-08-11T20:43:02.000Z');
    await evidence('goal', 'goal-verification', 'reports/goal.txt', '2026-08-11T20:43:03.000Z');
    await evidence('debug-red', 'targeted-tests', 'reports/debug-red.txt', '2026-08-11T20:41:30.000Z',
      { kind: 'executor', id: 'e2e-executor' },
      { phase: 'red', sourceState: 'before-fix', exitCode: 1, result: 'fail', relevantFailure: true });

    const defect = discoverFinding({
      providerId: 'review', ruleId: 'e2e-defect', category: 'review',
      scope: { kind: 'requirement', identity: requirementId }, severity: 'error', blocking: true,
      summary: 'The reviewer found a concrete behavior defect.', requirementIds: [requirementId], taskIds: ['1.1'],
      evidence: portableEvidence, occurredAt: '2026-08-11T20:44:00.000Z', sourceRevision: digest('initial'),
      actor: { kind: 'reviewer', id: 'e2e-reviewer' },
    });
    await recordFinding({ changeDir, finding: defect, occurredAt: '2026-08-11T20:44:00.000Z' });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'e2e:repair:exhausted', occurredAt: '2026-08-11T20:44:01.000Z',
      stage: 'executor',
      payload: { type: 'repair.recorded', repair: {
        repairId: 'e2e-repair', checkId: 'targeted-tests', attempt: 1, startedAt: '2026-08-11T20:44:01.000Z',
        changedReferences: ['index.js'], result: 'fail',
      } },
    });
    const debugging = { session: (await readAssuranceStateV2(changeDir)).debugSessions.find((item) =>
      item.logicalFailureId === 'check:targeted-tests')! };
    const hypothesis = await recordDebugHypothesisV2({
      change: 'demo', projectRoot: root, sessionId: debugging.session.sessionId,
      statement: 'The public behavior lacks its required condition.', now: '2026-08-11T20:44:03.000Z',
    });
    const experiment = await planDebugExperimentV2({
      change: 'demo', projectRoot: root, sessionId: debugging.session.sessionId,
      hypothesisId: hypothesis.hypotheses[0].hypothesisId, action: 'Run the focused regression check.',
      evidence: portableEvidence, now: '2026-08-11T20:44:04.000Z',
    });
    await observeDebugExperimentV2({
      change: 'demo', projectRoot: root, sessionId: debugging.session.sessionId,
      experimentId: experiment.experiments[0].experimentId, result: 'passed',
      observation: 'The focused regression check confirms the condition.', now: '2026-08-11T20:44:05.000Z',
    });
    await recordDebugConclusionV2({
      change: 'demo', projectRoot: root, sessionId: debugging.session.sessionId,
      kind: 'root_cause', statement: 'The public behavior omitted its required condition.',
      experimentIds: [experiment.experiments[0].experimentId], evidence: portableEvidence,
      now: '2026-08-11T20:44:05.500Z',
    });
    await fs.writeFile(path.join(root, 'index.js'), 'export const works = true;\n');
    await checkGsdRunV2({
      change: 'demo', projectRoot: root, changedFiles: ['package.json', 'index.js'],
      now: '2026-08-11T20:44:05.600Z',
    });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'e2e:repair:complete', occurredAt: '2026-08-11T20:44:05.700Z',
      stage: 'executor', payload: { type: 'repair.recorded', repair: {
        repairId: 'e2e-repair-complete', checkId: 'targeted-tests', attempt: 2,
        startedAt: '2026-08-11T20:44:05.600Z', completedAt: '2026-08-11T20:44:05.700Z',
        changedReferences: ['index.js'], result: 'pass',
      } },
    });
    const debugVerifier = (await evidence('debug-green', 'targeted-tests', 'reports/debug-green.txt',
      '2026-08-11T20:44:05.750Z', { kind: 'verifier', id: 'e2e-debug-verifier' },
      { phase: 'green', sourceState: 'after-fix', exitCode: 0, result: 'pass' }))!;
    await resolveDebugSessionV2({
      change: 'demo', projectRoot: root, sessionId: debugging.session.sessionId,
      redEvidenceId: 'debug-red', greenEvidenceId: 'debug-green', verificationResult: debugVerifier,
      now: '2026-08-11T20:44:06.000Z',
    });
    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: defect.findingId, action: 'repair',
      actorId: 'e2e-executor', reason: 'Applied the investigated correction.',
      evidence: portableEvidence, now: '2026-08-11T20:44:07.000Z',
    });
    const findingVerifier = await dispatchRoleV2({
      request: { role: 'verifier', readOnly: true, isolated: true },
      dispatcher: { dispatch: async () => ({
        status: 'pass', summary: 'Rechecked the original review concern.',
        evidenceRefs: portableEvidence.map((item) => item.referenceId), evidence: portableEvidence,
      }) },
    });
    await verifyFindingFromDispatchedResultV2({
      change: 'demo', projectRoot: root, findingId: defect.findingId, receipt: findingVerifier,
      reason: 'Rechecked the original review concern.', now: '2026-08-11T20:44:08.000Z',
    });

    const humanFinding = transitionFinding({
      finding: discoverFinding({
        providerId: 'review', ruleId: 'human-observation', category: 'acceptance',
        scope: { kind: 'scenario', identity: scenarioId }, severity: 'error', blocking: true,
        summary: 'A maintainer must observe the expected behavior.', requirementIds: [requirementId], taskIds: ['1.1'],
        evidence: portableEvidence, occurredAt: '2026-08-11T20:45:00.000Z', sourceRevision: digest('uat'),
        actor: { kind: 'reviewer', id: 'e2e-reviewer' },
      }),
      to: 'human_needed', actor: { kind: 'reviewer', id: 'e2e-reviewer' },
      reason: 'Automated checks cannot observe the acceptance scenario.', evidence: portableEvidence,
      sourceRevision: digest('uat'), occurredAt: '2026-08-11T20:45:01.000Z',
    });
    await recordFinding({ changeDir, finding: humanFinding, occurredAt: '2026-08-11T20:45:01.000Z' });
    const uat = await presentUatV2({ change: 'demo', projectRoot: root, now: '2026-08-11T20:45:02.000Z' });
    expect(uat.next).toMatchObject({ scenarioId });
    await recordUatV2({
      change: 'demo', projectRoot: root, scenarioId: uat.next!.scenarioId, status: 'passed', actor: 'maintainer',
      notes: 'Observed the expected behavior.', evidence: portableEvidence, now: '2026-08-11T20:45:03.000Z',
    });

    const ready = await checkGsdRunV2({
      change: 'demo', projectRoot: root, changedFiles: ['package.json', 'index.js'], now: '2026-08-11T20:46:00.000Z',
      adapters: { releaseRunner: trustedTestRunner },
    });
    expect(ready, JSON.stringify({
      run: ready.run.status,
      assurance: ready.assurance.status,
      debugSessions: ready.assurance.debugSessions,
      findings: ready.assurance.findings,
      checks: ready.assurance.checks,
      releaseCandidates: ready.assurance.releaseCandidates,
      unresolvedHumanActions: ready.assurance.unresolvedHumanActions,
      nextActions: ready.assurance.nextActions,
    }, null, 2)).toMatchObject({ run: { status: 'complete' }, assurance: { status: 'pass' } });
    expect(ready.assurance.releaseCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: 'node_package', status: 'pass' }),
    ]));

    const initialized = openspec(root, ['init', '--tools', 'codex', '--force', '--no-animation']);
    expect(initialized.status, initialized.stderr || initialized.stdout).toBe(0);
    const linked = openspec(root, ['extension', 'link', path.resolve('.')]);
    expect(linked.status, linked.stderr || linked.stdout).toBe(0);
    const archived = openspec(root, ['archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json']);
    expect(archived.status, archived.stderr || archived.stdout).toBe(0);
    expect(JSON.parse(archived.stdout)).toMatchObject({ archive: expect.objectContaining({ path: expect.any(String) }) });
  }, 90_000);
});
