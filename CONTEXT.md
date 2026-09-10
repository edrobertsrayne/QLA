# QLA

QLA (Question-Level Analysis) helps a classroom teacher turn an exam paper and/or its markscheme into structured per-question data.

## Language

**Markscheme**:
The exam board's official rubric for an assessment — the marks-allocation and answer-criteria document published alongside a paper. An _input_ to Phase 1.
_Avoid_: Mark sheet, answer key (when referring to this specific document)

**Marksheet**:
A QLA-generated record of one cohort's marks, per student per question, built in Phase 2 to support strengths/weaknesses analysis. An _output_ the app builds, not an uploaded document.
_Avoid_: Markscheme, gradebook

**Assessment paper**:
The exam paper itself (the questions), uploaded alongside and/or instead of its markscheme in Phase 1.

**Specification point**:
An exact spec reference transcribed verbatim from the markscheme (e.g. "3.2.1.4"). Null when the markscheme gives none. Never inferred or guessed in the prototype.
_Avoid_: Spec code (use this term instead)

**Question summary**:
A 3–8 word summary of what a marked leaf asks (e.g. "Balanced equation for combustion"). Taken from the assessment paper when present, else the markscheme.
_Avoid_: Brief description, question content

**Command word**:
The instruction verb as printed in the paper (e.g. Explain). Verbatim, null when absent. No normalisation in the prototype.

**Assessment objective**:
One of hardcoded AO1 / AO2 / AO3 (shared across AQA/OCR GCSE and A-Level). Tagged per leaf, null when unknowable. No board picker in the prototype.

**Exam specification**:
The exam board's syllabus document defining topic/skill codes. Optional for the prototype — the teacher may attach a link to the specification PDF, fetched fresh per run as extra grounding; `specPoint` entries stay verbatim lifts from the markscheme, never inferred from the spec.
_Avoid_: Spec (informal shorthand is fine in conversation, not as a defined term)

**Marked leaf**:
The smallest thing on an assessment paper that carries its own marks (e.g. `1a`, `2bii`) — the unit one row of a breakdown describes and one column of a marksheet collects. A question that is subdivided is not itself a marked leaf; its parts are.
_Avoid_: Sub-question, part, item

**Facility index**:
The proportion of a marked leaf's available marks that a cohort actually gained — the measure Phase 2's analysis ranks and RAG-colours to surface poorly answered questions. Computed over marks entered, excluding absent students and unmarked cells.
_Avoid_: Difficulty, average score, success rate
