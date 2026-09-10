// Compatible-model catalogue for the Phase 1 Parse model override dropdown.
//
// The drop-down offers a small actively curated set (five cheap modern
// models, all passing the `supportsNativePdf()` regex gate in `pdf.ts`)
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
export const CURATED_MODELS: CompatibleModel[] = [
	{ id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
	{ id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
	{ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' },
	{ id: 'openai/gpt-5-mini', name: 'GPT-5 mini' },
	{ id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' }
];

/**
 * Canonical per-1M-token USD prices for the curated set — the single source
 * of truth for `estimateCost` (issue #17: this used to disagree with a
 * second, independent heuristic table in `model.ts`, understating the
 * displayed run cost by 4-8x for the default model). Not surfaced in the
 * drop-down itself, which only shows id + name, but keyed by the same ids
 * as `CURATED_MODELS` so the two can never drift apart for a shared model.
 */
export const CURATED_PRICING: Record<string, { promptPrice: number; completionPrice: number }> = {
	'google/gemini-2.5-flash': { promptPrice: 0.3, completionPrice: 2.5 },
	'google/gemini-2.5-flash-lite': { promptPrice: 0.1, completionPrice: 0.4 },
	'openai/gpt-4o-mini': { promptPrice: 0.15, completionPrice: 0.6 },
	'openai/gpt-5-mini': { promptPrice: 0.25, completionPrice: 2 },
	'anthropic/claude-haiku-4.5': { promptPrice: 1, completionPrice: 5 }
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
