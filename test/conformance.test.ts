import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkExtensionConformanceV1 } from '@fission-ai/openspec/extensions';
import { MINIMUM_OPENSPEC_VERSION, OPENSPEC_COMPATIBILITY_RANGE } from '../src/version.js';

describe('OpenSpec extension conformance', () => {
  it.each([MINIMUM_OPENSPEC_VERSION, '1.99.999'])('conforms to OpenSpec %s', async (coreVersion) => {
    const result = await checkExtensionConformanceV1({
      extensionRoot: path.resolve('.'),
      coreVersion,
    });
    expect(result).toMatchObject({ valid: true, diagnostics: [] });
    expect(result.manifest?.id).toBe('gsd');
  });

  it('runs through the public API from the local-link OpenSpec build', async () => {
    const result = await checkExtensionConformanceV1({
      extensionRoot: path.resolve('.'),
      coreVersion: MINIMUM_OPENSPEC_VERSION,
    });
    expect(result.manifest?.requires.openspec).toBe(OPENSPEC_COMPATIBILITY_RANGE);
  });

  it('rejects an official semver-compatible package when the extension API is absent', async () => {
    const result = await checkExtensionConformanceV1({
      extensionRoot: path.resolve('.'),
      coreVersion: '1.11.0',
      extensionApiProvider: {},
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'manifest',
        path: 'apiVersion',
        message: expect.stringContaining('API-bearing OpenSpec distribution'),
      })
    );
  });
});
