import { describe, expect, it } from 'vitest';
import { confirmed, entry, student } from './fixtures.spec-helpers.js';
import { reportFiguresFor } from './report-figures.js';

function documentWith(aoDescriptions: Record<string, string>) {
	return confirmed({
		breakdown: {
			entries: [
				entry('entry-1', '1a', '1', { marks: 4, ao: 'AO2' }),
				entry('entry-2', '1b', '1', { marks: 2, ao: 'AO3' })
			],
			warnings: [],
			aoDescriptions
		},
		students: [student('student-1', 'Ada', 'Lovelace')],
		marks: { 'student-1': { 'entry-1': 3, 'entry-2': 1 } }
	});
}

describe('By skill rows', () => {
	it('carry the description of an objective that has one and none for the rest', () => {
		const { aos } = reportFiguresFor(
			documentWith({ AO2: 'Apply knowledge to new situations' }),
			'student-1'
		);

		expect(aos.map(({ name, description }) => ({ name, description }))).toEqual([
			{ name: 'AO2', description: 'Apply knowledge to new situations' },
			{ name: 'AO3', description: null }
		]);
	});
});
