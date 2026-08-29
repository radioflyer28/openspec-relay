/**
 * Supported programmatic surface for host integrations.
 *
 * Canonical event and projection writers are intentionally not exported. Role
 * adapters return structured results; only these orchestrated operations may
 * commit them to OpenSpec GSD execution records.
 */
export { GSD_VERSION } from './version.js';
export { gsdAssuranceGate } from './gate.js';
export {
  DEFAULT_HOST_CAPABILITIES,
  checkGsdRunV2,
  startGsdRunV2,
  type StartRunResultV2,
} from './runner-v2.js';
export { getRunStatusV2, type RunStatusV2 } from './status.js';
export {
  acceptGsdGateV2,
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
export { loadGsdConfigV2 } from './config.js';
export {
  confirmDiscussionHandoff,
  type DiscussionArtifactMappingV1,
  type DiscussionDecisionV1,
  type DiscussionHandoffConfirmationV1,
  type DiscussionHandoffV1,
} from './discussion.js';
export {
  computeSemanticPlanRevision,
  createPlanApproval,
  isPlanApprovalCurrent,
  normalizeTaskCompletionMarkers,
  PLANNING_EVENT_TYPES,
  type SemanticPlanRevisionV1,
} from './planning.js';
export {
  ExecutionTierSchema,
  GsdConfigV2Schema,
  PortableReferenceV2Schema,
  RunModeSchema,
  TddPolicySchema,
  type ExecutionTier,
  type GsdAssuranceV2,
  type GsdConfigV2,
  type GsdRunV2,
  type PortableReferenceV2,
  type RunMode,
  type TddPolicy,
} from './schemas.js';
export type { HostReleaseRunnerV2, ReleaseCommandV2 } from './release-assurance.js';
