import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(filename);
    return entry.isFile() && entry.name.endsWith('.ts') ? [filename] : [];
  }));
  return nested.flat();
}

describe('published package boundary', () => {
  it('exports orchestrated operations without exposing canonical execution-record writers', async () => {
    const api = await import('../src/index.js');
    expect(api).toEqual(expect.objectContaining({
      startGsdRunV2: expect.any(Function),
      checkGsdRunV2: expect.any(Function),
      getRunStatusV2: expect.any(Function),
      recordWorkflowResultV2: expect.any(Function),
      gsdAssuranceGate: expect.any(Object),
    }));
    for (const internal of [
      'appendGsdEventV2',
      'createGsdEventV2',
      'writeReplayedProjectionsV2',
      'atomicWriteJson',
      'atomicWriteText',
      'readEventStoreV2',
      'persistExecutionOutcome',
    ]) expect(api).not.toHaveProperty(internal);
  });

  it('imports OpenSpec only through the versioned public extension API', async () => {
    const files = await typescriptFiles(path.resolve('src'));
    const imports: Array<{ file: string; specifier: string }> = [];
    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      for (const match of source.matchAll(/from\s+['"](@fission-ai\/openspec[^'"]*)['"]/g)) {
        imports.push({ file: path.relative(process.cwd(), file), specifier: match[1] });
      }
    }
    expect(imports.length).toBeGreaterThan(0);
    expect(imports).toEqual(imports.map(({ file }) => ({
      file,
      specifier: '@fission-ai/openspec/extensions',
    })));
  });

  it('publishes runtime files without bundling the sibling development checkout', async () => {
    const pkg = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
    expect(pkg.files).toEqual(expect.arrayContaining([
      'dist', 'workflows', 'openspec-extension.json', 'README.md',
    ]));
    expect(pkg.peerDependencies['@fission-ai/openspec'])
      .toBe('>=1.8.0-gsd.1 <2.0.0');
    expect(pkg.dependencies?.['@fission-ai/openspec']).toBeUndefined();
    expect(pkg.devDependencies['@fission-ai/openspec']).toBe('file:../OpenSpec');
  });
});
