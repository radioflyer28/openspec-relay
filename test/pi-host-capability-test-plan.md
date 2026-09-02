# Pi host capability adapter test map

Baselines captured for `add-pi-host-capability-adapters`:

- OpenSpec fork: `5592834832e73a04e10acbaaa6d06761ef30df93`
- OpenSpec Relay companion: `800171785646af0043e55c81a0895d90e4b4d503`
- OpenSpec CLI: `1.8.0-relay.1`
- Pi and public SDK: `0.84.4`
- Node.js qualification runtime: `v26.7.0`
- Initial qualified host: macOS; Linux and Windows CI are portability evidence only

| Contract | Executable evidence |
| --- | --- |
| Runtime-evidence capability advertisement and Tier 0 fallback | `pi-host-adapter.test.ts`, `pi-package.test.ts` |
| Fresh plan-reviewer, pathfinder, reviewer, and verifier contexts | `pi-role-dispatch.test.ts`, installed macOS qualification |
| Host-enforced read-only and disposable experiment authority | `pi-role-dispatch.test.ts`, `pi-workspace.test.ts` |
| Structured result identity, evidence, staleness, timeout, and cancellation | `pi-role-dispatch.test.ts` |
| Bounded deterministic read-only concurrency | `pi-analysis-scheduler.test.ts` |
| In-process workflow reuse and Tier 0 rollback | `pi-workflow-adapter.test.ts`, `pi-package.test.ts` |
| No daemon, persistent capability file, third-party subagent dependency, worktrees, or Git automation | `exclusions.test.ts`, `package-boundary.test.ts` |
| Cross-platform path behavior and packaging | CI matrix, package and workspace tests |

