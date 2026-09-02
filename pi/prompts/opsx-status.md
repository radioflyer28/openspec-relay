---
description: "Report execution, assurance, repair, gate, and human-action state."
---

Inspect an OpenSpec Relay lifecycle.

In Pi, invoke `openspec_relay_workflow` with operation `status`; use its exact CLI
fallback with `--json` when the adapter is disabled or unqualified. Summarize the active execution,
planner triage, repair or replan, semantic approval freshness, plan-review
provenance, code review, goal verification, task progress, readiness,
repository-context freshness, findings, debug sessions, UAT, release assurance,
archive-gate state, resume action, and precise unresolved human action.

Discussion is conversational: never imply that a raw discussion transcript is
persisted. Treat `.openspec-relay` files as generated evidence records; proposal,
specs, design, and tasks remain authoritative. Use `assuranceDigestMatches` and
`staleEvidenceCount` when reporting drift, and use only supported workflow
operations for mutations.
