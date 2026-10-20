// Unit tests for `estimateCost` (issue #17: the run-cost hint used to come
// from a second, independent price table that disagreed with the curated
// catalogue — understating the default model's cost by 4-8x). `estimateCost`
// must now derive curated-model prices from `CURATED_PRICING`, the same
// table the model picker's catalogue entry comes from.

import { describe, expect, it } from 'vitest';
import { estimateCost } from './model';
import { CURATED_MODELS, CURATED_PRICING } from './models';
import { DEFAULT_MODEL_ID } from './pdf';

describe('CURATED_PRICING', () => {
	it('has an entry for every curated model id', () => {
		for (const model of CURATED_MODELS) {
			expect(CURATED_PRICING[model.id]).toBeDefined();
		}
	});
});

describe('estimateCost', () => {
	it('prices the default model from CURATED_PRICING, not the generic rate', () => {
		const { promptPrice, completionPrice } = CURATED_PRICING[DEFAULT_MODEL_ID];
		const cost = estimateCost(1_000_000, 1_000_000, DEFAULT_MODEL_ID);
		expect(cost).toBeCloseTo(promptPrice + completionPrice, 10);
		expect(cost).toBeCloseTo(0.6, 10);
		expect(cost).not.toBeCloseTo(0.3 + 1.2, 10);
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
		expect(estimateCost(0, 0, DEFAULT_MODEL_ID)).toBe(0);
		expect(estimateCost(2_000_000, 0, DEFAULT_MODEL_ID)).toBeCloseTo(0.2, 10);
	});
});
