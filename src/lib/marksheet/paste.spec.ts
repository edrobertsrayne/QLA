import { describe, expect, it } from 'vitest';
import type { MarksheetDocument } from './document.js';
import { confirmed, entry, student, tier } from './fixtures.spec-helpers.js';
import { applyPaste, describePaste, emptyPasteResult } from './paste.js';

/** A one-tier marksheet with two entries and two students: a paste has room to miss both. */
function pasteSheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({
				breakdown: {
					entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
					warnings: []
				}
			})
		],
		students: [
			student('student-1', 'Ada', 'Lovelace', false, 0),
			student('student-2', 'Grace', 'Hopper', false, 0)
		],
		...overrides
	});
}

/** Two tiers: two Higher entries and one Foundation entry, with a Higher student. */
function tieredSheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		tiers: [
			tier({
				tierName: 'Higher',
				breakdown: {
					entries: [entry('h1', '1a', '1'), entry('h2', '1b', '1')],
					warnings: []
				}
			}),
			tier({
				tierName: 'Foundation',
				breakdown: { entries: [entry('f1', '8a', '8')], warnings: [] }
			})
		],
		students: [student('student-1', 'Ada', 'Lovelace', false, 0)],
		...overrides
	});
}

describe('applying a block', () => {
	it('lands a block at the anchor, leaving cells outside it alone', () => {
		const document = pasteSheet({
			marks: { 'student-1': { 'entry-1': 1 }, 'student-2': { 'entry-2': 4 } }
		});

		const result = applyPaste(
			document,
			[
				['2', '3'],
				['', '1']
			],
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' },
			0
		);

		expect(result).toMatchObject({ changed: true, marksStored: 3, marksCleared: 0 });
		expect(document.marks).toEqual({
			'student-1': { 'entry-1': 2, 'entry-2': 3 },
			'student-2': { 'entry-2': 1 }
		});
	});

	it('clears a mark when the pasted cell is empty', () => {
		const document = pasteSheet({ marks: { 'student-1': { 'entry-1': 2 } } });

		const result = applyPaste(
			document,
			[['', '3']],
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' },
			0
		);

		expect(result).toMatchObject({ changed: true, marksStored: 1, marksCleared: 1 });
		expect(document.marks).toEqual({ 'student-1': { 'entry-2': 3 } });
	});

	it('reads a block anchored in the name column as names then marks', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[
				['Lovelace, Ada', '3', '2'],
				['Grace Brewster Hopper', '4', '1']
			],
			{ kind: 'names', studentId: 'student-1' },
			0
		);

		expect(result).toMatchObject({ changed: true, marksStored: 4, studentsAdded: 0 });
		// Names already in the class are not rewritten by a positional paste; the
		// marks land on the students the rows line up with.
		expect(document.students).toEqual([
			student('student-1', 'Ada', 'Lovelace'),
			student('student-2', 'Grace', 'Hopper')
		]);
		expect(document.marks).toEqual({
			'student-1': { 'entry-1': 3, 'entry-2': 2 },
			'student-2': { 'entry-1': 4, 'entry-2': 1 }
		});
	});

	it('turns pasted rows past the class into students on the tier being pasted', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[
				['Lovelace, Ada', '3', '2'],
				['Hopper, Grace', '4', '1'],
				['Cher', '0', '0'],
				['Alan Turing', '1', '2']
			],
			{ kind: 'names', studentId: 'student-1' },
			0
		);

		expect(result).toMatchObject({ changed: true, marksStored: 8, studentsAdded: 2 });
		expect(document.students.map(({ id, firstName, surname }) => [id, firstName, surname])).toEqual(
			[
				['student-1', 'Ada', 'Lovelace'],
				['student-2', 'Grace', 'Hopper'],
				[expect.any(String), 'Cher', ''],
				[expect.any(String), 'Alan', 'Turing']
			]
		);
		expect(document.students.slice(2).every((added) => added.tier === 0)).toBe(true);
		expect(document.marks).toMatchObject({
			'student-1': { 'entry-1': 3, 'entry-2': 2 },
			'student-2': { 'entry-1': 4, 'entry-2': 1 }
		});
	});

	// A cell with nothing readable as a name makes no student, whether it is
	// blank or only punctuation, and the marks beside it are not filed.
	it.each(['', ','])('does not make a student of a row whose name cell is %j', (name) => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[
				['', ''],
				[name, '3']
			],
			{ kind: 'names', studentId: 'student-2' },
			0
		);

		expect(result).toMatchObject({ changed: false, studentsAdded: 0, rowsDropped: 1 });
		expect(document.students).toHaveLength(2);
		expect(document.marks).toEqual({});
	});

	it('clips columns past the last entry and says how many', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[['Lovelace, Ada', '3', '2', '1', '0']],
			{ kind: 'names', studentId: 'student-1' },
			0
		);

		expect(result.columnsClipped).toBe(2);
		expect(document.marks).toEqual({ 'student-1': { 'entry-1': 3, 'entry-2': 2 } });
	});

	it('refuses each value that is not a whole number, keeping the rest', () => {
		const document = pasteSheet({ marks: { 'student-1': { 'entry-1': 1 } } });

		const result = applyPaste(
			document,
			[
				['2.5', '3'],
				['two', '']
			],
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' },
			0
		);

		expect(result.refused).toEqual([
			{ row: 1, column: 1, value: '2.5' },
			{ row: 2, column: 1, value: 'two' }
		]);
		expect(document.marks).toEqual({ 'student-1': { 'entry-1': 1, 'entry-2': 3 } });
	});

	it('counts the marks a paste put above their entry’s available marks', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[['5', '4']],
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' },
			0
		);

		expect(result.overMax).toBe(1);
		// Kept as pasted, never clamped to the entry's four.
		expect(document.marks['student-1']).toEqual({ 'entry-1': 5, 'entry-2': 4 });
	});

	it('pastes against the tier’s own entries, never the other tier’s', () => {
		const document = tieredSheet();

		const result = applyPaste(
			document,
			[['3', '2']],
			{ kind: 'marks', studentId: 'student-1', entryId: 'h1' },
			0
		);

		expect(result).toMatchObject({ marksStored: 2, columnsClipped: 0 });
		expect(document.marks['student-1']).toEqual({ h1: 3, h2: 2 });
	});

	it('lines rows up with that tier’s students, skipping the other tier’s', () => {
		const document = tieredSheet({
			students: [
				student('student-1', 'Ada', 'Lovelace', false, 0),
				student('foundation-student', 'Flo', 'Foundation', false, 1),
				student('student-2', 'Grace', 'Hopper', false, 0)
			]
		});

		applyPaste(
			document,
			[
				['3', '2'],
				['1', '4']
			],
			{ kind: 'marks', studentId: 'student-1', entryId: 'h1' },
			0
		);

		expect(document.marks).toEqual({
			'student-1': { h1: 3, h2: 2 },
			'student-2': { h1: 1, h2: 4 }
		});
	});

	it('does nothing when the assessment has no such tier', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[['Lovelace, Ada', '3']],
			{ kind: 'names', studentId: null },
			1
		);

		expect(result).toEqual(emptyPasteResult());
		expect(document.students).toHaveLength(2);
		expect(document.marks).toEqual({});
	});

	it('gives a student added on a tier that tier', () => {
		const document = tieredSheet({ students: [] });

		const result = applyPaste(
			document,
			[
				['Lovelace, Ada', '3'],
				['Hopper, Grace', '4']
			],
			{ kind: 'names', studentId: null },
			1
		);

		expect(result.studentsAdded).toBe(2);
		expect(document.students.map(({ tier: sits }) => sits)).toEqual([1, 1]);
		expect(Object.values(document.marks).map((byEntry) => byEntry['f1'])).toEqual([3, 4]);
	});
});

describe('describing a paste', () => {
	it('says nothing was pasted when nothing was', () => {
		expect(describePaste(emptyPasteResult())).toEqual({
			summary: 'Nothing was pasted.',
			losses: []
		});
	});

	it('gives the headline in one sentence', () => {
		const result = { ...emptyPasteResult(), marksStored: 1, studentsAdded: 2 };

		expect(describePaste(result).summary).toBe('Pasted 1 mark, added 2 students.');
	});
});
