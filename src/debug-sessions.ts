import { createHash } from 'node:crypto';
import {
  DebugSessionV2Schema,
  type DebugConclusionV2,
  type DebugExperimentV2,
  type DebugHypothesisV2,
  type DebugSessionV2,
  type DebugVerificationV2,
  type PortableReferenceV2,
} from './schemas.js';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface DebugMutationContractV2 {
  role: 'executor' | 'reviewer' | 'verifier' | 'analyzer';
  readOnly: boolean;
  mayMutateWorkspace: boolean;
  requiresGitOptIn: boolean;
}

export function createDebugMutationContract(options: {
  role: DebugMutationContractV2['role'];
  gitEnabled?: boolean;
}): DebugMutationContractV2 {
  const mayMutateWorkspace = options.role === 'executor';
  return {
    role: options.role,
    readOnly: !mayMutateWorkspace,
    mayMutateWorkspace,
    requiresGitOptIn: mayMutateWorkspace && !options.gitEnabled,
  };
}

export function debugSessionId(logicalFailureId: string): string {
  return `debug:${digest(logicalFailureId).slice(0, 24)}`;
}

export function startDebugSession(options: {
  logicalFailureId: string;
  findingId?: string;
  references: string[];
  failedEvidence: PortableReferenceV2[];
  existing: DebugSessionV2[];
  now?: string;
}): DebugSessionV2 {
  const existing = options.existing.find((session) => session.logicalFailureId === options.logicalFailureId &&
    ['active', 'human_needed'].includes(session.status));
  if (existing) return DebugSessionV2Schema.parse(existing);
  const now = options.now ?? new Date().toISOString();
  return DebugSessionV2Schema.parse({
    sessionId: debugSessionId(options.logicalFailureId),
    logicalFailureId: options.logicalFailureId,
    ...(options.findingId ? { findingId: options.findingId } : {}),
    references: [...new Set([...options.references, ...options.failedEvidence.map((item) => item.referenceId)])],
    status: 'active',
    startedAt: now,
    updatedAt: now,
    hypotheses: [],
    experiments: [],
    conclusions: [],
    changedReferences: [],
    unresolvedQuestions: [],
    nextAction: 'Record a testable hypothesis before changing implementation.',
    regressionEvidence: [],
  });
}

export function recordDebugConclusion(options: {
  session: DebugSessionV2;
  kind: DebugConclusionV2['kind'];
  statement: string;
  experimentIds: string[];
  evidence?: PortableReferenceV2[];
  sourceRevision?: string;
  now?: string;
}): DebugSessionV2 {
  const session = DebugSessionV2Schema.parse(options.session);
  const experiments = options.experimentIds.map((id) => session.experiments.find((item) => item.experimentId === id));
  if (experiments.length === 0 || experiments.some((item) => !item?.observation)) {
    throw new Error('A debug conclusion requires one or more recorded experiments with observations.');
  }
  const evidence = options.evidence?.length
    ? options.evidence
    : experiments.flatMap((item) => item?.targetedEvidence ?? []);
  if (evidence.length === 0) throw new Error('A debug conclusion requires observable evidence.');
  const conclusion: DebugConclusionV2 = {
    conclusionId: `conclusion:${digest({ sessionId: session.sessionId, kind: options.kind, statement: options.statement,
      experiments: options.experimentIds }).slice(0, 24)}`,
    kind: options.kind,
    statement: options.statement,
    experimentIds: options.experimentIds,
    evidence,
    sourceRevision: options.sourceRevision ?? experiments[0]!.sourceRevision,
  };
  return DebugSessionV2Schema.parse({
    ...session,
    conclusions: [...session.conclusions, conclusion],
    updatedAt: options.now ?? new Date().toISOString(),
    nextAction: options.kind === 'root_cause'
      ? 'Correct the evidenced root cause and record fail-before/pass-after regression proof.'
      : 'Continue until an evidence-backed root cause is established.',
  });
}

export function recordDebugHypothesis(options: {
  session: DebugSessionV2;
  statement: string;
  now?: string;
}): DebugSessionV2 {
  const session = DebugSessionV2Schema.parse(options.session);
  if (session.status !== 'active') throw new Error('Hypotheses can only be recorded in an active debugging session.');
  const hypothesis: DebugHypothesisV2 = {
    hypothesisId: `hypothesis:${digest({ sessionId: session.sessionId, statement: options.statement }).slice(0, 24)}`,
    statement: options.statement,
    status: 'active',
    evidence: [],
  };
  if (session.hypotheses.some((item) => item.hypothesisId === hypothesis.hypothesisId)) return session;
  return DebugSessionV2Schema.parse({
    ...session,
    hypotheses: [...session.hypotheses, hypothesis],
    updatedAt: options.now ?? new Date().toISOString(),
    nextAction: 'Plan an experiment that could support or reject the active hypothesis.',
  });
}

export function experimentFingerprint(options: {
  hypothesisId: string;
  action: string;
  targetedEvidence: PortableReferenceV2[];
  sourceRevision: string;
}): string {
  return digest({
    hypothesisId: options.hypothesisId,
    action: options.action,
    targetedEvidence: options.targetedEvidence.map((item) => [item.referenceId, item.digest ?? null]),
    sourceRevision: options.sourceRevision,
  });
}

export function planDebugExperiment(options: {
  session: DebugSessionV2;
  hypothesisId: string;
  action: string;
  targetedEvidence: PortableReferenceV2[];
  sourceRevision: string;
  now?: string;
  humanRationale?: string;
}): DebugSessionV2 {
  const session = DebugSessionV2Schema.parse(options.session);
  if (session.status !== 'active') throw new Error('Experiments can only be planned in an active debugging session.');
  if (!session.hypotheses.some((item) => item.hypothesisId === options.hypothesisId)) {
    throw new Error(`Unknown debugging hypothesis '${options.hypothesisId}'.`);
  }
  const fingerprint = experimentFingerprint(options);
  const repeated = session.experiments.find((item) => item.fingerprint === fingerprint &&
    ['failed', 'inconclusive', 'rejected_duplicate'].includes(item.result));
  if (repeated && !options.humanRationale) {
    throw new Error(`Repeated unsuccessful experiment '${repeated.experimentId}' requires changed evidence or human rationale.`);
  }
  const experiment: DebugExperimentV2 = {
    experimentId: `experiment:${digest({ sessionId: session.sessionId, fingerprint, count: session.experiments.length }).slice(0, 24)}`,
    fingerprint,
    hypothesisId: options.hypothesisId,
    action: options.action,
    targetedEvidence: options.targetedEvidence,
    sourceRevision: options.sourceRevision,
    result: 'planned',
  };
  return DebugSessionV2Schema.parse({
    ...session,
    experiments: [...session.experiments, experiment],
    updatedAt: options.now ?? new Date().toISOString(),
    nextAction: 'Run the planned experiment and record its observed result.',
  });
}

export function observeDebugExperiment(options: {
  session: DebugSessionV2;
  experimentId: string;
  result: Exclude<DebugExperimentV2['result'], 'planned' | 'rejected_duplicate'>;
  observation: string;
  now?: string;
}): DebugSessionV2 {
  const session = DebugSessionV2Schema.parse(options.session);
  const experiment = session.experiments.find((item) => item.experimentId === options.experimentId);
  if (!experiment) throw new Error(`Unknown debugging experiment '${options.experimentId}'.`);
  if (experiment.result !== 'planned') throw new Error(`Experiment '${experiment.experimentId}' already has an observation.`);
  const experiments = session.experiments.map((item) => item.experimentId === experiment.experimentId
    ? { ...item, result: options.result, observation: options.observation }
    : item);
  const hypotheses = session.hypotheses.map((item) => item.hypothesisId === experiment.hypothesisId &&
    options.result === 'failed' ? { ...item, status: 'rejected' as const } : item);
  return DebugSessionV2Schema.parse({
    ...session,
    experiments,
    hypotheses,
    updatedAt: options.now ?? new Date().toISOString(),
    nextAction: options.result === 'failed'
      ? 'Record a different hypothesis or explain why a repeated experiment is meaningful.'
      : 'Record the next evidence-backed debugging action.',
  });
}

export function debugSessionForRepairExhaustion(options: {
  logicalFailureId: string;
  findingId?: string;
  references: string[];
  failedEvidence: PortableReferenceV2[];
  repairAttempts: Array<{ result: string }>;
  limit: number;
  existing: DebugSessionV2[];
  now?: string;
}): DebugSessionV2 {
  const failed = options.repairAttempts.filter((attempt) => attempt.result === 'fail' || attempt.result === 'exhausted').length;
  if (failed < options.limit) throw new Error('A debug session starts only after the configured repair limit is exhausted.');
  return startDebugSession(options);
}

export function resolveDebugSession(options: {
  session: DebugSessionV2;
  regressionEvidence: PortableReferenceV2[];
  verification: DebugVerificationV2;
  now?: string;
  exemption?: { reason: string; acceptedBy: string };
}): DebugSessionV2 {
  const session = DebugSessionV2Schema.parse(options.session);
  if (options.regressionEvidence.length === 0 && !options.exemption) {
    throw new Error('Resolved behavior defects require relevant fail-before/pass-after regression evidence.');
  }
  if (options.exemption && !options.exemption.acceptedBy) {
    throw new Error('A regression exemption requires independent human acceptance.');
  }
  if (!options.exemption && !session.conclusions.some((item) => item.kind === 'root_cause')) {
    throw new Error('Resolved behavior defects require an evidence-backed root-cause conclusion.');
  }
  const verifiedSubjectMatches = session.findingId
    ? options.verification.findingId === session.findingId
    : Boolean(options.verification.checkId && session.logicalFailureId === `check:${options.verification.checkId}`);
  if (!verifiedSubjectMatches) throw new Error(
    'Debug resolution requires independent verification of the linked finding or equivalent check.',
  );
  if (!options.verification.verifier.id || !['verifier', 'human'].includes(options.verification.verifier.kind)) {
    throw new Error('Debug resolution requires a distinct authorized verifier actor.');
  }
  if (!options.exemption && (!options.verification.failBeforeEvidence || !options.verification.passAfterEvidence)) {
    throw new Error('Debug resolution requires distinct fail-before and pass-after regression evidence.');
  }
  return DebugSessionV2Schema.parse({
    ...session,
    status: 'resolved',
    updatedAt: options.now ?? new Date().toISOString(),
    regressionEvidence: options.regressionEvidence,
    verification: options.verification,
    nextAction: options.exemption ? `Regression exemption accepted by ${options.exemption.acceptedBy}: ${options.exemption.reason}`
      : 'Regression evidence is ready for independent verification.',
  });
}
