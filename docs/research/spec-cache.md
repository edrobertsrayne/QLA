# Research: Exam specification fetch, parse and cache (issue #3)

Part of #1 (Phase 1 Parse wayfinder map). Companion to #2 (PDF ingestion
route) and #5 (storage for parsed breakdown + cached spec — this note
deliberately does **not** lock a storage location; it surfaces the
size/shape/freshness facts #5 needs).

## Question

How should Phase 1 fetch the exam specification once via board + subject +
tier + official spec PDF URL, parse it into spec codes, and cache it keyed by
board + subject + tier + version/issue (new revision = new entry, not
overwrite), reusing the same extraction approach as markscheme/paper parsing?

## Headline recommendation

- **Fetch:** server-side `fetch` of the teacher-supplied official spec PDF URL
  from the single SvelteKit server proxy route (the one route that holds the
  OpenRouter key). Validate `content-type: application/pdf`, enforce a size
  cap (~10 MB — current spec is ~2 MB), follow AQA's `filestore.aqa.org.uk` /
  `cdn.sanity.io` URLs. Never fetch from the browser (CORS, key hygiene, and
  the locked "single calling path" decision).
- **Parse:** reuse the exact pipeline chosen in #2 (text-extraction step +
  configurable OpenRouter model via the proxy, or multimodal PDF ingest —
  whichever #2 picks). The spec parse is the same shape of job as
  markscheme/paper parsing: PDF in → structured JSON out — only the target
  schema differs (spec-code catalogue vs per-question breakdown). One code
  path, two prompts/schemas.
- **Cache key:** `{board, subject, specCode, tier, specVersion}` where
  `specVersion` is the version string printed on the spec cover
  (e.g. `"1.1 30 September 2019"`) **plus** the source URL. A revision is a
  new entry, never an overwrite; keep old entries so in-flight Phase 1 runs
  stay reproducible.
- **Invalidation:** no TTL expiry (specs change ~yearly, not hourly).
  Explicit invalidation only: (a) teacher supplies a new URL/version →
  new cache entry; (b) optional "refresh" action re-fetches and compares
  ETag/Last-Modified (both served by AQA) before re-parsing. Surface the
  cached version in the Phase 1 UI so a stale-spec mismatch is visible.

## Worked example: the grounding papers' spec

The map's grounding samples (`#1`) are **AQA 84632H June 2023** — that is
**GCSE Physics 8463, Paper 2 Higher**, not Combined Science. (8463 = Physics;
Combined Science: Trilogy is **8464**, whose physics papers are coded
`8464/P/1H`, `8464/P/2H`, etc. The task title's "8463 Combined Science" is a
mislabel — the matching spec for the grounding papers is Physics 8463.)

- Spec page: https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification
- Direct PDF (official, linked from that page):
  https://cdn.sanity.io/files/p28bar15/green/e96b2cef624c0970b0f90d9678a438580aed0f65.pdf
  ("GCSE Physics Specification for first teaching in 2016", PDF | 1.95 MB,
  dated 21 Sep 2015 on the site; cover reads **Version 1.1
  30 September 2019**).
- Legacy mirror (same bytes):
  https://filestore.aqa.org.uk/resources/physics/specifications/AQA-8463-SP-2016.PDF
- For reference, the Trilogy equivalent (if later needed) is spec **8464**:
  https://www.aqa.org.uk/subjects/science/gcse/combined-science-trilogy-8464

## Spec structure (what the parser must emit)

Verified by downloading the 8463 PDF and extracting text (`pdftotext`):

- **Sections:** 4.1 Energy · 4.2 Electricity · 4.3 Particle model of matter ·
  4.4 Atomic structure · 4.5 Forces · 4.6 Waves · 4.7 Magnetism and
  electromagnetism · 4.8 Space physics (physics only) · 4.9 Key ideas, plus
  §3 Working scientifically, §5 Scheme of assessment, §7 Mathematical
  requirements, §8 Practical assessment, Appendix A equations.
- **Spec-code grammar:** dotted numeric `4.<topic>[.<sub>[.<point>]]`
  (e.g. `4.1.1.1` Energy stores and systems, `4.2.5.1` Static charge).
  **119 unique codes** at 3–4 levels deep.
- **Tier/scope flags the parser must preserve per code:**
  - `(HT only)` — 44 occurrences (Higher-tier-only content);
  - `physics only` — 35 occurrences (excluded from Trilogy; §4.8 whole);
  - foundation/higher split otherwise by paper (1H/2H vs 1F/2F), ~22 mentions.
- **Cross-cutting code systems** each content block signposts (keep as
  secondary tags, not primary keys): WS (working scientifically, 4 families),
  MS (maths skills, 5 families), AT (apparatus/techniques, 11 items),
  AO1/AO2/AO3 assessment objectives (§5), required practicals (§8, 10 items,
  8 shared with Trilogy).
- **Suggested parsed shape** (for #4 schema ticket to adopt or amend):
  `{ code, title, tier: foundation|higher|both, scope: physics-only|shared,
ws[], ms[], at[], practicals[], version }`. Tier is _not_ part of the code
  itself — it is a flag on the code, so the cache key carries tier while the
  catalogue carries flags.

## Fetch facts (verified)

- PDF metadata (`pdfinfo`): **104 pages, A4, 2,039,848 bytes**, PDF 1.6,
  optimised. Text extracts cleanly (179,678 words → plain text ~5 KB/page
  order) — a text-extraction-first pipeline works; no scanned-image OCR
  needed for the spec (contrast with papers, per #2).
- HTTP: both hosts return `200` with `content-length: 2039848`,
  `accept-ranges: bytes`, `ETag` + `Last-Modified`, and
  `cache-control: public, max-age=...` (Sanity CDN: `max-age=31536000,
s-maxage=2592000`; filestore: `max-age=2592000, public`). Conditional
  revalidation (`If-None-Match` / `If-Modified-Since`) is therefore available
  for the "refresh" path without re-downloading.
- No auth required; hot-linking works (curl succeeds unauthenticated).

## Versioning practice (AQA — verified on aqa.org.uk)

- Version stamp on the cover is authoritative ("Version 1.1
  30 September 2019" for 8463; Trilogy 8464 PDF reads "Version 1.0
  22 April 2016"). Minor corrections bump the stamp, not the spec code.
- Major change = new spec artefact kept **alongside** the old: e.g. GCSE
  Computer Science 8525 lists "Updated (first teaching Sep 2025)" next to
  "Current (last exams 2026)" with separate PDFs, plus a "Summary of changes"
  PDF. Same pattern applies when science specs revise.
- AQA's standing line in science specs: "We will write to you if there are
  significant changes to the specification" — i.e. no machine-readable
  version feed; the teacher-supplied URL + cover version string is the only
  reliable version signal. Hence: key on both, never auto-overwrite.

## Parse reuse (link to #2)

- Same input contract (PDF bytes), same transport (server proxy → OpenRouter,
  model from env default with per-run UI override per locked decisions), same
  validation posture (schema-check the model output, retry on failure).
- Only the prompt/schema differ: spec parse emits the ~119-node catalogue
  above; paper/markscheme parse emits per-question breakdowns whose
  `specCode` fields are validated **against** this catalogue (unknown code =
  validation error, surfaced not silently dropped).
- Practical consequence: implement one `parsePdf({bytes, schema, prompt})`
  helper on the server route; spec and paper are two callers. Spec parse runs
  rarely (once per version), so it can afford the slower/more thorough
  settings (larger output budget, stricter retry) — flag for #6 (validation/
  proxy contract).

## Cache-key + invalidation recommendation (concrete)

- Key: `spec:{board}:{specCode}:{tier}:{specVersion}:{urlHash}`
  e.g. `spec:AQA:8463:H:1.1-2019-09-30:<short-hash-of-URL>`.
  `specCode` (8463) disambiguates Physics vs Trilogy-8464; `tier` (F/H)
  selects the HT-only filter at parse time so both tiers share one fetch but
  get tier-appropriate catalogues; `urlHash` guards against same-version
  re-uploads at different URLs.
- New revision = new key = new entry. Never mutate an existing entry
  (reproducibility of past breakdowns). Eviction is a #5 decision (single-user
  → entries are tiny; see below).
- Freshness: no background refresh (stateless server holds no timers).
  Check-then-act per Parse run: `HEAD`/conditional-GET the stored URL; if
  ETag/Last-Modified changed, warn "spec may have revised — refresh?" and
  only re-parse on teacher confirmation. Cover-version mismatch between
  cached catalogue and freshly fetched PDF is the conflict signal.

## Facts for #5 (storage ticket) — no location locked here

- **Size:** parsed catalogue ≈ 119 nodes × (~code + title + flags) ≈
  **tens of KB as JSON** (source PDF 2 MB need not be retained after parse;
  extracted text ~180 KB). Trivially fits any option (server file,
  browser IndexedDB/localStorage ~5–10 MB quota, in-memory).
- **Shape:** stable tree (3–4 levels), changes rarely, read-heavy
  (every Parse run validates against it), write-rarely (only on new version).
  JSON-serialisable, no binary, no relations.
- **Freshness:** changes on AQA's timetable (~yearly at most; 8463 unchanged
  since Sep 2019). No TTL needed; explicit version-keyed entries +
  conditional-GET check suffice. Stale-spec failure mode is silent
  mis-mapping, so the stored entry must carry `{version, fetchedAt, sourceUrl,
etag}` for display.
- **Constraint interaction:** the "server persists nothing" locked decision
  covers _student data_; the spec catalogue is public board content, so
  server-side caching does not breach it — but #5 still decides (browser-only
  keeps the stateless-server purity; server file cache survives only per
  instance and breaks under serverless/fresh-deploy unless backed by disk).
- **SvelteKit mechanics (high-level, standard options — no pick made):**
  server `fetch` responses honour HTTP `Cache-Control` (`public, max-age=…`
  served by AQA's CDN helps edge/browser layers, not the Node process);
  durable server caching needs an explicit store (in-memory `Map` = lost on
  restart; file cache = survives restarts on persistent disk; external KV =
  out of scope for single-user). Browser options (`localStorage`/
  `IndexedDB`) persist per teacher machine and fit the size, at the cost of
  per-device re-fetch. Decision left to #5.

## Sources

- AQA GCSE Physics 8463 spec page + PDF (official):
  https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification ·
  https://cdn.sanity.io/files/p28bar15/green/e96b2cef624c0970b0f90d9678a438580aed0f65.pdf
- AQA Combined Science: Trilogy 8464 spec page (disambiguation):
  https://www.aqa.org.uk/subjects/science/gcse/combined-science-trilogy-8464
  (spec code 8464; physics papers `8464/P/2H`, distinct from `84632H`)
- Grounding samples per map #1: `AQA-84632H-QP-JUN23` / `AQA-84632H-MS-JUN23`
  (filestore.aqa.org.uk `sample-papers-and-mark-schemes/2023/june/…`;
  `8463/2H` = Physics Paper 2 Higher, June 2023)
- PDF facts measured locally: `pdfinfo`/`pdftotext` (poppler) on the
  downloaded spec PDF — 104 pp, 2,039,848 B, text-extractable; `curl -sI`
  headers for ETag/Last-Modified/Cache-Control
- AQA versioning practice: cover stamps (8463 v1.1 2019-09-30; 8464 v1.0
  2016-04-22); side-by-side current/updated specs + "Summary of changes" PDFs
  (e.g. GCSE Computer Science 8525, GCSE Chemistry 8462 summary-of-changes);
  "we will write to you if there are significant changes" (science specs)
- SvelteKit caching options: `fetch` + `Cache-Control` semantics (SvelteKit
  docs, web standards/`+server.js`); in-memory vs file vs browser
  (`localStorage` ~5–10 MB, synchronous; `IndexedDB` for larger) trade-offs
  per SvelteKit community guides — facts only, choice deferred to #5
- Repo: `CONTEXT.md` (exam specification, spec code), `ROADMAP.md` (locked
  decisions: stateless proxy, fetch-once cached spec, open storage question)
