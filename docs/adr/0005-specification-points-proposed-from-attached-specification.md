# 0005. Specification points proposed from an attached specification when the markscheme gives none

## Status

Accepted. Supersedes the `specPoint` clause of ADR 0001; the rest of ADR 0001 (per-run fetch, no cache, SSRF and memory hardening) stands.

## Context

ADR 0001 made the fetched specification grounding only: `specPoint` was an exact verbatim lift from the markscheme or `null`, and the parse prompt told the model never to infer or guess a code, even when the specification listed candidates.

Some boards' markschemes carry no specification references at all; OCR A-level markschemes are the reported case (#128). Every entry on such a paper parses with a `null` specification point, so the paper has no Topic names step, every student's roll-up is AO-only, and topic facility has nothing to show. The teacher's only way out was typing every code by hand at breakdown review.

## Decision

- A specification reference printed in the markscheme is still lifted verbatim and always wins.
- When the markscheme gives none for an entry **and a specification is attached to the run**, the model proposes the best-matching code for that entry, chosen from codes that appear in the attached specification's own text.
- Every proposed code is flagged on its entry with a per-entry parse warning, so breakdown review lists it for the teacher to check before confirming. The teacher's edit or confirmation is what makes it count, as with topic names.
- With no specification attached, the specification point stays `null`. The model never supplies a code from its own knowledge.

## Considered options

- **Propose from the model's own knowledge without a specification.** Rejected: board specifications are revised and renumbered, nothing in QLA could check the codes, and a plausible wrong code reaches every student's report.
- **A separate "Propose spec points" action at breakdown review.** Rejected: the specification is never stored (ADR 0001), so the teacher would have to supply it a second time, and it adds a second model call where the parse already holds the specification.
- **Keep the verbatim-only rule.** Rejected: it leaves whole boards' papers without topics.

## Consequences

- A specification point is now either lifted from the markscheme or proposed from the specification; the per-entry warning is the only record of which. Once the breakdown is confirmed the two are treated alike.
- The quality of proposed codes depends on the specification link the teacher attaches and on the model; breakdown review is the safeguard, not a check in code that the proposed code matches the question.
- The stored document shape does not change: provenance rides on the existing per-entry warnings.
