import { promises as fs } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GuardrailsAssuranceV1Schema,
  GuardrailsEventStoreV1Schema,
  GuardrailsRunV1Schema,
} from '../src/index.js';

const fixture = (name: string) => new URL(`./fixtures/v1/${name}`, import.meta.url);

describe('Guardrails v1 migration fixtures', () => {
  it('preserves representative v1 projections from the locally installable baseline', async () => {
    const [events, run, assurance] = await Promise.all(
      ['events.json', 'run.json', 'assurance.json'].map(async (name) =>
        JSON.parse(await fs.readFile(fixture(name), 'utf8'))),
    );

    expect(GuardrailsEventStoreV1Schema.parse(events).version).toBe(1);
    expect(GuardrailsRunV1Schema.parse(run).version).toBe(1);
    expect(GuardrailsAssuranceV1Schema.parse(assurance).version).toBe(1);
    expect(run.runId).toBe(assurance.runId);
    expect(events.runId).toBe(run.runId);
  });
});
