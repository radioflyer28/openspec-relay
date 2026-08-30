import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/artifacts.js';
import {
  classifySemanticRequirements,
  recordSemanticDowngrade,
  reconcileSemanticClassification,
  resolveSemanticClassification,
  validateAchievedAssuranceClaim,
  validateSemanticStructure,
} from '../src/semantics.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('risk-proportional behavioral semantics', () => {
  it('parses complete multiline requirement and scenario bodies without losing labeled behavior', async () => {
    const { changeDir } = await createOpenSpecProject();
    await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
      '## ADDED Requirements', '',
      '### Requirement: Recover requests',
      'Scope: while connected',
      'Condition: after a transient failure',
      'Component: the client',
      'Response: shall retry without duplicating the request', '',
      '#### Scenario: Retry succeeds',
      '- **WHEN** the first attempt fails transiently',
      '- **THEN** the client retries once',
      '- **AND** the request is observed exactly once', '',
    ].join('\n'));
    const compiled = await compileOpenSpecChange({ changeDir });
    expect(compiled.requirements).toEqual([
      expect.objectContaining({
        title: 'Recover requests',
        body: expect.stringContaining('Component: the client'),
        scenarios: [expect.objectContaining({
          title: 'Retry succeeds',
          body: expect.stringContaining('request is observed exactly once'),
        })],
      }),
    ]);
  });

  it('classifies ordinary, behavioral, and modeling requirements with explicit rationale', () => {
    const classifications = classifySemanticRequirements([
      { id: 'simple', title: 'Show a label', body: 'The page shall show the account label.', scenarios: [] },
      { id: 'behavioral', title: 'Cancel work', body: 'When cancellation is requested, the worker shall stop before publishing another result.', scenarios: [] },
      { id: 'modeling', title: 'Authorize transition', body: 'Across concurrent authorization state transitions, an unauthenticated actor shall never become an owner.', scenarios: [] },
    ]);
    expect(classifications.map((item) => item.level)).toEqual(['simple', 'behavioral', 'modeling']);
    expect(classifications.every((item) => item.rationale.length > 0)).toBe(true);
  });

  it('does not elevate an ordinary outcome only because its OpenSpec scenario uses WHEN and THEN', () => {
    const [classification] = classifySemanticRequirements([{
      id: 'simple-with-scenario',
      title: 'Show an account label',
      body: 'The page shall show the account label.',
      scenarios: [{
        title: 'Label is visible',
        body: '- **WHEN** the page is displayed\n- **THEN** the account label is visible',
      }],
    }]);
    expect(classification).toMatchObject({ level: 'simple', triggers: [] });
  });

  it.each([
    'The page shall show the account owner name.',
    'The settings page shall show the current permission label.',
    'The log shall show concurrent request count.',
  ])('does not treat benign display vocabulary as a modeling obligation: %s', (body) => {
    expect(classifySemanticRequirements([{ id: 'display', title: 'Display value', body, scenarios: [] }])[0])
      .toMatchObject({ level: 'simple', triggers: [] });
  });

  it.each([
    ['modes', 'While the service is in maintenance mode, it shall reject writes.', 'behavioral'],
    ['ordering', 'The worker shall persist the record before publishing the event.', 'behavioral'],
    ['cancellation', 'When cancellation is requested, the worker shall stop.', 'behavioral'],
    ['retry', 'After a transient failure, the client shall retry the request.', 'behavioral'],
    ['recovery', 'When recovery begins, the store shall restore the last committed record.', 'behavioral'],
    ['concurrency invariant', 'Across concurrent writes, every committed record shall have exactly one owner.', 'modeling'],
    ['authorization state', 'Across authorization state transitions, an unauthenticated actor shall never become an owner.', 'modeling'],
    ['irreversible transition', 'After the irreversible terminal state, the job shall never resume.', 'modeling'],
  ])('classifies %s behavior proportionally', (_name, body, expected) => {
    expect(classifySemanticRequirements([{ id: 'r', title: 'Behavior', body, scenarios: [] }])[0].level)
      .toBe(expected);
  });

  it('raises but never silently lowers the planner classification', () => {
    const planner = { requirementId: 'r1', level: 'behavioral', rationale: 'Trigger and response are material.', triggers: ['trigger'], sourceRevision: 'a'.repeat(64), evidenceRefs: [] } as const;
    expect(reconcileSemanticClassification(planner, { ...planner, level: 'modeling', rationale: 'Invariant is consequential.' }).level)
      .toBe('modeling');
    expect(() => reconcileSemanticClassification(planner, { ...planner, level: 'simple', rationale: 'Looks easy.' }))
      .toThrow(/cannot lower/i);
  });

  it('preserves the deterministic lower bound and labels Tier 0 self-review honestly', () => {
    const requirement = {
      id: 'r1', title: 'Authorize transition',
      body: 'Across concurrent authorization state transitions, an unauthenticated actor shall never become an owner.',
      scenarios: [],
    };
    const minimum = classifySemanticRequirements([requirement])[0];
    expect(() => resolveSemanticClassification({
      requirement,
      planner: { ...minimum, level: 'simple', rationale: 'Caller says simple.', provenance: 'planner' },
      independentReview: false,
    })).toThrow(/lower bound/i);
    expect(resolveSemanticClassification({
      requirement,
      planner: { ...minimum, provenance: 'planner' },
      independentReview: false,
    }).provenance).toBe('tier0_self_review');
  });

  it('validates controlled behavioral structure without requiring empty formal sections', () => {
    expect(validateSemanticStructure({
      requirementId: 'r1', level: 'behavioral',
      body: 'When cancellation is requested, the worker shall stop before publishing another result.',
      design: '', tasks: '',
    })).toEqual(expect.objectContaining({ valid: true }));
    expect(validateSemanticStructure({
      requirementId: 'r2', level: 'modeling',
      body: 'The store shall preserve the invariant that every committed record has one owner.',
      design: '## State model\nStates and transitions.\n## Assumptions\nStorage is atomic.\n## Proof obligations\nCheck ownership.',
      tasks: '- [ ] Verify the ownership invariant under concurrent writes.',
    })).toEqual(expect.objectContaining({ valid: true }));
  });

  it('rejects formal claims without official tool evidence and records explicit downgrades', () => {
    expect(() => validateAchievedAssuranceClaim({ claim: 'PVS-proven', officialToolEvidence: [] }))
      .toThrow(/official tool evidence/i);
    expect(validateAchievedAssuranceClaim({ claim: 'counterexample-analyzed', officialToolEvidence: [] }))
      .toBe('counterexample-analyzed');
    const classification = classifySemanticRequirements([{
      id: 'r1', title: 'Authorize transition',
      body: 'Across concurrent authorization state transitions, an unauthenticated actor shall never become an owner.',
      scenarios: [],
    }])[0];
    expect(recordSemanticDowngrade({ classification, achievedLevel: 'behavioral' }))
      .toMatchObject({ requiredLevel: 'modeling', achievedLevel: 'behavioral', status: 'human_needed' });
    expect(recordSemanticDowngrade({
      classification, achievedLevel: 'behavioral', reason: 'Accept residual concurrency risk.', actor: 'developer',
    })).toMatchObject({ status: 'accepted', actor: 'developer' });
  });
});
