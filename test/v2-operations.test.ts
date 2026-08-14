import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { describe, expect, it, afterEach } from 'vitest';
import { discoverFinding, transitionFinding } from '../src/findings.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { appendGuardrailsEventV2, createGuardrailsEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import { startGuardrailsRunV2 } from '../src/runner-v2.js';
import { readAssuranceStateV2 } from '../src/state.js';
import {
  presentUatV2,
  recordWorkflowResultV2,
  recordUatV2,
  resolveDebugSessionV2,
  transitionFindingV2,
} from '../src/v2-operations.js';
import { checkGuardrailsRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const now = '2026-08-09T15:00:00.000Z';

function digests(artifacts: Array<{ path: string; sourceDigest: string }>) {
  return Object.fromEntries(artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
}

async function addHumanFinding(root: string, changeDir: string) {
  const store = await readEventStoreV2(changeDir);
  const compiled = await compileOpenSpecChange({ changeDir });
  const requirementId = 'spec:demo#requirement:demonstrate-behavior';
  const discovered = discoverFinding({
    providerId: 'review', ruleId: 'needs-human', category: 'acceptance',
    scope: { kind: 'scenario', identity: `${requirementId}/scenario:works` },
    severity: 'error', blocking: true, summary: 'A human needs to observe the result.',
    requirementIds: [requirementId], taskIds: ['1.1'],
    evidence: [{ referenceId: 'test:human', kind: 'generated', externalId: 'human', available: true }],
    occurredAt: now, sourceRevision: createHash('sha256').update('source').digest('hex'),
    actor: { kind: 'reviewer' },
  });
  const finding = transitionFinding({
    finding: discovered,
    to: 'human_needed',
    actor: { kind: 'reviewer' },
    reason: 'A human must observe the scenario before this finding can close.',
    evidence: discovered.evidence,
    sourceRevision: createHash('sha256').update('source').digest('hex'),
    occurredAt: now,
  });
  await appendGuardrailsEventV2({
    changeDir,
    event: createGuardrailsEventV2({
      eventId: 'test:human-finding', runId: store.runId, changeName: store.changeName, occurredAt: now,
      sourceDigests: digests(compiled.artifacts), actor: { kind: 'reviewer' },
      provenance: { origin: 'test' }, payload: { type: 'finding.discovered', finding },
    }),
  });
  await writeReplayedProjectionsV2({ changeDir, store: await readEventStoreV2(changeDir), compiled });
  return finding;
}

describe('v2 debug and UAT operations', () => {
  it('records an executor repair and a separately authorized verifier closure for a stable finding', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const started = await startGuardrailsRunV2({ change: 'demo', projectRoot: root });
    const finding = await addHumanFinding(root, changeDir);
    const evidence = [{ referenceId: 'test:repair', kind: 'generated' as const, externalId: 'repair', available: true }];

    await expect(recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'forged-verifier-result', stage: 'executor',
      payload: { type: 'evidence.recorded', evidence: {
        evidenceId: 'forged-verifier-result', phase: 'verify', checkId: 'goal-verification',
        observedAt: '2026-08-09T15:00:00.000Z', sourceState: 'forged',
        sourceDigests: digests(started.run.artifacts), exitCode: 0, result: 'pass',
        outputDigest: createHash('sha256').update('forged').digest('hex'), preExistingFailure: false,
        origin: 'verifier',
      } },
    })).rejects.toThrow(/does not match orchestrated executor stage/i);

    const repaired = await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'repair',
      actorId: 'executor-1', reason: 'Implemented the required repair.', evidence,
      now: '2026-08-09T15:01:00.000Z',
    });
    expect(repaired).toMatchObject({ state: 'repaired', transitions: expect.arrayContaining([
      expect.objectContaining({ to: 'repaired', actor: { kind: 'executor', id: 'executor-1' } }),
    ]) });

    await expect(transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'verify',
      actorId: 'executor-1', reason: 'Self verification is not independent.', evidence, now: '2026-08-09T15:02:00.000Z',
    })).rejects.toThrow(/distinct from the repair executor/i);

    const verified = await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'verify',
      actorId: 'verifier-1', reason: 'Verified the original concern against current evidence.', evidence,
      now: '2026-08-09T15:03:00.000Z',
    });
    expect(verified).toMatchObject({ state: 'independently_verified', transitions: expect.arrayContaining([
      expect.objectContaining({ to: 'independently_verified', actor: { kind: 'verifier', id: 'verifier-1' } }),
    ]) });
    expect((await readAssuranceStateV2(changeDir)).findings).toEqual([
      expect.objectContaining({ findingId: finding.findingId, state: 'independently_verified' }),
    ]);
  });

  it('invalidates verified findings and accepted UAT after a material specification change', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, config: {
      features: { uat: { enabled: true, required: true } },
    } });
    const finding = await addHumanFinding(root, changeDir);
    const repairEvidence = [{ referenceId: 'test:repair', kind: 'generated' as const, externalId: 'repair', available: true }];
    await transitionFindingV2({ change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'repair',
      actorId: 'executor', reason: 'Repaired.', evidence: repairEvidence });
    await transitionFindingV2({ change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'verify',
      actorId: 'verifier', reason: 'Verified.', evidence: repairEvidence });
    const presented = await presentUatV2({ change: 'demo', projectRoot: root });
    await recordUatV2({ change: 'demo', projectRoot: root, scenarioId: presented.next!.scenarioId,
      status: 'passed', actor: 'maintainer', notes: 'Observed.' });
    await fs.appendFile(`${changeDir}/specs/demo/spec.md`, '\n<!-- materially revised acceptance contract -->\n');
    const checked = await checkGuardrailsRunV2({ change: 'demo', projectRoot: root });
    expect(checked.assurance.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ findingId: finding.findingId, state: 'stale' }),
    ]));
    expect(checked.assurance.uatScenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ scenarioId: presented.next!.scenarioId, status: 'stale' }),
    ]));
  }, 30_000);

  it('returns a failed UAT scenario to the production retest queue after independent repair verification', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: [], config: {
      features: { uat: { enabled: true, required: true } },
    } });
    const presented = await presentUatV2({ change: 'demo', projectRoot: root });
    const scenarioId = presented.next!.scenarioId;
    await recordUatV2({
      change: 'demo', projectRoot: root, scenarioId, status: 'failed', actor: 'maintainer',
      notes: 'The acceptance scenario failed.',
      evidence: [{ referenceId: 'test:uat-failure', kind: 'generated', externalId: 'uat-failure', available: true }],
    });
    const failed = (await readAssuranceStateV2(changeDir)).findings.find((item) =>
      item.providerId === 'uat' && item.scope.identity === scenarioId)!;
    const repairEvidence = [{
      referenceId: 'test:uat-repair', kind: 'generated' as const, externalId: 'uat-repair', available: true,
    }];
    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: failed.findingId, action: 'repair',
      actorId: 'executor', reason: 'Repaired the failed behavior.', evidence: repairEvidence,
    });
    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: failed.findingId, action: 'verify',
      actorId: 'verifier', reason: 'Verified the repair against current evidence.',
      evidence: repairEvidence,
    });
    const retest = await presentUatV2({ change: 'demo', projectRoot: root });
    expect(retest.next).toMatchObject({ scenarioId, status: 'awaiting_retest' });
    expect(retest.next).not.toHaveProperty('disposition');
  }, 20_000);

  it('invalidates lifecycle acceptance when exact cited repository evidence changes', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.mkdir(`${root}/src`, { recursive: true });
    await fs.writeFile(`${root}/src/index.ts`, 'export const value = 1;\n');
    await startGuardrailsRunV2({
      change: 'demo', projectRoot: root, changedFiles: ['src/index.ts'],
      config: { features: { uat: { enabled: true, required: true } } },
    });
    const store = await readEventStoreV2(changeDir);
    const compiled = await compileOpenSpecChange({ changeDir });
    const repositoryEvidence = [{
      referenceId: 'repository:src/index.ts', kind: 'repository' as const, path: 'src/index.ts', available: true,
    }];
    const finding = discoverFinding({
      providerId: 'review', ruleId: 'source-defect', category: 'correctness',
      scope: { kind: 'location', identity: 'src/index.ts' }, severity: 'error', blocking: true,
      summary: 'The changed source needs repair.', requirementIds: [], taskIds: ['1.1'], evidence: repositoryEvidence,
      occurredAt: now, sourceRevision: createHash('sha256').update('initial').digest('hex'), actor: { kind: 'reviewer' },
    });
    await appendGuardrailsEventV2({ changeDir, event: createGuardrailsEventV2({
      eventId: 'source-finding', runId: store.runId, changeName: store.changeName, occurredAt: now,
      sourceDigests: digests(compiled.artifacts), actor: { kind: 'reviewer' }, provenance: { origin: 'test' },
      payload: { type: 'finding.discovered', finding },
    }) });
    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'repair',
      actorId: 'executor', reason: 'Repaired.', evidence: repositoryEvidence,
    });
    const verified = await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'verify',
      actorId: 'verifier', reason: 'Verified.', evidence: repositoryEvidence,
    });
    expect(verified.transitions.at(-1)?.evidence).toEqual([
      expect.objectContaining({ referenceId: 'repository:src/index.ts', digest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    const presented = await presentUatV2({ change: 'demo', projectRoot: root });
    await recordUatV2({
      change: 'demo', projectRoot: root, scenarioId: presented.next!.scenarioId,
      status: 'passed', actor: 'maintainer', notes: 'Observed current behavior.', evidence: repositoryEvidence,
    });
    expect((await readAssuranceStateV2(changeDir)).uatScenarios.find((item) =>
      item.scenarioId === presented.next!.scenarioId)?.disposition?.evidence).toEqual([
      expect.objectContaining({ referenceId: 'repository:src/index.ts', digest: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    await fs.writeFile(`${root}/src/index.ts`, 'export const value = 2;\n');
    const checked = await checkGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: ['src/index.ts'] });
    expect(checked.assurance.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ findingId: finding.findingId, state: 'stale' }),
    ]));
    expect(checked.assurance.uatScenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ scenarioId: presented.next!.scenarioId, status: 'stale' }),
    ]));
  }, 20_000);

  it('automatically begins a resumable debug session after repair exhaustion and records human-needed when debugging is unavailable', async () => {
    const active = await createOpenSpecProject('active');
    await startGuardrailsRunV2({ change: 'active', projectRoot: active.root, config: { repairLimit: 1 } });
    const repair = (change: string) => recordWorkflowResultV2({
      change, projectRoot: active.root, eventId: `repair:${change}`,
      stage: 'executor',
      payload: {
        type: 'repair.recorded', repair: {
          repairId: `repair:${change}`, checkId: 'targeted-tests', attempt: 1, startedAt: now,
          changedReferences: ['tasks.md'], result: 'fail',
        },
      },
    });
    await repair('active');
    expect((await readAssuranceStateV2(active.changeDir)).debugSessions).toEqual([
      expect.objectContaining({ status: 'active' }),
    ]);

    const unavailable = await createOpenSpecProject('unavailable');
    await startGuardrailsRunV2({ change: 'unavailable', projectRoot: unavailable.root, config: {
      repairLimit: 1, features: { debug: { enabled: false, automaticTransition: false } },
    } });
    await recordWorkflowResultV2({
      change: 'unavailable', projectRoot: unavailable.root, eventId: 'repair:unavailable',
      stage: 'executor',
      payload: {
        type: 'repair.recorded', repair: {
          repairId: 'repair:unavailable', checkId: 'targeted-tests', attempt: 1, startedAt: now,
          changedReferences: ['tasks.md'], result: 'fail',
        },
      },
    });
    expect((await readAssuranceStateV2(unavailable.changeDir)).unresolvedHumanActions)
      .toEqual(expect.arrayContaining([expect.stringContaining('Repair is exhausted')]));
  });

  it('exposes CLI debug and scenario-by-scenario UAT recording through the contributed Tier 0 commands', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root });
    const finding = await addHumanFinding(root, changeDir);
    const initialPresentation = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'uat', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    const uatScenarioId = initialPresentation.next.scenarioId;
    const debug = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--finding', finding.findingId, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(debug.session).toMatchObject({ findingId: finding.findingId, status: 'active' });
    const hypothesis = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--hypothesis', 'The observation is caused by a missing condition.', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    const evidenceFile = `${root}/debug-evidence.json`;
    await fs.writeFile(evidenceFile, JSON.stringify([
      { referenceId: 'test:debug:red', kind: 'generated', externalId: 'debug-red',
        digest: createHash('sha256').update('debug-red').digest('hex'), available: true },
      { referenceId: 'test:debug:green', kind: 'generated', externalId: 'debug-green',
        digest: createHash('sha256').update('debug-green').digest('hex'), available: true },
    ]));
    const experiment = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--hypothesis-id', hypothesis.session.hypotheses[0].hypothesisId,
      '--experiment', 'Run the focused regression check.', '--evidence', evidenceFile, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    const observed = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--experiment-id', experiment.session.experiments[0].experimentId, '--result', 'passed',
      '--observation', 'The focused check confirms the hypothesis.', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(observed.session.experiments[0]).toMatchObject({ result: 'passed' });
    const concluded = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--experiment-id', experiment.session.experiments[0].experimentId,
      '--root-cause', 'The required condition was missing.', '--evidence', evidenceFile, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(concluded.session.conclusions).toEqual([expect.objectContaining({ kind: 'root_cause' })]);
    const changed = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--changed-reference', '--evidence', evidenceFile, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(changed.session.changedReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ referenceId: 'test:debug:red' }),
      expect.objectContaining({ referenceId: 'test:debug:green' }),
    ]));
    const questioned = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--question', 'Does the repair cover the public contract?', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(questioned.session.unresolvedQuestions).toContain('Does the repair cover the public contract?');
    const actioned = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--next-action', 'Verify the repaired public contract.', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(actioned.session.nextAction).toBe('Verify the repaired public contract.');
    await expect(resolveDebugSessionV2({
      change: 'demo', projectRoot: root, sessionId: debug.session.sessionId,
      redEvidenceId: 'debug-red', greenEvidenceId: 'debug-green', verifierId: 'verifier-1',
    })).rejects.toThrow(/linked finding.*independently verified/i);
    const lifecycleEvidence = [
      { referenceId: 'test:debug:red', kind: 'generated' as const, externalId: 'debug-red',
        digest: createHash('sha256').update('debug-red').digest('hex'), available: true },
      { referenceId: 'test:debug:green', kind: 'generated' as const, externalId: 'debug-green',
        digest: createHash('sha256').update('debug-green').digest('hex'), available: true },
    ];
    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'repair',
      actorId: 'executor-1', reason: 'Repaired the root cause.', evidence: lifecycleEvidence,
      now: '2026-08-09T15:02:00.000Z',
    });
    const canonicalCompiled = await compileOpenSpecChange({ changeDir });
    const canonicalDigests = digests(canonicalCompiled.artifacts);
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'debug-evidence:red', occurredAt: '2026-08-09T15:01:00.000Z',
      stage: 'executor', actorId: 'executor-1',
      payload: { type: 'evidence.recorded', evidence: {
        evidenceId: 'debug-red', taskId: '1.1', phase: 'red', checkId: 'targeted-tests',
        observedAt: '2026-08-09T15:01:00.000Z', sourceState: 'before-fix', sourceDigests: canonicalDigests,
        exitCode: 1, result: 'fail', outputDigest: createHash('sha256').update('debug-red').digest('hex'),
        relevantFailure: true, preExistingFailure: false, origin: 'executor', reference: 'test:debug:red',
      } },
    });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'debug-evidence:green', occurredAt: '2026-08-09T15:03:00.000Z',
      stage: 'verifier', actorId: 'verifier-1',
      payload: { type: 'evidence.recorded', evidence: {
        evidenceId: 'debug-green', taskId: '1.1', phase: 'green', checkId: 'targeted-tests',
        observedAt: '2026-08-09T15:03:00.000Z', sourceState: 'after-fix', sourceDigests: canonicalDigests,
        exitCode: 0, result: 'pass', outputDigest: createHash('sha256').update('debug-green').digest('hex'),
        preExistingFailure: false, origin: 'verifier', reference: 'test:debug:green',
      } },
    });
    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'verify',
      actorId: 'verifier-1', reason: 'Verified current regression evidence.',
      evidence: lifecycleEvidence, now: '2026-08-09T15:04:00.000Z',
    });
    await expect(resolveDebugSessionV2({
      change: 'demo', projectRoot: root, sessionId: debug.session.sessionId,
      redEvidenceId: 'debug-red', greenEvidenceId: 'debug-green', verifierId: 'executor-1',
    })).rejects.toThrow(/distinct from the executor/i);
    await expect(resolveDebugSessionV2({
      change: 'demo', projectRoot: root, sessionId: debug.session.sessionId,
      redEvidenceId: 'test:debug:red', greenEvidenceId: 'test:debug:green', verifierId: 'verifier-1',
    })).rejects.toThrow(/existing canonical evidence records/i);
    const resolved = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--resolve', '--verified-by', 'verifier-1', '--red-evidence-id', 'debug-red',
      '--green-evidence-id', 'debug-green', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(resolved.session).toMatchObject({ status: 'resolved', verification: {
      verifier: { kind: 'verifier', id: 'verifier-1' }, findingId: finding.findingId,
    } });
    const eventTypes = (await readEventStoreV2(changeDir)).events.map((event) => event.payload.type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'debug.reference_changed', 'debug.question_recorded', 'debug.next_action_recorded',
      'debug.verification_recorded', 'debug.session_resolved',
    ]));
    const presentation = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'uat', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(presentation.next).toMatchObject({ scenarioId: uatScenarioId });
    const recording = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'uat', 'demo', '--project', root,
      '--scenario', presentation.next.scenarioId, '--status', 'passed', '--actor', 'maintainer',
      '--notes', 'Observed the expected behavior.', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(recording.scenario).toMatchObject({ status: 'passed' });
  }, 20_000);
});
