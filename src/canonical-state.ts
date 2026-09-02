import { compileOpenSpecChange } from './artifacts.js';
import { readCanonicalEventStore, replayRelayEventsV2 } from './events.js';
import { digestJson, readAssuranceStateV2, readRunStateV2 } from './state.js';

/**
 * Load and replay the single canonical OpenSpec Relay history. All readers use
 * this path so archive gates, status, checks, and mutations agree on state.
 */
export async function loadCanonicalRelayState(changeDir: string) {
  const store = await readCanonicalEventStore(changeDir);
  const compiled = await compileOpenSpecChange({
    changeDir,
    taskMetadata: store.seed.config.taskOverrides,
  });
  const projection = replayRelayEventsV2({ store, compiled });
  return { store, compiled, projection, stateRevision: digestJson(store) };
}

/** Load canonical history together with its generated read projections. */
export async function loadCanonicalRelayRecords(changeDir: string) {
  const canonical = await loadCanonicalRelayState(changeDir);
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
