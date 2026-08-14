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
npm install --global github:radioflyer28/OpenSpec#v1.8.0-gsd.1
openspec --version # 1.8.0-gsd.1
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

### Pi 0.84.2

The companion is also a Pi package. A private system-level installation uses
the local checkout directly and does not publish to a registry:

```bash
pnpm build
pi install /absolute/path/to/openspec-gsd
pi list
```

This exposes `/opsx-run`, `/opsx-check`, `/opsx-run-status`, `/opsx-debug`, and
`/opsx-uat`, plus the corresponding `openspec-*` skills. The Pi package includes
a minimal runtime extension that places its bundled `openspec-gsd` CLI on the
`PATH` of Pi-launched commands, so no separate global CLI installation is
required. Re-run `pnpm build` after changing a workflow; the build regenerates
the Pi resources from the canonical workflow contributions.

The local development dependency uses `../OpenSpec`; it is not included in the
private packed artifact. Runtime imports use only `@fission-ai/openspec/extensions`.

## Workflows and CLI

After OpenSpec reconciles the extension, supported tools receive:

- `/opsx:run <change> [--mode quick|guarded|full]`
- `/opsx:check <change> [--repair]`
- `/opsx:run-status <change>`
- `/opsx:debug <change> [--finding <id>]`
- `/opsx:uat <change>`

The generated workflows invoke the portable companion CLI:

```bash
openspec-gsd run add-feature
openspec-gsd check add-feature
openspec-gsd run-status add-feature --json
openspec-gsd debug add-feature --finding <id> --json
openspec-gsd uat add-feature --json
```

`quick` performs artifact validation, deterministic checks, targeted tests,
scenario mapping, and independent goal verification. `guarded` adds risk-aware
TDD, code review, and applicable specialist checks. `full` requests maximum
applicable specialist coverage and may use explicitly enabled higher execution
tiers.

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

The package root intentionally exposes only host-facing run, check, status,
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
