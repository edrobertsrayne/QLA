import { describe, expect, it } from 'vitest';
import { analyseMarksheet } from './analysis.js';
import type { MarksheetDocument } from './document.js';
import { confirmed, entry, student } from './fixtures.spec-helpers.js';

describe('analysis', () => {
	/** A confirmed marksheet: the figures are read off the sheet a confirmation builds. */
	function analyse(overrides: Partial<MarksheetDocument> = {}) {
		return analyseMarksheet(confirmed(overrides));
	}

	/** A class of one entry, for tests about a single figure. */
	function oneEntry(marks: number | null, overrides: Partial<MarksheetDocument> = {}) {
		return analyse({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks })], warnings: [] },
			students: [student('student-1', 'Ada', 'Lovelace')],
			...overrides
		});
	}

	it('reads facility as the mean counted mark over the available marks', () => {
		const analysis = analyse({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks: 4 })], warnings: [] },
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				student('student-2', 'Grace', 'Hopper'),
				student('student-3', 'Cher', '')
			],
			marks: {
				'student-1': { 'entry-1': 3 },
				'student-2': { 'entry-1': 2 },
				'student-3': { 'entry-1': 1 }
			}
		});

		expect(analysis.entries[0]).toMatchObject({
			entry: { id: 'entry-1' },
			counted: 3,
			mean: 2,
			facility: 0.5,
			band: 'amber',
			notScored: null,
			overMax: 0,
			coverage: { marked: 3, of: 3, partMarked: false }
		});
		expect(analysis.summary).toEqual({
			studentsCounted: 3,
			absentExcluded: 0,
			marksCounted: 3,
			partMarked: 0,
			invalid: 0
		});
	});

	it('bands red below 40%, amber from 40% to below 70%, and green from 70%', () => {
		const analysis = analyse({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 10 }),
					entry('entry-2', '1b', '1', { marks: 10 }),
					entry('entry-3', '1c', '1', { marks: 10 }),
					entry('entry-4', '1d', '1', { marks: 10 }),
					entry('entry-5', '1e', '1', { marks: 10 })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': {
					'entry-1': 3,
					'entry-2': 4,
					'entry-3': 6,
					'entry-4': 7,
					'entry-5': 9
				}
			}
		});

		expect(analysis.entries.map(({ facility }) => facility)).toEqual([0.3, 0.4, 0.6, 0.7, 0.9]);
		expect(analysis.entries.map(({ band }) => band)).toEqual([
			'red',
			'amber',
			'amber',
			'green',
			'green'
		]);
	});

	it('has no figures before a marksheet exists', () => {
		expect(analyseMarksheet(null)).toEqual({
			entries: [],
			ordered: [],
			hardest: [],
			summary: {
				studentsCounted: 0,
				absentExcluded: 0,
				marksCounted: 0,
				partMarked: 0,
				invalid: 0
			}
		});
	});

	it('leaves absent students out of every figure, and counts them again when the flag is cleared', () => {
		const document = confirmed({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks: 4 })], warnings: [] },
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				{ ...student('student-2', 'Grace', 'Hopper'), absent: true }
			],
			marks: { 'student-1': { 'entry-1': 4 }, 'student-2': { 'entry-1': 0 } }
		});
		let analysis = analyseMarksheet(document);

		expect(analysis.entries[0]).toMatchObject({
			counted: 1,
			facility: 1,
			coverage: { marked: 1, of: 1, partMarked: false }
		});
		expect(analysis.summary).toMatchObject({ studentsCounted: 1, absentExcluded: 1 });

		document.students[1].absent = false;
		analysis = analyseMarksheet(document);

		expect(analysis.entries[0]).toMatchObject({
			counted: 2,
			mean: 2,
			facility: 0.5,
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(analysis.summary).toMatchObject({ studentsCounted: 2, absentExcluded: 0 });
	});

	it('counts a mark of 0, and leaves a cell nobody has marked out', () => {
		const analysis = oneEntry(4, {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 0 } }
		});

		expect(analysis.entries[0]).toMatchObject({
			counted: 1,
			mean: 0,
			facility: 0,
			band: 'red',
			coverage: { marked: 1, of: 2, partMarked: true }
		});
	});

	it('leaves a mark above the available marks out of the figure rather than capping it, and flags the entry', () => {
		const document = confirmed({
			breakdown: { entries: [entry('entry-1', '1', '1', { marks: 4 })], warnings: [] },
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 2 }, 'student-2': { 'entry-1': 40 } }
		});
		let analysis = analyseMarksheet(document);

		expect(analysis.entries[0]).toMatchObject({
			counted: 1,
			mean: 2,
			facility: 0.5,
			overMax: 1,
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(analysis.summary.invalid).toBe(1);

		document.marks['student-2']['entry-1'] = 4;
		analysis = analyseMarksheet(document);

		expect(analysis.entries[0]).toMatchObject({
			counted: 2,
			mean: 3,
			facility: 0.75,
			band: 'green',
			overMax: 0
		});
		expect(analysis.summary.invalid).toBe(0);
	});

	it('leaves an entry nothing counts on unscored, saying it is marked rather than unmarked', () => {
		const analysis = oneEntry(4, {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 40 }, 'student-2': { 'entry-1': 41 } }
		});

		// Every mark entered is a typo, so there is no figure — but the entry is
		// marked, and the reason has to say so rather than read as untouched.
		expect(analysis.entries[0]).toMatchObject({
			counted: 0,
			mean: null,
			facility: null,
			band: null,
			overMax: 2,
			notScored: 'no-counted-marks',
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(analysis.summary.invalid).toBe(1);
	});

	it('bands an entry resting on part of the class, and says how much of it is marked', () => {
		const analysis = oneEntry(4, {
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				student('student-2', 'Grace', 'Hopper'),
				student('student-3', 'Cher', ''),
				student('student-4', 'Alan', 'Turing')
			],
			marks: { 'student-1': { 'entry-1': 4 }, 'student-2': { 'entry-1': 2 } }
		});

		expect(analysis.entries[0]).toMatchObject({
			facility: 0.75,
			band: 'green',
			coverage: { marked: 2, of: 4, partMarked: true }
		});
		expect(analysis.summary.partMarked).toBe(1);
	});

	it('says why an entry is not scored, apart from one nobody has marked yet', () => {
		const analysis = analyse({
			breakdown: {
				entries: [
					entry('entry-1', '1a', '1', { marks: 4 }),
					entry('entry-2', '1b', '1', { marks: null })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')]
		});

		expect(analysis.entries[0]).toMatchObject({
			facility: null,
			band: null,
			notScored: 'no-counted-marks',
			coverage: { marked: 0, of: 1, partMarked: false }
		});
		expect(analysis.entries[1]).toMatchObject({
			facility: null,
			band: null,
			notScored: 'no-available-marks'
		});
		expect(analysis.summary).toMatchObject({ marksCounted: 0, partMarked: 0 });
	});

	it('orders red, then amber, then green worst first, with the entries it cannot score last', () => {
		const analysis = analyse({
			breakdown: {
				entries: [
					entry('entry-green', '1a', '1', { marks: 10 }),
					entry('entry-unmarked', '1b', '1', { marks: 10 }),
					entry('entry-redder', '1c', '1', { marks: 10 }),
					entry('entry-worst', '1d', '1', { marks: 10 }),
					entry('entry-amber', '1e', '1', { marks: 10 }),
					entry('entry-red', '1f', '1', { marks: 10 })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': {
					'entry-green': 8,
					'entry-redder': 3,
					'entry-worst': 1,
					'entry-amber': 5,
					'entry-red': 2
				}
			}
		});

		expect(analysis.ordered.map(({ entry }) => entry.id)).toEqual([
			'entry-worst',
			'entry-red',
			'entry-redder',
			'entry-amber',
			'entry-green',
			'entry-unmarked'
		]);
	});

	it('names at most eight red entries in the Hardest strip, worst first', () => {
		const analysis = analyse({
			breakdown: {
				entries: Array.from({ length: 10 }, (_, index) =>
					entry(`entry-${index + 1}`, `1${index}`, '1', { marks: 100 })
				),
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': Object.fromEntries(
					Array.from({ length: 10 }, (_, index) => [`entry-${index + 1}`, index + 1])
				)
			}
		});

		expect(analysis.hardest.map(({ entry }) => entry.id)).toEqual([
			'entry-1',
			'entry-2',
			'entry-3',
			'entry-4',
			'entry-5',
			'entry-6',
			'entry-7',
			'entry-8'
		]);
	});

	it('reads each breakdown entry on its own, never pooling a question’s subquestions', () => {
		const analysis = analyse({
			breakdown: {
				entries: [
					entry('entry-2a', '2a', '2', { marks: 4 }),
					entry('entry-2b', '2b', '2', { marks: 4 })
				],
				warnings: []
			},
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-2a': 4, 'entry-2b': 0 } }
		});

		expect(analysis.entries.map(({ facility }) => facility)).toEqual([1, 0]);
		expect(analysis.entries.map(({ band }) => band)).toEqual(['green', 'red']);
	});
});
