import { describe, expect, it } from 'vitest';
import * as schemas from '../src/schemas.js';

describe('Guardrails v2 contract (RED)', () => {
  it('introduces a distinct versioned state family for the new assurance records', () => {
    expect(schemas.GUARDRAILS_STATE_VERSION).toBe(2);
    for (const name of [
      'GuardrailsConfigV2Schema',
      'RepositoryContextV2Schema',
      'ReadinessResultV2Schema',
      'FindingLifecycleRecordV2Schema',
      'DebugSessionV2Schema',
      'UatScenarioV2Schema',
      'ReleaseCandidateV2Schema',
      'GuardrailsEventPayloadV2Schema',
    ]) expect(schemas).toHaveProperty(name);
  });

  it('uses a bounded, report-first feature configuration while v2 migrates', () => {
    const configSchema = (schemas as Record<string, { parse(value: unknown): unknown }>)
      .GuardrailsConfigV2Schema;
    expect(configSchema.parse({})).toMatchObject({
      version: 2,
      features: {
        repositoryContext: { enabled: true },
        readiness: { rollout: 'required', independentRequired: true },
        debug: { enabled: true, automaticTransition: true },
        uat: { enabled: true, required: false },
        releaseAssurance: { enabled: 'auto', drivers: [] },
      },
    });
  });

  it('accepts the new event families with roles that make independent and human actions explicit', () => {
    const payloadSchema = (schemas as Record<string, { parse(value: unknown): unknown }>)
      .GuardrailsEventPayloadV2Schema;
    expect(payloadSchema.parse({
      type: 'context.stale', contextId: 'context-1', referenceIds: ['repository:src/index.ts'],
    })).toMatchObject({ type: 'context.stale' });
    expect(payloadSchema.parse({
      type: 'human.disposition_recorded', subjectId: 'finding-1', disposition: 'accepted_risk',
      actor: 'maintainer', reason: 'bounded compatibility exception', scope: 'demo change',
    })).toMatchObject({ type: 'human.disposition_recorded', actor: 'maintainer' });
  });

  it('keeps one unpublished event-state family without a migration event protocol', () => {
    const payloadSchema = schemas.GuardrailsEventPayloadV2Schema;
    expect(payloadSchema.safeParse({
      type: 'v1.migrated', sourceVersion: 1, sourceKind: 'event', sourceId: 'old',
      sourceDigest: '0'.repeat(64), record: {},
    }).success).toBe(false);
  });
});
