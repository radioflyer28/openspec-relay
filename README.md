# openspec-guardrails

Risk-aware execution, RED–GREEN–REFACTOR evidence, independent verification,
specialist checker routing, and archive assurance gates for OpenSpec.

Guardrails is an independently versioned OpenSpec extension. OpenSpec proposal,
delta specs, design, and tasks remain the only human-maintained planning source;
Guardrails writes generated evidence under each change's `.guardrails` folder.
It never creates `PROJECT.md`, `ROADMAP.md`, `PLAN.md`, or `STATE.md`.

The default is guarded, sequential Tier 0 execution with no automated commits,
branches, or worktrees. Tier 1 isolated roles and Tier 2 parallel worktrees are
used only when the host supports them and the user explicitly enables them;
every tier enforces the same assurance outcomes.

## Requirements and installation

- Node.js 20.19 or newer
- an API-bearing OpenSpec distribution in the manifest's supported range

Until the generic extension API is released by official OpenSpec, install the
maintained fork prerelease first, verify its identity, and then install
Guardrails into the project:

```bash
npm install --global github:radioflyer28/OpenSpec#v1.8.0-guardrails.1
openspec --version # 1.8.0-guardrails.1
openspec extension install openspec-guardrails
openspec extension doctor guardrails
```

An official `@fission-ai/openspec` release may satisfy the declared semver range
while lacking `openspec.dev/extensions/v1`; the public API feature probe remains
required, and `extension doctor` reports that case as `api-unavailable`.

For companion development against a sibling OpenSpec checkout:

```bash
pnpm install --ignore-scripts
pnpm build
openspec extension link ../openspec-guardrails
openspec extension doctor guardrails
```

The local development dependency uses `../OpenSpec`; it is not included in the
published package. Runtime imports use only `@fission-ai/openspec/extensions`.

## Workflows and CLI

After OpenSpec reconciles the extension, supported tools receive:

- `/opsx:run <change> [--mode quick|guarded|full]`
- `/opsx:check <change> [--repair]`
- `/opsx:run-status <change>`

The generated workflows invoke the portable companion CLI:

```bash
openspec-guardrails run add-feature
openspec-guardrails check add-feature
openspec-guardrails run-status add-feature --json
```

`quick` performs artifact validation, deterministic checks, targeted tests,
scenario mapping, and independent goal verification. `guarded` adds risk-aware
TDD, code review, and applicable specialist checks. `full` requests maximum
applicable specialist coverage and may use explicitly enabled higher execution
tiers.

## Configuration

Project configuration lives at `openspec/guardrails.json`; a change may override
it with `openspec/changes/<change>/guardrails.json`. Task overrides have highest
precedence:

```json
{
  "version": 1,
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
  "taskOverrides": {
    "2.1": {
      "tdd": "always",
      "dependencies": ["1.3"],
      "writeSet": ["src/auth"]
    }
  }
}
```

Generated state is stored under
`openspec/changes/<change>/.guardrails/{run,assurance}.json`. The core-owned
`.openspec-gates.json` records the durable `guardrails.assurance` archive
obligation. Acceptance is digest-bound; stale evidence requires renewed human
acceptance. Missing, disabled, corrupt, timed-out, or mismatched providers fail
closed through OpenSpec's archive gate protocol.

## Upgrade and release order

1. Upgrade the maintained fork prerelease and run
   `openspec extension doctor guardrails`.
2. Upgrade Guardrails with `openspec extension install openspec-guardrails@<version>`.
3. Run `openspec extension doctor guardrails` again and regenerate configured
   workflows with `openspec update` if needed.
4. Finish or explicitly override any active change gate obligations before
   disabling or removing an older package. Disabling an extension does not erase
   existing obligations.

OpenSpec and Guardrails are packaged and released independently. The companion
CI builds both the selected OpenSpec integration branch and Guardrails, runs the
conformance and cross-repository suites on Linux, macOS, and Windows, and packs
both release units before publication.

When official OpenSpec publishes this API, install its first documented
API-bearing release, run `openspec extension doctor guardrails`, and only then
remove the fork installation. Guardrails will move its minimum supported version
to that official release; generated state and gate obligations do not change
during the transition. If doctor reports `api-unavailable`, restore the last
supported fork prerelease rather than disabling the required gate.

Repository ownership, change control, and release authority are documented in
[`GOVERNANCE.md`](./GOVERNANCE.md).

## Development

```bash
pnpm build
pnpm lint
pnpm test
pnpm conformance
pnpm pack
```
