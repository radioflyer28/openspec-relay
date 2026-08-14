---
name: openspec-debug
description: Start or resume a scientific debugging session for an unresolved finding.
license: MIT
compatibility: Requires the openspec and openspec-gsd CLIs.
metadata:
  author: openspec-gsd
  version: "0.1.0"
---

Start or resume a focused scientific debugging session for an unresolved
OpenSpec GSD finding.

Invoke `openspec-gsd debug <change> [--finding <id>] --json`. The command
creates one resumable session per logical failure and reports its next safe
action. Use `--session <id> --hypothesis <text>`, `--experiment <action>
--hypothesis-id <id> --evidence <json>`, and `--experiment-id <id> --result
passed|failed|inconclusive --observation <text>` for observations. Technical
resolution is a host API operation: canonical RED must precede the recorded
repair boundary, GREEN must follow it at the current repository revision, and
`resolveDebugSessionV2` requires an opaque read-only verifier dispatch receipt.
The CLI exposes resolution only for a human regression-test exemption via
`--resolve --exemption-reason <text> --accepted-by <human>`. Do not create a
second plan or rewrite OpenSpec artifacts.

Debug executors may modify only the existing change write scope and must respect
the project Git opt-ins. Reviewers, verifiers, and analyzers remain read-only.
A resolved behavior defect needs existing canonical fail-before/pass-after
regression evidence for the same check and subject plus an orchestrator-issued
verifier receipt, or an explicit human exemption. Later material repository
changes reopen the debug session and invalidate its verification.
