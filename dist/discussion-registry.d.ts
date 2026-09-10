import path from 'node:path';
import { z } from 'zod';
import { confirmDiscussionHandoff, type DiscussionArtifactMappingV1 } from './discussion.js';
declare const DecisionSchema: z.ZodObject<{
    decisionId: z.ZodString;
    summary: z.ZodString;
    dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
declare const RejectedAlternativeSchema: z.ZodObject<{
    alternativeId: z.ZodString;
    summary: z.ZodString;
    reason: z.ZodString;
}, z.core.$strict>;
declare const OpenQuestionSchema: z.ZodObject<{
    questionId: z.ZodString;
    summary: z.ZodString;
    dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const DiscussionCheckpointV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    workingId: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        consumed: "consumed";
    }>;
    goal: z.ZodString;
    confirmedDecisions: z.ZodArray<z.ZodObject<{
        decisionId: z.ZodString;
        summary: z.ZodString;
        dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    rejectedAlternatives: z.ZodArray<z.ZodObject<{
        alternativeId: z.ZodString;
        summary: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>;
    openQuestions: z.ZodArray<z.ZodObject<{
        questionId: z.ZodString;
        summary: z.ZodString;
        dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    frontierIds: z.ZodArray<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    fingerprint: z.ZodString;
    consumedBy: z.ZodOptional<z.ZodObject<{
        changeName: z.ZodString;
        mappedDecisionIds: z.ZodArray<z.ZodString>;
        consumedAt: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const DiscussionRegistryV1Schema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    discussions: z.ZodArray<z.ZodObject<{
        version: z.ZodLiteral<1>;
        workingId: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            consumed: "consumed";
        }>;
        goal: z.ZodString;
        confirmedDecisions: z.ZodArray<z.ZodObject<{
            decisionId: z.ZodString;
            summary: z.ZodString;
            dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        rejectedAlternatives: z.ZodArray<z.ZodObject<{
            alternativeId: z.ZodString;
            summary: z.ZodString;
            reason: z.ZodString;
        }, z.core.$strict>>;
        openQuestions: z.ZodArray<z.ZodObject<{
            questionId: z.ZodString;
            summary: z.ZodString;
            dependsOn: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
        frontierIds: z.ZodArray<z.ZodString>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        fingerprint: z.ZodString;
        consumedBy: z.ZodOptional<z.ZodObject<{
            changeName: z.ZodString;
            mappedDecisionIds: z.ZodArray<z.ZodString>;
            consumedAt: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type DiscussionCheckpointV1 = z.infer<typeof DiscussionCheckpointV1Schema>;
export type DiscussionRegistryV1 = z.infer<typeof DiscussionRegistryV1Schema>;
export declare function discussionRegistryPath(projectRoot: string, pathApi?: path.PlatformPath): string;
export declare function readDiscussionRegistryV1(projectRoot: string): Promise<DiscussionRegistryV1>;
export declare function replaceDiscussionCheckpointV1(options: {
    projectRoot: string;
    checkpoint: {
        workingId: string;
        goal: string;
        confirmedDecisions: Array<z.input<typeof DecisionSchema>>;
        rejectedAlternatives: Array<z.input<typeof RejectedAlternativeSchema>>;
        openQuestions: Array<z.input<typeof OpenQuestionSchema>>;
        frontierIds: string[];
    };
    expectedFingerprint?: string;
    now?: string;
}): Promise<{
    checkpoint: DiscussionCheckpointV1;
}>;
export declare function selectDiscussionCheckpointV1(options: {
    projectRoot: string;
    workingId?: string;
}): Promise<DiscussionCheckpointV1>;
export declare function resumeDiscussionCheckpointV1(options: {
    projectRoot: string;
    workingId?: string;
}): Promise<{
    restored: true;
    workingId: string;
    goal: string;
    confirmedDecisions: DiscussionCheckpointV1['confirmedDecisions'];
    rejectedAlternatives: DiscussionCheckpointV1['rejectedAlternatives'];
    unresolvedQuestions: DiscussionCheckpointV1['openQuestions'];
    nextQuestion?: DiscussionCheckpointV1['openQuestions'][number];
}>;
export declare function removeDiscussionCheckpointV1(options: {
    projectRoot: string;
    workingId: string;
}): Promise<boolean>;
export declare function consumeDiscussionCheckpointV1(options: {
    projectRoot: string;
    workingId: string;
    changeName: string;
    mappings: DiscussionArtifactMappingV1[];
    now?: string;
}): Promise<ReturnType<typeof confirmDiscussionHandoff>>;
export {};
//# sourceMappingURL=discussion-registry.d.ts.map