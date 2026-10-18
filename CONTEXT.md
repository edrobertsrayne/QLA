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
A QLA-generated record of one class's marks, per student per question, built in Phase 2 to support strengths/weaknesses analysis. An _output_ the app builds, not an uploaded document.
_Avoid_: Markscheme, gradebook, markbook

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

**Question band**:
A run of contiguous breakdown entries sharing a stored question number, shown under that question's heading on the breakdown page and the marksheet. Unrelated to a **RAG band**; say "band" alone only where the context is unmistakable.
_Avoid_: Group, section, bare "band" next to RAG colours

**Facility index**:
The proportion of a question or subquestion's available marks that a class actually gained (mean mark ÷ available marks) — the measure Phase 2's analysis ranks and RAG-colours to surface poorly answered questions. Computed per breakdown entry over marks entered, excluding absent students, unmarked cells and marks above the entry's available marks.
_Avoid_: Difficulty, average score, success rate, % marks

**RAG band**:
Red, Amber or Green, given to a facility index by fixed absolute thresholds that are the same on every paper — never relative to the class.
_Avoid_: Grade, rating, percentile

**Not scored**:
The state of a breakdown entry that has no RAG band, because its available marks are unknown or it has no marks entered yet.
_Avoid_: Ungraded, N/A

**Part-marked**:
A breakdown entry whose coverage is below 100%; it is still banded, over the marks entered.
_Avoid_: Provisional, incomplete

**Analysis**:
Every breakdown entry's facility index and RAG band, recomputed whenever a mark, an absent flag, the class or the breakdown changes. Always current; there is no run step and no out-of-date state. Per breakdown entry only — never pooled per question.
_Avoid_: Report, results, snapshot, regenerate

**Class**:
The group of students one marksheet is entered for, named by the teacher (e.g. "10C1").
_Avoid_: Roster, cohort, group, register, set

**Student**:
One member of a class on a marksheet, identified by a local student id and carrying a first name, a surname and an absent flag.
_Avoid_: Pupil, learner, candidate, row

**First name** / **Surname**:
The two separately held parts of a student's name.
_Avoid_: Forename, last name, given name, family name

**Mark**:
A whole number a student gained on one breakdown entry, from 0 up to that entry's available marks.
_Avoid_: Score, grade

**Unmarked**:
A breakdown entry for which a student has no mark yet; excluded from analysis. Not the same as a mark of 0.
_Avoid_: Blank, missing, N/A, zero

**Absent**:
A flag on a student, not a mark: every one of that student's marks is ignored in every denominator. Marks entered before the flag was set are kept and count again if it is cleared.
_Avoid_: DNS, missing, zero

**Progress**:
How much of one student's marksheet row is filled in: breakdown entries with a mark, out of all breakdown entries.
_Avoid_: Completion, count

**Coverage**:
How far one breakdown entry has been marked across the class: non-absent students with a mark, out of all non-absent students.
_Avoid_: Sample size, n

**Backup**:
A restorable copy of the whole stored breakdown and marksheet. The only thing that can bring a marksheet back after a new upload or lost browser storage.
_Avoid_: Save, export, download

**Marks export**:
A one-way CSV of a marksheet's marks for use elsewhere. Lossy: it cannot be restored from.
_Avoid_: Backup, save, download

**New upload**:
The destructive action that discards the stored breakdown and marksheet and returns to uploading a fresh assessment paper and/or markscheme. Only exists once something is stored.
_Avoid_: Reset, clear, start over
