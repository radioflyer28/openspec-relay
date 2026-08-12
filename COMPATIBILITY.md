# Guardrails v2 Compatibility Contract

Guardrails v2 keeps OpenSpec proposal, delta specs, design, and tasks as the
only human-maintained source of requirements, design decisions, and execution
scope. Its canonical generated record is
`openspec/changes/<change>/.guardrails/events.json`; v2 `run.json`,
`assurance.json`, and `reports/` are reproducible projections.

The companion supports API-bearing OpenSpec versions in the range declared by
`openspec-extension.json`. `openspec extension doctor guardrails` must confirm
both the semver range and the `openspec.dev/extensions/v1` capability before a
required archive gate can be considered available.

On the first v2 mutation of valid v1 generated state, Guardrails writes a
migration preview and recovery copy before replacing `events.json` or its
projections. Migration preserves v1 provenance and never infers independent
verification, UAT acceptance, or accepted risk. Corrupt or ambiguous v1 state
fails closed; read-only inspection remains possible with a compatible v1
companion revision.

Before reinstalling a v1 companion for an active migrated change, use the v2
package's `restoreV1FromMigrationBackup(changeDir)` export. It validates that
the saved event store, run projection, and assurance projection belong to the
same v1 run, restores those original records atomically per file, and leaves
the recovery copy intact for audit or retry. It intentionally does not attempt
to translate later v2-only lifecycle, debug, UAT, or release events into v1.

This increment deliberately excludes deferred Little Coder mechanisms, future
specialist-checker categories, phases, milestones, roadmaps, workstreams, and
persistent GSD project state. None of those artifacts or runtime requirements is
introduced by Guardrails v2.

Private installation is supported through `openspec extension link <path>` or a
locally packed artifact. Package-registry publication is intentionally outside
this contract.
