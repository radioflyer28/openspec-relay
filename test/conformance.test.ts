import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkExtensionConformanceV1 } from '@fission-ai/openspec/extensions';

describe('OpenSpec extension conformance', () => {
  it.each(['1.7.0', '1.99.999'])('conforms to OpenSpec %s', async (coreVersion) => {
    const result = await checkExtensionConformanceV1({
      extensionRoot: path.resolve('.'),
      coreVersion,
    });
    expect(result).toMatchObject({ valid: true, diagnostics: [] });
    expect(result.manifest?.id).toBe('guardrails');
  });

  it('runs through the public API from the local-link OpenSpec build', async () => {
    const result = await checkExtensionConformanceV1({
      extensionRoot: path.resolve('.'),
      coreVersion: '1.7.0',
    });
    expect(result.manifest?.requires.openspec).toBe('>=1.7.0 <2.0.0');
  });
});
