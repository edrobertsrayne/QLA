import { describe, expect, it } from 'vitest';
import { isBreakdown } from './is-breakdown.js';

const BASE = { tierName: null, questions: [], aoDescriptions: [] };

describe('isBreakdown', () => {
	it.each([
		['a null tier name', BASE, true],
		['a string tier name', { ...BASE, tierName: 'Higher' }, true],
		['a missing tier name', { questions: [], aoDescriptions: [] }, false],
		['a numeric tier name', { ...BASE, tierName: 2 }, false],
		['missing questions', { tierName: null, aoDescriptions: [] }, false],
		['missing AO descriptions', { tierName: null, questions: [] }, false]
	])('answers %s as %s', (_name, value, expected) => {
		expect(isBreakdown(value)).toBe(expected);
	});
});
