import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/artifacts.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';
import { afterEach } from 'vitest';

afterEach(cleanupTemporaryRoots);

describe('discussion, semantic planning, and execution convergence contract', () => {
  it('contributes the new lifecycle without retaining legacy public names', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(process.cwd(), 'openspec-extension.json'), 'utf8')) as {
      contributes: { workflows: Array<{ id: string; replaces?: string[] }> };
    };
    expect(manifest.contributes.workflows.map((workflow) => workflow.id))
      .toEqual(['discuss', 'plan', 'do', 'check', 'status', 'debug', 'uat']);
    expect(manifest.contributes.workflows.find((workflow) => workflow.id === 'do')?.replaces)
      .toEqual(['run']);
    expect(manifest.contributes.workflows.find((workflow) => workflow.id === 'status')?.replaces)
      .toEqual(['run-status']);
  });

  it('compiles complete requirement and scenario bodies for semantic planning', async () => {
    const { changeDir } = await createOpenSpecProject();
    const compiled = await compileOpenSpecChange({ changeDir }) as unknown as {
      requirements?: Array<{ id: string; body: string; scenarios: Array<{ id: string; body: string }> }>;
    };
    expect(compiled.requirements).toEqual([
      expect.objectContaining({
        body: 'The system SHALL demonstrate behavior.',
        scenarios: [expect.objectContaining({ body: expect.stringContaining('**WHEN** invoked') })],
      }),
    ]);
  });

  it('defines one planner and an executor wrapper around canonical apply', async () => {
    const [adapters, doWorkflow] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'src', 'execution-adapters.ts'), 'utf8'),
      fs.readFile(path.join(process.cwd(), 'workflows', 'do.md'), 'utf8').catch(() => ''),
    ]);
    expect(adapters).toContain("'planner'");
    expect(adapters).toContain("'plan_reviewer'");
    expect(adapters).toContain("'pathfinder'");
    expect(doWorkflow).toContain('$openspec-apply-change');
    expect(doWorkflow).toMatch(/planner instructions/i);
    expect(doWorkflow).toMatch(/do not maintain a second task queue/i);
  });

  it('does not introduce excluded planning or runtime machinery', async () => {
    const files = await fs.readdir(path.join(process.cwd(), 'src'));
    expect(files).not.toEqual(expect.arrayContaining([
      'gap-plan.ts', 'repair-planner.ts', 'task-queue.ts', 'fret-runtime.ts', 'pvs-runtime.ts',
    ]));
    const allFiles = [
      ...await fs.readdir(path.join(process.cwd(), 'src')),
      ...await fs.readdir(path.join(process.cwd(), 'workflows')),
    ].join('\n');
    expect(allFiles).not.toMatch(/PROJECT\.md|ROADMAP\.md|PLAN\.md|STATE\.md/);
  });
});
