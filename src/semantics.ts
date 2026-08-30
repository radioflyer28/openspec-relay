import { createHash } from 'node:crypto';
import {
  SemanticClassificationV1Schema,
  SemanticDowngradeV1Schema,
  type SemanticClassificationV1,
  type SemanticDowngradeV1,
  type SemanticLevel,
} from './schemas.js';

export interface SemanticRequirementInputV1 {
  id: string;
  title: string;
  body: string;
  scenarios: Array<{ id?: string; title?: string; body: string }>;
  sourceDigest?: string;
}

const levelRank: Record<SemanticLevel, number> = { simple: 0, behavioral: 1, modeling: 2 };

function digestRequirement(requirement: SemanticRequirementInputV1): string {
  return createHash('sha256').update(JSON.stringify({
    id: requirement.id,
    title: requirement.title,
    body: requirement.body,
    scenarios: requirement.scenarios,
  })).digest('hex');
}

function deterministicMinimum(requirement: SemanticRequirementInputV1): {
  level: SemanticLevel;
  triggers: string[];
  rationale: string;
} {
  const requirementText = [requirement.title, requirement.body].join('\n').toLowerCase();
  const text = [requirementText, ...requirement.scenarios.map((scenario) => scenario.body)]
    .join('\n').toLowerCase();
  const modelingTriggers = [
    ['concurrency', /concurr|race|interleav|simultaneous/],
    ['authorization-state', /authori[sz]|authenticated|owner|permission/],
    ['invariant', /invariant|must never|shall never|exactly once/],
    ['irreversible-transition', /irreversib|cannot be undone|terminal state/],
  ] as const;
  const modeling = modelingTriggers.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (modeling.length >= 2 || /high[- ]consequence invariant/.test(text)) return {
    level: 'modeling',
    triggers: modeling,
    rationale: `Modeling is required because the behavior combines ${modeling.join(' and ')} obligations.`,
  };
  const behavioralTriggers = [
    // OpenSpec scenarios normally use WHEN/THEN as structural labels. A bare
    // scenario wrapper must not elevate an otherwise ordinary outcome; the
    // requirement itself must make trigger semantics material.
    ['trigger', /\bwhen\b|\bafter\b|\bupon\b/, requirementText],
    ['ordering', /\bbefore\b|\bafter\b|\border/, text],
    ['timing', /deadline|timeout|within \d|latency/, text],
    ['cancellation', /cancel/, text],
    ['retry-recovery', /retr|recover|transient failure|partial failure/, text],
    ['state-mode', /\bstate\b|\bmode\b|transition/, text],
    ['prohibition', /shall not|must not|never/, text],
  ] as const;
  const behavioral = behavioralTriggers.filter(([, pattern, source]) => pattern.test(source)).map(([name]) => name);
  if (behavioral.length > 0 || modeling.length > 0) return {
    level: 'behavioral',
    triggers: [...modeling, ...behavioral],
    rationale: `Behavioral semantics are required for ${[...modeling, ...behavioral].join(', ')}.`,
  };
  return {
    level: 'simple',
    triggers: [],
    rationale: 'The requirement states an ordinary observable outcome without material temporal, state, or invariant ambiguity.',
  };
}

export function classifySemanticRequirements(
  requirements: SemanticRequirementInputV1[],
): SemanticClassificationV1[] {
  return requirements.map((requirement) => {
    const minimum = deterministicMinimum(requirement);
    return SemanticClassificationV1Schema.parse({
      requirementId: requirement.id,
      ...minimum,
      sourceRevision: requirement.sourceDigest ?? digestRequirement(requirement),
      evidenceRefs: [],
      provenance: 'deterministic_lower_bound',
    });
  });
}

export function reconcileSemanticClassification(
  planner: SemanticClassificationV1,
  reviewer: SemanticClassificationV1,
): SemanticClassificationV1 {
  const left = SemanticClassificationV1Schema.parse(planner);
  const right = SemanticClassificationV1Schema.parse(reviewer);
  if (left.requirementId !== right.requirementId || left.sourceRevision !== right.sourceRevision) {
    throw new Error('Planner and reviewer semantic classifications must reference the same requirement revision.');
  }
  if (levelRank[right.level] < levelRank[left.level]) {
    throw new Error('A reviewer cannot lower the planner semantic level without an explicit human downgrade disposition.');
  }
  return levelRank[right.level] > levelRank[left.level] ? right : left;
}

export function resolveSemanticClassification(options: {
  requirement: SemanticRequirementInputV1;
  planner?: SemanticClassificationV1;
  reviewer?: SemanticClassificationV1;
  independentReview: boolean;
}): SemanticClassificationV1 {
  const minimum = classifySemanticRequirements([options.requirement])[0];
  let resolved = minimum;
  if (options.planner) {
    const planner = SemanticClassificationV1Schema.parse(options.planner);
    if (planner.requirementId !== minimum.requirementId || planner.sourceRevision !== minimum.sourceRevision) {
      throw new Error('Planner classification does not match the current requirement revision.');
    }
    if (levelRank[planner.level] < levelRank[minimum.level]) {
      throw new Error('Planner classification cannot erase the deterministic semantic lower bound.');
    }
    resolved = { ...planner, provenance: 'planner' };
  }
  if (options.reviewer) {
    resolved = reconcileSemanticClassification(resolved, {
      ...options.reviewer,
      provenance: options.independentReview ? 'plan_reviewer' : 'tier0_self_review',
    });
  } else if (!options.independentReview && resolved.provenance === 'planner') {
    resolved = { ...resolved, provenance: 'tier0_self_review' };
  }
  return SemanticClassificationV1Schema.parse(resolved);
}

export function recordSemanticDowngrade(options: {
  classification: SemanticClassificationV1;
  achievedLevel: SemanticLevel;
  reason?: string;
  actor?: string;
}): SemanticDowngradeV1 {
  const classification = SemanticClassificationV1Schema.parse(options.classification);
  const accepted = Boolean(options.reason?.trim() && options.actor?.trim());
  return SemanticDowngradeV1Schema.parse({
    requirementId: classification.requirementId,
    requiredLevel: classification.level,
    achievedLevel: options.achievedLevel,
    reason: options.reason?.trim() || 'Required semantic analysis remains unresolved.',
    ...(options.actor?.trim() ? { actor: options.actor.trim() } : {}),
    sourceRevision: classification.sourceRevision,
    status: accepted ? 'accepted' : 'human_needed',
  });
}

export function validateSemanticStructure(options: {
  requirementId: string;
  level: SemanticLevel;
  body: string;
  design: string;
  tasks: string;
}): { valid: boolean; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (options.level === 'simple') return { valid: true, diagnostics };
  const body = options.body.trim();
  const hasComponentAndResponse = /\b(?:the\s+)?[a-z][a-z0-9 _-]*\s+(?:shall|must)\b/i.test(body) ||
    /(?:^|\n)Component:\s*\S[\s\S]*(?:^|\n)Response:\s*\S/im.test(body);
  if (!hasComponentAndResponse) diagnostics.push(`${options.requirementId} lacks an identifiable component and required response.`);
  if (options.level === 'modeling') {
    if (!/invariant|shall never|must never|prohibit/i.test(body)) {
      diagnostics.push(`${options.requirementId} lacks an observable invariant or prohibition.`);
    }
    for (const section of ['state', 'transition', 'assumption', 'proof obligation']) {
      if (!new RegExp(section, 'i').test(options.design)) diagnostics.push(`${options.requirementId} design lacks ${section} analysis.`);
    }
    if (!/verify|test|check|establish/i.test(options.tasks)) {
      diagnostics.push(`${options.requirementId} lacks planned verification work.`);
    }
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export function validateAchievedAssuranceClaim(options: {
  claim: string;
  officialToolEvidence: string[];
}): string {
  if (/fret[- ]?valid|pvs[- ]?proven|formally verified/i.test(options.claim) && options.officialToolEvidence.length === 0) {
    throw new Error(`Claim '${options.claim}' requires corresponding official tool evidence.`);
  }
  return options.claim;
}
