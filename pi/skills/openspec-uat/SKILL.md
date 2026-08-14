---
name: openspec-uat
description: Guide scenario-by-scenario human acceptance for an OpenSpec GSD run.
license: MIT
compatibility: Requires the openspec and openspec-gsd CLIs.
metadata:
  author: openspec-gsd
  version: "0.1.0"
---

Guide human acceptance one scenario at a time.

Invoke `openspec-gsd uat <change> --json` to receive the next unresolved
scenario, its prerequisites, action, and expected observable result. Record a
human decision with `openspec-gsd uat <change> --scenario <id> --status
passed|failed|blocked|accepted_limitation --actor <human> --notes <text>` and
optional portable evidence references.

Failures create linked repair findings. Independently verified repairs return to
human retest. An accepted limitation remains visible as accepted risk; it is not
reported as behavior that passed. OpenSpec proposal, specs, design, and tasks
remain the sole human-maintained planning truth.
