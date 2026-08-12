# Guardrails v1 baseline

These fixtures were captured from the locally installable Guardrails v1
baseline before schema version 2 work began.

- OpenSpec API seam: `v1.8.0-guardrails.1`
- Companion source: `8c5b989` (`fix: declare companion workspace package`)
- Installation boundary: the companion is linked or packed locally against the
  released OpenSpec fork; registry publication is intentionally not required.

They are deliberately small, valid v1 projections. Migration tests use them to
ensure the v2 migration remains provenance-preserving and does not infer new
verification or human acceptance from v1 state.
