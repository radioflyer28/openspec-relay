import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  allowedRoot?: string;
}

const RELEASE_OUTPUT_LIMIT = 64 * 1024;
const SAFE_ENV_KEYS = ['PATH', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'TMPDIR', 'TEMP', 'TMP'] as const;

function constrainedEnvironment(cwd: string, additions: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    CI: 'true', NO_COLOR: '1', HOME: cwd, USERPROFILE: cwd,
    npm_config_cache: path.join(cwd, '.npm-cache'), npm_config_update_notifier: 'false',
  };
  for (const key of SAFE_ENV_KEYS) if (process.env[key]) environment[key] = process.env[key];
  for (const [key, value] of Object.entries(additions)) {
    if (/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|PRIVATE_KEY)/i.test(key)) {
      throw new Error(`Release runner refuses credential-bearing environment variable '${key}'.`);
    }
    environment[key] = value;
  }
  return environment;
}

function redactAndBound(value: string, cwd: string): string {
  const redacted = value
    .replaceAll(cwd, '<release-workspace>')
    .replace(/((?:token|secret|password|credential|authorization|api[_-]?key)\s*[=:]\s*)\S+/gi, '$1<redacted>');
  return redacted.length <= RELEASE_OUTPUT_LIMIT ? redacted : `${redacted.slice(0, RELEASE_OUTPUT_LIMIT)}\n<output-truncated>`;
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
    previousArtifactPath: string;
    buildCommand: ConfiguredReleaseDriverV2;
    requireFilesystemIsolation: boolean;
    requireNetworkIsolation: boolean;
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
  const configuredSurfaceNames = new Set(config.surfaces.map((item) => item.toLowerCase().replaceAll('-', '_')));
  for (const surface of configuredSurfaceNames) {
    const normalized = surface === 'openspec_extension' ? 'extension' : surface === 'codex_plugin' ? 'plugin' : surface;
    if (!['node_package', 'cli', 'extension', 'plugin', 'configured'].includes(normalized)) continue;
    if (candidates.some((item) => item.surface === normalized)) continue;
    candidates.push(candidate({
      candidateId: `release:configured-surface:${normalized}`,
      surface: normalized as ReleaseCandidateV2['surface'], applicable: config.enabled !== 'off',
      activationEvidence: [{ referenceId: `config:release-surface:${surface}`, kind: 'external',
        externalId: surface, available: true }],
      status: config.enabled === 'off' ? 'not_applicable' : 'pending', checks: [],
    }));
  }
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
  if (options.isolated && !options.cwd) throw new Error('An isolated release command requires an explicit workspace.');
  if (options.allowedRoot && options.cwd) {
    const relative = path.relative(path.resolve(options.allowedRoot), path.resolve(options.cwd));
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Release command working directory escapes its allowed workspace.');
    }
  }
  return new Promise((resolve, reject) => {
    const child = execFile(options.command, options.args, {
      cwd: options.cwd,
      env: constrainedEnvironment(options.cwd ?? process.cwd(), options.env),
      timeout: options.timeoutMs ?? 120_000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error && typeof error.code !== 'number') {
        reject(new Error(`Release command failed to start: ${error.message}`));
        return;
      }
      resolve({ exitCode: typeof error?.code === 'number' ? error.code : 0,
        stdout: redactAndBound(stdout, options.cwd ?? process.cwd()),
        stderr: redactAndBound(stderr, options.cwd ?? process.cwd()) });
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

async function productionReleasePolicyChecks(packageRoot: string, metadata: Awaited<ReturnType<typeof inspectNodePackageMetadata>>): Promise<ReleaseCheck[]> {
  const changesetPolicy = await exists(path.join(packageRoot, '.changeset', 'config.json'));
  const changesetEntries = await fs.readdir(path.join(packageRoot, '.changeset')).catch(() => []);
  const releaseTracking = !changesetPolicy || changesetEntries.some((item) => item.endsWith('.md') && item !== 'README.md') ||
    await exists(path.join(packageRoot, 'CHANGELOG.md'));
  const readme = await fs.readFile(path.join(packageRoot, 'README.md'), 'utf8').catch(() => '');
  const installDocumented = new RegExp(`(?:npm|pnpm|yarn|bun)\\s+(?:install|add)\\s+${metadata.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    .test(readme);
  const testedDependencyVersions: Record<string, string> = {};
  for (const dependency of Object.keys(metadata.peerDependencies)) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'node_modules', ...dependency.split('/'), 'package.json'), 'utf8')) as { version?: string };
      if (manifest.version) testedDependencyVersions[dependency] = manifest.version;
    } catch {
      // An unavailable peer test version remains an explicit compatibility obligation below.
    }
  }
  const policy = evaluateReleasePolicy({ packageManifest: { version: metadata.version }, publicChange: true,
    changesetPresent: releaseTracking, installDocumented, testedDependencyVersions,
    compatibilityRanges: metadata.peerDependencies });
  const checks = policy.checks.map((item) => check(item.checkId, item.status, item.summary));
  for (const dependency of Object.keys(metadata.peerDependencies).filter((item) => !testedDependencyVersions[item])) {
    checks.push(check(`compatibility-evidence:${dependency}`, 'human_needed',
      `No installed ${dependency} version was available for compatibility verification.`));
  }
  return checks;
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

async function smokePublicEntries(packageRoot: string, entries: string[], installDirectory: string): Promise<void> {
  const publicEntries = entries.filter((entry) => entry.startsWith('./')).map((entry) => path.join(packageRoot, entry));
  if (!publicEntries.length) return;
  const script = 'Promise.all(process.argv.slice(1).map((entry) => import(new URL(`file://${entry}`).href)))' +
    '.catch((error) => { console.error(error.message); process.exit(1); });';
  const smoke = await runLocalReleaseCommand({ command: process.execPath, args: ['--input-type=module', '-e', script,
    ...publicEntries], cwd: installDirectory, allowedRoot: installDirectory, isolated: true });
  if (smoke.exitCode !== 0) throw new Error(smoke.stderr || smoke.stdout || 'Public export smoke failed.');
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
  buildCommand?: ConfiguredReleaseDriverV2;
  requireFilesystemIsolation?: boolean;
  requireNetworkIsolation?: boolean;
}): Promise<NodeReleaseVerificationV2> {
  const artifactDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-guardrails-artifact-'));
  const sourceDirectory = path.join(artifactDirectory, 'source');
  let installDirectory: string | undefined;
  const checks: ReleaseCheck[] = [];
  let artifactDigest: string | undefined;
  try {
    const metadata = await inspectNodePackageMetadata(options.packageRoot);
    await copyPackageSource(options.packageRoot, sourceDirectory);
    if (options.requireFilesystemIsolation || options.requireNetworkIsolation) {
      checks.push(check('runner-isolation', 'human_needed',
        'The local host cannot prove the configured filesystem or network isolation requirement.'));
      return { status: 'human_needed', checks };
    }
    if (metadata.buildScript && !options.buildCommand) {
      checks.push(check('build-authorization', 'human_needed',
        'The package declares a build lifecycle script; configure an explicit authorized build command before candidate code executes.'));
      return { status: 'human_needed', checks };
    }
    if (options.buildCommand) {
      const buildPlan = createConfiguredCommandPlan(options.buildCommand);
      const build = await runLocalReleaseCommand({ ...buildPlan, cwd: sourceDirectory,
        allowedRoot: artifactDirectory, isolated: true });
      checks.push(check('build', build.exitCode === 0 ? 'pass' : 'fail',
        build.exitCode === 0 ? 'Explicitly authorized build command completed.' : `Authorized build failed: ${build.stderr || build.stdout}`));
      if (build.exitCode !== 0) return { status: 'fail', checks };
    } else checks.push(check('build', 'pass', 'No package build lifecycle script requires execution.'));

    const packed = await runLocalReleaseCommand({
      command: 'npm', args: ['pack', '--json', '--ignore-scripts', '--pack-destination', artifactDirectory],
      cwd: sourceDirectory, timeoutMs: 120_000, allowedRoot: artifactDirectory, isolated: true,
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
    if (options.mode !== 'quick') {
      checks.push(...await productionReleasePolicyChecks(options.packageRoot, metadata));
      if (checks.some((item) => item.status === 'fail')) return { status: 'fail', artifactDigest, checks };
    }
    if (missingPackedFiles.length) return { status: 'fail', artifactDigest, checks };

    installDirectory = await createCleanInstallProject({ packageName: metadata.packageName, artifactPath });
    const installed = await runLocalReleaseCommand({
      command: 'npm',
      args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', artifactPath],
      cwd: installDirectory,
      timeoutMs: 120_000, allowedRoot: installDirectory, isolated: true,
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
      const manifestChecks = await verifyManifestSurface({ packageRoot: installedRoot, surface,
        hostWorkspace: installDirectory });
      checks.push(...manifestChecks);
      if (manifestChecks.some((item) => item.status === 'fail')) return { status: 'fail', artifactDigest, checks };
    }

    try {
      await smokePublicEntries(installedRoot, metadata.exports, installDirectory);
      for (const bin of metadata.bins) {
        if (!bin.startsWith('./')) continue;
        const smoke = await runLocalReleaseCommand({
          command: process.execPath,
          args: [path.join(installedRoot, bin), '--help'],
          cwd: installDirectory,
          allowedRoot: installDirectory,
          isolated: true,
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
        const commandBase = { command: 'npm', cwd: installDirectory, allowedRoot: installDirectory, isolated: true as const };
        const declaredState = path.join(installDirectory, 'guardrails-declared-state.json');
        const declaredStateValue = JSON.stringify({ preserved: true, packageName: metadata.packageName });
        await fs.writeFile(declaredState, declaredStateValue);
        const previous = await runLocalReleaseCommand({ ...commandBase, args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', options.previousArtifactPath] });
        const upgrade = await runLocalReleaseCommand({ ...commandBase, args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', artifactPath] });
        let upgradeSmoke = false;
        try {
          await smokePublicEntries(packageDirectory(metadata.packageName, installDirectory), metadata.exports, installDirectory);
          upgradeSmoke = await fs.readFile(declaredState, 'utf8') === declaredStateValue;
        } catch { upgradeSmoke = false; }
        const rollback = await runLocalReleaseCommand({ ...commandBase, args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', options.previousArtifactPath] });
        let rollbackSmoke = false;
        try {
          await smokePublicEntries(packageDirectory(metadata.packageName, installDirectory), metadata.exports, installDirectory);
          rollbackSmoke = await fs.readFile(declaredState, 'utf8') === declaredStateValue;
        } catch { rollbackSmoke = false; }
        checks.push(check('upgrade', previous.exitCode === 0 && upgrade.exitCode === 0 && upgradeSmoke ? 'pass' : 'fail',
          'Isolated previous-artifact upgrade preserved declared consumer state and public behavior.', artifactEvidence));
        checks.push(check('rollback', rollback.exitCode === 0 && rollbackSmoke ? 'pass' : 'fail',
          'Isolated rollback preserved declared consumer state and public behavior.', artifactEvidence));
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
  const sourceDirectory = path.join(workspace, 'source');
  const evidence = [{ referenceId: `config:release-command:${options.driver.id}`, kind: 'external' as const, externalId: options.driver.id, available: true }];
  try {
    await copyPackageSource(options.projectRoot, sourceDirectory);
    const result = await runLocalReleaseCommand({
      ...command,
      cwd: sourceDirectory,
      allowedRoot: workspace,
      isolated: true,
    });
    const expected = command.expectedArtifacts ?? [];
    const missing = (await Promise.all(expected.map(async (artifact) => ({ artifact, present: await exists(path.join(sourceDirectory, artifact)) }))))
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
  hostWorkspace: string;
}): Promise<ReleaseCheck[]> {
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
    const checks = [check(`${options.surface}-manifest`, 'pass', `${options.surface} manifest and declared workflow entries are present.`, [{
      referenceId: `repository:${filename}`, kind: 'repository', path: filename, available: true,
    }])];
    if (options.surface === 'plugin') {
      checks.push(check('plugin-host-discovery', 'human_needed',
        'A compatible Codex host session is required to prove installed plugin discovery and public behavior.'));
      return checks;
    }
    const coreRoot = process.env.OPENSPEC_CORE_ROOT;
    const coreCli = coreRoot ? path.join(coreRoot, 'bin', 'openspec.js')
      : path.join(options.hostWorkspace, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    if (!await exists(coreCli)) {
      checks.push(check('extension-host-discovery', 'human_needed',
        'An installed OpenSpec host CLI is required to prove extension discovery.'));
      return checks;
    }
    const hostProject = path.join(options.hostWorkspace, 'host-discovery');
    await fs.mkdir(hostProject, { recursive: true });
    const init = await runLocalReleaseCommand({ command: process.execPath,
      args: [coreCli, 'init', '--tools', 'codex', '--force', '--no-animation'], cwd: hostProject,
      allowedRoot: options.hostWorkspace, isolated: true });
    const linked = init.exitCode === 0 ? await runLocalReleaseCommand({ command: process.execPath,
      args: [coreCli, 'extension', 'link', options.packageRoot], cwd: hostProject,
      allowedRoot: options.hostWorkspace, isolated: true }) : init;
    const listed = linked.exitCode === 0 ? await runLocalReleaseCommand({ command: process.execPath,
      args: [coreCli, 'extension', 'list'], cwd: hostProject,
      allowedRoot: options.hostWorkspace, isolated: true }) : linked;
    const discovered = listed.exitCode === 0 && listed.stdout.includes(raw.id ?? raw.name ?? '');
    checks.push(check('extension-host-discovery', discovered ? 'pass' : 'fail', discovered
      ? 'Installed OpenSpec host discovered the packaged extension and its contributed workflows.'
      : `Installed OpenSpec host did not discover the extension: ${listed.stderr || listed.stdout}`));
    return checks;
  } catch (error) {
    return [check(`${options.surface}-manifest`, 'fail', `${options.surface} manifest conformance failed: ${(error as Error).message}`)];
  }
}

/** Execute all currently applicable release surfaces without publishing or
 * touching registries. Each returned candidate replaces only its own prior
 * event projection, so the v2 event history remains append-only. */
export async function executeReleaseCandidates(options: {
  packageRoot: string;
  candidates: ReleaseCandidateV2[];
  mode: RunMode;
  config: {
    configuredCommands: ConfiguredReleaseDriverV2[];
    requiredPlatforms?: Array<'linux' | 'macos' | 'windows'>;
    buildCommand?: ConfiguredReleaseDriverV2;
    requireFilesystemIsolation?: boolean;
    requireNetworkIsolation?: boolean;
  };
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
      buildCommand: options.config.buildCommand,
      requireFilesystemIsolation: options.config.requireFilesystemIsolation,
      requireNetworkIsolation: options.config.requireNetworkIsolation,
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
    const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    const platformChecks = (options.config.requiredPlatforms ?? []).map((required) => check(`platform:${required}`,
      required === platform ? 'pass' : 'human_needed', required === platform
        ? `Release checks ran on required ${required}.` : `Required ${required} release evidence is unavailable on ${platform}.`));
    const checks = [...packageVerification.checks, ...platformChecks];
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
  buildScript?: string;
}> {
  const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
    name?: string; version?: string; exports?: string | Record<string, unknown>;
    bin?: string | Record<string, string>; peerDependencies?: Record<string, string>; scripts?: Record<string, string>;
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
    ...(manifest.scripts?.build ? { buildScript: manifest.scripts.build } : {}),
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
