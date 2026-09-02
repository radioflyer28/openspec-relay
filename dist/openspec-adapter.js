import { execFile } from 'node:child_process';
import { compileOpenSpecChange, } from './artifacts.js';
async function executeOpenSpecJson(args, cwd) {
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
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`OpenSpec JSON command failed (${args.join(' ')}): ${stderr.trim() || error.message}`));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            }
            catch (parseError) {
                reject(new Error(`OpenSpec JSON command returned invalid JSON: ${parseError.message}`));
            }
        });
    });
}
function parseApplyTasks(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.tasks)) {
        throw new Error('OpenSpec apply JSON is missing its tasks array.');
    }
    return value.tasks.map((item, index) => {
        if (!item || typeof item !== 'object')
            throw new Error(`OpenSpec task ${index + 1} is invalid.`);
        const task = item;
        if (typeof task.id !== 'string' || typeof task.description !== 'string' ||
            typeof task.done !== 'boolean') {
            throw new Error(`OpenSpec task ${index + 1} does not match openspec-apply-json-v1.`);
        }
        return { id: task.id, description: task.description, done: task.done };
    });
}
function parseShowRequirements(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.deltas)) {
        return [];
    }
    const requirements = [];
    for (const delta of value.deltas) {
        if (!delta || typeof delta !== 'object')
            continue;
        const item = delta;
        if (typeof item.spec !== 'string')
            continue;
        const candidates = Array.isArray(item.requirements)
            ? item.requirements
            : item.requirement ? [item.requirement] : [];
        for (const candidate of candidates) {
            if (candidate && typeof candidate === 'object' &&
                typeof candidate.text === 'string') {
                requirements.push({ spec: item.spec, text: candidate.text });
            }
        }
    }
    return requirements;
}
export async function loadOpenSpecMachineReadableSnapshot(options) {
    const execute = options.execute ?? executeOpenSpecJson;
    try {
        const apply = await execute(['instructions', 'apply', '--change', options.changeName, '--json'], options.projectRoot);
        const show = await execute(['show', options.changeName, '--json'], options.projectRoot)
            .catch(() => undefined);
        return {
            adapterVersion: 'openspec-apply-json-v1',
            tasks: parseApplyTasks(apply),
            requirements: parseShowRequirements(show),
        };
    }
    catch {
        // Compatibility path for hosts that do not expose the versioned JSON
        // commands. The Markdown adapter remains version-tested by compiler tests.
        return undefined;
    }
}
export async function compileCurrentOpenSpecChange(options) {
    const machineReadable = await loadOpenSpecMachineReadableSnapshot(options);
    return compileOpenSpecChange({
        changeDir: options.changeDir,
        taskMetadata: options.taskMetadata,
        ...(machineReadable ? { machineReadable } : {}),
    });
}
//# sourceMappingURL=openspec-adapter.js.map