import path from 'node:path';
import type { GateProviderV1, GateResultV1 } from '@fission-ai/openspec/extensions';
import { loadCanonicalGsdRecords } from './canonical-state.js';
import { evaluateFindingObligations } from './findings.js';
import { evaluateUatObligations, REQUIRED_UAT_PROJECTION_ERROR_ID } from './uat.js';
import {
  digestJson,
} from './state.js';

const GATE_ID = 'gsd.assurance';

function result(
  status: GateResultV1['status'],
  summary: string,
  evidence: string[] = [],
  remediation: string[] = [],
): GateResultV1 {
  return { gateId: GATE_ID, status, summary, evidence, remediation };
}

export const gsdAssuranceGate: GateProviderV1 = {
  async evaluate(context) {
    try {
      const canonical = await loadCanonicalGsdRecords(context.changeDir);
      const { run, assurance, stateRevision: canonicalRevision } = canonical;
      if (!canonical.projectionsMatch) {
        return result(
          'error',
          'OpenSpec GSD projections do not match canonical event replay.',
          [`${path.join('.openspec-gsd', 'events.json')}#sha256=${canonicalRevision}`],
          ['Run openspec-gsd check to regenerate projections from canonical events.'],
        );
      }
      if (run.runId !== assurance.runId || run.changeName !== context.changeName ||
          assurance.changeName !== context.changeName) {
        return result(
          'error',
          'OpenSpec GSD run, assurance, and OpenSpec change identities do not match.',
          [],
          ['Run openspec-gsd check to reconcile generated execution records.'],
        );
      }
      const assuranceDigest = digestJson(assurance);
      const evidence = [
        `${path.join('.openspec-gsd', 'events.json')}#sha256=${canonicalRevision}`,
        `${path.join('.openspec-gsd', 'assurance.json')}#sha256=${assuranceDigest}`,
      ];
      if (run.assuranceDigest !== assuranceDigest) {
        return result(
          'error',
          'OpenSpec GSD assurance record does not match the digest bound to the run.',
          evidence,
          ['Run openspec-gsd check to regenerate matching run and assurance records.'],
        );
      }
      {
        const findings = evaluateFindingObligations({ findings: assurance.findings, scenarios: assurance.uatScenarios });
        if (findings.blocking.length > 0) return result(
          'fail',
          `OpenSpec GSD has unresolved blocking findings: ${findings.blocking.join(', ')}.`,
          evidence,
          ['Repair the findings and record independent verification or an explicit accepted risk.'],
        );
        const debugging = assurance.debugSessions.filter((session) => session.status !== 'resolved' || !session.verification);
        if (debugging.length > 0) return result(
          'human_needed',
          `OpenSpec GSD has unresolved debugging investigations: ${debugging.map((session) =>
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
          `OpenSpec GSD requires UAT action for: ${uat.blocking.join(', ')}.`,
          evidence,
          ['Run openspec-gsd uat and record an explicit human disposition for each scenario.'],
        );
      }
      if (assurance.status === 'human_needed' || assurance.unresolvedHumanActions.length > 0) {
        return result(
          'human_needed',
          assurance.unresolvedHumanActions.join('; ') || 'OpenSpec GSD requires human acceptance.',
          evidence,
          ['Review the referenced evidence and record human acceptance in OpenSpec.'],
        );
      }
      if (assurance.status === 'pending') {
        return result(
          'fail',
          'OpenSpec GSD assurance is incomplete.',
          evidence,
          ['Run openspec-gsd check and resolve pending checks.'],
        );
      }
      if (assurance.status === 'fail' || assurance.status === 'error') {
        const blocking = assurance.checks
          .filter((check) => check.status === 'fail' || check.status === 'error')
          .map((check) => check.checkId);
        return result(
          assurance.status,
          `OpenSpec GSD assurance is ${assurance.status}${blocking.length ? `: ${blocking.join(', ')}` : '.'}`,
          evidence,
          ['Resolve the blocking checks and rerun openspec-gsd check.'],
        );
      }
      if (assurance.status === 'warn') {
        return result('warn', 'OpenSpec GSD assurance passed with warnings.', evidence);
      }
      return result('pass', 'OpenSpec GSD assurance passed.', evidence);
    } catch (error) {
      return result(
        'error',
        `OpenSpec GSD assurance records are unavailable or invalid: ${(error as Error).message}`,
        [],
        ['Run openspec-gsd plan or check to recreate valid generated records.'],
      );
    }
  },
};
