# OpenRouter cost, limits and structured output for a class report run

Research for [#52](https://github.com/edrobertsrayne/QLA/issues/52) (map [#46](https://github.com/edrobertsrayne/QLA/issues/46)). Throwaway branch `research/report-run`, not merged. Model survey **refreshed 2026-10-18** (fetch time 18:33–18:50 UTC); the first version of this note listed a stale model set written from memory and is superseded.

Question: for one model call per student (~30 students), in parallel under a concurrency cap, through a SvelteKit server route proxying OpenRouter, what does a class run cost and how fast can it go?

Citation convention: every model name, ID, price and capability below comes from a URL given in the same row/paragraph (primary source: the OpenRouter live API or the vendor's own docs). Anything not read from a primary source is tagged `[INFERENCE]`.

## Answer in brief

- **The repo's model set is stale.** `CURATED_MODELS`/`CURATED_PRICING` (`src/lib/server/parse/models.ts:19-41`), the `DEFAULT_MODEL_ID` fallback (`src/lib/server/parse/pdf.ts:22`) and the documented `OPENROUTER_MODEL` env default (`.env.example:5`) are all `google/gemini-2.5-flash` and its 2025-era siblings. OpenRouter still serves them, but every vendor has shipped a newer lightweight tier (below), and the prices in `CURATED_PRICING` match the live 2.5-generation prices (checked below), so they are not wrong, just superseded.
- **Cost:** a 30-student class costs **about $0.01–$0.05** on the cheapest current options (Claude Haiku 5.5, GPT-6 Luna, DeepSeek V4.1 Flash on a US host), **$0.08–$0.19** on the Gemini 3.x Flash-Lite tier, and **$0.21–$0.33** on Gemini 3.8 Flash. The env default (Gemini 2.5 Flash) is $0.11–$0.19. Cost is not a constraint at any of these prices; reasoning tokens are the only real uncertainty.
- **Cheapest pair worth testing for quality:** `anthropic/claude-haiku-5.5` and `openai/gpt-6-luna`, both $0.10 / $0.50 per M tokens, both 1M+ context, both `structured_outputs` + `response_format` on their first-party endpoints.
- **Concurrency cap:** **5 in flight**, per class run `[INFERENCE]`. OpenRouter documents no platform request cap on paid models; the cap protects against provider-side 429s and the browser's connection pool.
- **Retry:** up to 3 attempts per student, exponential backoff with jitter, honouring `Retry-After`; retry 408/429/5xx and a 402 whose `metadata.limit_source` is `openrouter_in_flight_budget`; never retry other 4xx.
- **Structured output:** every candidate model has endpoints that support `json_schema`. The existing `/api/parse` route does **not** use `response_format`. The report route should send `json_schema` (`strict: true`) with `provider.require_parameters: true` and keep local validation.
- **DeepSeek without China-hosted inference:** possible on OpenRouter via `provider.only` (allowlist) — 19 hosts with a non-Chinese headquarters and `structured_outputs` serve `deepseek/deepseek-v4.1-flash`; DeepSeek's own endpoint and Baidu/StreamLake/Alibaba must be excluded. The region of the actual hosting data centre is stated for only a few providers (see section 1.3).
- **Timeouts:** one server request per student keeps each invocation to tens of seconds, far inside the existing 120 s guard and Vercel's 300 s default. Do not stream.

## Method

What was searched, in order (all fetched 2026-10-18 from `curl`/`read`, no API key):

1. `GET https://openrouter.ai/api/v1/models` — full catalogue (471 entries). Filtered with `jq` on `haiku|luna|flash|deepseek|mini|nano|lite|gpt-6|gemini-[3-9]` to enumerate every lightweight candidate and its `created` date, `pricing`, `reasoning`, `supported_parameters`.
2. `GET https://openrouter.ai/api/v1/models/{author}/{slug}/endpoints` for every model in the table (nine IDs plus `google/gemini-2.5-flash` as the baseline) — per-endpoint price, quantization, `supported_parameters`, context, max completion.
3. `GET https://openrouter.ai/api/v1/providers` — provider `headquarters` / `datacenters` metadata (used for the DeepSeek host filter).
4. Vendor pages: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [models overview](https://platform.claude.com/docs/en/about-claude/models/overview); [OpenAI models](https://platform.openai.com/docs/models); [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [models](https://ai.google.dev/gemini-api/docs/models); [DeepSeek models & pricing](https://api-docs.deepseek.com/quick_start/pricing) (all fetched as HTML, text-extracted).
5. OpenRouter docs re-verified for the kept sections: [Limits](https://openrouter.ai/docs/api-reference/limits), [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [Service tiers](https://openrouter.ai/docs/guides/features/service-tiers), [Response healing](https://openrouter.ai/docs/guides/features/plugins/response-healing); and [Vercel function limits](https://vercel.com/docs/functions/limitations).
6. Repo greps: `src/lib/server/parse/env.ts`, `pdf.ts`, `models.ts`, `model.ts`, `.env.example`, issue [#17](https://github.com/edrobertsrayne/QLA/issues/17) (via `gh issue view 17`).

"Price" below is the **default (standard-tier) endpoint** at fetch time. OpenRouter also lists `flex`, `priority` and `fast` tier endpoints, but non-default tiers are only used when the request asks for them (`service_tier`, `:floor`, `:nitro`) ([Service tiers](https://openrouter.ai/docs/guides/features/service-tiers), "Non-default tier endpoints ... are only considered when your request asks for them"). Where an endpoint's listed price is lower only because it is a `flex` endpoint, it is not used as the headline.

## 1. Models

### 1.1 What the repo has today

- Env default: `OPENROUTER_MODEL` is read by `getEnvDefaultModel()` (`src/lib/server/parse/env.ts:28-33`); unset → `DEFAULT_MODEL_ID = 'google/gemini-2.5-flash'` (`src/lib/server/parse/pdf.ts:22`, `resolveModelId` at `pdf.ts:47-52`). `.env.example:5` sets `OPENROUTER_MODEL=google/gemini-2.5-flash`.
- Pricing source of truth: issue #17 (closed) made `CURATED_PRICING` in `src/lib/server/parse/models.ts:35-41` the single price table feeding both the picker and `estimateCost`. It holds: gemini-2.5-flash $0.30/$2.50, gemini-2.5-flash-lite $0.10/$0.40, gpt-4o-mini $0.15/$0.60, gpt-5-mini $0.25/$2.00, claude-haiku-4.5 $1/$5 per M. Source: `gh issue view 17` and the file.
- Is it stale? **The numbers are still correct for those IDs** (OpenRouter live: gemini-2.5-flash standard $0.30/$2.50 — [endpoints](https://openrouter.ai/api/v1/models/google/gemini-2.5-flash/endpoints); haiku-4.5 $1/$5, 4o-mini $0.15/$0.60, gpt-5-mini $0.25/$2, 2.5-flash-lite $0.10/$0.40 — [models list](https://openrouter.ai/api/v1/models)). **The model set is stale**: each is a previous generation with a newer, cheaper-or-equal successor on OpenRouter (Haiku 4.5 → 5.5 at one-tenth the price; GPT-5 mini / 4o-mini → GPT-6 Luna; Gemini 2.5 → 3.x). The env default and the curated dropdown both want a refresh, which is a separate change from this research.

### 1.2 Current lightweight models, per provider (live)

All rows: OpenRouter listing and endpoints fetched 2026-10-18; `$ in / out` per M tokens; context and max completion from the endpoints API. "SO/RF" = endpoints advertising `structured_outputs` / `response_format` in `supported_parameters`.

| Provider / role | OpenRouter ID | Released (OR `created`) | $ in / out (std tier, global) | Context / max completion | SO / RF endpoints | Reasoning behaviour (OR `reasoning` field) |
| - | - | - | - | - | - | - |
| Anthropic — newest Haiku | `anthropic/claude-haiku-5.5` | 2026-10-07 | 0.10 / 0.50 (Anthropic, Azure global, Bedrock, Vertex global). Regional (`us`/`eu`) endpoints 0.11 / 0.55 | 1,000,000 / 128,000 | 6 of 10 / 10 of 10 (no SO on `claude-on-aws` and the 3 Bedrock endpoints) | Optional; `supported_efforts` max…low, `none`; `default_effort: medium`, not `mandatory`. Reasoning tokens are billed as output. |
| OpenAI — "Luna" | `openai/gpt-6-luna` (= "GPT-6 Luna") | 2026-09-22 | 0.10 / 0.50 (OpenAI, Azure). `openai/fast` 0.20 / 1.00; Azure `us`/`eu`, Bedrock 0.11 / 0.55; `openai/flex` 0.05 / 0.25 (flex tier, not default) | 1,050,000 / 128,000 | 7 of 7 / 7 of 7 | Optional; `default_enabled: true`, `default_effort: medium`, `none` supported (so reasoning can be turned off); billed as output. |
| Google — newest Flash | `google/gemini-3.8-flash` | 2026-09-02 | 0.75 / 3.75 (AI Studio, Vertex global); Vertex `us` 0.825 / 4.125 | 1,048,576 / 65,536 | 7 of 7 / 7 of 7 | **Mandatory**; efforts high/medium/low only (no `none`); default medium. |
| Google — newest Flash-Lite | `google/gemini-3.5-flash-lite` | 2026-07-21 | 0.30 / 2.50 (AI Studio, Vertex global); `eu`/`us` 0.33 / 2.75 | 1,048,576 / 65,536 | 8 of 8 / 8 of 8 | **Mandatory**; efforts high…`minimal`, no `none`; `default_effort: minimal`. Thinking tokens are included in the output price ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing): "Output price (including thinking tokens)"). |
| Google — previous Flash-Lite (GA) | `google/gemini-3.1-flash-lite` | 2026-05-07 | 0.25 / 1.50 (AI Studio, Vertex global); `eu`/`us` 0.275 / 1.65 | 1,048,576 / 65,536 | 8 of 8 / 8 of 8 | Optional; `default_enabled: true`, `default_effort: minimal`, `none` supported. |
| DeepSeek — Flash | `deepseek/deepseek-v4.1-flash` (alt snapshot `deepseek/deepseek-v4.1-flash-1017`) | 2026-09-10 (1017 snapshot: 2026-10-17) | per host, **0.04–0.30 / 0.144–1.20** (table 1.3) | 1,048,576 / 131,072–943,718 depending on host | 28 of 34 / 33 of 34 (1017: 11 of 13 / 12 of 13) | Optional; `default_enabled: true`, `default_effort: high`, `none` supported; billed as output. |

Primary sources for the table: model list `https://openrouter.ai/api/v1/models` (fields `id`, `created`, `reasoning`, `supported_parameters`) and endpoints `https://openrouter.ai/api/v1/models/anthropic/claude-haiku-5.5/endpoints`, `.../openai/gpt-6-luna/endpoints`, `.../google/gemini-3.8-flash/endpoints`, `.../google/gemini-3.5-flash-lite/endpoints`, `.../google/gemini-3.1-flash-lite/endpoints`, `.../deepseek/deepseek-v4.1-flash/endpoints` (all under `https://openrouter.ai/api/v1/models/`).

Vendor confirmation of the same models and prices:

- **Claude Haiku 5.5:** [Anthropic models overview](https://platform.claude.com/docs/en/about-claude/models/overview) lists Claude Haiku 5.5, API ID `claude-haiku-5-5`, "From $0.10 / input MTok, From $0.50 / output MTok", thinking "Adaptive". [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing): $0.10/MTok input and $0.50/MTok output "for prompts up to 100,000 tokens", higher above 100k (not relevant at ~5k tokens); `inference_geo` regional routing is a 1.1× multiplier, which matches the 0.11/0.55 regional OpenRouter endpoints.
- **GPT-6 Luna:** [OpenAI models](https://platform.openai.com/docs/models): "GPT-6 Luna — Our most efficient model for focused, high-volume tasks. Model ID `gpt-6-luna`; input $0.1 / MTok, output $0.5 / MTok; max output 128K; context 1.05M; reasoning none…max". The same page's flagship line-up is GPT-6 Astra, GPT-6.1 Sol and GPT-6 Luna ("GPT-6 Luna for cost-sensitive, high-volume workloads"), so Luna is OpenAI's current lightweight tier; OpenRouter has no newer Luna (no `gpt-6.1-luna`; see Not found). Predecessor `openai/gpt-5.6-luna` is still listed at 0.20 / 1.20 ([endpoints](https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints)) and is superseded. `openai/gpt-6-luna-pro` is the same model "served with `reasoning.mode` set to `pro`"; its OpenRouter description warns pro mode "spends far more" reasoning tokens ([models list](https://openrouter.ai/api/v1/models)) — not suitable for a cost-sensitive bulk run, so it is excluded.
- **Gemini:** [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing): `gemini-3.5-flash-lite` $0.30 in / $2.50 out; `gemini-3.1-flash-lite` $0.25 in / $1.50 out; `gemini-3.8-flash` $0.75 in / $3.75 out **"through December 31, 2026. $1.50 / $7.50 starting January 1, 2027"**. The 2027 repricing is on Google's page; whether OpenRouter's price will follow is `[INFERENCE]` (OpenRouter currently shows 0.75 / 3.75). [Gemini models](https://ai.google.dev/gemini-api/docs/models) lists 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite and 3.1 Flash-Lite as current endpoints; there is no 3.8 Flash-Lite text model on Google's page or on OpenRouter (only a "3.8 Flash-Lite TTS").
- **DeepSeek:** [DeepSeek models & pricing](https://api-docs.deepseek.com/quick_start/pricing): model name `deepseek-flash`, version DeepSeek-V4.1-Flash-1017, 1M context, 384K max output, "Supports both non-thinking and thinking (default) modes", JSON output supported; $0.15 in / $0.60 out per M off-peak and $0.30 / $1.20 peak (peak = 01:00–04:00 and 06:00–10:00 UTC Mon–Fri). That is DeepSeek's **own (China-hosted, `headquarters: CN`) endpoint, which is excluded below.** The legacy `deepseek-v4-flash` name now routes to V4.1-Flash-1017.

Other Gemini 3.x Flash variants on OpenRouter, for completeness (all `https://openrouter.ai/api/v1/models`, standard price in / out): `google/gemini-3-flash-preview` 0.50 / 3.00; `google/gemini-3.6-flash` 0.75 / 3.75; `google/gemini-3.7-flash` 0.75 / 3.75; `google/gemini-3.5-flash` 1.50 / 9.00. None is cheaper than the three Gemini rows above for equal or better price/quality, and I did not benchmark quality `[INFERENCE]`. Also seen and not covered (not Anthropic/OpenAI/Google/DeepSeek): other vendors' flash/mini models in the same list.

`~anthropic/claude-haiku-latest`, `~openai/gpt-luna-latest` and `~deepseek/deepseek-flash-latest` exist as floating aliases on OpenRouter ([models list](https://openrouter.ai/api/v1/models)); their listed alias prices differ from the pinned models for DeepSeek (alias 0.05 / 0.60). Use pinned IDs for a reproducible class run `[INFERENCE]`.

### 1.3 DeepSeek V4.1 Flash on non-China hosts

Goal: serve DeepSeek Flash without sending student data to China-hosted inference. OpenRouter's default routing load-balances across **all** providers by inverse-square price ([Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), "Price-Based Load Balancing"), so unconstrained requests can land on `deepseek`, `baidu`, `streamlake` or `alibaba`; the request must restrict providers explicitly.

Endpoints for `deepseek/deepseek-v4.1-flash` (fetched [https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), 34 endpoints). HQ / DC columns are OpenRouter's `GET https://openrouter.ai/api/v1/providers` `headquarters` and `datacenters` fields for the provider (company-level, not per endpoint; "not stated" = null/empty in that API). The endpoint `tag` suffix (`/us`, `fp8`, …) is OpenRouter's slug; only the `/us` suffixes on BaseTen and Fireworks are a region in the slug itself.

| Provider | Endpoint tag | $ in / out | Quant | HQ | DC stated | SO/RF | Include? |
| - | - | - | - | - | - | - | - |
| OpenInference | `open-inference/fp4` | 0.04 / 0.144 | fp4 | US | not stated | Y/Y | yes |
| Relace | `relace` | 0.05 / 0.6 | unknown | not stated | not stated | Y/Y | HQ unknown — verify first |
| Morph | `morph/fp8` | 0.081 / 0.55 | fp8 | US | US | Y/Y | yes |
| Decart | `decart/fp4` | 0.09 / 0.18 | fp4 | US | US | Y/Y | yes |
| Sail Research | `sail-research/fp4` | 0.09 / 0.3 | fp4 | US | not stated | Y/Y | yes |
| Wafer | `wafer/mxfp4` | 0.1 / 0.65 | mxfp4 | US | not stated | Y/Y | yes |
| InferenceNet | `inference-net/fp8` | 0.103 / 0.715 | fp8 | US | not stated | Y/Y | yes |
| DeepInfra | `deepinfra/fp8` | 0.14 / 0.42 | fp8 | US | not stated | Y/Y | yes |
| AtlasCloud | `atlas-cloud/fp8` | 0.135 / 0.54 | fp8 | US | not stated | Y/Y | yes |
| CoreWeave | `coreweave/fp8` | 0.15 / 0.65 | fp8 | US | US | Y/Y | yes |
| DigitalOcean | `digitalocean` | 0.195 / 0.78 | unknown | US | not stated | Y/Y | yes |
| Ionstream | `ionstream` | 0.27 / 0.75 | unknown | US | US | Y/Y | yes |
| Crusoe | `crusoe/fp8` | 0.29 / 1.2 | fp8 | US | not stated | Y/Y | yes |
| Nebius | `nebius/fp8` | 0.3 / 1.2 | fp8 | NL | not stated | Y/Y | yes (EU HQ) |
| Together | `together` | 0.3 / 1.2 | unknown | US | not stated | Y/Y | yes |
| Fireworks | `fireworks` (+ `fireworks/us` 0.45 / 1.8) | 0.3 / 1.2 | unknown | US | not stated | Y/Y | yes |
| Parasail | `parasail/fp8` | 0.3 / 1.2 | fp8 | US | not stated | Y/Y | yes |
| Modal | `modal` | 0.3 / 1.2 | unknown | US | not stated | Y/Y | yes |
| Venice | `venice/fp8` | 0.3 / 1.2 | fp8 | US | US | Y/Y | yes |
| BaseTen | `baseten/us` (also `baseten`, `baseten/fast`) | 0.3 / 1.2 | unknown | US | not stated | Y/Y (`baseten`: Y/N) | yes |
| Novita, Phala, GMICloud | `novita/fp8`, `phala`, `gmicloud/fp8` | 0.18–0.21 / 0.72–0.84 | fp8 / unknown | US | GMICloud: US | N/Y | yes, but no `structured_outputs` — excluded by `require_parameters` |
| PrimeIntellect, Makora | `primeintellect`, `makora/fp8` | 0.27–0.3 / 1.15–1.2 | unknown / fp8 | not stated | not stated | Y/Y | HQ unknown — verify first |
| SiliconFlow | `siliconflow/fp8` | 0.3 / 1.2 | fp8 | SG | US | N/Y | exclude: SG HQ; US data centre stated, but ownership/processing not verified |
| **Alibaba** | `alibaba` | 0.15 / 0.6 | unknown | SG | **SG, CN** | N/Y | **exclude (CN data centre)** |
| **StreamLake** | `streamlake/fp8` | 0.1497 / 0.5988 | fp8 | **CN** | not stated | N/Y | **exclude** |
| **Baidu** | `baidu/fp8` | 0.3 / 1.2 | fp8 | **CN** | not stated | Y/Y | **exclude** |

Also on `deepseek/deepseek-v4.1-flash-1017` ([endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints), 13 endpoints): DeepSeek's own endpoint tag `deepseek` ($0.15 / $0.60, `headquarters: CN`, **no `structured_outputs`**) — exclude; non-China hosts there are Relace, DeepInfra (0.098 / 0.294), InferenceNet, Morph, Cloudflare, Fireworks, PrimeIntellect, BaseTen, Parasail, Wafer.

Honest limits of this table: (1) OpenRouter's `datacenters` array is empty or null for most providers, so for most of the hosts above the *hosting region is not stated* in any source I read; "US HQ" is not the same as "US-hosted". Where a provider lists `datacenters: ["US"]` (Morph, Decart, CoreWeave, Ionstream, Venice, GMICloud) the claim is sourced; for others it is only a headquarters claim. (2) I did not read each provider's own docs; the OpenRouter providers API was the only region source. (3) Several hosts serve fp4 (OpenInference, Decart, Sail Research, AtlasCloud) which is a quality risk `[INFERENCE]`; `provider.quantizations` can restrict ([Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)).

**Routing recipe (docs-sourced fields):** `provider.only` is "list of provider slugs to allow for this request"; `provider.ignore` skips slugs; `provider.order` plus `allow_fallbacks: false` pins a priority list; `require_parameters: true` drops endpoints that lack any parameter in the request ([Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), parameter table). A base slug (`"deepinfra"`) matches every variant/region of that provider; it does not opt into `flex`/`fast` service-tier endpoints, but non-flex tier endpoints already in the pool (such as DeepInfra `priority`) do match ("Base Slug Matching"). Example (illustrative, not tested against the API):

```json
"provider": {
  "only": ["deepinfra", "together", "fireworks", "parasail", "coreweave", "venice", "morph", "decart", "ionstream", "crusoe", "modal"],
  "require_parameters": true,
  "allow_fallbacks": true
}
```

Prefer `only` (allowlist) over `ignore: ["deepseek","baidu","streamlake","alibaba"]`: with `ignore`, any new China-hosted provider OpenRouter adds later would be eligible automatically `[INFERENCE]`. If `only` leaves no eligible endpoint OpenRouter returns 503 "No available model provider meets your routing requirements" ([Limits](https://openrouter.ai/docs/api-reference/limits), status table).

### 1.4 Token assumptions (same as the prior version; estimates, not measured)

- **Input ≈ 5,000 tokens** `[INFERENCE]`: ~60 breakdown entries × ~60 tokens ≈ 3,600; roll-up by topic and AO plus selected topics/grade ≈ 600; system prompt and schema ≈ 800.
- **Visible output ≈ 900 tokens** `[INFERENCE]`: 300–500 words ≈ 400–700 tokens, plus JSON structure and topic-tied revision actions.
- **Scenario B: +1,000 reasoning tokens** `[INFERENCE]` for models that reason by default. Reasoning tokens are billed as output tokens and, on most providers, count against `max_tokens` ([Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens): "Reasoning tokens are considered output tokens and charged accordingly. On most providers they also count against the request's `max_tokens`"). Scenario A = reasoning off (`reasoning.effort: "none"`) where the model allows it; for Gemini 3.5 Flash-Lite and 3.8 Flash reasoning is mandatory (cannot be disabled, per the `reasoning.mandatory: true` field), so A is a lower bound there and B is closer to reality `[INFERENCE]`. For Haiku 5.5, Luna and DeepSeek the default is "on" (OpenRouter `default_effort`), so an unconfigured call lands on B; set `reasoning.effort: "none"` or a low effort to get A.

### 1.5 Arithmetic and table

Per call = (input_tokens × input $/M + output_tokens × output $/M) / 10⁶. Class = 30 × call. Prices are the std-tier global OpenRouter endpoint prices from 1.2/1.3 (fetched 2026-10-18).

**A: 5,000 in / 900 out. B: 5,000 in / 1,900 out (900 visible + 1,000 reasoning).**

| Model (price in/out $/M) | A: input + output | A per call | A ×30 | B: input + output | B per call | B ×30 |
| - | - | - | - | - | - | - |
| `anthropic/claude-haiku-5.5` (0.10 / 0.50) | 5,000×0.10/M = $0.000500 + 900×0.50/M = $0.000450 | **$0.00095** | **$0.029** | $0.000500 + 1,900×0.50/M = $0.000950 | **$0.00145** | **$0.044** |
| `openai/gpt-6-luna` (0.10 / 0.50) | $0.000500 + $0.000450 | **$0.00095** | **$0.029** | $0.000500 + $0.000950 | **$0.00145** | **$0.044** |
| `deepseek/deepseek-v4.1-flash`, cheapest non-China host OpenInference fp4 (0.04 / 0.144) | $0.000200 + 900×0.144/M = $0.000130 | **$0.00033** | **$0.010** | $0.000200 + 1,900×0.144/M = $0.000274 | **$0.00047** | **$0.014** |
| same, DeepInfra fp8 (0.14 / 0.42) | $0.000700 + $0.000378 | **$0.00108** | **$0.032** | $0.000700 + $0.000798 | **$0.00150** | **$0.045** |
| same, Together/Fireworks/Parasail (0.30 / 1.20) | $0.001500 + $0.001080 | **$0.00258** | **$0.077** | $0.001500 + $0.002280 | **$0.00378** | **$0.113** |
| `google/gemini-3.1-flash-lite` (0.25 / 1.50) | $0.001250 + $0.001350 | **$0.00260** | **$0.078** | $0.001250 + $0.002850 | **$0.00410** | **$0.123** |
| `google/gemini-3.5-flash-lite` (0.30 / 2.50) | $0.001500 + $0.002250 | **$0.00375** | **$0.113** | $0.001500 + $0.004750 | **$0.00625** | **$0.188** |
| `google/gemini-3.8-flash` (0.75 / 3.75) | $0.003750 + $0.003375 | **$0.00713** | **$0.214** | $0.003750 + $0.007125 | **$0.01088** | **$0.326** |
| *Baseline:* `google/gemini-2.5-flash` (0.30 / 2.50), current env default | $0.001500 + $0.002250 | **$0.00375** | **$0.113** | $0.001500 + $0.004750 | **$0.00625** | **$0.188** |
| *Baseline:* `openai/gpt-5.6-luna` (0.20 / 1.20), superseded | $0.001000 + $0.001080 | **$0.00208** | **$0.062** | $0.001000 + $0.002280 | **$0.00328** | **$0.098** |

(Rounded; per-call figures are exact to the digits shown.) Observations:

- Haiku 5.5 and GPT-6 Luna cost the same, about 4× cheaper per call than Gemini 3.5 Flash-Lite and the old env default (Gemini 2.5 Flash) in scenario A ($0.00095 vs $0.00375); Haiku 5.5 is **10× cheaper than Haiku 4.5** ($0.0095/call, $0.285/class in the prior version) for the same payload.
- Output price dominates on Gemini 3.x (output is 6–10× input); input dominates on DeepSeek on its cheapest hosts.
- Scaling: cost is linear in students and input tokens; a 40-student class with 100 entries is roughly 2× the figures above.
- Gemini 3.8 Flash is the expensive one and, per Google's page, doubles to $1.50 / $7.50 on 2027-01-01 ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)) — a $0.43–$0.65 class at those rates `[INFERENCE: if OpenRouter mirrors Google]`.
- Retries are billed only if the upstream call completed ([Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) documents that `finish_reason: "length"` calls are still billed). Three attempts triple at worst one student's cost, which is under a cent on every row.

## 2. Rate limits, concurrency cap, retry/backoff

Re-verified 2026-10-18 against [Limits](https://openrouter.ai/docs/api-reference/limits) (fetched as `https://openrouter.ai/docs/api_reference/limits.md`).

### What OpenRouter documents

- Platform rate limits apply to **free model variants** (IDs ending `:free`: 20 requests/minute, and a daily cap that depends on credits purchased; the page's constants are 50/day below $10 and 1,000/day at ≥$10) and to Cloudflare DDoS protection. The page states the paid variant "has no platform-level request cap". Do not use `:free` models for a class run: 30 calls in parallel would breach 20 RPM.
- "Making additional accounts or API keys will not affect your rate limits, as we govern capacity globally."
- A 429 may be an OpenRouter platform limit or an **upstream provider** limit; the docs advise "Retry with exponential backoff and honor the `Retry-After` header when present" and, for provider-side limits, adding fallback models or relaxing provider routing preferences so more providers are eligible. Successful responses carry no `X-RateLimit-*` headers; 429 errors from OpenRouter itself do. Note this interacts with the DeepSeek allowlist above: a narrower `only` list leaves fewer fallback providers.
- **402 in-flight budget:** accounts below a balance threshold (and, during rollout, newer accounts) have an in-flight spending budget; a request whose estimated cost does not fit beside running requests gets 402 with `error.metadata.limit_source: "openrouter_in_flight_budget"` (`reason: "in_flight_budget_exhausted"`) and a `Retry-After` header — transient, retry. `limit_source: "openrouter_credits"` with `reason: "weight_exceeds_budget"` means the single request is too large and retrying will not help; `openrouter_key_limit` means the key's cap is spent. Keep `max_tokens` modest so each request's estimate stays small: the existing `OPENROUTER_MAX_TOKENS = 4000` (`pdf.ts:25`) is generous for a ~900-token report; ~1,500–2,500 with reasoning capped is enough `[INFERENCE]`.
- Status meanings (page's status table): 400 bad request; 401 invalid credentials; 402 insufficient credits; 403 guardrail/permission/moderation; 408 timed out; 429 rate limited; 500 server error; 502 model down or invalid provider response; 503 no provider meets routing requirements.

OpenRouter publishes **no per-provider concurrency figure** (I did not find one in Limits or Provider routing); for comparison, DeepSeek's own API page lists "Concurrency Limit (3): 2500" for deepseek-flash ([DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)), which is for DeepSeek's own endpoint and not for third-party hosts. The cap below is a conservative engineering choice, not a sourced limit.

### Recommended cap and policy

- **Cap = 5 concurrent calls** `[INFERENCE]`. 30 calls at 5-wide is 6 waves; at ~10–20 s per call (not measured) a class finishes in roughly 1–2 minutes; browsers limit HTTP/1.1 connections per origin to about 6, so a larger cap would queue in the browser anyway on HTTP/1.1; a burst of 30 simultaneous requests to one provider is the likeliest trigger of upstream 429s. Make it a named constant.
- **Where to cap:** in the browser (a small pool firing one `fetch` per student at the report route). The server route stays stateless, one student per request.
- **Retry:** per student, max 3 attempts. Backoff `min(8 s, 1 s × 2^attempt)` plus 0–25% jitter; if `Retry-After` is present use the larger. Retry on network error/timeout, 408, 429, 500, 502, 503, 504, and 402 with `limit_source: openrouter_in_flight_budget`. Do not retry 400, 401, 403, other 402s, or a response failing schema validation after one silent re-ask.
- **Surface failures per student**; "re-run failed" regenerates only those. Abort the rest of the class on 401 or a non-retryable 402.
- **Existing code today** (working tree, 2026-10-18): `liveTransport` in `src/lib/server/parse/model.ts:199-` maps 429 and ≥500 to `ModelRetryableError` (`model.ts:60`; route returns 502 with `retryable: true`) and does no automatic backoff retry; the user presses retry.

## 3. Structured output / JSON schema support

Re-verified against [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) and [Response healing](https://openrouter.ai/docs/guides/features/plugins/response-healing).

### On OpenRouter

- Request: `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`.
- "Support is determined per endpoint, not just per model" and endpoint support can change over time; to avoid routing to an endpoint that ignores it, set `require_parameters: true` in `provider`.
- `strict: true` is enforced natively by some providers; others translate or treat it as a strong hint, so exact compliance is not guaranteed everywhere. Keep the schema simple (flat objects, arrays of strings/objects, `additionalProperties: false`, all keys required).
- The **Response Healing** plugin repairs malformed JSON for **non-streaming** `json_schema` / `json_object` requests only ("Response Healing only applies to non-streaming requests").

### Per-model support (endpoints API, 2026-10-18)

From the endpoints API per model (`https://openrouter.ai/api/v1/models/<id>/endpoints`; counts computed from each endpoint's `supported_parameters`):

| Model | `structured_outputs` | `response_format` | Endpoints without `structured_outputs` |
| - | - | - | - |
| claude-haiku-5.5 | 6 of 10 | 10 of 10 | `claude-on-aws`, `amazon-bedrock` (+ `us-east-1`, `eu-west-1`) |
| gpt-6-luna | 7 of 7 | 7 of 7 | none |
| gemini-3.8-flash | 7 of 7 | 7 of 7 | none |
| gemini-3.5-flash-lite | 8 of 8 | 8 of 8 | none |
| gemini-3.1-flash-lite | 8 of 8 | 8 of 8 | none |
| deepseek-v4.1-flash | 28 of 34 | 33 of 34 | `streamlake`, `alibaba`, `gmicloud`, `novita`, `phala`, `siliconflow` |
| deepseek-v4.1-flash-1017 | 11 of 13 | 12 of 13 | `deepseek` (own endpoint), `baseten` |

Consequence: with `require_parameters: true`, Haiku 5.5 requests route to Anthropic, Azure or Google Vertex only (not Bedrock / Claude Platform on AWS), and DeepSeek requests drop to the hosts that advertise `structured_outputs` (all hosts marked Y in 1.3).

### How `/api/parse` does it today (working tree, 2026-10-18)

It does **not** use `response_format`:

- `buildHybridPayload` in `src/lib/server/parse/pdf.ts:206-258` builds `{ model, max_tokens, messages, plugins? }` only; no `response_format`, no `provider`.
- The prompt instructs "Return ONLY a single JSON object — no markdown fences, no commentary." (`pdf.ts:172`).
- `liveTransport` (`src/lib/server/parse/model.ts:199-`) reads `choices[0].message.content` and passes it through `extractJsonText`; `validate.ts` checks the shape; one silent retry on malformed JSON in the route. `usage` tokens feed `estimateCost` using `CURATED_PRICING`.
- Reason: the Parse payload is multimodal and the output schema is large and nested, and the route must work with any per-run override model `[INFERENCE]`.

Recommendation for the report route: add `response_format` json_schema (small schema: `wentWell: string[1-2]`, `evenBetterIf: {topic, target, revisionAction}[2-3]`, plus whatever the feedback ticket fixes), `provider: { require_parameters: true }` (plus `only` for DeepSeek), keep `extractJsonText` + local validation + one silent re-ask as a backstop, and reuse `usage`/`estimateCost`. The schema is tiny, so strict-mode restrictions will not bite. If reasoning is left on, also send `reasoning: { effort: ... }` (see 1.4) so reasoning tokens do not exhaust `max_tokens` and yield empty `content` with `finish_reason: "length"`.

## 4. Timeouts and streaming on the deployment target

- **Deployment target is not pinned.** `vite.config.ts:3,20` imports and uses `@sveltejs/adapter-auto`; no `svelte.config.js` platform config. Hosting is out of scope per `ROADMAP.md:42`.
- **Existing guard:** `OPENROUTER_TIMEOUT_MS = 120_000` (`pdf.ts:28`), applied with `AbortSignal.timeout` (`model.ts:236`); timeout/abort becomes a retryable error. A report call (small input, ≤~2,000 output tokens) should finish in tens of seconds, so reuse or lower to ~60 s `[INFERENCE]`.
- **If it lands on Vercel:** [Vercel function limits](https://vercel.com/docs/functions/limitations) (fetched `…/limitations.md`): Hobby 300 s default and maximum; Pro and Enterprise 300 s default, 800 s maximum (1800 s extended maximum, beta); exceeding the duration returns a 504 (`FUNCTION_INVOCATION_TIMEOUT`). A per-student invocation sits well inside this. The risky design is one invocation looping over all 30 students server-side (at 5-wide ~1–2 minutes of wall clock, plus lose-everything on failure).
- **Self-hosted Node:** no platform ceiling beyond whatever reverse proxy is in front (not checked).
- **Streaming:** not needed. Output ≤~2,000 tokens JSON; the UI only needs per-student completion, which client-side fan-out gives. Streaming also disables Response Healing (non-streaming only, see section 3). Use `stream: false`.
- **Timeout risks:** (1) reasoning tokens inflate latency and can exhaust `max_tokens` (empty `content`, `finish_reason: "length"`, still billed) — cap reasoning via `reasoning.effort` / `reasoning.max_tokens` or set `max_tokens` well above expected reasoning ([Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)); treat `finish_reason: length` as retryable with a higher budget; (2) a slow provider holds a slot up to the timeout: use a 60–120 s abort and let backoff retry hit a different provider (still within the `only` list); (3) a closed tab abandons in-flight calls but the server persists nothing, so cost is only what already completed; the run must be resumable per student.

## Open items this leaves for the spec

- Real token counts and latency were not measured (no live key use); 5,000/900 tokens and 10–20 s per call are estimates. A first build should log `usage` per call and tighten the cap.
- Which model to default the report route to is a quality question for the feedback ticket, not a cost one: the whole span from Haiku 5.5 / GPT-6 Luna ($0.03–$0.04 per class) to Gemini 3.5 Flash-Lite ($0.11–$0.19) is a few cents. Quality was not evaluated here.
- Whether to refresh `OPENROUTER_MODEL`, `DEFAULT_MODEL_ID`, `CURATED_MODELS` and `CURATED_PRICING` to the current set is a separate change (issue #17's single-source rule means edit `CURATED_PRICING`/`CURATED_MODELS` together).
- If DeepSeek is chosen, the allowlist must be maintained by hand; a data-residency requirement (UK/EU-only, say) needs provider-level confirmation beyond OpenRouter's `datacenters` field, which is mostly empty. OpenRouter's in-region routing (`eu.openrouter.ai`) exists but is Business/Enterprise only per Provider routing docs.
- Hosting is undecided, so Netlify/Cloudflare timeout figures were not researched.

## Not found / unverifiable

- **"Claude Haiku 5.5":** found, ID `anthropic/claude-haiku-5.5` (so nothing missing). Not found: any Haiku newer than 5.5 on OpenRouter or the Anthropic models overview.
- **"Luna":** user's name resolves to OpenAI **GPT-6 Luna** (`openai/gpt-6-luna`). Not found: a Luna newer than GPT-6 (no `gpt-6.1-luna` on OpenRouter; the OpenAI models page lists Astra, 6.1 Sol and 6 Luna) — [INFERENCE] that 6 Luna is therefore the newest lightweight OpenAI model as of the fetch date. Also exists: `openai/gpt-6-luna-pro` (pro reasoning mode, excluded), `openai/gpt-5.6-luna` (previous generation).
- **Gemini 3.8 Flash-Lite (text):** not found on OpenRouter (`/api/v1/models`) or on Google's models page (only a "3.8 Flash-Lite TTS" model). The newest Flash-Lite is 3.5 Flash-Lite.
- **DeepSeek "Flash" on a China-excluded route:** found (`deepseek/deepseek-v4.1-flash`), but the **hosting region of the data centre is not stated** for most providers; only OpenRouter's company-level `headquarters`/`datacenters` fields were read. Not verified: any provider's own docs or data-processing terms; whether Relace, Makora and PrimeIntellect (HQ not stated) are non-Chinese; SiliconFlow's actual processing location (SG HQ, US DC listed).
- **Actual per-call quality / latency / real token usage:** not measured.
- **OpenAI pricing page** (`https://openai.com/api/pricing/`) returned 403 to `curl`; OpenAI prices come from `https://platform.openai.com/docs/models` instead.
- **Whether OpenRouter will mirror Google's 2027-01-01 Gemini 3.8 Flash price increase:** unknown.
