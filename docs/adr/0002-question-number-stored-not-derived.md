# 0002. The parent question is stored per breakdown entry, not derived from the id

## Status

Accepted

## Context

The glossary originally called the unit of a breakdown a "marked leaf": the
smallest thing on a paper carrying its own marks, named after its position
in a parse tree. Teachers do not think in trees. They think in questions
that may be broken into subquestions, and they do not care how deep the
subdivision goes: `2a` and `2bii` are both simply parts of Question 2.

`CONTEXT.md` now says exactly that. There are two levels and only two:
**Question** and **Subquestion**. One breakdown entry exists per undivided
question and per marked subquestion; a subdivided question gets no entry of
its own, and neither does an unmarked stem such as `2b` whose marks sit on
`2bi` and `2bii`.

That leaves the association itself. A marksheet is a wide grid — one column
per entry — and a teacher scanning it needs the columns banded under their
question to keep their place. Something has to say that `2a`, `2bi` and
`2bii` belong to Question 2. Two ways to get it:

- **Derive it** by parsing the verbatim `id`, taking its leading digits.
  Free, nothing added to the contract, nothing extra asked of the model.
- **Store it** as a field the model reports alongside the label it already
  read off the page.

Deriving assumes an id grammar. Exam boards do not share one: `Q2b`,
`2(b)(ii)`, `B2a` and roman-numeral top levels all appear, and `id` is
specified as a _verbatim_ lift precisely so the app never normalises what
the paper printed. A prefix rule that meets an unexpected label does not
raise anything — it bands the row wrongly and looks fine. The model, by
contrast, is already reading the question's own number off the page in
order to produce the label.

The cost of getting this wrong is not symmetric. A breakdown is stored, and
once confirmed it is read-only; adding a field later means either a
migration or a fleet of old breakdowns that cannot band their columns.

## Decision

`ParseQuestion` carries `questionNumber`: the question an entry belongs to,
verbatim as printed (`"2"` for `2bii`), equal to `id` for an undivided
question. The model is asked for it directly in the prompt.

It is validated softly. A missing or blank `questionNumber` raises a
`MISSING_QUESTION_NUMBER` warning and `applyQuestionNumberFallback` fills it
from the entry's own `id`; the run still returns HTTP 200 with the breakdown
intact, consistent with the rule that a degraded parse still reaches the
teacher rather than being withheld.

No parent-child structure is stored beyond this one string. There is no
nesting, no depth, and no representation of an unmarked stem.

## Consequences

- Banding survives any board's labelling, including ids the app has never
  seen, without the app owning an id grammar.
- The model has one more field to get right, and a wrong `questionNumber`
  is a silent mis-band exactly as a wrong prefix rule would be — the
  difference is that a _missing_ one is now visible as a warning, where a
  failed prefix parse never was.
- The fallback bands a subquestion under itself when the model omits the
  field, so a degraded parse shows `2bii` as its own band rather than
  grouping under Question 2. Wrong, but visibly wrong and non-fatal.
- Question-level facility (a whole question's marks across a cohort) is now
  computable without inventing structure later, though nothing computes it
  yet.
- Unmarked stems are absent from the breakdown entirely, so the stem's own
  wording reaches the teacher only insofar as the model folds it into its
  subquestions' summaries. A paper whose stem carries essential context
  will lose it.
- Reversing this means removing a field from stored, read-only breakdowns,
  which is why it is recorded here rather than assumed.
