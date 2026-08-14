---
name: openspec-run-status
description: Report execution, assurance, repair, gate, and human-action state.
license: MIT
compatibility: Requires the openspec and openspec-gsd CLIs.
metadata:
  author: openspec-gsd
  version: "0.1.0"
---

Inspect an OpenSpec OpenSpec GSD run.

Invoke `openspec-gsd run-status <change> --json` and summarize the mode,
 execution tier, task progress, readiness, repository-context freshness, finding
 lifecycle, debug sessions, UAT scenarios, release applicability, archive-gate
 state, and unresolved human actions. Treat the generated
`.openspec-gsd` files as evidence records; the OpenSpec proposal, specs, design,
and tasks remain authoritative.

Use `assuranceDigestMatches` and `staleEvidenceCount` from the command output
when reporting drift. Continue work with the returned next actions and use
only the supported `record` and `accept` operations for state changes.
