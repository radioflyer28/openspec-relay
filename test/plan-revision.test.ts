import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { appendGsdEventV2, createGsdEventV2, readEventStoreV2, writeReplayedProjectionsV2 } from '../src/events.js';
import {
  computeSemanticPlanRevision,
  createPlanApproval,
  isPlanApprovalCurrent,
} from '../src/planning.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';
import { startGsdRunV2 } from '../src/runner-v2.js';

afterEach(cleanupTemporaryRoots);

describe('semantic plan revisions', () => {
  it('ignores only standard task completion markers', async () => {
    const { changeDir } = await createOpenSpecProject();
    const first = await computeSemanticPlanRevision({
      changeDir,
      compiled: await compileOpenSpecChange({ changeDir }),
    });
    const tasksPath = path.join(changeDir, 'tasks.md');
    await fs.writeFile(tasksPath, (await fs.readFile(tasksPath, 'utf8')).replace('- [ ] 1.1', '- [x] 1.1'));
    const progressed = await computeSemanticPlanRevision({
      changeDir,
      compiled: await compileOpenSpecChange({ changeDir }),
    });
    expect(progressed.revision).toBe(first.revision);
    await fs.writeFile(tasksPath, (await fs.readFile(tasksPath, 'utf8')).replace('Implement behavior', 'Implement durable behavior'));
    const changed = await computeSemanticPlanRevision({
      changeDir,
      compiled: await compileOpenSpecChange({ changeDir }),
    });
    expect(changed.revision).not.toBe(first.revision);
  });

  it('changes for authoritative artifacts but not unrelated files or enumeration order', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const compiled = await compileOpenSpecChange({ changeDir });
    const first = await computeSemanticPlanRevision({ changeDir, compiled });
    const reversed = await computeSemanticPlanRevision({
      changeDir,
      compiled: { ...compiled, artifacts: [...compiled.artifacts].reverse() },
    });
    expect(reversed.revision).toBe(first.revision);
    await fs.writeFile(path.join(root, 'unrelated.txt'), 'ignored');
    expect((await computeSemanticPlanRevision({ changeDir, compiled })).revision).toBe(first.revision);
    await fs.appendFile(path.join(changeDir, 'design.md'), '\nA semantic design commitment.\n');
    const designChanged = await computeSemanticPlanRevision({
      changeDir,
      compiled: await compileOpenSpecChange({ changeDir }),
    });
    expect(designChanged.revision).not.toBe(first.revision);
  });

  it('binds approval to the semantic revision without copying artifact prose', async () => {
    const { changeDir } = await createOpenSpecProject();
    const revision = await computeSemanticPlanRevision({ changeDir, compiled: await compileOpenSpecChange({ changeDir }) });
    const approval = createPlanApproval({
      revision: revision.revision,
      approvedAt: '2026-08-29T12:00:00.000Z',
      independent: true,
      reviewerId: 'reviewer-1',
      semanticLevels: [{ requirementId: 'REQ-1', level: 'behavioral' }],
      evidenceRefs: ['review:1'],
    });
    expect(isPlanApprovalCurrent(approval, revision.revision)).toBe(true);
    expect(isPlanApprovalCurrent(approval, 'f'.repeat(64))).toBe(false);
    expect(JSON.stringify(approval)).not.toContain('The system SHALL');
  });

  it('replays planning events into replaceable projections without fabricating approval', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const initial = await startGsdRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    expect(initial).toMatchObject({ run: { planApprovalStatus: 'missing' }, assurance: { planStale: false } });
    let store = await readEventStoreV2(changeDir);
    const compiled = await compileOpenSpecChange({ changeDir });
    const semantic = await computeSemanticPlanRevision({ changeDir, compiled });
    const sourceDigests = Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest]));
    const approval = createPlanApproval({
      revision: semantic.revision,
      approvedAt: '2026-08-29T12:00:00.000Z',
      independent: true,
      reviewerId: 'reviewer-1',
      semanticLevels: [{ requirementId: compiled.requirementIds[0], level: 'simple' }],
      evidenceRefs: ['review:1'],
    });
    await appendGsdEventV2({ changeDir, event: createGsdEventV2({
      eventId: 'plan-approved', runId: store.runId, changeName: store.changeName,
      occurredAt: approval.approvedAt, sourceDigests,
      actor: { kind: 'plan_reviewer', id: 'reviewer-1' },
      provenance: { origin: 'plan-revision-test' }, payload: { type: 'plan.approved', approval },
    }) });
    store = await readEventStoreV2(changeDir);
    const current = await writeReplayedProjectionsV2({ changeDir, store, compiled });
    expect(current).toMatchObject({
      run: { planApprovalStatus: 'current', planRevision: semantic.revision },
      assurance: { planApproval: { revision: semantic.revision }, planStale: false },
    });
    await appendGsdEventV2({ changeDir, event: createGsdEventV2({
      eventId: 'plan-stale', runId: store.runId, changeName: store.changeName,
      occurredAt: '2026-08-29T12:01:00.000Z', sourceDigests,
      actor: { kind: 'automation' }, provenance: { origin: 'plan-revision-test' },
      payload: { type: 'plan.stale', approvedRevision: semantic.revision, currentRevision: 'f'.repeat(64) },
    }) });
    const stale = await writeReplayedProjectionsV2({
      changeDir, store: await readEventStoreV2(changeDir), compiled,
    });
    expect(stale).toMatchObject({
      run: { planApprovalStatus: 'stale' }, assurance: { planStale: true, status: 'fail' },
    });
  });

  it('automatically preserves approval for checkbox progress and stales semantic edits', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGsdRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const store = await readEventStoreV2(changeDir);
    let compiled = await compileOpenSpecChange({ changeDir });
    const semantic = await computeSemanticPlanRevision({ changeDir, compiled });
    const approval = createPlanApproval({
      revision: semantic.revision,
      approvedAt: '2026-08-29T12:00:00.000Z',
      independent: true,
      reviewerId: 'reviewer-1',
    });
    await appendGsdEventV2({ changeDir, event: createGsdEventV2({
      eventId: 'automatic-plan-approved', runId: store.runId, changeName: store.changeName,
      occurredAt: approval.approvedAt,
      sourceDigests: Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.sourceDigest])),
      actor: { kind: 'plan_reviewer', id: 'reviewer-1' },
      provenance: { origin: 'automatic-staleness-test' }, payload: { type: 'plan.approved', approval },
    }) });
    await writeReplayedProjectionsV2({ changeDir, store: await readEventStoreV2(changeDir), compiled });

    const tasksPath = path.join(changeDir, 'tasks.md');
    await fs.writeFile(tasksPath, (await fs.readFile(tasksPath, 'utf8')).replace('- [ ] 1.1', '- [x] 1.1'));
    const progressed = await startGsdRunV2({
      change: 'demo', projectRoot: root, changedFiles: [], now: '2026-08-29T12:01:00.000Z',
    });
    expect(progressed.run.planApprovalStatus).toBe('current');

    await fs.writeFile(tasksPath, (await fs.readFile(tasksPath, 'utf8')).replace('Implement behavior', 'Implement durable behavior'));
    const changed = await startGsdRunV2({
      change: 'demo', projectRoot: root, changedFiles: [], now: '2026-08-29T12:02:00.000Z',
    });
    expect(changed).toMatchObject({
      run: { planApprovalStatus: 'stale' }, assurance: { planStale: true, status: 'fail' },
    });
    compiled = await compileOpenSpecChange({ changeDir });
    expect((await computeSemanticPlanRevision({ changeDir, compiled })).revision).not.toBe(semantic.revision);
  });
});
