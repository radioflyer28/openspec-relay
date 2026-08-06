import type { AssuranceCheckV1, RunMode } from './schemas.js';

export type CheckerKind = AssuranceCheckV1['kind'];

const QUICK: CheckerKind[] = [
  'artifact-validation',
  'repository-checks',
  'targeted-tests',
  'scenario-coverage',
  'goal-verification',
];

export function selectAssurancePipeline(
  mode: RunMode,
  specialistCheckers: CheckerKind[] = [],
): CheckerKind[] {
  if (mode === 'quick') return QUICK;
  const guarded: CheckerKind[] = [
    'artifact-validation',
    'repository-checks',
    'targeted-tests',
    'tdd',
    'scenario-coverage',
    'code-review',
    ...specialistCheckers,
    'goal-verification',
  ];
  return [...new Set(guarded)];
}
