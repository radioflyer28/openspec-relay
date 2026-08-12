import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as release from '../src/release-assurance.js';
import { ConfiguredReleaseDriverV2Schema } from '../src/schemas.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function packageProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guardrails release project '));
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

const trustedTestRunner: release.ConstrainedReleaseRunnerV2 = {
  capabilities: {
    filesystemIsolation: 'enforced', networkIsolation: 'enforced',
    sourceWorkspaceHidden: true, opaqueOutput: true,
  },
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
    expect(await applicability({ projectRoot: root, changedFiles: ['README.md'], config: { enabled: 'off', disabledReason: 'Documentation-only change.' } }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ applicable: false, status: 'not_applicable' })]));
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
  });

  it('selects mode-specific checks, reports missing release policy, and escalates unavailable rollback safely', async () => {
    const api = release as Record<string, unknown>;
    const checks = api.selectReleaseChecks as (mode: string) => string[];
    expect(checks('quick')).toEqual(expect.arrayContaining(['pack', 'content', 'clean-install', 'public-smoke']));
    expect(checks('guarded')).toEqual(expect.arrayContaining(['metadata', 'upgrade', 'rollback']));
    expect(checks('full')).toEqual(expect.arrayContaining(['platform-matrix']));
    const policy = api.evaluateReleasePolicy as (input: Record<string, unknown>) => { status: string; checks: Array<{ checkId: string; status: string }> };
    expect(policy({ packageManifest: { version: '1.2.3' }, publicChange: true, changesetPresent: false, installDocumented: false,
      testedDependencyVersions: { '@fission-ai/openspec': '2.0.0' }, compatibilityRanges: { '@fission-ai/openspec': '>=1.8.0 <2.0.0' } }))
      .toMatchObject({ status: 'fail', checks: expect.arrayContaining([
        expect.objectContaining({ checkId: 'release-notes', status: 'fail' }),
        expect.objectContaining({ checkId: expect.stringContaining('compatibility-range'), status: 'fail' }),
      ]) });
    const rollback = api.evaluateRollbackRequirement as (input: Record<string, unknown>) => { status: string };
    expect(rollback({ applicable: true, available: false, destructive: true })).toEqual({ status: 'human_needed' });
  });

  it('inspects package metadata, hashes artifacts, and prepares isolated plugin and configured-driver workspaces', async () => {
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
    const configured = api.createConfiguredCommandPlan as (input: Record<string, unknown>) => { expectedArtifacts: string[]; isolated: boolean };
    expect(configured({ command: 'node', args: ['--version'], expectedArtifacts: ['artifact.zip'] }))
      .toEqual(expect.objectContaining({ expectedArtifacts: ['artifact.zip'], isolated: true }));
    expect(() => configured({ command: 'node', args: ['--version'], expectedArtifacts: ['../outside'] }))
      .toThrow(/isolated workspace/i);
    expect(() => ConfiguredReleaseDriverV2Schema.parse({
      id: 'unsafe-artifact-path', command: 'node', expectedArtifacts: ['/outside'],
    })).toThrow(/isolated release workspace/i);
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
    const result = await (api.runConfiguredReleaseDriver as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      projectRoot: root,
      driver: {
        id: 'artifact', command: process.execPath,
        args: ['-e', "require('node:fs').writeFileSync('artifact.txt', process.cwd())"],
        expectedArtifacts: ['artifact.txt'], timeoutMs: 30_000,
      },
      releaseRunner: trustedTestRunner,
    });
    expect(result.status).toBe('pass');
    await expect(fs.access(path.join(root, 'artifact.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed for unavailable tools and offline registries without leaving a configured-driver workspace', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const command = api.runLocalReleaseCommand as (input: Record<string, unknown>) => Promise<unknown>;
    await expect(command({ command: 'guardrails-tool-that-does-not-exist', args: [] }))
      .rejects.toThrow(/failed to start/i);

    const before = await temporaryEntries('openspec-guardrails-configured-release-');
    const result = await (api.runConfiguredReleaseDriver as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      projectRoot: root,
      driver: {
        id: 'offline-registry', command: 'npm',
        args: ['--offline', 'view', 'guardrails-package-not-in-local-cache-4e6d1'],
        expectedArtifacts: [], timeoutMs: 15_000,
      },
      releaseRunner: trustedTestRunner,
    });
    expect(result.status).toBe('fail');
    const after = await temporaryEntries('openspec-guardrails-configured-release-');
    expect([...after].filter((entry) => !before.has(entry))).toEqual([]);
  }, 30_000);

  it('uses an allowlisted environment, redacts bounded output, and escalates unavailable strong isolation', async () => {
    const root = await packageProject();
    const api = release as Record<string, unknown>;
    const run = api.runLocalReleaseCommand as (input: Record<string, unknown>) => Promise<{ stdout: string }>;
    await expect(run({ command: process.execPath, args: ['-e', 'console.log("ok")'], cwd: root,
      isolated: true, allowedRoot: root, env: { RELEASE_TOKEN: 'secret' } })).rejects.toThrow(/credential/i);
    const output = await run({ command: process.execPath,
      args: ['-e', 'console.log("token=supersecret " + "x".repeat(70000))'], cwd: root,
      isolated: true, allowedRoot: root });
    expect(output.stdout).not.toContain('supersecret');
    expect(output.stdout).toContain('<redacted>');
    expect(output.stdout.length).toBeLessThan(66_000);
    const verification = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{
      status: string; checks: Array<{ checkId: string; status: string }>;
    }>)({ packageRoot: root, mode: 'quick', requireNetworkIsolation: true });
    expect(verification).toMatchObject({ status: 'human_needed', checks: [
      expect.objectContaining({ checkId: 'runner-isolation', status: 'human_needed' }),
    ] });
  });

  it('does not execute candidate code when enforceable filesystem and network isolation are unavailable', async () => {
    const root = await packageProject();
    const secretRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'guardrails-host-secret-'));
    roots.push(secretRoot);
    const secretValue = 'arbitrary-unlabelled-secret-value';
    const secretFile = path.join(secretRoot, 'host-secret');
    const sourceSentinel = path.join(root, 'candidate-mutated-source');
    await fs.writeFile(secretFile, secretValue);
    let localhostReached = false;
    const server = createServer((socket) => {
      localhostReached = true;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP port.');
    const hostileScript = [
      `const fs = require('node:fs')`,
      `const secret = fs.readFileSync(${JSON.stringify(secretFile)}, 'utf8')`,
      `fs.writeFileSync(${JSON.stringify(sourceSentinel)}, secret)`,
      `console.error(secret)`,
      `require('node:net').connect(${address.port}, '127.0.0.1')`,
      `fetch('https://example.com').catch(() => {})`,
    ].join(';');
    const verification = await release.verifyNodePackageRelease({
      packageRoot: root,
      mode: 'quick',
      buildCommand: {
        id: 'hostile-build', command: process.execPath, args: ['-e', hostileScript], expectedArtifacts: [],
      },
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(verification).toMatchObject({
      status: 'human_needed',
      checks: [expect.objectContaining({ checkId: 'runner-isolation', status: 'human_needed' })],
    });
    await expect(fs.access(sourceSentinel)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(localhostReached).toBe(false);
    expect(JSON.stringify(verification)).not.toContain(secretValue);
  });

  it('passes only an allowlisted environment to the constrained runner and persists no candidate output', async () => {
    const root = await packageProject();
    process.env.GUARDRAILS_UNRELATED_SECRET = 'arbitrary-secret-bearing-output';
    let observedEnvironment: Record<string, string> | undefined;
    const runner: release.ConstrainedReleaseRunnerV2 = {
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
      expect(observedEnvironment).not.toHaveProperty('GUARDRAILS_UNRELATED_SECRET');
      expect(JSON.stringify(verification)).not.toContain('arbitrary-secret-bearing-output');
    } finally {
      delete process.env.GUARDRAILS_UNRELATED_SECRET;
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
    const before = await temporaryEntries('openspec-guardrails-artifact-');
    const failed = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{ status: string }>)({
      packageRoot: root, mode: 'quick',
      buildCommand: { id: 'failing-build', command: process.execPath,
        args: ['-e', 'process.exit(1)'], expectedArtifacts: [] },
      releaseRunner: trustedTestRunner,
    });
    expect(failed.status).toBe('fail');
    const after = await temporaryEntries('openspec-guardrails-artifact-');
    expect([...after].filter((entry) => !before.has(entry))).toEqual([]);
  }, 30_000);

  it('verifies an extension manifest and generated workflow entries from the clean installed artifact', async () => {
    const root = await packageProject();
    await fs.mkdir(path.join(root, 'workflows'));
    await fs.writeFile(path.join(root, 'workflows', 'run.md'), 'Run the extension.\n');
    await fs.writeFile(path.join(root, 'openspec-extension.json'), JSON.stringify({
      apiVersion: 'openspec.dev/extensions/v1', id: 'example-extension', version: '1.2.3',
      requires: { openspec: '>=1.8.0-guardrails.1 <2.0.0',
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

  it('uses a supplied prior private artifact for isolated upgrade and rollback evidence', async () => {
    const root = await packageProject();
    const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], {
      cwd: root, encoding: 'utf8',
    })) as Array<{ filename: string }>;
    const previousArtifactPath = path.join(root, packed[0].filename);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { version: string };
    manifest.version = '1.2.4';
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(root, 'upgrade-state.json'), JSON.stringify({ preserved: true, owner: 'example-package' }));
    const stateContracts = [{
      id: 'example-consumer-state',
      seedFile: 'upgrade-state.json',
      stateFile: 'consumer/state.json',
      rollback: 'reversible' as const,
      verifyCommand: {
        id: 'verify-example-state',
        command: process.execPath,
        args: ['-e', [
          'const fs = require("node:fs")',
          'const path = require("node:path")',
          'const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))',
          'const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", ...process.argv[2].split("/"), "package.json"), "utf8"))',
          'if (!state.preserved || state.owner !== pkg.name) process.exit(1)',
        ].join(';'), '{state}', '{package}'],
        expectedArtifacts: [],
      },
    }];
    const api = release as Record<string, unknown>;
    const verification = await (api.verifyNodePackageRelease as (input: Record<string, unknown>) => Promise<{
      status: string; checks: Array<{ checkId: string; status: string }>;
    }>)({ packageRoot: root, mode: 'guarded', previousArtifactPath, releaseRunner: trustedTestRunner, stateContracts });
    expect(verification).toMatchObject({ status: 'human_needed', checks: expect.arrayContaining([
      expect.objectContaining({ checkId: 'upgrade', status: 'pass' }),
      expect.objectContaining({ checkId: 'rollback', status: 'pass' }),
      expect.objectContaining({ checkId: 'compatibility-evidence:@fission-ai/openspec', status: 'human_needed' }),
    ]) });
  }, 30_000);

  it('refuses synthetic upgrade claims and escalates declared irreversible rollback', async () => {
    const root = await packageProject();
    const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], {
      cwd: root, encoding: 'utf8',
    })) as Array<{ filename: string }>;
    const previousArtifactPath = path.join(root, packed[0].filename);
    const withoutContract = await release.verifyNodePackageRelease({
      packageRoot: root, mode: 'guarded', previousArtifactPath, releaseRunner: trustedTestRunner,
    });
    expect(withoutContract.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'upgrade', status: 'human_needed',
        summary: expect.stringMatching(/state contract/i) }),
    ]));

    await fs.writeFile(path.join(root, 'upgrade-state.json'), JSON.stringify({ preserved: true, owner: 'example-package' }));
    const irreversible = await release.verifyNodePackageRelease({
      packageRoot: root, mode: 'guarded', previousArtifactPath, releaseRunner: trustedTestRunner,
      stateContracts: [{
        id: 'irreversible-state', seedFile: 'upgrade-state.json', stateFile: 'consumer/state.json', rollback: 'irreversible',
        verifyCommand: {
          id: 'verify-state', command: process.execPath,
          args: ['-e', 'require("node:fs").accessSync(process.argv[1]); require("node:fs").accessSync(require("node:path").join(process.cwd(), "node_modules", ...process.argv[2].split("/"), "package.json"))', '{state}', '{package}'],
          expectedArtifacts: [],
        },
      }],
    });
    expect(irreversible.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'upgrade', status: 'pass' }),
      expect.objectContaining({ checkId: 'rollback', status: 'human_needed',
        summary: expect.stringMatching(/irreversible/i) }),
    ]));
  }, 30_000);
});
