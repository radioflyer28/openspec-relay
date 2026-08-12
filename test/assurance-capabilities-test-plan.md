# Assurance capabilities test map

This map names only executable tests present in this repository. OpenSpec remains
the source of scenario truth; this file records evidence locations and honest
gaps rather than duplicating the specifications.

| Capability | Implemented scenario coverage | Executable evidence | Remaining evidence |
| --- | --- | --- | --- |
| Repository context | observed analogs and unknowns; inferred consumers; convention conflicts; scope gaps; cited-evidence revisions; higher-tier adapter routing | `test/repository-context.test.ts`, `test/readiness.test.ts`, `test/runner-v2.test.ts` | Cross-platform path behavior is part of the hosted matrix (`human_needed` locally). |
| Plan readiness | ready/unready gating; missing mappings and verification; cycles; write overlap; assumptions; compatibility; stale resume after OpenSpec edits | `test/readiness.test.ts`, `test/runner-v2.test.ts`, `test/tier0-e2e.test.ts` | Hosted platform parity remains `human_needed`. |
| Finding lifecycle | stable identities; authorized repair/verification/risk transitions; stale verified findings; archive obligations; canonical replay; concurrent appends; generated-path containment; non-destructive v1 export | `test/findings.test.ts`, `test/v2-operations.test.ts`, `test/gate.test.ts`, `test/events-v2.test.ts`, `test/failure-injection.test.ts` | None beyond the hosted portability matrix. |
| Debug sessions | repair exhaustion; resume; hypotheses and experiments; duplicate rejection; evidence-backed root cause; regression proof; unresolved archive block | `test/debug-sessions.test.ts`, `test/v2-operations.test.ts`, `test/gate.test.ts`, `test/tier0-e2e.test.ts` | Cross-process/cross-platform resume remains `human_needed` until hosted evidence exists. |
| Conversational UAT | real scenario projection; ordered resume; pass/fail/block/limitation; finding creation; retest; stale disposition; archive block | `test/uat.test.ts`, `test/v2-operations.test.ts`, `test/runner-v2.test.ts`, `test/gate.test.ts`, `test/tier0-e2e.test.ts` | Portable attachment behavior remains part of the hosted matrix (`human_needed` locally). |
| Release assurance | derived/configured surfaces; package/CLI/extension artifacts; content; clean install; policy and compatibility; explicit build authorization; constrained runner; host discovery; upgrade/rollback behavior and state; platform escalation; no publication | `test/release-assurance.test.ts`, `test/runner-v2.test.ts`, `test/tier0-e2e.test.ts` | Linux/Windows plus unavailable-host plugin discovery remain `human_needed`. |
| Cross-cutting state | v1 fixtures/migration/export; deterministic canonical replay; idempotency; corruption; concurrent writes; atomic failure recovery; projection repair; symlink escape rejection | `test/v1-fixtures.test.ts`, `test/events-v2.test.ts`, `test/events.test.ts`, `test/state-v2.test.ts`, `test/failure-injection.test.ts`, `test/gate.test.ts` | None beyond the hosted portability matrix. |

## Historical RED provenance

Status: `human_needed`.

The historical fail-first commit evidence requested by the independent review is
not available for the already implemented pre-remediation tranche. It will not
be reconstructed or fabricated. The remediation work in section 11 used
observable failing tests before its fixes, while the historical gap remains an
explicit review disposition.
