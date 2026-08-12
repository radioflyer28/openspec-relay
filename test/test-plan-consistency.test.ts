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
});
