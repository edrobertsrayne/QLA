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
The exam board's syllabus document defining topic/skill codes. Not required for the prototype; adding it later is a refinement to an existing import, not a required input.
_Avoid_: Spec (informal shorthand is fine in conversation, not as a defined term)
