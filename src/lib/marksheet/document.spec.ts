import { describe, expect, it } from 'vitest';
import {
	dropUnreachableMarks,
	entryValuesOf,
	parseStoredDocument,
	type EntryValues,
	type MarksheetDocument
} from './document.js';
import { entry, parsed, student } from './fixtures.spec-helpers.js';

/** A document as storage hands it back: serialised, then read. */
function read(document: MarksheetDocument): MarksheetDocument {
	const result = parseStoredDocument(JSON.stringify(document));
	if (!result) throw new Error('not a document');
	return result;
}

const ORIGIN: EntryValues = entryValuesOf(entry('entry-1', '2bii', '2'));

describe('reading a stored document', () => {
	it('reads the parse’s own values back with an entry that records them', () => {
		const document = parsed({
			breakdown: { entries: [entry('e', '2b', '2', { original: ORIGIN })], warnings: [] }
		});

		expect(read(document).breakdown.entries[0].original).toEqual(ORIGIN);
	});

	it('reads an entry that records no parse values as added by the teacher', () => {
		const document = parsed({
			breakdown: { entries: [entry('e', '', '', { original: null })], warnings: [] }
		});

		expect(read(document).breakdown.entries[0].original).toBeNull();
	});

	it('reads a document written before entries recorded the parse’s values', () => {
		// #35 wrote entries with no recorded values: they are read as the parse's.
		const written = JSON.parse(JSON.stringify(parsed()));
		delete written.breakdown.entries[0].original;

		const document = parseStoredDocument(JSON.stringify(written));

		expect(document).not.toBeNull();
		expect(document?.breakdown.entries[0].label).toBe('2bii');
		expect(document?.breakdown.entries[0].original).toEqual(ORIGIN);
	});

	it('treats an entry reciting nonsense as its parse values as unreadable', () => {
		const raw = JSON.stringify(parsed()).replace(
			'"original":{"label":"2bii"',
			'"original":{"label":7'
		);

		expect(parseStoredDocument(raw)).toBeNull();
	});
});

describe('dropping unreachable marks', () => {
	it('silently drops marks whose student or entry no longer exists', () => {
		const document = parsed({
			students: [student('student-1', 'Ada', 'Lovelace')],
			marks: {
				'student-1': { 'entry-1': 3, 'entry-gone': 2 },
				'student-gone': { 'entry-1': 1 }
			}
		});

		expect(dropUnreachableMarks(read(document)).marks).toEqual({
			'student-1': { 'entry-1': 3 }
		});
	});
});
