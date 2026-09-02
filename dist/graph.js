import path from 'node:path';
import { TaskNodeV1Schema } from './schemas.js';
function normalizeWritePath(value) {
    return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}
export function writeSetsOverlap(left, right) {
    for (const leftPath of left.map(normalizeWritePath)) {
        for (const rightPath of right.map(normalizeWritePath)) {
            if (leftPath === rightPath || leftPath.startsWith(`${rightPath}/`) ||
                rightPath.startsWith(`${leftPath}/`))
                return true;
        }
    }
    return false;
}
export function buildExecutionGraph(input) {
    const nodes = input.map((node) => TaskNodeV1Schema.parse(node))
        .sort((left, right) => left.taskId.localeCompare(right.taskId, undefined, { numeric: true }));
    const byId = new Map(nodes.map((node) => [node.taskId, node]));
    if (byId.size !== nodes.length)
        throw new Error('Execution graph contains duplicate task IDs.');
    for (const node of nodes) {
        for (const dependency of node.dependencies) {
            if (!byId.has(dependency)) {
                throw new Error(`Task '${node.taskId}' depends on unknown task '${dependency}'.`);
            }
            if (dependency === node.taskId)
                throw new Error(`Task '${node.taskId}' depends on itself.`);
        }
    }
    const remaining = new Map(nodes.map((node) => [node.taskId, new Set(node.dependencies)]));
    const completed = new Set();
    const waves = [];
    while (completed.size < nodes.length) {
        const ready = nodes.filter((node) => !completed.has(node.taskId) &&
            [...remaining.get(node.taskId)].every((dependency) => completed.has(dependency)));
        if (ready.length === 0) {
            const cycle = nodes.filter((node) => !completed.has(node.taskId)).map((node) => node.taskId);
            throw new Error(`Execution graph contains a dependency cycle involving: ${cycle.join(', ')}.`);
        }
        const wave = [];
        for (const candidate of ready) {
            if (!wave.some((selected) => writeSetsOverlap(selected.writeSet, candidate.writeSet))) {
                wave.push(candidate);
            }
        }
        waves.push(wave.map((node) => node.taskId));
        for (const node of wave)
            completed.add(node.taskId);
    }
    return { nodes, waves };
}
export function portableWriteSet(values, pathApi = path) {
    return values.map((value) => pathApi.normalize(value).split(pathApi.sep).join('/'));
}
//# sourceMappingURL=graph.js.map