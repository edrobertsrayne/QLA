import { describe, expect, it } from 'vitest';
import {
	analyseCommonQuestions,
	analyseTier,
	analyseTopics,
	facilityBand,
	sortCommonQuestions
} from './analysis.js';
import type { BreakdownEntry, MarksheetDocument } from './document.js';
import { confirmed, entry, student, tier } from './fixtures.spec-helpers.js';

/** A one-tier marksheet whose single tier holds the entries a test is about. */
function oneTier(
	entries: BreakdownEntry[],
	overrides: Partial<MarksheetDocument> = {}
): MarksheetDocument {
	return confirmed({
		tiers: [tier({ breakdown: { entries, warnings: [] } })],
		...overrides
	});
}

/** A two-tier marksheet, named apart, with the entries each tier holds. */
function twoTiers(
	tier1Entries: BreakdownEntry[],
	tier2Entries: BreakdownEntry[],
	overrides: Partial<MarksheetDocument> = {}
): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({ tierName: 'Higher', breakdown: { entries: tier1Entries, warnings: [] } }),
			tier({ tierName: 'Foundation', breakdown: { entries: tier2Entries, warnings: [] } })
		],
		...overrides
	});
}

describe('facilityBand', () => {
	it.each([
		[0.3949, 'red'],
		[0.3996, 'amber'],
		[0.4, 'amber'],
		[0.6949, 'amber'],
		[0.6996, 'green'],
		[0.7, 'green']
	] as const)('bands %s as %s, matching the whole percent shown', (facility, band) => {
		expect(facilityBand(facility)).toBe(band);
	});
});

describe('analyseTier', () => {
	function analyse(overrides: Partial<MarksheetDocument> = {}) {
		return analyseTier(confirmed(overrides), 0);
	}

	/** A class of one entry, for tests about a single figure. */
	function oneEntry(marks: number | null, overrides: Partial<MarksheetDocument> = {}) {
		return analyse({
			tiers: [
				tier({ breakdown: { entries: [entry('entry-1', '1', '1', { marks })], warnings: [] } })
			],
			students: [student('student-1', 'Ada', 'Lovelace')],
			...overrides
		});
	}

	it('reads facility as the mean counted mark over the available marks', () => {
		const analysis = analyse({
			tiers: [
				tier({
					breakdown: { entries: [entry('entry-1', '1', '1', { marks: 4 })], warnings: [] }
				})
			],
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
			tiers: [
				tier({
					breakdown: {
						entries: [
							entry('entry-1', '1a', '1', { marks: 10 }),
							entry('entry-2', '1b', '1', { marks: 10 }),
							entry('entry-3', '1c', '1', { marks: 10 }),
							entry('entry-4', '1d', '1', { marks: 10 }),
							entry('entry-5', '1e', '1', { marks: 10 })
						],
						warnings: []
					}
				})
			],
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
		expect(analyseTier(null, 0)).toEqual({
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

	it('reads only the entries and students of the tier asked for', () => {
		const document = twoTiers(
			[entry('higher-entry', '1', '1', { marks: 4 })],
			[entry('foundation-entry', '8', '8', { marks: 2 })],
			{
				students: [
					student('higher-student', 'Hana', 'Higher', false, 0),
					student('foundation-student', 'Flo', 'Foundation', false, 1)
				],
				marks: {
					'higher-student': { 'higher-entry': 4 },
					'foundation-student': { 'foundation-entry': 1 }
				}
			}
		);

		const higher = analyseTier(document, 0);
		const foundation = analyseTier(document, 1);

		expect(higher.entries.map(({ entry }) => entry.id)).toEqual(['higher-entry']);
		expect(higher.entries[0]).toMatchObject({ counted: 1, facility: 1 });
		expect(higher.summary.studentsCounted).toBe(1);
		expect(foundation.entries.map(({ entry }) => entry.id)).toEqual(['foundation-entry']);
		expect(foundation.entries[0]).toMatchObject({ counted: 1, facility: 0.5 });
		expect(foundation.summary.studentsCounted).toBe(1);
	});

	it('leaves absent students out of every figure, and counts them again when the flag is cleared', () => {
		const document = oneTier([entry('entry-1', '1', '1', { marks: 4 })], {
			students: [
				student('student-1', 'Ada', 'Lovelace'),
				{ ...student('student-2', 'Grace', 'Hopper'), absent: true }
			],
			marks: { 'student-1': { 'entry-1': 4 }, 'student-2': { 'entry-1': 0 } }
		});
		let analysis = analyseTier(document, 0);

		expect(analysis.entries[0]).toMatchObject({
			counted: 1,
			facility: 1,
			coverage: { marked: 1, of: 1, partMarked: false }
		});
		expect(analysis.summary).toMatchObject({ studentsCounted: 1, absentExcluded: 1 });

		document.students[1].absent = false;
		analysis = analyseTier(document, 0);

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
		const document = oneTier([entry('entry-1', '1', '1', { marks: 4 })], {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 2 }, 'student-2': { 'entry-1': 40 } }
		});
		let analysis = analyseTier(document, 0);

		expect(analysis.entries[0]).toMatchObject({
			counted: 1,
			mean: 2,
			facility: 0.5,
			overMax: 1,
			coverage: { marked: 2, of: 2, partMarked: false }
		});
		expect(analysis.summary.invalid).toBe(1);

		document.marks['student-2']['entry-1'] = 4;
		analysis = analyseTier(document, 0);

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
			tiers: [
				tier({
					breakdown: {
						entries: [
							entry('entry-1', '1a', '1', { marks: 4 }),
							entry('entry-2', '1b', '1', { marks: null })
						],
						warnings: []
					}
				})
			],
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
			tiers: [
				tier({
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
					}
				})
			],
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
			tiers: [
				tier({
					breakdown: {
						entries: Array.from({ length: 10 }, (_, index) =>
							entry(`entry-${index + 1}`, `1${index}`, '1', { marks: 100 })
						),
						warnings: []
					}
				})
			],
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
			tiers: [
				tier({
					breakdown: {
						entries: [
							entry('entry-2a', '2a', '2', { marks: 4 }),
							entry('entry-2b', '2b', '2', { marks: 4 })
						],
						warnings: []
					}
				})
			],
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: { 'student-1': { 'entry-2a': 4, 'entry-2b': 0 } }
		});

		expect(analysis.entries.map(({ facility }) => facility)).toEqual([1, 0]);
		expect(analysis.entries.map(({ band }) => band)).toEqual(['green', 'red']);
	});
});

describe('analyseCommonQuestions', () => {
	/**
	 * Three pairs stored out of paper order, with a different gap on each: the
	 * first pair favours Tier 2, the second favours Tier 1, and the third has no
	 * Tier 2 mark at all.
	 */
	function commonDocument(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
		return twoTiers(
			[
				entry('e1a', '1a', '1', { marks: 4 }),
				entry('e1b', '1b', '1', { marks: 4 }),
				entry('e1c', '1c', '1', { marks: 4 })
			],
			[
				entry('e2a', '8a', '8', { marks: 4 }),
				entry('e2b', '8b', '8', { marks: 4 }),
				entry('e2c', '8c', '8', { marks: 4 })
			],
			{
				commonQuestions: [
					{ tier1EntryId: 'e1b', tier2EntryId: 'e2b' },
					{ tier1EntryId: 'e1a', tier2EntryId: 'e2a' },
					{ tier1EntryId: 'e1c', tier2EntryId: 'e2c' }
				],
				students: [
					student('h1', 'Hana', 'Higher', false, 0),
					student('f1', 'Flo', 'Foundation', false, 1)
				],
				marks: {
					h1: { e1a: 0, e1b: 2, e1c: 4 },
					f1: { e2a: 4, e2b: 0 }
				},
				...overrides
			}
		);
	}

	it('pools both tiers’ marks over both tiers’ counted students', () => {
		const document = twoTiers(
			[entry('e1', '1', '1', { marks: 4 })],
			[entry('e2', '8', '8', { marks: 4 })],
			{
				commonQuestions: [{ tier1EntryId: 'e1', tier2EntryId: 'e2' }],
				students: [
					student('h1', 'A', 'Higher', false, 0),
					student('h2', 'B', 'Higher', false, 0),
					student('f1', 'C', 'Foundation', false, 1),
					student('f2', 'D', 'Foundation', false, 1)
				],
				marks: { h1: { e1: 4 }, h2: { e1: 2 }, f1: { e2: 0 }, f2: { e2: 2 } }
			}
		);

		const [row] = analyseCommonQuestions(document);

		expect(row.tier1.analysis.facility).toBe(0.75);
		expect(row.tier2.analysis.facility).toBe(0.25);
		expect(row.pooled).toEqual({
			facility: 0.5,
			band: 'amber',
			marked: 4,
			of: 4,
			partMarked: false
		});
		expect(row.gap).toBe(50);
	});

	it('leaves the pooled figure and gap blank until both tiers have a counted mark', () => {
		const document = commonDocument();
		let rows = analyseCommonQuestions(document);
		const last = rows[2];

		expect(last.tier1.analysis.facility).toBe(1);
		expect(last.tier2.analysis.facility).toBeNull();
		expect(last.pooled.facility).toBeNull();
		expect(last.pooled.band).toBeNull();
		expect(last.gap).toBeNull();
		expect(last.pooled.marked).toBe(1);
		expect(last.pooled.of).toBe(2);

		document.marks['f1']['e2c'] = 2;
		rows = analyseCommonQuestions(document);

		expect(rows[2].tier2.analysis.facility).toBe(0.5);
		expect(rows[2].pooled.facility).toBe(0.75);
		expect(rows[2].gap).toBe(50);
	});

	it('leaves the pooled figure blank when the two entries offer different available marks', () => {
		const document = twoTiers(
			[entry('e1', '1', '1', { marks: 4 })],
			[entry('e2', '8', '8', { marks: 8 })],
			{
				commonQuestions: [{ tier1EntryId: 'e1', tier2EntryId: 'e2' }],
				students: [
					student('h1', 'A', 'Higher', false, 0),
					student('f1', 'B', 'Foundation', false, 1)
				],
				marks: { h1: { e1: 2 }, f1: { e2: 4 } }
			}
		);

		const [row] = analyseCommonQuestions(document);

		// Both tiers scored half their paper, but out of 4 and 8: pooling them
		// would compare two different questions.
		expect(row.tier1.analysis.facility).toBe(0.5);
		expect(row.tier2.analysis.facility).toBe(0.5);
		expect(row.pooled.facility).toBeNull();
		expect(row.pooled.band).toBeNull();
		// The gap still compares each tier's own facility.
		expect(row.gap).toBe(0);
	});

	it('shows the gap signed, Tier 1 minus Tier 2, in whole percentage points', () => {
		const rows = analyseCommonQuestions(commonDocument());

		// Tier 1 scored nothing on the first pair; Tier 2 scored everything.
		expect(rows[0].gap).toBe(-100);
		expect(rows[1].gap).toBe(50);
	});

	it('orders its rows by Tier 1’s paper order, whatever order the pairs are stored in', () => {
		const rows = analyseCommonQuestions(commonDocument());

		expect(rows.map((row) => row.tier1.entry.id)).toEqual(['e1a', 'e1b', 'e1c']);
	});

	it('leaves out a pair whose entry is missing from its tier', () => {
		const document = commonDocument({
			commonQuestions: [
				{ tier1EntryId: 'e1a', tier2EntryId: 'e2a' },
				{ tier1EntryId: 'e1b', tier2EntryId: 'gone' }
			]
		});

		expect(analyseCommonQuestions(document).map((row) => row.pair.tier1EntryId)).toEqual(['e1a']);
	});

	it('excludes absent students and over-max marks from the pooled figure as it does per tier', () => {
		const document = twoTiers(
			[entry('e1', '1', '1', { marks: 4 })],
			[entry('e2', '8', '8', { marks: 4 })],
			{
				commonQuestions: [{ tier1EntryId: 'e1', tier2EntryId: 'e2' }],
				students: [
					student('h1', 'A', 'Higher', false, 0),
					student('h2', 'B', 'Higher', false, 0),
					{ ...student('h3', 'C', 'Higher', true, 0) },
					student('f1', 'D', 'Foundation', false, 1)
				],
				marks: { h1: { e1: 5 }, h2: { e1: 2 }, h3: { e1: 4 }, f1: { e2: 2 } }
			}
		);

		const [row] = analyseCommonQuestions(document);

		// h1's 5 is above the entry's 4: it is marked but not counted; h3 is absent.
		expect(row.tier1.analysis).toMatchObject({
			counted: 1,
			mean: 2,
			overMax: 1,
			coverage: { marked: 2, of: 2 }
		});
		expect(row.pooled).toEqual({
			facility: 0.5,
			band: 'amber',
			marked: 3,
			of: 3,
			partMarked: false
		});
	});

	it('marks the pooled figure as resting on part of the class', () => {
		const document = twoTiers(
			[entry('e1', '1', '1', { marks: 4 })],
			[entry('e2', '8', '8', { marks: 4 })],
			{
				commonQuestions: [{ tier1EntryId: 'e1', tier2EntryId: 'e2' }],
				students: [
					student('h1', 'A', 'Higher', false, 0),
					student('h2', 'B', 'Higher', false, 0),
					student('f1', 'C', 'Foundation', false, 1)
				],
				marks: { h1: { e1: 4 }, f1: { e2: 2 } }
			}
		);

		const [row] = analyseCommonQuestions(document);

		expect(row.pooled).toMatchObject({ facility: 0.75, marked: 2, of: 3, partMarked: true });
	});
});

describe('sortCommonQuestions', () => {
	function rows() {
		return analyseCommonQuestions(
			twoTiers(
				[
					entry('e1a', '1a', '1', { marks: 5 }),
					entry('e1b', '1b', '1', { marks: 5 }),
					entry('e1c', '1c', '1', { marks: 5 }),
					entry('e1d', '1d', '1', { marks: 5 })
				],
				[
					entry('e2a', '8a', '8', { marks: 5 }),
					entry('e2b', '8b', '8', { marks: 5 }),
					entry('e2c', '8c', '8', { marks: 5 }),
					entry('e2d', '8d', '8', { marks: 5 })
				],
				{
					commonQuestions: [
						{ tier1EntryId: 'e1b', tier2EntryId: 'e2b' },
						{ tier1EntryId: 'e1a', tier2EntryId: 'e2a' },
						{ tier1EntryId: 'e1c', tier2EntryId: 'e2c' },
						{ tier1EntryId: 'e1d', tier2EntryId: 'e2d' }
					],
					students: [
						student('h1', 'Hana', 'Higher', false, 0),
						student('f1', 'Flo', 'Foundation', false, 1)
					],
					marks: {
						h1: { e1a: 2, e1b: 0, e1c: 3, e1d: 2 },
						f1: { e2a: 0, e2b: 5, e2c: 0 }
					}
				}
			)
		);
	}

	it('puts the biggest absolute gap first and the pairs with no gap last', () => {
		const sorted = sortCommonQuestions(rows(), 'gap');

		// Paper order is e1a (+40), e1b (−100), e1c (+60): absolute order is not
		// paper order, and the pair with no Tier 2 mark goes last.
		expect(sorted.map((row) => row.tier1.entry.id)).toEqual(['e1b', 'e1c', 'e1a', 'e1d']);
		expect(sorted.map((row) => row.gap)).toEqual([-100, 60, 40, null]);
	});

	it('keeps paper order between pairs with the same absolute gap', () => {
		const document = twoTiers(
			[entry('e1a', '1a', '1', { marks: 4 }), entry('e1b', '1b', '1', { marks: 4 })],
			[entry('e2a', '8a', '8', { marks: 4 }), entry('e2b', '8b', '8', { marks: 4 })],
			{
				commonQuestions: [
					{ tier1EntryId: 'e1b', tier2EntryId: 'e2b' },
					{ tier1EntryId: 'e1a', tier2EntryId: 'e2a' }
				],
				students: [
					student('h1', 'Hana', 'Higher', false, 0),
					student('f1', 'Flo', 'Foundation', false, 1)
				],
				marks: {
					h1: { e1a: 2, e1b: 0 },
					f1: { e2a: 0, e2b: 2 }
				}
			}
		);

		// e1a is +50 and e1b is −50: the same size of gap, so paper order decides.
		const sorted = sortCommonQuestions(analyseCommonQuestions(document), 'gap');

		expect(sorted.map((row) => row.gap)).toEqual([50, -50]);
		expect(sorted.map((row) => row.tier1.entry.id)).toEqual(['e1a', 'e1b']);
	});

	it('puts the lowest pooled facility first and the unscored pairs last', () => {
		const sorted = sortCommonQuestions(rows(), 'pooled');

		// e1a pools 20%, e1c 30%, e1b 50%, and e1d has no pooled figure.
		expect(sorted.map((row) => row.tier1.entry.id)).toEqual(['e1a', 'e1c', 'e1b', 'e1d']);
		expect(sorted.map((row) => row.pooled.facility)).toEqual([0.2, 0.3, 0.5, null]);
	});

	it('keeps Tier 1’s paper order', () => {
		expect(sortCommonQuestions(rows(), 'paper').map((row) => row.tier1.entry.id)).toEqual([
			'e1a',
			'e1b',
			'e1c',
			'e1d'
		]);
	});

	it('sorts a copy, leaving the rows it was given alone', () => {
		const input = rows();
		const sorted = sortCommonQuestions(input, 'pooled');

		expect(sorted).not.toBe(input);
		expect(input.map((row) => row.tier1.entry.id)).toEqual(['e1a', 'e1b', 'e1c', 'e1d']);
	});
});

describe('analyseTopics', () => {
	it('pools the marks of every entry carrying a specification point, weakest first', () => {
		const document = oneTier(
			[
				entry('entry-1', '1a', '1', { marks: 4, specPoint: '3.2.1.4', ao: 'AO2' }),
				entry('entry-2', '1b', '1', { marks: 2, specPoint: '3.2.1.4', ao: 'AO1' }),
				entry('entry-3', '1c', '1', { marks: 5, specPoint: '4.1', ao: 'AO1' })
			],
			{
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: {
					'student-1': { 'entry-1': 2, 'entry-2': 1, 'entry-3': 4 }
				},
				topicNames: { '3.2.1.4': 'Rates of reaction' }
			}
		);

		const topics = analyseTopics(document, 0);
		const rates = topics.find((row) => row.code === '3.2.1.4');
		const unnamed = topics.find((row) => row.code === '4.1');

		expect(rates).toMatchObject({
			kind: 'specification',
			name: 'Rates of reaction',
			description: null,
			gained: 3,
			available: 6,
			facility: 0.5,
			band: 'amber',
			partMarked: false
		});
		expect(rates?.entries.map((row) => row.entry.id)).toEqual(['entry-1', 'entry-2']);
		// An unnamed code reads as itself rather than disappearing.
		expect(unnamed?.name).toBe('4.1');
		expect(unnamed?.facility).toBe(0.8);
		// Weakest first: 3.2.1.4 and AO2 at 50%, then AO1 at 5/7, then 4.1 at 80%.
		expect(topics.map((row) => row.code)).toEqual(['3.2.1.4', 'AO2', 'AO1', '4.1']);
	});

	it('adds a row per assessment objective, with the description the specification gave', () => {
		const document = oneTier(
			[
				entry('entry-1', '1a', '1', { marks: 2, specPoint: null, ao: 'AO1' }),
				entry('entry-2', '1b', '1', { marks: 2, specPoint: null, ao: 'AO1' })
			],
			{
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 1, 'entry-2': 0 } },
				aoDescriptions: { AO1: 'Demonstrate knowledge' }
			}
		);

		const [row] = analyseTopics(document, 0);

		expect(row).toMatchObject({
			kind: 'ao',
			code: 'AO1',
			name: 'AO1',
			description: 'Demonstrate knowledge',
			gained: 1,
			available: 4,
			facility: 0.25,
			band: 'red'
		});
		expect(row.entries.map((analysed) => analysed.facility)).toEqual([0.5, 0]);
	});

	it('counts an entry with several codes in full toward each, and one with none only in its AO row', () => {
		const document = oneTier(
			[
				entry('entry-1', '1a', '1', { marks: 4, specPoint: '3.2.1.4, 4.1', ao: null }),
				entry('entry-2', '1b', '1', { marks: 2, specPoint: '4.1', ao: null }),
				entry('entry-3', '1c', '1', { marks: 5, specPoint: null, ao: 'AO3' })
			],
			{
				students: [student('student-1', 'Ada', 'Lovelace')],
				marks: { 'student-1': { 'entry-1': 3, 'entry-2': 1, 'entry-3': 2 } }
			}
		);

		const topics = analyseTopics(document, 0);
		const byCode = (code: string) => topics.find((row) => row.code === code);

		expect(byCode('3.2.1.4')).toMatchObject({ gained: 3, available: 4, facility: 0.75 });
		expect(byCode('4.1')).toMatchObject({ gained: 4, available: 6 });
		// The expansion lists exactly the entries carrying the code, in paper order.
		expect(byCode('4.1')?.entries.map((row) => row.entry.id)).toEqual(['entry-1', 'entry-2']);
		expect(byCode('3.2.1.4')?.entries.map((row) => row.entry.id)).toEqual(['entry-1']);
		expect(byCode('AO3')?.entries.map((row) => row.entry.id)).toEqual(['entry-3']);
		expect(topics.filter((row) => row.kind === 'specification')).toHaveLength(2);
	});

	it('leaves a topic with nothing counted unscored, after every scored row', () => {
		const document = oneTier(
			[
				entry('entry-1', '1a', '1', { marks: 4, specPoint: '3.2.1.4', ao: null }),
				entry('entry-2', '1b', '1', { marks: 4, specPoint: '4.1', ao: null })
			],
			{
				students: [
					student('student-1', 'Ada', 'Lovelace'),
					student('student-2', 'Absent', 'Al', true)
				],
				// The absent student's mark and an over-max mark are never counted.
				marks: { 'student-1': { 'entry-1': 9, 'entry-2': 4 }, 'student-2': { 'entry-1': 2 } }
			}
		);

		const topics = analyseTopics(document, 0);

		expect(topics.map((row) => row.code)).toEqual(['4.1', '3.2.1.4']);
		expect(topics[1]).toMatchObject({ facility: null, band: null, gained: 0, available: 0 });
	});

	it('marks a topic part-marked when any entry carrying it is', () => {
		const document = oneTier([entry('entry-1', '1a', '1', { marks: 4, specPoint: '3.2.1.4' })], {
			students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
			marks: { 'student-1': { 'entry-1': 3 } }
		});

		expect(analyseTopics(document, 0)[0]).toMatchObject({
			facility: 0.75,
			band: 'green',
			partMarked: true
		});
	});

	it('has nothing before a marksheet exists', () => {
		expect(analyseTopics(null, 0)).toEqual([]);
	});
});
