# QLA Roadmap

## Destination

A tool that takes a class's assessment results and turns them into individual, question-by-question post-assessment reports with feedback — built in three phases, each a working increment, each detailed out in its own wayfinder session when it starts.

Terminology used throughout: see [`CONTEXT.md`](./CONTEXT.md) (markscheme, marksheet, assessment paper, exam specification, specification point).

## Locked decisions (apply across every phase)

- **Single calling path, stateless server**: one SvelteKit server route proxies every OpenRouter call. It holds the OpenRouter API key (server-side only, never in the browser) and persists nothing — no student data, pseudonymized or not, is ever stored server-side.
- **Browser is the sole source of truth for student data**: marksheets (student names + marks) live entirely in browser storage (IndexedDB/localStorage). The server never sees a student name.
- **No student identifier crosses the boundary**: when a call needs per-student marks, the browser sends them with no name, id or pseudonym of any kind, and matches each response to its student by the request it made. Only the browser ever joins marks to names.
- **Model is configurable, not fixed**: env var sets a default (currently GPT-6 Luna, via OpenRouter, shared by parse, report, topic-name and feedback-title calls), the UI can override per run. No model choice is locked in.
- **Exam specifications are supplied per run, not cached**: user supplies a URL to the specification PDF; the server fetches it fresh on every run (no board/subject/tier picker, no cache, no reuse across runs) and forwards it to the model as extra grounding only — `specPoint` stays a verbatim lift from the markscheme, never checked against the fetched specification's codes. See [ADR-0001](./docs/adr/0001-specification-fetched-fresh-not-cached.md) for the full record, including the fetch's SSRF and memory-exhaustion hardening.
- **Single-user, no auth.** Multi-teacher use is explicitly out of scope (see below).

## Phase 1 — Parse

Upload a markscheme + assessment paper (PDF) → configurable OpenRouter model, called via the server proxy → structured JSON breakdown of questions mapped to spec codes, with an optional specification link fetched fresh per run as extra grounding (see [ADR-0001](./docs/adr/0001-specification-fetched-fresh-not-cached.md)). No UI polish beyond a functional single page — this phase is about the pipeline working, not how it looks.

Not yet specified, deferred to this phase's wayfinder session:

- Exact JSON schema per question (fields beyond number/marks/spec-code — question text, AO/command word, sub-point breakdown — to be settled by building, not guessed up front)
- Where the parsed breakdown lives (browser storage vs. server-side file cache — this data isn't student data, so Q11's "server persists nothing" doesn't automatically decide it)
- How the PDF is read (multimodal model ingesting the PDF directly vs. a text-extraction step before the LLM call)

## Phase 2 — Marksheet

First phase where UI/UX is in scope. Teacher builds a marksheet — per-student, per-question marks — held in browser storage, cross-referenced against Phase 1's specification-point mappings to surface class-level strengths and weaknesses.

Charted as [Phase 2 Marksheet — wayfinder map](https://github.com/edrobertsrayne/QLA/issues/23). Scope settled at charting: **one class, one marksheet at a time**; the app opens on upload, persists the breakdown in browser storage so re-opening lands on the marksheet, and a "new upload" button wipes and restarts. Analysis is narrowed to an on-demand per-question view with RAG conditional formatting (specification-point roll-up deliberately deferred), and Phase 2 makes no LLM call at all — every figure is local arithmetic. Remaining open decisions live as the map's child tickets.

## Phase 3 — Report

Marksheet → individual, question-by-question student report with generated feedback. Feedback generation is a server-proxied OpenRouter call, one per student, over that student's marks with no identifier attached (per the locked decisions above); the browser matches each response to its student.

Charted as [Phase 3 Report — wayfinder map](https://github.com/edrobertsrayne/QLA/issues/46). Scope settled at charting: reports are **student-facing only**, one per eligible student (not absent, fully marked, no over-max marks), printed from the browser one per page. Every figure is local arithmetic (marks per breakdown entry, a roll-up by topic name and assessment objective, and a grade with marks to next grade from optional teacher-typed grade boundaries, also shown on the marksheet); the model writes only the **strengths** and **areas for improvement** prose, from the breakdown, the student's marks and the topic roll-up (no student answers are captured). Remaining open decisions live as the map's child tickets.

## Out of scope

- **Multi-teacher rollout** (shared/curated spec library, auth, hosting model for other teachers). Named here only for continuity — flagged during grilling so Phases 1–3 don't accidentally foreclose it, but not designed. Returns as its own effort if ever pursued, not a resumption of this roadmap.
