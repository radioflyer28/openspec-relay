import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('assurance capability test map', () => {
  it('references only existing executable tests and records honest evidence gaps', async () => {
    const filename = path.join(process.cwd(), 'test', 'assurance-capabilities-test-plan.md');
    const content = await fs.readFile(filename, 'utf8');
    const references = [...new Set([...content.matchAll(/`(test\/[^`]+\.test\.ts)`/g)].map((match) => match[1]))];
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) await expect(fs.access(path.join(process.cwd(), reference))).resolves.toBeUndefined();
    expect(content).not.toMatch(/gate-v2|cli-v2|portable-paths|release-drivers/);
    expect(content).toMatch(/Historical RED provenance[\s\S]*Status: `human_needed`/);
    expect(content).toMatch(/not available[\s\S]*not[\s\S]*(?:reconstructed|fabricated)/i);
    expect(content.match(/`human_needed`/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('binds high-risk map claims to semantic regression assertions', async () => {
    const read = (filename: string) => fs.readFile(path.join(process.cwd(), 'test', filename), 'utf8');
    const [events, state, lifecycle, release, installed] = await Promise.all([
      read('events-v2.test.ts'), read('state.test.ts'), read('v2-operations.test.ts'),
      read('release-assurance.test.ts'), read('actual-candidate-install.test.ts'),
    ]);
    expect(events).toMatch(/exceeds the lease interval|preserves every successful event/i);
    expect(state).toMatch(/ancestor.*(?:swap|replacement)|junction/i);
    expect(lifecycle).toMatch(/production retest queue/);
    expect(lifecycle).toMatch(/exact cited repository evidence/);
    expect(lifecycle).toMatch(/debug\.verification_recorded/);
    expect(release).toMatch(/unrelated host secrets|hostile-build/);
    expect(release).toMatch(/stateContracts|state contract/);
    expect(installed).toMatch(/all five workflows through host discovery/);
    expect(installed).toContain("['run', 'check', 'run-status', 'debug', 'uat']");
  });
});
