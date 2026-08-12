# Assurance capabilities test map

This map ties each scenario in the six Guardrails delta specifications to the
test suite that will establish it. It is an implementation test plan, not a
second planning source; the OpenSpec artifacts remain authoritative.

| Capability | Specification scenarios | Planned evidence |
| --- | --- | --- |
| Repository context | analog found; no reliable analog; inferred consumer; conflicting conventions; likely extra work; design conflict; source changed; portable paths | `test/repository-context.test.ts` unit and integration cases plus `test/portable-paths.test.ts` |
| Plan readiness | ready; unready; task gap; unverifiable evidence; dependency cycle; write-set overlap; unsupported assumption; compatibility gap; stale inputs; portable paths | `test/readiness.test.ts`, `test/runner-v2.test.ts`, and `test/portable-paths.test.ts` |
| Finding lifecycle | repeat finding; distinct scope; executor repair; independent verification; accepted risk; automated acceptance rejection; stale verification; repaired archive block; warning policy | `test/findings.test.ts`, `test/gate-v2.test.ts`, and `test/events-v2.test.ts` |
| Debug sessions | repair exhaustion; resume existing session; rejected hypothesis; unsupported root cause; repeated experiment; process resume; cross-platform resume; regression proof; missing regression proof | `test/debug-sessions.test.ts`, `test/events-v2.test.ts`, and `test/cli-v2.test.ts` |
| Conversational UAT | starts next scenario; resume; pass; blocked; fail creates finding; repaired retest; accepted limitation; archive block; portable attachments | `test/uat.test.ts`, `test/gate-v2.test.ts`, `test/cli-v2.test.ts`, and `test/portable-paths.test.ts` |
| Release assurance | package activates; no release surface; packed file missing; clean install; release tracking missing; compatibility mismatch; upgrade; rollback escalation; no publication; platform evidence | `test/release-assurance.test.ts`, `test/release-drivers.test.ts`, and cross-platform CI matrix |
| Cross-cutting state | v1 migration; deterministic replay; idempotent events; corrupt input; atomic writes; projection repair | `test/v1-fixtures.test.ts`, `test/events-v2.test.ts`, and `test/state-v2.test.ts` |

Every file named here will contain its matching scenario text in the test title,
so scenario coverage remains inspectable without copying the OpenSpec prose into
generated Guardrails records.
