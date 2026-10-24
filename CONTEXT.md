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
The one-way moment a teacher accepts an assessment's breakdowns as correct: every tier's breakdown together with its common questions, all at once. After it they are read-only and a marksheet can be built against them. Reversible only by an explicit unlock, which reopens every tier and the common questions together and warns that it may affect marks already entered.
_Avoid_: Approval, locking, freezing

**Marksheet**:
A QLA-generated record of one class's marks, per student per question, built in Phase 2 to support strengths/weaknesses analysis. An _output_ the app builds, not an uploaded document.
_Avoid_: Markscheme, gradebook, markbook

**Local student id**:
The stable identifier a marksheet uses to tie a student's marks to their name, so renaming a student or inserting one mid-list never reassigns marks. Generated on the teacher's device and never sent anywhere: no student identifier of any kind crosses to the server.
_Avoid_: Pseudonym, student UUID

**Assessment**:
The thing a whole class sat, holding one or two tiers plus the class, its marksheet and its reports. A paper with no tiers is an assessment with a single tier.
_Avoid_: Paper (for the whole thing), exam, test

**Tier**:
One of an assessment's papers at a set level, with its own assessment paper and/or markscheme, breakdown and grade boundaries. Its **tier name** (e.g. Higher, Foundation) is lifted from the tier printed on the paper when there is one, checked by the teacher at breakdown review and editable afterwards; it may be blank on a single-tier assessment but is required and distinct on a two-tier one. A paper number (Paper 1, Paper 2) is never a tier. An assessment holds at most two tiers.
_Avoid_: Paper, level, version, entry

**Common question**:
A pair of breakdown entries, one on each tier of a two-tier assessment, that are the same task worth the same available marks (e.g. Foundation `14a` ↔ Higher `3a`). Strictly one-to-one. Proposed by the model from both assessment papers and confirmed by the teacher alongside both tiers' breakdowns; a near-match with different marks is not a common question.
_Avoid_: Shared question, overlap question, linked entry

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
One of hardcoded AO1 / AO2 / AO3 (shared across AQA/OCR GCSE and A-Level). Tagged per breakdown entry, null when unknowable. No board picker in the prototype. May carry an **AO description**.

**AO description**:
A short, student-readable summary of an assessment objective (one phrase, about 10 words at most), lifted from the specification at parse, editable at breakdown review and shown beside the AO code in a report's By skill strip. Never inferred without a specification: with none attached, or one that does not define the AO, the AO has no description and the report shows the code alone. One set per assessment, shared by both tiers (so it travels in backups), display only: never sent to the report model, and editing one does not make any report out of date.

**Exam specification**:
The exam board's syllabus document defining topic/skill codes. Optional for the prototype — the teacher may attach a link to the specification PDF, fetched fresh per run as extra grounding; `specPoint` entries stay verbatim lifts from the markscheme, never inferred from the spec. The spec's one other contribution is the **AO description**; the spec itself is never stored.
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
The proportion of a question or subquestion's available marks that its students actually gained (mean mark ÷ available marks) — the measure Phase 2's analysis ranks and RAG-colours to surface poorly answered questions. Computed per breakdown entry over the students who sit its tier, excluding absent students, unmarked cells and marks above the entry's available marks. A **common question** also gets a pooled facility index over both tiers' students, shown beside each tier's own and the gap between them.
_Avoid_: Difficulty, average score, success rate, % marks

**RAG band**:
Red, Amber or Green, given to a share of available marks by fixed absolute thresholds that are the same on every paper — never relative to the class. Given to a class's facility index in analysis, and to a student's own mark on a breakdown entry or own roll-up figure in a report; never to a student's total mark.
_Avoid_: Grade, rating, percentile

**Not scored**:
The state of a breakdown entry that has no RAG band, because its available marks are unknown or it has no marks entered yet.
_Avoid_: Ungraded, N/A

**Part-marked**:
A breakdown entry whose coverage is below 100%; it is still banded, over the marks entered.
_Avoid_: Provisional, incomplete

**Analysis**:
Every breakdown entry's facility index and RAG band, recomputed whenever a mark, an absent flag, a student's tier, the class or the breakdown changes. Always current; there is no run step and no out-of-date state. Per breakdown entry only — never pooled per question. Each tier's entries are analysed over that tier's students; a common question additionally gets a pooled facility index over both tiers' students, shown beside each tier's own and the gap between them.
_Avoid_: Report, results, snapshot, regenerate

**Class**:
The group of students one marksheet is entered for, named by the teacher (e.g. "10C1").
_Avoid_: Roster, cohort, group, register, set

**Student**:
One member of a class on a marksheet, identified by a local student id and carrying a first name, a surname, an absent flag and, on a two-tier assessment, the tier they sat (not set until the teacher chooses; marks on the other tier are kept but never count).
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
How much of one student's marksheet row is filled in: breakdown entries of their tier with a mark, out of all breakdown entries of that tier.
_Avoid_: Completion, count

**Coverage**:
How far one breakdown entry has been marked across its tier: non-absent students on that tier with a mark, out of all non-absent students on that tier. A student with no tier is on no tier's coverage.
_Avoid_: Sample size, n

**Backup**:
A restorable copy of everything stored for the assessment: every tier's breakdown and grade boundaries, the marksheet, common questions, topic names, AO descriptions and reports, teacher edits included. The only thing that can bring them back after a new upload or lost browser storage.
_Avoid_: Save, export, download

**Marks export**:
A one-way CSV of a marksheet's marks for use elsewhere, one file per tier holding only that tier's students and entries. Lossy: it cannot be restored from.
_Avoid_: Backup, save, download

**Analysis export**:
A one-way file of the analysis figures: a CSV per tier of one row per breakdown entry, a CSV of one row per common question, or a PDF of the analysis view with every band shown. Lossy: it cannot be restored from, and it leaves the backup's age alone.
_Avoid_: Backup, save, download

**New upload**:
The destructive action that discards everything stored for the assessment (every tier, the marksheet, common questions, topic names, grade boundaries and reports) and returns to uploading fresh tiers. Only exists once something is stored.
_Avoid_: Reset, clear, start over

**Report**:
One student's question-by-question account of an assessment, written to the student and handed back with the paper: the tier they sat (on a two-tier assessment), their total, grade and marks to next grade (when their tier has grade boundaries), their marks per breakdown entry of their own tier, their roll-up, and generated feedback. Only produced for a student who is not absent, has their tier set, has a mark on every breakdown entry of that tier, and has no mark above an entry's available marks. Distinct from **analysis**, which is the teacher's class-level view.
_Avoid_: Analysis, results, feedback sheet (feedback is one part of a report)

**Out of date**:
A report whose generated feedback was written from a different generation input than the student's current one: their tier's breakdown, their marks on it and its topic names. Applies only to the feedback, because a report's figures always show current values. The tier name is display only, so renaming a tier never puts a report out of date. An out-of-date report can still be printed. Rewriting it or the teacher choosing to keep its wording clears the state.
_Avoid_: Stale, expired, invalid

**Roll-up**:
One student's marks summed by specification point (marks gained out of available, across every breakdown entry of the student's own tier carrying that specification point) and separately by assessment objective. An entry with no specification point counts only toward its assessment objective. A student with no tier has no roll-up. Never class-wide.
_Avoid_: Topic summary, aggregate, spec breakdown

**Topic name**:
The student-readable name for a specification point (e.g. "Transverse and longitudinal waves" for "4.6.1.1"), proposed by the model, editable by the teacher and used as shown when reports are generated, so a report never shows a student a bare code. One name per code across the whole assessment, shared by both tiers.
_Avoid_: Spec title, topic label

**Grade boundary**:
The minimum total mark on one tier for a grade (e.g. 6 at 52), typed in by the teacher for each tier. Optional: a tier without grade boundaries gives no grades. Always stored in raw marks on one tier, never a total across tiers or papers. The teacher may type one as a percentage of the tier's total; it is converted on entry by rounding up (65% of 83 marks is 54), and only the raw mark is kept.
_Avoid_: Cut-off, threshold (thresholds belong to RAG bands)

**Grade**:
The label of the highest grade boundary a student's total mark reaches, or the teacher-set label for falling below every boundary (`U` by default). Labels are whatever the teacher enters; no board's scale is built in.
_Avoid_: Level, RAG band, result

**Marks to next grade**:
The next grade boundary above a student's total mark, minus that total. None at the top grade.
_Avoid_: Gap, shortfall, distance to target

**Strength**:
A kind of question, skill or topic a student handled well, read from their marks across the whole paper and praised in their report. It rests on one or more breakdown entries, never one in the red RAG band. The model names it and writes its prose; the app checks its choice. A report's **Strengths** section holds up to three.
_Avoid_: What went well, WWW, highlight, success

**Area for improvement**:
A kind of question, skill or topic where a student has the most marks to win back, read from their marks across the whole paper. It rests only on breakdown entries where they dropped marks, never on one they also have as a strength. The model names it and writes what that kind of question needs and one concrete revision action; the app checks its choice. A report's **Areas for improvement** section holds up to two.
_Avoid_: Even better if, EBI, target, weakness, next step
