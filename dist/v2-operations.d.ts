import { type DispatchedRoleResultV2 } from './execution-adapters.js';
import { type RelayEventPayloadV1, type PortableReferenceV2 } from './schemas.js';
export declare function startOrResumeDebugV2(options: {
    change: string;
    projectRoot?: string;
    findingId?: string;
    now?: string;
}): Promise<{
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
}>;
/**
 * Persist an authorized lifecycle transition as a v2 event. Tier 0 hosts use
 * this structured entry point instead of inferring closure from an executor's
 * claim or from a later checker omitting the finding.
 */
export type FindingWorkflowActionV2 = 'repair' | 'accept-risk' | 'request-human' | 'mark-stale';
export declare function transitionFindingV2(options: {
    change: string;
    projectRoot?: string;
    findingId: string;
    action: FindingWorkflowActionV2;
    actorId?: string;
    reason: string;
    evidence?: PortableReferenceV2[];
    expiry?: string;
    followUp?: string;
    now?: string;
}): Promise<{
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
}>;
/** Persist evidence and stable findings only from an orchestrator-issued,
 * read-only reviewer or verifier dispatch receipt. */
export declare function recordDispatchedRoleResultV2(options: {
    change: string;
    projectRoot?: string;
    receipt: DispatchedRoleResultV2;
    now?: string;
}): Promise<{
    run: import("./schemas.js").RelayRunV2;
    assurance: import("./schemas.js").RelayAssuranceV2;
}>;
/** Independent technical closure is possible only through a verifier receipt
 * created by dispatchRoleV2; a caller-selected actor string is never enough. */
export declare function verifyFindingFromDispatchedResultV2(options: {
    change: string;
    projectRoot?: string;
    findingId: string;
    receipt: DispatchedRoleResultV2;
    reason: string;
    now?: string;
}): Promise<{
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
}>;
export declare function recordDebugReferenceChangeV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    reference: PortableReferenceV2;
    now?: string;
}): Promise<{
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
}>;
export declare function recordDebugQuestionV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    question: string;
    now?: string;
}): Promise<{
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
}>;
export declare function recordDebugNextActionV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    nextAction: string;
    now?: string;
}): Promise<{
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
}>;
export declare function recordDebugHypothesisV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    statement: string;
    now?: string;
}): Promise<{
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
}>;
export declare function planDebugExperimentV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    hypothesisId: string;
    action: string;
    evidence: PortableReferenceV2[];
    humanRationale?: string;
    now?: string;
}): Promise<{
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
}>;
export declare function observeDebugExperimentV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    experimentId: string;
    result: 'passed' | 'failed' | 'inconclusive';
    observation: string;
    now?: string;
}): Promise<{
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
}>;
export declare function recordDebugConclusionV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    kind: 'conclusion' | 'root_cause';
    statement: string;
    experimentIds: string[];
    evidence?: PortableReferenceV2[];
    now?: string;
}): Promise<{
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
}>;
export declare function resolveDebugSessionV2(options: {
    change: string;
    projectRoot?: string;
    sessionId: string;
    redEvidenceId?: string;
    greenEvidenceId?: string;
    verificationResult?: DispatchedRoleResultV2;
    exemption?: {
        reason: string;
        acceptedBy: string;
    };
    now?: string;
}): Promise<{
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
}>;
export declare function presentUatV2(options: {
    change: string;
    projectRoot?: string;
    now?: string;
}): Promise<{
    next: {
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
    } | undefined;
    scenarios: {
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
}>;
export declare function recordUatV2(options: {
    change: string;
    projectRoot?: string;
    scenarioId: string;
    status: 'passed' | 'failed' | 'blocked' | 'accepted_limitation';
    actor: string;
    notes: string;
    evidence?: PortableReferenceV2[];
    now?: string;
}): Promise<{
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
    next: {
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
    } | undefined;
}>;
/** Record the durable core gate acceptance and mirror its audit binding in the
 * v2 event history. This intentionally does not close UAT or lifecycle
 * obligations: their individual dispositions remain independently blocking. */
export declare function acceptRelayGateV2(options: {
    change: string;
    projectRoot?: string;
    gateId: string;
    actor: string;
    eventId?: string;
    occurredAt?: string;
}): Promise<{
    accepted: boolean;
    appended: boolean;
    eventId: string;
    eventType: "task.transition" | "evidence.recorded" | "finding.recorded" | "deviation.recorded" | "repair.recorded" | "human.decision" | "host.adapter_qualified" | "context.compiled" | "context.stale" | "readiness.evaluated" | "readiness.stale" | "semantic.classified" | "semantic.downgrade_recorded" | "pathfinder.completed" | "plan.reviewed" | "finding.routed" | "plan.approved" | "plan.stale" | "finding.discovered" | "finding.transitioned" | "finding.stale" | "debug.session_started" | "debug.hypothesis_recorded" | "debug.experiment_recorded" | "debug.conclusion_recorded" | "debug.reference_changed" | "debug.question_recorded" | "debug.next_action_recorded" | "debug.verification_recorded" | "debug.verification_stale" | "debug.session_resolved" | "debug.session_updated" | "uat.scenario_recorded" | "uat.scenario_retest" | "uat.scenario_stale" | "scenario.coverage_reconciled" | "uat.disposition_recorded" | "release.evaluated" | "checks.evaluated" | "run.status_updated" | "human.disposition_recorded";
    runId: string;
    changeName: string;
    projectionRepaired: boolean;
    nextAction: {
        blockedTaskIds: string[];
        complete: boolean;
        taskId?: string | undefined;
    };
}>;
export type WorkflowStageV2 = 'automation' | 'executor' | 'host';
export declare function recordWorkflowResultV2(options: {
    change: string;
    projectRoot?: string;
    eventId: string;
    occurredAt?: string;
    stage: WorkflowStageV2;
    actorId?: string;
    payload: RelayEventPayloadV1;
}): Promise<{
    accepted: boolean;
    appended: boolean;
    eventId: string;
    eventType: "task.transition" | "evidence.recorded" | "finding.recorded" | "deviation.recorded" | "repair.recorded" | "human.decision";
    runId: string;
    changeName: string;
    projectionRepaired: boolean;
    nextAction: {
        blockedTaskIds: string[];
        complete: boolean;
        taskId?: string | undefined;
    };
}>;
//# sourceMappingURL=v2-operations.d.ts.map