// Compatible-model catalogue for the Phase 1 Parse model override dropdown.
//
// The drop-down offers a small actively curated set (four current models
// with native PDF input, all passing the `supportsNativePdf()` regex gate in `pdf.ts`)
// plus a `Custom…` free-text escape hatch. No pricing is shown — the list
// is static id + name only, so there is no live catalogue fetch, no cache
// and no fallback path.

/** Slim model entry served to the drop-down. */
export interface CompatibleModel {
	id: string;
	name: string;
}

/**
 * The curated set, in display order: default anchor first, then cheap →
 * capable. Every entry passes the `supportsNativePdf()` regex gate.
 */
export const CURATED_MODELS = [
	{ id: 'openai/gpt-6-luna', name: 'GPT-6 Luna' },
	{ id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5' },
	{ id: 'google/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
	{ id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' }
] as const satisfies readonly CompatibleModel[];

/** The ids of the curated set. */
export type CuratedModelId = (typeof CURATED_MODELS)[number]['id'];

/** Whether `id` is one of the curated models (as opposed to a custom override). */
export function isCuratedModelId(id: string): id is CuratedModelId {
	return Object.hasOwn(CURATED_PRICING, id);
}

/**
 * Canonical per-1M-token USD prices for the curated set — the single source
 * of truth for `estimateCost` (issue #17: this used to disagree with a
 * second, independent heuristic table in `model.ts`, understating the
 * displayed run cost by 4-8x for the default model). Not surfaced in the
 * drop-down itself, which only shows id + name, but keyed by the same ids
 * as `CURATED_MODELS` so the two can never drift apart for a shared model.
 */
export const CURATED_PRICING: Record<
	CuratedModelId,
	{ promptPrice: number; completionPrice: number }
> = {
	'openai/gpt-6-luna': { promptPrice: 0.1, completionPrice: 0.5 },
	'anthropic/claude-haiku-5.5': { promptPrice: 0.1, completionPrice: 0.5 },
	'google/gemini-3.1-flash-lite': { promptPrice: 0.25, completionPrice: 1.5 },
	'google/gemini-3.8-flash': { promptPrice: 0.825, completionPrice: 4.12 }
};

export interface CompatibleModelsResult {
	models: CompatibleModel[];
	updatedAt: string;
}

/** Static curated set — no network, never throws. */
export function getCompatibleModels(now = Date.now()): CompatibleModelsResult {
	return {
		models: [...CURATED_MODELS],
		updatedAt: new Date(now).toISOString()
	};
}
