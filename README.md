# openspec-gsd

Risk-aware execution, RED–GREEN–REFACTOR evidence, independent verification,
specialist checker routing, and archive assurance gates for OpenSpec.

OpenSpec GSD is an independently versioned OpenSpec extension. OpenSpec proposal,
delta specs, design, and tasks remain the only human-maintained planning source;
OpenSpec GSD writes generated evidence under each change's `.openspec-gsd` folder.
It never creates `PROJECT.md`, `ROADMAP.md`, `PLAN.md`, or `STATE.md`.
It selectively adapts GSD skills and harness patterns without installing or
operating the complete GSD runtime or its project-state model.

The default is guarded, sequential Tier 0 execution with no automated commits,
branches, or worktrees. Tier 1 isolated roles and Tier 2 parallel worktrees are
used only when the host supports them and the user explicitly enables them;
every tier enforces the same assurance outcomes.

## Requirements and installation

- Node.js 20.19 or newer
- an API-bearing OpenSpec distribution in the manifest's supported range

Until the generic extension API is released by official OpenSpec, use the
maintained fork prerelease locally, verify its identity, and then link or
link a private OpenSpec GSD checkout or unpacked local artifact into the project:

```bash
npm install --global github:radioflyer28/OpenSpec#v1.11.0-gsd.1
openspec --version # 1.11.0-gsd.1
openspec extension link /absolute/path/to/openspec-gsd
openspec extension doctor gsd
```

An official `@fission-ai/openspec` release may satisfy the declared semver range
while lacking `openspec.dev/extensions/v1`; the public API feature probe remains
required, and `extension doctor` reports that case as `api-unavailable`.

For companion development against a sibling OpenSpec checkout:

```bash
pnpm install --ignore-scripts
pnpm build
openspec extension link ../openspec-gsd
openspec extension doctor gsd
```

### Pi 0.84.x

The companion is also a Pi package. A private system-level installation uses
the local checkout directly and does not publish to a registry:

```bash
pnpm build
pi install /absolute/path/to/openspec-gsd
pi list
```

The supported Pi SDK range is `>=0.84.0 <0.85.0`; development and macOS
qualification use Pi 0.84.4. This exposes `/opsx-discuss`, `/opsx-plan`, `/opsx-do`, `/opsx-check`,
`/opsx-status`, `/opsx-debug`, and `/opsx-uat`, plus the corresponding
`openspec-*` skills. The Pi package includes
a runtime extension that registers one typed in-process
`openspec_gsd_workflow` tool and places its bundled `openspec-gsd` CLI on the
`PATH` as the Tier 0 fallback. The in-process adapter live-probes the active
model, authentication, restricted session lifecycle, structured results,
cancellation, timeout, and read-only concurrency before advertising them. No
separate global CLI installation is required. Re-run `pnpm build` after changing a workflow; the build regenerates
the Pi resources from the canonical workflow contributions.

The local development dependency uses `../OpenSpec`; it is not included in the
private packed artifact. Runtime imports use only `@fission-ai/openspec/extensions`.

## Workflows and CLI

The lifecycle is proportional rather than phase-based:

```text
discuss → propose → plan → do → check/archive
                     ↑      |
                     └──────┘ blocking review or verification finding
```

`discuss` is conversational and may be bypassed for trivial or already-precise
changes. Standard `$openspec-propose` creates the authoritative artifacts.
`plan` refines and independently reviews those artifacts without creating a
parallel plan. `do` wraps canonical `$openspec-apply-change`, then reviews,
routes gaps through the same planner, repairs or replans, and goal-verifies.

After OpenSpec reconciles the extension, supported tools receive:

- `/opsx:discuss [<change>]`
- `/opsx:plan <change>`
- `/opsx:do <change>`
- `/opsx:check <change>`
- `/opsx:status <change>`
- `/opsx:debug <change> [--finding <id>]`
- `/opsx:uat <change>`

The generated workflows invoke the portable companion CLI:

```bash
openspec-gsd plan add-feature --allow-self-review # Tier 0 only; visibly non-independent
openspec-gsd do add-feature
openspec-gsd check add-feature
openspec-gsd status add-feature --json
openspec-gsd debug add-feature --finding <id> --json
openspec-gsd uat add-feature --json
```

`quick` performs artifact validation, deterministic checks, targeted tests,
scenario mapping, and independent goal verification. `guarded` adds risk-aware
TDD, code review, and applicable specialist checks. `full` requests maximum
applicable specialist coverage and may use explicitly enabled higher execution
tiers.

### Discussion contract

The discussion skill starts with Matt Pocock's complete `grilling` instruction
body, vendored byte-for-byte from commit
`85f83d3fde1d3a90d5c9a657f6998c79a6c37308`, followed by the OpenSpec GSD
supplement. Attribution and the full MIT notice are in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). The supplement preserves
the design tree, prerequisite-aware frontier, recommendation-bearing rounds,
agent-owned fact finding, complete material branch coverage, and final shared
understanding. It asks the developer only about material product decisions,
clusters large frontiers, and may use focused examples or counterexamples.
Safe timeout-like or otherwise interchangeable technical choices remain with
repository research, planning, or implementation.

Updating the pin is an explicit reviewed change: replace the vendored body,
update its revision/digest and third-party notice, regenerate all host skills,
and run the discussion contract plus packed-install suites. Upstream changes
never alter installed behavior implicitly.

### Behavioral semantics

Planning classifies every requirement at the same minimum in every execution
mode:

- `simple`: an ordinary observable outcome;
- `behavioral`: event, state, mode, ordering, timing, cancellation, retry,
  recovery, or prohibition semantics need concise controlled language;
- `modeling`: subtle concurrency, authorization state, irreversible transitions,
  or high-consequence invariants need explicit state, transition, assumption,
  counterexample, and verification reasoning.

Observable meaning remains in specs, supporting models and assumptions in
design, and verification work in tasks. The vocabulary is FRET/PVS-inspired,
but v1 installs or invokes neither tool and never claims `FRET-valid`,
`PVS-proven`, or formally verified without corresponding official tool evidence.
An unresolved required level produces `human_needed`; an accepted lower level is
audited and remains visible as a warning rather than being reported as complete.

### Role authority

- The discussion role resolves material human intent; no raw transcript is
  required or persisted.
- The planner may edit only proposal, delta specs, design, and tasks. The
  planning-only pathfinder has read-only repository access plus a disposable
  experiment workspace. The plan reviewer is fresh-context and read-only.
- Tier 0 may continue only after an explicit self-review choice; its approval is
  recorded as `independent: false` and remains a warning.
- The executor wrapper passes the approved revision, planner instructions,
  semantic obligations, risk/TDD constraints, findings, and evidence needs to
  canonical `$openspec-apply-change`. It does not own another task queue or apply
  loop.
- Code reviewers and goal verifiers are read-only. Executor self-report cannot
  close their gates. Stable technical findings return to the planner; product
  meaning gaps return to targeted discussion.

## Configuration

Project configuration lives at `openspec/gsd.json`; a change may override
it with `openspec/changes/<change>/gsd.json`. Task overrides have highest
precedence:

```json
{
  "version": 2,
  "mode": "guarded",
  "tdd": "auto",
  "repairLimit": 2,
  "allowAgentDispatch": false,
  "allowParallel": false,
  "piHostAdapter": {
    "enabled": false,
    "forceTier0": false,
    "maxReadOnlyConcurrency": 2
  },
  "git": {
    "commits": false,
    "branches": false,
    "worktrees": false
  },
  "requiredCheckers": [],
  "disabledCheckers": [],
  "features": {
    "repositoryContext": { "enabled": true, "boundaries": [] },
    "readiness": { "rollout": "report_only", "independentRequired": true },
    "debug": { "enabled": true, "automaticTransition": true },
    "uat": { "enabled": true, "required": false },
    "releaseAssurance": { "enabled": "auto", "surfaces": [], "configuredCommands": [], "requiredPlatforms": [] }
  },
  "taskOverrides": {
    "2.1": {
      "tdd": "always",
      "dependencies": ["1.3"],
      "writeSet": ["src/auth"]
    }
  }
}
```

The Pi adapter is opt-in. Set `piHostAdapter.enabled` to `true` for live Tier 1
qualification. Nested assurance roles add model calls, latency, and token cost;
only applicable roles run, and independent pathfinders are capped by
`maxReadOnlyConcurrency` (1–4). Set `forceTier0` to `true` for immediate
rollback without uninstalling the package. Status distinguishes `available`,
`disabled`, `probe_failed`, and `unsupported_version`, and records only the
adapter version, Pi version, model reference, capability states, and
qualification time—never credentials, prompts, private reasoning, or session
identity.

`openspec extension doctor gsd` validates the static package manifest and core
compatibility. It intentionally cannot see an ephemeral adapter inside a live
Pi session; use `/opsx:status <change>` in Pi to inspect live qualification and
the recorded assurance provenance.

Generated execution evidence is stored under
`openspec/changes/<change>/.openspec-gsd/events.json`; `run.json`,
and `assurance.json` are replaceable v2 projections. Only the OpenSpec GSD
orchestrator writes these files. Automation/executor records may use the CLI;
read-only reviewer/verifier results must pass through `dispatchRoleV2` and its
process-local opaque receipt before `recordDispatchedRoleResultV2`,
`verifyFindingFromDispatchedResultV2`, or technical debug closure can mutate
the execution records. Structured findings omit caller-selected IDs; OpenSpec GSD derives stable
IDs from provider, rule, category, and scope. Role adapters return structured
results through these supported operations instead of appending events directly. The core-owned
`.openspec-gates.json` records the durable `gsd.assurance` archive
obligation. Acceptance is digest-bound; stale evidence requires renewed human
acceptance. Missing, disabled, corrupt, timed-out, or mismatched providers fail
closed through OpenSpec's archive gate protocol.

The package root intentionally exposes only host-facing plan, do, check, status,
workflow-result, dispatch receipt, stable-finding, UAT, debugging, tier-adapter,
configuration, and gate APIs.
Canonical event append, replay, projection-write, and filesystem-record helpers
are internal implementation details.

Release assurance is for private artifact outcomes: pack or build, inspect,
install in a disposable project, and exercise declared installed interfaces. It uses
argument-vector execution, a minimal environment, bounded redacted output, and
disabled package lifecycle scripts. These are operational safeguards, not a
filesystem, network, process, or identity sandbox. When a required isolation or
platform capability is unavailable, OpenSpec GSD records `human_needed`.

## Upgrade and release order

1. Upgrade the maintained fork prerelease and run
   `openspec extension doctor gsd`.
2. Upgrade OpenSpec GSD by relinking its checked-out directory. To verify a
   private packed artifact, unpack or locally install that artifact first, then
   link its unpacked extension directory with `openspec extension link <path>`;
   the current core `install` command is registry-only.
3. Run `openspec extension doctor gsd` again and regenerate configured
   workflows with `openspec update` if needed.
4. Finish or explicitly override any active change gate obligations before
   disabling or removing an older package. Disabling an extension does not erase
   existing obligations.

OpenSpec and OpenSpec GSD are packaged and versioned independently. This private
increment qualifies both units on macOS through conformance, cross-repository,
pack, clean-install, and installed-workflow checks. The implementation retains
portable path handling, but Linux and Windows are not qualified or claimed as
supported until a future change adds their hosted evidence. Registry publication
is not part of this workflow.

When official OpenSpec publishes this API, install its first documented
API-bearing release, run `openspec extension doctor gsd`, and only then
remove the fork installation. OpenSpec GSD will move its minimum supported version
to that official release; generated execution records and gate obligations do not change
during the transition. If doctor reports `api-unavailable`, restore the last
supported fork prerelease rather than disabling the required gate.

Repository ownership, change control, and release authority are documented in
[`GOVERNANCE.md`](./GOVERNANCE.md). The complete upstream-update,
compatibility, release-order, rollback, and official-upstream procedures are in
[`MAINTENANCE.md`](./MAINTENANCE.md).

## Development

```bash
pnpm build
pnpm lint
pnpm test
pnpm conformance
pnpm pack
```
