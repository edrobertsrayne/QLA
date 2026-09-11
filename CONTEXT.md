# QLA

QLA (Question-Level Analysis) helps a classroom teacher turn an exam paper and/or its markscheme into structured per-question data.

## Language

**Markscheme**:
The exam board's official rubric for an assessment — the marks-allocation and answer-criteria document published alongside a paper. An _input_ to Phase 1.
_Avoid_: Mark sheet, answer key (when referring to this specific document)

**Breakdown**:
The structured record of an assessment paper: one entry per undivided question and one per marked subquestion, each carrying its marks, question summary, specification point, command word and assessment objective. Phase 1's output and the thing a marksheet's columns are keyed against.
_Avoid_: Parse result, question list, paper structure

**Breakdown confirmation**:
The one-way moment a teacher accepts a breakdown as correct, after which it is read-only and a marksheet can be built against it. Reversible only by an explicit unlock that warns it may affect marks already entered.
_Avoid_: Approval, locking, freezing

**Marksheet**:
A QLA-generated record of one cohort's marks, per student per question, built in Phase 2 to support strengths/weaknesses analysis. An _output_ the app builds, not an uploaded document.
_Avoid_: Markscheme, gradebook

**Local student id**:
The stable identifier a marksheet uses to tie a student's marks to their name, so renaming a student or inserting one mid-list never reassigns marks. Generated on the teacher's device and never sent anywhere — distinct from the Phase 3 pseudonymization UUID, which exists to keep names away from the model.
_Avoid_: Pseudonym, student UUID (those mean the Phase 3 concept)

**Assessment paper**:
The exam paper itself (the questions), uploaded alongside and/or instead of its markscheme in Phase 1.

**Specification point**:
An exact spec reference transcribed verbatim from the markscheme (e.g. "3.2.1.4"). Null when the markscheme gives none. Never inferred or guessed in the prototype.
_Avoid_: Spec code (use this term instead)

**Question summary**:
A 3–8 word summary of what a question or subquestion asks (e.g. "Balanced equation for combustion"). Taken from the assessment paper when present, else the markscheme.
_Avoid_: Brief description, question content

**Command word**:
The instruction verb as printed in the paper (e.g. Explain). Verbatim, null when absent. No normalisation in the prototype.

**Assessment objective**:
One of hardcoded AO1 / AO2 / AO3 (shared across AQA/OCR GCSE and A-Level). Tagged per breakdown entry, null when unknowable. No board picker in the prototype.

**Exam specification**:
The exam board's syllabus document defining topic/skill codes. Optional for the prototype — the teacher may attach a link to the specification PDF, fetched fresh per run as extra grounding; `specPoint` entries stay verbatim lifts from the markscheme, never inferred from the spec.
_Avoid_: Spec (informal shorthand is fine in conversation, not as a defined term)

**Question**:
A numbered question on an assessment paper (e.g. `2`). Undivided, it carries its own marks and gets one breakdown entry; divided, it carries none of its own and its subquestions do. Every breakdown entry names the question it belongs to, so a marksheet can band its columns under it.
_Avoid_: Marked leaf, leaf, item

**Subquestion**:
Anything below a question, at any depth: `2a` and `2bii` are equally subquestions of Question 2, and the model has no levels in between. Only subquestions carrying their own marks reach a breakdown — an unmarked stem such as `2b`, whose marks sit on `2bi` and `2bii`, is not an entry.
_Avoid_: Sub-question, part, item, leaf

**Facility index**:
The proportion of a question or subquestion's available marks that a cohort actually gained — the measure Phase 2's analysis ranks and RAG-colours to surface poorly answered questions. Computed over marks entered, excluding absent students and unmarked cells.
_Avoid_: Difficulty, average score, success rate
