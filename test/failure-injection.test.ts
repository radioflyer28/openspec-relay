import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GateContextV1 } from '@fission-ai/openspec/extensions';
import {
  guardrailsAssuranceGate,
  readRunState,
  startGuardrailsRun,
} from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('failure injection', () => {
  it('fails closed for missing and corrupt assurance state', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const context: GateContextV1 = {
      projectRoot: root, changeName: 'demo', changeDir,
      requestedAt: '2026-08-04T12:00:00.000Z',
      hostCapabilities: {
        agentDispatch: false, parallelism: false, worktrees: false, git: false,
        structuredResults: true, humanInteraction: false,
      },
    };
    expect(await guardrailsAssuranceGate.evaluate(context)).toMatchObject({ status: 'error' });
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    await fs.writeFile(path.join(changeDir, '.guardrails', 'assurance.json'), '{not-json');
    expect(await guardrailsAssuranceGate.evaluate(context)).toMatchObject({
      status: 'error', summary: expect.stringContaining('invalid'),
    });
  });

  it('rejects corrupt run state instead of silently resuming it', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    await fs.writeFile(path.join(changeDir, '.guardrails', 'run.json'), '{not-json');
    await expect(readRunState(changeDir)).rejects.toThrow();
    await expect(startGuardrailsRun({ change: 'demo', projectRoot: root })).rejects.toThrow();
  });
});
