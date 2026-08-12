import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CompiledOpenSpecChangeV1 } from './artifacts.js';
import type {
  PortableReferenceV2,
  RepositoryContextClaimV2,
  RepositoryContextV2,
} from './schemas.js';
import { RepositoryContextV2Schema } from './schemas.js';

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?|vue|svelte)$/i;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:test|tests|__tests__)\/)/i;
const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'composer.json', 'Gemfile',
]);
const IGNORED_DIRECTORIES = new Set(['.git', '.guardrails', 'node_modules', 'dist', 'coverage', '.next']);

export type RepositoryAnalysisTierV2 = 'tier0' | 'tier1' | 'tier2';

export interface RepositoryAnalysisContractV2 {
  readOnly: true;
  tier: RepositoryAnalysisTierV2;
}

export interface RepositoryAnalysisAdapterV2 {
  analyze(request: Readonly<{
    contract: RepositoryAnalysisContractV2;
    deterministicContext: RepositoryContextV2;
  }>): Promise<RepositoryContextV2>;
}

export function createRepositoryAnalysisContract(options: {
  tier: RepositoryAnalysisTierV2;
}): RepositoryAnalysisContractV2 {
  return { readOnly: true, tier: options.tier };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function portableRepositoryPath(
  root: string,
  filename: string,
  pathApi: path.PlatformPath = path,
): string {
  return pathApi.relative(root, filename).split(pathApi.sep).join('/');
}

function portable(root: string, filename: string): string {
  return portableRepositoryPath(root, filename);
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) files.push(filename);
    }
  };
  await visit(root);
  return files.sort();
}

async function reference(projectRoot: string, filename: string, kind: PortableReferenceV2['kind'] = 'repository'):
Promise<PortableReferenceV2> {
  const content = await fs.readFile(filename, 'utf8');
  const relative = portable(projectRoot, filename);
  return {
    referenceId: `${kind}:${relative}`,
    kind,
    path: relative,
    digest: createHash('sha256').update(content).digest('hex'),
    available: true,
  };
}

function claim(options: Omit<RepositoryContextClaimV2, 'claimId'>): RepositoryContextClaimV2 {
  return {
    ...options,
    claimId: `context:${digest({
      category: options.category,
      classification: options.classification,
      summary: options.summary,
      evidence: options.evidence.map((item) => item.referenceId),
    }).slice(0, 20)}`,
  };
}

function resolveImportedFile(source: string, specifier: string, sourceFiles: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(source), specifier);
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map((extension) => `${base}${extension}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((name) => path.join(base, name)),
  ];
  if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.[cm]?js$/, '.ts'));
  return candidates.find((candidate) => sourceFiles.has(candidate));
}

function testConvention(filename: string): string | undefined {
  const match = /\.(test|spec)\.([cm]?[jt]sx?)$/i.exec(filename);
  return match ? `${match[1].toLowerCase()}.${match[2].toLowerCase()}` : undefined;
}

export async function compileRepositoryContext(options: {
  projectRoot: string;
  changeDir: string;
  changeName: string;
  compiled: CompiledOpenSpecChangeV1;
  changedFiles?: string[];
  boundaries?: string[];
  tier?: RepositoryAnalysisTierV2;
  adapter?: RepositoryAnalysisAdapterV2;
  now?: string;
}): Promise<RepositoryContextV2> {
  createRepositoryAnalysisContract({ tier: options.tier ?? 'tier0' });
  const allFiles = await walk(options.projectRoot);
  const sourceFiles = allFiles.filter((filename) => SOURCE_EXTENSION.test(filename) && !TEST_FILE.test(portable(options.projectRoot, filename)));
  const tests = allFiles.filter((filename) => TEST_FILE.test(portable(options.projectRoot, filename)));
  const manifests = allFiles.filter((filename) => MANIFEST_NAMES.has(path.basename(filename)));
  const sourceSet = new Set(sourceFiles);
  const byPortable = new Map(allFiles.map((filename) => [portable(options.projectRoot, filename), filename]));
  const changed = (options.changedFiles ?? []).map((item) => item.replaceAll('\\', '/'));
  const fileReferences = new Map<string, PortableReferenceV2>();
  const getReference = async (filename: string, kind: PortableReferenceV2['kind'] = 'repository') => {
    const key = `${kind}:${filename}`;
    const existing = fileReferences.get(key);
    if (existing) return existing;
    const next = await reference(options.projectRoot, filename, kind);
    fileReferences.set(key, next);
    return next;
  };
  const claims: RepositoryContextClaimV2[] = [];

  for (const changedPath of changed) {
    const filename = byPortable.get(changedPath);
    if (!filename) continue;
    const evidence = [await getReference(filename)];
    claims.push(claim({
      category: 'affected_module', classification: 'observed',
      summary: `Changed repository module: ${changedPath}.`, confidence: 'high', evidence,
      relatedOpenSpecIds: [],
    }));
    if (sourceSet.has(filename)) claims.push(claim({
      category: 'implementation_analog', classification: 'observed',
      summary: `Existing implementation at ${changedPath} is a directly inspectable analog.`,
      confidence: 'high', evidence, relatedOpenSpecIds: [],
    }));
  }

  for (const boundary of [...new Set(options.boundaries ?? [])].sort()) {
    const candidate = path.resolve(options.projectRoot, boundary);
    const contained = portable(options.projectRoot, candidate);
    if (contained.startsWith('../') || path.isAbsolute(contained)) continue;
    const evidenceFile = allFiles.find((filename) => filename === candidate || filename.startsWith(`${candidate}${path.sep}`));
    if (evidenceFile) claims.push(claim({
      category: 'architecture_boundary', classification: 'observed',
      summary: `Configured architectural boundary: ${contained}.`, confidence: 'high',
      evidence: [await getReference(evidenceFile)], relatedOpenSpecIds: [],
    }));
  }

  const conventions = new Map<string, PortableReferenceV2[]>();
  for (const filename of tests) {
    const convention = testConvention(filename);
    if (!convention) continue;
    const current = conventions.get(convention) ?? [];
    current.push(await getReference(filename));
    conventions.set(convention, current);
  }
  for (const [convention, evidence] of [...conventions].sort(([left], [right]) => left.localeCompare(right))) {
    claims.push(claim({
      category: 'test_convention', classification: 'observed',
      summary: `Observed ${convention} test convention.`, confidence: 'high', evidence: evidence.slice(0, 3),
      relatedOpenSpecIds: [],
    }));
  }
  if (conventions.size > 1) claims.push(claim({
    category: 'conflicting_pattern', classification: 'conflict',
    summary: `Conflicting test conventions: ${[...conventions.keys()].sort().join(', ')}.`, confidence: 'high',
    evidence: [...conventions.values()].flat().slice(0, 4), relatedOpenSpecIds: [],
  }));

  for (const source of sourceFiles) {
    const content = await fs.readFile(source, 'utf8');
    const importExpressions = [
      ...content.matchAll(/(?:from\s*|import\s*\()['\"]([^'\"]+)['\"]/g),
      ...content.matchAll(/require\(\s*['\"]([^'\"]+)['\"]\s*\)/g),
    ];
    for (const match of importExpressions) {
      const target = resolveImportedFile(source, match[1], sourceSet);
      if (!target || !changed.includes(portable(options.projectRoot, target))) continue;
      claims.push(claim({
        category: 'downstream_consumer', classification: 'inferred',
        summary: `${portable(options.projectRoot, source)} appears to consume ${portable(options.projectRoot, target)}.`,
        confidence: 'medium', evidence: [await getReference(source), await getReference(target)],
        relatedOpenSpecIds: [],
      }));
    }
  }

  for (const manifest of manifests) {
    if (path.basename(manifest) !== 'package.json') continue;
    try {
      const parsed = JSON.parse(await fs.readFile(manifest, 'utf8')) as { exports?: unknown; bin?: unknown };
      if (parsed.exports || parsed.bin) claims.push(claim({
        category: 'downstream_consumer', classification: 'inferred',
        summary: `${portable(options.projectRoot, manifest)} declares public package entry points.`,
        confidence: 'medium', evidence: [await getReference(manifest)], relatedOpenSpecIds: [],
      }));
    } catch {
      // An invalid manifest is a deterministic repository fact, but readiness
      // should report it through the normal repository-check evidence instead.
    }
  }

  const artifact = options.compiled.artifacts.find((item) => item.kind === 'tasks');
  if (claims.length === 0 && artifact) claims.push(claim({
    category: 'unknown', classification: 'unknown',
    summary: 'No reliable implementation analog or affected module was observed.', confidence: 'low',
    evidence: [{
      referenceId: `artifact:${artifact.path}`,
      kind: 'artifact',
      path: path.join(portable(options.projectRoot, options.changeDir), artifact.path).split(path.sep).join('/'),
      digest: artifact.sourceDigest,
      available: true,
    }],
    relatedOpenSpecIds: artifact.ids,
  }));

  const inputRevision = digest({
    artifacts: options.compiled.artifacts.map((item) => [item.path, item.sourceDigest]),
    changed: changed.map((item) => {
      const file = byPortable.get(item);
      return [item, file ? fileReferences.get(`repository:${file}`)?.digest ?? null : null];
    }),
    claims: claims.map((item) => item.claimId),
  });
  const context = RepositoryContextV2Schema.parse({
    contextId: `context:${inputRevision.slice(0, 20)}`,
    changeName: options.changeName,
    inputRevision,
    compiledAt: options.now ?? new Date().toISOString(),
    status: 'current',
    claims: claims.sort((left, right) => left.claimId.localeCompare(right.claimId)),
    staleReferenceIds: [],
  });
  if (!options.adapter) return context;
  const analyzed = RepositoryContextV2Schema.parse(await options.adapter.analyze({
    contract: createRepositoryAnalysisContract({ tier: options.tier ?? 'tier0' }),
    deterministicContext: context,
  }));
  if (analyzed.changeName !== context.changeName || analyzed.inputRevision !== context.inputRevision) {
    throw new Error('Repository-analysis adapter returned a result for different controlling inputs.');
  }
  return analyzed;
}

export function invalidateRepositoryContext(options: {
  context: RepositoryContextV2;
  changedReferenceIds: string[];
}): RepositoryContextV2 {
  const referenced = new Set(options.context.claims.flatMap((item) => item.evidence.map((evidence) => evidence.referenceId)));
  const staleReferenceIds = [...new Set(options.changedReferenceIds.filter((id) => referenced.has(id)))].sort();
  if (staleReferenceIds.length === 0) return options.context;
  return {
    ...options.context,
    status: 'stale',
    staleReferenceIds: [...new Set([...options.context.staleReferenceIds, ...staleReferenceIds])].sort(),
  };
}

export function findRepositoryScopeGaps(options: {
  compiled: CompiledOpenSpecChangeV1;
  context: RepositoryContextV2;
}): Array<{ kind: 'repository_scope_gap'; referenceIds: string[]; remediation: string }> {
  const writeSet = new Set(options.compiled.graph.nodes.flatMap((task) => task.writeSet)
    .map((item) => item.replaceAll('\\', '/').replace(/^\.\//, '')));
  const gaps = options.context.claims
    .filter((item) => item.category === 'affected_module')
    .filter((item) => item.evidence.every((evidence) => !evidence.path || !writeSet.has(evidence.path)))
    .map((item) => ({
      kind: 'repository_scope_gap' as const,
      referenceIds: item.evidence.map((evidence) => evidence.referenceId),
      remediation: 'Add explicit OpenSpec task metadata for the affected repository module before execution.',
    }));
  return gaps;
}
