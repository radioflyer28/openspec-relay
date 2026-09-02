import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GateContextV1 } from '@fission-ai/openspec/extensions';
import {
  readRunStateV2,
} from '../src/state.js';
import { relayAssuranceGate } from '../src/gate.js';
import { startRelayRunV2 } from '../src/runner-v2.js';
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
    expect(await relayAssuranceGate.evaluate(context)).toMatchObject({ status: 'error' });
    await startRelayRunV2({ change: 'demo', projectRoot: root });
    await fs.writeFile(path.join(changeDir, '.openspec-relay', 'assurance.json'), '{not-json');
    expect(await relayAssuranceGate.evaluate(context)).toMatchObject({
      status: 'error', summary: expect.stringContaining('invalid'),
    });
  });

  it('repairs a corrupt generated run projection from canonical history on resume', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startRelayRunV2({ change: 'demo', projectRoot: root });
    await fs.writeFile(path.join(changeDir, '.openspec-relay', 'run.json'), '{not-json');
    await expect(readRunStateV2(changeDir)).rejects.toThrow();
    await expect(startRelayRunV2({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      run: { version: 2, changeName: 'demo' },
    });
    await expect(readRunStateV2(changeDir)).resolves.toMatchObject({ version: 2, changeName: 'demo' });
  });
});
