import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptRequiredGate } from '@fission-ai/openspec/extensions';
import { seedAssuranceState, startGuardrailsRun } from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

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

describe('cross-repository archive gate flow', () => {
  it('blocks for current human acceptance, then archives with generated evidence intact', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const linked = openspec(root, ['extension', 'link', path.resolve('.')]);
    expect(linked.status, linked.stderr || linked.stdout).toBe(0);
    await startGuardrailsRun({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    await seedAssuranceState({
      change: 'demo', projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        status: 'human_needed',
        unresolvedHumanActions: ['Confirm the observable result.'],
      }),
    });

    const blocked = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
    ]);
    expect(blocked.status).not.toBe(0);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      archive: null,
      status: [expect.objectContaining({ code: 'archive_gate_blocked' })],
    });

    await acceptRequiredGate(changeDir, 'guardrails.assurance', { actor: 'integration-test' });
    const archived = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
    ]);
    expect(archived.status, archived.stderr || archived.stdout).toBe(0);
    const archiveRoot = path.join(root, 'openspec', 'changes', 'archive');
    const archivedName = (await fs.readdir(archiveRoot)).find((name) => name.endsWith('-demo'))!;
    await expect(fs.access(path.join(archiveRoot, archivedName, '.guardrails', 'assurance.json')))
      .resolves.toBeUndefined();
    const gateRecord = JSON.parse(await fs.readFile(
      path.join(archiveRoot, archivedName, '.openspec-gates.json'), 'utf8',
    ));
    expect(gateRecord.gates[0].acceptance.actor).toBe('integration-test');
  }, 60_000);
});
