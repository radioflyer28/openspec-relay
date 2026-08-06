import type { EvidenceV1, TaskNodeV1, TddPolicy } from './schemas.js';

export interface ResolvedTddRequirementV1 {
  policy: TddPolicy;
  required: boolean;
  exemptionReason?: string;
}

export function resolveTddPolicy(options: {
  project?: TddPolicy;
  change?: TddPolicy;
  task?: TddPolicy;
}): TddPolicy {
  return options.task ?? options.change ?? options.project ?? 'auto';
}

function isNonExecutable(task: TaskNodeV1): boolean {
  const paths = task.writeSet.map((value) => value.toLowerCase());
  return paths.length > 0 && paths.every((value) =>
    value.endsWith('.md') || value.endsWith('.txt') || value.includes('/generated/') ||
    value.endsWith('.snap') || value.endsWith('.lock'));
}

export function classifyTddRequirement(
  task: TaskNodeV1,
  policy: TddPolicy,
): ResolvedTddRequirementV1 {
  if (policy === 'off') return { policy, required: false, exemptionReason: 'TDD policy is off.' };
  if (isNonExecutable(task)) {
    return {
      policy,
      required: false,
      exemptionReason: 'Task changes only documentation, generated output, or non-executable files.',
    };
  }
  if (policy === 'always') return { policy, required: true };
  const required = task.risk !== 'low' || task.expectedVerification.some((value) =>
    /behavior|defect|public|contract|security|targeted-tests|risk-review/i.test(value));
  return required
    ? { policy, required: true }
    : { policy, required: false, exemptionReason: 'Automatic risk classification does not require TDD.' };
}

export interface TddEvidenceResultV1 {
  valid: boolean;
  diagnostics: string[];
  evidenceIds: string[];
}

export function validateTddEvidence(
  task: TaskNodeV1,
  evidence: EvidenceV1[],
): TddEvidenceResultV1 {
  if (!task.tddRequired) return { valid: true, diagnostics: [], evidenceIds: [] };
  const taskEvidence = evidence.filter((item) => item.taskId === task.taskId);
  const reds = taskEvidence.filter((item) => item.phase === 'red');
  const diagnostics: string[] = [];
  if (!task.implementationStartedAt) {
    return {
      valid: false,
      diagnostics: [`Task '${task.taskId}' has no recorded implementation start for fail-first ordering.`],
      evidenceIds: taskEvidence.map((item) => item.evidenceId),
    };
  }
  for (const red of reds) {
    const green = taskEvidence.find((item) => item.phase === 'green' && item.checkId === red.checkId);
    const refactor = taskEvidence.find((item) => item.phase === 'refactor' && item.checkId === red.checkId);
    const redTime = Date.parse(red.observedAt);
    const startTime = task.implementationStartedAt ? Date.parse(task.implementationStartedAt) : Infinity;
    if (red.result !== 'fail' || red.exitCode === 0 || !red.relevantFailure || red.preExistingFailure) continue;
    if (redTime >= startTime) continue;
    if (!green || green.result !== 'pass' || (green.exitCode !== undefined && green.exitCode !== 0)) continue;
    if (!refactor || refactor.result !== 'pass' ||
        (refactor.exitCode !== undefined && refactor.exitCode !== 0)) continue;
    if (Date.parse(green.observedAt) <= redTime || Date.parse(refactor.observedAt) < Date.parse(green.observedAt)) continue;
    if (green.sourceState === red.sourceState) continue;
    return { valid: true, diagnostics: [], evidenceIds: [red.evidenceId, green.evidenceId, refactor.evidenceId] };
  }
  if (reds.some((item) => item.preExistingFailure)) {
    diagnostics.push('Pre-existing failures cannot satisfy task-specific RED evidence.');
  }
  diagnostics.push(
    `Task '${task.taskId}' lacks source-bound RED, GREEN, and REFACTOR evidence for the same relevant check.`,
  );
  return { valid: false, diagnostics, evidenceIds: taskEvidence.map((item) => item.evidenceId) };
}
