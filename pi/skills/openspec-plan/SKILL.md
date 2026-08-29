---
name: openspec-plan
description: Refine, review, and approve an OpenSpec change for execution.
license: MIT
compatibility: Requires the openspec and openspec-gsd CLIs.
metadata:
  author: openspec-gsd
  version: "0.1.0"
---

Plan and approve an existing OpenSpec change for execution.

1. Resolve `<change>` and treat its `proposal.md`, delta specs, `design.md`, and
   `tasks.md` as the only maintained planning truth. Never create `PLAN.md`, a
   repair plan, a second task queue, or another completion model.
2. Act as the planner. Inspect repository context and refine only the standard
   OpenSpec artifacts. Classify every requirement as simple, behavioral, or
   modeling; preserve deterministic semantic minimums. Make requirement,
   scenario, task, dependency, write-set, compatibility, assumption, risk/TDD,
   and verification obligations adequate for execution.
3. Do not silently change observable intent. When an unresolved choice could
   materially alter product behavior, scope, compatibility, data treatment,
   safety, irreversibility, architecture, or cost, route it to
   `/opsx:discuss <change>`. Safe technical choices remain planner-owned.
4. Use a fresh-context pathfinder only during planning when a focused technical
   experiment, counterexample search, or state/invariant analysis is needed.
   Give it read-only repository access and a disposable experiment workspace;
   incorporate technical conclusions through the planner and route material
   product conclusions to discussion.
5. Invoke `openspec-gsd plan <change>`. A capable host should use the exported
   `planGsdChangeV1` coordinator with fresh planner, pathfinder, and read-only
   plan-reviewer dispatch. Tier 0 records self-review as `independent: false`,
   warns the developer, and requires explicit `--allow-self-review` to approve.
6. The plan reviewer evaluates semantic faithfulness, complete coverage,
   assumptions, compatibility, feasibility, pathfinder evidence, and whether
   verification can prove completion. Deterministic blockers are an immutable
   lower bound. Convergence is bounded to two review/repair cycles.
7. Report the approved semantic revision, review provenance, unresolved stable
   findings, and exact next action. `/opsx:do` may call this same coordinator for
   finding triage and replanning; it must not implement a duplicate planner.
