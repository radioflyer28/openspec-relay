import type { CheckerKind } from './modes.js';
import {
  type AssuranceCheckV1,
  type GuardrailsAssuranceV1,
  type GuardrailsRunV1,
} from './schemas.js';
import { validateTddEvidence } from './tdd.js';
import { mapScenarioCoverage, validateIndependentVerification } from './verification.js';

function pendingCheck(kind: CheckerKind): AssuranceCheckV1 {
  const independent = kind === 'code-review' || kind === 'goal-verification';
  return {
    checkId: kind,
    kind,
    status: 'pending',
    summary: `${kind} has not been evaluated.`,
    evidenceIds: [],
    readOnly: independent,
    independent,
    remediation: [],
  };
}

export function createInitialAssurance(
  run: GuardrailsRunV1,
  pipeline: CheckerKind[],
  previous?: GuardrailsAssuranceV1,
): GuardrailsAssuranceV1 {
  const previousChecks = new Map(previous?.checks.map((check) => [check.checkId, check]));
  return {
    version: 1,
    runId: run.runId,
    changeName: run.changeName,
    mode: run.mode,
    status: previous?.status ?? 'pending',
    updatedAt: new Date().toISOString(),
    checks: pipeline.map((kind) => previousChecks.get(kind) ?? pendingCheck(kind)),
    evidence: previous?.evidence ?? [],
    scenarioCoverage: previous?.scenarioCoverage ?? [],
    repairs: previous?.repairs ?? [],
    findings: previous?.findings ?? [],
    staleEvidenceIds: previous?.staleEvidenceIds ?? [],
    unresolvedHumanActions: previous?.unresolvedHumanActions ?? [],
  };
}

function passingEvidence(assurance: GuardrailsAssuranceV1, checkId: string): string[] {
  return assurance.evidence
    .filter((item) => item.checkId === checkId && item.result === 'pass' && item.origin !== 'executor')
    .map((item) => item.evidenceId);
}

function overall(checks: AssuranceCheckV1[]): GuardrailsAssuranceV1['status'] {
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'human_needed')) return 'human_needed';
  if (checks.some((check) => check.status === 'pending')) return 'pending';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

export function evaluateAssuranceState(
  run: GuardrailsRunV1,
  input: GuardrailsAssuranceV1,
): GuardrailsAssuranceV1 {
  const activeEvidence = input.evidence.filter(
    (item) => !input.staleEvidenceIds.includes(item.evidenceId),
  );
  const activeInput = { ...input, evidence: activeEvidence };
  const scenarioIds = run.artifacts.flatMap((artifact) => artifact.ids)
    .filter((id) => id.includes('/scenario:'));
  const requirementIds = run.artifacts.flatMap((artifact) => artifact.ids)
    .filter((id) => id.includes('#requirement:') && !id.includes('/scenario:'));
  const humanNeeded = Object.fromEntries(input.scenarioCoverage
    .filter((item) => item.status === 'human_needed' && item.acceptanceInstructions)
    .map((item) => [item.scenarioId, item.acceptanceInstructions!]));
  const coverage = mapScenarioCoverage({ scenarioIds, evidence: activeEvidence, humanNeeded });

  const checks = input.checks.map((check): AssuranceCheckV1 => {
    if (check.kind === 'artifact-validation') {
      const valid = run.artifacts.some((artifact) => artifact.kind === 'tasks');
      return { ...check, status: valid ? 'pass' : 'fail', summary: valid
        ? 'Required OpenSpec artifacts were compiled.'
        : 'Required OpenSpec tasks artifact is missing.' };
    }
    if (check.kind === 'repository-checks' || check.kind === 'targeted-tests') {
      const evidenceIds = passingEvidence(activeInput, check.kind);
      return {
        ...check,
        status: evidenceIds.length ? 'pass' : 'fail',
        summary: evidenceIds.length ? `${check.kind} passed.` : `${check.kind} lacks observable passing evidence.`,
        evidenceIds,
        remediation: evidenceIds.length ? [] : [`Run and record ${check.kind}.`],
      };
    }
    if (check.kind === 'tdd') {
      const required = run.tasks.filter((task) => task.tddRequired);
      const results = required.map((task) => validateTddEvidence(task, activeEvidence));
      const valid = results.every((result) => result.valid);
      return {
        ...check,
        status: valid ? 'pass' : 'fail',
        summary: valid ? 'Required RED–GREEN–REFACTOR evidence is valid.'
          : results.flatMap((result) => result.diagnostics).join(' '),
        evidenceIds: results.flatMap((result) => result.evidenceIds),
      };
    }
    if (check.kind === 'scenario-coverage') {
      const human = coverage.filter((item) => item.status === 'human_needed');
      const missing = coverage.filter((item) => item.status === 'missing');
      return {
        ...check,
        status: missing.length ? 'fail' : human.length ? 'human_needed' : 'pass',
        summary: missing.length ? `Missing scenario coverage: ${missing.map((item) => item.scenarioId).join(', ')}.`
          : human.length ? `Human validation required: ${human.map((item) => item.scenarioId).join(', ')}.`
            : 'Every declared scenario has observable coverage.',
        evidenceIds: coverage.flatMap((item) => item.evidenceIds),
      };
    }
    if (check.kind === 'code-review') {
      const reviewFindings = input.findings.filter((finding) => finding.origin === 'reviewer');
      const evidenceIds = reviewFindings.flatMap((finding) => finding.evidenceIds)
        .filter((id) => activeEvidence.some((item) => item.evidenceId === id && item.origin !== 'executor'));
      const failures = reviewFindings.filter((finding) => finding.status === 'fail');
      return {
        ...check,
        status: failures.length ? 'fail' : reviewFindings.length && evidenceIds.length ? 'pass' : 'fail',
        summary: failures.length ? `${failures.length} independent review finding(s) failed.`
          : reviewFindings.length && evidenceIds.length ? 'Independent code review passed.'
            : 'Independent code review evidence is missing.',
        evidenceIds,
      };
    }
    if (check.kind === 'goal-verification') {
      const verified = validateIndependentVerification({
        requirementIds,
        findings: input.findings,
        evidence: activeEvidence,
      });
      return {
        ...check,
        status: verified.valid ? 'pass' : 'fail',
        summary: verified.valid ? 'Independent goal verification passed.' : verified.diagnostics.join(' '),
        evidenceIds: verified.evidenceIds,
      };
    }
    const evidenceIds = passingEvidence(activeInput, check.kind);
    if (check.kind === 'human-uat' && evidenceIds.length === 0) {
      return { ...check, status: 'human_needed', summary: 'Human UAT acceptance is required.' };
    }
    return {
      ...check,
      status: evidenceIds.length ? 'pass' : 'fail',
      summary: evidenceIds.length ? `${check.kind} check passed.` : `${check.kind} check lacks independent evidence.`,
      evidenceIds,
    };
  });
  const unresolvedHumanActions = checks
    .filter((check) => check.status === 'human_needed')
    .map((check) => check.summary);
  return {
    ...input,
    updatedAt: new Date().toISOString(),
    checks,
    scenarioCoverage: coverage,
    status: overall(checks),
    unresolvedHumanActions,
  };
}
