/**
 * Supported programmatic surface for host integrations.
 *
 * Canonical event and projection writers are intentionally not exported. Role
 * adapters return structured results; only these orchestrated operations may
 * commit them to Guardrails state.
 */
export { GUARDRAILS_VERSION } from './version.js';
export { guardrailsAssuranceGate } from './gate.js';
export {
  DEFAULT_HOST_CAPABILITIES,
  checkGuardrailsRunV2,
  startGuardrailsRunV2,
  type StartRunResultV2,
} from './runner-v2.js';
export { getRunStatusV2, type RunStatusV2 } from './status.js';
export {
  acceptGuardrailsGateV2,
  observeDebugExperimentV2,
  planDebugExperimentV2,
  presentUatV2,
  recordDebugConclusionV2,
  recordDebugHypothesisV2,
  recordDebugNextActionV2,
  recordDebugQuestionV2,
  recordDebugReferenceChangeV2,
  recordDispatchedRoleResultV2,
  recordUatV2,
  recordWorkflowResultV2,
  resolveDebugSessionV2,
  startOrResumeDebugV2,
  transitionFindingV2,
  verifyFindingFromDispatchedResultV2,
  type FindingWorkflowActionV2,
  type WorkflowStageV2,
} from './v2-operations.js';
export {
  dispatchRoleV2,
  executeWithTier,
  type DispatchedRoleResultV2,
  type ExecutionOutcomeV1,
  type ExecutionRole,
  type RoleDispatcherV1,
  type RoleRequestV1,
  type RoleResultV1,
  type ReportedFindingV2,
  type WorktreeAdapterV1,
} from './execution-adapters.js';
export {
  negotiateExecutionTier,
  type TierAdaptersV1,
  type TierDecisionV1,
} from './tiers.js';
export { loadGuardrailsConfigV2 } from './config.js';
export {
  ExecutionTierSchema,
  GuardrailsConfigV2Schema,
  PortableReferenceV2Schema,
  RunModeSchema,
  TddPolicySchema,
  type ExecutionTier,
  type GuardrailsAssuranceV2,
  type GuardrailsConfigV2,
  type GuardrailsRunV2,
  type PortableReferenceV2,
  type RunMode,
  type TddPolicy,
} from './schemas.js';
export type { HostReleaseRunnerV2, ReleaseCommandV2 } from './release-assurance.js';
