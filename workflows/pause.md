Pause an OpenSpec Relay lifecycle cooperatively at a safe boundary.

For a change, use the current host's `openspec_relay_workflow` operation `pause`
when available. Otherwise run `openspec-relay pause [change] --json`. Stop
scheduling new work first. Do not claim full pause while a mutation-capable
dispatch is running or unknown. Report the active stage and task IDs, continuing
or interrupted dispatches, unresolved findings and human actions, workspace
paths, and the recorded resume route. Do not mark a task complete, change an
assurance outcome, copy OpenSpec prose, or create a commit, branch, worktree,
stash, or reset.

During pre-proposal discussion, preserve only confirmed material decisions,
rejected major alternatives, material open questions, and frontier IDs. Submit
that bounded JSON with `openspec-relay pause --discussion <working-id> --input
<file> --json`. Never persist the transcript or private reasoning.

An unsafe result is deliberately non-zero. Explain exactly which activity is
still running or unknown and what evidence is needed before safe resume.
