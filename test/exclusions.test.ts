import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('v2 scope exclusions', () => {
  it('documents and protects the absence of deferred runtime and GSD administration mechanisms', async () => {
    const contract = await fs.readFile(path.join(process.cwd(), 'COMPATIBILITY.md'), 'utf8');
    for (const excluded of ['Little Coder', 'phases', 'milestones', 'roadmaps', 'workstreams', 'persistent GSD project state']) {
      expect(contract).toContain(excluded);
    }
    const source = await Promise.all(['src', 'workflows'].map(async (directory) => {
      const names = await fs.readdir(path.join(process.cwd(), directory));
      return Promise.all(names.filter((name) => name.endsWith('.ts') || name.endsWith('.md')).map((name) =>
        fs.readFile(path.join(process.cwd(), directory, name), 'utf8')));
    }));
    const content = source.flat().join('\n');
    expect(content).not.toMatch(/little-coder|context-pack|compaction watermark|provider-output repair/i);
    expect(content).not.toMatch(/create (?:phases?|milestones?|roadmaps?|workstreams?)/i);
  });
});
