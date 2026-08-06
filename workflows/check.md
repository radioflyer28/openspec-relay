Evaluate the assurance state of an OpenSpec change without implementing
unrelated work.

Invoke `openspec-guardrails check <change>`. Add `--repair` only when the user
requested bounded repair. Validate artifacts, deterministic repository checks,
scenario coverage, applicable TDD evidence, routed specialist checks, code
review, and independent goal verification according to the selected run mode.

Repair attempts must stay within the OpenSpec change scope, must change relevant
implementation or evidence before a rerun counts, and stop at the configured
limit. Report unresolved human actions explicitly.
