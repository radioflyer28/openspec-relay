import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bindGateResult,
  readRequiredGateRecord,
  writeRequiredGateRecord,
} from '@fission-ai/openspec/extensions';
import {
  acceptGuardrailsGate,
  recordGuardrailsPayload,
  checkGuardrailsRun,
  startGuardrailsRun,
} from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

describe('Tier 0 recording protocol', () => {
  it('records task transitions, reconciles checkboxes, propagates blockers, and reports next work', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({
      change: 'demo', projectRoot: root,
      config: { taskOverrides: { '1.2': { dependencies: ['1.1'] } } },
    });
    const started = await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'task-start',
      occurredAt: '2026-08-04T12:00:00.000Z',
      payload: { type: 'task.transition', taskId: '1.1', status: 'in_progress' },
    });
    expect(started.nextAction.taskId).toBe('1.1');
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'too-early',
      payload: { type: 'task.transition', taskId: '1.2', status: 'in_progress' },
    })).rejects.toThrow(/incomplete dependencies/i);

    const completed = await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'task-complete',
      occurredAt: '2026-08-04T12:10:00.000Z',
      payload: { type: 'task.transition', taskId: '1.1', status: 'complete' },
    });
    expect(await fs.readFile(path.join(changeDir, 'tasks.md'), 'utf8')).toContain('- [x] 1.1');
    expect(completed.nextAction.taskId).toBe('1.2');
    expect((await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'task-complete',
      occurredAt: '2026-08-04T12:10:00.000Z',
      payload: { type: 'task.transition', taskId: '1.1', status: 'complete' },
    })).appended).toBe(false);

    const { root: blockedRoot } = await createOpenSpecProject('blocked');
    await startGuardrailsRun({
      change: 'blocked', projectRoot: blockedRoot,
      config: { taskOverrides: { '1.2': { dependencies: ['1.1'] } } },
    });
    const blocked = await recordGuardrailsPayload({
      change: 'blocked', projectRoot: blockedRoot, eventId: 'task-blocked',
      payload: { type: 'task.transition', taskId: '1.1', status: 'blocked', reason: 'Needs input.' },
    });
    expect(blocked.nextAction.blockedTaskIds).toEqual(['1.1', '1.2']);
  }, 15_000);

  it('records source-bound evidence idempotently and rejects invalid RED claims and conflicts', async () => {
    const { root } = await createOpenSpecProject();
    const started = await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const digests = Object.fromEntries(started.run.artifacts
      .map((artifact) => [artifact.path, artifact.sourceDigest]));
    const payload = {
      type: 'evidence.recorded' as const,
      evidence: {
        evidenceId: 'red', taskId: '1.1', phase: 'red' as const, checkId: 'behavior-test',
        observedAt: '2026-08-04T11:59:00.000Z', sourceState: 'before', sourceDigests: digests,
        exitCode: 1, result: 'fail' as const, outputDigest: digest('failed output'),
        relevantFailure: true, preExistingFailure: false, origin: 'automated' as const,
        reference: 'reports/red.txt',
      },
    };
    const first = await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'red-event',
      occurredAt: '2026-08-04T11:59:00.000Z', payload,
    });
    expect(first.appended).toBe(true);
    expect((await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'red-event',
      occurredAt: '2026-08-04T11:59:00.000Z', payload,
    })).appended).toBe(false);
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'red-event',
      occurredAt: '2026-08-04T11:59:00.000Z',
      payload: { ...payload, evidence: { ...payload.evidence, outputDigest: digest('different') } },
    })).rejects.toThrow(/conflicting content/i);
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'fabricated-red',
      payload: {
        ...payload,
        evidence: { ...payload.evidence, evidenceId: 'fabricated', reference: undefined },
      },
    })).rejects.toThrow(/observable output/i);
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'existing-red',
      payload: {
        ...payload,
        evidence: { ...payload.evidence, evidenceId: 'existing', preExistingFailure: true },
      },
    })).rejects.toThrow(/relevant new failure/i);
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'irrelevant-red',
      payload: {
        ...payload,
        evidence: { ...payload.evidence, evidenceId: 'irrelevant', relevantFailure: false },
      },
    })).rejects.toThrow(/relevant new failure/i);

    await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'implementation-start',
      occurredAt: '2026-08-04T12:00:00.000Z',
      payload: { type: 'task.transition', taskId: '1.1', status: 'in_progress' },
    });
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'late-red',
      payload: {
        ...payload,
        evidence: { ...payload.evidence, evidenceId: 'late', observedAt: '2026-08-04T12:01:00.000Z' },
      },
    })).rejects.toThrow(/after implementation began/i);
    await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'unchanged-green',
      occurredAt: '2026-08-04T12:01:00.000Z',
      payload: { type: 'evidence.recorded', evidence: {
        ...payload.evidence, evidenceId: 'green', phase: 'green', observedAt: '2026-08-04T12:01:00.000Z',
        result: 'pass', exitCode: 0, relevantFailure: undefined,
      } },
    });
    await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'refactor',
      occurredAt: '2026-08-04T12:02:00.000Z',
      payload: { type: 'evidence.recorded', evidence: {
        ...payload.evidence, evidenceId: 'refactor', phase: 'refactor',
        observedAt: '2026-08-04T12:02:00.000Z', sourceState: 'cleanup',
        result: 'pass', exitCode: 0, relevantFailure: undefined,
      } },
    });
    const checked = await checkGuardrailsRun({ change: 'demo', projectRoot: root });
    expect(checked.assurance.checks.find((item) => item.kind === 'tdd')?.status).toBe('fail');
  }, 25_000);

  it('records scoped findings, deviations, and bounded relevant repairs with provenance', async () => {
    const { root } = await createOpenSpecProject();
    const started = await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const requirementId = started.run.artifacts.flatMap((artifact) => artifact.ids)
      .find((id) => id.includes('#requirement:') && !id.includes('/scenario:'))!;
    expect((await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'finding', actor: { kind: 'verifier' },
      payload: { type: 'finding.recorded', finding: {
        findingId: 'goal', requirementId, status: 'pass', summary: 'Verified.',
        evidenceIds: [], origin: 'verifier',
      } },
    })).eventType).toBe('finding.recorded');
    expect((await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'deviation',
      payload: { type: 'deviation.recorded', deviation: {
        deviationId: 'scope', taskId: '1.1', requirementRefs: [requirementId],
        recordedAt: '2026-08-04T12:00:00.000Z', summary: 'Additional scoped work.',
        disposition: 'pending',
      } },
    })).eventType).toBe('deviation.recorded');
    expect((await recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'repair',
      payload: { type: 'repair.recorded', repair: {
        repairId: 'repair-1', checkId: 'targeted-tests', attempt: 1,
        startedAt: '2026-08-04T12:01:00.000Z', changedReferences: ['tasks.md'], result: 'fail',
      } },
    })).eventType).toBe('repair.recorded');
    await expect(recordGuardrailsPayload({
      change: 'demo', projectRoot: root, eventId: 'irrelevant-repair',
      payload: { type: 'repair.recorded', repair: {
        repairId: 'repair-2', checkId: 'targeted-tests', attempt: 2,
        startedAt: '2026-08-04T12:02:00.000Z', changedReferences: ['unrelated.tmp'], result: 'fail',
      } },
    })).rejects.toThrow(/relevant/i);
  }, 15_000);

  it('delegates human acceptance to OpenSpec and records bound acceptance digests', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const record = await readRequiredGateRecord(changeDir);
    const gate = record.gates.find((item) => item.gateId === 'guardrails.assurance')!;
    gate.lastResult = bindGateResult({
      gateId: 'guardrails.assurance', status: 'human_needed', summary: 'Human approval needed.',
      evidence: ['assurance.json'], remediation: [],
    }, '2026-08-04T12:00:00.000Z');
    await writeRequiredGateRecord(changeDir, record);
    const result = await acceptGuardrailsGate({
      change: 'demo', projectRoot: root, gateId: 'guardrails.assurance', actor: 'alex',
      eventId: 'human-accept', occurredAt: '2026-08-04T12:05:00.000Z',
    });
    expect(result).toMatchObject({ accepted: true, eventType: 'human.decision' });
    const accepted = (await readRequiredGateRecord(changeDir)).gates[0].acceptance;
    expect(accepted).toMatchObject({ actor: 'alex', acceptedAt: '2026-08-04T12:05:00.000Z' });
  }, 15_000);
});
