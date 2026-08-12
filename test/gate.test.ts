import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { GateContextV1 } from '@fission-ai/openspec/extensions';
import {
  assuranceStatePath,
  digestJson,
  guardrailsAssuranceGate,
  readAssuranceState,
  readRunStateV2,
  runStatePath,
  seedAssuranceState,
  checkGuardrailsRunV2,
  startGuardrailsRunV2,
  startGuardrailsRun,
} from '../src/index.js';
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
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const checked = await checkGuardrailsRunV2({ change: 'demo', projectRoot: root });
    expect(checked.run).toMatchObject({ version: 2, status: 'blocked' });
    expect(checked.assurance.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'repository-context', status: 'pass' }),
      expect.objectContaining({ checkId: 'plan-readiness', status: 'warn' }),
    ]));
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir)))
      .toMatchObject({ status: 'fail', summary: expect.stringContaining('repository-checks') });
  });

  it('fails closed for incomplete assurance and returns human-needed state', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir)))
      .toMatchObject({ status: 'fail', gateId: 'guardrails.assurance' });
    await seedAssuranceState({ change: 'demo', projectRoot: root, update: (assurance) => ({
      ...assurance, status: 'human_needed', unresolvedHumanActions: ['Approve visual behavior.'],
    }) });
    expect(await guardrailsAssuranceGate.evaluate(context(root, changeDir)))
      .toMatchObject({ status: 'human_needed', summary: 'Approve visual behavior.' });
  });

  it('blocks mismatched run and assurance digests', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const assurance = await readAssuranceState(changeDir);
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
});
