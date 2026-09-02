import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RELAY_VERSION } from '../src/version.js';

const root = path.resolve('.');

describe('OpenSpec Relay public identity', () => {
  it('exposes one canonical package, CLI, extension, gate, Pi tool, and repository identity', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'openspec-extension.json'), 'utf8'));
    const pi = await fs.readFile(path.join(root, 'pi', 'extensions', 'openspec-relay.ts'), 'utf8');
    const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');

    expect(pkg).toMatchObject({
      name: 'openspec-relay',
      version: '0.2.0',
      bin: { 'openspec-relay': './dist/cli.js' },
      repository: { url: 'https://github.com/radioflyer28/openspec-relay.git' },
    });
    expect(Object.keys(pkg.bin)).toEqual(['openspec-relay']);
    expect(RELAY_VERSION).toBe(pkg.version);
    expect(pkg.engines).toEqual({ node: '>=22.19.0' });
    expect(manifest.id).toBe('relay');
    expect(manifest.contributes.gates.map((gate: { id: string }) => gate.id)).toContain('relay.assurance');
    expect(pi).toContain("name: 'openspec_relay_workflow'");
    expect(pi).not.toContain("name: 'openspec_gsd_workflow'");
    expect(readme).toContain('https://github.com/radioflyer28/openspec-relay');
  });
});
