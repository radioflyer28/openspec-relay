import { z } from 'zod';

/** The latest generated-state format written by OpenSpec GSD. */
export const GSD_STATE_VERSION = 2 as const;
/** Retained solely for parsing and migrating pre-v2 projections. */
export const GSD_V1_STATE_VERSION = 1 as const;

export const RunModeSchema = z.enum(['quick', 'guarded', 'full']);
export const ExecutionTierSchema = z.enum(['tier0', 'tier1', 'tier2']);
export const TddPolicySchema = z.enum(['auto', 'always', 'off']);
export const RiskSchema = z.enum(['low', 'medium', 'high', 'critical']);
export const SemanticLevelSchema = z.enum(['simple', 'behavioral', 'modeling']);

export const SemanticClassificationV1Schema = z.object({
  requirementId: z.string().min(1),
  level: SemanticLevelSchema,
  rationale: z.string().min(1),
  triggers: z.array(z.string().min(1)).default([]),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  provenance: z.enum(['planner', 'plan_reviewer', 'tier0_self_review', 'deterministic_lower_bound'])
    .default('deterministic_lower_bound'),
}).strict();

export const SemanticDowngradeV1Schema = z.object({
  requirementId: z.string().min(1),
  requiredLevel: SemanticLevelSchema,
  achievedLevel: SemanticLevelSchema,
  reason: z.string().min(1),
  actor: z.string().min(1).optional(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['accepted', 'human_needed']),
}).strict();

export const PlanApprovalV1Schema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAt: z.string().datetime(),
  independent: z.boolean(),
  reviewerId: z.string().min(1).optional(),
  semanticLevels: z.array(z.object({
    requirementId: z.string().min(1),
    level: SemanticLevelSchema,
  }).strict()).default([]),
  openDispositionIds: z.array(z.string().min(1)).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).strict();

export const PathfinderResultV1Schema = z.object({
  pathfinderId: z.string().min(1),
  question: z.string().min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  experiments: z.array(z.string().min(1)).default([]),
  observations: z.array(z.string().min(1)).default([]),
  counterexamples: z.array(z.string().min(1)).default([]),
  conclusion: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  routing: z.enum(['planner', 'discussion', 'human_needed']),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const PlanReviewResultV1Schema = z.object({
  reviewId: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pass', 'fail', 'human_needed', 'error']),
  independent: z.boolean(),
  reviewerId: z.string().min(1).optional(),
  findingIds: z.array(z.string().min(1)).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  reviewedAt: z.string().datetime(),
}).strict();

export const FindingRouteV1Schema = z.object({
  findingId: z.string().min(1),
  source: z.enum(['discussion', 'planner', 'executor', 'pathfinder', 'reviewer', 'verifier']).optional(),
  route: z.enum(['executor', 'planner', 'discussion', 'pathfinder', 'verifier', 'human_needed']),
  taskId: z.string().min(1).optional(),
  planRevision: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().min(1),
  attempt: z.number().int().nonnegative().default(0),
}).strict();
export const AssuranceStatusSchema = z.enum([
  'pending',
  'pass',
  'fail',
  'warn',
  'human_needed',
  'error',
  'skipped',
]);

export const GitAutomationSchema = z.object({
  commits: z.boolean().default(false),
  branches: z.boolean().default(false),
  worktrees: z.boolean().default(false),
}).strict();

const TaskOverrideV1Schema = z.object({
  dependencies: z.array(z.string().min(1)).optional(),
  risk: RiskSchema.optional(),
  expectedVerification: z.array(z.string().min(1)).optional(),
  writeSet: z.array(z.string().min(1)).optional(),
  requirementRefs: z.array(z.string().min(1)).optional(),
  scenarioRefs: z.array(z.string().min(1)).optional(),
  tdd: TddPolicySchema.optional(),
}).strict();

export const GsdConfigV1Schema = z.object({
  version: z.literal(GSD_V1_STATE_VERSION).default(GSD_V1_STATE_VERSION),
  mode: RunModeSchema.default('guarded'),
  tdd: TddPolicySchema.default('auto'),
  repairLimit: z.number().int().min(0).max(10).default(2),
  requestedTier: ExecutionTierSchema.optional(),
  allowAgentDispatch: z.boolean().default(false),
  allowParallel: z.boolean().default(false),
  git: GitAutomationSchema.default({ commits: false, branches: false, worktrees: false }),
  requiredCheckers: z.array(z.string().min(1)).default([]),
  disabledCheckers: z.array(z.string().min(1)).default([]),
  taskOverrides: z.record(z.string().min(1), TaskOverrideV1Schema).default({}),
}).strict();

export const ArtifactReferenceV1Schema = z.object({
  kind: z.enum(['proposal', 'spec', 'design', 'tasks']),
  path: z.string().min(1).refine(
    (value) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) &&
      !value.split('/').includes('..') && !value.includes('\\'),
    'artifact path must be a contained portable change-relative path',
  ),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  ids: z.array(z.string().min(1)).default([]),
}).strict();

export const TaskNodeV1Schema = z.object({
  taskId: z.string().min(1),
  idStability: z.enum(['explicit', 'positional']).optional(),
  sourcePath: z.string().min(1).optional(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceLine: z.number().int().positive().optional(),
  dependencies: z.array(z.string().min(1)).default([]),
  risk: RiskSchema.default('low'),
  expectedVerification: z.array(z.string().min(1)).default([]),
  writeSet: z.array(z.string().min(1)).default([]),
  requirementRefs: z.array(z.string().min(1)).default([]),
  scenarioRefs: z.array(z.string().min(1)).default([]),
  status: z.enum(['pending', 'in_progress', 'complete', 'blocked']).default('pending'),
  tdd: TddPolicySchema.optional(),
  tddRequired: z.boolean().optional(),
  tddExemptionReason: z.string().min(1).optional(),
  implementationStartedAt: z.string().datetime().optional(),
}).strict();

export const EvidenceV1Schema = z.object({
  evidenceId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  phase: z.enum(['red', 'green', 'refactor', 'check', 'review', 'verify', 'human']),
  checkId: z.string().min(1),
  observedAt: z.string().datetime(),
  sourceState: z.string().min(1),
  sourceDigests: z.record(
    z.string().min(1),
    z.string().regex(/^[a-f0-9]{64}$/),
  ).optional(),
  exitCode: z.number().int().optional(),
  result: z.enum(['pass', 'fail', 'warn', 'human_needed', 'error']),
  outputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  relevantFailure: z.boolean().optional(),
  preExistingFailure: z.boolean().default(false),
  origin: z.enum(['executor', 'reviewer', 'verifier', 'automated', 'human']),
  reference: z.string().min(1).optional(),
}).strict();

export const DeviationV1Schema = z.object({
  deviationId: z.string().min(1),
  taskId: z.string().min(1),
  requirementRefs: z.array(z.string().min(1)).default([]),
  recordedAt: z.string().datetime(),
  summary: z.string().min(1),
  disposition: z.enum(['pending', 'accepted', 'rejected']),
}).strict();

export const RepairAttemptV1Schema = z.object({
  repairId: z.string().min(1),
  checkId: z.string().min(1),
  attempt: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  changedReferences: z.array(z.string().min(1)).default([]),
  result: z.enum(['pending', 'pass', 'fail', 'exhausted']),
}).strict();

export const ScenarioCoverageV1Schema = z.object({
  requirementId: z.string().min(1),
  scenarioId: z.string().min(1),
  status: z.enum(['covered', 'missing', 'human_needed']),
  evidenceIds: z.array(z.string().min(1)).default([]),
  acceptanceInstructions: z.string().min(1).optional(),
}).strict();

export const AssuranceCheckV1Schema = z.object({
  checkId: z.string().min(1),
  kind: z.enum([
    'artifact-validation', 'repository-checks', 'targeted-tests', 'tdd',
    'scenario-coverage', 'code-review', 'goal-verification', 'security',
    'integration', 'ui', 'ai-evaluation', 'compatibility', 'documentation',
    'human-uat',
  ]),
  status: AssuranceStatusSchema,
  summary: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).default([]),
  readOnly: z.boolean().default(false),
  independent: z.boolean().default(false),
  remediation: z.array(z.string().min(1)).default([]),
}).strict();

export const VerificationFindingV1Schema = z.object({
  findingId: z.string().min(1),
  requirementId: z.string().min(1),
  status: z.enum(['pass', 'fail', 'warn', 'human_needed']),
  summary: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).default([]),
  origin: z.enum(['reviewer', 'verifier', 'human']),
}).strict();

export const GsdRunV1Schema = z.object({
  version: z.literal(GSD_V1_STATE_VERSION),
  runId: z.string().min(1),
  changeName: z.string().min(1),
  changeRef: z.string().min(1),
  mode: RunModeSchema,
  tier: ExecutionTierSchema,
  status: z.enum(['planned', 'running', 'checking', 'blocked', 'complete', 'error']),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  artifacts: z.array(ArtifactReferenceV1Schema),
  tasks: z.array(TaskNodeV1Schema),
  executionWaves: z.array(z.array(z.string().min(1))),
  gateIds: z.array(z.string().min(1)),
  deviations: z.array(DeviationV1Schema).default([]),
  repairIds: z.array(z.string().min(1)).default([]),
  config: GsdConfigV1Schema,
  assuranceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const GsdAssuranceV1Schema = z.object({
  version: z.literal(GSD_V1_STATE_VERSION),
  runId: z.string().min(1),
  changeName: z.string().min(1),
  mode: RunModeSchema,
  status: z.enum(['pending', 'pass', 'fail', 'warn', 'human_needed', 'error']),
  updatedAt: z.string().datetime(),
  checks: z.array(AssuranceCheckV1Schema),
  evidence: z.array(EvidenceV1Schema),
  scenarioCoverage: z.array(ScenarioCoverageV1Schema),
  repairs: z.array(RepairAttemptV1Schema),
  findings: z.array(VerificationFindingV1Schema),
  staleEvidenceIds: z.array(z.string().min(1)).default([]),
  unresolvedHumanActions: z.array(z.string().min(1)).default([]),
}).strict();

export const GsdReportV1Schema = z.object({
  version: z.literal(GSD_V1_STATE_VERSION),
  reportId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.enum(['review', 'verification', 'security', 'integration', 'ui', 'ai-evaluation', 'compatibility', 'documentation', 'human-uat']),
  createdAt: z.string().datetime(),
  readOnly: z.boolean(),
  findings: z.array(VerificationFindingV1Schema),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export const GsdEventActorV1Schema = z.object({
  kind: z.enum(['automation', 'executor', 'reviewer', 'verifier', 'human', 'host']),
  id: z.string().min(1).optional(),
}).strict();

export const GsdEventProvenanceV1Schema = z.object({
  origin: z.string().min(1),
  adapter: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
}).strict();

export const GsdEventPayloadV1Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task.transition'),
    taskId: z.string().min(1),
    status: z.enum(['pending', 'in_progress', 'complete', 'blocked']),
    reason: z.string().min(1).optional(),
  }).strict(),
  z.object({ type: z.literal('evidence.recorded'), evidence: EvidenceV1Schema }).strict(),
  z.object({ type: z.literal('finding.recorded'), finding: VerificationFindingV1Schema }).strict(),
  z.object({ type: z.literal('deviation.recorded'), deviation: DeviationV1Schema }).strict(),
  z.object({ type: z.literal('repair.recorded'), repair: RepairAttemptV1Schema }).strict(),
  z.object({
    type: z.literal('human.decision'),
    gateId: z.string().min(1),
    decision: z.enum(['requested', 'accepted', 'rejected']),
    reason: z.string().min(1).optional(),
    resultDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
]);

export const GsdEventEnvelopeV1Schema = z.object({
  version: z.literal(GSD_V1_STATE_VERSION),
  eventId: z.string().min(1),
  runId: z.string().min(1),
  changeName: z.string().min(1),
  occurredAt: z.string().datetime(),
  sourceDigests: z.record(z.string().min(1), z.string().regex(/^[a-f0-9]{64}$/)),
  actor: GsdEventActorV1Schema,
  provenance: GsdEventProvenanceV1Schema,
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  payload: GsdEventPayloadV1Schema,
}).strict();

export const GsdEventStoreSeedV1Schema = z.object({
  changeRef: z.string().min(1),
  mode: RunModeSchema,
  tier: ExecutionTierSchema,
  status: z.enum(['planned', 'running', 'checking', 'blocked', 'complete', 'error']),
  startedAt: z.string().datetime(),
  gateIds: z.array(z.string().min(1)),
  config: GsdConfigV1Schema,
  checks: z.array(AssuranceCheckV1Schema),
  scenarioCoverage: z.array(ScenarioCoverageV1Schema),
}).strict();

export const GsdEventStoreV1Schema = z.object({
  version: z.literal(GSD_V1_STATE_VERSION),
  owner: z.literal('openspec-gsd'),
  runId: z.string().min(1),
  changeName: z.string().min(1),
  createdAt: z.string().datetime(),
  seed: GsdEventStoreSeedV1Schema,
  events: z.array(GsdEventEnvelopeV1Schema),
}).strict();

export type RunMode = z.infer<typeof RunModeSchema>;
export type ExecutionTier = z.infer<typeof ExecutionTierSchema>;
export type TddPolicy = z.infer<typeof TddPolicySchema>;
export type GsdConfigV1 = z.infer<typeof GsdConfigV1Schema>;
export type TaskNodeV1 = z.infer<typeof TaskNodeV1Schema>;
export type EvidenceV1 = z.infer<typeof EvidenceV1Schema>;
export type RepairAttemptV1 = z.infer<typeof RepairAttemptV1Schema>;
export type AssuranceCheckV1 = z.infer<typeof AssuranceCheckV1Schema>;
export type VerificationFindingV1 = z.infer<typeof VerificationFindingV1Schema>;
export type GsdRunV1 = z.infer<typeof GsdRunV1Schema>;
export type GsdAssuranceV1 = z.infer<typeof GsdAssuranceV1Schema>;
export type GsdReportV1 = z.infer<typeof GsdReportV1Schema>;
export type GsdEventPayloadV1 = z.infer<typeof GsdEventPayloadV1Schema>;
export type GsdEventEnvelopeV1 = z.infer<typeof GsdEventEnvelopeV1Schema>;
export type GsdEventStoreV1 = z.infer<typeof GsdEventStoreV1Schema>;

export const PortableReferenceV2Schema = z.object({
  referenceId: z.string().min(1),
  kind: z.enum(['artifact', 'repository', 'generated', 'external']),
  path: z.string().min(1).refine(
    (value) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) &&
      !value.split('/').includes('..') && !value.includes('\\'),
    'reference path must be a portable project-relative identity',
  ).optional(),
  externalId: z.string().min(1).optional(),
  digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  available: z.boolean().default(true),
  remediation: z.string().min(1).optional(),
}).strict().refine((value) => Boolean(value.path ?? value.externalId), {
  message: 'reference requires either a path or external identity',
});

export const RepositoryAnalysisConfigV2Schema = z.object({
  enabled: z.boolean().default(true),
  boundaries: z.array(z.string().min(1)).max(100).default([]),
  comparisonBase: z.string().min(1).optional(),
}).strict();

export const ReadinessConfigV2Schema = z.object({
  rollout: z.enum(['report_only', 'required']).default('required'),
  independentRequired: z.boolean().default(true),
}).strict();

export const DebugConfigV2Schema = z.object({
  enabled: z.boolean().default(true),
  automaticTransition: z.boolean().default(true),
}).strict();

export const UatConfigV2Schema = z.object({
  enabled: z.boolean().default(true),
  required: z.boolean().default(false),
}).strict();

export const ConfiguredReleaseCommandV2Schema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).max(100).default([]),
  expectedArtifacts: z.array(z.string().min(1).refine(
    (value) => !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value) &&
      value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..') &&
      !value.includes('\\'),
    'expected artifact path must be a portable relative path inside the temporary release workspace',
  )).max(50).default([]),
  timeoutMs: z.number().int().positive().max(15 * 60_000).default(120_000),
}).strict();

export const ReleaseAssuranceConfigV2Schema = z.object({
  enabled: z.enum(['auto', 'always', 'off']).default('auto'),
  disabledReason: z.string().min(1).optional(),
  surfaces: z.array(z.string().min(1)).max(50).default([]),
  configuredCommands: z.array(ConfiguredReleaseCommandV2Schema).max(20).default([]),
  requiredPlatforms: z.array(z.enum(['linux', 'macos', 'windows'])).default([]),
  buildCommand: ConfiguredReleaseCommandV2Schema.optional(),
}).strict().refine((value) => value.enabled !== 'off' || Boolean(value.disabledReason), {
  message: 'release assurance disabled requires a recorded reason',
});

export const GsdFeatureConfigV2Schema = z.object({
  repositoryContext: RepositoryAnalysisConfigV2Schema.default({ enabled: true, boundaries: [] }),
  readiness: ReadinessConfigV2Schema.default({ rollout: 'required', independentRequired: true }),
  debug: DebugConfigV2Schema.default({ enabled: true, automaticTransition: true }),
  uat: UatConfigV2Schema.default({ enabled: true, required: false }),
  releaseAssurance: ReleaseAssuranceConfigV2Schema.default({
    enabled: 'auto', surfaces: [], configuredCommands: [], requiredPlatforms: [],
  }),
}).strict();

export const PiHostAdapterConfigV1Schema = z.object({
  enabled: z.boolean().default(false),
  forceTier0: z.boolean().default(false),
  maxReadOnlyConcurrency: z.number().int().min(1).max(4).default(2),
}).strict();

export const GsdConfigV2Schema = GsdConfigV1Schema.omit({ version: true }).extend({
  version: z.literal(GSD_STATE_VERSION).default(GSD_STATE_VERSION),
  piHostAdapter: PiHostAdapterConfigV1Schema.default({
    enabled: false, forceTier0: false, maxReadOnlyConcurrency: 2,
  }),
  features: GsdFeatureConfigV2Schema.default({
    repositoryContext: { enabled: true, boundaries: [] },
    readiness: { rollout: 'required', independentRequired: true },
    debug: { enabled: true, automaticTransition: true },
    uat: { enabled: true, required: false },
    releaseAssurance: { enabled: 'auto', surfaces: [], configuredCommands: [], requiredPlatforms: [] },
  }),
}).strict();

export const RepositoryContextClaimV2Schema = z.object({
  claimId: z.string().min(1),
  category: z.enum([
    'implementation_analog', 'affected_module', 'test_convention', 'architecture_boundary',
    'downstream_consumer', 'conflicting_pattern', 'unknown',
  ]),
  classification: z.enum(['observed', 'inferred', 'conflict', 'unknown']),
  summary: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(PortableReferenceV2Schema).min(1),
  relatedOpenSpecIds: z.array(z.string().min(1)).default([]),
}).strict();

export const RepositoryContextV2Schema = z.object({
  contextId: z.string().min(1),
  changeName: z.string().min(1),
  inputRevision: z.string().regex(/^[a-f0-9]{64}$/),
  compiledAt: z.string().datetime(),
  status: z.enum(['current', 'stale', 'unavailable']),
  claims: z.array(RepositoryContextClaimV2Schema),
  staleReferenceIds: z.array(z.string().min(1)).default([]),
}).strict();

export const ReadinessIssueV2Schema = z.object({
  issueId: z.string().min(1),
  kind: z.enum([
    'uncovered_requirement', 'unmapped_scenario', 'insufficient_evidence', 'dependency_cycle',
    'unsafe_write_overlap', 'missing_prerequisite', 'risky_assumption', 'compatibility_obligation',
    'repository_scope_gap', 'independent_result_unavailable',
  ]),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  blocking: z.boolean(),
  summary: z.string().min(1),
  references: z.array(z.string().min(1)).default([]),
  evidence: z.array(PortableReferenceV2Schema).default([]),
  remediation: z.array(z.string().min(1)).min(1),
  inputRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const ReadinessResultV2Schema = z.object({
  resultId: z.string().min(1),
  changeName: z.string().min(1),
  evaluatedAt: z.string().datetime(),
  inputRevision: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pass', 'fail', 'human_needed', 'error', 'stale']),
  independent: z.literal(true),
  evaluator: z.string().min(1),
  issues: z.array(ReadinessIssueV2Schema),
}).strict();

export const FindingScopeV2Schema = z.object({
  kind: z.enum(['requirement', 'scenario', 'task', 'contract', 'symbol', 'location', 'release']),
  identity: z.string().min(1),
}).strict();

export const FindingStateV2Schema = z.enum([
  'open', 'repaired', 'independently_verified', 'accepted_risk', 'human_needed', 'stale',
]);

export const FindingTransitionV2Schema = z.object({
  transitionId: z.string().min(1),
  from: FindingStateV2Schema.optional(),
  to: FindingStateV2Schema,
  occurredAt: z.string().datetime(),
  actor: z.object({
    kind: z.enum(['automation', 'executor', 'reviewer', 'verifier', 'human', 'host', 'analyzer', 'release_driver', 'planner', 'plan_reviewer', 'pathfinder']),
    id: z.string().min(1).optional(),
  }).strict(),
  reason: z.string().min(1),
  evidence: z.array(PortableReferenceV2Schema).default([]),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  expiry: z.string().datetime().optional(),
  followUp: z.string().min(1).optional(),
}).strict();

export const FindingLifecycleRecordV2Schema = z.object({
  findingId: z.string().min(1),
  providerId: z.string().min(1),
  ruleId: z.string().min(1),
  category: z.string().min(1),
  scope: FindingScopeV2Schema,
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  blocking: z.boolean(),
  summary: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).default([]),
  taskIds: z.array(z.string().min(1)).default([]),
  evidence: z.array(PortableReferenceV2Schema).default([]),
  state: FindingStateV2Schema,
  transitions: z.array(FindingTransitionV2Schema).min(1),
}).strict();

export const DebugHypothesisV2Schema = z.object({
  hypothesisId: z.string().min(1),
  statement: z.string().min(1),
  status: z.enum(['active', 'supported', 'rejected', 'inconclusive']),
  evidence: z.array(PortableReferenceV2Schema).default([]),
}).strict();

export const DebugExperimentV2Schema = z.object({
  experimentId: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  hypothesisId: z.string().min(1),
  action: z.string().min(1),
  targetedEvidence: z.array(PortableReferenceV2Schema).min(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  result: z.enum(['planned', 'passed', 'failed', 'inconclusive', 'rejected_duplicate']),
  observation: z.string().min(1).optional(),
}).strict();

export const DebugConclusionV2Schema = z.object({
  conclusionId: z.string().min(1),
  kind: z.enum(['conclusion', 'root_cause']),
  statement: z.string().min(1),
  experimentIds: z.array(z.string().min(1)).min(1),
  evidence: z.array(PortableReferenceV2Schema).min(1),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const DebugVerificationV2Schema = z.object({
  verificationId: z.string().min(1),
  findingId: z.string().min(1).optional(),
  checkId: z.string().min(1).optional(),
  verifier: z.object({
    kind: z.enum(['verifier', 'human']),
    id: z.string().min(1),
  }).strict(),
  evidence: z.array(PortableReferenceV2Schema).min(1),
  failBeforeEvidence: PortableReferenceV2Schema.optional(),
  passAfterEvidence: PortableReferenceV2Schema.optional(),
  exemption: z.object({ reason: z.string().min(1), acceptedBy: z.string().min(1) }).strict().optional(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  verifiedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.findingId) === Boolean(value.checkId)) context.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Debug verification requires exactly one independently verified finding or equivalent check.',
  });
  const regressionPair = Boolean(value.failBeforeEvidence && value.passAfterEvidence);
  if (!regressionPair && !value.exemption) context.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Debug verification requires distinct fail-before and pass-after evidence or an accepted exemption.',
  });
  if (regressionPair && value.failBeforeEvidence!.digest === value.passAfterEvidence!.digest) context.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Fail-before and pass-after evidence must preserve distinct observed result digests.',
  });
});

export const DebugSessionV2Schema = z.object({
  sessionId: z.string().min(1),
  logicalFailureId: z.string().min(1),
  findingId: z.string().min(1).optional(),
  references: z.array(z.string().min(1)).min(1),
  status: z.enum(['active', 'resolved', 'human_needed']),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  hypotheses: z.array(DebugHypothesisV2Schema),
  experiments: z.array(DebugExperimentV2Schema),
  conclusions: z.array(DebugConclusionV2Schema).default([]),
  changedReferences: z.array(PortableReferenceV2Schema).default([]),
  unresolvedQuestions: z.array(z.string().min(1)).default([]),
  nextAction: z.string().min(1).optional(),
  regressionEvidence: z.array(PortableReferenceV2Schema).default([]),
  verification: DebugVerificationV2Schema.optional(),
}).strict();

export const UatScenarioV2Schema = z.object({
  scenarioId: z.string().min(1),
  requirementId: z.string().min(1),
  taskIds: z.array(z.string().min(1)).default([]),
  prerequisites: z.array(z.string().min(1)).default([]),
  action: z.string().min(1),
  expectedResult: z.string().min(1),
  status: z.enum(['awaiting_human', 'awaiting_retest', 'passed', 'failed', 'blocked', 'accepted_limitation', 'stale']),
  disposition: z.object({
    actor: z.string().min(1),
    recordedAt: z.string().datetime(),
    notes: z.string().min(1),
    evidence: z.array(PortableReferenceV2Schema).default([]),
  }).strict().optional(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const ReleaseCandidateV2Schema = z.object({
  candidateId: z.string().min(1),
  surface: z.enum(['node_package', 'cli', 'extension', 'plugin', 'configured']),
  applicable: z.boolean(),
  activationEvidence: z.array(PortableReferenceV2Schema).default([]),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(['not_applicable', 'pending', 'pass', 'fail', 'human_needed', 'error']),
  checks: z.array(z.object({
    checkId: z.string().min(1),
    status: AssuranceStatusSchema,
    summary: z.string().min(1),
    evidence: z.array(PortableReferenceV2Schema).default([]),
  }).strict()),
}).strict();

export const AssuranceCheckV2Schema = AssuranceCheckV1Schema.extend({
  kind: z.enum([
    'artifact-validation', 'repository-checks', 'targeted-tests', 'tdd', 'scenario-coverage',
    'code-review', 'goal-verification', 'security', 'integration', 'ui', 'ai-evaluation',
    'compatibility', 'documentation', 'human-uat', 'repository-context', 'plan-readiness',
    'release-assurance', 'planning-assurance',
  ]),
}).strict();

export const GsdEventActorV2Schema = z.object({
  kind: z.enum(['automation', 'executor', 'reviewer', 'verifier', 'human', 'host', 'analyzer', 'release_driver', 'planner', 'plan_reviewer', 'pathfinder']),
  id: z.string().min(1).optional(),
}).strict();

export const HostAdapterProvenanceV1Schema = z.object({
  adapterId: z.string().min(1),
  adapterVersion: z.number().int().positive(),
  runtimeVersion: z.string().min(1),
  modelRef: z.string().min(1).optional(),
  agentDispatch: z.enum(['available', 'disabled', 'probe_failed', 'unsupported_version']),
  parallelism: z.enum(['available', 'disabled', 'probe_failed', 'unsupported_version']),
  qualifiedAt: z.string().datetime(),
}).strict();

export const GsdEventPayloadV2Schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('host.adapter_qualified'), adapter: HostAdapterProvenanceV1Schema }).strict(),
  z.object({
    type: z.literal('task.transition'),
    taskId: z.string().min(1),
    status: z.enum(['pending', 'in_progress', 'complete', 'blocked']),
    reason: z.string().min(1).optional(),
  }).strict(),
  z.object({ type: z.literal('evidence.recorded'), evidence: EvidenceV1Schema }).strict(),
  z.object({ type: z.literal('finding.recorded'), finding: VerificationFindingV1Schema }).strict(),
  z.object({ type: z.literal('deviation.recorded'), deviation: DeviationV1Schema }).strict(),
  z.object({ type: z.literal('repair.recorded'), repair: RepairAttemptV1Schema }).strict(),
  z.object({
    type: z.literal('human.decision'),
    gateId: z.string().min(1),
    decision: z.enum(['requested', 'accepted', 'rejected']),
    reason: z.string().min(1).optional(),
    resultDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
  z.object({ type: z.literal('context.compiled'), context: RepositoryContextV2Schema }).strict(),
  z.object({ type: z.literal('context.stale'), contextId: z.string().min(1), referenceIds: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ type: z.literal('readiness.evaluated'), result: ReadinessResultV2Schema }).strict(),
  z.object({ type: z.literal('readiness.stale'), resultId: z.string().min(1), inputRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('semantic.classified'), classification: SemanticClassificationV1Schema }).strict(),
  z.object({ type: z.literal('semantic.downgrade_recorded'), downgrade: SemanticDowngradeV1Schema }).strict(),
  z.object({ type: z.literal('pathfinder.completed'), result: PathfinderResultV1Schema }).strict(),
  z.object({ type: z.literal('plan.reviewed'), review: PlanReviewResultV1Schema }).strict(),
  z.object({ type: z.literal('finding.routed'), route: FindingRouteV1Schema }).strict(),
  z.object({ type: z.literal('plan.approved'), approval: PlanApprovalV1Schema }).strict(),
  z.object({ type: z.literal('plan.stale'), approvedRevision: z.string().regex(/^[a-f0-9]{64}$/), currentRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('finding.discovered'), finding: FindingLifecycleRecordV2Schema }).strict(),
  z.object({ type: z.literal('finding.transitioned'), findingId: z.string().min(1), transition: FindingTransitionV2Schema }).strict(),
  z.object({ type: z.literal('finding.stale'), findingId: z.string().min(1), sourceRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('debug.session_started'), session: DebugSessionV2Schema }).strict(),
  z.object({ type: z.literal('debug.hypothesis_recorded'), sessionId: z.string().min(1), hypothesis: DebugHypothesisV2Schema }).strict(),
  z.object({ type: z.literal('debug.experiment_recorded'), sessionId: z.string().min(1), experiment: DebugExperimentV2Schema }).strict(),
  z.object({ type: z.literal('debug.conclusion_recorded'), sessionId: z.string().min(1), conclusion: DebugConclusionV2Schema }).strict(),
  z.object({ type: z.literal('debug.reference_changed'), sessionId: z.string().min(1), reference: PortableReferenceV2Schema }).strict(),
  z.object({ type: z.literal('debug.question_recorded'), sessionId: z.string().min(1), question: z.string().min(1) }).strict(),
  z.object({ type: z.literal('debug.next_action_recorded'), sessionId: z.string().min(1), nextAction: z.string().min(1) }).strict(),
  z.object({ type: z.literal('debug.verification_recorded'), sessionId: z.string().min(1), verification: DebugVerificationV2Schema }).strict(),
  z.object({
    type: z.literal('debug.verification_stale'),
    sessionId: z.string().min(1),
    verificationId: z.string().min(1),
    sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  z.object({ type: z.literal('debug.session_resolved'), sessionId: z.string().min(1), verificationId: z.string().min(1), nextAction: z.string().min(1) }).strict(),
  z.object({ type: z.literal('debug.session_updated'), sessionId: z.string().min(1), status: z.enum(['active', 'resolved', 'human_needed']), nextAction: z.string().min(1).optional(), regressionEvidence: z.array(PortableReferenceV2Schema).optional() }).strict(),
  z.object({ type: z.literal('uat.scenario_recorded'), scenario: UatScenarioV2Schema }).strict(),
  z.object({ type: z.literal('uat.scenario_retest'), scenarioId: z.string().min(1), sourceRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('uat.scenario_stale'), scenarioId: z.string().min(1), sourceRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('scenario.coverage_reconciled'), coverage: z.array(ScenarioCoverageV1Schema) }).strict(),
  z.object({ type: z.literal('uat.disposition_recorded'), scenarioId: z.string().min(1), status: z.enum(['passed', 'failed', 'blocked', 'accepted_limitation']), actor: z.string().min(1), notes: z.string().min(1), sourceRevision: z.string().regex(/^[a-f0-9]{64}$/), evidence: z.array(PortableReferenceV2Schema).default([]) }).strict(),
  z.object({ type: z.literal('release.evaluated'), candidate: ReleaseCandidateV2Schema }).strict(),
  z.object({ type: z.literal('checks.evaluated'), checks: z.array(AssuranceCheckV2Schema) }).strict(),
  z.object({ type: z.literal('run.status_updated'), status: z.enum(['planned', 'running', 'checking', 'blocked', 'complete', 'error']) }).strict(),
  z.object({ type: z.literal('human.disposition_recorded'), subjectId: z.string().min(1), disposition: z.enum(['accepted_risk', 'human_needed']), actor: z.string().min(1), reason: z.string().min(1), scope: z.string().min(1), expiry: z.string().datetime().optional() }).strict(),
]);

export const GsdEventEnvelopeV2Schema = z.object({
  version: z.literal(GSD_STATE_VERSION),
  eventId: z.string().min(1),
  runId: z.string().min(1),
  changeName: z.string().min(1),
  occurredAt: z.string().datetime(),
  sourceDigests: z.record(z.string().min(1), z.string().regex(/^[a-f0-9]{64}$/)),
  actor: GsdEventActorV2Schema,
  provenance: GsdEventProvenanceV1Schema,
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  payload: GsdEventPayloadV2Schema,
}).strict();

export const GsdRunV2Schema = GsdRunV1Schema.omit({ version: true, config: true }).extend({
  version: z.literal(GSD_STATE_VERSION),
  config: GsdConfigV2Schema,
  stateRevision: z.string().regex(/^[a-f0-9]{64}$/),
  repositoryContextId: z.string().min(1).optional(),
  readinessResultId: z.string().min(1).optional(),
  planRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  planApprovalStatus: z.enum(['missing', 'current', 'stale']).default('missing'),
}).strict();

export const GsdAssuranceV2Schema = GsdAssuranceV1Schema.omit({
  version: true, checks: true, findings: true,
}).extend({
  version: z.literal(GSD_STATE_VERSION),
  checks: z.array(AssuranceCheckV2Schema),
  findings: z.array(FindingLifecycleRecordV2Schema),
  repositoryContext: RepositoryContextV2Schema.optional(),
  readiness: ReadinessResultV2Schema.optional(),
  debugSessions: z.array(DebugSessionV2Schema).default([]),
  uatScenarios: z.array(UatScenarioV2Schema).default([]),
  releaseCandidates: z.array(ReleaseCandidateV2Schema).default([]),
  semanticClassifications: z.array(SemanticClassificationV1Schema).default([]),
  semanticDowngrades: z.array(SemanticDowngradeV1Schema).default([]),
  pathfinderResults: z.array(PathfinderResultV1Schema).default([]),
  planReviews: z.array(PlanReviewResultV1Schema).default([]),
  findingRoutes: z.array(FindingRouteV1Schema).default([]),
  planApproval: PlanApprovalV1Schema.optional(),
  hostAdapter: HostAdapterProvenanceV1Schema.optional(),
  planStale: z.boolean().default(false),
}).strict();

export const GsdEventStoreV2Schema = z.object({
  version: z.literal(GSD_STATE_VERSION),
  owner: z.literal('openspec-gsd'),
  runId: z.string().min(1),
  changeName: z.string().min(1),
  createdAt: z.string().datetime(),
  seed: z.object({
    changeRef: z.string().min(1),
    mode: RunModeSchema,
    tier: ExecutionTierSchema,
    status: z.enum(['planned', 'running', 'checking', 'blocked', 'complete', 'error']),
    startedAt: z.string().datetime(),
    gateIds: z.array(z.string().min(1)),
    config: GsdConfigV2Schema,
    checks: z.array(AssuranceCheckV2Schema),
    scenarioCoverage: z.array(ScenarioCoverageV1Schema),
  }).strict(),
  events: z.array(GsdEventEnvelopeV2Schema),
}).strict();

export type PortableReferenceV2 = z.infer<typeof PortableReferenceV2Schema>;
export type SemanticLevel = z.infer<typeof SemanticLevelSchema>;
export type SemanticClassificationV1 = z.infer<typeof SemanticClassificationV1Schema>;
export type SemanticDowngradeV1 = z.infer<typeof SemanticDowngradeV1Schema>;
export type PlanApprovalV1 = z.infer<typeof PlanApprovalV1Schema>;
export type PathfinderResultV1 = z.infer<typeof PathfinderResultV1Schema>;
export type PlanReviewResultV1 = z.infer<typeof PlanReviewResultV1Schema>;
export type FindingRouteV1 = z.infer<typeof FindingRouteV1Schema>;
export type GsdConfigV2 = z.infer<typeof GsdConfigV2Schema>;
export type ConfiguredReleaseCommandV2 = z.infer<typeof ConfiguredReleaseCommandV2Schema>;
export type RepositoryContextClaimV2 = z.infer<typeof RepositoryContextClaimV2Schema>;
export type RepositoryContextV2 = z.infer<typeof RepositoryContextV2Schema>;
export type ReadinessIssueV2 = z.infer<typeof ReadinessIssueV2Schema>;
export type ReadinessResultV2 = z.infer<typeof ReadinessResultV2Schema>;
export type FindingStateV2 = z.infer<typeof FindingStateV2Schema>;
export type FindingLifecycleRecordV2 = z.infer<typeof FindingLifecycleRecordV2Schema>;
export type FindingTransitionV2 = z.infer<typeof FindingTransitionV2Schema>;
export type DebugHypothesisV2 = z.infer<typeof DebugHypothesisV2Schema>;
export type DebugExperimentV2 = z.infer<typeof DebugExperimentV2Schema>;
export type DebugConclusionV2 = z.infer<typeof DebugConclusionV2Schema>;
export type DebugVerificationV2 = z.infer<typeof DebugVerificationV2Schema>;
export type DebugSessionV2 = z.infer<typeof DebugSessionV2Schema>;
export type UatScenarioV2 = z.infer<typeof UatScenarioV2Schema>;
export type ReleaseCandidateV2 = z.infer<typeof ReleaseCandidateV2Schema>;
export type GsdEventPayloadV2 = z.infer<typeof GsdEventPayloadV2Schema>;
export type HostAdapterProvenanceV1 = z.infer<typeof HostAdapterProvenanceV1Schema>;
export type GsdEventActorV2 = z.infer<typeof GsdEventActorV2Schema>;
export type GsdEventEnvelopeV2 = z.infer<typeof GsdEventEnvelopeV2Schema>;
export type GsdRunV2 = z.infer<typeof GsdRunV2Schema>;
export type GsdAssuranceV2 = z.infer<typeof GsdAssuranceV2Schema>;
export type GsdEventStoreV2 = z.infer<typeof GsdEventStoreV2Schema>;
