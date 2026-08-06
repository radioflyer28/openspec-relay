import { z } from 'zod';

export const GUARDRAILS_STATE_VERSION = 1 as const;

export const RunModeSchema = z.enum(['quick', 'guarded', 'full']);
export const ExecutionTierSchema = z.enum(['tier0', 'tier1', 'tier2']);
export const TddPolicySchema = z.enum(['auto', 'always', 'off']);
export const RiskSchema = z.enum(['low', 'medium', 'high', 'critical']);
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

export const GuardrailsConfigV1Schema = z.object({
  version: z.literal(GUARDRAILS_STATE_VERSION).default(GUARDRAILS_STATE_VERSION),
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

export const GuardrailsRunV1Schema = z.object({
  version: z.literal(GUARDRAILS_STATE_VERSION),
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
  config: GuardrailsConfigV1Schema,
  assuranceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const GuardrailsAssuranceV1Schema = z.object({
  version: z.literal(GUARDRAILS_STATE_VERSION),
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

export const GuardrailsReportV1Schema = z.object({
  version: z.literal(GUARDRAILS_STATE_VERSION),
  reportId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.enum(['review', 'verification', 'security', 'integration', 'ui', 'ai-evaluation', 'compatibility', 'documentation', 'human-uat']),
  createdAt: z.string().datetime(),
  readOnly: z.boolean(),
  findings: z.array(VerificationFindingV1Schema),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

export type RunMode = z.infer<typeof RunModeSchema>;
export type ExecutionTier = z.infer<typeof ExecutionTierSchema>;
export type TddPolicy = z.infer<typeof TddPolicySchema>;
export type GuardrailsConfigV1 = z.infer<typeof GuardrailsConfigV1Schema>;
export type TaskNodeV1 = z.infer<typeof TaskNodeV1Schema>;
export type EvidenceV1 = z.infer<typeof EvidenceV1Schema>;
export type RepairAttemptV1 = z.infer<typeof RepairAttemptV1Schema>;
export type AssuranceCheckV1 = z.infer<typeof AssuranceCheckV1Schema>;
export type VerificationFindingV1 = z.infer<typeof VerificationFindingV1Schema>;
export type GuardrailsRunV1 = z.infer<typeof GuardrailsRunV1Schema>;
export type GuardrailsAssuranceV1 = z.infer<typeof GuardrailsAssuranceV1Schema>;
export type GuardrailsReportV1 = z.infer<typeof GuardrailsReportV1Schema>;
