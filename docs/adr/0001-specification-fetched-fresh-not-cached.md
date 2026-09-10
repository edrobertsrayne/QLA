# 0001. Specification fetched fresh per run, not cached

## Status

Accepted

## Context

The roadmap's locked decisions originally described exam specifications as
fetched once and cached: the user supplies board + subject + tier + a URL,
the server fetches and parses it, and caches the result keyed by
board/subject/tier/version so a later run reuses it instead of re-fetching.

Phase 1 shipped differently. There is no board/subject/tier picker and no
cache. The run form accepts a single optional specification URL
(`SPEC_URL_FIELD`); the server fetches that link fresh on every run,
forwards the extracted text/PDF to the model as extra grounding alongside
the paper and markscheme, and discards it once the run completes. Nothing
about the fetched specification persists server-side or client-side between
runs.

The specification is grounding only. `specPoint` stays an exact verbatim
lift from the markscheme (or `null` when the markscheme gives none) — the
model is instructed never to infer or guess a spec code from the fetched
specification, and the shipped code does not check the markscheme's
`specPoint` values against the specification's codes in any way.

Building the cache (storage location, invalidation on a spec revision,
board/subject/tier as first-class inputs) was out of scope for getting
Phase 1's pipeline working end to end, and no part of the shipped run flow
depends on it existing. `CONTEXT.md` already documents the shipped,
uncached, per-run behaviour.

Separately, because the fetch target is a URL supplied by the user and
executed server-side, it opened an SSRF surface: a submitted link could
resolve to loopback, link-local, or private address space, a redirect could
retarget the fetch onto an internal host after the first hop passed, and
distinct error messages could let a caller fingerprint which internal ports
were open. An unbounded or falsely-declared response size could also be
buffered whole into the process before any size check ran. These were
hardened (`src/lib/server/parse/spec.ts`) as part of the as-built behaviour
this ADR records, not deferred to a future cache effort:

- The URL must be `http`/`https`; `localhost` and `*.localhost` are
  rejected on the hostname alone before any DNS lookup.
- The resolved address of the original URL, and of every redirect hop (up
  to 5, each re-validated the same way, with redirects never auto-followed
  by the underlying fetch), is rejected if it falls in loopback,
  link-local, private (RFC1918), carrier-grade-NAT, unique-local, or
  unspecified address space.
- Every network-level failure — blocked address, unreachable host, non-OK
  status, refused redirect — surfaces the same generic message, so a caller
  cannot use response differences to probe which internal ports are open
  or closed.
- The response body is read incrementally and aborted the moment the
  accumulated bytes exceed the per-file cap (`MAX_FILE_BYTES`, 15MB); it is
  never buffered in full first, and a missing or understated
  `content-length` header cannot bypass the cap.
- The downloaded bytes are checked for the PDF magic header and parsed
  before use, so an HTML error page or corrupt file fails as
  `SPEC_UNREADABLE` rather than reaching the model.

## Decision

Accept the shipped behaviour as the decision, not a placeholder awaiting the
cache:

- The exam specification is supplied per run as a single optional URL, with
  no board/subject/tier picker.
- The server fetches that URL fresh on every run. There is no cache, no
  storage keyed by board/subject/tier/version, and no reuse across runs.
- The fetch is hardened against SSRF (address-space blocking on the
  original URL and every redirect hop, hostname-based `localhost`
  rejection, uniform error messages) and against unbounded memory use
  (streamed, capped read that never trusts a declared `content-length`).
- The fetched specification is extra grounding for the model only. It does
  not validate or constrain `specPoint`, which remains an exact verbatim
  lift from the markscheme or `null`; the shipped run flow performs no
  check of markscheme spec codes against the fetched specification's
  codes.

## Consequences

- Every run that supplies a specification link re-downloads and re-sends it
  to the model, at the fetch cost and latency of that link each time. A
  teacher checking the same paper twice pays the fetch (and its tokens)
  twice.
- There is no revision handling: whatever the link currently resolves to is
  what the run uses. A spec update at the same URL changes future runs
  silently; nothing pins a run to a specific spec version.
- No board/subject/tier metadata is captured anywhere, so a future cache
  cannot be bolted on without first deciding what identifies a
  specification (the roadmap's board+subject+tier+version key was never
  built or wired to any input).
- `specPoint` accuracy still depends entirely on the markscheme's own
  wording; a wrong or missing spec code in the markscheme passes through
  unchanged even when the fetched specification would have caught it.
- The SSRF and memory-exhaustion hardening in `src/lib/server/parse/spec.ts`
  is part of this decision's shipped shape, not a separate future
  concern — any change to per-run fetching must preserve it.
- Revisiting caching, board/subject/tier inputs, or spec-code checking is a
  new decision (a new ADR), not a reopening of this one.

## Template for the next ADR

```markdown
# NNNN. <short imperative title>

## Status

Proposed | Accepted | Superseded by NNNN

## Context

<the forces at play: what problem, what constraints, what's already true>

## Decision

<what was decided, stated plainly>

## Consequences

<what becomes easier or harder as a result, including tradeoffs accepted>
```
