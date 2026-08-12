import { AssuranceCheckV2Schema, type GuardrailsAssuranceV2, type GuardrailsRunV2 } from './schemas.js';
import { evaluateFindingObligations } from './findings.js';
import { validateTddEvidence } from './tdd.js';
import { mapScenarioCoverage } from './verification.js';

function independentEvidence(input: GuardrailsAssuranceV2, checkId: string): string[] {
  return input.evidence.filter((item) => item.checkId === checkId && item.result === 'pass' &&
    item.origin !== 'executor' && !input.staleEvidenceIds.includes(item.evidenceId)).map((item) => item.evidenceId);
}

function overall(checks: GuardrailsAssuranceV2['checks'], assurance: GuardrailsAssuranceV2): GuardrailsAssuranceV2['status'] {
  if (checks.some((item) => item.status === 'error')) return 'error';
  if (checks.some((item) => item.status === 'fail')) return 'fail';
  if (checks.some((item) => item.status === 'human_needed')) return 'human_needed';
  if (checks.some((item) => item.status === 'pending')) return 'pending';
  if (evaluateFindingObligations({ findings: assurance.findings, scenarios: assurance.uatScenarios }).blocking.length > 0) return 'fail';
  if (assurance.uatScenarios.some((item) => ['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale'].includes(item.status))) return 'human_needed';
  if (assurance.releaseCandidates.some((item) => item.applicable && item.status === 'error')) return 'error';
  if (assurance.releaseCandidates.some((item) => item.applicable && item.status === 'fail')) return 'fail';
  if (assurance.releaseCandidates.some((item) => item.applicable && item.status === 'human_needed')) return 'human_needed';
  if (checks.some((item) => item.status === 'warn')) return 'warn';
  return 'pass';
}

/** Evaluate deterministic evidence and preserve the lifecycle, UAT, readiness,
 * and release obligations that are already projected from the event history. */
export function evaluateAssuranceV2(run: GuardrailsRunV2, input: GuardrailsAssuranceV2): {
  checks: GuardrailsAssuranceV2['checks'];
  scenarioCoverage: GuardrailsAssuranceV2['scenarioCoverage'];
  status: GuardrailsAssuranceV2['status'];
  unresolvedHumanActions: string[];
} {
  const scenarios = run.artifacts.flatMap((artifact) => artifact.ids).filter((id) => id.includes('/scenario:'));
  const humanNeeded = Object.fromEntries(input.uatScenarios.filter((scenario) =>
    ['awaiting_human', 'awaiting_retest', 'blocked', 'stale'].includes(scenario.status))
    .map((scenario) => [scenario.scenarioId, scenario.action]));
  const scenarioCoverage = mapScenarioCoverage({
    scenarioIds: scenarios,
    evidence: input.evidence.filter((item) => !input.staleEvidenceIds.includes(item.evidenceId)),
    humanNeeded,
  });
  const checks = input.checks.map((check) => {
    if (check.kind === 'artifact-validation') return AssuranceCheckV2Schema.parse({
      ...check,
      status: run.artifacts.some((artifact) => artifact.kind === 'tasks') ? 'pass' : 'fail',
      summary: run.artifacts.some((artifact) => artifact.kind === 'tasks')
        ? 'Required OpenSpec artifacts were compiled.' : 'Required OpenSpec tasks artifact is missing.',
    });
    if (check.kind === 'repository-context') return AssuranceCheckV2Schema.parse({
      ...check,
      status: input.repositoryContext?.status === 'current' ? 'pass' : 'error',
      summary: input.repositoryContext?.status === 'current' ? 'Repository context is current.' : 'Repository context is unavailable or stale.',
    });
    if (check.kind === 'plan-readiness') {
      const ready = input.readiness?.status === 'pass';
      const required = run.config.features.readiness.rollout === 'required';
      return AssuranceCheckV2Schema.parse({
        ...check,
        status: ready ? 'pass' : required ? 'fail' : 'warn',
        summary: ready ? 'Independent plan readiness passed.' : required
          ? 'Required independent plan readiness is unresolved.' : 'Plan readiness is report-only and unresolved.',
      });
    }
    if (check.kind === 'release-assurance') {
      const applicable = input.releaseCandidates.filter((item) => item.applicable);
      const status = !applicable.length ? 'skipped' : applicable.some((item) => item.status === 'error') ? 'error'
        : applicable.some((item) => item.status === 'fail') ? 'fail'
          : applicable.some((item) => item.status === 'human_needed') ? 'human_needed'
            : applicable.some((item) => item.status === 'pending') ? 'pending' : 'pass';
      return AssuranceCheckV2Schema.parse({ ...check, status, summary: !applicable.length
        ? 'No release surface is applicable.' : `Release assurance is ${status}.` });
    }
    if (check.kind === 'tdd') {
      const results = run.tasks.filter((task) => task.tddRequired).map((task) => validateTddEvidence(task, input.evidence));
      return AssuranceCheckV2Schema.parse({ ...check, status: results.every((item) => item.valid) ? 'pass' : 'fail',
        summary: results.every((item) => item.valid) ? 'Required RED–GREEN–REFACTOR evidence is valid.'
          : results.flatMap((item) => item.diagnostics).join(' '), evidenceIds: results.flatMap((item) => item.evidenceIds) });
    }
    if (check.kind === 'scenario-coverage') {
      const missing = scenarioCoverage.filter((item) => item.status === 'missing');
      const human = scenarioCoverage.filter((item) => item.status === 'human_needed');
      return AssuranceCheckV2Schema.parse({ ...check, status: missing.length ? 'fail' : human.length ? 'human_needed' : 'pass',
        summary: missing.length ? `Missing scenario coverage: ${missing.map((item) => item.scenarioId).join(', ')}.`
          : human.length ? `Human validation required: ${human.map((item) => item.scenarioId).join(', ')}.`
            : 'Every declared scenario has observable coverage.', evidenceIds: scenarioCoverage.flatMap((item) => item.evidenceIds) });
    }
    const evidenceIds = independentEvidence(input, check.kind);
    return AssuranceCheckV2Schema.parse({ ...check, status: evidenceIds.length ? 'pass' : 'fail',
      summary: evidenceIds.length ? `${check.kind} has independent passing evidence.`
        : `${check.kind} lacks independent passing evidence.`, evidenceIds,
      remediation: evidenceIds.length ? [] : [`Run and record independent ${check.kind} evidence.`] });
  });
  const unresolvedHumanActions = [
    ...input.unresolvedHumanActions,
    ...checks.filter((item) => item.status === 'human_needed').map((item) => item.summary),
  ];
  const assurance = { ...input, checks, scenarioCoverage, unresolvedHumanActions };
  return { checks, scenarioCoverage, status: overall(checks, assurance), unresolvedHumanActions: [...new Set(unresolvedHumanActions)].sort() };
}
