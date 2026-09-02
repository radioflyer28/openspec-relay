import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RelayConfigV1Schema, RelayConfigV2Schema, } from './schemas.js';
async function readPartialConfig(filename) {
    try {
        const value = JSON.parse(await fs.readFile(filename, 'utf8'));
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new Error('configuration must be a JSON object');
        }
        return value;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return {};
        throw new Error(`Invalid OpenSpec Relay configuration at ${filename}: ${error.message}`);
    }
}
function mergeConfig(base, update) {
    return {
        ...base,
        ...update,
        git: { ...base.git, ...update.git },
        taskOverrides: {
            ...base.taskOverrides,
            ...update.taskOverrides,
        },
        piHostAdapter: {
            ...base.piHostAdapter,
            ...update.piHostAdapter,
        },
        features: {
            ...base.features,
            ...update.features,
            repositoryContext: {
                ...(base.features?.repositoryContext),
                ...(update.features?.repositoryContext),
            },
            readiness: {
                ...(base.features?.readiness),
                ...(update.features?.readiness),
            },
            debug: {
                ...(base.features?.debug),
                ...(update.features?.debug),
            },
            uat: {
                ...(base.features?.uat),
                ...(update.features?.uat),
            },
            releaseAssurance: {
                ...(base.features?.releaseAssurance),
                ...(update.features?.releaseAssurance),
            },
        },
    };
}
export async function loadRelayConfig(options) {
    const project = await readPartialConfig(path.join(options.projectRoot, 'openspec', 'relay.json'));
    const change = await readPartialConfig(path.join(options.changeDir, 'relay.json'));
    const v1 = mergeConfig(mergeConfig(project, change), options.overrides ?? {});
    delete v1.features;
    return RelayConfigV1Schema.parse(v1);
}
export async function loadRelayConfigV2(options) {
    const project = await readPartialConfig(path.join(options.projectRoot, 'openspec', 'relay.json'));
    const change = await readPartialConfig(path.join(options.changeDir, 'relay.json'));
    return RelayConfigV2Schema.parse(mergeConfig(mergeConfig(project, change), options.overrides ?? {}));
}
//# sourceMappingURL=config.js.map