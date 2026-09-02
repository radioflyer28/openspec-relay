Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

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
