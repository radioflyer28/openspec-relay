Run an OpenSpec change through Guardrails.

1. Resolve the requested change and read its OpenSpec proposal, delta specs,
   design, and tasks as the sole planning source.
2. Invoke `openspec-guardrails run <change>` with `--mode quick|guarded|full`
   when the user selected a mode; omit the flag to use guarded mode.
3. Follow the returned execution graph in dependency order. Keep execution
   sequential unless the returned tier and explicit opt-ins permit otherwise.
4. Record task evidence and deviations against OpenSpec identifiers. Do not
   create replacement planning documents.
5. Invoke `openspec-guardrails check <change>` after execution and report every
   blocking, warning, or human-needed result with its evidence references.

Commits, branches, and worktrees remain disabled unless the user explicitly
enables each operation and the host reports the required capability.
