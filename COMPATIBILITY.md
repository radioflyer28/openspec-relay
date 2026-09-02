# OpenSpec Relay v2 Compatibility Contract

OpenSpec Relay v2 keeps OpenSpec proposal, delta specs, design, and tasks as the
only human-maintained source of requirements, design decisions, and execution
scope. Its canonical generated record is
`openspec/changes/<change>/.openspec-relay/events.json`; v2 `run.json` and
`assurance.json` are reproducible projections.

The companion supports API-bearing OpenSpec versions in the range declared by
`openspec-extension.json`. `openspec extension doctor relay` must confirm
both the semver range and the `openspec.dev/extensions/v1` capability before a
required archive gate can be considered available.

The currently qualified minimum is the privately maintained
`@fission-ai/openspec@1.11.0-relay.1` build. Official OpenSpec `1.11.0` is not an
equivalent runtime until it exposes the versioned extension API: matching the
semver range alone cannot satisfy the capability probe.

Version 2 execution records use an unpublished private-development format. The
current runtime does not maintain version 1 readers, downgrade bundles, or
restoration APIs. Encountering pre-release version 1 records fails closed with
regeneration guidance; any human acceptance or accepted risk must then be
recorded again explicitly. Git history and retained local package revisions are
the implementation rollback mechanism, not execution-record downgrade.

OpenSpec Relay assumes a cooperative repository owner and ordinary same-user
processes. Schema validation, replay, content digests, projection comparison,
path containment, and atomic replacement protect assurance consistency and
accidental corruption; they are not a tamper-proof ledger or a sandbox. Strong
identity and isolation remain host capabilities.

This increment deliberately excludes deferred Little Coder mechanisms, future
specialist-checker categories, phases, milestones, roadmaps, workstreams, and
persistent project-management state. None of those artifacts or runtime
requirements is introduced by OpenSpec Relay v2, and the companion neither
installs nor requires the complete GSD runtime.

The semantic vocabulary is inspired by FRET and PVS principles, but neither is a
runtime dependency. `simple`, `behavioral`, and `modeling` describe required
analysis depth, not tool certification. Only official tool evidence may support
FRET-valid, PVS-proven, or formal-verification claims.

The pre-1.0 workflow rename from `run`/`run-status` to `do`/`status` is
deliberately breaking. Reconciliation removes only extension-owned legacy host
artifacts. The product rename does not provide executable aliases or automatic
`.openspec-gsd` record migration; inspected disposable development records are
removed and regenerated as `.openspec-relay` records.

Private installation is qualified on macOS through `openspec extension link
<path>` or a locally packed artifact. Linux and Windows remain portability
targets without a support claim in this increment. Package-registry publication
is intentionally outside this contract.

The Pi adapter supports public Pi SDK versions `>=0.84.0 <0.85.0`; Pi 0.84.4 is
the macOS qualification baseline. Linux and Windows CI compile, package, and run
schema, fallback, and path-containment tests as portability evidence only.
Runtime dispatch is default-off and must pass live capability probes. Static
`openspec extension doctor` checks cannot observe the active Pi model,
authentication, session lifecycle, or restricted tool inventory and therefore
do not qualify the live adapter.
