import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RelayAssuranceV1Schema, RelayAssuranceV2Schema, RelayRunV1Schema, RelayRunV2Schema, } from './schemas.js';
/**
 * Every generated path owned by OpenSpec Relay. Values are portable identities;
 * callers must use relayGeneratedPath() at a filesystem boundary.
 */
export const RELAY_GENERATED_FILES = {
    run: 'run.json',
    assurance: 'assurance.json',
    events: 'events.json',
};
async function isDirectory(candidate) {
    try {
        return (await fs.stat(candidate)).isDirectory();
    }
    catch {
        return false;
    }
}
export async function resolveProjectRoot(start = process.cwd()) {
    let current = path.resolve(start);
    while (true) {
        if (await isDirectory(path.join(current, 'openspec')))
            return fs.realpath(current);
        const parent = path.dirname(current);
        if (parent === current)
            throw new Error(`No OpenSpec project found from '${start}'.`);
        current = parent;
    }
}
export function resolveChangePathForPlatform(projectRoot, change, pathApi = path) {
    if (pathApi.isAbsolute(change))
        return pathApi.normalize(change);
    const hasSeparator = change.includes(pathApi.sep) || change.includes('/') || change.includes('\\');
    return hasSeparator
        ? pathApi.resolve(projectRoot, change)
        : pathApi.join(projectRoot, 'openspec', 'changes', change);
}
function portableRelative(root, target) {
    return path.relative(root, target).split(path.sep).join('/');
}
export async function resolveChangeDirectory(options) {
    const projectRoot = await resolveProjectRoot(options.projectRoot ?? process.cwd());
    const changesRoot = await fs.realpath(path.join(projectRoot, 'openspec', 'changes'));
    let candidate = resolveChangePathForPlatform(projectRoot, options.change);
    let archived = candidate.split(path.sep).includes('archive');
    if (!(await isDirectory(candidate)) && !path.isAbsolute(options.change) &&
        !options.change.includes('/') && !options.change.includes('\\')) {
        const archiveRoot = path.join(changesRoot, 'archive');
        const matches = (await fs.readdir(archiveRoot, { withFileTypes: true }).catch(() => []))
            .filter((entry) => entry.isDirectory() &&
            (entry.name === options.change || entry.name.endsWith(`-${options.change}`)))
            .map((entry) => path.join(archiveRoot, entry.name))
            .sort();
        if (matches.length > 1) {
            throw new Error(`Archived change '${options.change}' is ambiguous: ${matches.join(', ')}.`);
        }
        if (matches.length === 1) {
            candidate = matches[0];
            archived = true;
        }
    }
    if (!(await isDirectory(candidate)))
        throw new Error(`OpenSpec change '${options.change}' not found.`);
    const changeDir = await fs.realpath(candidate);
    const relative = path.relative(changesRoot, changeDir);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Change path '${changeDir}' escapes '${changesRoot}'.`);
    }
    const basename = path.basename(changeDir);
    const changeName = archived ? basename.replace(/^\d{4}-\d{2}-\d{2}-/, '') : basename;
    return {
        projectRoot,
        changeDir,
        changeName,
        archived,
        changeRef: portableRelative(projectRoot, changeDir),
    };
}
export function relayDirectory(changeDir, pathApi = path) {
    return pathApi.join(changeDir, '.openspec-relay');
}
export function relayGeneratedPath(changeDir, file, pathApi = path) {
    return pathApi.join(relayDirectory(changeDir, pathApi), ...RELAY_GENERATED_FILES[file].split('/'));
}
export function runStatePath(changeDir) {
    return relayGeneratedPath(changeDir, 'run');
}
export function assuranceStatePath(changeDir) {
    return relayGeneratedPath(changeDir, 'assurance');
}
function contained(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
/**
 * Validate that a registered OpenSpec Relay path is contained by the active change
 * and that its existing ancestors are ordinary directories rather than links.
 */
export async function assertRelayGeneratedPath(options) {
    const logicalChangeRoot = path.resolve(options.changeDir);
    const logicalRelayRoot = path.join(logicalChangeRoot, '.openspec-relay');
    const target = path.resolve(options.filename);
    if (!contained(logicalRelayRoot, target)) {
        throw new Error(`Generated OpenSpec Relay path '${target}' escapes the active change workspace.`);
    }
    const realChangeRoot = await fs.realpath(logicalChangeRoot);
    const expectedRealRoot = path.join(realChangeRoot, '.openspec-relay');
    try {
        const rootStat = await fs.lstat(logicalRelayRoot);
        if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
            throw new Error(`Generated OpenSpec Relay directory '${logicalRelayRoot}' must be a real directory, not a symlink or junction.`);
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT' || !options.createParents)
            throw error;
        await fs.mkdir(logicalRelayRoot).catch((mkdirError) => {
            if (mkdirError.code !== 'EEXIST')
                throw mkdirError;
        });
    }
    const realRelayRoot = await fs.realpath(logicalRelayRoot);
    if (path.normalize(realRelayRoot) !== path.normalize(expectedRealRoot)) {
        throw new Error(`Generated OpenSpec Relay directory '${logicalRelayRoot}' resolves outside the active change workspace.`);
    }
    const relative = path.relative(logicalRelayRoot, target);
    const parentSegments = path.dirname(relative) === '.' ? [] : path.dirname(relative).split(path.sep);
    let current = logicalRelayRoot;
    for (const segment of parentSegments) {
        current = path.join(current, segment);
        try {
            const stat = await fs.lstat(current);
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                throw new Error(`Generated OpenSpec Relay ancestor '${current}' must be a real directory.`);
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT' || !options.createParents)
                throw error;
            await fs.mkdir(current).catch((mkdirError) => {
                if (mkdirError.code !== 'EEXIST')
                    throw mkdirError;
            });
        }
        const realCurrent = await fs.realpath(current);
        if (!contained(realRelayRoot, realCurrent)) {
            throw new Error(`Generated OpenSpec Relay ancestor '${current}' resolves outside the active change workspace.`);
        }
    }
    try {
        const targetStat = await fs.lstat(target);
        if (targetStat.isSymbolicLink())
            throw new Error(`Generated OpenSpec Relay file '${target}' must not be a symlink.`);
    }
    catch (error) {
        if (error.code !== 'ENOENT' || !options.allowMissingFile)
            throw error;
    }
    return target;
}
export async function readRelayText(changeDir, filename) {
    const safe = await assertRelayGeneratedPath({ changeDir, filename });
    return fs.readFile(safe, 'utf8');
}
export function digestJson(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export async function atomicWriteJson(filename, value, operations = {}) {
    const rename = operations.rename ?? fs.rename;
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`);
    try {
        await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
        await rename(temporary, filename);
    }
    finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
}
export async function atomicWriteText(filename, content, operations = {}) {
    const rename = operations.rename ?? fs.rename;
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`);
    try {
        await fs.writeFile(temporary, content, { flag: 'wx' });
        await rename(temporary, filename);
    }
    finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
}
export async function atomicWriteRelayJson(changeDir, filename, value, operations = {}) {
    const safe = await assertRelayGeneratedPath({
        changeDir, filename, createParents: true, allowMissingFile: true,
    });
    await operations.beforeCommit?.();
    await atomicWriteJson(safe, value, {
        ...(operations.failBeforeCommit
            ? { rename: async () => { throw new Error('interrupted'); } }
            : {}),
    });
    await assertRelayGeneratedPath({ changeDir, filename: safe });
}
export async function removeRelayGeneratedFile(changeDir, filename, operations = {}) {
    const safe = await assertRelayGeneratedPath({ changeDir, filename, allowMissingFile: true });
    await operations.beforeRemove?.();
    await assertRelayGeneratedPath({ changeDir, filename: safe, allowMissingFile: true });
    await fs.rm(safe, { force: true });
}
export async function readRunState(changeDir) {
    return RelayRunV1Schema.parse(JSON.parse(await readRelayText(changeDir, runStatePath(changeDir))));
}
export async function readAssuranceState(changeDir) {
    return RelayAssuranceV1Schema.parse(JSON.parse(await readRelayText(changeDir, assuranceStatePath(changeDir))));
}
export async function readRunStateV2(changeDir) {
    return RelayRunV2Schema.parse(JSON.parse(await readRelayText(changeDir, runStatePath(changeDir))));
}
export async function readAssuranceStateV2(changeDir) {
    return RelayAssuranceV2Schema.parse(JSON.parse(await readRelayText(changeDir, assuranceStatePath(changeDir))));
}
export async function writeRunState(changeDir, run) {
    await atomicWriteRelayJson(changeDir, runStatePath(changeDir), RelayRunV1Schema.parse(run));
}
export async function writeAssuranceState(changeDir, assurance, run) {
    const validated = RelayAssuranceV1Schema.parse(assurance);
    const assuranceDigest = digestJson(validated);
    await atomicWriteRelayJson(changeDir, assuranceStatePath(changeDir), validated);
    if (run) {
        await writeRunState(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
    }
    return assuranceDigest;
}
export async function writeRunStateV2(changeDir, run) {
    await atomicWriteRelayJson(changeDir, runStatePath(changeDir), RelayRunV2Schema.parse(run));
}
export async function writeAssuranceStateV2(changeDir, assurance, run) {
    const validated = RelayAssuranceV2Schema.parse(assurance);
    const assuranceDigest = digestJson(validated);
    await atomicWriteRelayJson(changeDir, assuranceStatePath(changeDir), validated);
    if (run) {
        await writeRunStateV2(changeDir, { ...run, assuranceDigest, updatedAt: new Date().toISOString() });
    }
    return assuranceDigest;
}
//# sourceMappingURL=state.js.map