const SPECIALIST_ORDER = [
    'security',
    'integration',
    'ui',
    'ai-evaluation',
    'compatibility',
    'documentation',
    'human-uat',
];
export function routeSpecialistCheckers(signals) {
    const files = (signals.changedFiles ?? []).join(' ').toLowerCase();
    const text = `${files} ${signals.artifactText ?? ''}`.toLowerCase();
    const selected = new Set();
    const add = (checker, pattern) => { if (pattern.test(text))
        selected.add(checker); };
    add('security', /auth(?:entication|orization)?|trust boundar|secret|cryptograph|dependency|shell|untrusted|permission/);
    add('integration', /\bapi\b|database|persistence|message|migration|cross-package|integration|workflow boundar|webhook/);
    add('ui', /frontend|\bui\b|accessibility|responsive|\.tsx\b|\.jsx\b|\.css\b|component/);
    add('ai-evaluation', /prompt|\bmodel\b|retrieval|dataset|grader|llm|embedding|ai evaluation|monitoring/);
    add('compatibility', /public api|schema|cli contract|configuration|stored format|migration|backward compatib/);
    add('documentation', /readme|documentation|docs\/|public interface|externally visible/);
    add('human-uat', /human(?: validation| acceptance| uat)|visual judgment|manual validation|cannot be automated/);
    for (const checker of signals.required ?? []) {
        if (SPECIALIST_ORDER.includes(checker))
            selected.add(checker);
    }
    for (const checker of signals.disabled ?? [])
        selected.delete(checker);
    return SPECIALIST_ORDER.filter((checker) => selected.has(checker));
}
//# sourceMappingURL=checkers.js.map