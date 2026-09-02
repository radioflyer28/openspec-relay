import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { confirmDiscussionHandoff } from '../src/discussion.js';
import { validateDiscussionContract } from '../scripts/discussion-contract.mjs';

const pinnedDigest = 'e3ff41d7514da8ddec35e322176761a68055c4bf074f489a0e6e392a40bfd8ba';

describe('materiality-gated grilling discussion', () => {
  it('vendors the pinned upstream instruction body byte-for-byte with attribution', async () => {
    const root = process.cwd();
    const body = await fs.readFile(path.join(root, 'vendor', 'grilling', 'SKILL.body.md'), 'utf8');
    const notice = await fs.readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    expect(createHash('sha256').update(body).digest('hex')).toBe(pinnedDigest);
    expect(notice).toContain('85f83d3fde1d3a90d5c9a657f6998c79a6c37308');
    expect(notice).toContain('Copyright (c) 2026 Matt Pocock');
    expect(notice).toContain('MIT License');
  });

  it('places the exact base before a supplement that preserves grilling invariants', async () => {
    const root = process.cwd();
    const base = (await fs.readFile(path.join(root, 'vendor', 'grilling', 'SKILL.body.md'), 'utf8')).trimEnd();
    const generated = await fs.readFile(
      path.join(root, 'pi', 'skills', 'openspec-discuss', 'SKILL.md'),
      'utf8',
    );
    const baseStart = generated.indexOf(base);
    const supplementStart = generated.indexOf('# OpenSpec Relay supplement');
    expect(baseStart).toBeGreaterThan(0);
    expect(supplementStart).toBe(baseStart + base.length + 2);
    for (const contract of [
      'design tree', 'prerequisite ordering', 'recommended answer', 'agent-owned',
      'every deferred material branch', 'shared-understanding confirmation',
      'effectively interchangeable details', 'A “yes” does not approve incidental details',
    ]) expect(generated.toLowerCase()).toContain(contract.toLowerCase());
  });

  it('confirms complete mappings automatically and returns only affected decisions', () => {
    const handoff = {
      goal: 'Ship predictable cancellation.',
      decisions: [
        { decisionId: 'D1', summary: 'Cancellation is immediate.' },
        { decisionId: 'D2', summary: 'Published results remain durable.', dependsOn: ['D1'] },
      ],
    };
    expect(confirmDiscussionHandoff({ handoff, mappings: [
      { decisionId: 'D1', artifact: 'spec', reference: 'REQ-1', status: 'consistent' },
      { decisionId: 'D2', artifact: 'design', reference: 'Decision 2', status: 'consistent' },
    ]})).toMatchObject({ status: 'pass', affectedDecisionIds: [] });
    expect(confirmDiscussionHandoff({ handoff, mappings: [
      { decisionId: 'D1', artifact: 'spec', reference: 'REQ-1', status: 'contradicted' },
    ]})).toMatchObject({ status: 'return_to_discussion', affectedDecisionIds: ['D1', 'D2'] });
  });

  it('keeps the workflow conversational and free of persistent discussion state', async () => {
    const workflow = await fs.readFile(path.join(process.cwd(), 'workflows', 'discuss.md'), 'utf8');
    expect(workflow).toContain('do not persist a transcript');
    expect(workflow).not.toContain('.openspec-relay/discussion');
  });

  it('rejects supplement drift that weakens each protected grilling behavior', async () => {
    const root = process.cwd();
    const body = await fs.readFile(path.join(root, 'vendor', 'grilling', 'SKILL.body.md'), 'utf8');
    const supplement = await fs.readFile(path.join(root, 'workflows', 'discuss.md'), 'utf8');
    const notice = await fs.readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    for (const removable of [
      /design tree/gi, /prerequisite ordering/gi, /recommend(?:ations|ed answer)/gi,
      /agent-owned\s+fact finding/gi, /every deferred material branch/gi,
      /shared-understanding confirmation/gi,
    ]) {
      expect(() => validateDiscussionContract({ body, supplement: supplement.replace(removable, ''), notice }))
        .toThrow(/weakens or omits/i);
    }
  });

  it('contains scripted guidance for the material discussion cases', async () => {
    const workflow = await fs.readFile(path.join(process.cwd(), 'workflows', 'discuss.md'), 'utf8');
    for (const expected of [
      'discoverable facts have been resolved',
      'effectively interchangeable details',
      'meaningfully different product behavior',
      'one coherent domain cluster',
      'recommended answer',
      'does not approve incidental details',
      'map every material decision',
      'reopen only the affected decisions',
    ]) expect(workflow.toLowerCase()).toContain(expected.toLowerCase());
  });
});
