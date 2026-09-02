const QUICK = [
    'artifact-validation',
    'repository-checks',
    'targeted-tests',
    'scenario-coverage',
    'goal-verification',
];
export function selectAssurancePipeline(mode, specialistCheckers = []) {
    if (mode === 'quick')
        return QUICK;
    const guarded = [
        'artifact-validation',
        'repository-checks',
        'targeted-tests',
        'tdd',
        'scenario-coverage',
        'code-review',
        ...specialistCheckers,
        'goal-verification',
    ];
    return [...new Set(guarded)];
}
//# sourceMappingURL=modes.js.map