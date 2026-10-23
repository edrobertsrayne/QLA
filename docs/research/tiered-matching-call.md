# Two-paper matching call: OpenRouter limits and cost (research, issue #107)

**Question:** The matching call sends both tiers' question papers (no markschemes,
typically 20–36 pages each) plus both entry lists, and returns proposed pairs as
strict structured output. Does `openai/gpt-6-luna` accept two PDFs natively, what
are its page/size/context limits, does it still list `structured_outputs` +
`response_format`, what does the call cost and how long does it take, do the other
curated models handle it, and do two parallel `/api/parse` calls plus the matching
call fit the existing 100-page / 15 MB caps?

**Answer:** `openai/gpt-6-luna` accepts both papers as two native PDF `file` parts
in one request. The live listing (2026-10-23) keeps `structured_outputs` and
`response_format` on the model and on every endpoint; the model has a 1,050,000-token
context, 922,000-token maximum input and 128,000-token maximum output, and OpenAI's
file API caps each PDF at 50 MB and all files at 50 MB combined, with no published
page count. A measured 72-page (36+36) matching call with 60 entry rows and a strict
pairs schema cost **$0.0213** and took **8.5 s** when every page was an image, and
**$0.0019 / 10.9 s** when the pages were digital text. At 20–36 pages per tier the
matching call is therefore **$0.002–$0.028 (0.2–2.8¢)** and **5–13 s**. All four
curated models handle the call; at 72 image pages they measured: Gemini 3.1 Flash
Lite $0.0116, gpt-6-luna $0.0213, Gemini 3.8 Flash $0.0327, Claude Haiku 5.5
$0.0596 (Claude crosses its 100k-token 5× price break). The 100-page and 15 MB caps
are already enforced inside each HTTP request, so two parallel parses plus the
matching call each fit; they must not be summed per assessment (up to 216 pages),
and the matching route should reuse them as per-call caps. Two implementation
traps: pin `engine: 'native'` on the matching call, and cap its output or raise its
timeout because the shared structured transport defaults to 8,000 tokens / 120 s.

Part of #105. Branch `research/tiered-matching-call` (throwaway, not merged).
Model constraint: only `DEFAULT_MODEL_ID` and `CURATED_MODELS`; no new model is
proposed.

## Method and measured grounding

- Live OpenRouter listing checked 2026-10-23 with the `AGENTS.md` curl
  (`https://openrouter.ai/api/v1/models`, 468 models), plus
  `/api/v1/models/openai/gpt-6-luna/endpoints` for per-endpoint pricing and
  capabilities.
- Live calls on 2026-10-23 through the project's OpenRouter key, shaped like the
  production request: two 36-page PDFs, 30 short entry rows per tier
  (`{code, marks, ao}`), one system message, `response_format` with a strict
  `pairs` JSON schema, `provider.require_parameters: true`,
  `plugins: [{id: 'file-parser', pdf: {engine: 'native'}}]`, `max_tokens: 1500`.
  Costs come from OpenRouter's `usage.cost`, not from a price table.
- Two synthetic page types isolate the token behaviour: digital-text pages
  (LaTeX text, 3,390 words per 36-page paper) and full-page images
  (1200×600 bitmap on every page, no text layer). A separate one-page
  full-A4 bitmap (1654×2339) measured the per-page ceiling.
- These synthetic papers are not exam papers; real papers mix text, diagrams and
  tables, so their token count lies between the two extremes. Matching quality is
  out of scope: the synthetic entry lists do not describe the PDFs, so pair counts
  are not meaningful.

### Measured two-PDF matching calls (72 pages, 36+36)

| Model                          | Page content            | Prompt tokens | Completion tokens |     Cost |   Wall |
| ------------------------------ | ----------------------- | ------------: | ----------------: | -------: | -----: |
| `openai/gpt-6-luna`            | digital text            |        12,416 |               678 | $0.00189 | 10.9 s |
| `openai/gpt-6-luna`            | 1200×600 image per page |       167,592 |               662 | $0.02128 |  8.5 s |
| `anthropic/claude-haiku-5.5`   | image per page          |       115,380 |               761 | $0.05959 |  4.9 s |
| `google/gemini-3.1-flash-lite` | image per page          |        39,785 |             1,104 | $0.01160 |  7.1 s |
| `google/gemini-3.8-flash`      | image per page          |        39,785 |               757 | $0.03268 | 12.1 s |

All five calls returned HTTP 200 with `finish_reason: stop`; gpt-6-luna's and
Gemini 3.1 Flash Lite's responses parsed as JSON against the `pairs` schema
(Gemini 3.8 returned the valid empty object `{"pairs":[]}`). gpt-6-luna was
served by OpenAI; its prompt
billed at **$0.125/M**, the cache-write rate, not the $0.10/M headline (OpenRouter
reported 167,589 cache-write tokens), and completion at $0.50/M. Claude's 115k
prompt crossed Anthropic's 100k-token break, so the whole request billed at
$0.50/M input and $2.50/M output. Gemini 3.8's probe billed at $0.75/M prompt
(Vertex global), below its $0.825/M list price.

### Per-page token measurements for gpt-6-luna

| Page type                       | Prompt tokens per page | Basis                                        |
| ------------------------------- | ---------------------: | -------------------------------------------- |
| Digital text, A4                |                   ~172 | 72 text pages minus entry lists              |
| Embedded 1200×600 image on A4   |                 ~2,232 | 72 image pages; a single page measured 2,235 |
| Full-page A4 bitmap (1654×2339) |                  3,034 | one-page probe                               |

The 3,034 figure matches OpenAI's published ceiling: high detail fits a page
within 2048×2048 and a 2,500-patch budget, and the guide's listed models use a
1.2× multiplier, giving 3,000 tokens per full-page image; A4 rasterises to 2,500
patches. gpt-6-luna is not itself in the vision guide's sizing table, so 3,000
is inferred from the documented family pattern and confirmed by the measured
3,034 (which includes the instruction). Text pages are roughly 17× cheaper than
full-page images.

### Extrapolated matching-call cost (both papers)

Using the measured per-page rates, ~5,000 prompt tokens for both entry lists
(a realistic 50-ish entries per tier with summary, spec point and command word)
and ~1,000 completion tokens:

| Both papers      |                                        Digital text | Image/bitmap pages | Full A4 scans |
| ---------------- | --------------------------------------------------: | -----------------: | ------------: |
| 40 pages (20+20) |                                            ~$0.0020 |            ~$0.012 |       ~$0.016 |
| 72 pages (36+36) | ~$0.0019 (measured; ~$0.0027 with full entry lists) | ~$0.021 (measured) |       ~$0.028 |

The 20–36 pages-per-tier range therefore costs **0.2–2.8¢** for the matching
call; the 72-page text row is measured with only 60 short entry rows, so a real
entry list adds a few tenths of a cent. Output is a small share: 700–1,100 completion tokens cost
$0.0003–$0.0006 at the default model's output rate.

## 1. Capability: two PDFs, limits, structured output

### Two PDFs in one request, natively

- The live listing reports
  `architecture.input_modalities: ["file", "image", "text"]` and
  `modality: text+image+file->text` for `openai/gpt-6-luna`
  (`https://openrouter.ai/api/v1/models`, 2026-10-23).
- OpenRouter's PDF guide says PDFs travel as `file` content parts, any model
  accepts them, multiple files may be sent in the same request, and the PDF is
  passed directly to the model when the model supports file input. Without an
  explicit engine, OpenRouter chooses native first and falls back to
  `mistral-ocr` only for models without native file support
  (`https://openrouter.ai/docs/guides/overview/multimodal/pdfs`).
- OpenAI's file-input guide says Chat Completions accepts PDFs as `file` content
  parts, and "a single request can include more than one file"
  (`https://developers.openai.com/api/docs/guides/file-inputs`).
- Probe: two 36-page PDFs in one request with `engine: 'native'` returned 200
  from provider OpenAI, with no OCR charge in `usage.cost_details`.
- OpenAI's own model card lists input modalities as "text, image", not "file",
  because the API extracts PDF text and page images before the model sees them.
  That is still native file handling on OpenRouter's side and is not a
  contradiction.

### Limits that bind

| Limit                              | Value                                                               | Source                                           |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| Context window                     | 1,050,000 tokens                                                    | OpenAI model card; OpenRouter listing            |
| Maximum input tokens               | 922,000                                                             | OpenAI model card; endpoint `max_prompt_tokens`  |
| Maximum output tokens              | 128,000                                                             | both                                             |
| Each PDF                           | under 50 MB                                                         | OpenAI file inputs                               |
| All files in one request           | 50 MB combined                                                      | OpenAI file inputs                               |
| Page count                         | none published                                                      | OpenAI file inputs documents only the 50 MB caps |
| OpenRouter chat-file page/size cap | none published; 413 payload error exists without a number           | OpenRouter chat-completions API reference        |
| Price break                        | prompt >272,000 tokens: 2× input, 1.5× output for the whole request | OpenAI model card / pricing                      |

At 40–72 pages and typical 1–3 MB exam PDFs (the repo's AQA sample is 44 pages /
2.4 MB), the call is far inside every limit: 12k–220k prompt tokens against
922k maximum input. The context limit only becomes reachable at roughly 300
full-page scans, well above the app's 100-page cap.

### Structured outputs

The live listing keeps `structured_outputs` and `response_format` in
`supported_parameters` for the model, and all seven serving endpoints list both
(OpenAI standard/flex/fast, Azure global/US/EU, Amazon Bedrock). The probe used
`response_format: {type: 'json_schema', json_schema: {strict: true, ...}}` with
`provider.require_parameters: true` and got a 200 with valid JSON, so the
transport's existing strict-schema call works with two PDFs.

Per OpenRouter's structured-output guide, support is per endpoint, not just per
model; `require_parameters: true` is what keeps routing on endpoints that have it
(`https://openrouter.ai/docs/guides/features/structured-outputs`).

## 2. Cost and latency for the default model

- **Measured cost:** $0.0213 for 72 image pages, $0.0019 for 72 digital-text
  pages, $0.00043 for one full-A4 scan page. The 20–36 pages/tier range is
  $0.002–$0.028.
- **Measured latency:** 8.5 s (72 image pages, 662 output tokens) and 10.9 s
  (72 text pages, 678 output tokens). A one-page A4 scan took 13.4 s, mostly
  model reasoning, so single-page timings are noisier than the 72-page runs.
- **Endpoint rates:** on 2026-10-23 the standard-routing endpoints reported P50
  latency 2.76 s (OpenAI, 60 tok/s) and 3.06 s (Azure, 70 tok/s); the faster
  `openai/fast` endpoint (1.29 s, 110 tok/s) costs 2× ($0.20/$1.00 per M) and is
  not used by standard routing. The model page's headline 0.96 s / 110 tok/s is
  the best across all providers, including endpoints not used by standard
  routing (`https://openrouter.ai/openai/gpt-6-luna`).
- **Output time:** the probe emitted ~700 tokens. At 60–110 tok/s a 2,000-token
  matching output adds 18–33 s, for ~30–45 s total. An 8,000-token output adds
  73–133 s, which can exceed the shared transport's 120 s timeout.
  `STRUCTURED_DEFAULT_MAX_TOKENS` is 8,000 and `OPENROUTER_TIMEOUT_MS` is
  120,000 in the current code.
- **Price break:** 72 full-page scans (218k tokens) stay below 272k; 100
  full-page scans (304k) cross into the 2× input / 1.5× output tier. At the
  ticket's 20–36 pages per tier (40–72 pages) the matching call never crosses,
  even if every page is a full-page bitmap. A 100-page **parse** can cross it if
  its paper and markscheme are both scanned; text-heavy papers do not.

Unique large prompts bill at OpenAI's cache-write rate ($0.125/M for gpt-6-luna),
not the $0.10/M base rate: all 167,589 prompt tokens in the measured image call
were reported as cache writes. `CURATED_PRICING` carries 0.1, so `estimateCost`
prices the input component 25% low; on the measured 72-image-page call the total
estimate is about 20% low ($0.0171 vs $0.0213). This is a display-accuracy
issue, not a routing issue.

## 3. The other curated models

All four curated models list `file` input, `structured_outputs` and
`response_format`; all accepted two PDFs and returned 200 in the probe. Their
provider-side PDF limits differ:

| Model                          | Context / max output |                                         PDF page and size limits | Measured 72-page cost | Notes                                                                                |
| ------------------------------ | -------------------- | ---------------------------------------------------------------: | --------------------: | ------------------------------------------------------------------------------------ |
| `openai/gpt-6-luna`            | 1,050,000 / 128,000  |                       50 MB/file and 50 MB combined; no page cap |               $0.0213 | baseline; 2,232 tokens per image page                                                |
| `anthropic/claude-haiku-5.5`   | 1,000,000 / 128,000  |    600 pages/request (100 if context <1M); 32 MB request payload |               $0.0596 | 100k-token break: 5× input/output for the whole request; 1,603 tokens per image page |
| `google/gemini-3.1-flash-lite` | 1,048,576 / 65,536   | 50 MB or 1,000 pages; multiple PDFs per request; 258 tokens/page |               $0.0116 | cheapest at this size; 553 tokens per full-page image in the probe                   |
| `google/gemini-3.8-flash`      | 1,048,576 / 65,536   |                                               same Google limits |               $0.0327 | pricier output; returned valid (empty) JSON                                          |

Provider sources: OpenAI file inputs
(`https://developers.openai.com/api/docs/guides/file-inputs`), Anthropic PDF
support (`https://docs.claude.com/en/docs/build-with-claude/pdf-support`), Google
document processing
(`https://ai.google.dev/gemini-api/docs/document-processing`).

Two model-selection consequences for the per-run override:

- **Claude's 100k cliff lands inside the tiered range.** At the measured 1,603
  tokens per image page, 40 pages (~~64k) stays at base rates (~~$0.008), but 62+
  pages crosses 100k and the whole request bills at 5×. A 72-page two-tier
  matching call is $0.0596, 2.8× the default. The cliff is per request, so the
  two parses and the matching call can each land on different sides of it.
- **Gemini's 258-token page makes PDFs cheap, but output can dominate.**
  Flash Lite's 72-page call was $0.0116 with 1,104 output tokens; 3.8 Flash's
  was $0.0327 with 757. Both are within the default's range and neither is a
  reason to change the default, which the map locks.
- **Custom overrides remain the risk.** The shared structured transport does not
  send a `file-parser` engine, so OpenRouter would fall back to paid
  `mistral-ocr` ($2 per 1,000 pages) if an override model lacked native file
  support. Every curated model supports native file input, but the matching
  route should still pin `engine: 'native'` to keep the parse route's
  no-silent-paid-OCR guarantee.

## 4. Two parallel parses plus the matching call versus the caps

`MAX_TOTAL_PAGES = 100` and `MAX_FILE_BYTES = 15 MiB` live in
`src/lib/server/parse/schema.ts` and are enforced inside one `POST /api/parse`
after ingesting that request's paper and markscheme. The spec has separate caps
(`MAX_SPEC_PAGES = 200`, `MAX_SPEC_BYTES = 30 MiB`). There is no run-level counter
shared between requests.

- Tier 1 parse: paper + markscheme ≤ 100 pages.
- Tier 2 parse: paper + markscheme ≤ 100 pages.
- Matching call: two question papers, 40–72 pages at 20–36 each, ≤ 100 pages.

So the existing values do **not** need to change, and they do **not** need to
"become per-call": they already are. What needs to change is the wording and the
new route's use of them:

- The schema comment says "Total page ceiling across the uploaded PDFs"; the
  route comment says "per-run". Rename to "per request / per call" so a later
  implementer does not sum the two parses and the matching call.
- The matching route should import and enforce the same `MAX_TOTAL_PAGES` and
  `MAX_FILE_BYTES` for its two PDFs, not invent a second limit.
- Do not add an assessment-wide page cap: two 72-page parses plus a 72-page
  matching call total 216 pages, so a 100-page assessment cap would reject a
  valid tiered upload.

Other limits that bear on the three calls:

- **Local body size.** `.env.example` sets `BODY_SIZE_LIMIT=32M`. Two 15 MiB
  PDFs are 30 MiB (31.5 MB) before multipart overhead, so a matching route that
  receives both PDFs from the browser is close to the limit at the maximum file
  size. Typical 1–3 MB papers are far below. If both files really can be 15 MiB,
  either raise the limit or lower the per-file cap for the matching route.
- **Anthropic's 32 MB request cap.** Base64 inflates two 15 MiB PDFs to about
  40 MiB (41.9 MB), so Claude Haiku 5.5 can reject the request at the app's
  maximum file sizes even though its 600-page limit is fine. Typical papers
  pass. The 15 MiB per-file cap is therefore not portable across all curated
  models at its extreme; it is safe for the real 0.5–3 MB papers.
- **OpenAI's 50 MB combined cap.** Two 15 MiB files are 30 MiB, so the default
  model passes with room to spare.
- **OpenRouter rate limits.** Paid models have no platform request cap; only
  free variants (`:free`) have RPM/RPD limits, plus Cloudflare DDoS protection.
  Two parallel parses are not a rate concern. The in-flight spending budget
  applies to prepaid accounts below a threshold and to new accounts; this key
  has no configured limit (`GET /api/v1/key` returned `limit_remaining: null`).
  (`https://openrouter.ai/docs/api-reference/limits`)

## 5. What this means for the map

- **#109 (matching prototype):** budget ~2¢ and ~10 s per matching call at the
  default model on a 72-page worst case, ~0.3¢ if the papers are digital text.
  Cap the output around 2,000 tokens; the prompt is not the latency problem.
- **Implementation ticket (matching route):** the shared structured transport
  currently sends only fenced JSON, so the matching call needs a file-aware
  structured variant. Pin `engine: 'native'`, keep
  `provider.require_parameters: true`, pass a `maxTokens` of ~2,000–3,000, and
  either keep the 120 s timeout (fine for ~2k output) or raise it to ~180 s if
  8k outputs stay possible.
- **Limits:** keep the 100-page / 15 MiB values and apply them per call. Update
  the "per-run" wording; add a test that two parallel parses do not share a
  page counter, and one that the matching route rejects >100 pages or >15 MiB
  per file before any model spend.
- **Cost display:** the matching call bills at the cache-write rate
  ($0.125/M for the default), so `CURATED_PRICING`'s 0.1 prices the input
  component 25% low (about 20% low in total on the measured 72-page call). If
  the UI shows a run estimate, decide whether that matters.
- **Spec cost is the bigger lever.** Both parses attach the shared specification
  PDF and the spec has its own 200-page / 30 MiB caps, separate from the 100-page
  paper cap. A long, image-heavy spec can cost more than both papers and the
  matching call together: at 3,034 tokens/page, 200 spec pages alone are ~607k
  prompt tokens (past the 272k price break), and with a 72-page paper + markscheme
  the call approaches the 922k input maximum. This is
  pre-existing parse behaviour, not caused by tiering, but tiering attaches the
  same spec twice.

## Sources (primary, checked 2026-10-23)

- OpenRouter live model listing: `https://openrouter.ai/api/v1/models` (468
  models; `openai/gpt-6-luna`, `anthropic/claude-haiku-5.5`,
  `google/gemini-3.1-flash-lite`, `google/gemini-3.8-flash` records, pricing,
  modalities, `supported_parameters`).
- OpenRouter endpoints for the default model:
  `https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints`
  (per-endpoint pricing, `max_prompt_tokens` 922,000, structured-output support).
- OpenRouter model page: `https://openrouter.ai/openai/gpt-6-luna` (provider
  table: OpenAI standard 2.76 s / 60 tok/s, Azure 3.06 s / 70 tok/s, Flex
  7.32 s / 33 tok/s, Fast 1.29 s / 110 tok/s; the table's values are per
  endpoint, while the page headline is the best across providers).
- OpenRouter PDF inputs:
  `https://openrouter.ai/docs/guides/overview/multimodal/pdfs` (file parts,
  multiple files, native-first engine, `mistral-ocr` fallback and price).
- OpenRouter structured outputs:
  `https://openrouter.ai/docs/guides/features/structured-outputs` (json_schema,
  per-endpoint support, `require_parameters`).
- OpenRouter limits: `https://openrouter.ai/docs/api-reference/limits` (free
  variants, in-flight budget, 429 handling).
- OpenAI file inputs:
  `https://developers.openai.com/api/docs/guides/file-inputs` (PDF `file`
  parts in Chat Completions, multiple files, 50 MB per file / 50 MB combined,
  text + page images).
- OpenAI vision guide: `https://developers.openai.com/api/docs/guides/images-vision`
  (patch tokenisation, 2,500-patch high-detail budget, 1.2× multiplier, 512 MB
  request payload, `auto` = high for GPT-5.6 and later).
- OpenAI model card: `https://developers.openai.com/api/docs/models/gpt-6-luna`
  (1,050,000 context, 922,000 max input, 128,000 max output, $0.10/$0.50,
  272k-token 2×/1.5× pricing, text+image modalities).
- OpenAI pricing: `https://developers.openai.com/api/docs/pricing` (gpt-6-luna
  $0.10 input, $0.50 output, $0.125 cache write, $0.01 cached input).
- Anthropic PDF support:
  `https://docs.claude.com/en/docs/build-with-claude/pdf-support` (32 MB
  request, 600 pages, 100 below 1M context).
- Google document processing:
  `https://ai.google.dev/gemini-api/docs/document-processing` (50 MB or 1,000
  pages, 258 tokens/page, multiple PDFs per request).
- Repo code: `src/lib/server/parse/pdf.ts` (`DEFAULT_MODEL_ID`,
  `OPENROUTER_MAX_TOKENS` 4000, `OPENROUTER_TIMEOUT_MS` 120000),
  `src/lib/server/parse/schema.ts` (`MAX_FILE_BYTES` 15 MiB,
  `MAX_TOTAL_PAGES` 100, `MAX_SPEC_PAGES` 200),
  `src/routes/api/parse/+server.ts` (caps enforced per request),
  `src/lib/server/openrouter.ts` (`STRUCTURED_DEFAULT_MAX_TOKENS` 8000,
  `provider.require_parameters`, `liveStructuredTransport`),
  `src/lib/server/parse/models.ts` (`CURATED_MODELS`, `CURATED_PRICING`).
- Probe artefacts (throwaway, not in repo): `/tmp/matching-probe/` — generated
  PDFs, request scripts, raw responses and `usage` objects.
