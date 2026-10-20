// Unit tests for the compatible-model catalogue (static curated set).
// No network: the list is id + name only with no pricing.

import { describe, expect, it } from 'vitest';
import { CURATED_MODELS, getCompatibleModels } from './models';
import { DEFAULT_MODEL_ID, supportsNativePdf } from './pdf';

describe('curated set', () => {
	it('every curated model passes the parse-time native-PDF gate', () => {
		for (const model of CURATED_MODELS) {
			expect(supportsNativePdf(model.id)).toBe(true);
		}
	});

	it('lists the shared default first, so it is priced and offered', () => {
		expect(CURATED_MODELS[0]?.id).toBe(DEFAULT_MODEL_ID);
		expect(supportsNativePdf(DEFAULT_MODEL_ID)).toBe(true);
	});
});

describe('getCompatibleModels', () => {
	it('serves exactly the curated set', () => {
		const result = getCompatibleModels();
		expect(result.models).toEqual(CURATED_MODELS);
	});
});
