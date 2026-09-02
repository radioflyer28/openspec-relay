import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(absolute) : [absolute];
  }));
  return nested.flat().filter((filename) => filename.endsWith('.ts'));
}

describe('Pi adapter exclusions', () => {
  it('keeps Pi SDK imports inside the package-owned Pi adapter boundary', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    for (const filename of files) {
      const content = await fs.readFile(filename, 'utf8');
      if (!content.includes('@earendil-works/pi-')) continue;
      expect(path.relative(root, filename)).toMatch(/^src\/pi\//);
    }
  });

  it('does not introduce forbidden runtime or execution machinery', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = Object.keys({
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.devDependencies,
    });
    expect(dependencyNames).not.toContain('pi-subagents');

    const files = [
      ...(await sourceFiles(path.join(root, 'src', 'pi'))),
      path.join(root, 'pi', 'extensions', 'openspec-gsd.ts'),
    ];
    const content = (await Promise.all(files.map((filename) => fs.readFile(filename, 'utf8')))).join('\n');
    expect(content).not.toMatch(/\b(?:createServer|listen)\s*\(/);
    expect(content).not.toMatch(/from\s+['"]node:(?:http|https|net|tls)['"]/);
    expect(content).not.toMatch(/\b(?:worktree|gitAutomation|parallelProjectWrites)\b/i);
    expect(content).not.toMatch(/capabilit(?:y|ies)[-_ ]?(?:cache|file|store)/i);
  });

  it('uses existing workflow implementations instead of defining a second lifecycle', async () => {
    const extension = await fs.readFile(path.join(root, 'pi', 'extensions', 'openspec-gsd.ts'), 'utf8');
    expect(extension).not.toMatch(/class\s+.*(?:Workflow|Queue|Lifecycle)/);
    expect(extension).not.toMatch(/\btaskQueue\b|\blifecycleState\b/);
  });
});
