import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EvidenceV1 } from '../src/schemas.js';

export const temporaryRoots: string[] = [];

export async function createOpenSpecProject(name = 'demo'): Promise<{
  root: string;
  changeDir: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guardrails-project-'));
  temporaryRoots.push(root);
  const changeDir = path.join(root, 'openspec', 'changes', name);
  await fs.mkdir(path.join(changeDir, 'specs', 'demo'), { recursive: true });
  await fs.writeFile(path.join(changeDir, 'proposal.md'), '## Why\n\nDemo.\n');
  await fs.writeFile(path.join(changeDir, 'design.md'), '## Decisions\n\nPublic API integration.\n');
  await fs.writeFile(path.join(changeDir, 'tasks.md'), [
    '## 1. Work',
    '',
    '- [ ] 1.1 Implement behavior',
    '- [ ] 1.2 Update documentation',
    '',
  ].join('\n'));
  await fs.writeFile(path.join(changeDir, 'specs', 'demo', 'spec.md'), [
    '## ADDED Requirements',
    '',
    '### Requirement: Demonstrate behavior',
    'The system SHALL demonstrate behavior.',
    '',
    '#### Scenario: Works',
    '- **WHEN** invoked',
    '- **THEN** it works',
    '',
  ].join('\n'));
  return { root, changeDir };
}

export async function cleanupTemporaryRoots(): Promise<void> {
  await Promise.all(temporaryRoots.splice(0)
    .map((root) => fs.rm(root, { recursive: true, force: true })));
}

export function evidence(options: Partial<EvidenceV1> & Pick<EvidenceV1, 'evidenceId' | 'phase' | 'checkId' | 'result' | 'origin'>): EvidenceV1 {
  return {
    observedAt: '2026-08-04T12:00:00.000Z',
    sourceState: 'source-a',
    outputDigest: createHash('sha256').update(options.evidenceId).digest('hex'),
    preExistingFailure: false,
    ...options,
  };
}
