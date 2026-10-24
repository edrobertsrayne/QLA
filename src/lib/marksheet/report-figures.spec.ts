import { describe, expect, it } from 'vitest';
import { confirmed, entry, student, tier } from './fixtures.spec-helpers.js';
import { droppedNoMarks, reportFiguresFor } from './report-figures.js';

function documentWith(aoDescriptions: Record<string, string>) {
	return confirmed({
		aoDescriptions,
		tiers: [
			tier({
				breakdown: {
					entries: [
						entry('entry-1', '1a', '1', { marks: 4, ao: 'AO2' }),
						entry('entry-2', '1b', '1', { marks: 2, ao: 'AO3' })
					],
					warnings: []
				}
			})
		],
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

describe('report figures', () => {
	it('claims no marks were dropped only for a paper that offers marks', () => {
		const noTier = confirmed({
			students: [student('no-tier', 'Ada', 'Lovelace', false, null)]
		});

		const figures = reportFiguresFor(noTier, 'no-tier');

		expect(figures).toMatchObject({ total: 0, available: 0, entries: [] });
		expect(droppedNoMarks(figures)).toBe(false);

		// A paper with marks, all gained: the only time the line is true.
		const gainedThem = documentWith({});
		gainedThem.marks['student-1'] = { 'entry-1': 4, 'entry-2': 2 };
		expect(droppedNoMarks(reportFiguresFor(gainedThem, 'student-1'))).toBe(true);
	});

	it('read the student’s own tier’s entries only', () => {
		const document = confirmed({
			tiers: [
				tier({
					tierName: 'Higher',
					breakdown: { entries: [entry('h1', '1a', '1', { marks: 4 })], warnings: [] }
				}),
				tier({
					tierName: 'Foundation',
					breakdown: { entries: [entry('f1', '8a', '8', { marks: 2 })], warnings: [] }
				})
			],
			students: [
				student('higher-student', 'Hana', 'Higher', false, 0),
				student('foundation-student', 'Flo', 'Foundation', false, 1)
			],
			marks: {
				'higher-student': { h1: 3, f1: 2 },
				'foundation-student': { f1: 1 }
			}
		});

		const higher = reportFiguresFor(document, 'higher-student');
		const foundation = reportFiguresFor(document, 'foundation-student');

		expect(higher.entries.map(({ label }) => label)).toEqual(['1a']);
		expect(higher).toMatchObject({ total: 3, available: 4, percent: 75 });
		expect(foundation.entries.map(({ label }) => label)).toEqual(['8a']);
		expect(foundation).toMatchObject({ total: 1, available: 2, percent: 50 });
	});
});
