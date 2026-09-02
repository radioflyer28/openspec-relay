export interface DiscussionDecisionV1 {
    decisionId: string;
    summary: string;
    dependsOn?: string[];
}
export interface DiscussionHandoffV1 {
    goal: string;
    decisions: DiscussionDecisionV1[];
}
export interface DiscussionArtifactMappingV1 {
    decisionId: string;
    artifact: 'proposal' | 'spec' | 'design' | 'tasks';
    reference: string;
    status: 'consistent' | 'contradicted';
}
export interface DiscussionHandoffConfirmationV1 {
    status: 'pass' | 'return_to_discussion';
    mappedDecisionIds: string[];
    affectedDecisionIds: string[];
    summary: string;
}
export declare function confirmDiscussionHandoff(options: {
    handoff: DiscussionHandoffV1;
    mappings: DiscussionArtifactMappingV1[];
}): DiscussionHandoffConfirmationV1;
//# sourceMappingURL=discussion.d.ts.map