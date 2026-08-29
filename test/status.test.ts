import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startGsdRunV2 } from '../src/runner-v2.js';
import { getRunStatusV2 } from '../src/status.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('canonical run status', () => {
  it('reports projection tampering as the primary blocking status in JSON and human output', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await startGsdRunV2({ change: 'demo', projectRoot: root, changedFiles: [] });
    const runPath = path.join(changeDir, '.openspec-gsd', 'run.json');
    const run = JSON.parse(await fs.readFile(runPath, 'utf8')) as Record<string, unknown>;
    await fs.writeFile(runPath, JSON.stringify({ ...run, status: 'complete' }));

    await expect(getRunStatusV2({ change: 'demo', projectRoot: root })).resolves.toMatchObject({
      status: 'error',
      assuranceStatus: 'error',
      assuranceDigestMatches: false,
      integrity: { status: 'error' },
      nextActions: expect.arrayContaining([expect.stringMatching(/regenerate projections/i)]),
    });

    const cli = spawnSync(process.execPath, [path.resolve('dist', 'cli.js'), 'status', 'demo', '--project', root], {
      encoding: 'utf8',
    });
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toMatch(/execution-record integrity error/i);
    expect(cli.stdout).not.toMatch(/assurance=(?:pass|warn)/i);
  });
});
