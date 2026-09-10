import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('companion CLI', () => {
  it('provides plan, do, check, and status entry points without legacy aliases', async () => {
    const { root } = await createOpenSpecProject();
    const run = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'plan', 'demo', '--project', root, '--allow-self-review', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(run.run).toMatchObject({ changeName: 'demo', mode: 'guarded', tier: 'tier0' });
    const taskRecord = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'record', 'task', 'demo', '1.1', '--project', root,
      '--status', 'in_progress', '--event-id', 'cli-task-start',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(taskRecord).toMatchObject({ accepted: true, eventType: 'task.transition' });

    const evidenceInput = path.join(root, 'evidence.json');
    await fs.writeFile(evidenceInput, JSON.stringify({
      eventId: 'cli-evidence',
      evidence: {
        evidenceId: 'cli-repo', phase: 'check', checkId: 'repository-checks',
        observedAt: '2026-08-04T12:00:00.000Z', sourceState: 'repo-a', exitCode: 0,
        result: 'pass', outputDigest: createHash('sha256').update('ok').digest('hex'),
        origin: 'automated',
        sourceDigests: Object.fromEntries(run.run.artifacts.map(
          (artifact: { path: string; sourceDigest: string }) => [artifact.path, artifact.sourceDigest],
        )),
      },
    }));
    const evidenceRecord = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'record', 'evidence', 'demo', '--project', root, '--input', evidenceInput,
      '--stage', 'automation',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(evidenceRecord).toMatchObject({ accepted: true, eventType: 'evidence.recorded' });
    const check = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'check', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(check.assurance).toMatchObject({
      status: 'error',
      repositoryContext: { status: 'unavailable' },
    });
    const status = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'status', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(status).toMatchObject({ changeName: 'demo', mode: 'guarded', tier: 'tier0' });
    const rootHelp = execFileSync(process.execPath, ['dist/cli.js', '--help'], {
      cwd: process.cwd(), encoding: 'utf8',
    });
    for (const command of ['plan', 'do', 'check', 'status', 'pause', 'resume']) expect(rootHelp).toContain(command);
    expect(rootHelp).not.toMatch(/^\s+run(?:-status)?\s/m);
  }, 20_000);

  it('pauses and resumes one selected change with JSON and text output', async () => {
    const { root } = await createOpenSpecProject();
    execFileSync(process.execPath, [
      'dist/cli.js', 'plan', 'demo', '--project', root, '--allow-self-review', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    const paused = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'pause', '--project', root, '--observed-quiescent', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(paused).toMatchObject({ safe: true, checkpoint: { changeName: 'demo' } });
    expect(execFileSync(process.execPath, [
      'dist/cli.js', 'pause', 'demo', '--project', root, '--observed-quiescent',
    ], { cwd: process.cwd(), encoding: 'utf8' })).toMatch(/paused|already paused/i);
    const preview = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'resume', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(preview).toMatchObject({ resumed: false, released: false, continued: false, decision: { restored: true } });
    const resumed = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'resume', '--project', root, '--enter', preview.decision.route, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(resumed).toMatchObject({ resumed: true, released: true, continued: false, decision: { restored: true } });
  });

  it('returns non-zero for an unsafe pause and rejects ambiguous omitted selection', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    execFileSync(process.execPath, [
      'dist/cli.js', 'plan', 'demo', '--project', root, '--allow-self-review', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    const { pauseRelayChangeV1 } = await import('../src/pause-resume.js');
    await pauseRelayChangeV1({
      change: 'demo', projectRoot: root,
      dispatches: [{ dispatchId: 'opaque-writer', readOnly: false, state: 'unknown' }],
    });
    const unsafe = spawnSync(process.execPath, [
      'dist/cli.js', 'pause', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(unsafe.status).not.toBe(0);
    expect(JSON.parse(unsafe.stdout)).toMatchObject({ safe: false });

    await fs.cp(changeDir, path.join(root, 'openspec', 'changes', 'second'), { recursive: true });
    const ambiguous = spawnSync(process.execPath, [
      'dist/cli.js', 'resume', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(ambiguous.status).not.toBe(0);
    expect(ambiguous.stderr).toMatch(/multiple|explicit/i);
  }, 20_000);

  it('auto-selects the sole active pre-proposal discussion without recency guessing', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.rm(changeDir, { recursive: true });
    const input = path.join(root, 'discussion.json');
    await fs.writeFile(input, JSON.stringify({
      workingId: 'one-idea', goal: 'Clarify one idea.',
      confirmedDecisions: [], rejectedAlternatives: [],
      openQuestions: [{ questionId: 'Q1', summary: 'Which outcome matters?' }], frontierIds: ['Q1'],
    }));
    execFileSync(process.execPath, [
      'dist/cli.js', 'pause', '--discussion', 'one-idea', '--input', input, '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    const resumed = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'resume', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(resumed).toMatchObject({ restored: true, workingId: 'one-idea', nextQuestion: { questionId: 'Q1' } });
  });

  it('does not advertise repair when this host has no repair adapter', () => {
    const help = execFileSync(process.execPath, [
      'dist/cli.js', 'check', '--help',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(help).not.toContain('--repair');
  });

  it('advertises every structured Tier 0 record operation and human acceptance', () => {
    const recordHelp = execFileSync(process.execPath, ['dist/cli.js', 'record', '--help'], {
      cwd: process.cwd(), encoding: 'utf8',
    });
    for (const command of ['task', 'evidence', 'finding', 'deviation', 'repair']) {
      expect(recordHelp).toContain(command);
    }
    const rootHelp = execFileSync(process.execPath, ['dist/cli.js', '--help'], {
      cwd: process.cwd(), encoding: 'utf8',
    });
    for (const command of ['accept', 'debug', 'uat']) expect(rootHelp).toContain(command);
  });
});
