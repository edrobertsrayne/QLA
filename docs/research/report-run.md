# OpenRouter cost, limits and structured output for a class report run

Research for [#52](https://github.com/edrobertsrayne/QLA/issues/52) (map [#46](https://github.com/edrobertsrayne/QLA/issues/46)). Throwaway branch `research/report-run`, not merged. Checked 2026-10-18.

Question: for one model call per student (~30 students), in parallel under a concurrency cap, through a SvelteKit server route proxying OpenRouter, what does a class run cost and how fast can it go?

## Answer in brief

- **Cost:** a 30-student class costs about **$0.03–$0.11** on the cheap models and **~$0.11–$0.19** on the env default (Gemini 2.5 Flash). Claude Haiku 4.5 is the expensive option at ~$0.29–$0.44. Cost is not a constraint at any of these prices. Reasoning tokens are the main uncertainty (see below).
- **Concurrency cap:** **5 in flight**, per class run. OpenRouter publishes no per-account request cap on paid models; the cap protects against provider-side 429s and the browser's connection pool, not a documented limit.
- **Retry:** up to 3 attempts per student, exponential backoff with jitter (~1 s, 2 s, 4 s), honouring `Retry-After`; retry 408/429/5xx and a 402 whose `metadata.limit_source` is `openrouter_in_flight_budget`; never retry other 4xx. Failures stay per student, so the teacher can re-run just those.
- **Structured output:** supported on every candidate model's endpoints. The existing `/api/parse` route does **not** use `response_format`; it uses prompt-only JSON plus local validation and one silent retry. The report route should send `json_schema` (`strict: true`) with `provider.require_parameters: true` and keep local validation.
- **Timeouts:** one server request per student (client-side fan-out) keeps each invocation to tens of seconds, far inside the existing 120 s guard and Vercel's 300 s default. Do not stream. The deployment target is not pinned in the repo.

## 1. Cost per call and per class

### Prices

Per-million-token prices from the OpenRouter endpoints API (`GET https://openrouter.ai/api/v1/models/<id>/endpoints`, queried 2026-10-18), lowest-price standard-tier endpoint. These match the repo's `CURATED_PRICING` in `src/lib/server/parse/models.ts:35-41`. Several providers/tiers exist per model at higher prices (e.g. Gemini 2.5 Flash at $0.54/$4.50 on a priority-style endpoint); OpenRouter load-balances across providers by price by default ([Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)).

| Model | Input $/M | Output $/M |
| - | - | - |
| `google/gemini-2.5-flash` (env default, `DEFAULT_MODEL_ID` in `src/lib/server/parse/pdf.ts:22`) | 0.30 | 2.50 |
| `google/gemini-2.5-flash-lite` | 0.10 | 0.40 |
| `openai/gpt-4o-mini` | 0.15 | 0.60 |
| `openai/gpt-5-mini` | 0.25 | 2.00 |
| `anthropic/claude-haiku-4.5` | 1.00 | 5.00 |

Pages: [gemini-2.5-flash](https://openrouter.ai/google/gemini-2.5-flash), [gemini-2.5-flash-lite](https://openrouter.ai/google/gemini-2.5-flash-lite), [gpt-4o-mini](https://openrouter.ai/openai/gpt-4o-mini), [gpt-5-mini](https://openrouter.ai/openai/gpt-5-mini), [claude-haiku-4.5](https://openrouter.ai/anthropic/claude-haiku-4.5).

### Token assumptions (estimates, not measured)

- **Input ≈ 5,000 tokens** `[INFERENCE]`: ~60 breakdown entries × ~60 tokens (label, question number, marks/available, summary, spec point, command word, AO, student mark) ≈ 3,600; roll-up by topic and AO plus selected topics/grade ≈ 600; system prompt and schema ≈ 800.
- **Visible output ≈ 900 tokens** `[INFERENCE]`: 300–500 words ≈ 400–700 tokens at ~1.3 tokens/word, plus JSON structure and topic-tied revision actions.
- **Reasoning tokens:** billed as output tokens and, on most providers, counted against `max_tokens` ([Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)). Gemini 2.5 Flash and GPT-5 mini are reasoning models, so scenario B adds **+1,000 reasoning tokens** `[INFERENCE]`. Flash-Lite, 4o-mini and Haiku 4.5 do not reason unless asked.

### Arithmetic

Per call = input_tokens × input price + output_tokens × output price.

| Model | A: no reasoning (5,000 in / 900 out) | ×30 | B: +1,000 reasoning (5,000 in / 1,900 out) | ×30 |
| - | - | - | - | - |
| gemini-2.5-flash | 5,000×$0.30/M + 900×$2.50/M = $0.0015 + $0.00225 = **$0.00375** | **$0.113** | $0.0015 + $0.00475 = **$0.00625** | **$0.188** |
| gemini-2.5-flash-lite | $0.0005 + $0.00036 = **$0.00086** | **$0.026** | n/a (not reasoning by default) | |
| gpt-4o-mini | $0.00075 + $0.00054 = **$0.00129** | **$0.039** | n/a | |
| gpt-5-mini | $0.00125 + $0.0018 = **$0.00305** | **$0.092** | $0.00125 + $0.0038 = **$0.00505** | **$0.152** |
| claude-haiku-4.5 | $0.005 + $0.0045 = **$0.0095** | **$0.285** | n/a | |

Scaling: cost is linear in students and in input tokens; a 40-student class with 100 entries is roughly 2× the figures above. Output tokens dominate on Flash and GPT-5 mini (output price is 8–10× input).

### Retry cost

Retries are billed only if the upstream call completed. Three attempts at worst triple one student's cost (~$0.01 on the default), which is negligible.

## 2. Rate limits, concurrency cap, retry/backoff

### What OpenRouter documents ([Limits](https://openrouter.ai/docs/api-reference/limits))

- Rate limits that apply regardless of account: **free-model variants** (`:free`) at 20 requests/minute and 50 (<$10 credits purchased) or 1,000 (≥$10) requests/day; and Cloudflare DDoS protection for requests that "dramatically exceed reasonable usage". Paid variants have "no platform-level request cap". Do not use `:free` models for a class run: 30 calls fit the daily cap only barely and 30 calls in parallel would breach 20 RPM.
- Limits are global, not per key: "Making additional accounts or API keys will not affect your rate limits."
- A 429 can come from OpenRouter or from the **upstream provider**; for provider limits OpenRouter already falls back to other providers for the same model before the error reaches you. The docs advise "retry with exponential backoff" and honour `Retry-After`. Successful responses carry no `X-RateLimit-*` headers; those appear only on platform 429s.
- **402 in-flight budget:** prepaid accounts below a balance threshold have an in-flight spending budget. A request whose *estimated* cost (based on `max_tokens` and prompt size) does not fit beside running requests gets 402 with `metadata.limit_source: "openrouter_in_flight_budget"` and a `Retry-After` header; this is transient. `weight_exceeds_budget` (`openrouter_credits`) is not transient. Keeping `max_tokens` modest (the existing 4000 is generous for a ~900-token report; ~1,500–2,000 with reasoning capped is enough) keeps each request's estimate small.
- Status meanings ([Limits](https://openrouter.ai/docs/api-reference/limits)): 408 timed out; 429 rate limited; 500 server error; 502 model down/invalid provider response; 503 no provider meets routing requirements. 402 credits; 403 guardrail/budget/moderation.

OpenRouter publishes **no per-provider concurrency figure**; provider concurrency limits are not documented in OpenRouter's pages. I did not find one, so the cap below is a conservative engineering choice, not a sourced limit.

### Recommended cap and policy

- **Cap = 5 concurrent calls** `[INFERENCE]`. Rationale: (a) 30 calls at 5-wide is 6 waves; if each call takes ~10–20 s (output of ~900–1,900 tokens; not measured), a class finishes in roughly 1–2 minutes; (b) browsers limit HTTP/1.1 connections per origin to about 6, so a larger cap would queue in the browser anyway if the app is served over HTTP/1.1; (c) a spiky burst of 30 simultaneous requests to a single provider is the likeliest trigger of upstream 429s. A constant is easy to raise later; the Phase 3 spec should make it a named constant, not a setting.
- **Where to cap:** in the browser (a small pool that fires one `fetch` per student at the report route). The server route stays stateless and handles one student per request, matching the locked "one model call per student, one new server route, UUID-keyed" decision.
- **Retry:** per student, max 3 attempts. Backoff `min(8 s, 1 s × 2^attempt)` plus 0–25% jitter; if `Retry-After` is present use the larger of the two. Retry on: network error/timeout, 408, 429, 500, 502, 503, 504, and 402 with `limit_source: openrouter_in_flight_budget`. Do not retry on 400, 401, 403, other 402s, or a response that fails schema validation after one silent re-ask (same rule as `/api/parse`, below). While backing off, release the pool slot only if other students are waiting.
- **Surface failures per student**; "re-run failed" regenerates only those. Do not abort the whole class on a 5xx; abort the rest on 401 or a non-retryable 402 (nothing will succeed).
- **Existing code today:** `liveTransport` in `src/lib/server/parse/model.ts:200-272` maps 429 and ≥500 to `ModelRetryableError` (route returns 502 with `retryable: true`) and does no automatic backoff retry; the user presses retry. The report run needs the automatic policy above because 30 calls multiply the chance of at least one transient failure.

## 3. Structured output / JSON schema support

### On OpenRouter ([Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs))

- Request: `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
- "Support is determined per endpoint, not just per model." To avoid routing to an endpoint that ignores it, set `provider.require_parameters: true` ([Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)).
- `strict: true` is enforced natively by some providers; others translate it or treat it as a hint, so "exact compliance is not guaranteed on every endpoint". Strict modes may restrict JSON Schema features, so keep the schema simple (flat objects, arrays of strings/objects, `additionalProperties: false`, all keys required).
- Optional **Response Healing** plugin repairs malformed JSON for **non-streaming** `json_schema`/`json_object` requests ([Response Healing](https://openrouter.ai/docs/guides/features/plugins/response-healing)).

### Per-model support (OpenRouter endpoints API, 2026-10-18)

| Model | Endpoints listing `structured_outputs` | Note |
| - | - | - |
| gemini-2.5-flash | all 7 (Google, Google AI Studio) | all list `response_format` too |
| gemini-2.5-flash-lite | all 5 | all list `response_format` |
| gpt-4o-mini | all 3 (OpenAI, Azure) | all list `response_format` |
| gpt-5-mini | all 4 (OpenAI, Azure) | all list `response_format` |
| claude-haiku-4.5 | all 8 (Anthropic, Azure, Bedrock, Google) | the Google endpoints list `structured_outputs` but not `response_format`; use `require_parameters: true` |

Context and max-completion limits are far above this payload (Flash: 1,048,576 context; Haiku: 200,000; 4o-mini: 128,000 context / 16,384 max completion).

### How `/api/parse` does it today

It does **not** use `response_format`. Evidence:

- `buildHybridPayload` in `src/lib/server/parse/pdf.ts:211-258` builds `{ model, max_tokens, messages, plugins? }` only; no `response_format`, no `provider`.
- The prompt instructs "Return ONLY a single JSON object — no markdown fences, no commentary" (`pdf.ts:171-172`).
- `liveTransport` (`model.ts`) reads `choices[0].message.content` and passes it through `extractJsonText` (strips fences/prose); `validate.ts` checks the shape; the route does one silent retry on malformed JSON (header of `model.ts`, `src/routes/api/parse/+server.ts`). `usage` tokens come from the response and `estimateCost` uses `CURATED_PRICING`.
- Reason it has worked: the Parse payload is multimodal and the output schema is large and nested, and the route must work with any per-run override model.

Recommendation for the report route: add `response_format` json_schema (small schema: `wentWell: string[1-2]`, `evenBetterIf: {topic, target, revisionAction}[2-3]`, plus whatever the feedback ticket fixes), `provider: { require_parameters: true }`, keep `extractJsonText` + local validation + one silent re-ask as a backstop, and reuse `usage`/`estimateCost`. The schema is tiny, so strict-mode restrictions will not bite.

## 4. Timeouts and streaming on the deployment target

- **Deployment target is not pinned.** `vite.config.ts:3,17` imports `@sveltejs/adapter-auto` (zero-config; picks an adapter for the detected platform at build) and no `svelte.config.js` or platform config (`vercel.json`, `wrangler.toml`, Dockerfile) is in git. `.gitignore` lists `.vercel`, `.netlify`, `.wrangler` as generic SvelteKit boilerplate. Hosting is out of scope per `ROADMAP.md:42`. So I cite limits only for platforms that adapter-auto supports and I could read.
- **Existing guard:** `OPENROUTER_TIMEOUT_MS = 120_000` (`pdf.ts:25`), applied with `AbortSignal.timeout` (`model.ts:236`); timeout/abort becomes a retryable error. A report call (small input, ≤~2,000 output tokens) should finish in tens of seconds, so reuse this constant or lower it to ~60 s `[INFERENCE]`; a slow call then fails fast and retries instead of occupying a pool slot for two minutes.
- **If it lands on Vercel:** Functions with Fluid compute default to **300 s** (Hobby 300 s max; Pro/Enterprise 800 s max); duration includes streamed responses; exceeding it returns 504 `FUNCTION_INVOCATION_TIMEOUT` ([Vercel limits](https://vercel.com/docs/functions/limitations#max-duration), [configuring duration](https://vercel.com/docs/functions/configuring-functions/duration)). Concurrency auto-scales to 30,000. A per-student invocation sits well inside this. The risky design would be one invocation looping over all 30 students server-side (at 5-wide, ~1–2 minutes of wall clock, plus a lost-everything failure mode), which also breaks the one-model-call-per-request shape.
- **With adapter-node or any self-hosted Node:** no platform request ceiling beyond whatever reverse proxy sits in front (not checked; unknown).
- **Streaming:** not needed. Output is ≤~2,000 tokens JSON; the UI only needs per-student completion, which the client-side fan-out already gives. Streaming complicates `json_schema` handling (Response Healing is non-streaming only) and gives nothing for a card that is rendered after parse. Use `stream: false`.
- **Timeout risks:** (1) reasoning tokens inflate latency and can exhaust `max_tokens` leaving empty `content` with `finish_reason: "length"` (still billed) — cap reasoning (`reasoning: { max_tokens }` or low `effort`) or set `max_tokens` well above expected reasoning ([Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)); treat `finish_reason: length` as a retryable failure with a higher budget; (2) a slow provider holds a slot up to the timeout: use the 60–120 s abort and let backoff retry hit a different provider via OpenRouter's fallback; (3) browser tab closed or navigated away mid-run abandons in-flight calls but the server persists nothing, so the cost is only what already completed; the run must be resumable per student from browser storage.

## Open items this leaves for the spec

- Real token counts and latency were not measured (no live key use); the 5,000/900-token assumption and 10–20 s per call are estimates. A first build should log `usage` per call (the route already returns it) and the spec can then tighten the cap.
- Whether to default the report route to Flash or Flash-Lite is a quality question for the feedback ticket, not a cost one: the price gap is ~$0.09 per class.
- Hosting is undecided, so timeout figures for Netlify/Cloudflare were not researched.
