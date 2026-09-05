# PDF ingestion route for Parse (research, issue #2)

**Question:** How should Phase 1 read markscheme + assessment paper PDFs — multimodal
model ingesting PDF directly via OpenRouter vs text-extraction before LLM vs hybrid?

**Recommendation (hybrid, dual-input):** server extracts per-page text with `unpdf`
(primary, deterministic, model-agnostic), and attaches the original PDFs natively
(`engine: 'native'`, default model Gemini Flash via OpenRouter) in the same call so
the model can see layout, tables, bold/underline, and diagrams. If the per-run model
lacks native file support, degrade to text-only with a visible
diagram-question warning instead of silently falling back to paid OCR.

Part of #1. Map: #1. Ticket: #2. Branch: `research/pdf-ingestion` (throwaway, not merged).

## Grounding: the actual samples (measured, not assumed)

Fetched 2026-09-05 to `/tmp/opencode` (throwaway, not in repo):

| File | URL (from map #1) | Size | Pages (`pdfinfo`) | Text (`pdftotext`) |
|---|---|---|---|---|
| QP 84632H June 2023 | `aqa.org.uk/.../AQA-84632H-QP-JUN23...` | 2,481,019 B (~2.4 MB) | 44 | 17,247 chars — extractable |
| MS 84632H June 2023 | `aqa.org.uk/.../AQA-84632H-MS-JUN23...` | 507,174 B (~0.5 MB) | 26 | 26,081 chars — extractable |

- Both are **text-based, not scanned**: `pdftotext` returns real running text (QP
  instructions, Q01.1 transverse-wave item; MS §2 emboldening/underlining rules,
  §3.1 list-marking tables). Tagged PDF, embedded subset fonts (`pdffonts`), AcroForm,
  AES-encrypted with empty user password (print/copy allowed) — `pdftotext`/`pdf.js`
  open them without a password.
- **QP is diagram-heavy:** `pdfimages -list` reports ~100 raster images across the
  44 pages (300 dpi grey figures on most question pages). Text extraction keeps only
  captions ("Figure 3 has been drawn to scale", "Figure 5", "Figure 7") and drops
  the content. Questions affected include Q02.1 (scale-diagram displacement),
  distance–time → velocity–time sketch graphs, pressure-vs-height graph reads, and
  lever/pivot diagrams. A text-only pipeline would force the model to hallucinate
  these breakdowns.
- **MS tables and emphasis flatten:** MS Example 1/2 marking tables
  ("green, 5 / red*, 5 / iron, steel, tin → marks awarded") extract as linear text
  with column structure lost; §2.1–2.4 bold / "bold and" / underline carry marking
  meaning ("any wording that is underlined is essential") which plain-text
  extraction drops. Native vision preserves them; text needs convention-aware
  prompting or image backup.
- **Scale headroom is large:** 44 + 26 = 70 pages total, ~2.9 MB on disk. Well under
  every model-side ceiling found (see below), so Phase 1 needs no chunking —
  just caps to fail loudly on outliers.

## Options considered

### A. Native multimodal PDF via OpenRouter (`type: 'file'`, `file_data` URL or base64)

- API shape (primary source, OpenRouter PDF docs,
  `https://openrouter.ai/docs/guides/overview/multimodal/pdfs`): message content
  part `{ "type": "file", "file": { "filename", "file_data": "<url|data:application/pdf;base64,...>" } }`,
  optional `plugins: [{ id: 'file-parser', pdf: { engine } }]`. Public URLs pass
  through; local files must be base64 data URLs.
- Engines (same source + pricing FAQ `openrouter.zendesk.com`, "Why am I being
  charged on a free model?"): `native` (model's own file support, billed as normal
  input tokens), `mistral-ocr` (best for scans/images, **$2 per 1,000 pages =
  $0.002/page**), `cloudflare-ai` (PDF→markdown, **free**; `pdf-text` deprecated,
  redirects to it). **Default when engine unspecified: native if the model supports
  files, else `mistral-ocr`** — i.e. leaving the plugin unset can silently incur
  the paid OCR path on non-multimodal per-run models.
- Gemini Flash supports `native` (OpenRouter model pages list PDF/file input for
  Gemini Flash variants; OpenRouter blog "Universal PDF support" notes native PDF
  is used automatically for Gemini/Anthropic/OpenAI providers).
- Token math (Google doc "document processing technical details", corroborated by
  community report Feb 2026): ~258 tokens/page baseline for text, higher for
  image-heavy pages. Our 70 pages ≈ 18k tokens baseline — trivial against the 1M
  context window. Caps that do NOT bind here but must be enforced: ~1,000 pages
  per PDF request, ~20 MB inline request payload (base64 inflates ~1.33×, so
  ~15 MB on disk is the practical inline ceiling; Files-API-style reuse is not
  available through OpenRouter — re-sends re-parse, though returned file
  annotations can be echoed back to skip re-parsing for `mistral-ocr`/`cloudflare-ai`).

### B. Text extraction before the LLM (server-side, e.g. `unpdf`)

- JS libs (primary: `unjs/unpdf` README + npm page; comparison 2026-03 pkgpulse):
  all three (`unpdf`, `pdf-parse`, `pdfjs-dist`) wrap Mozilla pdf.js at different
  levels. **`unpdf` fits this stack best**: serverless/edge-safe bundled pdf.js
  build (no separate worker file, polyfills `Promise.withResolvers`), zero-dep,
  `extractText`/`getDocumentProxy`/`extractTextItems` API, "perfect for AI
  applications that need to summarize PDF documents". `pdf-parse` is Node-only
  with a known serverless footgun (sync-fs probe); `pdfjs-dist` full build is
  heaviest and needs canvas/DOMMatrix shims for rendering. SvelteKit Node server
  can run any of them, but `unpdf` keeps the per-run-model-agnostic path and a
  future adapter change cheap.
- Cost/latency: cheapest and fastest per run — local extraction in ms, then a
  pure-text prompt (~4–7k tokens per paper at these sizes). No per-page OCR fee,
  no image-token multiplier, works with **any** OpenRouter text model (honours
  "model configurable per run" when the override is a text-only model).
- Accuracy: exact reading order and characters, but **loses exactly what the
  samples prove matters** — QP diagrams/graphs/scale figures, MS table structure,
  bold/underline emphasis, fraction/equation layout (pdftotext garbles the
  pressure-equation tick-box options). Silent hallucination risk on
  diagram-dependent questions, not a loud error.

### C. Hybrid (recommended) — text primary + native attach in one call

Server does both: `unpdf` per-page text (with `[p.N]` markers) **and** forwards
the two PDFs (base64 or URL) with explicit `engine: 'native'`. The prompt tells
the model text is the ordering ground truth and the PDFs are authoritative for
figures/tables/emphasis. Degradation rule: if the configured model lacks native
support, send text-only and surface a "diagram questions unverified" warning —
never silently accept the `mistral-ocr` paid fallback.

Why this wins for Phase 1 specifically:

- **Accuracy:** covers both failure classes evidenced above (diagrams + tables/
  emphasis) with no extra round trips; single call keeps the stateless-proxy
  contract trivial.
- **Cost/latency:** at 70 pages / ~3 MB the overhead is negligible
  (native input tokens ≈ text tokens + image areas; `mistral-ocr` avoided
  entirely: saves $0.14/run at $0.002/page × 70 — small but pointless spend).
  Latency is one multimodal call (seconds), no OCR hop.
- **Complexity:** small — one `unpdf` dependency, one request shape, one explicit
  engine string. No page-rendering pipeline, no OCR service, no chunking at
  these sizes.
- **Model-configurability preserved:** text path alone still yields a usable
  (flagged) breakdown on text-only override models.

## SvelteKit server-route constraints (fresh scaffold, stateless proxy)

- **Body limit blocks the QP today.** `adapter-node` `BODY_SIZE_LIMIT` defaults
  to **512 kb** (SvelteKit docs, `svelte.dev/docs/kit/adapter-node`: "Defaults to
  512kb"). The 2.4 MB QP exceeds it → set `BODY_SIZE_LIMIT` (e.g. `10M`–`15M`)
  and enforce our own caps in the route (content-type `application/pdf`, per-file
  ≤ ~15 MB disk given the ~20 MB inline/base64 ceiling, total pages ≤ ~100,
  reject 413/400 before any OpenRouter spend).
- Keep the locked decisions: key server-side only, persist nothing, UUID
  pseudonymization is Phase 3's concern (no student data in Phase 1), spec fetch
  reuses this same extraction path (ROADMAP).
- Harden `unpdf` per its own "Processing Untrusted PDFs" note: check
  `pdf.numPages` before fan-out, cap `maxImageSize`, race extraction against a
  timeout (serverless build runs on the event loop, no worker).

## Failure modes (what fails and how)

| Failure | Route exposed | Behaviour |
|---|---|---|
| Diagram/graph question, text-only override model | B / degraded C | Flag "unverified — needs native model", don't invent figure values |
| Scanned/image-only PDF (no text layer) | B | `unpdf` returns ~empty → detect via <30 chars/page heuristic (serverless-guide practice), route to native/OCR instead of sending empty text |
| Encrypted/locked PDF | B | pdf.js opens empty-user-password files (like AQA's) fine; true user-password PDFs → 400 "password-protected, re-export" |
| Oversize (>15 MB disk / >~100 pp) | all | 413/400 pre-check before OpenRouter; never rely on provider 400s |
| Non-native per-run model + engine unset | A | Silent paid `mistral-ocr` fallback — hence always set `engine` explicitly |
| Native misread of scale/graph | A/C | Ask model to quote caption + value source per diagram question so errors are checkable in the JSON |

## Sources (primary, checked 2026-09-05)

- OpenRouter PDF docs: `https://openrouter.ai/docs/guides/overview/multimodal/pdfs`
  (engines, default-to-native-then-`mistral-ocr`, base64/URL shapes, annotation reuse).
- OpenRouter pricing FAQ: `https://openrouter.zendesk.com/hc/en-us/articles/51678714631323-...`
  (`mistral-ocr` $2/1k pp, `cloudflare-ai` free, `native` as input tokens).
- OpenRouter blog universal PDF support (2025-04-23): native auto-use for Gemini.
- Google Gemini document-processing technical details + troubleshooting
  (258 tokens/page baseline, 1,000-page cap, 20 MB inline ceiling).
- SvelteKit `adapter-node` docs: `https://svelte.dev/docs/kit/adapter-node`
  (`BODY_SIZE_LIMIT` default 512kb).
- `unjs/unpdf` README/npm (serverless pdf.js build, `extractText`, untrusted-PDF limits).
- Sample measurements: `pdfinfo`/`pdftotext`/`pdfimages`/`pdffonts` runs above
  against the two AQA URLs on map #1.
- ctx7 lookups: `npx ctx7@latest library OpenRouter …` →
  `/openrouterteam/docs` → `docs … "PDF file input …"` (plugin/engine snippets match the docs above).
