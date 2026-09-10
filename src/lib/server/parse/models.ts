// Compatible-model catalogue for the Phase 1 Parse model override dropdown.
//
// The drop-down offers a small actively curated set (five cheap modern
// models, all passing the `supportsNativePdf()` regex gate in `pdf.ts`)
// plus a `Custom…` free-text escape hatch. Pricing overlays live from
// `GET https://openrouter.ai/api/v1/models` (public, no key) when reachable
// — `source: 'live'` means prices are fresh, `'fallback'` means the static
// prices below — but the set itself is static: delisted models stay listed
// rather than vanishing from the UI.

/** Slim model entry served to the drop-down (pricing per 1M tokens, USD). */
export interface CompatibleModel {
	id: string;
	name: string;
	promptPrice: number;
	completionPrice: number;
}

/** Public OpenRouter catalogue (no auth required, pricing only). */
export const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** Server cache TTL so pricing survives OpenRouter blips (~1h). */
export const MODELS_CACHE_TTL_MS = 3_600_000;

/**
 * The curated set, in display order: default anchor first, then cheap →
 * capable. Every entry passes the `supportsNativePdf()` regex gate.
 */
export const CURATED_MODELS: CompatibleModel[] = [
	{
		id: 'google/gemini-2.5-flash',
		name: 'Gemini 2.5 Flash',
		promptPrice: 0.3,
		completionPrice: 2.5
	},
	{
		id: 'google/gemini-2.5-flash-lite',
		name: 'Gemini 2.5 Flash Lite',
		promptPrice: 0.1,
		completionPrice: 0.4
	},
	{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', promptPrice: 0.15, completionPrice: 0.6 },
	{ id: 'openai/gpt-5-mini', name: 'GPT-5 mini', promptPrice: 0.25, completionPrice: 2 },
	{
		id: 'anthropic/claude-haiku-4.5',
		name: 'Claude Haiku 4.5',
		promptPrice: 1,
		completionPrice: 5
	}
];

/** Curated display order (mirrors `CURATED_MODELS`). */
export const CURATED_FIRST: string[] = CURATED_MODELS.map((m) => m.id);

/** Provider routing variants (`:batch`, `:free`, …) are never price-matched. */
const VARIANT_SUFFIX = /:/;

interface CatalogueEntry {
	id?: unknown;
	name?: unknown;
	architecture?: { input_modalities?: unknown };
	pricing?: { prompt?: unknown; completion?: unknown };
}

function toNumber(value: unknown): number {
	const parsed = typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Filter a raw OpenRouter `/models` payload down to file-capable models.
 * Pure function over unknown input so it is unit-testable without network.
 * Only used to build the live price map — the served set is `CURATED_MODELS`.
 */
export function filterCompatibleModels(data: unknown): CompatibleModel[] {
	const entries =
		data !== null && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
			? ((data as { data: unknown }).data as CatalogueEntry[])
			: [];
	const out: CompatibleModel[] = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		const id = entry.id;
		if (typeof id !== 'string' || id.trim() === '' || VARIANT_SUFFIX.test(id)) continue;
		const modalities = entry.architecture?.input_modalities;
		if (!Array.isArray(modalities) || !modalities.includes('file')) continue;
		out.push({
			id,
			name: typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : id,
			promptPrice: toNumber(entry.pricing?.prompt),
			completionPrice: toNumber(entry.pricing?.completion)
		});
	}
	return out;
}

/** Curated models first (in `CURATED_FIRST` order), then alphabetical. */
export function orderCompatibleModels(models: CompatibleModel[]): CompatibleModel[] {
	const rank = new Map(CURATED_FIRST.map((id, index) => [id, index]));
	return [...models].sort((a, b) => {
		const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
		const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
		if (ra !== rb) return ra - rb;
		return a.name.localeCompare(b.name);
	});
}

/** Fetch seam for the catalogue (tests inject a mocked fetch). */
export type ModelsFetch = (url: string, init?: RequestInit) => Promise<Response>;

let modelsFetch: ModelsFetch = (url, init) => fetch(url, init);

/** Test seam: replace the catalogue fetch implementation. */
export function setModelsFetch(fn: ModelsFetch): void {
	modelsFetch = fn;
}

/** Restore the default global-fetch implementation. */
export function resetModelsFetch(): void {
	modelsFetch = (url, init) => fetch(url, init);
}

export type ModelsSource = 'live' | 'fallback';

export interface CompatibleModelsResult {
	models: CompatibleModel[];
	source: ModelsSource;
	updatedAt: string;
}

let cache: { result: CompatibleModelsResult; fetchedAt: number } | null = null;

/** Test seam: drop the in-memory catalogue cache. */
export function clearModelsCacheForTests(): void {
	cache = null;
}

/**
 * Static curated set with live-price overlay. Never throws: when OpenRouter
 * is unreachable the static prices are served (`source: 'fallback'`) so the
 * drop-down always offers exactly the five curated models. The 1h cache
 * covers blips without refetching per dropdown open.
 */
export async function getCompatibleModels(now = Date.now()): Promise<CompatibleModelsResult> {
	if (cache && now - cache.fetchedAt < MODELS_CACHE_TTL_MS) return cache.result;
	try {
		const response = await modelsFetch(MODELS_URL, {
			signal: AbortSignal.timeout(15_000),
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) throw new Error(`catalogue status ${response.status}`);
		const prices = new Map(
			filterCompatibleModels((await response.json()) as unknown).map((m) => [m.id, m])
		);
		const models = CURATED_MODELS.map((curated) => {
			const live = prices.get(curated.id);
			return live
				? { ...curated, promptPrice: live.promptPrice, completionPrice: live.completionPrice }
				: curated;
		});
		const result: CompatibleModelsResult = {
			models,
			source: 'live',
			updatedAt: new Date(now).toISOString()
		};
		cache = { result, fetchedAt: now };
		return result;
	} catch {
		return {
			models: [...CURATED_MODELS],
			source: 'fallback',
			updatedAt: new Date(now).toISOString()
		};
	}
}
