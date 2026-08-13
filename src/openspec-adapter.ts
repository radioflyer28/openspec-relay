import { execFile } from 'node:child_process';
import type { TaskMetadataV1 } from './artifacts.js';
import {
  compileOpenSpecChange,
  type CompiledOpenSpecChangeV1,
  type OpenSpecMachineReadableSnapshotV1,
} from './artifacts.js';

export type OpenSpecJsonExecutorV1 = (
  args: string[],
  cwd: string,
) => Promise<unknown>;

async function executeOpenSpecJson(args: string[], cwd: string): Promise<unknown> {
  const executable = process.env.OPENSPEC_BIN || 'openspec';
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10_000,
      env: {
        ...process.env,
        CI: 'true',
        NO_COLOR: '1',
        OPENSPEC_NO_UPDATE_CHECK: '1',
        OPENSPEC_TELEMETRY: '0',
        DO_NOT_TRACK: '1',
      },
    },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(
            `OpenSpec JSON command failed (${args.join(' ')}): ${stderr.trim() || error.message}`,
          ));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(new Error(`OpenSpec JSON command returned invalid JSON: ${(parseError as Error).message}`));
        }
      });
  });
}

function parseApplyTasks(value: unknown): OpenSpecMachineReadableSnapshotV1['tasks'] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { tasks?: unknown }).tasks)) {
    throw new Error('OpenSpec apply JSON is missing its tasks array.');
  }
  return (value as { tasks: unknown[] }).tasks.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`OpenSpec task ${index + 1} is invalid.`);
    const task = item as { id?: unknown; description?: unknown; done?: unknown };
    if (typeof task.id !== 'string' || typeof task.description !== 'string' ||
        typeof task.done !== 'boolean') {
      throw new Error(`OpenSpec task ${index + 1} does not match openspec-apply-json-v1.`);
    }
    return { id: task.id, description: task.description, done: task.done };
  });
}

function parseShowRequirements(value: unknown): Array<{ spec: string; text: string }> {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { deltas?: unknown }).deltas)) {
    return [];
  }
  const requirements: Array<{ spec: string; text: string }> = [];
  for (const delta of (value as { deltas: unknown[] }).deltas) {
    if (!delta || typeof delta !== 'object') continue;
    const item = delta as { spec?: unknown; requirements?: unknown; requirement?: unknown };
    if (typeof item.spec !== 'string') continue;
    const candidates = Array.isArray(item.requirements)
      ? item.requirements
      : item.requirement ? [item.requirement] : [];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object' &&
          typeof (candidate as { text?: unknown }).text === 'string') {
        requirements.push({ spec: item.spec, text: (candidate as { text: string }).text });
      }
    }
  }
  return requirements;
}

export async function loadOpenSpecMachineReadableSnapshot(options: {
  projectRoot: string;
  changeName: string;
  execute?: OpenSpecJsonExecutorV1;
}): Promise<OpenSpecMachineReadableSnapshotV1 | undefined> {
  const execute = options.execute ?? executeOpenSpecJson;
  try {
    const apply = await execute(
      ['instructions', 'apply', '--change', options.changeName, '--json'],
      options.projectRoot,
    );
    const show = await execute(['show', options.changeName, '--json'], options.projectRoot)
      .catch(() => undefined);
    return {
      adapterVersion: 'openspec-apply-json-v1',
      tasks: parseApplyTasks(apply),
      requirements: parseShowRequirements(show),
    };
  } catch {
    // Compatibility path for hosts that do not expose the versioned JSON
    // commands. The Markdown adapter remains version-tested by compiler tests.
    return undefined;
  }
}

export async function compileCurrentOpenSpecChange(options: {
  projectRoot: string;
  changeName: string;
  changeDir: string;
  taskMetadata?: Record<string, TaskMetadataV1>;
  execute?: OpenSpecJsonExecutorV1;
}): Promise<CompiledOpenSpecChangeV1> {
  const machineReadable = await loadOpenSpecMachineReadableSnapshot(options);
  return compileOpenSpecChange({
    changeDir: options.changeDir,
    taskMetadata: options.taskMetadata,
    ...(machineReadable ? { machineReadable } : {}),
  });
}
