import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('host-neutral OpenSpec GSD workflows', () => {
  it('drive Tier 0 through supported commands while OpenSpec remains planning authority', async () => {
    const workflows = await Promise.all(['plan.md', 'do.md', 'check.md', 'status.md', 'debug.md', 'uat.md'].map((filename) =>
      fs.readFile(path.join(process.cwd(), 'workflows', filename), 'utf8')));
    const content = workflows.join('\n');
    expect(content).toContain('$openspec-apply-change');
    expect(content).toMatch(/task checkbox updates/i);
    expect(content).toMatch(/do not maintain a second task queue/i);
    expect(content).toContain('openspec-gsd accept');
    expect(content).toContain('openspec-gsd debug');
    expect(content).toContain('openspec-gsd uat');
    expect(content).toContain('tasks.md');
    expect(content).toContain('edit `.openspec-gsd` files directly');
    for (const planningArtifact of ['PROJECT.md', 'ROADMAP.md', 'PLAN.md', 'STATE.md']) {
      expect(content).not.toContain(`create ${planningArtifact}`);
    }
    expect(content).not.toMatch(/create (?:phases?|milestones?)/i);
  });
});
