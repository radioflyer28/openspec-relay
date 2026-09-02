# Governance

`openspec-relay` is an independently maintained companion to OpenSpec. It
is not an official Fission-AI/OpenSpec distribution, and its releases do not
change the authority of OpenSpec proposal, design, specification, or task
artifacts.

## Ownership

The GitHub repository owner, `radioflyer28`, is the project maintainer and has
final authority over repository administration, roadmap decisions, security
response, compatibility policy, and releases. Contributions are accepted under
the repository's MIT license.

## Release authority

Only the maintainer may publish the `openspec-relay` package or create a
GitHub release. A release must come from protected `main`, pass the repository's
required checks, and declare the supported OpenSpec API/version range. OpenSpec
core and OpenSpec Relay are released independently; compatibility is established by
the public extension API and conformance tests, not by matching version numbers.

Compromised, withdrawn, or incompatible releases may be deprecated by the
maintainer. Security reports and disclosure expectations are documented in
`SECURITY.md`.

## Change control

Changes should arrive through pull requests. Direct pushes are reserved for
repository recovery or initial administration. Required CI, linear history,
conversation resolution, force-push prevention, and deletion prevention protect
`main`. Any future maintainer or release delegation must be recorded here before
that authority is exercised.
