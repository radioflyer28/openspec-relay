import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acceptGuardrailsGate, seedAssuranceState, startGuardrailsRun } from '../src/index.js';
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
  it('links, diagnoses, generates workflows, runs guarded, accepts, and archives', async () => {
    const { root } = await createOpenSpecProject();
    const initialized = openspec(root, ['init', '--tools', 'codex', '--force', '--no-animation']);
    expect(initialized.status, initialized.stderr || initialized.stdout).toBe(0);
    const linked = openspec(root, ['extension', 'link', path.resolve('.')]);
    expect(linked.status, linked.stderr || linked.stdout).toBe(0);
    const doctor = openspec(root, ['extension', 'doctor', 'guardrails']);
    expect(doctor.status, doctor.stderr || doctor.stdout).toBe(0);
    expect(doctor.stdout).toContain('reconciliation: ok');
    const generatedRun = await fs.readFile(
      path.join(root, '.agents', 'skills', 'openspec-run', 'SKILL.md'),
      'utf8',
    );
    expect(generatedRun).toContain('openspec-extension:guardrails@');
    expect(generatedRun).toContain('guardrails record');

    const run = await startGuardrailsRun({ change: 'demo', projectRoot: root });
    expect(run.run.mode).toBe('guarded');
    await seedAssuranceState({
      change: 'demo', projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        status: 'human_needed',
        checks: assurance.checks.map((check) => ({ ...check, status: 'pass' as const })),
        scenarioCoverage: assurance.scenarioCoverage.map((scenario) => ({ ...scenario, status: 'covered' as const })),
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

    const acceptance = await acceptGuardrailsGate({
      change: 'demo',
      projectRoot: root,
      gateId: 'guardrails.assurance',
      actor: 'integration-test',
    });
    expect(acceptance).toMatchObject({ accepted: true, eventType: 'human.decision' });
    const stillBlocked = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
    ]);
    expect(stillBlocked.status).not.toBe(0);
    const archived = openspec(root, [
      'archive', 'demo', '--yes', '--no-validate', '--skip-specs', '--json',
      '--override-gate', 'guardrails.assurance', '--reason', 'Cross-repository fixture intentionally leaves deterministic checks pending.',
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

  it('records an audited override before final archive', async () => {
    const { root } = await createOpenSpecProject('override-demo');
    const linked = openspec(root, ['extension', 'link', path.resolve('.')]);
    expect(linked.status, linked.stderr || linked.stdout).toBe(0);
    const run = await startGuardrailsRun({ change: 'override-demo', projectRoot: root });
    const requirementId = run.run.artifacts.flatMap((artifact) => artifact.ids)
      .find((id) => id.includes('#requirement:') && !id.includes('/scenario:'))!;
    await seedAssuranceState({
      change: 'override-demo', projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        status: 'fail',
        findings: [{
          findingId: 'goal-verification-failed',
          requirementId,
          status: 'fail',
          summary: 'Observable goal evidence is incomplete.',
          evidenceIds: [],
          origin: 'verifier',
        }],
      }),
    });

    const archived = openspec(root, [
      'archive', 'override-demo', '--yes', '--no-validate', '--skip-specs', '--json',
      '--override-gate', 'guardrails.assurance',
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
