import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptGsdGateV2, startGsdRunV2 } from '../src/index.js';
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
  it('links, diagnoses, generates workflows, rejects projection-only acceptance, and archives with override', async () => {
    const { root } = await createOpenSpecProject();
    const initialized = openspec(root, ['init', '--tools', 'codex', '--force', '--no-animation']);
    expect(initialized.status, initialized.stderr || initialized.stdout).toBe(0);
    const linked = openspec(root, ['extension', 'link', path.resolve('.')]);
    expect(linked.status, linked.stderr || linked.stdout).toBe(0);
    const doctor = openspec(root, ['extension', 'doctor', 'gsd']);
    expect(doctor.status, doctor.stderr || doctor.stdout).toBe(0);
    expect(doctor.stdout).toContain('reconciliation: ok');
    const generatedRun = await fs.readFile(
      path.join(root, '.agents', 'skills', 'openspec-run', 'SKILL.md'),
      'utf8',
    );
    expect(generatedRun).toContain('openspec-extension:gsd@');
    expect(generatedRun).toContain('gsd record');

    const run = await startGsdRunV2({ change: 'demo', projectRoot: root });
    expect(run.run.mode).toBe('guarded');

    const blocked = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
    ]);
    expect(blocked.status).not.toBe(0);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      archive: null,
      status: [expect.objectContaining({ code: 'archive_gate_blocked' })],
    });

    await expect(acceptGsdGateV2({
      change: 'demo',
      projectRoot: root,
      gateId: 'gsd.assurance',
      actor: 'integration-test',
    })).rejects.toThrow(/no current human-needed result/i);
    const stillBlocked = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
    ]);
    expect(stillBlocked.status).not.toBe(0);
    const archived = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
      '--override-gate', 'gsd.assurance', '--reason', 'Cross-repository fixture intentionally leaves deterministic checks pending.',
    ]);
    expect(archived.status, archived.stderr || archived.stdout).toBe(0);
    const archiveRoot = path.join(root, 'openspec', 'changes', 'archive');
    const archivedName = (await fs.readdir(archiveRoot)).find((name) => name.endsWith('-demo'))!;
    await expect(fs.access(path.join(archiveRoot, archivedName, '.openspec-gsd', 'assurance.json')))
      .resolves.toBeUndefined();
    const gateRecord = JSON.parse(await fs.readFile(
      path.join(archiveRoot, archivedName, '.openspec-gates.json'), 'utf8',
    ));
    expect(gateRecord.gates[0].acceptance).toBeUndefined();
    expect(gateRecord.gates[0].overrides[0]).toMatchObject({
      reason: 'Cross-repository fixture intentionally leaves deterministic checks pending.',
    });
  }, 60_000);

  it('records an audited override before final archive', async () => {
    const { root } = await createOpenSpecProject('override-demo');
    const linked = openspec(root, ['extension', 'link', path.resolve('.')]);
    expect(linked.status, linked.stderr || linked.stdout).toBe(0);
    await startGsdRunV2({ change: 'override-demo', projectRoot: root });

    const archived = openspec(root, [
      'archive', 'override-demo', '--yes', '--no-validate', '--skip-specs', '--json',
      '--override-gate', 'gsd.assurance',
      '--reason', 'Release owner accepted the documented residual risk.',
    ]);
    expect(archived.status, archived.stderr || archived.stdout).toBe(0);
    const archiveRoot = path.join(root, 'openspec', 'changes', 'archive');
    const archivedName = (await fs.readdir(archiveRoot))
      .find((name) => name.endsWith('-override-demo'))!;
    const gateRecord = JSON.parse(await fs.readFile(
      path.join(archiveRoot, archivedName, '.openspec-gates.json'), 'utf8',
    ));
    expect(gateRecord.gates[0].overrides[0]).toMatchObject({
      reason: 'Release owner accepted the documented residual risk.',
    });
    expect(gateRecord.gates[0].overrides[0].resultDigest).toBeTruthy();
  }, 60_000);
});
