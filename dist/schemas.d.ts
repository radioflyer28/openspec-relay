import { z } from 'zod';
/** The latest generated-state format written by OpenSpec Relay. */
export declare const RELAY_STATE_VERSION: 2;
/** Retained solely for parsing and migrating pre-v2 projections. */
export declare const RELAY_V1_STATE_VERSION: 1;
export declare const RunModeSchema: z.ZodEnum<{
    quick: "quick";
    guarded: "guarded";
    full: "full";
}>;
export declare const ExecutionTierSchema: z.ZodEnum<{
    tier0: "tier0";
    tier1: "tier1";
    tier2: "tier2";
}>;
export declare const TddPolicySchema: z.ZodEnum<{
    auto: "auto";
    always: "always";
    off: "off";
}>;
export declare const RiskSchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
    critical: "critical";
}>;
export declare const SemanticLevelSchema: z.ZodEnum<{
    simple: "simple";
    behavioral: "behavioral";
    modeling: "modeling";
}>;
export declare const SemanticClassificationV1Schema: z.ZodObject<{
    requirementId: z.ZodString;
    level: z.ZodEnum<{
        simple: "simple";
        behavioral: "behavioral";
        modeling: "modeling";
    }>;
    rationale: z.ZodString;
    triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    sourceRevision: z.ZodString;
    evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    provenance: z.ZodDefault<z.ZodEnum<{
        planner: "planner";
        plan_reviewer: "plan_reviewer";
        tier0_self_review: "tier0_self_review";
        deterministic_lower_bound: "deterministic_lower_bound";
    }>>;
}, z.core.$strict>;
export declare const SemanticDowngradeV1Schema: z.ZodObject<{
    requirementId: z.ZodString;
    requiredLevel: z.ZodEnum<{
        simple: "simple";
        behavioral: "behavioral";
        modeling: "modeling";
    }>;
    achievedLevel: z.ZodEnum<{
        simple: "simple";
        behavioral: "behavioral";
        modeling: "modeling";
    }>;
    reason: z.ZodString;
    actor: z.ZodOptional<z.ZodString>;
    sourceRevision: z.ZodString;
    status: z.ZodEnum<{
        accepted: "accepted";
        human_needed: "human_needed";
    }>;
}, z.core.$strict>;
export declare const PlanApprovalV1Schema: z.ZodObject<{
    revision: z.ZodString;
    approvedAt: z.ZodString;
    independent: z.ZodBoolean;
    reviewerId: z.ZodOptional<z.ZodString>;
    semanticLevels: z.ZodDefault<z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        level: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
    }, z.core.$strict>>>;
    openDispositionIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const PathfinderResultV1Schema: z.ZodObject<{
    pathfinderId: z.ZodString;
    question: z.ZodString;
    assumptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    experiments: z.ZodDefault<z.ZodArray<z.ZodString>>;
    observations: z.ZodDefault<z.ZodArray<z.ZodString>>;
    counterexamples: z.ZodDefault<z.ZodArray<z.ZodString>>;
    conclusion: z.ZodString;
    confidence: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
    evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    routing: z.ZodEnum<{
        planner: "planner";
        human_needed: "human_needed";
        discussion: "discussion";
    }>;
    sourceRevision: z.ZodString;
}, z.core.$strict>;
export declare const PlanReviewResultV1Schema: z.ZodObject<{
    reviewId: z.ZodString;
    revision: z.ZodString;
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
    }>;
    independent: z.ZodBoolean;
    reviewerId: z.ZodOptional<z.ZodString>;
    findingIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    reviewedAt: z.ZodString;
}, z.core.$strict>;
export declare const FindingRouteV1Schema: z.ZodObject<{
    findingId: z.ZodString;
    source: z.ZodOptional<z.ZodEnum<{
        planner: "planner";
        discussion: "discussion";
        executor: "executor";
        pathfinder: "pathfinder";
        reviewer: "reviewer";
        verifier: "verifier";
    }>>;
    route: z.ZodEnum<{
        planner: "planner";
        human_needed: "human_needed";
        discussion: "discussion";
        executor: "executor";
        pathfinder: "pathfinder";
        verifier: "verifier";
    }>;
    taskId: z.ZodOptional<z.ZodString>;
    planRevision: z.ZodString;
    reason: z.ZodString;
    attempt: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const AssuranceStatusSchema: z.ZodEnum<{
    pass: "pass";
    error: "error";
    human_needed: "human_needed";
    fail: "fail";
    pending: "pending";
    warn: "warn";
    skipped: "skipped";
}>;
export declare const GitAutomationSchema: z.ZodObject<{
    commits: z.ZodDefault<z.ZodBoolean>;
    branches: z.ZodDefault<z.ZodBoolean>;
    worktrees: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const RelayConfigV1Schema: z.ZodObject<{
    version: z.ZodDefault<z.ZodLiteral<1>>;
    mode: z.ZodDefault<z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>>;
    tdd: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        always: "always";
        off: "off";
    }>>;
    repairLimit: z.ZodDefault<z.ZodNumber>;
    requestedTier: z.ZodOptional<z.ZodEnum<{
        tier0: "tier0";
        tier1: "tier1";
        tier2: "tier2";
    }>>;
    allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
    allowParallel: z.ZodDefault<z.ZodBoolean>;
    git: z.ZodDefault<z.ZodObject<{
        commits: z.ZodDefault<z.ZodBoolean>;
        branches: z.ZodDefault<z.ZodBoolean>;
        worktrees: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
        risk: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
        writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
        requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
        scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tdd: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const ArtifactReferenceV1Schema: z.ZodObject<{
    kind: z.ZodEnum<{
        proposal: "proposal";
        spec: "spec";
        design: "design";
        tasks: "tasks";
    }>;
    path: z.ZodString;
    sourceDigest: z.ZodString;
    ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const TaskNodeV1Schema: z.ZodObject<{
    taskId: z.ZodString;
    idStability: z.ZodOptional<z.ZodEnum<{
        explicit: "explicit";
        positional: "positional";
    }>>;
    sourcePath: z.ZodOptional<z.ZodString>;
    sourceDigest: z.ZodOptional<z.ZodString>;
    sourceLine: z.ZodOptional<z.ZodNumber>;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
    risk: z.ZodDefault<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>>;
    expectedVerification: z.ZodDefault<z.ZodArray<z.ZodString>>;
    writeSet: z.ZodDefault<z.ZodArray<z.ZodString>>;
    requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    scenarioRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<{
        pending: "pending";
        in_progress: "in_progress";
        complete: "complete";
        blocked: "blocked";
    }>>;
    tdd: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        always: "always";
        off: "off";
    }>>;
    tddRequired: z.ZodOptional<z.ZodBoolean>;
    tddExemptionReason: z.ZodOptional<z.ZodString>;
    implementationStartedAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const EvidenceV1Schema: z.ZodObject<{
    evidenceId: z.ZodString;
    taskId: z.ZodOptional<z.ZodString>;
    phase: z.ZodEnum<{
        check: "check";
        red: "red";
        green: "green";
        refactor: "refactor";
        review: "review";
        verify: "verify";
        human: "human";
    }>;
    checkId: z.ZodString;
    observedAt: z.ZodString;
    sourceState: z.ZodString;
    sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    exitCode: z.ZodOptional<z.ZodNumber>;
    result: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        warn: "warn";
    }>;
    outputDigest: z.ZodString;
    relevantFailure: z.ZodOptional<z.ZodBoolean>;
    preExistingFailure: z.ZodDefault<z.ZodBoolean>;
    origin: z.ZodEnum<{
        executor: "executor";
        reviewer: "reviewer";
        verifier: "verifier";
        human: "human";
        automated: "automated";
    }>;
    reference: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const DeviationV1Schema: z.ZodObject<{
    deviationId: z.ZodString;
    taskId: z.ZodString;
    requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    recordedAt: z.ZodString;
    summary: z.ZodString;
    disposition: z.ZodEnum<{
        accepted: "accepted";
        pending: "pending";
        rejected: "rejected";
    }>;
}, z.core.$strict>;
export declare const RepairAttemptV1Schema: z.ZodObject<{
    repairId: z.ZodString;
    checkId: z.ZodString;
    attempt: z.ZodNumber;
    startedAt: z.ZodString;
    completedAt: z.ZodOptional<z.ZodString>;
    changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
    result: z.ZodEnum<{
        pass: "pass";
        fail: "fail";
        pending: "pending";
        exhausted: "exhausted";
    }>;
}, z.core.$strict>;
export declare const ScenarioCoverageV1Schema: z.ZodObject<{
    requirementId: z.ZodString;
    scenarioId: z.ZodString;
    status: z.ZodEnum<{
        human_needed: "human_needed";
        covered: "covered";
        missing: "missing";
    }>;
    evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    acceptanceInstructions: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const AssuranceCheckV1Schema: z.ZodObject<{
    checkId: z.ZodString;
    kind: z.ZodEnum<{
        tdd: "tdd";
        "artifact-validation": "artifact-validation";
        "repository-checks": "repository-checks";
        "targeted-tests": "targeted-tests";
        "scenario-coverage": "scenario-coverage";
        "code-review": "code-review";
        "goal-verification": "goal-verification";
        security: "security";
        integration: "integration";
        ui: "ui";
        "ai-evaluation": "ai-evaluation";
        compatibility: "compatibility";
        documentation: "documentation";
        "human-uat": "human-uat";
    }>;
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        pending: "pending";
        warn: "warn";
        skipped: "skipped";
    }>;
    summary: z.ZodString;
    evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    readOnly: z.ZodDefault<z.ZodBoolean>;
    independent: z.ZodDefault<z.ZodBoolean>;
    remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const VerificationFindingV1Schema: z.ZodObject<{
    findingId: z.ZodString;
    requirementId: z.ZodString;
    status: z.ZodEnum<{
        pass: "pass";
        human_needed: "human_needed";
        fail: "fail";
        warn: "warn";
    }>;
    summary: z.ZodString;
    evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    origin: z.ZodEnum<{
        reviewer: "reviewer";
        verifier: "verifier";
        human: "human";
    }>;
}, z.core.$strict>;
export declare const RelayRunV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    runId: z.ZodString;
    changeName: z.ZodString;
    changeRef: z.ZodString;
    mode: z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>;
    tier: z.ZodEnum<{
        tier0: "tier0";
        tier1: "tier1";
        tier2: "tier2";
    }>;
    status: z.ZodEnum<{
        error: "error";
        complete: "complete";
        blocked: "blocked";
        planned: "planned";
        running: "running";
        checking: "checking";
    }>;
    startedAt: z.ZodString;
    updatedAt: z.ZodString;
    artifacts: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            proposal: "proposal";
            spec: "spec";
            design: "design";
            tasks: "tasks";
        }>;
        path: z.ZodString;
        sourceDigest: z.ZodString;
        ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    tasks: z.ZodArray<z.ZodObject<{
        taskId: z.ZodString;
        idStability: z.ZodOptional<z.ZodEnum<{
            explicit: "explicit";
            positional: "positional";
        }>>;
        sourcePath: z.ZodOptional<z.ZodString>;
        sourceDigest: z.ZodOptional<z.ZodString>;
        sourceLine: z.ZodOptional<z.ZodNumber>;
        dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
        risk: z.ZodDefault<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        expectedVerification: z.ZodDefault<z.ZodArray<z.ZodString>>;
        writeSet: z.ZodDefault<z.ZodArray<z.ZodString>>;
        requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        scenarioRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        status: z.ZodDefault<z.ZodEnum<{
            pending: "pending";
            in_progress: "in_progress";
            complete: "complete";
            blocked: "blocked";
        }>>;
        tdd: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
        tddRequired: z.ZodOptional<z.ZodBoolean>;
        tddExemptionReason: z.ZodOptional<z.ZodString>;
        implementationStartedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    executionWaves: z.ZodArray<z.ZodArray<z.ZodString>>;
    gateIds: z.ZodArray<z.ZodString>;
    deviations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        deviationId: z.ZodString;
        taskId: z.ZodString;
        requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        recordedAt: z.ZodString;
        summary: z.ZodString;
        disposition: z.ZodEnum<{
            accepted: "accepted";
            pending: "pending";
            rejected: "rejected";
        }>;
    }, z.core.$strict>>>;
    repairIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    config: z.ZodObject<{
        version: z.ZodDefault<z.ZodLiteral<1>>;
        mode: z.ZodDefault<z.ZodEnum<{
            quick: "quick";
            guarded: "guarded";
            full: "full";
        }>>;
        tdd: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
        repairLimit: z.ZodDefault<z.ZodNumber>;
        requestedTier: z.ZodOptional<z.ZodEnum<{
            tier0: "tier0";
            tier1: "tier1";
            tier2: "tier2";
        }>>;
        allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
        allowParallel: z.ZodDefault<z.ZodBoolean>;
        git: z.ZodDefault<z.ZodObject<{
            commits: z.ZodDefault<z.ZodBoolean>;
            branches: z.ZodDefault<z.ZodBoolean>;
            worktrees: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
            risk: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                critical: "critical";
            }>>;
            expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
            writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
            requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
            scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tdd: z.ZodOptional<z.ZodEnum<{
                auto: "auto";
                always: "always";
                off: "off";
            }>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    assuranceDigest: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const RelayAssuranceV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    runId: z.ZodString;
    changeName: z.ZodString;
    mode: z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>;
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        pending: "pending";
        warn: "warn";
    }>;
    updatedAt: z.ZodString;
    checks: z.ZodArray<z.ZodObject<{
        checkId: z.ZodString;
        kind: z.ZodEnum<{
            tdd: "tdd";
            "artifact-validation": "artifact-validation";
            "repository-checks": "repository-checks";
            "targeted-tests": "targeted-tests";
            "scenario-coverage": "scenario-coverage";
            "code-review": "code-review";
            "goal-verification": "goal-verification";
            security: "security";
            integration: "integration";
            ui: "ui";
            "ai-evaluation": "ai-evaluation";
            compatibility: "compatibility";
            documentation: "documentation";
            "human-uat": "human-uat";
        }>;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            warn: "warn";
            skipped: "skipped";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        readOnly: z.ZodDefault<z.ZodBoolean>;
        independent: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    evidence: z.ZodArray<z.ZodObject<{
        evidenceId: z.ZodString;
        taskId: z.ZodOptional<z.ZodString>;
        phase: z.ZodEnum<{
            check: "check";
            red: "red";
            green: "green";
            refactor: "refactor";
            review: "review";
            verify: "verify";
            human: "human";
        }>;
        checkId: z.ZodString;
        observedAt: z.ZodString;
        sourceState: z.ZodString;
        sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        exitCode: z.ZodOptional<z.ZodNumber>;
        result: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        outputDigest: z.ZodString;
        relevantFailure: z.ZodOptional<z.ZodBoolean>;
        preExistingFailure: z.ZodDefault<z.ZodBoolean>;
        origin: z.ZodEnum<{
            executor: "executor";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automated: "automated";
        }>;
        reference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    scenarioCoverage: z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        scenarioId: z.ZodString;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            covered: "covered";
            missing: "missing";
        }>;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        acceptanceInstructions: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    repairs: z.ZodArray<z.ZodObject<{
        repairId: z.ZodString;
        checkId: z.ZodString;
        attempt: z.ZodNumber;
        startedAt: z.ZodString;
        completedAt: z.ZodOptional<z.ZodString>;
        changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            pending: "pending";
            exhausted: "exhausted";
        }>;
    }, z.core.$strict>>;
    findings: z.ZodArray<z.ZodObject<{
        findingId: z.ZodString;
        requirementId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        origin: z.ZodEnum<{
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
        }>;
    }, z.core.$strict>>;
    staleEvidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unresolvedHumanActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const RelayReportV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    reportId: z.ZodString;
    runId: z.ZodString;
    kind: z.ZodEnum<{
        review: "review";
        security: "security";
        integration: "integration";
        ui: "ui";
        "ai-evaluation": "ai-evaluation";
        compatibility: "compatibility";
        documentation: "documentation";
        "human-uat": "human-uat";
        verification: "verification";
    }>;
    createdAt: z.ZodString;
    readOnly: z.ZodBoolean;
    findings: z.ZodArray<z.ZodObject<{
        findingId: z.ZodString;
        requirementId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        origin: z.ZodEnum<{
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
        }>;
    }, z.core.$strict>>;
    evidenceRefs: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const RelayEventActorV1Schema: z.ZodObject<{
    kind: z.ZodEnum<{
        executor: "executor";
        reviewer: "reviewer";
        verifier: "verifier";
        human: "human";
        automation: "automation";
        host: "host";
    }>;
    id: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const RelayEventProvenanceV1Schema: z.ZodObject<{
    origin: z.ZodString;
    adapter: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const RelayEventPayloadV1Schema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"task.transition">;
    taskId: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        in_progress: "in_progress";
        complete: "complete";
        blocked: "blocked";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"evidence.recorded">;
    evidence: z.ZodObject<{
        evidenceId: z.ZodString;
        taskId: z.ZodOptional<z.ZodString>;
        phase: z.ZodEnum<{
            check: "check";
            red: "red";
            green: "green";
            refactor: "refactor";
            review: "review";
            verify: "verify";
            human: "human";
        }>;
        checkId: z.ZodString;
        observedAt: z.ZodString;
        sourceState: z.ZodString;
        sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        exitCode: z.ZodOptional<z.ZodNumber>;
        result: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        outputDigest: z.ZodString;
        relevantFailure: z.ZodOptional<z.ZodBoolean>;
        preExistingFailure: z.ZodDefault<z.ZodBoolean>;
        origin: z.ZodEnum<{
            executor: "executor";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automated: "automated";
        }>;
        reference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"finding.recorded">;
    finding: z.ZodObject<{
        findingId: z.ZodString;
        requirementId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        origin: z.ZodEnum<{
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"deviation.recorded">;
    deviation: z.ZodObject<{
        deviationId: z.ZodString;
        taskId: z.ZodString;
        requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        recordedAt: z.ZodString;
        summary: z.ZodString;
        disposition: z.ZodEnum<{
            accepted: "accepted";
            pending: "pending";
            rejected: "rejected";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"repair.recorded">;
    repair: z.ZodObject<{
        repairId: z.ZodString;
        checkId: z.ZodString;
        attempt: z.ZodNumber;
        startedAt: z.ZodString;
        completedAt: z.ZodOptional<z.ZodString>;
        changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            pending: "pending";
            exhausted: "exhausted";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"human.decision">;
    gateId: z.ZodString;
    decision: z.ZodEnum<{
        accepted: "accepted";
        rejected: "rejected";
        requested: "requested";
    }>;
    reason: z.ZodOptional<z.ZodString>;
    resultDigest: z.ZodOptional<z.ZodString>;
    evidenceDigest: z.ZodOptional<z.ZodString>;
}, z.core.$strict>], "type">;
export declare const RelayEventEnvelopeV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    eventId: z.ZodString;
    runId: z.ZodString;
    changeName: z.ZodString;
    occurredAt: z.ZodString;
    sourceDigests: z.ZodRecord<z.ZodString, z.ZodString>;
    actor: z.ZodObject<{
        kind: z.ZodEnum<{
            executor: "executor";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automation: "automation";
            host: "host";
        }>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    provenance: z.ZodObject<{
        origin: z.ZodString;
        adapter: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    payloadDigest: z.ZodString;
    payload: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"task.transition">;
        taskId: z.ZodString;
        status: z.ZodEnum<{
            pending: "pending";
            in_progress: "in_progress";
            complete: "complete";
            blocked: "blocked";
        }>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"evidence.recorded">;
        evidence: z.ZodObject<{
            evidenceId: z.ZodString;
            taskId: z.ZodOptional<z.ZodString>;
            phase: z.ZodEnum<{
                check: "check";
                red: "red";
                green: "green";
                refactor: "refactor";
                review: "review";
                verify: "verify";
                human: "human";
            }>;
            checkId: z.ZodString;
            observedAt: z.ZodString;
            sourceState: z.ZodString;
            sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            exitCode: z.ZodOptional<z.ZodNumber>;
            result: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                warn: "warn";
            }>;
            outputDigest: z.ZodString;
            relevantFailure: z.ZodOptional<z.ZodBoolean>;
            preExistingFailure: z.ZodDefault<z.ZodBoolean>;
            origin: z.ZodEnum<{
                executor: "executor";
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
                automated: "automated";
            }>;
            reference: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"finding.recorded">;
        finding: z.ZodObject<{
            findingId: z.ZodString;
            requirementId: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                human_needed: "human_needed";
                fail: "fail";
                warn: "warn";
            }>;
            summary: z.ZodString;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            origin: z.ZodEnum<{
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"deviation.recorded">;
        deviation: z.ZodObject<{
            deviationId: z.ZodString;
            taskId: z.ZodString;
            requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
            recordedAt: z.ZodString;
            summary: z.ZodString;
            disposition: z.ZodEnum<{
                accepted: "accepted";
                pending: "pending";
                rejected: "rejected";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"repair.recorded">;
        repair: z.ZodObject<{
            repairId: z.ZodString;
            checkId: z.ZodString;
            attempt: z.ZodNumber;
            startedAt: z.ZodString;
            completedAt: z.ZodOptional<z.ZodString>;
            changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
            result: z.ZodEnum<{
                pass: "pass";
                fail: "fail";
                pending: "pending";
                exhausted: "exhausted";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"human.decision">;
        gateId: z.ZodString;
        decision: z.ZodEnum<{
            accepted: "accepted";
            rejected: "rejected";
            requested: "requested";
        }>;
        reason: z.ZodOptional<z.ZodString>;
        resultDigest: z.ZodOptional<z.ZodString>;
        evidenceDigest: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>], "type">;
}, z.core.$strict>;
export declare const RelayEventStoreSeedV1Schema: z.ZodObject<{
    changeRef: z.ZodString;
    mode: z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>;
    tier: z.ZodEnum<{
        tier0: "tier0";
        tier1: "tier1";
        tier2: "tier2";
    }>;
    status: z.ZodEnum<{
        error: "error";
        complete: "complete";
        blocked: "blocked";
        planned: "planned";
        running: "running";
        checking: "checking";
    }>;
    startedAt: z.ZodString;
    gateIds: z.ZodArray<z.ZodString>;
    config: z.ZodObject<{
        version: z.ZodDefault<z.ZodLiteral<1>>;
        mode: z.ZodDefault<z.ZodEnum<{
            quick: "quick";
            guarded: "guarded";
            full: "full";
        }>>;
        tdd: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
        repairLimit: z.ZodDefault<z.ZodNumber>;
        requestedTier: z.ZodOptional<z.ZodEnum<{
            tier0: "tier0";
            tier1: "tier1";
            tier2: "tier2";
        }>>;
        allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
        allowParallel: z.ZodDefault<z.ZodBoolean>;
        git: z.ZodDefault<z.ZodObject<{
            commits: z.ZodDefault<z.ZodBoolean>;
            branches: z.ZodDefault<z.ZodBoolean>;
            worktrees: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
            risk: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                critical: "critical";
            }>>;
            expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
            writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
            requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
            scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tdd: z.ZodOptional<z.ZodEnum<{
                auto: "auto";
                always: "always";
                off: "off";
            }>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    checks: z.ZodArray<z.ZodObject<{
        checkId: z.ZodString;
        kind: z.ZodEnum<{
            tdd: "tdd";
            "artifact-validation": "artifact-validation";
            "repository-checks": "repository-checks";
            "targeted-tests": "targeted-tests";
            "scenario-coverage": "scenario-coverage";
            "code-review": "code-review";
            "goal-verification": "goal-verification";
            security: "security";
            integration: "integration";
            ui: "ui";
            "ai-evaluation": "ai-evaluation";
            compatibility: "compatibility";
            documentation: "documentation";
            "human-uat": "human-uat";
        }>;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            warn: "warn";
            skipped: "skipped";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        readOnly: z.ZodDefault<z.ZodBoolean>;
        independent: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    scenarioCoverage: z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        scenarioId: z.ZodString;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            covered: "covered";
            missing: "missing";
        }>;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        acceptanceInstructions: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const RelayEventStoreV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    owner: z.ZodLiteral<"openspec-relay">;
    runId: z.ZodString;
    changeName: z.ZodString;
    createdAt: z.ZodString;
    seed: z.ZodObject<{
        changeRef: z.ZodString;
        mode: z.ZodEnum<{
            quick: "quick";
            guarded: "guarded";
            full: "full";
        }>;
        tier: z.ZodEnum<{
            tier0: "tier0";
            tier1: "tier1";
            tier2: "tier2";
        }>;
        status: z.ZodEnum<{
            error: "error";
            complete: "complete";
            blocked: "blocked";
            planned: "planned";
            running: "running";
            checking: "checking";
        }>;
        startedAt: z.ZodString;
        gateIds: z.ZodArray<z.ZodString>;
        config: z.ZodObject<{
            version: z.ZodDefault<z.ZodLiteral<1>>;
            mode: z.ZodDefault<z.ZodEnum<{
                quick: "quick";
                guarded: "guarded";
                full: "full";
            }>>;
            tdd: z.ZodDefault<z.ZodEnum<{
                auto: "auto";
                always: "always";
                off: "off";
            }>>;
            repairLimit: z.ZodDefault<z.ZodNumber>;
            requestedTier: z.ZodOptional<z.ZodEnum<{
                tier0: "tier0";
                tier1: "tier1";
                tier2: "tier2";
            }>>;
            allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
            allowParallel: z.ZodDefault<z.ZodBoolean>;
            git: z.ZodDefault<z.ZodObject<{
                commits: z.ZodDefault<z.ZodBoolean>;
                branches: z.ZodDefault<z.ZodBoolean>;
                worktrees: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>;
            requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
            disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
            taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
                risk: z.ZodOptional<z.ZodEnum<{
                    low: "low";
                    medium: "medium";
                    high: "high";
                    critical: "critical";
                }>>;
                expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
                writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
                requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
                scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
                tdd: z.ZodOptional<z.ZodEnum<{
                    auto: "auto";
                    always: "always";
                    off: "off";
                }>>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
        checks: z.ZodArray<z.ZodObject<{
            checkId: z.ZodString;
            kind: z.ZodEnum<{
                tdd: "tdd";
                "artifact-validation": "artifact-validation";
                "repository-checks": "repository-checks";
                "targeted-tests": "targeted-tests";
                "scenario-coverage": "scenario-coverage";
                "code-review": "code-review";
                "goal-verification": "goal-verification";
                security: "security";
                integration: "integration";
                ui: "ui";
                "ai-evaluation": "ai-evaluation";
                compatibility: "compatibility";
                documentation: "documentation";
                "human-uat": "human-uat";
            }>;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                pending: "pending";
                warn: "warn";
                skipped: "skipped";
            }>;
            summary: z.ZodString;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            readOnly: z.ZodDefault<z.ZodBoolean>;
            independent: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        scenarioCoverage: z.ZodArray<z.ZodObject<{
            requirementId: z.ZodString;
            scenarioId: z.ZodString;
            status: z.ZodEnum<{
                human_needed: "human_needed";
                covered: "covered";
                missing: "missing";
            }>;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            acceptanceInstructions: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    events: z.ZodArray<z.ZodObject<{
        version: z.ZodLiteral<1>;
        eventId: z.ZodString;
        runId: z.ZodString;
        changeName: z.ZodString;
        occurredAt: z.ZodString;
        sourceDigests: z.ZodRecord<z.ZodString, z.ZodString>;
        actor: z.ZodObject<{
            kind: z.ZodEnum<{
                executor: "executor";
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
                automation: "automation";
                host: "host";
            }>;
            id: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        provenance: z.ZodObject<{
            origin: z.ZodString;
            adapter: z.ZodOptional<z.ZodString>;
            command: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        payloadDigest: z.ZodString;
        payload: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"task.transition">;
            taskId: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                in_progress: "in_progress";
                complete: "complete";
                blocked: "blocked";
            }>;
            reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"evidence.recorded">;
            evidence: z.ZodObject<{
                evidenceId: z.ZodString;
                taskId: z.ZodOptional<z.ZodString>;
                phase: z.ZodEnum<{
                    check: "check";
                    red: "red";
                    green: "green";
                    refactor: "refactor";
                    review: "review";
                    verify: "verify";
                    human: "human";
                }>;
                checkId: z.ZodString;
                observedAt: z.ZodString;
                sourceState: z.ZodString;
                sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                exitCode: z.ZodOptional<z.ZodNumber>;
                result: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                    warn: "warn";
                }>;
                outputDigest: z.ZodString;
                relevantFailure: z.ZodOptional<z.ZodBoolean>;
                preExistingFailure: z.ZodDefault<z.ZodBoolean>;
                origin: z.ZodEnum<{
                    executor: "executor";
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                    automated: "automated";
                }>;
                reference: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"finding.recorded">;
            finding: z.ZodObject<{
                findingId: z.ZodString;
                requirementId: z.ZodString;
                status: z.ZodEnum<{
                    pass: "pass";
                    human_needed: "human_needed";
                    fail: "fail";
                    warn: "warn";
                }>;
                summary: z.ZodString;
                evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                origin: z.ZodEnum<{
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"deviation.recorded">;
            deviation: z.ZodObject<{
                deviationId: z.ZodString;
                taskId: z.ZodString;
                requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
                recordedAt: z.ZodString;
                summary: z.ZodString;
                disposition: z.ZodEnum<{
                    accepted: "accepted";
                    pending: "pending";
                    rejected: "rejected";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"repair.recorded">;
            repair: z.ZodObject<{
                repairId: z.ZodString;
                checkId: z.ZodString;
                attempt: z.ZodNumber;
                startedAt: z.ZodString;
                completedAt: z.ZodOptional<z.ZodString>;
                changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
                result: z.ZodEnum<{
                    pass: "pass";
                    fail: "fail";
                    pending: "pending";
                    exhausted: "exhausted";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"human.decision">;
            gateId: z.ZodString;
            decision: z.ZodEnum<{
                accepted: "accepted";
                rejected: "rejected";
                requested: "requested";
            }>;
            reason: z.ZodOptional<z.ZodString>;
            resultDigest: z.ZodOptional<z.ZodString>;
            evidenceDigest: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>], "type">;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RunMode = z.infer<typeof RunModeSchema>;
export type ExecutionTier = z.infer<typeof ExecutionTierSchema>;
export type TddPolicy = z.infer<typeof TddPolicySchema>;
export type RelayConfigV1 = z.infer<typeof RelayConfigV1Schema>;
export type TaskNodeV1 = z.infer<typeof TaskNodeV1Schema>;
export type EvidenceV1 = z.infer<typeof EvidenceV1Schema>;
export type RepairAttemptV1 = z.infer<typeof RepairAttemptV1Schema>;
export type AssuranceCheckV1 = z.infer<typeof AssuranceCheckV1Schema>;
export type VerificationFindingV1 = z.infer<typeof VerificationFindingV1Schema>;
export type RelayRunV1 = z.infer<typeof RelayRunV1Schema>;
export type RelayAssuranceV1 = z.infer<typeof RelayAssuranceV1Schema>;
export type RelayReportV1 = z.infer<typeof RelayReportV1Schema>;
export type RelayEventPayloadV1 = z.infer<typeof RelayEventPayloadV1Schema>;
export type RelayEventEnvelopeV1 = z.infer<typeof RelayEventEnvelopeV1Schema>;
export type RelayEventStoreV1 = z.infer<typeof RelayEventStoreV1Schema>;
export declare const PortableReferenceV2Schema: z.ZodObject<{
    referenceId: z.ZodString;
    kind: z.ZodEnum<{
        artifact: "artifact";
        repository: "repository";
        generated: "generated";
        external: "external";
    }>;
    path: z.ZodOptional<z.ZodString>;
    externalId: z.ZodOptional<z.ZodString>;
    digest: z.ZodOptional<z.ZodString>;
    available: z.ZodDefault<z.ZodBoolean>;
    remediation: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const RepositoryAnalysisConfigV2Schema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    boundaries: z.ZodDefault<z.ZodArray<z.ZodString>>;
    comparisonBase: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const ReadinessConfigV2Schema: z.ZodObject<{
    rollout: z.ZodDefault<z.ZodEnum<{
        report_only: "report_only";
        required: "required";
    }>>;
    independentRequired: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const DebugConfigV2Schema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    automaticTransition: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const UatConfigV2Schema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    required: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const ConfiguredReleaseCommandV2Schema: z.ZodObject<{
    id: z.ZodString;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString>>;
    expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
    timeoutMs: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const ReleaseAssuranceConfigV2Schema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        always: "always";
        off: "off";
    }>>;
    disabledReason: z.ZodOptional<z.ZodString>;
    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
    configuredCommands: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString>>;
        expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>>;
    requiredPlatforms: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        linux: "linux";
        macos: "macos";
        windows: "windows";
    }>>>;
    buildCommand: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString>>;
        expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const RelayFeatureConfigV2Schema: z.ZodObject<{
    repositoryContext: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        boundaries: z.ZodDefault<z.ZodArray<z.ZodString>>;
        comparisonBase: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    readiness: z.ZodDefault<z.ZodObject<{
        rollout: z.ZodDefault<z.ZodEnum<{
            report_only: "report_only";
            required: "required";
        }>>;
        independentRequired: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    debug: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        automaticTransition: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    uat: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        required: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    releaseAssurance: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
        disabledReason: z.ZodOptional<z.ZodString>;
        surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
        configuredCommands: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            command: z.ZodString;
            args: z.ZodDefault<z.ZodArray<z.ZodString>>;
            expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
            timeoutMs: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>>;
        requiredPlatforms: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            linux: "linux";
            macos: "macos";
            windows: "windows";
        }>>>;
        buildCommand: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            command: z.ZodString;
            args: z.ZodDefault<z.ZodArray<z.ZodString>>;
            expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
            timeoutMs: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const PiHostAdapterConfigV1Schema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    forceTier0: z.ZodDefault<z.ZodBoolean>;
    maxReadOnlyConcurrency: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const RelayConfigV2Schema: z.ZodObject<{
    tdd: z.ZodDefault<z.ZodEnum<{
        auto: "auto";
        always: "always";
        off: "off";
    }>>;
    mode: z.ZodDefault<z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>>;
    repairLimit: z.ZodDefault<z.ZodNumber>;
    requestedTier: z.ZodOptional<z.ZodEnum<{
        tier0: "tier0";
        tier1: "tier1";
        tier2: "tier2";
    }>>;
    allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
    allowParallel: z.ZodDefault<z.ZodBoolean>;
    git: z.ZodDefault<z.ZodObject<{
        commits: z.ZodDefault<z.ZodBoolean>;
        branches: z.ZodDefault<z.ZodBoolean>;
        worktrees: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
        risk: z.ZodOptional<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
        writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
        requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
        scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
        tdd: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
    }, z.core.$strict>>>;
    version: z.ZodDefault<z.ZodLiteral<2>>;
    piHostAdapter: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        forceTier0: z.ZodDefault<z.ZodBoolean>;
        maxReadOnlyConcurrency: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    features: z.ZodDefault<z.ZodObject<{
        repositoryContext: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            boundaries: z.ZodDefault<z.ZodArray<z.ZodString>>;
            comparisonBase: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        readiness: z.ZodDefault<z.ZodObject<{
            rollout: z.ZodDefault<z.ZodEnum<{
                report_only: "report_only";
                required: "required";
            }>>;
            independentRequired: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        debug: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            automaticTransition: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        uat: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        releaseAssurance: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodEnum<{
                auto: "auto";
                always: "always";
                off: "off";
            }>>;
            disabledReason: z.ZodOptional<z.ZodString>;
            surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
            configuredCommands: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                command: z.ZodString;
                args: z.ZodDefault<z.ZodArray<z.ZodString>>;
                expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
                timeoutMs: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>>>;
            requiredPlatforms: z.ZodDefault<z.ZodArray<z.ZodEnum<{
                linux: "linux";
                macos: "macos";
                windows: "windows";
            }>>>;
            buildCommand: z.ZodOptional<z.ZodObject<{
                id: z.ZodString;
                command: z.ZodString;
                args: z.ZodDefault<z.ZodArray<z.ZodString>>;
                expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
                timeoutMs: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const RepositoryContextClaimV2Schema: z.ZodObject<{
    claimId: z.ZodString;
    category: z.ZodEnum<{
        unknown: "unknown";
        implementation_analog: "implementation_analog";
        affected_module: "affected_module";
        test_convention: "test_convention";
        architecture_boundary: "architecture_boundary";
        downstream_consumer: "downstream_consumer";
        conflicting_pattern: "conflicting_pattern";
    }>;
    classification: z.ZodEnum<{
        unknown: "unknown";
        observed: "observed";
        inferred: "inferred";
        conflict: "conflict";
    }>;
    summary: z.ZodString;
    confidence: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
    evidence: z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    relatedOpenSpecIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const RepositoryContextV2Schema: z.ZodObject<{
    contextId: z.ZodString;
    changeName: z.ZodString;
    inputRevision: z.ZodString;
    compiledAt: z.ZodString;
    status: z.ZodEnum<{
        current: "current";
        stale: "stale";
        unavailable: "unavailable";
    }>;
    claims: z.ZodArray<z.ZodObject<{
        claimId: z.ZodString;
        category: z.ZodEnum<{
            unknown: "unknown";
            implementation_analog: "implementation_analog";
            affected_module: "affected_module";
            test_convention: "test_convention";
            architecture_boundary: "architecture_boundary";
            downstream_consumer: "downstream_consumer";
            conflicting_pattern: "conflicting_pattern";
        }>;
        classification: z.ZodEnum<{
            unknown: "unknown";
            observed: "observed";
            inferred: "inferred";
            conflict: "conflict";
        }>;
        summary: z.ZodString;
        confidence: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
        evidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        relatedOpenSpecIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    staleReferenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const ReadinessIssueV2Schema: z.ZodObject<{
    issueId: z.ZodString;
    kind: z.ZodEnum<{
        uncovered_requirement: "uncovered_requirement";
        unmapped_scenario: "unmapped_scenario";
        insufficient_evidence: "insufficient_evidence";
        dependency_cycle: "dependency_cycle";
        unsafe_write_overlap: "unsafe_write_overlap";
        missing_prerequisite: "missing_prerequisite";
        risky_assumption: "risky_assumption";
        compatibility_obligation: "compatibility_obligation";
        repository_scope_gap: "repository_scope_gap";
        independent_result_unavailable: "independent_result_unavailable";
    }>;
    severity: z.ZodEnum<{
        error: "error";
        critical: "critical";
        info: "info";
        warning: "warning";
    }>;
    blocking: z.ZodBoolean;
    summary: z.ZodString;
    references: z.ZodDefault<z.ZodArray<z.ZodString>>;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    remediation: z.ZodArray<z.ZodString>;
    inputRevision: z.ZodString;
}, z.core.$strict>;
export declare const ReadinessResultV2Schema: z.ZodObject<{
    resultId: z.ZodString;
    changeName: z.ZodString;
    evaluatedAt: z.ZodString;
    inputRevision: z.ZodString;
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        stale: "stale";
    }>;
    independent: z.ZodLiteral<true>;
    evaluator: z.ZodString;
    issues: z.ZodArray<z.ZodObject<{
        issueId: z.ZodString;
        kind: z.ZodEnum<{
            uncovered_requirement: "uncovered_requirement";
            unmapped_scenario: "unmapped_scenario";
            insufficient_evidence: "insufficient_evidence";
            dependency_cycle: "dependency_cycle";
            unsafe_write_overlap: "unsafe_write_overlap";
            missing_prerequisite: "missing_prerequisite";
            risky_assumption: "risky_assumption";
            compatibility_obligation: "compatibility_obligation";
            repository_scope_gap: "repository_scope_gap";
            independent_result_unavailable: "independent_result_unavailable";
        }>;
        severity: z.ZodEnum<{
            error: "error";
            critical: "critical";
            info: "info";
            warning: "warning";
        }>;
        blocking: z.ZodBoolean;
        summary: z.ZodString;
        references: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        remediation: z.ZodArray<z.ZodString>;
        inputRevision: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const FindingScopeV2Schema: z.ZodObject<{
    kind: z.ZodEnum<{
        symbol: "symbol";
        requirement: "requirement";
        scenario: "scenario";
        task: "task";
        contract: "contract";
        location: "location";
        release: "release";
    }>;
    identity: z.ZodString;
}, z.core.$strict>;
export declare const FindingStateV2Schema: z.ZodEnum<{
    human_needed: "human_needed";
    stale: "stale";
    open: "open";
    repaired: "repaired";
    independently_verified: "independently_verified";
    accepted_risk: "accepted_risk";
}>;
export declare const FindingTransitionV2Schema: z.ZodObject<{
    transitionId: z.ZodString;
    from: z.ZodOptional<z.ZodEnum<{
        human_needed: "human_needed";
        stale: "stale";
        open: "open";
        repaired: "repaired";
        independently_verified: "independently_verified";
        accepted_risk: "accepted_risk";
    }>>;
    to: z.ZodEnum<{
        human_needed: "human_needed";
        stale: "stale";
        open: "open";
        repaired: "repaired";
        independently_verified: "independently_verified";
        accepted_risk: "accepted_risk";
    }>;
    occurredAt: z.ZodString;
    actor: z.ZodObject<{
        kind: z.ZodEnum<{
            planner: "planner";
            plan_reviewer: "plan_reviewer";
            executor: "executor";
            pathfinder: "pathfinder";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automation: "automation";
            host: "host";
            analyzer: "analyzer";
            release_driver: "release_driver";
        }>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    reason: z.ZodString;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    sourceRevision: z.ZodString;
    expiry: z.ZodOptional<z.ZodString>;
    followUp: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const FindingLifecycleRecordV2Schema: z.ZodObject<{
    findingId: z.ZodString;
    providerId: z.ZodString;
    ruleId: z.ZodString;
    category: z.ZodString;
    scope: z.ZodObject<{
        kind: z.ZodEnum<{
            symbol: "symbol";
            requirement: "requirement";
            scenario: "scenario";
            task: "task";
            contract: "contract";
            location: "location";
            release: "release";
        }>;
        identity: z.ZodString;
    }, z.core.$strict>;
    severity: z.ZodEnum<{
        error: "error";
        critical: "critical";
        info: "info";
        warning: "warning";
    }>;
    blocking: z.ZodBoolean;
    summary: z.ZodString;
    requirementIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    state: z.ZodEnum<{
        human_needed: "human_needed";
        stale: "stale";
        open: "open";
        repaired: "repaired";
        independently_verified: "independently_verified";
        accepted_risk: "accepted_risk";
    }>;
    transitions: z.ZodArray<z.ZodObject<{
        transitionId: z.ZodString;
        from: z.ZodOptional<z.ZodEnum<{
            human_needed: "human_needed";
            stale: "stale";
            open: "open";
            repaired: "repaired";
            independently_verified: "independently_verified";
            accepted_risk: "accepted_risk";
        }>>;
        to: z.ZodEnum<{
            human_needed: "human_needed";
            stale: "stale";
            open: "open";
            repaired: "repaired";
            independently_verified: "independently_verified";
            accepted_risk: "accepted_risk";
        }>;
        occurredAt: z.ZodString;
        actor: z.ZodObject<{
            kind: z.ZodEnum<{
                planner: "planner";
                plan_reviewer: "plan_reviewer";
                executor: "executor";
                pathfinder: "pathfinder";
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
                automation: "automation";
                host: "host";
                analyzer: "analyzer";
                release_driver: "release_driver";
            }>;
            id: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        reason: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        sourceRevision: z.ZodString;
        expiry: z.ZodOptional<z.ZodString>;
        followUp: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const DebugHypothesisV2Schema: z.ZodObject<{
    hypothesisId: z.ZodString;
    statement: z.ZodString;
    status: z.ZodEnum<{
        rejected: "rejected";
        active: "active";
        supported: "supported";
        inconclusive: "inconclusive";
    }>;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export declare const DebugExperimentV2Schema: z.ZodObject<{
    experimentId: z.ZodString;
    fingerprint: z.ZodString;
    hypothesisId: z.ZodString;
    action: z.ZodString;
    targetedEvidence: z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    sourceRevision: z.ZodString;
    result: z.ZodEnum<{
        planned: "planned";
        inconclusive: "inconclusive";
        passed: "passed";
        failed: "failed";
        rejected_duplicate: "rejected_duplicate";
    }>;
    observation: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const DebugConclusionV2Schema: z.ZodObject<{
    conclusionId: z.ZodString;
    kind: z.ZodEnum<{
        conclusion: "conclusion";
        root_cause: "root_cause";
    }>;
    statement: z.ZodString;
    experimentIds: z.ZodArray<z.ZodString>;
    evidence: z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    sourceRevision: z.ZodString;
}, z.core.$strict>;
export declare const DebugVerificationV2Schema: z.ZodObject<{
    verificationId: z.ZodString;
    findingId: z.ZodOptional<z.ZodString>;
    checkId: z.ZodOptional<z.ZodString>;
    verifier: z.ZodObject<{
        kind: z.ZodEnum<{
            verifier: "verifier";
            human: "human";
        }>;
        id: z.ZodString;
    }, z.core.$strict>;
    evidence: z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    failBeforeEvidence: z.ZodOptional<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    passAfterEvidence: z.ZodOptional<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    exemption: z.ZodOptional<z.ZodObject<{
        reason: z.ZodString;
        acceptedBy: z.ZodString;
    }, z.core.$strict>>;
    sourceRevision: z.ZodString;
    verifiedAt: z.ZodString;
}, z.core.$strict>;
export declare const DebugSessionV2Schema: z.ZodObject<{
    sessionId: z.ZodString;
    logicalFailureId: z.ZodString;
    findingId: z.ZodOptional<z.ZodString>;
    references: z.ZodArray<z.ZodString>;
    status: z.ZodEnum<{
        human_needed: "human_needed";
        active: "active";
        resolved: "resolved";
    }>;
    startedAt: z.ZodString;
    updatedAt: z.ZodString;
    hypotheses: z.ZodArray<z.ZodObject<{
        hypothesisId: z.ZodString;
        statement: z.ZodString;
        status: z.ZodEnum<{
            rejected: "rejected";
            active: "active";
            supported: "supported";
            inconclusive: "inconclusive";
        }>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
    experiments: z.ZodArray<z.ZodObject<{
        experimentId: z.ZodString;
        fingerprint: z.ZodString;
        hypothesisId: z.ZodString;
        action: z.ZodString;
        targetedEvidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
        result: z.ZodEnum<{
            planned: "planned";
            inconclusive: "inconclusive";
            passed: "passed";
            failed: "failed";
            rejected_duplicate: "rejected_duplicate";
        }>;
        observation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    conclusions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        conclusionId: z.ZodString;
        kind: z.ZodEnum<{
            conclusion: "conclusion";
            root_cause: "root_cause";
        }>;
        statement: z.ZodString;
        experimentIds: z.ZodArray<z.ZodString>;
        evidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
    }, z.core.$strict>>>;
    changedReferences: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    unresolvedQuestions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    nextAction: z.ZodOptional<z.ZodString>;
    regressionEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    verification: z.ZodOptional<z.ZodObject<{
        verificationId: z.ZodString;
        findingId: z.ZodOptional<z.ZodString>;
        checkId: z.ZodOptional<z.ZodString>;
        verifier: z.ZodObject<{
            kind: z.ZodEnum<{
                verifier: "verifier";
                human: "human";
            }>;
            id: z.ZodString;
        }, z.core.$strict>;
        evidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        failBeforeEvidence: z.ZodOptional<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        passAfterEvidence: z.ZodOptional<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        exemption: z.ZodOptional<z.ZodObject<{
            reason: z.ZodString;
            acceptedBy: z.ZodString;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
        verifiedAt: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const UatScenarioV2Schema: z.ZodObject<{
    scenarioId: z.ZodString;
    requirementId: z.ZodString;
    taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    prerequisites: z.ZodDefault<z.ZodArray<z.ZodString>>;
    action: z.ZodString;
    expectedResult: z.ZodString;
    status: z.ZodEnum<{
        blocked: "blocked";
        stale: "stale";
        passed: "passed";
        failed: "failed";
        awaiting_human: "awaiting_human";
        awaiting_retest: "awaiting_retest";
        accepted_limitation: "accepted_limitation";
    }>;
    disposition: z.ZodOptional<z.ZodObject<{
        actor: z.ZodString;
        recordedAt: z.ZodString;
        notes: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
    sourceRevision: z.ZodString;
}, z.core.$strict>;
export declare const ReleaseCandidateV2Schema: z.ZodObject<{
    candidateId: z.ZodString;
    surface: z.ZodEnum<{
        node_package: "node_package";
        cli: "cli";
        extension: "extension";
        plugin: "plugin";
        configured: "configured";
    }>;
    applicable: z.ZodBoolean;
    activationEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    artifactDigest: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        pending: "pending";
        not_applicable: "not_applicable";
    }>;
    checks: z.ZodArray<z.ZodObject<{
        checkId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            warn: "warn";
            skipped: "skipped";
        }>;
        summary: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const AssuranceCheckV2Schema: z.ZodObject<{
    checkId: z.ZodString;
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        pending: "pending";
        warn: "warn";
        skipped: "skipped";
    }>;
    summary: z.ZodString;
    evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    readOnly: z.ZodDefault<z.ZodBoolean>;
    independent: z.ZodDefault<z.ZodBoolean>;
    remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
    kind: z.ZodEnum<{
        tdd: "tdd";
        "artifact-validation": "artifact-validation";
        "repository-checks": "repository-checks";
        "targeted-tests": "targeted-tests";
        "scenario-coverage": "scenario-coverage";
        "code-review": "code-review";
        "goal-verification": "goal-verification";
        security: "security";
        integration: "integration";
        ui: "ui";
        "ai-evaluation": "ai-evaluation";
        compatibility: "compatibility";
        documentation: "documentation";
        "human-uat": "human-uat";
        "repository-context": "repository-context";
        "plan-readiness": "plan-readiness";
        "release-assurance": "release-assurance";
        "planning-assurance": "planning-assurance";
    }>;
}, z.core.$strict>;
export declare const RelayEventActorV2Schema: z.ZodObject<{
    kind: z.ZodEnum<{
        planner: "planner";
        plan_reviewer: "plan_reviewer";
        executor: "executor";
        pathfinder: "pathfinder";
        reviewer: "reviewer";
        verifier: "verifier";
        human: "human";
        automation: "automation";
        host: "host";
        analyzer: "analyzer";
        release_driver: "release_driver";
    }>;
    id: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const HostAdapterProvenanceV1Schema: z.ZodObject<{
    adapterId: z.ZodString;
    adapterVersion: z.ZodNumber;
    runtimeVersion: z.ZodString;
    modelRef: z.ZodOptional<z.ZodString>;
    agentDispatch: z.ZodEnum<{
        available: "available";
        disabled: "disabled";
        probe_failed: "probe_failed";
        unsupported_version: "unsupported_version";
    }>;
    parallelism: z.ZodEnum<{
        available: "available";
        disabled: "disabled";
        probe_failed: "probe_failed";
        unsupported_version: "unsupported_version";
    }>;
    qualifiedAt: z.ZodString;
}, z.core.$strict>;
export declare const RelayEventPayloadV2Schema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"host.adapter_qualified">;
    adapter: z.ZodObject<{
        adapterId: z.ZodString;
        adapterVersion: z.ZodNumber;
        runtimeVersion: z.ZodString;
        modelRef: z.ZodOptional<z.ZodString>;
        agentDispatch: z.ZodEnum<{
            available: "available";
            disabled: "disabled";
            probe_failed: "probe_failed";
            unsupported_version: "unsupported_version";
        }>;
        parallelism: z.ZodEnum<{
            available: "available";
            disabled: "disabled";
            probe_failed: "probe_failed";
            unsupported_version: "unsupported_version";
        }>;
        qualifiedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"task.transition">;
    taskId: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        in_progress: "in_progress";
        complete: "complete";
        blocked: "blocked";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"evidence.recorded">;
    evidence: z.ZodObject<{
        evidenceId: z.ZodString;
        taskId: z.ZodOptional<z.ZodString>;
        phase: z.ZodEnum<{
            check: "check";
            red: "red";
            green: "green";
            refactor: "refactor";
            review: "review";
            verify: "verify";
            human: "human";
        }>;
        checkId: z.ZodString;
        observedAt: z.ZodString;
        sourceState: z.ZodString;
        sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        exitCode: z.ZodOptional<z.ZodNumber>;
        result: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        outputDigest: z.ZodString;
        relevantFailure: z.ZodOptional<z.ZodBoolean>;
        preExistingFailure: z.ZodDefault<z.ZodBoolean>;
        origin: z.ZodEnum<{
            executor: "executor";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automated: "automated";
        }>;
        reference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"finding.recorded">;
    finding: z.ZodObject<{
        findingId: z.ZodString;
        requirementId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        origin: z.ZodEnum<{
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"deviation.recorded">;
    deviation: z.ZodObject<{
        deviationId: z.ZodString;
        taskId: z.ZodString;
        requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        recordedAt: z.ZodString;
        summary: z.ZodString;
        disposition: z.ZodEnum<{
            accepted: "accepted";
            pending: "pending";
            rejected: "rejected";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"repair.recorded">;
    repair: z.ZodObject<{
        repairId: z.ZodString;
        checkId: z.ZodString;
        attempt: z.ZodNumber;
        startedAt: z.ZodString;
        completedAt: z.ZodOptional<z.ZodString>;
        changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            pending: "pending";
            exhausted: "exhausted";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"human.decision">;
    gateId: z.ZodString;
    decision: z.ZodEnum<{
        accepted: "accepted";
        rejected: "rejected";
        requested: "requested";
    }>;
    reason: z.ZodOptional<z.ZodString>;
    resultDigest: z.ZodOptional<z.ZodString>;
    evidenceDigest: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"context.compiled">;
    context: z.ZodObject<{
        contextId: z.ZodString;
        changeName: z.ZodString;
        inputRevision: z.ZodString;
        compiledAt: z.ZodString;
        status: z.ZodEnum<{
            current: "current";
            stale: "stale";
            unavailable: "unavailable";
        }>;
        claims: z.ZodArray<z.ZodObject<{
            claimId: z.ZodString;
            category: z.ZodEnum<{
                unknown: "unknown";
                implementation_analog: "implementation_analog";
                affected_module: "affected_module";
                test_convention: "test_convention";
                architecture_boundary: "architecture_boundary";
                downstream_consumer: "downstream_consumer";
                conflicting_pattern: "conflicting_pattern";
            }>;
            classification: z.ZodEnum<{
                unknown: "unknown";
                observed: "observed";
                inferred: "inferred";
                conflict: "conflict";
            }>;
            summary: z.ZodString;
            confidence: z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            relatedOpenSpecIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        staleReferenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"context.stale">;
    contextId: z.ZodString;
    referenceIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"readiness.evaluated">;
    result: z.ZodObject<{
        resultId: z.ZodString;
        changeName: z.ZodString;
        evaluatedAt: z.ZodString;
        inputRevision: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            stale: "stale";
        }>;
        independent: z.ZodLiteral<true>;
        evaluator: z.ZodString;
        issues: z.ZodArray<z.ZodObject<{
            issueId: z.ZodString;
            kind: z.ZodEnum<{
                uncovered_requirement: "uncovered_requirement";
                unmapped_scenario: "unmapped_scenario";
                insufficient_evidence: "insufficient_evidence";
                dependency_cycle: "dependency_cycle";
                unsafe_write_overlap: "unsafe_write_overlap";
                missing_prerequisite: "missing_prerequisite";
                risky_assumption: "risky_assumption";
                compatibility_obligation: "compatibility_obligation";
                repository_scope_gap: "repository_scope_gap";
                independent_result_unavailable: "independent_result_unavailable";
            }>;
            severity: z.ZodEnum<{
                error: "error";
                critical: "critical";
                info: "info";
                warning: "warning";
            }>;
            blocking: z.ZodBoolean;
            summary: z.ZodString;
            references: z.ZodDefault<z.ZodArray<z.ZodString>>;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            remediation: z.ZodArray<z.ZodString>;
            inputRevision: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"readiness.stale">;
    resultId: z.ZodString;
    inputRevision: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"semantic.classified">;
    classification: z.ZodObject<{
        requirementId: z.ZodString;
        level: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
        rationale: z.ZodString;
        triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        sourceRevision: z.ZodString;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        provenance: z.ZodDefault<z.ZodEnum<{
            planner: "planner";
            plan_reviewer: "plan_reviewer";
            tier0_self_review: "tier0_self_review";
            deterministic_lower_bound: "deterministic_lower_bound";
        }>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"semantic.downgrade_recorded">;
    downgrade: z.ZodObject<{
        requirementId: z.ZodString;
        requiredLevel: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
        achievedLevel: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
        reason: z.ZodString;
        actor: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodString;
        status: z.ZodEnum<{
            accepted: "accepted";
            human_needed: "human_needed";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"pathfinder.completed">;
    result: z.ZodObject<{
        pathfinderId: z.ZodString;
        question: z.ZodString;
        assumptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
        experiments: z.ZodDefault<z.ZodArray<z.ZodString>>;
        observations: z.ZodDefault<z.ZodArray<z.ZodString>>;
        counterexamples: z.ZodDefault<z.ZodArray<z.ZodString>>;
        conclusion: z.ZodString;
        confidence: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        routing: z.ZodEnum<{
            planner: "planner";
            human_needed: "human_needed";
            discussion: "discussion";
        }>;
        sourceRevision: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"plan.reviewed">;
    review: z.ZodObject<{
        reviewId: z.ZodString;
        revision: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
        }>;
        independent: z.ZodBoolean;
        reviewerId: z.ZodOptional<z.ZodString>;
        findingIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        reviewedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"finding.routed">;
    route: z.ZodObject<{
        findingId: z.ZodString;
        source: z.ZodOptional<z.ZodEnum<{
            planner: "planner";
            discussion: "discussion";
            executor: "executor";
            pathfinder: "pathfinder";
            reviewer: "reviewer";
            verifier: "verifier";
        }>>;
        route: z.ZodEnum<{
            planner: "planner";
            human_needed: "human_needed";
            discussion: "discussion";
            executor: "executor";
            pathfinder: "pathfinder";
            verifier: "verifier";
        }>;
        taskId: z.ZodOptional<z.ZodString>;
        planRevision: z.ZodString;
        reason: z.ZodString;
        attempt: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"plan.approved">;
    approval: z.ZodObject<{
        revision: z.ZodString;
        approvedAt: z.ZodString;
        independent: z.ZodBoolean;
        reviewerId: z.ZodOptional<z.ZodString>;
        semanticLevels: z.ZodDefault<z.ZodArray<z.ZodObject<{
            requirementId: z.ZodString;
            level: z.ZodEnum<{
                simple: "simple";
                behavioral: "behavioral";
                modeling: "modeling";
            }>;
        }, z.core.$strict>>>;
        openDispositionIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"plan.stale">;
    approvedRevision: z.ZodString;
    currentRevision: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"finding.discovered">;
    finding: z.ZodObject<{
        findingId: z.ZodString;
        providerId: z.ZodString;
        ruleId: z.ZodString;
        category: z.ZodString;
        scope: z.ZodObject<{
            kind: z.ZodEnum<{
                symbol: "symbol";
                requirement: "requirement";
                scenario: "scenario";
                task: "task";
                contract: "contract";
                location: "location";
                release: "release";
            }>;
            identity: z.ZodString;
        }, z.core.$strict>;
        severity: z.ZodEnum<{
            error: "error";
            critical: "critical";
            info: "info";
            warning: "warning";
        }>;
        blocking: z.ZodBoolean;
        summary: z.ZodString;
        requirementIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        state: z.ZodEnum<{
            human_needed: "human_needed";
            stale: "stale";
            open: "open";
            repaired: "repaired";
            independently_verified: "independently_verified";
            accepted_risk: "accepted_risk";
        }>;
        transitions: z.ZodArray<z.ZodObject<{
            transitionId: z.ZodString;
            from: z.ZodOptional<z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>>;
            to: z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>;
            occurredAt: z.ZodString;
            actor: z.ZodObject<{
                kind: z.ZodEnum<{
                    planner: "planner";
                    plan_reviewer: "plan_reviewer";
                    executor: "executor";
                    pathfinder: "pathfinder";
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                    automation: "automation";
                    host: "host";
                    analyzer: "analyzer";
                    release_driver: "release_driver";
                }>;
                id: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
            reason: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            sourceRevision: z.ZodString;
            expiry: z.ZodOptional<z.ZodString>;
            followUp: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"finding.transitioned">;
    findingId: z.ZodString;
    transition: z.ZodObject<{
        transitionId: z.ZodString;
        from: z.ZodOptional<z.ZodEnum<{
            human_needed: "human_needed";
            stale: "stale";
            open: "open";
            repaired: "repaired";
            independently_verified: "independently_verified";
            accepted_risk: "accepted_risk";
        }>>;
        to: z.ZodEnum<{
            human_needed: "human_needed";
            stale: "stale";
            open: "open";
            repaired: "repaired";
            independently_verified: "independently_verified";
            accepted_risk: "accepted_risk";
        }>;
        occurredAt: z.ZodString;
        actor: z.ZodObject<{
            kind: z.ZodEnum<{
                planner: "planner";
                plan_reviewer: "plan_reviewer";
                executor: "executor";
                pathfinder: "pathfinder";
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
                automation: "automation";
                host: "host";
                analyzer: "analyzer";
                release_driver: "release_driver";
            }>;
            id: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        reason: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        sourceRevision: z.ZodString;
        expiry: z.ZodOptional<z.ZodString>;
        followUp: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"finding.stale">;
    findingId: z.ZodString;
    sourceRevision: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.session_started">;
    session: z.ZodObject<{
        sessionId: z.ZodString;
        logicalFailureId: z.ZodString;
        findingId: z.ZodOptional<z.ZodString>;
        references: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            active: "active";
            resolved: "resolved";
        }>;
        startedAt: z.ZodString;
        updatedAt: z.ZodString;
        hypotheses: z.ZodArray<z.ZodObject<{
            hypothesisId: z.ZodString;
            statement: z.ZodString;
            status: z.ZodEnum<{
                rejected: "rejected";
                active: "active";
                supported: "supported";
                inconclusive: "inconclusive";
            }>;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
        experiments: z.ZodArray<z.ZodObject<{
            experimentId: z.ZodString;
            fingerprint: z.ZodString;
            hypothesisId: z.ZodString;
            action: z.ZodString;
            targetedEvidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
            result: z.ZodEnum<{
                planned: "planned";
                inconclusive: "inconclusive";
                passed: "passed";
                failed: "failed";
                rejected_duplicate: "rejected_duplicate";
            }>;
            observation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        conclusions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            conclusionId: z.ZodString;
            kind: z.ZodEnum<{
                conclusion: "conclusion";
                root_cause: "root_cause";
            }>;
            statement: z.ZodString;
            experimentIds: z.ZodArray<z.ZodString>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
        }, z.core.$strict>>>;
        changedReferences: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        unresolvedQuestions: z.ZodDefault<z.ZodArray<z.ZodString>>;
        nextAction: z.ZodOptional<z.ZodString>;
        regressionEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        verification: z.ZodOptional<z.ZodObject<{
            verificationId: z.ZodString;
            findingId: z.ZodOptional<z.ZodString>;
            checkId: z.ZodOptional<z.ZodString>;
            verifier: z.ZodObject<{
                kind: z.ZodEnum<{
                    verifier: "verifier";
                    human: "human";
                }>;
                id: z.ZodString;
            }, z.core.$strict>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            failBeforeEvidence: z.ZodOptional<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            passAfterEvidence: z.ZodOptional<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            exemption: z.ZodOptional<z.ZodObject<{
                reason: z.ZodString;
                acceptedBy: z.ZodString;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
            verifiedAt: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.hypothesis_recorded">;
    sessionId: z.ZodString;
    hypothesis: z.ZodObject<{
        hypothesisId: z.ZodString;
        statement: z.ZodString;
        status: z.ZodEnum<{
            rejected: "rejected";
            active: "active";
            supported: "supported";
            inconclusive: "inconclusive";
        }>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.experiment_recorded">;
    sessionId: z.ZodString;
    experiment: z.ZodObject<{
        experimentId: z.ZodString;
        fingerprint: z.ZodString;
        hypothesisId: z.ZodString;
        action: z.ZodString;
        targetedEvidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
        result: z.ZodEnum<{
            planned: "planned";
            inconclusive: "inconclusive";
            passed: "passed";
            failed: "failed";
            rejected_duplicate: "rejected_duplicate";
        }>;
        observation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.conclusion_recorded">;
    sessionId: z.ZodString;
    conclusion: z.ZodObject<{
        conclusionId: z.ZodString;
        kind: z.ZodEnum<{
            conclusion: "conclusion";
            root_cause: "root_cause";
        }>;
        statement: z.ZodString;
        experimentIds: z.ZodArray<z.ZodString>;
        evidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.reference_changed">;
    sessionId: z.ZodString;
    reference: z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.question_recorded">;
    sessionId: z.ZodString;
    question: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.next_action_recorded">;
    sessionId: z.ZodString;
    nextAction: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.verification_recorded">;
    sessionId: z.ZodString;
    verification: z.ZodObject<{
        verificationId: z.ZodString;
        findingId: z.ZodOptional<z.ZodString>;
        checkId: z.ZodOptional<z.ZodString>;
        verifier: z.ZodObject<{
            kind: z.ZodEnum<{
                verifier: "verifier";
                human: "human";
            }>;
            id: z.ZodString;
        }, z.core.$strict>;
        evidence: z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        failBeforeEvidence: z.ZodOptional<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        passAfterEvidence: z.ZodOptional<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        exemption: z.ZodOptional<z.ZodObject<{
            reason: z.ZodString;
            acceptedBy: z.ZodString;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
        verifiedAt: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.verification_stale">;
    sessionId: z.ZodString;
    verificationId: z.ZodString;
    sourceRevision: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.session_resolved">;
    sessionId: z.ZodString;
    verificationId: z.ZodString;
    nextAction: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"debug.session_updated">;
    sessionId: z.ZodString;
    status: z.ZodEnum<{
        human_needed: "human_needed";
        active: "active";
        resolved: "resolved";
    }>;
    nextAction: z.ZodOptional<z.ZodString>;
    regressionEvidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"uat.scenario_recorded">;
    scenario: z.ZodObject<{
        scenarioId: z.ZodString;
        requirementId: z.ZodString;
        taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        prerequisites: z.ZodDefault<z.ZodArray<z.ZodString>>;
        action: z.ZodString;
        expectedResult: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            stale: "stale";
            passed: "passed";
            failed: "failed";
            awaiting_human: "awaiting_human";
            awaiting_retest: "awaiting_retest";
            accepted_limitation: "accepted_limitation";
        }>;
        disposition: z.ZodOptional<z.ZodObject<{
            actor: z.ZodString;
            recordedAt: z.ZodString;
            notes: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"uat.scenario_retest">;
    scenarioId: z.ZodString;
    sourceRevision: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"uat.scenario_stale">;
    scenarioId: z.ZodString;
    sourceRevision: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"scenario.coverage_reconciled">;
    coverage: z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        scenarioId: z.ZodString;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            covered: "covered";
            missing: "missing";
        }>;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        acceptanceInstructions: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"uat.disposition_recorded">;
    scenarioId: z.ZodString;
    status: z.ZodEnum<{
        blocked: "blocked";
        passed: "passed";
        failed: "failed";
        accepted_limitation: "accepted_limitation";
    }>;
    actor: z.ZodString;
    notes: z.ZodString;
    sourceRevision: z.ZodString;
    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
        referenceId: z.ZodString;
        kind: z.ZodEnum<{
            artifact: "artifact";
            repository: "repository";
            generated: "generated";
            external: "external";
        }>;
        path: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        digest: z.ZodOptional<z.ZodString>;
        available: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"release.evaluated">;
    candidate: z.ZodObject<{
        candidateId: z.ZodString;
        surface: z.ZodEnum<{
            node_package: "node_package";
            cli: "cli";
            extension: "extension";
            plugin: "plugin";
            configured: "configured";
        }>;
        applicable: z.ZodBoolean;
        activationEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        artifactDigest: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            not_applicable: "not_applicable";
        }>;
        checks: z.ZodArray<z.ZodObject<{
            checkId: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                pending: "pending";
                warn: "warn";
                skipped: "skipped";
            }>;
            summary: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"checks.evaluated">;
    checks: z.ZodArray<z.ZodObject<{
        checkId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            warn: "warn";
            skipped: "skipped";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        readOnly: z.ZodDefault<z.ZodBoolean>;
        independent: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
        kind: z.ZodEnum<{
            tdd: "tdd";
            "artifact-validation": "artifact-validation";
            "repository-checks": "repository-checks";
            "targeted-tests": "targeted-tests";
            "scenario-coverage": "scenario-coverage";
            "code-review": "code-review";
            "goal-verification": "goal-verification";
            security: "security";
            integration: "integration";
            ui: "ui";
            "ai-evaluation": "ai-evaluation";
            compatibility: "compatibility";
            documentation: "documentation";
            "human-uat": "human-uat";
            "repository-context": "repository-context";
            "plan-readiness": "plan-readiness";
            "release-assurance": "release-assurance";
            "planning-assurance": "planning-assurance";
        }>;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"run.status_updated">;
    status: z.ZodEnum<{
        error: "error";
        complete: "complete";
        blocked: "blocked";
        planned: "planned";
        running: "running";
        checking: "checking";
    }>;
}, z.core.$strict>, z.ZodObject<{
    type: z.ZodLiteral<"human.disposition_recorded">;
    subjectId: z.ZodString;
    disposition: z.ZodEnum<{
        human_needed: "human_needed";
        accepted_risk: "accepted_risk";
    }>;
    actor: z.ZodString;
    reason: z.ZodString;
    scope: z.ZodString;
    expiry: z.ZodOptional<z.ZodString>;
}, z.core.$strict>], "type">;
export declare const RelayEventEnvelopeV2Schema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    eventId: z.ZodString;
    runId: z.ZodString;
    changeName: z.ZodString;
    occurredAt: z.ZodString;
    sourceDigests: z.ZodRecord<z.ZodString, z.ZodString>;
    actor: z.ZodObject<{
        kind: z.ZodEnum<{
            planner: "planner";
            plan_reviewer: "plan_reviewer";
            executor: "executor";
            pathfinder: "pathfinder";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automation: "automation";
            host: "host";
            analyzer: "analyzer";
            release_driver: "release_driver";
        }>;
        id: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    provenance: z.ZodObject<{
        origin: z.ZodString;
        adapter: z.ZodOptional<z.ZodString>;
        command: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    payloadDigest: z.ZodString;
    payload: z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"host.adapter_qualified">;
        adapter: z.ZodObject<{
            adapterId: z.ZodString;
            adapterVersion: z.ZodNumber;
            runtimeVersion: z.ZodString;
            modelRef: z.ZodOptional<z.ZodString>;
            agentDispatch: z.ZodEnum<{
                available: "available";
                disabled: "disabled";
                probe_failed: "probe_failed";
                unsupported_version: "unsupported_version";
            }>;
            parallelism: z.ZodEnum<{
                available: "available";
                disabled: "disabled";
                probe_failed: "probe_failed";
                unsupported_version: "unsupported_version";
            }>;
            qualifiedAt: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"task.transition">;
        taskId: z.ZodString;
        status: z.ZodEnum<{
            pending: "pending";
            in_progress: "in_progress";
            complete: "complete";
            blocked: "blocked";
        }>;
        reason: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"evidence.recorded">;
        evidence: z.ZodObject<{
            evidenceId: z.ZodString;
            taskId: z.ZodOptional<z.ZodString>;
            phase: z.ZodEnum<{
                check: "check";
                red: "red";
                green: "green";
                refactor: "refactor";
                review: "review";
                verify: "verify";
                human: "human";
            }>;
            checkId: z.ZodString;
            observedAt: z.ZodString;
            sourceState: z.ZodString;
            sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            exitCode: z.ZodOptional<z.ZodNumber>;
            result: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                warn: "warn";
            }>;
            outputDigest: z.ZodString;
            relevantFailure: z.ZodOptional<z.ZodBoolean>;
            preExistingFailure: z.ZodDefault<z.ZodBoolean>;
            origin: z.ZodEnum<{
                executor: "executor";
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
                automated: "automated";
            }>;
            reference: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"finding.recorded">;
        finding: z.ZodObject<{
            findingId: z.ZodString;
            requirementId: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                human_needed: "human_needed";
                fail: "fail";
                warn: "warn";
            }>;
            summary: z.ZodString;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            origin: z.ZodEnum<{
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"deviation.recorded">;
        deviation: z.ZodObject<{
            deviationId: z.ZodString;
            taskId: z.ZodString;
            requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
            recordedAt: z.ZodString;
            summary: z.ZodString;
            disposition: z.ZodEnum<{
                accepted: "accepted";
                pending: "pending";
                rejected: "rejected";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"repair.recorded">;
        repair: z.ZodObject<{
            repairId: z.ZodString;
            checkId: z.ZodString;
            attempt: z.ZodNumber;
            startedAt: z.ZodString;
            completedAt: z.ZodOptional<z.ZodString>;
            changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
            result: z.ZodEnum<{
                pass: "pass";
                fail: "fail";
                pending: "pending";
                exhausted: "exhausted";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"human.decision">;
        gateId: z.ZodString;
        decision: z.ZodEnum<{
            accepted: "accepted";
            rejected: "rejected";
            requested: "requested";
        }>;
        reason: z.ZodOptional<z.ZodString>;
        resultDigest: z.ZodOptional<z.ZodString>;
        evidenceDigest: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"context.compiled">;
        context: z.ZodObject<{
            contextId: z.ZodString;
            changeName: z.ZodString;
            inputRevision: z.ZodString;
            compiledAt: z.ZodString;
            status: z.ZodEnum<{
                current: "current";
                stale: "stale";
                unavailable: "unavailable";
            }>;
            claims: z.ZodArray<z.ZodObject<{
                claimId: z.ZodString;
                category: z.ZodEnum<{
                    unknown: "unknown";
                    implementation_analog: "implementation_analog";
                    affected_module: "affected_module";
                    test_convention: "test_convention";
                    architecture_boundary: "architecture_boundary";
                    downstream_consumer: "downstream_consumer";
                    conflicting_pattern: "conflicting_pattern";
                }>;
                classification: z.ZodEnum<{
                    unknown: "unknown";
                    observed: "observed";
                    inferred: "inferred";
                    conflict: "conflict";
                }>;
                summary: z.ZodString;
                confidence: z.ZodEnum<{
                    low: "low";
                    medium: "medium";
                    high: "high";
                }>;
                evidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                relatedOpenSpecIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>>;
            staleReferenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"context.stale">;
        contextId: z.ZodString;
        referenceIds: z.ZodArray<z.ZodString>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"readiness.evaluated">;
        result: z.ZodObject<{
            resultId: z.ZodString;
            changeName: z.ZodString;
            evaluatedAt: z.ZodString;
            inputRevision: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                stale: "stale";
            }>;
            independent: z.ZodLiteral<true>;
            evaluator: z.ZodString;
            issues: z.ZodArray<z.ZodObject<{
                issueId: z.ZodString;
                kind: z.ZodEnum<{
                    uncovered_requirement: "uncovered_requirement";
                    unmapped_scenario: "unmapped_scenario";
                    insufficient_evidence: "insufficient_evidence";
                    dependency_cycle: "dependency_cycle";
                    unsafe_write_overlap: "unsafe_write_overlap";
                    missing_prerequisite: "missing_prerequisite";
                    risky_assumption: "risky_assumption";
                    compatibility_obligation: "compatibility_obligation";
                    repository_scope_gap: "repository_scope_gap";
                    independent_result_unavailable: "independent_result_unavailable";
                }>;
                severity: z.ZodEnum<{
                    error: "error";
                    critical: "critical";
                    info: "info";
                    warning: "warning";
                }>;
                blocking: z.ZodBoolean;
                summary: z.ZodString;
                references: z.ZodDefault<z.ZodArray<z.ZodString>>;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                remediation: z.ZodArray<z.ZodString>;
                inputRevision: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"readiness.stale">;
        resultId: z.ZodString;
        inputRevision: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"semantic.classified">;
        classification: z.ZodObject<{
            requirementId: z.ZodString;
            level: z.ZodEnum<{
                simple: "simple";
                behavioral: "behavioral";
                modeling: "modeling";
            }>;
            rationale: z.ZodString;
            triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
            sourceRevision: z.ZodString;
            evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
            provenance: z.ZodDefault<z.ZodEnum<{
                planner: "planner";
                plan_reviewer: "plan_reviewer";
                tier0_self_review: "tier0_self_review";
                deterministic_lower_bound: "deterministic_lower_bound";
            }>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"semantic.downgrade_recorded">;
        downgrade: z.ZodObject<{
            requirementId: z.ZodString;
            requiredLevel: z.ZodEnum<{
                simple: "simple";
                behavioral: "behavioral";
                modeling: "modeling";
            }>;
            achievedLevel: z.ZodEnum<{
                simple: "simple";
                behavioral: "behavioral";
                modeling: "modeling";
            }>;
            reason: z.ZodString;
            actor: z.ZodOptional<z.ZodString>;
            sourceRevision: z.ZodString;
            status: z.ZodEnum<{
                accepted: "accepted";
                human_needed: "human_needed";
            }>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"pathfinder.completed">;
        result: z.ZodObject<{
            pathfinderId: z.ZodString;
            question: z.ZodString;
            assumptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
            experiments: z.ZodDefault<z.ZodArray<z.ZodString>>;
            observations: z.ZodDefault<z.ZodArray<z.ZodString>>;
            counterexamples: z.ZodDefault<z.ZodArray<z.ZodString>>;
            conclusion: z.ZodString;
            confidence: z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>;
            evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
            routing: z.ZodEnum<{
                planner: "planner";
                human_needed: "human_needed";
                discussion: "discussion";
            }>;
            sourceRevision: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"plan.reviewed">;
        review: z.ZodObject<{
            reviewId: z.ZodString;
            revision: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
            }>;
            independent: z.ZodBoolean;
            reviewerId: z.ZodOptional<z.ZodString>;
            findingIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
            reviewedAt: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"finding.routed">;
        route: z.ZodObject<{
            findingId: z.ZodString;
            source: z.ZodOptional<z.ZodEnum<{
                planner: "planner";
                discussion: "discussion";
                executor: "executor";
                pathfinder: "pathfinder";
                reviewer: "reviewer";
                verifier: "verifier";
            }>>;
            route: z.ZodEnum<{
                planner: "planner";
                human_needed: "human_needed";
                discussion: "discussion";
                executor: "executor";
                pathfinder: "pathfinder";
                verifier: "verifier";
            }>;
            taskId: z.ZodOptional<z.ZodString>;
            planRevision: z.ZodString;
            reason: z.ZodString;
            attempt: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"plan.approved">;
        approval: z.ZodObject<{
            revision: z.ZodString;
            approvedAt: z.ZodString;
            independent: z.ZodBoolean;
            reviewerId: z.ZodOptional<z.ZodString>;
            semanticLevels: z.ZodDefault<z.ZodArray<z.ZodObject<{
                requirementId: z.ZodString;
                level: z.ZodEnum<{
                    simple: "simple";
                    behavioral: "behavioral";
                    modeling: "modeling";
                }>;
            }, z.core.$strict>>>;
            openDispositionIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"plan.stale">;
        approvedRevision: z.ZodString;
        currentRevision: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"finding.discovered">;
        finding: z.ZodObject<{
            findingId: z.ZodString;
            providerId: z.ZodString;
            ruleId: z.ZodString;
            category: z.ZodString;
            scope: z.ZodObject<{
                kind: z.ZodEnum<{
                    symbol: "symbol";
                    requirement: "requirement";
                    scenario: "scenario";
                    task: "task";
                    contract: "contract";
                    location: "location";
                    release: "release";
                }>;
                identity: z.ZodString;
            }, z.core.$strict>;
            severity: z.ZodEnum<{
                error: "error";
                critical: "critical";
                info: "info";
                warning: "warning";
            }>;
            blocking: z.ZodBoolean;
            summary: z.ZodString;
            requirementIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            state: z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>;
            transitions: z.ZodArray<z.ZodObject<{
                transitionId: z.ZodString;
                from: z.ZodOptional<z.ZodEnum<{
                    human_needed: "human_needed";
                    stale: "stale";
                    open: "open";
                    repaired: "repaired";
                    independently_verified: "independently_verified";
                    accepted_risk: "accepted_risk";
                }>>;
                to: z.ZodEnum<{
                    human_needed: "human_needed";
                    stale: "stale";
                    open: "open";
                    repaired: "repaired";
                    independently_verified: "independently_verified";
                    accepted_risk: "accepted_risk";
                }>;
                occurredAt: z.ZodString;
                actor: z.ZodObject<{
                    kind: z.ZodEnum<{
                        planner: "planner";
                        plan_reviewer: "plan_reviewer";
                        executor: "executor";
                        pathfinder: "pathfinder";
                        reviewer: "reviewer";
                        verifier: "verifier";
                        human: "human";
                        automation: "automation";
                        host: "host";
                        analyzer: "analyzer";
                        release_driver: "release_driver";
                    }>;
                    id: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>;
                reason: z.ZodString;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                sourceRevision: z.ZodString;
                expiry: z.ZodOptional<z.ZodString>;
                followUp: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"finding.transitioned">;
        findingId: z.ZodString;
        transition: z.ZodObject<{
            transitionId: z.ZodString;
            from: z.ZodOptional<z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>>;
            to: z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>;
            occurredAt: z.ZodString;
            actor: z.ZodObject<{
                kind: z.ZodEnum<{
                    planner: "planner";
                    plan_reviewer: "plan_reviewer";
                    executor: "executor";
                    pathfinder: "pathfinder";
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                    automation: "automation";
                    host: "host";
                    analyzer: "analyzer";
                    release_driver: "release_driver";
                }>;
                id: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
            reason: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            sourceRevision: z.ZodString;
            expiry: z.ZodOptional<z.ZodString>;
            followUp: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"finding.stale">;
        findingId: z.ZodString;
        sourceRevision: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.session_started">;
        session: z.ZodObject<{
            sessionId: z.ZodString;
            logicalFailureId: z.ZodString;
            findingId: z.ZodOptional<z.ZodString>;
            references: z.ZodArray<z.ZodString>;
            status: z.ZodEnum<{
                human_needed: "human_needed";
                active: "active";
                resolved: "resolved";
            }>;
            startedAt: z.ZodString;
            updatedAt: z.ZodString;
            hypotheses: z.ZodArray<z.ZodObject<{
                hypothesisId: z.ZodString;
                statement: z.ZodString;
                status: z.ZodEnum<{
                    rejected: "rejected";
                    active: "active";
                    supported: "supported";
                    inconclusive: "inconclusive";
                }>;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
            }, z.core.$strict>>;
            experiments: z.ZodArray<z.ZodObject<{
                experimentId: z.ZodString;
                fingerprint: z.ZodString;
                hypothesisId: z.ZodString;
                action: z.ZodString;
                targetedEvidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
                result: z.ZodEnum<{
                    planned: "planned";
                    inconclusive: "inconclusive";
                    passed: "passed";
                    failed: "failed";
                    rejected_duplicate: "rejected_duplicate";
                }>;
                observation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            conclusions: z.ZodDefault<z.ZodArray<z.ZodObject<{
                conclusionId: z.ZodString;
                kind: z.ZodEnum<{
                    conclusion: "conclusion";
                    root_cause: "root_cause";
                }>;
                statement: z.ZodString;
                experimentIds: z.ZodArray<z.ZodString>;
                evidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
            }, z.core.$strict>>>;
            changedReferences: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            unresolvedQuestions: z.ZodDefault<z.ZodArray<z.ZodString>>;
            nextAction: z.ZodOptional<z.ZodString>;
            regressionEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            verification: z.ZodOptional<z.ZodObject<{
                verificationId: z.ZodString;
                findingId: z.ZodOptional<z.ZodString>;
                checkId: z.ZodOptional<z.ZodString>;
                verifier: z.ZodObject<{
                    kind: z.ZodEnum<{
                        verifier: "verifier";
                        human: "human";
                    }>;
                    id: z.ZodString;
                }, z.core.$strict>;
                evidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                failBeforeEvidence: z.ZodOptional<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                passAfterEvidence: z.ZodOptional<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                exemption: z.ZodOptional<z.ZodObject<{
                    reason: z.ZodString;
                    acceptedBy: z.ZodString;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
                verifiedAt: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.hypothesis_recorded">;
        sessionId: z.ZodString;
        hypothesis: z.ZodObject<{
            hypothesisId: z.ZodString;
            statement: z.ZodString;
            status: z.ZodEnum<{
                rejected: "rejected";
                active: "active";
                supported: "supported";
                inconclusive: "inconclusive";
            }>;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.experiment_recorded">;
        sessionId: z.ZodString;
        experiment: z.ZodObject<{
            experimentId: z.ZodString;
            fingerprint: z.ZodString;
            hypothesisId: z.ZodString;
            action: z.ZodString;
            targetedEvidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
            result: z.ZodEnum<{
                planned: "planned";
                inconclusive: "inconclusive";
                passed: "passed";
                failed: "failed";
                rejected_duplicate: "rejected_duplicate";
            }>;
            observation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.conclusion_recorded">;
        sessionId: z.ZodString;
        conclusion: z.ZodObject<{
            conclusionId: z.ZodString;
            kind: z.ZodEnum<{
                conclusion: "conclusion";
                root_cause: "root_cause";
            }>;
            statement: z.ZodString;
            experimentIds: z.ZodArray<z.ZodString>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.reference_changed">;
        sessionId: z.ZodString;
        reference: z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.question_recorded">;
        sessionId: z.ZodString;
        question: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.next_action_recorded">;
        sessionId: z.ZodString;
        nextAction: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.verification_recorded">;
        sessionId: z.ZodString;
        verification: z.ZodObject<{
            verificationId: z.ZodString;
            findingId: z.ZodOptional<z.ZodString>;
            checkId: z.ZodOptional<z.ZodString>;
            verifier: z.ZodObject<{
                kind: z.ZodEnum<{
                    verifier: "verifier";
                    human: "human";
                }>;
                id: z.ZodString;
            }, z.core.$strict>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            failBeforeEvidence: z.ZodOptional<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            passAfterEvidence: z.ZodOptional<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            exemption: z.ZodOptional<z.ZodObject<{
                reason: z.ZodString;
                acceptedBy: z.ZodString;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
            verifiedAt: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.verification_stale">;
        sessionId: z.ZodString;
        verificationId: z.ZodString;
        sourceRevision: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.session_resolved">;
        sessionId: z.ZodString;
        verificationId: z.ZodString;
        nextAction: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"debug.session_updated">;
        sessionId: z.ZodString;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            active: "active";
            resolved: "resolved";
        }>;
        nextAction: z.ZodOptional<z.ZodString>;
        regressionEvidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"uat.scenario_recorded">;
        scenario: z.ZodObject<{
            scenarioId: z.ZodString;
            requirementId: z.ZodString;
            taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            prerequisites: z.ZodDefault<z.ZodArray<z.ZodString>>;
            action: z.ZodString;
            expectedResult: z.ZodString;
            status: z.ZodEnum<{
                blocked: "blocked";
                stale: "stale";
                passed: "passed";
                failed: "failed";
                awaiting_human: "awaiting_human";
                awaiting_retest: "awaiting_retest";
                accepted_limitation: "accepted_limitation";
            }>;
            disposition: z.ZodOptional<z.ZodObject<{
                actor: z.ZodString;
                recordedAt: z.ZodString;
                notes: z.ZodString;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"uat.scenario_retest">;
        scenarioId: z.ZodString;
        sourceRevision: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"uat.scenario_stale">;
        scenarioId: z.ZodString;
        sourceRevision: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"scenario.coverage_reconciled">;
        coverage: z.ZodArray<z.ZodObject<{
            requirementId: z.ZodString;
            scenarioId: z.ZodString;
            status: z.ZodEnum<{
                human_needed: "human_needed";
                covered: "covered";
                missing: "missing";
            }>;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            acceptanceInstructions: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"uat.disposition_recorded">;
        scenarioId: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            passed: "passed";
            failed: "failed";
            accepted_limitation: "accepted_limitation";
        }>;
        actor: z.ZodString;
        notes: z.ZodString;
        sourceRevision: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"release.evaluated">;
        candidate: z.ZodObject<{
            candidateId: z.ZodString;
            surface: z.ZodEnum<{
                node_package: "node_package";
                cli: "cli";
                extension: "extension";
                plugin: "plugin";
                configured: "configured";
            }>;
            applicable: z.ZodBoolean;
            activationEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            artifactDigest: z.ZodOptional<z.ZodString>;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                pending: "pending";
                not_applicable: "not_applicable";
            }>;
            checks: z.ZodArray<z.ZodObject<{
                checkId: z.ZodString;
                status: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                    pending: "pending";
                    warn: "warn";
                    skipped: "skipped";
                }>;
                summary: z.ZodString;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"checks.evaluated">;
        checks: z.ZodArray<z.ZodObject<{
            checkId: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                pending: "pending";
                warn: "warn";
                skipped: "skipped";
            }>;
            summary: z.ZodString;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            readOnly: z.ZodDefault<z.ZodBoolean>;
            independent: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
            kind: z.ZodEnum<{
                tdd: "tdd";
                "artifact-validation": "artifact-validation";
                "repository-checks": "repository-checks";
                "targeted-tests": "targeted-tests";
                "scenario-coverage": "scenario-coverage";
                "code-review": "code-review";
                "goal-verification": "goal-verification";
                security: "security";
                integration: "integration";
                ui: "ui";
                "ai-evaluation": "ai-evaluation";
                compatibility: "compatibility";
                documentation: "documentation";
                "human-uat": "human-uat";
                "repository-context": "repository-context";
                "plan-readiness": "plan-readiness";
                "release-assurance": "release-assurance";
                "planning-assurance": "planning-assurance";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"run.status_updated">;
        status: z.ZodEnum<{
            error: "error";
            complete: "complete";
            blocked: "blocked";
            planned: "planned";
            running: "running";
            checking: "checking";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        type: z.ZodLiteral<"human.disposition_recorded">;
        subjectId: z.ZodString;
        disposition: z.ZodEnum<{
            human_needed: "human_needed";
            accepted_risk: "accepted_risk";
        }>;
        actor: z.ZodString;
        reason: z.ZodString;
        scope: z.ZodString;
        expiry: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>], "type">;
}, z.core.$strict>;
export declare const RelayRunV2Schema: z.ZodObject<{
    status: z.ZodEnum<{
        error: "error";
        complete: "complete";
        blocked: "blocked";
        planned: "planned";
        running: "running";
        checking: "checking";
    }>;
    mode: z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>;
    tasks: z.ZodArray<z.ZodObject<{
        taskId: z.ZodString;
        idStability: z.ZodOptional<z.ZodEnum<{
            explicit: "explicit";
            positional: "positional";
        }>>;
        sourcePath: z.ZodOptional<z.ZodString>;
        sourceDigest: z.ZodOptional<z.ZodString>;
        sourceLine: z.ZodOptional<z.ZodNumber>;
        dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
        risk: z.ZodDefault<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            critical: "critical";
        }>>;
        expectedVerification: z.ZodDefault<z.ZodArray<z.ZodString>>;
        writeSet: z.ZodDefault<z.ZodArray<z.ZodString>>;
        requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        scenarioRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        status: z.ZodDefault<z.ZodEnum<{
            pending: "pending";
            in_progress: "in_progress";
            complete: "complete";
            blocked: "blocked";
        }>>;
        tdd: z.ZodOptional<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
        tddRequired: z.ZodOptional<z.ZodBoolean>;
        tddExemptionReason: z.ZodOptional<z.ZodString>;
        implementationStartedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    startedAt: z.ZodString;
    tier: z.ZodEnum<{
        tier0: "tier0";
        tier1: "tier1";
        tier2: "tier2";
    }>;
    runId: z.ZodString;
    changeName: z.ZodString;
    changeRef: z.ZodString;
    updatedAt: z.ZodString;
    artifacts: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            proposal: "proposal";
            spec: "spec";
            design: "design";
            tasks: "tasks";
        }>;
        path: z.ZodString;
        sourceDigest: z.ZodString;
        ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    executionWaves: z.ZodArray<z.ZodArray<z.ZodString>>;
    gateIds: z.ZodArray<z.ZodString>;
    deviations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        deviationId: z.ZodString;
        taskId: z.ZodString;
        requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        recordedAt: z.ZodString;
        summary: z.ZodString;
        disposition: z.ZodEnum<{
            accepted: "accepted";
            pending: "pending";
            rejected: "rejected";
        }>;
    }, z.core.$strict>>>;
    repairIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    assuranceDigest: z.ZodOptional<z.ZodString>;
    version: z.ZodLiteral<2>;
    config: z.ZodObject<{
        tdd: z.ZodDefault<z.ZodEnum<{
            auto: "auto";
            always: "always";
            off: "off";
        }>>;
        mode: z.ZodDefault<z.ZodEnum<{
            quick: "quick";
            guarded: "guarded";
            full: "full";
        }>>;
        repairLimit: z.ZodDefault<z.ZodNumber>;
        requestedTier: z.ZodOptional<z.ZodEnum<{
            tier0: "tier0";
            tier1: "tier1";
            tier2: "tier2";
        }>>;
        allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
        allowParallel: z.ZodDefault<z.ZodBoolean>;
        git: z.ZodDefault<z.ZodObject<{
            commits: z.ZodDefault<z.ZodBoolean>;
            branches: z.ZodDefault<z.ZodBoolean>;
            worktrees: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
            dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
            risk: z.ZodOptional<z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
                critical: "critical";
            }>>;
            expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
            writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
            requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
            scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tdd: z.ZodOptional<z.ZodEnum<{
                auto: "auto";
                always: "always";
                off: "off";
            }>>;
        }, z.core.$strict>>>;
        version: z.ZodDefault<z.ZodLiteral<2>>;
        piHostAdapter: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            forceTier0: z.ZodDefault<z.ZodBoolean>;
            maxReadOnlyConcurrency: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        features: z.ZodDefault<z.ZodObject<{
            repositoryContext: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                boundaries: z.ZodDefault<z.ZodArray<z.ZodString>>;
                comparisonBase: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            readiness: z.ZodDefault<z.ZodObject<{
                rollout: z.ZodDefault<z.ZodEnum<{
                    report_only: "report_only";
                    required: "required";
                }>>;
                independentRequired: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>;
            debug: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                automaticTransition: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>;
            uat: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                required: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>;
            releaseAssurance: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodEnum<{
                    auto: "auto";
                    always: "always";
                    off: "off";
                }>>;
                disabledReason: z.ZodOptional<z.ZodString>;
                surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
                configuredCommands: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    command: z.ZodString;
                    args: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    timeoutMs: z.ZodDefault<z.ZodNumber>;
                }, z.core.$strict>>>;
                requiredPlatforms: z.ZodDefault<z.ZodArray<z.ZodEnum<{
                    linux: "linux";
                    macos: "macos";
                    windows: "windows";
                }>>>;
                buildCommand: z.ZodOptional<z.ZodObject<{
                    id: z.ZodString;
                    command: z.ZodString;
                    args: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    timeoutMs: z.ZodDefault<z.ZodNumber>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    stateRevision: z.ZodString;
    repositoryContextId: z.ZodOptional<z.ZodString>;
    readinessResultId: z.ZodOptional<z.ZodString>;
    planRevision: z.ZodOptional<z.ZodString>;
    planApprovalStatus: z.ZodDefault<z.ZodEnum<{
        missing: "missing";
        current: "current";
        stale: "stale";
    }>>;
}, z.core.$strict>;
export declare const RelayAssuranceV2Schema: z.ZodObject<{
    status: z.ZodEnum<{
        pass: "pass";
        error: "error";
        human_needed: "human_needed";
        fail: "fail";
        pending: "pending";
        warn: "warn";
    }>;
    mode: z.ZodEnum<{
        quick: "quick";
        guarded: "guarded";
        full: "full";
    }>;
    runId: z.ZodString;
    changeName: z.ZodString;
    updatedAt: z.ZodString;
    evidence: z.ZodArray<z.ZodObject<{
        evidenceId: z.ZodString;
        taskId: z.ZodOptional<z.ZodString>;
        phase: z.ZodEnum<{
            check: "check";
            red: "red";
            green: "green";
            refactor: "refactor";
            review: "review";
            verify: "verify";
            human: "human";
        }>;
        checkId: z.ZodString;
        observedAt: z.ZodString;
        sourceState: z.ZodString;
        sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        exitCode: z.ZodOptional<z.ZodNumber>;
        result: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            warn: "warn";
        }>;
        outputDigest: z.ZodString;
        relevantFailure: z.ZodOptional<z.ZodBoolean>;
        preExistingFailure: z.ZodDefault<z.ZodBoolean>;
        origin: z.ZodEnum<{
            executor: "executor";
            reviewer: "reviewer";
            verifier: "verifier";
            human: "human";
            automated: "automated";
        }>;
        reference: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    scenarioCoverage: z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        scenarioId: z.ZodString;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            covered: "covered";
            missing: "missing";
        }>;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        acceptanceInstructions: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    repairs: z.ZodArray<z.ZodObject<{
        repairId: z.ZodString;
        checkId: z.ZodString;
        attempt: z.ZodNumber;
        startedAt: z.ZodString;
        completedAt: z.ZodOptional<z.ZodString>;
        changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
        result: z.ZodEnum<{
            pass: "pass";
            fail: "fail";
            pending: "pending";
            exhausted: "exhausted";
        }>;
    }, z.core.$strict>>;
    staleEvidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    unresolvedHumanActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
    version: z.ZodLiteral<2>;
    checks: z.ZodArray<z.ZodObject<{
        checkId: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            warn: "warn";
            skipped: "skipped";
        }>;
        summary: z.ZodString;
        evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        readOnly: z.ZodDefault<z.ZodBoolean>;
        independent: z.ZodDefault<z.ZodBoolean>;
        remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
        kind: z.ZodEnum<{
            tdd: "tdd";
            "artifact-validation": "artifact-validation";
            "repository-checks": "repository-checks";
            "targeted-tests": "targeted-tests";
            "scenario-coverage": "scenario-coverage";
            "code-review": "code-review";
            "goal-verification": "goal-verification";
            security: "security";
            integration: "integration";
            ui: "ui";
            "ai-evaluation": "ai-evaluation";
            compatibility: "compatibility";
            documentation: "documentation";
            "human-uat": "human-uat";
            "repository-context": "repository-context";
            "plan-readiness": "plan-readiness";
            "release-assurance": "release-assurance";
            "planning-assurance": "planning-assurance";
        }>;
    }, z.core.$strict>>;
    findings: z.ZodArray<z.ZodObject<{
        findingId: z.ZodString;
        providerId: z.ZodString;
        ruleId: z.ZodString;
        category: z.ZodString;
        scope: z.ZodObject<{
            kind: z.ZodEnum<{
                symbol: "symbol";
                requirement: "requirement";
                scenario: "scenario";
                task: "task";
                contract: "contract";
                location: "location";
                release: "release";
            }>;
            identity: z.ZodString;
        }, z.core.$strict>;
        severity: z.ZodEnum<{
            error: "error";
            critical: "critical";
            info: "info";
            warning: "warning";
        }>;
        blocking: z.ZodBoolean;
        summary: z.ZodString;
        requirementIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        state: z.ZodEnum<{
            human_needed: "human_needed";
            stale: "stale";
            open: "open";
            repaired: "repaired";
            independently_verified: "independently_verified";
            accepted_risk: "accepted_risk";
        }>;
        transitions: z.ZodArray<z.ZodObject<{
            transitionId: z.ZodString;
            from: z.ZodOptional<z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>>;
            to: z.ZodEnum<{
                human_needed: "human_needed";
                stale: "stale";
                open: "open";
                repaired: "repaired";
                independently_verified: "independently_verified";
                accepted_risk: "accepted_risk";
            }>;
            occurredAt: z.ZodString;
            actor: z.ZodObject<{
                kind: z.ZodEnum<{
                    planner: "planner";
                    plan_reviewer: "plan_reviewer";
                    executor: "executor";
                    pathfinder: "pathfinder";
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                    automation: "automation";
                    host: "host";
                    analyzer: "analyzer";
                    release_driver: "release_driver";
                }>;
                id: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
            reason: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            sourceRevision: z.ZodString;
            expiry: z.ZodOptional<z.ZodString>;
            followUp: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    repositoryContext: z.ZodOptional<z.ZodObject<{
        contextId: z.ZodString;
        changeName: z.ZodString;
        inputRevision: z.ZodString;
        compiledAt: z.ZodString;
        status: z.ZodEnum<{
            current: "current";
            stale: "stale";
            unavailable: "unavailable";
        }>;
        claims: z.ZodArray<z.ZodObject<{
            claimId: z.ZodString;
            category: z.ZodEnum<{
                unknown: "unknown";
                implementation_analog: "implementation_analog";
                affected_module: "affected_module";
                test_convention: "test_convention";
                architecture_boundary: "architecture_boundary";
                downstream_consumer: "downstream_consumer";
                conflicting_pattern: "conflicting_pattern";
            }>;
            classification: z.ZodEnum<{
                unknown: "unknown";
                observed: "observed";
                inferred: "inferred";
                conflict: "conflict";
            }>;
            summary: z.ZodString;
            confidence: z.ZodEnum<{
                low: "low";
                medium: "medium";
                high: "high";
            }>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            relatedOpenSpecIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        staleReferenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    readiness: z.ZodOptional<z.ZodObject<{
        resultId: z.ZodString;
        changeName: z.ZodString;
        evaluatedAt: z.ZodString;
        inputRevision: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            stale: "stale";
        }>;
        independent: z.ZodLiteral<true>;
        evaluator: z.ZodString;
        issues: z.ZodArray<z.ZodObject<{
            issueId: z.ZodString;
            kind: z.ZodEnum<{
                uncovered_requirement: "uncovered_requirement";
                unmapped_scenario: "unmapped_scenario";
                insufficient_evidence: "insufficient_evidence";
                dependency_cycle: "dependency_cycle";
                unsafe_write_overlap: "unsafe_write_overlap";
                missing_prerequisite: "missing_prerequisite";
                risky_assumption: "risky_assumption";
                compatibility_obligation: "compatibility_obligation";
                repository_scope_gap: "repository_scope_gap";
                independent_result_unavailable: "independent_result_unavailable";
            }>;
            severity: z.ZodEnum<{
                error: "error";
                critical: "critical";
                info: "info";
                warning: "warning";
            }>;
            blocking: z.ZodBoolean;
            summary: z.ZodString;
            references: z.ZodDefault<z.ZodArray<z.ZodString>>;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
            remediation: z.ZodArray<z.ZodString>;
            inputRevision: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    debugSessions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sessionId: z.ZodString;
        logicalFailureId: z.ZodString;
        findingId: z.ZodOptional<z.ZodString>;
        references: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            human_needed: "human_needed";
            active: "active";
            resolved: "resolved";
        }>;
        startedAt: z.ZodString;
        updatedAt: z.ZodString;
        hypotheses: z.ZodArray<z.ZodObject<{
            hypothesisId: z.ZodString;
            statement: z.ZodString;
            status: z.ZodEnum<{
                rejected: "rejected";
                active: "active";
                supported: "supported";
                inconclusive: "inconclusive";
            }>;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
        experiments: z.ZodArray<z.ZodObject<{
            experimentId: z.ZodString;
            fingerprint: z.ZodString;
            hypothesisId: z.ZodString;
            action: z.ZodString;
            targetedEvidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
            result: z.ZodEnum<{
                planned: "planned";
                inconclusive: "inconclusive";
                passed: "passed";
                failed: "failed";
                rejected_duplicate: "rejected_duplicate";
            }>;
            observation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        conclusions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            conclusionId: z.ZodString;
            kind: z.ZodEnum<{
                conclusion: "conclusion";
                root_cause: "root_cause";
            }>;
            statement: z.ZodString;
            experimentIds: z.ZodArray<z.ZodString>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
        }, z.core.$strict>>>;
        changedReferences: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        unresolvedQuestions: z.ZodDefault<z.ZodArray<z.ZodString>>;
        nextAction: z.ZodOptional<z.ZodString>;
        regressionEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        verification: z.ZodOptional<z.ZodObject<{
            verificationId: z.ZodString;
            findingId: z.ZodOptional<z.ZodString>;
            checkId: z.ZodOptional<z.ZodString>;
            verifier: z.ZodObject<{
                kind: z.ZodEnum<{
                    verifier: "verifier";
                    human: "human";
                }>;
                id: z.ZodString;
            }, z.core.$strict>;
            evidence: z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            failBeforeEvidence: z.ZodOptional<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            passAfterEvidence: z.ZodOptional<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            exemption: z.ZodOptional<z.ZodObject<{
                reason: z.ZodString;
                acceptedBy: z.ZodString;
            }, z.core.$strict>>;
            sourceRevision: z.ZodString;
            verifiedAt: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    uatScenarios: z.ZodDefault<z.ZodArray<z.ZodObject<{
        scenarioId: z.ZodString;
        requirementId: z.ZodString;
        taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        prerequisites: z.ZodDefault<z.ZodArray<z.ZodString>>;
        action: z.ZodString;
        expectedResult: z.ZodString;
        status: z.ZodEnum<{
            blocked: "blocked";
            stale: "stale";
            passed: "passed";
            failed: "failed";
            awaiting_human: "awaiting_human";
            awaiting_retest: "awaiting_retest";
            accepted_limitation: "accepted_limitation";
        }>;
        disposition: z.ZodOptional<z.ZodObject<{
            actor: z.ZodString;
            recordedAt: z.ZodString;
            notes: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
        sourceRevision: z.ZodString;
    }, z.core.$strict>>>;
    releaseCandidates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        candidateId: z.ZodString;
        surface: z.ZodEnum<{
            node_package: "node_package";
            cli: "cli";
            extension: "extension";
            plugin: "plugin";
            configured: "configured";
        }>;
        applicable: z.ZodBoolean;
        activationEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
            referenceId: z.ZodString;
            kind: z.ZodEnum<{
                artifact: "artifact";
                repository: "repository";
                generated: "generated";
                external: "external";
            }>;
            path: z.ZodOptional<z.ZodString>;
            externalId: z.ZodOptional<z.ZodString>;
            digest: z.ZodOptional<z.ZodString>;
            available: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>>;
        artifactDigest: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
            pending: "pending";
            not_applicable: "not_applicable";
        }>;
        checks: z.ZodArray<z.ZodObject<{
            checkId: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                pending: "pending";
                warn: "warn";
                skipped: "skipped";
            }>;
            summary: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    semanticClassifications: z.ZodDefault<z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        level: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
        rationale: z.ZodString;
        triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        sourceRevision: z.ZodString;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        provenance: z.ZodDefault<z.ZodEnum<{
            planner: "planner";
            plan_reviewer: "plan_reviewer";
            tier0_self_review: "tier0_self_review";
            deterministic_lower_bound: "deterministic_lower_bound";
        }>>;
    }, z.core.$strict>>>;
    semanticDowngrades: z.ZodDefault<z.ZodArray<z.ZodObject<{
        requirementId: z.ZodString;
        requiredLevel: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
        achievedLevel: z.ZodEnum<{
            simple: "simple";
            behavioral: "behavioral";
            modeling: "modeling";
        }>;
        reason: z.ZodString;
        actor: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodString;
        status: z.ZodEnum<{
            accepted: "accepted";
            human_needed: "human_needed";
        }>;
    }, z.core.$strict>>>;
    pathfinderResults: z.ZodDefault<z.ZodArray<z.ZodObject<{
        pathfinderId: z.ZodString;
        question: z.ZodString;
        assumptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
        experiments: z.ZodDefault<z.ZodArray<z.ZodString>>;
        observations: z.ZodDefault<z.ZodArray<z.ZodString>>;
        counterexamples: z.ZodDefault<z.ZodArray<z.ZodString>>;
        conclusion: z.ZodString;
        confidence: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        routing: z.ZodEnum<{
            planner: "planner";
            human_needed: "human_needed";
            discussion: "discussion";
        }>;
        sourceRevision: z.ZodString;
    }, z.core.$strict>>>;
    planReviews: z.ZodDefault<z.ZodArray<z.ZodObject<{
        reviewId: z.ZodString;
        revision: z.ZodString;
        status: z.ZodEnum<{
            pass: "pass";
            error: "error";
            human_needed: "human_needed";
            fail: "fail";
        }>;
        independent: z.ZodBoolean;
        reviewerId: z.ZodOptional<z.ZodString>;
        findingIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        reviewedAt: z.ZodString;
    }, z.core.$strict>>>;
    findingRoutes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        findingId: z.ZodString;
        source: z.ZodOptional<z.ZodEnum<{
            planner: "planner";
            discussion: "discussion";
            executor: "executor";
            pathfinder: "pathfinder";
            reviewer: "reviewer";
            verifier: "verifier";
        }>>;
        route: z.ZodEnum<{
            planner: "planner";
            human_needed: "human_needed";
            discussion: "discussion";
            executor: "executor";
            pathfinder: "pathfinder";
            verifier: "verifier";
        }>;
        taskId: z.ZodOptional<z.ZodString>;
        planRevision: z.ZodString;
        reason: z.ZodString;
        attempt: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>>;
    planApproval: z.ZodOptional<z.ZodObject<{
        revision: z.ZodString;
        approvedAt: z.ZodString;
        independent: z.ZodBoolean;
        reviewerId: z.ZodOptional<z.ZodString>;
        semanticLevels: z.ZodDefault<z.ZodArray<z.ZodObject<{
            requirementId: z.ZodString;
            level: z.ZodEnum<{
                simple: "simple";
                behavioral: "behavioral";
                modeling: "modeling";
            }>;
        }, z.core.$strict>>>;
        openDispositionIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    hostAdapter: z.ZodOptional<z.ZodObject<{
        adapterId: z.ZodString;
        adapterVersion: z.ZodNumber;
        runtimeVersion: z.ZodString;
        modelRef: z.ZodOptional<z.ZodString>;
        agentDispatch: z.ZodEnum<{
            available: "available";
            disabled: "disabled";
            probe_failed: "probe_failed";
            unsupported_version: "unsupported_version";
        }>;
        parallelism: z.ZodEnum<{
            available: "available";
            disabled: "disabled";
            probe_failed: "probe_failed";
            unsupported_version: "unsupported_version";
        }>;
        qualifiedAt: z.ZodString;
    }, z.core.$strict>>;
    planStale: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const RelayEventStoreV2Schema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    owner: z.ZodLiteral<"openspec-relay">;
    runId: z.ZodString;
    changeName: z.ZodString;
    createdAt: z.ZodString;
    seed: z.ZodObject<{
        changeRef: z.ZodString;
        mode: z.ZodEnum<{
            quick: "quick";
            guarded: "guarded";
            full: "full";
        }>;
        tier: z.ZodEnum<{
            tier0: "tier0";
            tier1: "tier1";
            tier2: "tier2";
        }>;
        status: z.ZodEnum<{
            error: "error";
            complete: "complete";
            blocked: "blocked";
            planned: "planned";
            running: "running";
            checking: "checking";
        }>;
        startedAt: z.ZodString;
        gateIds: z.ZodArray<z.ZodString>;
        config: z.ZodObject<{
            tdd: z.ZodDefault<z.ZodEnum<{
                auto: "auto";
                always: "always";
                off: "off";
            }>>;
            mode: z.ZodDefault<z.ZodEnum<{
                quick: "quick";
                guarded: "guarded";
                full: "full";
            }>>;
            repairLimit: z.ZodDefault<z.ZodNumber>;
            requestedTier: z.ZodOptional<z.ZodEnum<{
                tier0: "tier0";
                tier1: "tier1";
                tier2: "tier2";
            }>>;
            allowAgentDispatch: z.ZodDefault<z.ZodBoolean>;
            allowParallel: z.ZodDefault<z.ZodBoolean>;
            git: z.ZodDefault<z.ZodObject<{
                commits: z.ZodDefault<z.ZodBoolean>;
                branches: z.ZodDefault<z.ZodBoolean>;
                worktrees: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>;
            requiredCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
            disabledCheckers: z.ZodDefault<z.ZodArray<z.ZodString>>;
            taskOverrides: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
                dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
                risk: z.ZodOptional<z.ZodEnum<{
                    low: "low";
                    medium: "medium";
                    high: "high";
                    critical: "critical";
                }>>;
                expectedVerification: z.ZodOptional<z.ZodArray<z.ZodString>>;
                writeSet: z.ZodOptional<z.ZodArray<z.ZodString>>;
                requirementRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
                scenarioRefs: z.ZodOptional<z.ZodArray<z.ZodString>>;
                tdd: z.ZodOptional<z.ZodEnum<{
                    auto: "auto";
                    always: "always";
                    off: "off";
                }>>;
            }, z.core.$strict>>>;
            version: z.ZodDefault<z.ZodLiteral<2>>;
            piHostAdapter: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                forceTier0: z.ZodDefault<z.ZodBoolean>;
                maxReadOnlyConcurrency: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>>;
            features: z.ZodDefault<z.ZodObject<{
                repositoryContext: z.ZodDefault<z.ZodObject<{
                    enabled: z.ZodDefault<z.ZodBoolean>;
                    boundaries: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    comparisonBase: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                readiness: z.ZodDefault<z.ZodObject<{
                    rollout: z.ZodDefault<z.ZodEnum<{
                        report_only: "report_only";
                        required: "required";
                    }>>;
                    independentRequired: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>>;
                debug: z.ZodDefault<z.ZodObject<{
                    enabled: z.ZodDefault<z.ZodBoolean>;
                    automaticTransition: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>>;
                uat: z.ZodDefault<z.ZodObject<{
                    enabled: z.ZodDefault<z.ZodBoolean>;
                    required: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>>;
                releaseAssurance: z.ZodDefault<z.ZodObject<{
                    enabled: z.ZodDefault<z.ZodEnum<{
                        auto: "auto";
                        always: "always";
                        off: "off";
                    }>>;
                    disabledReason: z.ZodOptional<z.ZodString>;
                    surfaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    configuredCommands: z.ZodDefault<z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        command: z.ZodString;
                        args: z.ZodDefault<z.ZodArray<z.ZodString>>;
                        expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
                        timeoutMs: z.ZodDefault<z.ZodNumber>;
                    }, z.core.$strict>>>;
                    requiredPlatforms: z.ZodDefault<z.ZodArray<z.ZodEnum<{
                        linux: "linux";
                        macos: "macos";
                        windows: "windows";
                    }>>>;
                    buildCommand: z.ZodOptional<z.ZodObject<{
                        id: z.ZodString;
                        command: z.ZodString;
                        args: z.ZodDefault<z.ZodArray<z.ZodString>>;
                        expectedArtifacts: z.ZodDefault<z.ZodArray<z.ZodString>>;
                        timeoutMs: z.ZodDefault<z.ZodNumber>;
                    }, z.core.$strict>>;
                }, z.core.$strict>>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        checks: z.ZodArray<z.ZodObject<{
            checkId: z.ZodString;
            status: z.ZodEnum<{
                pass: "pass";
                error: "error";
                human_needed: "human_needed";
                fail: "fail";
                pending: "pending";
                warn: "warn";
                skipped: "skipped";
            }>;
            summary: z.ZodString;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            readOnly: z.ZodDefault<z.ZodBoolean>;
            independent: z.ZodDefault<z.ZodBoolean>;
            remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
            kind: z.ZodEnum<{
                tdd: "tdd";
                "artifact-validation": "artifact-validation";
                "repository-checks": "repository-checks";
                "targeted-tests": "targeted-tests";
                "scenario-coverage": "scenario-coverage";
                "code-review": "code-review";
                "goal-verification": "goal-verification";
                security: "security";
                integration: "integration";
                ui: "ui";
                "ai-evaluation": "ai-evaluation";
                compatibility: "compatibility";
                documentation: "documentation";
                "human-uat": "human-uat";
                "repository-context": "repository-context";
                "plan-readiness": "plan-readiness";
                "release-assurance": "release-assurance";
                "planning-assurance": "planning-assurance";
            }>;
        }, z.core.$strict>>;
        scenarioCoverage: z.ZodArray<z.ZodObject<{
            requirementId: z.ZodString;
            scenarioId: z.ZodString;
            status: z.ZodEnum<{
                human_needed: "human_needed";
                covered: "covered";
                missing: "missing";
            }>;
            evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            acceptanceInstructions: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    events: z.ZodArray<z.ZodObject<{
        version: z.ZodLiteral<2>;
        eventId: z.ZodString;
        runId: z.ZodString;
        changeName: z.ZodString;
        occurredAt: z.ZodString;
        sourceDigests: z.ZodRecord<z.ZodString, z.ZodString>;
        actor: z.ZodObject<{
            kind: z.ZodEnum<{
                planner: "planner";
                plan_reviewer: "plan_reviewer";
                executor: "executor";
                pathfinder: "pathfinder";
                reviewer: "reviewer";
                verifier: "verifier";
                human: "human";
                automation: "automation";
                host: "host";
                analyzer: "analyzer";
                release_driver: "release_driver";
            }>;
            id: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        provenance: z.ZodObject<{
            origin: z.ZodString;
            adapter: z.ZodOptional<z.ZodString>;
            command: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        payloadDigest: z.ZodString;
        payload: z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"host.adapter_qualified">;
            adapter: z.ZodObject<{
                adapterId: z.ZodString;
                adapterVersion: z.ZodNumber;
                runtimeVersion: z.ZodString;
                modelRef: z.ZodOptional<z.ZodString>;
                agentDispatch: z.ZodEnum<{
                    available: "available";
                    disabled: "disabled";
                    probe_failed: "probe_failed";
                    unsupported_version: "unsupported_version";
                }>;
                parallelism: z.ZodEnum<{
                    available: "available";
                    disabled: "disabled";
                    probe_failed: "probe_failed";
                    unsupported_version: "unsupported_version";
                }>;
                qualifiedAt: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"task.transition">;
            taskId: z.ZodString;
            status: z.ZodEnum<{
                pending: "pending";
                in_progress: "in_progress";
                complete: "complete";
                blocked: "blocked";
            }>;
            reason: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"evidence.recorded">;
            evidence: z.ZodObject<{
                evidenceId: z.ZodString;
                taskId: z.ZodOptional<z.ZodString>;
                phase: z.ZodEnum<{
                    check: "check";
                    red: "red";
                    green: "green";
                    refactor: "refactor";
                    review: "review";
                    verify: "verify";
                    human: "human";
                }>;
                checkId: z.ZodString;
                observedAt: z.ZodString;
                sourceState: z.ZodString;
                sourceDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                exitCode: z.ZodOptional<z.ZodNumber>;
                result: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                    warn: "warn";
                }>;
                outputDigest: z.ZodString;
                relevantFailure: z.ZodOptional<z.ZodBoolean>;
                preExistingFailure: z.ZodDefault<z.ZodBoolean>;
                origin: z.ZodEnum<{
                    executor: "executor";
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                    automated: "automated";
                }>;
                reference: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"finding.recorded">;
            finding: z.ZodObject<{
                findingId: z.ZodString;
                requirementId: z.ZodString;
                status: z.ZodEnum<{
                    pass: "pass";
                    human_needed: "human_needed";
                    fail: "fail";
                    warn: "warn";
                }>;
                summary: z.ZodString;
                evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                origin: z.ZodEnum<{
                    reviewer: "reviewer";
                    verifier: "verifier";
                    human: "human";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"deviation.recorded">;
            deviation: z.ZodObject<{
                deviationId: z.ZodString;
                taskId: z.ZodString;
                requirementRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
                recordedAt: z.ZodString;
                summary: z.ZodString;
                disposition: z.ZodEnum<{
                    accepted: "accepted";
                    pending: "pending";
                    rejected: "rejected";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"repair.recorded">;
            repair: z.ZodObject<{
                repairId: z.ZodString;
                checkId: z.ZodString;
                attempt: z.ZodNumber;
                startedAt: z.ZodString;
                completedAt: z.ZodOptional<z.ZodString>;
                changedReferences: z.ZodDefault<z.ZodArray<z.ZodString>>;
                result: z.ZodEnum<{
                    pass: "pass";
                    fail: "fail";
                    pending: "pending";
                    exhausted: "exhausted";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"human.decision">;
            gateId: z.ZodString;
            decision: z.ZodEnum<{
                accepted: "accepted";
                rejected: "rejected";
                requested: "requested";
            }>;
            reason: z.ZodOptional<z.ZodString>;
            resultDigest: z.ZodOptional<z.ZodString>;
            evidenceDigest: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"context.compiled">;
            context: z.ZodObject<{
                contextId: z.ZodString;
                changeName: z.ZodString;
                inputRevision: z.ZodString;
                compiledAt: z.ZodString;
                status: z.ZodEnum<{
                    current: "current";
                    stale: "stale";
                    unavailable: "unavailable";
                }>;
                claims: z.ZodArray<z.ZodObject<{
                    claimId: z.ZodString;
                    category: z.ZodEnum<{
                        unknown: "unknown";
                        implementation_analog: "implementation_analog";
                        affected_module: "affected_module";
                        test_convention: "test_convention";
                        architecture_boundary: "architecture_boundary";
                        downstream_consumer: "downstream_consumer";
                        conflicting_pattern: "conflicting_pattern";
                    }>;
                    classification: z.ZodEnum<{
                        unknown: "unknown";
                        observed: "observed";
                        inferred: "inferred";
                        conflict: "conflict";
                    }>;
                    summary: z.ZodString;
                    confidence: z.ZodEnum<{
                        low: "low";
                        medium: "medium";
                        high: "high";
                    }>;
                    evidence: z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>;
                    relatedOpenSpecIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                }, z.core.$strict>>;
                staleReferenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"context.stale">;
            contextId: z.ZodString;
            referenceIds: z.ZodArray<z.ZodString>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"readiness.evaluated">;
            result: z.ZodObject<{
                resultId: z.ZodString;
                changeName: z.ZodString;
                evaluatedAt: z.ZodString;
                inputRevision: z.ZodString;
                status: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                    stale: "stale";
                }>;
                independent: z.ZodLiteral<true>;
                evaluator: z.ZodString;
                issues: z.ZodArray<z.ZodObject<{
                    issueId: z.ZodString;
                    kind: z.ZodEnum<{
                        uncovered_requirement: "uncovered_requirement";
                        unmapped_scenario: "unmapped_scenario";
                        insufficient_evidence: "insufficient_evidence";
                        dependency_cycle: "dependency_cycle";
                        unsafe_write_overlap: "unsafe_write_overlap";
                        missing_prerequisite: "missing_prerequisite";
                        risky_assumption: "risky_assumption";
                        compatibility_obligation: "compatibility_obligation";
                        repository_scope_gap: "repository_scope_gap";
                        independent_result_unavailable: "independent_result_unavailable";
                    }>;
                    severity: z.ZodEnum<{
                        error: "error";
                        critical: "critical";
                        info: "info";
                        warning: "warning";
                    }>;
                    blocking: z.ZodBoolean;
                    summary: z.ZodString;
                    references: z.ZodDefault<z.ZodArray<z.ZodString>>;
                    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>>;
                    remediation: z.ZodArray<z.ZodString>;
                    inputRevision: z.ZodString;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"readiness.stale">;
            resultId: z.ZodString;
            inputRevision: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"semantic.classified">;
            classification: z.ZodObject<{
                requirementId: z.ZodString;
                level: z.ZodEnum<{
                    simple: "simple";
                    behavioral: "behavioral";
                    modeling: "modeling";
                }>;
                rationale: z.ZodString;
                triggers: z.ZodDefault<z.ZodArray<z.ZodString>>;
                sourceRevision: z.ZodString;
                evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
                provenance: z.ZodDefault<z.ZodEnum<{
                    planner: "planner";
                    plan_reviewer: "plan_reviewer";
                    tier0_self_review: "tier0_self_review";
                    deterministic_lower_bound: "deterministic_lower_bound";
                }>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"semantic.downgrade_recorded">;
            downgrade: z.ZodObject<{
                requirementId: z.ZodString;
                requiredLevel: z.ZodEnum<{
                    simple: "simple";
                    behavioral: "behavioral";
                    modeling: "modeling";
                }>;
                achievedLevel: z.ZodEnum<{
                    simple: "simple";
                    behavioral: "behavioral";
                    modeling: "modeling";
                }>;
                reason: z.ZodString;
                actor: z.ZodOptional<z.ZodString>;
                sourceRevision: z.ZodString;
                status: z.ZodEnum<{
                    accepted: "accepted";
                    human_needed: "human_needed";
                }>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"pathfinder.completed">;
            result: z.ZodObject<{
                pathfinderId: z.ZodString;
                question: z.ZodString;
                assumptions: z.ZodDefault<z.ZodArray<z.ZodString>>;
                experiments: z.ZodDefault<z.ZodArray<z.ZodString>>;
                observations: z.ZodDefault<z.ZodArray<z.ZodString>>;
                counterexamples: z.ZodDefault<z.ZodArray<z.ZodString>>;
                conclusion: z.ZodString;
                confidence: z.ZodEnum<{
                    low: "low";
                    medium: "medium";
                    high: "high";
                }>;
                evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
                routing: z.ZodEnum<{
                    planner: "planner";
                    human_needed: "human_needed";
                    discussion: "discussion";
                }>;
                sourceRevision: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"plan.reviewed">;
            review: z.ZodObject<{
                reviewId: z.ZodString;
                revision: z.ZodString;
                status: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                }>;
                independent: z.ZodBoolean;
                reviewerId: z.ZodOptional<z.ZodString>;
                findingIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
                reviewedAt: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"finding.routed">;
            route: z.ZodObject<{
                findingId: z.ZodString;
                source: z.ZodOptional<z.ZodEnum<{
                    planner: "planner";
                    discussion: "discussion";
                    executor: "executor";
                    pathfinder: "pathfinder";
                    reviewer: "reviewer";
                    verifier: "verifier";
                }>>;
                route: z.ZodEnum<{
                    planner: "planner";
                    human_needed: "human_needed";
                    discussion: "discussion";
                    executor: "executor";
                    pathfinder: "pathfinder";
                    verifier: "verifier";
                }>;
                taskId: z.ZodOptional<z.ZodString>;
                planRevision: z.ZodString;
                reason: z.ZodString;
                attempt: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"plan.approved">;
            approval: z.ZodObject<{
                revision: z.ZodString;
                approvedAt: z.ZodString;
                independent: z.ZodBoolean;
                reviewerId: z.ZodOptional<z.ZodString>;
                semanticLevels: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    requirementId: z.ZodString;
                    level: z.ZodEnum<{
                        simple: "simple";
                        behavioral: "behavioral";
                        modeling: "modeling";
                    }>;
                }, z.core.$strict>>>;
                openDispositionIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                evidenceRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"plan.stale">;
            approvedRevision: z.ZodString;
            currentRevision: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"finding.discovered">;
            finding: z.ZodObject<{
                findingId: z.ZodString;
                providerId: z.ZodString;
                ruleId: z.ZodString;
                category: z.ZodString;
                scope: z.ZodObject<{
                    kind: z.ZodEnum<{
                        symbol: "symbol";
                        requirement: "requirement";
                        scenario: "scenario";
                        task: "task";
                        contract: "contract";
                        location: "location";
                        release: "release";
                    }>;
                    identity: z.ZodString;
                }, z.core.$strict>;
                severity: z.ZodEnum<{
                    error: "error";
                    critical: "critical";
                    info: "info";
                    warning: "warning";
                }>;
                blocking: z.ZodBoolean;
                summary: z.ZodString;
                requirementIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                state: z.ZodEnum<{
                    human_needed: "human_needed";
                    stale: "stale";
                    open: "open";
                    repaired: "repaired";
                    independently_verified: "independently_verified";
                    accepted_risk: "accepted_risk";
                }>;
                transitions: z.ZodArray<z.ZodObject<{
                    transitionId: z.ZodString;
                    from: z.ZodOptional<z.ZodEnum<{
                        human_needed: "human_needed";
                        stale: "stale";
                        open: "open";
                        repaired: "repaired";
                        independently_verified: "independently_verified";
                        accepted_risk: "accepted_risk";
                    }>>;
                    to: z.ZodEnum<{
                        human_needed: "human_needed";
                        stale: "stale";
                        open: "open";
                        repaired: "repaired";
                        independently_verified: "independently_verified";
                        accepted_risk: "accepted_risk";
                    }>;
                    occurredAt: z.ZodString;
                    actor: z.ZodObject<{
                        kind: z.ZodEnum<{
                            planner: "planner";
                            plan_reviewer: "plan_reviewer";
                            executor: "executor";
                            pathfinder: "pathfinder";
                            reviewer: "reviewer";
                            verifier: "verifier";
                            human: "human";
                            automation: "automation";
                            host: "host";
                            analyzer: "analyzer";
                            release_driver: "release_driver";
                        }>;
                        id: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>;
                    reason: z.ZodString;
                    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>>;
                    sourceRevision: z.ZodString;
                    expiry: z.ZodOptional<z.ZodString>;
                    followUp: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"finding.transitioned">;
            findingId: z.ZodString;
            transition: z.ZodObject<{
                transitionId: z.ZodString;
                from: z.ZodOptional<z.ZodEnum<{
                    human_needed: "human_needed";
                    stale: "stale";
                    open: "open";
                    repaired: "repaired";
                    independently_verified: "independently_verified";
                    accepted_risk: "accepted_risk";
                }>>;
                to: z.ZodEnum<{
                    human_needed: "human_needed";
                    stale: "stale";
                    open: "open";
                    repaired: "repaired";
                    independently_verified: "independently_verified";
                    accepted_risk: "accepted_risk";
                }>;
                occurredAt: z.ZodString;
                actor: z.ZodObject<{
                    kind: z.ZodEnum<{
                        planner: "planner";
                        plan_reviewer: "plan_reviewer";
                        executor: "executor";
                        pathfinder: "pathfinder";
                        reviewer: "reviewer";
                        verifier: "verifier";
                        human: "human";
                        automation: "automation";
                        host: "host";
                        analyzer: "analyzer";
                        release_driver: "release_driver";
                    }>;
                    id: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>;
                reason: z.ZodString;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                sourceRevision: z.ZodString;
                expiry: z.ZodOptional<z.ZodString>;
                followUp: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"finding.stale">;
            findingId: z.ZodString;
            sourceRevision: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.session_started">;
            session: z.ZodObject<{
                sessionId: z.ZodString;
                logicalFailureId: z.ZodString;
                findingId: z.ZodOptional<z.ZodString>;
                references: z.ZodArray<z.ZodString>;
                status: z.ZodEnum<{
                    human_needed: "human_needed";
                    active: "active";
                    resolved: "resolved";
                }>;
                startedAt: z.ZodString;
                updatedAt: z.ZodString;
                hypotheses: z.ZodArray<z.ZodObject<{
                    hypothesisId: z.ZodString;
                    statement: z.ZodString;
                    status: z.ZodEnum<{
                        rejected: "rejected";
                        active: "active";
                        supported: "supported";
                        inconclusive: "inconclusive";
                    }>;
                    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>>;
                }, z.core.$strict>>;
                experiments: z.ZodArray<z.ZodObject<{
                    experimentId: z.ZodString;
                    fingerprint: z.ZodString;
                    hypothesisId: z.ZodString;
                    action: z.ZodString;
                    targetedEvidence: z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>;
                    sourceRevision: z.ZodString;
                    result: z.ZodEnum<{
                        planned: "planned";
                        inconclusive: "inconclusive";
                        passed: "passed";
                        failed: "failed";
                        rejected_duplicate: "rejected_duplicate";
                    }>;
                    observation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                conclusions: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    conclusionId: z.ZodString;
                    kind: z.ZodEnum<{
                        conclusion: "conclusion";
                        root_cause: "root_cause";
                    }>;
                    statement: z.ZodString;
                    experimentIds: z.ZodArray<z.ZodString>;
                    evidence: z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>;
                    sourceRevision: z.ZodString;
                }, z.core.$strict>>>;
                changedReferences: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                unresolvedQuestions: z.ZodDefault<z.ZodArray<z.ZodString>>;
                nextAction: z.ZodOptional<z.ZodString>;
                regressionEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                verification: z.ZodOptional<z.ZodObject<{
                    verificationId: z.ZodString;
                    findingId: z.ZodOptional<z.ZodString>;
                    checkId: z.ZodOptional<z.ZodString>;
                    verifier: z.ZodObject<{
                        kind: z.ZodEnum<{
                            verifier: "verifier";
                            human: "human";
                        }>;
                        id: z.ZodString;
                    }, z.core.$strict>;
                    evidence: z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>;
                    failBeforeEvidence: z.ZodOptional<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>;
                    passAfterEvidence: z.ZodOptional<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>;
                    exemption: z.ZodOptional<z.ZodObject<{
                        reason: z.ZodString;
                        acceptedBy: z.ZodString;
                    }, z.core.$strict>>;
                    sourceRevision: z.ZodString;
                    verifiedAt: z.ZodString;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.hypothesis_recorded">;
            sessionId: z.ZodString;
            hypothesis: z.ZodObject<{
                hypothesisId: z.ZodString;
                statement: z.ZodString;
                status: z.ZodEnum<{
                    rejected: "rejected";
                    active: "active";
                    supported: "supported";
                    inconclusive: "inconclusive";
                }>;
                evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.experiment_recorded">;
            sessionId: z.ZodString;
            experiment: z.ZodObject<{
                experimentId: z.ZodString;
                fingerprint: z.ZodString;
                hypothesisId: z.ZodString;
                action: z.ZodString;
                targetedEvidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
                result: z.ZodEnum<{
                    planned: "planned";
                    inconclusive: "inconclusive";
                    passed: "passed";
                    failed: "failed";
                    rejected_duplicate: "rejected_duplicate";
                }>;
                observation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.conclusion_recorded">;
            sessionId: z.ZodString;
            conclusion: z.ZodObject<{
                conclusionId: z.ZodString;
                kind: z.ZodEnum<{
                    conclusion: "conclusion";
                    root_cause: "root_cause";
                }>;
                statement: z.ZodString;
                experimentIds: z.ZodArray<z.ZodString>;
                evidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.reference_changed">;
            sessionId: z.ZodString;
            reference: z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.question_recorded">;
            sessionId: z.ZodString;
            question: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.next_action_recorded">;
            sessionId: z.ZodString;
            nextAction: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.verification_recorded">;
            sessionId: z.ZodString;
            verification: z.ZodObject<{
                verificationId: z.ZodString;
                findingId: z.ZodOptional<z.ZodString>;
                checkId: z.ZodOptional<z.ZodString>;
                verifier: z.ZodObject<{
                    kind: z.ZodEnum<{
                        verifier: "verifier";
                        human: "human";
                    }>;
                    id: z.ZodString;
                }, z.core.$strict>;
                evidence: z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                failBeforeEvidence: z.ZodOptional<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                passAfterEvidence: z.ZodOptional<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                exemption: z.ZodOptional<z.ZodObject<{
                    reason: z.ZodString;
                    acceptedBy: z.ZodString;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
                verifiedAt: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.verification_stale">;
            sessionId: z.ZodString;
            verificationId: z.ZodString;
            sourceRevision: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.session_resolved">;
            sessionId: z.ZodString;
            verificationId: z.ZodString;
            nextAction: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"debug.session_updated">;
            sessionId: z.ZodString;
            status: z.ZodEnum<{
                human_needed: "human_needed";
                active: "active";
                resolved: "resolved";
            }>;
            nextAction: z.ZodOptional<z.ZodString>;
            regressionEvidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"uat.scenario_recorded">;
            scenario: z.ZodObject<{
                scenarioId: z.ZodString;
                requirementId: z.ZodString;
                taskIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                prerequisites: z.ZodDefault<z.ZodArray<z.ZodString>>;
                action: z.ZodString;
                expectedResult: z.ZodString;
                status: z.ZodEnum<{
                    blocked: "blocked";
                    stale: "stale";
                    passed: "passed";
                    failed: "failed";
                    awaiting_human: "awaiting_human";
                    awaiting_retest: "awaiting_retest";
                    accepted_limitation: "accepted_limitation";
                }>;
                disposition: z.ZodOptional<z.ZodObject<{
                    actor: z.ZodString;
                    recordedAt: z.ZodString;
                    notes: z.ZodString;
                    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>>;
                }, z.core.$strict>>;
                sourceRevision: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"uat.scenario_retest">;
            scenarioId: z.ZodString;
            sourceRevision: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"uat.scenario_stale">;
            scenarioId: z.ZodString;
            sourceRevision: z.ZodString;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"scenario.coverage_reconciled">;
            coverage: z.ZodArray<z.ZodObject<{
                requirementId: z.ZodString;
                scenarioId: z.ZodString;
                status: z.ZodEnum<{
                    human_needed: "human_needed";
                    covered: "covered";
                    missing: "missing";
                }>;
                evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                acceptanceInstructions: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"uat.disposition_recorded">;
            scenarioId: z.ZodString;
            status: z.ZodEnum<{
                blocked: "blocked";
                passed: "passed";
                failed: "failed";
                accepted_limitation: "accepted_limitation";
            }>;
            actor: z.ZodString;
            notes: z.ZodString;
            sourceRevision: z.ZodString;
            evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                referenceId: z.ZodString;
                kind: z.ZodEnum<{
                    artifact: "artifact";
                    repository: "repository";
                    generated: "generated";
                    external: "external";
                }>;
                path: z.ZodOptional<z.ZodString>;
                externalId: z.ZodOptional<z.ZodString>;
                digest: z.ZodOptional<z.ZodString>;
                available: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"release.evaluated">;
            candidate: z.ZodObject<{
                candidateId: z.ZodString;
                surface: z.ZodEnum<{
                    node_package: "node_package";
                    cli: "cli";
                    extension: "extension";
                    plugin: "plugin";
                    configured: "configured";
                }>;
                applicable: z.ZodBoolean;
                activationEvidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    referenceId: z.ZodString;
                    kind: z.ZodEnum<{
                        artifact: "artifact";
                        repository: "repository";
                        generated: "generated";
                        external: "external";
                    }>;
                    path: z.ZodOptional<z.ZodString>;
                    externalId: z.ZodOptional<z.ZodString>;
                    digest: z.ZodOptional<z.ZodString>;
                    available: z.ZodDefault<z.ZodBoolean>;
                    remediation: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                artifactDigest: z.ZodOptional<z.ZodString>;
                status: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                    pending: "pending";
                    not_applicable: "not_applicable";
                }>;
                checks: z.ZodArray<z.ZodObject<{
                    checkId: z.ZodString;
                    status: z.ZodEnum<{
                        pass: "pass";
                        error: "error";
                        human_needed: "human_needed";
                        fail: "fail";
                        pending: "pending";
                        warn: "warn";
                        skipped: "skipped";
                    }>;
                    summary: z.ZodString;
                    evidence: z.ZodDefault<z.ZodArray<z.ZodObject<{
                        referenceId: z.ZodString;
                        kind: z.ZodEnum<{
                            artifact: "artifact";
                            repository: "repository";
                            generated: "generated";
                            external: "external";
                        }>;
                        path: z.ZodOptional<z.ZodString>;
                        externalId: z.ZodOptional<z.ZodString>;
                        digest: z.ZodOptional<z.ZodString>;
                        available: z.ZodDefault<z.ZodBoolean>;
                        remediation: z.ZodOptional<z.ZodString>;
                    }, z.core.$strict>>>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"checks.evaluated">;
            checks: z.ZodArray<z.ZodObject<{
                checkId: z.ZodString;
                status: z.ZodEnum<{
                    pass: "pass";
                    error: "error";
                    human_needed: "human_needed";
                    fail: "fail";
                    pending: "pending";
                    warn: "warn";
                    skipped: "skipped";
                }>;
                summary: z.ZodString;
                evidenceIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
                readOnly: z.ZodDefault<z.ZodBoolean>;
                independent: z.ZodDefault<z.ZodBoolean>;
                remediation: z.ZodDefault<z.ZodArray<z.ZodString>>;
                kind: z.ZodEnum<{
                    tdd: "tdd";
                    "artifact-validation": "artifact-validation";
                    "repository-checks": "repository-checks";
                    "targeted-tests": "targeted-tests";
                    "scenario-coverage": "scenario-coverage";
                    "code-review": "code-review";
                    "goal-verification": "goal-verification";
                    security: "security";
                    integration: "integration";
                    ui: "ui";
                    "ai-evaluation": "ai-evaluation";
                    compatibility: "compatibility";
                    documentation: "documentation";
                    "human-uat": "human-uat";
                    "repository-context": "repository-context";
                    "plan-readiness": "plan-readiness";
                    "release-assurance": "release-assurance";
                    "planning-assurance": "planning-assurance";
                }>;
            }, z.core.$strict>>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"run.status_updated">;
            status: z.ZodEnum<{
                error: "error";
                complete: "complete";
                blocked: "blocked";
                planned: "planned";
                running: "running";
                checking: "checking";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            type: z.ZodLiteral<"human.disposition_recorded">;
            subjectId: z.ZodString;
            disposition: z.ZodEnum<{
                human_needed: "human_needed";
                accepted_risk: "accepted_risk";
            }>;
            actor: z.ZodString;
            reason: z.ZodString;
            scope: z.ZodString;
            expiry: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>], "type">;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PortableReferenceV2 = z.infer<typeof PortableReferenceV2Schema>;
export type SemanticLevel = z.infer<typeof SemanticLevelSchema>;
export type SemanticClassificationV1 = z.infer<typeof SemanticClassificationV1Schema>;
export type SemanticDowngradeV1 = z.infer<typeof SemanticDowngradeV1Schema>;
export type PlanApprovalV1 = z.infer<typeof PlanApprovalV1Schema>;
export type PathfinderResultV1 = z.infer<typeof PathfinderResultV1Schema>;
export type PlanReviewResultV1 = z.infer<typeof PlanReviewResultV1Schema>;
export type FindingRouteV1 = z.infer<typeof FindingRouteV1Schema>;
export type RelayConfigV2 = z.infer<typeof RelayConfigV2Schema>;
export type ConfiguredReleaseCommandV2 = z.infer<typeof ConfiguredReleaseCommandV2Schema>;
export type RepositoryContextClaimV2 = z.infer<typeof RepositoryContextClaimV2Schema>;
export type RepositoryContextV2 = z.infer<typeof RepositoryContextV2Schema>;
export type ReadinessIssueV2 = z.infer<typeof ReadinessIssueV2Schema>;
export type ReadinessResultV2 = z.infer<typeof ReadinessResultV2Schema>;
export type FindingStateV2 = z.infer<typeof FindingStateV2Schema>;
export type FindingLifecycleRecordV2 = z.infer<typeof FindingLifecycleRecordV2Schema>;
export type FindingTransitionV2 = z.infer<typeof FindingTransitionV2Schema>;
export type DebugHypothesisV2 = z.infer<typeof DebugHypothesisV2Schema>;
export type DebugExperimentV2 = z.infer<typeof DebugExperimentV2Schema>;
export type DebugConclusionV2 = z.infer<typeof DebugConclusionV2Schema>;
export type DebugVerificationV2 = z.infer<typeof DebugVerificationV2Schema>;
export type DebugSessionV2 = z.infer<typeof DebugSessionV2Schema>;
export type UatScenarioV2 = z.infer<typeof UatScenarioV2Schema>;
export type ReleaseCandidateV2 = z.infer<typeof ReleaseCandidateV2Schema>;
export type RelayEventPayloadV2 = z.infer<typeof RelayEventPayloadV2Schema>;
export type HostAdapterProvenanceV1 = z.infer<typeof HostAdapterProvenanceV1Schema>;
export type RelayEventActorV2 = z.infer<typeof RelayEventActorV2Schema>;
export type RelayEventEnvelopeV2 = z.infer<typeof RelayEventEnvelopeV2Schema>;
export type RelayRunV2 = z.infer<typeof RelayRunV2Schema>;
export type RelayAssuranceV2 = z.infer<typeof RelayAssuranceV2Schema>;
export type RelayEventStoreV2 = z.infer<typeof RelayEventStoreV2Schema>;
//# sourceMappingURL=schemas.d.ts.map