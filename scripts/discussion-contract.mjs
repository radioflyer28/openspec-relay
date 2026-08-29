import { createHash } from 'node:crypto';

export const GRILLING_REVISION = '85f83d3fde1d3a90d5c9a657f6998c79a6c37308';
export const GRILLING_BODY_SHA256 = 'e3ff41d7514da8ddec35e322176761a68055c4bf074f489a0e6e392a40bfd8ba';

const supplementContracts = [
  ['design tree', /design tree/i],
  ['prerequisite ordering', /prerequisite ordering/i],
  ['recommendations', /recommend(?:ation|ed answer)/i],
  ['agent-owned fact finding', /agent-owned\s+fact finding/i],
  ['complete material branch coverage', /every deferred material branch/i],
  ['shared-understanding confirmation', /shared-understanding confirmation/i],
  ['materiality', /meaningfully different product behavior/i],
  ['safe delegated choices', /effectively interchangeable details/i],
  ['coherent clustering', /one coherent domain cluster/i],
  ['candidate isolation', /does not approve incidental details/i],
  ['proposal mapping', /map every material decision/i],
  ['targeted re-entry', /reopen only the affected decisions/i],
];

export function validateDiscussionContract({ body, supplement, notice }) {
  const digest = createHash('sha256').update(body).digest('hex');
  if (digest !== GRILLING_BODY_SHA256) throw new Error(`Vendored grilling body drifted from ${GRILLING_REVISION}.`);
  for (const [name, pattern] of supplementContracts) {
    if (!pattern.test(supplement)) throw new Error(`Discussion supplement weakens or omits ${name}.`);
  }
  for (const required of [GRILLING_REVISION, 'Copyright (c) 2026 Matt Pocock', 'MIT License']) {
    if (!notice.includes(required)) throw new Error(`Third-party notice omits '${required}'.`);
  }
  return { revision: GRILLING_REVISION, digest };
}
