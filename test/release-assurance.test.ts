import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as release from '../src/release-assurance.js';
import { ConfiguredReleaseCommandV2Schema } from '../src/schemas.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function packageProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd release project '));
  roots.push(root);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'example-package', version: '1.2.3', type: 'module', exports: './index.js', bin: { example: './cli.js' },
    peerDependencies: { '@fission-ai/openspec': '>=1.8.0 <2.0.0' },
  }));
  await fs.writeFile(path.join(root, 'index.js'), 'export const value = true;\n');
  await fs.writeFile(path.join(root, 'cli.js'), '#!/usr/bin/env node\nconsole.log(\'ok\');\n');
  await fs.writeFile(path.join(root, 'README.md'), '# Example\n\nInstall with `npm install example-package`.\n');
  return root;
}

async function temporaryEntries(prefix: string): Promise<Set<string>> {
  return new Set((await fs.readdir(os.tmpdir())).filter((entry) => entry.startsWith(prefix)));
}

const trustedTestRunner: release.HostReleaseRunnerV2 = {
  async run(request) {
    const result = await release.runLocalReleaseCommand(request);
    return {
      exitCode: result.exitCode,
      outputDigest: createHash('sha256').update(`${result.stdout}\0${result.stderr}`).digest('hex'),
    };
  },
};

describe('conditional release assurance', () => {
  it('routes Node packages, CLIs, extensions, configured distributions, and explicit disablement transparently', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const applicability = api.detectReleaseApplicability as (input: Record<string, unknown>) => Promise<Array<{
      surface: string; applicable: boolean; status: string;
    }>>;
    const candidates = await applicability({ projectRoot: root, changedFiles: ['package.json', 'cli.js'], config: { enabled: 'auto' } });
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: 'node_package', applicable: true, status: 'pending' }),
      expect.objectContaining({ surface: 'cli', applicable: true, status: 'pending' }),
    ]));
    expect(await applicability({ projectRoot: root, changedFiles: ['README.md'], config: {
      enabled: 'off', disabledReason: 'Documentation-only change.', surfaces: ['node_package'],
      configuredCommands: [{ id: 'ignored', command: 'node' }],
    } })).toEqual([expect.objectContaining({
      candidateId: 'release:disabled', applicable: false, status: 'not_applicable',
    })]);
    expect(await applicability({ projectRoot: root, changedFiles: ['README.md'], config: {
      enabled: 'auto', surfaces: ['node_package', 'cli', 'plugin'],
    } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: 'node_package', applicable: true }),
      expect.objectContaining({ surface: 'cli', applicable: true }),
      expect.objectContaining({ surface: 'plugin', applicable: true }),
    ]));
  });

  it('fails closed when repository impact cannot be compared', async () => {
    const root = await packageProject();
    const candidates = await release.detectReleaseApplicability({
      projectRoot: root,
      changedFiles: [],
      impactUnknown: 'No trustworthy comparison base is available.',
      config: { enabled: 'auto' },
    });
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: 'node_package', applicable: true, status: 'human_needed', checks: [
        expect.objectContaining({ checkId: 'release-impact', status: 'human_needed' }),
      ] }),
      expect.objectContaining({ surface: 'cli', applicable: true, status: 'human_needed' }),
    ]));
  });

  it('builds pack, inspect, clean-install, and public-smoke plans without publication', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const plan = await (api.createNodePackageReleasePlan as (input: Record<string, unknown>) => Promise<{
      commands: Array<{ command: string; args: string[] }>; artifactDirectory: string;
    }>)({ packageRoot: root, mode: 'guarded' });
    expect(plan.artifactDirectory).not.toContain(root);
    expect(plan.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'npm', args: expect.arrayContaining(['pack']) }),
      expect.objectContaining({ command: 'npm', args: expect.arrayContaining(['install']) }),
    ]));
    expect(plan.commands.flatMap((item) => item.args)).not.toContain('publish');
    const assertSafe = api.assertReleaseCommandSafe as (command: string, args: string[]) => void;
    expect(() => assertSafe('npm', ['publish'])).toThrow(/publish/i);
    expect(() => assertSafe('C:\\tools\\release.exe', [])).toThrow(/publication/i);
  });

  it('selects mode-specific checks and reports missing release policy', async () => {
    const api = release as Record<string, unknown>;
    const checks = api.selectReleaseChecks as (mode: string) => string[];
    expect(checks('quick')).toEqual(expect.arrayContaining(['pack', 'content', 'clean-install', 'public-smoke']));
    expect(checks('guarded')).toEqual(expect.arrayContaining(['metadata']));
    expect(checks('guarded')).not.toEqual(expect.arrayContaining(['upgrade', 'rollback']));
    expect(checks('full')).toEqual(expect.arrayContaining(['platform-matrix']));
    const policy = api.evaluateReleasePolicy as (input: Record<string, unknown>) => { status: string; checks: Array<{ checkId: string; status: string }> };
    expect(policy({ packageManifest: { version: '1.2.3' }, publicChange: true, changesetPresent: false, installDocumented: false,
      testedDependencyVersions: { '@fission-ai/openspec': '2.0.0' }, compatibilityRanges: { '@fission-ai/openspec': '>=1.8.0 <2.0.0' } }))
      .toMatchObject({ status: 'fail', checks: expect.arrayContaining([
        expect.objectContaining({ checkId: 'release-notes', status: 'fail' }),
        expect.objectContaining({ checkId: expect.stringContaining('compatibility-range'), status: 'fail' }),
      ]) });
  });

  it('inspects package metadata, hashes artifacts, and prepares temporary plugin and configured-command workspaces', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const metadata = await (api.inspectNodePackageMetadata as (root: string) => Promise<{ exports: string[]; bins: string[] }>)(root);
    expect(metadata).toMatchObject({ exports: ['./index.js'], bins: ['./cli.js'] });
    const candidate = path.join(root, 'candidate.tgz');
    await fs.writeFile(candidate, 'candidate');
    expect(await (api.hashReleaseArtifact as (filename: string) => Promise<string>)(candidate)).toMatch(/^[a-f0-9]{64}$/);
    await fs.writeFile(path.join(root, 'openspec-extension.json'), JSON.stringify({ id: 'example', version: '1.0.0' }));
    const extension = await (api.createExtensionReleasePlan as (input: Record<string, unknown>) => Promise<{ commands: unknown[] }>)(
      { packageRoot: root, mode: 'quick' },
    );
    expect(extension.commands).toHaveLength(3);
    const configured = api.createConfiguredCommandPlan as (input: Record<string, unknown>) => { expectedArtifacts: string[] };
    expect(configured({ command: 'npm', args: ['--version'], expectedArtifacts: ['artifact.zip'] }))
      .toEqual(expect.objectContaining({ expectedArtifacts: ['artifact.zip'] }));
    expect(() => configured({ command: 'npm', args: ['--version'], expectedArtifacts: ['../outside'] }))
      .toThrow(/temporary workspace/i);
    expect(() => ConfiguredReleaseCommandV2Schema.parse({
      id: 'unsafe-artifact-path', command: 'node', expectedArtifacts: ['/outside'],
    })).toThrow(/temporary release workspace/i);
  });

  it('executes a private build, pack, clean install, and installed public smoke without publication', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const verification = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{
      status: string; artifactDigest?: string; checks: Array<{ checkId: string; status: string }>;
    }>)({ packageRoot: root, mode: 'quick', releaseRunner: trustedTestRunner });
    expect(verification).toMatchObject({ status: 'pass', artifactDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(verification.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'pack', status: 'pass' }),
      expect.objectContaining({ checkId: 'content', status: 'pass' }),
      expect.objectContaining({ checkId: 'clean-install', status: 'pass' }),
      expect.objectContaining({ checkId: 'public-smoke', status: 'pass' }),
    ]));
  }, 30_000);

  it('runs configured distribution commands in a disposable workspace and does not leave output in the repository', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const result = await (api.runConfiguredReleaseCommand as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      projectRoot: root,
      configuredCommand: {
        id: 'artifact', command: 'npm', args: ['--version'],
        expectedArtifacts: [], timeoutMs: 30_000,
      },
      releaseRunner: trustedTestRunner,
    });
    expect(result.status).toBe('pass');
    expect(await fs.readdir(root)).not.toContain('artifact.txt');
  });

  it('rejects shell-wrapped publication before dispatching a configured command', async () => {
    const root = await packageProject();
    let dispatched = false;
    const captureOnlyRunner: release.HostReleaseRunnerV2 = {
      async run() {
        dispatched = true;
        return { exitCode: 0, outputDigest: '0'.repeat(64) };
      },
    };
    await expect(release.runConfiguredReleaseCommand({
      projectRoot: root,
      configuredCommand: {
        id: 'wrapped-publication', command: 'sh', args: ['-c', 'npm publish'],
        expectedArtifacts: [], timeoutMs: 30_000,
      },
      releaseRunner: captureOnlyRunner,
    })).rejects.toThrow(/publication|interpreter|shell/i);
    expect(dispatched).toBe(false);
  });

  it('fails closed for unavailable tools and offline registries without leaving a configured-command workspace', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const command = api.runLocalReleaseCommand as (input: Record<string, unknown>) => Promise<unknown>;
    await expect(command({ command: 'gsd-tool-that-does-not-exist', args: [] }))
      .rejects.toThrow(/failed to start/i);

    const before = await temporaryEntries('openspec-gsd-configured-release-');
    const result = await (api.runConfiguredReleaseCommand as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      projectRoot: root,
      configuredCommand: {
        id: 'offline-registry', command: 'npm',
        args: ['--offline', 'view', 'gsd-package-not-in-local-cache-4e6d1'],
        expectedArtifacts: [], timeoutMs: 15_000,
      },
      releaseRunner: trustedTestRunner,
    });
    expect(result.status).toBe('fail');
    const after = await temporaryEntries('openspec-gsd-configured-release-');
    expect([...after].filter((entry) => !before.has(entry))).toEqual([]);
  }, 30_000);

  it('uses an allowlisted environment and redacts bounded output', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const run = api.runLocalReleaseCommand as (input: Record<string, unknown>) => Promise<{ stdout: string }>;
    await expect(run({ command: process.execPath, args: ['-e', 'console.log("ok")'], cwd: root,
      allowedRoot: root, env: { RELEASE_TOKEN: 'secret' } })).rejects.toThrow(/credential/i);
    const output = await run({ command: process.execPath,
      args: ['-e', 'console.log("token=supersecret " + "x".repeat(70000))'], cwd: root,
      allowedRoot: root });
    expect(output.stdout).not.toContain('supersecret');
    expect(output.stdout).toContain('<redacted>');
    expect(output.stdout.length).toBeLessThan(66_000);
  });

  it('passes only an allowlisted environment to the host runner and persists no candidate output', async () => {
    const root = await packageProject();
    process.env.GSD_UNRELATED_SECRET = 'arbitrary-secret-bearing-output';
    let observedEnvironment: Record<string, string> | undefined;
    const runner: release.HostReleaseRunnerV2 = {
      ...trustedTestRunner,
      async run(request) {
        observedEnvironment = request.env;
        return trustedTestRunner.run(request);
      },
    };
    try {
      const verification = await release.verifyNodePackageRelease({
        packageRoot: root, mode: 'quick', releaseRunner: runner,
      });
      expect(verification.status).toBe('pass');
      expect(observedEnvironment).not.toHaveProperty('GSD_UNRELATED_SECRET');
      expect(JSON.stringify(verification)).not.toContain('arbitrary-secret-bearing-output');
    } finally {
      delete process.env.GSD_UNRELATED_SECRET;
    }
  }, 30_000);

  it('honors configured surfaces and required platform obligations', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const candidates = await (api.detectReleaseApplicability as (input: Record<string, unknown>) => Promise<Array<{
      surface: string; applicable: boolean;
    }>>)({ projectRoot: root, changedFiles: ['README.md'], config: { enabled: 'auto', surfaces: ['plugin'] } });
    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({ surface: 'plugin', applicable: true })]));
    const required = process.platform === 'darwin' ? 'windows' : 'macos';
    const executed = await (api.executeReleaseCandidates as (input: Record<string, unknown>) => Promise<Array<{
      status: string; checks: Array<{ checkId: string; status: string }>;
    }>>)({ packageRoot: root, mode: 'quick', config: { configuredCommands: [], requiredPlatforms: [required] },
      candidates: [{ candidateId: 'node', surface: 'node_package', applicable: true,
        activationEvidence: [], status: 'pending', checks: [] }] });
    expect(executed[0]).toMatchObject({ status: 'human_needed', checks: expect.arrayContaining([
      expect.objectContaining({ checkId: `platform:${required}`, status: 'human_needed' }),
    ]) });
  });

  it('preserves unresolved impact evidence when artifact verification succeeds', async () => {
    const root = await packageProject();
    const [detected] = await release.detectReleaseApplicability({
      projectRoot: root,
      changedFiles: [],
      impactUnknown: 'No repository comparison base is available.',
      config: { enabled: 'auto' },
    });
    expect(detected).toMatchObject({ status: 'human_needed', checks: [
      expect.objectContaining({ checkId: 'release-impact', status: 'human_needed' }),
    ] });
    const [executed] = await release.executeReleaseCandidates({
      packageRoot: root,
      mode: 'quick',
      config: { configuredCommands: [] },
      candidates: [detected],
      releaseRunner: trustedTestRunner,
    });
    expect(executed).toMatchObject({
      status: 'human_needed',
      checks: expect.arrayContaining([
        expect.objectContaining({ checkId: 'release-impact', status: 'human_needed' }),
        expect.objectContaining({ checkId: 'pack', status: 'pass' }),
      ]),
    });
  });

  it.each([
    ['^1.8.0', '1.9.2', 'pass'],
    ['^1.8.0', '2.0.0', 'fail'],
    ['~1.8.0', '1.8.9', 'pass'],
    ['~1.8.0', '1.9.0', 'fail'],
    ['>=1.8.0 <2.0.0', '1.8.0', 'pass'],
    ['>=1.8.0 <2.0.0', '2.0.0', 'fail'],
    ['^1.8.0', '1.9.0-beta.1', 'fail'],
    ['not-a-range', '1.9.0', 'fail'],
  ])('evaluates compatibility range %s against %s', (range, tested, expected) => {
    expect(release.evaluateReleasePolicy({
      packageManifest: { version: '1.0.0' },
      publicChange: false,
      changesetPresent: false,
      installDocumented: true,
      testedDependencyVersions: { dependency: tested },
      compatibilityRanges: { dependency: range },
    }).checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'compatibility-range:dependency', status: expected }),
    ]));
  });

  it('isolates build output, disables package lifecycle scripts, and removes temporary package workspaces after a partial failure', async () => {
    const root = await packageProject();
    const sentinel = path.join(root, 'package-script-ran');
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    manifest.scripts = {
      build: `${process.execPath} -e \"require('node:fs').writeFileSync('build-output', 'build')\"`,
      preinstall: `${process.execPath} -e \"require('node:fs').writeFileSync('${sentinel}', 'preinstall')\"`,
      prepack: `${process.execPath} -e \"require('node:fs').writeFileSync('${sentinel}', 'prepack')\"`,
      publish: `${process.execPath} -e \"require('node:fs').writeFileSync('${sentinel}', 'publish')\"`,
    };
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
    const api = release as Record<string, unknown>;
    const verification = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      packageRoot: root, mode: 'quick',
    });
    expect(verification.status).toBe('human_needed');
    await expect(fs.access(sentinel)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(root, 'build-output'))).rejects.toMatchObject({ code: 'ENOENT' });

    const authorized = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      packageRoot: root, mode: 'quick',
      buildCommand: { id: 'authorized-build', command: process.execPath,
        args: ['-e', "require('node:fs').writeFileSync('build-output', 'build')"], expectedArtifacts: [] },
      releaseRunner: trustedTestRunner,
    });
    expect(authorized.status).toBe('pass');

    manifest.scripts = { build: `${process.execPath} -e \"process.exit(1)\"` };
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
    const before = await temporaryEntries('openspec-gsd-artifact-');
    const failed = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      packageRoot: root, mode: 'quick',
      buildCommand: { id: 'failing-build', command: process.execPath,
        args: ['-e', 'process.exit(1)'], expectedArtifacts: [] },
      releaseRunner: trustedTestRunner,
    });
    expect(failed.status).toBe('fail');
    const after = await temporaryEntries('openspec-gsd-artifact-');
    expect([...after].filter((entry) => !before.has(entry))).toEqual([]);
  }, 30_000);

  it('verifies an extension manifest and generated workflow entries from the clean installed artifact', async () => {
    const root = await packageProject();
    await fs.mkdir(path.join(root, 'workflows'));
    await fs.writeFile(path.join(root, 'workflows', 'run.md'), 'Run the extension.\n');
    await fs.writeFile(path.join(root, 'openspec-extension.json'), JSON.stringify({
      apiVersion: 'openspec.dev/extensions/v1', id: 'example-extension', version: '1.2.3',
      requires: { openspec: '>=1.8.0-gsd.1 <2.0.0',
        hostCapabilities: { required: ['structuredResults'], optional: [] } },
      contributes: { workflows: [{ id: 'run', name: 'Run', description: 'Run.', entry: 'workflows/run.md',
        artifactRequirements: ['tasks'], gateDependencies: [], requiredHostCapabilities: ['structuredResults'] }], gates: [] },
    }));
    const api = release as Record<string, unknown>;
    const previousCoreRoot = process.env.OPENSPEC_CORE_ROOT;
    process.env.OPENSPEC_CORE_ROOT = path.resolve('..', 'OpenSpec');
    const candidates = await (api.executeReleaseCandidates as (input: Record<string, unknown>) => Promise<Array<{
      surface: string; status: string; checks: Array<{ checkId: string; status: string }>;
    }>>)({
      packageRoot: root,
      mode: 'quick',
      config: { configuredCommands: [] },
      releaseRunner: trustedTestRunner,
      candidates: [{
        candidateId: 'extension', surface: 'extension', applicable: true,
        activationEvidence: [], status: 'pending', checks: [],
      }],
    });
    if (previousCoreRoot) process.env.OPENSPEC_CORE_ROOT = previousCoreRoot;
    else delete process.env.OPENSPEC_CORE_ROOT;
    expect(candidates).toEqual([expect.objectContaining({
      surface: 'extension', status: 'pass',
      checks: expect.arrayContaining([
        expect.objectContaining({ checkId: 'extension-manifest', status: 'pass' }),
        expect.objectContaining({ checkId: 'extension-host-discovery', status: 'pass' }),
      ]),
    })]);
  }, 30_000);

});
