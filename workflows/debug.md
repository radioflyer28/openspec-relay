Start or resume a focused scientific debugging session for an unresolved
Guardrails finding.

Invoke `openspec-guardrails debug <change> [--finding <id>] --json`. The command
creates one resumable session per logical failure and reports its next safe
action. Use `--session <id> --hypothesis <text>`, `--experiment <action>
--hypothesis-id <id> --evidence <json>`, `--experiment-id <id> --result
passed|failed|inconclusive --observation <text>`, and `--resolve --verified-by
<verifier> --red-evidence-id <id> --green-evidence-id <id>` for orchestrated
recording. A human regression-test exemption instead requires
`--exemption-reason <text> --accepted-by <human>`. Do not create a second plan
or rewrite OpenSpec artifacts.

Debug executors may modify only the existing change write scope and must respect
the project Git opt-ins. Reviewers, verifiers, and analyzers remain read-only.
A resolved behavior defect needs existing canonical fail-before/pass-after
regression evidence for the same check and subject plus a distinct verifier
stage, or an explicit human exemption.
