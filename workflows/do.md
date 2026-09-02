Carry an approved OpenSpec change through implementation and assurance.

1. In Pi, invoke `openspec_gsd_workflow` with operation `do` before any
   implementation write. If it requests canonical apply, perform the selected
   `$openspec-apply-change` task and invoke the same tool again. If it reports a
   fallback, invoke its exact `openspec-gsd do <change>` command. Refuse an
   absent or stale semantic plan approval and route to `/opsx:plan <change>`;
   checkbox-only task progress does not stale approval.
2. Act as the executor wrapper around `$openspec-apply-change`. For each selected
   authoritative task, pass its approved revision, planner instructions,
   semantic obligations, scenarios/invariants, risk and RED–GREEN–REFACTOR
   constraints, stable findings, and evidence requirements to the canonical
   apply capability. Planner instructions supplement and constrain ordinary
   apply behavior when they are consistent with authoritative product intent.
3. Let `$openspec-apply-change` own artifact loading, task implementation, and
   task checkbox updates. Do not maintain a second task queue, copy task prose
   into generated state, invent another completion status, reproduce the apply
   loop, or edit `.openspec-gsd` files directly.
4. Dispatch code review and goal verification in fresh, read-only contexts.
   Executor self-report cannot satisfy them. Give both roles the current specs,
   approved revision, planner instructions, semantic obligations, scenarios,
   evidence, and applicable dispositions.
5. Route every blocking finding through the shared `planGsdChangeV1` capability.
   The planner either associates a current-plan defect with its original task
   for canonical-apply repair, revises an inadequate plan and obtains renewed
   review/approval, requests a planning pathfinder, or pauses for targeted
   `/opsx:discuss <change>` when product intent is materially unresolved.
6. Automatically resume after technical replanning. Bound unchanged review or
   verification failures to two convergence cycles, then report `human_needed`
   with the stable findings and exact next action.
7. In Pi, use `openspec_gsd_workflow` operation `check` after review and
   verification pass; otherwise use its CLI fallback. Report assurance and
   archive blockers; do not weaken semantic minimums based on quick, guarded,
   or full execution breadth.

Commits, branches, parallel waves, and worktrees remain disabled unless the
developer explicitly enables each operation and the host supports it.
