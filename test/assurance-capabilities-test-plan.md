# Assurance capabilities test map

This map names only executable tests present in this repository. OpenSpec remains
the source of scenario truth; this file records evidence locations and honest
gaps rather than duplicating the specifications.

| Capability | Implemented scenario coverage | Executable evidence | Remaining evidence |
| --- | --- | --- | --- |
| Repository context | committed and workspace changes; explicit/upstream/conventional base selection; blocking unknown base; cited-evidence revisions; higher-tier adapter routing | `test/repository-context.test.ts`, `test/readiness.test.ts`, `test/runner-v2.test.ts` | Hosted Windows path and Git behavior remain `human_needed`. |
| Plan readiness | ready/unready gating; mapping, cycles, write overlap, assumptions, compatibility; recomputation after requirement, scenario, task, and cited-source edits | `test/readiness.test.ts`, `test/runner-v2.test.ts`, `test/tier0-e2e.test.ts` | Hosted platform parity remains `human_needed`. |
| Finding lifecycle | stable identity and authorization; exact repository evidence digests; production staleness; canonical gates; single-writer ordering; symlink and junction containment | `test/findings.test.ts`, `test/v2-operations.test.ts`, `test/gate.test.ts`, `test/events-v2.test.ts`, `test/state.test.ts`, `test/failure-injection.test.ts` | Hosted portability remains `human_needed`. |
| Debug sessions | repair exhaustion and resume; distinct hypotheses, experiments, observations, conclusions, changed references, questions, next actions, verifier confirmation, and resolution; distinct RED/GREEN digests; linked-finding independence; archive block | `test/debug-sessions.test.ts`, `test/v2-operations.test.ts`, `test/gate.test.ts`, `test/tier0-e2e.test.ts` | Cross-platform resume remains `human_needed`. |
| Conversational UAT | canonical scenario projection; empty-required projection error; pass/fail/block/limitation; stable finding; independent repair-to-retest; exact-evidence staleness; archive block | `test/uat.test.ts`, `test/v2-operations.test.ts`, `test/runner-v2.test.ts`, `test/gate.test.ts`, `test/tier0-e2e.test.ts` | Hosted portable attachment behavior remains `human_needed`. |
| Release assurance | disable/configuration/discovery precedence; private pack/content/clean install without scripts; host-runner escalation; minimal environment and bounded redacted output; exact candidate install and five-workflow host discovery | `test/release-assurance.test.ts`, `test/actual-candidate-install.test.ts`, `test/runner-v2.test.ts`, `test/tier0-e2e.test.ts` | Hosted Linux/Windows evidence, plugin-host discovery, and any required strong isolation remain `human_needed`; OpenSpec Relay does not claim to provide a sandbox. |
| Cross-cutting state | one unpublished event schema; deterministic canonical replay; idempotency; corruption; orchestrator acceptance order; atomic failure recovery; projection checking; symlink and junction rejection; public package boundary excludes canonical writers | `test/events-v2.test.ts`, `test/state-v2.test.ts`, `test/state.test.ts`, `test/failure-injection.test.ts`, `test/gate.test.ts`, `test/package-boundary.test.ts` | Hosted portability remains `human_needed`. |

## Historical RED provenance

Status: `human_needed`.

The historical fail-first commit evidence requested by the independent review is
not available for the already implemented pre-remediation tranche. It will not
be reconstructed or fabricated. Current regression tests preserve the reviewed
failure modes, but they do not retroactively establish historical RED commit
provenance; that gap remains an explicit review disposition.
