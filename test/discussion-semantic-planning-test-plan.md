# Discussion, semantic planning, and execution convergence test map

OpenSpec proposal, specs, design, and tasks remain the scenario source of truth.
This file records the frozen implementation baseline and assigns each requirement
family to executable evidence without creating another product plan.

## Frozen baseline

- OpenSpec fork: `b3a4202be3b2bc456d2d0526c05cf112f47d7dc3`
- OpenSpec GSD companion: `2b495bb89c0b9397e521d17169a52d18f7d06bca`
- Companion package and extension version: `0.1.0`
- Canonical event/projection version: `2`
- Existing workflow contributions: `run`, `check`, `run-status`, `debug`, `uat`
- Private macOS install fixtures: `test/actual-candidate-install.test.ts`,
  `test/pi-package.test.ts`, and `test/tier0-e2e.test.ts`
- Baseline verification on 2026-08-29: 37 files and 154 tests passed after a
  clean build.

## Scenario assignment

| Requirement family | Primary executable evidence |
| --- | --- |
| Discussion entry, materiality, rounds, candidates, handoff, and targeted re-entry | workflow generation and scripted contract tests in `test/discussion.test.ts` and `test/pi-package.test.ts` |
| Pinned grilling body, supplement boundary, drift, and attribution | byte-level package tests in `test/discussion.test.ts` and `test/package-boundary.test.ts` |
| Semantic levels, controlled behavior, modeling placement, accurate claims, and downgrades | parser/classifier tests in `test/semantics.test.ts`, schema tests, and assurance tests |
| Explicit planning, readiness, pathfinders, fresh review, convergence, and approval | `test/planning.test.ts`, `test/readiness.test.ts`, and Tier adapter tests |
| Semantic revision and checkbox normalization | `test/plan-revision.test.ts`, canonical replay tests, and status tests |
| `do`/`status` migration and generated-resource reconciliation | manifest, CLI, workflow, Pi package, and installed-candidate tests |
| Executor-wrapper/apply delegation and planner-instruction preservation | `test/execution-loop.test.ts`, execution-adapter tests, and Tier 0 end-to-end tests |
| Planner finding disposition, targeted discussion, verification, and aggregate assurance | finding, verification, gate, runner, and end-to-end tests |
| Source-of-truth and explicit exclusions | `test/source-of-truth.test.ts` and `test/exclusions.test.ts` |
| macOS/Pi qualification | installed-candidate and disposable-project acceptance tests; manual conversational usability remains a bounded final check |

Linux and Windows automation is portability evidence only. Manual qualification
is limited to macOS/Pi for this increment.
