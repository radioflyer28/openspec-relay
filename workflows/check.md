Evaluate the assurance state of an OpenSpec change without implementing
unrelated work.

Invoke `openspec-guardrails check <change>`. This host-neutral workflow does not
 advertise `--repair` until a repair adapter is registered. Recompile repository
context and independent plan readiness before validating deterministic repository
checks, scenario coverage, applicable TDD evidence, routed specialist checks,
code review, and independent goal verification according to the selected run
mode. A changed controlling artifact invalidates prior readiness evidence.

Record any new evidence, findings, deviations, or completed repair attempts
through `openspec-guardrails record`; evidence and findings require the
orchestrated `--stage automation|executor|reviewer|verifier`. Never patch
`events.json`, `run.json`, or `assurance.json`.
If a current result needs human acceptance, use
`openspec-guardrails accept <change> <gate-id> --actor <actor>` before checking
again.

Repair attempts must stay within the OpenSpec change scope, must change relevant
implementation or evidence before a rerun counts, and stop at the configured
limit. Report unresolved human actions explicitly.
