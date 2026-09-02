import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGsdConfigV2 } from '../src/config.js';
import { GsdConfigV2Schema } from '../src/schemas.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('Pi host adapter configuration', () => {
  it('is default-off with bounded read-only concurrency and an explicit Tier 0 rollback', () => {
    expect(GsdConfigV2Schema.parse({}).piHostAdapter).toEqual({
      enabled: false,
      forceTier0: false,
      maxReadOnlyConcurrency: 2,
    });
    expect(() => GsdConfigV2Schema.parse({ piHostAdapter: {
      enabled: true, forceTier0: false, maxReadOnlyConcurrency: 5,
    } })).toThrow();
  });

  it('merges project, change, and invocation settings without dropping rollback controls', async () => {
    const project = await createOpenSpecProject('demo');
    await fs.writeFile(path.join(project.root, 'openspec', 'gsd.json'), JSON.stringify({
      piHostAdapter: { enabled: true, maxReadOnlyConcurrency: 3 },
    }));
    await fs.writeFile(path.join(project.changeDir, 'gsd.json'), JSON.stringify({
      piHostAdapter: { forceTier0: true },
    }));
    const config = await loadGsdConfigV2({ projectRoot: project.root, changeDir: project.changeDir });
    expect(config.piHostAdapter).toEqual({ enabled: true, forceTier0: true, maxReadOnlyConcurrency: 3 });
  });
});
