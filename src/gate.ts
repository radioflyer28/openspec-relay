import path from 'node:path';
import type { GateProviderV1, GateResultV1 } from '@fission-ai/openspec/extensions';
import { loadCanonicalGuardrailsRecords } from './canonical-state.js';
import { evaluateFindingObligations } from './findings.js';
import { evaluateUatObligations, REQUIRED_UAT_PROJECTION_ERROR_ID } from './uat.js';
import {
  digestJson,
} from './state.js';

const GATE_ID = 'guardrails.assurance';

function result(
  status: GateResultV1['status'],
  summary: string,
  evidence: string[] = [],
  remediation: string[] = [],
): GateResultV1 {
  return { gateId: GATE_ID, status, summary, evidence, remediation };
}

export const guardrailsAssuranceGate: GateProviderV1 = {
  async evaluate(context) {
    try {
      const canonical = await loadCanonicalGuardrailsRecords(context.changeDir);
      const { run, assurance, stateRevision: canonicalRevision } = canonical;
      if (!canonical.projectionsMatch) {
        return result(
          'error',
          'Guardrails projections do not match canonical event replay.',
          [`${path.join('.guardrails', 'events.json')}#sha256=${canonicalRevision}`],
          ['Run openspec-guardrails check to regenerate projections from canonical events.'],
        );
      }
      if (run.runId !== assurance.runId || run.changeName !== context.changeName ||
          assurance.changeName !== context.changeName) {
        return result(
          'error',
          'Guardrails run, assurance, and OpenSpec change identities do not match.',
          [],
          ['Run openspec-guardrails check to reconcile generated state.'],
        );
      }
      const assuranceDigest = digestJson(assurance);
      const evidence = [
        `${path.join('.guardrails', 'events.json')}#sha256=${canonicalRevision}`,
        `${path.join('.guardrails', 'assurance.json')}#sha256=${assuranceDigest}`,
      ];
      if (run.assuranceDigest !== assuranceDigest) {
        return result(
          'error',
          'Guardrails assurance state does not match the digest bound to the run.',
          evidence,
          ['Run openspec-guardrails check to regenerate matching run and assurance records.'],
        );
      }
      {
        const findings = evaluateFindingObligations({ findings: assurance.findings, scenarios: assurance.uatScenarios });
        if (findings.blocking.length > 0) return result(
          'fail',
          `Guardrails has unresolved blocking findings: ${findings.blocking.join(', ')}.`,
          evidence,
          ['Repair the findings and record independent verification or an explicit accepted risk.'],
        );
        const debugging = assurance.debugSessions.filter((session) => session.status !== 'resolved' || !session.verification);
        if (debugging.length > 0) return result(
          'human_needed',
          `Guardrails has unresolved debugging investigations: ${debugging.map((session) =>
            `${session.sessionId}${session.nextAction ? ` (${session.nextAction})` : ''}`).join(', ')}.`,
          evidence,
          ['Continue the structured investigation, record an evidence-backed root cause, and verify the regression fix.'],
        );
        const uat = evaluateUatObligations({ scenarios: assurance.uatScenarios });
        if (uat.blocking.includes(REQUIRED_UAT_PROJECTION_ERROR_ID)) return result(
          'error',
          'Required UAT has no projected OpenSpec acceptance scenario.',
          evidence,
          ['Repair OpenSpec scenario coverage or record an explicit non-applicability decision.'],
        );
        if (uat.blocking.length > 0) return result(
          'human_needed',
          `Guardrails requires UAT action for: ${uat.blocking.join(', ')}.`,
          evidence,
          ['Run openspec-guardrails uat and record an explicit human disposition for each scenario.'],
        );
      }
      if (assurance.status === 'human_needed' || assurance.unresolvedHumanActions.length > 0) {
        return result(
          'human_needed',
          assurance.unresolvedHumanActions.join('; ') || 'Guardrails requires human acceptance.',
          evidence,
          ['Review the referenced evidence and record human acceptance in OpenSpec.'],
        );
      }
      if (assurance.status === 'pending') {
        return result(
          'fail',
          'Guardrails assurance is incomplete.',
          evidence,
          ['Run openspec-guardrails check and resolve pending checks.'],
        );
      }
      if (assurance.status === 'fail' || assurance.status === 'error') {
        const blocking = assurance.checks
          .filter((check) => check.status === 'fail' || check.status === 'error')
          .map((check) => check.checkId);
        return result(
          assurance.status,
          `Guardrails assurance is ${assurance.status}${blocking.length ? `: ${blocking.join(', ')}` : '.'}`,
          evidence,
          ['Resolve the blocking checks and rerun openspec-guardrails check.'],
        );
      }
      if (assurance.status === 'warn') {
        return result('warn', 'Guardrails assurance passed with warnings.', evidence);
      }
      return result('pass', 'Guardrails assurance passed.', evidence);
    } catch (error) {
      return result(
        'error',
        `Guardrails assurance records are unavailable or invalid: ${(error as Error).message}`,
        [],
        ['Run openspec-guardrails run or check to recreate valid generated records.'],
      );
    }
  },
};
