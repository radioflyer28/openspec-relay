# Guardrails Maintenance and Release Runbook

Guardrails is released independently from OpenSpec. The maintained OpenSpec
fork carries only the generic extension seam; all Guardrails orchestration,
policy, schemas, checkers, generated records, and workflows stay in this
repository. OpenSpec proposal, delta specs, design, and tasks remain the only
human-maintained planning truth.

## Routine upstream update

1. Fetch `Fission-AI/OpenSpec` into the maintained fork without changing the
   companion repository.
2. Create a temporary integration branch from the current fork release line and
   merge or rebase the selected official revision.
3. Resolve upstream behavior first, then reapply only the generic seam. Do not
   move Guardrails policy into OpenSpec to avoid a conflict.
4. In OpenSpec, run `pnpm check:extension-seam`, build, type-check, lint, and the
   full test suite. Update the recorded seam base only after reviewing the
   resulting allowlist and budget report.
5. In this repository, point `OPENSPEC_CORE_ROOT` at the candidate checkout and
   run build, type-check, lint, full tests, and conformance.
6. Run the cross-repository lifecycle suite and pack both release units for
   private link or packed-artifact installation.
7. Push both candidate branches and require real Linux, macOS, and Windows CI
   results before sharing a new private artifact.

The OpenSpec seam-specific conflict history, file budget, and rationale live in
`docs/extension-seam-maintenance.md` in the fork. A new production edit outside
the documented seam is a design review item, not routine conflict resolution.

## Compatibility diagnosis

Run `openspec extension doctor guardrails` after every core or companion
upgrade. Diagnose failures in this order:

1. Confirm `openspec --version` is the expected `-guardrails.N` prerelease or an
   official API-bearing version.
2. Confirm the core exports `@fission-ai/openspec/extensions` and exposes the
   `OPEN_SPEC_EXTENSION_API_V1` feature marker.
3. Inspect `openspec/extensions.lock.yaml` for the resolved extension version,
   source, integrity, and enabled state.
4. Re-run `openspec update` to reconcile generated workflows for configured
   hosts. Modified user files are preserved and reported rather than replaced.
5. Run the companion conformance suite against both the minimum and maximum
   supported core versions.

Semver compatibility alone is insufficient. An absent API feature marker,
unavailable required provider, corrupt record, or required capability mismatch
must remain a fail-closed archive condition.

## Release order

1. Assign the fork a unique prerelease such as `1.8.0-guardrails.2`; never reuse
   an official stable version.
2. Build, test, and pack the API-bearing fork artifact. Verify its repository
   identity and public extension export from the locally installed artifact.
3. Install that exact artifact in a clean environment and run this repository's
   conformance and cross-repository suites against it.
4. Assign the companion version only after the fork artifact passes.
5. Install both private artifacts in a clean project, unpack or locally install
   Guardrails, link its unpacked directory, run doctor, generate workflows,
   exercise a guarded run, satisfy a human gate, exercise an audited override,
   and archive.
6. Record private release notes with the supported core range, API feature
   marker, generated-state regeneration notes, and compatible rollback pair.
   Do not publish to a package registry as part of this workflow.

## Rollback

Roll back the companion first when its policy or runtime is faulty, while
leaving the compatible core seam installed. Roll back the fork when extension
discovery, workflow generation, compatibility, or archive enforcement is
faulty, then install the last companion version compatible with that fork.

Do not disable Guardrails to bypass an active required gate. Existing
`.openspec-gates.json` obligations survive disabling; resolve them, record human
acceptance, or use the explicit `--override-gate` plus `--reason` audit path.
Preserve `.guardrails/` and `.openspec-gates.json` when restoring an active
change so evidence and decisions remain reviewable.

Do not downgrade generated state. If a private development revision changed the
unpublished schema incompatibly, retain the OpenSpec artifacts, remove only the
known generated Guardrails records after reviewing them, regenerate with the
selected companion revision, and reconfirm every human acceptance or accepted
risk. Never present regenerated evidence as preserving an older decision.

## Transition to official OpenSpec

When official OpenSpec releases the generic API, verify its documented API
version and feature marker in CI before changing the companion's minimum core
version. Run conformance against the last fork release and the first official
release during the transition window. Install the official release, run doctor,
regenerate workflows, and complete a cross-repository archive scenario before
removing the fork. The transition changes the provider distribution, not
Guardrails records, gate IDs, or OpenSpec's source-of-truth boundary.
