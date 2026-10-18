import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA_VERSION } from './document.js';
import type { MarksheetDocument } from './document.js';
import { backupReminder, backupTakenAt, readBackup } from './backup.js';

const NOW = new Date(2026, 0, 15, 10, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

/** A backup taken `days` ago, to the second, so the window's edge is testable. */
function taken(days: number, seconds = 0): string {
	return new Date(NOW.getTime() - days * DAY_MS - seconds * 1000).toISOString();
}

function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
		breakdownConfirmedAt: NOW.toISOString(),
		lastExportedAt: null,
		paper: {
			label: '10X Ph1',
			className: '10C1',
			sourceFilenames: ['10X Ph1.pdf'],
			parsedAt: NOW.toISOString()
		},
		breakdown: {
			entries: [
				{
					id: 'entry-1',
					label: '2bii',
					questionNumber: '2',
					marks: 4,
					summary: 'Explain the process shown',
					specPoint: '3.2.1.4',
					commandWord: 'Explain',
					ao: 'AO1',
					original: null
				}
			],
			warnings: []
		},
		students: [
			{ id: 'student-1', firstName: 'Ada', surname: 'Lovelace', absent: false },
			{ id: 'student-2', firstName: 'Grace', surname: 'Hopper', absent: false }
		],
		marks: { 'student-1': { 'entry-1': 3 } },
		...overrides
	};
}

describe('backupTakenAt', () => {
	it('reads the moment the document records, or nothing when it holds none', () => {
		expect(backupTakenAt(marksheet())).toBeNull();
		expect(backupTakenAt(marksheet({ lastExportedAt: taken(3) }))?.toISOString()).toBe(taken(3));
	});

	it('treats a moment it cannot read as no backup at all', () => {
		expect(backupTakenAt(marksheet({ lastExportedAt: 'not a date' }))).toBeNull();
	});
});

describe('backupReminder', () => {
	it('says nothing while there is no marksheet to lose', () => {
		expect(backupReminder(null, NOW)).toBeNull();
	});

	it('asks for a first backup once marks are entered', () => {
		expect(backupReminder(marksheet(), NOW)).toEqual({ kind: 'never' });
	});

	it('says nothing about a document with no marks and no backup', () => {
		expect(backupReminder(marksheet({ marks: {} }), NOW)).toBeNull();
	});

	it('says nothing while the last backup is inside the eviction window', () => {
		expect(backupReminder(marksheet({ lastExportedAt: taken(6) }), NOW)).toBeNull();
		// Exactly the window is not yet past it: the rule is "more than 7 days old".
		expect(backupReminder(marksheet({ lastExportedAt: taken(7) }), NOW)).toBeNull();
		expect(backupReminder(marksheet({ lastExportedAt: taken(7, 1) }), NOW)).toEqual({
			kind: 'stale',
			days: 7
		});
	});

	it('names how old a backup past the window is', () => {
		expect(backupReminder(marksheet({ lastExportedAt: taken(30) }), NOW)).toEqual({
			kind: 'stale',
			days: 30
		});
	});

	it('asks for a first backup when the moment it records cannot be read', () => {
		expect(backupReminder(marksheet({ lastExportedAt: 'not a date' }), NOW)).toEqual({
			kind: 'never'
		});
	});
});

describe('readBackup', () => {
	it('reads what the restore confirm names: paper, class, students, marks and age', () => {
		const document = marksheet({ lastExportedAt: taken(3) });

		expect(readBackup(JSON.stringify(document))).toEqual({
			paperLabel: '10X Ph1',
			className: '10C1',
			students: 2,
			marks: 1,
			takenAt: new Date(taken(3))
		});
	});

	it('reads a document with nothing in it yet', () => {
		const document = marksheet({
			paper: { ...marksheet().paper, label: null, className: null },
			students: [],
			marks: {}
		});

		expect(readBackup(JSON.stringify(document))).toEqual({
			paperLabel: null,
			className: null,
			students: 0,
			marks: 0,
			takenAt: null
		});
	});

	it('rejects anything that is not one of our documents', () => {
		expect(readBackup('not json at all')).toBeNull();
		expect(readBackup('{"schemaVersion":99}')).toBeNull();
		// A document of ours with a field of the wrong type is not one either.
		expect(readBackup(JSON.stringify({ ...marksheet(), students: 'nobody' }))).toBeNull();
	});
});
