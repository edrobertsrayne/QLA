import { describe, expect, it } from 'vitest';
import type { MarksheetDocument } from './document.js';
import { confirmed, entry, student, tier } from './fixtures.spec-helpers.js';
import {
	boundariesOf,
	clearBoundaries,
	formatPercent,
	marksToPercent,
	paperGrade,
	parsePercent,
	percentIssues,
	percentToMarks,
	setBoundaries,
	studentGrade,
	workingCopyOf
} from './grades.js';

describe('percentToMarks', () => {
	it('rounds up so the student must reach the percentage', () => {
		expect(percentToMarks(65, 83)).toBe(54);
	});
	it('keeps a percentage that lands exactly on a mark', () => {
		expect(percentToMarks(50, 80)).toBe(40);
		expect(percentToMarks(52.5, 80)).toBe(42);
	});
	it('maps the bounds to 0 and the paper total', () => {
		expect(percentToMarks(0, 83)).toBe(0);
		expect(percentToMarks(100, 83)).toBe(83);
	});
	it('round-trips every raw mark through its exact percentage', () => {
		for (const total of [1, 7, 40, 83, 100, 117]) {
			for (let marks = 0; marks <= total; marks++) {
				expect(percentToMarks(marksToPercent(marks, total), total)).toBe(marks);
			}
		}
	});
});

describe('percent entry', () => {
	it('shows a percentage rounded down to one decimal place', () => {
		expect(formatPercent(marksToPercent(54, 83))).toBe('65');
		expect(formatPercent(marksToPercent(40, 80))).toBe('50');
	});
	it('converts every shown percentage back to the same raw mark', () => {
		for (let total = 1; total <= 200; total++) {
			for (let marks = 0; marks <= total; marks++) {
				const shown = Number(formatPercent(marksToPercent(marks, total)));
				expect(percentToMarks(shown, total), `${marks}/${total}`).toBe(marks);
			}
		}
	});
	it('accepts 0 to 100 with decimals and rejects the rest', () => {
		expect(parsePercent('52.5')).toBe(52.5);
		expect(parsePercent('0')).toBe(0);
		expect(parsePercent('100')).toBe(100);
		for (const bad of ['-1', '101', 'abc', '5%', '.']) expect(parsePercent(bad)).toBeNull();
	});
	it('flags typed percentages that are out of range', () => {
		const rows = [
			{ label: 'A', min: '', percent: '-1' },
			{ label: 'B', min: '', percent: '101' },
			{ label: 'C', min: '', percent: 'abc' },
			{ label: 'D', min: '40', percent: '50' },
			{ label: 'E', min: '', percent: '' },
			{ label: 'F', min: '3' }
		];
		expect(percentIssues(rows).map((issue) => issue.index)).toEqual([0, 1, 2]);
	});
});

/** Two tiers with their own boundaries: the same total earns a different grade on each. */
function twoTier(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({
				tierName: 'Higher',
				boundaries: [
					{ label: '9', minimum: 4 },
					{ label: '8', minimum: 3 }
				],
				belowLowestLabel: 'U'
			}),
			tier({
				tierName: 'Foundation',
				breakdown: { entries: [entry('entry-2', '8a', '8', { marks: 4 })], warnings: [] },
				boundaries: [
					{ label: '5', minimum: 3 },
					{ label: '4', minimum: 2 }
				],
				belowLowestLabel: 'U'
			})
		],
		students: [
			student('h1', 'Hana', 'Higher', false, 0),
			student('f1', 'Flo', 'Foundation', false, 1)
		],
		...overrides
	});
}

describe('boundaries of one tier', () => {
	it('reads each tier’s own boundaries, and none where a tier has none', () => {
		const document = twoTier();

		expect(boundariesOf(document, 0)?.map(({ label }) => label)).toEqual(['9', '8']);
		expect(boundariesOf(document, 1)?.map(({ label }) => label)).toEqual(['5', '4']);
		expect(boundariesOf(confirmed(), 0)).toBeNull();
		expect(boundariesOf(document, 1)?.length).toBe(2);
	});

	it('treats an empty boundary list as no boundaries', () => {
		const document = twoTier({
			tiers: [tier({ boundaries: [] }), tier({ boundaries: null })]
		});

		expect(boundariesOf(document, 0)).toBeNull();
	});

	it('starts the working copy from the tier asked for', () => {
		const document = twoTier();

		expect(workingCopyOf(document, 0)).toMatchObject({
			rows: [
				{ label: '9', min: '4' },
				{ label: '8', min: '3' }
			],
			below: 'U'
		});
		expect(workingCopyOf(document, 1)).toMatchObject({
			rows: [
				{ label: '5', min: '3' },
				{ label: '4', min: '2' }
			],
			below: 'U'
		});
	});

	it('starts an empty working copy with the default below-lowest label', () => {
		expect(workingCopyOf(null, 0)).toEqual({ rows: [], below: 'U', scale: '' });
	});

	it('grades a total on the tier’s own boundaries', () => {
		const document = twoTier();

		expect(paperGrade(document, 0, 3)).toEqual({ label: '8', next: { label: '9', marks: 1 } });
		expect(paperGrade(document, 1, 3)).toEqual({ label: '5', next: null });
		expect(paperGrade(document, 1, 2)).toEqual({ label: '4', next: { label: '5', marks: 1 } });
		expect(paperGrade(confirmed(), 0, 3)).toBeNull();
	});

	it('stores and clears boundaries on one tier without touching the other', () => {
		const document = twoTier();

		setBoundaries(document, 1, [{ label: 'A', minimum: 2 }], '  ');
		expect(boundariesOf(document, 1)).toEqual([{ label: 'A', minimum: 2 }]);
		expect(document.tiers[1].belowLowestLabel).toBe('U');
		expect(boundariesOf(document, 0)).toEqual([
			{ label: '9', minimum: 4 },
			{ label: '8', minimum: 3 }
		]);

		expect(clearBoundaries(document, 1)).toBe(true);
		expect(boundariesOf(document, 1)).toBeNull();
		expect(clearBoundaries(document, 1)).toBe(false);
		expect(boundariesOf(document, 0)).not.toBeNull();
	});
});

describe('studentGrade', () => {
	it('grades a student on their own tier’s entries and boundaries', () => {
		const document = twoTier({
			marks: { h1: { 'entry-1': 4 }, f1: { 'entry-2': 2 } }
		});
		const [higher, foundation] = document.students;

		expect(studentGrade(document, higher)).toEqual({
			kind: 'complete',
			total: 4,
			grade: { label: '9', next: null }
		});
		expect(studentGrade(document, foundation)).toEqual({
			kind: 'complete',
			total: 2,
			grade: { label: '4', next: { label: '5', marks: 1 } }
		});
	});

	it('leaves a student part-marked until every entry on their tier has a mark', () => {
		const document = twoTier();
		const [higher] = document.students;

		expect(studentGrade(document, higher)).toEqual({
			kind: 'partial',
			total: 0,
			grade: { label: 'U', next: { label: '8', marks: 3 } }
		});
	});

	it('checks over-max marks on the student’s own tier only', () => {
		const document = twoTier({
			marks: { h1: { 'entry-1': 4, 'entry-2': 5 } }
		});
		const [higher] = document.students;

		// entry-2 is a Foundation entry: a mark above its available marks there
		// does not spoil the Higher student's grade.
		expect(studentGrade(document, higher)).toEqual({
			kind: 'complete',
			total: 4,
			grade: { label: '9', next: null }
		});
	});

	it('gives no grade to a student with no tier', () => {
		const document = twoTier({
			students: [student('n1', 'Noa', 'Tierless', false, null)],
			marks: { n1: { 'entry-1': 4 } }
		});

		expect(studentGrade(document, document.students[0])).toEqual({ kind: 'no-tier' });
	});

	it('reports an absent student as absent before asking for marks', () => {
		const document = twoTier({
			students: [student('h1', 'Hana', 'Higher', true, 0)]
		});

		expect(studentGrade(document, document.students[0])).toEqual({ kind: 'absent' });
	});
});
