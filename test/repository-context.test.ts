import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileOpenSpecChange } from '../src/artifacts.js';
import * as repositoryContext from '../src/repository-context.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('repository context', () => {
  it('discovers committed clean-branch changes relative to explicit and conventional bases', async () => {
    const { root } = await createOpenSpecProject();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
    execFileSync('git', ['init', '-b', 'main'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'relay@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'OpenSpec Relay Test'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: root });
    execFileSync('git', ['checkout', '-b', 'feature'], { cwd: root });
    await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 2;\n');
    execFileSync('git', ['add', 'src/index.ts'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'feature'], { cwd: root });

    const explicit = await repositoryContext.discoverRepositoryChangedFiles(root, 'main');
    expect(explicit).toMatchObject({ files: ['src/index.ts'], source: 'git', comparisonBase: 'main' });
    execFileSync('git', ['branch', '--set-upstream-to=main', 'feature'], { cwd: root });
    const upstream = await repositoryContext.discoverRepositoryChangedFiles(root);
    expect(upstream).toMatchObject({ files: ['src/index.ts'], source: 'git', comparisonBase: '@{upstream}' });
    execFileSync('git', ['branch', '--unset-upstream'], { cwd: root });
    const conventional = await repositoryContext.discoverRepositoryChangedFiles(root);
    expect(conventional).toMatchObject({ files: ['src/index.ts'], source: 'git', comparisonBase: 'main' });
  });

  it('reports an unresolved comparison base instead of an empty impact set', async () => {
    const { root } = await createOpenSpecProject();
    execFileSync('git', ['init', '-b', 'topic'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'relay@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'OpenSpec Relay Test'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'only revision'], { cwd: root });

    const discovered = await repositoryContext.discoverRepositoryChangedFiles(root);
    expect(discovered).toMatchObject({ files: [], source: 'git', unresolved: expect.stringContaining('comparison base') });
  });

  it('collects traceable analogs, modules, conventions, boundaries, consumers, and conflicts', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.mkdir(path.join(root, 'test'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: 'example', exports: './src/index.ts', bin: { example: './src/cli.ts' },
    }));
    await fs.writeFile(path.join(root, 'src', 'widget.ts'), 'export const widget = () => true;\n');
    await fs.writeFile(path.join(root, 'src', 'consumer.ts'), "import { widget } from './widget.js';\nwidget();\n");
    await fs.writeFile(path.join(root, 'src', 'widget.test.ts'), 'it(\'works\', () => {});\n');
    await fs.writeFile(path.join(root, 'test', 'widget.spec.ts'), 'test(\'works\', () => {});\n');
    const api = repositoryContext as Record<string, unknown>;
    const compile = api.compileRepositoryContext as (input: Record<string, unknown>) => Promise<{
      status: string; claims: Array<{ category: string; classification: string; evidence: unknown[] }>;
    }>;
    const context = await compile({
      projectRoot: root,
      changeDir,
      changeName: 'demo',
      compiled: await compileOpenSpecChange({ changeDir }),
      changedFiles: ['src/widget.ts'],
      boundaries: ['src'],
      now: '2026-08-09T12:00:00.000Z',
    });

    expect(context.status).toBe('current');
    expect(context.claims.some((claim) => claim.category === 'implementation_analog')).toBe(true);
    expect(context.claims.some((claim) => claim.category === 'affected_module')).toBe(true);
    expect(context.claims.some((claim) => claim.category === 'test_convention')).toBe(true);
    expect(context.claims.some((claim) => claim.category === 'architecture_boundary')).toBe(true);
    expect(context.claims.some((claim) => claim.category === 'downstream_consumer' &&
      claim.classification === 'inferred')).toBe(true);
    expect(context.claims.some((claim) => claim.category === 'conflicting_pattern')).toBe(true);
    expect(context.claims.every((claim) => claim.evidence.length > 0)).toBe(true);
    const sameInput = await compile({
      projectRoot: root, changeDir, changeName: 'demo', compiled: await compileOpenSpecChange({ changeDir }),
      changedFiles: ['src/widget.ts'], boundaries: ['src'], tier: 'tier2', now: '2026-08-09T12:00:00.000Z',
    });
    expect(sameInput).toMatchObject({ inputRevision: context.inputRevision, status: 'current' });
    const adapted = await compile({
      projectRoot: root, changeDir, changeName: 'demo', compiled: await compileOpenSpecChange({ changeDir }),
      changedFiles: ['src/widget.ts'], boundaries: ['src'], tier: 'tier1', now: '2026-08-09T12:00:00.000Z',
      adapter: { analyze: async ({ contract, deterministicContext }) => {
        expect(contract).toEqual({ readOnly: true, tier: 'tier1' });
        return deterministicContext;
      } },
    });
    expect(adapted).toMatchObject({ inputRevision: context.inputRevision, status: 'current' });
  });

  it('records explicit unknowns, exposes a read-only contract, and invalidates only changed evidence', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const api = repositoryContext as Record<string, unknown>;
    const compile = api.compileRepositoryContext as (input: Record<string, unknown>) => Promise<{
      contextId: string; claims: Array<{ claimId: string; category: string; evidence: Array<{ referenceId: string }> }>;
    }>;
    const context = await compile({
      projectRoot: root,
      changeDir,
      changeName: 'demo',
      compiled: await compileOpenSpecChange({ changeDir }),
      tier: 'tier0',
      now: '2026-08-09T12:00:00.000Z',
    });
    expect(context.claims.some((claim) => claim.category === 'unknown')).toBe(true);

    const contract = api.createRepositoryAnalysisContract as (input: Record<string, unknown>) => {
      readOnly: boolean; tier: string;
    };
    expect(contract({ tier: 'tier1' })).toEqual({ readOnly: true, tier: 'tier1' });
    const invalidate = api.invalidateRepositoryContext as (input: Record<string, unknown>) => unknown;
    const referenced = context.claims.flatMap((claim) => claim.evidence.map((item) => item.referenceId));
    expect(invalidate({ context, changedReferenceIds: [referenced[0]] })).toMatchObject({
      status: 'stale', staleReferenceIds: [referenced[0]],
    });
  });

  it('preserves deterministic unknowns when an analyzer claims unavailable context is current', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const context = await repositoryContext.compileRepositoryContext({
      projectRoot: root,
      changeDir,
      changeName: 'demo',
      compiled: await compileOpenSpecChange({ changeDir }),
      impactUnknown: 'Git comparison data is unavailable.',
      changedFiles: [],
      tier: 'tier1',
      now: '2026-08-09T12:00:00.000Z',
      adapter: { analyze: async ({ deterministicContext }) => ({
        ...deterministicContext, status: 'current', claims: [],
      }) },
    });
    expect(context.status).toBe('unavailable');
    expect(context.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'unknown', summary: 'Git comparison data is unavailable.' }),
    ]));
  });

  it('returns discovered scope gaps to readiness instead of changing OpenSpec artifacts', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'public.ts'), 'export const publicApi = true;\n');
    const compiled = await compileOpenSpecChange({ changeDir });
    const api = repositoryContext as Record<string, unknown>;
    const context = await (api.compileRepositoryContext as (input: Record<string, unknown>) => Promise<unknown>)({
      projectRoot: root, changeDir, changeName: 'demo', compiled, changedFiles: ['src/public.ts'],
      now: '2026-08-09T12:00:00.000Z',
    });
    const scopeGaps = (api.findRepositoryScopeGaps as (input: Record<string, unknown>) => Array<{ kind: string }>)({
      compiled, context,
    });
    expect(scopeGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'repository_scope_gap' }),
    ]));
  });

  it('preserves project-relative evidence identities on POSIX and Windows paths', () => {
    const portable = (repositoryContext as Record<string, unknown>).portableRepositoryPath as
      (root: string, filename: string, pathApi: path.PlatformPath) => string;
    expect(portable('/workspace/project', '/workspace/project/src/index.ts', path.posix)).toBe('src/index.ts');
    expect(portable('C:\\workspace\\project', 'C:\\workspace\\project\\src\\index.ts', path.win32))
      .toBe('src/index.ts');
  });
});
