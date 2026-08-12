Inspect an OpenSpec Guardrails run.

Invoke `openspec-guardrails run-status <change> --json` and summarize the mode,
 execution tier, task progress, readiness, repository-context freshness, finding
 lifecycle, debug sessions, UAT scenarios, release applicability, archive-gate
 state, and unresolved human actions. Treat the generated
`.guardrails` files as evidence records; the OpenSpec proposal, specs, design,
and tasks remain authoritative.

Use `reconciliation` and `staleEvidenceCount` from the command output when
reporting drift. Continue work with the returned next actionable task and use
only the supported `record` and `accept` operations for state changes.
