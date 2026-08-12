import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkGuardrailsRunV2, startGuardrailsRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

describe('OpenSpec source-of-truth boundary', () => {
  it('references controlling artifacts without rewriting or reproducing their prose in generated records', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const controlling = ['proposal.md', 'design.md', 'tasks.md', path.join('specs', 'demo', 'spec.md')];
    const before = Object.fromEntries(await Promise.all(controlling.map(async (filename) => [
      filename,
      digest(await fs.readFile(path.join(changeDir, filename), 'utf8')),
    ])));
    await startGuardrailsRunV2({ change: 'demo', projectRoot: root });
    await checkGuardrailsRunV2({ change: 'demo', projectRoot: root });
    const after = Object.fromEntries(await Promise.all(controlling.map(async (filename) => [
      filename,
      digest(await fs.readFile(path.join(changeDir, filename), 'utf8')),
    ])));
    expect(after).toEqual(before);
    const generated = await fs.readFile(path.join(changeDir, '.guardrails', 'reports', 'readiness.json'), 'utf8');
    expect(generated).toContain('spec:demo#requirement:demonstrate-behavior');
    expect(generated).not.toContain('The system SHALL demonstrate behavior.');
    expect(generated).not.toContain('Implement behavior');
  });
});
