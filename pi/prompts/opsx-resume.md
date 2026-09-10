---
description: "Resume paused work through one safe existing workflow."
---

Resume paused OpenSpec Relay work from fresh current evidence.

For a change, use the current host's `openspec_relay_workflow` operation `resume`
once to preview the route, then call it again with `enterRoute` set to that exact
route. Otherwise run `openspec-relay resume [change] --json`, then immediately
run `openspec-relay resume [change] --enter <returned-route> --json` when the
preview is automatic. The second call revalidates current evidence before
recording continuation. If no checkpoint exists, label the route reconstructed.
Never infer among multiple changes or discussions from recency.

Honor the returned route exactly:

- `check`: repair canonical state integrity before relying on generated state;
- `select`: ask the developer to select the material candidate;
- `discuss`: continue `/opsx:discuss` at the recorded material frontier;
- `propose` or `update`: use the existing OpenSpec proposal/update workflow;
- `plan`: run `/opsx:plan` against current artifacts;
- `debug`: continue `/opsx:debug` for the referenced active session;
- `do`: run `/opsx:do`, which wraps canonical `$openspec-apply-change`;
- `uat`: continue `/opsx:uat`; or
- `archive`: report archive readiness and use the existing OpenSpec archive workflow.

Do not resume mutation when artifact, repository, workspace, human-action, or
dispatch evidence drifted. Present the exact drift and route through status,
discussion, or planning as directed. A matching safe route does not require a
redundant human confirmation.

For pre-proposal work, run `openspec-relay resume --discussion <working-id>
--json`, teach back settled understanding in plain product language, and ask
only the next material frontier question. Do not repeat settled questions.
