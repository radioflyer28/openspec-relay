/**
 * Load and replay the single canonical OpenSpec Relay history. All readers use
 * this path so archive gates, status, checks, and mutations agree on state.
 */
export declare function loadCanonicalRelayState(changeDir: string): Promise<{
    store: {
        version: 2;
        owner: "openspec-relay";
        runId: string;
        changeName: string;
        createdAt: string;
        seed: {
            changeRef: string;
            mode: "quick" | "guarded" | "full";
            tier: "tier0" | "tier1" | "tier2";
            status: "error" | "complete" | "blocked" | "planned" | "running" | "checking";
            startedAt: string;
            gateIds: string[];
            config: {
                tdd: "auto" | "always" | "off";
                mode: "quick" | "guarded" | "full";
                repairLimit: number;
                allowAgentDispatch: boolean;
                allowParallel: boolean;
                git: {
                    commits: boolean;
                    branches: boolean;
                    worktrees: boolean;
                };
                requiredCheckers: string[];
                disabledCheckers: string[];
                taskOverrides: Record<string, {
                    dependencies?: string[] | undefined;
                    risk?: "low" | "medium" | "high" | "critical" | undefined;
                    expectedVerification?: string[] | undefined;
                    writeSet?: string[] | undefined;
                    requirementRefs?: string[] | undefined;
                    scenarioRefs?: string[] | undefined;
                    tdd?: "auto" | "always" | "off" | undefined;
                }>;
                version: 2;
                piHostAdapter: {
                    enabled: boolean;
                    forceTier0: boolean;
                    maxReadOnlyConcurrency: number;
                };
                features: {
                    repositoryContext: {
                        enabled: boolean;
                        boundaries: string[];
                        comparisonBase?: string | undefined;
                    };
                    readiness: {
                        rollout: "report_only" | "required";
                        independentRequired: boolean;
                    };
                    debug: {
                        enabled: boolean;
                        automaticTransition: boolean;
                    };
                    uat: {
                        enabled: boolean;
                        required: boolean;
                    };
                    releaseAssurance: {
                        enabled: "auto" | "always" | "off";
                        surfaces: string[];
                        configuredCommands: {
                            id: string;
                            command: string;
                            args: string[];
                            expectedArtifacts: string[];
                            timeoutMs: number;
                        }[];
                        requiredPlatforms: ("linux" | "macos" | "windows")[];
                        disabledReason?: string | undefined;
                        buildCommand?: {
                            id: string;
                            command: string;
                            args: string[];
                            expectedArtifacts: string[];
                            timeoutMs: number;
                        } | undefined;
                    };
                };
                requestedTier?: "tier0" | "tier1" | "tier2" | undefined;
            };
            checks: {
                checkId: string;
                status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                summary: string;
                evidenceIds: string[];
                readOnly: boolean;
                independent: boolean;
                remediation: string[];
                kind: "tdd" | "artifact-validation" | "repository-checks" | "targeted-tests" | "scenario-coverage" | "code-review" | "goal-verification" | "security" | "integration" | "ui" | "ai-evaluation" | "compatibility" | "documentation" | "human-uat" | "repository-context" | "plan-readiness" | "release-assurance" | "planning-assurance";
            }[];
            scenarioCoverage: {
                requirementId: string;
                scenarioId: string;
                status: "human_needed" | "covered" | "missing";
                evidenceIds: string[];
                acceptanceInstructions?: string | undefined;
            }[];
        };
        events: {
            version: 2;
            eventId: string;
            runId: string;
            changeName: string;
            occurredAt: string;
            sourceDigests: Record<string, string>;
            actor: {
                kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                id?: string | undefined;
            };
            provenance: {
                origin: string;
                adapter?: string | undefined;
                command?: string | undefined;
            };
            payloadDigest: string;
            payload: {
                type: "host.adapter_qualified";
                adapter: {
                    adapterId: string;
                    adapterVersion: number;
                    runtimeVersion: string;
                    agentDispatch: "available" | "disabled" | "probe_failed" | "unsupported_version";
                    parallelism: "available" | "disabled" | "probe_failed" | "unsupported_version";
                    qualifiedAt: string;
                    modelRef?: string | undefined;
                };
            } | {
                type: "task.transition";
                taskId: string;
                status: "pending" | "in_progress" | "complete" | "blocked";
                reason?: string | undefined;
            } | {
                type: "evidence.recorded";
                evidence: {
                    evidenceId: string;
                    phase: "check" | "red" | "green" | "refactor" | "review" | "verify" | "human";
                    checkId: string;
                    observedAt: string;
                    sourceState: string;
                    result: "pass" | "error" | "human_needed" | "fail" | "warn";
                    outputDigest: string;
                    preExistingFailure: boolean;
                    origin: "executor" | "reviewer" | "verifier" | "human" | "automated";
                    taskId?: string | undefined;
                    sourceDigests?: Record<string, string> | undefined;
                    exitCode?: number | undefined;
                    relevantFailure?: boolean | undefined;
                    reference?: string | undefined;
                };
            } | {
                type: "finding.recorded";
                finding: {
                    findingId: string;
                    requirementId: string;
                    status: "pass" | "human_needed" | "fail" | "warn";
                    summary: string;
                    evidenceIds: string[];
                    origin: "reviewer" | "verifier" | "human";
                };
            } | {
                type: "deviation.recorded";
                deviation: {
                    deviationId: string;
                    taskId: string;
                    requirementRefs: string[];
                    recordedAt: string;
                    summary: string;
                    disposition: "accepted" | "pending" | "rejected";
                };
            } | {
                type: "repair.recorded";
                repair: {
                    repairId: string;
                    checkId: string;
                    attempt: number;
                    startedAt: string;
                    changedReferences: string[];
                    result: "pass" | "fail" | "pending" | "exhausted";
                    completedAt?: string | undefined;
                };
            } | {
                type: "human.decision";
                gateId: string;
                decision: "accepted" | "rejected" | "requested";
                reason?: string | undefined;
                resultDigest?: string | undefined;
                evidenceDigest?: string | undefined;
            } | {
                type: "context.compiled";
                context: {
                    contextId: string;
                    changeName: string;
                    inputRevision: string;
                    compiledAt: string;
                    status: "current" | "stale" | "unavailable";
                    claims: {
                        claimId: string;
                        category: "unknown" | "implementation_analog" | "affected_module" | "test_convention" | "architecture_boundary" | "downstream_consumer" | "conflicting_pattern";
                        classification: "unknown" | "observed" | "inferred" | "conflict";
                        summary: string;
                        confidence: "low" | "medium" | "high";
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        relatedOpenSpecIds: string[];
                    }[];
                    staleReferenceIds: string[];
                };
            } | {
                type: "context.stale";
                contextId: string;
                referenceIds: string[];
            } | {
                type: "readiness.evaluated";
                result: {
                    resultId: string;
                    changeName: string;
                    evaluatedAt: string;
                    inputRevision: string;
                    status: "pass" | "error" | "human_needed" | "fail" | "stale";
                    independent: true;
                    evaluator: string;
                    issues: {
                        issueId: string;
                        kind: "uncovered_requirement" | "unmapped_scenario" | "insufficient_evidence" | "dependency_cycle" | "unsafe_write_overlap" | "missing_prerequisite" | "risky_assumption" | "compatibility_obligation" | "repository_scope_gap" | "independent_result_unavailable";
                        severity: "error" | "critical" | "info" | "warning";
                        blocking: boolean;
                        summary: string;
                        references: string[];
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        remediation: string[];
                        inputRevision: string;
                    }[];
                };
            } | {
                type: "readiness.stale";
                resultId: string;
                inputRevision: string;
            } | {
                type: "semantic.classified";
                classification: {
                    requirementId: string;
                    level: "simple" | "behavioral" | "modeling";
                    rationale: string;
                    triggers: string[];
                    sourceRevision: string;
                    evidenceRefs: string[];
                    provenance: "planner" | "plan_reviewer" | "tier0_self_review" | "deterministic_lower_bound";
                };
            } | {
                type: "semantic.downgrade_recorded";
                downgrade: {
                    requirementId: string;
                    requiredLevel: "simple" | "behavioral" | "modeling";
                    achievedLevel: "simple" | "behavioral" | "modeling";
                    reason: string;
                    sourceRevision: string;
                    status: "accepted" | "human_needed";
                    actor?: string | undefined;
                };
            } | {
                type: "pathfinder.completed";
                result: {
                    pathfinderId: string;
                    question: string;
                    assumptions: string[];
                    experiments: string[];
                    observations: string[];
                    counterexamples: string[];
                    conclusion: string;
                    confidence: "low" | "medium" | "high";
                    evidenceRefs: string[];
                    routing: "planner" | "human_needed" | "discussion";
                    sourceRevision: string;
                };
            } | {
                type: "plan.reviewed";
                review: {
                    reviewId: string;
                    revision: string;
                    status: "pass" | "error" | "human_needed" | "fail";
                    independent: boolean;
                    findingIds: string[];
                    evidenceRefs: string[];
                    reviewedAt: string;
                    reviewerId?: string | undefined;
                };
            } | {
                type: "finding.routed";
                route: {
                    findingId: string;
                    route: "planner" | "human_needed" | "discussion" | "executor" | "pathfinder" | "verifier";
                    planRevision: string;
                    reason: string;
                    attempt: number;
                    source?: "planner" | "discussion" | "executor" | "pathfinder" | "reviewer" | "verifier" | undefined;
                    taskId?: string | undefined;
                };
            } | {
                type: "plan.approved";
                approval: {
                    revision: string;
                    approvedAt: string;
                    independent: boolean;
                    semanticLevels: {
                        requirementId: string;
                        level: "simple" | "behavioral" | "modeling";
                    }[];
                    openDispositionIds: string[];
                    evidenceRefs: string[];
                    reviewerId?: string | undefined;
                };
            } | {
                type: "plan.stale";
                approvedRevision: string;
                currentRevision: string;
            } | {
                type: "finding.discovered";
                finding: {
                    findingId: string;
                    providerId: string;
                    ruleId: string;
                    category: string;
                    scope: {
                        kind: "symbol" | "requirement" | "scenario" | "task" | "contract" | "location" | "release";
                        identity: string;
                    };
                    severity: "error" | "critical" | "info" | "warning";
                    blocking: boolean;
                    summary: string;
                    requirementIds: string[];
                    taskIds: string[];
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    state: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                    transitions: {
                        transitionId: string;
                        to: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                        occurredAt: string;
                        actor: {
                            kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                            id?: string | undefined;
                        };
                        reason: string;
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                        from?: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk" | undefined;
                        expiry?: string | undefined;
                        followUp?: string | undefined;
                    }[];
                };
            } | {
                type: "finding.transitioned";
                findingId: string;
                transition: {
                    transitionId: string;
                    to: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                    occurredAt: string;
                    actor: {
                        kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                        id?: string | undefined;
                    };
                    reason: string;
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                    from?: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk" | undefined;
                    expiry?: string | undefined;
                    followUp?: string | undefined;
                };
            } | {
                type: "finding.stale";
                findingId: string;
                sourceRevision: string;
            } | {
                type: "debug.session_started";
                session: {
                    sessionId: string;
                    logicalFailureId: string;
                    references: string[];
                    status: "human_needed" | "active" | "resolved";
                    startedAt: string;
                    updatedAt: string;
                    hypotheses: {
                        hypothesisId: string;
                        statement: string;
                        status: "rejected" | "active" | "supported" | "inconclusive";
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                    }[];
                    experiments: {
                        experimentId: string;
                        fingerprint: string;
                        hypothesisId: string;
                        action: string;
                        targetedEvidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                        result: "planned" | "inconclusive" | "passed" | "failed" | "rejected_duplicate";
                        observation?: string | undefined;
                    }[];
                    conclusions: {
                        conclusionId: string;
                        kind: "conclusion" | "root_cause";
                        statement: string;
                        experimentIds: string[];
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                    }[];
                    changedReferences: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    unresolvedQuestions: string[];
                    regressionEvidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    findingId?: string | undefined;
                    nextAction?: string | undefined;
                    verification?: {
                        verificationId: string;
                        verifier: {
                            kind: "verifier" | "human";
                            id: string;
                        };
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                        verifiedAt: string;
                        findingId?: string | undefined;
                        checkId?: string | undefined;
                        failBeforeEvidence?: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        } | undefined;
                        passAfterEvidence?: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        } | undefined;
                        exemption?: {
                            reason: string;
                            acceptedBy: string;
                        } | undefined;
                    } | undefined;
                };
            } | {
                type: "debug.hypothesis_recorded";
                sessionId: string;
                hypothesis: {
                    hypothesisId: string;
                    statement: string;
                    status: "rejected" | "active" | "supported" | "inconclusive";
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                };
            } | {
                type: "debug.experiment_recorded";
                sessionId: string;
                experiment: {
                    experimentId: string;
                    fingerprint: string;
                    hypothesisId: string;
                    action: string;
                    targetedEvidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                    result: "planned" | "inconclusive" | "passed" | "failed" | "rejected_duplicate";
                    observation?: string | undefined;
                };
            } | {
                type: "debug.conclusion_recorded";
                sessionId: string;
                conclusion: {
                    conclusionId: string;
                    kind: "conclusion" | "root_cause";
                    statement: string;
                    experimentIds: string[];
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                };
            } | {
                type: "debug.reference_changed";
                sessionId: string;
                reference: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                };
            } | {
                type: "debug.question_recorded";
                sessionId: string;
                question: string;
            } | {
                type: "debug.next_action_recorded";
                sessionId: string;
                nextAction: string;
            } | {
                type: "debug.verification_recorded";
                sessionId: string;
                verification: {
                    verificationId: string;
                    verifier: {
                        kind: "verifier" | "human";
                        id: string;
                    };
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                    verifiedAt: string;
                    findingId?: string | undefined;
                    checkId?: string | undefined;
                    failBeforeEvidence?: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    } | undefined;
                    passAfterEvidence?: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    } | undefined;
                    exemption?: {
                        reason: string;
                        acceptedBy: string;
                    } | undefined;
                };
            } | {
                type: "debug.verification_stale";
                sessionId: string;
                verificationId: string;
                sourceRevision: string;
            } | {
                type: "debug.session_resolved";
                sessionId: string;
                verificationId: string;
                nextAction: string;
            } | {
                type: "debug.session_updated";
                sessionId: string;
                status: "human_needed" | "active" | "resolved";
                nextAction?: string | undefined;
                regressionEvidence?: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[] | undefined;
            } | {
                type: "uat.scenario_recorded";
                scenario: {
                    scenarioId: string;
                    requirementId: string;
                    taskIds: string[];
                    prerequisites: string[];
                    action: string;
                    expectedResult: string;
                    status: "blocked" | "stale" | "passed" | "failed" | "awaiting_human" | "awaiting_retest" | "accepted_limitation";
                    sourceRevision: string;
                    disposition?: {
                        actor: string;
                        recordedAt: string;
                        notes: string;
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                    } | undefined;
                };
            } | {
                type: "uat.scenario_retest";
                scenarioId: string;
                sourceRevision: string;
            } | {
                type: "uat.scenario_stale";
                scenarioId: string;
                sourceRevision: string;
            } | {
                type: "scenario.coverage_reconciled";
                coverage: {
                    requirementId: string;
                    scenarioId: string;
                    status: "human_needed" | "covered" | "missing";
                    evidenceIds: string[];
                    acceptanceInstructions?: string | undefined;
                }[];
            } | {
                type: "uat.disposition_recorded";
                scenarioId: string;
                status: "blocked" | "passed" | "failed" | "accepted_limitation";
                actor: string;
                notes: string;
                sourceRevision: string;
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
            } | {
                type: "release.evaluated";
                candidate: {
                    candidateId: string;
                    surface: "node_package" | "cli" | "extension" | "plugin" | "configured";
                    applicable: boolean;
                    activationEvidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    status: "pass" | "error" | "human_needed" | "fail" | "pending" | "not_applicable";
                    checks: {
                        checkId: string;
                        status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                        summary: string;
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                    }[];
                    artifactDigest?: string | undefined;
                };
            } | {
                type: "checks.evaluated";
                checks: {
                    checkId: string;
                    status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                    summary: string;
                    evidenceIds: string[];
                    readOnly: boolean;
                    independent: boolean;
                    remediation: string[];
                    kind: "tdd" | "artifact-validation" | "repository-checks" | "targeted-tests" | "scenario-coverage" | "code-review" | "goal-verification" | "security" | "integration" | "ui" | "ai-evaluation" | "compatibility" | "documentation" | "human-uat" | "repository-context" | "plan-readiness" | "release-assurance" | "planning-assurance";
                }[];
            } | {
                type: "run.status_updated";
                status: "error" | "complete" | "blocked" | "planned" | "running" | "checking";
            } | {
                type: "human.disposition_recorded";
                subjectId: string;
                disposition: "human_needed" | "accepted_risk";
                actor: string;
                reason: string;
                scope: string;
                expiry?: string | undefined;
            };
        }[];
    };
    compiled: import("./artifacts.js").CompiledOpenSpecChangeV1;
    projection: {
        run: import("./schemas.js").RelayRunV2;
        assurance: import("./schemas.js").RelayAssuranceV2;
    };
    stateRevision: string;
}>;
/** Load canonical history together with its generated read projections. */
export declare function loadCanonicalRelayRecords(changeDir: string): Promise<{
    run: {
        status: "error" | "complete" | "blocked" | "planned" | "running" | "checking";
        mode: "quick" | "guarded" | "full";
        tasks: {
            taskId: string;
            dependencies: string[];
            risk: "low" | "medium" | "high" | "critical";
            expectedVerification: string[];
            writeSet: string[];
            requirementRefs: string[];
            scenarioRefs: string[];
            status: "pending" | "in_progress" | "complete" | "blocked";
            idStability?: "explicit" | "positional" | undefined;
            sourcePath?: string | undefined;
            sourceDigest?: string | undefined;
            sourceLine?: number | undefined;
            tdd?: "auto" | "always" | "off" | undefined;
            tddRequired?: boolean | undefined;
            tddExemptionReason?: string | undefined;
            implementationStartedAt?: string | undefined;
        }[];
        startedAt: string;
        tier: "tier0" | "tier1" | "tier2";
        runId: string;
        changeName: string;
        changeRef: string;
        updatedAt: string;
        artifacts: {
            kind: "proposal" | "spec" | "design" | "tasks";
            path: string;
            sourceDigest: string;
            ids: string[];
        }[];
        executionWaves: string[][];
        gateIds: string[];
        deviations: {
            deviationId: string;
            taskId: string;
            requirementRefs: string[];
            recordedAt: string;
            summary: string;
            disposition: "accepted" | "pending" | "rejected";
        }[];
        repairIds: string[];
        version: 2;
        config: {
            tdd: "auto" | "always" | "off";
            mode: "quick" | "guarded" | "full";
            repairLimit: number;
            allowAgentDispatch: boolean;
            allowParallel: boolean;
            git: {
                commits: boolean;
                branches: boolean;
                worktrees: boolean;
            };
            requiredCheckers: string[];
            disabledCheckers: string[];
            taskOverrides: Record<string, {
                dependencies?: string[] | undefined;
                risk?: "low" | "medium" | "high" | "critical" | undefined;
                expectedVerification?: string[] | undefined;
                writeSet?: string[] | undefined;
                requirementRefs?: string[] | undefined;
                scenarioRefs?: string[] | undefined;
                tdd?: "auto" | "always" | "off" | undefined;
            }>;
            version: 2;
            piHostAdapter: {
                enabled: boolean;
                forceTier0: boolean;
                maxReadOnlyConcurrency: number;
            };
            features: {
                repositoryContext: {
                    enabled: boolean;
                    boundaries: string[];
                    comparisonBase?: string | undefined;
                };
                readiness: {
                    rollout: "report_only" | "required";
                    independentRequired: boolean;
                };
                debug: {
                    enabled: boolean;
                    automaticTransition: boolean;
                };
                uat: {
                    enabled: boolean;
                    required: boolean;
                };
                releaseAssurance: {
                    enabled: "auto" | "always" | "off";
                    surfaces: string[];
                    configuredCommands: {
                        id: string;
                        command: string;
                        args: string[];
                        expectedArtifacts: string[];
                        timeoutMs: number;
                    }[];
                    requiredPlatforms: ("linux" | "macos" | "windows")[];
                    disabledReason?: string | undefined;
                    buildCommand?: {
                        id: string;
                        command: string;
                        args: string[];
                        expectedArtifacts: string[];
                        timeoutMs: number;
                    } | undefined;
                };
            };
            requestedTier?: "tier0" | "tier1" | "tier2" | undefined;
        };
        stateRevision: string;
        planApprovalStatus: "missing" | "current" | "stale";
        assuranceDigest?: string | undefined;
        repositoryContextId?: string | undefined;
        readinessResultId?: string | undefined;
        planRevision?: string | undefined;
    };
    assurance: {
        status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn";
        mode: "quick" | "guarded" | "full";
        runId: string;
        changeName: string;
        updatedAt: string;
        evidence: {
            evidenceId: string;
            phase: "check" | "red" | "green" | "refactor" | "review" | "verify" | "human";
            checkId: string;
            observedAt: string;
            sourceState: string;
            result: "pass" | "error" | "human_needed" | "fail" | "warn";
            outputDigest: string;
            preExistingFailure: boolean;
            origin: "executor" | "reviewer" | "verifier" | "human" | "automated";
            taskId?: string | undefined;
            sourceDigests?: Record<string, string> | undefined;
            exitCode?: number | undefined;
            relevantFailure?: boolean | undefined;
            reference?: string | undefined;
        }[];
        scenarioCoverage: {
            requirementId: string;
            scenarioId: string;
            status: "human_needed" | "covered" | "missing";
            evidenceIds: string[];
            acceptanceInstructions?: string | undefined;
        }[];
        repairs: {
            repairId: string;
            checkId: string;
            attempt: number;
            startedAt: string;
            changedReferences: string[];
            result: "pass" | "fail" | "pending" | "exhausted";
            completedAt?: string | undefined;
        }[];
        staleEvidenceIds: string[];
        unresolvedHumanActions: string[];
        version: 2;
        checks: {
            checkId: string;
            status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
            summary: string;
            evidenceIds: string[];
            readOnly: boolean;
            independent: boolean;
            remediation: string[];
            kind: "tdd" | "artifact-validation" | "repository-checks" | "targeted-tests" | "scenario-coverage" | "code-review" | "goal-verification" | "security" | "integration" | "ui" | "ai-evaluation" | "compatibility" | "documentation" | "human-uat" | "repository-context" | "plan-readiness" | "release-assurance" | "planning-assurance";
        }[];
        findings: {
            findingId: string;
            providerId: string;
            ruleId: string;
            category: string;
            scope: {
                kind: "symbol" | "requirement" | "scenario" | "task" | "contract" | "location" | "release";
                identity: string;
            };
            severity: "error" | "critical" | "info" | "warning";
            blocking: boolean;
            summary: string;
            requirementIds: string[];
            taskIds: string[];
            evidence: {
                referenceId: string;
                kind: "artifact" | "repository" | "generated" | "external";
                available: boolean;
                path?: string | undefined;
                externalId?: string | undefined;
                digest?: string | undefined;
                remediation?: string | undefined;
            }[];
            state: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
            transitions: {
                transitionId: string;
                to: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                occurredAt: string;
                actor: {
                    kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                    id?: string | undefined;
                };
                reason: string;
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
                sourceRevision: string;
                from?: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk" | undefined;
                expiry?: string | undefined;
                followUp?: string | undefined;
            }[];
        }[];
        debugSessions: {
            sessionId: string;
            logicalFailureId: string;
            references: string[];
            status: "human_needed" | "active" | "resolved";
            startedAt: string;
            updatedAt: string;
            hypotheses: {
                hypothesisId: string;
                statement: string;
                status: "rejected" | "active" | "supported" | "inconclusive";
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
            }[];
            experiments: {
                experimentId: string;
                fingerprint: string;
                hypothesisId: string;
                action: string;
                targetedEvidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
                sourceRevision: string;
                result: "planned" | "inconclusive" | "passed" | "failed" | "rejected_duplicate";
                observation?: string | undefined;
            }[];
            conclusions: {
                conclusionId: string;
                kind: "conclusion" | "root_cause";
                statement: string;
                experimentIds: string[];
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
                sourceRevision: string;
            }[];
            changedReferences: {
                referenceId: string;
                kind: "artifact" | "repository" | "generated" | "external";
                available: boolean;
                path?: string | undefined;
                externalId?: string | undefined;
                digest?: string | undefined;
                remediation?: string | undefined;
            }[];
            unresolvedQuestions: string[];
            regressionEvidence: {
                referenceId: string;
                kind: "artifact" | "repository" | "generated" | "external";
                available: boolean;
                path?: string | undefined;
                externalId?: string | undefined;
                digest?: string | undefined;
                remediation?: string | undefined;
            }[];
            findingId?: string | undefined;
            nextAction?: string | undefined;
            verification?: {
                verificationId: string;
                verifier: {
                    kind: "verifier" | "human";
                    id: string;
                };
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
                sourceRevision: string;
                verifiedAt: string;
                findingId?: string | undefined;
                checkId?: string | undefined;
                failBeforeEvidence?: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                } | undefined;
                passAfterEvidence?: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                } | undefined;
                exemption?: {
                    reason: string;
                    acceptedBy: string;
                } | undefined;
            } | undefined;
        }[];
        uatScenarios: {
            scenarioId: string;
            requirementId: string;
            taskIds: string[];
            prerequisites: string[];
            action: string;
            expectedResult: string;
            status: "blocked" | "stale" | "passed" | "failed" | "awaiting_human" | "awaiting_retest" | "accepted_limitation";
            sourceRevision: string;
            disposition?: {
                actor: string;
                recordedAt: string;
                notes: string;
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
            } | undefined;
        }[];
        releaseCandidates: {
            candidateId: string;
            surface: "node_package" | "cli" | "extension" | "plugin" | "configured";
            applicable: boolean;
            activationEvidence: {
                referenceId: string;
                kind: "artifact" | "repository" | "generated" | "external";
                available: boolean;
                path?: string | undefined;
                externalId?: string | undefined;
                digest?: string | undefined;
                remediation?: string | undefined;
            }[];
            status: "pass" | "error" | "human_needed" | "fail" | "pending" | "not_applicable";
            checks: {
                checkId: string;
                status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                summary: string;
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
            }[];
            artifactDigest?: string | undefined;
        }[];
        semanticClassifications: {
            requirementId: string;
            level: "simple" | "behavioral" | "modeling";
            rationale: string;
            triggers: string[];
            sourceRevision: string;
            evidenceRefs: string[];
            provenance: "planner" | "plan_reviewer" | "tier0_self_review" | "deterministic_lower_bound";
        }[];
        semanticDowngrades: {
            requirementId: string;
            requiredLevel: "simple" | "behavioral" | "modeling";
            achievedLevel: "simple" | "behavioral" | "modeling";
            reason: string;
            sourceRevision: string;
            status: "accepted" | "human_needed";
            actor?: string | undefined;
        }[];
        pathfinderResults: {
            pathfinderId: string;
            question: string;
            assumptions: string[];
            experiments: string[];
            observations: string[];
            counterexamples: string[];
            conclusion: string;
            confidence: "low" | "medium" | "high";
            evidenceRefs: string[];
            routing: "planner" | "human_needed" | "discussion";
            sourceRevision: string;
        }[];
        planReviews: {
            reviewId: string;
            revision: string;
            status: "pass" | "error" | "human_needed" | "fail";
            independent: boolean;
            findingIds: string[];
            evidenceRefs: string[];
            reviewedAt: string;
            reviewerId?: string | undefined;
        }[];
        findingRoutes: {
            findingId: string;
            route: "planner" | "human_needed" | "discussion" | "executor" | "pathfinder" | "verifier";
            planRevision: string;
            reason: string;
            attempt: number;
            source?: "planner" | "discussion" | "executor" | "pathfinder" | "reviewer" | "verifier" | undefined;
            taskId?: string | undefined;
        }[];
        planStale: boolean;
        repositoryContext?: {
            contextId: string;
            changeName: string;
            inputRevision: string;
            compiledAt: string;
            status: "current" | "stale" | "unavailable";
            claims: {
                claimId: string;
                category: "unknown" | "implementation_analog" | "affected_module" | "test_convention" | "architecture_boundary" | "downstream_consumer" | "conflicting_pattern";
                classification: "unknown" | "observed" | "inferred" | "conflict";
                summary: string;
                confidence: "low" | "medium" | "high";
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
                relatedOpenSpecIds: string[];
            }[];
            staleReferenceIds: string[];
        } | undefined;
        readiness?: {
            resultId: string;
            changeName: string;
            evaluatedAt: string;
            inputRevision: string;
            status: "pass" | "error" | "human_needed" | "fail" | "stale";
            independent: true;
            evaluator: string;
            issues: {
                issueId: string;
                kind: "uncovered_requirement" | "unmapped_scenario" | "insufficient_evidence" | "dependency_cycle" | "unsafe_write_overlap" | "missing_prerequisite" | "risky_assumption" | "compatibility_obligation" | "repository_scope_gap" | "independent_result_unavailable";
                severity: "error" | "critical" | "info" | "warning";
                blocking: boolean;
                summary: string;
                references: string[];
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
                remediation: string[];
                inputRevision: string;
            }[];
        } | undefined;
        planApproval?: {
            revision: string;
            approvedAt: string;
            independent: boolean;
            semanticLevels: {
                requirementId: string;
                level: "simple" | "behavioral" | "modeling";
            }[];
            openDispositionIds: string[];
            evidenceRefs: string[];
            reviewerId?: string | undefined;
        } | undefined;
        hostAdapter?: {
            adapterId: string;
            adapterVersion: number;
            runtimeVersion: string;
            agentDispatch: "available" | "disabled" | "probe_failed" | "unsupported_version";
            parallelism: "available" | "disabled" | "probe_failed" | "unsupported_version";
            qualifiedAt: string;
            modelRef?: string | undefined;
        } | undefined;
    };
    projectionsMatch: boolean;
    store: {
        version: 2;
        owner: "openspec-relay";
        runId: string;
        changeName: string;
        createdAt: string;
        seed: {
            changeRef: string;
            mode: "quick" | "guarded" | "full";
            tier: "tier0" | "tier1" | "tier2";
            status: "error" | "complete" | "blocked" | "planned" | "running" | "checking";
            startedAt: string;
            gateIds: string[];
            config: {
                tdd: "auto" | "always" | "off";
                mode: "quick" | "guarded" | "full";
                repairLimit: number;
                allowAgentDispatch: boolean;
                allowParallel: boolean;
                git: {
                    commits: boolean;
                    branches: boolean;
                    worktrees: boolean;
                };
                requiredCheckers: string[];
                disabledCheckers: string[];
                taskOverrides: Record<string, {
                    dependencies?: string[] | undefined;
                    risk?: "low" | "medium" | "high" | "critical" | undefined;
                    expectedVerification?: string[] | undefined;
                    writeSet?: string[] | undefined;
                    requirementRefs?: string[] | undefined;
                    scenarioRefs?: string[] | undefined;
                    tdd?: "auto" | "always" | "off" | undefined;
                }>;
                version: 2;
                piHostAdapter: {
                    enabled: boolean;
                    forceTier0: boolean;
                    maxReadOnlyConcurrency: number;
                };
                features: {
                    repositoryContext: {
                        enabled: boolean;
                        boundaries: string[];
                        comparisonBase?: string | undefined;
                    };
                    readiness: {
                        rollout: "report_only" | "required";
                        independentRequired: boolean;
                    };
                    debug: {
                        enabled: boolean;
                        automaticTransition: boolean;
                    };
                    uat: {
                        enabled: boolean;
                        required: boolean;
                    };
                    releaseAssurance: {
                        enabled: "auto" | "always" | "off";
                        surfaces: string[];
                        configuredCommands: {
                            id: string;
                            command: string;
                            args: string[];
                            expectedArtifacts: string[];
                            timeoutMs: number;
                        }[];
                        requiredPlatforms: ("linux" | "macos" | "windows")[];
                        disabledReason?: string | undefined;
                        buildCommand?: {
                            id: string;
                            command: string;
                            args: string[];
                            expectedArtifacts: string[];
                            timeoutMs: number;
                        } | undefined;
                    };
                };
                requestedTier?: "tier0" | "tier1" | "tier2" | undefined;
            };
            checks: {
                checkId: string;
                status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                summary: string;
                evidenceIds: string[];
                readOnly: boolean;
                independent: boolean;
                remediation: string[];
                kind: "tdd" | "artifact-validation" | "repository-checks" | "targeted-tests" | "scenario-coverage" | "code-review" | "goal-verification" | "security" | "integration" | "ui" | "ai-evaluation" | "compatibility" | "documentation" | "human-uat" | "repository-context" | "plan-readiness" | "release-assurance" | "planning-assurance";
            }[];
            scenarioCoverage: {
                requirementId: string;
                scenarioId: string;
                status: "human_needed" | "covered" | "missing";
                evidenceIds: string[];
                acceptanceInstructions?: string | undefined;
            }[];
        };
        events: {
            version: 2;
            eventId: string;
            runId: string;
            changeName: string;
            occurredAt: string;
            sourceDigests: Record<string, string>;
            actor: {
                kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                id?: string | undefined;
            };
            provenance: {
                origin: string;
                adapter?: string | undefined;
                command?: string | undefined;
            };
            payloadDigest: string;
            payload: {
                type: "host.adapter_qualified";
                adapter: {
                    adapterId: string;
                    adapterVersion: number;
                    runtimeVersion: string;
                    agentDispatch: "available" | "disabled" | "probe_failed" | "unsupported_version";
                    parallelism: "available" | "disabled" | "probe_failed" | "unsupported_version";
                    qualifiedAt: string;
                    modelRef?: string | undefined;
                };
            } | {
                type: "task.transition";
                taskId: string;
                status: "pending" | "in_progress" | "complete" | "blocked";
                reason?: string | undefined;
            } | {
                type: "evidence.recorded";
                evidence: {
                    evidenceId: string;
                    phase: "check" | "red" | "green" | "refactor" | "review" | "verify" | "human";
                    checkId: string;
                    observedAt: string;
                    sourceState: string;
                    result: "pass" | "error" | "human_needed" | "fail" | "warn";
                    outputDigest: string;
                    preExistingFailure: boolean;
                    origin: "executor" | "reviewer" | "verifier" | "human" | "automated";
                    taskId?: string | undefined;
                    sourceDigests?: Record<string, string> | undefined;
                    exitCode?: number | undefined;
                    relevantFailure?: boolean | undefined;
                    reference?: string | undefined;
                };
            } | {
                type: "finding.recorded";
                finding: {
                    findingId: string;
                    requirementId: string;
                    status: "pass" | "human_needed" | "fail" | "warn";
                    summary: string;
                    evidenceIds: string[];
                    origin: "reviewer" | "verifier" | "human";
                };
            } | {
                type: "deviation.recorded";
                deviation: {
                    deviationId: string;
                    taskId: string;
                    requirementRefs: string[];
                    recordedAt: string;
                    summary: string;
                    disposition: "accepted" | "pending" | "rejected";
                };
            } | {
                type: "repair.recorded";
                repair: {
                    repairId: string;
                    checkId: string;
                    attempt: number;
                    startedAt: string;
                    changedReferences: string[];
                    result: "pass" | "fail" | "pending" | "exhausted";
                    completedAt?: string | undefined;
                };
            } | {
                type: "human.decision";
                gateId: string;
                decision: "accepted" | "rejected" | "requested";
                reason?: string | undefined;
                resultDigest?: string | undefined;
                evidenceDigest?: string | undefined;
            } | {
                type: "context.compiled";
                context: {
                    contextId: string;
                    changeName: string;
                    inputRevision: string;
                    compiledAt: string;
                    status: "current" | "stale" | "unavailable";
                    claims: {
                        claimId: string;
                        category: "unknown" | "implementation_analog" | "affected_module" | "test_convention" | "architecture_boundary" | "downstream_consumer" | "conflicting_pattern";
                        classification: "unknown" | "observed" | "inferred" | "conflict";
                        summary: string;
                        confidence: "low" | "medium" | "high";
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        relatedOpenSpecIds: string[];
                    }[];
                    staleReferenceIds: string[];
                };
            } | {
                type: "context.stale";
                contextId: string;
                referenceIds: string[];
            } | {
                type: "readiness.evaluated";
                result: {
                    resultId: string;
                    changeName: string;
                    evaluatedAt: string;
                    inputRevision: string;
                    status: "pass" | "error" | "human_needed" | "fail" | "stale";
                    independent: true;
                    evaluator: string;
                    issues: {
                        issueId: string;
                        kind: "uncovered_requirement" | "unmapped_scenario" | "insufficient_evidence" | "dependency_cycle" | "unsafe_write_overlap" | "missing_prerequisite" | "risky_assumption" | "compatibility_obligation" | "repository_scope_gap" | "independent_result_unavailable";
                        severity: "error" | "critical" | "info" | "warning";
                        blocking: boolean;
                        summary: string;
                        references: string[];
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        remediation: string[];
                        inputRevision: string;
                    }[];
                };
            } | {
                type: "readiness.stale";
                resultId: string;
                inputRevision: string;
            } | {
                type: "semantic.classified";
                classification: {
                    requirementId: string;
                    level: "simple" | "behavioral" | "modeling";
                    rationale: string;
                    triggers: string[];
                    sourceRevision: string;
                    evidenceRefs: string[];
                    provenance: "planner" | "plan_reviewer" | "tier0_self_review" | "deterministic_lower_bound";
                };
            } | {
                type: "semantic.downgrade_recorded";
                downgrade: {
                    requirementId: string;
                    requiredLevel: "simple" | "behavioral" | "modeling";
                    achievedLevel: "simple" | "behavioral" | "modeling";
                    reason: string;
                    sourceRevision: string;
                    status: "accepted" | "human_needed";
                    actor?: string | undefined;
                };
            } | {
                type: "pathfinder.completed";
                result: {
                    pathfinderId: string;
                    question: string;
                    assumptions: string[];
                    experiments: string[];
                    observations: string[];
                    counterexamples: string[];
                    conclusion: string;
                    confidence: "low" | "medium" | "high";
                    evidenceRefs: string[];
                    routing: "planner" | "human_needed" | "discussion";
                    sourceRevision: string;
                };
            } | {
                type: "plan.reviewed";
                review: {
                    reviewId: string;
                    revision: string;
                    status: "pass" | "error" | "human_needed" | "fail";
                    independent: boolean;
                    findingIds: string[];
                    evidenceRefs: string[];
                    reviewedAt: string;
                    reviewerId?: string | undefined;
                };
            } | {
                type: "finding.routed";
                route: {
                    findingId: string;
                    route: "planner" | "human_needed" | "discussion" | "executor" | "pathfinder" | "verifier";
                    planRevision: string;
                    reason: string;
                    attempt: number;
                    source?: "planner" | "discussion" | "executor" | "pathfinder" | "reviewer" | "verifier" | undefined;
                    taskId?: string | undefined;
                };
            } | {
                type: "plan.approved";
                approval: {
                    revision: string;
                    approvedAt: string;
                    independent: boolean;
                    semanticLevels: {
                        requirementId: string;
                        level: "simple" | "behavioral" | "modeling";
                    }[];
                    openDispositionIds: string[];
                    evidenceRefs: string[];
                    reviewerId?: string | undefined;
                };
            } | {
                type: "plan.stale";
                approvedRevision: string;
                currentRevision: string;
            } | {
                type: "finding.discovered";
                finding: {
                    findingId: string;
                    providerId: string;
                    ruleId: string;
                    category: string;
                    scope: {
                        kind: "symbol" | "requirement" | "scenario" | "task" | "contract" | "location" | "release";
                        identity: string;
                    };
                    severity: "error" | "critical" | "info" | "warning";
                    blocking: boolean;
                    summary: string;
                    requirementIds: string[];
                    taskIds: string[];
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    state: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                    transitions: {
                        transitionId: string;
                        to: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                        occurredAt: string;
                        actor: {
                            kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                            id?: string | undefined;
                        };
                        reason: string;
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                        from?: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk" | undefined;
                        expiry?: string | undefined;
                        followUp?: string | undefined;
                    }[];
                };
            } | {
                type: "finding.transitioned";
                findingId: string;
                transition: {
                    transitionId: string;
                    to: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk";
                    occurredAt: string;
                    actor: {
                        kind: "planner" | "plan_reviewer" | "executor" | "pathfinder" | "reviewer" | "verifier" | "human" | "automation" | "host" | "analyzer" | "release_driver";
                        id?: string | undefined;
                    };
                    reason: string;
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                    from?: "human_needed" | "stale" | "open" | "repaired" | "independently_verified" | "accepted_risk" | undefined;
                    expiry?: string | undefined;
                    followUp?: string | undefined;
                };
            } | {
                type: "finding.stale";
                findingId: string;
                sourceRevision: string;
            } | {
                type: "debug.session_started";
                session: {
                    sessionId: string;
                    logicalFailureId: string;
                    references: string[];
                    status: "human_needed" | "active" | "resolved";
                    startedAt: string;
                    updatedAt: string;
                    hypotheses: {
                        hypothesisId: string;
                        statement: string;
                        status: "rejected" | "active" | "supported" | "inconclusive";
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                    }[];
                    experiments: {
                        experimentId: string;
                        fingerprint: string;
                        hypothesisId: string;
                        action: string;
                        targetedEvidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                        result: "planned" | "inconclusive" | "passed" | "failed" | "rejected_duplicate";
                        observation?: string | undefined;
                    }[];
                    conclusions: {
                        conclusionId: string;
                        kind: "conclusion" | "root_cause";
                        statement: string;
                        experimentIds: string[];
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                    }[];
                    changedReferences: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    unresolvedQuestions: string[];
                    regressionEvidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    findingId?: string | undefined;
                    nextAction?: string | undefined;
                    verification?: {
                        verificationId: string;
                        verifier: {
                            kind: "verifier" | "human";
                            id: string;
                        };
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                        sourceRevision: string;
                        verifiedAt: string;
                        findingId?: string | undefined;
                        checkId?: string | undefined;
                        failBeforeEvidence?: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        } | undefined;
                        passAfterEvidence?: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        } | undefined;
                        exemption?: {
                            reason: string;
                            acceptedBy: string;
                        } | undefined;
                    } | undefined;
                };
            } | {
                type: "debug.hypothesis_recorded";
                sessionId: string;
                hypothesis: {
                    hypothesisId: string;
                    statement: string;
                    status: "rejected" | "active" | "supported" | "inconclusive";
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                };
            } | {
                type: "debug.experiment_recorded";
                sessionId: string;
                experiment: {
                    experimentId: string;
                    fingerprint: string;
                    hypothesisId: string;
                    action: string;
                    targetedEvidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                    result: "planned" | "inconclusive" | "passed" | "failed" | "rejected_duplicate";
                    observation?: string | undefined;
                };
            } | {
                type: "debug.conclusion_recorded";
                sessionId: string;
                conclusion: {
                    conclusionId: string;
                    kind: "conclusion" | "root_cause";
                    statement: string;
                    experimentIds: string[];
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                };
            } | {
                type: "debug.reference_changed";
                sessionId: string;
                reference: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                };
            } | {
                type: "debug.question_recorded";
                sessionId: string;
                question: string;
            } | {
                type: "debug.next_action_recorded";
                sessionId: string;
                nextAction: string;
            } | {
                type: "debug.verification_recorded";
                sessionId: string;
                verification: {
                    verificationId: string;
                    verifier: {
                        kind: "verifier" | "human";
                        id: string;
                    };
                    evidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    sourceRevision: string;
                    verifiedAt: string;
                    findingId?: string | undefined;
                    checkId?: string | undefined;
                    failBeforeEvidence?: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    } | undefined;
                    passAfterEvidence?: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    } | undefined;
                    exemption?: {
                        reason: string;
                        acceptedBy: string;
                    } | undefined;
                };
            } | {
                type: "debug.verification_stale";
                sessionId: string;
                verificationId: string;
                sourceRevision: string;
            } | {
                type: "debug.session_resolved";
                sessionId: string;
                verificationId: string;
                nextAction: string;
            } | {
                type: "debug.session_updated";
                sessionId: string;
                status: "human_needed" | "active" | "resolved";
                nextAction?: string | undefined;
                regressionEvidence?: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[] | undefined;
            } | {
                type: "uat.scenario_recorded";
                scenario: {
                    scenarioId: string;
                    requirementId: string;
                    taskIds: string[];
                    prerequisites: string[];
                    action: string;
                    expectedResult: string;
                    status: "blocked" | "stale" | "passed" | "failed" | "awaiting_human" | "awaiting_retest" | "accepted_limitation";
                    sourceRevision: string;
                    disposition?: {
                        actor: string;
                        recordedAt: string;
                        notes: string;
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                    } | undefined;
                };
            } | {
                type: "uat.scenario_retest";
                scenarioId: string;
                sourceRevision: string;
            } | {
                type: "uat.scenario_stale";
                scenarioId: string;
                sourceRevision: string;
            } | {
                type: "scenario.coverage_reconciled";
                coverage: {
                    requirementId: string;
                    scenarioId: string;
                    status: "human_needed" | "covered" | "missing";
                    evidenceIds: string[];
                    acceptanceInstructions?: string | undefined;
                }[];
            } | {
                type: "uat.disposition_recorded";
                scenarioId: string;
                status: "blocked" | "passed" | "failed" | "accepted_limitation";
                actor: string;
                notes: string;
                sourceRevision: string;
                evidence: {
                    referenceId: string;
                    kind: "artifact" | "repository" | "generated" | "external";
                    available: boolean;
                    path?: string | undefined;
                    externalId?: string | undefined;
                    digest?: string | undefined;
                    remediation?: string | undefined;
                }[];
            } | {
                type: "release.evaluated";
                candidate: {
                    candidateId: string;
                    surface: "node_package" | "cli" | "extension" | "plugin" | "configured";
                    applicable: boolean;
                    activationEvidence: {
                        referenceId: string;
                        kind: "artifact" | "repository" | "generated" | "external";
                        available: boolean;
                        path?: string | undefined;
                        externalId?: string | undefined;
                        digest?: string | undefined;
                        remediation?: string | undefined;
                    }[];
                    status: "pass" | "error" | "human_needed" | "fail" | "pending" | "not_applicable";
                    checks: {
                        checkId: string;
                        status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                        summary: string;
                        evidence: {
                            referenceId: string;
                            kind: "artifact" | "repository" | "generated" | "external";
                            available: boolean;
                            path?: string | undefined;
                            externalId?: string | undefined;
                            digest?: string | undefined;
                            remediation?: string | undefined;
                        }[];
                    }[];
                    artifactDigest?: string | undefined;
                };
            } | {
                type: "checks.evaluated";
                checks: {
                    checkId: string;
                    status: "pass" | "error" | "human_needed" | "fail" | "pending" | "warn" | "skipped";
                    summary: string;
                    evidenceIds: string[];
                    readOnly: boolean;
                    independent: boolean;
                    remediation: string[];
                    kind: "tdd" | "artifact-validation" | "repository-checks" | "targeted-tests" | "scenario-coverage" | "code-review" | "goal-verification" | "security" | "integration" | "ui" | "ai-evaluation" | "compatibility" | "documentation" | "human-uat" | "repository-context" | "plan-readiness" | "release-assurance" | "planning-assurance";
                }[];
            } | {
                type: "run.status_updated";
                status: "error" | "complete" | "blocked" | "planned" | "running" | "checking";
            } | {
                type: "human.disposition_recorded";
                subjectId: string;
                disposition: "human_needed" | "accepted_risk";
                actor: string;
                reason: string;
                scope: string;
                expiry?: string | undefined;
            };
        }[];
    };
    compiled: import("./artifacts.js").CompiledOpenSpecChangeV1;
    projection: {
        run: import("./schemas.js").RelayRunV2;
        assurance: import("./schemas.js").RelayAssuranceV2;
    };
    stateRevision: string;
}>;
//# sourceMappingURL=canonical-state.d.ts.map