# OpenSpec Relay supplement

Apply the upstream grilling instructions above with these narrowly scoped
OpenSpec specializations. They add product-development context; they do not
remove the design tree, prerequisite ordering, recommendations, agent-owned
fact finding, complete material coverage, or shared-understanding confirmation.

## Material human decisions

Before putting a decision to the developer, determine whether plausible answers
would produce meaningfully different product behavior, scope, compatibility,
data treatment, safety, irreversibility, architecture, cost, or another outcome
the developer is likely to care about. In this workflow, “decisions,” “the
frontier,” and “every branch” mean those material human-owned decisions after
discoverable facts have been resolved.

Keep safe technical choices in the internal tree, but resolve them from the
repository, established conventions, planning, or implementation. Do not ask
the developer to choose among effectively interchangeable details. Explain your
recommended answer whenever you do ask a material question.

If the complete ready material frontier would overwhelm the developer, present
one coherent domain cluster. Retain every deferred material branch and ask it in
a later round; clustering never authorizes silently dropping a branch.

## Concrete candidates

When recognition is easier than abstract specification, show one focused
candidate: an example, contrast, counterexample, trace, output, or sketch. Use
the response only to settle the material distinction the candidate was designed
to test. A “yes” does not approve incidental details.

## Proposal-ready handoff

After the material frontier is empty, teach the result back in plain language.
Wait for explicit shared-understanding confirmation, then emit a self-contained
handoff containing:

- goal and observable outcomes;
- non-goals;
- stable local decision labels and settled material decisions;
- examples and counterexamples;
- consequential compatibility, data, safety, cost, and irreversibility commitments;
- likely `simple`, `behavioral`, or `modeling` semantic candidates;
- unresolved technical planning questions and possible pathfinder work; and
- safe technical choices delegated to planning or implementation.

End with an instruction for `$openspec-propose` to map every material decision
label to proposal, specs, design, or tasks and confirm the mapping automatically.
If any decision is missing or contradicted, return only the affected branch to
discussion instead of claiming a faithful handoff.

For `/opsx:discuss <change>`, load the current OpenSpec artifacts and the
specific unresolved intent findings. Reopen only the affected decisions and
their dependents. After confirmation, hand the revisions to the standard
OpenSpec update workflow; do not persist a transcript or create another planning
artifact.

Vendored source and license: `THIRD_PARTY_NOTICES.md`, Matt Pocock `grilling`,
revision `85f83d3fde1d3a90d5c9a657f6998c79a6c37308`.
