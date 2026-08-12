import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ReleaseAssuranceConfigV2Schema,
  type ConfiguredReleaseDriverV2,
  type ReleaseCandidateV2,
  type RunMode,
} from './schemas.js';

export const SUPPORTED_RELEASE_MANIFESTS = {
  node_package: { filename: 'package.json', fields: ['name', 'version', 'exports', 'bin', 'peerDependencies'] },
  openspec_extension: { filename: 'openspec-extension.json', fields: ['id', 'version', 'contributes'] },
  codex_plugin: { filename: '.codex-plugin/plugin.json', fields: ['name', 'version'] },
} as const;

export interface ReleaseCommandV2 {
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  expectedArtifacts?: string[];
  env?: Record<string, string>;
  isolated?: true;
}

type ReleaseCheck = ReleaseCandidateV2['checks'][number];

export interface NodeReleaseVerificationV2 {
  status: ReleaseCandidateV2['status'];
  artifactDigest?: string;
  checks: ReleaseCheck[];
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function candidate(options: Omit<ReleaseCandidateV2, 'candidateId'> & { candidateId?: string }): ReleaseCandidateV2 {
  return {
    ...options,
    candidateId: options.candidateId ?? `release:${digest({ surface: options.surface, applicable: options.applicable,
      activation: options.activationEvidence.map((item) => item.referenceId) }).slice(0, 20)}`,
  };
}

async function manifestReference(projectRoot: string, filename: string) {
  const content = await fs.readFile(filename, 'utf8');
  const relative = path.relative(projectRoot, filename).split(path.sep).join('/');
  return {
    referenceId: `repository:${relative}`,
    kind: 'repository' as const,
    path: relative,
    digest: createHash('sha256').update(content).digest('hex'),
    available: true,
  };
}

function candidateStatus(applicable: boolean): ReleaseCandidateV2['status'] {
  return applicable ? 'pending' : 'not_applicable';
}

export async function detectReleaseApplicability(options: {
  projectRoot: string;
  changedFiles?: string[];
  config?: Partial<{
    enabled: 'auto' | 'always' | 'off';
    disabledReason: string;
    surfaces: string[];
    drivers: string[];
    configuredCommands: ConfiguredReleaseDriverV2[];
    requiredPlatforms: Array<'linux' | 'macos' | 'windows'>;
  }>;
}): Promise<ReleaseCandidateV2[]> {
  const config = ReleaseAssuranceConfigV2Schema.parse(options.config ?? {});
  const changed = new Set((options.changedFiles ?? []).map((file) => file.replaceAll('\\', '/')));
  const candidates: ReleaseCandidateV2[] = [];
  const manifestPath = path.join(options.projectRoot, SUPPORTED_RELEASE_MANIFESTS.node_package.filename);
  try {
    const packageJson = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { name?: string; bin?: unknown };
    const evidence = [await manifestReference(options.projectRoot, manifestPath)];
    const packageChanged = changed.has('package.json') || [...changed].some((file) =>
      /(?:^|\/)(?:src|dist)\/|\.(?:[cm]?[jt]sx?)$/i.test(file));
    const enabled = config.enabled === 'always' || (config.enabled === 'auto' && packageChanged);
    const applicable = config.enabled !== 'off' && Boolean(packageJson.name) && enabled;
    candidates.push(candidate({
      surface: 'node_package', applicable, activationEvidence: evidence, status: candidateStatus(applicable), checks: [],
    }));
    if (packageJson.bin) {
      const cliChanged = changed.has('package.json') || [...changed].some((file) => /(?:cli|bin)/i.test(file));
      const cliApplicable = config.enabled !== 'off' && (config.enabled === 'always' || (config.enabled === 'auto' && cliChanged));
      candidates.push(candidate({
        surface: 'cli', applicable: cliApplicable, activationEvidence: evidence, status: candidateStatus(cliApplicable), checks: [],
      }));
    }
  } catch {
    // No Node package surface was observed.
  }
  for (const [surface, details] of Object.entries(SUPPORTED_RELEASE_MANIFESTS).filter(([surface]) => surface !== 'node_package')) {
    const filename = path.join(options.projectRoot, details.filename);
    try {
      const evidence = [await manifestReference(options.projectRoot, filename)];
      const relative = path.relative(options.projectRoot, filename).split(path.sep).join('/');
      const applicable = config.enabled !== 'off' && (config.enabled === 'always' || changed.has(relative));
      candidates.push(candidate({
        surface: surface === 'openspec_extension' ? 'extension' : 'plugin',
        applicable, activationEvidence: evidence, status: candidateStatus(applicable), checks: [],
      }));
    } catch {
      // The surface is not present in this repository.
    }
  }
  for (const driver of config.drivers) candidates.push(candidate({
    surface: 'configured',
    applicable: config.enabled !== 'off',
    activationEvidence: [{ referenceId: `config:release-driver:${driver}`, kind: 'external', externalId: driver, available: true }],
    status: config.enabled === 'off' ? 'not_applicable' : 'pending', checks: [],
  }));
  for (const driver of config.configuredCommands) candidates.push(candidate({
    candidateId: `release:configured:${driver.id}`,
    surface: 'configured',
    applicable: config.enabled !== 'off',
    activationEvidence: [{
      referenceId: `config:release-command:${driver.id}`,
      kind: 'external',
      externalId: driver.id,
      available: true,
    }],
    status: config.enabled === 'off' ? 'not_applicable' : 'pending',
    checks: [],
  }));
  if (config.enabled === 'off' && candidates.length === 0) candidates.push(candidate({
    surface: 'configured', applicable: false,
    activationEvidence: [{ referenceId: 'config:release-assurance-disabled', kind: 'external', externalId: config.disabledReason!, available: true }],
    status: 'not_applicable', checks: [],
  }));
  return candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}

export function assertReleaseCommandSafe(command: string, args: string[]): void {
  const unsafe = new Set(['publish', 'release', 'deprecate', 'dist-tag', 'unpublish']);
  if (unsafe.has(command) || args.some((arg) => unsafe.has(arg))) {
    throw new Error(`Release assurance will not run external publication command '${[command, ...args].join(' ')}'.`);
  }
}

export async function createNodePackageReleasePlan(options: {
  packageRoot: string;
  mode: RunMode;
}): Promise<{ artifactDirectory: string; sourceDirectory: string; installDirectory: string; commands: ReleaseCommandV2[] }> {
  const artifactDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-artifact-'));
  const sourceDirectory = path.join(artifactDirectory, 'source');
  const installDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-install-'));
  const archive = path.join(artifactDirectory, 'candidate.tgz');
  const commands: ReleaseCommandV2[] = [
    { command: 'npm', args: ['run', 'build', '--if-present'], cwd: sourceDirectory, isolated: true },
    { command: 'npm', args: ['pack', '--json', '--ignore-scripts', '--pack-destination', artifactDirectory], cwd: sourceDirectory, isolated: true },
    { command: 'node', args: ['-e', '/* inspect packed content and package metadata */'], cwd: artifactDirectory },
    { command: 'npm', args: ['install', '--ignore-scripts', archive], cwd: installDirectory },
    { command: 'node', args: ['--input-type=module', '-e', '/* smoke declared exports and CLI entry points */'], cwd: installDirectory },
  ];
  if (options.mode !== 'quick') commands.push(
    { command: 'node', args: ['-e', '/* exercise isolated upgrade path */'], cwd: installDirectory },
    { command: 'node', args: ['-e', '/* exercise isolated rollback path or emit human_needed */'], cwd: installDirectory },
  );
  if (options.mode === 'full') commands.push(
    { command: 'node', args: ['-e', '/* verify configured platform and compatibility matrix */'], cwd: installDirectory },
  );
  commands.forEach((item) => assertReleaseCommandSafe(item.command, item.args));
  return { artifactDirectory, sourceDirectory, installDirectory, commands };
}

export async function runLocalReleaseCommand(options: ReleaseCommandV2): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  assertReleaseCommandSafe(options.command, options.args);
  return new Promise((resolve, reject) => {
    const child = execFile(options.command, options.args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeoutMs ?? 120_000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(new Error(`Release command failed to start: ${error.message}`));
        return;
      }
      resolve({ exitCode: typeof error?.code === 'number' ? error.code : 0, stdout, stderr });
    });
    child.unref?.();
  });
}

function check(
  checkId: string,
  status: ReleaseCheck['status'],
  summary: string,
  evidence: ReleaseCheck['evidence'] = [],
): ReleaseCheck {
  return { checkId, status, summary, evidence };
}

function candidateStatusFromChecks(checks: ReleaseCheck[]): ReleaseCandidateV2['status'] {
  if (checks.some((item) => item.status === 'error')) return 'error';
  if (checks.some((item) => item.status === 'fail')) return 'fail';
  if (checks.some((item) => item.status === 'human_needed')) return 'human_needed';
  if (checks.some((item) => item.status === 'pending')) return 'pending';
  return 'pass';
}

function parseNpmPack(stdout: string): { filename: string; files: string[] } {
  const start = stdout.indexOf('[');
  if (start < 0) throw new Error('npm pack did not return its JSON artifact manifest.');
  const value = JSON.parse(stdout.slice(start)) as Array<{ filename?: string; files?: Array<{ path?: string }> }>;
  const item = value[0];
  if (!item?.filename) throw new Error('npm pack did not report a candidate filename.');
  return { filename: item.filename, files: (item.files ?? []).flatMap((entry) => entry.path ? [entry.path] : []).sort() };
}

function packageDirectory(packageName: string, installDirectory: string): string {
  return path.join(installDirectory, 'node_modules', ...packageName.split('/'));
}

async function exists(filename: string): Promise<boolean> {
  return fs.access(filename).then(() => true).catch(() => false);
}

async function copyPackageSource(packageRoot: string, destination: string): Promise<void> {
  const excluded = new Set(['.git', 'node_modules', '.guardrails']);
  await fs.cp(packageRoot, destination, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(packageRoot, source);
      if (!relative) return true;
      return !relative.split(path.sep).some((segment) => excluded.has(segment));
    },
  });
}

async function importPublicEntries(packageRoot: string, entries: string[]): Promise<void> {
  for (const entry of entries) {
    if (entry.startsWith('./')) await import(pathToFileURL(path.join(packageRoot, entry)).href);
  }
}

/**
 * Pack locally, install the exact artifact into a disposable project, and
 * smoke its declared public entries. Publishing and install lifecycle scripts
 * are deliberately excluded from this driver.
 */
export async function verifyNodePackageRelease(options: {
  packageRoot: string;
  mode: RunMode;
  previousArtifactPath?: string;
  manifestSurfaces?: Array<'extension' | 'plugin'>;
}): Promise<NodeReleaseVerificationV2> {
  const artifactDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-artifact-'));
  const sourceDirectory = path.join(artifactDirectory, 'source');
  let installDirectory: string | undefined;
  const checks: ReleaseCheck[] = [];
  let artifactDigest: string | undefined;
  try {
    const metadata = await inspectNodePackageMetadata(options.packageRoot);
    await copyPackageSource(options.packageRoot, sourceDirectory);
    const build = await runLocalReleaseCommand({
      command: 'npm', args: ['run', 'build', '--if-present'], cwd: sourceDirectory, timeoutMs: 120_000,
    });
    checks.push(check('build', build.exitCode === 0 ? 'pass' : 'fail',
      build.exitCode === 0 ? 'Local build completed.' : `Local build failed: ${build.stderr || build.stdout}`));
    if (build.exitCode !== 0) return { status: 'fail', checks };

    const packed = await runLocalReleaseCommand({
      command: 'npm', args: ['pack', '--json', '--ignore-scripts', '--pack-destination', artifactDirectory],
      cwd: sourceDirectory, timeoutMs: 120_000,
    });
    if (packed.exitCode !== 0) {
      checks.push(check('pack', 'fail', `Local pack failed: ${packed.stderr || packed.stdout}`));
      return { status: 'fail', checks };
    }
    const packedManifest = parseNpmPack(packed.stdout);
    const artifactPath = path.join(artifactDirectory, packedManifest.filename);
    artifactDigest = await hashReleaseArtifact(artifactPath);
    const artifactEvidence = [{
      referenceId: `release-artifact:${artifactDigest}`,
      kind: 'external' as const,
      externalId: `${metadata.packageName}@${metadata.version}`,
      digest: artifactDigest,
      available: true,
    }];
    checks.push(check('pack', 'pass', 'Local package artifact was packed without lifecycle scripts.', artifactEvidence));

    const requiredFiles = ['package.json', ...metadata.exports, ...metadata.bins,
      ...(options.manifestSurfaces?.map((surface) => surface === 'extension'
        ? 'openspec-extension.json' : '.codex-plugin/plugin.json') ?? [])]
      .filter((item) => item.startsWith('./')).map((item) => item.slice(2));
    const missingPackedFiles = requiredFiles.filter((item) => !packedManifest.files.includes(item));
    checks.push(check('content', missingPackedFiles.length ? 'fail' : 'pass', missingPackedFiles.length
      ? `Packed artifact omits declared public files: ${missingPackedFiles.join(', ')}.`
      : 'Packed artifact contains declared public files.', artifactEvidence));
    checks.push(check('metadata', 'pass', `Inspected ${metadata.packageName}@${metadata.version} metadata.`, artifactEvidence));
    if (missingPackedFiles.length) return { status: 'fail', artifactDigest, checks };

    installDirectory = await createCleanInstallProject({ packageName: metadata.packageName, artifactPath });
    const installed = await runLocalReleaseCommand({
      command: 'npm',
      args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', artifactPath],
      cwd: installDirectory,
      timeoutMs: 120_000,
    });
    if (installed.exitCode !== 0) {
      checks.push(check('clean-install', 'fail', `Clean local install failed: ${installed.stderr || installed.stdout}`, artifactEvidence));
      return { status: 'fail', artifactDigest, checks };
    }
    const installedRoot = packageDirectory(metadata.packageName, installDirectory);
    const missingInstalledFiles = (await Promise.all(requiredFiles.map(async (item) => ({
      item,
      present: await exists(path.join(installedRoot, item)),
    })))).filter((item) => !item.present).map((item) => item.item);
    checks.push(check('clean-install', missingInstalledFiles.length ? 'fail' : 'pass', missingInstalledFiles.length
      ? `Installed package omits declared public files: ${missingInstalledFiles.join(', ')}.`
      : 'Packed artifact installed in a clean local project with lifecycle scripts disabled.', artifactEvidence));
    if (missingInstalledFiles.length) return { status: 'fail', artifactDigest, checks };

    for (const surface of options.manifestSurfaces ?? []) {
      const manifest = await verifyManifestSurface({ packageRoot: installedRoot, surface });
      checks.push(manifest);
      if (manifest.status !== 'pass') return { status: 'fail', artifactDigest, checks };
    }

    try {
      await importPublicEntries(installedRoot, metadata.exports);
      for (const bin of metadata.bins) {
        if (!bin.startsWith('./')) continue;
        const smoke = await runLocalReleaseCommand({
          command: process.execPath,
          args: [path.join(installedRoot, bin), '--help'],
          cwd: installDirectory,
        });
        if (smoke.exitCode !== 0) throw new Error(smoke.stderr || smoke.stdout || `CLI '${bin}' exited ${smoke.exitCode}.`);
      }
      checks.push(check('public-smoke', 'pass', 'Installed public exports and CLI entry points completed local smoke checks.', artifactEvidence));
    } catch (error) {
      checks.push(check('public-smoke', 'fail', `Installed public smoke failed: ${(error as Error).message}`, artifactEvidence));
      return { status: 'fail', artifactDigest, checks };
    }

    if (options.mode !== 'quick') {
      if (!options.previousArtifactPath) {
        checks.push(check('upgrade', 'human_needed', 'No previous private artifact was supplied for isolated upgrade verification.', artifactEvidence));
        checks.push(check('rollback', 'human_needed', 'No previous private artifact was supplied for isolated rollback verification.', artifactEvidence));
      } else {
        const previous = await runLocalReleaseCommand({ command: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', options.previousArtifactPath], cwd: installDirectory });
        const upgrade = await runLocalReleaseCommand({ command: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', artifactPath], cwd: installDirectory });
        const rollback = await runLocalReleaseCommand({ command: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', options.previousArtifactPath], cwd: installDirectory });
        checks.push(check('upgrade', previous.exitCode === 0 && upgrade.exitCode === 0 ? 'pass' : 'fail', 'Isolated previous-artifact upgrade was exercised.', artifactEvidence));
        checks.push(check('rollback', rollback.exitCode === 0 ? 'pass' : 'fail', 'Isolated rollback to the supplied private artifact was exercised.', artifactEvidence));
      }
    }
    if (options.mode === 'full') checks.push(check('platform-matrix', 'human_needed',
      'Full-mode cross-platform evidence is collected by hosted CI rather than inferred locally.', artifactEvidence));
    return { status: candidateStatusFromChecks(checks), artifactDigest, checks };
  } catch (error) {
    checks.push(check('release-driver', 'error', `Release driver error: ${(error as Error).message}`));
    return { status: 'error', artifactDigest, checks };
  } finally {
    await Promise.all([
      fs.rm(artifactDirectory, { recursive: true, force: true }),
      ...(installDirectory ? [fs.rm(installDirectory, { recursive: true, force: true })] : []),
    ]);
  }
}

export async function runConfiguredReleaseDriver(options: {
  projectRoot: string;
  driver: ConfiguredReleaseDriverV2;
}): Promise<ReleaseCandidateV2> {
  const command = createConfiguredCommandPlan(options.driver);
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-configured-release-'));
  const evidence = [{ referenceId: `config:release-command:${options.driver.id}`, kind: 'external' as const, externalId: options.driver.id, available: true }];
  try {
    const result = await runLocalReleaseCommand({
      ...command,
      cwd: workspace,
      env: { GUARDRAILS_RELEASE_SOURCE: options.projectRoot },
    });
    const expected = command.expectedArtifacts ?? [];
    const missing = (await Promise.all(expected.map(async (artifact) => ({ artifact, present: await exists(path.join(workspace, artifact)) }))))
      .filter((item) => !item.present);
    const status = result.exitCode === 0 && !missing.length ? 'pass' : 'fail';
    return candidate({
      candidateId: `release:configured:${options.driver.id}`,
      surface: 'configured',
      applicable: true,
      activationEvidence: evidence,
      status,
      checks: [check(`configured:${options.driver.id}`, status,
        status === 'pass' ? `Configured driver '${options.driver.id}' completed in isolated local state.`
          : `Configured driver '${options.driver.id}' failed or omitted: ${missing.map((item) => item.artifact).join(', ') || result.stderr || result.stdout}.`, evidence)],
    });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function verifyManifestSurface(options: {
  packageRoot: string;
  surface: 'extension' | 'plugin';
}): Promise<ReleaseCheck> {
  const filename = options.surface === 'extension' ? 'openspec-extension.json' : '.codex-plugin/plugin.json';
  try {
    const raw = JSON.parse(await fs.readFile(path.join(options.packageRoot, filename), 'utf8')) as {
      id?: string;
      name?: string;
      version?: string;
      contributes?: { workflows?: Array<{ entry?: string }> };
    };
    if (!(raw.id ?? raw.name) || !raw.version) throw new Error('manifest requires an identity and version.');
    const entries = (raw.contributes?.workflows ?? []).flatMap((workflow) => workflow.entry ? [workflow.entry] : []);
    const missingEntries = (await Promise.all(entries.map(async (entry) => ({
      entry,
      present: await exists(path.join(options.packageRoot, entry)),
    })))).filter((item) => !item.present).map((item) => item.entry);
    if (missingEntries.length) throw new Error(`manifest references missing workflow entries: ${missingEntries.join(', ')}`);
    return check(`${options.surface}-manifest`, 'pass', `${options.surface} manifest and declared workflow entries are present.`, [{
      referenceId: `repository:${filename}`, kind: 'repository', path: filename, available: true,
    }]);
  } catch (error) {
    return check(`${options.surface}-manifest`, 'fail', `${options.surface} manifest conformance failed: ${(error as Error).message}`);
  }
}

/** Execute all currently applicable release surfaces without publishing or
 * touching registries. Each returned candidate replaces only its own prior
 * event projection, so the v2 event history remains append-only. */
export async function executeReleaseCandidates(options: {
  packageRoot: string;
  candidates: ReleaseCandidateV2[];
  mode: RunMode;
  config: { configuredCommands: ConfiguredReleaseDriverV2[] };
  previousArtifactPath?: string;
}): Promise<ReleaseCandidateV2[]> {
  const applicablePackageSurfaces = options.candidates.some((candidate) => candidate.applicable &&
    ['node_package', 'cli', 'extension', 'plugin'].includes(candidate.surface));
  const manifestSurfaces = options.candidates.filter((candidate) => candidate.applicable &&
    (candidate.surface === 'extension' || candidate.surface === 'plugin'))
    .map((candidate) => candidate.surface as 'extension' | 'plugin');
  const packageVerification = applicablePackageSurfaces && await exists(path.join(options.packageRoot, 'package.json'))
    ? await verifyNodePackageRelease({
      packageRoot: options.packageRoot,
      mode: options.mode,
      previousArtifactPath: options.previousArtifactPath,
      manifestSurfaces,
    })
    : undefined;
  const configured = new Map(options.config.configuredCommands.map((driver) => [driver.id, driver]));
  const output: ReleaseCandidateV2[] = [];
  for (const item of options.candidates) {
    if (!item.applicable) {
      output.push(item);
      continue;
    }
    if (item.surface === 'configured') {
      const id = item.candidateId.replace(/^release:configured:/, '');
      const driver = configured.get(id);
      output.push(driver ? await runConfiguredReleaseDriver({ projectRoot: options.packageRoot, driver }) : {
        ...item,
        status: 'human_needed',
        checks: [check('configured-driver', 'human_needed', `Configured driver '${id}' has no executable command definition.`)],
      });
      continue;
    }
    if (!packageVerification) {
      output.push({
        ...item,
        status: 'human_needed',
        checks: [check('release-driver', 'human_needed', 'No package artifact driver is available for this release surface.')],
      });
      continue;
    }
    const checks = packageVerification.checks;
    output.push({
      ...item,
      status: candidateStatusFromChecks(checks),
      ...(packageVerification.artifactDigest ? { artifactDigest: packageVerification.artifactDigest } : {}),
      checks,
    });
  }
  return output;
}

export async function hashReleaseArtifact(filename: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(filename)).digest('hex');
}

export async function inspectNodePackageMetadata(packageRoot: string): Promise<{
  packageName: string;
  version: string;
  exports: string[];
  bins: string[];
  peerDependencies: Record<string, string>;
}> {
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
    name?: string; version?: string; exports?: string | Record<string, unknown>;
    bin?: string | Record<string, string>; peerDependencies?: Record<string, string>;
  };
  if (!manifest.name || !manifest.version) throw new Error('Node release driver requires package name and version.');
  const exportPaths = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') return Object.values(value).flatMap(exportPaths);
    return [];
  };
  return {
    packageName: manifest.name,
    version: manifest.version,
    exports: exportPaths(manifest.exports).sort(),
    bins: typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {}).sort(),
    peerDependencies: manifest.peerDependencies ?? {},
  };
}

export async function createCleanInstallProject(options: {
  packageName: string;
  artifactPath: string;
}): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-clean-install-'));
  await fs.writeFile(path.join(directory, 'package.json'), `${JSON.stringify({
    private: true,
    name: 'guardrails-clean-install',
    dependencies: { [options.packageName]: options.artifactPath },
  }, null, 2)}\n`);
  return directory;
}

export async function createExtensionReleasePlan(options: {
  packageRoot: string;
  mode: RunMode;
}): Promise<{ workspace: string; commands: ReleaseCommandV2[] }> {
  const manifest = path.join(options.packageRoot, 'openspec-extension.json');
  const content = await fs.readFile(manifest, 'utf8').catch(() => {
    throw new Error('Packaged extension verification requires openspec-extension.json.');
  });
  JSON.parse(content);
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-extension-install-'));
  const commands: ReleaseCommandV2[] = [
    { command: 'node', args: ['-e', '/* validate extension manifest and generated workflow entries */'], cwd: options.packageRoot, isolated: true },
    { command: 'node', args: ['-e', '/* discover installed extension workflows in clean state */'], cwd: workspace, isolated: true },
    { command: 'node', args: ['-e', '/* smoke public extension entry point */'], cwd: workspace, isolated: true },
  ];
  if (options.mode === 'full') commands.push({
    command: 'node', args: ['-e', '/* exercise configured extension compatibility matrix */'], cwd: workspace, isolated: true,
  });
  commands.forEach((item) => assertReleaseCommandSafe(item.command, item.args));
  return { workspace, commands };
}

export function selectReleaseChecks(mode: RunMode): string[] {
  const checks = ['pack', 'content', 'clean-install', 'public-smoke'];
  if (mode !== 'quick') checks.push('metadata', 'upgrade', 'rollback');
  if (mode === 'full') checks.push('platform-matrix', 'compatibility-matrix');
  return checks;
}

function versionInRange(version: string, range: string): boolean {
  const match = /^(?:>=([0-9]+)\.([0-9]+)\.([0-9]+)\s+)?<([0-9]+)\.0\.0$/.exec(range.trim());
  const current = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match || !current) return true;
  const value = current.slice(1).map(Number);
  const lower = match[1] ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
  const upperMajor = Number(match[4]);
  const atLeast = !lower || value[0] > lower[0] || (value[0] === lower[0] &&
    (value[1] > lower[1] || (value[1] === lower[1] && value[2] >= lower[2])));
  return atLeast && value[0] < upperMajor;
}

export function evaluateReleasePolicy(options: {
  packageManifest: { version?: string };
  publicChange: boolean;
  changesetPresent: boolean;
  installDocumented: boolean;
  testedDependencyVersions?: Record<string, string>;
  compatibilityRanges?: Record<string, string>;
}): { status: 'pass' | 'fail'; checks: Array<{ checkId: string; status: 'pass' | 'fail'; summary: string }> } {
  const checks: Array<{ checkId: string; status: 'pass' | 'fail'; summary: string }> = [];
  if (options.publicChange) checks.push({
    checkId: 'release-notes', status: options.changesetPresent ? 'pass' : 'fail',
    summary: options.changesetPresent ? 'Release tracking is present.' : 'Public change lacks release notes or a changeset.',
  });
  checks.push({
    checkId: 'install-documentation', status: options.installDocumented ? 'pass' : 'fail',
    summary: options.installDocumented ? 'Installation instructions are documented.' : 'Installation instructions are missing.',
  });
  for (const [dependency, tested] of Object.entries(options.testedDependencyVersions ?? {})) {
    const range = options.compatibilityRanges?.[dependency];
    checks.push({
      checkId: `compatibility-range:${dependency}`,
      status: !range || versionInRange(tested, range) ? 'pass' : 'fail',
      summary: !range || versionInRange(tested, range)
        ? `${dependency} tested version is within the declared range.`
        : `${dependency} tested version '${tested}' is outside '${range}'.`,
    });
  }
  return { status: checks.some((check) => check.status === 'fail') ? 'fail' : 'pass', checks };
}

export function evaluateRollbackRequirement(options: {
  applicable: boolean;
  available: boolean;
  destructive?: boolean;
}): { status: 'pass' | 'not_applicable' | 'human_needed' } {
  if (!options.applicable) return { status: 'not_applicable' };
  if (!options.available || options.destructive) return { status: 'human_needed' };
  return { status: 'pass' };
}

export function createConfiguredCommandPlan(options: {
  command: string;
  args: string[];
  expectedArtifacts: string[];
  timeoutMs?: number;
}): ReleaseCommandV2 {
  assertReleaseCommandSafe(options.command, options.args);
  for (const artifact of options.expectedArtifacts) {
    if (/^(?:[A-Za-z]:[\\/]|[\\/])/.test(artifact) || artifact.includes('\\') ||
        !artifact.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')) {
      throw new Error(`Expected release artifact '${artifact}' must be a portable relative path inside the isolated workspace.`);
    }
  }
  return {
    command: options.command,
    args: options.args,
    timeoutMs: options.timeoutMs ?? 120_000,
    expectedArtifacts: options.expectedArtifacts,
    isolated: true,
  };
}
