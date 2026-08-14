Run an OpenSpec change through OpenSpec GSD.

1. Resolve the requested change and read its OpenSpec proposal, delta specs,
   design, and tasks as the sole planning source.
2. Invoke `openspec-gsd run <change>` with `--mode quick|guarded|full`
   when the user selected a mode; omit the flag to use guarded mode.
3. Inspect the recorded repository context and independent readiness result. If
   required readiness is not passing, do not begin implementation; update the
   controlling OpenSpec artifacts and rerun `openspec-gsd check <change>`.
   Follow `nextAction.taskId` in dependency order only after readiness permits
   execution. Before implementation, use `record evidence --stage executor` for
   required RED evidence, then record the task as `in_progress` with `record task`.
4. Record executor GREEN/REFACTOR evidence, deviations, and repairs through
   `openspec-gsd record ... --input <json-file|->`; the CLI accepts only
   automation and executor evidence. Reviewer/verifier evidence and structured
   findings must return through the host's read-only role dispatcher, which
   supplies an opaque receipt to `recordDispatchedRoleResultV2`. Finding IDs are
   derived by OpenSpec GSD and independent closure uses
   `verifyFindingFromDispatchedResultV2`; never accept a caller-selected role
   label or finding ID as assurance provenance.
   Record a completed task with `record task <change> <task-id> --status complete
   --event-id <id>`; this operation updates the authoritative checkbox in
   `tasks.md` and returns the next dependency-satisfied task. Do not edit
   `.openspec-gsd` JSON or create replacement planning documents.
   Never edit `.openspec-gsd` files directly.
5. Invoke `openspec-gsd check <change>` after execution and report every
   blocking, warning, or human-needed result with its evidence references.

Commits, branches, and worktrees remain disabled unless the user explicitly
enables each operation and the host reports the required capability.
