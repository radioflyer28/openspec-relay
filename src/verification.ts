import type {
  EvidenceV1,
  ScenarioCoverageV1Schema,
  VerificationFindingV1,
} from './schemas.js';
import type { z } from 'zod';

export type ScenarioCoverageV1 = z.infer<typeof ScenarioCoverageV1Schema>;

export interface ReadOnlyVerificationContractV1 {
  artifactRefs: readonly string[];
  requirementIds: readonly string[];
  evidence: readonly Readonly<EvidenceV1>[];
  writeAccess: false;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function createReadOnlyVerificationContract(options: {
  artifactRefs: string[];
  requirementIds: string[];
  evidence: EvidenceV1[];
}): Readonly<ReadOnlyVerificationContractV1> {
  return deepFreeze({
    artifactRefs: structuredClone(options.artifactRefs),
    requirementIds: structuredClone(options.requirementIds),
    evidence: structuredClone(options.evidence),
    writeAccess: false as const,
  });
}

export function mapScenarioCoverage(options: {
  scenarioIds: string[];
  evidence: EvidenceV1[];
  humanNeeded?: Record<string, string>;
}): ScenarioCoverageV1[] {
  return options.scenarioIds.map((scenarioId) => {
    const matching = options.evidence.filter((item) => item.reference === scenarioId && item.result === 'pass');
    const acceptanceInstructions = options.humanNeeded?.[scenarioId];
    if (matching.length > 0) {
      return {
        requirementId: scenarioId.split('/scenario:')[0],
        scenarioId,
        status: 'covered' as const,
        evidenceIds: matching.map((item) => item.evidenceId),
      };
    }
    if (acceptanceInstructions) {
      return {
        requirementId: scenarioId.split('/scenario:')[0],
        scenarioId,
        status: 'human_needed' as const,
        evidenceIds: [],
        acceptanceInstructions,
      };
    }
    return {
      requirementId: scenarioId.split('/scenario:')[0],
      scenarioId,
      status: 'missing' as const,
      evidenceIds: [],
    };
  });
}

export function validateIndependentVerification(options: {
  requirementIds: string[];
  findings: VerificationFindingV1[];
  evidence: EvidenceV1[];
}): { valid: boolean; diagnostics: string[]; evidenceIds: string[] } {
  const evidence = new Map(options.evidence.map((item) => [item.evidenceId, item]));
  const diagnostics: string[] = [];
  const acceptedEvidence = new Set<string>();
  for (const requirementId of options.requirementIds) {
    const finding = options.findings.find((item) => item.requirementId === requirementId &&
      item.origin === 'verifier');
    if (!finding || finding.status !== 'pass') {
      diagnostics.push(`Requirement '${requirementId}' lacks a passing independent verifier finding.`);
      continue;
    }
    const independent = finding.evidenceIds.filter((id) => {
      const item = evidence.get(id);
      return item && item.origin !== 'executor';
    });
    if (independent.length === 0) {
      diagnostics.push(`Requirement '${requirementId}' is supported only by executor self-report.`);
      continue;
    }
    independent.forEach((id) => acceptedEvidence.add(id));
  }
  return { valid: diagnostics.length === 0, diagnostics, evidenceIds: [...acceptedEvidence].sort() };
}
