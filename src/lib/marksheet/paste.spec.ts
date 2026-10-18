import { describe, expect, it } from 'vitest';
import type { MarksheetDocument } from './document.js';
import { confirmed, entry, student } from './fixtures.spec-helpers.js';
import { applyPaste, describePaste, emptyPasteResult } from './paste.js';

/** A marksheet with two entries and two students: a paste has room to miss both. */
function pasteSheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return confirmed({
		breakdown: {
			entries: [entry('entry-1', '1a', '1'), entry('entry-2', '1b', '1')],
			warnings: []
		},
		students: [student('student-1', 'Ada', 'Lovelace'), student('student-2', 'Grace', 'Hopper')],
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
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' }
		);

		expect(result).toMatchObject({ changed: true, marksStored: 3, marksCleared: 0 });
		expect(document.marks).toEqual({
			'student-1': { 'entry-1': 2, 'entry-2': 3 },
			'student-2': { 'entry-2': 1 }
		});
	});

	it('clears a mark when the pasted cell is empty', () => {
		const document = pasteSheet({ marks: { 'student-1': { 'entry-1': 2 } } });

		const result = applyPaste(document, [['', '3']], {
			kind: 'marks',
			studentId: 'student-1',
			entryId: 'entry-1'
		});

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
			{ kind: 'names', studentId: 'student-1' }
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

	it('turns pasted rows past the class into students, mapping their names', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[
				['Lovelace, Ada', '3', '2'],
				['Hopper, Grace', '4', '1'],
				['Cher', '0', '0'],
				['Alan Turing', '1', '2']
			],
			{ kind: 'names', studentId: 'student-1' }
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
		expect(document.marks).toMatchObject({
			'student-1': { 'entry-1': 3, 'entry-2': 2 },
			'student-2': { 'entry-1': 4, 'entry-2': 1 }
		});
	});

	it('ignores a pasted row with no name to make a student from', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[
				['', ''],
				['', '3']
			],
			{ kind: 'names', studentId: 'student-2' }
		);

		expect(result).toMatchObject({ changed: false, studentsAdded: 0, rowsDropped: 1 });
		expect(document.students).toHaveLength(2);
	});

	it('does not make a student out of a name cell holding only punctuation', () => {
		const document = pasteSheet();

		const result = applyPaste(
			document,
			[
				['', ''],
				[',', '3']
			],
			{ kind: 'names', studentId: 'student-2' }
		);

		expect(result).toMatchObject({ changed: false, studentsAdded: 0, rowsDropped: 1 });
		expect(document.students).toHaveLength(2);
		expect(document.marks).toEqual({});
	});

	it('clips columns past the last entry and says how many', () => {
		const document = pasteSheet();

		const result = applyPaste(document, [['Lovelace, Ada', '3', '2', '1', '0']], {
			kind: 'names',
			studentId: 'student-1'
		});

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
			{ kind: 'marks', studentId: 'student-1', entryId: 'entry-1' }
		);

		expect(result.refused).toEqual([
			{ row: 1, column: 1, value: '2.5' },
			{ row: 2, column: 1, value: 'two' }
		]);
		expect(document.marks).toEqual({ 'student-1': { 'entry-1': 1, 'entry-2': 3 } });
	});

	it('counts the marks a paste put above their entry’s available marks', () => {
		const document = pasteSheet();

		const result = applyPaste(document, [['5', '4']], {
			kind: 'marks',
			studentId: 'student-1',
			entryId: 'entry-1'
		});

		expect(result.overMax).toBe(1);
		// Kept as pasted, never clamped to the entry's four.
		expect(document.marks['student-1']).toEqual({ 'entry-1': 5, 'entry-2': 4 });
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
