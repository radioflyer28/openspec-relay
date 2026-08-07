Run an OpenSpec change through Guardrails.

1. Resolve the requested change and read its OpenSpec proposal, delta specs,
   design, and tasks as the sole planning source.
2. Invoke `openspec-guardrails run <change>` with `--mode quick|guarded|full`
   when the user selected a mode; omit the flag to use guarded mode.
3. Follow `nextAction.taskId` in dependency order. Before implementation, record
   required RED evidence with `record evidence`, then record the task as
   `in_progress` with `record task`.
4. Record GREEN, REFACTOR, checker, finding, deviation, and repair observations
   only through `openspec-guardrails record ... --input <json-file|->`. Record a
   completed task with `record task <change> <task-id> --status complete
   --event-id <id>`; this operation updates the authoritative checkbox in
   `tasks.md` and returns the next dependency-satisfied task. Do not edit
   `.guardrails` JSON or create replacement planning documents.
5. Invoke `openspec-guardrails check <change>` after execution and report every
   blocking, warning, or human-needed result with its evidence references.

Commits, branches, and worktrees remain disabled unless the user explicitly
enables each operation and the host reports the required capability.
