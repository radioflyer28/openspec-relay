import type { GuardrailsAssuranceV1, GuardrailsRunV1 } from './schemas.js';
import { digestJson, readAssuranceState, readRunState, resolveChangeDirectory } from './state.js';

export interface RunStatusV1 {
  changeName: string;
  mode: GuardrailsRunV1['mode'];
  tier: GuardrailsRunV1['tier'];
  status: GuardrailsRunV1['status'];
  tasks: { total: number; complete: number; blocked: number };
  checks: GuardrailsAssuranceV1['checks'];
  evidenceCount: number;
  deviations: GuardrailsRunV1['deviations'];
  repairs: GuardrailsAssuranceV1['repairs'];
  gates: string[];
  assuranceStatus: GuardrailsAssuranceV1['status'];
  unresolvedHumanActions: string[];
  assuranceDigestMatches: boolean;
}

export async function getRunStatus(options: {
  change: string;
  projectRoot?: string;
}): Promise<RunStatusV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const run = await readRunState(resolved.changeDir);
  const assurance = await readAssuranceState(resolved.changeDir);
  return {
    changeName: run.changeName,
    mode: run.mode,
    tier: run.tier,
    status: run.status,
    tasks: {
      total: run.tasks.length,
      complete: run.tasks.filter((task) => task.status === 'complete').length,
      blocked: run.tasks.filter((task) => task.status === 'blocked').length,
    },
    checks: assurance.checks,
    evidenceCount: assurance.evidence.length,
    deviations: run.deviations,
    repairs: assurance.repairs,
    gates: run.gateIds,
    assuranceStatus: assurance.status,
    unresolvedHumanActions: assurance.unresolvedHumanActions,
    assuranceDigestMatches: run.assuranceDigest === digestJson(assurance),
  };
}
