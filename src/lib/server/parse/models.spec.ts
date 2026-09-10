// Unit tests for the compatible-model catalogue (static curated set).
// No network: the list is id + name only with no pricing.

import { describe, expect, it } from 'vitest';
import { CURATED_MODELS, getCompatibleModels } from './models';
import { supportsNativePdf } from './pdf';

describe('curated set', () => {
	it('is five cheap modern models, all passing the parse-time native-PDF gate', () => {
		expect(CURATED_MODELS).toHaveLength(5);
		for (const model of CURATED_MODELS) {
			expect(supportsNativePdf(model.id)).toBe(true);
		}
	});
});

describe('getCompatibleModels', () => {
	it('serves exactly the curated set', () => {
		const result = getCompatibleModels();
		expect(result.models).toEqual(CURATED_MODELS);
		expect(result.models.map((m) => m.id)).toEqual([
			'google/gemini-2.5-flash',
			'google/gemini-2.5-flash-lite',
			'openai/gpt-4o-mini',
			'openai/gpt-5-mini',
			'anthropic/claude-haiku-4.5'
		]);
	});
});
