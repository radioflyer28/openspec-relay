import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  GuardrailsConfigV1Schema,
  type GuardrailsConfigV1,
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
    throw new Error(`Invalid Guardrails configuration at ${filename}: ${(error as Error).message}`);
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
  };
}

export async function loadGuardrailsConfig(options: {
  projectRoot: string;
  changeDir: string;
  overrides?: Partial<GuardrailsConfigV1>;
}): Promise<GuardrailsConfigV1> {
  const project = await readPartialConfig(path.join(options.projectRoot, 'openspec', 'guardrails.json'));
  const change = await readPartialConfig(path.join(options.changeDir, 'guardrails.json'));
  return GuardrailsConfigV1Schema.parse(
    mergeConfig(mergeConfig(project, change), options.overrides as Record<string, unknown> ?? {}),
  );
}
