import { createHash } from 'node:crypto';
import { discoverFinding, transitionFinding } from './findings.js';
import {
  UatScenarioV2Schema,
  type FindingLifecycleRecordV2,
  type PortableReferenceV2,
  type UatScenarioV2,
} from './schemas.js';
import type { ScenarioCoverageV1 } from './verification.js';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function projectUatScenarios(options: {
  coverage: ScenarioCoverageV1[];
  findings: FindingLifecycleRecordV2[];
  taskIdsByScenario?: Record<string, string[]>;
  sourceRevision: string;
}): UatScenarioV2[] {
  const scenarios = new Map<string, UatScenarioV2>();
  for (const item of options.coverage.filter((coverage) => coverage.status === 'human_needed')) {
    scenarios.set(item.scenarioId, UatScenarioV2Schema.parse({
      scenarioId: item.scenarioId,
      requirementId: item.requirementId,
      taskIds: options.taskIdsByScenario?.[item.scenarioId] ?? [],
      prerequisites: [],
      action: item.acceptanceInstructions ?? 'Perform the declared OpenSpec acceptance scenario.',
      expectedResult: 'Observe the expected result declared by the OpenSpec scenario.',
      status: 'awaiting_human',
      sourceRevision: options.sourceRevision,
    }));
  }
  for (const finding of options.findings.filter((item) => item.state === 'human_needed')) {
    if (finding.scope.kind !== 'scenario' || scenarios.has(finding.scope.identity)) continue;
    const requirementId = finding.requirementIds[0] ?? 'unknown-requirement';
    scenarios.set(finding.scope.identity, UatScenarioV2Schema.parse({
      scenarioId: finding.scope.identity,
      requirementId,
      taskIds: finding.taskIds,
      prerequisites: [],
      action: `Resolve the human decision requested by finding ${finding.findingId}.`,
      expectedResult: finding.summary,
      status: 'awaiting_human',
      sourceRevision: options.sourceRevision,
    }));
  }
  return [...scenarios.values()].sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
}

export function nextUatScenario(scenarios: UatScenarioV2[]): UatScenarioV2 | undefined {
  return [...scenarios].sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))
    .find((scenario) => ['awaiting_human', 'awaiting_retest'].includes(scenario.status));
}

export function recordUatDisposition(options: {
  scenario: UatScenarioV2;
  status: 'passed' | 'failed' | 'blocked' | 'accepted_limitation';
  actor?: string;
  notes: string;
  evidence: PortableReferenceV2[];
  now?: string;
}): { scenario: UatScenarioV2; finding?: FindingLifecycleRecordV2; acceptedRisk?: FindingLifecycleRecordV2 } {
  if (!options.actor) throw new Error('A UAT disposition requires an explicit human actor identity.');
  const scenario = UatScenarioV2Schema.parse(options.scenario);
  const recordedAt = options.now ?? new Date().toISOString();
  const next = UatScenarioV2Schema.parse({
    ...scenario,
    status: options.status,
    disposition: { actor: options.actor, recordedAt, notes: options.notes, evidence: options.evidence },
  });
  if (options.status === 'failed') {
    const finding = discoverFinding({
      providerId: 'uat', ruleId: 'scenario-failed', category: 'human-acceptance',
      scope: { kind: 'scenario', identity: scenario.scenarioId }, severity: 'error', blocking: true,
      summary: options.notes, requirementIds: [scenario.requirementId], taskIds: scenario.taskIds,
      evidence: options.evidence, occurredAt: recordedAt, sourceRevision: scenario.sourceRevision,
      actor: { kind: 'human', id: options.actor },
    });
    return { scenario: next, finding };
  }
  if (options.status === 'accepted_limitation') {
    const finding = discoverFinding({
      providerId: 'uat', ruleId: 'accepted-limitation', category: 'human-acceptance',
      scope: { kind: 'scenario', identity: scenario.scenarioId }, severity: 'warning', blocking: true,
      summary: options.notes, requirementIds: [scenario.requirementId], taskIds: scenario.taskIds,
      evidence: options.evidence, occurredAt: recordedAt, sourceRevision: scenario.sourceRevision,
      actor: { kind: 'human', id: options.actor },
    });
    return {
      scenario: next,
      acceptedRisk: transitionFinding({
        finding,
        to: 'accepted_risk',
        actor: { kind: 'human', id: options.actor },
        reason: options.notes,
        evidence: options.evidence,
        sourceRevision: scenario.sourceRevision,
        occurredAt: recordedAt,
      }),
    };
  }
  return { scenario: next };
}

export function returnScenarioToRetest(options: {
  scenario: UatScenarioV2;
  independentlyVerified: boolean;
}): UatScenarioV2 {
  const scenario = UatScenarioV2Schema.parse(options.scenario);
  if (!options.independentlyVerified) throw new Error('A failed UAT scenario requires independent verification before retest.');
  const withoutDisposition = { ...scenario };
  delete withoutDisposition.disposition;
  return UatScenarioV2Schema.parse({ ...withoutDisposition, status: 'awaiting_retest' });
}

export function invalidateUatScenarios(options: {
  scenarios: UatScenarioV2[];
  sourceRevision: string;
}): UatScenarioV2[] {
  return options.scenarios.map((scenario) => {
    if (scenario.sourceRevision === options.sourceRevision || !['passed', 'accepted_limitation'].includes(scenario.status)) {
      return scenario;
    }
    return UatScenarioV2Schema.parse({ ...scenario, status: 'stale', sourceRevision: options.sourceRevision });
  });
}

export function evaluateUatObligations(options: {
  scenarios: UatScenarioV2[];
}): { blocking: string[]; acceptedLimitations: string[] } {
  const blockingStates = new Set(['awaiting_human', 'awaiting_retest', 'failed', 'blocked', 'stale']);
  return {
    blocking: options.scenarios.filter((scenario) => blockingStates.has(scenario.status))
      .map((scenario) => scenario.scenarioId).sort(),
    acceptedLimitations: options.scenarios.filter((scenario) => scenario.status === 'accepted_limitation')
      .map((scenario) => scenario.scenarioId).sort(),
  };
}

export function uatDispositionId(options: {
  scenario: UatScenarioV2;
  status: 'passed' | 'failed' | 'blocked' | 'accepted_limitation';
  actor: string;
  recordedAt: string;
}): string {
  return `uat:${digest(options).slice(0, 24)}`;
}
