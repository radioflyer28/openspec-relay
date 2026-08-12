import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { describe, expect, it, afterEach } from 'vitest';
import { discoverFinding, transitionFinding } from '../src/findings.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { appendGuardrailsEventV2, createGuardrailsEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import { startGuardrailsRunV2 } from '../src/runner-v2.js';
import { readAssuranceStateV2 } from '../src/state.js';
import { presentUatV2, recordLegacyPayloadV2, recordUatV2, transitionFindingV2 } from '../src/v2-operations.js';
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
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root });
    const finding = await addHumanFinding(root, changeDir);
    const evidence = [{ referenceId: 'test:repair', kind: 'generated' as const, externalId: 'repair', available: true }];

    const repaired = await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, to: 'repaired',
      actor: { kind: 'executor', id: 'executor-1' }, reason: 'Implemented the required repair.', evidence,
      now: '2026-08-09T15:01:00.000Z',
    });
    expect(repaired).toMatchObject({ state: 'repaired' });

    await expect(transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, to: 'independently_verified',
      actor: { kind: 'executor', id: 'executor-1' }, reason: 'Self verification is not independent.', evidence, now: '2026-08-09T15:02:00.000Z',
    })).rejects.toThrow(/read-only verifier/i);

    const verified = await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, to: 'independently_verified',
      actor: { kind: 'verifier', id: 'verifier-1' }, reason: 'Verified the original concern against current evidence.', evidence,
      now: '2026-08-09T15:03:00.000Z',
    });
    expect(verified).toMatchObject({ state: 'independently_verified' });
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
    await transitionFindingV2({ change: 'demo', projectRoot: root, findingId: finding.findingId, to: 'repaired',
      actor: { kind: 'executor', id: 'executor' }, reason: 'Repaired.', evidence: repairEvidence });
    await transitionFindingV2({ change: 'demo', projectRoot: root, findingId: finding.findingId, to: 'independently_verified',
      actor: { kind: 'verifier', id: 'verifier' }, reason: 'Verified.', evidence: repairEvidence });
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

  it('automatically begins a resumable debug session after repair exhaustion and records human-needed when debugging is unavailable', async () => {
    const active = await createOpenSpecProject('active');
    await startGuardrailsRunV2({ change: 'active', projectRoot: active.root, config: { repairLimit: 1 } });
    const repair = (change: string) => recordLegacyPayloadV2({
      change, projectRoot: active.root, eventId: `repair:${change}`,
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
    await recordLegacyPayloadV2({
      change: 'unavailable', projectRoot: unavailable.root, eventId: 'repair:unavailable',
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
      { referenceId: 'test:debug', kind: 'generated', externalId: 'debug', available: true },
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
    const resolved = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'debug', 'demo', '--project', root, '--session', debug.session.sessionId,
      '--resolve', '--evidence', evidenceFile, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(resolved.session).toMatchObject({ status: 'resolved' });
    const presentation = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'uat', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(presentation.next).toMatchObject({ scenarioId: expect.stringContaining('/scenario:works') });
    const recording = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'uat', 'demo', '--project', root,
      '--scenario', presentation.next.scenarioId, '--status', 'passed', '--actor', 'maintainer',
      '--notes', 'Observed the expected behavior.', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(recording.scenario).toMatchObject({ status: 'passed' });
  }, 20_000);
});
