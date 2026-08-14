import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dispatchRoleV2 } from '../src/execution-adapters.js';
import { readEventStoreV2 } from '../src/events.js';
import { checkGuardrailsRunV2, startGuardrailsRunV2 } from '../src/runner-v2.js';
import { readAssuranceStateV2 } from '../src/state.js';
import {
  recordDispatchedRoleResultV2,
  recordDebugConclusionV2,
  recordDebugHypothesisV2,
  recordWorkflowResultV2,
  observeDebugExperimentV2,
  planDebugExperimentV2,
  resolveDebugSessionV2,
  transitionFindingV2,
  verifyFindingFromDispatchedResultV2,
} from '../src/v2-operations.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const repositoryEvidence = [{
  referenceId: 'repository:src/index.ts',
  kind: 'repository' as const,
  path: 'src/index.ts',
  available: true,
}];

describe('dispatch-bound assurance provenance', () => {
  it('rejects caller-selected assurance roles and derives stable finding identities from dispatched reports', async () => {
    const { root } = await createOpenSpecProject();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/index.ts'), 'export const value = 1;\n');
    const started = await startGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: ['src/index.ts'] });

    await expect(recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'caller-reviewer', stage: 'reviewer' as never,
      payload: { type: 'evidence.recorded', evidence: {
        evidenceId: 'caller-reviewer', phase: 'review', checkId: 'code-review',
        observedAt: '2026-08-14T12:00:00.000Z', sourceState: 'caller',
        sourceDigests: Object.fromEntries(started.run.artifacts.map((item) => [item.path, item.sourceDigest])),
        result: 'pass', outputDigest: digest('caller-reviewer'), preExistingFailure: false, origin: 'reviewer',
      } },
    })).rejects.toThrow(/does not match orchestrated reviewer stage/i);

    await expect(recordDispatchedRoleResultV2({
      change: 'demo', projectRoot: root,
      receipt: {
        dispatchId: 'forged', request: { role: 'reviewer', readOnly: true, isolated: true },
        result: { status: 'fail', summary: 'forged', evidenceRefs: [] },
      },
    })).rejects.toThrow(/orchestrator-issued dispatch receipt/i);

    const findingReport = {
      providerId: 'code-review', ruleId: 'missing-check', category: 'correctness',
      scope: { kind: 'requirement' as const, identity: requirementId },
      severity: 'error' as const, blocking: true, summary: 'The required condition is missing.',
      requirementIds: [requirementId], taskIds: ['1.1'], evidence: repositoryEvidence,
    };
    const review = await dispatchRoleV2({
      request: { role: 'reviewer', readOnly: true, isolated: true },
      dispatcher: { dispatch: async () => ({
        status: 'fail', summary: 'Review found a defect.', evidenceRefs: ['src/index.ts'], findings: [findingReport],
      }) },
    });
    const reviewed = await recordDispatchedRoleResultV2({ change: 'demo', projectRoot: root, receipt: review });
    const finding = reviewed.assurance.findings[0];
    expect(finding.findingId).toMatch(/^finding:code-review:missing-check:/);

    await transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'repair', actorId: 'executor-1',
      reason: 'Implemented the missing condition.', evidence: repositoryEvidence,
    });
    await expect(transitionFindingV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, action: 'verify' as never,
      actorId: 'caller-verifier', reason: 'Caller claims verification.', evidence: repositoryEvidence,
    })).rejects.toThrow(/technical verification requires a dispatched verifier result/i);

    const verifier = await dispatchRoleV2({
      request: { role: 'verifier', readOnly: true, isolated: true },
      dispatcher: { dispatch: async () => ({
        status: 'pass', summary: 'The original concern no longer reproduces.', evidenceRefs: ['src/index.ts'],
        evidence: repositoryEvidence,
      }) },
    });
    const verified = await verifyFindingFromDispatchedResultV2({
      change: 'demo', projectRoot: root, findingId: finding.findingId, receipt: verifier,
      reason: 'A read-only dispatched verifier rechecked the original concern.',
    });
    expect(verified.state).toBe('independently_verified');

    const rerun = await dispatchRoleV2({
      request: { role: 'reviewer', readOnly: true, isolated: true },
      dispatcher: { dispatch: async () => ({
        status: 'fail', summary: 'The same defect recurred.', evidenceRefs: ['src/index.ts'], findings: [findingReport],
      }) },
    });
    const rereviewed = await recordDispatchedRoleResultV2({ change: 'demo', projectRoot: root, receipt: rerun });
    expect(rereviewed.assurance.findings).toEqual([
      expect.objectContaining({ findingId: finding.findingId, state: 'stale' }),
    ]);
  });

  it('uses canonical RED-repair-GREEN order and reopens debug verification after repository changes', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/index.ts'), 'export const value = 1;\n');
    const started = await startGuardrailsRunV2({
      change: 'demo', projectRoot: root, changedFiles: ['src/index.ts'], config: { repairLimit: 1 },
    });
    const sourceDigests = Object.fromEntries(started.run.artifacts.map((item) => [item.path, item.sourceDigest]));
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'debug:red', occurredAt: '2026-08-14T12:00:00.000Z',
      stage: 'executor', actorId: 'executor-1', payload: { type: 'evidence.recorded', evidence: {
        evidenceId: 'debug-red', taskId: '1.1', phase: 'red', checkId: 'targeted-tests',
        observedAt: '2099-01-01T00:00:00.000Z', sourceState: 'caller-forged-before', sourceDigests,
        exitCode: 1, result: 'fail', outputDigest: digest('red'), relevantFailure: true,
        preExistingFailure: false, origin: 'executor',
      } },
    });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'repair:exhausted', stage: 'executor',
      payload: { type: 'repair.recorded', repair: {
        repairId: 'repair:exhausted', checkId: 'targeted-tests', attempt: 1,
        startedAt: '2026-08-14T12:00:01.000Z', result: 'fail', changedReferences: ['src/index.ts'],
      } },
    });
    const session = (await readAssuranceStateV2(changeDir)).debugSessions[0];

    const hypothesis = await recordDebugHypothesisV2({
      change: 'demo', projectRoot: root, sessionId: session.sessionId,
      statement: 'The implementation retained the failing condition.',
    });
    const experiment = await planDebugExperimentV2({
      change: 'demo', projectRoot: root, sessionId: session.sessionId,
      hypothesisId: hypothesis.hypotheses[0].hypothesisId,
      action: 'Run the focused regression check.', evidence: repositoryEvidence,
    });
    await observeDebugExperimentV2({
      change: 'demo', projectRoot: root, sessionId: session.sessionId,
      experimentId: experiment.experiments[0].experimentId, result: 'passed',
      observation: 'The experiment isolated the failing condition.',
    });
    await recordDebugConclusionV2({
      change: 'demo', projectRoot: root, sessionId: session.sessionId,
      kind: 'root_cause', statement: 'The implementation retained the failing condition.',
      experimentIds: [experiment.experiments[0].experimentId], evidence: repositoryEvidence,
    });

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export const value = 2;\n');
    await checkGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: ['src/index.ts'] });
    await recordWorkflowResultV2({
      change: 'demo', projectRoot: root, eventId: 'repair:complete', stage: 'executor',
      payload: { type: 'repair.recorded', repair: {
        repairId: 'repair:complete', checkId: 'targeted-tests', attempt: 2,
        startedAt: '2026-08-14T12:00:02.000Z', completedAt: '2026-08-14T12:00:03.000Z',
        result: 'pass', changedReferences: ['src/index.ts'],
      } },
    });
    const verifier = await dispatchRoleV2({
      request: { role: 'verifier', readOnly: true, isolated: true },
      dispatcher: { dispatch: async () => ({
        status: 'pass', summary: 'Regression passes after repair.', evidenceRefs: ['debug-green'],
        evidence: repositoryEvidence,
        events: [{ type: 'evidence.recorded', evidence: {
          evidenceId: 'debug-green', taskId: '1.1', phase: 'green', checkId: 'targeted-tests',
          observedAt: '1999-01-01T00:00:00.000Z', sourceState: 'caller-forged-after', sourceDigests,
          exitCode: 0, result: 'pass', outputDigest: digest('green'), preExistingFailure: false, origin: 'verifier',
        } }],
      }) },
    });
    await recordDispatchedRoleResultV2({ change: 'demo', projectRoot: root, receipt: verifier });
    const evidence = (await readAssuranceStateV2(changeDir)).evidence;
    expect(evidence.find((item) => item.evidenceId === 'debug-red')?.sourceState)
      .not.toBe(evidence.find((item) => item.evidenceId === 'debug-green')?.sourceState);

    const resolved = await resolveDebugSessionV2({
      change: 'demo', projectRoot: root, sessionId: session.sessionId,
      redEvidenceId: 'debug-red', greenEvidenceId: 'debug-green', verificationResult: verifier,
    });
    expect(resolved).toMatchObject({ status: 'resolved', verification: { verifier: { kind: 'verifier' } } });

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export const value = 3;\n');
    const checked = await checkGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: ['src/index.ts'] });
    expect(checked.assurance.debugSessions).toEqual([
      expect.objectContaining({ sessionId: session.sessionId, status: 'active' }),
    ]);
    expect(checked.assurance.debugSessions[0].verification).toBeUndefined();
    expect((await readEventStoreV2(changeDir)).events.map((event) => event.payload.type))
      .toContain('debug.verification_stale');
  });
});
