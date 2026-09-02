import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  keywords?: string[];
  pi?: { extensions?: string[]; prompts?: string[]; skills?: string[] };
}

interface ExtensionManifest {
  version: string;
  contributes: {
    workflows: Array<{ id: string; description: string; entry: string }>;
  };
}

describe('Pi package resources', () => {
  it('declares the generated prompts and skills as Pi package resources', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as PackageManifest;
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.pi).toEqual({
      extensions: ['./pi/extensions/openspec-gsd.ts'],
      skills: ['./pi/skills'],
      prompts: ['./pi/prompts'],
    });
  });

  it('keeps Pi prompts and skills synchronized with contributed workflows', async () => {
    const root = process.cwd();
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, 'openspec-extension.json'), 'utf8'),
    ) as ExtensionManifest;

    for (const workflow of manifest.contributes.workflows) {
      const body = (await fs.readFile(path.join(root, workflow.entry), 'utf8')).trimEnd();
      const prompt = await fs.readFile(path.join(root, 'pi', 'prompts', `opsx-${workflow.id}.md`), 'utf8');
      const skill = await fs.readFile(
        path.join(root, 'pi', 'skills', `openspec-${workflow.id}`, 'SKILL.md'),
        'utf8',
      );

      expect(prompt).toContain(`description: ${JSON.stringify(workflow.description)}`);
      expect(prompt).toContain(`\n\n${body}\n`);
      expect(skill).toContain(`name: openspec-${workflow.id}`);
      expect(skill).toContain(`version: ${JSON.stringify(manifest.version)}`);
      expect(skill).toContain(`\n\n${body}\n`);
    }
  });

  it('bundles the single typed Pi workflow adapter and CLI fallback shim', async () => {
    const root = process.cwd();
    const runtimeExtension = await fs.readFile(
      path.join(root, 'pi', 'extensions', 'openspec-gsd.ts'),
      'utf8',
    );
    const executable = await fs.readFile(path.join(root, 'pi', 'bin', 'openspec-gsd'), 'utf8');
    expect(runtimeExtension).toContain("new URL('../bin/', import.meta.url)");
    expect(runtimeExtension).toContain("name: 'openspec_gsd_workflow'");
    expect(runtimeExtension).toContain('pi.registerTool(workflowTool)');
    expect(runtimeExtension).toContain("../../dist/pi/workflow.js");
    expect(executable).toContain("import('../../dist/cli.js')");
  });
});
