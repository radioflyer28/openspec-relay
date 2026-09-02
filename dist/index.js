/**
 * Supported programmatic surface for host integrations.
 *
 * Canonical event and projection writers are intentionally not exported. Role
 * adapters return structured results; only these orchestrated operations may
 * commit them to OpenSpec Relay execution records.
 */
export { RELAY_VERSION } from './version.js';
export { relayAssuranceGate } from './gate.js';
export { DEFAULT_HOST_CAPABILITIES, checkRelayRunV2, startRelayRunV2, } from './runner-v2.js';
export { getRunStatusV2 } from './status.js';
export { acceptRelayGateV2, observeDebugExperimentV2, planDebugExperimentV2, presentUatV2, recordDebugConclusionV2, recordDebugHypothesisV2, recordDebugNextActionV2, recordDebugQuestionV2, recordDebugReferenceChangeV2, recordDispatchedRoleResultV2, recordUatV2, recordWorkflowResultV2, resolveDebugSessionV2, startOrResumeDebugV2, transitionFindingV2, verifyFindingFromDispatchedResultV2, } from './v2-operations.js';
export { dispatchRoleV2, executeWithTier, } from './execution-adapters.js';
export { negotiateExecutionTier, } from './tiers.js';
export { loadRelayConfigV2 } from './config.js';
export { confirmDiscussionHandoff, } from './discussion.js';
export { computeSemanticPlanRevision, createPlanApproval, isPlanApprovalCurrent, normalizeTaskCompletionMarkers, PLANNING_EVENT_TYPES, } from './planning.js';
export { planRelayChangeV1, } from './plan-workflow.js';
export { assertCurrentPlanApprovalV1, doRelayChangeV1, } from './do-workflow.js';
export { routeDispatchedFindingsV1 } from './finding-routing.js';
export { ExecutionTierSchema, RelayConfigV2Schema, PortableReferenceV2Schema, RunModeSchema, TddPolicySchema, } from './schemas.js';
//# sourceMappingURL=index.js.map