import { compileOpenSpecChange } from './artifacts.js';
import { readCanonicalEventStore, replayGuardrailsEventsV2 } from './events.js';
import { digestJson, readAssuranceStateV2, readRunStateV2 } from './state.js';

/**
 * Load and replay the single canonical Guardrails history. All readers use
 * this path so archive gates, status, checks, and mutations agree on state.
 */
export async function loadCanonicalGuardrailsState(changeDir: string) {
  const store = await readCanonicalEventStore(changeDir);
  const compiled = await compileOpenSpecChange({
    changeDir,
    taskMetadata: store.seed.config.taskOverrides,
  });
  const projection = replayGuardrailsEventsV2({ store, compiled });
  return { store, compiled, projection, stateRevision: digestJson(store) };
}

/** Load canonical history together with its generated read projections. */
export async function loadCanonicalGuardrailsRecords(changeDir: string) {
  const canonical = await loadCanonicalGuardrailsState(changeDir);
  const [run, assurance] = await Promise.all([
    readRunStateV2(changeDir),
    readAssuranceStateV2(changeDir),
  ]);
  return {
    ...canonical,
    run,
    assurance,
    projectionsMatch: digestJson(run) === digestJson(canonical.projection.run) &&
      digestJson(assurance) === digestJson(canonical.projection.assurance),
  };
}
