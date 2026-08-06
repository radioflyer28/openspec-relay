import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkGuardrailsRun,
  getRunStatus,
  readRunState,
  seedAssuranceState,
  startGuardrailsRun,
  writeRunState,
} from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject, evidence } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('Guardrails run and status', () => {
  it.each(['quick', 'guarded', 'full'] as const)('starts %s mode at portable Tier 0', async (mode) => {
    const { root } = await createOpenSpecProject(`${mode}-change`);
    const result = await startGuardrailsRun({
      change: `${mode}-change`, projectRoot: root, config: { mode },
    });
    expect(result.run).toMatchObject({ mode, tier: 'tier0' });
    expect(result.assurance.checks.map((check) => check.kind)).toContain('goal-verification');
    if (mode === 'quick') expect(result.assurance.checks.map((check) => check.kind)).not.toContain('tdd');
    else expect(result.assurance.checks.map((check) => check.kind)).toContain('tdd');
  });

  it('starts guarded Tier 0 by default, resumes atomically, and registers its archive gate', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const first = await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const second = await startGuardrailsRun({ change: 'demo', projectRoot: root });
    expect(first.run).toMatchObject({ mode: 'guarded', tier: 'tier0', status: 'running' });
    expect(second.run.runId).toBe(first.run.runId);
    expect(JSON.parse(await fs.readFile(path.join(changeDir, '.openspec-gates.json'), 'utf8')))
      .toMatchObject({ gates: [{ gateId: 'guardrails.assurance', extensionId: 'guardrails' }] });
    expect((await getRunStatus({ change: 'demo', projectRoot: root }))).toMatchObject({
      mode: 'guarded', tier: 'tier0', gates: ['guardrails.assurance'], assuranceDigestMatches: true,
    });
  });

  it('passes a complete quick Tier 0 assurance run using independent evidence', async () => {
    const { root } = await createOpenSpecProject();
    const started = await startGuardrailsRun({ change: 'demo', projectRoot: root, config: { mode: 'quick' } });
    const requirementId = started.run.artifacts.flatMap((item) => item.ids)
      .find((id) => id.includes('#requirement:') && !id.includes('/scenario:'))!;
    const scenarioId = started.run.artifacts.flatMap((item) => item.ids)
      .find((id) => id.includes('/scenario:'))!;
    await seedAssuranceState({
      change: 'demo', projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        evidence: [
          evidence({ evidenceId: 'repo', phase: 'check', checkId: 'repository-checks', result: 'pass', origin: 'automated' }),
          evidence({ evidenceId: 'tests', phase: 'check', checkId: 'targeted-tests', result: 'pass', origin: 'automated', reference: scenarioId }),
          evidence({ evidenceId: 'verify', phase: 'verify', checkId: 'goal-verification', result: 'pass', origin: 'automated' }),
        ],
        findings: [{
          findingId: 'goal', requirementId, status: 'pass', summary: 'Observed behavior passes.',
          evidenceIds: ['verify'], origin: 'verifier',
        }],
      }),
    });
    const checked = await checkGuardrailsRun({ change: 'demo', projectRoot: root });
    expect(checked.assurance.status).toBe('pass');
    expect(checked.run.status).toBe('complete');
    expect(checked.run.assuranceDigest).toBeDefined();
  });

  it.each(['guarded', 'full'] as const)(
    'passes a complete %s Tier 0 run with TDD and every specialist route',
    async (mode) => {
      const { root, changeDir } = await createOpenSpecProject(`${mode}-complete`);
      const specialistCheckers = [
        'security', 'integration', 'ui', 'ai-evaluation', 'compatibility',
        'documentation', 'human-uat',
      ];
      const started = await startGuardrailsRun({
        change: `${mode}-complete`,
        projectRoot: root,
        config: {
          mode,
          requiredCheckers: specialistCheckers,
          taskOverrides: {
            '1.1': { risk: 'high', writeSet: ['src/behavior.ts'] },
            '1.2': { risk: 'low', writeSet: ['docs/guide.md'] },
          },
        },
      });
      const requirementId = started.run.artifacts.flatMap((item) => item.ids)
        .find((id) => id.includes('#requirement:') && !id.includes('/scenario:'))!;
      const scenarioId = started.run.artifacts.flatMap((item) => item.ids)
        .find((id) => id.includes('/scenario:'))!;
      const run = {
        ...started.run,
        tasks: started.run.tasks.map((task) => task.taskId === '1.1'
          ? { ...task, implementationStartedAt: '2026-08-04T12:05:00.000Z', status: 'complete' as const }
          : { ...task, status: 'complete' as const }),
      };
      await writeRunState(changeDir, run);
      await seedAssuranceState({
        change: `${mode}-complete`, projectRoot: root,
        update: (assurance) => ({
          ...assurance,
          evidence: [
            evidence({ evidenceId: 'repo', phase: 'check', checkId: 'repository-checks', result: 'pass', origin: 'automated' }),
            evidence({ evidenceId: 'tests', phase: 'check', checkId: 'targeted-tests', result: 'pass', origin: 'automated', reference: scenarioId }),
            evidence({ evidenceId: 'red', taskId: '1.1', phase: 'red', checkId: 'behavior-test', result: 'fail', exitCode: 1, relevantFailure: true, origin: 'automated', observedAt: '2026-08-04T12:00:00.000Z', sourceState: 'before' }),
            evidence({ evidenceId: 'green', taskId: '1.1', phase: 'green', checkId: 'behavior-test', result: 'pass', exitCode: 0, origin: 'automated', observedAt: '2026-08-04T12:10:00.000Z', sourceState: 'implemented' }),
            evidence({ evidenceId: 'refactor', taskId: '1.1', phase: 'refactor', checkId: 'behavior-test', result: 'pass', exitCode: 0, origin: 'automated', observedAt: '2026-08-04T12:15:00.000Z', sourceState: 'refactored' }),
            evidence({ evidenceId: 'review', phase: 'review', checkId: 'code-review', result: 'pass', origin: 'reviewer' }),
            evidence({ evidenceId: 'verify', phase: 'verify', checkId: 'goal-verification', result: 'pass', origin: 'verifier' }),
            ...specialistCheckers.map((checkId) => evidence({
              evidenceId: `specialist-${checkId}`,
              phase: checkId === 'human-uat' ? 'human' as const : 'check' as const,
              checkId,
              result: 'pass',
              origin: checkId === 'human-uat' ? 'human' as const : 'automated' as const,
            })),
          ],
          findings: [
            { findingId: 'review-finding', requirementId, status: 'pass', summary: 'Review passed.', evidenceIds: ['review'], origin: 'reviewer' },
            { findingId: 'goal-finding', requirementId, status: 'pass', summary: 'Goal verified.', evidenceIds: ['verify'], origin: 'verifier' },
          ],
        }),
      });
      const checked = await checkGuardrailsRun({ change: `${mode}-complete`, projectRoot: root });
      expect(checked.assurance.status).toBe('pass');
      expect(checked.assurance.checks.every((check) => check.status === 'pass')).toBe(true);
    },
  );

  it('does not create commits, branches, or worktrees under default execution', async () => {
    const { root } = await createOpenSpecProject();
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'guardrails@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Guardrails Test'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const branches = execFileSync('git', ['branch', '--format=%(refname)'], { cwd: root, encoding: 'utf8' });
    const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).toBe(head);
    expect(execFileSync('git', ['branch', '--format=%(refname)'], { cwd: root, encoding: 'utf8' })).toBe(branches);
    expect(execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe(worktrees);
  });

  it('keeps generated records reference-only and creates no competing GSD planning files', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const run = await readRunState(changeDir);
    expect(JSON.stringify(run)).not.toContain('Implement behavior');
    for (const filename of ['PROJECT.md', 'ROADMAP.md', 'PLAN.md', 'STATE.md']) {
      await expect(fs.access(path.join(changeDir, filename))).rejects.toThrow();
    }
  });
});
