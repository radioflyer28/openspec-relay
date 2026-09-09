import { describe, expect, it } from 'vitest';
import { evaluateResumeRouteV1, type ResumeRouteEvidenceV1 } from '../src/resume-route.js';

const base: ResumeRouteEvidenceV1 = {
  integrity: 'pass', candidateIds: ['demo'], artifactState: 'complete', artifactsChanged: false,
  discussionOpen: false, planApproval: 'current', activeDebug: false, pendingWork: true,
  pendingUat: false, archiveReady: false, requiredAuthority: [], hasCheckpoint: true,
};
const route = (changes: Partial<ResumeRouteEvidenceV1>) => evaluateResumeRouteV1({ ...base, ...changes });

describe('deterministic resume routing', () => {
  it.each([
    [{ integrity: 'error' }, 'check'],
    [{ candidateIds: ['a', 'b'] }, 'select'],
    [{ discussionOpen: true }, 'discuss'],
    [{ artifactState: 'missing' }, 'propose'],
    [{ artifactState: 'incoherent' }, 'update'],
    [{ artifactsChanged: true }, 'plan'],
    [{ planApproval: 'stale' }, 'plan'],
    [{ activeDebug: true }, 'debug'],
    [{ pendingWork: true }, 'do'],
    [{ pendingWork: false, pendingUat: true }, 'uat'],
    [{ pendingWork: false, archiveReady: true }, 'archive'],
  ] as const)('routes evidence %# by priority', (changes, expected) => {
    expect(route(changes).route).toBe(expected);
  });

  it('labels missing-checkpoint decisions reconstructed and blocks automatic new authority', () => {
    expect(route({ hasCheckpoint: false })).toMatchObject({ route: 'do', restored: false, automatic: true });
    expect(route({ requiredAuthority: ['git.worktree'] })).toMatchObject({
      route: 'do', automatic: false, requiredAuthority: ['git.worktree'],
    });
  });
});
