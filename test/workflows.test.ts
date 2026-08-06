import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('host-neutral Guardrails workflows', () => {
  it('drive Tier 0 through supported commands while OpenSpec remains planning authority', async () => {
    const workflows = await Promise.all(['run.md', 'check.md', 'run-status.md'].map((filename) =>
      fs.readFile(path.join(process.cwd(), 'workflows', filename), 'utf8')));
    const content = workflows.join('\n');
    expect(content).toContain('record task');
    expect(content).toContain('record evidence');
    expect(content).toContain('openspec-guardrails accept');
    expect(content).toContain('tasks.md');
    expect(content).toMatch(/never (?:patch|edit) `?(?:run\.json|\.guardrails)/i);
    for (const planningArtifact of ['PROJECT.md', 'ROADMAP.md', 'PLAN.md', 'STATE.md']) {
      expect(content).not.toContain(`create ${planningArtifact}`);
    }
    expect(content).not.toMatch(/create (?:phases?|milestones?)/i);
  });
});
