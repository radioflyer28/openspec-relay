import type { GuardrailsAssuranceV1, GuardrailsRunV1 } from './schemas.js';
import { digestJson, readAssuranceState, readRunState, resolveChangeDirectory } from './state.js';
import { reconcileCurrentOpenSpec, type SourceReconciliationV1 } from './reconciliation.js';

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
  staleEvidenceCount: number;
  reconciliation: SourceReconciliationV1;
  assuranceDigestMatches: boolean;
}

export async function getRunStatus(options: {
  change: string;
  projectRoot?: string;
}): Promise<RunStatusV1> {
  const resolved = await resolveChangeDirectory({ projectRoot: options.projectRoot, change: options.change });
  const persistedRun = await readRunState(resolved.changeDir);
  const persistedAssurance = await readAssuranceState(resolved.changeDir);
  const assuranceDigestMatches = persistedRun.assuranceDigest === digestJson(persistedAssurance);
  const reconciled = await reconcileCurrentOpenSpec({
    projectRoot: resolved.projectRoot,
    changeDir: resolved.changeDir,
    changeName: resolved.changeName,
    run: persistedRun,
    assurance: persistedAssurance,
  });
  const { run, assurance, reconciliation } = reconciled;
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
    staleEvidenceCount: assurance.staleEvidenceIds.length,
    reconciliation,
    assuranceDigestMatches,
  };
}
