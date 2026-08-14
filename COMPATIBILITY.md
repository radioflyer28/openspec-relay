# OpenSpec GSD v2 Compatibility Contract

OpenSpec GSD v2 keeps OpenSpec proposal, delta specs, design, and tasks as the
only human-maintained source of requirements, design decisions, and execution
scope. Its canonical generated record is
`openspec/changes/<change>/.openspec-gsd/events.json`; v2 `run.json` and
`assurance.json` are reproducible projections.

The companion supports API-bearing OpenSpec versions in the range declared by
`openspec-extension.json`. `openspec extension doctor gsd` must confirm
both the semver range and the `openspec.dev/extensions/v1` capability before a
required archive gate can be considered available.

Version 2 execution records use an unpublished private-development format. The
current runtime does not maintain version 1 readers, downgrade bundles, or
restoration APIs. Encountering pre-release version 1 records fails closed with
regeneration guidance; any human acceptance or accepted risk must then be
recorded again explicitly. Git history and retained local package revisions are
the implementation rollback mechanism, not execution-record downgrade.

OpenSpec GSD assumes a cooperative repository owner and ordinary same-user
processes. Schema validation, replay, content digests, projection comparison,
path containment, and atomic replacement protect assurance consistency and
accidental corruption; they are not a tamper-proof ledger or a sandbox. Strong
identity and isolation remain host capabilities.

This increment deliberately excludes deferred Little Coder mechanisms, future
specialist-checker categories, phases, milestones, roadmaps, workstreams, and
persistent GSD project state. None of those artifacts or runtime requirements is
introduced by OpenSpec GSD v2, and the companion neither installs nor requires
the complete GSD runtime.

Private installation is qualified on macOS through `openspec extension link
<path>` or a locally packed artifact. Linux and Windows remain portability
targets without a support claim in this increment. Package-registry publication
is intentionally outside this contract.
