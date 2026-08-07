import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getRunStatus,
  readRunState,
  seedAssuranceState,
  startGuardrailsRun,
  writeRunState,
} from '../src/index.js';
import { cleanupTemporaryRoots, createOpenSpecProject, evidence } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('live OpenSpec source reconciliation', () => {
  it('derives checked, added, removed, and reordered tasks from current tasks.md', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    expect((await getRunStatus({ change: 'demo', projectRoot: root })).reconciliation.unchanged)
      .toBe(true);

    await fs.writeFile(path.join(changeDir, 'tasks.md'), [
      '## 1. Work',
      '',
      '- [ ] 1.3 Newly added task',
      '- [x] 1.1 Implement behavior',
      '',
    ].join('\n'));
    const status = await getRunStatus({ change: 'demo', projectRoot: root });
    expect(status.tasks).toEqual({ total: 2, complete: 1, blocked: 0 });
    expect(status.reconciliation).toMatchObject({
      addedTaskIds: ['1.3'],
      removedTaskIds: ['1.2'],
      taskStatusChangedIds: ['1.1'],
    });
  });

  it('does not use generated task status as an input to current progress', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const generated = await readRunState(changeDir);
    await writeRunState(changeDir, {
      ...generated,
      tasks: generated.tasks.map((task) => ({ ...task, status: 'complete' as const })),
    });
    const status = await getRunStatus({ change: 'demo', projectRoot: root });
    expect(status.tasks).toEqual({ total: 2, complete: 0, blocked: 0 });
    expect(status.reconciliation.taskStatusChangedIds).toEqual(['1.1', '1.2']);
  });

  it('detects changed requirements and scenarios and stales digest-bound evidence', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const started = await startGuardrailsRun({ change: 'demo', projectRoot: root });
    const spec = started.run.artifacts.find((artifact) => artifact.kind === 'spec')!;
    await seedAssuranceState({
      change: 'demo',
      projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        evidence: [evidence({
          evidenceId: 'spec-bound',
          phase: 'check',
          checkId: 'targeted-tests',
          result: 'pass',
          origin: 'automated',
          sourceDigests: { [spec.path]: spec.sourceDigest },
        })],
      }),
    });
    await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements',
      '',
      '### Requirement: Demonstrate revised behavior',
      'The system SHALL demonstrate revised behavior.',
      '',
      '#### Scenario: Revised works',
      '- **WHEN** invoked again',
      '- **THEN** it still works',
      '',
    ].join('\n'));
    const status = await getRunStatus({ change: 'demo', projectRoot: root });
    expect(status.reconciliation.changedArtifactPaths).toContain('specs/demo/spec.md');
    expect(status.reconciliation.changedRequirementIds.length).toBe(2);
    expect(status.reconciliation.changedScenarioIds.length).toBe(2);
    expect(status.reconciliation.staleEvidenceIds).toEqual(['spec-bound']);
    expect(status.staleEvidenceCount).toBe(1);
  });

  it('rejects durable task evidence bound to a positional compatibility ID', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] Implement behavior\n');
    await startGuardrailsRun({ change: 'demo', projectRoot: root });
    await seedAssuranceState({
      change: 'demo',
      projectRoot: root,
      update: (assurance) => ({
        ...assurance,
        evidence: [evidence({
          evidenceId: 'unstable-task',
          taskId: 'position:1',
          phase: 'check',
          checkId: 'targeted-tests',
          result: 'pass',
          origin: 'automated',
        })],
      }),
    });
    await expect(getRunStatus({ change: 'demo', projectRoot: root }))
      .rejects.toThrow(/explicit stable identifier/i);
  });
});
