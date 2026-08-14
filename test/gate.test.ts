import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { GateContextV1 } from '@fission-ai/openspec/extensions';
import {
  assuranceStatePath,
  digestJson,
  readAssuranceStateV2,
  readRunStateV2,
  runStatePath,
} from '../src/state.js';
import { guardrailsAssuranceGate } from '../src/gate.js';
import { checkGuardrailsRunV2, startGuardrailsRunV2 } from '../src/runner-v2.js';
import { appendGuardrailsEventV2, createGuardrailsEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { startDebugSession } from '../src/debug-sessions.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const capabilities = {
  agentDispatch: false, parallelism: false, worktrees: false, git: false,
  structuredResults: true, humanInteraction: false,
};

function context(root: string, changeDir: string): GateContextV1 {
  return {
    projectRoot: root,
    changeName: 'demo',
    changeDir,
    requestedAt: '2026-08-04T12:00:00.000Z',
    hostCapabilities: capabilities,
  };
}

describe('Guardrails archive gate', () => {
  it('evaluates v2 projections and preserves their subordinate archive obligations', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: [], config: { mode: 'quick' } });
    const checked = await checkGuardrailsRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    expect(checked.run).toMatchObject({ version: 2, status: 'blocked' });
    expect(checked.assurance.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'repository-context', status: 'pass' }),
      expect.objectContaining({ checkId: 'plan-readiness', status: 'fail' }),
    ]));
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir)))
      .toMatchObject({ status: 'fail', summary: expect.stringContaining('repository-checks') });
  });

  it('records an archive-blocking projection error when required UAT has no OpenSpec scenario', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.writeFile(`${changeDir}/specs/demo/spec.md`, [
      '## ADDED Requirements',
      '',
      '### Requirement: Demonstrate behavior',
      'The system SHALL demonstrate behavior.',
      '',
    ].join('\n'));
    await startGuardrailsRunV2({
      change: 'demo', projectRoot: root, changedFiles: [],
      config: { features: { uat: { enabled: true, required: true } } },
    });
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir))).toMatchObject({
      status: 'error', summary: expect.stringMatching(/required UAT.*no projected/i),
    });
  });

  it('fails closed for incomplete assurance and returns human-needed state', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const initial = await guardrailsAssuranceGate.evaluate(context(root, changeDir));
    expect(initial).toMatchObject({ status: 'error', gateId: 'guardrails.assurance' });
    const store = await readEventStoreV2(changeDir);
    await appendGuardrailsEventV2({ changeDir, event: createGuardrailsEventV2({
      eventId: 'human:visual', runId: store.runId, changeName: store.changeName,
      occurredAt: '2026-08-04T13:00:00.000Z', sourceDigests: {}, actor: { kind: 'human', id: 'maintainer' },
      provenance: { origin: 'gate-test' },
      payload: { type: 'human.decision', gateId: 'visual-uat', decision: 'requested', reason: 'Approve visual behavior.' },
    }) });
    const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: store.seed.config.taskOverrides });
    await writeReplayedProjectionsV2({ changeDir, store: await readEventStoreV2(changeDir), compiled });
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir)))
      .toMatchObject({ status: 'human_needed', summary: expect.stringMatching(/visual/i) });
  });

  it('blocks mismatched run and assurance digests', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const assurance = await readAssuranceStateV2(changeDir);
    await fs.writeFile(assuranceStatePath(changeDir), `${JSON.stringify({
      ...assurance, updatedAt: '2026-08-04T13:00:00.000Z',
    }, null, 2)}\n`);
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir)))
      .toMatchObject({ status: 'error', summary: expect.stringMatching(/does not match|projection/i) });
  });

  it('rejects matching forged projections when canonical events remain incomplete', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const run = await readRunStateV2(changeDir);
    const assurance = JSON.parse(await fs.readFile(assuranceStatePath(changeDir), 'utf8')) as Record<string, unknown>;
    const forgedAssurance = {
      ...assurance,
      status: 'pass',
      checks: (assurance.checks as Array<Record<string, unknown>>).map((check) => ({
        ...check, status: check.status === 'skipped' ? 'skipped' : 'pass', summary: 'Forged passing projection.',
      })),
      unresolvedHumanActions: [],
    };
    const forgedRun = { ...run, status: 'complete', assuranceDigest: digestJson(forgedAssurance) };
    await fs.writeFile(assuranceStatePath(changeDir), `${JSON.stringify(forgedAssurance, null, 2)}\n`);
    await fs.writeFile(runStatePath(changeDir), `${JSON.stringify(forgedRun, null, 2)}\n`);

    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir))).toMatchObject({
      status: 'error', summary: expect.stringMatching(/canonical|replay|projection/i),
    });
  });

  it('blocks archive while a blocking debug session is unresolved', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const store = await readEventStoreV2(changeDir);
    const compiled = await compileOpenSpecChange({ changeDir, taskMetadata: store.seed.config.taskOverrides });
    const session = startDebugSession({ logicalFailureId: 'check:targeted-tests', references: ['targeted-tests'],
      failedEvidence: [{ referenceId: 'check:targeted-tests', kind: 'generated', externalId: 'targeted-tests', available: true }],
      existing: [], now: '2026-08-12T12:00:00.000Z' });
    await appendGuardrailsEventV2({ changeDir, event: createGuardrailsEventV2({
      eventId: 'debug:blocking', runId: store.runId, changeName: store.changeName,
      occurredAt: '2026-08-12T12:00:00.000Z',
      sourceDigests: Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest])),
      actor: { kind: 'host' }, provenance: { origin: 'gate-test' },
      payload: { type: 'debug.session_started', session },
    }) });
    await writeReplayedProjectionsV2({ changeDir, store: await readEventStoreV2(changeDir), compiled });
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir))).toMatchObject({
      status: expect.stringMatching(/fail|human_needed/), summary: expect.stringMatching(/debug|investigation/i),
    });
  });
});
