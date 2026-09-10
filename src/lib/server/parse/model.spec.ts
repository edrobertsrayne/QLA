// Unit tests for `estimateCost` (issue #17: the run-cost hint used to come
// from a second, independent price table that disagreed with the curated
// catalogue — understating the default model's cost by 4-8x). `estimateCost`
// must now derive curated-model prices from `CURATED_PRICING`, the same
// table the model picker's catalogue entry comes from.

import { describe, expect, it } from 'vitest';
import { estimateCost } from './model';
import { CURATED_MODELS, CURATED_PRICING } from './models';

describe('CURATED_PRICING', () => {
	it('has an entry for every curated model id', () => {
		for (const model of CURATED_MODELS) {
			expect(CURATED_PRICING[model.id]).toBeDefined();
		}
	});
});

describe('estimateCost', () => {
	it('prices the default model from CURATED_PRICING, not a separate guess', () => {
		const { promptPrice, completionPrice } = CURATED_PRICING['google/gemini-2.5-flash'];
		const cost = estimateCost(1_000_000, 1_000_000, 'google/gemini-2.5-flash');
		expect(cost).toBeCloseTo(promptPrice + completionPrice, 10);
		// Regression: the old heuristic table priced Gemini Flash at
		// input 0.075 / output 0.3 — 4x/8x below the curated 0.3 / 2.5 figures.
		expect(cost).toBeCloseTo(2.8, 10);
	});

	it('agrees with the curated catalogue for every curated model', () => {
		for (const model of CURATED_MODELS) {
			const { promptPrice, completionPrice } = CURATED_PRICING[model.id];
			const cost = estimateCost(1_000_000, 1_000_000, model.id);
			expect(cost).toBeCloseTo(promptPrice + completionPrice, 10);
		}
	});

	it('falls back to one documented generic rate for a custom model id', () => {
		const cost = estimateCost(1_000_000, 1_000_000, 'some/unlisted-custom-model');
		expect(cost).toBeCloseTo(0.3 + 1.2, 10);
	});

	it('scales linearly with token counts', () => {
		expect(estimateCost(0, 0, 'google/gemini-2.5-flash')).toBe(0);
		expect(estimateCost(2_000_000, 0, 'google/gemini-2.5-flash')).toBeCloseTo(0.6, 10);
	});
});
