import path from 'node:path';
import type { GateProviderV1, GateResultV1 } from '@fission-ai/openspec/extensions';
import { compileOpenSpecChange } from './artifacts.js';
import {
  readEventStore,
  readEventStoreV2,
  replayGuardrailsEvents,
  replayGuardrailsEventsV2,
} from './events.js';
import { evaluateFindingObligations } from './findings.js';
import { evaluateUatObligations } from './uat.js';
import {
  digestJson,
  readAssuranceState,
  readAssuranceStateV2,
  readRunState,
  readRunStateV2,
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
      let run: Awaited<ReturnType<typeof readRunState>> | Awaited<ReturnType<typeof readRunStateV2>>;
      let assurance: Awaited<ReturnType<typeof readAssuranceState>> | Awaited<ReturnType<typeof readAssuranceStateV2>>;
      let canonicalRun: typeof run;
      let canonicalAssurance: typeof assurance;
      let canonicalRevision: string;
      let canonicalProjectionRequired = false;
      try {
        const store = await readEventStoreV2(context.changeDir);
        const compiled = await compileOpenSpecChange({
          changeDir: context.changeDir,
          taskMetadata: store.seed.config.taskOverrides,
        });
        const canonical = replayGuardrailsEventsV2({ store, compiled });
        canonicalRun = canonical.run;
        canonicalAssurance = canonical.assurance;
        canonicalRevision = digestJson(store);
        canonicalProjectionRequired = true;
        run = await readRunStateV2(context.changeDir);
        assurance = await readAssuranceStateV2(context.changeDir);
      } catch (v2Error) {
        try {
          const store = await readEventStore(context.changeDir);
          const compiled = await compileOpenSpecChange({
            changeDir: context.changeDir,
            taskMetadata: store.seed.config.taskOverrides,
          });
          const canonical = replayGuardrailsEvents({ store, compiled });
          canonicalAssurance = canonical.assurance;
          canonicalRun = { ...canonical.run, assuranceDigest: digestJson(canonical.assurance) };
          canonicalRevision = digestJson(store);
          run = await readRunState(context.changeDir);
          assurance = await readAssuranceState(context.changeDir);
        } catch {
          throw v2Error;
        }
      }
      if (canonicalProjectionRequired &&
          (digestJson(run) !== digestJson(canonicalRun) || digestJson(assurance) !== digestJson(canonicalAssurance))) {
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
      if (assurance.version === 2) {
        const findings = evaluateFindingObligations({ findings: assurance.findings, scenarios: assurance.uatScenarios });
        if (findings.blocking.length > 0) return result(
          'fail',
          `Guardrails has unresolved blocking findings: ${findings.blocking.join(', ')}.`,
          evidence,
          ['Repair the findings and record independent verification or an explicit accepted risk.'],
        );
        const debugging = assurance.debugSessions.filter((session) => session.status !== 'resolved');
        if (debugging.length > 0) return result(
          'human_needed',
          `Guardrails has unresolved debugging investigations: ${debugging.map((session) =>
            `${session.sessionId}${session.nextAction ? ` (${session.nextAction})` : ''}`).join(', ')}.`,
          evidence,
          ['Continue the structured investigation, record an evidence-backed root cause, and verify the regression fix.'],
        );
        const uat = evaluateUatObligations({ scenarios: assurance.uatScenarios });
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
