import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  GsdConfigV1Schema,
  GsdConfigV2Schema,
  type GsdConfigV1,
  type GsdConfigV2,
} from './schemas.js';

async function readPartialConfig(filename: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('configuration must be a JSON object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Invalid OpenSpec GSD configuration at ${filename}: ${(error as Error).message}`);
  }
}

function mergeConfig(
  base: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    ...update,
    git: { ...(base.git as object | undefined), ...(update.git as object | undefined) },
    taskOverrides: {
      ...(base.taskOverrides as object | undefined),
      ...(update.taskOverrides as object | undefined),
    },
    features: {
      ...(base.features as object | undefined),
      ...(update.features as object | undefined),
      repositoryContext: {
        ...((base.features as { repositoryContext?: object } | undefined)?.repositoryContext),
        ...((update.features as { repositoryContext?: object } | undefined)?.repositoryContext),
      },
      readiness: {
        ...((base.features as { readiness?: object } | undefined)?.readiness),
        ...((update.features as { readiness?: object } | undefined)?.readiness),
      },
      debug: {
        ...((base.features as { debug?: object } | undefined)?.debug),
        ...((update.features as { debug?: object } | undefined)?.debug),
      },
      uat: {
        ...((base.features as { uat?: object } | undefined)?.uat),
        ...((update.features as { uat?: object } | undefined)?.uat),
      },
      releaseAssurance: {
        ...((base.features as { releaseAssurance?: object } | undefined)?.releaseAssurance),
        ...((update.features as { releaseAssurance?: object } | undefined)?.releaseAssurance),
      },
    },
  };
}

export async function loadGsdConfig(options: {
  projectRoot: string;
  changeDir: string;
  overrides?: Partial<GsdConfigV1>;
}): Promise<GsdConfigV1> {
  const project = await readPartialConfig(path.join(options.projectRoot, 'openspec', 'gsd.json'));
  const change = await readPartialConfig(path.join(options.changeDir, 'gsd.json'));
  const v1 = mergeConfig(mergeConfig(project, change), options.overrides as Record<string, unknown> ?? {});
  delete v1.features;
  return GsdConfigV1Schema.parse(v1);
}

export async function loadGsdConfigV2(options: {
  projectRoot: string;
  changeDir: string;
  overrides?: Partial<GsdConfigV2>;
}): Promise<GsdConfigV2> {
  const project = await readPartialConfig(path.join(options.projectRoot, 'openspec', 'gsd.json'));
  const change = await readPartialConfig(path.join(options.changeDir, 'gsd.json'));
  return GsdConfigV2Schema.parse(
    mergeConfig(mergeConfig(project, change), options.overrides as Record<string, unknown> ?? {}),
  );
}
