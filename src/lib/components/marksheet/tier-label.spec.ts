import { describe, expect, it } from 'vitest';
import { confirmed, tier } from '$lib/marksheet/fixtures.spec-helpers.js';
import { tierLabel, tierNameLabel, tierNameOf } from './tier-label.js';

describe('tier labels', () => {
	it('treats a blank printed name as none, on either tier', () => {
		const document = confirmed({
			tiers: [tier({ tierName: '  ' }), tier({ tierName: 'Foundation' })]
		});

		expect(tierNameOf(document, 0)).toBeNull();
		expect(tierLabel(document, 0)).toBe('Tier 1');
		expect(tierNameLabel(document, 0)).toBe('Tier 1');
		expect(tierLabel(document, 1)).toBe('Tier 2 · Foundation');
		expect(tierNameLabel(document, 1)).toBe('Foundation');
	});

	it('names a tier by its number when the document has no such tier', () => {
		expect(tierLabel(null, 1)).toBe('Tier 2');
		expect(tierNameLabel(null, 0)).toBe('Tier 1');
	});
});
